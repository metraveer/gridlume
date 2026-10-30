import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Change, Problem } from '../api/types'
import { IconButton, Segmented } from '../design'
import { useApp } from '../state/app'
import { useHistory } from '../state/history'
import { useLive } from '../state/live'
import { usePrefs } from '../state/prefs'
import { useProblems } from '../state/problems'
import { changeText } from './ChangesSection'
import s from './Timeline.module.css'

/**
 * The last day under the map: problems as red and amber spans, changes as marks. A click looks at the map
 * as it was then; the right edge is now.
 */
export function Timeline() {
  const { t, i18n } = useTranslation()
  const { from, to, hours: range, setHours, problems, changes, loaded, load } = useHistory()
  // It ends before the minimap, which sits in the same corner.
  const minimap = usePrefs((p) => (p.minimap ? p.minimapWidth + 24 : 12))
  const past = useApp((st) => st.past)
  const setPast = useApp((st) => st.setPast)
  const setTimeline = useApp((st) => st.setTimeline)
  const map = useApp((st) => st.map)
  const openNow = useProblems((st) => st.open.length)
  const changed = useLive((st) => st.changed)
  const track = useRef<HTMLDivElement>(null)

  // Fresh on open, every minute, and whenever problems or changes move (unless looking at the past).
  useEffect(() => {
    if (past !== null) return
    void load().catch(() => undefined)
    const timer = window.setInterval(() => void load().catch(() => undefined), 60_000)
    return () => window.clearInterval(timer)
  }, [load, past, openNow, changed])

  if (!loaded || to <= from) return null
  const span = to - from
  const x = (ms: number) => `${Math.min(100, Math.max(0, ((ms - from) / span) * 100))}%`
  const name = (id?: string) => map.nodes.find((n) => n.id === id)?.name ?? ''
  const time = (ms: number) => new Date(ms).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
  const problemTip = (p: Problem) => `${time(p.since)}–${p.ended ? time(p.ended) : t('hist.now')} · ${t(`prob.${p.kind}`, { ...p.params, node: name(p.nodeId), from: '…', to: '…' })}`
  const changeTip = (c: Change) => `${time(c.at)} · ${name(c.nodeId)}: ${changeText(t, c)}`
  const hours = Array.from({ length: 9 }, (_, i) => from + (span * i) / 8)
  const lanes = { crit: problems.filter((p) => p.severity === 'crit'), warn: problems.filter((p) => p.severity !== 'crit') }

  const pick = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r) return
    const at = from + ((clientX - r.left) / r.width) * span
    // The last minute is "now": back to the live map.
    setPast(at >= to - 60_000 ? null : Math.round(at))
  }

  return (
    <div className={s.timeline} style={{ right: minimap }} role="region" aria-label={t('hist.title')}>
      <div className={s.head}>
        <Segmented
          label={t('hist.range')}
          value={String(range)}
          onChange={(v) => setHours(Number(v))}
          options={[1, 6, 24].map((h) => ({ value: String(h), label: t('hist.hours', { count: h }) }))}
        />
        <span className={s.legend}>
          <i className={s.crit} /> {t('hist.crit')} <i className={s.warn} /> {t('hist.warn')} <i className={s.change} /> {t('hist.change')}
        </span>
        <IconButton icon="x" label={t('common.close')} onClick={() => setTimeline(false)} />
      </div>
      <div ref={track} className={s.track} onClick={(e) => pick(e.clientX)} data-tip={t('hist.tip')}>
        {(['crit', 'warn'] as const).map((sev, lane) => (
          <div key={sev} className={s.lane} style={{ top: 4 + lane * 12 }}>
            {lanes[sev].map((p) => (
              <span
                key={p.id}
                className={`${s.span} ${s[sev]}`}
                style={{ left: x(p.since), width: `calc(${x(p.ended ?? to)} - ${x(p.since)})` }}
                data-tip={problemTip(p)}
              />
            ))}
          </div>
        ))}
        <div className={s.lane} style={{ top: 30 }}>
          {changes.map((c) => <span key={c.id} className={s.mark} style={{ left: x(c.at) }} data-tip={changeTip(c)} />)}
        </div>
        {past !== null && <span className={s.cursor} style={{ left: x(past) }} />}
      </div>
      <div className={s.hours}>
        {hours.map((h, i) => (
          <span key={h} style={{ left: x(h) }}>{i === hours.length - 1 ? t('hist.now') : time(h)}</span>
        ))}
      </div>
    </div>
  )
}
