import { create } from 'zustand'
import type { DetStatus, Specimen } from '@/types'
import { db, deleteRow, loadAll, putRow, putRows } from '@/hooks/usePersistentStore'
import { isDuplicateFieldNo } from '@/utils/codec'

export interface RenameFieldNoError {
  ok: boolean
  message?: string
}

export interface SpecimenState {
  rows: Specimen[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (row: Specimen) => Promise<void>
  saveMany: (rows: Specimen[]) => Promise<void>
  remove: (id: string) => Promise<void>
  bulkSetStatus: (ids: string[], status: DetStatus) => Promise<void>
  /**
   * 采集队修改现场编号：
   * - 只认队内查重；已配好的馆藏号不跟着变；
   * - 旧现场编号写入 fieldNoHistory 留痕（凭证快照不受影响）。
   */
  renameFieldNo: (id: string, nextFieldNo: string) => Promise<RenameFieldNoError>
}

export const specimenStore = create<SpecimenState>((set, get) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<Specimen>(db.specimens)
    // 现场标本按「采集队 + 现场编号」排，体现两套号各归其主
    rows.sort((a, b) => {
      const team = a.team.localeCompare(b.team, 'zh-Hans-CN')
      return team !== 0 ? team : a.fieldNo.localeCompare(b.fieldNo, 'zh-Hans-CN')
    })
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
  renameFieldNo: async (id, nextFieldNo) => {
    const trimmed = nextFieldNo.trim()
    if (!trimmed) return { ok: false, message: '现场编号不能为空' }
    const target = get().rows.find((row) => row.id === id)
    if (!target) return { ok: false, message: '标本不存在' }
    if (trimmed === target.fieldNo.trim()) return { ok: false, message: '新现场编号与现号相同' }
    if (isDuplicateFieldNo(target.team, trimmed, get().rows, id)) {
      return { ok: false, message: `采集队「${target.team}」里现场编号 ${trimmed} 已被使用（不同队之间可以同号）` }
    }
    const changedAt = new Date().toISOString().slice(0, 10)
    // 防同次会话内重复留痕
    const already = target.fieldNoHistory.some((item) => item.value === target.fieldNo)
    const updated: Specimen = {
      ...target,
      fieldNo: trimmed,
      fieldNoHistory: already
        ? target.fieldNoHistory
        : [...target.fieldNoHistory, { value: target.fieldNo, changedAt }]
    }
    await putRow<Specimen>(db.specimens, updated)
    await get().hydrate()
    return { ok: true }
  }
}))
