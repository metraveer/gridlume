import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { Change, MapNode } from '../api/types'
import { Button, Section } from '../design'
import { useLive } from '../state/live'
import { ago } from './format'
import s from './Inspector.module.css'

/** One change in words; the same keys the core uses for Telegram. */
export function changeText(t: (k: string, o?: Record<string, unknown>) => string, c: Change) {
  return t(`chg.${c.kind}`, { count: c.count, ...c.params })
}

/** What changed on this node (a machine: also inside it), newest first. Refetched when the core says so. */
export function ChangesSection({ node }: { node: MapNode }) {
  const { t } = useTranslation()
  const machine = node.parentId ?? node.id
  const tick = useLive((st) => st.changed[machine] ?? 0)
  const [limit, setLimit] = useState(5)
  const [list, setList] = useState<Change[] | null>(null)
  useEffect(() => {
    let alive = true
    api
      .changes(node.id, limit + 1)
      .then((x) => alive && setList(x))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [node.id, limit, tick])

  if (!list) return null
  return (
    <Section title={t('chg.title')} help={t('chg.help')}>
      {list.length === 0 && <p className={s.muted}>{t('chg.none')}</p>}
      <ul className={s.changes}>
        {list.slice(0, limit).map((c) => (
          <li key={c.id}>
            <span>{changeText(t, c)}</span>
            <time className={s.muted} dateTime={new Date(c.at).toISOString()}>{ago(t, c.at / 1000)}</time>
          </li>
        ))}
      </ul>
      {list.length > limit && (
        <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 20)}>{t('chg.more')}</Button>
      )}
    </Section>
  )
}
