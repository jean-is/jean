// Files: the user drops, pastes or picks files, or captures their screen; Jean extracts their
// text, keeps the original in the project's library, and the next message links to them.
// Pictures have no text, nor do scans: brains that can see are shown them. Adds `read`, for
// pages that didn't fit in the message, and `search_files`; both reach every file of the project (D24).
import { effect } from '@preact/signals-core'
import { register, loaded, unlock, isDenied } from '../../ui/caps.js'
import { app, effective, currentFiles, conversationOf, warm, notify } from '../../ui/state.js'
import { rememberText } from '../../ui/send.js'
import { library } from '../../ui/complete.js'
import { searchTool } from './search.js'
import { addFile, readTool, fileText, splitPages } from '../../core/files.js'
import { isPicture, latestOf } from '../../core/events.js'
import { readZip } from '../../core/zip.js'
import { extractPages } from './extract.js'
import { fitPicture } from './pictures.js'
import { t } from '../../core/i18n.js'

const MAX_BYTES = 100 * 1024 * 1024

/** The conversation's files as they are now: a workbook the user changed in the preview, as its copy (D229). @param {AbortSignal} [signal] */
const filesNow = (signal) => {
  const records = conversationOf(signal)?.records ?? []
  return currentFiles(signal).map((link) => ({ ...link, uri: latestOf(records, link.uri) }))
}

/** The project's library, as @ lists it, kept up to date for read and search_files (D24). @type {import('../../core/types.js').ResourceLink[]} */
let shelf = []
const restock = () => library(app.projectDir).then((found) => { shelf = found.map(({ link }) => link) }).catch(() => {})
effect(() => { if (app.project.value.dir) restock() })

/** Every file the brain may read: the project's, then the conversation's, which win on a name. @param {AbortSignal} [signal] */
const reachable = (signal) => {
  const here = filesNow(signal)
  return [...shelf.filter((link) => !here.some((other) => other.uri === link.uri || other.name === link.name)), ...here]
}

/** @param {any} args @param {AbortSignal} [signal] the run's, for its conversation's files */
const find = (args, signal) => {
  const wanted = String(args?.file ?? '').trim().toLowerCase()
  return filesNow(signal).findLast((link) => link.name.toLowerCase() === wanted || link.uri.toLowerCase() === wanted)
}

/** A shared file's whole text, or a file's in the conversation's folder (D141), for scripts (codemode): never declared to the brain. @type {import('../../core/loop.js').Tool} */
const fileTool = {
  spec: { name: 'file', description: 'The whole text of a shared file, or of a file in the folder by its path.', parameters: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] } },
  kind: 'read',
  hidden: true,
  title: (args) => `Read ${args?.file ?? ''}`,
  locations: (args) => {
    const link = find(args)
    return link ? [{ path: link.uri }] : []
  },
  run: async (args, ctx) => {
    const link = find(args, ctx.signal)
    const inFolder = !link && loaded.value.has('folders') ? await (await import('../folders/folders.js')).scriptFile(String(args?.file ?? ''), ctx) : null
    if (inFolder !== null) return inFolder
    if (!link) throw new Error(`No file named "${args?.file}". Files: ${currentFiles(ctx.signal).map((f) => f.name).join(', ') || 'none'}.`)
    const text = await fileText(app.fs, app.projectDir, link.uri)
    if (text === null) throw new Error(`"${link.name}" is no longer available.`)
    return splitPages(text).join('\n')
  },
}

/** search_files by meaning too, once meaning search is on (D302). @type {Parameters<typeof searchTool>[0]['meaning']} */
const meaning = async (query, links) => (loaded.value.has('meaning') ? (await import('../meaning/meaning.js')).rank(query, links) : null)
/** When words find nothing: meaning search might, where it runs (WebGPU), if the user hasn't turned it down. */
const unfound = () => (!('gpu' in navigator) || loaded.value.has('meaning') || isDenied('meaning') || effective.value.settings.offers.meaning ? '' : ' The words may differ: offer "meaning" to search by meaning.')

register({
  id: 'files',
  tools: [readTool({ fs: app.fs, projectDir: () => app.projectDir, files: reachable }), searchTool({ fs: app.fs, projectDir: () => app.projectDir, files: reachable, meaning, unfound }), fileTool],
  lines: [{ name: 'read', line: 'read pages of a file' }, { name: 'search_files', line: 'find what the project’s files say' }],
  rules: ['Shared files are in the message, sometimes only some pages: read the others, search_files any file of the project. Cite a passage as [n: "its exact words"].'],
})

let persisted = false

/**
 * Reads files into attachments for the next message. Each shows as "reading" until its
 * text is extracted and the file is stored.
 * @param {Iterable<File>} list
 */
export async function addFiles(list) {
  let files = [...list]
  // An export of Gemini's, ChatGPT's or Claude's is brought in, not shared (D340, D341).
  /** @type {File[]} */
  const exported = []
  for (const file of files) if (await isExport(file)) exported.push(file)
  if (exported.length && (await unlock('backup'))) {
    ;(await import('../backup/backup.js')).bringIn(exported)
    files = files.filter((file) => !exported.includes(file))
  }
  if (!files.length) return
  // Files are user data: ask the browser not to evict them (silent in Chrome and Edge).
  if (!persisted) {
    persisted = true
    navigator.storage?.persist?.().catch(() => {})
  }
  await Promise.all(files.map(readOne))
  restock()
  warm()
}

/**
 * Whether a file is an export to bring in rather than share: Google Takeout's, as Google names
 * them, or a zip holding conversations.json or projects.json at its root, as ChatGPT's and Claude's do.
 * @param {File} file
 */
async function isExport(file) {
  try {
    return /^takeout-.*\.(zip|tgz)$/i.test(file.name) || ((await file.slice(0, 2).text()) === 'PK' && readZip(new Uint8Array(await file.arrayBuffer())).some((entry) => /^(conversations(-\d+)?|projects)\.json$/.test(entry.name)))
  } catch {
    return false
  }
}

/** @param {File} file */
async function readOne(file) {
  const key = crypto.randomUUID()
  /** @param {Partial<import('../../ui/state.js').Attachment>} patch */
  const update = (patch) => {
    app.attachments.value = app.attachments.value.map((item) => (item.key === key ? { ...item, ...patch } : item))
  }
  app.attachments.value = [...app.attachments.value, { key, name: file.name, status: 'reading' }]
  try {
    if (file.size > MAX_BYTES) throw new Error(t('files.tooBig'))
    const { name, mimeType, bytes, pages } = await contents(file)
    const link = await addFile(app.fs, { projectDir: app.projectDir, name, mimeType, bytes, pages, by: app.deviceId })
    rememberText(link, pages)
    // A certificate of an answer, or its proof, brings what checks it (D274); so does a picture or a film with Content Credentials (D324),
    // and a file that says AI made it (D410). It is ready once that is here, so the message it goes with can ask for the check.
    const c2pa = /^(image|video)\/|\.(docx|xlsx|pptx|svg|html?)$/i.test(`${mimeType} ${name}`) && await import('../receipt/c2pa.js')
    if (/\.sd-jwt$/i.test(name) || (/\.json$/i.test(name) && /"protected"[\s\S]*"signature"/.test(pages.join('\n')))
      || (c2pa && (c2pa.storeIn(bytes) || (await c2pa.marksOf(name, bytes).catch(() => null))?.generated))) await unlock('certificates')
    update({ status: 'ready', link, pages, ...(isPicture(link) && { preview: URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: mimeType })) }) })
  } catch (error) {
    console.warn(file.name, error)
    const message = error instanceof Error && error.message ? error.message : t('files.unreadable')
    update({ status: 'failed', error: message })
    notify(t('files.failed', { name: file.name }))
  }
}

/** What a file keeps: its bytes and its text's pages, or a picture as brains take it, with one empty page. @param {File} file */
async function contents(file) {
  if (file.type.startsWith('image/')) {
    const picture = await fitPicture(file)
    if (!picture) throw new Error(t('files.unsupported'))
    return { ...picture, pages: [''] }
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
  const pages = await (pdf ? import('./pdf.js').then((module) => module.pdfPages(bytes)) : extractPages(file.name, bytes))
  if (!pages) throw new Error(t('files.unsupported'))
  // A PDF with no text is a scan: brains that can see are shown its pages (D479).
  if (!pdf && !pages.some((page) => page.trim())) throw new Error(t('files.noText'))
  return { name: file.name, mimeType: file.type, bytes, pages }
}

// A picture's preview lives as long as its attachment: removed or sent, it is let go.
let previews = new Set()
effect(() => {
  const shown = new Set(app.attachments.value.flatMap((item) => (item.preview ? [item.preview] : [])))
  for (const url of previews) if (!shown.has(url)) URL.revokeObjectURL(url)
  previews = shown
})
