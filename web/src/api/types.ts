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
  iface?: string // network interface whose counters are the live traffic; '' = the default route
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
  // Bytes per second; default: carries the default route; speed: Mbit/s the cards agreed on.
  net: { name: string; rx: number; tx: number; default?: boolean; speed?: number }[] | null
  // Pings of the far ends of network links over the last minute (id = the link's); rtt in ms, loss in %.
  probes?: { id: string; host: string; sent: number; rtt: number; loss: number; error?: 'resolve' | 'no_icmp' }[]
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
  // Known only while connected:
  build?: number // release run number; 0 = a local build
  canUpdate?: boolean // its root updater is installed, so the core can update it
  lastUpdate?: AgentUpdate
}

/** How the agent's last update went, as its updater recorded it. */
export type AgentUpdate = { state: 'done' | 'up_to_date' | 'failed' | 'rolled_back'; from: string; to?: string; message?: string; at: number }

/** One message of /api/events. */
export type LiveEvent = { nodeId: string; agent?: Agent; snapshot?: Snapshot; removed?: boolean; mapChanged?: boolean; problems?: boolean; changes?: boolean }

export type Channel = 'stable' | 'edge'

export type Release = { version: string; channel: Channel; build: number; commit: string; date: string; url: string }

/** What the core last learned about one channel. problem: none (nothing published), limit, signature, network, other. */
export type ChannelInfo = { latest: Release | null; problem?: 'none' | 'limit' | 'signature' | 'network' | 'other'; error?: string; newer: boolean }

/** GET /api/system: this installation's version and updates. */
export type SystemInfo = {
  version: string
  build: number
  commit: string
  built: Channel | '' // the channel this binary came from; '' for a development build
  channel: Channel // the chosen one
  auto: boolean
  canUpdate: boolean // installed by install-core.sh: the update service exists
  coreNode: string // node of the machine the core runs on, '' if unknown
  agentAuto: boolean // agents get a newer build as soon as they connect
  agents?: { version: string; build: number } // the agent build this core hands out
  channels?: Partial<Record<Channel, ChannelInfo>>
  latest: Release | null // of the chosen channel
  newer: boolean
  ahead?: boolean // running something newer than the chosen channel has
  checkedAt?: string
  checkError: string
  pending: boolean // an update was requested and has not started yet
  pendingStuck?: boolean // ...for longer than the update service should take to pick it up
  last?: {
    state: 'running' | 'done' | 'rolled_back' | 'failed' | 'installed' | 'interrupted'
    from: string
    to: string
    message?: string
    at: string
    step?: 'download' | 'backup' | 'restart'
    // While downloading: file part of parts, bytes so far of total (-1 = unknown), bytes per second.
    progress?: { file: string; part: number; parts: number; done: number; total: number; speed: number }
  }
}

/** Where problems are sent (GET /api/notify). The bot token is never sent back. */
export type NotifyRules = { warn: boolean; resolved: boolean; quiet: boolean; quietFrom: string; quietTo: string; lang: 'ru' | 'en' }
export type NotifyState = {
  telegram: { connected: boolean; bot?: string; chatName?: string; waiting: boolean; lastSent?: number; lastError?: string }
  rules: NotifyRules
}

/** Watch (GET /api/watch): agents that watch the core, and the duty core both ways. code: only right after it is made. */
export type WatchState = {
  agents: { agents: string[]; after: number }
  duty: {
    paired: boolean
    dutyName: string
    dutySeen: number // unix seconds, 0 = never
    watching?: { url: string; name: string; ok: boolean; fails: number; lastOk?: number; error?: string; at?: number }
  }
  code?: string
}

/** The core's own check of a node without an agent (GET /api/checks): ping, TCP or HTTP. */
export type CheckResult = {
  nodeId: string
  kind: 'ping' | 'tcp' | 'http'
  target: string
  ok: boolean
  fails: number // failed in a row (tcp, http)
  rtt: number // ms
  loss?: number // ping: % lost in the last minute
  sent?: number // ping: pings in that minute
  status?: number
  certUntil?: number // unix seconds
  error?: string
  at: number // unix ms; 0 = not checked yet
}

/** Something that changed on a machine (GET /api/changes): a new image, a restart, a reboot... */
export type Change = {
  id: string
  at: number // unix ms
  nodeId: string
  machineId: string
  kind: string // image_changed, container_restarted, machine_rebooted, ... (texts: chg.<kind>)
  params: Record<string, string | number>
  count: number // repeats folded in
}

/** GET /api/history: problems open at some point in a period, and the changes made in it. */
export type HistoryData = { from: number; to: number; problems: Problem[]; changes: Change[] }

/** Something wrong the core noticed (GET /api/problems). Times are unix milliseconds. */
export type Problem = {
  id: string
  key: string
  kind:
    | 'agent_offline' | 'container_down' | 'container_restarting' | 'container_unhealthy' | 'disk_full' | 'mem_high' | 'temp_high'
    | 'link_loss' | 'link_down' | 'node_loss' | 'node_unreachable' | 'port_down' | 'site_down' | 'cert_expiring'
    | 'core_down' | 'duty_silent'
  severity: 'warn' | 'crit'
  nodeId?: string
  linkId?: string
  params: Record<string, string | number>
  merged?: string[] // kinds of other signals with the same cause, folded in
  changes?: Change[] // what changed just before it began: possibly related
  since: number
  ended?: number
}

export type MetricRange = '1h' | '24h' | '14d'
export type MetricPoint = { t: number; avg: number; max: number }
