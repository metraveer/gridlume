import type { TFunction } from 'i18next'
import type { Snapshot } from '../api/types'

/** One decimal below 10, none above: "3.4 GB", "120 GB". */
function round(n: number) {
  return n < 10 ? +n.toFixed(1) : Math.round(n)
}

/** Bytes in binary units, as `df` and `free -h` show them. */
export function bytes(t: TFunction, n: number) {
  const units = ['unit.b', 'unit.kb', 'unit.mb', 'unit.gb', 'unit.tb']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return t(units[i] ?? 'unit.b', { n: round(n) })
}

/** Network rate in bits per second, as link speeds are named ("700 Mbit/s"). */
export function rate(t: TFunction, bytesPerSec: number) {
  const bits = bytesPerSec * 8
  if (bits >= 1e9) return t('unit.rate.g', { n: round(bits / 1e9) })
  if (bits >= 1e6) return t('unit.rate.m', { n: round(bits / 1e6) })
  return t('unit.rate.k', { n: round(bits / 1e3) })
}

export function percent(n: number) {
  return `${Math.round(n)}%`
}

export function uptime(t: TFunction, sec: number) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d) return t('unit.uptime.dh', { d, h })
  if (h) return t('unit.uptime.hm', { h, m })
  return t('unit.uptime.m', { m })
}

/** How long ago, roughly: "5 min ago". */
export function ago(t: TFunction, unixSec: number, now = Date.now()) {
  const s = Math.max(0, Math.round(now / 1000 - unixSec))
  if (s < 60) return t('time.justNow')
  if (s < 3600) return t('time.minAgo', { n: Math.floor(s / 60) })
  if (s < 86400) return t('time.hAgo', { n: Math.floor(s / 3600) })
  return t('time.dAgo', { n: Math.floor(s / 86400) })
}

/** Whole days from now to a moment (unix seconds); negative once it has passed. */
export function daysUntil(unixSec: number, now = Date.now()) {
  return Math.floor((unixSec * 1000 - now) / 86400_000)
}

/** Short line for the node card: "CPU 12% · RAM 43%". */
export function cardLine(s: Snapshot) {
  const mem = s.memTotal ? (100 * s.memUsed) / s.memTotal : 0
  return `CPU ${percent(s.cpu)} · RAM ${percent(mem)}`
}

/** Sum of traffic over real interfaces. */
export function traffic(s: Snapshot) {
  return (s.net ?? []).reduce((a, i) => ({ rx: a.rx + i.rx, tx: a.tx + i.tx }), { rx: 0, tx: 0 })
}
