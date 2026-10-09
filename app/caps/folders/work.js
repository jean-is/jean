// Work in a folder (D141): its files listed, searched, read and changed where they are, through an
// FS on the folder (ui/opfs.js's folderFS, or a dropped folder's copy). No DOM: node tests run it on
// core/fs.js's memoryFS. Word, Excel and PowerPoint are read by Files' readers; PDFs by pdf.js, which
// only a browser has, so the capability passes it in. Word documents and workbooks change in place.
import { join } from '../../core/fs.js'
import { fold, terms, passage } from '../../core/search.js'
import { extractPages } from '../files/extract.js'
import { replaceInWord } from './word.js'
import { replaceInSheet } from '../files/cells.js'

/** @typedef {import('../../core/types.js').FS} FS */
/** @typedef {{ path: string, kind: 'file' | 'directory' }} Entry */
/** @typedef {{ size: number, lastModified: number }} Stamp */
/**
 * What reading a folder's files needs: PDFs' pages (a browser's), and texts already read, by path,
 * size and date, so a file is read again only once it changed.
 * @typedef {{ pdf?: (bytes: Uint8Array) => Promise<string[]>, cache?: Map<string, string | null> }} Readers
 */

// What a listing never goes into, whatever .gitignore says.
const SKIP = new Set(['.git', 'node_modules'])
const MAX_ENTRIES = 5000
// Files bigger than this aren't read to be searched, and a change keeps to files smaller than it.
const MAX_BYTES = 20 * 1024 * 1024
// What open gives back at once, about 6,000 tokens; what find_in_files lists at most.
const OPEN_CHARS = 24000
const FOUND = 60
const DOCUMENTS = /\.(docx|xlsx|pptx|pdf)$/i
const encoder = new TextEncoder()
/** What changes a passage of a Word document, or of a workbook, in place (D229). @param {string} path */
export const replacerOf = (path) => (/\.xlsx$/i.test(path) ? replaceInSheet : replaceInWord)

// ─── What the brain is told ──────────────────────────────────────────────────

/** The tools' names, descriptions and parameters: the capability's, and jean-cli's in an editor's folder. */
export const SPECS = {
  list: {
    name: 'list',
    description: "List the files and folders of the conversation's folder by path, leaving out .git, node_modules and what .gitignore names.",
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'A folder inside it; omit for all of it' }, depth: { type: 'number', description: 'How many levels down; omit for all' } } },
  },
  find: {
    name: 'find_in_files',
    description: "Find text in the files of the conversation's folder, Word, Excel, PowerPoint and PDF included, case and accents aside, in any language. Answers path, line and passage.",
    parameters: { type: 'object', properties: { text: { type: 'string', description: 'What to look for' }, path: { type: 'string', description: 'A folder inside it to look in' } }, required: ['text'] },
  },
  open: {
    name: 'open',
    description: "Read a file of the conversation's folder by its path, Word, Excel, PowerPoint and PDF included: all of it, or some lines.",
    parameters: { type: 'object', properties: { path: { type: 'string' }, lines: { type: 'string', description: 'e.g. "120-180"; omit to start at the top' } }, required: ['path'] },
  },
  change: {
    name: 'change',
    description: [
      "Change a file of the conversation's folder where it is: replace one passage, quoted exactly as open shows it, with new text.",
      'The passage must be there once; in a Word document, within one paragraph; in a spreadsheet, within one row, its cells apart by tabs, a formula starting with =. Open a file before changing it.',
      "An empty passage on a path that doesn't exist makes the file: a .docx from Markdown, an .xlsx from CSV, any other file as text.",
    ].join(' '),
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, old: { type: 'string', description: 'The passage, exactly as it is now; empty to make a file' }, new: { type: 'string', description: 'What replaces it' } },
      required: ['path', 'old', 'new'],
    },
  },
}
/** How <folder> tells the brain to use them. */
export const USE = 'Work on its files where they are, by their path, with list({ path?, depth? }), find_in_files({ text, path? }), open({ path, lines? }) and change({ path, old, new }). The user sees each change first.'

// ─── Listing ─────────────────────────────────────────────────────────────────

/** @typedef {{ negate: boolean, dir: boolean, base: string, re: RegExp }} Rule */

/** @param {string} char */
const escape = (char) => char.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/**
 * The patterns of a .gitignore, as rules for paths under the folder it is in (`base`, '' at the
 * top): `*`, `**`, `?` and `[…]`; a `/` at the start or inside anchors a pattern to that folder, one
 * at the end keeps it to folders, and `!` takes a path back.
 * @param {string} text @param {string} [base] @returns {Rule[]}
 */
export function ignoreRules(text, base = '') {
  return text.split(/\r?\n/).flatMap((line) => {
    let pattern = line.replace(/(?<!\\)\s+$/, '')
    if (!pattern || pattern.startsWith('#')) return []
    const negate = pattern.startsWith('!')
    if (negate) pattern = pattern.slice(1)
    const dir = pattern.endsWith('/')
    pattern = pattern.replace(/\/+$/, '')
    const anchored = pattern.includes('/')
    pattern = pattern.replace(/^\//, '')
    if (!pattern) return []
    let source = ''
    for (let i = 0; i < pattern.length; i++) {
      const char = pattern[i]
      if (pattern.startsWith('**/', i)) {
        source += '(?:.*/)?'
        i += 2
      } else if (pattern.startsWith('**', i)) {
        source += '.*'
        i++
      } else if (char === '*') source += '[^/]*'
      else if (char === '?') source += '[^/]'
      else if (char === '[' && pattern.indexOf(']', i + 2) > i) {
        const end = pattern.indexOf(']', i + 2)
        source += `[${pattern.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`
        i = end
      } else if (char === '\\' && i + 1 < pattern.length) source += escape(pattern[++i])
      else source += escape(char)
    }
    return [{ negate, dir, base, re: new RegExp(`^${anchored ? '' : '(?:.*/)?'}${source}$`) }]
  })
}

/** Whether the last rule that names a path leaves it out. @param {string} path @param {boolean} isDir @param {Rule[]} rules */
export function ignored(path, isDir, rules) {
  let out = false
  for (const rule of rules) {
    if ((rule.dir && !isDir) || (rule.base && !path.startsWith(`${rule.base}/`))) continue
    if (rule.re.test(rule.base ? path.slice(rule.base.length + 1) : path)) out = !rule.negate
  }
  return out
}

/**
 * Every file and folder under `dir`, by path, folders first at each level, leaving out .git,
 * node_modules and what each .gitignore names (those above `dir` too); `depth` 1 is `dir`'s own.
 * @param {FS} fs @param {string} [dir] @param {number} [depth]
 * @returns {Promise<{ entries: Entry[], more: boolean }>}
 */
export async function walkFolder(fs, dir = '', depth = Infinity) {
  /** @type {Rule[]} */
  const above = []
  const parts = dir ? dir.split('/') : []
  for (let i = 0; i < parts.length; i++) {
    const base = parts.slice(0, i).join('/')
    above.push(...ignoreRules((await fs.read(join(base, '.gitignore'))) ?? '', base))
  }
  /** @type {Entry[]} */
  const entries = []
  let more = false
  /** @param {string} folder @param {number} level @param {Rule[]} inherited */
  const visit = async (folder, level, inherited) => {
    const rules = [...inherited, ...ignoreRules((await fs.read(join(folder, '.gitignore'))) ?? '', folder)]
    const listed = (await fs.list(folder)).filter((entry) => !SKIP.has(entry.name) && !ignored(join(folder, entry.name), entry.kind === 'directory', rules))
    for (const entry of listed.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'directory' ? -1 : 1))) {
      if (entries.length >= MAX_ENTRIES) return void (more = true)
      const path = join(folder, entry.name)
      entries.push({ path, kind: entry.kind })
      if (entry.kind === 'directory' && level < depth) await visit(path, level + 1, rules)
    }
  }
  await visit(dir, 1, above)
  return { entries, more }
}

/** A listing as the brain reads it: a path per line, folders ending with "/". @param {{ entries: Entry[], more: boolean }} listing @param {number} [max] */
export function listingText({ entries, more }, max = 500) {
  const lines = entries.slice(0, max).map((entry) => (entry.kind === 'directory' ? `${entry.path}/` : entry.path))
  const left = entries.length - lines.length
  if (left > 0 || more) lines.push(`…and ${more ? 'more' : left} more. List a folder inside it to see them.`)
  return lines.join('\n') || 'It is empty.'
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/**
 * Text as it is in a file, its byte order mark and line endings kept; null for what isn't UTF-8
 * text: a picture, a program, a file of another encoding.
 * @param {Uint8Array} bytes
 */
export function exactText(bytes) {
  if (bytes.subarray(0, 8000).includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return null
  }
}

/**
 * A file's text as the brain sees it: a document's pages, a "[[page N]]" line before each when there
 * are several; other text without carriage returns or a byte order mark, in Windows-1252 when it
 * isn't UTF-8 (what older Windows apps save); null for what isn't text.
 * @param {string} path @param {Uint8Array} bytes @param {Readers} [readers]
 */
export async function textOf(path, bytes, { pdf } = {}) {
  if (DOCUMENTS.test(path)) {
    const pages = /\.pdf$/i.test(path) ? await pdf?.(bytes) : await extractPages(path, bytes)
    if (!pages) return null
    return pages.length > 1 ? pages.map((page, i) => `[[page ${i + 1}]]\n${page}`).join('\n\n') : pages[0] ?? ''
  }
  if (bytes.subarray(0, 8000).includes(0)) return null
  const text = exactText(bytes) ?? new TextDecoder('windows-1252').decode(bytes)
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}

/**
 * A file's text and its size and date, read again only once it changed. Null text: not text, too
 * big, or unreadable; null stamp: no such file.
 * @param {FS} fs @param {string} path @param {Readers} [readers]
 * @returns {Promise<{ text: string | null, stamp: Stamp | null }>}
 */
export async function readText(fs, path, readers = {}) {
  const stamp = await stampOf(fs, path)
  if (!stamp) return { text: null, stamp }
  if (stamp.size > MAX_BYTES) return { text: null, stamp }
  const key = `${path}|${stamp.size}|${stamp.lastModified}`
  if (readers.cache?.has(key)) return { text: readers.cache.get(key) ?? null, stamp }
  const bytes = await fs.readBytes(path)
  const text = bytes ? await textOf(path, bytes, readers).catch(() => null) : null
  readers.cache?.set(key, text)
  return { text, stamp }
}

/** A file's size and date, taken before it is read: if it changes meanwhile, it looks newer than what was read, never older. @param {FS} fs @param {string} path @returns {Promise<Stamp | null>} */
async function stampOf(fs, path) {
  if (fs.stat) return fs.stat(path)
  const bytes = await fs.readBytes(path)
  return bytes && { size: bytes.length, lastModified: 0 }
}

/**
 * Where a text is in the folder's files, case and accents aside, in any script: every line that holds
 * it whole, or, if no line does, every line that holds all its words. Each place as path, line and
 * passage; the files found, with their size and date, count as read.
 * @param {FS} fs @param {string} query @param {{ path?: string } & Readers} [options]
 * @returns {Promise<{ text: string, read: Record<string, [number, number]> }>}
 */
export async function findInFolder(fs, query, { path = '', ...readers } = {}) {
  const folded = fold(query.normalize('NFC')).trim()
  const words = terms(query)
  if (!folded) throw new Error('Say what text to look for.')
  // The text as it was typed, with any run of spaces where it has one.
  const phrase = new RegExp(folded.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'))
  const { entries } = await walkFolder(fs, path)
  /** @type {{ path: string, line: number, text: string, at: number }[]} */
  const whole = []
  /** @type {typeof whole} */
  const all = []
  /** @type {Record<string, [number, number]>} */
  const read = {}
  let skipped = 0
  for (const entry of entries) {
    if (entry.kind !== 'file') continue
    const { text, stamp } = await readText(fs, entry.path, readers)
    if (text === null) {
      if (stamp && stamp.size > MAX_BYTES) skipped++
      continue
    }
    const before = whole.length + all.length
    text.split('\n').forEach((raw, i) => {
      const line = raw.normalize('NFC')
      const same = fold(line)
      const at = same.search(phrase)
      if (at >= 0) whole.push({ path: entry.path, line: i + 1, text: line, at })
      else if (words.length > 1 && words.every((word) => same.includes(word))) all.push({ path: entry.path, line: i + 1, text: line, at: same.indexOf(words[0]) })
    })
    if (stamp && whole.length + all.length > before) read[entry.path] = [stamp.size, stamp.lastModified]
  }
  const places = whole.length ? whole : all
  const files = new Set(places.map((place) => place.path))
  for (const name of Object.keys(read)) if (!files.has(name)) delete read[name]
  if (!places.length) return { text: `Not found in ${entries.filter((entry) => entry.kind === 'file').length} files.${skipped ? ` ${skipped} files were too big to search.` : ''}`, read }
  const lines = places.slice(0, FOUND).map((place) => {
    const [start, end] = passage(place.text, place.at)
    return `${place.path}:${place.line}: ${start > 0 ? '…' : ''}${place.text.slice(start, end).trim()}${end < place.text.length ? '…' : ''}`
  })
  const summary = `${places.length} places in ${files.size} files${whole.length ? '' : ', with all its words but not together'}${places.length > FOUND ? `; the first ${FOUND} are listed` : ''}.${skipped ? ` ${skipped} files were too big to search.` : ''}`
  return { text: `${lines.join('\n')}\n\n${summary}`, read }
}

/** Lines asked for as "12", "10-80" or "40-": first and last, within the file. @param {unknown} lines @param {number} total */
export function lineRange(lines, total) {
  const match = /^\s*(\d+)\s*(?:[-–]\s*(\d*))?\s*$/.exec(String(lines ?? ''))
  if (!match) return [1, total]
  const first = Math.min(Math.max(1, Number(match[1])), total)
  const last = match[2] === undefined ? first : match[2] === '' ? total : Number(match[2])
  return [first, Math.min(Math.max(first, last), total)]
}

/**
 * A file's text, all of it or the lines asked for, up to about 6,000 tokens, under a line that says
 * which lines these are; with its size and date, as read.
 * @param {FS} fs @param {string} path @param {unknown} lines @param {Readers} [readers]
 */
export async function openText(fs, path, lines, readers = {}) {
  const { text, stamp } = await readText(fs, path, readers)
  if (!stamp) throw new Error(await fs.exists(path) ? `${path} is a folder: list it.` : `There is no file at ${path}. List the folder to find it.`)
  if (text === null) throw new Error(stamp.size > MAX_BYTES ? `${path} is too big to read here.` : `${path} isn't text: it can't be read here.`)
  const all = text.split('\n')
  const [first, last] = lineRange(lines, all.length)
  let out = ''
  let end = first - 1
  for (let n = first; n <= last; n++) {
    if (out && out.length + all[n - 1].length > OPEN_CHARS) break
    out += `${all[n - 1]}\n`
    end = n
  }
  const more = end < all.length ? ` Read on with lines ${end + 1}-.` : ''
  return { text: `${path}, lines ${first}-${end} of ${all.length}.${more}\n${out}`, stamp }
}

// ─── Changing ────────────────────────────────────────────────────────────────

/**
 * One passage of a text file replaced, quoted exactly and found once, in the file's own line
 * endings: a file whose lines all end in CRLF is matched and written back with CRLF.
 * @param {string} raw @param {string} old @param {string} replacement @param {string} name
 * @param {(text: string, old: string, replacement: string, name: string) => string} replaceOnce
 */
export function changeText(raw, old, replacement, name, replaceOnce) {
  const crlf = raw.includes('\r\n') && !/(^|[^\r])\n/.test(raw)
  const lf = (/** @type {string} */ text) => text.replace(/\r\n/g, '\n')
  const changed = replaceOnce(crlf ? lf(raw) : raw, crlf ? lf(old) : old, crlf ? lf(replacement) : replacement, name)
  return crlf ? changed.replace(/\n/g, '\r\n') : changed
}

/**
 * A change, worked out before it is made: the file's text before (null for a file it makes) and
 * after, as a diff shows them, and the bytes to write. One passage, quoted exactly and found once; in
 * a Word document, within one paragraph; in a workbook, within one row; or, from an empty passage on a path that doesn't exist yet,
 * a file made: Word and Excel from Markdown and CSV (Things Jean made's writers), other files as text.
 * @param {FS} fs @param {{ path: string, old: string, new: string }} change @param {Readers & { paper?: 'a4' | 'letter' }} [readers]
 * @returns {Promise<{ path: string, before: string | null, after: string, bytes: Uint8Array }>}
 */
export async function planChange(fs, { path, old, new: replacement }, readers = {}) {
  const { replaceOnce, makeFile } = await import('../made/formats.js')
  const stamp = await stampOf(fs, path)
  if (!stamp) {
    if (old) throw new Error(`There is no file at ${path}. To make one, give an empty passage.`)
    if (/\.(docx|xlsx)$/i.test(path)) {
      const made = await makeFile(path.split('/').at(-1) ?? path, replacement, { paper: readers.paper })
      return { path, before: null, after: replacement, bytes: made.bytes }
    }
    return { path, before: null, after: replacement, bytes: encoder.encode(replacement) }
  }
  if (stamp.size > MAX_BYTES) throw new Error(`${path} is too big to change here.`)
  const bytes = /** @type {Uint8Array} */ (await fs.readBytes(path))
  if (/\.(docx|xlsx)$/i.test(path)) {
    const changed = await replacerOf(path)(bytes, old, replacement, path, replaceOnce)
    const text = async (/** @type {Uint8Array} */ data) => /** @type {string} */ (await textOf(path, data, readers))
    return { path, before: await text(bytes), after: await text(changed), bytes: changed }
  }
  if (DOCUMENTS.test(path)) throw new Error(`${path} can't be changed in place. Make a new file beside it instead.`)
  const raw = exactText(bytes)
  if (raw === null) throw new Error(`${path} isn't UTF-8 text: it can't be changed safely here.`)
  const after = changeText(raw, old, replacement, path, replaceOnce)
  return { path, before: raw, after, bytes: encoder.encode(after) }
}

/**
 * What changed, for the eye: the lines removed and added between what stayed the same at either
 * end (a change is one passage), with up to three lines around them, and the first one's number.
 * @param {string | null} before @param {string} after
 * @returns {{ line: number, rows: { kind: ' ' | '-' | '+', text: string }[] }}
 */
export function diffLines(before, after, around = 3) {
  const lines = (/** @type {string} */ text) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  const b = lines(after)
  if (before === null) return { line: 1, rows: b.map((text) => ({ kind: '+', text })) }
  const a = lines(before)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  const from = Math.max(0, start - around)
  /** @param {' ' | '-' | '+'} kind @returns {(text: string) => { kind: ' ' | '-' | '+', text: string }} */
  const row = (kind) => (text) => ({ kind, text })
  return {
    line: from + 1,
    rows: [
      ...a.slice(from, start).map(row(' ')),
      ...a.slice(start, a.length - end).map(row('-')),
      ...b.slice(start, b.length - end).map(row('+')),
      ...a.slice(a.length - end, a.length - end + around).map(row(' ')),
    ],
  }
}

/**
 * The size and date a file had when Jean last read or changed it in a conversation, from its calls
 * so far (`_meta.read`, in the folder `_meta.folder`): what a change checks it against.
 * @param {import('../../core/types.js').ToolCallInfo[]} calls in the order they were made
 * @param {string} folder @param {string} path @returns {[number, number] | undefined}
 */
export function lastRead(calls, folder, path) {
  return calls.findLast((call) => call.status === 'completed' && call._meta?.folder === folder && call._meta.read?.[path])?._meta?.read[path]
}

/** The top of a folder, for the prompt: its first entries, folders ending with "/". @param {FS} fs */
export async function topLevel(fs, max = 40) {
  const listing = await walkFolder(fs, '', 1)
  return listingText(listing, max)
}
