// The share host's package (D361, host/): its files and how its viewer loads, from this Jean's
// render package as capabilities.json lists it, in dist/host/, for whoever runs a host: copy the
// folder, then HOST_CONFIG='{…}' node dist/host/serve.js. The render package of that version has to be
// on npm (npm run render, then npm publish ./dist/render), as a saved copy's does.
// With --serve, it runs a host here instead, as the e2e tests do.
// Usage: npm run host [-- --serve]
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseImportMap } from './graph.js'
import { readerAt } from '../app/ui/export.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP = join(ROOT, 'app')
/** Where a share's render package is, unless HOST_RENDER says otherwise: jsDelivr's copy of npm's, at the version a share names. */
export const RENDER = 'https://cdn.jsdelivr.net/npm/@jean-is/render@{version}/'
/** Where a score's instruments are (D338), unless HOST_SOUNDS says otherwise. */
export const SOUNDS = 'https://cdn.jsdelivr.net/npm/@jean-is/sounds@{version}/'

/**
 * How the viewer loads: from the render package at this Jean's version, its modules by their hashes,
 * and where shares' own versions are. @param {string} [render] @param {string} [sounds]
 */
export async function viewerOf(render = RENDER, sounds = SOUNDS) {
  const listing = JSON.parse(await readFile(join(APP, 'capabilities.json'), 'utf8')).render
  if (!listing?.viewer) throw new Error('host: capabilities.json lists no viewer; run npm run build first')
  const { imports } = parseImportMap(await readFile(join(APP, 'index.html'), 'utf8'))
  const reader = readerAt(render.replace('{version}', listing.version), { render: { ...listing, entry: listing.viewer }, imports, settings: {} })
  return { base: reader.base, entry: reader.entry, imports: reader.imports, integrity: reader.integrity, render, sounds }
}

async function main() {
  const viewer = await viewerOf(process.env.HOST_RENDER, process.env.HOST_SOUNDS)
  if (process.argv.includes('--serve')) {
    const config = JSON.parse(process.env.HOST_CONFIG ?? '{}')
    process.env.HOST_CONFIG = JSON.stringify({ ...config, viewer })
    await import('../host/serve.js').then((module) => module.main([]))
    return
  }
  const out = join(ROOT, 'dist', 'host')
  await mkdir(out, { recursive: true })
  for (const name of ['host.js', 'serve.js']) await cp(join(ROOT, 'host', name), join(out, name))
  await writeFile(join(out, 'viewer.json'), `${JSON.stringify(viewer, null, 2)}\n`)
  await writeFile(join(out, 'package.json'), `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`)
  console.log(`host: dist/host, its viewer from ${viewer.base}; run it with HOST_CONFIG='{"origins":["https://…"]}' node dist/host/serve.js`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
