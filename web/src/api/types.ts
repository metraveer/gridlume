// Shapes returned by the core API (internal/store). Kinds are stable codes; the interface translates them.

export const NODE_KINDS = ['internet', 'router', 'server', 'vm', 'vps', 'container', 'service', 'database', 'domain', 'vpn', 'storage', 'smarthome', 'camera', 'ups', 'device'] as const
export type NodeKind = (typeof NODE_KINDS)[number]

export const LINK_KINDS = ['uplink', 'lan', 'wifi', 'vpn', 'power', 'runs', 'depends', 'http', 'db', 'queue', 'ws', 'dns'] as const
export type LinkKind = (typeof LINK_KINDS)[number]

export const PLACE_TONES = ['green', 'blue', 'violet', 'amber', 'gray'] as const
export type PlaceTone = (typeof PLACE_TONES)[number]

export type NodeState = 'ok' | 'warn' | 'crit' | 'unknown' | 'planned'

export type User = { id: string; username: string; role: 'owner' | 'admin' | 'viewer' }

export type Place = { id: string; name: string; tone: PlaceTone; x: number; y: number; w: number; h: number }

export type MapNode = {
  id: string
  parentId: string | null
  placeId: string | null
  kind: NodeKind
  name: string
  subtitle: string
  address: string
  state: NodeState
  notes: string
  x: number
  y: number
}

export type Link = {
  id: string
  fromId: string
  toId: string
  kind: LinkKind
  proto: string
  about: string
  ifBroken: string
  speedMbit: number | null
  planned: boolean
}

export type MapData = { places: Place[]; nodes: MapNode[]; links: Link[] }

export type SessionInfo = { needsSetup: boolean; user: User | null }
