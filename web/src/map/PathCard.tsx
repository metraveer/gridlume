import { useTranslation } from 'react-i18next'
import { Button, IconButton } from '../design'
import { useApp } from '../state/app'
import { useLive } from '../state/live'
import { reveal } from './NodesPage'
import { useRequestPath } from './path'
import { linkPing } from './traffic'
import s from './MapPage.module.css'

/**
 * The request path, step by step: what each step is, how long it takes where Gridlume knows (the agents'
 * pings over network links, the core's checks of nodes), and which step is the slowest, with what usually
 * slows such a step.
 */
export function PathCard() {
  const { t } = useTranslation()
  const p = useRequestPath()
  const map = useApp((st) => st.map)
  const level = useApp((st) => st.level)
  const showPath = useApp((st) => st.showPath)
  const snaps = useLive((st) => st.snaps)
  const checks = useLive((st) => st.checks)
  if (!p) return null
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const links = new Map(map.links.map((l) => [l.id, l]))

  const rows = p.steps.map((st) => {
    const node = byId.get(st.nodeId)
    const link = st.linkId ? links.get(st.linkId) : undefined
    let ms: number | null = null
    if (link) {
      const ping = linkPing(link, snaps[link.fromId], snaps[link.toId])
      if (ping && !ping.error && ping.sent > 0 && ping.loss < 100) ms = ping.rtt
    }
    const check = checks[st.nodeId]
    if (ms === null && check?.at && check.ok && check.rtt) ms = check.rtt
    const how = link ? link.proto.split(' ')[0] || t(`link.${link.kind}`) : st.nodeId === p.steps[0]?.nodeId ? t('path.start') : t('path.inside')
    return { st, node, link, ms, how, away: node?.parentId !== level }
  })
  const known = rows.filter((r) => r.ms !== null)
  const total = known.reduce((a, r) => a + (r.ms ?? 0), 0)
  const slowest = known.length > 1 ? known.reduce((a, r) => ((r.ms ?? 0) > (a.ms ?? 0) ? r : a)) : null
  const why = (r: (typeof rows)[number]) =>
    r.node?.kind === 'database' ? t('path.why.db') : r.link && LINKISH.has(r.link.kind) ? t('path.why.net') : t('path.why.app')

  return (
    <div className={s.pathCard} role="region" aria-label={t('path.title', { name: byId.get(p.target)?.name ?? '' })}>
      <div className={s.pathHead}>
        <b>{t('path.title', { name: byId.get(p.target)?.name ?? '' })}</b>
        {known.length > 0 && <span className="mono">{t('path.total', { ms: fmt(total) })}</span>}
        <IconButton icon="x" label={t('common.close')} onClick={() => showPath(null)} />
      </div>
      <ol className={s.pathSteps}>
        {rows.map((r, i) => (
          <li key={r.st.nodeId} className={r === slowest ? s.pathSlow : r.away ? s.pathAway : undefined}>
            <button type="button" onClick={() => r.node && reveal(r.node)}>
              <span className={s.pathN}>{i + 1}</span>
              <span className={s.pathWhat}>
                {r.node?.name ?? '—'}
                <small>{r.how}</small>
              </span>
              <span className="mono">{r.ms !== null ? `+${fmt(r.ms)} ${t('path.ms')}` : ''}</span>
            </button>
          </li>
        ))}
      </ol>
      {slowest && <p className={s.pathHint}>{t('path.slowest', { name: slowest.node?.name ?? '', ms: fmt(slowest.ms ?? 0) })} {why(slowest)}</p>}
      {known.length === 0 && <p className={s.pathHint}>{t('path.noTimes')}</p>}
      {rows.length === 1 && (
        <p className={s.pathHint}>
          {t('path.alone')}{' '}
          <Button size="sm" variant="ghost" onClick={() => showPath(null)}>{t('impact.hide')}</Button>
        </p>
      )}
    </div>
  )
}

const LINKISH = new Set(['uplink', 'lan', 'wifi', 'vpn'])

function fmt(ms: number) {
  return ms >= 10 ? Math.round(ms) : +ms.toFixed(1)
}
