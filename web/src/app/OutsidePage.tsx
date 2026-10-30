import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { OutsidePort, OutsideState } from '../api/types'
import { Button, StateBadge } from '../design'
import { ago } from '../map/format'
import { reveal } from '../map/NodesPage'
import { useApp } from '../state/app'
import { useLive } from '../state/live'
import { go } from './route'
import s from './SettingsPage.module.css'
import n from './NotificationsPage.module.css'
import o from './OutsidePage.module.css'

/**
 * What is visible from the internet: the duty core, being outside, connects to this installation's
 * public addresses; here are the ports that answered, how risky each is and where on the map it leads.
 */
export function OutsidePage() {
  const { t } = useTranslation()
  const [state, setState] = useState<OutsideState | null>(null)
  const tick = useLive((st) => st.outsideTick)
  useEffect(() => {
    void api.outside().then(setState).catch(() => undefined)
  }, [tick])

  if (!state) return null
  const res = state.result
  const asked = !!res && state.asked > res.at
  return (
    <div className={n.page}>
      <div>
        <h1 className={n.title}>{t('out.title')}</h1>
        <p className={o.lead}>{t('out.lead')}</p>
      </div>

      <section className={s.card}>
        <div className={n.head}>
          <h2>{t('out.check')}</h2>
          {state.duty.paired && res && (
            <Button size="sm" icon="radar" disabled={asked} onClick={() => void api.checkOutside().then(setState)}>
              {asked ? t('out.asked') : t('out.now')}
            </Button>
          )}
        </div>
        {!state.duty.paired ? (
          <>
            <p className={n.text}>{t('out.noDuty')}</p>
            <div className={n.actions}>
              <Button size="sm" onClick={() => go('alerts')}>{t('out.setDuty')}</Button>
            </div>
          </>
        ) : !res ? (
          <p className={n.text}>{t('out.waiting', { name: state.duty.dutyName || '…' })}</p>
        ) : (
          <p className={s.muted}>{t('out.checked', { ago: ago(t, res.at / 1000), name: res.by, min: Math.round(state.every / 60) })}</p>
        )}
      </section>

      {res?.found.map((f) => (
        <section key={f.ip} className={s.card}>
          <div className={n.head}>
            <h2 className={o.host}>
              {f.names.filter((x) => x !== f.ip).join(', ') || f.ip}
              {f.names.some((x) => x !== f.ip) && <span className="mono">{f.ip}</span>}
            </h2>
            <Verdict open={f.open} />
          </div>
          {f.open.length === 0 ? (
            <p className={n.text}>{t('out.nothing', { count: res.ports.length })}</p>
          ) : (
            <ul className={o.ports}>
              {f.open.map((p) => (
                <Port key={p.port} p={p} />
              ))}
            </ul>
          )}
        </section>
      ))}

      {res && res.found.length === 0 && (
        <section className={s.card}>
          <p className={n.text}>{t('out.noAddress')}</p>
        </section>
      )}
      {res?.skip && res.skip.length > 0 && <p className={s.muted}>{t('out.skip', { list: res.skip.join(', ') })}</p>}

      <details className={o.what}>
        <summary>{t('out.what')}</summary>
        <p>{state.target.hosts.length ? t('out.hosts', { list: state.target.hosts.join(', ') }) : t('out.noHosts')}</p>
        <p>{t('out.ports', { list: state.target.ports.join(', ') })}</p>
      </details>
    </div>
  )
}

function Verdict({ open }: { open: OutsidePort[] }) {
  const { t } = useTranslation()
  const worst = open.some((p) => p.risk === 'nopass') ? 'crit' : open.some((p) => p.risk === 'login') ? 'warn' : 'ok'
  return <StateBadge state={worst}>{t(`out.verdict.${worst}`, { count: open.length })}</StateBadge>
}

function Port({ p }: { p: OutsidePort }) {
  const { t } = useTranslation()
  const nodes = useApp((st) => st.map.nodes)
  const leads = p.nodes.map((id) => nodes.find((x) => x.id === id)).filter((x) => !!x)
  return (
    <li className={o.port} data-risk={p.risk || 'public'}>
      <span className={['mono', o.num].join(' ')}>{p.port}</span>
      <div className={o.about}>
        <b>{p.service || t('out.unknown')}</b>
        <span>{t(`out.risk.${p.risk || 'public'}`)}</span>
        {leads.length > 0 ? (
          <span className={o.leads}>
            {t('out.leads')}{' '}
            {leads.map((x) => (
              <button key={x.id} type="button" onClick={() => reveal(x)}>{x.name}</button>
            ))}
          </span>
        ) : (
          <span className={o.unmapped}>{t('out.unmapped')}</span>
        )}
      </div>
    </li>
  )
}
