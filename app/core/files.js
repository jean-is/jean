// The project's file library: files/sha256-<hash>.<ext> (the original), .md (its text,
// with a [[page N]] line before each page) and .meta.json. Named by content, so the
// same file dropped twice is stored once. Conversations link to files, never copy them.
import { join, readJSON, walk, writeJSON } from './fs.js'
import { isPicture } from './events.js'

/** @import { FS, ResourceLink, DocumentPart } from './types.js' */
/** @typedef {{ format: 1, kind: 'file', name: string, mimeType: string, size: number, hash: string, pages: number, createdAt: string, author: string }} FileMeta */

const MARKER = /^\[\[page (\d+)\]\]$/m

/** @param {Uint8Array} bytes */
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Rough and deliberately high: UTF-8 bytes / 3 (about right for CJK, generous for Latin). @param {string} text */
export const estimateTokens = (text) => Math.ceil(new TextEncoder().encode(text).length / 3)

/** @param {string[]} pages */
export const joinPages = (pages) => pages.map((page, i) => `[[page ${i + 1}]]\n${page}`).join('\n\n')

/** @param {string} text @returns {string[]} */
export function splitPages(text) {
  const parts = text.split(/^\[\[page \d+\]\]\n?/m)
  return MARKER.test(text) ? parts.slice(1).map((page) => page.trim()) : [text.trim()]
}

/**
 * Stores a file and its extracted text. Returns the link a conversation keeps.
 * @param {FS} fs
 * @param {{ projectDir: string, name: string, mimeType?: string, bytes: Uint8Array, pages: string[], by: string, now?: Date }} input
 * @returns {Promise<ResourceLink>}
 */
export async function addFile(fs, { projectDir, name, mimeType = '', bytes, pages, by, now = new Date() }) {
  const hash = await sha256Hex(bytes)
  const ext = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1]?.toLowerCase() ?? 'bin'
  const uri = `files/sha256-${hash}.${ext}`
  const base = join(projectDir, `files/sha256-${hash}`)
  if (!(await fs.exists(join(projectDir, uri)))) {
    await fs.writeBytes(join(projectDir, uri), bytes)
    await fs.write(`${base}.md`, joinPages(pages))
    /** @type {FileMeta} */
    const meta = { format: 1, kind: 'file', name, mimeType, size: bytes.length, hash, pages: pages.length, createdAt: now.toISOString(), author: by }
    await writeJSON(fs, `${base}.meta.json`, meta)
  }
  return { type: 'resource_link', uri, name, ...(mimeType && { mimeType }), size: bytes.length }
}

/** @param {string} uri @returns {string} the extracted text's path, relative to the project */
const textPath = (uri) => uri.replace(/\.[^./]+$/, '.md')

/** @param {FS} fs @param {string} projectDir @param {string} uri */
export async function fileText(fs, projectDir, uri) {
  return fs.read(join(projectDir, textPath(uri)))
}

/** @param {FS} fs @param {string} projectDir @param {string} uri @returns {Promise<FileMeta | null>} */
export async function fileMeta(fs, projectDir, uri) {
  return readJSON(fs, join(projectDir, textPath(uri).replace(/\.md$/, '.meta.json')))
}

/**
 * Which pages of a file go into the brain's context: all of them if they fit the budget,
 * otherwise the first ones that do (at least one). Decided once, when the message is sent,
 * and recorded on the link, so the conversation's prefix never changes afterwards (D46).
 * @param {string[]} pages @param {number} budgetTokens
 * @returns {[number, number]} first and last page, 1-based
 */
export function pagesThatFit(pages, budgetTokens) {
  let used = 0
  let last = 0
  for (const page of pages) {
    used += estimateTokens(page)
    if (used > budgetTokens && last > 0) break
    last++
  }
  return [1, Math.max(last, 1)]
}

/**
 * The text the brain reads for a linked file, using the pages recorded on the link. A picture
 * comes with its bytes for a brain that can see, and is only named to one that can't.
 * @param {ResourceLink} link @param {string | null} text the file's extracted text
 * @param {string} [picture] a picture's bytes, base64
 * @returns {DocumentPart}
 */
export function documentPart(link, text, picture) {
  const part = { name: link.name, ...(link._meta?.source && { source: link._meta.source }) }
  if (text === null) return { ...part, text: '(This file is no longer available.)' }
  if (isPicture(link) && picture) return { ...part, text: '(The picture follows.)', image: { mimeType: String(link.mimeType), data: picture } }
  if (isPicture(link)) return { ...part, text: '(A picture. You cannot see pictures: say so if the user asks about it.)' }
  const pages = splitPages(text)
  const [first, last] = link._meta?.pages ?? [1, pages.length]
  if (first === 1 && last >= pages.length) return { ...part, text: pages.length > 1 ? joinPages(pages) : pages[0] }
  const shown = pages.slice(first - 1, last).map((page, i) => `[[page ${first + i}]]\n${page}`).join('\n\n')
  return { ...part, text: `${shown}\n\n(Pages ${first}–${last} of ${pages.length}. Use read for the others.)` }
}

/**
 * The number each file is cited by: the one it was first shared with, else the next one.
 * @param {ResourceLink[]} earlier links already in the conversation @param {ResourceLink} link
 */
export function sourceNumber(earlier, link) {
  const numbers = earlier.map((other) => other._meta?.source ?? 0)
  return earlier.find((other) => other.uri === link.uri && other._meta?.source)?._meta?.source ?? Math.max(0, ...numbers) + 1
}

/**
 * "3", "2-5" or "4-" → a 1-based inclusive range within 1..count.
 * @param {string | number | undefined} spec @param {number} count
 * @returns {[number, number]}
 */
export function parsePages(spec, count) {
  const match = /^\s*(\d+)?\s*(?:[-–]\s*(\d+)?)?\s*$/.exec(String(spec ?? ''))
  if (!match || (!match[1] && !match[2])) return [1, count]
  const first = Math.min(Math.max(Number(match[1] ?? 1), 1), count)
  const last = match[2] ? Math.min(Number(match[2]), count) : /[-–]/.test(String(spec)) ? count : first
  return [first, Math.max(first, last)]
}

/**
 * The `read` tool: pages of a file the user shared in this project. Long reads are cut to
 * about maxTokens so a small brain's context isn't flooded.
 * @param {{ fs: FS, projectDir: () => string, files: (signal?: AbortSignal) => ResourceLink[], maxTokens?: number }} options
 *   files: those of the conversation a run's signal belongs to, which may not be on screen (D147)
 * @returns {import('./loop.js').Tool}
 */
export function readTool({ fs, projectDir, files, maxTokens = 6000 }) {
  /** @param {any} args @param {AbortSignal} [signal] */
  const find = (args, signal) => {
    const wanted = String(args?.file ?? '').trim().toLowerCase()
    return files(signal).findLast((link) => link.name.toLowerCase() === wanted || link.uri.toLowerCase() === wanted)
  }
  return {
    spec: {
      name: 'read',
      description: 'Read pages of a file the user shared. Pages are numbered from 1.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'The file name, as shown in the conversation' },
          pages: { type: 'string', description: 'A page or a range, e.g. "3" or "2-5". Omit to start at page 1.' },
        },
        required: ['file'],
      },
    },
    kind: 'read',
    title: (args) => `Read ${args?.file ?? ''}`,
    locations: (args) => {
      const link = find(args)
      return link ? [{ path: link.uri }] : []
    },
    run: async (args, ctx) => {
      const link = find(args, ctx?.signal)
      if (!link) throw new Error(`No file named "${args?.file}". Files: ${files(ctx?.signal).map((f) => f.name).join(', ') || 'none'}.`)
      if (isPicture(link)) throw new Error(`"${link.name}" is a picture, with the message it came in: it has no text to read.`)
      const text = await fileText(fs, projectDir(), link.uri)
      if (text === null) throw new Error(`"${link.name}" is no longer available.`)
      const pages = splitPages(text)
      const [first, wantedLast] = parsePages(args?.pages, pages.length)
      let out = ''
      let last = first - 1
      for (let n = first; n <= wantedLast; n++) {
        const next = `[[page ${n}]]\n${pages[n - 1]}\n\n`
        if (out && estimateTokens(out + next) > maxTokens) break
        out += next
        last = n
      }
      const more = last < pages.length ? ` Pages ${last + 1}–${pages.length} are not shown.` : ''
      const source = link._meta?.source ? `Source [${link._meta.source}]: ` : ''
      return `${source}${link.name}, pages ${first}–${last} of ${pages.length}.${more}\n\n${out.trim()}`
    },
  }
}

/**
 * What Jean's files take, in bytes, by kind, for Settings › Your data (D177): projects' conversations, files
 * and workspaces, and the rest (settings, memory, instructions, skills, routines, keys, indexes).
 * @param {FS} fs
 * @returns {Promise<Record<'conversations' | 'files' | 'workspace' | 'rest', number>>}
 */
export async function weigh(fs) {
  const kinds = { conversations: 0, files: 0, workspace: 0, rest: 0 }
  await Promise.all((await walk(fs)).map(async (path) => {
    const [top, , folder = ''] = path.split('/')
    const kind = top === 'projects' && (folder === 'conversations' || folder === 'files' || folder === 'workspace') ? folder : 'rest'
    const size = (fs.stat ? (await fs.stat(path))?.size : (await fs.readBytes(path))?.length) ?? 0
    kinds[kind] += size
  }))
  return kinds
}
