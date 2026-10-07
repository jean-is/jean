// Skills from elsewhere (D116, D121): Agent Skills discovery indexes, the format's own way to
// publish skills (https://github.com/cloudflare/agent-skills-discovery-rfc, schema 0.2.0). Jean
// reads whole indexes and compares their descriptions with the user's requests here, on the
// device, so a request never goes anywhere. A skill comes in only when the user adds it, after
// reading its steps, and only once what was downloaded matches the digest its index lists.
// Only skills made of instructions are added: SKILL.md, and text beside it, never programs.
// Host-agnostic: no DOM, tested under node --test.
import { readZip } from '../../core/zip.js'
import { blocksOf } from '../../core/skills.js'
import { readJSON, writeJSON } from '../../core/fs.js'
import { parseFrontMatter } from '../../core/settings.js'
import { alike } from '../../core/search.js'

/** @typedef {import('../../core/types.js').FS} FS */
/**
 * A skill an index offers. url: absolute; source: the index it is listed in.
 * @typedef {{ name: string, type: 'skill-md' | 'archive', description: string, url: string, digest: string, source: string }} Entry
 */
/** What an index held when it was last read, or why it couldn't be. @typedef {{ url: string, at: string, skills: Entry[], error?: string }} Index */

export const SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'

/**
 * The indexes read unless the user or policy changes the list: hand-picked, checked from a
 * browser's point of view by `npm run directory` (D121). As of 2026-10-03 no index answering
 * browsers offers skills for office work, so these are developers'; an organisation's own, set in
 * policy, is where those will come from.
 */
export const DEFAULT_SOURCES = Object.freeze(['https://developers.cloudflare.com', 'https://huggingface.co', 'https://neon.com'])

const NAME = /^(?=.{1,64}$)[a-z0-9]+(-[a-z0-9]+)*$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
// Instructions: Markdown and other text, never code. A file without an extension is a LICENSE or a README.
const TEXT = /(^|\/)[^./]+$|\.(md|markdown|txt|csv|tsv|json|ya?ml)$/i
// What one skill may weigh, downloaded or unpacked.
const MAX_BYTES = 2 * 1024 * 1024
// An index is read again after a day.
const FRESH_MS = 24 * 3600_000

/** Why a skill can't be added: `digest` (not what the index lists), `programs` (more than instructions), `invalid`. */
export class SkillError extends Error {
  /** @param {'digest' | 'programs' | 'invalid'} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** An index's address from what the user typed: a site (its .well-known index), or the index itself. @param {string} address */
export function indexURL(address) {
  const text = address.trim()
  const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  if (!url.pathname.endsWith('.json')) url.pathname = `${url.pathname.replace(/\/+$/, '')}/.well-known/agent-skills/index.json`
  return url.href
}

/** Where an index or a skill comes from, for people: its site. @param {string} url */
export const siteOf = (url) => new URL(url).host

/**
 * The skills an index lists, with their addresses made absolute. An index of another version
 * isn't read: its shape may have changed (the specification says so).
 * @param {any} json @param {string} source the index's address
 * @returns {Entry[]}
 */
export function parseIndex(json, source) {
  if (json?.$schema !== SCHEMA) throw new Error(`Not a skills index Jean can read (${String(json?.$schema ?? 'no $schema')}).`)
  return (Array.isArray(json.skills) ? json.skills : []).flatMap((/** @type {any} */ skill) => {
    const { name, type, description, digest } = skill ?? {}
    if (!NAME.test(name) || (type !== 'skill-md' && type !== 'archive') || typeof description !== 'string' || !description.trim() || !DIGEST.test(digest)) return []
    try {
      const url = new URL(String(skill.url), source)
      return /^https?:$/.test(url.protocol) ? [{ name, type, description: description.trim().slice(0, 1024), url: url.href, digest, source }] : []
    } catch {
      return []
    }
  })
}

/** @param {Uint8Array} bytes */
export async function sha256(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes)))
  return `sha256:${[...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/** A path inside a skill, or null when it would leave it (absolute, `..`, a backslash). @param {string} path */
function inside(path) {
  const clean = path.replace(/^(\.\/)+/, '')
  return !clean || clean.startsWith('/') || clean.includes('\\') || clean.split('/').includes('..') ? null : clean
}

/**
 * A tar's files. Links and devices make it invalid; long names (GNU and pax) are followed.
 * @param {Uint8Array} bytes @returns {{ path: string, bytes: Uint8Array }[]}
 */
export function untar(bytes) {
  const decode = (/** @type {Uint8Array} */ part) => new TextDecoder().decode(part).replace(/\0[\s\S]*$/, '')
  const files = []
  let long = ''
  for (let at = 0; at + 512 <= bytes.length;) {
    const head = bytes.subarray(at, at + 512)
    if (head.every((byte) => byte === 0)) break
    const size = parseInt(decode(head.subarray(124, 136)).trim() || '0', 8)
    const type = String.fromCharCode(head[156] || 48)
    const body = bytes.subarray(at + 512, at + 512 + size)
    at += 512 + Math.ceil(size / 512) * 512
    const prefix = decode(head.subarray(257, 262)) === 'ustar' ? decode(head.subarray(345, 500)) : ''
    const name = long || (prefix ? `${prefix}/` : '') + decode(head.subarray(0, 100))
    long = ''
    if (type === 'L') long = decode(body)
    else if (type === 'x') long = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(decode(body))?.[1] ?? ''
    else if (type === '0' || type === '7') files.push({ path: name, bytes: body.slice() })
    else if (type !== '5' && type !== 'g') throw new SkillError('invalid', `The archive holds a link or a device (${name}).`)
  }
  return files
}

/** @param {Uint8Array} bytes */
async function gunzip(bytes) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * What a download holds, once it matches its digest: the steps (SKILL.md's body), the text files
 * beside them, and the kinds of block it declares (D196). Anything that isn't text (a script, a
 * program, a picture) means the skill needs more than instructions, and it isn't added (D116).
 * @param {Entry} entry @param {Uint8Array} bytes
 * @returns {Promise<{ body: string, files: { path: string, text: string }[], blocks: string[] }>}
 */
export async function unpack(entry, bytes) {
  if (bytes.length > MAX_BYTES) throw new SkillError('invalid', 'The skill is too large.')
  if (await sha256(bytes) !== entry.digest) throw new SkillError('digest', 'What was downloaded doesn’t match the digest its index lists.')
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b
  const listed = entry.type === 'skill-md' ? [{ path: 'SKILL.md', bytes }]
    : zipped ? await Promise.all(readZip(bytes).map(async (file) => ({ path: file.name, bytes: await file.read() })))
    : bytes[0] === 0x1f && bytes[1] === 0x8b ? untar(await gunzip(bytes)) : []
  const strict = new TextDecoder('utf-8', { fatal: true })
  /** @type {{ path: string, text: string }[]} */
  const files = []
  let size = 0
  for (const file of listed) {
    const path = inside(file.path)
    if (path === null) throw new SkillError('invalid', `The archive reaches outside its folder (${file.path}).`)
    if (path.startsWith('__MACOSX/') || path.endsWith('.DS_Store')) continue
    if ((size += file.bytes.length) > MAX_BYTES) throw new SkillError('invalid', 'The skill is too large.')
    if (!TEXT.test(path)) throw new SkillError('programs', `The skill holds more than instructions (${path}).`)
    try {
      files.push({ path, text: strict.decode(file.bytes) })
    } catch {
      throw new SkillError('programs', `The skill holds more than instructions (${path}).`)
    }
  }
  const steps = files.find((file) => file.path === 'SKILL.md')
  if (!steps) throw new SkillError('invalid', 'There is no SKILL.md at the root.')
  const { data, body } = parseFrontMatter(steps.text)
  if (!body.trim()) throw new SkillError('invalid', 'SKILL.md has no steps.')
  return { body: body.trim(), files: files.filter((file) => file !== steps), blocks: blocksOf(data.metadata?.blocks) }
}

/** @param {string} url */
const cachePath = (url) => `.cache/skills/${[...url].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36)}.json`

/**
 * Every index, as last read: from .cache/ when it was read less than a day ago, otherwise
 * fetched again (an index that can't be read keeps what was read before, and says why).
 * @param {FS} fs @param {string[]} urls indexes' addresses
 * @param {{ fetch?: typeof globalThis.fetch, now?: Date, again?: boolean }} [options] again: whatever the cache holds
 * @returns {Promise<Index[]>}
 */
export function readIndexes(fs, urls, { fetch = globalThis.fetch, now = new Date(), again = false } = {}) {
  return Promise.all(urls.map(async (url) => {
    const path = cachePath(url)
    const kept = /** @type {Index | null} */ (await readJSON(fs, path, null))
    if (kept && !again && !kept.error && now.getTime() - Date.parse(kept.at) < FRESH_MS) return kept
    /** @type {Index} */
    let read
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(`The index answered ${response.status}.`)
      read = { url, at: now.toISOString(), skills: parseIndex(await response.json(), url) }
    } catch (error) {
      read = { url, at: now.toISOString(), skills: kept?.skills ?? [], error: /** @type {Error} */ (error).message || 'unreachable' }
    }
    await writeJSON(fs, path, read)
    return read
  }))
}

/** What a request is compared with: the name's words and the description. @param {Entry} entry */
const about = (entry) => `${entry.name.replace(/-/g, ' ')} ${entry.description}`

/**
 * The skill that fits a request best, if one is alike enough (alike(), D83), and the user doesn't
 * already have one by that name.
 * @param {string} request @param {Entry[]} entries @param {string[]} have names of the skills the user has
 * @param {number} enough the score past which a request and a description are of a kind
 * @returns {Entry | null}
 */
export function bestFit(request, entries, have, enough) {
  const open = entries.filter((entry) => !have.includes(entry.name))
  const scores = alike(request, open.map(about))
  const best = scores.reduce((top, score, i) => (score > (scores[top] ?? -1) ? i : top), -1)
  return best >= 0 && scores[best] >= enough ? open[best] : null
}
