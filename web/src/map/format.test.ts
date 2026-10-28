import i18n from '../i18n'
import { ago, bytes, cardLine, rate, uptime } from './format'

const t = i18n.t.bind(i18n)

it('formats sizes, rates and times in Russian', () => {
  expect(bytes(t, 512)).toBe('512 Б')
  expect(bytes(t, 3.5 * 1024 ** 3)).toBe('3.5 ГБ')
  expect(bytes(t, 120 * 1024 **3)).toBe('120 ГБ')
  expect(rate(t, 700e6 / 8)).toBe('700 Мбит/с')
  expect(rate(t, 1.2e9 / 8)).toBe('1.2 Гбит/с')
  expect(uptime(t, 3 * 86400 + 5 * 3600)).toBe('3 д 5 ч')
  expect(ago(t, 1000, 1000_000 + 30_000)).toBe('только что')
  expect(ago(t, 1000, 1000_000 + 5 * 60_000)).toBe('5 мин назад')
})

it('summarises load for the node card', () => {
  expect(cardLine({ cpu: 12.4, memTotal: 100, memUsed: 43 } as never)).toBe('CPU 12% · RAM 43%')
})

it('shortens a container image to its name on the card', async () => {
  const { shortImage } = await import('./flow')
  expect(shortImage('ghcr.io/moghtech/komodo-core:2')).toBe('komodo-core:2')
  expect(shortImage('postgres:17')).toBe('postgres:17')
})
