import type { MapData } from '../api/types'
import { useApp } from '../state/app'
import { dependents } from './model'

/**
 * "What breaks if…" on the map: the node that stops, everything that stops with it (on every level), and
 * for each machine how many of the affected are inside it, so a level shows what happens on deeper ones.
 */
export type Impact = {
  src: string
  affected: Set<string>
  inside: Map<string, number> // machine id → affected nodes inside it
}

// One answer per map and source: every card on the screen asks, the graph is walked once.
let cache: { map: MapData; src: string; impact: Impact } | null = null

export function impactOf(map: MapData, src: string): Impact {
  if (cache && cache.map === map && cache.src === src) return cache.impact
  const affected = new Set(dependents(map, src))
  const parent = new Map(map.nodes.map((n) => [n.id, n.parentId]))
  const inside = new Map<string, number>()
  for (const id of affected) {
    const p = parent.get(id)
    if (p) inside.set(p, (inside.get(p) ?? 0) + 1)
  }
  const impact = { src, affected, inside }
  cache = { map, src, impact }
  return impact
}

export function useImpact(): Impact | null {
  const map = useApp((st) => st.map)
  const src = useApp((st) => st.impact)
  return src ? impactOf(map, src) : null
}

/** How a node looks in the impact view. */
export function impactRole(imp: Impact | null, id: string): 'src' | 'hit' | 'inside' | 'faded' | null {
  if (!imp) return null
  if (id === imp.src) return 'src'
  if (imp.affected.has(id)) return 'hit'
  if (imp.inside.has(id)) return 'inside'
  return 'faded'
}
