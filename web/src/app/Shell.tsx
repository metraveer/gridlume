import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, Menu, type IconName } from '../design'
import { NODE_META } from '../map/model'
import { matches, reveal } from '../map/NodesPage'
import { is, plain, typingIn } from '../hotkeys'
import { useApp } from '../state/app'
import { usePrefs } from '../state/prefs'
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

/** Finds nodes by name, address or kind and shows the chosen one on the map. "/" focuses it. */
function Search() {
  const { t } = useTranslation()
  const nodes = useApp((st) => st.map.nodes)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
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
      <Icon name="search" />
      <input
        id="global-search"
        className={s.search}
        value={q}
        placeholder={t('app.search')}
        aria-label={t('app.search')}
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (is(e, 'confirm')) pick(active)
          if (is(e, 'cancel')) (e.target as HTMLInputElement).blur()
          if (is(e, 'down')) setActive((a) => Math.min(a + 1, found.length - 1))
          if (is(e, 'up')) setActive((a) => Math.max(a - 1, 0))
        }}
      />
      <kbd className={s.key} data-tip={t('app.search.key')}>/</kbd>
      {open && q.trim() && (
        <ul className={s.results} role="listbox">
          {found.length === 0 && <li className={s.noResults}>{t('app.search.none')}</li>}
          {found.map((n, i) => (
            <li key={n.id}>
              <button type="button" className={s.result} aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(i)}>
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

/** Avatar with the name; opens a menu with Settings and Sign out. */
function UserMenu() {
  const { t } = useTranslation()
  const user = useApp((st) => st.user)
  const logout = useApp((st) => st.logout)
  const ref = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  if (!user) return null
  const open = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setAt({ x: r.right - 220, y: r.bottom + 6 })
  }
  return (
    <>
      <button ref={ref} type="button" className={s.user} aria-haspopup="menu" aria-expanded={!!at} onClick={() => (at ? setAt(null) : open())}>
        <span className={s.avatar} aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
        <span className={s.userName}>{user.username}</span>
        <Icon name="chevron" />
      </button>
      {at && (
        <Menu
          x={at.x}
          y={at.y}
          label={user.username}
          onClose={() => setAt(null)}
          items={[
            { heading: `${user.username} · ${t(`role.${user.role}`).split(':')[0]}` },
            { label: t('rail.settings'), icon: 'gear', onSelect: () => go('settings') },
            { separator: true },
            { label: t('auth.logout'), icon: 'power', onSelect: () => void logout() },
          ]}
        />
      )}
    </>
  )
}

/** Top bar, left rail and the main area. Items of later stages are visible but say when they arrive. */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { t } = useTranslation()
  // "/" anywhere outside a text field jumps to search, as on GitHub and in many panels (any layout).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!is(e, 'search') || !plain(e) || typingIn(e.target)) return
      e.preventDefault()
      document.getElementById('global-search')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const railOpen = usePrefs((p) => p.railOpen)
  const setPrefs = usePrefs((p) => p.set)
  return (
    // The left menu is 52 px of icons, or 208 px with their names; the choice is remembered on this device.
    <div className={s.app} style={{ ['--rail-w' as string]: railOpen ? '208px' : '52px' }}>
      <header className={s.topbar}>
        <div className={s.left}>
          <span className={s.mark}><Brand /></span>
          <span className={s.name}>Gridlume</span>
          {route !== 'map' && <span className={s.page}>{t(route === 'nodes' ? 'rail.nodes' : 'rail.settings')}</span>}
        </div>
        <Search />
        <div className={s.right}>
          <UpdateBadge />
          <CoreStatus />
          <UserMenu />
        </div>
      </header>

      <nav className={s.rail} aria-label={t('rail.label')} data-open={railOpen}>
        {RAIL.map((item) => {
          const soon = item.stage ? t('common.soon', { stage: item.stage }) : ''
          return (
            <button
              key={item.label}
              type="button"
              className={s.railItem}
              aria-label={soon ? `${t(item.label)} · ${soon}` : t(item.label)}
              // Names are on screen when open; when closed (or for "coming in stage N") the tip says them.
              data-tip={!railOpen || soon ? (soon ? `${t(item.label)} · ${soon}` : t(item.label)) : undefined}
              aria-pressed={item.route === route}
              // aria-disabled, not disabled: disabled buttons get no hover, so the "coming in stage N" tip would not show.
              aria-disabled={!item.route}
              onClick={() => item.route && go(item.route)}
            >
              <Icon name={item.icon} />
              {railOpen && <span className={s.railLabel}>{t(item.label)}</span>}
              {railOpen && item.stage && <span className={s.railSoon}>{t('rail.stage', { stage: item.stage })}</span>}
            </button>
          )
        })}
        <span className={s.grow} />
        <button
          type="button"
          className={`${s.railItem} ${s.railToggle}`}
          aria-expanded={railOpen}
          aria-label={railOpen ? t('rail.collapse') : t('rail.expand')}
          data-tip={railOpen ? undefined : t('rail.expand')}
          onClick={() => setPrefs({ railOpen: !railOpen })}
        >
          <Icon name="chevron" />
          {railOpen && <span className={s.railLabel}>{t('rail.collapse')}</span>}
        </button>
      </nav>

      <main className={s.main}>{children}</main>
    </div>
  )
}
