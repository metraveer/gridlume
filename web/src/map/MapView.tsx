import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Place } from '../api/types'
import { Button } from '../design'
import { useApp } from '../state/app'
import { ItemNodeView, LinkEdgeView, PlaceNodeView, type ItemData, type LinkData, type PlaceData } from './flow'
import { canContain, levelContent, NODE_META } from './model'
import s from './MapView.module.css'

const nodeTypes = { item: ItemNodeView, place: PlaceNodeView }
const edgeTypes = { link: LinkEdgeView }

function size(kind: keyof typeof NODE_META) {
  return NODE_META[kind].small ? { w: 156, h: 40 } : { w: 188, h: 52 }
}

function Map() {
  const { t } = useTranslation()
  const map = useApp((st) => st.map)
  const level = useApp((st) => st.level)
  const selection = useApp((st) => st.selection)
  const select = useApp((st) => st.select)
  const enter = useApp((st) => st.enter)
  const edit = useApp((st) => st.edit)
  const saveLayout = useApp((st) => st.saveLayout)
  const patchNode = useApp((st) => st.patchNode)

  const onResized = useCallback((p: Place) => void saveLayout([], [p]), [saveLayout])

  // What is shown on this level, turned into React Flow nodes and edges.
  const derived = useMemo(() => {
    const content = levelContent(map, level)
    const kids = (id: string) => map.nodes.filter((n) => n.parentId === id).length
    const places: Node<PlaceData>[] =
      level === null
        ? map.places.map((p) => ({
            id: `place:${p.id}`,
            type: 'place',
            position: { x: p.x, y: p.y },
            style: { width: p.w, height: p.h },
            zIndex: -1,
            selected: selection?.kind === 'place' && selection.id === p.id,
            data: { place: p, count: map.nodes.filter((n) => n.placeId === p.id && n.parentId === null).length, onResized },
          }))
        : []
    // Portals (outside nodes linked to an opened machine) line up above it.
    const portalPos = (i: number) => ({ x: i * 220, y: -140 })
    const items: Node<ItemData>[] = [
      ...content.own.map((n) => ({ n, portal: false, pos: { x: n.x, y: n.y } })),
      ...content.portals.map((n, i) => ({ n, portal: true, pos: portalPos(i) })),
    ].map(({ n, portal, pos }) => ({
      id: n.id,
      type: 'item',
      position: pos,
      draggable: !portal,
      selected: selection?.kind === 'node' && selection.id === n.id,
      data: { node: n, kids: kids(n.id), portal, onEnter: enter },
    }))
    const edges: Edge<LinkData>[] = content.links.map((l) => ({
      id: l.id,
      source: l.fromId,
      target: l.toId,
      type: 'link',
      selected: selection?.kind === 'link' && selection.id === l.id,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#8a93a0' },
      data: { link: l },
    }))
    return { nodes: [...places, ...items] as Node[], edges: edges as Edge[] }
  }, [map, level, selection, enter, onResized])

  const [nodes, setNodes, onNodesChange] = useNodesState(derived.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(derived.edges)
  useEffect(() => setNodes(derived.nodes), [derived.nodes, setNodes])
  useEffect(() => setEdges(derived.edges), [derived.edges, setEdges])

  // A node dropped inside a place joins that place (top level only).
  const placeAt = (x: number, y: number) =>
    map.places.find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h)?.id ?? null

  const onNodeDragStop = (_: unknown, _node: Node, dragged: Node[]) => {
    const moved = dragged.filter((n) => n.type === 'item').map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) }))
    const places = dragged
      .filter((n) => n.type === 'place')
      .map((n) => ({ ...(n.data as PlaceData).place, x: Math.round(n.position.x), y: Math.round(n.position.y) }))
    void saveLayout(moved, places)
    if (level === null) {
      for (const m of moved) {
        const node = map.nodes.find((n) => n.id === m.id)
        if (!node) continue
        const sz = size(node.kind)
        const place = placeAt(m.x + sz.w / 2, m.y + sz.h / 2)
        // "" clears the place in the API's patch format.
        if (place !== node.placeId) void patchNode(node.id, { placeId: place ?? '' })
      }
    }
  }

  return (
    <div
      className={s.canvas}
      onClick={(e) => {
        // Speed / protocol pills sit outside the SVG; a click on one selects its link.
        const pill = (e.target as HTMLElement).closest('[data-edge]')
        if (pill) select({ kind: 'link', id: pill.getAttribute('data-edge')! })
      }}
    >
      <ReactFlow
        // A new canvas per level: fitView then frames that level once its nodes are measured.
        key={level ?? 'root'}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, n) => select(n.type === 'place' ? { kind: 'place', id: (n.data as PlaceData).place.id } : { kind: 'node', id: n.id })}
        onNodeDoubleClick={(_, n) => {
          if (n.type !== 'item') return
          const d = n.data as ItemData
          if (d.portal) enter(d.node.parentId)
          else if (canContain(d.node)) enter(d.node.id)
        }}
        onEdgeClick={(_, e) => select({ kind: 'link', id: e.id })}
        onPaneClick={() => select(null)}
        onConnect={(c) => c.source && c.target && c.source !== c.target && edit({ kind: 'link', link: { fromId: c.source, toId: c.target, kind: 'lan' } })}
        connectionMode={ConnectionMode.Loose}
        zoomOnDoubleClick={false} // double-click opens a machine
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#20252b" />
        <MiniMap className={s.minimap} position="bottom-left" pannable zoomable nodeColor={(n) => (n.type === 'place' ? 'rgba(255,255,255,0.04)' : '#a3abb5')} maskColor="rgba(13,15,18,0.7)" />
      </ReactFlow>

      {map.nodes.length === 0 && map.places.length === 0 && (
        <div className={s.empty}>
          <h2>{t('map.empty.title')}</h2>
          <p>{t('map.empty.lead')}</p>
          <div className={s.emptyActions}>
            <Button variant="primary" icon="plus" onClick={() => edit({ kind: 'place', place: { tone: 'green' } })}>{t('add.place')}</Button>
            <Button icon="plus" onClick={() => edit({ kind: 'node', node: { kind: 'server' } })}>{t('add.node')}</Button>
            <Button icon="server" tip={t('add.agent.tip')} onClick={() => edit({ kind: 'agent' })}>{t('add.agent')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function MapView() {
  return (
    <ReactFlowProvider>
      <Map />
    </ReactFlowProvider>
  )
}
