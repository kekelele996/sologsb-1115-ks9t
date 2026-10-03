import { create } from 'zustand'
import type { DetStatus, Specimen } from '@/types'
import { db, deleteRow, loadAll, putRow, putRows } from '@/hooks/usePersistentStore'
import { pairHandover, parseHandoverSheet } from '@/utils/handover'
import type { HandoverMatched, HandoverRejected } from '@/utils/handover'

export interface HandoverOutcome {
  matched: HandoverMatched[]
  rejected: HandoverRejected[]
}

export interface SpecimenState {
  rows: Specimen[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (row: Specimen) => Promise<void>
  saveMany: (rows: Specimen[]) => Promise<void>
  remove: (id: string) => Promise<void>
  bulkSetStatus: (ids: string[], status: DetStatus) => Promise<void>
  accessionNos: () => string[]
  teams: () => string[]
  /** 交接：按队名+现场编号配对馆藏号；坏行只退回本行，成功行照常落库 */
  handover: (
    team: string,
    sheetText: string,
    autoPrefix: string,
    autoYear: number | string
  ) => Promise<HandoverOutcome>
  /** 队里改现场编号：已配好的馆藏号不动，旧号写入 fieldNoHistory 留痕 */
  renameFieldNo: (specimenId: string, nextFieldNo: string) => Promise<Specimen>
}

/** 行级排序：馆藏号优先（未交接排末尾），其次现场号 */
function compareSpecimen(a: Specimen, b: Specimen): number {
  const rank = (row: Specimen): string => (row.accessionNo ? `1|${row.accessionNo}` : `0|${row.team}|${row.fieldNo}`)
  return rank(a).localeCompare(rank(b), 'zh-Hans-CN')
}

export const specimenStore = create<SpecimenState>((set, get) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<Specimen>(db.specimens)
    rows.sort(compareSpecimen)
    set({ rows, loaded: true })
  },
  save: async (row) => {
    await putRow<Specimen>(db.specimens, row)
    await get().hydrate()
  },
  saveMany: async (rows) => {
    if (rows.length === 0) return
    await putRows<Specimen>(db.specimens, rows)
    await get().hydrate()
  },
  remove: async (id) => {
    await deleteRow<Specimen>(db.specimens, id)
    await get().hydrate()
  },
  bulkSetStatus: async (ids, status) => {
    const targets = get().rows.filter((row) => ids.includes(row.id))
    await putRows<Specimen>(
      db.specimens,
      targets.map((row) => ({ ...row, status }))
    )
    await get().hydrate()
  },
  accessionNos: () => get().rows.map((row) => row.accessionNo).filter(Boolean),
  teams: () => Array.from(new Set(get().rows.map((row) => row.team.trim()).filter(Boolean))).sort(),
  handover: async (team, sheetText, autoPrefix, autoYear) => {
    const { lines, malformed } = parseHandoverSheet(sheetText)
    // 在一个事务内以库内最新数据配对并写入：重试/并发重送也不会多配号
    const outcome = await db.transaction('rw', db.specimens, async () => {
      const latest = await loadAll<Specimen>(db.specimens)
      const result = pairHandover(team, lines, latest, autoPrefix, autoYear)
      if (result.updates.length > 0) {
        await putRows<Specimen>(db.specimens, result.updates)
      }
      return { matched: result.matched, rejected: [...result.rejected, ...malformed] }
    })
    await get().hydrate()
    outcome.rejected.sort((a, b) => a.lineNo - b.lineNo)
    return outcome
  },
  renameFieldNo: async (specimenId, nextFieldNo) => {
    const target = nextFieldNo.trim()
    if (!target) throw new Error('现场编号不能为空')
    const outcome = await db.transaction('rw', db.specimens, async () => {
      const latest = await loadAll<Specimen>(db.specimens)
      const specimen = latest.find((row) => row.id === specimenId)
      if (!specimen) throw new Error('标本不存在或已被删除')
      if (specimen.fieldNo.trim() === target) return specimen
      const clash = latest.find(
        (row) =>
          row.id !== specimenId &&
          row.team.trim() === specimen.team.trim() &&
          (row.fieldNo.trim() === target || row.fieldNoHistory.some((change) => change.to.trim() === target))
      )
      if (clash) {
        throw new Error(`队「${specimen.team}」里现场编号「${target}」已被另一份标本占用（${clash.accessionNo || '未交接'}）`)
      }
      const updated: Specimen = {
        ...specimen,
        fieldNo: target,
        fieldNoHistory: [
          ...specimen.fieldNoHistory,
          { from: specimen.fieldNo, to: target, changedAt: new Date().toISOString() }
        ]
      }
      await putRow<Specimen>(db.specimens, updated)
      return updated
    })
    await get().hydrate()
    // 馆藏号保持不变——accessionNo 从未参与上面的写入
    return outcome
  }
}))
