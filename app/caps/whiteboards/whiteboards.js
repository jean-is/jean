// SPDX-License-Identifier: MIT
// Whiteboards (D747): notes that people and Jean think with, in named sections, on one board the same for everyone. A whiteboard is a
// collection of its own kind, Tables' engine underneath (../tables/tables.js): its notes, sections, texts and drawn lines are rows of
// collections/<ulid>-<slug>/, which merge cell by cell through Sync and Together, undo a step at a time, and show Jean's changes until
// they are accepted or rejected (D505). So this unlocks Tables, and policy denying Tables denies it too. Here: its two tools, which only
// brains that make tables right have (D491), the note a message comes with for one beside the task, what is selected on it, its
// creations, how it is on show in the address, and its view beside the conversation (./view.js). Every brain reads one with table_rows.
import { html, svg, nothing } from 'lit-html'
import { signal, effect, untracked } from '@preact/signals-core'
import { register, unlock } from '../../ui/caps.js'
import { keep } from '../../ui/windows.js'
import { app, conversationOf } from '../../ui/state.js'
import { styleSheet } from '../../ui/sheet.js'
import { noteRecord } from '../../core/events.js'
import { ulid } from '../../core/ulid.js'
import { useStrings, t } from '../../core/i18n.js'
import { icon, icons } from '../../ui/icons.js'
import { reread as listed } from '../../ui/creations.js'
import { folderOf, notesOf, propertyOf } from '../tables/table.js'
import { stamp, fold } from '../tables/changes.js'
import { soFar } from '../charts/option.js'
import { layout, HUES } from './layout.js'
import { LINES, WHITEBOARD, WHITEBOARD_CHANGE, made, changed, rowsOf, editsOf } from './tool.js'

if (!(await unlock('tables'))) throw new Error('Whiteboards need Tables, which are turned off.')
const tables = await import('../tables/tables.js')
await Promise.all([useStrings('whiteboards'), styleSheet(new URL('whiteboards.css', import.meta.url))])

/** @typedef {import('../tables/tables.js').Loaded} Loaded */

/** A board with notes on it. */
export const glyph = icon(svg`<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M6.5 7.5h4v4h-4zM13.5 7.5h4v4h-4zM6.5 14h4"/>`)
/** The whiteboards drawn beside the task, which the brain hears of; what is selected on one; and how the one on show is shown, which the address keeps. */
export const beside = new Set(/** @type {import('@preact/signals-core').Signal<Loaded | null>[]} */ ([]))
export const picked = signal(/** @type {{ folder: string, rows: string[] } | null} */ (null))
export const showAs = signal(/** @type {'board' | 'lanes' | 'table'} */ ('board')), showOnly = signal('')
keep('whiteboard', {
  get: () => (showAs.value === 'board' ? null : showAs.value === 'table' && showOnly.value ? `table/${showOnly.value}` : showAs.value),
  set: (state) => { const [as, only = ''] = (state ?? '').split('/'); showAs.value = as === 'lanes' || as === 'table' ? as : 'board'; showOnly.value = as === 'table' ? only : '' },
})

/**
 * A new whiteboard's collection.json, in the direction of the language it is made in: its notes' words, and the section each is in, a
 * relation to itself; with a person and a date column where its notes have owners or dates. @param {string} name @param {string} author @param {boolean} [dated] @param {string} [id]
 * @returns {import('../tables/table.js').Table}
 */
function boardOf(name, author, dated = false, id = ulid()) {
  const at = new Date().toISOString(), folder = folderOf({ id, name })
  return { format: 1, id, name, author, created: at, changed: at, kind: 'whiteboard', dir: document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr', views: [{ id: 'table', type: 'table' }],
    properties: [{ id: 'note', name: t('whiteboards.note'), type: 'text' }, { id: 'area', name: t('whiteboards.section'), type: 'relation', collection: folder },
      ...(dated ? /** @type {const} */ ([{ id: 'owner', name: t('whiteboards.owner'), type: 'person' }, { id: 'due', name: t('whiteboards.due'), type: 'date' }]) : [])] }
}
/** A whiteboard made with its files, empty, and read. @param {import('../tables/table.js').Table} table */
async function write(table) {
  const dir = app.projectDir, folder = folderOf(table)
  await app.fs.write(`${dir}/${folder}/collection.json`, `${JSON.stringify(table, null, 2)}\n`)
  await app.fs.write(`${dir}/${folder}/changes.jsonl`, '')
  listed()
  return /** @type {Loaded} */ (await tables.load(folder))
}

/** An owner and a date where a change gives them, in the person and date columns, which the whiteboard gains first where it has none. @param {Loaded} one @param {{ row: string, set: Record<string, unknown> }[]} edits */
async function columned(one, edits) {
  let now = one
  for (const [key, type] of /** @type {const} */ ([['owner', 'person'], ['due', 'date']])) {
    if (!edits.some((edit) => key in edit.set) || now.table.properties.some((property) => property.type === type && !property.deleted)) continue
    await tables.reshapeTable(now, { add: { name: t(`whiteboards.${key}`), type } }, false)
    now = /** @type {Loaded} */ (await tables.load(now.folder))
  }
  const ids = { owner: now.table.properties.find((property) => property.type === 'person' && !property.deleted)?.id, due: now.table.properties.find((property) => property.type === 'date' && !property.deleted)?.id }
  return { now, edits: edits.map((edit) => ({ ...edit, set: Object.fromEntries(Object.entries(edit.set).map(([key, value]) => [/** @type {Record<string, string | undefined>} */ (ids)[key] ?? key, value])) })) }
}

/** A whiteboard beside the task, once it is on show. @param {Loaded} one */
const open = async (one) => (await import('../../ui/preview.js')).preview({ uri: one.folder, name: one.table.name, title: one.table.name })
/** Whether the call's task is the one on screen, where a whiteboard opens. @param {import('../../core/loop.js').ToolContext} ctx */
const here = (ctx) => conversationOf(ctx.signal)?.path === app.current.peek()?.path
/** A brain that doesn't make tables right is told so (D491). @param {import('../../core/loop.js').ToolContext} ctx */
const refuse = (ctx) => { if (!tables.passes(ctx.brain)) throw new Error('Whiteboards need a brain in the cloud or a plan: the brain answering now doesn\'t make them reliably yet. Say so to the user.') }
/** The whiteboard a brain names by its place. @param {unknown} folder */
async function named(folder) {
  const one = await tables.load(String(folder ?? '')).catch(() => null)
  if (!one?.table.kind) throw new Error(`There is no whiteboard ${folder}.${one ? ' It is a table: change it with table_change.' : ''}`)
  return one
}

/**
 * The whiteboard being written, shown as the call that makes it comes (D747): its sections first, then each note, Jean's until accepted, at
 * the place the call will keep it, whose rows keep their ids; never written before the call runs, and gone if the turn ends before it does.
 * @type {{ task: string, name: string, id: string, ids: string[] } | null}
 */
let draft = null, wrote = -1
/** Ids taken in order from a draft's, the same each time. @param {string[]} ids */
const from = (ids) => { let i = 0; return () => ids[i++] ?? ulid() }
/** The folder of the whiteboard being written, which nobody changes meanwhile. */
export const writing = signal('')
/** What the call holds so far, as text: its name, its sections, and the notes whose words have come. @param {string} raw */
async function drafted(raw) {
  const args = JSON.parse(soFar(raw) || '{}'), name = String(args.name ?? '').trim(), task = app.current.peek()?.path ?? '', text = (/** @type {unknown} */ value) => (typeof value === 'string' ? value.trim() : '')
  const areas = [...new Set((Array.isArray(args.areas) ? args.areas : []).map(text).filter(Boolean))]
  /** @type {{ words: string, area: string }[]} */
  const notes = (Array.isArray(args.notes) ? args.notes : []).map((/** @type {any} */ note) => ({ words: text(note?.words), area: areas.includes(text(note?.area)) ? text(note.area) : areas[0] }))
  const written = notes.filter((note) => note.words && note.area)
  if (!name || !areas.length) return
  const fresh = draft?.task !== task || draft.name !== name
  if (fresh) draft = { task, name, id: ulid(), ids: Array.from({ length: 800 }, () => ulid()).sort() }
  const table = boardOf(name, 'jean', false, /** @type {NonNullable<typeof draft>} */ (draft).id), lines = stamp([], rowsOf({ name, areas, notes: written }, from(/** @type {NonNullable<typeof draft>} */ (draft).ids)), { by: 'jean' })
  const one = /** @type {Loaded} */ ({ dir: app.projectDir, folder: folderOf(table), table, lines, rows: fold(lines) })
  tables.drafted(one.folder, one)
  writing.value = one.folder
  await (fresh ? open(one) : tables.reread(one))
}
// The board fills as the call comes; a turn that ends before the call ran leaves nothing of it.
effect(() => {
  const live = /** @type {any} */ (app.live.value), call = live?.turn.steps.at(-1)?.tools.find((/** @type {any} */ tool) => tool._meta?.writing?.name === WHITEBOARD.name)?._meta.writing
  untracked(() => {
    if (call && call.args.length !== wrote) (wrote = call.args.length), drafted(call.args).catch(console.warn)
    else if (!live && draft) {
      const folder = writing.peek()
      ;(draft = null), (wrote = -1), tables.drafted(folder), (writing.value = '')
      import('../../ui/preview.js').then(({ unshow }) => unshow(folder))
    }
  })
})

/** @type {import('../../core/loop.js').Tool} */
const makeTool = {
  spec: WHITEBOARD,
  kind: 'edit',
  for: tables.passes,
  title: (args) => `Whiteboard ${args?.name ?? ''}`,
  run: async (args, ctx) => {
    refuse(ctx)
    // Written where its draft showed, its rows with the ids they had there.
    const board = made(args), was = draft?.name === board.name ? draft : null
    if (was) (draft = null), tables.drafted(writing.peek()), (writing.value = '')
    const one = await write(boardOf(board.name, 'jean', board.notes.some((note) => note.owner || note.due), was?.id))
    await tables.change(one, rowsOf(board, was ? from(was.ids) : ulid), 'jean', undefined, false, true)
    if (here(ctx)) await open(one)
    return `Made ${one.table.name}, at ${one.folder}, open beside the conversation: ${board.areas.length} areas, ${board.notes.length} notes. Read them with their ids with table_rows.`
  },
}

/** @type {import('../../core/loop.js').Tool} */
const changeTool = {
  spec: WHITEBOARD_CHANGE,
  kind: 'edit',
  for: tables.passes,
  title: (args) => `Change ${args?.whiteboard ?? ''}`,
  run: async (args, ctx) => {
    refuse(ctx)
    const one = await named(args?.whiteboard), laid = layout(one.rows)
    ctx.meta.read = one.folder
    const asked = changed(args, new Set(notesOf(one.rows).map((row) => row.id)), laid.areas.map((area) => ({ id: area.row.id, name: String(area.row.cells.note ?? '') })))
    const { now, edits } = await columned(one, editsOf(asked, laid.areas, ulid))
    await tables.change(now, edits, 'jean', typeof args?.why === 'string' ? args.why : undefined, false, true)
    if (here(ctx)) await open(now)
    return `Changed ${one.table.name}, beside the conversation for the user to accept or reject: ${asked.move.length} moved, ${asked.add.length} added, ${asked.rename.length} renamed${asked.made.length ? `, and the areas ${asked.made.join(', ')} made` : ''}.`
  },
}

/**
 * The notes a message comes with: each whiteboard beside the task the brain hasn't heard of as it is now, and what is selected on one, by
 * ids alone, never its words, which come from table_rows and count as from elsewhere where others write in it (D673, D734).
 * @param {import('../../core/types.js').Envelope[]} records
 */
const notes = (records) => [...new Map([...beside].flatMap((where) => (where.peek() ? [[where.peek()?.folder, /** @type {Loaded} */ (where.peek())]] : []))).values()].flatMap((one) => {
  const { areas, shelf } = layout(one.rows), chosen = picked.peek()?.folder === one.folder ? picked.peek()?.rows ?? [] : []
  const text = `The whiteboard ${one.table.name} (${one.folder}) is open beside the conversation: ${areas.length} areas, ${notesOf(one.rows).length} notes, ${shelf.length} of them waiting on its shelf. Read them with table_rows.${chosen.length
    ? ` The user picked the notes ${chosen.join(', ')}${((ids) => (ids.length ? `, in the areas ${ids.join(', ')}` : ''))([...new Set(chosen.map((id) => one.rows.find((row) => row.id === id)?.cells.area).filter(Boolean))])}: this message is about them.` : ''}`
  // What was picked goes with this message alone.
  if (chosen.length) queueMicrotask(() => { picked.value = null })
  const last = records.findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data.kind === 'whiteboard' && update.data.uri === one.folder)
  return last?.update?.sessionUpdate === '_system_note' && last.update.text === text ? [] : [noteRecord(text, { kind: 'whiteboard', uri: one.folder })]
})

/**
 * What is picked on a whiteboard, in the box as one chip, which a press leaves out, with three ideas about those notes under it, Jean's own
 * words, never a brain's (D743), each put in the box to send or change.
 */
function chip() {
  const one = picked.value, board = [...beside].map((where) => where.value).find((each) => each?.folder === one?.folder)
  if (!one?.rows.length || !board) return nothing
  const put = (/** @type {string} */ text) => { app.draft.value = text; /** @type {HTMLElement | null} */ (document.querySelector('#prompt'))?.focus() }
  return html`<div class="wb-picked"><span class="wb-chip">${glyph}<span dir="auto">${t('whiteboards.picked', { count: one.rows.length, name: board.table.name })}</span>
    <button type="button" class="icon-button subtle" aria-label=${t('whiteboards.unpick')} @click=${() => { picked.value = null }}>${icons.close}</button></span>
    <ul class="starters wb-ideas" aria-label=${t('whiteboards.ideas')}>${['ideaGroup', 'ideaActions', 'ideaSum'].map((key) => html`<li><button type="button" class="starter" dir="auto" @click=${() => put(t(`whiteboards.${key}`))}>${t(`whiteboards.${key}`)}</button></li>`)}</ul></div>`
}

/** The project's whiteboards for the Creations page, the latest made first: each one's sections drawn small, and its words by section, what search_files reads. @param {string} [dir] */
export async function kept(dir = app.projectDir) {
  const all = await Promise.all((await tables.folders(dir)).map((folder) => tables.load(folder, dir, true).catch(() => null)))
  return all.flatMap((one) => {
    if (!one?.table.kind) return []
    const { areas, shelf } = layout(one.rows), words = (/** @type {import('../tables/changes.js').Row[]} */ rows) => rows.map((row) => String(row.cells.note ?? '')).filter(Boolean).join('; ')
    return [{ path: one.folder, name: one.table.name, changed: one.lines.reduce((latest, line) => ('at' in line && line.at > latest ? line.at : latest), one.table.changed), created: one.table.created, pinned: one.table.pinned === true,
      areas: areas.map(({ x, y, w, h, hue }) => ({ x, y, w, h, hue })), link: /** @type {import('../../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: one.folder, name: one.table.name, title: one.table.name }),
      text: [...areas.map((area) => `${area.row.cells.note ?? ''}: ${words(notesOf(one.rows).filter((row) => row.cells.area === area.row.id))}`), words(shelf)].filter(Boolean).join('\n') }]
  })
}
/** A whiteboard's sections, drawn small for its card. @param {{ areas: { x: number, y: number, w: number, h: number, hue: number }[] }} item */
const preview = ({ areas }) => {
  const x = Math.min(0, ...areas.map((one) => one.x)), y = Math.min(0, ...areas.map((one) => one.y)), w = Math.max(1, ...areas.map((one) => one.x + one.w)) - x, h = Math.max(1, ...areas.map((one) => one.y + one.h)) - y
  return html`<svg class="wb-small" viewBox=${`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet">${areas.map((one) => svg`<rect class=${`wb-hue-${one.hue % HUES}`} x=${one.x} y=${one.y} width=${one.w} height=${one.h} rx="24"/>`)}</svg>`
}
/** One from the Creations page, empty, beside the task, its name taking the keys. */
async function fromPage() {
  await open(await write(boardOf(t('whiteboards.untitled'), 'user')))
  requestAnimationFrame(() => /** @type {HTMLInputElement | null} */ (document.querySelector('app-preview .wb-name'))?.select())
}

/** Its view beside the conversation (ui/preview.js, through Tables' editor). @param {{ uri: string }} file @param {(() => void)[]} holds */
export async function editor(file, holds) {
  await import('./view.js')
  holds.push(() => { if (picked.peek()?.folder === file.uri) picked.value = null })
  return html`<app-whiteboard folder=${file.uri}></app-whiteboard>`
}

/** A column of the whiteboard by its id, for the view. @param {Loaded} one @param {string} id */
export const columnOf = (one, id) => propertyOf(one.table, id)

register({
  id: 'whiteboards',
  tools: [makeTool, changeTool],
  lines: LINES,
  slots: { modes: { at: 11, draw: () => null, notes }, box: { at: 1, draw: chip }, creations: { id: 'whiteboards', at: 3, draw: () => glyph, kept, mention: 'whiteboard', preview, make: fromPage, copy: tables.copy,
    pin: (/** @type {{ path: string }} */ item, /** @type {boolean} */ pinned) => tables.amend(item, { pinned }), rename: (/** @type {{ path: string }} */ item, /** @type {string} */ name) => tables.amend(item, { name }),
    remove: (/** @type {{ path: string }} */ { path }) => app.fs.remove(`${app.projectDir}/${path}`) } },
})
