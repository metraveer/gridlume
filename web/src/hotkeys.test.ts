import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { HOTKEYS, is, plain, type Hotkey } from './hotkeys'

// What the same physical keys type in the two layouts we support.
const LAYOUTS: Record<string, Record<string, string>> = {
  en: { KeyF: 'f', Slash: '/', NumpadDivide: '/' },
  ru: { KeyF: 'а', Slash: '.', NumpadDivide: '/' },
}

it.each(Object.keys(LAYOUTS))('every shortcut works with the %s layout', (layout) => {
  for (const [name, codes] of Object.entries(HOTKEYS) as [Hotkey, readonly string[]][]) {
    for (const code of codes) {
      const key = LAYOUTS[layout]![code] ?? code // named keys (Escape, Delete…) are the same in every layout
      expect(is({ code, key }, name), `${name} via ${code} typing "${key}"`).toBe(true)
    }
  }
})

it('does not fire on the character alone, or on another key', () => {
  // Russian "а" on another key than F (cannot happen, but the character must never be the test).
  expect(is({ code: 'KeyQ', key: 'f' }, 'fit')).toBe(false)
  expect(is({ code: 'Period', key: '/' }, 'search')).toBe(false)
  // No code at all: only named keys fall back to the key name.
  expect(is({ code: '', key: 'Escape' }, 'cancel')).toBe(true)
  expect(is({ code: '', key: 'f' }, 'fit')).toBe(false)
})

it('plain means no Ctrl, Cmd or Alt', () => {
  expect(plain({ code: 'KeyF', key: 'f' })).toBe(true)
  expect(plain({ code: 'KeyF', key: 'f', ctrlKey: true })).toBe(false)
  expect(plain({ code: 'KeyF', key: 'f', metaKey: true })).toBe(false)
})

/** The rule from CONTRIBUTING.md, checked: no shortcut compares the typed character outside hotkeys.ts. */
it('components never compare KeyboardEvent.key themselves', () => {
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'hotkeys.ts') {
        const text = readFileSync(path, 'utf8')
        if (/\b(e|ev|event)\.key\s*(===|!==)|\.key\.toLowerCase\(/.test(text)) offenders.push(path)
      }
    }
  }
  walk(join(process.cwd(), 'src'))
  expect(offenders).toEqual([])
})
