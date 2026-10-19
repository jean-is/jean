// The render package, @jean-is/render (D305): Jean's own files, as they are in app/ and at
// the same paths, that draw a task saved as a web page as Jean draws it, and the viewer of a share's
// host (D361). `renderPlan` says what it holds, which `npm run manifest` lists in capabilities.json;
// `npm run render` puts it in dist/render/, ready for `npm publish ./dist/render`.
// Usage: npm run render
import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractStaticImports, parseImportMap, resolveSpecifier } from './graph.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP = join(ROOT, 'app')
export const NAME = '@jean-is/render'

/** What a saved copy loads first. */
export const ENTRY = 'ui/reader.js'
/** What a share's viewer loads first, on its host (D361). */
export const VIEWER = 'caps/share/view.js'
/** Modules the copy loads in place of the room's: what draws answers reads the page, not Jean's storage. */
export const STAND_INS = Object.freeze({ 'ui/state.js': 'ui/reader-state.js' })
/** What its modules read as files rather than import (style sheets, words, fonts, the pages' relay and the libraries lent to pages), whole folders included. */
export const ASSETS = Object.freeze(['preview.html', 'ui/style.css', 'ui/looks', 'fonts', 'locales', 'caps/layouts', 'caps/math', 'caps/charts',
  'caps/scores', 'caps/slides', 'caps/interactive', 'vendor/temml', 'vendor/abcjs', 'vendor/echarts', 'vendor/maplibre', 'vendor/LICENSES'])

// A module of its own folder, or a library of Jean's by its address, both written as they are: a
// capability's other modules, never the capabilities that the room's gate loads by name. A type's
// module in JSDoc looks the same (`import('./types.js')`), and is no file: one that isn't there is passed by.
const DYNAMIC = /\bimport\(\s*(?:'(\.\/[^']+)'|new URL\('([^']+)', import\.meta\.url\)(?:\.href)?)\s*\)/g

/**
 * Every module a saved copy may load, from its entry: static imports, those of a module's own folder
 * and the libraries it imports by address, each stand-in in place of what it stands for.
 * @param {(path: string) => Promise<string | null>} read a file of app/ by its path, or null
 * @returns {Promise<string[]>}
 */
export async function renderModules(read) {
  const importMap = parseImportMap(await read('index.html') ?? '')
  const stood = /** @type {Record<string, string>} */ (STAND_INS)
  const queue = [ENTRY, VIEWER]
  const seen = new Set(queue)
  const found = []
  const optional = new Set()
  for (let path; (path = queue.shift());) {
    const source = await read(path)
    if (source === null && optional.has(path)) continue
    if (source === null) throw new Error(`render: missing ${path}`)
    found.push(path)
    const dynamic = [...source.matchAll(DYNAMIC)].map((match) => match[1] ?? match[2])
    for (const [i, specifier] of [...extractStaticImports(source), ...dynamic].entries()) {
      const resolved = resolveSpecifier(specifier, path, importMap)
      if (resolved === null) throw new Error(`render: cannot resolve '${specifier}' from ${path}`)
      const target = stood[resolved] ?? resolved
      if (i >= extractStaticImports(source).length) optional.add(target)
      else optional.delete(target)
      if (!seen.has(target)) seen.add(target), queue.push(target)
    }
  }
  return found.sort()
}

/** Every file under a path of app/, or the file itself. @param {string} root @param {string} path @returns {Promise<string[]>} */
async function under(root, path) {
  if (!(await stat(join(root, path))).isDirectory()) return [path]
  const entries = await readdir(join(root, path), { recursive: true, withFileTypes: true })
  return entries.filter((entry) => entry.isFile() && entry.name !== '.DS_Store').map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1)).sort()
}

/** The package's files, its modules first. @param {string} root app/ @param {string[]} modules */
export async function renderFiles(root, modules) {
  return [...new Set([...modules, ...(await Promise.all(ASSETS.map((path) => under(root, path)))).flat()])]
}

/**
 * What capabilities.json says of the package: its version, Jean's and a fingerprint of every file it
 * holds, which a page saved by this Jean names; its entry, its modules, whose hashes are there too, and the stand-ins.
 * @param {string} root app/ @param {(path: string) => Promise<string | null>} read
 */
export async function renderListing(root, read) {
  const files = await renderModules(read)
  const hash = createHash('sha256')
  for (const path of await renderFiles(root, files)) hash.update(`${path}\0`).update(await readFile(join(root, path)))
  const { version } = JSON.parse(await readFile(join(root, '..', 'package.json'), 'utf8'))
  return { version: `${version}-r${hash.digest('hex').slice(0, 12)}`, entry: ENTRY, viewer: VIEWER, files, map: STAND_INS }
}

async function main() {
  const listing = JSON.parse(await readFile(join(APP, 'capabilities.json'), 'utf8')).render
  if (!listing) throw new Error('render: capabilities.json lists no render package; run npm run build first')
  const out = join(ROOT, 'dist', 'render')
  const files = await renderFiles(APP, listing.files)
  for (const path of files) {
    await mkdir(dirname(join(out, path)), { recursive: true })
    await cp(join(APP, path), join(out, path))
  }
  await cp(join(ROOT, 'LICENSE'), join(out, 'LICENSE'))
  const { repository } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  await writeFile(join(out, 'package.json'), `${JSON.stringify({
    name: NAME, version: listing.version, description: 'Draws a task that Jean saved as a web page, or shared by link, with Jean\'s own files.',
    license: 'MIT', type: 'module', ...(repository && { repository }), publishConfig: { access: 'public', tag: 'latest' },
  }, null, 2)}\n`)
  await writeFile(join(out, 'README.md'), `# ${NAME}\n\nThe files with which a task Jean saved as a web page draws itself, as Jean draws it: Jean's own, as they are in its app/ folder, at the same paths, and the libraries they use, whose licences are in vendor/LICENSES. A saved page names the version it was made with.\n`)
  console.log(`render: ${NAME}@${listing.version}, ${files.length} files in dist/render; publish with npm publish ./dist/render`)
}

if (process.argv[1] === fileURLToPath(import.meta.url) && existsSync(APP)) await main()
