/**
 * Every keyboard shortcut of the interface, in one place.
 *
 * Shortcuts match the PHYSICAL key (KeyboardEvent.code), never the typed character (KeyboardEvent.key):
 * with the Russian layout the key labelled "F" types "а" and "/" types ".", so a check on the character
 * silently stops working for half of our users. KeyboardEvent.code is the same for every layout.
 * (Rule written down in CONTRIBUTING.md.)
 */
export const HOTKEYS = {
  search: ['Slash', 'NumpadDivide'], // "/": jump to search
  fit: ['KeyF'], // F: show the whole map
  remove: ['Delete', 'Backspace'], // ask to delete what is selected
  cancel: ['Escape'], // let go of the selection, close a menu, a dialog or the search list
  confirm: ['Enter', 'NumpadEnter'], // open the highlighted search result / table row
  down: ['ArrowDown'],
  up: ['ArrowUp'],
} as const

export type Hotkey = keyof typeof HOTKEYS

// Named keys are the same in every layout, so when a browser gives no code (some synthetic or IME
// events), their key name is a safe fallback. Letters and symbols never fall back to the character.
const NAMED: Partial<Record<Hotkey, readonly string[]>> = {
  remove: ['Delete', 'Backspace'],
  cancel: ['Escape'],
  confirm: ['Enter'],
  down: ['ArrowDown'],
  up: ['ArrowUp'],
}

type KeyLike = { code: string; key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }

/** Whether the event is the shortcut, in any keyboard layout. */
export function is(e: KeyLike, name: Hotkey): boolean {
  if ((HOTKEYS[name] as readonly string[]).includes(e.code)) return true
  return !e.code && !!NAMED[name]?.includes(e.key)
}

/** No Ctrl, Cmd or Alt held: a plain single-key shortcut, not a browser or system one. */
export function plain(e: KeyLike): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey
}

/** Typing into a field: single-key shortcuts must leave the keys to the text. */
export function typingIn(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')
}
