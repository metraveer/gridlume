import type { TFunction } from 'i18next'
import type { Link, Snapshot } from '../api/types'
import { useLive } from '../state/live'
import { LINK_META } from './model'

/** Live traffic of a link, from the counters of a network interface on the machine with the agent. */
export type LinkTraffic = {
  fwd: number // bytes per second from the link's start to its end
  back: number // ...and back
  iface: string // whose counters these are
  auto: boolean // the interface was picked by the default route, not chosen in the link
  side: 'from' | 'to' // which end has the agent
  portMbit: number // speed the network cards agreed on; 0 = unknown
  capacityMbit: number // what the link should carry: the contract, else the port; 0 = unknown
  load: number // percent of the capacity in the busier direction; 0 when the capacity is unknown
}

/**
 * The start of the link is asked first, then its end. Without an interface chosen in the link, the one
 * with the default route is used (or the only one): on most machines that is the cable to the router.
 */
export function linkTraffic(link: Link, from: Snapshot | undefined, to: Snapshot | undefined): LinkTraffic | null {
  if (!LINK_META[link.kind].traffic || link.planned) return null
  for (const [side, snap] of [['from', from], ['to', to]] as const) {
    const net = snap?.net ?? []
    const i = link.iface ? net.find((x) => x.name === link.iface) : (net.find((x) => x.default) ?? (net.length === 1 ? net[0] : undefined))
    if (!i) continue
    const [fwd, back] = side === 'from' ? [i.tx, i.rx] : [i.rx, i.tx]
    const portMbit = i.speed ?? 0
    const capacityMbit = link.speedMbit ?? portMbit
    const load = capacityMbit ? (100 * (Math.max(fwd, back) * 8)) / 1e6 / capacityMbit : 0
    return { fwd, back, iface: i.name, auto: !link.iface, side, portMbit, capacityMbit, load }
  }
  return null
}

export function useLinkTraffic(link: Link) {
  const from = useLive((s) => s.snaps[link.fromId])
  const to = useLive((s) => s.snaps[link.toId])
  return linkTraffic(link, from, to)
}

/** Latency and loss of a link: an agent at one end pings the address of the other end every 10 s. */
export type LinkPing = { host: string; side: 'from' | 'to'; sent: number; rtt: number; loss: number; error?: string }

export function linkPing(link: Link, from: Snapshot | undefined, to: Snapshot | undefined): LinkPing | null {
  for (const [side, snap] of [['from', from], ['to', to]] as const) {
    const p = snap?.probes?.find((x) => x.id === link.id)
    if (p) return { host: p.host, side, sent: p.sent, rtt: p.rtt, loss: p.loss, error: p.error }
  }
  return null
}

export function useLinkPing(link: Link) {
  const from = useLive((s) => s.snaps[link.fromId])
  const to = useLive((s) => s.snaps[link.toId])
  return linkPing(link, from, to)
}

/**
 * How the link is doing. With a ping every 10 s a minute holds six of them, so one lost packet is
 * already 17%: any loss is a warning, and losing most of them (or all) means the link is down.
 */
export function linkHealth(tr: LinkTraffic | null, p: LinkPing | null): 'crit' | 'warn' | 'ok' {
  if (p && !p.error && p.sent >= 2 && p.loss >= 50) return 'crit'
  if ((p && !p.error && p.loss > 0) || (tr && tr.load >= 80)) return 'warn'
  return 'ok'
}

/** "2 ms", "0.4 ms", or "no answer". */
export function latencyLabel(t: TFunction, p: LinkPing) {
  if (p.error || !p.sent) return ''
  if (p.loss >= 100) return t('link.ping.none')
  return t('link.ping.ms', { n: p.rtt >= 10 ? Math.round(p.rtt) : +p.rtt.toFixed(1) })
}

/** "312 / 700 Мбит", "12 Мбит / 1 Гбит", or just the rate when the capacity is unknown. */
export function trafficLabel(t: TFunction, tr: LinkTraffic) {
  const cur = (Math.max(tr.fwd, tr.back) * 8) / 1e6
  if (!tr.capacityMbit) return t('unit.rate.m', { n: short(cur) })
  const gbit = tr.capacityMbit >= 1000
  const cap = gbit ? t('unit.gbit', { n: short(tr.capacityMbit / 1000) }) : t('unit.mbit', { n: short(tr.capacityMbit) })
  // The same unit on both sides is written once.
  if (!gbit || cur >= 100) return t('link.traffic.pair', { cur: short(gbit ? cur / 1000 : cur), cap })
  return t('link.traffic.pair', { cur: t('unit.mbit', { n: short(cur) }), cap })
}

function short(n: number) {
  if (n >= 100) return Math.round(n)
  if (n >= 10) return +n.toFixed(0)
  if (n >= 1) return +n.toFixed(1)
  return +n.toFixed(2)
}

/** Dots running along a line: more and faster with more traffic; none below ~1 kbit/s. */
export function dots(bytesPerSec: number) {
  const bits = bytesPerSec * 8
  if (bits < 1000) return null
  const count = bits < 1e6 ? 1 : bits < 1e7 ? 2 : 3
  const dur = Math.max(0.9, 4 - Math.log10(bits / 1000)) // 1 kbit/s: 4 s along the line; 1 Mbit/s: 1 s
  return { count, dur }
}
