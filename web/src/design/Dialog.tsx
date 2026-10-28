import { useEffect, useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from './Button'
import s from './Dialog.module.css'
import { RiskLabel, type Risk } from './Status'

type Props = {
  title: string
  risk?: Risk
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** Modal dialog: closes on Esc and on a click outside. Dangerous ones show their risk next to the title. */
export function Dialog({ title, risk, onClose, children, footer }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={s.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={s.head}>
          {risk && <RiskLabel risk={risk} />}
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="x" label={t('common.close')} onClick={onClose} />
        </div>
        <div className={s.body}>{children}</div>
        {footer && <div className={s.foot}>{footer}</div>}
      </div>
    </div>
  )
}
