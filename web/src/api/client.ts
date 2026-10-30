import type { Agent, AgentMode, Channel, CheckResult, Link, MapData, MapNode, MetricPoint, MetricRange, NotifyRules, NotifyState, Place, Problem, SessionInfo, Snapshot, Suggestion, SystemInfo, User } from './types'

/** An error answer from the core, e.g. { error: "validation", field: "name", code: "required" }. */
export class ApiError extends Error {
  status: number
  error: string
  field?: string
  code?: string

  constructor(status: number, body: { error?: string; field?: string; code?: string }) {
    super(body.error ?? `HTTP ${status}`)
    this.status = status
    this.error = body.error ?? 'internal'
    this.field = body.field
    this.code = body.code
  }

  /**
   * Dictionary keys for a message the user can read, most specific first: t() takes the first one that exists.
   * e.g. ["err.name.required", "err.v.required", "err.internal"].
   */
  get key(): string[] {
    if (this.error === 'validation' && this.field && this.code) return [`err.${this.field}.${this.code}`, `err.v.${this.code}`, 'err.internal']
    return [`err.${this.error}`, 'err.internal']
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      // The core requires this header on every write: a browser will not add it to a forged cross-site request.
      headers: { 'Content-Type': 'application/json', 'X-Gridlume': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, { error: 'offline' })
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

type Patch<T> = Partial<Omit<T, 'id'>>

export const api = {
  session: () => request<SessionInfo>('GET', '/api/session'),
  setup: (code: string, username: string, password: string) => request<{ user: User }>('POST', '/api/setup', { code, username, password }),
  login: (username: string, password: string) => request<{ user: User }>('POST', '/api/login', { username, password }),
  logout: () => request<{ ok: boolean }>('POST', '/api/logout'),

  map: () => request<MapData>('GET', '/api/map'),
  layout: (nodes: { id: string; x: number; y: number }[], places: Place[]) => request('PUT', '/api/layout', { nodes, places }),

  createPlace: (p: Omit<Place, 'id'>) => request<Place>('POST', '/api/places', p),
  updatePlace: (id: string, p: Patch<Place>) => request<Place>('PATCH', `/api/places/${id}`, p),
  deletePlace: (id: string) => request('DELETE', `/api/places/${id}`),

  createNode: (n: Omit<MapNode, 'id'>) => request<MapNode>('POST', '/api/nodes', n),
  updateNode: (id: string, n: Patch<MapNode>) => request<MapNode>('PATCH', `/api/nodes/${id}`, n),
  deleteNode: (id: string) => request('DELETE', `/api/nodes/${id}`),

  createLink: (l: Omit<Link, 'id'>) => request<Link>('POST', '/api/links', l),
  updateLink: (id: string, l: Patch<Link> & { swap?: boolean }) => request<Link>('PATCH', `/api/links/${id}`, l),
  deleteLink: (id: string) => request('DELETE', `/api/links/${id}`),

  agents: () => request<(Agent & { snapshot: Snapshot | null })[]>('GET', '/api/agents'),
  /** A one-time code for the install command; nodeId "" makes a new node named after the machine. */
  agentCode: (nodeId: string, mode: AgentMode) => request<{ code: string; expiresAt: number }>('POST', '/api/agents/codes', { nodeId, mode }),
  unlinkAgent: (id: string) => request('DELETE', `/api/agents/${id}`),
  updateAgent: (id: string) => request<{ version: string }>('POST', `/api/agents/${id}/update`, {}),
  changePassword: (current: string, next: string) => request<{ ok: boolean }>('POST', '/api/account/password', { current, next }),
  system: () => request<SystemInfo>('GET', '/api/system'),
  saveSystem: (channel: Channel, auto: boolean, agentAuto?: boolean) => request<SystemInfo>('PUT', '/api/system/settings', { channel, auto, agentAuto }),
  checkUpdates: () => request<SystemInfo>('POST', '/api/system/check', {}),
  startUpdate: () => request<SystemInfo>('POST', '/api/system/update', {}),
  suggestions: () => request<Suggestion[]>('GET', '/api/suggestions'),
  problems: () => request<{ open: Problem[]; ended: Problem[] }>('GET', '/api/problems'),
  checks: () => request<Record<string, CheckResult>>('GET', '/api/checks'),
  notify: () => request<NotifyState>('GET', '/api/notify'),
  connectTelegram: (token: string) => request<NotifyState>('POST', '/api/notify/telegram', { token }),
  disconnectTelegram: () => request<NotifyState>('DELETE', '/api/notify/telegram'),
  testTelegram: () => request<NotifyState>('POST', '/api/notify/test', {}),
  saveNotifyRules: (rules: NotifyRules) => request<NotifyState>('PUT', '/api/notify/rules', rules),
  acceptSuggestion: (id: string, about: string, ifBroken: string) => request<Link>('POST', `/api/suggestions/${id}/accept`, { about, ifBroken }),
  dismissSuggestion: (id: string) => request('POST', `/api/suggestions/${id}/dismiss`, {}),
  metrics: (nodeId: string, series: string[], range: MetricRange) =>
    request<{ step: number; series: Record<string, MetricPoint[]> }>('GET', `/api/nodes/${nodeId}/metrics?series=${series.join(',')}&range=${range}`),
}
