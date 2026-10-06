// Generates manifest.webmanifest and capabilities.json (content hashes), writes
// a modulepreload link for every module of the first load into index.html, and
// stamps the resulting version into sw.js so that any asset change produces a
// byte-different service worker, which is what triggers an update.
// Usage: npm run manifest              write the outputs
//        npm run manifest -- --check   exit 1 if a committed output is stale (CI)
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { extractStaticImports, moduleGraph, parseImportMap, resolveSpecifier } from './graph.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

export const SHELL_FILES = ['index.html', 'sandbox.html', 'preview.html', 'brand.js', 'manifest.webmanifest']
export const SHELL_DIRS = ['core', 'ui', 'vendor', 'fonts', 'icons']
export const WEBMANIFEST = 'manifest.webmanifest'
/** Outputs that are entirely generated and never committed (D74); `--check` skips them. */
export const UNCOMMITTED = [WEBMANIFEST, 'capabilities.json']
export const ENTRY = 'ui/app.js'
/** On-demand runtimes (D52) belong to the capabilities that use them, never to the shell. */
export const CAPABILITY_RUNTIMES = /** @type {Record<string, string[]>} */ ({
  files: ['vendor/pdfjs'],
  'brain-local': ['vendor/transformers'],
  voice: ['vendor/transformers'],
  reflexes: ['vendor/transformers'],
  computer: ['vendor/just-bash', 'vendor/quickjs', 'vendor/pyodide'],
  live: ['vendor/transformers'],
})
const RUNTIME_DIRS = [...new Set(Object.values(CAPABILITY_RUNTIMES).flat())]
/** Drawn for installs (D131): only the browser or the system fetches them, once, so the shell doesn't precache them. */
const INSTALL_ICON = /^icons\/.+\.png$/
/**
 * The SVG for desktops, PNGs for Android, which can't install with an SVG (`npm run icons`
 * draws them). The drawing sits inside the maskable safe zone (D78), so the 512 serves both.
 */
export const ICONS = [
  { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]
const SCREENSHOT_LABEL = 'The welcome screen: ideas to start from, and a box to ask anything'
/**
 * What the richer install dialog shows (D168): the welcome screen, wide for desktops and narrow
 * for phones (`npm run screenshots` takes them). JPEGs, as the glow makes PNGs five times heavier.
 * Like the install icons, only the browser fetches them, so the shell doesn't precache them.
 */
export const SCREENSHOTS = [
  { src: 'screenshots/wide.jpg', sizes: '1280x800', type: 'image/jpeg', form_factor: 'wide', label: SCREENSHOT_LABEL },
  { src: 'screenshots/narrow.jpg', sizes: '824x1784', type: 'image/jpeg', form_factor: 'narrow', label: SCREENSHOT_LABEL },
]
export const VERSION_LINE = /^const VERSION = '.*'$/m

/** @param {unknown} error */
export const isMissing = (error) => /** @type {{ code?: string }} */ (error)?.code === 'ENOENT'

/**
 * Whether a root-relative path belongs in a deployable cache list.
 * @param {string} path  posix path relative to the app root
 */
export function isShipped (path) {
  const segments = path.split('/')
  const name = segments[segments.length - 1]
  return segments.every((s) => !s.startsWith('.')) && !/\.(md|map)$|\.d\.ts$/.test(name)
}

/**
 * Lists files under `dir` recursively as posix paths relative to `root`.
 * A missing directory yields an empty list. Dotfiles and dot-directories are skipped.
 * @param {string} root
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
export async function walk (root, dir) {
  let entries
  try {
    entries = await readdir(join(root, dir), { withFileTypes: true })
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
  const paths = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) paths.push(...await walk(root, path))
    else if (entry.isFile()) paths.push(path)
  }
  return paths
}

/**
 * @param {string} root
 * @param {string} path
 */
async function readOrNull (root, path) {
  try {
    return await readFile(join(root, path))
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

/**
 * Collects the files the service worker precaches: the shell and locales on install,
 * each capability's files (its runtimes and its own strings, locales/<id>/, included) when
 * it is unlocked. The web manifest is always listed, because this script generates it.
 * @param {string} root
 */
export async function collectFiles (root) {
  const top = []
  for (const file of SHELL_FILES) {
    if (file === WEBMANIFEST || await readOrNull(root, file) !== null) top.push(file)
  }
  const nested = (await Promise.all(SHELL_DIRS.map((dir) => walk(root, dir)))).flat()
  const inRuntime = (/** @type {string} */ path) => RUNTIME_DIRS.some((dir) => path.startsWith(`${dir}/`))
  const shell = [...top, ...nested].filter((path) => isShipped(path) && !inRuntime(path) && !INSTALL_ICON.test(path)).sort()
  const locales = (await walk(root, 'locales')).filter((p) => /^locales\/(dialogs\/)?[^/]+\.json$/.test(p)).sort()
  /** @type {Record<string, { files: string[] }>} */
  const capabilities = {}
  for (const entry of await readdir(join(root, 'caps'), { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dirs = [`caps/${entry.name}`, `locales/${entry.name}`, ...(CAPABILITY_RUNTIMES[entry.name] ?? [])]
    const files = (await Promise.all(dirs.map((dir) => walk(root, dir)))).flat().filter(isShipped).sort()
    capabilities[entry.name] = { files: [...new Set([...files, ...await borrowed(root, entry.name, files)])].sort() }
  }
  return { shell, locales, capabilities: Object.fromEntries(Object.entries(capabilities).sort(([a], [b]) => (a < b ? -1 : 1))) }
}

/**
 * The modules of other capabilities that a capability's own import, statically, and theirs: they
 * are cached with it, so it works offline whether or not the other is on (the Computer reads
 * files as Folders does).
 * @param {string} root @param {string} id @param {string[]} files
 */
async function borrowed (root, id, files) {
  const queue = files.filter((path) => /\.m?js$/.test(path) && path.startsWith(`caps/${id}/`))
  for (const path of queue) {
    for (const specifier of extractStaticImports((await readOrNull(root, path))?.toString('utf8') ?? '')) {
      const target = resolveSpecifier(specifier, path)
      if (target?.startsWith('caps/') && !queue.includes(target)) queue.push(target)
    }
  }
  return queue.filter((path) => !path.startsWith(`caps/${id}/`))
}

/** @param {string | Uint8Array} data */
export function sha256 (data) {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Version = first 12 hex chars of SHA-256 over the sorted `path:hash` lines.
 * @param {Array<[string, string]>} entries  [path, hash] pairs
 */
export function computeVersion (entries) {
  const lines = entries.map(([path, hash]) => `${path}:${hash}`).sort()
  return sha256(lines.join('\n')).slice(0, 12)
}

/**
 * `id` is what browsers already derive from `start_url`, so installs made before it keep theirs.
 * @param {{ name: string }} brand
 * @param {string} [description]  index.html's, so the page and the install say the same sentence
 */
export function buildWebmanifest (brand, description) {
  const manifest = {
    id: './',
    name: brand.name,
    short_name: brand.name,
    ...(description ? { description } : {}),
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#120c08',
    theme_color: '#120c08',
    icons: ICONS,
    screenshots: SCREENSHOTS,
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * Subresource Integrity value for a hex SHA-256.
 * @param {string} hex
 */
export const integrityOf = (hex) => `sha256-${Buffer.from(hex, 'hex').toString('base64')}`

/**
 * @param {string} version
 * @param {string[]} shell
 * @param {string[]} locales
 * @param {Record<string, string>} integrity  path → Subresource Integrity value
 * @param {Record<string, { files: string[] }>} [capabilities]
 */
export function buildCapabilities (version, shell, locales, integrity = {}, capabilities = {}) {
  return `${JSON.stringify({ format: 2, version, shell, locales, integrity, capabilities }, null, 2)}\n`
}

const PRELOAD_LINE = /^<link rel="modulepreload" href="[^"]*">\n/gm
const MODULE_SCRIPT = /^<script type="module"/m

/**
 * Replaces index.html's modulepreload links with one per path, just before the
 * module script, so the browser fetches the whole first-load graph in one round
 * trip instead of discovering it one import level at a time. Returns null if
 * there is no module script.
 * @param {string} html
 * @param {string[]} paths
 */
export function stampPreloads (html, paths) {
  const stripped = html.replace(PRELOAD_LINE, '')
  if (!MODULE_SCRIPT.test(stripped)) return null
  const links = paths.map((path) => `<link rel="modulepreload" href="${path}">\n`).join('')
  return stripped.replace(MODULE_SCRIPT, (tag) => links + tag)
}

/**
 * Rewrites the `const VERSION = '…'` line. Returns null if the line is absent.
 * @param {string} source
 * @param {string} version
 */
export function stampVersion (source, version) {
  if (!VERSION_LINE.test(source)) return null
  return source.replace(VERSION_LINE, `const VERSION = '${version}'`)
}

/**
 * Computes every output without writing anything.
 * @param {string} root
 */
export async function plan (root = ROOT) {
  const { BRAND } = await import(pathToFileURL(join(root, 'brand.js')).href)
  const html = (await readOrNull(root, 'index.html'))?.toString('utf8')
  const description = html && /<meta name="description" content="([^"]*)">/.exec(html)?.[1]
  /** @type {Record<string, string>} */
  const generated = { [WEBMANIFEST]: buildWebmanifest(BRAND, description || undefined) }
  if (html) {
    /** @param {string} path */
    const read = async (path) => (await readOrNull(root, path))?.toString('utf8') ?? null
    const { found } = await moduleGraph(ENTRY, parseImportMap(html), read)
    const stamped = stampPreloads(html, found)
    if (!stamped) throw new Error('index.html has no <script type="module"> line')
    generated['index.html'] = stamped
  }
  const { shell, locales, capabilities } = await collectFiles(root)
  const capabilityFiles = [...new Set(Object.values(capabilities).flatMap((c) => c.files))].sort()
  /** @type {Array<[string, string]>} */
  const hashes = []
  for (const path of [...shell, ...locales, ...capabilityFiles]) {
    const data = generated[path] ?? await readFile(join(root, path))
    hashes.push([path, sha256(data)])
  }
  const version = computeVersion(hashes)
  const integrity = Object.fromEntries(hashes.map(([path, hash]) => [path, integrityOf(hash)]))
  const sw = await readOrNull(root, 'sw.js')
  const stamped = sw && stampVersion(sw.toString('utf8'), version)
  if (!stamped) throw new Error("sw.js is missing or has no `const VERSION = '…'` line")
  return {
    version,
    files: shell.length + locales.length + capabilityFiles.length,
    outputs: {
      ...generated,
      'capabilities.json': buildCapabilities(version, shell, locales, integrity, capabilities),
      'sw.js': stamped,
    },
  }
}

/** @param {string[]} argv */
async function main (argv) {
  const check = argv.includes('--check')
  const { version, files, outputs } = await plan()
  const stale = []
  for (const [path, content] of Object.entries(outputs)) {
    if (check && UNCOMMITTED.includes(path)) continue
    const current = await readOrNull(ROOT, path)
    if (current?.toString('utf8') === content) continue
    stale.push(path)
    if (!check) await writeFile(join(ROOT, path), content)
  }
  if (check && stale.length) {
    console.error(`manifest: out of date: ${stale.join(', ')}. Run \`npm run manifest\` and commit the result.`)
    process.exit(1)
  }
  const verb = check ? 'checked' : 'wrote'
  console.log(`manifest: version ${version}, ${files} files; ${stale.length ? `${verb} ${stale.join(', ')}` : 'up to date'}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`manifest: ${error.message}`)
    process.exit(1)
  })
}
