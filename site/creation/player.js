// SPDX-License-Identifier: MIT
// A creation shown as Jean itself shows one beside a task, framed by a page of the site (site/creation.js):
// `creation.html#src=<a creation's file on this site>&lang=<lang>`, with theme, look and bare as demo.html reads them.
// A site is in Jean's own site pane (caps/sites/frame.js), its pages running in the frames a project's do, its
// links leading on, at a phone's, a tablet's or a computer's width, in its three looks, by day or by night, its
// words retyped in place. A prototype is in its own (caps/prototypes/board.js): All pages, its board, then Try it.
// A whiteboard is on its board (caps/whiteboards/view.js) over Tables' own engine, its collection in memory: notes
// are dragged, written and drawn as in a project, and Group them brings the change Jean would make, kept in the
// creation's file, to accept or reject. A game is in its own frame (caps/games/frame.js): a cover to start it, pause,
// mute and full screen, buttons on a touch screen, its saves kept for the visit. A collection is in Tables' own view
// (caps/tables/view.js), as a table, a board or cards, and a document in its editor (caps/documents/editor.js), each
// with Jean's changes of it waiting to be accepted or rejected; a design in its view (caps/designs/view.js), its takes
// above its page, each part picked, moved and retyped. A project's map is drawn as Creations draws it (caps/compose/map.js),
// each creation saying the versions it reads and how it stands. A collection's own form (caps/collect) is beside its collection,
// as people see it once it is online: what is sent in it comes into the collection as a row, as a published form's reply does. Nothing is kept or sent (./state.js); what a view would ask Jean, which no
// brain answers here, is said in the creation's own words under it (./room.js).
import { html, render } from 'lit-html'
import { dir, t, useStrings } from '#app/core/i18n.js'
import { configureCapabilities } from '#app/ui/caps.js'
import { styleSheet } from '#app/ui/sheet.js'

/**
 * A creation's file, as site/creation.js writes it from a page's words: what the views say here in Jean's place
 * (`asked`, once a view asks Jean), then a site's or a prototype's files as text, with the colours its brain gave,
 * a prototype's shape and how its pages lead on; or a whiteboard's collection and the change Jean makes when asked.
 * @typedef {{ row?: string, set?: Record<string, unknown> }} Edit
 * @typedef {{ kind: 'site' | 'prototype', path: string, name: string, label: string, asked: string, files: Record<string, string>, look?: import('#app/caps/sites/look.js').Own,
 *   shape?: 'phone' | 'computer', flow?: import('#app/caps/prototypes/check.js').Flow }} Pages
 * @typedef {{ kind: 'whiteboard', name: string, folder: string, asked: string, files: Record<string, string>, then: Edit[] }} Board
 * @typedef {{ kind: 'game', path: string, name: string, card: string, code: string, meta: import('#app/caps/games/file.js').Meta }} Game
 * @typedef {{ kind: 'collection', name: string, folder: string, files: Record<string, string> }} Collection
 * @typedef {{ kind: 'document', name: string, markdown: string, held: { markdown: string, notes: string[] } }} Doc
 * @typedef {{ kind: 'design', name: string, asked: string, path: string, file: string }} Design
 * @typedef {{ kind: 'map', name: string, asked: string, creations: { place: string, name: string }[], edges: import('#app/caps/compose/refs.js').Edge[], latest: Record<string, number> }} Links
 * @typedef {{ kind: 'form', name: string, asked: string, folder: string, files: Record<string, string>, asks: string[] }} Form
 */

const params = new URLSearchParams(location.hash.slice(1))
const root = document.documentElement
root.lang = params.get('lang') || 'en'
root.dir = dir(root.lang)
// Nothing the views could turn on comes: no brain, no project and no service is here.
configureCapabilities({ deny: ['made', 'receipt', 'compact', 'plan', 'interactive', 'together', 'sync', 'share', 'skills', 'people', 'designs', 'fill', 'compose'], remember: () => {} })
const { app, theme } = await import('./state.js')
const chosen = root.dataset.theme
if (chosen === 'light' || chosen === 'dark') theme.value = chosen
theme.subscribe((now) => { root.dataset.theme = now })
app.look.value = root.dataset.look ?? 'tilde'

/** How far a whiteboard opens at most: where its smallest controls, a section's, are still as large as a finger needs (24 px, WCAG 2.5.8). */
const NEAR = 0.75
const main = /** @type {HTMLElement} */ (document.getElementById('main'))
const said = /** @type {HTMLElement} */ (document.getElementById('said'))
const response = await fetch(new URL(params.get('src') ?? '', location.href))
if (!response.ok) throw new Error(`creation: ${response.status} for ${params.get('src')}`)
/** @type {Pages | Board | Game | Collection | Doc | Design | Links | Form} */
const shown = await response.json()
// Its name, the document's and its heading's, which only a screen reader meets: a game's frame holds no words of its own.
document.title = /** @type {HTMLElement} */ (document.getElementById('name')).textContent = shown.name
const sheet = (/** @type {string} */ path) => styleSheet(new URL(`../${path}`, import.meta.url))
const bytes = (/** @type {string} */ text) => new TextEncoder().encode(text)
/** What Jean would do, said under the view. */
const say = () => { if ('asked' in shown) said.textContent = shown.asked }

/** A site's files dressed in its look, with its three looks. @param {Pages} one */
async function dressed (one) {
  const { dealt, worn } = await import('#app/caps/sites/look.js')
  const files = new Map(Object.entries(one.files).map(([path, text]) => [path, bytes(text)]))
  const { palettes } = await (await fetch(new URL('../caps/designs/layouts.json', import.meta.url))).json()
  const { looks, look } = dealt({ files, seed: one.path, palettes, given: one.look })
  return { looks, look, files: worn(files, look).files }
}

/** A site's pane, or a prototype's. @param {Pages} one */
async function pages (one) {
  // The bar's widths are drawn as the app's dialogs draw a choice of a few (ui/dialogs.css).
  await Promise.all([useStrings('sites'), sheet('ui/dialogs.css'), sheet('caps/sites/sites.css'), ...(one.kind === 'prototype' ? [useStrings('prototypes'), sheet('caps/prototypes/prototypes.css')] : [])])
  const [{ changed, retyped }] = await Promise.all([import('#app/caps/sites/file.js'), import(one.kind === 'prototype' ? '#app/caps/prototypes/board.js' : '#app/caps/sites/frame.js')])
  let { files, looks, look } = await dressed(one)
  /** Words retyped in a page, kept in the files here and nowhere else. @param {string} page @param {{ old: string, new: string }[]} changes */
  const retype = async (page, changes) => {
    const text = new TextDecoder().decode(files.get(page) ?? new Uint8Array()), passages = changes.map((change) => retyped(text, change.old, change.new))
    const out = passages.every(Boolean) ? changed(files, passages.map((passage) => ({ path: page, ...passage }))) : null
    return out && 'files' in out ? (files = out.files) : null
  }
  const given = { path: one.path, name: one.name, label: one.label, files, looks, look, retype, ask: say, ...(one.kind === 'prototype' && { shape: one.shape ?? 'phone', flow: one.flow, stamp: {} }) }
  render(one.kind === 'prototype' ? html`<app-prototype class="beside" .prototype=${given}></app-prototype>` : html`<app-site class="beside" .site=${given}></app-site>`, main)
}

/** A whiteboard on its board: its collection written in memory, as a project keeps one, then read by its own view. @param {Board} one */
async function board (one) {
  // Its notes as a table are found as the creations are (ui/creations.css).
  await Promise.all([useStrings('whiteboards'), useStrings('tables'), sheet('caps/whiteboards/whiteboards.css'), sheet('ui/creations.css')])
  for (const [name, text] of Object.entries(one.files)) await app.fs.write(`${app.projectDir}/${one.folder}/${name}`, text)
  const [tables] = await Promise.all([import('#app/caps/tables/tables.js'), import('#app/caps/whiteboards/view.js')])
  render(html`<app-whiteboard folder=${one.folder}></app-whiteboard>`, main)
  // Its view opens on the whole board, however small that makes it. Here it opens no farther than NEAR, from its first section's
  // corner, by the view's own zoom, which then holds there as the frame is sized; Fit, in its bar, shows the whole board.
  const view = /** @type {HTMLElement & { fit: () => void, zoom: (by: number, to?: number, at?: { clientX: number, clientY: number }) => void }} */ (main.querySelector('app-whiteboard'))
  for (let frames = 0; frames < 120 && !view.querySelector('.wb-area'); frames++) await new Promise(requestAnimationFrame)
  if (Number(/** @type {HTMLElement | null} */ (view.querySelector('.wb-layer'))?.style.scale) < NEAR) {
    ;/** @type {HTMLElement | undefined} */ ([...view.querySelectorAll('.wb-zoom .icon-button')].at(-1))?.click()
    view.fit()
    const first = view.querySelector('.wb-area')?.getBoundingClientRect()
    if (first) view.zoom(0, NEAR, { clientX: root.dir === 'rtl' ? first.right : first.left, clientY: first.top })
  }
  // Group them, or anything else a view asks Jean: after a moment, the change Jean would make of the notes that still wait
  // on the shelf comes as its own, to accept or reject; rejected, it comes again when asked again.
  document.addEventListener('asked', async () => {
    await new Promise((resolve) => setTimeout(resolve, 600))
    const now = await tables.load(one.folder), waiting = one.then.filter((edit) => now?.rows.some((row) => row.id === edit.row && row.cells.area == null))
    if (now && waiting.length) await tables.change(now, waiting, 'jean', undefined, false, true)
    say()
  })
}

/** A game in its frame, as its pane beside a task holds it. @param {Game} one */
async function game (one) {
  await Promise.all([useStrings('games'), sheet('caps/games/games.css'), import('#app/caps/games/frame.js')])
  render(html`<app-game .game=${one}></app-game>`, main)
}

/** A collection in Tables' view, as its pane beside a task holds it: its files written in memory, then read. @param {Collection} one */
async function collection (one) {
  for (const [name, text] of Object.entries(one.files)) await app.fs.write(`${app.projectDir}/${one.folder}/${name}`, text)
  // Its rows are found as the creations are, and one opens as a sheet, as the app's dialogs do (ui/creations.css, ui/dialogs.css).
  const [tables] = await Promise.all([import('#app/caps/tables/tables.js'), sheet('ui/creations.css'), sheet('ui/dialogs.css'), sheet('ui/view.css')])
  tables.shown.value = await tables.load(one.folder)
  // In a pane's view, which scrolls it, as beside a task (ui/view.css).
  render(html`<div class="view"><app-table folder=${one.folder} beside></app-table></div>`, main)
}

/** A document in its editor, Jean's version of it waiting; what is written in it goes nowhere. @param {Doc} one */
async function page (one) {
  await Promise.all([useStrings('documents'), ...['prosemirror/prosemirror', 'prosemirror/tables', 'prosemirror/gapcursor'].map((name) => sheet(`vendor/${name}.css`)), sheet('caps/documents/editor.css'), sheet('ui/view.css')])
  const { create } = await import('#app/caps/documents/editor.js'), box = Object.assign(document.createElement('div'), { className: 'document' })
  // In a pane's view, which scrolls it, as beside a task (ui/view.css).
  main.append(Object.assign(document.createElement('div'), { className: 'view' }))
  main.firstElementChild?.append(box)
  create(box, { name: one.name, markdown: one.markdown, write: async () => {}, keep: async () => null, tell: () => {}, held: one.held, hold: () => {} })
}

/** A design in its view: its file written in memory, as a project keeps one, then opened as its pane opens it. @param {Design} one */
async function design (one) {
  await app.fs.write(`${app.projectDir}/${one.path}`, one.file)
  const { editor } = await import('#app/caps/designs/designs.js')
  main.append(await editor({ uri: one.path }, []))
}

/**
 * A project's map, as Creations draws it: its creations by their places, the links between those it has, one line for each
 * way two link, each creation saying the versions it reads and how it stands, as caps/compose/compose.js's drawingOf() says
 * them, a consumer whose only source is gone drawn too; a creation pressed says what Jean would do. @param {Links} one
 */
async function map (one) {
  await Promise.all([useStrings('compose'), sheet('caps/compose/compose.css')])
  const [{ drawn }, { standing }, { icons }] = await Promise.all([import('#app/caps/compose/map.js'), import('#app/caps/compose/refs.js'), import('#app/ui/menu-icons.js')])
  const KIND = /** @type {Record<string, unknown>} */ ({ conversations: icons.task, collections: icons.table, decks: icons.slides, documents: icons.note, sites: icons.code, prototypes: icons.code, games: icons.play, designs: icons.palette, routines: icons.sync })
  const names = new Map(one.creations.map(({ place, name }) => [place, name])), edges = one.edges.filter((edge) => names.has(edge.from) && names.has(edge.to))
  const which = (/** @type {import('#app/caps/compose/refs.js').Ref['at']} */ at) => (typeof at === 'number' ? t('compose.pinned', { n: at }) : t(`compose.${at}`))
  const stands = (/** @type {string} */ place) => standing(place, one.edges, (other) => names.has(other), (other) => one.latest[other] ?? 0)
  render(drawn({ places: [...names.keys()].sort(), edges: [...new Map(edges.map((edge) => [`${edge.from} ${edge.to} ${edge.kind ?? ''}`, edge])).values()], name: (place) => names.get(place) ?? place,
    glyph: (place) => KIND[place.split('/')[0]] ?? icons.layers, open: say, alert: (place) => new Set(stands(place).filter(([key]) => /missing|loop/.test(key)).map(([key]) => t(`compose.${key}`))),
    said: (place) => [...new Set([...edges.filter((edge) => edge.from === place && !edge.kind).map((edge) => which(edge.at)), ...stands(place).map(([key, given]) => (key === 'brain' ? String(given.name) : t(`compose.${key}`, given)))])] }), main)
}

/**
 * A collection's own form beside its collection: the form as people see it online, a field for each column it asks, as Collect
 * replies has it (caps/collect/form.js's parts), then the collection in Tables' view. What is sent in it comes into the collection
 * as a published form's reply does (caps/sites/sites.js's gather()): a row by a visitor, each field by its column's name, as its
 * column takes it; and what is said then is where a reply sent online would wait. @param {Form} one
 */
async function form (one) {
  for (const [name, text] of Object.entries(one.files)) await app.fs.write(`${app.projectDir}/${one.folder}/${name}`, text)
  const [tables, { propertyOf, converted }, { askable, partsOf }] = await Promise.all([import('#app/caps/tables/tables.js'), import('#app/caps/tables/table.js'), import('#app/caps/collect/form.js'),
    useStrings('collect'), sheet('ui/creations.css'), sheet('ui/dialogs.css'), sheet('ui/view.css')])
  const first = tables.shown.value = await tables.load(one.folder)
  if (!first) throw new Error(`creation: ${one.folder} is no collection`)
  const parts = partsOf(askable(first.table).filter((field) => one.asks.includes(field.id)))
  const sent = /** @type {HTMLElement} */ (Object.assign(document.createElement('span'), { className: 'form-sent' }))
  sent.setAttribute('role', 'status')
  /** What a field is asked with, its kind's own: a number's, an email's, a day's. @param {import('#app/caps/collect/form.js').Part} part */
  const typed = ({ attrs }) => (typeof attrs.type === 'string' ? attrs.type : 'text')
  const field = (/** @type {import('#app/caps/collect/form.js').Part} */ part) => (part.as === 'tick' ? html`<p class="form-pick"><label for=${part.id}><input id=${part.id} name=${part.id} type="checkbox" value="true"><bdi>${part.name}</bdi></label></p>`
    : part.as === 'radios' ? html`<fieldset><legend dir="auto">${part.name}</legend>${part.options.map((option, i) => html`<p class="form-pick"><label for=${`${part.id}-${i}`}><input id=${`${part.id}-${i}`} name=${part.id} type="radio" value=${option}><bdi>${option}</bdi></label></p>`)}</fieldset>`
    : html`<p><label for=${part.id} dir="auto">${part.name}</label>${part.as === 'select' ? html`<select id=${part.id} name=${part.id}><option value="">${t('collect.pick')}</option>${part.options.map((option) => html`<option>${option}</option>`)}</select>`
      : part.as === 'area' ? html`<textarea id=${part.id} name=${part.id} rows="2" dir="auto"></textarea>`
      : html`<input id=${part.id} name=${part.id} type=${typed(part)} dir="auto" autocomplete="off" ?required=${part.attrs.required === true}>`}</p>`)
  const send = async (/** @type {SubmitEvent} */ event) => {
    event.preventDefault()
    const asked = /** @type {HTMLFormElement} */ (event.currentTarget), data = new FormData(asked), now = await tables.load(one.folder)
    if (!now) return
    const set = Object.fromEntries(parts.flatMap(({ id, name }) => {
      const property = propertyOf(now.table, name), value = data.get(id), fit = property && (property.type === 'checkbox' && value === 'true' ? true : converted(property, value))
      return property && fit !== undefined ? [[property.id, fit]] : []
    }))
    await tables.change(now, [{ set }], 'visitor', undefined, false, false)
    asked.reset()
    sent.textContent = t('collect.sent')
    say()
  }
  render(html`<div class="form-pane">
    <section class="form-seen" aria-labelledby="form-seen"><h2 id="form-seen">${t('collect.sees')}</h2>
      <form @submit=${send}><h3 dir="auto">${one.name}</h3>${parts.map(field)}<p class="form-end"><button class="button primary">${t('collect.send')}</button>${sent}</p></form></section>
    <div class="view"><app-table folder=${one.folder} beside></app-table></div></div>`, main)
}

document.addEventListener('asked', () => { if (shown.kind !== 'whiteboard') say() })
await ({ whiteboard: board, game, collection, document: page, design, map, form, site: pages, prototype: pages })[shown.kind](/** @type {any} */ (shown))
