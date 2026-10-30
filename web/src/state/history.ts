import { create } from 'zustand'
import { api } from '../api/client'
import type { Change, Link, MapNode, NodeState, Problem } from '../api/types'

type History = {
  from: number // unix ms
  to: number
  hours: number // how far back the timeline looks
  problems: Problem[]
  changes: Change[]
  loaded: boolean
  load: () => Promise<void>
  setHours: (h: number) => void
}

/** The last hours (a day by default): problems open at some point in them and changes made in them. */
export const useHistory = create<History>((set, get) => ({
  from: 0,
  to: 0,
  hours: 24,
  problems: [],
  changes: [],
  loaded: false,
  load: async () => {
    const now = Date.now()
    const h = await api.history(now - get().hours * 3600_000, now)
    set({ ...h, loaded: true })
  },
  setHours: (hours) => {
    set({ hours })
    void get().load().catch(() => undefined)
  },
}))

/** Problems open at a moment. */
export function openAt(problems: Problem[], at: number) {
  return problems.filter((p) => p.since <= at && (!p.ended || p.ended >= at))
}

const worst = (ps: Problem[]): NodeState | null => (ps.some((p) => p.severity === 'crit') ? 'crit' : ps.length ? 'warn' : null)

/**
 * A node's state at a past moment, from the problems open then. A node inside a machine that was not
 * connected is unknown; a node something watched (an agent, a check, a container) and with no problem was
 * fine; anything else keeps the state it was drawn with.
 */
export function stateAt(node: MapNode, open: Problem[], watched: boolean): NodeState {
  const own = worst(open.filter((p) => p.nodeId === node.id))
  if (own) return own
  if (node.parentId && open.some((p) => p.kind === 'agent_offline' && p.nodeId === node.parentId)) return 'unknown'
  return watched || node.source === 'docker' ? 'ok' : node.state
}

/** A link's health at a past moment: from its own problems then. */
export function linkStateAt(link: Link, open: Problem[]): 'crit' | 'warn' | 'ok' {
  return worst(open.filter((p) => p.linkId === link.id)) === 'crit' ? 'crit' : open.some((p) => p.linkId === link.id) ? 'warn' : 'ok'
}
