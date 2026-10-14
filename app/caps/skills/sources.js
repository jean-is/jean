// Skills from elsewhere (D116, D121, D207): Agent Skills discovery indexes, the format's own way to
// publish skills (https://github.com/cloudflare/agent-skills-discovery-rfc, schema 0.2.0), and
// repositories on GitHub. Jean reads them whole and compares their descriptions with the user's
// requests here, on the device, so a request never goes anywhere. A skill comes in only when the
// user adds it, after reading its steps, once what was downloaded matches the digest its index
// lists, or git's hash of each file, and holds only instructions: SKILL.md and text, never programs.
// Host-agnostic: no DOM, tested under node --test.
import { readZip } from '../../core/zip.js'
import { sha256Hex } from '../../core/files.js'
import { blocksOf } from '../../core/skills.js'
import { readJSON, writeJSON } from '../../core/fs.js'
import { parseFrontMatter } from '../../core/settings.js'
import { alike } from '../../core/search.js'

/** @typedef {import('../../core/types.js').FS} FS */
/**
 * A skill an index or a repository offers. url: absolute (a folder's SKILL.md); source: where it is listed; files: a folder's, with git's hashes;
 * metadata: its SKILL.md's, for one of Jean's own (D222).
 * @typedef {{ name: string, type: 'skill-md' | 'archive' | 'folder', description: string, url: string, digest: string, source: string, files?: { path: string, sha: string, size: number }[], metadata?: Record<string, any> }} Entry
 */
/** What a source held when last read, or why it couldn't be, and until when (GitHub's limit). @typedef {{ url: string, at: string, skills: Entry[], error?: string, until?: string }} Index */

export const SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'

/**
 * The sources read unless the user or policy changes the list, checked from a browser's point of view
 * by `npm run directory` (D207): the indexes that answer browsers are developers', so these are the
 * folders of Anthropic's skills for knowledge work (Apache 2.0) about people's work rather than code.
 */
export const DEFAULT_SOURCES = Object.freeze(['small-business', 'marketing', 'sales', 'human-resources', 'legal', 'customer-support']
  .map((folder) => `https://github.com/anthropics/knowledge-work-plugins/tree/main/${folder}`))

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

/** A source's address from what the user typed: a site (its .well-known index), the index itself, or a repository on GitHub or one of its folders. @param {string} address */
export function indexURL(address) {
  const text = address.trim()
  const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  const repo = url.host === 'github.com' && `https://github.com${url.pathname.replace(/\.git$|\/+$/g, '')}`
  if (repo && !repoOf(repo)) throw new Error('Not a repository.')
  if (repo) return repo
  if (!url.pathname.endsWith('.json')) url.pathname = `${url.pathname.replace(/\/+$/, '')}/.well-known/agent-skills/index.json`
  return url.href
}

/** Where a skill or a source comes from, for people: its site, or its repository on GitHub, with a source's folder. @param {string} url */
export function siteOf(url) {
  const { host, pathname } = new URL(url)
  const [owner, repo, tree, , ...folder] = pathname.slice(1).split('/')
  if (host === 'raw.githubusercontent.com') return `github.com/${owner}/${repo}`
  return host === 'github.com' ? ['github.com', owner, repo, ...(tree === 'tree' ? folder : [])].join('/') : host
}

/** A repository on GitHub, or one of its folders (…/tree/<branch>/<folder>). @param {string} url */
function repoOf(url) {
  const [, owner, repo, ref = 'HEAD', folder = ''] = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?$/.exec(url) ?? []
  return owner ? { owner, repo, ref, folder: folder && `${folder}/` } : null
}

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
export const sha256 = async (bytes) => `sha256:${await sha256Hex(bytes)}`

/** git's name for a file's content, which GitHub lists: a blob's SHA-1. @param {Uint8Array} bytes */
export const gitHash = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new Uint8Array([...new TextEncoder().encode(`blob ${bytes.length}\0`), ...bytes])))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('')

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
export async function gunzip(bytes) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * What a download holds, once it matches its digest: the steps (SKILL.md's body), the text files
 * beside them, the kinds of block it declares (D196) and its metadata (D222). Anything that isn't text (a script, a
 * program, a picture) means the skill needs more than instructions, and it isn't added (D116).
 * @param {Entry} entry @param {Uint8Array} bytes
 * @returns {Promise<{ body: string, files: { path: string, text: string }[], blocks: string[], metadata?: Record<string, any> }>}
 */
export async function unpack(entry, bytes) {
  if (bytes.length > MAX_BYTES) throw new SkillError('invalid', 'The skill is too large.')
  if (await sha256(bytes) !== entry.digest) throw new SkillError('digest', 'What was downloaded doesn’t match the digest its index lists.')
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b
  return instructions(entry.type === 'skill-md' ? [{ path: 'SKILL.md', bytes }]
    : zipped ? await Promise.all(readZip(bytes).map(async (file) => ({ path: file.name, bytes: await file.read() })))
    : bytes[0] === 0x1f && bytes[1] === 0x8b ? untar(await gunzip(bytes)) : [])
}

/**
 * Downloads a skill and checks it (SkillError when it can't be added): against the digest its index
 * lists, or each file of a repository's, text alone, against git's hash of it. Jean's own (no digest)
 * is read from its file. @param {Entry} entry @param {typeof globalThis.fetch} [fetch]
 */
export async function fetchSkill(entry, fetch = globalThis.fetch) {
  const bytesOf = async (/** @type {string} */ url) => new Uint8Array(await (await answer(fetch, url)).arrayBuffer())
  if (!entry.digest) {
    const { data, body } = parseFrontMatter(new TextDecoder().decode(await bytesOf(entry.url)))
    return { body: body.trim(), files: [], blocks: blocksOf(data.metadata?.blocks), metadata: data.metadata }
  }
  if (!entry.files) return unpack(entry, await bytesOf(entry.url))
  const odd = entry.files.find((file) => !TEXT.test(file.path))
  if (odd) throw new SkillError('programs', `The skill holds more than instructions (${odd.path}).`)
  if (entry.files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) throw new SkillError('invalid', 'The skill is too large.')
  const folder = entry.url.slice(0, -'SKILL.md'.length)
  return instructions(await Promise.all(entry.files.map(async ({ path, sha }) => {
    const bytes = await bytesOf(folder + path)
    if (await gitHash(bytes) !== sha) throw new SkillError('digest', `${path} isn’t what the repository lists.`)
    return { path, bytes }
  })))
}

/** What a skill's files hold, as unpack() says. @param {{ path: string, bytes: Uint8Array }[]} listed */
function instructions(listed) {
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
  return { body: body.trim(), files: files.filter((file) => file !== steps), blocks: blocksOf(data.metadata?.blocks), metadata: data.metadata }
}

/** @param {string} url */
const cachePath = (url) => `.cache/skills/${[...url].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36)}.json`

/**
 * Every source, as last read: from .cache/ when it was read less than a day ago, otherwise
 * fetched again (a source that can't be read keeps what was read before, and says why, and waits
 * for GitHub's limit to reset). The folders of a repository share one call to GitHub's API.
 * @param {FS} fs @param {string[]} urls the indexes' and repositories' addresses
 * @param {{ fetch?: typeof globalThis.fetch, now?: Date, again?: boolean }} [options] again: whatever the cache holds
 * @returns {Promise<Index[]>}
 */
export function readIndexes(fs, urls, { fetch = globalThis.fetch, now = new Date(), again = false } = {}) {
  const trees = new Map()
  return Promise.all(urls.map(async (url) => {
    const path = cachePath(url)
    const kept = /** @type {Index | null} */ (await readJSON(fs, path, null))
    if (kept && !again && now.getTime() < (kept.error ? Date.parse(kept.until ?? kept.at) : Date.parse(kept.at) + FRESH_MS)) return kept
    /** @type {Index} */
    let read
    try {
      read = { url, at: now.toISOString(), skills: repoOf(url) ? await readRepo(url, fetch, trees) : parseIndex(await (await answer(fetch, url)).json(), url) }
    } catch (error) {
      const { message, until } = /** @type {Error & { until?: string }} */ (error)
      read = { url, at: now.toISOString(), skills: kept?.skills ?? [], error: message || 'unreachable', ...(until && { until }) }
    }
    await writeJSON(fs, path, read)
    return read
  }))
}

/** What an address answered, when it answered well; GitHub's API says when its limit resets. @param {typeof globalThis.fetch} fetch @param {string} url */
async function answer(fetch, url) {
  const response = await fetch(url)
  const reset = response.headers.get('x-ratelimit-remaining') === '0' && Number(response.headers.get('x-ratelimit-reset'))
  if (!response.ok) throw Object.assign(new Error(`${new URL(url).host} answered ${response.status}.`), reset ? { until: new Date(reset * 1000).toISOString() } : {})
  return response
}

/**
 * The skills of a repository on GitHub, or of one of its folders: each folder with a SKILL.md (one inside
 * another's is part of it) and git's hash of each file, from one call to GitHub's API (sixty an hour without
 * an account), then each SKILL.md from its files' host for its description.
 * @param {string} url @param {typeof globalThis.fetch} fetch @param {Map<string, Promise<any>>} [trees] the calls already made, by address
 */
async function readRepo(url, fetch, trees = new Map()) {
  const { owner, repo, ref, folder } = /** @type {NonNullable<ReturnType<typeof repoOf>>} */ (repoOf(url))
  const api = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`
  /** @type {{ sha: string, tree: { path: string, type: string, sha: string, size: number }[] }} */
  const { sha, tree } = await (trees.get(api) ?? trees.set(api, answer(fetch, api).then((response) => response.json())).get(api))
  const within = tree.filter((item) => `${item.path}/`.startsWith(folder))
  const homes = within.filter((item) => item.type === 'blob' && /(^|\/)SKILL\.md$/.test(item.path)).map((item) => item.path.slice(0, -'SKILL.md'.length))
  const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/`
  return (await Promise.all(homes.filter((home) => !homes.some((other) => other !== home && home.startsWith(other))).map(async (home) => {
    const { name, description } = parseFrontMatter(await fetch(raw + home + 'SKILL.md').then((response) => (response.ok ? response.text() : ''), () => '')).data
    const digest = (home && tree.find((item) => `${item.path}/` === home)?.sha) || sha
    const files = within.filter((item) => item.type === 'blob' && item.path.startsWith(home)).map((item) => ({ path: item.path.slice(home.length), sha: item.sha, size: item.size }))
    return typeof name === 'string' && NAME.test(name) && typeof description === 'string' && description.trim()
      ? [{ name, type: /** @type {const} */ ('folder'), description: description.trim().slice(0, 1024), url: `${raw}${home}SKILL.md`, digest: `git:${digest}`, source: url, files }] : []
  }))).flat()
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
