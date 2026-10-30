import { create } from 'zustand'
import { api } from '../api/client'
import type { Problem } from '../api/types'

type Problems = {
  open: Problem[]
  ended: Problem[] // the last 24 hours
  loaded: boolean
  load: () => Promise<void>
}

/** What the core's problem engine found; refetched whenever the event stream says something changed. */
export const useProblems = create<Problems>((set) => ({
  open: [],
  ended: [],
  loaded: false,
  load: async () => {
    const r = await api.problems()
    // Worst first, then the newest.
    const order = (p: Problem) => (p.severity === 'crit' ? 0 : 1)
    const open = [...r.open].sort((a, b) => order(a) - order(b) || b.since - a.since)
    set({ open, ended: r.ended, loaded: true })
  },
}))
