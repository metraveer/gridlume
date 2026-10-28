import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MapNode } from '../api/types'
import { go } from '../app/route'
import { Icon, StateBadge } from '../design'
import { useApp } from '../state/app'
import { liveState, useLive } from '../state/live'
import { NODE_META } from './model'
import s from './NodesPage.module.css'

/** Matches a node by name, address, subtitle or kind (in the current language). */
export function matches(n: MapNode, q: string, kindName: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [n.name, n.address, n.subtitle, kindName].some((v) => v.toLowerCase().includes(needle))
}

/** Show a node on the map: open the level it lives on and select it. */
export function reveal(n: MapNode) {
  const { enter, select } = useApp.getState()
  enter(n.parentId)
  select({ kind: 'node', id: n.id })
  go('map')
}

/** Every node as a table, for when the map gets big. */
export function NodesPage() {
  const { t } = useTranslation()
  const map = useApp((st) => st.map)
  const agents = useLive((st) => st.agents)
  const [q, setQ] = useState('')
  const name = (id: string | null) => map.nodes.find((n) => n.id === id)?.name
  const place = (id: string | null) => map.places.find((p) => p.id === id)?.name
  const rows = useMemo(
    () => map.nodes.filter((n) => matches(n, q, t(`kind.${n.kind}`))).sort((a, b) => a.name.localeCompare(b.name)),
    [map.nodes, q, t],
  )
  const linkCount = (id: string) => map.links.filter((l) => l.fromId === id || l.toId === id).length

  return (
    <div className={s.page}>
      <div className={s.head}>
        <h1>{t('rail.nodes')}</h1>
        <span className={s.count}>{t('nodes.count', { count: map.nodes.length })}</span>
        <span className={s.grow} />
        <input className={s.filter} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('nodes.filter')} aria-label={t('nodes.filter')} />
      </div>
      {rows.length === 0 ? (
        <p className={s.empty}>{map.nodes.length ? t('nodes.none') : t('map.empty.lead')}</p>
      ) : (
        <table className={s.table}>
          <thead>
            <tr>
              <th>{t('f.name')}</th>
              <th>{t('f.kind')}</th>
              <th>{t('f.address')}</th>
              <th>{t('nodes.where')}</th>
              <th>{t('f.state')}</th>
              <th className={s.num}>{t('nodes.links')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id} onClick={() => reveal(n)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && reveal(n)} data-tip={t('nodes.open.tip')}>
                <td>
                  <span className={s.nameCell}>
                    <Icon name={NODE_META[n.kind].icon} />
                    {n.name}
                  </span>
                </td>
                <td>{t(`kind.${n.kind}`)}</td>
                <td className="mono">{n.address || '—'}</td>
                <td>{n.parentId ? name(n.parentId) : (place(n.placeId) ?? '—')}</td>
                <td><StateBadge state={liveState(n, agents[n.id])} /></td>
                <td className={s.num}>{linkCount(n.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
