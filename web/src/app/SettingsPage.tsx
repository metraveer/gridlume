import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import type { Channel, SystemInfo } from '../api/types'
import { Button, Icon, KV, Segmented, StateBadge, type IconName } from '../design'
import { setLanguage, type Language } from '../i18n'
import { ago } from '../map/format'
import { useApp } from '../state/app'
import { usePrefs } from '../state/prefs'
import s from './SettingsPage.module.css'

/** Change the password: the current one is asked again, other sessions end. */
function PasswordForm() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const mismatch = repeat !== '' && repeat !== next

  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setRepeat('')
      setDone(true)
    } catch (err) {
      setError(t(err instanceof ApiError ? err.key : 'err.internal'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={s.form} onSubmit={submit}>
      <label className={s.field}>
        <span>{t('account.current')}</span>
        <input className={s.input} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
      </label>
      <label className={s.field}>
        <span>{t('account.next')}</span>
        <input className={s.input} type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} autoComplete="new-password" />
        <small>{t('setup.password.hint')}</small>
      </label>
      <label className={s.field}>
        <span>{t('setup.repeat')}</span>
        <input className={s.input} type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password" />
      </label>
      {mismatch && <p className={s.warn}>{t('setup.mismatch')}</p>}
      {error && <p className={s.warn} role="alert">{error}</p>}
      {done && <p className={s.ok} role="status">{t('account.changed')}</p>}
      <div>
        <Button type="submit" variant="primary" disabled={busy || mismatch || !current || !next}>{t('account.change')}</Button>
      </div>
    </form>
  )
}

type Section = 'account' | 'interface' | 'updates'
const SECTIONS: { id: Section; icon: IconName }[] = [
  { id: 'account', icon: 'key' },
  { id: 'interface', icon: 'layers' },
  { id: 'updates', icon: 'restart' },
]

/** A switch for one interface preference, with a line that says what it does. */
function Toggle({ pref, label, hint }: { pref: 'minimap' | 'linkLabels' | 'grid'; label: string; hint: string }) {
  const on = usePrefs((p) => p[pref])
  const set = usePrefs((p) => p.set)
  return (
    <label className={s.check}>
      <input type="checkbox" checked={on} onChange={(e) => set({ [pref]: e.target.checked })} />
      <span>
        {label}
        <small>{hint}</small>
      </span>
    </label>
  )
}

/** Settings in sections; the open one is remembered on this device. More sections come with later stages. */
export function SettingsPage() {
  const [section, setSection] = useState<Section>(() => {
    try {
      return (localStorage.getItem('gridlume.settings.section') as Section) || 'account'
    } catch {
      return 'account'
    }
  })
  const choose = (id: Section) => {
    setSection(id)
    try {
      localStorage.setItem('gridlume.settings.section', id)
    } catch {
      // not remembered: fine
    }
  }
  const { t, i18n } = useTranslation()
  const user = useApp((st) => st.user)
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

  const running = sys ? sys.pending || sys.last?.state === 'running' : false
  return (
    <div className={s.layout}>
      <nav className={s.nav} aria-label={t('settings.title')}>
        <h1>{t('settings.title')}</h1>
        {SECTIONS.map((sec) => (
          <button key={sec.id} type="button" aria-current={section === sec.id ? 'page' : undefined} onClick={() => choose(sec.id)}>
            <Icon name={sec.icon} />
            {t(`settings.${sec.id}`)}
            {sec.id === 'updates' && sys?.newer && <span className={s.dot} aria-label={t('update.badge.tip')} />}
          </button>
        ))}
      </nav>
      <div className={s.page}>
        {section === 'account' && user && (
          <section className={s.card}>
            <h2>{t('account.title')}</h2>
            <KV rows={[[t('auth.username'), user.username], [t('account.role'), t(`role.${user.role}`)]]} />
            <h3 className={s.sub}>{t('account.password')}</h3>
            <p className={s.muted}>{t('account.password.lead')}</p>
            <PasswordForm />
          </section>
        )}

        {section === 'interface' && (
          <section className={s.card}>
            <h2>{t('settings.interface')}</h2>
            <div className={s.row}>
              <span>
                {t('app.lang')}
                <small className={s.muted}>{t('lang.lead')}</small>
              </span>
              <Segmented<Language>
                label={t('app.lang')}
                value={i18n.language as Language}
                onChange={(l) => void setLanguage(l)}
                options={[{ value: 'ru', label: t('lang.ru') }, { value: 'en', label: t('lang.en') }]}
              />
            </div>
            <h3 className={s.sub}>{t('settings.map')}</h3>
            <Toggle pref="minimap" label={t('pref.minimap')} hint={t('pref.minimap.hint')} />
            <Toggle pref="linkLabels" label={t('pref.linkLabels')} hint={t('pref.linkLabels.hint')} />
            <Toggle pref="grid" label={t('pref.grid')} hint={t('pref.grid.hint')} />
            <p className={s.muted}>{t('pref.device')}</p>
          </section>
        )}

        {section === 'updates' && sys && (
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
        )}
      </div>
    </div>
  )
}
