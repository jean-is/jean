// Bringing in what another assistant kept (D340, D341): Gemini's export from Google Takeout,
// ChatGPT's or Claude's, a .zip or a .tgz, its parts together, or its JSON alone. Which one it is
// comes from what it holds, never its name: conversations.json at its root (or conversations-000.json
// and on), ChatGPT's when a conversation has a `mapping`, Claude's when it has `chat_messages`, and
// Claude's projects.json; else Takeout's folders. Each source's module reads its export as
// conversations, projects and files, and this one writes them into Jean. Nothing is deleted, and
// what was brought in before isn't brought in again: a conversation's file is named by a ULID of
// its start and a hash of where it came from, and a project is left alone when one has its name.
import { readZip } from '../../core/zip.js'
import { join } from '../../core/fs.js'
import { addFile } from '../../core/files.js'
import { envelope, metaRecord, userRecords } from '../../core/events.js'
import { createProject, listProjects, stringifyFrontMatter } from '../../core/settings.js'
import { firstWords } from '../../core/i18n.js'
import { ulid, ALPHABET } from '../../core/ulid.js'
import { untar, gunzip } from '../skills/sources.js'
import { extractPages } from '../files/extract.js'

/** @import { FS, Envelope, ResourceLink } from '../../core/types.js' */
/**
 * @typedef {{ path: string, read: () => Promise<Uint8Array> }} Entry a file of an archive, read when asked
 * @typedef {{ name: string, read: () => Promise<Uint8Array>, type?: string }} Shared a file shared in a conversation, or a project's
 * @typedef {{ time: string, request: string, answer: string, files: Shared[] }} Turn
 * @typedef {{ key: string, title: string, turns: Turn[] }} Chat its key says where it came from, the same each time
 * @typedef {{ name: string, instructions: string, files: Shared[] }} Room a project
 * @typedef {{ chats: Chat[], rooms: Room[], files: Shared[] }} Found
 */

const decoder = new TextDecoder()
const TYPES = /** @type {Record<string, string>} */ ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', mp4: 'video/mp4' })

/** An archive's files: a zip, a tgz or a tar; anything else is a file of its own. @param {Uint8Array} bytes @param {string} name @returns {Promise<Entry[]>} */
export async function unpack(bytes, name) {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readZip(bytes).map((entry) => ({ path: entry.name, read: entry.read }))
  const tar = bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzip(bytes) : bytes
  const files = decoder.decode(tar.subarray(257, 262)) === 'ustar' ? untar(tar) : [{ path: name, bytes: tar }]
  return files.map((file) => ({ path: file.path, read: async () => file.bytes }))
}

/** A file's JSON, or null. @param {Entry | undefined} entry @returns {Promise<any>} */
export const readJSON = (entry) => (async () => entry && JSON.parse(decoder.decode(await entry.read())))().catch(() => null)

/** A time as ISO 8601, or null: seconds since 1970 as ChatGPT gives them, or text with any number of decimals. @param {unknown} time */
export function iso(time) {
  const ms = typeof time === 'number' ? time * 1000 : Date.parse(String(time).replace(/(\.\d{3})\d+/, '$1'))
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/**
 * Messages as turns: each of the user's starts one, and what the assistant says until the next is
 * its answer. One with neither words nor files is left out.
 * @param {{ time: string, user: boolean, text: string, files: Shared[] }[]} messages @returns {Turn[]}
 */
export function turnsOf(messages) {
  /** @type {Turn[]} */
  const turns = []
  for (const { time, user, text, files } of messages) {
    const last = turns.at(-1)
    if (!text && !files.length) continue
    if (user || !last) turns.push({ time, request: user ? text : '', answer: user ? '' : text, files })
    else last.answer = [last.answer, text].filter(Boolean).join('\n\n')
  }
  return turns
}

/** A conversation's name: a ULID of its start, the rest from where it came from, so that it is the same each time. @param {string} time @param {string} key */
async function nameOf(time, key) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))
  return ulid(Date.parse(time)).slice(0, 10) + [...hash.subarray(0, 16)].map((byte) => ALPHABET[byte % 32]).join('')
}

/**
 * Brings an export in. Null when it holds nothing Jean can bring in, 'html' when Gemini's activity
 * is there as web pages only.
 * @param {FS} fs @param {Entry[]} entries
 * @param {{ projectDir: string, by: string, pages?: (name: string, bytes: Uint8Array) => Promise<string[] | null> }} options
 * @returns {Promise<{ conversations: number, projects: number, files: number } | 'html' | null>}
 */
export async function importExport(fs, entries, { projectDir, by, pages = extractPages }) {
  /** What the JSON at its root lists: conversations, or Claude's projects. @type {any[]} */
  const items = (await Promise.all(entries.filter((entry) => /^(conversations(-\d+)?|projects)\.json$/.test(entry.path)).map(readJSON))).flatMap((list) => (Array.isArray(list) ? list : []))
  const chatgpt = items.filter((item) => item?.mapping)
  const claude = items.filter((item) => item?.chat_messages || item?.prompt_template !== undefined)
  /** @type {Found[]} */
  const found = []
  if (chatgpt.length) found.push(await (await import('./chatgpt.js')).chatgptOf(chatgpt, entries))
  if (claude.length) found.push((await import('./claude.js')).claudeOf(claude))
  if (!found.length) {
    const gemini = await (await import('./takeout.js')).geminiOf(entries)
    if (!gemini || gemini === 'html') return gemini
    found.push(gemini)
  }
  const result = { conversations: 0, projects: 0, files: 0 }
  /** A file, now a project's. @param {Shared} file @returns {Promise<ResourceLink>} */
  const keep = async ({ name, read, type }, dir = projectDir) => {
    const bytes = await read()
    result.files++
    return addFile(fs, { projectDir: dir, name, mimeType: type ?? TYPES[name.split('.').pop()?.toLowerCase() ?? ''], bytes, pages: (await pages(name, bytes).catch(() => null)) ?? [''], by })
  }
  for (const { key, title, turns } of found.flatMap((part) => part.chats)) {
    if (!turns.length) continue
    const id = await nameOf(turns[0].time, key)
    const path = join(projectDir, 'conversations', `${id}.jsonl`)
    if (await fs.exists(path)) continue
    /** @type {Envelope[]} */
    const records = [{ ...metaRecord(by, { title: title || firstWords(turns[0].request || turns[0].answer) }), at: turns[0].time }]
    for (const { time, request, answer, files } of turns) {
      records.push(...userRecords(request, await Promise.all(files.map((file) => keep(file))), by).map((record) => ({ ...record, at: time })))
      if (answer) records.push({ ...envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: answer } }, 0), at: time })
    }
    await fs.write(path, [{ format: 1, kind: 'conversation', id, createdAt: turns[0].time, by }, ...records].map((line) => `${JSON.stringify(line)}\n`).join(''))
    result.conversations++
  }
  const named = new Set((await listProjects(fs)).map((project) => String(project.data.name)))
  for (const { name, instructions, files } of found.flatMap((part) => part.rooms)) {
    const title = name || firstWords(instructions, 4)
    if (named.has(title)) continue
    named.add(title)
    const dir = await createProject(fs, { name: title, by })
    if (instructions) await fs.write(join(dir, 'instructions.md'), stringifyFrontMatter({ format: 1, kind: 'instructions' }, `${instructions}\n`))
    for (const file of files) await keep(file, dir)
    result.projects++
  }
  for (const file of found.flatMap((part) => part.files)) await keep(file)
  return result
}
