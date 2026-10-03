import { create } from 'zustand'
import type { HandoverBatch } from '@/types'
import { db, loadAll } from '@/hooks/usePersistentStore'

export interface HandoverState {
  rows: HandoverBatch[]
  loaded: boolean
  hydrate: () => Promise<void>
  /** 重新读取（交接处理在 service 内直接落库，完成后调它刷新） */
  refresh: () => Promise<void>
}

export const handoverStore = create<HandoverState>((set) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<HandoverBatch>(db.handoverBatches)
    rows.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    set({ rows, loaded: true })
  },
  refresh: async () => {
    const rows = await loadAll<HandoverBatch>(db.handoverBatches)
    rows.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    set({ rows, loaded: true })
  }
}))
