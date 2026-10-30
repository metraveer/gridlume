import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import '../i18n'
import { useApp } from '../state/app'
import { useProblems } from '../state/problems'
import { ProblemsPill } from './Problems'

beforeEach(() => {
  useApp.setState({
    map: {
      places: [],
      nodes: [{ id: 'srv', parentId: null, placeId: null, kind: 'server', name: 'calibur', subtitle: '', address: '', state: 'ok', notes: '', x: 0, y: 0, source: '' }],
      links: [],
    },
  })
})

it('says all is well, or how many problems there are, and lists them with what to do', async () => {
  useProblems.setState({ open: [], ended: [], loaded: true })
  const { rerender } = render(<ProblemsPill />)
  expect(screen.getByRole('button', { name: 'Всё работает' })).toBeTruthy()

  await act(async () => {
    useProblems.setState({
      open: [
        { id: 'p1', key: 'disk:srv:/', kind: 'disk_full', severity: 'warn', nodeId: 'srv', params: { mount: '/', percent: 93 }, since: Date.now() - 5 * 60_000 },
        { id: 'p2', key: 'offline:x', kind: 'agent_offline', severity: 'crit', nodeId: 'srv', params: { lastSeen: Math.floor(Date.now() / 1000) - 600 }, merged: ['container_down', 'link_loss'], since: Date.now() },
      ],
    })
  })
  rerender(<ProblemsPill />)
  fireEvent.click(screen.getByRole('button', { name: '2 проблемы' }))
  expect(screen.getByText('На calibur заканчивается место: / занят на 93%')).toBeTruthy()
  expect(screen.getByText('calibur не на связи')).toBeTruthy()
  expect(screen.getByText('и ещё 2 сигнала с той же причиной')).toBeTruthy()
  expect(screen.getByText(/последний сигнал от агента — 10 мин назад/i)).toBeTruthy()
})
