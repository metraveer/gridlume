import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, Position, useInternalNode, type EdgeProps, type NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import type { Link, MapNode, Place } from '../api/types'
import { Dot, Icon } from '../design'
import { useNodeLive } from '../state/live'
import { usePrefs } from '../state/prefs'
import { bytes, percent } from './format'
import { canContain, LINK_META, NODE_META } from './model'
import s from './flow.module.css'

export type ItemData = { node: MapNode; kids: number; portal: boolean; onEnter: (id: string) => void }
export type PlaceData = { place: Place; count: number; onResized: (p: Place) => void }
export type LinkData = { link: Link }

// Invisible handles on every side; edges ignore them and are drawn centre to centre ("floating"),
// but React Flow needs them to start a new connection by dragging from a node's edge.
const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

/** "ghcr.io/moghtech/komodo-core:2" → "komodo-core:2": the registry is noise on a card (the inspector shows it). */
export function shortImage(image: string) {
  return image.slice(image.lastIndexOf('/') + 1)
}

export function ItemNodeView({ data, selected }: NodeProps & { data: ItemData }) {
  const { t } = useTranslation()
  const { node, kids, portal } = data
  const { agent, snap, container, state } = useNodeLive(node)
  const meta = NODE_META[node.kind]
  // The card shows everything it says in full: it grows up to 300 px and wraps a long line instead of
  // cutting it with "…" (there is no way to widen a card to read the rest).
  // Line 1: the name. Line 2: what it is, or why it is not running. Line 3: live numbers, as chips.
  const sub =
    state === 'planned' ? t('state.planned')
    : container === null ? t('docker.gone')
    : container && container.state !== 'running' ? t(`docker.state.${container.state}`)
    : agent && !agent.online ? t('agent.offline.short')
    : [node.source === 'docker' ? shortImage(node.subtitle) : node.subtitle || node.address, t(`kind.${node.kind}`)].filter(Boolean).join(' · ')
  const chips: { label: string; value: string; level: number }[] = []
  if (snap) {
    const mem = snap.memTotal ? (100 * snap.memUsed) / snap.memTotal : 0
    const disk = Math.max(0, ...(snap.disks ?? []).map((d) => (d.total ? (100 * d.used) / d.total : 0)))
    chips.push({ label: 'CPU', value: percent(snap.cpu), level: snap.cpu })
    if (snap.memTotal) chips.push({ label: 'RAM', value: percent(mem), level: mem })
    if (snap.disks?.length) chips.push({ label: t('card.disk'), value: percent(disk), level: disk })
  } else if (container?.state === 'running') {
    chips.push({ label: 'CPU', value: percent(container.cpu), level: container.cpu })
    chips.push({ label: 'RAM', value: bytes(t, container.memUsed), level: container.memLimit ? (100 * container.memUsed) / container.memLimit : 0 })
  }
  const cls = [s.node, meta.small && s.small, chips.length > 0 && s.withLive, selected && s.selected, state === 'planned' && s.planned, portal && s.portal].filter(Boolean).join(' ')
  const tip = [node.name, t(`state.${state}`), kids ? t('map.enter.tip') : '', portal ? t('map.portal.tip') : ''].filter(Boolean).join(' · ')
  return (
    <div className={cls} data-tip={tip}>
      {SIDES.map((p) => (
        <Handle key={p} id={p} type="source" position={p} className={s.handle} data-tip={t('map.handle.tip')} />
      ))}
      <span className={s.glyph}>
        <Icon name={meta.icon} />
      </span>
      <span className={s.label}>
        <span className={s.name}>{node.name}</span>
        {sub && <span className={s.sub}>{sub}</span>}
        {chips.length > 0 && (
          <span className={s.chips}>
            {chips.map((c) => (
              <span key={c.label} className={c.level >= 95 ? s.crit : c.level >= 80 ? s.warn : undefined}>
                <b>{c.label}</b> {c.value}
              </span>
            ))}
          </span>
        )}
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
  const labels = usePrefs((p) => p.linkLabels)
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
      {(labels || selected) && (
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
      )}
    </>
  )
}

export function speed(mbit: number, t: (k: string, o?: Record<string, unknown>) => string) {
  return mbit >= 1000 ? t('unit.gbit', { n: +(mbit / 1000).toFixed(1) }) : t('unit.mbit', { n: mbit })
}

/** Where a dragged link was dropped, while the menu or dialogs are open. */
export function GhostNodeView() {
  return (
    <div className={s.ghost}>
      <Handle type="target" position={Position.Top} className={s.ghostHandle} isConnectable={false} />
    </div>
  )
}

/** The link being made: dashed, from the node it started at to the drop point or the new node. */
export function PendingEdgeView({ source, target }: EdgeProps) {
  const a = useInternalNode(source)
  const b = useInternalNode(target)
  if (!a || !b) return null
  const ca = { x: a.internals.positionAbsolute.x + (a.measured.width ?? 0) / 2, y: a.internals.positionAbsolute.y + (a.measured.height ?? 0) / 2 }
  const rb = { ...b.internals.positionAbsolute, w: b.measured.width ?? 0, h: b.measured.height ?? 0 }
  const ra = { ...a.internals.positionAbsolute, w: a.measured.width ?? 0, h: a.measured.height ?? 0 }
  const p1 = exitPoint(ra, rb.x + rb.w / 2, rb.y + rb.h / 2)
  const p2 = rb.w > 20 ? exitPoint(rb, ca.x, ca.y) : { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 }
  return <path d={`M${p1.x},${p1.y} L${p2.x},${p2.y}`} className={s.pendingEdge} />
}
