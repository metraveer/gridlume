import { Icon, type IconName } from './Icon'
import s from './NodeCard.module.css'
import { Dot, type State } from './Status'

type Props = {
  icon: IconName
  name: string
  sub?: string
  state: State
  small?: boolean
  selected?: boolean
  onClick?: () => void
}

/** A node as it appears on the map: icon, name, one line of context, state dot in the corner. */
export function NodeCard({ icon, name, sub, state, small, selected, onClick }: Props) {
  const cls = [s.node, small && s.small, selected && s.selected, state === 'planned' && s.planned].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={selected}>
      <span className={s.glyph}>
        <Icon name={icon} />
      </span>
      <span className={s.label}>
        <span className={s.name}>{name}</span>
        {sub && <span className={s.sub}>{sub}</span>}
      </span>
      <span className={s.state}>
        <Dot state={state} />
      </span>
    </button>
  )
}
