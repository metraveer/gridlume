import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import i18n from '.'
import en from './en.json'
import ru from './ru.json'

describe('dictionaries', () => {
  it('have the same keys in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort())
  })

  it('have no empty strings', () => {
    for (const [k, v] of [...Object.entries(ru), ...Object.entries(en)]) expect(v, k).not.toBe('')
  })
})

describe('plurals', () => {
  it('uses all three Russian forms', async () => {
    await i18n.changeLanguage('ru')
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => i18n.t('nodes.count', { count: n }))).toEqual([
      '1 узел', '2 узла', '5 узлов', '11 узлов', '21 узел', '22 узла', '25 узлов',
    ])
  })

  it('uses English forms', async () => {
    await i18n.changeLanguage('en')
    expect([1, 2].map((n) => i18n.t('nodes.count', { count: n }))).toEqual(['1 node', '2 nodes'])
    await i18n.changeLanguage('ru')
  })
})

// "No text in code": visible Russian text must live in the dictionaries, not in components.
describe('no hard-coded Russian text in components', () => {
  const src = join(process.cwd(), 'src') // tests run from web/
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p)
    }
  }
  walk(src)

  it.each(files)('%s', (file) => {
    const code = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/[А-Яа-яЁё]/)
  })
})
