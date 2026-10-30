import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { Problem } from '../api/types'
import { Button, Dot, Icon, Segmented } from '../design'
import { is } from '../hotkeys'
import { ago } from '../map/format'
import { changeText } from '../map/ChangesSection'
import { reveal } from '../map/NodesPage'
import { useApp } from '../state/app'
import { useProblems } from '../state/problems'
import { go } from './route'
import s from './Problems.module.css'

/** The text of a problem, with the names of its node or link as they are on the map now. */
export function useProblemText() {
  const { t } = useTranslation()
  const map = useApp((st) => st.map)
  const name = (id?: string) => map.nodes.find((n) => n.id === id)?.name ?? t('pr.unknown')
  return (p: Problem) => {
    const link = p.linkId ? map.links.find((l) => l.id === p.linkId) : undefined
    const vars = { ...p.params, node: name(p.nodeId), from: name(link?.fromId), to: name(link?.toId) } as Record<string, unknown>
    if (typeof p.params.lastSeen === 'number') vars.ago = ago(t, p.params.lastSeen)
    return { title: t(`prob.${p.kind}`, vars), what: t(`prob.${p.kind}.what`, vars) }
  }
}

/** Top bar: "All good" or "Problems: N", opening the list of what is wrong. */
export function ProblemsPill() {
  const { t } = useTranslation()
  const open = useProblems((st) => st.open)
  const loaded = useProblems((st) => st.loaded)
  const ref = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ right: number; top: number } | null>(null)
  if (!loaded) return null
  const crit = open.some((p) => p.severity === 'crit')
  const tone = crit ? 'crit' : open.length ? 'warn' : 'ok'
  const toggle = () => {
    if (at) return setAt(null)
    const r = ref.current?.getBoundingClientRect()
    if (r) setAt({ right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 6 })
  }
  const label = open.length ? t('st.some', { count: open.length }) : t('st.ok')
  return (
    <>
      <button ref={ref} type="button" className={s.pill} data-tone={tone} aria-expanded={!!at} aria-label={label} onClick={toggle}>
        <Dot state={tone} />
        <span className={s.pillText}>{label}</span>
        {open.length > 0 && <span className={s.pillCount}>{open.length}</span>}
      </button>
      {at && <ProblemsPanel at={at} onClose={() => setAt(null)} anchor={ref} />}
    </>
  )
}

function ProblemsPanel({ at, onClose, anchor }: { at: { right: number; top: number }; onClose: () => void; anchor: React.RefObject<HTMLButtonElement | null> }) {
  const { t } = useTranslation()
  const open = useProblems((st) => st.open)
  const ended = useProblems((st) => st.ended)
  const map = useApp((st) => st.map)
  const text = useProblemText()
  const [tab, setTab] = useState<'now' | 'ended'>('now')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !anchor.current?.contains(target)) onClose()
    }
    const key = (e: KeyboardEvent) => is(e, 'cancel') && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [onClose, anchor])

  // Show it where it is: the node (on its level), or the link.
  const show = (p: Problem) => {
    const link = p.linkId ? map.links.find((l) => l.id === p.linkId) : undefined
    const node = map.nodes.find((n) => n.id === (p.nodeId || link?.fromId))
    if (!node) return
    reveal(node)
    if (link) useApp.getState().select({ kind: 'link', id: link.id })
    go('map')
    onClose()
  }

  const list = tab === 'now' ? open : ended
  return createPortal(
    <div ref={ref} className={s.panel} style={{ right: at.right, top: at.top }} role="dialog" aria-label={t('pr.title')}>
      <div className={s.head}>
        <b>{t('pr.title')}</b>
        <Segmented
          label={t('pr.title')}
          value={tab}
          onChange={(v) => setTab(v as 'now' | 'ended')}
          options={[
            { value: 'now', label: t('pr.tab.now', { count: open.length }) },
            { value: 'ended', label: t('pr.tab.ended', { count: ended.length }) },
          ]}
        />
      </div>
      <div className={s.list} data-nofade>
        {list.length === 0 && <p className={s.empty}>{tab === 'now' ? t('pr.empty') : t('pr.emptyEnded')}</p>}
        {list.map((p) => {
          const { title, what } = text(p)
          const when = tab === 'now' ? t('pr.since', { ago: ago(t, p.since / 1000) }) : t('pr.ended', { ago: ago(t, (p.ended ?? 0) / 1000) })
          return (
            <div key={p.id} className={s.item}>
              <Dot state={tab === 'now' ? p.severity : 'ok'} />
              <div className={s.body}>
                <div className={s.title}>{title}</div>
                <div className={s.meta}>{when}</div>
                {tab === 'now' && <p className={s.what}>{what}</p>}
                {tab === 'now' && p.changes && p.changes.length > 0 && (
                  <div className={s.before}>
                    <span>{t('pr.before')}</span>
                    {p.changes.map((c) => (
                      <span key={c.id}>• {changeText(t, c)} · {ago(t, c.at / 1000)}</span>
                    ))}
                  </div>
                )}
                {p.merged && p.merged.length > 0 && (
                  <div className={s.merged} data-tip={t('pr.merged.tip')}>
                    <Icon name="layers" />
                    {t('pr.merged', { count: p.merged.length })}
                  </div>
                )}
              </div>
              {(p.nodeId || p.linkId) && <Button size="sm" onClick={() => show(p)}>{t('pr.show')}</Button>}
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
