// The preview (D126): a file Jean made or the user shared, seen beside the conversation, or over
// it on a narrow screen, in a pane of the dock (D144), with a button to save it. Each kind shows
// as what it is (ui/view.js, which the browser shares): a picture as a picture; a web page in a
// frame of its own, doing what Settings lets it (D143); a PDF's pages drawn; an Office file or a
// CSV as Office draws it (D183); Markdown laid out; else its text. A file being changed shows its
// new version as it comes. Loaded the first time a file is opened, with its style sheet.
import { html, nothing } from 'lit-html'
import { signal, computed, effect } from '@preact/signals-core'
import { Element, define } from './base.js'
import * as dock from './dock.js'
import { app, effective, notify } from './state.js'
import { save, savePage } from './save.js'
import { icons } from './icons.js'
import { addFile, fileMeta, fileText, splitPages } from '../core/files.js'
import { callsIn, filesMade, latestOf, noteRecord, versionsOf } from '../core/events.js'
import { appendRecords } from '../core/conversations.js'
import { pageRights, pagePolicy, pageAllow } from './csp.js'
import { t } from '../core/i18n.js'
import { styleSheet } from './sheet.js'
import { viewOf } from './view.js'
import { keep } from './windows.js'

/** @typedef {{ uri: string, name: string, mimeType?: string, version?: number }} Shown  version: which of the conversation's, for a file Jean made (D164) */

await styleSheet('ui/preview.css')

const shown = signal(/** @type {Shown | null} */ (null))
const view = signal(/** @type {unknown} */ (nothing))

// What a web page may do, as Settings and policy have it (D143, D158): its policy, and what its frame allows.
const rights = computed(() => pageRights(effective.value.settings, app.policy))
const policy = computed(() => pagePolicy(rights.value.allows, rights.value.sites))
const allow = computed(() => pageAllow(rights.value.allows))
// A file the page made, saved for it; a cell of a workbook the user changed (D229).
addEventListener('message', ({ source, data }) => {
  if (!source || source !== document.querySelector('app-preview')?.querySelector('iframe')?.contentWindow) return
  if (data?.cell) change(data.cell, /** @type {Window} */ (source))
  else savePage(data, rights.peek().allows.downloads)
})
// Where the user was in the workbook they changed last, to show it there again.
let where = /** @type {{ uri: string, at: import('../caps/files/office.js').Place } | null} */ (null)

export const preview = (/** @type {Shown} */ file) => { shown.value = file }
const close = () => { shown.value = null }
// In the address (D220): the file on show, by its place in the project, which says its name and kind.
keep('preview', {
  get: () => shown.value?.uri ?? null,
  set: async (uri) => {
    if (uri === null) return close()
    const meta = /^files\/[^/]+$/.test(uri) && uri !== shown.peek()?.uri && await fileMeta(app.fs, app.projectDir, uri)
    if (meta) preview({ uri, name: meta.name, mimeType: meta.mimeType })
  },
})

// What the file on show holds now: the copy the user last changed it into here (D229), else itself.
const copy = computed(() => (shown.value ? latestOf(app.current.value?.records ?? [], shown.value.uri) : ''))

// The versions of the file on show, when Jean made it: each one the conversation kept, oldest first (D164).
const versions = computed(() => {
  const file = shown.value
  return file ? versionsOf(filesMade(callsIn(app.current.value?.records ?? [], app.live.value?.turn.steps)), file.name) : []
})
/** Where the file on show is among its versions: the one asked for, or the last with its content. */
const at = computed(() => {
  const file = shown.value
  const all = versions.value
  return file?.version && all[file.version - 1]?.uri === file.uri ? file.version - 1 : all.findLastIndex((each) => each.uri === file?.uri)
})

class Preview extends Element {
  render() {
    const file = shown.value
    if (!file) return nothing
    const label = t('made.save', { name: file.name })
    return html`<aside class="pane preview" aria-label=${file.name} @keydown=${(/** @type {KeyboardEvent} */ event) => event.key === 'Escape' && close()}>
      <header class="pane-head">
        <h2><span dir="auto">${file.name}</span></h2>
        ${versions.value.length > 1 && at.value >= 0 ? picker() : nothing}
        <button class="icon-button" aria-label=${label} @click=${() => download(file)}>${icons.download}</button>
        <button class="icon-button" aria-label=${t('action.close')} @click=${close}>${icons.close}</button>
      </header>
      <div class="view">${view.value}</div>
    </aside>`
  }

  updated() {
    if (dock.place(this, Boolean(shown.value))) this.querySelector('button')?.focus()
  }
}

/** The versions of the file on show, the one it is chosen, to pick another (D164). */
function picker() {
  const all = versions.value
  // Its value as well as the options' selected: once picked from, a select no longer follows the attribute.
  return html`<select class="versions" aria-label=${t('preview.versions')} .value=${String(at.value)}
    @change=${(/** @type {Event} */ event) => { shown.value = all[Number(/** @type {HTMLSelectElement} */ (event.target).value)] }}>
    ${all.map((each, i) => html`<option value=${i} ?selected=${i === at.value}>${t('made.version', { n: each.version })}</option>`)}
  </select>`
}

/**
 * A cell the user changed in the workbook on show (D229), in the version on show: what it holds becomes a
 * copy with the change, as the bytes the brain read stay as they were, and a note says so, which the brain
 * hears with the next message; it shows again where the user was. One that changes only in a spreadsheet
 * app says so, and its box goes. @param {Record<string, unknown>} cell what the frame sent @param {Window} frame
 */
async function change({ sheet, ref, value, sheetName, at }, frame) {
  const file = shown.peek()
  const conversation = app.current.peek()
  if (!file || !conversation || !/\.xlsx$/i.test(file.name) || !Number.isInteger(sheet) || typeof ref !== 'string' || typeof value !== 'string' || value.length > 32767) return
  try {
    const dir = app.project.peek().dir
    const bytes = await app.fs.readBytes(`${dir}/${copy.peek()}`)
    if (!bytes) return notify(t('files.missing', { name: file.name }))
    const [{ setCells }, { extractPages }] = await Promise.all([import('../caps/files/cells.js'), import('../caps/files/extract.js')])
    const changed = await setCells(bytes, [{ sheet: Number(sheet), ref, value }], file.name)
    const link = await addFile(app.fs, { projectDir: dir, name: file.name, mimeType: file.mimeType, bytes: changed, pages: (await extractPages(file.name, changed)) ?? [], by: app.deviceId })
    const note = noteRecord(`The user changed ${file.name} in the preview: ${ref} in ${String(sheetName)} is ${value ? `now ${value}` : 'empty'}.`, { kind: 'cells', was: file.uri, uri: link.uri })
    await appendRecords(app.fs, conversation.path, [note])
    const { x, y } = /** @type {Record<string, unknown>} */ (at ?? {})
    where = { uri: link.uri, at: { sheet: Number(sheet), x: Number(x) || 0, y: Number(y) || 0, ref } }
    const now = app.current.peek()
    if (now?.path === conversation.path) app.current.value = { ...now, records: [...now.records, note] }
  } catch (error) {
    console.warn('Preview', error)
    notify(t('preview.locked'))
    frame.postMessage({ unchanged: true }, '*')
  }
}

/** @param {Shown} file */
async function download(file) {
  const bytes = await app.fs.readBytes(`${app.projectDir}/${copy.peek() || file.uri}`)
  if (bytes) save(new Blob([/** @type {BlobPart} */ (bytes)], { type: file.mimeType ?? '' }), file.name)
  else notify(t('files.missing', { name: file.name }))
}

// What the file shows as, read again when another file (or a new version) is shown, or when what
// a web page may do changes. What a view holds on to (a picture's address, a PDF) is let go with
// it, or at once if it came too late.
effect(() => {
  const file = shown.value
  const uri = copy.value
  const rules = policy.value
  const allows = allow.value
  /** @type {(() => void)[]} */
  const holds = []
  const release = () => { for (const run of holds.splice(0)) run() }
  view.value = nothing
  if (file) {
    show(file, uri, holds, rules, allows).catch((error) => console.warn('Preview', error) ?? null).then((template) => {
      if (shown.peek() !== file || copy.peek() !== uri) release()
      else if (template === null) close()
      else view.value = template
    })
  }
  return release
})

// A newer version of the file on show, made while the answer is written, takes its place, unless
// the user went back to an earlier one (D164).
let newest = { name: '', uri: '' }
effect(() => {
  const file = shown.value
  const last = versions.value.at(-1)
  const before = newest
  newest = { name: file?.name ?? '', uri: last?.uri ?? '' }
  if (file && last && before.name === file.name && before.uri && before.uri !== last.uri && file.uri === before.uri) shown.value = last
})

// Another conversation, or another project, closes it.
let conversation = app.current.peek()?.id
effect(() => {
  if (app.current.value?.id !== conversation) close()
  conversation = app.current.peek()?.id
})

/**
 * @param {Shown} file @param {string} uri where what it holds now is (D229) @param {(() => void)[]} holds @param {string} rules a web page's policy
 * @param {string} allows what its frame allows
 * @returns {Promise<unknown>} null when the file is no longer there, or can't be read
 */
async function show(file, uri, holds, rules, allows) {
  const dir = app.project.peek().dir
  const bytes = await app.fs.readBytes(`${dir}/${uri}`)
  if (!bytes) {
    notify(t('files.missing', { name: file.name }))
    return null
  }
  // Its text is what Jean wrote for a file it made, what was read from a shared one; a Word document Jean wrote is Markdown.
  const prose = /\.docx$/i.test(file.name) && (await fileMeta(app.fs, dir, uri))?.author === 'jean'
  const text = async () => splitPages((await fileText(app.fs, dir, uri)) ?? '').join('\n')
  const { allows: can, sites } = rights.peek()
  // A workbook's cells change here, and it shows again where the user was (D229).
  const cells = /\.xlsx$/i.test(file.name) ? { ...(where?.uri === uri && { at: where.at }) } : undefined
  return viewOf({ name: file.name, bytes, type: file.mimeType, text, prose, cells }, holds, { allows: can, sites, policy: rules, allow: allows })
}

define('app-preview', Preview)
dock.join(document.createElement('app-preview'))
