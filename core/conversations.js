// Conversations are append-only JSONL files: `${projectDir}/conversations/${id}.jsonl`.
// Line 1 is a ConversationHeader, every following line one Envelope.
// A crash mid-append leaves a half-written last line, which is ignored on read.

import { join } from './fs.js'
import { ulid } from './ulid.js'
import { openingOf } from './events.js'

/** @import { FS, Envelope, ConversationHeader, ConversationSummary } from './types.js' */
/** @typedef {{ header: ConversationHeader, records: Envelope[], title: string, updatedAt: string }} Conversation */

// Paths known to end with '\n', per FS. Before the first append to any other path we check
// for a torn last line, so the next record starts on its own line instead of being glued to it.
/** @type {WeakMap<FS, Set<string>>} */
const clean = new WeakMap()

/** @param {FS} fs @param {string} path @param {boolean} isClean */
function setClean(fs, path, isClean) {
  let paths = clean.get(fs)
  if (!paths) clean.set(fs, (paths = new Set()))
  if (isClean) paths.add(path)
  else paths.delete(path)
}

/**
 * @param {FS} fs
 * @param {{ projectDir: string, by: string, now?: Date }} options
 * @returns {Promise<{ id: string, path: string, header: ConversationHeader }>}
 */
export async function createConversation(fs, { projectDir, by, now = new Date() }) {
  const id = ulid(now.getTime())
  const path = join(projectDir, 'conversations', `${id}.jsonl`)
  /** @type {ConversationHeader} */
  const header = { format: 1, kind: 'conversation', id, createdAt: now.toISOString(), by }
  await fs.write(path, JSON.stringify(header) + '\n')
  setClean(fs, path, true)
  return { id, path, header }
}

/**
 * Appends every record in a single fs.append call.
 * @param {FS} fs
 * @param {string} path
 * @param {Envelope[]} records
 */
export async function appendRecords(fs, path, records) {
  if (!records.length) return
  let text = records.map((record) => JSON.stringify(record) + '\n').join('')
  if (!clean.get(fs)?.has(path)) {
    const current = await fs.read(path)
    if (current === null) throw new Error(`Conversation not found: ${path}`)
    if (current && !current.endsWith('\n')) text = '\n' + text
  }
  await fs.append(path, text)
  setClean(fs, path, true)
}

/**
 * @param {string | undefined} line
 * @returns {any} the parsed object, or null when the line is not a JSON object
 */
function parseLine(line) {
  if (line === undefined) return null
  try {
    const value = JSON.parse(line)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/**
 * @param {FS} fs
 * @param {string} path
 * @returns {Promise<Conversation | null>} null when the file does not exist
 */
export async function loadConversation(fs, path) {
  const text = await fs.read(path)
  if (text === null) return null
  const lines = text.split('\n').filter((line) => line.trim())
  const header = parseLine(lines[0])
  if (header?.kind !== 'conversation' || header.format !== 1) {
    throw new Error(`Not a conversation file (or unsupported format): ${path}`)
  }
  /** @type {Envelope[]} */
  const records = []
  let title = ''
  let updatedAt = header.createdAt
  for (let i = 1; i < lines.length; i++) {
    const record = parseLine(lines[i])
    if (!record) {
      if (i < lines.length - 1) console.warn(`Skipping malformed record ${i} in ${path}`)
      continue
    }
    records.push(record)
    if (typeof record.meta?.title === 'string') title = record.meta.title
    if (typeof record.at === 'string') updatedAt = record.at
  }
  setClean(fs, path, text.endsWith('\n'))
  return { header, records, title, updatedAt }
}

/**
 * @param {FS} fs
 * @param {string} path
 * @param {string} id
 * @returns {Promise<ConversationSummary | null>}
 */
async function summarize(fs, path, id) {
  try {
    const conversation = await loadConversation(fs, path)
    if (!conversation) return null
    const { header, records, title, updatedAt } = conversation
    // The opening request's start, for "the third request of a kind" (D83).
    return { id, path, title, opening: openingOf(records).slice(0, 200), createdAt: header.createdAt, updatedAt }
  } catch (err) {
    console.warn(`Skipping unreadable conversation ${path}`, err)
    return null
  }
}

/** @param {string} a @param {string} b */
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Reads every conversation in full (fine for 0.1; an index in .cache/ can come later).
 * @param {FS} fs
 * @param {string} projectDir
 * @returns {Promise<ConversationSummary[]>} most recently updated first
 */
export async function listConversations(fs, projectDir) {
  const dir = join(projectDir, 'conversations')
  const files = (await fs.list(dir)).filter((entry) => entry.kind === 'file' && entry.name.endsWith('.jsonl'))
  const summaries = await Promise.all(
    files.map((entry) => summarize(fs, join(dir, entry.name), entry.name.slice(0, -'.jsonl'.length))),
  )
  return summaries
    .filter((summary) => summary !== null)
    .sort((a, b) => compare(b.updatedAt, a.updatedAt) || compare(b.id, a.id))
}

/**
 * @param {FS} fs
 * @param {string} path
 */
export async function deleteConversation(fs, path) {
  await fs.remove(path)
  setClean(fs, path, false)
}
