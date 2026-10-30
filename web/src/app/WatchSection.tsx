import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import type { WatchState } from '../api/types'
import { Button, StateBadge } from '../design'
import { ago } from '../map/format'
import { useApp } from '../state/app'
import { useLive } from '../state/live'
import s from './SettingsPage.module.css'
import n from './NotificationsPage.module.css'

const AFTER = [2, 3, 5, 10, 15, 30]

/**
 * Watch: who raises the alarm when the core itself goes down. Two ways, each on its own: agents on
 * chosen machines, or a second Gridlume on duty. Both off unless the owner turns them on.
 */
export function WatchSection({ telegram }: { telegram: boolean }) {
  const { t } = useTranslation()
  const owner = useApp((st) => st.user?.role === 'owner')
  const [state, setState] = useState<WatchState | null>(null)
  const [code, setCode] = useState('') // shown once, right after it is made
  const [error, setError] = useState('')
  useEffect(() => {
    void api.watch().then(setState).catch(() => undefined)
    const timer = window.setInterval(() => void api.watch().then(setState).catch(() => undefined), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  const act = async (fn: () => Promise<WatchState>) => {
    setError('')
    try {
      const next = await fn()
      setState(next)
      return next
    } catch (e) {
      setError(t(e instanceof ApiError ? e.key : 'err.internal'))
      return null
    }
  }

  if (!state) return null
  return (
    <section className={s.card}>
      <h2>{t('watch.title')}</h2>
      <p className={s.muted}>{t('watch.lead')}</p>
      <AgentsPart state={state} owner={owner} telegram={telegram} act={act} />
      <DutyPart state={state} owner={owner} code={code} setCode={setCode} act={act} />
      {error && <p className={s.warn} role="alert">{error}</p>}
    </section>
  )
}

type Act = (fn: () => Promise<WatchState>) => Promise<WatchState | null>

function AgentsPart({ state, owner, telegram, act }: { state: WatchState; owner: boolean; telegram: boolean; act: Act }) {
  const { t } = useTranslation()
  const agents = useLive((st) => st.agents)
  const nodes = useApp((st) => st.map.nodes)
  const coreNode = useApp((st) => st.system?.coreNode)
  const chosen = state.agents.agents
  const list = Object.values(agents)
  const save = (ids: string[], after = state.agents.after) => void act(() => api.saveWatchAgents(ids, after))
  return (
    <div className={n.part}>
      <h3 className={n.partTitle}>{t('watch.agents')}</h3>
      <p className={s.muted}>{t('watch.agents.lead')}</p>
      {!telegram ? (
        <p className={s.muted}>{t('watch.agents.needTelegram')}</p>
      ) : list.length === 0 ? (
        <p className={s.muted}>{t('watch.agents.none')}</p>
      ) : (
        <>
          {list.map((a) => (
            <label key={a.id} className={s.check}>
              <input
                type="checkbox"
                checked={chosen.includes(a.id)}
                disabled={!owner}
                onChange={(e) => save(e.target.checked ? [...chosen, a.id] : chosen.filter((x) => x !== a.id))}
              />
              <span>
                {nodes.find((x) => x.id === a.nodeId)?.name ?? a.hostname}
                {a.nodeId === coreNode && <small>{t('watch.agents.core')}</small>}
              </span>
            </label>
          ))}
          <label className={n.lang}>
            <span>{t('watch.after')}</span>
            <select className={s.input} value={state.agents.after} disabled={!owner} onChange={(e) => save(chosen, Number(e.target.value))}>
              {AFTER.map((m) => <option key={m} value={m}>{t('watch.after.min', { count: m })}</option>)}
            </select>
          </label>
          {chosen.length > 0 && <p className={s.muted}>{t('watch.agents.token')}</p>}
        </>
      )}
    </div>
  )
}

function DutyPart({ state, owner, code, setCode, act }: { state: WatchState; owner: boolean; code: string; setCode: (c: string) => void; act: Act }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [given, setGiven] = useState('')
  const d = state.duty
  const w = d.watching
  return (
    <div className={n.part}>
      <h3 className={n.partTitle}>{t('watch.duty')}</h3>
      <p className={s.muted}>{t('watch.duty.lead')}</p>

      <h4 className={n.subTitle}>{t('watch.duty.thisMain')}</h4>
      {code ? (
        <div className={n.code}>
          <p className={s.muted}>{t('watch.duty.code')}</p>
          <code className="mono">{window.location.origin}</code>
          <code className="mono">{code}</code>
        </div>
      ) : d.paired ? (
        <p className={n.text}>
          <StateBadge state={d.dutySeen ? 'ok' : 'unknown'}>
            {d.dutySeen ? t('watch.duty.seen', { name: d.dutyName, ago: ago(t, d.dutySeen) }) : t('watch.duty.waitingFirst')}
          </StateBadge>
        </p>
      ) : null}
      {owner && (
        <div className={n.actions}>
          <Button size="sm" onClick={() => void act(api.makeDutyCode).then((r) => r?.code && setCode(r.code))}>{t('watch.duty.makeCode')}</Button>
          {d.paired && (
            <Button size="sm" variant="ghost" onClick={() => void act(api.dropDutyCode).then(() => setCode(''))}>{t('watch.duty.revoke')}</Button>
          )}
        </div>
      )}

      <h4 className={n.subTitle}>{t('watch.duty.thisDuty')}</h4>
      {w ? (
        <>
          <p className={n.text}>{t('watch.duty.watching', { name: w.name || w.url, url: w.url })}</p>
          <StateBadge state={w.ok ? 'ok' : w.at ? 'crit' : 'unknown'}>
            {w.ok ? t('watch.duty.answers', { ago: w.at ? ago(t, w.at / 1000) : t('time.justNow') }) : t('watch.duty.silent', { error: w.error ?? '' })}
          </StateBadge>
          {owner && (
            <div className={n.actions}>
              <Button size="sm" variant="ghost" onClick={() => void act(api.dropWatchTarget)}>{t('watch.duty.stop')}</Button>
            </div>
          )}
        </>
      ) : owner ? (
        <form
          className={n.duty}
          onSubmit={(e) => {
            e.preventDefault()
            void act(() => api.setWatchTarget(url, given)).then((r) => r && (setUrl(''), setGiven('')))
          }}
        >
          <input className={`${s.input} mono`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://100.64.0.5:7420" aria-label={t('watch.duty.url')} />
          <input className={`${s.input} mono`} value={given} onChange={(e) => setGiven(e.target.value)} placeholder={t('watch.duty.codeField')} aria-label={t('watch.duty.codeField')} autoComplete="off" spellCheck={false} />
          <Button type="submit" size="sm" disabled={!url.trim() || !given.trim()}>{t('watch.duty.target')}</Button>
        </form>
      ) : null}
    </div>
  )
}
