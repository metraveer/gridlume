import s from './Segmented.module.css'

type Option<T extends string> = { value: T; label: string; tip?: string }

/** A small switch between a few options, e.g. RU / EN. */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className={s.segmented} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} data-tip={o.tip} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
