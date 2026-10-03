import type { Accession, HandoverBatch, HandoverLineResult, Specimen } from '@/types'
import { db } from '@/hooks/usePersistentStore'
import {
  allocateAccessionNo,
  fieldKey,
  isDuplicateAccessionNo,
  isValidAccessionNo
} from '@/utils/codec'
import { uid } from '@/utils/id'

export interface ParsedHandoverLine {
  line: number
  raw: string
  team: string
  fieldNo: string
  requestedAccessionNo: string
}

/**
 * 解析交接单文本：
 * - 每行一条：「现场编号」或「现场编号,馆藏号」（逗号/空白分隔均可）；
 * - 空行与 # 开头的注释行跳过；
 * - 队名由整单表头统一给出（一队一单）。
 */
export function parseHandoverSheet(team: string, text: string): ParsedHandoverLine[] {
  const result: ParsedHandoverLine[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1
    const content = raw.trim()
    if (!content || content.startsWith('#')) return
    const parts = content.split(/[,，\s]+/).filter(Boolean)
    if (parts.length < 1 || parts.length > 2) {
      result.push({ line, raw: content, team, fieldNo: '', requestedAccessionNo: '' })
      return
    }
    result.push({
      line,
      raw: content,
      team: team.trim(),
      fieldNo: parts[0] ?? '',
      requestedAccessionNo: parts[1] ?? ''
    })
  })
  return result
}

/** 交接汇总 */
export interface HandoverSummary {
  paired: number
  replayed: number
  rejected: number
  results: HandoverLineResult[]
}

/**
 * 执行一次交接（一队一单）：
 *
 * 逐行独立事务——某一行写错号或配出来的馆藏号已被占用，只退回这一行并说明原因，
 * 其他配对好的行照常落库；交接失败后队里、馆里各按自己进度补齐，
 * 重送同一张单（sheetId 不变）时，已配对行走幂等重放，不会多配号。
 */
export async function processHandover(sheetId: string, team: string, text: string): Promise<HandoverSummary> {
  const parsed = parseHandoverSheet(team, text)
  const submittedAt = new Date().toISOString().slice(0, 10)
  const results: HandoverLineResult[] = []

  // 本单已自动配出的号：同单重复行 / 事务内并发占用都在这个集合里协调
  const autoAllocatedByKey = new Map<string, string>()
  const reservedThisSheet = new Set<string>()

  for (const item of parsed) {
    // 行结构本身非法（如三段内容、缺现场编号）
    if (!item.team || !item.fieldNo) {
      results.push({
        line: item.line,
        raw: item.raw,
        team: item.team,
        fieldNo: item.fieldNo,
        requestedAccessionNo: item.requestedAccessionNo,
        status: 'rejected',
        reason: '单据行格式应为「现场编号」或「现场编号,馆藏号」'
      })
      continue
    }

    let result: HandoverLineResult
    try {
      // 每行一个事务：单行失败不影响其它行已落库的配对
      result = await db.transaction('rw', db.specimens, db.accessions, db.sites, async () => {
        const key = fieldKey(item.team, item.fieldNo)
        const allSpecimens = await db.specimens.toArray()
        const allAccessions = await db.accessions.toArray()

        // 1) 按「队名 + 现场编号」找现场标本（配对快照优先，兼容队里后来改号）
        const snapshot = allAccessions.find(
          (acc) => acc.sheetId === sheetId && fieldKey(acc.team, acc.fieldNo) === key
        )
        let specimen: Specimen | undefined
        let existing: Accession | undefined
        if (snapshot) {
          specimen = allSpecimens.find((sp) => sp.id === snapshot.specimenId)
          existing = snapshot
        } else {
          specimen = allSpecimens.find((sp) => fieldKey(sp.team, sp.fieldNo) === key)
          existing = specimen ? allAccessions.find((acc) => acc.specimenId === specimen!.id) : undefined
        }

        if (!specimen) {
          return reject(item, `队名「${item.team}」+ 现场编号「${item.fieldNo}」在采集队记录中找不到`)
        }
        if (item.requestedAccessionNo) {
          // 显式馆藏号：先校验格式，再看这个号是否已被别的标本占用（自己已配此号则算回放）
          if (!isValidAccessionNo(item.requestedAccessionNo)) {
            return reject(item, `馆藏号「${item.requestedAccessionNo}」格式不对，应为「采集地代码-年份-流水号」，如 QLB-2026-0007`)
          }
          const owner = allAccessions.find(
            (acc) => acc.accessionNo.trim().toUpperCase() === item.requestedAccessionNo.trim().toUpperCase()
          )
          const reserved = reservedThisSheet.has(item.requestedAccessionNo.trim().toUpperCase())
          if ((owner && owner.specimenId !== specimen.id) || reserved) {
            return reject(
              item,
              `馆藏号 ${item.requestedAccessionNo} 已被占用` +
                (owner && owner.specimenId !== specimen.id
                  ? `（已配给 ${owner.team} 的现场编号 ${owner.fieldNo}）`
                  : '（本交接单内已使用）')
            )
          }
        }
        if (existing) {
          // 已配对：幂等重放。显式指定了与已配号不同、且未被别人占用的号，也要说明，不重配
          if (item.requestedAccessionNo && item.requestedAccessionNo !== existing.accessionNo) {
            return reject(
              item,
              `该标本此前已配馆藏号 ${existing.accessionNo}（交接单 ${existing.sheetId}），不能改配为 ${item.requestedAccessionNo}`
            )
          }
          return {
            line: item.line,
            raw: item.raw,
            team: item.team,
            fieldNo: item.fieldNo,
            requestedAccessionNo: item.requestedAccessionNo,
            status: 'replayed' as const,
            accessionNo: existing.accessionNo,
            specimenId: specimen.id
          }
        }

        // 未配对：先看本单是否已为同一标本自动配过号（同单重复行不算多配）
        const specimenKey = specimen.id
        const alreadyAuto = autoAllocatedByKey.get(specimenKey)
        if (alreadyAuto) {
          reservedThisSheet.add(alreadyAuto)
          return {
            line: item.line,
            raw: item.raw,
            team: item.team,
            fieldNo: item.fieldNo,
            requestedAccessionNo: item.requestedAccessionNo,
            status: 'replayed' as const,
            accessionNo: alreadyAuto,
            specimenId: specimen.id
          }
        }

        // 确定馆藏号：显式号已经过占用校验；否则馆方自动配号
        let accessionNo: string
        if (item.requestedAccessionNo) {
          accessionNo = item.requestedAccessionNo.trim().toUpperCase()
        } else {
          const siteCode = await siteCodeOf(specimen)
          if (!siteCode) {
            return reject(item, '该标本关联的采集地缺少代码，无法按馆方规则自动配号')
          }
          const used = allAccessions.map((acc) => acc.accessionNo)
          accessionNo = allocateAccessionNo(siteCode, specimen.collectDate.slice(0, 4), used, [
            ...reservedThisSheet
          ])
          // 事务内极端竞争兜底：配出的号恰好被占则顺延
          let guard = 0
          while (
            allAccessions.some((acc) => acc.accessionNo.toUpperCase() === accessionNo.toUpperCase()) &&
            guard < 100
          ) {
            accessionNo = allocateAccessionNo(siteCode, specimen.collectDate.slice(0, 4), [...used, accessionNo], [
              ...reservedThisSheet
            ])
            guard += 1
          }
        }

        // 5) 落配对凭证（快照队名/现场号），回填标本馆藏号
        const accession: Accession = {
          id: uid('acc'),
          specimenId: specimen.id,
          accessionNo,
          team: item.team,
          fieldNo: item.fieldNo,
          sheetId,
          pairedAt: submittedAt
        }
        await db.accessions.put(accession)
        await db.specimens.put({ ...specimen, accessionNo })
        autoAllocatedByKey.set(specimen.id, accessionNo)
        reservedThisSheet.add(accessionNo.toUpperCase())

        return {
          line: item.line,
          raw: item.raw,
          team: item.team,
          fieldNo: item.fieldNo,
          requestedAccessionNo: item.requestedAccessionNo,
          status: 'paired' as const,
          accessionNo,
          specimenId: specimen.id
        }
      })
    } catch (error) {
      // 存储层故障：仅本行未落库，其他行不受影响，可原样重送
      result = reject(item, `交接本行处理失败（${(error as Error).message}），请修正后重送，其他行不受影响`)
    }
    results.push(result)
  }

  // 交接单留档：同号 upsert，保留最后一次双方对账结果
  const existingBatch = await db.handoverBatches.where('sheetId').equals(sheetId).first()
  const batch: HandoverBatch = {
    id: existingBatch?.id ?? uid('hdb'),
    sheetId,
    team: team.trim(),
    rawText: text,
    submittedAt,
    results
  }
  await db.handoverBatches.put(batch)

  return {
    paired: results.filter((r) => r.status === 'paired').length,
    replayed: results.filter((r) => r.status === 'replayed').length,
    rejected: results.filter((r) => r.status === 'rejected').length,
    results
  }
}

function reject(item: ParsedHandoverLine, reason: string): HandoverLineResult {
  return {
    line: item.line,
    raw: item.raw,
    team: item.team,
    fieldNo: item.fieldNo,
    requestedAccessionNo: item.requestedAccessionNo,
    status: 'rejected',
    reason
  }
}

/** 取标本所属采集地代码（馆藏号前缀） */
async function siteCodeOf(specimen: Specimen): Promise<string> {
  const site = await db.sites.get(specimen.siteId)
  return site?.code ?? ''
}

/** 馆藏号占用查询（页面提示用） */
export function findAccessionOwner(accessionNo: string, accessions: Accession[]): Accession | undefined {
  return accessions.find((item) => isDuplicateAccessionNo(item.accessionNo, [accessionNo]))
}
