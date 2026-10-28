import type { Agent, Container, MapNode, Snapshot } from '../api/types'
import { useApp } from './app'
import { liveState, useLive } from './live'

const node: MapNode = { id: 'n1', parentId: null, placeId: null, kind: 'server', name: 'calibur', subtitle: '', address: '', state: 'unknown', notes: '', x: 0, y: 0, source: '' }
const agent: Agent = { id: 'a1', nodeId: 'n1', hostname: 'calibur', os: '', kernel: '', arch: 'amd64', version: '', mode: 'user', lastSeen: 0, online: true }
const snap = { at: 1, cpu: 12, cores: 2, threads: 4 } as Snapshot

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

it('follows a container node to its live container', async () => {
  const { containerKey, findContainer } = await import('./live')
  const c = { name: 'app-api-1', project: 'app', service: 'api', state: 'running', health: 'unhealthy' } as Container
  expect(containerKey(c)).toBe('docker:app/api')
  expect(containerKey({ ...c, project: undefined } as Container)).toBe('docker:app-api-1')

  const ct: MapNode = { ...node, id: 'c1', parentId: 'n1', kind: 'container', source: 'docker', extKey: 'docker:app/api' }
  const parent = { docker: { containers: [c] } } as unknown as Snapshot
  expect(findContainer(ct, parent)).toBe(c)
  expect(liveState(ct, undefined, findContainer(ct, parent))).toBe('crit') // running but failing its health check
  expect(liveState(ct, undefined, findContainer(ct, { docker: { containers: [{ ...c, health: undefined }] } } as unknown as Snapshot))).toBe('ok')
  expect(findContainer(ct, { docker: { containers: [] } } as unknown as Snapshot)).toBeNull() // gone
  expect(findContainer(ct, undefined)).toBeUndefined() // no data now
  expect(findContainer(node, parent)).toBeUndefined() // drawn by hand: not a container
})
