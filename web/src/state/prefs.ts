import { create } from 'zustand'

/** How the interface looks on this device. Stored in the browser: another screen may want it otherwise. */
export type Prefs = {
  minimap: boolean // the small overview in the corner of the map
  linkLabels: boolean // protocol and speed on links
  grid: boolean // dots on the canvas
  minimapWidth: number // px; the height follows
  inspectorWidth: number // px, the panel on the right
  railOpen: boolean // the left menu shows labels
}

const KEY = 'gridlume.prefs'
const defaults: Prefs = { minimap: true, linkLabels: true, grid: true, minimapWidth: 280, inspectorWidth: 440, railOpen: false }

function load(): Prefs {
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) }
  } catch {
    return defaults
  }
}

export const usePrefs = create<Prefs & { set: (p: Partial<Prefs>) => void }>((set, get) => ({
  ...load(),
  set: (p) => {
    set(p)
    const { set: _set, ...saved } = get()
    void _set
    try {
      localStorage.setItem(KEY, JSON.stringify(saved))
    } catch {
      // private mode or storage full: the choice lasts until the page reloads
    }
  },
}))
