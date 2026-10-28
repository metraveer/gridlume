// Fails the build if the interface's first load grows past the budget from docs/plan.md:
// all JS and CSS that index.html loads, gzip-compressed, at most 400 KB. Fonts are separate and lazy.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const LIMIT_KB = 400
const dist = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])

let total = 0
for (const f of files) {
  const size = gzipSync(readFileSync(join(dist, f))).length
  total += size
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${f}`)
}
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB  total (gzip), budget ${LIMIT_KB} KB`)
if (total > LIMIT_KB * 1024) {
  console.error('Over budget: first load is too heavy.')
  process.exit(1)
}
