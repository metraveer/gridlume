import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Agent, WatchState } from '../api/types'
import '../i18n'
import { useApp } from '../state/app'
import { useLive } from '../state/live'
import { WatchSection } from './WatchSection'

const state: WatchState = { agents: { agents: [], after: 3 }, duty: { paired: false, dutyName: '', dutySeen: 0 } }
const agent: Agent = { id: 'a1', nodeId: 'n1', hostname: 'junk', os: '', kernel: '', arch: 'amd64', version: '', mode: 'user', lastSeen: 0, online: true }

it('lets the owner choose the machines that watch the core', async () => {
  useApp.setState({
    user: { id: 'u', username: 'ops', role: 'owner' },
    map: { places: [], nodes: [{ id: 'n1', parentId: null, placeId: null, kind: 'server', name: 'junk-box', subtitle: '', address: '', state: 'ok', notes: '', x: 0, y: 0, source: '' }], links: [] },
  })
  useLive.setState({ agents: { n1: agent } })
  vi.spyOn(api, 'watch').mockResolvedValue(state)
  const save = vi.spyOn(api, 'saveWatchAgents').mockResolvedValue({ ...state, agents: { agents: ['a1'], after: 3 } })

  render(<WatchSection telegram />)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'junk-box' }))
  expect(save).toHaveBeenCalledWith(['a1'], 3)
  await waitFor(() => expect(screen.getByText(/токен бота хранится на выбранных машинах/i)).toBeTruthy())
})

it('asks for Telegram first', async () => {
  vi.spyOn(api, 'watch').mockResolvedValue(state)
  render(<WatchSection telegram={false} />)
  expect(await screen.findByText('Сначала подключите Telegram выше.')).toBeTruthy()
})
