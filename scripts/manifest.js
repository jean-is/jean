// Generates manifest.webmanifest and capabilities.json (content hashes) in app/, writes
// a modulepreload link for every module of the first load into index.html,
// stamps the resulting version into sw.js so that any asset change produces a
// byte-different service worker, which is what triggers an update, and copies
// LICENSE beside them, so that app/ is the whole of a deploy (D243).
// Usage: npm run manifest              write the outputs
//        npm run manifest -- --check   exit 1 if a committed output is stale (CI)
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LOCALES, dir } from '../app/core/i18n.js'
import { extractStaticImports, moduleGraph, parseImportMap, resolveSpecifier } from './graph.js'
import { ENTRY as READER, renderListing } from './render.js'

/** The folder a deploy serves (D243): every path here is relative to it. */
const APP = fileURLToPath(new URL('../app', import.meta.url))

export const SHELL_FILES = ['index.html', 'sandbox.html', 'preview.html', 'brand.js', 'manifest.webmanifest']
export const SHELL_DIRS = ['core', 'ui', 'vendor', 'fonts', 'icons']
export const WEBMANIFEST = 'manifest.webmanifest'
/** Outputs that are entirely generated and never committed (D74); `--check` skips them. */
export const UNCOMMITTED = [...LOCALES.map((lang) => manifestOf(lang)), 'capabilities.json', 'LICENSE']
export const ENTRY = 'ui/app.js'
/** On-demand runtimes (D52) belong to the capabilities that use them, never to the shell. */
export const CAPABILITY_RUNTIMES = /** @type {Record<string, string[]>} */ ({
  files: ['vendor/pdfjs', 'vendor/ooxml'],
  'brain-local': ['vendor/transformers'],
  voice: ['vendor/transformers'],
  reflexes: ['vendor/transformers'],
  computer: ['vendor/just-bash', 'vendor/quickjs', 'vendor/pyodide'],
  live: ['vendor/transformers'],
  pictures: ['vendor/transformers'],
  meaning: ['vendor/transformers'],
  reader: ['vendor/transformers'],
  math: ['vendor/temml'],
  charts: ['vendor/echarts'],
  scores: ['vendor/abcjs', 'vendor/spessasynth', 'vendor/sounds'],
  share: ['vendor/lean-qr'],
  documents: ['vendor/prosemirror'],
  // Not a runtime, but on demand as one: the enterprise integrations, which only their loader imports (D139).
  enterprise: ['ee'],
  // No capability of its own: a page that holds a map fetches it then, as it does the map's tiles (D291).
  maps: ['vendor/maplibre'],
})
const RUNTIME_DIRS = [...new Set(Object.values(CAPABILITY_RUNTIMES).flat())]
/** Fetched one at a time when first needed, and kept apart from app versions, never precached: a score's instruments (D338). */
const ON_DEMAND = /^vendor\/sounds\/.+\.sf3$/
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
/**
 * What each language's screenshots show, their labels and, but for English's, which is index.html's, the
 * install's description: `scripts/screenshots/<lang>.json`, which only scripts read.
 */
export const SHOTS = fileURLToPath(new URL('screenshots/', import.meta.url))
/** @param {string} lang @returns {Promise<{ labels: Record<string, string>, description?: string } & Record<string, any>>} */
export const shotsOf = async (lang) => JSON.parse(await readFile(join(SHOTS, `${lang}.json`), 'utf8'))
/**
 * What the richer install dialog shows (D168, D396), in each of Jean's languages: the welcome screen, a
 * spreadsheet drawn as a chart, a document answered with its sources and a task shared by a link, wide
 * for desktops and narrow for phones (`npm run screenshots` takes them). WebP, which Chromium decodes
 * here as anywhere: half a JPEG's weight. Like the install icons, only the browser fetches them, so
 * the shell doesn't precache them.
 */
export const PAGES = ['welcome', 'chart', 'sources', 'share']
export const FORMS = /** @type {Record<string, string>} */ ({ wide: '1440x900', narrow: '824x1784' })
/** @param {string} lang @param {Record<string, string>} labels @param {string} [up] the way back to app/ */
export const screenshotsOf = (lang, labels, up = '') => Object.entries(FORMS).flatMap(([form, sizes]) => PAGES.map((page) =>
  ({ src: `${up}screenshots/${lang}/${page}-${form}.webp`, sizes, type: 'image/webp', form_factor: form, label: labels[page] })))
const ENGLISH = (await shotsOf('en')).labels
/**
 * The manifest for a language: English's is the one index.html names; Jean points to its own
 * language's once it knows it, so a browser's install dialog shows it in that language (D396).
 * @param {string} lang
 */
export function manifestOf (lang) {
  return lang === 'en' ? WEBMANIFEST : `manifests/${lang}.webmanifest`
}
/**
 * What a link to the site shows where it is shared (D355): the welcome screen again, at Open Graph's
 * 1200 × 630, its drawer closed, so the question stands in the middle. Only those sites fetch it.
 */
export const SHARE = { src: 'screenshots/share.jpg', width: 1200, height: 630, alt: ENGLISH.welcome }
export const VERSION_LINE = /^const VERSION = '.*'$/m

/** @param {unknown} error */
export const isMissing = (error) => /** @type {{ code?: string }} */ (error)?.code === 'ENOENT'

/**
 * Whether a root-relative path belongs in a deployable cache list. Markdown isn't, but for the
 * skills of Jean's own directory (D196).
 * @param {string} path  posix path relative to the app root
 */
export function isShipped (path) {
  const segments = path.split('/')
  const name = segments[segments.length - 1]
  return segments.every((s) => !s.startsWith('.')) && (name === 'SKILL.md' || !/\.(md|map)$|\.d\.ts$/.test(name))
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
  const caps = (await readdir(join(root, 'caps'), { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
  // A part of the catalogue that is no capability's (the dialogs', Settings' Brains', D514) comes with the shell.
  const locales = (await walk(root, 'locales')).filter((p) => /^locales\/([^/]+\/)?[^/]+\.json$/.test(p) && !caps.some((entry) => p.startsWith(`locales/${entry.name}/`))).sort()
  /** @type {Record<string, { files: string[] }>} */
  const capabilities = {}
  for (const entry of caps) {
    const dirs = [`caps/${entry.name}`, `locales/${entry.name}`, ...(CAPABILITY_RUNTIMES[entry.name] ?? [])]
    const files = (await Promise.all(dirs.map((dir) => walk(root, dir)))).flat().filter((path) => isShipped(path) && !ON_DEMAND.test(path)).sort()
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
 * `id` is what browsers already derive from `start_url`, so installs made before it keep theirs. It is
 * read against the origin, so every language's manifest names the same app; their other addresses
 * climb back from manifests/ to app/.
 * @param {{ name: string }} brand
 * @param {string} [description]  in that language: English's is index.html's, so the page and the install say the same sentence
 * @param {string} [lang]  the language of its description and screenshots, which its `lang` and `dir` say
 * @param {Record<string, string>} [labels]  theirs, in that language
 */
export function buildWebmanifest (brand, description, lang = 'en', labels = ENGLISH) {
  const up = lang === 'en' ? '' : '../'
  const manifest = {
    id: './',
    name: brand.name,
    short_name: brand.name,
    ...(description ? { description } : {}),
    lang,
    dir: dir(lang),
    start_url: up || './',
    scope: up || './',
    display: 'standalone',
    background_color: '#131313',
    theme_color: '#131313',
    icons: ICONS.map((icon) => ({ ...icon, src: up + icon.src })),
    screenshots: screenshotsOf(lang, labels, up),
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
 * @param {(Awaited<ReturnType<typeof renderListing>> & { integrity: Record<string, string> }) | null} [render]  the render package, when there is a reader (D305)
 */
export function buildCapabilities (version, shell, locales, integrity = {}, capabilities = {}, render = null) {
  return `${JSON.stringify({ format: 2, version, shell, locales, integrity, capabilities, ...(render && { render }) }, null, 2)}\n`
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
  const links = paths.map((path) => /* html */ `<link rel="modulepreload" href="${path}">\n`).join('')
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
export async function plan (root = APP) {
  const { BRAND } = await import(pathToFileURL(join(root, 'brand.js')).href)
  const html = (await readOrNull(root, 'index.html'))?.toString('utf8')
  const description = html && /<meta name="description" content="([^"]*)">/.exec(html)?.[1]
  /** @type {Record<string, string>} */
  const generated = {}
  for (const lang of LOCALES) {
    const shots = await shotsOf(lang)
    generated[manifestOf(lang)] = buildWebmanifest(BRAND, lang === 'en' ? description || undefined : shots.description, lang, shots.labels)
  }
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
  /** @param {string} path */
  const text = async (path) => (generated[path] ?? await readOrNull(root, path))?.toString('utf8') ?? null
  const integrity = Object.fromEntries(hashes.map(([path, hash]) => [path, integrityOf(hash)]))
  // Its modules' hashes as the package holds them, which a web deploy's minified files no longer match (D318).
  const listing = await readOrNull(root, READER) ? await renderListing(root, text) : null
  const render = listing && { ...listing, integrity: Object.fromEntries(listing.files.map((path) => [path, integrity[path]])) }
  const sw = await readOrNull(root, 'sw.js')
  const stamped = sw && stampVersion(sw.toString('utf8'), version)
  if (!stamped) throw new Error("sw.js is missing or has no `const VERSION = '…'` line")
  const licence = await readOrNull(join(root, '..'), 'LICENSE')
  return {
    version,
    files: shell.length + locales.length + capabilityFiles.length,
    outputs: {
      ...generated,
      'capabilities.json': buildCapabilities(version, shell, locales, integrity, capabilities, render),
      'sw.js': stamped,
      ...(licence ? { LICENSE: licence.toString('utf8') } : {}),
    },
  }
}

/** @param {string[]} argv */
async function main (argv) {
  const check = argv.includes('--check')
  const { version, files, outputs: planned } = await plan()
  // The site's pages every copy has (site/, D438): the privacy policy, the terms and where files go, in each language.
  const [{ shippedPages }, { shippedFiles }] = await Promise.all([import('../site/site.js'), import('./desktop.js')])
  const site = await shippedPages(await shippedFiles(APP))
  const outputs = { ...planned, ...site }
  const stale = []
  for (const [path, content] of Object.entries(outputs)) {
    if (check && (UNCOMMITTED.includes(path) || path in site)) continue
    const current = await readOrNull(APP, path)
    if (current?.toString('utf8') === content) continue
    stale.push(path)
    if (!check) await mkdir(dirname(join(APP, path)), { recursive: true }).then(() => writeFile(join(APP, path), content))
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
