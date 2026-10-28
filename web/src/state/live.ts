import { create } from 'zustand'
import { api } from '../api/client'
import type { Agent, LiveEvent, MapNode, NodeState, Snapshot } from '../api/types'
import { useApp } from './app'

type Live = {
  agents: Record<string, Agent> // by node id
  snaps: Record<string, Snapshot> // by node id, only while connected
  load: () => Promise<void>
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
  es.onopen = () => void load().catch(() => undefined)
  es.onmessage = (m) => {
    try {
      apply(JSON.parse(m.data) as LiveEvent)
    } catch {
      // a malformed message is dropped; the next snapshot replaces it anyway
    }
  }
  return () => es.close()
}

/** State shown for a node: live from its agent if it has one, otherwise what the user set. */
export function liveState(node: MapNode, agent: Agent | undefined): NodeState {
  if (!agent) return node.state
  return agent.online ? 'ok' : 'crit'
}

/** The node's agent and state, re-rendering only when they change. */
export function useNodeLive(node: MapNode) {
  const agent = useLive((s) => s.agents[node.id])
  const snap = useLive((s) => s.snaps[node.id])
  return { agent, snap, state: liveState(node, agent) }
}
