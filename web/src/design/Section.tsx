import type { ReactNode } from 'react'
import s from './Section.module.css'

/** A block in a side panel: small caps title, optional "?" with a long explanation. */
export function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className={s.section}>
      <h3 className={s.title}>
        {title}
        {help && (
          <span className={s.help} data-tip={help} aria-label={help}>
            ?
          </span>
        )}
      </h3>
      {children}
    </section>
  )
}

/** Label / value pairs. */
export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className={s.kv}>
      {rows.map(([k, v]) => (
        <div key={k} className={s.row}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
