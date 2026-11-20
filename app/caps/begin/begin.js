// SPDX-License-Identifier: MIT
// A new collection, begun with no brain (caps/tables fetches this folder as Create makes one): a dialog over the page that asks what to keep track of
// and offers starting points, each a collection with its columns, in the person's words (one makes two, each invoice related to its client), an
// empty one, as before, and a file: a CSV or a workbook's first sheet, read on this device, its columns listed with the kind guessed for each
// (./shape.js), which the person changes, a kind that would leave cells empty saying how many. Make the collection writes it with its rows, as
// the person's own, and opens it beside the task. Describing it instead writes the start of a request in the box, never sent.
import { html, render, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal, effect } from '@preact/signals-core'
import { t, useStrings, intlLocales } from '../../core/i18n.js'
import { readZip } from '../../core/zip.js'
import { app, assistantName } from '../../ui/state.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { reread } from '../../ui/creations.js'
import { makeTable, load, change, metaOf, localCurrency } from '../tables/tables.js'
import { planned, valueFor } from '../paste/block.js'
import { KINDS, STARTS, linesOf, guess, off, specOf, started } from './shape.js'

await Promise.all([useStrings('begin'), styleSheet(new URL('begin.css', import.meta.url)), import('../../ui/dialogs.js')])

/** @import { Column, Kind } from './shape.js' */

/** The file read: its name without its ending, its columns as guessed or changed, its rows. */
const file = signal(/** @type {{ name: string, columns: Column[], rows: string[][] } | null} */ (null))
/** Whether the last file couldn't be read, and whether a collection is being made. */
const wrong = signal(false), busy = signal(false)

/** How cells are read: in the person's language, money that names no currency in their region's. */
const how = () => ({ locales: intlLocales(), currency: localCurrency(), column: (/** @type {number} */ count) => t('begin.columnN', { count }) })
/** Names side by side, as the language lists them. @param {string[]} names */
const listed = (names) => new Intl.ListFormat(intlLocales(), { type: 'unit', style: 'short' }).format(names)

/** A file's lines: a workbook's first sheet, a Numbers file's first table, else its text's. @param {File} from @returns {Promise<string[][]>} */
async function read(from) {
  const bytes = new Uint8Array(await from.arrayBuffer()), ext = from.name.toLowerCase().split('.').pop(), files = await import('../files/extract.js')
  const split = (/** @type {string[]} */ rows) => rows.map((row) => row.split('\t')).filter((cells) => cells.some((cell) => cell.trim()))
  if (ext === 'numbers') return split((await (await import('../files/numbers.js')).numbersTables(readZip(bytes)))[0]?.rows ?? [])
  if (ext !== 'xlsx') { if (files.isBinary(bytes)) throw new Error('Not a text file.'); return linesOf(files.decodeText(bytes)) }
  const entries = new Map(readZip(bytes).map((entry) => [entry.name, entry])), decoder = new TextDecoder()
  const xml = async (/** @type {string} */ path) => ((entry) => (entry ? entry.read().then((part) => decoder.decode(part)) : ''))(entries.get(path))
  const target = files.relationships(await xml('xl/_rels/workbook.xml.rels')).get(files.attr(/<sheet\b([^>]*)>/.exec(await xml('xl/workbook.xml'))?.[1] ?? '', 'r:id') ?? '')
  if (!target) throw new Error('A workbook with no sheet.')
  return split(files.sheetRows(await xml(files.resolveTarget('xl', target)), files.sharedStrings(await xml('xl/sharedStrings.xml')), files.dateStyles(await xml('xl/styles.xml'))))
}

/** The file picked, read and guessed; one that can't be read is said. @param {Event} event */
async function picked(event) {
  const input = /** @type {HTMLInputElement} */ (event.target), [from] = input.files ?? []
  if (!from) return
  try {
    const { columns, rows } = guess(await read(from), how())
    if (!columns.length) throw new Error('Nothing in it.')
    file.value = { name: from.name.replace(/\.[^.]+$/, '') || from.name, columns, rows }
    wrong.value = false
  } catch { file.value = null; wrong.value = true }
  input.value = ''
}

/**
 * Collections made from specs, in order, a relation naming the place of one made before it; the last one filled with a file's rows, as the person's
 * own, each cell as its column takes it, and opened beside the task. @param {ReturnType<typeof started>} specs @param {string[][]} [rows]
 */
async function make(specs, rows = []) {
  if (busy.value) return
  busy.value = true
  try {
    const folders = /** @type {string[]} */ ([])
    for (const spec of specs) folders.push(await makeTable({ ...spec, columns: spec.columns.map((column) => (typeof column.collection === 'number' ? { ...column, collection: folders[column.collection] } : column)) }, app.projectDir))
    const folder = /** @type {string} */ (folders.at(-1)), one = await load(folder), reading = how()
    if (!one) throw new Error('Not made.')
    const edits = planned(rows, one.table.properties, [], '', (property, text) => valueFor(property, text, reading))
    if (edits.length) await change(one, edits, 'user', undefined, false)
    shut()
    await reread()
    ;(await import('../../ui/preview.js')).preview({ uri: folder, name: (await metaOf(folder))?.name ?? one.table.name, title: one.table.name })
  } catch { wrong.value = true } finally { busy.value = false }
}

const shut = () => /** @type {HTMLDialogElement | null} */ (document.querySelector('dialog.begin'))?.close()
/** The start of a request, in the box for the person to finish, the caret at its end. */
const describe = () => { const words = t('begin.draft'); shut(); app.draft.value = words; requestAnimationFrame(() => { const box = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('prompt')); box?.focus(); box?.setSelectionRange(words.length, words.length) }) }
/** A column made another kind. @param {number} at @param {Event} event */
const retype = (at, event) => { const now = file.value; if (now) file.value = { ...now, columns: now.columns.map((column, i) => (i === at ? { ...column, type: /** @type {Kind} */ (/** @type {HTMLSelectElement} */ (event.target).value) } : column)) } }

/** @param {() => unknown} empty what makes an empty collection, as Create did */
const view = (empty) => {
  const now = file.value, reading = how(), words = (/** @type {string} */ key) => t(`begin.${key}`)
  return html`<dialog class="sheet begin" aria-labelledby="begin-title">
    <header class="dialog-head"><h2 id="begin-title">${t('begin.title')}</h2><button type="button" class="icon-button" aria-label=${t('action.close')} @click=${shut}>${icons.close}</button></header>
    <p class="begin-ask">${t('begin.ask')}</p>
    <section aria-labelledby="begin-starts"><h3 id="begin-starts">${t('begin.starts')}</h3>
      <ul class="begin-starts">${STARTS.map((start) => html`<li><button type="button" data-start=${start.id} ?disabled=${busy.value} @click=${() => make(started(start, words, localCurrency()))}>
        <b>${t(`begin.start.${start.id}`)}</b><span class="muted small">${listed(/** @type {typeof start.tables[number]} */ (start.tables.at(-1)).columns.map(([key]) => words(key)))}</span></button></li>`)}
        <li><button type="button" data-start="empty" ?disabled=${busy.value} @click=${() => { shut(); empty() }}><b>${t('begin.start.empty')}</b><span class="muted small">${t('begin.name')}</span></button></li></ul></section>
    <section aria-labelledby="begin-file"><h3 id="begin-file">${t('begin.file')}</h3>
      <div class="begin-file"><p class="muted small">${now ? html`<b dir="auto">${now.name}</b>` : t('begin.fileHint')} <span role="status">${now ? t('begin.rows', { count: new Intl.NumberFormat(intlLocales()).format(now.rows.length) }) : nothing}</span></p>
        <label class="button" for="begin-input">${icons.upload}${t(now ? 'begin.another' : 'begin.pick')}<input id="begin-input" type="file" accept=".csv,.tsv,.txt,.xlsx,.numbers" class="visually-hidden" @change=${picked}></label></div>
      <p class="begin-wrong" role="alert">${wrong.value ? t('begin.wrong') : nothing}</p>
      ${now ? html`<div class="begin-columns"><table><thead><tr><th scope="col">${t('begin.column')}</th><th scope="col">${t('begin.kindHead')}</th><th scope="col">${t('begin.sample')}</th></tr></thead>
        <tbody>${now.columns.map((column, at) => { const lost = off(column.type, now.rows, at, reading); return html`<tr class=${lost ? 'is-off' : ''}><th scope="row" dir="auto">${column.name}</th>
          <td><select title=${t('begin.kindOf', { name: column.name })} .value=${live(column.type)} @change=${(/** @type {Event} */ e) => retype(at, e)}>${KINDS.map((kind) => html`<option value=${kind} ?selected=${kind === column.type}>${t(`begin.kind.${kind}`)}</option>`)}</select></td>
          <td><span class="muted">${new Intl.ListFormat(intlLocales(), { type: 'unit', style: 'short' }).formatToParts(column.sample).map(({ type, value }) => (type === 'element' ? html`<bdi>${value}</bdi>` : value))}</span>${lost ? html`<span class="begin-off">${t('begin.off', { count: lost })}</span>` : nothing}</td></tr>` })}</tbody></table></div>` : nothing}
    </section>
    <footer class="dialog-foot"><button type="button" class="button subtle" @click=${describe}>${t('begin.describe', { name: assistantName() })}</button>
      ${now ? html`<button type="button" class="button primary" ?disabled=${busy.value} @click=${() => make([specOf(now.name, now.columns)], now.rows)}>${t('begin.make')}</button>` : nothing}</footer>
  </dialog>`
}

/** The dialog, over the page, until it closes. @param {() => unknown} empty what makes an empty collection */
export async function begin(empty) {
  const host = document.body.appendChild(document.createElement('div')), stop = effect(() => { render(view(empty), host) }), dialog = /** @type {HTMLDialogElement} */ (host.querySelector('dialog'))
  dialog.addEventListener('close', () => { stop(); host.remove(); file.value = null; wrong.value = false })
  dialog.showModal()
}
