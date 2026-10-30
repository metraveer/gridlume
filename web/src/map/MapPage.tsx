import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import type { MapNode } from '../api/types'
import { Button, Icon, IconButton } from '../design'
import { useApp } from '../state/app'
import { EditDialogs } from './EditDialogs'
import { Inspector } from './Inspector'
import { MapView } from './MapView'
import { NODE_META } from './model'
import { useImpact } from './impact'
import s from './MapPage.module.css'

/**
 * Where you are, in the top-left corner of the canvas: the whole map → place → machine → … Each step is a
 * way back; quiet until pointed at, so it does not cover the map.
 */
function Breadcrumbs() {
  const { t } = useTranslation()
  const level = useApp((st) => st.level)
  const map = useApp((st) => st.map)
  const { enter, setFocus } = useApp.getState()
  // From the opened machine up to the top (one level today, any depth later).
  const chain: MapNode[] = []
  for (let n = map.nodes.find((x) => x.id === level); n; n = map.nodes.find((x) => x.id === n?.parentId)) chain.unshift(n)
  const place = map.places.find((p) => p.id === chain[0]?.placeId)

  return (
    <nav className={s.crumbs} aria-label={t('map.path')}>
      <button type="button" className={s.crumb} aria-current={level === null ? 'page' : undefined} onClick={() => enter(null)}>
        <Icon name="map" />
        {t('app.crumb.root')}
      </button>
      {place && (
        <>
          <span className={s.sep}>›</span>
          <button
            type="button"
            className={s.crumb}
            data-tip={t('map.path.place')}
            onClick={() => {
              enter(null)
              setFocus(`place:${place.id}`)
            }}
          >
            {place.name}
          </button>
        </>
      )}
      {chain.map((n, i) => (
        <Fragment key={n.id}>
          <span className={s.sep}>›</span>
          <button type="button" className={s.crumb} aria-current={i === chain.length - 1 ? 'page' : undefined} onClick={() => enter(n.id)}>
            <Icon name={NODE_META[n.kind].icon} />
            {n.name}
          </button>
        </Fragment>
      ))}
    </nav>
  )
}

/** Add buttons and "fit", at the bottom of the canvas. Right click and dragging a link do the same in place. */
function Toolbar() {
  const { t } = useTranslation()
  const level = useApp((st) => st.level)
  const empty = useApp((st) => st.map.nodes.length === 0 && st.map.places.length === 0)
  const viewer = useApp((st) => st.user?.role === 'viewer')
  const { edit, setFocus } = useApp.getState()
  if (empty) return null // the empty state has its own buttons
  return (
    <div className={s.toolbar}>
      {!viewer && (
        <>
          {level === null && <Button size="sm" variant="ghost" icon="plus" tip={t('add.place.tip')} onClick={() => edit({ kind: 'place', place: {} })}>{t('add.place')}</Button>}
          <Button size="sm" variant="ghost" icon="plus" tip={t('add.node.tip')} onClick={() => edit({ kind: 'node', node: {} })}>{t('add.node')}</Button>
          <Button size="sm" variant="ghost" icon="link" tip={t('add.link.tip')} onClick={() => edit({ kind: 'link', link: {} })}>{t('add.link')}</Button>
          {level === null && <Button size="sm" variant="ghost" icon="server" tip={t('add.agent.tip')} onClick={() => edit({ kind: 'agent' })}>{t('add.agent')}</Button>}
          <span className={s.divider} />
        </>
      )}
      <IconButton icon="fit" label={t('map.fit')} onClick={() => setFocus('*')} />
    </div>
  )
}

export function ErrorBanner() {
  const { t } = useTranslation()
  const error = useApp((st) => st.error)
  const clearError = useApp((st) => st.clearError)
  if (!error) return null
  return (
    <div className={s.error} role="alert">
      <span>{t(error)}</span>
      <IconButton icon="x" label={t('common.close')} onClick={clearError} />
    </div>
  )
}

/** While the impact view is on: what stops, how many with it, how many on other levels; Esc or Hide ends it. */
function ImpactBar() {
  const { t } = useTranslation()
  const imp = useImpact()
  const map = useApp((st) => st.map)
  const level = useApp((st) => st.level)
  const showImpact = useApp((st) => st.showImpact)
  if (!imp) return null
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const elsewhere = [...imp.affected].filter((id) => byId.get(id)?.parentId !== level).length
  return (
    <div className={s.impactBar} role="status">
      <span>
        <b>{t('impact.bar', { name: byId.get(imp.src)?.name ?? '', count: imp.affected.size })}</b>
        {elsewhere > 0 && <span className={s.impactElsewhere}>{t('impact.elsewhere', { count: elsewhere })}</span>}
      </span>
      <Button size="sm" variant="ghost" onClick={() => showImpact(null)}>{t('impact.hide')}</Button>
    </div>
  )
}

export function MapPage() {
  return (
    <>
      <MapView />
      <Breadcrumbs />
      <ImpactBar />
      <Toolbar />
      <Inspector />
      <EditDialogs />
    </>
  )
}
