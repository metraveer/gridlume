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
  source: '' | 'docker' // docker: a container an agent reported
  extKey?: string // e.g. "docker:app/api"; matches the live container
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

/** How the agent was installed; see docs/decisions.md, "Режимы прав агента". */
export const AGENT_MODES = ['user', 'readonly', 'root'] as const
export type AgentMode = (typeof AGENT_MODES)[number]

export type Snapshot = {
  at: number // unix ms
  cpu: number // percent
  cores: number // physical
  threads: number // logical processors
  load1: number
  memTotal: number // bytes
  memUsed: number
  swapTotal: number
  swapUsed: number
  uptime: number // seconds
  disks: { mount: string; fs: string; total: number; used: number }[] | null
  net: { name: string; rx: number; tx: number }[] | null // bytes per second
  temps: { name: string; c: number }[] | null
  docker?: { containers: Container[] }
  dockerError?: 'no_access' | 'unavailable'
}

export type Container = {
  id: string
  name: string
  image: string
  state: 'running' | 'exited' | 'restarting' | 'paused' | 'created' | 'dead' | 'removing'
  status: string // as `docker ps` says it
  health?: 'healthy' | 'unhealthy' | 'starting'
  project?: string
  service?: string
  cpu: number
  memUsed: number
  memLimit: number
  restarts: number
  ports?: { private: number; public?: number; proto: string; ip?: string }[]
  networks?: string[]
}

/** A link the core guessed from Docker; the user accepts or dismisses it. */
export type Suggestion = { id: string; fromId: string; toId: string; kind: LinkKind; reason: 'compose_depends' | 'env_ref'; detail: string }

export type Agent = {
  id: string
  nodeId: string
  hostname: string
  os: string
  kernel: string
  arch: string
  version: string
  mode: AgentMode
  lastSeen: number // unix seconds, 0 = never
  online: boolean
}

/** One message of /api/events. */
export type LiveEvent = { nodeId: string; agent?: Agent; snapshot?: Snapshot; removed?: boolean; mapChanged?: boolean }

export type MetricRange = '1h' | '24h' | '14d'
export type MetricPoint = { t: number; avg: number; max: number }
