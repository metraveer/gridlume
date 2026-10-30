import { expect, it } from 'vitest'
import type { Link, MapNode, Problem } from '../api/types'
import { linkStateAt, openAt, stateAt } from './history'

const node = (id: string, parentId: string | null = null, extra: Partial<MapNode> = {}): MapNode => ({ id, parentId, placeId: null, kind: 'server', name: id, subtitle: '', address: '', state: 'unknown', notes: '', x: 0, y: 0, source: '', ...extra })
const problem = (p: Partial<Problem>): Problem => ({ id: 'p', key: 'k', kind: 'disk_full', severity: 'warn', params: {}, since: 100, ...p })

it('tells what a node and a link were like at a past moment', () => {
  const ps = [
    problem({ id: '1', kind: 'agent_offline', severity: 'crit', nodeId: 'srv', since: 100, ended: 200 }),
    problem({ id: '2', kind: 'disk_full', severity: 'warn', nodeId: 'nas', since: 150 }),
    problem({ id: '3', kind: 'link_loss', severity: 'warn', linkId: 'l1', since: 120, ended: 130 }),
  ]
  expect(openAt(ps, 50)).toHaveLength(0)
  expect(openAt(ps, 160).map((p) => p.id)).toEqual(['1', '2'])

  const at = openAt(ps, 160)
  expect(stateAt(node('srv'), at, true)).toBe('crit') // the machine was not connected
  expect(stateAt(node('app', 'srv', { source: 'docker' }), at, false)).toBe('unknown') // inside it: nothing known
  expect(stateAt(node('nas'), at, true)).toBe('warn')
  expect(stateAt(node('vps'), at, true)).toBe('ok') // watched, no problem: fine
  expect(stateAt(node('drawn', null, { state: 'planned' }), at, false)).toBe('planned') // nobody watched it
  expect(stateAt(node('srv'), openAt(ps, 250), true)).toBe('ok') // back by then

  const l1 = { id: 'l1' } as Link
  expect(linkStateAt(l1, openAt(ps, 125))).toBe('warn')
  expect(linkStateAt(l1, openAt(ps, 160))).toBe('ok')
})
