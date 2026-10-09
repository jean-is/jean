// Folders (D141, D149, D152): a project or a conversation opened on a folder of the user's computer, each
// keeping its own across visits, and Jean finding, reading and changing its files where they are.
// A new conversation starts on its project's folder and keeps it; the conversation's header names
// its folder, and its menu opens it on another, or on none. Four deferred tools come with the
// prompt's <folder> section, its name and top level: list, find_in_files, open and change. They work
// in the folder of the conversation that asked, found by its run's signal (D147). A change asks first
// with its diff, unless "Always allow" was given for that folder, is recorded as ACP diff content on
// its call, undone from the conversation, and refused on a file that moved since Jean read it.
//
// Chrome and Edge open a folder in place: its handle is kept in IndexedDB under the ULID of the
// project or conversation it belongs to, and the browser asks again once a visit, at the first
// message sent there or from a card when a call needs it. Elsewhere a folder is a read-only copy for
// the visit, and what Jean changes is saved as one zip. Nothing of Jean's is written into a folder.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register, unlock } from '../../ui/caps.js'
import { app, conversationOf, refreshProjects, notify, assistantName, readBody } from '../../ui/state.js'
import { folderFS } from '../../ui/opfs.js'
import { save } from '../../ui/save.js'
import { icons } from '../../ui/icons.js'
import { join } from '../../core/fs.js'
import { stringifyFrontMatter } from '../../core/settings.js'
import { noteRecord } from '../../core/events.js'
import { appendRecords } from '../../core/conversations.js'
import { t, useStrings } from '../../core/i18n.js'
import { walkFolder, listingText, findInFolder, openText, planChange, diffLines, lastRead, topLevel, readText, exactText, replacerOf } from './work.js'
import { copyFS, pickedFiles, droppedFiles } from './copy.js'
import { sitePage } from './site.js'
import { styleSheet } from '../../ui/sheet.js'

/** @import { Envelope, ToolCallInfo, FS } from '../../core/types.js' */
/** @typedef {import('./copy.js').CopyFS} CopyFS */
/** @typedef {import('../../core/settings.js').Project} Project */
/**
 * A folder, as a project or a conversation has it: its name always; its handle where the browser
 * opens folders in place; a read-only copy elsewhere, for the visit. `agents`: its AGENTS.md was
 * offered, and taken (followed in a conversation's own folder) or not. A name and nothing else is a
 * folder known by name only (another browser, a restore): the user chooses it again.
 * @typedef {{ name: string, handle?: FileSystemDirectoryHandle, copy?: CopyFS, agents?: boolean }} Folder
 */

await Promise.all([useStrings('folders'), unlock('files'), styleSheet(new URL('folders.css', import.meta.url))])

// PDFs are read by pdf.js, which comes with Files and loads with the first one.
const READS = { pdf: (/** @type {Uint8Array} */ bytes) => import('../files/pdf.js').then((module) => module.pdfPages(bytes)) }

// ─── Who has which folder ────────────────────────────────────────────────────

/** Folders by the ULID of the project or conversation they belong to; a name of '' is none, chosen. */
const owned = signal(/** @type {Map<string, Folder>} */ (new Map()))
/** The folder of the conversation about to start, chosen there: undefined follows its project's, null is none. */
const pending = signal(/** @type {Folder | null | undefined} */ (undefined))
/** A question above the box: work in a folder dropped, or follow its AGENTS.md. */
const asking = signal(/** @type {{ folder: Folder } | { folder: Folder, agents: string, owner: 'project' | 'conversation' } | null} */ (null))
/** Folders the browser lets Jean open this visit; bumped when it changes. */
const allowed = signal(/** @type {Set<FileSystemDirectoryHandle>} */ (new Set()))

/** The project's folder: kept here, or named in project.md. @param {Project} [project] @returns {Folder | null} */
function projectFolder(project = app.project.value) {
  const folder = owned.value.get(project.id)
  if (folder) return folder.name ? folder : null
  return project.data.folder ? { name: String(project.data.folder) } : null
}

/**
 * The folder of a conversation (D149): its own, or the one its brain was last told of, by name; for
 * the conversation about to start, the one chosen for it, or its project's.
 * @param {{ id: string, records: Envelope[] } | null} conversation @returns {Folder | null}
 */
export function folderOf(conversation) {
  if (!conversation) return pending.value === undefined ? projectFolder() : pending.value
  const folder = owned.value.get(conversation.id)
  if (folder) return folder.name ? folder : null
  const name = toldOf(conversation.records)
  return name ? { name } : null
}

/** The folder a conversation's brain was last told of: in its frozen prompt, or a note since. @param {Envelope[]} records */
function toldOf(records) {
  let told = ''
  for (const { meta, update } of records) {
    if (meta?.prompt) told = /<folder>\n([\s\S]*?)\n<\/folder>/.exec(meta.prompt.system)?.[1] ?? ''
    if (update?.sessionUpdate === '_system_note' && update.data.kind === 'section' && update.data.name === 'folder') told = update.data.version ? update.text : ''
  }
  return /The user's folder "(.+)" is open/.exec(told)?.[1] ?? ''
}

// ─── Kept across visits ──────────────────────────────────────────────────────

// The handles can't be kept in a file: IndexedDB keeps them, by owner, never in a backup (D149).
// "Always allow" is kept there too, for the folders it was given for. Reading a handle back can take
// the browser down (Chrome 153 does, for a handle of the private file system in a private window):
// a mark is written first and taken away after, so a page that finds it there, its last read never
// finished, forgets the handles and keeps folders for the visit only, for half a day, rather than
// going down at every start.
const ALWAYS = 'always'
const READING = 'reading'
const VISIT = 'visit'
const VISIT_MS = 12 * 3600_000
/** @type {Promise<IDBDatabase | null>} */
const database = new Promise((resolve) => {
  if (!globalThis.indexedDB) return resolve(null)
  const request = indexedDB.open('app-folders', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('folders')
  request.onerror = () => resolve(null)
  request.onsuccess = () => resolve(request.result)
})

/**
 * What the store answers, once what changed is written for good.
 * @template T @param {IDBTransactionMode} mode @param {(store: IDBObjectStore) => IDBRequest<T>} act @returns {Promise<T | undefined>}
 */
async function stored(mode, act) {
  const db = await database
  if (!db || (mode === 'readwrite' && visitOnly)) return undefined
  return new Promise((resolve) => {
    const transaction = db.transaction('folders', mode)
    const request = act(transaction.objectStore('folders'))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onerror = transaction.onabort = () => resolve(undefined)
  })
}

/** Handles "Always allow" was given for, read once. @type {FileSystemDirectoryHandle[]} */
let trusted = []
/** Whether folders last the visit only: the last read of the handles never finished. */
let visitOnly = false
{
  const [unfinished, since = 0] = await Promise.all([stored('readonly', (store) => store.get(READING)), stored('readonly', (store) => store.get(VISIT))])
  if (unfinished || Date.now() - since < VISIT_MS) {
    if (unfinished) {
      await stored('readwrite', (store) => store.clear())
      await stored('readwrite', (store) => store.put(Date.now(), VISIT))
    }
    visitOnly = true
  } else {
    await stored('readwrite', (store) => store.put(true, READING))
    const [keys = [], values = []] = await Promise.all([stored('readonly', (store) => store.getAllKeys()), stored('readonly', (store) => store.getAll())])
    await stored('readwrite', (store) => store.delete(READING))
    const kept = new Map(keys.map((key, i) => [String(key), values[i]]))
    trusted = kept.get(ALWAYS) ?? []
    for (const key of [ALWAYS, READING, VISIT]) kept.delete(key)
    owned.value = kept
  }
}

/**
 * A project or a conversation opened on a folder, or on none (null). A copy lasts the visit; a
 * handle is kept. @param {string} owner @param {Folder | null} folder
 */
async function keep(owner, folder) {
  const kept = folder ?? { name: '' }
  owned.value = new Map(owned.peek()).set(owner, kept)
  if (kept.copy) return
  const { name, handle, agents } = kept
  await stored('readwrite', (store) => store.put({ name, ...(handle && { handle }), ...(agents !== undefined && { agents }) }, owner))
}

/** Whether "Always allow" was given for this folder, wherever it was given (D149). @param {Folder} folder */
async function always(folder) {
  for (const handle of trusted) if (await same(handle, folder)) return true
  return false
}

/** @param {FileSystemDirectoryHandle | undefined} handle @param {Folder} folder */
const same = async (handle, folder) => Boolean(handle && folder.handle && (await handle.isSameEntry(folder.handle)))

// ─── Opening a folder ────────────────────────────────────────────────────────

// Asking for a folder (File System Access), which TypeScript's DOM doesn't know yet.
/** @typedef {{ queryPermission: (options: { mode: string }) => Promise<PermissionState>, requestPermission: (options: { mode: string }) => Promise<PermissionState> }} Permissions */
const permissions = (/** @type {FileSystemDirectoryHandle} */ handle) => /** @type {Permissions} */ (/** @type {unknown} */ (handle))

/** Whether the browser lets Jean read and write a folder now. @param {Folder} folder */
async function isOpen(folder) {
  if (!folder.handle) return Boolean(folder.copy)
  const granted = (await permissions(folder.handle).queryPermission({ mode: 'readwrite' })) === 'granted'
  if (granted && !allowed.peek().has(folder.handle)) allowed.value = new Set(allowed.peek()).add(folder.handle)
  return granted
}

/** @type {WeakMap<FileSystemDirectoryHandle, Promise<boolean>>} */
const requests = new WeakMap()
/**
 * Asks the browser to let Jean open a folder this visit, which needs the user's click or key just
 * before. Once a visit, or every visit when the user allows it so (Chrome 122). @param {Folder} folder
 */
function permit(folder) {
  const handle = folder.handle
  if (!handle) return Promise.resolve(Boolean(folder.copy))
  const asked = requests.get(handle) ?? permissions(handle).requestPermission({ mode: 'readwrite' }).then((state) => state === 'granted', () => false).then(async (granted) => {
    requests.delete(handle)
    return granted && isOpen(folder)
  })
  requests.set(handle, asked)
  return asked
}

// Sending is the first thing a visit does in a folder: the browser asks then, while the key or the
// click that sent is fresh (D141).
const sending = (/** @type {boolean} */ typed) => {
  const folder = folderOf(app.current.peek())
  if (folder?.handle && !allowed.peek().has(folder.handle) && (!typed || app.draft.peek().trim())) permit(folder)
}
document.addEventListener('keydown', (event) => {
  // Not when Enter picks from the box's menu of / and @ (D199), which says which it picks.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.target instanceof HTMLTextAreaElement && event.target.id === 'prompt' && !event.target.hasAttribute('aria-activedescendant')) sending(true)
}, true)
document.addEventListener('click', (event) => {
  if (!(event.target instanceof window.Element)) return
  if (event.target.closest('.send')) sending(true)
  else if (event.target.closest('.follow-up')) sending(false)
}, true)

/**
 * Each folder in use has its own FS (D149), closed once no conversation is answered and it has had
 * nothing to do for a minute, so nothing still using it loses it.
 * @type {{ handle: FileSystemDirectoryHandle, fs: Promise<FS & { close: () => void }>, used: number }[]}
 */
let running = []
const IDLE_MS = 60_000
/** Texts read, by path, size and date: read again only once a file changed. */
const cache = new Map()
effect(() => {
  if (!app.running.value.length) setTimeout(sweep, IDLE_MS)
})
function sweep() {
  if (app.running.peek().length) return
  const idle = running.filter((each) => Date.now() - each.used >= IDLE_MS)
  for (const { fs } of idle) fs.then((each) => each.close(), () => {})
  running = running.filter((each) => !idle.includes(each))
}

/** @param {Folder} folder @returns {Promise<FS>} */
async function fsOf(folder) {
  if (folder.copy) return folder.copy
  const handle = /** @type {FileSystemDirectoryHandle} */ (folder.handle)
  for (const each of running) {
    if (!(await each.handle.isSameEntry(handle))) continue
    each.used = Date.now()
    return each.fs
  }
  const fs = folderFS(handle)
  running.push({ handle, fs, used: Date.now() })
  return fs
}

/**
 * The folder a call works in: its conversation's (D149), by its run's signal (D147), open. What
 * stands in the way is said, for the brain to tell the user.
 * @param {AbortSignal} [signal] @returns {Promise<{ folder: Folder, fs: FS, conversation: ReturnType<typeof conversationOf> }>}
 */
async function working(signal) {
  const conversation = conversationOf(signal)
  const folder = folderOf(conversation)
  if (!folder) throw new Error('No folder is open in this conversation. The user opens one with + › A folder… in the box.')
  if (!folder.handle && !folder.copy) throw new Error(`The folder "${folder.name}" isn't open on this device. Ask the user to choose it again, from its name at the top.`)
  if (!(await permit(folder))) throw new Error(`The user didn't let you open "${folder.name}". They can allow it from its name at the top.`)
  return { folder, fs: await fsOf(folder), conversation }
}

/** Before a call: a card to click when the browser must ask first, the click it needs (D141). @param {any} _ @param {import('../../core/loop.js').ToolContext} ctx */
export async function opening(_, ctx) {
  const folder = folderOf(conversationOf(ctx.signal))
  if (folder?.handle && !(await isOpen(folder))) return { ask: true, meta: { folder: folder.name } }
}

// ─── Choosing one ────────────────────────────────────────────────────────────

/**
 * A folder the user picks: opened in place where the browser can, a read-only copy elsewhere. Null
 * when the picker is closed.
 * @returns {Promise<Folder | null>}
 */
async function pick() {
  if ('showDirectoryPicker' in window) {
    try {
      const handle = await /** @type {any} */ (window).showDirectoryPicker({ id: 'folder', mode: 'readwrite' })
      allowed.value = new Set(allowed.peek()).add(handle)
      return { name: handle.name, handle }
    } catch (error) {
      if (/** @type {any} */ (error)?.name !== 'AbortError') throw error
      return null
    }
  }
  const input = Object.assign(document.createElement('input'), { type: 'file', webkitdirectory: true, hidden: true })
  document.body.append(input)
  try {
    return await new Promise((resolve) => {
      input.addEventListener('change', () => {
        const { name, files } = pickedFiles(input.files ?? [])
        resolve(name ? { name, copy: copyFS(files) } : null)
      })
      input.addEventListener('cancel', () => resolve(null))
      input.click()
    })
  } finally {
    input.remove()
  }
}

/**
 * The user chooses a folder for the conversation on screen, or the one about to start; or, with a
 * project, for every new conversation in it. Then its AGENTS.md, if any, is offered.
 * @param {Project} [project]
 */
export async function choose(project) {
  try {
    const folder = await pick()
    if (folder) await use(folder, project)
  } catch (error) {
    console.warn('Folder', error)
    notify(t('folders.failed'))
  }
}

/** @param {Folder | null} folder @param {Project} [project] */
async function use(folder, project) {
  if (project) await setProjectFolder(project, folder)
  else {
    const current = app.current.peek()
    if (current) await keep(current.id, folder)
    else pending.value = folder
  }
  if (folder) await offerAgents(folder, project ? 'project' : 'conversation')
}

/** A project's folder: kept by its ULID, named in project.md (D149). @param {Project} project @param {Folder | null} folder */
async function setProjectFolder(project, folder) {
  await keep(project.id, folder)
  const { folder: _, ...data } = project.data
  project.data = { ...data, ...(folder && { folder: folder.name }) }
  await app.fs.write(`${project.dir}/project.md`, stringifyFrontMatter(project.data, project.body))
  await refreshProjects()
}

/** A folder dropped on Jean: where the browser lets it, opened in place; otherwise a copy. @param {{ entry: FileSystemDirectoryEntry, handle?: Promise<FileSystemHandle | null> }} drop */
export async function dropped({ entry, handle }) {
  try {
    const found = await handle?.catch(() => null)
    const folder = found?.kind === 'directory' ? { name: found.name, handle: /** @type {FileSystemDirectoryHandle} */ (found) } : { name: entry.name, copy: copyFS(await droppedFiles(entry)) }
    asking.value = { folder }
  } catch (error) {
    console.warn('Folder', error)
    notify(t('folders.failed'))
  }
}

/** A folder's AGENTS.md, offered and never read in silently (D141). @param {Folder} folder @param {'project' | 'conversation'} owner */
async function offerAgents(folder, owner) {
  if (folder.agents !== undefined || !(await isOpen(folder))) return
  const text = (await readText(await fsOf(folder), 'AGENTS.md').catch(() => null))?.text?.trim()
  if (text) asking.value = { folder, agents: text, owner }
}

/** The user answered about an AGENTS.md: the project's instructions, or this conversation's folder section. @param {boolean} yes */
async function followAgents(yes) {
  const question = asking.peek()
  if (!question || !('agents' in question)) return
  asking.value = null
  const { folder, agents, owner } = question
  folder.agents = yes
  const project = app.project.peek()
  if (owner === 'project') {
    await keep(project.id, folder)
    if (!yes) return
    const dir = project.data.default === true ? '' : project.dir
    const before = await readBody(join(dir, 'instructions.md'))
    await app.fs.write(join(dir, 'instructions.md'), stringifyFrontMatter({ format: 1, kind: 'instructions' }, `${[before, agents].filter(Boolean).join('\n\n')}\n`))
  } else {
    const current = app.current.peek()
    if (current && folderOf(current) === folder) await keep(current.id, folder)
  }
}

/**
 * A new conversation was made with its first message: it keeps the folder it started on, chosen
 * for it or its project's (D149), or the one of the conversation it duplicates (D230). A project's
 * AGENTS.md is the project's to offer, not each conversation's.
 * @param {{ id: string }} conversation @param {{ id: string, records: Envelope[] }} [from]
 */
async function started({ id }, from) {
  const chosen = from ? folderOf(from) : pending.peek()
  pending.value = undefined
  const folder = chosen === undefined ? projectFolder() : chosen
  if (folder?.handle || folder?.copy) await keep(id, chosen === undefined ? { ...folder, agents: false } : folder)
}

// A new conversation starts on its project's folder, unless one is chosen for it there.
let place = ''
effect(() => {
  const here = `${app.project.value.dir}/${app.current.value?.id ?? ''}`
  if (here !== place) pending.value = undefined
  place = here
})

// ─── The prompt ──────────────────────────────────────────────────────────────

/** The <folder> section: its name, its top level when it can be read, the tools, and its AGENTS.md if the user took it here. @param {Folder} folder */
async function section(folder) {
  const name = JSON.stringify(folder.name).slice(1, -1)
  if (!folder.handle && !folder.copy) return `The user's folder "${name}" is open in this conversation, but not on this device: ask the user to choose it again, from its name at the top, before working on it.`
  const handle = folder.handle
  if (handle) await requests.get(handle)
  const readable = await isOpen(folder)
  const fs = readable ? await fsOf(folder) : null
  // A project's AGENTS.md went into its instructions, if the user took it there.
  const own = folder !== owned.value.get(app.project.peek().id)
  const agents = fs && folder.agents && own ? (await readText(fs, 'AGENTS.md').catch(() => null))?.text?.trim() : ''
  return [
    `The user's folder "${name}" is open in this conversation, on their computer${folder.copy ? ', as a copy: what you change is kept for the user to save' : ''}.`,
    fs ? `Its top level:\n${await topLevel(fs).catch(() => '(unreadable)')}` : 'The user lets you open it once you ask.',
    'Work on its files where they are, by their path, with list({ path?, depth? }), find_in_files({ text, path? }), open({ path, lines? }) and change({ path, old, new }). The user sees each change first.',
    ...(agents ? [`Its AGENTS.md, which the user asked you to follow here:\n${agents.slice(0, 6000)}`] : []),
  ].join('\n')
}

// ─── Tools ───────────────────────────────────────────────────────────────────

/** @param {string} path */
const clean = (path) => String(path ?? '').trim().replace(/^\.?\/+|\/+$/g, '')

/** The size and date a file is read at, kept on the call: what a change checks it against. @param {import('../../core/loop.js').ToolContext} ctx @param {Folder} folder @param {Record<string, [number, number]>} read */
function stamp(ctx, folder, read) {
  ctx.meta.folder = folder.name
  ctx.meta.read = { ...ctx.meta.read, ...read }
}

/** @type {import('../../core/loop.js').Tool} */
const listTool = {
  spec: {
    name: 'list',
    description: "List the files and folders of the conversation's folder by path, leaving out .git, node_modules and what .gitignore names.",
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'A folder inside it; omit for all of it' }, depth: { type: 'number', description: 'How many levels down; omit for all' } } },
  },
  kind: 'read',
  deferred: true,
  title: (args) => `List ${args?.path || 'the folder'}`,
  check: opening,
  run: async (args, ctx) => {
    const { fs } = await working(ctx.signal)
    return listingText(await walkFolder(fs, clean(args?.path), Number(args?.depth) || Infinity))
  },
}

/** @type {import('../../core/loop.js').Tool} */
const findTool = {
  spec: {
    name: 'find_in_files',
    description: "Find text in the files of the conversation's folder, Word, Excel, PowerPoint and PDF included, case and accents aside, in any language. Answers path, line and passage.",
    parameters: { type: 'object', properties: { text: { type: 'string', description: 'What to look for' }, path: { type: 'string', description: 'A folder inside it to look in' } }, required: ['text'] },
  },
  kind: 'search',
  deferred: true,
  title: (args) => `Find "${args?.text ?? ''}"`,
  check: opening,
  run: async (args, ctx) => {
    const { folder, fs } = await working(ctx.signal)
    const found = await findInFolder(fs, String(args?.text ?? ''), { path: clean(args?.path), cache, ...READS })
    stamp(ctx, folder, found.read)
    return found.text
  },
}

/** @type {import('../../core/loop.js').Tool} */
const openTool = {
  spec: {
    name: 'open',
    description: "Read a file of the conversation's folder by its path, Word, Excel, PowerPoint and PDF included: all of it, or some lines.",
    parameters: { type: 'object', properties: { path: { type: 'string' }, lines: { type: 'string', description: 'e.g. "120-180"; omit to start at the top' } }, required: ['path'] },
  },
  kind: 'read',
  deferred: true,
  title: (args) => `Open ${args?.path ?? ''}`,
  locations: (args) => [{ path: clean(args?.path) }],
  check: opening,
  run: async (args, ctx) => {
    const { folder, fs } = await working(ctx.signal)
    const path = clean(args?.path)
    const { text, stamp: read } = await openText(fs, path, args?.lines, { cache, ...READS })
    stamp(ctx, folder, { [path]: [read.size, read.lastModified] })
    return text
  },
}

/** Where paper is letter-sized: the user's region, as the browser gives it (as Things Jean made does). */
function paper() {
  try {
    return /^(US|CA|MX|PH|CL|CO|VE|PR)$/.test(new Intl.Locale(navigator.language).maximize().region ?? '') ? 'letter' : 'a4'
  } catch {
    return 'a4'
  }
}

/**
 * A change worked out against the file as it is, which must be as Jean last read it in this
 * conversation (D141): a file nobody has read is opened first, one that moved since is read again.
 * @param {FS} fs @param {Folder} folder @param {any} args @param {ToolCallInfo[]} calls
 */
async function plan(fs, folder, args, calls) {
  const path = clean(args?.path)
  const now = await fs.stat?.(path)
  const read = lastRead(calls, folder.name, path)
  if (now && !read) throw new Error(`Open ${path} before changing it.`)
  if (now && read && (now.size !== read[0] || now.lastModified !== read[1])) throw new Error(`${path} changed since you read it: someone edited it, or a sync brought a new version. Open it again, then change it.`)
  return planChange(fs, { path, old: String(args?.old ?? ''), new: String(args?.new ?? '') }, { ...READS, paper: paper() })
}

/** Every call made in a conversation so far, this turn's included, in order. @param {ReturnType<typeof conversationOf>} conversation */
const callsOf = (conversation) => [
  ...(conversation?.records ?? []).flatMap(({ update }) => (update?.sessionUpdate === 'tool_call' ? [/** @type {ToolCallInfo} */ (update)] : [])),
  ...(conversation && 'turn' in conversation ? conversation.turn?.steps.flatMap((step) => step.tools) ?? [] : []),
]

/** What a Word document or a workbook was before Jean changed it, this visit, by `_meta.undo`: undone exactly. @type {Map<string, Uint8Array>} */
const before = new Map()
/** Calls whose change the user has seen, or needn't: a copy's, or one in a folder always allowed. */
const shown = new WeakSet()

/** @type {import('../../core/loop.js').Tool} */
const changeTool = {
  spec: {
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
  kind: 'edit',
  deferred: true,
  title: (args) => `Change ${args?.path ?? ''}`,
  locations: (args) => [{ path: clean(args?.path) }],
  // In the user's folder, a change is asked first, with its diff, unless the folder is always allowed (D141).
  check: async (args, ctx) => {
    const conversation = conversationOf(ctx.signal)
    const folder = folderOf(conversation)
    if (!folder?.handle) return void shown.add(ctx)
    const meta = { folder: folder.name }
    if (!(await isOpen(folder))) return { ask: true, meta }
    const change = await plan(await fsOf(folder), folder, args, callsOf(conversation))
    const ask = !(await always(folder))
    shown.add(ctx)
    return { ask, meta, content: [{ type: 'diff', path: change.path, oldText: change.before, newText: change.after }] }
  },
  run: async (args, ctx) => {
    const { folder, fs, conversation } = await working(ctx.signal)
    const change = await plan(fs, folder, args, callsOf(conversation))
    // The user let Jean open the folder, but hasn't seen this change yet: the brain asks again, and the card shows it.
    if (!shown.has(ctx)) throw new Error(`"${folder.name}" is open now. Make the change again: the user sees it first.`)
    const was = /\.(docx|xlsx)$/i.test(change.path) && change.before !== null ? await fs.readBytes(change.path) : null
    await fs.writeBytes(change.path, change.bytes)
    if (was) before.set((ctx.meta.undo = crypto.randomUUID()), was)
    const now = await fs.stat?.(change.path)
    if (now) stamp(ctx, folder, { [change.path]: [now.size, now.lastModified] })
    ctx.content.push({ type: 'diff', path: change.path, oldText: change.before, newText: change.after })
    // A page made or changed in the conversation on screen shows in the browser, or has it offered (D156).
    if (conversation?.id === app.current.peek()?.id) document.dispatchEvent(new CustomEvent('app-folder-changed', { detail: { folder: folder.name, path: change.path } }))
    if (ctx.answer === 'allow_always' && folder.handle) {
      trusted = [...trusted, folder.handle]
      await stored('readwrite', (store) => store.put(trusted, ALWAYS))
    }
    const verb = change.before === null ? 'Made' : 'Changed'
    return `${verb} ${change.path}.${folder.copy ? ' This browser works on a copy: the user saves the changed files from the folder\'s name at the top.' : ''}`
  },
}

/**
 * The conversation's folder, open, as the Computer's /workspace (D162), with whether a change there
 * needs no asking; null when it has none. @param {AbortSignal | undefined} signal
 */
export async function computerFolder(signal) {
  if (!folderOf(conversationOf(signal))) return null
  const { folder, fs } = await working(signal)
  return { folder, fs, always: Boolean(folder.copy) || await always(folder) }
}

/**
 * The files and folders of the folder of the conversation on screen, or of the one about to start,
 * by path, for @ in the box (D199); null without one, or while the browser doesn't let Jean open it.
 */
export async function entries() {
  const folder = folderOf(app.current.peek())
  if (!folder || !(await isOpen(folder))) return null
  return { name: folder.name, ...(await walkFolder(await fsOf(folder))) }
}

/** "Always allow" in a folder, answered on the Computer's card (D162). @param {Folder} folder */
export async function trust(folder) {
  if (!folder.handle || await always(folder)) return
  trusted = [...trusted, folder.handle]
  await stored('readwrite', (store) => store.put(trusted, ALWAYS))
}

/**
 * A shared file's text for a script's `file()`, when the name is a path in the conversation's folder
 * (D141); null when it isn't one. @param {string} path @param {import('../../core/loop.js').ToolContext} ctx
 */
export async function scriptFile(path, ctx) {
  const folder = folderOf(conversationOf(ctx.signal))
  if (!folder || (!folder.handle && !folder.copy)) return null
  const { fs } = await working(ctx.signal)
  const { text, stamp: read } = await readText(fs, clean(path), { cache, ...READS })
  if (text === null || !read) return null
  stamp(ctx, folder, { [clean(path)]: [read.size, read.lastModified] })
  return text
}

register({
  id: 'folders',
  tools: [listTool, findTool, openTool, changeTool],
  sections: async () => {
    const folder = folderOf(app.current.peek())
    return folder ? { folder: await section(folder) } : {}
  },
  started,
})

// ─── Its pages, in the browser ───────────────────────────────────────────────

/**
 * What an address of the conversation's folder, "<folder>/<path>", shows in the browser (D156), when
 * it is this conversation's folder and open: a click on the way to it may let the browser ask.
 * @param {string} address @param {boolean} [ask] @returns {Promise<import('./site.js').Shown | { note: 'elsewhere' | 'shut' }>}
 */
export async function folderPage(address, ask = false) {
  const folder = folderOf(app.current.peek())
  const [name, ...path] = address.split('/')
  if (!folder || folder.name !== name || (!folder.handle && !folder.copy)) return { note: 'elsewhere' }
  if (!(await isOpen(folder)) && !(ask && (await permit(folder)))) return { note: 'shut' }
  return sitePage(await fsOf(folder), path.join('/'), name)
}

/** Whether a file a page was made of changed since: by Jean, the user's own editor or a sync. @param {string} name @param {Record<string, string>} files */
export async function pageMoved(name, files) {
  const folder = folderOf(app.current.peek())
  if (folder?.name !== name || !(await isOpen(folder))) return false
  const fs = await fsOf(folder)
  for (const [path, stamp] of Object.entries(files)) {
    const now = await fs.stat?.(path)
    if (`${now?.size}:${now?.lastModified}` !== stamp) return true
  }
  return false
}

// ─── Undoing a change ────────────────────────────────────────────────────────

/**
 * A change undone from the conversation: the file as it was, if it is still as Jean left it, and a
 * note so the brain knows (D141). A call of the Computer's may have changed several (D162).
 * @param {ToolCallInfo} call @param {import('../../core/types.js').ToolCallContent} [diff]
 */
async function undo(call, diff = call.content?.find((part) => part.type === 'diff')) {
  const current = app.current.peek()
  if (!diff || diff.type !== 'diff' || !current) return
  try {
    const { folder, fs } = await working(undefined)
    if (folder.name !== call._meta?.folder) return notify(t('folders.undo.elsewhere'))
    const bytes = await fs.readBytes(diff.path)
    const word = /\.(docx|xlsx)$/i.test(diff.path)
    const now = bytes && (word ? (await readText(fs, diff.path, READS)).text : exactText(bytes))
    if (now !== diff.newText) return notify(t('folders.undo.moved', { path: diff.path }))
    if (diff.oldText === null) await fs.remove(diff.path)
    else if (!word) await fs.write(diff.path, diff.oldText)
    else {
      const { replaceOnce } = await import('../made/formats.js')
      await fs.writeBytes(diff.path, before.get(call._meta?.undo) ?? await replacerOf(diff.path)(/** @type {Uint8Array} */ (bytes), String(call.rawInput?.new ?? ''), String(call.rawInput?.old ?? ''), diff.path, replaceOnce))
    }
    const note = noteRecord(`The user undid your change to ${diff.path}: it is as it was before.`, { kind: 'undone', call: call.toolCallId, path: diff.path })
    await appendRecords(app.fs, current.path, [note])
    const shown = app.current.peek()
    if (shown?.path === current.path) app.current.value = { ...shown, records: [...shown.records, note] }
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error))
  }
}

// ─── Elements ────────────────────────────────────────────────────────────────

/** The header names the conversation's folder, and opens on a menu to change it (D149). */
class FolderName extends Element {
  render() {
    const folder = folderOf(app.current.value)
    if (!folder) return nothing
    const project = app.project.value
    const home = project.data.default === true
    const missing = !folder.handle && !folder.copy
    const shut = folder.handle && !allowed.value.has(folder.handle)
    const changed = folder.copy?.changed() ?? []
    const onProject = projectFolder()?.name === folder.name
    const item = (/** @type {unknown} */ icon, /** @type {string} */ label, /** @type {() => unknown} */ run) => html`<button type="button" popovertarget="folder-menu" popovertargetaction="hide" @click=${run}>${icon}<span>${label}</span></button>`
    return html`<button class="folder-name ${missing || shut ? 'is-shut' : ''}" popovertarget="folder-menu" title=${t('folders.in', { folder: folder.name })}>
        ${icons.folder}<span dir="auto">${folder.name}</span></button>
      <div id="folder-menu" class="menu folder-menu" popover>
        ${folder.copy ? html`<p class="folder-note">${t('folders.copy', { name: assistantName() })}</p>` : nothing}
        ${missing ? item(icons.folder, t('folders.again', { folder: folder.name }), () => choose(!app.current.peek() && pending.peek() === undefined ? project : undefined)) : nothing}
        ${shut ? item(icons.key, t('folders.allow'), () => permit(folder)) : nothing}
        ${changed.length ? item(icons.download, t('folders.save'), async () => save(new Blob([/** @type {BlobPart} */ (await folder.copy?.zip())], { type: 'application/zip' }), `${folder.name}.zip`)) : nothing}
        ${item(icons.folder, t('folders.another'), () => choose())}
        ${!onProject ? item(icons.spark, home ? t('folders.keep') : t('folders.keepIn', { project: String(project.data.name) }), () => setProjectFolder(project, folder)) : nothing}
        ${item(icons.close, t('folders.none'), () => use(null))}
      </div>`
  }

  updated() {
    const folder = folderOf(app.current.peek())
    if (folder?.handle) isOpen(folder)
  }
}

/** Above the box: work in a folder dropped, here or in every new conversation; or follow its AGENTS.md. */
class FolderQuestion extends Element {
  #shown = /** @type {unknown} */ (null)

  updated() {
    // A new question comes into view, above the box.
    if (asking.peek() && asking.peek() !== this.#shown) this.firstElementChild?.scrollIntoView({ block: 'nearest' })
    this.#shown = asking.peek()
  }

  render() {
    const question = asking.value
    if (!question) return nothing
    const { folder } = question
    const project = app.project.value
    const home = project.data.default === true
    if ('agents' in question) {
      return html`<aside class="offer folder-ask" role="group" aria-label=${t('folders.agents.title', { folder: folder.name })}>
        <p><strong>${t('folders.agents.title', { folder: folder.name })}</strong></p>
        <pre class="folder-agents" tabindex="0" dir="auto">${question.agents.slice(0, 4000)}</pre>
        <p>${question.owner === 'conversation' ? t('folders.agents.here') : home ? t('folders.agents.home') : t('folders.agents.project', { project: String(project.data.name) })}</p>
        <div class="row">
          <button class="button primary" @click=${() => followAgents(true)}>${t('folders.agents.yes')}</button>
          <button class="button subtle" @click=${() => followAgents(false)}>${t('offer.no')}</button>
        </div>
      </aside>`
    }
    // The click that answers lets the browser ask about the folder at once.
    const answer = (/** @type {Project | undefined} */ owner) => {
      permit(folder)
      asking.value = null
      use(folder, owner)
    }
    return html`<aside class="offer folder-ask" role="group" aria-label=${t('folders.drop.title')}>
      <p><strong>${t('folders.drop.title')}</strong></p>
      <p>${t('folders.drop.text', { name: assistantName(), folder: folder.name })}</p>
      <div class="row">
        <button class="button primary" @click=${() => answer(undefined)}>${t('folders.here')}</button>
        <button class="button" @click=${() => answer(project)}>${home ? t('folders.home') : t('folders.project', { project: String(project.data.name) })}</button>
        <button class="button subtle" @click=${() => { asking.value = null }}>${t('offer.no')}</button>
      </div>
    </aside>`
  }
}

/** A diff, line by line: what went, what came, what stayed around it. @param {{ path: string, oldText: string | null, newText: string }} diff */
function diffView(diff) {
  const { line, rows } = diffLines(diff.oldText, diff.newText)
  return html`<figure class="diff">
    <figcaption><span dir="auto">${diff.path}</span>${diff.oldText === null ? nothing : html`<span class="muted">${t('folders.line', { line })}</span>`}</figcaption>
    <pre tabindex="0">${rows.map((row) => html`<span class=${row.kind === '-' ? 'is-gone' : row.kind === '+' ? 'is-new' : ''} dir="auto"><span aria-hidden="true">${row.kind}</span>${row.text}\n</span>`)}</pre>
  </figure>`
}

/** An approval in the user's folder: the change and its diff, or opening the folder at all (D141). */
class FolderApproval extends Element {
  #decision = signal(/** @type {any} */ (null))
  #helper = signal(/** @type {string | undefined} */ (undefined))
  /** @param {Extract<import('../../ui/state.js').Decision, { toolCall: any }>} value */
  set decision(value) { this.#decision.value = value }
  /** @param {string | undefined} value the helper asking, if one is */
  set helper(value) { this.#helper.value = value }

  render() {
    const decision = this.#decision.value
    if (!decision) return nothing
    const { toolCall, resolve } = decision
    // A command on this computer, in the folder (D198): its own card.
    if (toolCall._meta?.machine) return html`<app-machine-approval .decision=${decision} .helper=${this.#helper.value}></app-machine-approval>`
    const folder = String(toolCall._meta?.folder ?? '')
    const diffs = (toolCall.content ?? []).filter((/** @type {any} */ part) => part.type === 'diff')
    // The Computer's changes (D162): several files, some with no text to show.
    const files = toolCall.name === 'save_workspace' ? [...(toolCall.rawInput?.files ?? []), ...(toolCall.rawInput?.removed ?? [])].map(String) : []
    const others = files.filter((path) => !diffs.some((/** @type {any} */ diff) => diff.path === path))
    const helper = this.#helper.value
    const asked = files.length > 1 ? t('folders.changes.question', { count: files.length }) : diffs.length || files.length ? t('folders.change.question', { path: diffs[0]?.path ?? files[0] })
      : t('folders.open.question', { name: assistantName(), folder })
    const changing = diffs.length || files.length
    return html`<div class="approval" role="group" aria-label=${asked}>
      ${helper ? html`<p class="approval-from">${icons.helpers}<span dir="auto">${helper}</span></p>` : nothing}
      <p>${asked}</p>
      ${diffs.map(diffView)}
      ${others.length ? html`<ul class="folder-others">${others.map((path) => html`<li>${icons.file}<span dir="auto">${path}</span></li>`)}</ul>` : nothing}
      <div class="approval-actions">
        <button class="button primary" @click=${() => resolve('allow_once')}>${changing ? t('folders.change.yes') : t('folders.open.yes')}</button>
        ${toolCall.name === 'change' || toolCall.name === 'save_workspace' ? html`<button class="button" @click=${() => resolve('allow_always')}>${t('folders.always', { folder })}</button>` : nothing}
        <button class="button subtle" @click=${() => resolve('reject_once')}>${t('offer.no')}</button>
      </div>
    </div>`
  }
}

/** A change made in the folder, under the answer: what it was, and Undo (D141). */
class FolderChange extends Element {
  #call = signal(/** @type {ToolCallInfo | null} */ (null))
  /** @param {ToolCallInfo} value */
  set call(value) { this.#call.value = value }

  render() {
    const call = this.#call.value
    if (!call) return nothing
    return (call.content ?? []).map((diff) => {
      if (diff.type !== 'diff') return nothing
      const undone = (app.current.value?.records ?? []).some(({ update }) => update?.sessionUpdate === '_system_note' && update.data.kind === 'undone' && update.data.call === call.toolCallId && update.data.path === diff.path)
      const { rows } = diffLines(diff.oldText, diff.newText)
      const count = (/** @type {string} */ kind) => rows.filter((row) => row.kind === kind).length
      return html`<details class="folder-change ${undone ? 'is-undone' : ''}">
        <summary>${icons.file}<span class="folder-change-path" dir="auto">${diff.path}</span>
          <span class="folder-change-count" dir="ltr"><span class="is-new">+${count('+')}</span> <span class="is-gone">−${count('-')}</span></span>
          ${undone ? html`<span class="muted">${t('folders.undone')}</span>` : html`<button class="button" @click=${(/** @type {Event} */ event) => { event.preventDefault(); undo(call, diff) }}>${t('folders.undo')}</button>`}
          ${icons.chevron}</summary>
        ${diffView(diff)}
      </details>`
    })
  }
}

/** A project's folder, in its dialog: where its new conversations start (D149). */
class FolderField extends Element {
  #project = signal(/** @type {Project | null} */ (null))
  /** @param {Project} value */
  set project(value) { this.#project.value = value }

  render() {
    void owned.value
    const project = this.#project.value
    if (!project) return nothing
    const folder = projectFolder(project)
    // The dialog's own project is changed, so saving it keeps the folder's name.
    const set = async (/** @type {Folder | null} */ chosen) => {
      if (chosen) await use(chosen, project)
      else await setProjectFolder(project, null)
    }
    return html`<div class="folder-field">
      <span class="folder-field-label">${t('folders.field')}</span>
      <p class="muted">${folder ? html`${icons.folder}<span dir="auto">${folder.name}</span>` : t('folders.field.none')}</p>
      <div class="row">
        <button type="button" class="button" @click=${async () => set(await pick().catch(() => null))}>${t('folders.choose')}</button>
        ${folder ? html`<button type="button" class="button subtle" @click=${() => set(null)}>${t('action.remove')}</button>` : nothing}
      </div>
    </div>`
  }
}

define('app-folder', FolderName)
define('app-folder-ask', FolderQuestion)
define('app-folder-approval', FolderApproval)
define('app-folder-change', FolderChange)
define('app-folder-field', FolderField)
