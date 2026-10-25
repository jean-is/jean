// Checks the hard limits in budgets.json. Prints a table; exits 1 on any failure.
// Usage: npm run budgets
//        node scripts/budgets.js --short   a line or two, as the development server says them (D244)
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { linkedStylesheets, moduleGraph, parseImportMap } from './graph.js'
import { countLoc } from './loc.js'
import { isMissing, walk } from './manifest.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
/** What a deploy serves (D243), which every budget but jean-cli's measures. */
const APP = join(ROOT, 'app')
const ENTRY = 'ui/app.js'
const KB = 1024

// ─── Pure helpers (tested in test/manifest.test.js) ──────────────────────────

/** @param {string | Uint8Array} data */
export const gzipSize = (data) => gzipSync(data, { level: 9 }).length

// ─── File access ─────────────────────────────────────────────────────────────

/** @param {string} path @param {string} [root] */
async function readBytes (path, root = APP) {
  try {
    return await readFile(join(root, path))
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

/** @param {string} path @param {string} [root] */
const readText = async (path, root = APP) => (await readBytes(path, root))?.toString('utf8') ?? null

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
 * @param {string} [root]
 */
async function filesIn (dirs, pattern, root = APP) {
  return (await Promise.all(dirs.map((dir) => walk(root, dir)))).flat().filter((p) => pattern.test(p))
}

/** Their lines of code (scripts/loc.js, D246). @param {string[]} paths @param {string} [root] */
async function totalLoc (paths, root = APP) {
  let loc = 0
  for (const path of paths) loc += countLoc((await readText(path, root)) ?? '', path)
  return loc
}

/** @param {string} dir */
async function subdirectories (dir) {
  const entries = await readdir(join(APP, dir), { withFileTypes: true }).catch(() => [])
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort()
}

// ─── Checks ──────────────────────────────────────────────────────────────────

/**
 * @typedef {{ name: string, limit: string, actual: string, status: 'ok'|'FAIL'|'skip', notes: string[], share?: number }} Row
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
  return { name, limit: format(limit), actual: format(actual), status, notes, share: actual / limit }
}

/** @param {number} bytes */
const kb = (bytes) => (bytes / KB).toFixed(1)

/** @param {any} budgets */
async function checkLoc (budgets) {
  const core = await filesIn(['core'], /\.m?js$/)
  const app = [
    ...await filesIn(['core', 'ui', 'caps'], /\.(m?js|html|css)$/),
    ...['brand.js', 'sw.js', 'index.html', 'sandbox.html', 'preview.html', 'check.html', 'policy.html', 'demo.html'],
  ]
  return [
    measure('loc.core', budgets.loc.core, await totalLoc(core)),
    measure('loc.app', budgets.loc.app, await totalLoc(app)),
    // jean-cli, which only its package has (D240).
    measure('loc.cli', budgets.loc.cli, await totalLoc(await filesIn(['cli'], /\.m?js$/, ROOT), ROOT)),
  ]
}

/** @param {any} budgets */
async function checkDependencies (budgets) {
  const pkg = JSON.parse((await readText('package.json', ROOT)) ?? '{}')
  const names = Object.keys(pkg.dependencies ?? {})
  const { max, allowed } = budgets.runtimeDependencies
  const extra = names.filter((name) => !allowed.includes(name))
  // A list of names allowed, never nearly full.
  return [{ ...measure('runtimeDependencies', max, names.length, extra.map((n) => `not allowed: ${n}`)), share: undefined }]
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
  const fonts = (await filesIn(['fonts'], /^fonts\/[^/]+\.woff2$/)).sort(), faces = await filesIn(['caps/designs/fonts'], /\.woff2$/)
  /** @type {Array<[string, number]>} */
  const localeSizes = []
  for (const path of locales) localeSizes.push([path, (await gzipTotal([path])).bytes])
  /** @type {Array<[string, number]>} */
  const capSizes = []
  for (const id of caps) capSizes.push([`caps/${id}`, (await gzipTotal(await filesIn([`caps/${id}`], /\.m?js$/))).bytes])
  /** @type {Array<[string, number]>} */
  const fontSizes = []
  for (const path of fonts) fontSizes.push([path, (await readBytes(path))?.length ?? 0])
  // deck's module and style sheet as vendored, which the first deck loads (D597); none to measure without deck installed.
  const deck = await gzipTotal(['vendor/deck/deck.mjs', 'vendor/deck/deck.css'])
  return [
    deck.missing.length ? { name: 'gzipKB.deck', limit: kb(budgets.gzipKB.deck * KB), actual: '-', status: /** @type {const} */ ('skip'), notes: ['deck is not installed'] } : measure('gzipKB.deck', budgets.gzipKB.deck * KB, deck.bytes, [], kb),
    ...perItem('gzipKB.locale', budgets.gzipKB.locale * KB, localeSizes),
    ...perItem('gzipKB.capabilityCode', budgets.gzipKB.capabilityCode * KB, capSizes),
    ...perItem('fontKB.display', budgets.fontKB.display * KB, fontSizes),
    // Designs' faces, all of them together, whichever a page fetches (D577).
    measure('fontKB.designs', budgets.fontKB.designs * KB, (await Promise.all(faces.map(async (path) => (await readBytes(path))?.length ?? 0))).reduce((sum, bytes) => sum + bytes, 0), [], kb),
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
    const module = await import(pathToFileURL(join(APP, 'core/prompt.js')).href)
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

/**
 * What the development server says (D244): each budget over, else those within 2% of their limit.
 * @param {Row[]} rows
 */
export function brief (rows) {
  const failed = rows.filter((r) => r.status === 'FAIL')
  if (failed.length) return [...failed.map((r) => `budgets: FAILED ${r.name}: ${r.actual} of ${r.limit}${r.notes.map((note) => `; ${note}`).join('')}`), 'Going over a limit means deleting something first (AGENTS.md).'].join('\n')
  const full = rows.filter((r) => (r.share ?? 0) >= 0.98)
  return `budgets: all met${full.length ? `; nearly full: ${full.map((r) => `${r.name} ${r.actual} of ${r.limit}`).join(', ')}` : ''}`
}

async function main () {
  const budgets = JSON.parse((await readText('budgets.json', ROOT)) ?? 'null')
  if (!budgets) throw new Error('budgets.json not found')
  const rows = [
    ...await checkLoc(budgets),
    ...await checkDependencies(budgets),
    ...await checkFirstLoad(budgets),
    ...await checkAssets(budgets),
    ...await checkPrompt(budgets),
  ]
  const failed = rows.filter((r) => r.status === 'FAIL').length
  if (process.argv.includes('--short')) console.log(brief(rows))
  else {
    printTable(rows)
    console.log(failed ? `\n${failed} budget(s) over or unmeasurable.` : '\nAll budgets met. (KB = 1024 bytes, gzip level 9 per file.)')
  }
  if (failed) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`budgets: ${error.message}`)
    process.exit(1)
  })
}
