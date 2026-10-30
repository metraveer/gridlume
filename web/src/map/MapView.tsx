import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Place } from '../api/types'
import { Button, Menu, useMenu, type MenuItem } from '../design'
import { is, plain, typingIn } from '../hotkeys'
import { useApp, useReadOnly } from '../state/app'
import { usePrefs } from '../state/prefs'
import { GhostNodeView, ItemNodeView, LinkEdgeView, PendingEdgeView, PlaceNodeView, type ItemData, type LinkData, type PlaceData } from './flow'
import { INSPECTOR_MAX, INSPECTOR_MIN } from './Inspector'
import { dropMenu, linkMenu, nodeMenu, paneMenu, placeMenu } from './menus'
import { Overview } from './Overview'
import { canContain, levelContent, NODE_META } from './model'
import s from './MapView.module.css'

const nodeTypes = { item: ItemNodeView, place: PlaceNodeView, ghost: GhostNodeView }
const edgeTypes = { link: LinkEdgeView, pending: PendingEdgeView }

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
  const focus = useApp((st) => st.focus)
  const setFocus = useApp((st) => st.setFocus)
  const viewer = useReadOnly()
  const inspectorOpen = useApp((st) => st.selection !== null)
  const inspectorWidth = usePrefs((p) => Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, p.inspectorWidth)))
  const prefs = usePrefs()
  const pending = useApp((st) => st.pending)
  const editing = useApp((st) => st.editing)
  const setPending = useApp((st) => st.setPending)
  const flow = useReactFlow()
  const [menu, openMenu, closeMenu] = useMenu<MenuItem[]>()
  // Set when a dragged link was dropped on a node: then there is nothing to offer.
  const connected = useRef(false)

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
    // The link being made after a drop on empty canvas (see pending in the store).
    const extraNodes: Node[] = []
    const extraEdges: Edge[] = []
    if (pending && content.own.some((n) => n.id === pending.fromId)) {
      if (!pending.toId) {
        extraNodes.push({ id: '__drop', type: 'ghost', position: { x: pending.at.x + 84, y: pending.at.y + 20 }, draggable: false, selectable: false, connectable: false, data: {} })
      }
      extraEdges.push({ id: '__pending', type: 'pending', source: pending.fromId, target: pending.toId ?? '__drop', selectable: false, focusable: false, data: {} })
    }
    return { nodes: [...places, ...items, ...extraNodes] as Node[], edges: [...edges, ...extraEdges] as Edge[] }
  }, [map, level, selection, enter, onResized, pending])

  // The dashed link goes away once its menu was dismissed or its dialogs closed.
  useEffect(() => {
    if (pending && !menu && !editing) setPending(null)
  }, [pending, menu, editing, setPending])

  // A node found by search (or '*' for everything): once its level is drawn, bring it into view.
  useEffect(() => {
    if (!focus) return
    const id = window.setTimeout(() => {
      if (focus === '*') void flow.fitView({ padding: 0.2, maxZoom: 1.2, duration: 300 })
      else void flow.fitView({ nodes: [{ id: focus }], maxZoom: 1.2, duration: 300, padding: 0.6 })
      setFocus(null)
    }, 120)
    return () => window.clearTimeout(id)
  }, [focus, level, flow, setFocus])

  // Keys on the map: Delete asks to delete what is selected, Esc lets go of it, F fits everything.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingIn(e.target) || (e.target as HTMLElement).closest?.('[role="dialog"], [role="menu"]')) return
      const { selection, askDelete, select, editing, impact, showImpact, past, setPast } = useApp.getState()
      if (editing) return
      if (is(e, 'remove') && selection && !viewer) {
        e.preventDefault()
        askDelete(selection)
      } else if (is(e, 'cancel') && past !== null) setPast(null) // back to now first
      else if (is(e, 'cancel') && impact) showImpact(null) // then the impact view, then the selection
      else if (is(e, 'cancel') && selection) select(null)
      else if (is(e, 'fit') && plain(e)) setFocus('*')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewer, setFocus])

  const ctx = { t, viewer, level, fit: () => setFocus('*') }
  const where = (e: { clientX: number; clientY: number }) => {
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    return { x: Math.round(p.x - 90), y: Math.round(p.y - 26) } // the new node's centre under the pointer
  }
  const placeUnder = (at: { x: number; y: number }) => (level === null ? placeAt(at.x + 90, at.y + 26) : null)

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
        nodesDraggable={!viewer}
        nodesConnectable={!viewer}
        onNodeClick={(_, n) => select(n.type === 'place' ? { kind: 'place', id: (n.data as PlaceData).place.id } : { kind: 'node', id: n.id })}
        onNodeDoubleClick={(_, n) => {
          if (n.type !== 'item') return
          const d = n.data as ItemData
          if (d.portal) enter(d.node.parentId)
          else if (canContain(d.node)) enter(d.node.id)
        }}
        onEdgeClick={(_, e) => select({ kind: 'link', id: e.id })}
        onPaneClick={() => select(null)}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          const at = where(e)
          openMenu(e, paneMenu(ctx, at, placeUnder(at)))
        }}
        onNodeContextMenu={(e, n) => {
          e.preventDefault()
          if (n.type === 'place') openMenu(e, placeMenu(ctx, (n.data as PlaceData).place, where(e)))
          else openMenu(e, nodeMenu(ctx, (n.data as ItemData).node, (n.data as ItemData).portal))
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault()
          openMenu(e, linkMenu(ctx, (edge.data as LinkData).link))
        }}
        onConnectStart={() => (connected.current = false)}
        onConnect={(c) => {
          connected.current = true
          if (c.source && c.target && c.source !== c.target) edit({ kind: 'link', link: { fromId: c.source, toId: c.target, kind: 'lan' } })
        }}
        onConnectEnd={(e, state) => {
          // Dropped on empty canvas: offer to make a node right there, linked from where the drag began.
          if (connected.current || viewer || !state.fromNode || state.fromNode.type !== 'item') return
          const pt = 'changedTouches' in e ? e.changedTouches[0] : e
          if (!pt) return
          const at = where(pt)
          const from = (state.fromNode.data as ItemData).node
          setPending({ fromId: from.id, at })
          openMenu(pt, dropMenu(ctx, from, at, placeUnder(at)))
        }}
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
        {prefs.grid && <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#20252b" />}
        {/* Moves left of the inspector when it is open, so neither covers the other. */}
        {prefs.minimap && <Overview offset={inspectorOpen ? inspectorWidth + 16 : 0} />}
      </ReactFlow>
      {menu && <Menu x={menu.x} y={menu.y} items={menu.data} label={t('menu.label')} onClose={closeMenu} />}

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
