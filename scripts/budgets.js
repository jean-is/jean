// Checks the hard limits in budgets.json. Prints a table; exits 1 on any failure.
// Usage: npm run budgets
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { linkedStylesheets, moduleGraph, parseImportMap } from './graph.js'
import { isMissing, walk } from './manifest.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENTRY = 'ui/app.js'
const KB = 1024

// ─── Pure helpers (tested in test/manifest.test.js) ──────────────────────────

/** @param {string} text */
export function countLines (text) {
  if (!text) return 0
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

/** @param {string | Uint8Array} data */
export const gzipSize = (data) => gzipSync(data, { level: 9 }).length

// ─── File access ─────────────────────────────────────────────────────────────

/** @param {string} path */
async function readBytes (path) {
  try {
    return await readFile(join(ROOT, path))
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

/** @param {string} path */
const readText = async (path) => (await readBytes(path))?.toString('utf8') ?? null

/**
 * Sums gzip sizes of files (each compressed separately, as served).
 * @param {string[]} paths
 */
async function gzipTotal (paths) {
  let bytes = 0
  const missing = []
  for (const path of paths) {
    const data = await readBytes(path)
    if (data === null) missing.push(`missing ${path}`)
    else bytes += gzipSize(data)
  }
  return { bytes, missing }
}

/**
 * @param {string[]} dirs
 * @param {RegExp} pattern
 */
async function filesIn (dirs, pattern) {
  return (await Promise.all(dirs.map((dir) => walk(ROOT, dir)))).flat().filter((p) => pattern.test(p))
}

/** @param {string[]} paths */
async function totalLines (paths) {
  let lines = 0
  for (const path of paths) lines += countLines((await readText(path)) ?? '')
  return lines
}

/** @param {string} dir */
async function subdirectories (dir) {
  const entries = await readdir(join(ROOT, dir), { withFileTypes: true }).catch(() => [])
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort()
}

// ─── Checks ──────────────────────────────────────────────────────────────────

/**
 * @typedef {{ name: string, limit: string, actual: string, status: 'ok'|'FAIL'|'skip', notes: string[] }} Row
 */

/**
 * @param {string} name
 * @param {number} limit
 * @param {number} actual
 * @param {string[]} [notes]  any note marks the row as failed
 * @param {(n: number) => string} [format]
 * @returns {Row}
 */
function measure (name, limit, actual, notes = [], format = String) {
  const status = actual <= limit && !notes.length ? 'ok' : 'FAIL'
  return { name, limit: format(limit), actual: format(actual), status, notes }
}

/** @param {number} bytes */
const kb = (bytes) => (bytes / KB).toFixed(1)

/** @param {any} budgets */
async function checkLines (budgets) {
  const core = await filesIn(['core'], /\.m?js$/)
  const app = [
    ...await filesIn(['core', 'ui', 'caps'], /\.(m?js|html|css)$/),
    ...['brand.js', 'sw.js', 'index.html', 'sandbox.html', 'preview.html'],
  ]
  return [
    measure('lines.core', budgets.lines.core, await totalLines(core)),
    measure('lines.app', budgets.lines.app, await totalLines(app)),
    // jean-cli, which only its package has (D240).
    measure('lines.cli', budgets.lines.cli, await totalLines(await filesIn(['cli'], /\.m?js$/))),
  ]
}

/** @param {any} budgets */
async function checkDependencies (budgets) {
  const pkg = JSON.parse((await readText('package.json')) ?? '{}')
  const names = Object.keys(pkg.dependencies ?? {})
  const { max, allowed } = budgets.runtimeDependencies
  const extra = names.filter((name) => !allowed.includes(name))
  return [measure('runtimeDependencies', max, names.length, extra.map((n) => `not allowed: ${n}`))]
}

/** Each person loads one catalog, their own (core/i18n.js), so the first load counts the largest. Its dialogs' part loads with them (D97). */
async function largestLocale () {
  let largest = 'locales/en.json'
  let size = 0
  for (const path of await filesIn(['locales'], /^locales\/[^/]+\.json$/)) {
    const { bytes } = await gzipTotal([path])
    if (bytes > size) [largest, size] = [path, bytes]
  }
  return largest
}

/** @param {any} budgets */
async function checkFirstLoad (budgets) {
  const html = await readText('index.html')
  if (html === null) {
    return [
      measure('gzipKB.firstLoad', budgets.gzipKB.firstLoad * KB, 0, ['missing index.html'], kb),
      measure('gzipKB.css', budgets.gzipKB.css * KB, 0, [], kb),
    ]
  }
  let importMap = { imports: {} }
  const notes = []
  try {
    importMap = parseImportMap(html)
  } catch (error) {
    notes.push(`import map: ${/** @type {Error} */ (error).message}`)
  }
  const styles = linkedStylesheets(html)
  const graph = await moduleGraph(ENTRY, importMap, readText)
  const css = await gzipTotal(styles)
  const locale = await largestLocale()
  const rest = await gzipTotal(['index.html', locale, ...graph.found])
  notes.push(...css.missing, ...rest.missing, ...graph.problems)
  return [
    measure(`gzipKB.firstLoad with ${locale}`, budgets.gzipKB.firstLoad * KB, css.bytes + rest.bytes, notes, kb),
    measure('gzipKB.css', budgets.gzipKB.css * KB, css.bytes, css.missing, kb),
  ]
}

/**
 * One row per item, or a single skipped row when there is nothing to measure.
 * @param {string} name
 * @param {number} limit  bytes
 * @param {Array<[string, number]>} items  [label, bytes]
 * @returns {Row[]}
 */
function perItem (name, limit, items) {
  if (!items.length) return [{ name, limit: kb(limit), actual: '-', status: 'skip', notes: ['nothing to measure yet'] }]
  return items.map(([label, bytes]) => measure(`${name} ${label}`, limit, bytes, [], kb))
}

/** @param {any} budgets */
async function checkAssets (budgets) {
  const locales = (await filesIn(['locales'], /^locales\/([\w-]+\/)?[^/]+\.json$/)).sort()
  const caps = await subdirectories('caps')
  const fonts = (await filesIn(['fonts'], /^fonts\/[^/]+\.woff2$/)).sort()
  /** @type {Array<[string, number]>} */
  const localeSizes = []
  for (const path of locales) localeSizes.push([path, (await gzipTotal([path])).bytes])
  /** @type {Array<[string, number]>} */
  const capSizes = []
  for (const id of caps) capSizes.push([`caps/${id}`, (await gzipTotal(await filesIn([`caps/${id}`], /\.m?js$/))).bytes])
  /** @type {Array<[string, number]>} */
  const fontSizes = []
  for (const path of fonts) fontSizes.push([path, (await readBytes(path))?.length ?? 0])
  return [
    ...perItem('gzipKB.locale', budgets.gzipKB.locale * KB, localeSizes),
    ...perItem('gzipKB.capabilityCode', budgets.gzipKB.capabilityCode * KB, capSizes),
    ...perItem('fontKB.display', budgets.fontKB.display * KB, fontSizes),
  ]
}

/**
 * @param {any} budgets
 * @returns {Promise<Row[]>}
 */
async function checkPrompt (budgets) {
  const name = 'systemPromptTokens.base'
  const limit = budgets.systemPromptTokens.base
  const skip = (/** @type {string} */ note) => [{ name, limit: String(limit), actual: '-', status: /** @type {const} */ ('skip'), notes: [note] }]
  if (await readBytes('core/prompt.js') === null) return skip('warning: core/prompt.js not found')
  try {
    const module = await import(pathToFileURL(join(ROOT, 'core/prompt.js')).href)
    if (typeof module.basePromptForBudget !== 'function') return skip('warning: core/prompt.js has no basePromptForBudget() export')
    const prompt = String(await module.basePromptForBudget())
    return [measure(name, limit, Math.ceil(prompt.length / 4))]
  } catch (error) {
    return [measure(name, limit, 0, [`core/prompt.js: ${/** @type {Error} */ (error).message}`])]
  }
}

/** @param {Row[]} rows */
function printTable (rows) {
  const width = Math.max(...rows.map((r) => r.name.length), 6) + 2
  console.log(`${'budget'.padEnd(width)}${'limit'.padStart(9)}${'actual'.padStart(9)}  status`)
  for (const row of rows) {
    console.log(`${row.name.padEnd(width)}${row.limit.padStart(9)}${row.actual.padStart(9)}  ${row.status}`)
    for (const note of row.notes) console.log(`  - ${note}`)
  }
}

async function main () {
  const budgets = JSON.parse((await readText('budgets.json')) ?? 'null')
  if (!budgets) throw new Error('budgets.json not found')
  const rows = [
    ...await checkLines(budgets),
    ...await checkDependencies(budgets),
    ...await checkFirstLoad(budgets),
    ...await checkAssets(budgets),
    ...await checkPrompt(budgets),
  ]
  printTable(rows)
  const failed = rows.filter((r) => r.status === 'FAIL').length
  console.log(failed ? `\n${failed} budget(s) over or unmeasurable.` : '\nAll budgets met. (KB = 1024 bytes, gzip level 9 per file.)')
  if (failed) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`budgets: ${error.message}`)
    process.exit(1)
  })
}
