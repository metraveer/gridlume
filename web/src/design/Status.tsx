import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import s from './Status.module.css'

/** Health of a node or link. Colour is reserved for these states only. */
export type State = 'ok' | 'warn' | 'crit' | 'unknown' | 'planned'

/** How dangerous an action is. Every action shows one. */
export type Risk = 'safe' | 'careful' | 'danger'

export function Dot({ state }: { state: State }) {
  return <span className={[s.dot, s[state]].join(' ')} aria-hidden="true" />
}

/** Dot + the state's name, e.g. "● Работает". */
export function StateBadge({ state, children }: { state: State; children?: ReactNode }) {
  const { t } = useTranslation()
  const tone = state === 'unknown' || state === 'planned' ? '' : s[state]
  return (
    <span className={[s.badge, tone].join(' ')}>
      <Dot state={state} />
      {children ?? t(`state.${state}`)}
    </span>
  )
}

export function Badge({ tone, children }: { tone?: 'ok' | 'warn' | 'crit' | 'info'; children: ReactNode }) {
  return <span className={[s.badge, tone && s[tone]].filter(Boolean).join(' ')}>{children}</span>
}

export function RiskLabel({ risk }: { risk: Risk }) {
  const { t } = useTranslation()
  return <span className={[s.risk, s[risk]].join(' ')}>{t(`risk.${risk}`)}</span>
}
