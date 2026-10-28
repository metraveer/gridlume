import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import type { Channel, SystemInfo } from '../api/types'
import { Button, KV, Segmented, StateBadge } from '../design'
import { ago } from '../map/format'
import { useApp } from '../state/app'
import s from './SettingsPage.module.css'

/** Settings: for now the version and updates. */
export function SettingsPage() {
  const { t } = useTranslation()
  const sys = useApp((st) => st.system)
  const owner = useApp((st) => st.user?.role === 'owner')
  const setSystem = useApp((st) => st.setSystem)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // While an update runs the core restarts; keep asking until it answers with the result.
  useEffect(() => {
    void api.system().then(setSystem).catch(() => undefined)
    if (!sys?.pending && sys?.last?.state !== 'running') return
    const timer = window.setInterval(() => void api.system().then(setSystem).catch(() => undefined), 3000)
    return () => window.clearInterval(timer)
  }, [sys?.pending, sys?.last?.state, setSystem])

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

  if (!sys) return null
  const running = sys.pending || sys.last?.state === 'running'
  return (
    <div className={s.page}>
      <h1>{t('settings.title')}</h1>

      <section className={s.card}>
        <h2>{t('update.title')}</h2>
        <KV
          rows={[
            [t('update.current'), <span className="mono">{sys.version} · {sys.commit}</span>],
            [t('update.checked'), sys.checkedAt ? ago(t, Date.parse(sys.checkedAt) / 1000) : t('update.never')],
          ]}
        />

        {running ? (
          <div className={s.banner}>
            <span className={s.spinner} aria-hidden="true" />
            <span>{t('update.running', { to: sys.latest?.version ?? sys.last?.to ?? '' })}</span>
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
        ) : sys.latest ? (
          <p className={s.muted}>{t('update.upToDate')}</p>
        ) : null}

        {!sys.canUpdate && <p className={s.muted}>{t('update.manualOnly')}</p>}
        {sys.checkError && <p className={s.warn}>{t('update.checkError')} <span className="mono">{sys.checkError}</span></p>}
        {sys.last && sys.last.state !== 'running' && sys.last.state !== 'up_to_date' && (
          <div className={s.last}>
            <StateBadge state={sys.last.state === 'done' ? 'ok' : 'crit'}>{t(`update.last.${sys.last.state}`, { from: sys.last.from, to: sys.last.to })}</StateBadge>
            <span className={s.muted}>{ago(t, Date.parse(sys.last.at) / 1000)}</span>
            {sys.last.message && <p className={s.muted}>{sys.last.message}</p>}
          </div>
        )}

        {owner && (
          <div className={s.controls}>
            <label className={s.row}>
              <span>{t('update.channel')}</span>
              <Segmented<Channel>
                label={t('update.channel')}
                value={sys.channel}
                onChange={(channel) => void act(() => api.saveSystem(channel, sys.auto))}
                options={[
                  { value: 'stable', label: t('update.channel.stable'), tip: t('update.channel.stable.tip') },
                  { value: 'edge', label: t('update.channel.edge'), tip: t('update.channel.edge.tip') },
                ]}
              />
            </label>
            <label className={s.check}>
              <input type="checkbox" checked={sys.auto} disabled={busy || !sys.canUpdate} onChange={(e) => void act(() => api.saveSystem(sys.channel, e.target.checked))} />
              <span>
                {t('update.auto')}
                <small>{t('update.auto.hint')}</small>
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
    </div>
  )
}
