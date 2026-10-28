import type { Link, MapData, MapNode } from '../api/types'
import { dependents, levelContent, requirements } from './model'

const node = (id: string, kind: MapNode['kind'], parentId: string | null = null): MapNode => ({
  id, kind, parentId, placeId: null, name: id, subtitle: '', address: '', state: 'ok', notes: '', x: 0, y: 0,
})
const link = (id: string, fromId: string, toId: string, kind: Link['kind'], planned = false): Link => ({
  id, fromId, toId, kind, proto: '', about: '', ifBroken: '', speedMbit: null, planned,
})

// internet → router → calibur, and inside calibur: api → postgres; domain → api.
const map: MapData = {
  places: [],
  nodes: [node('internet', 'internet'), node('router', 'router'), node('calibur', 'server'), node('api', 'container', 'calibur'),
    node('pg', 'database', 'calibur'), node('domain', 'domain'), node('max', 'server')],
  links: [link('l1', 'internet', 'router', 'uplink'), link('l2', 'router', 'calibur', 'lan'), link('l3', 'api', 'pg', 'db'),
    link('l4', 'domain', 'api', 'dns'), link('l5', 'router', 'max', 'lan', true)],
}

it('finds everything that breaks when the router stops', () => {
  expect(dependents(map, 'router').sort()).toEqual(['api', 'calibur', 'domain', 'pg'])
})

it('ignores planned links', () => {
  expect(dependents(map, 'router')).not.toContain('max')
})

it('finds the chain a service needs', () => {
  expect(requirements(map, 'api').sort()).toEqual(['calibur', 'internet', 'pg', 'router'])
})

it('shows machine contents and outside portals on the machine level', () => {
  const c = levelContent(map, 'calibur')
  expect(c.own.map((n) => n.id).sort()).toEqual(['api', 'pg'])
  expect(c.portals.map((n) => n.id)).toEqual(['domain'])
  expect(c.links.map((l) => l.id).sort()).toEqual(['l3', 'l4'])
})

it('shows only top-level nodes and links between them on the root level', () => {
  const c = levelContent(map, null)
  expect(c.own.map((n) => n.id)).not.toContain('api')
  expect(c.links.map((l) => l.id).sort()).toEqual(['l1', 'l2', 'l5'])
})
