// SPDX-License-Identifier: MIT
// Only the browser tests a change affects (D772), for a run here; GitHub's CI runs them all. Jean has no build step, so each
// module, style sheet and words its pages load is a request of its own: each test keeps what its pages asked the test
// servers for (test/helpers.js's `test`, through every context it opens, frames and workers included). As Playwright's
// reporter, this keeps, by spec and engine, the files those requests read, those the spec reads in Node (its imports, the
// fixtures it names) and those every spec reads (EVERY), each with its hash as the run read it, in test/.cache/affected.json,
// which any run writes again. Given a base, the specs a change affects are those with a file that changed since the base
// (its merge base with HEAD, the working tree and new files included) or since that spec's run, and those never kept whole
// or that failed.
// Usage: node scripts/affected.js [<base>]   which specs a change since <base> affects (origin/main by default), and why
//        AFFECTED=<base> npm run e2e           runs only those (AFFECTED=1: since origin/main), as npm run ci -- --affected does
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { extractStaticImports } from './graph.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
/** Where the runs' record is kept, from the repository's root: a cache, which a run without it rebuilds (AGENTS.md). */
export const KEPT = 'test/.cache/affected.json'
const FORMAT = 1
export const BASE = 'origin/main'

/**
 * The browser tests' servers by port (test/playwright.config.js), and what each runs beyond Jean's own files, which any
 * of them may serve: the gateway, the share host, jean.is's pages, the relay. Jean's (4180, 4184), the fake brain's and
 * the fake mail's are in what every spec reads.
 */
export const SERVERS = /** @type {Record<string, string[]>} */ ({ 4180: [], 4181: [], 4182: [], 4183: ['gateway/serve.js'], 4184: [], 4185: ['scripts/host.js', 'host/serve.js'], 4186: ['site/'], 4187: ['relay/serve.js'] })
/**
 * What every spec reads, each with what it imports (closure()'s shallow reading): the config, the servers every run starts,
 * Playwright, and what builds app/'s files that git doesn't hold.
 */
export const EVERY = ['package.json', 'package-lock.json', '.nvmrc', 'test/playwright.config.js', 'scripts/serve.js', 'scripts/vendor.js', 'test/fixtures/fake-brain.js', 'test/fixtures/fake-mail.js']
/** What a build writes in app/ from the rest (D74), which every page reads and any change changes: capabilities.json holds every file's hash. */
const BUILT = /^(?:vendor\/|capabilities\.json$|manifest\.webmanifest$|manifests\/|LICENSE$)/

/**
 * @typedef {{ files: Record<string, string>, failed: string[], whole?: false, tests?: string[] }} Entry  a spec's run in one
 *   engine: each file it read with its hash, and the tests that failed; run in part (a test picked, a run stopped), which
 *   tests ran
 * @typedef {{ format: number, specs: Record<string, Record<string, Entry>> }} Kept  by spec, then by engine
 */

// Which files

/**
 * The files of this repository a request to this computer read: the file of app/ it names (or of examples/, which Jean's
 * server serves too), the site's pages a build writes from site/, and what the test server there runs (a spec may run one
 * of Jean's own, as update.spec.js does). None for another address.
 * @param {string} address @param {(path: string) => 'tracked' | 'built' | null} where  a path git holds, one on disk alone, or neither
 */
export function filesOf (address, where) {
  let url
  try { url = new URL(address) } catch { return [] }
  if (!/^(?:127\.0\.0\.1|localhost|[\w-]+\.localhost)$/.test(url.hostname)) return []
  const files = [...(Object.hasOwn(SERVERS, url.port) ? SERVERS[url.port] : [])]
  let path
  try { path = decodeURIComponent(url.pathname).slice(1) } catch { return files }
  if (path === '' || path.endsWith('/')) path += 'index.html'
  if (path.split('/').includes('..')) return files
  const own = where(`app/${path}`)
  if (own === 'tracked') files.push(`app/${path}`)
  // The site's pages that every copy has, which npm run build writes in app/ from site/ (D438).
  else if (own === 'built' && !BUILT.test(path)) files.push('site/')
  else if (path.startsWith('examples/') && where(path) === 'tracked') files.push(path)
  return files
}

/** A specifier or a path a file names, from the repository's root: null for a package, or outside it. @param {string} named @param {string} from */
function resolve (named, from) {
  const path = named.startsWith('#app/') ? `app/${named.slice(5)}` : /^\.\.?\//.test(named) ? posix.join(posix.dirname(from), named) : null
  return path && !path.startsWith('..') ? path : null
}

/**
 * Files and what they read in Node: each file's imports, static or import() of a string, and, for a file of test/, the files
 * of this repository it names by a relative path ('./fixtures/scan.pdf', new URL('../app/capabilities.json', import.meta.url)),
 * a folder as every file in it, though not a folder at the top (a base other paths are joined to). Shallow, for a server or
 * a script: its static imports alone, and those of app/ not followed, since what Jean's pages read is what they ask for (a
 * server builds the listings of every module of app/, and serves each as written).
 * @param {string[]} paths @param {(path: string) => 'file' | 'folder' | null} kind @param {(path: string) => string} read
 * @param {boolean} [deep]
 */
export function closure (paths, kind, read, deep = true) {
  const seen = new Set()
  const queue = [...paths]
  while (queue.length) {
    const path = /** @type {string} */ (queue.pop())
    if (seen.has(path)) continue
    seen.add(path)
    if (!/\.m?js$/.test(path) || kind(path) !== 'file' || (!deep && path.startsWith('app/'))) continue
    const text = read(path)
    const named = extractStaticImports(text)
    if (deep) named.push(...[...text.matchAll(/\bimport\(\s*(['"])([^'"\n]+)\1\s*\)/g)].map((match) => match[2]))
    if (deep && path.startsWith('test/')) {
      named.push(...[...text.matchAll(/(['"`])(\.{1,2}\/[^'"`\s$]*)\1/g)].map((match) => match[2]))
      named.push(...[...text.matchAll(/new URL\(\s*(['"`])([\w@-][^'"`\s$]*)\1\s*,\s*import\.meta\.url/g)].map((match) => `./${match[2]}`))
    }
    for (const one of named) {
      const found = resolve(one, path)?.replace(/\/$/, '')
      const is = found ? kind(found) : null
      if (is === 'file') queue.push(/** @type {string} */ (found))
      else if (is === 'folder' && found?.includes('/')) queue.push(`${found}/`)
    }
  }
  return seen
}

// Which specs

/**
 * The specs a change affects, each with why: the first file of its record that changed, since the base (`changed`) or since
 * that spec's run (its hash isn't the one kept); a spec never run whole, or that failed; and every one when nothing is kept.
 * @param {{ specs: string[], kept: Kept | null, changed: Set<string>, hash: (path: string) => string }} given
 * @returns {Map<string, string>}
 */
export function select ({ specs, kept, changed, hash }) {
  /** @type {Map<string, string>} */
  const chosen = new Map()
  const listed = [...changed]
  for (const spec of specs) {
    if (!kept) { chosen.set(spec, 'no run kept yet'); continue }
    const entries = Object.values(kept.specs[spec] ?? {})
    if (!entries.length) { chosen.set(spec, 'never run'); continue }
    if (entries.some((entry) => entry.failed.length)) { chosen.set(spec, 'failed'); continue }
    if (entries.some((entry) => entry.whole === false)) { chosen.set(spec, 'run in part'); continue }
    const why = entries.flatMap((entry) => Object.entries(entry.files)).find(([path, was]) => (path.endsWith('/') ? listed.some((one) => one.startsWith(path)) : changed.has(path)) || hash(path) !== was)
    if (why) chosen.set(spec, why[0])
  }
  return chosen
}

/**
 * A run's record over the one kept: a spec run whole in an engine replaces what was kept of it; one run in part adds to it,
 * what it read before still counting, and keeps the failures of tests that didn't run.
 * @param {Kept | null} kept @param {Kept} run @returns {Kept}
 */
export function merge (kept, run) {
  /** @type {Kept} */
  const out = kept?.format === FORMAT ? structuredClone(kept) : { format: FORMAT, specs: {} }
  for (const [spec, engines] of Object.entries(run.specs)) {
    for (const [engine, entry] of Object.entries(engines)) {
      const before = out.specs[spec]?.[engine]
      /** @type {Entry} */
      let next = entry
      if (entry.whole === false && before) {
        const ran = new Set(entry.tests)
        next = { files: { ...before.files, ...entry.files }, failed: [...new Set([...before.failed.filter((test) => !ran.has(test)), ...entry.failed])] }
        if (before.whole === false) Object.assign(next, { whole: false, tests: [...new Set([...(before.tests ?? []), ...ran])] })
      }
      ;(out.specs[spec] ??= {})[engine] = next
    }
  }
  return out
}

// This repository

/** @param {string[]} args */
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/** What a path is here. @param {string} path @returns {'file' | 'folder' | null} */
function kindOf (path) {
  try { const stat = statSync(join(ROOT, path)); return stat.isDirectory() ? 'folder' : stat.isFile() ? 'file' : null } catch { return null }
}

/** The files git holds or would hold, new ones included, from one listing. @type {string[] | null} */
let listing = null
/** @param {string} [folder] */
function filesIn (folder = '') {
  listing ??= git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean).sort()
  return folder ? listing.filter((path) => path.startsWith(folder)) : listing
}

/**
 * A file's hash, or a folder's from its files', twelve hex digits: '-' when there is none, and '~' for a file changed after
 * `since` (edited while the tests ran), which no hash matches.
 * @param {number} [since]
 */
export function hasher (since = Infinity) {
  /** @type {Map<string, string>} */
  const known = new Map()
  /** @param {string} path @returns {string} */
  const hash = (path) => {
    if (known.has(path)) return /** @type {string} */ (known.get(path))
    let value = '-'
    if (path.endsWith('/')) {
      const files = filesIn(path)
      if (files.length) value = createHash('sha1').update(files.map((file) => `${file} ${hash(file)}\n`).join('')).digest('hex').slice(0, 12)
    } else {
      try {
        const file = join(ROOT, path)
        value = statSync(file).mtimeMs > since ? '~' : createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 12)
      } catch {}
    }
    known.set(path, value)
    return value
  }
  return hash
}

/** The specs here, by name. */
export const specsHere = () => readdirSync(join(ROOT, 'test')).filter((name) => name.endsWith('.spec.js')).map((name) => name.slice(0, -'.spec.js'.length)).sort()

/** The record kept, or null. @returns {Kept | null} */
export function kept () {
  try {
    const record = JSON.parse(readFileSync(join(ROOT, KEPT), 'utf8'))
    return record.format === FORMAT ? record : null
  } catch { return null }
}

/** A run's record kept, over the one kept, in one write. @param {Kept} run */
export function keep (run) {
  const file = join(ROOT, KEPT)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.${process.pid}`, JSON.stringify(merge(kept(), run)))
  renameSync(`${file}.${process.pid}`, file)
}

/**
 * The specs here a change since `base` affects, each with why; every one of them when no run is kept.
 * @param {string} [base] @returns {{ chosen: Map<string, string>, of: number, since: string }}
 */
export function affected (base = BASE) {
  let since
  try { since = git('merge-base', base, 'HEAD') } catch { throw new Error(`${base}: no merge base with HEAD (git fetch, or name a branch or a commit)`) }
  const changed = new Set([...git('diff', '--name-only', '--no-renames', '-z', since).split('\0'), ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0')].filter(Boolean))
  const specs = specsHere()
  return { chosen: select({ specs, kept: kept(), changed, hash: hasher() }), of: specs.length, since }
}

/** What affected() found, said: the specs, by why. @param {ReturnType<typeof affected>} found @param {string} base */
export function said ({ chosen, of, since }, base) {
  /** @type {Map<string, string[]>} */
  const by = new Map()
  for (const [spec, why] of chosen) by.set(why, [...(by.get(why) ?? []), spec])
  const all = chosen.size === of
  return [`Affected since ${base} (${since.slice(0, 8)}): ${all ? 'all' : chosen.size} of ${of} specs`,
    ...[...by].map(([why, specs]) => `  ${why}: ${all && by.size === 1 ? 'every spec' : specs.length > 12 ? `${specs.length} specs` : specs.join(', ')}`)].join('\n')
}

// The reporter

/** Arguments that pick tests within a spec, so that a run holds part of it. */
const PICKS = /^(?:-g|-gv|--grep|--grep-invert|--last-failed|--shard|--test-list|--test-list-invert)(?:=|$)|\.js:\d+(?::\d+)?$/

/** @implements {import('@playwright/test/reporter').Reporter} */
export default class Affected {
  began = Date.now()
  /** @type {import('@playwright/test/reporter').Suite | null} */
  suite = null
  /** @type {Map<string, Set<string>>} by engine and spec, the addresses its tests asked for */
  asked = new Map()
  whole = true

  /** @param {import('@playwright/test/reporter').FullConfig} config @param {import('@playwright/test/reporter').Suite} suite */
  onBegin (config, suite) {
    // GitHub's runners keep nothing: there, nothing is noted (test/helpers.js) or kept.
    if (process.env.GITHUB_ACTIONS) return
    this.suite = suite
    this.whole = !process.argv.slice(2).some((arg) => PICKS.test(arg)) && !config.maxFailures
  }

  /** @param {import('@playwright/test/reporter').TestCase} test @param {import('@playwright/test/reporter').TestResult} result */
  onTestEnd (test, result) {
    const key = keyOf(test)
    if (!this.suite || !key) return
    const asked = this.asked.get(key) ?? new Set()
    for (const note of result.annotations) if (note.type === 'requested' && note.description) for (const address of note.description.split('\n')) asked.add(address)
    this.asked.set(key, asked)
  }

  /** @param {import('@playwright/test/reporter').FullResult} result */
  onEnd (result) {
    if (!this.suite) return
    const stopped = result.status === 'interrupted' || result.status === 'timedout'
    /** @type {Map<string, import('@playwright/test/reporter').TestCase[]>} */
    const runs = new Map()
    for (const test of this.suite.allTests()) {
      const key = keyOf(test)
      if (key) runs.set(key, [...(runs.get(key) ?? []), test])
    }
    if (!runs.size) return
    const read = (/** @type {string} */ path) => readFileSync(join(ROOT, path), 'utf8')
    const tracked = new Set(filesIn())
    const where = (/** @type {string} */ path) => (tracked.has(path) ? 'tracked' : kindOf(path) === 'file' ? 'built' : null)
    // Not this file, which the config imports: it changes what is kept, never what a test does.
    const every = closure(EVERY, kindOf, read, false).difference(new Set(['scripts/affected.js']))
    const servers = new Map(Object.values(SERVERS).flat().map((path) => [path, closure([path], kindOf, read, false)]))
    const hash = hasher(this.began)
    /** @type {Kept} */
    const record = { format: FORMAT, specs: {} }
    for (const [key, tests] of runs) {
      const [engine, spec] = key.split(' ')
      const files = new Set([...every, ...closure([`test/${spec}.spec.js`], kindOf, read)])
      for (const address of this.asked.get(key) ?? []) for (const path of filesOf(address, where)) for (const one of servers.get(path) ?? [path]) files.add(one)
      // What a build writes from the rest, read in Node too (about.spec.js reads capabilities.json), counts as nothing.
      for (const path of files) if (path.startsWith('app/') && BUILT.test(path.slice(4))) files.delete(path)
      /** @type {Entry} */
      const entry = { files: Object.fromEntries([...files].sort().map((path) => [path, hash(path)])), failed: tests.filter((test) => test.outcome() === 'unexpected').map(titleOf) }
      if (!this.whole || stopped || tests.some((test) => !test.results.length)) Object.assign(entry, { whole: false, tests: tests.filter((test) => test.results.length).map(titleOf) })
      ;(record.specs[spec] ??= {})[engine] = entry
    }
    keep(record)
  }

  printsToStdio () { return false }
}

/** A test's engine and spec, for a spec of test/ itself (not one of the evals'). @param {import('@playwright/test/reporter').TestCase} test */
function keyOf (test) {
  const engine = test.parent.project()?.name
  return engine && dirname(test.location.file) === join(ROOT, 'test') && test.location.file.endsWith('.spec.js') ? `${engine} ${basename(test.location.file, '.spec.js')}` : null
}

/** A test's title within its spec. @param {import('@playwright/test/reporter').TestCase} test */
const titleOf = (test) => test.titlePath().slice(3).join(' › ')

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] ?? BASE
  if (!existsSync(join(ROOT, KEPT))) console.log(`No run kept yet in ${KEPT}: npm run e2e, or npm run ci, keeps one`)
  console.log(said(affected(base), base))
}
