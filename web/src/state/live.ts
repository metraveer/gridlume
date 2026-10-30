import { create } from 'zustand'
import { api } from '../api/client'
import type { Agent, CheckResult, Container, LiveEvent, MapNode, NodeState, Snapshot } from '../api/types'
import { useApp } from './app'
import { useProblems } from './problems'

type Live = {
  agents: Record<string, Agent> // by node id
  snaps: Record<string, Snapshot> // by node id, only while connected
  checks: Record<string, CheckResult> // the core's own checks of nodes without an agent, by node id
  changed: Record<string, number> // by machine node id: bumped when the core noticed a change there
  load: () => Promise<void>
  loadChecks: () => Promise<void>
  apply: (e: LiveEvent) => void
  unlink: (agent: Agent) => Promise<void>
}

/**
 * Agents and their latest snapshots. Kept apart from the map store, so a snapshot every few seconds
 * re-renders only the node it belongs to, not the whole map.
 */
export const useLive = create<Live>((set) => ({
  agents: {},
  snaps: {},
  checks: {},
  changed: {},

  loadChecks: async () => set({ checks: await api.checks() }),

  load: async () => {
    const list = await api.agents()
    const agents: Record<string, Agent> = {}
    const snaps: Record<string, Snapshot> = {}
    for (const { snapshot, ...a } of list) {
      agents[a.nodeId] = a
      if (snapshot) snaps[a.nodeId] = snapshot
    }
    set({ agents, snaps })
  },

  apply: (e) => {
    // New containers became nodes, or the core found links to suggest.
    if (e.mapChanged) void useApp.getState().loadMap()
    if (e.changes) {
      set((s) => ({ changed: { ...s.changed, [e.nodeId]: (s.changed[e.nodeId] ?? 0) + 1 } }))
      return
    }
    if (e.problems) {
      void useProblems.getState().load().catch(() => undefined)
      return
    }
    if (e.removed) {
      set((s) => ({ agents: without(s.agents, e.nodeId), snaps: without(s.snaps, e.nodeId) }))
      return
    }
    if (e.agent) {
      const agent = e.agent
      set((s) => ({ agents: { ...s.agents, [e.nodeId]: agent }, snaps: agent.online ? s.snaps : without(s.snaps, e.nodeId) }))
      // A new machine connected with a code that created its node: fetch the map to draw it.
      if (!useApp.getState().map.nodes.some((n) => n.id === e.nodeId)) void useApp.getState().loadMap()
    }
    if (e.snapshot) {
      const snap = e.snapshot
      set((s) => ({ snaps: { ...s.snaps, [e.nodeId]: snap } }))
    }
  },

  unlink: async (agent) => {
    await api.unlinkAgent(agent.id)
    set((s) => ({ agents: without(s.agents, agent.nodeId), snaps: without(s.snaps, agent.nodeId) }))
  },
}))

function without<T>(rec: Record<string, T>, key: string) {
  if (!(key in rec)) return rec
  const next = { ...rec }
  delete next[key]
  return next
}

/** Opens the event stream; returns a function that closes it. EventSource reconnects by itself. */
export function startLive() {
  const { load, apply } = useLive.getState()
  const es = new EventSource('/api/events')
  // (Re)connected: catch up on what happened while the stream was down.
  es.onopen = () => {
    void load().catch(() => undefined)
    void useLive.getState().loadChecks().catch(() => undefined)
    void useProblems.getState().load().catch(() => undefined)
  }
  // Checks run every 10 s to a minute in the core; asking every 15 s keeps the map current enough.
  const timer = window.setInterval(() => void useLive.getState().loadChecks().catch(() => undefined), 15_000)
  es.onmessage = (m) => {
    try {
      apply(JSON.parse(m.data) as LiveEvent)
    } catch {
      // a malformed message is dropped; the next snapshot replaces it anyway
    }
  }
  return () => {
    es.close()
    window.clearInterval(timer)
  }
}

/** The key the core gives a container's node; the same rule as store.ContainerKey. */
export function containerKey(c: Container) {
  return c.project && c.service ? `docker:${c.project}/${c.service}` : `docker:${c.name}`
}

/**
 * The live container of a node made from Docker. undefined: no data now (agent offline, no snapshot yet);
 * null: the machine reports its containers and this one is not among them any more.
 */
export function findContainer(node: MapNode, parentSnap: Snapshot | undefined): Container | null | undefined {
  if (node.source !== 'docker' || !parentSnap?.docker) return undefined
  return parentSnap.docker.containers.find((c) => containerKey(c) === node.extKey) ?? null
}

export function containerState(c: Container): NodeState {
  if (c.state === 'running') return c.health === 'unhealthy' ? 'crit' : c.health === 'starting' ? 'warn' : 'ok'
  if (c.state === 'restarting') return 'warn'
  if (c.state === 'exited' || c.state === 'dead') return 'crit'
  return 'unknown'
}

/**
 * State shown for a node: live from its agent, its container or the core's check if there is one,
 * otherwise what the user set.
 */
export function liveState(node: MapNode, agent: Agent | undefined, container?: Container | null, check?: CheckResult): NodeState {
  if (container) return containerState(container)
  if (container === null) return 'unknown' // the container is gone
  if (agent) return agent.online ? 'ok' : 'crit'
  if (check && check.at && node.state !== 'planned') return checkState(check)
  return node.state
}

/** The same thresholds as the core's problems: a few failures in a row, half the pings, 14 days of certificate. */
export function checkState(c: CheckResult): NodeState {
  if (c.kind === 'ping') {
    if (c.error || !c.sent) return 'unknown'
    return (c.loss ?? 0) >= 50 ? 'crit' : (c.loss ?? 0) > 0 ? 'warn' : 'ok'
  }
  if (!c.ok) return c.fails >= (c.kind === 'tcp' ? 3 : 2) ? 'crit' : 'warn'
  if (c.certUntil && c.certUntil * 1000 - Date.now() < 14 * 86400_000) return 'warn'
  return 'ok'
}

/** The node's agent, snapshot, container and state, re-rendering only when they change. */
export function useNodeLive(node: MapNode) {
  const agent = useLive((s) => s.agents[node.id])
  const snap = useLive((s) => s.snaps[node.id])
  const parentSnap = useLive((s) => (node.parentId ? s.snaps[node.parentId] : undefined))
  const check = useLive((s) => s.checks[node.id])
  const container = findContainer(node, parentSnap)
  return { agent, snap, container, check, state: liveState(node, agent, container, check) }
}
