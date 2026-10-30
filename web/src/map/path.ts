import type { MapData, NodeKind } from '../api/types'
import { useApp } from '../state/app'
import { LINK_META } from './model'

/**
 * The request path to a node: how a visitor gets to it, and where it goes from there. Built from the map:
 * the shortest way from an entry along the direction of the links (a domain first — visitors come by
 * name — else the internet), stepping into a machine to reach what runs inside it; then forward along
 * the requests the node makes itself (an API, a database, a queue).
 */
export type Step = { nodeId: string; linkId?: string } // linkId: the link that leads to this step
export type RequestPath = { target: string; steps: Step[]; nodes: Set<string>; links: Set<string> }

export const MaxForward = 6

// One answer per map and target: every card asks.
let cache: { map: MapData; target: string; path: RequestPath } | null = null

export function pathOf(map: MapData, target: string): RequestPath {
  if (cache && cache.map === map && cache.target === target) return cache.path
  // Where a request can go next: along a link's direction, or into a machine.
  const next = new Map<string, Step[]>()
  const add = (x: string, s: Step) => next.set(x, [...(next.get(x) ?? []), s])
  for (const l of map.links) {
    if (!l.planned && LINK_META[l.kind].dep !== 'none') add(l.fromId, { nodeId: l.toId, linkId: l.id })
  }
  for (const n of map.nodes) if (n.parentId) add(n.parentId, { nodeId: n.id })

  const from = (kinds: NodeKind[]): Step[] | null => {
    const starts = map.nodes.filter((n) => kinds.includes(n.kind)).map((n) => n.id)
    if (starts.includes(target)) return [{ nodeId: target }]
    const prev = new Map<string, Step & { from: string }>()
    const seen = new Set(starts)
    const queue = [...starts]
    while (queue.length) {
      const x = queue.shift()!
      for (const s of next.get(x) ?? []) {
        if (seen.has(s.nodeId)) continue
        seen.add(s.nodeId)
        prev.set(s.nodeId, { ...s, from: x })
        if (s.nodeId === target) {
          const out: Step[] = []
          for (let at = target; prev.has(at); at = prev.get(at)!.from) out.unshift({ nodeId: at, linkId: prev.get(at)!.linkId })
          out.unshift({ nodeId: prev.get(out[0]!.nodeId)!.from })
          return out
        }
        queue.push(s.nodeId)
      }
    }
    return null
  }
  const steps = from(['domain']) ?? from(['internet']) ?? [{ nodeId: target }]

  // Forward along the requests the target makes (and those make), first branch each time.
  const onPath = new Set(steps.map((s) => s.nodeId))
  let at = target
  for (let i = 0; i < MaxForward; i++) {
    const l = map.links.find((x) => !x.planned && x.fromId === at && LINK_META[x.kind].dep === 'calls' && !onPath.has(x.toId))
    if (!l) break
    steps.push({ nodeId: l.toId, linkId: l.id })
    onPath.add(l.toId)
    at = l.toId
  }

  const path = { target, steps, nodes: onPath, links: new Set(steps.map((s) => s.linkId).filter((x): x is string => !!x)) }
  cache = { map, target, path }
  return path
}

export function useRequestPath(): RequestPath | null {
  const map = useApp((st) => st.map)
  const target = useApp((st) => st.path)
  return target ? pathOf(map, target) : null
}
