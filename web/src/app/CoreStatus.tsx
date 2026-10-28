import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dot, StateBadge } from '../design'

type Info = { state: 'checking' } | { state: 'ok'; version: string } | { state: 'down' }

/**
 * Whether the interface can reach the core; checks every 15 seconds. While all is well it is a quiet dot
 * (details on hover); only a lost connection takes room in the top bar.
 */
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

  if (info.state === 'down') return <StateBadge state="crit">{t('core.down')}</StateBadge>
  const label = info.state === 'ok' ? t('core.ok', { version: info.version }) : t('core.checking')
  return (
    <span role="status" aria-label={label} data-tip={label} style={{ display: 'inline-flex', padding: 6 }}>
      <Dot state={info.state === 'ok' ? 'ok' : 'unknown'} />
    </span>
  )
}
