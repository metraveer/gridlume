import type { IconName } from '../design'
import type { Link, LinkKind, MapData, MapNode, NodeKind } from '../api/types'

/** How each kind of node looks and behaves. */
export const NODE_META: Record<NodeKind, { icon: IconName; small?: boolean; canContain?: boolean }> = {
  internet: { icon: 'globe' },
  router: { icon: 'router' },
  server: { icon: 'server', canContain: true },
  vm: { icon: 'server', canContain: true },
  vps: { icon: 'cloud', canContain: true },
  container: { icon: 'box', small: true },
  service: { icon: 'app', small: true },
  database: { icon: 'db', small: true },
  domain: { icon: 'domain' },
  vpn: { icon: 'vpn' },
  storage: { icon: 'db', canContain: true },
  smarthome: { icon: 'home', canContain: true },
  camera: { icon: 'camera' },
  ups: { icon: 'battery' },
  device: { icon: 'box' },
}

/**
 * How each kind of link is drawn and what it means for dependencies.
 * calls: "from" uses "to" (from depends on to) — the arrow points at the one being used.
 * feeds: "from" feeds "to" (internet → router → machine, UPS → device): to depends on from.
 */
// traffic: a network link, so the counters of a network interface tell how much goes over it.
export const LINK_META: Record<LinkKind, { arrow?: boolean; dep: 'calls' | 'feeds' | 'none'; traffic?: boolean }> = {
  uplink: { dep: 'feeds', traffic: true },
  lan: { dep: 'feeds', traffic: true },
  wifi: { dep: 'feeds', traffic: true },
  vpn: { dep: 'none', traffic: true },
  power: { dep: 'feeds' },
  runs: { arrow: true, dep: 'calls' },
  depends: { arrow: true, dep: 'calls' },
  http: { arrow: true, dep: 'calls' },
  db: { arrow: true, dep: 'calls' },
  queue: { arrow: true, dep: 'calls' },
  ws: { arrow: true, dep: 'calls' },
  dns: { arrow: true, dep: 'calls' },
}

/** The level being shown: null is the whole infrastructure, otherwise the id of an opened machine. */
export type Level = string | null

export function canContain(n: MapNode) {
  return !!NODE_META[n.kind].canContain && n.parentId === null
}

/** Nodes shown on a level, and outside nodes linked to it (shown dashed, as "portals"). */
export function levelContent(map: MapData, level: Level) {
  const own = map.nodes.filter((n) => n.parentId === level)
  const ownIds = new Set(own.map((n) => n.id))
  const portals = new Set<string>()
  const links: Link[] = []
  for (const l of map.links) {
    const a = ownIds.has(l.fromId)
    const b = ownIds.has(l.toId)
    if (a && b) links.push(l)
    else if (level !== null && (a || b)) {
      // Inside a machine, show what it talks to outside as dashed portal nodes.
      portals.add(a ? l.toId : l.fromId)
      links.push(l)
    }
  }
  const portalNodes = map.nodes.filter((n) => portals.has(n.id))
  return { own, portals: portalNodes, links }
}

/** needs[x] = the nodes x cannot work without (one step). */
export function dependencyGraph(map: MapData) {
  const needs = new Map<string, Set<string>>()
  const add = (x: string, y: string) => {
    if (!needs.has(x)) needs.set(x, new Set())
    needs.get(x)!.add(y)
  }
  for (const l of map.links) {
    if (l.planned) continue
    const dep = LINK_META[l.kind].dep
    if (dep === 'calls') add(l.fromId, l.toId)
    else if (dep === 'feeds') add(l.toId, l.fromId)
  }
  for (const n of map.nodes) if (n.parentId) add(n.id, n.parentId)
  return needs
}

function walk(start: string, next: (x: string) => Iterable<string>) {
  const seen = new Set<string>([start])
  const order: string[] = []
  const queue = [start]
  while (queue.length) {
    const x = queue.shift()!
    for (const y of next(x)) {
      if (seen.has(y)) continue
      seen.add(y)
      order.push(y)
      queue.push(y)
    }
  }
  return order
}

/** Everything that stops working if `id` stops. */
export function dependents(map: MapData, id: string) {
  const needs = dependencyGraph(map)
  const users = new Map<string, string[]>()
  for (const [x, ys] of needs) for (const y of ys) users.set(y, [...(users.get(y) ?? []), x])
  return walk(id, (x) => users.get(x) ?? [])
}

/** The whole chain `id` cannot work without. */
export function requirements(map: MapData, id: string) {
  const needs = dependencyGraph(map)
  return walk(id, (x) => needs.get(x) ?? [])
}
