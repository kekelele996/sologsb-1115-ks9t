import { create } from 'zustand'
import type { Accession } from '@/types'
import { db, loadAll, putRow } from '@/hooks/usePersistentStore'

export interface AccessionState {
  rows: Accession[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (row: Accession) => Promise<void>
}

export const accessionStore = create<AccessionState>((set, get) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<Accession>(db.accessions)
    rows.sort((a, b) => a.accessionNo.localeCompare(b.accessionNo, 'en'))
    set({ rows, loaded: true })
  },
  save: async (row) => {
    await putRow<Accession>(db.accessions, row)
    await get().hydrate()
  }
}))
