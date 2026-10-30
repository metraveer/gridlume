import { create } from 'zustand'
import { api, ApiError } from '../api/client'
import type { Link, LinkKind, MapData, MapNode, Place, Suggestion, SystemInfo, User } from '../api/types'
import type { Level } from '../map/model'

export type Selection = { kind: 'node' | 'link' | 'place'; id: string } | null

/** What the "add / edit" dialogs are working on. */
export type Editing =
  // linkFrom: the node was made by dropping a link from another one; link them once it exists.
  | { kind: 'node'; node: Partial<MapNode>; linkFrom?: { id: string; kind: LinkKind } }
  | { kind: 'link'; link: Partial<Link> }
  | { kind: 'place'; place: Partial<Place> }
  | { kind: 'agent'; nodeId?: string } // connect a machine: to this node, or as a new one
  | null

type State = {
  ready: boolean
  needsSetup: boolean
  offline: boolean // the session check failed, so we do not know whether to show setup or sign-in
  user: User | null
  map: MapData
  suggestions: Suggestion[]
  system: SystemInfo | null
  level: Level
  selection: Selection
  focus: string | null // a node the map should bring into view (search, all-nodes page); '*' = everything
  deleting: Selection // something a menu or the Delete key asked to delete; its inspector confirms
  // A link dragged onto empty canvas, drawn dashed while its node and link are being made:
  // to the point where it was dropped, then to the new node.
  pending: { fromId: string; at: { x: number; y: number }; toId?: string } | null
  impact: string | null // "what breaks if" this node stops, shown on the map
  editing: Editing
  error: string | string[] | null // dictionary key(s) of the last error to show

  init: () => Promise<void>
  setup: (code: string, username: string, password: string) => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  loadMap: () => Promise<void>
  setSystem: (s: SystemInfo) => void
  acceptSuggestion: (s: Suggestion, about: string, ifBroken: string) => Promise<void>
  dismissSuggestion: (s: Suggestion) => Promise<void>

  select: (s: Selection) => void
  setFocus: (id: string | null) => void
  showImpact: (id: string | null) => void
  askDelete: (s: Selection) => void
  setPending: (p: State['pending']) => void
  enter: (level: Level) => void
  edit: (e: Editing) => void
  clearError: () => void

  saveNode: (n: Partial<MapNode>) => Promise<MapNode>
  saveLink: (l: Partial<Link>) => Promise<Link>
  savePlace: (p: Partial<Place>) => Promise<Place>
  patchNode: (id: string, patch: Partial<MapNode>) => Promise<void>
  swapLink: (id: string) => Promise<void>
  remove: (kind: 'node' | 'link' | 'place', id: string) => Promise<void>
  saveLayout: (nodes: { id: string; x: number; y: number }[], places: Place[]) => Promise<void>
}

const empty: MapData = { places: [], nodes: [], links: [] }

/** Turn any failure into a dictionary key and remember it for the error banner. */
function keyOf(e: unknown): string | string[] {
  return e instanceof ApiError ? e.key : 'err.internal'
}

export const useApp = create<State>((set, get) => ({
  ready: false,
  needsSetup: false,
  offline: false,
  user: null,
  map: empty,
  suggestions: [],
  system: null,
  level: null,
  selection: null,
  focus: null,
  deleting: null,
  pending: null,
  impact: null,
  editing: null,
  error: null,

  init: async () => {
    try {
      const s = await api.session()
      set({ needsSetup: s.needsSetup, user: s.user, ready: true, offline: false, error: null })
      if (s.user) await get().loadMap()
    } catch (e) {
      set({ ready: true, offline: true, error: keyOf(e) })
    }
  },

  setup: async (code, username, password) => {
    const { user } = await api.setup(code, username, password)
    set({ user, needsSetup: false })
    await get().loadMap()
  },

  login: async (username, password) => {
    const { user } = await api.login(username, password)
    set({ user })
    await get().loadMap()
  },

  logout: async () => {
    await api.logout().catch(() => undefined)
    set({ user: null, map: empty, selection: null, level: null })
  },

  loadMap: async () => {
    try {
      const [map, suggestions, system] = await Promise.all([api.map(), api.suggestions(), api.system().catch(() => null)])
      set({ map, suggestions, system })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) set({ user: null })
      else set({ error: keyOf(e) })
    }
  },

  setSystem: (system) => set({ system }),

  acceptSuggestion: async (sg, about, ifBroken) => {
    try {
      const link = await api.acceptSuggestion(sg.id, about, ifBroken)
      set((s) => ({ map: { ...s.map, links: [...s.map.links, link] }, suggestions: s.suggestions.filter((x) => x.id !== sg.id) }))
    } catch (e) {
      set({ error: keyOf(e) })
    }
  },

  dismissSuggestion: async (sg) => {
    set((s) => ({ suggestions: s.suggestions.filter((x) => x.id !== sg.id) }))
    try {
      await api.dismissSuggestion(sg.id)
    } catch (e) {
      set({ error: keyOf(e) })
    }
  },

  // Picking another node leaves the impact view of the previous one (entering levels keeps it).
  select: (selection) => set((s) => ({ selection, impact: s.impact && selection?.kind === 'node' && selection.id !== s.impact ? null : s.impact })),
  showImpact: (impact) => set({ impact }),
  setFocus: (focus) => set({ focus }),
  // Selecting it opens its inspector, which shows the confirmation (with risk and consequences).
  askDelete: (deleting) => set({ deleting, selection: deleting }),
  setPending: (pending) => set({ pending }),
  enter: (level) => set({ level, selection: level ? { kind: 'node', id: level } : null }),
  edit: (editing) => set({ editing }),
  clearError: () => set({ error: null }),

  saveNode: async (n) => {
    const { id, ...rest } = n
    const saved = id
      ? await api.updateNode(id, { ...rest, parentId: rest.parentId ?? '', placeId: rest.placeId ?? '' } as Partial<MapNode>)
      : await api.createNode({ subtitle: '', address: '', notes: '', state: 'unknown', x: 0, y: 0, parentId: null, placeId: null, ...rest } as Omit<MapNode, 'id'>)
    set((s) => ({ map: { ...s.map, nodes: upsert(s.map.nodes, saved) }, selection: { kind: 'node', id: saved.id } }))
    return saved
  },

  saveLink: async (l) => {
    const { id, ...rest } = l
    let saved: Link
    if (id) {
      // Ends of an existing link are fixed (swap is a separate action), so they are not sent.
      const { fromId: _from, toId: _to, ...patch } = rest
      void _from
      void _to
      saved = await api.updateLink(id, { ...patch, speedMbit: patch.speedMbit ?? 0 })
    } else {
      saved = await api.createLink({ proto: '', about: '', ifBroken: '', speedMbit: null, planned: false, ...rest } as Omit<Link, 'id'>)
    }
    set((s) => ({ map: { ...s.map, links: upsert(s.map.links, saved) }, selection: { kind: 'link', id: saved.id } }))
    return saved
  },

  savePlace: async (p) => {
    const { id, ...rest } = p
    const saved = id ? await api.updatePlace(id, rest) : await api.createPlace({ tone: 'green', x: 0, y: 0, w: 440, h: 320, name: '', ...rest })
    set((s) => ({ map: { ...s.map, places: upsert(s.map.places, saved) }, selection: { kind: 'place', id: saved.id } }))
    return saved
  },

  patchNode: async (id, patch) => {
    try {
      const saved = await api.updateNode(id, patch)
      set((s) => ({ map: { ...s.map, nodes: upsert(s.map.nodes, saved) } }))
    } catch (e) {
      set({ error: keyOf(e) })
    }
  },

  swapLink: async (id) => {
    try {
      const saved = await api.updateLink(id, { swap: true })
      set((s) => ({ map: { ...s.map, links: upsert(s.map.links, saved) } }))
    } catch (e) {
      set({ error: keyOf(e) })
    }
  },

  remove: async (kind, id) => {
    try {
      if (kind === 'node') await api.deleteNode(id)
      else if (kind === 'link') await api.deleteLink(id)
      else await api.deletePlace(id)
      set({ selection: null })
      if (kind === 'node' && get().level === id) set({ level: null })
      await get().loadMap() // deleting cascades (contents, links), so reload instead of guessing
    } catch (e) {
      set({ error: keyOf(e) })
    }
  },

  saveLayout: async (nodes, places) => {
    set((s) => ({
      map: {
        ...s.map,
        nodes: s.map.nodes.map((n) => {
          const p = nodes.find((x) => x.id === n.id)
          return p ? { ...n, x: p.x, y: p.y } : n
        }),
        places: s.map.places.map((p) => places.find((x) => x.id === p.id) ?? p),
      },
    }))
    try {
      await api.layout(nodes, places)
    } catch (e) {
      set({ error: keyOf(e) })
    }
  },
}))

function upsert<T extends { id: string }>(list: T[], item: T) {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]
}
