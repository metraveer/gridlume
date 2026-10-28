import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button, Dot, StateBadge } from '../design'
import s from './CoreStatus.module.css'

type Info = { state: 'checking' } | { state: 'ok'; version: string } | { state: 'down' }

/**
 * Whether the interface can reach the core; checks every 15 seconds. While all is well it is a quiet dot
 * (details on hover); only a lost connection takes room in the top bar. When the core comes back with
 * another version (it was updated), the page still runs the old interface: a banner offers to reload.
 */
export function CoreStatus() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<Info>({ state: 'checking' })
  const first = useRef<string | null>(null)
  const [updatedTo, setUpdatedTo] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as { version: string }
        if (!alive) return
        setInfo({ state: 'ok', version: body.version })
        if (first.current === null) first.current = body.version
        else if (body.version !== first.current) setUpdatedTo(body.version)
      } catch {
        if (alive) setInfo({ state: 'down' })
      }
    }
    void check()
    const timer = window.setInterval(check, 15000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const banner =
    updatedTo &&
    createPortal(
      <div className={s.banner} role="status">
        <div>
          <b>{t('update.reloaded.title', { v: updatedTo })}</b>
          <span>{t('update.reloaded.lead')}</span>
        </div>
        <Button variant="primary" size="sm" onClick={() => window.location.reload()}>{t('update.reloaded.button')}</Button>
      </div>,
      document.body,
    )

  if (info.state === 'down') return <StateBadge state="crit">{t('core.down')}</StateBadge>
  const label = info.state === 'ok' ? t('core.ok', { version: info.version }) : t('core.checking')
  return (
    <>
      <span role="status" aria-label={label} data-tip={label} className={s.dot}>
        <Dot state={info.state === 'ok' ? 'ok' : 'unknown'} />
      </span>
      {banner}
    </>
  )
}
