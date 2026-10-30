import { expect, it } from 'vitest'
import type { Link, MapData, MapNode } from '../api/types'
import { pathOf } from './path'

const node = (id: string, kind: MapNode['kind'] = 'service', parentId: string | null = null): MapNode => ({ id, parentId, placeId: null, kind, name: id, subtitle: '', address: '', state: 'ok', notes: '', x: 0, y: 0, source: '' })
const link = (id: string, fromId: string, toId: string, kind: Link['kind']): Link => ({ id, fromId, toId, kind, proto: '', about: '', ifBroken: '', speedMbit: null, planned: false })

const map: MapData = {
  places: [],
  nodes: [node('inet', 'internet'), node('dom', 'domain'), node('vps', 'vps'), node('web', 'container', 'vps'), node('api', 'container', 'vps'), node('pg', 'database', 'vps'), node('cache', 'database', 'vps')],
  links: [
    link('l1', 'inet', 'vps', 'uplink'), // the server needs the internet
    link('l2', 'dom', 'web', 'dns'), // the name points at the web container (calls)
    link('l3', 'web', 'api', 'http'),
    link('l4', 'api', 'pg', 'db'),
    link('l5', 'api', 'cache', 'db'),
  ],
}

it('goes the way a visitor does: by the domain, along the links, then where the node sends requests', () => {
  const p = pathOf(map, 'api')
  expect(p.steps.map((s) => s.nodeId)).toEqual(['dom', 'web', 'api', 'pg'])
  expect(p.steps[1]).toEqual({ nodeId: 'web', linkId: 'l2' })
  expect(p.steps[3]).toEqual({ nodeId: 'pg', linkId: 'l4' })
  expect(p.links).toEqual(new Set(['l2', 'l3', 'l4']))
})

it('comes from the internet when no domain leads there, stepping into the machine', () => {
  const noDomain: MapData = { ...map, links: map.links.filter((l) => l.id !== 'l2') }
  expect(pathOf(noDomain, 'api').steps).toEqual([{ nodeId: 'inet' }, { nodeId: 'vps', linkId: 'l1' }, { nodeId: 'api' }, { nodeId: 'pg', linkId: 'l4' }])
})

it('starts at the node when it is an entry, and stops at cycles', () => {
  expect(pathOf(map, 'dom').steps.map((s) => s.nodeId)).toEqual(['dom', 'web', 'api', 'pg'])
  const loop: MapData = { ...map, links: [...map.links, link('l6', 'pg', 'api', 'http')] }
  expect(pathOf(loop, 'api').steps.map((s) => s.nodeId)).toEqual(['dom', 'web', 'api', 'pg'])
})

it('is just the node when nothing leads to it', () => {
  const lonely: MapData = { places: [], nodes: [node('x')], links: [] }
  expect(pathOf(lonely, 'x').steps).toEqual([{ nodeId: 'x' }])
})
