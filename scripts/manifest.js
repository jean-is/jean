// Generates manifest.webmanifest and capabilities.json (content hashes), and
// stamps the resulting version into sw.js so that any asset change produces a
// byte-different service worker, which is what triggers an update.
// Usage: npm run manifest              write the outputs
//        npm run manifest -- --check   exit 1 if any output is stale (CI)
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

export const SHELL_FILES = ['index.html', 'brand.js', 'manifest.webmanifest']
export const SHELL_DIRS = ['core', 'ui', 'vendor', 'fonts', 'icons']
export const WEBMANIFEST = 'manifest.webmanifest'
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
 * Collects the files the service worker precaches. The web manifest is always
 * listed, because this script generates it.
 * @param {string} root
 */
export async function collectFiles (root) {
  const top = []
  for (const file of SHELL_FILES) {
    if (file === WEBMANIFEST || await readOrNull(root, file) !== null) top.push(file)
  }
  const nested = (await Promise.all(SHELL_DIRS.map((dir) => walk(root, dir)))).flat()
  const shell = [...top, ...nested].filter(isShipped).sort()
  const locales = (await walk(root, 'locales')).filter((p) => /^locales\/[^/]+\.json$/.test(p)).sort()
  return { shell, locales }
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

/** @param {{ name: string }} brand */
export function buildWebmanifest (brand) {
  const manifest = {
    name: brand.name,
    short_name: brand.name,
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#120c08',
    theme_color: '#120c08',
    icons: [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * @param {string} version
 * @param {string[]} shell
 * @param {string[]} locales
 */
export function buildCapabilities (version, shell, locales) {
  return `${JSON.stringify({ format: 1, version, shell, locales, capabilities: {} }, null, 2)}\n`
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
  const webmanifest = buildWebmanifest(BRAND)
  const { shell, locales } = await collectFiles(root)
  /** @type {Array<[string, string]>} */
  const hashes = []
  for (const path of [...shell, ...locales]) {
    const data = path === WEBMANIFEST ? webmanifest : await readFile(join(root, path))
    hashes.push([path, sha256(data)])
  }
  const version = computeVersion(hashes)
  const sw = await readOrNull(root, 'sw.js')
  const stamped = sw && stampVersion(sw.toString('utf8'), version)
  if (!stamped) throw new Error("sw.js is missing or has no `const VERSION = '…'` line")
  return {
    version,
    files: shell.length + locales.length,
    outputs: {
      [WEBMANIFEST]: webmanifest,
      'capabilities.json': buildCapabilities(version, shell, locales),
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
