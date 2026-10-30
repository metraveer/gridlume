import { Panel, useNodes, useReactFlow, useStore, useViewport, type Node } from '@xyflow/react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../state/app'
import { findContainer, liveState, useLive } from '../state/live'
import { usePrefs } from '../state/prefs'
import s from './Overview.module.css'

// The minimap draws the map the way the canvas does, only smaller: areas as tinted backdrops with their
// name, nodes as dark cards with a state dot (and the name when the minimap is wide enough).
const TONE: Record<string, string> = { green: '60, 207, 142', blue: '106, 174, 255', violet: '169, 139, 240', amber: '242, 181, 68', gray: '255, 255, 255' }
const STATE: Record<string, string> = { ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)', unknown: 'var(--fg-faint)', planned: 'var(--line-strong)' }

type Box = { id: string; x: number; y: number; width: number; height: number }

function Shape({ id, x, y, width, height, named }: Box & { named: boolean }) {
  const place = useApp((st) => (id.startsWith('place:') ? st.map.places.find((p) => `place:${p.id}` === id) : undefined))
  const node = useApp((st) => st.map.nodes.find((n) => n.id === id))
  const selected = useApp((st) => st.selection?.id === id || (place && st.selection?.id === place.id))
  const agent = useLive((st) => st.agents[id])
  const parentSnap = useLive((st) => (node?.parentId ? st.snaps[node.parentId] : undefined))
  const check = useLive((st) => st.checks[id])
  if (place) {
    const tone = TONE[place.tone] ?? TONE.gray
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={14} fill={`rgba(${tone}, 0.06)`} stroke={selected ? 'var(--lume)' : 'var(--line)'} strokeWidth={selected ? 4 : 2} />
        <text x={x + 16} y={y + 30} className={s.label}>{place.name}</text>
      </g>
    )
  }
  if (!node) return null
  const state = liveState(node, agent, findContainer(node, parentSnap), check)
  const name = node.name.length > 16 ? node.name.slice(0, 15) + '…' : node.name
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={10} fill="var(--bg-panel)" stroke={selected ? 'var(--lume)' : 'var(--line-strong)'} strokeWidth={selected ? 4 : 1.5} />
      <circle cx={x + width - 12} cy={y + 12} r={6} fill={STATE[state] ?? STATE.unknown} />
      {named ? (
        <text x={x + 14} y={y + height / 2 + 9} className={s.nodeLabel}>{name}</text>
      ) : (
        <rect x={x + 14} y={y + height / 2 - 4} width={Math.min(width - 50, 90)} height={8} rx={4} fill="var(--fg-faint)" />
      )}
    </g>
  )
}

const MIN = 160
const MAX = 420
const PAD = 30 // map units around the content

function box(n: Node): Box {
  return { id: n.id, x: n.position.x, y: n.position.y, width: n.measured?.width ?? Number(n.style?.width ?? 180), height: n.measured?.height ?? Number(n.style?.height ?? 50) }
}

/**
 * The overview in the bottom-right corner. It frames the map's content only (not the empty screen around
 * it), so cards stay as big as the corner allows; the outline shows what the screen sees. Click or drag on
 * it to move there; drag the corner grip to resize (160–420 px, remembered on this device).
 */
export function Overview({ offset }: { offset: number }) {
  const { t } = useTranslation()
  const width = usePrefs((p) => p.minimapWidth)
  const setPrefs = usePrefs((p) => p.set)
  const flow = useReactFlow()
  const { x: vx, y: vy, zoom } = useViewport()
  const screen = useStore((st) => ({ w: st.width, h: st.height }), (a, b) => a.w === b.w && a.h === b.h)
  const nodes = useNodes()
  const select = useApp((st) => st.select)
  const svg = useRef<SVGSVGElement>(null)
  const resize = useRef<{ x: number; w: number } | null>(null)
  const panning = useRef(false)
  const height = Math.round(width * 0.62)

  const boxes = nodes.filter((n) => n.type !== 'ghost').map(box)
  if (boxes.length === 0) return null
  // Places first so cards draw on top of them.
  boxes.sort((a, b) => Number(b.id.startsWith('place:')) - Number(a.id.startsWith('place:')))
  const minX = Math.min(...boxes.map((b) => b.x)) - PAD
  const minY = Math.min(...boxes.map((b) => b.y)) - PAD
  const maxX = Math.max(...boxes.map((b) => b.x + b.width)) + PAD
  const maxY = Math.max(...boxes.map((b) => b.y + b.height)) + PAD
  const view = { x: -vx / zoom, y: -vy / zoom, w: screen.w / zoom, h: screen.h / zoom }
  // Names fit when one map unit is big enough on screen.
  const scale = Math.min(width / (maxX - minX), height / (maxY - minY))
  const named = scale * 26 >= 8

  /** The map point under the pointer. */
  const toMap = (e: React.PointerEvent) => {
    const m = svg.current?.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }
  const moveTo = (e: React.PointerEvent, duration: number) => {
    const p = toMap(e)
    if (p) void flow.setCenter(p.x, p.y, { zoom, duration })
  }

  return (
    <Panel position="bottom-right" className={s.panel} style={{ right: offset }}>
      <svg
        ref={svg}
        className={s.minimap}
        width={width}
        height={height}
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        role="img"
        aria-label={t('overview.label')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          panning.current = true
          moveTo(e, 200)
        }}
        onPointerMove={(e) => panning.current && moveTo(e, 0)}
        onPointerUp={() => (panning.current = false)}
        onDoubleClick={(e) => {
          // A node under a double click: select it and frame it.
          const p = toMap(e as unknown as React.PointerEvent)
          const hit = p && [...boxes].reverse().find((b) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height)
          if (!hit) return
          const place = hit.id.startsWith('place:')
          select({ kind: place ? 'place' : 'node', id: place ? hit.id.slice(6) : hit.id })
          void flow.fitView({ nodes: [{ id: hit.id }], duration: 300, maxZoom: 1.2, padding: 0.6 })
        }}
      >
        {boxes.map((b) => (
          <Shape key={b.id} {...b} named={named} />
        ))}
        <rect x={view.x} y={view.y} width={view.w} height={view.h} className={s.view} />
      </svg>
      <div
        className={s.handle}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('overview.resize')}
        data-tip={t('overview.resize')}
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          resize.current = { x: e.clientX, w: width }
        }}
        onPointerMove={(e) => {
          if (!resize.current) return
          // The grip is on the left: moving left makes it wider.
          setPrefs({ minimapWidth: Math.round(Math.min(MAX, Math.max(MIN, resize.current.w + (resize.current.x - e.clientX)))) })
        }}
        onPointerUp={() => (resize.current = null)}
        onDoubleClick={() => setPrefs({ minimapWidth: 280 })}
      />
    </Panel>
  )
}
