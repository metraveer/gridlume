import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import type { Channel, ChannelInfo, SystemInfo } from '../api/types'
import { Button, KV, StateBadge } from '../design'
import { ago, bytes, rate } from '../map/format'
import { useApp } from '../state/app'
import s from './SettingsPage.module.css'

const CHANNELS: Channel[] = ['stable', 'edge']

/** What a channel has, next to its name: the newest version and how it relates to what runs now. */
function ChannelState({ info, current }: { info: ChannelInfo | undefined; current: string }) {
  const { t } = useTranslation()
  if (!info) return <span className={s.muted}>{t('update.notChecked')}</span>
  if (!info.latest) return <span className={s.muted}>{t(`update.problem.${info.problem ?? 'other'}`)}</span>
  const v = info.latest.version
  if (v === current) return <span className={s.muted}>{t('update.state.installed', { v })}</span>
  return info.newer ? <b className={s.newer}>{t('update.state.newer', { v })}</b> : <span className={s.muted}>{t('update.state.older', { v })}</span>
}

/** What the update service is doing now; while downloading, a bar with bytes and speed. */
function UpdateProgress({ last }: { last: SystemInfo['last'] }) {
  const { t } = useTranslation()
  if (!last || last.state !== 'running') return <small className={s.muted}>{t('update.step.waiting')}</small>
  const p = last.progress
  if (last.step !== 'download' || !p) return last.step ? <small className={s.muted}>{t(`update.step.${last.step}`)}</small> : null
  const share = p.total > 0 ? Math.min(100, (100 * p.done) / p.total) : 0
  return (
    <div className={s.progress}>
      <small className={s.muted}>
        {t('update.step.download', { part: p.part, parts: p.parts })} ·{' '}
        <span className="mono">
          {p.total > 0 ? t('update.step.of', { done: bytes(t, p.done), total: bytes(t, p.total) }) : bytes(t, p.done)} · {rate(t, p.speed)}
        </span>
      </small>
      {p.total > 0 && (
        <div className={s.bar} role="progressbar" aria-valuenow={Math.round(share)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${share}%` }} />
        </div>
      )}
    </div>
  )
}

/**
 * Settings → Updates. Shows both channels at once (so "nothing new" on stable does not hide a fresh build
 * on edge), what the chosen one offers, the last outcome that concerns the version running now, and asks
 * the core again while an update runs (the core restarts in the middle).
 */
export function UpdatesSection({ sys }: { sys: SystemInfo }) {
  const { t } = useTranslation()
  const owner = useApp((st) => st.user?.role === 'owner')
  const setSystem = useApp((st) => st.setSystem)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = sys.pending || sys.last?.state === 'running'

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => void api.system().then(setSystem).catch(() => undefined), 3000)
    return () => window.clearInterval(timer)
  }, [running, setSystem])

  const act = async (fn: () => Promise<SystemInfo>) => {
    setBusy(true)
    setError(null)
    try {
      setSystem(await fn())
    } catch (e) {
      setError(t(e instanceof ApiError ? e.key : 'err.internal'))
    } finally {
      setBusy(false)
    }
  }
  const other = CHANNELS.find((c) => c !== sys.channel)!
  const otherInfo = sys.channels?.[other]

  return (
    <section className={s.card}>
      <h2>{t('update.title')}</h2>
      <KV
        rows={[
          [t('update.current'), <span className="mono">{sys.version} · {sys.commit}</span>],
          [t('update.from'), sys.built ? t(`update.channel.${sys.built}`) : t('update.devBuild')],
          [t('update.checked'), sys.checkedAt ? ago(t, Date.parse(sys.checkedAt) / 1000) : t('update.never')],
        ]}
      />

      <div className={s.channels} role="radiogroup" aria-label={t('update.channel')}>
        {CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={sys.channel === c}
            className={s.channel}
            disabled={!owner || busy}
            data-tip={t(`update.channel.${c}.tip`)}
            onClick={() => sys.channel !== c && void act(() => api.saveSystem(c, sys.auto))}
          >
            <span className={s.radio} aria-hidden="true" />
            <span className={s.channelName}>{t(`update.channel.${c}`)}</span>
            <ChannelState info={sys.channels?.[c]} current={sys.version} />
          </button>
        ))}
      </div>

      {running ? (
        <div className={s.banner}>
          <span className={s.spinner} aria-hidden="true" />
          <div className={s.runningText}>
            <span>{t('update.running', { to: sys.last?.to || sys.latest?.version || '' })}</span>
            <UpdateProgress last={sys.pending || sys.last?.state === 'running' ? sys.last : undefined} />
          </div>
        </div>
      ) : sys.newer && sys.latest ? (
        <div className={s.banner} data-tone="new">
          <div>
            <b>{t('update.available', { version: sys.latest.version })}</b>
            <a href={sys.latest.url} target="_blank" rel="noreferrer">{t('update.whatsNew')}</a>
          </div>
          {owner && sys.canUpdate && (
            <Button variant="primary" disabled={busy} tip={t('update.button.tip')} onClick={() => void act(api.startUpdate)}>{t('update.button')}</Button>
          )}
        </div>
      ) : sys.ahead ? (
        <p className={s.muted}>{t('update.ahead', { channel: t(`update.channel.${sys.channel}`), v: sys.latest?.version })}</p>
      ) : sys.latest ? (
        <p className={s.muted}>{t('update.upToDate')}</p>
      ) : null}

      {!running && !sys.newer && otherInfo?.newer && otherInfo.latest && (
        <p className={s.hintLine}>{t('update.otherNewer', { channel: t(`update.channel.${other}`), v: otherInfo.latest.version })}</p>
      )}
      {sys.pendingStuck && <p className={s.warn}>{t('update.stuck')} <code className="mono">systemctl status gridlume-update.path</code></p>}
      {!sys.canUpdate && <p className={s.muted}>{t('update.manualOnly')}</p>}

      {sys.last && sys.last.state !== 'running' && (
        <div className={s.last}>
          <StateBadge state={sys.last.state === 'done' || sys.last.state === 'installed' ? 'ok' : 'crit'}>
            {t(`update.last.${sys.last.state}`, { from: sys.last.from, to: sys.last.to })}
          </StateBadge>
          <span className={s.muted}>{ago(t, Date.parse(sys.last.at) / 1000)}</span>
          {sys.last.message && <p className={s.muted}>{sys.last.message}</p>}
        </div>
      )}

      {owner && (
        <div className={s.controls}>
          <label className={s.check}>
            <input type="checkbox" checked={sys.auto} disabled={busy || !sys.canUpdate} onChange={(e) => void act(() => api.saveSystem(sys.channel, e.target.checked))} />
            <span>
              {t('update.auto')}
              <small>{t('update.auto.hint')}</small>
            </span>
          </label>
          <label className={s.check}>
            <input type="checkbox" checked={sys.agentAuto} disabled={busy} onChange={(e) => void act(() => api.saveSystem(sys.channel, sys.auto, e.target.checked))} />
            <span>
              {t('update.agentAuto')}
              <small>{t('update.agentAuto.hint')}</small>
            </span>
          </label>
          <div>
            <Button size="sm" disabled={busy} onClick={() => void act(api.checkUpdates)}>{t('update.checkNow')}</Button>
          </div>
          <p className={s.muted}>
            {t('update.cli')} <code className="mono">sudo gridlume update</code>
          </p>
        </div>
      )}
      {error && <p className={s.warn} role="alert">{error}</p>}
    </section>
  )
}
