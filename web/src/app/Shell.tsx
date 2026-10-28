import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton, Segmented, type IconName } from '../design'
import { setLanguage, type Language } from '../i18n'
import type { Route } from './App'
import { CoreStatus } from './CoreStatus'
import s from './Shell.module.css'

const RAIL: { icon: IconName; label: string; route?: Route; stage?: number }[] = [
  { icon: 'map', label: 'rail.map', route: 'map' },
  { icon: 'list', label: 'rail.nodes', stage: 1 },
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

/** Top bar, left rail and the main area. Items of later stages are visible but say when they arrive. */
export function Shell({ route, onNavigate, children }: { route: Route; onNavigate: (r: Route) => void; children: ReactNode }) {
  const { t, i18n } = useTranslation()
  return (
    <div className={s.app}>
      <header className={s.topbar}>
        <div className={s.brand}>
          <span className={s.mark}><Brand /></span>
          <span className={s.name}>Gridlume</span>
        </div>
        <nav className={s.crumbs} aria-label="breadcrumbs">
          <span aria-current="page">{t('app.crumb.root')}</span>
        </nav>
        <input className={s.search} placeholder={t('app.search')} readOnly aria-disabled data-tip={t('common.soon', { stage: 1 })} />
        <span className={s.grow} />
        <CoreStatus />
        <Segmented<Language>
          label={t('app.lang')}
          value={i18n.language as Language}
          onChange={(l) => void setLanguage(l)}
          options={[{ value: 'ru', label: 'RU' }, { value: 'en', label: 'EN' }]}
        />
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
            onClick={() => item.route && onNavigate(item.route)}
          />
        ))}
        <span className={s.grow} />
        <IconButton icon="layers" label={t('rail.design')} aria-pressed={route === 'design'} onClick={() => onNavigate('design')} />
        <IconButton icon="gear" label={`${t('rail.settings')} · ${t('common.soon', { stage: 1 })}`} aria-disabled />
      </nav>

      <main className={s.main}>{children}</main>
    </div>
  )
}
