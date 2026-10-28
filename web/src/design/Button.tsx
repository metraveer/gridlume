import type { ButtonHTMLAttributes, ReactNode } from 'react'
import s from './Button.module.css'
import { Icon, type IconName } from './Icon'

type Variant = 'default' | 'primary' | 'ghost' | 'danger'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'md' | 'sm'
  icon?: IconName
  /** Long explanation shown on hover (tooltip). Keep the label itself short. */
  tip?: string
  children?: ReactNode
}

export function Button({ variant = 'default', size = 'md', icon, tip, className, children, ...rest }: Props) {
  const cls = [s.btn, variant !== 'default' && s[variant], size === 'sm' && s.sm, className].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} data-tip={tip} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName
  /** Required: icon-only buttons need a name for screen readers; it is also the tooltip. */
  label: string
}

export function IconButton({ icon, label, className, ...rest }: IconButtonProps) {
  return (
    <button type="button" className={[s.icon, className].filter(Boolean).join(' ')} aria-label={label} data-tip={label} {...rest}>
      <Icon name={icon} />
    </button>
  )
}
