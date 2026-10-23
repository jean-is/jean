// The project's file library: files/sha256-<hash>.<ext> (the original), .md (its text,
// with a [[page N]] line before each page) and .meta.json. Named by content, so the
// same file dropped twice is stored once. Conversations link to files, never copy them.
import { encoder, join, readJSON, walk, writeJSON } from './fs.js'
import { isPicture } from './events.js'
import { lexicon, lookup } from './search.js'

/** @import { FS, Envelope, ResourceLink, DocumentPart } from './types.js' */
/** @typedef {{ format: 1, kind: 'file', name: string, mimeType: string, size: number, hash: string, pages: number, createdAt: string, author: string, pinned?: boolean }} FileMeta */

const MARKER = /^\[\[page (\d+)\]\]$/m

/** @param {Uint8Array} bytes */
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** @param {string} text */
const utf8 = (text) => encoder.encode(text).length

/** Rough and deliberately high: UTF-8 bytes / 3 (about right for CJK, generous for Latin). @param {string} text */
export const estimateTokens = (text) => Math.ceil(utf8(text) / 3)

/** Roughly how much a request's messages take of a brain's window, pictures and replayed blocks aside (D359). @param {unknown} value */
export const estimateMessages = (value) => estimateTokens(JSON.stringify(value, (key, part) => (key === 'images' || key === 'raw' ? undefined : part)) ?? '')

/** @param {string[]} pages @param {number} [first] the first one's number */
export const joinPages = (pages, first = 1) => pages.map((page, i) => `[[page ${first + i}]]\n${page}`).join('\n\n')

/** @param {string} text @returns {string[]} */
export function splitPages(text) {
  const parts = text.split(/^\[\[page \d+\]\]\n?/m)
  return MARKER.test(text) ? parts.slice(1).map((page) => page.trim()) : [text.trim()]
}

/**
 * Stores a file and its extracted text. Returns the link a conversation keeps.
 * @param {FS} fs @param {{ projectDir: string, name: string, mimeType?: string, bytes: Uint8Array, pages: string[], by: string, now?: Date }} input
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
export const fileText = (fs, projectDir, uri) => fs.read(join(projectDir, textPath(uri)))

/** @param {FS} fs @param {string} projectDir @param {string} uri @returns {Promise<FileMeta | null>} */
export const fileMeta = (fs, projectDir, uri) => readJSON(fs, join(projectDir, textPath(uri).replace(/\.md$/, '.meta.json')))

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
 * A document's pages cut for searching: passages of about `size` tokens (100 scored best, D24), never across a page, cut
 * where a line ends (a longer line in pieces) or a heading starts. Each knows its page, where it lies
 * in it, and what heads it: the headings above, a level each (lines starting with #), else its page's
 * first line that reads like one and isn't on most pages' tops (a running header, a page number), and
 * a table's column names.
 * @param {string[]} pages @returns {{ page: number, start: number, end: number, head: string }[]}
 */
export function passages(pages, size = 100) {
  /** @type {Map<string, number>} */
  const tops = new Map()
  for (const page of pages) for (const line of page.split('\n', 3)) tops.set(line.replace(/\d+/g, '#'), (tops.get(line.replace(/\d+/g, '#')) ?? 0) + 1)
  /** @type {{ page: number, start: number, end: number, head: string, bytes: number }[]} */
  const out = []
  /** @type {string[]} the headings above, a level each */
  let path = []
  pages.forEach((text, i) => {
    // The page's first line that reads like a heading, the columns of the table under way, where the line starts.
    let [first, columns, at] = ['', '', 0]
    /** @type {typeof out[number] | null} */
    let passage = null
    for (const line of text.split('\n')) {
      const tabular = /\t|^\|/.test(line)
      const level = /^(#{1,6})\s/.exec(line)?.[1].length ?? 0
      // A heading starts a passage, once the one before is half full.
      if (level && passage && passage.bytes > size * 1.5) passage = (out.push(passage), null)
      const bytes = utf8(line) + 1
      const step = Math.max(1, Math.floor(size * 3 * (line.length + 1) / bytes))
      for (let cut = at; cut <= at + line.length; cut += step) {
        const end = Math.min(at + line.length, cut + step)
        const piece = bytes * (end - cut + 1) / (line.length + 1)
        if (passage && passage.bytes + piece > size * 3) passage = (out.push(passage), null)
        // A passage that starts with a heading is headed by the levels above it.
        const above = (level && cut === at ? path.slice(0, level - 1) : path).filter(Boolean).join(' › ') || (level ? '' : first)
        passage ??= { page: i + 1, start: cut, end, bytes: 0, head: [above, tabular && columns !== line && columns !== above ? columns : ''].filter(Boolean).join('\n') }
        passage.end = end
        passage.bytes += piece
      }
      if (level) path = Object.assign(path.slice(0, level - 1), { [level - 1]: line.slice(level).trim() })
      // A first line heads the page only if it reads like a heading: not a table's row, not mostly figures.
      else if (!first && line.trim() && !tabular && (line.match(/\d/g)?.length ?? 0) <= line.length / 5 && !(pages.length > 2 && (tops.get(line.replace(/\d+/g, '#')) ?? 0) > pages.length / 2)) first = line.trim().slice(0, 120)
      columns = tabular ? columns || line : ''
      at += line.length + 1
    }
    if (passage) out.push(passage)
  })
  return out.filter((p) => pages[p.page - 1].slice(p.start, p.end).trim()).map(({ page, start, end, head }) => ({ page, start, end, head }))
}

/** A document's passages and their index, made in memory. @param {string[]} pages */
export function indexOf(pages, size = 100) {
  const cut = passages(pages, size)
  return { passages: cut, lexicon: lexicon(cut.map((p) => `${p.head}\n${pages[p.page - 1].slice(p.start, p.end)}`)) }
}

/** Page numbers as ranges. @param {number[]} numbers @returns {[number, number][]} */
export const ranges = (numbers) => [...new Set(numbers)].sort((a, b) => a - b).reduce((/** @type {[number, number][]} */ out, n) => (n === out[out.length - 1]?.[1] + 1
  ? out[out.length - 1][1] = n : out.push([n, n]), out), [])

/**
 * The pages a brain reads of a file too long for its budget: page 1, then those whose passages best
 * match the message; the first pages when nothing in it stands out (no word rarer than most).
 * @param {string[]} pages @param {string} message @param {number} budget tokens
 * @returns {[number, number][]} ranges of pages, 1-based
 */
export function preselect(pages, message, budget, index = indexOf(pages)) {
  const hits = lookup([index.lexicon], message)
  if (!hits.length || hits[0].score < 2 || pages.reduce((sum, page) => sum + estimateTokens(page), 0) <= budget) return [pagesThatFit(pages, budget)]
  const chosen = [1]
  let used = estimateTokens(pages[0])
  for (const { passage } of hits) {
    const page = index.passages[passage].page
    if (chosen.includes(page) || used + estimateTokens(pages[page - 1]) > budget) continue
    chosen.push(page)
    used += estimateTokens(pages[page - 1])
  }
  return ranges(chosen)
}

/**
 * The text the brain reads for a linked file, using the pages recorded on the link. A picture, or a
 * scan (a PDF whose pages have no text, D479), comes with its pictures for a brain that can see, only
 * the first pages of a long scan, and is only named to one that can't.
 * @param {ResourceLink} link @param {string | null} text the file's extracted text
 * @param {{ mimeType: string, data: string }[]} [pictures] a picture, or a scan's pages, base64
 * @returns {DocumentPart}
 */
export function documentPart(link, text, pictures) {
  const part = { name: link.name, ...(link._meta?.source && { source: link._meta.source }) }
  if (text === null) return { ...part, text: '(This file is no longer available.)' }
  const pages = splitPages(text)
  const what = isPicture(link) ? 'picture' : /\.pdf$/.test(link.uri) && !pages.join('').trim() ? 'scan' : ''
  if (what && pictures?.length) return { ...part, text: what === 'picture' ? '(The picture follows.)' : `(A scan: pictures of its ${pictures.length < pages.length ? `first ${pictures.length} pages of ${pages.length}` : 'pages'} follow.)`, images: pictures }
  if (what) return { ...part, text: `(A ${what}. You cannot see pictures: say so if the user asks about it.)` }
  const chosen = link._meta?.pages ?? [[1, pages.length]]
  if (chosen.length === 1 && chosen[0][0] === 1 && chosen[0][1] >= pages.length) return { ...part, text: pages.length > 1 ? joinPages(pages) : pages[0] }
  const which = chosen.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(', ')
  return { ...part, text: `${chosen.map(([a, b]) => joinPages(pages.slice(a - 1, b), a)).join('\n\n')}\n\n(${/[–,]/.test(which) ? 'Pages' : 'Page'} ${which} of ${pages.length}. Use read for the others.)` }
}

/**
 * The number each file is cited by: the one it was first shared with, else the next one.
 * @param {ResourceLink[]} earlier links already in the conversation @param {ResourceLink} link
 */
export function sourceNumber(earlier, link) {
  const numbers = earlier.map((other) => other._meta?.source ?? 0)
  return earlier.find((other) => other.uri === link.uri && other._meta?.source)?._meta?.source ?? Math.max(0, ...numbers) + 1
}

/** The number a turn's first new source is cited by: after every file and source so far (D71). @param {Envelope[]} records */
export const nextSource = (records) => 1 + Math.max(0, ...records.flatMap(({ update }) => (update?.sessionUpdate === 'user_message_chunk' && update.content.type === 'resource_link'
  ? [update.content._meta?.source ?? 0] : update?.sessionUpdate === 'tool_call' ? (update._meta?.sources ?? []).map((source) => source.n) : [])))

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
      const text = await fileText(fs, projectDir(), link.uri)
      if (text === null) throw new Error(`"${link.name}" is no longer available.`)
      const pages = splitPages(text)
      if (!pages.join('').trim()) throw new Error(`"${link.name}" is a picture or a scan, with the message it came in: it has no text to read.`)
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
 * @param {FS} fs @returns {Promise<Record<'conversations' | 'files' | 'workspace' | 'rest', number>>}
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
