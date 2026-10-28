import type { Agent, MapNode, Snapshot } from '../api/types'
import { useApp } from './app'
import { liveState, useLive } from './live'

const node: MapNode = { id: 'n1', parentId: null, placeId: null, kind: 'server', name: 'calibur', subtitle: '', address: '', state: 'unknown', notes: '', x: 0, y: 0 }
const agent: Agent = { id: 'a1', nodeId: 'n1', hostname: 'calibur', os: '', kernel: '', arch: 'amd64', version: '', mode: 'user', lastSeen: 0, online: true }
const snap = { at: 1, cpu: 12, cores: 4 } as Snapshot

beforeEach(() => {
  useLive.setState({ agents: {}, snaps: {} })
  useApp.setState({ map: { places: [], nodes: [node], links: [] } })
})

it('takes the state from the agent when there is one', () => {
  expect(liveState(node, undefined)).toBe('unknown')
  expect(liveState(node, agent)).toBe('ok')
  expect(liveState(node, { ...agent, online: false })).toBe('crit')
})

it('applies agent, snapshot, offline and removed events', () => {
  const { apply } = useLive.getState()
  apply({ nodeId: 'n1', agent })
  apply({ nodeId: 'n1', snapshot: snap })
  expect(useLive.getState().snaps.n1?.cpu).toBe(12)

  apply({ nodeId: 'n1', agent: { ...agent, online: false } })
  expect(useLive.getState().agents.n1?.online).toBe(false)
  expect(useLive.getState().snaps.n1).toBeUndefined() // no stale numbers for a silent machine

  apply({ nodeId: 'n1', removed: true })
  expect(useLive.getState().agents.n1).toBeUndefined()
})

it('reloads the map when an unknown machine connects', () => {
  const loadMap = vi.fn(async () => undefined)
  useApp.setState({ loadMap })
  useLive.getState().apply({ nodeId: 'new', agent: { ...agent, nodeId: 'new' } })
  expect(loadMap).toHaveBeenCalledOnce()
})
