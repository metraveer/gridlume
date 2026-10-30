import { describe, expect, it } from 'vitest'
import type { Link, Snapshot } from '../api/types'
import i18n from '../i18n'
import { dots, linkTraffic, trafficLabel } from './traffic'

const link = (over: Partial<Link> = {}): Link => ({ id: 'l', fromId: 'router', toId: 'srv', kind: 'lan', proto: '', about: '', ifBroken: '', speedMbit: null, planned: false, iface: '', ...over })
const snap = (net: Snapshot['net']) => ({ net }) as Snapshot
const MBIT = 1e6 / 8 // bytes per second

describe('linkTraffic', () => {
  const server = snap([
    { name: 'wlp3s0', rx: 0, tx: 0 },
    { name: 'enp4s0f1', rx: 40 * MBIT, tx: 4 * MBIT, default: true, speed: 1000 },
  ])

  it('reads the default-route interface of the machine at the end, turned to the link direction', () => {
    const tr = linkTraffic(link(), undefined, server)!
    expect(tr).toMatchObject({ iface: 'enp4s0f1', auto: true, side: 'to', portMbit: 1000, capacityMbit: 1000 })
    expect(tr.fwd).toBe(40 * MBIT) // router → server is what the server receives
    expect(tr.back).toBe(4 * MBIT)
    expect(tr.load).toBeCloseTo(4)
  })

  it('prefers the start of the link and the contract speed', () => {
    const tr = linkTraffic(link({ speedMbit: 50 }), server, undefined)!
    expect(tr.side).toBe('from')
    expect(tr.fwd).toBe(4 * MBIT) // what the start sends
    expect(tr.capacityMbit).toBe(50)
    expect(tr.load).toBeCloseTo(80)
  })

  it('uses the interface chosen in the link, and nothing for links that are not networks', () => {
    expect(linkTraffic(link({ iface: 'wlp3s0' }), undefined, server)!.iface).toBe('wlp3s0')
    expect(linkTraffic(link({ iface: 'eth9' }), undefined, server)).toBeNull()
    expect(linkTraffic(link({ kind: 'db' }), undefined, server)).toBeNull()
    expect(linkTraffic(link({ planned: true }), undefined, server)).toBeNull()
    expect(linkTraffic(link(), undefined, undefined)).toBeNull()
  })
})

describe('trafficLabel', () => {
  const t = i18n.getFixedT('ru')
  const base = { iface: 'eth0', auto: true, side: 'to' as const, portMbit: 0, load: 0 }
  it('writes the unit once when both sides share it', () => {
    expect(trafficLabel(t, { ...base, fwd: 312 * MBIT, back: 0, capacityMbit: 700 })).toBe('312 / 700 Мбит')
    expect(trafficLabel(t, { ...base, fwd: 12 * MBIT, back: 0, capacityMbit: 1000 })).toBe('12 Мбит / 1 Гбит')
    expect(trafficLabel(t, { ...base, fwd: 300 * MBIT, back: 0, capacityMbit: 1000 })).toBe('0.3 / 1 Гбит')
    expect(trafficLabel(t, { ...base, fwd: 2.5 * MBIT, back: 0, capacityMbit: 0 })).toBe('2.5 Мбит/с')
  })
})

describe('dots', () => {
  it('runs more and faster dots with more traffic, none when idle', () => {
    expect(dots(10)).toBeNull()
    const slow = dots(10 * 1000 / 8)!
    const fast = dots(100 * MBIT)!
    expect(fast.count).toBeGreaterThan(slow.count)
    expect(fast.dur).toBeLessThan(slow.dur)
  })
})
