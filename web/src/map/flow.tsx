import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, Position, useInternalNode, type EdgeProps, type NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import type { Link, MapNode, Place } from '../api/types'
import { Dot, Icon } from '../design'
import { useNodeLive } from '../state/live'
import { bytes, cardLine, percent } from './format'
import { canContain, LINK_META, NODE_META } from './model'
import s from './flow.module.css'

export type ItemData = { node: MapNode; kids: number; portal: boolean; onEnter: (id: string) => void }
export type PlaceData = { place: Place; count: number; onResized: (p: Place) => void }
export type LinkData = { link: Link }

// Invisible handles on every side; edges ignore them and are drawn centre to centre ("floating"),
// but React Flow needs them to start a new connection by dragging from a node's edge.
const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

export function ItemNodeView({ data, selected }: NodeProps & { data: ItemData }) {
  const { t } = useTranslation()
  const { node, kids, portal } = data
  const { agent, snap, container, state } = useNodeLive(node)
  const meta = NODE_META[node.kind]
  // A machine with a connected agent shows its load, a container its own load or why it is not running.
  const sub =
    state === 'planned' ? t('state.planned')
    : snap ? cardLine(snap)
    : container === null ? t('docker.gone')
    : container?.state === 'running' ? `CPU ${percent(container.cpu)} · ${bytes(t, container.memUsed)}`
    : container ? t(`docker.state.${container.state}`)
    : agent && !agent.online ? t('agent.offline.short')
    : [node.subtitle || node.address, t(`kind.${node.kind}`)].filter(Boolean).join(' · ')
  const cls = [s.node, meta.small && s.small, selected && s.selected, state === 'planned' && s.planned, portal && s.portal].filter(Boolean).join(' ')
  const tip = [node.name, t(`state.${state}`), kids ? t('map.enter.tip') : '', portal ? t('map.portal.tip') : ''].filter(Boolean).join(' · ')
  return (
    <div className={cls} data-tip={tip}>
      {SIDES.map((p) => (
        <Handle key={p} id={p} type="source" position={p} className={s.handle} />
      ))}
      <span className={s.glyph}>
        <Icon name={meta.icon} />
      </span>
      <span className={s.label}>
        <span className={s.name}>{node.name}</span>
        <span className={s.sub}>{sub}</span>
      </span>
      {(kids > 0 || canContain(node)) && !portal && (
        <button
          type="button"
          className={`${s.kids} nodrag`}
          data-tip={t('map.enter.tip')}
          onClick={(e) => {
            e.stopPropagation()
            data.onEnter(node.id)
          }}
        >
          {kids} ›
        </button>
      )}
      <span className={s.state}>
        <Dot state={state} />
      </span>
    </div>
  )
}

export function PlaceNodeView({ data, selected }: NodeProps & { data: PlaceData }) {
  const { t } = useTranslation()
  const { place, count } = data
  return (
    <div className={`${s.place} ${s[`tone_${place.tone}`]}`} style={{ width: '100%', height: '100%' }}>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={120}
        lineClassName={s.resizeLine}
        handleClassName={s.resizeHandle}
        onResizeEnd={(_, r) => data.onResized({ ...place, x: r.x, y: r.y, w: r.width, h: r.height })}
      />
      <span className={s.placeLabel}>{place.name}</span>
      <span className={s.placeCount}>{t('nodes.count', { count })}</span>
    </div>
  )
}

/** Point where the line from the centre of `a` towards `b` leaves a's rectangle. */
function exitPoint(a: { x: number; y: number; w: number; h: number }, bx: number, by: number) {
  const cx = a.x + a.w / 2
  const cy = a.y + a.h / 2
  const dx = bx - cx
  const dy = by - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy, vertical: true }
  const sx = a.w / 2 / Math.abs(dx || 1e-9)
  const sy = a.h / 2 / Math.abs(dy || 1e-9)
  const k = Math.min(sx, sy)
  return { x: cx + dx * k, y: cy + dy * k, vertical: sy < sx }
}

export function LinkEdgeView({ id, source, target, data, selected, markerEnd }: EdgeProps & { data: LinkData }) {
  const { t } = useTranslation()
  const a = useInternalNode(source)
  const b = useInternalNode(target)
  if (!a || !b) return null
  const ra = { ...a.internals.positionAbsolute, w: a.measured.width ?? 0, h: a.measured.height ?? 0 }
  const rb = { ...b.internals.positionAbsolute, w: b.measured.width ?? 0, h: b.measured.height ?? 0 }
  const p1 = exitPoint(ra, rb.x + rb.w / 2, rb.y + rb.h / 2)
  const p2 = exitPoint(rb, ra.x + ra.w / 2, ra.y + ra.h / 2)
  const mx = (p1.x + p2.x) / 2
  const my = (p1.y + p2.y) / 2
  const path = p1.vertical
    ? `M${p1.x},${p1.y} C${p1.x},${my} ${p2.x},${my} ${p2.x},${p2.y}`
    : `M${p1.x},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${p2.x},${p2.y}`

  const link = data.link
  const label = link.planned
    ? t('map.planned')
    : [link.proto.split(' ')[0] || t(`link.${link.kind}`), link.speedMbit ? speed(link.speedMbit, t) : ''].filter(Boolean).join(' · ')
  const tip = [t(`link.${link.kind}`), link.about].filter(Boolean).join(' — ')

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={LINK_META[link.kind].arrow ? markerEnd : undefined}
        className={[s.edge, s[`edge_${link.kind}`], link.planned && s.edgePlanned, selected && s.edgeSelected].filter(Boolean).join(' ')}
        interactionWidth={16}
      />
      <EdgeLabelRenderer>
        <div
          className={`${s.pill} ${selected ? s.pillSelected : ''} nodrag nopan`}
          style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)` }}
          data-tip={tip}
          data-edge={id}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export function speed(mbit: number, t: (k: string, o?: Record<string, unknown>) => string) {
  return mbit >= 1000 ? t('unit.gbit', { n: +(mbit / 1000).toFixed(1) }) : t('unit.mbit', { n: mbit })
}
