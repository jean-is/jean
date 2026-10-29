// Puts a build of Jean on Bunny CDN, as jean.is is served: dist/web/'s files in a storage zone, each release in a
// folder of its own, releases/<name>/, then the pull zone pointed at it by one edge rule, as Bunny's own CLI publishes
// a site, so no visitor gets two versions' files; the cache is purged, and the oldest releases go, keeping the last
// five. Bunny compresses as it serves, so the build's .br and .gz copies stay behind. A storage zone has no
// `try_files`: the pull zone's script (deploy/bunny/pages.js) asks for <path>.html when an address has no ending, so a
// file without one, LICENSE, is stored as LICENSE.html, with its own type. Every deploy also sets what the zone
// must keep to: logging off, the header set (deploy/README.md), and files kept at the edge until the next deploy.
// DEPLOY_TO=bunny:<storage zone> names the zone; BUNNY_STORAGE_KEY is its password, BUNNY_API_KEY the account's key
// for the pull zone BUNNY_PULL_ZONE (its id), and BUNNY_STORAGE_HOST the zone's region, storage.bunnycdn.com, in
// Germany, by default; CSP adds the organisation's own policy to the header's. No address but Bunny's own APIs is
// written here.
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import { HEADERS, TYPES } from '../app/caps/policy/checks.js'

/** Bunny's account API, which the pull zone's rules and purges go through. */
const API = 'https://api.bunny.net'
/** How many uploads run at once. */
const AT_ONCE = 12
/** How long a rule takes to reach every edge before the second purge (Bunny's CLI waits at least 7.5 s). */
const SETTLE = 15_000
/** How long the edge keeps a file, purged at each deploy: 30 days, as Bunny's CLI sets it. */
const EDGE = 2_592_000
/** How long a browser keeps a file before checking it again: not at all, which Bunny sends as `public, max-age=0`. */
const BROWSER = 0

/** An address with no ending, which the pull zone's script answers with <path>.html (deploy/bunny/pages.js). */
export const BARE = /\/[^/.]+$/

/**
 * What a file goes out as, by its ending, as deploy/README.md's table has it (policy.html's TYPES), text in UTF-8; a
 * file without one is text, and anything else bytes. @param {string} ending  with its dot, or ''
 */
export function typeOf (ending) {
  const type = ending ? TYPES[ending] ?? 'application/octet-stream' : 'text/plain'
  return /^text\/|^application\/json$/.test(type) ? `${type}; charset=utf-8` : type
}

/** Bunny's numbers for the edge rules used here (its API's EdgeRuleV2Model). */
export const ACTION = { block: 4, header: 5, storage: 17 }
const URL_TRIGGER = 0
const MATCH = { any: 0, none: 2 }
/** Where releases are kept in the storage zone, which no address reaches but through the serve rule. */
export const RELEASES = 'releases'

/**
 * The storage zone DEPLOY_TO names as bunny:<zone>, or null when it names a server; a zone's name is letters,
 * digits and dashes.
 * @param {string | undefined} target
 */
export function zoneOf (target) {
  if (!target?.startsWith('bunny:')) return null
  const zone = target.slice('bunny:'.length)
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/i.test(zone)) throw new Error('DEPLOY_TO names a storage zone as bunny:<zone>, its name in letters, digits and dashes')
  return zone
}

/**
 * Where a built file goes in a release, and as what: its path, but a file without an ending under <path>.html, which
 * the pull zone's script asks for; null for the build's compressed copies, which Bunny makes itself.
 * @param {string} path  from dist/web/, with forward slashes
 * @param {Set<string>} files  every path built, to tell a compressed copy from a file of its own
 * @returns {{ key: string, type: string } | null}
 */
export function objectOf (path, files) {
  const plain = path.replace(/\.(br|gz)$/, '')
  if (plain !== path && files.has(plain)) return null
  const bare = BARE.test(`/${path}`)
  return { key: bare ? `${path}.html` : path, type: typeOf(bare ? '' : extname(path).toLowerCase()) }
}

/**
 * The pull zone's rules, as each deploy writes them again: no release reached by its folder; the header set on every
 * answer; then, last, so that a refused write never switches early, every other address served from the release.
 * Each is known by its description, which Bunny keeps, so writing it again replaces it. The set's Cache-Control is
 * the zone's own, `public, max-age=0` (BROWSER): an edge keeps no file whose rule says `no-cache`, and would ask the
 * storage zone for every file, every time.
 * @param {{ id: number, name: string }} zone  the storage zone @param {string} release
 * @param {string} [csp]  what the organisation adds to the header's Content-Security-Policy, which can only take away
 */
export function rulesFor (zone, release, csp = '') {
  const trigger = (/** @type {number} */ matching) => [{ Type: URL_TRIGGER, PatternMatches: [`*/${RELEASES}/*`], PatternMatchingType: matching }]
  const [first, ...more] = HEADERS.filter(([name]) => name !== 'cache-control').map(([name, , value]) => ({
    ActionType: ACTION.header, ActionParameter1: name, ActionParameter2: name === 'content-security-policy' && csp ? `${value}; ${csp}` : value,
  }))
  return [
    { Description: 'jean: no release by its folder', Enabled: true, ActionType: ACTION.block, TriggerMatchingType: MATCH.any, Triggers: trigger(MATCH.any) },
    { Description: 'jean: the header set', Enabled: true, ...first, ExtraActions: more, TriggerMatchingType: MATCH.any, Triggers: [{ Type: URL_TRIGGER, PatternMatches: ['*'], PatternMatchingType: MATCH.any }] },
    { Description: 'jean: serve the current release', Enabled: true, ActionType: ACTION.storage, ActionParameter1: String(zone.id), ActionParameter2: zone.name,
      ActionParameter3: `/${RELEASES}/${release}/`, TriggerMatchingType: MATCH.any, Triggers: trigger(MATCH.none) },
  ]
}

/**
 * The releases to remove: all but the newest `keep`, by name, which sorts by time (deploy.js's releaseName()).
 * @param {string[]} names @param {number} keep
 */
export const oldReleases = (names, keep) => [...names].sort().reverse().slice(keep)

/** Every file under a folder, by path from it with forward slashes. @param {string} root @returns {Promise<string[]>} */
async function filesUnder (root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/')).sort()
}

/**
 * A call to one of Bunny's APIs that throws, saying what Bunny answered, unless it succeeds; tried again twice when
 * the network or Bunny fails. @param {string} url @param {RequestInit} init @returns {Promise<Response>}
 */
async function call (url, init) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, init).catch((error) => (attempt < 3 ? null : Promise.reject(error)))
    if (response?.ok) return response
    if (response && (response.status < 500 || attempt >= 3)) throw new Error(`${init.method ?? 'GET'} ${new URL(url).pathname}: Bunny answered ${response.status} ${(await response.text()).slice(0, 300)}`)
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
  }
}

/**
 * Puts dist/web/ on Bunny as a release and serves it.
 * @param {object} options
 * @param {string} options.dist  dist/web/
 * @param {string} options.zone  the storage zone's name
 * @param {string} options.release  its folder's name
 * @param {number} options.keep  how many releases stay
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(line: string) => void} [options.say]
 * @param {number} [options.settle]  how long to wait between the purges, in milliseconds
 */
export async function deployToBunny ({ dist, zone, release, keep, env = process.env, say = console.log, settle = SETTLE }) {
  const { BUNNY_STORAGE_KEY: storageKey, BUNNY_API_KEY: apiKey, BUNNY_PULL_ZONE: pullZone, BUNNY_STORAGE_HOST: host = 'storage.bunnycdn.com' } = env
  if (!storageKey || !apiKey || !/^\d+$/.test(pullZone ?? '')) throw new Error('a deploy to Bunny needs BUNNY_STORAGE_KEY (the storage zone\'s password), BUNNY_API_KEY (the account\'s) and BUNNY_PULL_ZONE (the pull zone\'s id)')
  const api = (/** @type {string} */ path, /** @type {RequestInit} */ init = {}) => call(`${API}${path}`, { ...init, headers: { AccessKey: apiKey, accept: 'application/json', ...(init.body && { 'content-type': 'application/json' }), ...init.headers } })
  const storage = (/** @type {string} */ path, /** @type {RequestInit} */ init = {}) => call(`https://${host}/${zone}/${path}`, { ...init, headers: { AccessKey: storageKey, ...init.headers } })

  // The pull zone must serve this storage zone and run the script that finds pages without .html.
  const pulled = await (await api(`/pullzone/${pullZone}`)).json()
  const stored = pulled.StorageZoneId > 0 ? await (await api(`/storagezone/${pulled.StorageZoneId}`)).json() : null
  if (stored?.Name !== zone) throw new Error(`pull zone ${pullZone} doesn't serve the storage zone ${zone}`)
  if (!pulled.MiddlewareScriptId) throw new Error(`pull zone ${pullZone} has no script: link deploy/bunny/pages.js to it, or pages without .html won't open`)

  const files = await filesUnder(dist)
  const built = new Set(files)
  const objects = files.flatMap((path) => {
    const object = objectOf(path, built)
    return object ? [{ path, ...object }] : []
  })
  say(`deploy: uploading ${objects.length} files to ${zone}/${RELEASES}/${release}/`)
  let next = 0
  await Promise.all(Array.from({ length: AT_ONCE }, async () => {
    while (next < objects.length) {
      const { path, key, type } = objects[next++]
      const body = await readFile(join(dist, path))
      // The Storage API keeps a file's type only from Override-Content-Type; it drops Content-Type, and the edge then
      // guesses from the ending, without a charset (application/octet-stream for a .webmanifest).
      await storage(`${RELEASES}/${release}/${key}`, { method: 'PUT', body, headers: { 'override-content-type': type, checksum: createHash('sha256').update(body).digest('hex').toUpperCase() } })
    }
  }))

  // Logging off, files kept at the edge until the next deploy purges them and checked again by browsers before each
  // use; read back, so a setting Bunny didn't take stops the deploy before anything is served.
  await api(`/pullzone/${pullZone}`, { method: 'POST', body: JSON.stringify({ EnableLogging: false, CacheControlMaxAgeOverride: EDGE, CacheControlPublicMaxAgeOverride: BROWSER }) })
  if ((await (await api(`/pullzone/${pullZone}`)).json()).EnableLogging !== false) throw new Error(`pull zone ${pullZone} still keeps logs: turn its logging off`)

  const existing = /** @type {Array<{ Guid?: string, Description?: string }>} */ (pulled.EdgeRules ?? [])
  for (const rule of rulesFor({ id: stored.Id, name: zone }, release, env.CSP)) {
    const guid = existing.find((other) => other.Description === rule.Description)?.Guid
    await api(`/pullzone/${pullZone}/edgerules/addOrUpdate`, { method: 'POST', body: JSON.stringify({ ...rule, ...(guid && { Guid: guid }) }) })
  }
  // The rule reaches the edges in a few seconds: purge, wait for it, then purge again, so no edge keeps a file of the
  // release before (as Bunny's CLI does).
  await api(`/pullzone/${pullZone}/purgeCache`, { method: 'POST', body: '{}' })
  await new Promise((resolve) => setTimeout(resolve, settle))
  await api(`/pullzone/${pullZone}/purgeCache`, { method: 'POST', body: '{}' })

  const listed = /** @type {Array<{ ObjectName: string, IsDirectory: boolean }>} */ (await (await storage(`${RELEASES}/`)).json())
  for (const old of oldReleases(listed.filter((entry) => entry.IsDirectory).map((entry) => entry.ObjectName), keep)) {
    if (old !== release) await storage(`${RELEASES}/${old}/`, { method: 'DELETE' })
  }
}
