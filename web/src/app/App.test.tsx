import { act, render, screen } from '@testing-library/react'
import i18n from '../i18n'
import { App } from './App'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: '0.0.0-dev' }))))
})

it('shows the welcome screen in Russian', async () => {
  render(<App />)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Gridlume: вся инфраструктура на одной схеме')
  expect(await screen.findByText('Ядро 0.0.0-dev на связи')).toBeTruthy()
})

it('switches to English', async () => {
  render(<App />)
  await act(async () => {
    screen.getByRole('button', { name: 'EN' }).click()
  })
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Gridlume: your whole infrastructure on one map')
  await act(async () => {
    await i18n.changeLanguage('ru')
  })
})

it('reports when the core is unreachable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
  render(<App />)
  expect(await screen.findByText('Нет связи с ядром')).toBeTruthy()
})
