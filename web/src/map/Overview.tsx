import { MiniMap, useReactFlow, type MiniMapNodeProps } from '@xyflow/react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../state/app'
import { findContainer, liveState, useLive } from '../state/live'
import { usePrefs } from '../state/prefs'
import s from './Overview.module.css'

// Colours of the map itself: places by their tone, nodes by their state (the same meaning as on the cards).
const TONE: Record<string, string> = { green: '60, 207, 142', blue: '106, 174, 255', violet: '169, 139, 240', amber: '242, 181, 68', gray: '160, 170, 180' }
const STATE: Record<string, string> = { ok: '#3ccf8e', warn: '#f2b544', crit: '#ff5f57', unknown: '#7a838f', planned: '#4a525c' }

/** One shape on the minimap: a place is a tinted area with its name, a node a dot coloured by its state. */
function Shape({ id, x, y, width, height }: MiniMapNodeProps) {
  const place = useApp((st) => (id.startsWith('place:') ? st.map.places.find((p) => `place:${p.id}` === id) : undefined))
  const node = useApp((st) => st.map.nodes.find((n) => n.id === id))
  const selected = useApp((st) => st.selection?.id === id || (place && st.selection?.id === place.id))
  const agent = useLive((st) => st.agents[id])
  // Names fit only when the minimap is big enough to read them.
  const named = usePrefs((p) => p.minimapWidth >= 300)
  const parentSnap = useLive((st) => (node?.parentId ? st.snaps[node.parentId] : undefined))
  if (place) {
    const tone = TONE[place.tone] ?? TONE.gray
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={14} fill={`rgba(${tone}, 0.12)`} stroke={`rgba(${tone}, ${selected ? 0.9 : 0.35})`} strokeWidth={selected ? 6 : 3} />
        <text x={x + 18} y={y + 46} className={s.label} fill={`rgba(${tone}, 0.9)`}>{place.name}</text>
      </g>
    )
  }
  const state = node ? liveState(node, agent, findContainer(node, parentSnap)) : 'unknown'
  const name = node && named ? (node.name.length > 14 ? node.name.slice(0, 13) + '…' : node.name) : ''
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={10}
        fill={STATE[state] ?? STATE.unknown}
        fillOpacity={selected ? 1 : 0.75}
        stroke={selected ? '#f3eedf' : 'none'}
        strokeWidth={8}
      />
      {name && <text x={x + 12} y={y + height / 2 + 10} className={s.nodeLabel}>{name}</text>}
    </g>
  )
}

const MIN = 160
const MAX = 420

/**
 * The overview in the bottom-right corner. Click a node on it to go there; drag the corner handle to
 * make it bigger or smaller (kept between 160 and 420 px, size remembered on this device).
 */
export function Overview({ offset }: { offset: number }) {
  const { t } = useTranslation()
  const width = usePrefs((p) => p.minimapWidth)
  const setPrefs = usePrefs((p) => p.set)
  const flow = useReactFlow()
  const select = useApp((st) => st.select)
  const drag = useRef<{ x: number; w: number } | null>(null)
  const height = Math.round(width * 0.66)

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: width }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    // The handle is on the left edge: moving left makes it wider.
    const w = Math.min(MAX, Math.max(MIN, drag.current.w + (drag.current.x - e.clientX)))
    setPrefs({ minimapWidth: Math.round(w) })
  }
  const onPointerUp = () => (drag.current = null)

  return (
    <>
      <MiniMap
        className={s.minimap}
        position="bottom-right"
        style={{ width, height, right: offset }}
        nodeComponent={Shape}
        maskColor="rgba(13, 15, 18, 0.62)"
        maskStrokeColor="rgba(243, 238, 223, 0.5)"
        maskStrokeWidth={2}
        pannable
        zoomable
        ariaLabel={t('overview.label')}
        onNodeClick={(_, n) => {
          const id = n.id.startsWith('place:') ? n.id.slice(6) : n.id
          select({ kind: n.id.startsWith('place:') ? 'place' : 'node', id })
          void flow.fitView({ nodes: [{ id: n.id }], duration: 300, maxZoom: 1.2, padding: 0.6 })
        }}
      />
      <div
        className={s.handle}
        style={{ right: offset + 15 + width - 7, bottom: 15 + height - 7 }}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('overview.resize')}
        data-tip={t('overview.resize')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => setPrefs({ minimapWidth: 220 })}
      />
    </>
  )
}
