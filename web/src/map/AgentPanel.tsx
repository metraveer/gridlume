import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { Agent, MetricPoint, MetricRange, Snapshot } from '../api/types'
import { Button, KV, Section, Segmented, StateBadge } from '../design'
import { useLive } from '../state/live'
import { ago, bytes, percent, rate, traffic, uptime } from './format'
import s from './AgentPanel.module.css'

/** A filled bar: grey normally, amber above 80%, red above 95%. */
function Meter({ label, value, text }: { label: string; value: number; text: string }) {
  const tone = value >= 95 ? s.crit : value >= 80 ? s.warn : ''
  return (
    <div className={s.meter}>
      <div className={s.meterHead}>
        <span>{label}</span>
        <span className="mono">{text}</span>
      </div>
      <div className={s.bar} role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
        <span className={tone} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  )
}

/** What the machine is doing right now. */
export function LiveSection({ snap }: { snap: Snapshot }) {
  const { t } = useTranslation()
  const mem = snap.memTotal ? (100 * snap.memUsed) / snap.memTotal : 0
  const net = traffic(snap)
  const hottest = (snap.temps ?? []).reduce<{ name: string; c: number } | null>((a, x) => (!a || x.c > a.c ? x : a), null)
  return (
    <Section title={t('live.now')} help={t('live.now.help')}>
      <div className={s.meters}>
        <Meter label={snap.cores ? t('live.cpu', { cores: snap.cores, threads: snap.threads }) : t('live.cpu.short')} value={snap.cpu} text={percent(snap.cpu)} />
        {snap.memTotal > 0 && <Meter label={t('live.mem')} value={mem} text={`${bytes(t, snap.memUsed)} / ${bytes(t, snap.memTotal)}`} />}
        {snap.swapTotal > 0 && <Meter label={t('live.swap')} value={(100 * snap.swapUsed) / snap.swapTotal} text={`${bytes(t, snap.swapUsed)} / ${bytes(t, snap.swapTotal)}`} />}
        {(snap.disks ?? []).map((d) => (
          <Meter key={d.mount} label={t('live.disk', { mount: d.mount })} value={d.total ? (100 * d.used) / d.total : 0} text={`${bytes(t, d.used)} / ${bytes(t, d.total)}`} />
        ))}
      </div>
      <KV
        rows={[
          [t('live.net'), <span className="mono">↓ {rate(t, net.rx)} · ↑ {rate(t, net.tx)}</span>],
          [t('live.load'), <span className="mono" data-tip={t('live.load.tip', { n: snap.threads })}>{snap.load1.toFixed(2)}</span>],
          ...(hottest ? [[t('live.temp'), <span className="mono" data-tip={hottest.name}>{Math.round(hottest.c)} °C</span>] as [string, React.ReactNode]] : []),
          ...(snap.uptime ? [[t('live.uptime'), uptime(t, snap.uptime)] as [string, React.ReactNode]] : []),
        ]}
      />
    </Section>
  )
}

const CHARTS = [
  { series: 'cpu', label: 'live.cpu.short', unit: '%' },
  { series: 'mem', label: 'live.mem', unit: '%' },
  { series: 'disk', label: 'live.disk.short', unit: '%' },
] as const

/** A small line chart of averages, with the maximum as a faint band. */
function Spark({ points, top }: { points: MetricPoint[]; top: number }) {
  const w = 300
  const h = 48
  if (points.length < 2) return <div className={s.noData} />
  const t0 = points[0]!.t
  const span = points[points.length - 1]!.t - t0 || 1
  const x = (p: MetricPoint) => ((p.t - t0) / span) * w
  const y = (v: number) => h - (Math.min(v, top) / top) * (h - 2) - 1
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.avg).toFixed(1)}`).join('')
  const band = `${points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.max).toFixed(1)}`).join('')}L${w},${h}L0,${h}Z`
  return (
    <svg className={s.spark} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={band} className={s.band} />
      <path d={line} className={s.line} />
    </svg>
  )
}

/** Charts over the last hour, day or two weeks. */
export function HistorySection({ nodeId }: { nodeId: string }) {
  const { t } = useTranslation()
  const [range, setRange] = useState<MetricRange>('1h')
  const [data, setData] = useState<Record<string, MetricPoint[]> | null>(null)
  useEffect(() => {
    let alive = true
    const load = () =>
      api
        .metrics(nodeId, CHARTS.map((c) => c.series), range)
        .then((r) => alive && setData(r.series))
        .catch(() => alive && setData(null))
    void load()
    const timer = window.setInterval(load, 60_000) // a new point arrives each minute
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [nodeId, range])

  return (
    <Section title={t('live.history')} help={t('live.history.help')}>
      <Segmented<MetricRange>
        label={t('live.history')}
        value={range}
        onChange={setRange}
        options={[{ value: '1h', label: t('range.1h') }, { value: '24h', label: t('range.24h') }, { value: '14d', label: t('range.14d') }]}
      />
      <div className={s.charts}>
        {CHARTS.map((c) => {
          const pts = data?.[c.series] ?? []
          const last = pts[pts.length - 1]
          const peak = pts.reduce((m, p) => Math.max(m, p.max), 0)
          return (
            <div key={c.series} className={s.chart}>
              <div className={s.meterHead}>
                <span>{t(c.label)}</span>
                <span className="mono" data-tip={t('live.peak')}>{last ? `${Math.round(last.avg)}${c.unit} · ↑${Math.round(peak)}${c.unit}` : '—'}</span>
              </div>
              <Spark points={pts} top={100} />
            </div>
          )
        })}
      </div>
      {data && Object.values(data).every((p) => p.length < 2) && <p className={s.muted}>{t('live.history.empty')}</p>}
    </Section>
  )
}

/** Who reports for this node and with what rights. */
export function AgentSection({ agent, canEdit, onUnlink }: { agent: Agent; canEdit: boolean; onUnlink: () => void }) {
  const { t } = useTranslation()
  return (
    <Section title={t('agent.title')} help={t(`agent.mode.${agent.mode}.sees`)}>
      <div className={s.agentState}>
        <StateBadge state={agent.online ? 'ok' : 'crit'}>
          {agent.online ? t('agent.online') : agent.lastSeen ? t('agent.offline', { ago: ago(t, agent.lastSeen) }) : t('agent.never')}
        </StateBadge>
      </div>
      <KV
        rows={[
          [t('agent.host'), agent.hostname || '—'],
          [t('agent.os'), agent.os || '—'],
          [t('agent.kernel'), agent.kernel ? <span className="mono">{agent.kernel} · {agent.arch}</span> : '—'],
          [t('agent.mode'), <span data-tip={t(`agent.mode.${agent.mode}.risk`)}>{t(`agent.mode.${agent.mode}`)}</span>],
          [t('agent.version'), <span className="mono">{agent.version || '—'}</span>],
        ]}
      />
      {canEdit && (
        <Button size="sm" variant="ghost" className={s.unlink} tip={t('agent.unlink.tip')} onClick={onUnlink}>
          {t('agent.unlink')}
        </Button>
      )}
    </Section>
  )
}

/** Unlink in one call, for the inspector's confirmation. */
export function unlinkAgent(agent: Agent) {
  return useLive.getState().unlink(agent)
}
