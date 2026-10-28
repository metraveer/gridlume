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
  expect(await screen.findByRole('status', { name: 'Ядро 0.0.0-dev на связи' })).toBeTruthy()
  // The language is switched in Settings.
  await act(async () => {
    window.location.hash = '#/settings'
  })
  await act(async () => {
    ;(await screen.findByRole('button', { name: 'Интерфейс' })).click()
  })
  await act(async () => {
    ;(await screen.findByRole('button', { name: 'English' })).click()
  })
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Settings')
  await act(async () => {
    await i18n.changeLanguage('ru')
  })
})

it('reports when the core is unreachable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
  render(<App />)
  expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Нет связи с ядром')
})

it('offers to reload when the core comes back with another version', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  let v = '0.2.0'
  const base = core({ needsSetup: false, user: owner })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/version' ? new Response(JSON.stringify({ version: v })) : base(url))))
  render(<App />)
  expect(await screen.findByRole('status', { name: 'Ядро 0.2.0 на связи' })).toBeTruthy()
  v = '0.3.0'
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000)
  })
  expect(await screen.findByText('Gridlume обновлён до 0.3.0')).toBeTruthy()
  vi.useRealTimers()
})
