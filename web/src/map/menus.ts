import type { TFunction } from 'i18next'
import type { Link, LinkKind, MapNode, NodeKind, Place } from '../api/types'
import type { MenuItem } from '../design'
import { useApp } from '../state/app'
import { useLive } from '../state/live'
import { canContain, NODE_META } from './model'

/** Kinds offered when a new node is made right on the canvas: what usually lives on that level. */
export const QUICK_KINDS: { root: NodeKind[]; inside: NodeKind[] } = {
  root: ['server', 'router', 'vps', 'internet', 'domain', 'storage', 'device'],
  inside: ['container', 'service', 'database', 'vm'],
}

/** A sensible first guess for a link drawn from a node to a new one; the dialog shows it, the user decides. */
export function guessLinkKind(inside: boolean, to: NodeKind): LinkKind {
  if (to === 'database') return 'db'
  return inside ? 'depends' : 'lan'
}

type At = { x: number; y: number } // map coordinates
type Ctx = { t: TFunction; viewer: boolean; level: string | null; fit: () => void }

/** Right click on empty canvas. */
export function paneMenu({ t, viewer, level, fit }: Ctx, at: At, placeId: string | null): MenuItem[] {
  const { edit } = useApp.getState()
  const kinds = level === null ? QUICK_KINDS.root : QUICK_KINDS.inside
  const items: MenuItem[] = []
  if (!viewer) {
    items.push({ heading: t('menu.addHere') })
    for (const k of kinds.slice(0, 4)) {
      items.push({ label: t(`kind.${k}`), icon: NODE_META[k].icon, onSelect: () => edit({ kind: 'node', node: { kind: k, x: at.x, y: at.y, parentId: level, placeId } }) })
    }
    items.push({ label: t('menu.otherNode'), icon: 'plus', onSelect: () => edit({ kind: 'node', node: { x: at.x, y: at.y, parentId: level, placeId } }) })
    if (level === null) {
      items.push({ separator: true })
      items.push({ label: t('add.place'), icon: 'map', onSelect: () => edit({ kind: 'place', place: { x: at.x, y: at.y } }) })
      items.push({ label: t('add.agent'), icon: 'server', tip: t('add.agent.tip'), onSelect: () => edit({ kind: 'agent' }) })
    }
    items.push({ separator: true })
  }
  items.push({ label: t('map.fit'), icon: 'fit', hint: 'F', onSelect: fit })
  return items
}

/** Right click on a node. */
export function nodeMenu({ t, viewer }: Ctx, node: MapNode, portal: boolean): MenuItem[] {
  const { edit, enter, select, askDelete } = useApp.getState()
  const hasAgent = !!useLive.getState().agents[node.id]
  const items: MenuItem[] = []
  if (portal) items.push({ label: t('menu.backOut'), icon: 'chevron', onSelect: () => enter(node.parentId) })
  else if (canContain(node)) items.push({ label: t('insp.open'), icon: 'chevron', hint: '2×', onSelect: () => enter(node.id) })
  items.push({ label: t('menu.details'), icon: 'eye', onSelect: () => select({ kind: 'node', id: node.id }) })
  items.push({
    label: t('impact.menu'),
    icon: 'impact',
    onSelect: () => {
      select({ kind: 'node', id: node.id })
      useApp.getState().showImpact(node.id)
    },
  })
  if (!viewer) {
    items.push({ label: t('common.edit'), icon: 'gear', onSelect: () => edit({ kind: 'node', node }) })
    items.push({ label: t('menu.linkFrom'), icon: 'link', onSelect: () => edit({ kind: 'link', link: { fromId: node.id, kind: 'lan' } }) })
    if (canContain(node) && !hasAgent) items.push({ label: t('agent.connect.short'), icon: 'server', onSelect: () => edit({ kind: 'agent', nodeId: node.id }) })
    items.push({ separator: true })
    items.push({ label: t('common.delete'), icon: 'x', danger: true, hint: 'Del', onSelect: () => askDelete({ kind: 'node', id: node.id }) })
  }
  return items
}

/** Right click on a place. */
export function placeMenu({ t, viewer }: Ctx, place: Place, at: At): MenuItem[] {
  const { edit, select, askDelete } = useApp.getState()
  const items: MenuItem[] = [{ label: t('menu.details'), icon: 'eye', onSelect: () => select({ kind: 'place', id: place.id }) }]
  if (!viewer) {
    items.push({ label: t('menu.nodeHere'), icon: 'plus', onSelect: () => edit({ kind: 'node', node: { x: at.x, y: at.y, parentId: null, placeId: place.id } }) })
    items.push({ label: t('common.edit'), icon: 'gear', onSelect: () => edit({ kind: 'place', place }) })
    items.push({ separator: true })
    items.push({ label: t('common.delete'), icon: 'x', danger: true, hint: 'Del', onSelect: () => askDelete({ kind: 'place', id: place.id }) })
  }
  return items
}

/** Right click on a link. */
export function linkMenu({ t, viewer }: Ctx, link: Link): MenuItem[] {
  const { edit, select, swapLink, askDelete } = useApp.getState()
  const items: MenuItem[] = [{ label: t('menu.details'), icon: 'eye', onSelect: () => select({ kind: 'link', id: link.id }) }]
  if (!viewer) {
    items.push({ label: t('common.edit'), icon: 'gear', onSelect: () => edit({ kind: 'link', link }) })
    items.push({ label: t('insp.swap'), icon: 'restart', tip: t('insp.swap.tip'), onSelect: () => void swapLink(link.id) })
    items.push({ separator: true })
    items.push({ label: t('common.delete'), icon: 'x', danger: true, hint: 'Del', onSelect: () => askDelete({ kind: 'link', id: link.id }) })
  }
  return items
}

/** A link dragged from a node and dropped on empty canvas: make a node there and link to it. */
export function dropMenu({ t, level }: Ctx, from: MapNode, at: At, placeId: string | null): MenuItem[] {
  const { edit } = useApp.getState()
  const inside = level !== null
  const make = (k?: NodeKind) => () =>
    edit({ kind: 'node', node: { kind: k, x: at.x, y: at.y, parentId: level, placeId }, linkFrom: { id: from.id, kind: guessLinkKind(inside, k ?? 'server') } })
  return [
    { heading: t('menu.dropTitle', { name: from.name }) },
    ...(inside ? QUICK_KINDS.inside : QUICK_KINDS.root).map((k) => ({ label: t(`kind.${k}`), icon: NODE_META[k].icon, onSelect: make(k) })),
    { separator: true },
    { label: t('menu.otherNode'), icon: 'plus', onSelect: make() },
  ]
}
