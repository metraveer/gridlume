import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { OutsideState } from '../api/types'
import '../i18n'
import { useApp } from '../state/app'
import { OutsidePage } from './OutsidePage'

const base: OutsideState = { target: { hosts: ['example.org'], ports: [443, 6379] }, duty: { paired: false, dutyName: '', dutySeen: 0 }, asked: 0, every: 600 }

it('explains that only a computer outside can check, and leads to the duty core', async () => {
  vi.spyOn(api, 'outside').mockResolvedValue(base)
  render(<OutsidePage />)
  expect(await screen.findByText(/Изнутри сети это не узнать/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Подключить дежурное ядро' })).toBeTruthy()
})

it('shows what answered from outside, how risky it is and where it leads', async () => {
  useApp.setState({
    map: { places: [], nodes: [{ id: 'web', parentId: null, placeId: null, kind: 'service', name: 'site', subtitle: '', address: '', state: 'ok', notes: '', x: 0, y: 0, source: '' }], links: [] },
  })
  const checked: OutsideState = {
    ...base,
    duty: { paired: true, dutyName: 'cloud', dutySeen: 1 },
    result: {
      at: Date.now() - 60_000, by: 'cloud', ports: [443, 6379],
      found: [{ ip: '198.51.100.4', names: ['example.org'], open: [
        { port: 443, ms: 20, service: 'HTTPS', risk: '', nodes: ['web'] },
        { port: 6379, ms: 21, service: 'Redis', risk: 'nopass', nodes: [] },
      ] }],
    },
  }
  vi.spyOn(api, 'outside').mockResolvedValue(checked)
  const ask = vi.spyOn(api, 'checkOutside').mockResolvedValue({ ...checked, asked: Date.now() })
  render(<OutsidePage />)

  expect(await screen.findByText('example.org')).toBeTruthy()
  expect(screen.getByText('Опасно')).toBeTruthy() // Redis open to anyone
  expect(screen.getByRole('button', { name: 'site' })).toBeTruthy() // 443 leads to the site
  expect(screen.getByText(/Не нарисовано на карте/)).toBeTruthy() // nothing on the map answers on 6379
  fireEvent.click(screen.getByRole('button', { name: 'Проверить сейчас' }))
  expect(ask).toHaveBeenCalled()
  expect(await screen.findByRole('button', { name: 'Проверка запрошена…' })).toBeTruthy()
})
