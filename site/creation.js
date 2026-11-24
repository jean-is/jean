// SPDX-License-Identifier: MIT
// A pane that frames a creation as Jean itself shows one beside a task, where a page's pane is no conversation but
// what Jean made: a site, a prototype, a whiteboard, a game, a collection, a document or a design, live, in Jean's own
// view (creation/player.js), or a project's map, as Creations draws how its creations link (caps/compose/map.js). Beside the page,
// from its words as text, this writes the creation's file; and once, whatever page asks, the document that shows
// one, creation.html, a document of its own as demo.html is, with its code and look under creations/. Its policy is
// demo.html's; its import map is demo.html's too, with the few modules of the room the views ask for stood in for
// (creation/state.js, creation/room.js), since no project, brain or service is there.
// A whiteboard's collection is made here by Whiteboards' own code (caps/whiteboards/tool.js), as `whiteboard` makes
// one and `whiteboard_change` sorts it, a collection by Tables' (caps/tables/table.js) and a design by Designs'
// (caps/designs/layout.js), so the page shows what Jean would make of the same call. A collection's own form (caps/collect)
// is shown with it: the collection as its replies and the person left it, and the columns its form asks.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inlineScript, xml } from './site.js'
import { made, rowsOf, changed, editsOf } from '../app/caps/whiteboards/tool.js'
import { layout } from '../app/caps/whiteboards/layout.js'
import { stamp, fold, stringifyChanges } from '../app/caps/tables/changes.js'
import { folderOf, notesOf, createTable, checkCell, titleOf } from '../app/caps/tables/table.js'
import { askable } from '../app/caps/collect/form.js'
import { repair } from '../app/caps/designs/tool.js'
import { designOf } from '../app/caps/designs/layout.js'
import { toSvg } from '../app/caps/designs/format.js'
import { slug } from '../app/core/settings.js'
import { parse, elements } from '../app/caps/sites/html.js'

const HERE = new URL('creation/', import.meta.url)
/** The player's code and look, as the site serves them. */
const CODE = Object.fromEntries(await Promise.all([['player.js', 'creation.js'], ['state.js', 'state.js'], ['room.js', 'room.js'], ['creation.css', 'creation.css']]
  .map(async ([file, as]) => [`creations/${as}`, await readFile(new URL(file, HERE), 'utf8')])))
/** The modules of the room stood in for, by where the app's own modules import them from. */
export const STOOD = { 'ui/state.js': 'state.js', 'ui/send.js': 'room.js', 'ui/creations.js': 'room.js', 'ui/windows.js': 'room.js', 'ui/preview.js': 'room.js', 'ui/dialogs.js': 'room.js', 'caps/whiteboards/whiteboards.js': 'room.js' }
const DEMO = await readFile(new URL('../app/demo.html', import.meta.url), 'utf8')
/** demo.html's first line, which reads the look and light or dark from the address before anything is drawn, and its import map. */
const FIRST = inlineScript(DEMO)
const IMPORTS = JSON.parse(inlineScript(DEMO, 'importmap') ?? 'null')?.imports
/** The editor's library, which a document's editor imports by the name the app's own document gives it. */
const EDITOR = '#prosemirror'
const LIBRARY = JSON.parse(inlineScript(await readFile(new URL('../app/index.html', import.meta.url), 'utf8'), 'importmap') ?? 'null')?.imports?.[EDITOR]
/** Designs' layouts, palettes and voices, which a design is laid out from. */
const BOOK = JSON.parse(await readFile(new URL('../app/caps/designs/layouts.json', import.meta.url), 'utf8'))
if (!FIRST || !IMPORTS || !LIBRARY) throw new Error('app/demo.html has no first line, or no import map, or app/index.html names no editor')
const MAP = JSON.stringify({ imports: { ...IMPORTS, [EDITOR]: LIBRARY, '#app/': './', ...Object.fromEntries(Object.entries(STOOD).map(([from, to]) => [`./${from}`, `./creations/${to}`])) } })
const hash = (/** @type {string} */ script) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`

/**
 * The document that shows a creation, the same in every language, which reads its creation and language from its
 * address, and names it in a heading for whoever can't see it: its policy runs demo.html's first line, its import map and its own modules, and frames the pages Jean's
 * views run (preview.html); kept out of search results. @param {import('./site.js').Kit} kit
 */
const player = (kit) => /* html */ `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' ${hash(FIRST)} ${hash(MAP)}; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types lit-html app-urls">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<script>${FIRST}</script>
<meta name="referrer" content="no-referrer">
<title>${xml(kit.brand.name)}</title>
<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="ui/style.css">
<link rel="stylesheet" href="creations/creation.css">
<script type="importmap">${MAP}</script>
<script type="module" src="creations/creation.js"></script>
</head>
<body class="shown"><h1 id="name" class="visually-hidden"></h1><main id="main"></main><p id="said" role="status"></p></body>
</html>
`

/**
 * A site or a prototype as a page's words tell it: its name, the colours its brain gave, its files as text, a
 * prototype's shape; or a whiteboard as `whiteboard` is called for one (its sections, then its notes), the notes
 * people wrote since, which wait on its shelf, and where `whiteboard_change` then moves each, by its words.
 * @typedef {{ kind: 'site' | 'prototype', name: string, label: string, asked: string, look?: { accent: string, paper?: string, ink?: string, second?: string, type?: string }, shape?: 'phone' | 'computer', files: Record<string, string> }} Pages
 * @typedef {{ kind: 'whiteboard', name: string, asked: string, areas: string[], notes: { words: string, area: string, owner?: string }[], shelf: string[], then: { note: string, area: string }[] }} Board
 *
 * Or a game as `game` is given it: its name, its design card, its engine, the actions it uses and its code, one module.
 * @typedef {{ kind: 'game', name: string, card: string, engine: 'phaser' | 'babylon' | 'none', actions: string[], code: string }} Game
 *
 * Or a collection as `table_create` is given it (its name and columns), the rows the person keeps in it, each cell by its
 * column's name, and what `table_change` then changes, with why: a row by its first cell, else a row to add.
 * @typedef {{ kind: 'collection', name: string, columns: { name: string, type: string, options?: string[] }[], rows: Record<string, string>[], then: { row?: string, set: Record<string, string> }[], why: string }} Collection
 *
 * Or a document, its Markdown, with Jean's version of it and a few words for each change, left to accept or reject; or a
 * design as `design` is given it.
 * @typedef {{ kind: 'document', name: string, markdown: string, held: { markdown: string, notes: string[] } }} Doc
 * @typedef {{ kind: 'design', name: string, asked: string, args: Record<string, unknown> }} Design
 *
 * Or a project's map: its creations by their places and names, the links Jean's graph reads from their files
 * (caps/compose/refs.js), those to a creation the project no longer has among them, and each source's latest version.
 * @typedef {{ kind: 'map', name: string, asked: string, creations: { place: string, name: string }[], edges: import('../app/caps/compose/refs.js').Edge[], latest: Record<string, number> }} Links
 *
 * Or a collection with its own form, as Share's Collect replies puts one online (caps/collect): its columns, those the form
 * asks, by their names, and its rows, each as a visitor sent it, with what the person noted in the other columns since.
 * @typedef {{ kind: 'form', name: string, asked: string, columns: { name: string, type: string, options?: string[] }[], asks: string[], rows: Record<string, string | boolean>[] }} Form
 */

/** Ids as ULIDs are written, in order, the same at each build: the creation's files change only with its words. @param {number} from */
const ids = (from) => { let n = from; return () => `01JEAN${[...(n++).toString(32)].map((digit) => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[parseInt(digit, 32)]).join('').padStart(20, '0')}` }
/** When the creation's records say they were written: a moment apart, in order. @param {number} step */
const at = (step) => Date.parse('2026-01-01T09:00:00.000Z') + step * 60_000

/**
 * How a prototype's pages lead on, read from its files as pressing through them finds it (caps/prototypes/press.js),
 * its links and its forms alone: each page reached from the first, where each leads, the page and the control that
 * first led to each, and the address it was reached at, a form's fields as it sends them.
 * @param {Record<string, string>} files @returns {import('../app/caps/prototypes/check.js').Flow}
 */
export function flowOf (files) {
  const pages = Object.keys(files).filter((path) => path.endsWith('.html')), reached = ['index.html'], leads = /** @type {[string, string[]][]} */ ([])
  /** @type {Record<string, string>} */ const at = {}
  /** @type {Record<string, [string, string]>} */ const by = {}
  let followed = 0, pressed = 0
  /** A control's name as pressing through says it: its label, else the first of its words. @param {import('../app/caps/sites/html.js').Element | string} node @returns {string} */
  const said = (node) => (typeof node === 'string' ? node.trim() : node.attrs['aria-label'] ?? (node.attrs['aria-hidden'] === 'true' ? '' : node.children.map(said).find(Boolean) ?? ''))
  for (let i = 0; i < reached.length; i++) {
    const page = reached[i], to = /** @type {string[]} */ ([]), all = elements(parse(files[page]))
    for (const control of all.filter((element) => (element.name === 'a' && element.attrs.href) || (element.name === 'form' && element.attrs.action))) {
      const form = control.name === 'form', inside = form ? elements(control) : []
      const sent = new URLSearchParams(inside.filter((field) => field.name === 'input' && field.attrs.name && (field.attrs.type !== 'radio' || 'checked' in field.attrs)).map((field) => [field.attrs.name, field.attrs.value ?? '']))
      const [path, search = `${sent}`] = (form ? control.attrs.action : control.attrs.href).split('?')
      if (!pages.includes(path) || path === page) continue
      form ? pressed++ : followed++
      if (!to.includes(path)) to.push(path)
      if (reached.includes(path)) continue
      reached.push(path)
      by[path] = [page, said(form ? inside.find((field) => field.name === 'button') ?? '' : control).replace(/\s+/g, ' ').slice(0, 40)]
      if (search) at[path] = `?${search}`
    }
    leads.push([page, to])
  }
  return { screens: pages, reached, followed, pressed, dead: [], unsure: 0, leads, errors: 0, at, by }
}

/**
 * A whiteboard's files, as a project keeps them, and Jean's change to come: the board `whiteboard` makes of its
 * sections and notes, kept; the notes written since, the person's, on its shelf; then what `whiteboard_change`
 * writes to sort those, which the player brings when its view asks Jean. @param {Board} board @param {string} dir  ltr or rtl
 */
function boardFiles (board, dir) {
  const next = ids(1), id = next(), first = made({ name: board.name, areas: board.areas, notes: board.notes })
  const table = { format: 1, id, name: board.name, author: 'jean', created: new Date(at(0)).toISOString(), changed: new Date(at(2)).toISOString(), kind: 'whiteboard', dir, views: [{ id: 'table', type: 'table' }],
    properties: [{ id: 'note', name: 'Note', type: 'text' }, { id: 'area', name: 'Section', type: 'relation', collection: '' }, ...(board.notes.some((note) => note.owner) ? [{ id: 'owner', name: 'Owner', type: 'person' }] : [])] }
  const folder = folderOf(table)
  table.properties[1].collection = folder
  const drawn = stamp([], rowsOf(first, next), { by: 'jean', now: at(1) })
  const waiting = stamp(drawn, board.shelf.map((words) => ({ row: next(), set: { note: words } })), { by: 'user', now: at(2) })
  const lines = [...drawn, ...waiting], rows = fold(lines), laid = layout(rows), named = (/** @type {string} */ words) => notesOf(rows).find((row) => row.cells.note === words)?.id ?? ''
  const asked = changed({ move: board.then.map((one) => ({ note: named(one.note), area: one.area })) }, new Set(notesOf(rows).map((row) => row.id)), laid.areas.map((area) => ({ id: area.row.id, name: String(area.row.cells.note ?? '') })))
  return { folder, files: { 'collection.json': `${JSON.stringify({ ...table, kept: drawn[0].at }, null, 2)}\n`, 'changes.jsonl': stringifyChanges(lines) }, then: editsOf(asked, laid.areas, next) }
}

/**
 * A collection's files, as a project keeps them: the table `table_create` makes of its columns, the person's rows, kept,
 * then Jean's change of them, which waits for the person as the collection opens. @param {Collection} collection
 */
function collectionFiles ({ name, columns, rows, then, why }) {
  const next = ids(1), table = createTable({ name, columns }, { id: next(), author: 'jean', at: new Date(at(0)).toISOString() }), first = table.properties[0]
  /** A row's cells by their columns' ids, each one its column takes. @param {Record<string, string>} cells */
  const set = (cells) => Object.fromEntries(Object.entries(cells).map(([column, value]) => {
    const property = table.properties.find((one) => one.name === column), wrong = property ? checkCell(property, value) : `${name} has no column ${column}`
    if (!property || wrong) throw new Error(`site/creation.js: ${wrong}`)
    return [property.id, value]
  }))
  const kept = stamp([], rows.map((cells) => ({ row: next(), set: set(cells) })), { by: 'user', now: at(1) })
  const rowOf = (/** @type {string} */ named) => fold(kept).find((row) => row.cells[first.id] === named)?.id
  const theirs = stamp(kept, then.map((edit) => ({ row: (edit.row && rowOf(edit.row)) || next(), set: set(edit.set) })), { by: 'jean', now: at(2), why })
  return { folder: folderOf(table), files: { 'collection.json': `${JSON.stringify({ ...table, kept: kept[0].at }, null, 2)}\n`, 'changes.jsonl': stringifyChanges([...kept, ...theirs]) } }
}

/**
 * A collection's files with its own form, as a project keeps them: the table `table_create` makes of its columns, each row as
 * a visitor's reply brought it, the columns its form asks alone, then what the person noted in the others; and the columns
 * the form asks, by their ids, each one Collect replies can ask (caps/collect/form.js), the row's name always. @param {Form} form
 */
function formFiles ({ name, columns, asks, rows }) {
  const next = ids(1), table = createTable({ name, columns }, { id: next(), author: 'jean', at: new Date(at(0)).toISOString() })
  const asked = askable(table).filter((field) => field.title || asks.includes(field.name)), missing = asks.filter((column) => !asked.some((field) => field.name === column))
  if (missing.length || !asks.includes(titleOf(table).name)) throw new Error(`site/creation.js: ${name}'s form can't ask ${missing.join(', ') || 'no row by its name'}`)
  /** A row's cells by their columns' ids, each one its column takes, those the form asks or the others. @param {Record<string, string | boolean>} cells @param {boolean} sent */
  const set = (cells, sent) => Object.fromEntries(Object.entries(cells).filter(([column]) => asks.includes(column) === sent).map(([column, value]) => {
    const property = table.properties.find((one) => one.name === column), wrong = property ? checkCell(property, value) : `${name} has no column ${column}`
    if (!property || wrong) throw new Error(`site/creation.js: ${wrong}`)
    return [property.id, value]
  }))
  const rowIds = rows.map(() => next())
  const came = stamp([], rows.map((cells, i) => ({ row: rowIds[i], set: set(cells, true) })), { by: 'visitor', now: at(1) })
  const noted = stamp(came, rows.map((cells, i) => ({ row: rowIds[i], set: set(cells, false) })).filter((edit) => Object.keys(edit.set).length), { by: 'user', now: at(2) })
  return { folder: folderOf(table), files: { 'collection.json': `${JSON.stringify(table, null, 2)}\n`, 'changes.jsonl': stringifyChanges([...came, ...noted]) }, asks: asked.map((field) => field.id) }
}

/** A design's file, as a project keeps one: what `design` is given, laid out as Jean's first take. @param {Design} design @param {string} lang */
function designFile ({ args }, lang) {
  const read = repair(args, lang)
  if (!read || read.repairs.length) throw new Error(`site/creation.js: the design's arguments need repairing: ${read?.repairs.join(', ')}`)
  const laid = designOf(BOOK, read.facts, { lang, now: new Date(at(0)).toISOString(), by: 'jean' })
  return { path: `designs/${ids(1)()}-${slug(laid.name) || 'design'}.svg`, file: toSvg(laid, []) }
}

/** Where a page's creation is, from the site's root. @param {import('./site.js').Kit} kit @param {string} [page] */
const pathOf = (kit, page = kit.name) => `creations/${page}.${kit.lang}.json`

/**
 * The files a page writes beside itself for the creation its pane shows, by their paths: the creation, and the
 * document that shows one with its code. @param {import('./site.js').Kit} kit @param {Pages | Board | Game | Collection | Doc | Design | Links | Form} creation @param {string} [page]
 */
export function creationFiles (kit, creation, page = kit.name) {
  const { kind, name } = creation, asked = 'asked' in creation ? creation.asked : '', made = new Date(at(0)).toISOString()
  const shown = creation.kind === 'whiteboard' ? { kind, name, asked, ...boardFiles(creation, kit.dir) }
    : creation.kind === 'collection' ? { kind, name, ...collectionFiles(creation) }
    : creation.kind === 'form' ? { kind, name, asked, ...formFiles(creation) }
    : creation.kind === 'document' ? { kind, name, markdown: creation.markdown, held: creation.held }
    : creation.kind === 'design' ? { kind, name, asked, ...designFile(creation, kit.lang) }
    : creation.kind === 'map' ? { kind, name, asked, creations: creation.creations, edges: creation.edges, latest: creation.latest }
    : creation.kind === 'game' ? { kind, path: `games/${ids(1)()}-${page}.game.html`, name, card: creation.card, code: creation.code, meta: { engine: creation.engine, actions: creation.actions.join(' '), author: 'jean', created: made, changed: made } }
    : { kind, path: `${creation.kind}s/${ids(1)()}-${page}`, name, label: creation.label, asked, files: creation.files, ...(creation.look && { look: creation.look }),
      ...(creation.kind === 'prototype' && { shape: creation.shape ?? 'phone', flow: flowOf(creation.files) }) }
  return { 'creation.html': player(kit), ...CODE, [pathOf(kit, page)]: `${JSON.stringify(shown)}\n` }
}

/**
 * The frame that shows it in the page's pane, loaded once it is near, as tall as its kind takes (excel.css).
 * @param {import('./site.js').Kit} kit @param {(Pages | Board | Game | Collection | Doc | Design | Links | Form)['kind']} kind
 * @param {{ page?: string, title?: string }} [creation]  whose creation, and the frame's name, as text
 */
export function creationFrame (kit, kind, { page = kit.name, title = kit.text('pane.title') } = {}) {
  return /* html */ `<iframe class="site-creation is-${kind}" src="${xml(`${kit.site('creation.html')}#${new URLSearchParams({ src: pathOf(kit, page), lang: kit.lang })}&bare`)}" title="${xml(title)}" loading="lazy"></iframe>`
}
