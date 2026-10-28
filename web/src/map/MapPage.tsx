import { useTranslation } from 'react-i18next'
import { Button, IconButton } from '../design'
import { useApp } from '../state/app'
import { EditDialogs } from './EditDialogs'
import { Inspector } from './Inspector'
import { MapView } from './MapView'
import s from './MapPage.module.css'

/** Add buttons over the canvas. Places exist only on the top level. */
function Toolbar() {
  const { t } = useTranslation()
  const level = useApp((st) => st.level)
  const empty = useApp((st) => st.map.nodes.length === 0 && st.map.places.length === 0)
  const viewer = useApp((st) => st.user?.role === 'viewer')
  const { edit, enter } = useApp.getState()
  if (empty) return null // the empty state has its own buttons
  return (
    <div className={s.toolbar}>
      {level !== null && <IconButton icon="chevron" className={s.back} label={t('map.back')} onClick={() => enter(null)} />}
      {!viewer && (
        <>
          {level === null && <Button size="sm" icon="plus" tip={t('add.place.tip')} onClick={() => edit({ kind: 'place', place: {} })}>{t('add.place')}</Button>}
          <Button size="sm" icon="plus" tip={t('add.node.tip')} onClick={() => edit({ kind: 'node', node: {} })}>{t('add.node')}</Button>
          <Button size="sm" icon="link" tip={t('add.link.tip')} onClick={() => edit({ kind: 'link', link: {} })}>{t('add.link')}</Button>
          {level === null && <Button size="sm" icon="server" tip={t('add.agent.tip')} onClick={() => edit({ kind: 'agent' })}>{t('add.agent')}</Button>}
        </>
      )}
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

export function MapPage() {
  return (
    <>
      <MapView />
      <Toolbar />
      <Inspector />
      <EditDialogs />
    </>
  )
}
