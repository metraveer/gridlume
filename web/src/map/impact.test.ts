import { expect, it } from 'vitest'
import type { Link, MapData, MapNode } from '../api/types'
import { impactOf, impactRole } from './impact'

const node = (id: string, parentId: string | null = null): MapNode => ({ id, parentId, placeId: null, kind: 'server', name: id, subtitle: '', address: '', state: 'ok', notes: '', x: 0, y: 0, source: '' })
const link = (id: string, fromId: string, toId: string, kind: Link['kind']): Link => ({ id, fromId, toId, kind, proto: '', about: '', ifBroken: '', speedMbit: null, planned: false })

it('finds what stops on every level and counts it inside each machine', () => {
  const map: MapData = {
    places: [],
    nodes: [node('isp'), node('router'), node('srv'), node('app', 'srv'), node('db', 'srv'), node('nas'), node('other')],
    links: [link('l1', 'isp', 'router', 'uplink'), link('l2', 'router', 'srv', 'lan'), link('l3', 'router', 'nas', 'lan')],
  }
  const imp = impactOf(map, 'router')
  expect([...imp.affected].sort()).toEqual(['app', 'db', 'nas', 'srv'])
  expect(imp.inside.get('srv')).toBe(2) // both containers stop with their machine
  expect(impactRole(imp, 'router')).toBe('src')
  expect(impactRole(imp, 'srv')).toBe('hit')
  expect(impactRole(imp, 'isp')).toBe('faded') // the router stopping does not stop the provider
  expect(impactRole(null, 'isp')).toBeNull()
  expect(impactOf(map, 'router')).toBe(imp) // asked by every card: computed once
})
