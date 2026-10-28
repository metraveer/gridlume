import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button, Dot, StateBadge } from '../design'
import { typingIn } from '../hotkeys'
import s from './CoreStatus.module.css'

type Info = { state: 'checking' } | { state: 'ok'; version: string } | { state: 'down' }

/**
 * Whether the interface can reach the core; checks every 15 seconds. While all is well it is a quiet dot
 * (details on hover); only a lost connection takes room in the top bar. When the core comes back with
 * another version (it was updated), the page still runs the old interface, so it reloads itself - unless
 * that would lose something (an open dialog, a field being typed in, a half-filled form): then a banner
 * says so and the reload waits until it is safe.
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
        else if (body.version !== first.current) {
          if (safeToReload()) page.reload()
          else setUpdatedTo(body.version)
        }
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

  // Waiting for a safe moment: look again whenever focus or a click may have finished the work.
  useEffect(() => {
    if (!updatedTo) return
    const retry = () => window.setTimeout(() => safeToReload() && page.reload(), 300)
    document.addEventListener('focusout', retry)
    document.addEventListener('click', retry)
    return () => {
      document.removeEventListener('focusout', retry)
      document.removeEventListener('click', retry)
    }
  }, [updatedTo])

  const banner =
    updatedTo &&
    createPortal(
      <div className={s.banner} role="status">
        <div>
          <b>{t('update.reloaded.title', { v: updatedTo })}</b>
          <span>{t('update.reloaded.lead')}</span>
        </div>
        <Button variant="primary" size="sm" onClick={() => page.reload()}>{t('update.reloaded.button')}</Button>
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

/** The reload, as an object so tests can watch it (jsdom cannot reload). */
export const page = { reload: () => window.location.reload() }

/** Reloading now would not throw away anything the person is doing. */
function safeToReload(): boolean {
  if (document.querySelector('[role="dialog"]')) return false
  if (typingIn(document.activeElement)) return false
  const filled = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('form input:not([type="hidden"]), form textarea')
  return ![...filled].some((el) => el.value !== '')
}
