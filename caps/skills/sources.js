// Skills from elsewhere (D116, D121). A place to find skills is an Agent Skills discovery index,
// /.well-known/agent-skills/index.json (schema 0.2), named in settings or by policy. Indexes are
// kept in .cache/ and read again after a day; a skill is fetched when the user looks at it, and
// added only if its bytes are the ones its index lists (SHA-256). Requests are compared with what
// the indexes say on the device, so the user's words go nowhere. Host-agnostic: tested under
// node --test, like the MCP client.
import { readJSON, writeJSON } from '../../core/fs.js'
import { alike, bm25 } from '../../core/search.js'
import { NAME, parseSkill } from '../../core/skills.js'

/** @typedef {import('../../core/types.js').FS} FS */
/** @typedef {import('../../core/skills.js').Skill} Skill */
/**
 * A skill an index lists: `skill-md` is one SKILL.md; an `archive` brings files Jean can't run yet.
 * @typedef {{ name: string, description: string, type: 'skill-md' | 'archive', url: string, digest: string, index: string }} Entry
 * @typedef {{ at: string, entries?: Entry[], error?: 'failed' | 'format' }} Index  when it was read, and what it said
 */

const WELL_KNOWN = '/.well-known/agent-skills/index.json'
const SCHEMA = /^https:\/\/schemas\.agentskills\.io\/discovery\/0\.2\.\d+\/schema\.json$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const CACHE = '.cache/skills/indexes.json'
const DAY = 86_400_000
const MAX_BYTES = 1_000_000
// A request at least this alike to what a skill says it is for may be what it does (test/skills.test.js).
const READY_MADE = 0.2

/** A skill that can't be added: not the one listed, unreadable, or of a kind Jean can't use yet. */
export class SkillError extends Error {
  /** @param {'changed' | 'unreadable' | 'unsupported'} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** https anywhere; http only on this computer (a local server, or tests). @param {URL} url */
const reachable = (url) => url.protocol === 'https:' || (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname))

/** @param {unknown} raw @param {string} base */
function resolve(raw, base) {
  try {
    const url = new URL(String(raw), base)
    return typeof raw === 'string' && reachable(url) ? url.href : null
  } catch {
    return null
  }
}

/** "example.com", or an index's own address → the index's address; null when it can't be one. @param {string} address */
export function indexURL(address) {
  const text = address.trim()
  const url = text ? resolve(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`, 'https://localhost/') : null
  if (!url) return null
  const parsed = new URL(url)
  if (parsed.pathname === '/') parsed.pathname = WELL_KNOWN
  return parsed.href
}

/**
 * Sites that publish skills a browser can read (D122): provider identities, like the directory of
 * connections (D95), checked again by `npm run skills`. Settings and policy replace them.
 */
export const KNOWN_PLACES = Object.freeze(['apify.com', 'clerk.com', 'developers.cloudflare.com', 'evilmartians.com', 'huggingface.co', 'neon.com', 'redocly.com'])

/** @typedef {{ skillIndexes?: string[] }} Places */

/** The user's places: their own list once they changed it, else the known ones, unless their organisation names its own. @param {Places} settings @param {Places} policy */
export const ownPlaces = (settings, policy) => settings.skillIndexes ?? (policy.skillIndexes ? [] : KNOWN_PLACES)

/**
 * Where to look: the organisation's places, which stay, then the user's.
 * @param {Places} settings @param {Places} policy
 * @returns {string[]}
 */
export const places = (settings, policy) => [...new Set([...(policy.skillIndexes ?? []), ...ownPlaces(settings, policy)].map(indexURL).filter((url) => url !== null))]

/** The skills an index lists that Jean can check: a valid name, a kind it knows, a digest. @param {unknown} data @param {string} base where it was read */
export function parseIndex(data, base) {
  const index = /** @type {any} */ (data)
  if (!SCHEMA.test(index?.$schema ?? '') || !Array.isArray(index.skills)) throw new Error('Not an index in the format Jean reads (discovery 0.2).')
  /** @type {Entry[]} */
  const entries = []
  for (const item of index.skills) {
    const url = resolve(item?.url, base)
    const description = typeof item?.description === 'string' ? item.description.replace(/\s+/g, ' ').trim().slice(0, 1024) : ''
    if (typeof item?.name === 'string' && NAME.test(item.name) && ['skill-md', 'archive'].includes(item.type) && description && url && DIGEST.test(item.digest ?? '')) {
      entries.push({ name: item.name, description, type: item.type, url, digest: item.digest, index: base })
    }
  }
  return { entries }
}

/** @param {string} url @param {typeof fetch} fetcher @param {Date} now @returns {Promise<Index>} */
async function readIndex(url, fetcher, now) {
  const at = now.toISOString()
  const response = await fetcher(url, { headers: { accept: 'application/json' } }).catch(() => null)
  if (!response?.ok) return { at, error: 'failed' }
  try {
    const text = await response.text()
    if (text.length > MAX_BYTES) throw new Error('Too long for an index.')
    // After a redirect, relative addresses start from where the index is.
    return { at, entries: parseIndex(JSON.parse(text), response.url || url).entries }
  } catch {
    return { at, error: 'format' }
  }
}

/** Every index read so far, by address. @param {FS} fs @returns {Promise<Record<string, Index>>} */
export const cachedIndexes = async (fs) => (await readJSON(fs, CACHE, null))?.indexes ?? {}

/**
 * Reads these indexes again when a day old, or when asked, and keeps them in .cache/.
 * @param {FS} fs @param {string[]} urls
 * @param {{ fetcher?: typeof fetch, now?: Date, force?: boolean }} [options]
 * @returns {Promise<Record<string, Index>>}
 */
export async function refreshIndexes(fs, urls, { fetcher = globalThis.fetch, now = new Date(), force = false } = {}) {
  const cached = await cachedIndexes(fs)
  const fresh = (/** @type {Index | undefined} */ index) => !force && index && now.getTime() - Date.parse(index.at) < DAY
  const read = Object.fromEntries(await Promise.all(urls.map(async (url) => [url, fresh(cached[url]) ? cached[url] : await readIndex(url, fetcher, now)])))
  await writeJSON(fs, CACHE, { format: 1, indexes: { ...cached, ...read } })
  return read
}

/**
 * What the places listed now offer: the skills Jean can use, and how many others need more than it has.
 * @param {Record<string, Index>} indexes @param {string[]} urls
 */
export function offered(indexes, urls) {
  const entries = urls.flatMap((url) => indexes[url]?.entries ?? [])
  return { usable: entries.filter((entry) => entry.type === 'skill-md'), other: entries.filter((entry) => entry.type !== 'skill-md').length }
}

/** What a skill says it is for, its name in words. @param {Entry} entry */
const about = (entry) => `${entry.name.replace(/-/g, ' ')} ${entry.description}`

/**
 * Skills not added yet that may do what a request asks, best first: compared word by word on
 * the device, in any script. A request and a skill in two languages don't meet.
 * @param {string} text @param {Entry[]} entries @param {string[]} installed the names already added
 */
export function readyMade(text, entries, installed) {
  const candidates = entries.filter((entry) => !installed.includes(entry.name))
  const scores = alike(text, candidates.map(about))
  return candidates.map((entry, i) => ({ entry, score: scores[i] })).filter(({ score }) => score >= READY_MADE)
    .sort((a, b) => b.score - a.score).map(({ entry }) => entry)
}

/** The skills a search finds, best first; all of them for no search. @param {string} query @param {Entry[]} entries */
export const searchSkills = (query, entries) => (query.trim() ? bm25(entries.map(about), query).map(({ index }) => entries[index]) : entries)

/**
 * What the places listed now publish for a task, of every kind: the best matches, and those
 * nearly as good, up to six (D122).
 * @param {string} query @param {Record<string, Index>} indexes @param {string[]} urls
 */
export function findSkills(query, indexes, urls) {
  const entries = urls.flatMap((url) => indexes[url]?.entries ?? [])
  const hits = query.trim() ? bm25(entries.map(about), query) : []
  return hits.filter((hit) => hit.score >= hits[0].score * 0.4).slice(0, 6).map(({ index }) => entries[index])
}

/** The skill a place lists by that name, from the places listed now; the first place wins. @param {string} name @param {string} place its host, if two have it @param {Record<string, Index>} indexes @param {string[]} urls */
export const listed = (name, place, indexes, urls) => urls.flatMap((url) => indexes[url]?.entries ?? [])
  .find((entry) => entry.name === name && (!place || new URL(entry.index).host === place || entry.index === place)) ?? null

/**
 * What find_skills tells the brain: the skills it can add, those it has already, those it can't use.
 * @param {Entry[]} found @param {string[]} installed
 */
export function foundText(found, installed) {
  const at = (/** @type {Entry} */ entry) => `${entry.name} (${new URL(entry.index).host})`
  const usable = found.filter((entry) => entry.type === 'skill-md' && !installed.includes(entry.name))
  const have = [...new Set(found.filter((entry) => installed.includes(entry.name)).map((entry) => entry.name))]
  const other = found.filter((entry) => entry.type !== 'skill-md' && !installed.includes(entry.name))
  return [
    usable.length ? `Skills that may fit; add one with add_skill, then follow the steps it returns:\n${usable.map((entry) => `- ${at(entry)}: ${entry.description.slice(0, 300)}`).join('\n')}`
      : 'No published skill you can use fits.',
    ...(have.length ? [`Already added, read with skill: ${have.join(', ')}.`] : []),
    ...(other.length ? [`These need tools you don’t have: ${other.map(at).join(', ')}.`] : []),
  ].join('\n')
}

/** @param {ArrayBuffer} buffer */
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * A skill as its publisher listed it, with where it came from; refused if its bytes changed.
 * @param {Entry} entry @param {typeof fetch} [fetcher] @returns {Promise<Skill>}
 */
export async function fetchSkill(entry, fetcher = globalThis.fetch) {
  if (entry.type !== 'skill-md') throw new SkillError('unsupported', `${entry.name} comes with files Jean can't use yet.`)
  const bytes = await fetcher(entry.url).then(async (response) => (response.ok ? new Uint8Array(await response.arrayBuffer()) : null), () => null)
  if (!bytes || bytes.length > MAX_BYTES) throw new SkillError('unreadable', `${entry.url} could not be read.`)
  if (`sha256:${hex(await crypto.subtle.digest('SHA-256', bytes))}` !== entry.digest) throw new SkillError('changed', `${entry.url} isn't the skill its index lists.`)
  const skill = parseSkill(new TextDecoder().decode(bytes), entry.url)
  if (!skill) throw new SkillError('unreadable', `${entry.url} is not a skill.`)
  return { ...skill, source: entry.url, digest: entry.digest }
}
