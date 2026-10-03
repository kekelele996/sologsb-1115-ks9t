import type { Specimen } from '@/types'
import {
  allocateAccessionNo,
  isDuplicateAccessionNo,
  isValidAccessionNo,
  parseAccessionNo
} from '@/utils/codec'

/** 交接单原始一行（已按空白/逗号/制表符切成列） */
export interface HandoverLine {
  /** 行号（从 1 开始，忽略空行后的实际行号，便于退回时定位） */
  lineNo: number
  /** 现场编号 */
  fieldNo: string
  /** 馆藏号；留空表示请馆方自动分配 */
  accessionNo: string
  /** 该行是否带了馆藏号列（单列也算有现场号） */
  raw: string
}

/** 交接成功行 */
export interface HandoverMatched {
  lineNo: number
  specimenId: string
  fieldNo: string
  accessionNo: string
  /** true=本次新配对；false=此前已配对，本次幂等跳过，不重复配号 */
  alreadyPaired: boolean
  /** true=本次馆藏号为自动分配 */
  allocated: boolean
}

/** 交接退回行：只退回这一条，说明原因 */
export interface HandoverRejected {
  lineNo: number
  fieldNo: string
  accessionNo: string
  reason: string
  raw: string
}

export interface HandoverResult {
  matched: HandoverMatched[]
  rejected: HandoverRejected[]
  /** 需要落库的标本（仅本次新配对的行） */
  updates: Specimen[]
}

/**
 * 解析交接单文本。
 * 每行一列（现场编号，馆号自动分配）或两列（现场编号 + 馆藏号），
 * 列分隔支持空白 / 逗号 / 制表符；空白行忽略；超过两列视为写错退回。
 */
export function parseHandoverSheet(text: string): { lines: HandoverLine[]; malformed: HandoverRejected[] } {
  const lines: HandoverLine[] = []
  const malformed: HandoverRejected[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const lineNo = index + 1
    const trimmed = raw.trim()
    if (!trimmed) return
    const cols = trimmed.split(/[,\t]|\s{2,}|\s+/).filter((part) => part !== '')
    if (cols.length === 1) {
      lines.push({ lineNo, fieldNo: cols[0], accessionNo: '', raw })
    } else if (cols.length === 2) {
      lines.push({ lineNo, fieldNo: cols[0], accessionNo: cols[1], raw })
    } else {
      malformed.push({
        lineNo,
        fieldNo: cols[0] ?? '',
        accessionNo: cols.slice(1).join(' '),
        reason: `一行只能是「现场编号」或「现场编号 馆藏号」，本行有 ${cols.length} 列`,
        raw
      })
    }
  })
  return { lines, malformed }
}

/** 现场编号是否落在某标本的当前号或历史旧号上 */
export function specimenMatchesFieldNo(specimen: Specimen, team: string, fieldNo: string): boolean {
  if (specimen.team.trim() !== team.trim()) return false
  const target = fieldNo.trim()
  return (
    specimen.fieldNo.trim() === target ||
    specimen.fieldNoHistory.some((change) => change.to.trim() === target || change.from.trim() === target)
  )
}

interface WorkingRow extends HandoverLine {
  specimens: Specimen[]
}

/**
 * 交接配对（纯函数，不写库）：
 * - 按「队名 + 现场编号」找标本，历史旧号也算命中（队里改过号也对得上）；
 * - 已配对标本：馆号一致则幂等跳过；馆号不一致则退回本行，已配馆藏号不动；
 * - 新配对：手写馆号校验格式与占用（含本单已出现的号），留空则按前缀+年份自动分配；
 * - 任何一行失败只退回这一行，其他成功行照常配对。
 *
 * @param autoPrefix 自动分配馆藏号的前缀
 * @param autoYear   自动分配馆藏号的年份
 */
export function pairHandover(
  team: string,
  lines: HandoverLine[],
  specimens: Specimen[],
  autoPrefix: string,
  autoYear: number | string
): HandoverResult {
  const matched: HandoverMatched[] = []
  const rejected: HandoverRejected[] = []
  const updates: Specimen[] = []

  if (!team.trim()) {
    rejected.push(...lines.map((line) => ({ ...emptyReject(line), reason: '交接单缺少队名，无法按队名配对' })))
    return { matched, rejected, updates }
  }

  const occupied = new Map<string, string>()
  specimens.forEach((specimen) => {
    if (specimen.accessionNo) occupied.set(specimen.accessionNo.trim().toUpperCase(), specimen.id)
  })
  const usedThisSheet: string[] = []

  const working: WorkingRow[] = []
  for (const line of lines) {
    if (!line.fieldNo.trim()) {
      rejected.push({ ...emptyReject(line), reason: '现场编号为空' })
      continue
    }
    const targets = specimens.filter((specimen) => specimenMatchesFieldNo(specimen, team, line.fieldNo.trim()))
    working.push({ ...line, specimens: targets })
  }

  for (const row of working) {
    if (row.specimens.length === 0) {
      rejected.push({
        ...emptyReject(row),
        reason: `队名「${team.trim()}」下找不到现场编号「${row.fieldNo.trim()}」（含已改名的旧号），可能号写错或队名不对`
      })
      continue
    }
    if (row.specimens.length > 1) {
      rejected.push({
        ...emptyReject(row),
        reason: `队名「${team.trim()}」+ 现场编号「${row.fieldNo.trim()}」匹配到 ${row.specimens.length} 份标本，请先在队里消重`
      })
      continue
    }

    const specimen = row.specimens[0]

    // 已配对：馆藏号不因现场侧改号或重送而变化
    if (specimen.accessionNo) {
      if (row.accessionNo.trim() && row.accessionNo.trim().toUpperCase() !== specimen.accessionNo.trim().toUpperCase()) {
        rejected.push({
          ...emptyReject(row),
          reason: `该标本已持有馆藏号 ${specimen.accessionNo}，与单上填写的 ${row.accessionNo.trim()} 不一致；已配馆藏号不能改，如确需变更请走馆藏变更流程`
        })
        continue
      }
      matched.push({
        lineNo: row.lineNo,
        specimenId: specimen.id,
        fieldNo: specimen.fieldNo,
        accessionNo: specimen.accessionNo,
        alreadyPaired: true,
        allocated: false
      })
      continue
    }

    let accessionNo: string
    if (row.accessionNo.trim()) {
      accessionNo = row.accessionNo.trim()
      if (!isValidAccessionNo(accessionNo)) {
        rejected.push({
          ...emptyReject(row),
          reason: `馆藏号「${accessionNo}」格式不对，应为「前缀-四位年份-流水号」（如 GB-2026-0007）`
        })
        continue
      }
      if (isDuplicateAccessionNo(accessionNo, usedThisSheet)) {
        rejected.push({ ...emptyReject(row), reason: `馆藏号 ${accessionNo} 在本交接单里重复出现` })
        continue
      }
      const holderId = occupied.get(accessionNo.toUpperCase())
      if (holderId && holderId !== specimen.id) {
        rejected.push({ ...emptyReject(row), reason: `馆藏号 ${accessionNo} 已被其他标本占用` })
        continue
      }
    } else {
      const existingCodes = [...occupied.keys(), ...usedThisSheet]
      accessionNo = allocateAccessionNo(autoPrefix, autoYear, existingCodes)
    }

    usedThisSheet.push(accessionNo)
    occupied.set(accessionNo.toUpperCase(), specimen.id)
    const updated: Specimen = { ...specimen, accessionNo }
    updates.push(updated)
    matched.push({
      lineNo: row.lineNo,
      specimenId: specimen.id,
      fieldNo: specimen.fieldNo,
      accessionNo,
      alreadyPaired: false,
      allocated: row.accessionNo.trim() === ''
    })
  }

  matched.sort((a, b) => a.lineNo - b.lineNo)
  rejected.sort((a, b) => a.lineNo - b.lineNo)
  return { matched, rejected, updates }
}

/** 预检：返回每一行将如何处理（成功/退回 + 预览馆号），不落库 */
export function previewHandover(
  team: string,
  text: string,
  specimens: Specimen[],
  autoPrefix: string,
  autoYear: number | string
): { result: HandoverResult; malformed: HandoverRejected[] } {
  const { lines, malformed } = parseHandoverSheet(text)
  const result = pairHandover(team, lines, specimens, autoPrefix, autoYear)
  result.rejected.push(...malformed)
  result.rejected.sort((a, b) => a.lineNo - b.lineNo)
  return { result, malformed }
}

/** 从一段已占用馆藏号中推断自动分配前缀（馆号格式不合规时回退 GB） */
export function resolveAutoPrefix(preferred: string, occupiedCodes: string[]): string {
  const clean = preferred.trim()
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.toUpperCase()
  const parsed = occupiedCodes.map((code) => parseAccessionNo(code)).find((item) => item !== null)
  return parsed?.prefix ?? 'GB'
}

function emptyReject(line: HandoverLine): HandoverRejected {
  return { lineNo: line.lineNo, fieldNo: line.fieldNo, accessionNo: line.accessionNo, reason: '', raw: line.raw }
}
