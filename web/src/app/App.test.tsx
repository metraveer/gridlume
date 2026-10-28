import { act, render, screen } from '@testing-library/react'
import i18n from '../i18n'
import { useApp } from '../state/app'
import { App } from './App'

const owner = { id: 'u1', username: 'ops', role: 'owner' }

/** A fake core: answers by path, like the real API. */
function core(session: unknown) {
  return vi.fn(async (url: string) => {
    const body: Record<string, unknown> = {
      '/api/version': { version: '0.0.0-dev' },
      '/api/session': session,
      '/api/map': { places: [], nodes: [], links: [] },
      '/api/agents': [],
      '/api/suggestions': [],
      '/api/system': { version: '0.0.0-dev', build: 0, commit: 'x', channel: 'stable', auto: false, canUpdate: false, coreNode: '', latest: null, newer: false, checkError: '', pending: false },
    }
    return new Response(JSON.stringify(body[url] ?? {}))
  })
}

beforeEach(() => {
  useApp.setState({ ready: false, needsSetup: false, offline: false, user: null, error: null })
  window.location.hash = '#/'
})

it('on first run without the link, says where to get it', async () => {
  vi.stubGlobal('fetch', core({ needsSetup: true, user: null }))
  render(<App />)
  expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Первый запуск')
  expect(screen.getByText('sudo gridlume setup-link')).toBeTruthy()
})

it('takes the code from the first-login link and cleans the address bar', async () => {
  window.location.hash = '#setup=K7QM-2R9X'
  vi.stubGlobal('fetch', core({ needsSetup: true, user: null }))
  render(<App />)
  expect(await screen.findByText('Код из ссылки подставлен — осталось придумать имя и пароль.')).toBeTruthy()
  expect(window.location.hash).toBe('#/')
})

it('asks to sign in when there is no session', async () => {
  vi.stubGlobal('fetch', core({ needsSetup: false, user: null }))
  render(<App />)
  expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Вход в Gridlume')
})

it('shows the empty map when signed in, and switches to English', async () => {
  vi.stubGlobal('fetch', core({ needsSetup: false, user: owner }))
  render(<App />)
  expect(await screen.findByText('Схема пока пустая')).toBeTruthy()
  expect(await screen.findByText('Ядро 0.0.0-dev на связи')).toBeTruthy()
  await act(async () => {
    screen.getByRole('button', { name: 'EN' }).click()
  })
  expect(screen.getByText('The map is empty')).toBeTruthy()
  await act(async () => {
    await i18n.changeLanguage('ru')
  })
})

it('reports when the core is unreachable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
  render(<App />)
  expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Нет связи с ядром')
})
