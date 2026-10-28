import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StateBadge } from '../design'

type Info = { state: 'checking' } | { state: 'ok'; version: string } | { state: 'down' }

/** Shows whether the interface can reach the core; checks every 15 seconds. */
export function CoreStatus() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<Info>({ state: 'checking' })

  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as { version: string }
        if (alive) setInfo({ state: 'ok', version: body.version })
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

  if (info.state === 'checking') return <StateBadge state="unknown">{t('core.checking')}</StateBadge>
  if (info.state === 'down') return <StateBadge state="crit">{t('core.down')}</StateBadge>
  return <StateBadge state="ok">{t('core.ok', { version: info.version })}</StateBadge>
}
