import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Icon, IconButton, Segmented, type IconName } from '../design'
import { setLanguage, type Language } from '../i18n'
import { NODE_META } from '../map/model'
import { matches, reveal } from '../map/NodesPage'
import { useApp } from '../state/app'
import { CoreStatus } from './CoreStatus'
import { go, type Route } from './route'
import s from './Shell.module.css'

const RAIL: { icon: IconName; label: string; route?: Route; stage?: number }[] = [
  { icon: 'map', label: 'rail.map', route: 'map' },
  { icon: 'list', label: 'rail.nodes', route: 'nodes' },
  { icon: 'clock', label: 'rail.journal', stage: 5 },
  { icon: 'key', label: 'rail.vault', stage: 6 },
  { icon: 'bell', label: 'rail.alerts', stage: 3 },
]

function Brand() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <g fill="#3a424c">
        <circle cx="4" cy="4" r="2" /><circle cx="11" cy="4" r="2" /><circle cx="18" cy="4" r="2" />
        <circle cx="4" cy="11" r="2" /><circle cx="18" cy="11" r="2" />
        <circle cx="4" cy="18" r="2" /><circle cx="11" cy="18" r="2" /><circle cx="18" cy="18" r="2" />
      </g>
      <circle cx="11" cy="11" r="7" fill="rgba(243,238,223,0.12)" />
      <circle cx="11" cy="11" r="2.6" fill="#f3eedf" />
    </svg>
  )
}

/** Where you are: the whole map, or a machine (with its place) opened from it. */
function Crumbs({ route }: { route: Route }) {
  const { t } = useTranslation()
  const level = useApp((st) => st.level)
  const map = useApp((st) => st.map)
  const enter = useApp((st) => st.enter)
  const machine = map.nodes.find((n) => n.id === level)
  const place = map.places.find((p) => p.id === machine?.placeId)
  if (route !== 'map') {
    return (
      <nav className={s.crumbs} aria-label="breadcrumbs">
        <span aria-current="page">{t(route === 'nodes' ? 'rail.nodes' : route === 'settings' ? 'rail.settings' : 'rail.design')}</span>
      </nav>
    )
  }
  return (
    <nav className={s.crumbs} aria-label="breadcrumbs">
      {machine ? (
        <>
          <button type="button" className={s.crumb} onClick={() => enter(null)}>{t('app.crumb.root')}</button>
          {place && (
            <>
              <span className={s.sep}>/</span>
              <span className={s.crumbDim}>{place.name}</span>
            </>
          )}
          <span className={s.sep}>/</span>
          <span aria-current="page">{machine.name}</span>
        </>
      ) : (
        <span aria-current="page">{t('app.crumb.root')}</span>
      )}
    </nav>
  )
}

/** Finds nodes by name, address or kind and shows the chosen one on the map. */
function Search() {
  const { t } = useTranslation()
  const nodes = useApp((st) => st.map.nodes)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const found = q.trim() ? nodes.filter((n) => matches(n, q, t(`kind.${n.kind}`))).slice(0, 8) : []
  const pick = (i: number) => {
    const n = found[i]
    if (!n) return
    reveal(n)
    setQ('')
    setOpen(false)
  }
  return (
    <div className={s.searchBox}>
      <input
        className={s.search}
        value={q}
        placeholder={t('app.search')}
        aria-label={t('app.search')}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') pick(0)
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && q.trim() && (
        <ul className={s.results} role="listbox">
          {found.length === 0 && <li className={s.noResults}>{t('app.search.none')}</li>}
          {found.map((n, i) => (
            <li key={n.id}>
              <button type="button" className={s.result} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)}>
                <Icon name={NODE_META[n.kind].icon} />
                <span className={s.resultName}>{n.name}</span>
                <span className={s.resultMeta}>{n.address || t(`kind.${n.kind}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** "Update available" next to the core status; opens Settings. */
function UpdateBadge() {
  const { t } = useTranslation()
  const sys = useApp((st) => st.system)
  if (!sys?.newer || !sys.latest) return null
  return (
    <button type="button" className={s.update} onClick={() => go('settings')} data-tip={t('update.badge.tip')}>
      {t('update.badge', { version: sys.latest.version })}
    </button>
  )
}

function UserMenu() {
  const { t } = useTranslation()
  const user = useApp((st) => st.user)
  const logout = useApp((st) => st.logout)
  if (!user) return null
  return (
    <span className={s.user}>
      <span className={s.userName} data-tip={t(`role.${user.role}`)}>{user.username}</span>
      <Button size="sm" variant="ghost" onClick={() => void logout()}>{t('auth.logout')}</Button>
    </span>
  )
}

/** Top bar, left rail and the main area. Items of later stages are visible but say when they arrive. */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { t, i18n } = useTranslation()
  return (
    <div className={s.app}>
      <header className={s.topbar}>
        <div className={s.brand}>
          <span className={s.mark}><Brand /></span>
          <span className={s.name}>Gridlume</span>
        </div>
        <Crumbs route={route} />
        <Search />
        <span className={s.grow} />
        <UpdateBadge />
        <CoreStatus />
        <Segmented<Language>
          label={t('app.lang')}
          value={i18n.language as Language}
          onChange={(l) => void setLanguage(l)}
          options={[{ value: 'ru', label: 'RU' }, { value: 'en', label: 'EN' }]}
        />
        <UserMenu />
      </header>

      <nav className={s.rail} aria-label="sections">
        {RAIL.map((item) => (
          <IconButton
            key={item.label}
            icon={item.icon}
            label={item.stage ? `${t(item.label)} · ${t('common.soon', { stage: item.stage })}` : t(item.label)}
            aria-pressed={item.route === route}
            // aria-disabled, not disabled: disabled buttons get no hover, so the "coming in stage N" tip would not show.
            aria-disabled={!item.route}
            onClick={() => item.route && go(item.route)}
          />
        ))}
        <span className={s.grow} />
        <IconButton icon="layers" label={t('rail.design')} aria-pressed={route === 'design'} onClick={() => go('design')} />
        <IconButton icon="gear" label={t('rail.settings')} aria-pressed={route === 'settings'} onClick={() => go('settings')} />
      </nav>

      <main className={s.main}>{children}</main>
    </div>
  )
}
