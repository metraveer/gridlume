import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import type { NotifyRules, NotifyState } from '../api/types'
import { Button, StateBadge } from '../design'
import { ago } from '../map/format'
import { useApp } from '../state/app'
import s from './SettingsPage.module.css'
import n from './NotificationsPage.module.css'
import { WatchSection } from './WatchSection'

/** Where problems are sent and which ones: Telegram first, rules in plain words, quiet hours. */
export function NotificationsPage() {
  const { t } = useTranslation()
  const owner = useApp((st) => st.user?.role === 'owner')
  const [state, setState] = useState<NotifyState | null>(null)
  const [error, setError] = useState('')

  const refresh = () => api.notify().then(setState).catch(() => undefined)
  useEffect(() => {
    void refresh()
  }, [])
  // While waiting for /start, look again every two seconds.
  const waiting = !!state?.telegram.waiting
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => window.clearInterval(timer)
  }, [waiting])

  const act = async (fn: () => Promise<NotifyState>) => {
    setError('')
    try {
      setState(await fn())
    } catch (e) {
      setError(t(e instanceof ApiError ? e.key : 'err.internal'))
    }
  }

  if (!state) return null
  return (
    <div className={n.page}>
      <h1 className={n.title}>{t('notify.title')}</h1>
      <TelegramCard state={state} owner={owner} act={act} />
      <RulesCard rules={state.rules} owner={owner} act={act} />
      <WatchSection telegram={state.telegram.connected} />
      {error && <p className={s.warn} role="alert">{error}</p>}
    </div>
  )
}

function TelegramCard({ state, owner, act }: { state: NotifyState; owner: boolean; act: (fn: () => Promise<NotifyState>) => Promise<void> }) {
  const { t } = useTranslation()
  const [token, setToken] = useState('')
  const tg = state.telegram
  return (
    <section className={s.card}>
      <div className={n.head}>
        <h2>Telegram</h2>
        <StateBadge state={tg.connected ? 'ok' : tg.waiting ? 'warn' : 'unknown'}>
          {tg.connected ? t('notify.tg.on') : tg.waiting ? t('notify.tg.waiting') : t('notify.tg.off')}
        </StateBadge>
      </div>

      {tg.connected ? (
        <>
          <p className={n.text}>{t('notify.tg.where', { chat: tg.chatName, bot: tg.bot })}</p>
          {tg.lastSent ? <p className={s.muted}>{t('notify.tg.lastSent', { ago: ago(t, tg.lastSent / 1000) })}</p> : null}
          {owner && (
            <div className={n.actions}>
              <Button size="sm" onClick={() => void act(api.testTelegram)}>{t('notify.tg.test')}</Button>
              <Button size="sm" variant="ghost" onClick={() => void act(api.disconnectTelegram)}>{t('notify.tg.disconnect')}</Button>
            </div>
          )}
        </>
      ) : tg.waiting ? (
        <>
          <p className={n.text}>
            {t('notify.tg.start', { bot: tg.bot })}{' '}
            <a href={`https://t.me/${tg.bot}`} target="_blank" rel="noreferrer">t.me/{tg.bot}</a>
          </p>
          <p className={s.muted}>{t('notify.tg.startHint')}</p>
        </>
      ) : (
        <>
          <ol className={n.steps}>
            <li>{t('notify.tg.step1')}</li>
            <li>{t('notify.tg.step2')}</li>
            <li>{t('notify.tg.step3')}</li>
          </ol>
          {owner ? (
            <form
              className={n.connect}
              onSubmit={(e) => {
                e.preventDefault()
                void act(() => api.connectTelegram(token)).then(() => setToken(''))
              }}
            >
              <input
                className={`${s.input} mono`}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AA…"
                autoComplete="off"
                spellCheck={false}
                aria-label={t('notify.tg.token')}
              />
              <Button type="submit" variant="primary" disabled={!token.trim()}>{t('notify.tg.connect')}</Button>
            </form>
          ) : (
            <p className={s.muted}>{t('notify.ownerOnly')}</p>
          )}
          <p className={s.muted}>{t('notify.tg.tokenSafe')}</p>
        </>
      )}
      {tg.lastError && <p className={s.warn}>{t('notify.tg.error', { error: tg.lastError })}</p>}
    </section>
  )
}

function RulesCard({ rules, owner, act }: { rules: NotifyRules; owner: boolean; act: (fn: () => Promise<NotifyState>) => Promise<void> }) {
  const { t } = useTranslation()
  const save = (patch: Partial<NotifyRules>) => void act(() => api.saveNotifyRules({ ...rules, ...patch }))
  return (
    <section className={s.card}>
      <h2>{t('notify.rules')}</h2>
      <p className={s.muted}>{t('notify.rules.lead')}</p>
      <label className={s.check}>
        <input type="checkbox" checked={rules.warn} disabled={!owner} onChange={(e) => save({ warn: e.target.checked })} />
        <span>
          {t('notify.rules.warn')}
          <small>{t('notify.rules.warn.hint')}</small>
        </span>
      </label>
      <label className={s.check}>
        <input type="checkbox" checked={rules.resolved} disabled={!owner} onChange={(e) => save({ resolved: e.target.checked })} />
        <span>
          {t('notify.rules.resolved')}
          <small>{t('notify.rules.resolved.hint')}</small>
        </span>
      </label>
      <div className={n.quiet}>
        <label className={s.check}>
          <input type="checkbox" checked={rules.quiet} disabled={!owner} onChange={(e) => save({ quiet: e.target.checked })} />
          <span>
            {t('notify.rules.quiet')}
            <small>{t('notify.rules.quiet.hint')}</small>
          </span>
        </label>
        <span className={n.times}>
          <input type="time" className={s.input} value={rules.quietFrom} disabled={!owner || !rules.quiet} aria-label={t('notify.rules.from')} onChange={(e) => e.target.value && save({ quietFrom: e.target.value })} />
          <span>—</span>
          <input type="time" className={s.input} value={rules.quietTo} disabled={!owner || !rules.quiet} aria-label={t('notify.rules.to')} onChange={(e) => e.target.value && save({ quietTo: e.target.value })} />
        </span>
      </div>
      <label className={n.lang}>
        <span>{t('notify.rules.lang')}</span>
        <select className={s.input} value={rules.lang} disabled={!owner} onChange={(e) => save({ lang: e.target.value as NotifyRules['lang'] })}>
          <option value="ru">{t('lang.name.ru')}</option>
          <option value="en">{t('lang.name.en')}</option>
        </select>
      </label>
    </section>
  )
}
