// Tables you keep (D473, D474, D491), collections (D507): a table is a folder of the project's, collections/<ulid>-<slug>/, named once
// and never renamed: its collection.json (./table.js), its columns and views, and its changes.jsonl (./changes.js),
// each change's cells with when and by whom. Any brain reads its rows with table_rows, and finds them with search_files;
// it makes one with table_create and changes it with table_change only if it makes tables right: one in the cloud or a
// plan, never the device's or a local server, which phase 0 measured short of the 80% gate (`passes`). It
// opens beside the conversation in the preview (./view.js), as a table or a board, where the user changes
// it too, and Jean's changes show marked until the user accepts or rejects them (D505). From any task, @ in the box
// lists the project's tables, and the brain knows them from its <tables> section. A document's "/" makes a table
// too, which the document holds where its ```table block names it, drawn there by <app-table> (D494), and so
// does the Creations page (D502), which opens it beside the task. A relation's cells are rows of a collection of the project, this
// one or another, by its place (D560): load() reads those collections and their rows' names, which the view, the brain and the workbook show.
import { signal } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, conversationOf } from '../../ui/state.js'
import { styleSheet } from '../../ui/sheet.js'
import { noteRecord } from '../../core/events.js'
import { isLocal } from '../../core/settings.js'
import { ulid } from '../../core/ulid.js'
import { useStrings, locale, t } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { page, grid, reread as listed } from '../../ui/creations.js'
import { createTable, readTable, folderOf, propertyOf, checkCell, grown, reshape, converted, canonical, PLACE as FOLDER } from './table.js'
import { parseChanges, stringifyChanges, stamp, fold, undo } from './changes.js'
import { query, ordered, valueOf } from './query.js'
import { worked } from './formula.js'
import { exportTable, namesOf, rowNamed } from './export.js'
import { tableCreate, LINE } from './tool.js'

await Promise.all([useStrings('tables'), styleSheet(new URL('tables.css', import.meta.url))])

/** @import { Table, Property } from './table.js' */
/** @import { Line, Change, Row, Edit } from './changes.js' */
/**
 * A table read: its project, its place there, collection.json and changes.jsonl, and its rows; with the collections its relations are
 * to, by their places, and their rows' names, by their ids (D560). @typedef {{ dir: string, folder: string, table: Table, lines: Line[], rows: Row[], related?: Map<string, Loaded>, names?: Map<string, string> }} Loaded
 */

/** Whether a brain makes tables right: not the device's nor a local server's (D491). @param {import('../../core/types.js').BrainConfig} brain */
export const passes = (brain) => !isLocal(brain)
/** How many of the project's tables the brain's <tables> names, and how many rows table_rows gives at most. */
const LISTED = 20
const ROWS = 200

/** The table on show in the preview, which its view draws and the brain hears of. */
export const shown = signal(/** @type {Loaded | null} */ (null))
/** The tables drawn now: the preview's, and those documents hold, each read again as it changes. */
const showing = new Set([shown])
/** The tables blank() made that a document hasn't drawn yet, whose first field then takes the keyboard. */
const fresh = new Set()

/**
 * A table of a project, read, with the collections its relations are to unless `alone`; null when there is none there.
 * @param {string} folder @param {string} [dir] @param {boolean} [alone] @returns {Promise<Loaded | null>}
 */
export async function load(folder, dir = app.projectDir, alone = false) {
  const text = FOLDER.test(folder) && await app.fs.read(`${dir}/${folder}/collection.json`)
  if (!text) return drafts.get(folder) ?? null
  const lines = parseChanges((await app.fs.read(`${dir}/${folder}/changes.jsonl`)) ?? ''), table = readTable(text)
  const one = { dir, folder, table, lines, rows: worked(table, ordered(fold(lines), table.order)) }
  if (alone) return one
  const places = [...new Set(table.properties.flatMap((property) => (property.type === 'relation' && !property.deleted ? [String(property.collection)] : [])))]
  const related = new Map(/** @type {[string, Loaded][]} */ ((await Promise.all(places.map(async (place) => [place, await targetOf(one, place)]))).filter(([, target]) => target)))
  return { ...one, related, names: new Map([...related.values()].flatMap((target) => [...namesOf(target.table, target.rows)])) }
}

/** The places of a project's collections, the latest made first. @param {string} dir */
const folders = async (dir) => (await app.fs.list(`${dir}/collections`)).flatMap(({ kind, name }) => (kind === 'directory' ? [`collections/${name}`] : [])).sort().reverse()
/** The collection a relation is to, read: this one or another of the project's; null once it is gone. @param {Loaded} one @param {string} place */
const targetOf = (one, place) => (place === one.folder ? one : load(place, one.dir, true).catch(() => null))
/** The project's collections by place and name, the latest made first, for a relation to be to one (D560). @param {string} [dir] */
export const collections = async (dir = app.projectDir) => (await Promise.all((await folders(dir)).map((folder) => load(folder, dir, true).catch(() => null))))
  .flatMap((one) => (one ? [{ folder: one.folder, name: one.table.name }] : []))

/** A table drawn read again, wherever it is, after a change here or the brain's, or one refused, and those whose relations are to it. @param {Loaded} one */
export async function reread(one) {
  const fresh = await load(one.folder, one.dir)
  for (const where of showing) {
    const drawn = where.peek(), here = drawn?.dir === one.dir
    if (here && drawn.folder === one.folder) where.value = fresh
    else if (here && drawn.related?.has(one.folder)) where.value = await load(drawn.folder, drawn.dir)
  }
}

/** @param {Loaded} one @param {Table} table */
const writeTable = async (one, table) => { await written(one); await app.fs.write(`${one.dir}/${one.folder}/collection.json`, `${JSON.stringify(table, null, 2)}\n`) }
/** Those the Creations page made, on show but not written until the user changes something in them (D544). @type {Map<string, Loaded>} */
const drafts = new Map()
/** One of them written at last, whole, at the user's first change, and listed among the creations. @param {Loaded} one */
async function written({ folder }) {
  const draft = drafts.get(folder)
  if (!draft) return
  drafts.delete(folder)
  await app.fs.write(`${draft.dir}/${folder}/collection.json`, `${JSON.stringify(draft.table, null, 2)}\n`)
  await app.fs.write(`${draft.dir}/${folder}/changes.jsonl`, stringifyChanges(draft.lines))
  listed()
}

/**
 * A change, by the user or the brain: each cell checked against its column, a row without an id made, the
 * choices a select doesn't have yet added to it, and its lines written after the others. Throws what is
 * wrong, in words a brain reads; the user's is a step to undo (D620). @param {Loaded} one @param {{ row?: string, set?: Record<string, unknown>, delete?: boolean }[]} edits
 * @param {string} by @param {string} [why] @param {boolean} [undoable] @returns {Promise<string[]>} the rows', in order
 */
export async function change(one, edits, by, why, undoable = by === 'user') {
  const { table } = one
  // New rows' ids in order, so that rows made in one change keep the order they came in.
  const ids = edits.filter((edit) => !edit.row).map(() => ulid()).sort()
  const ready = edits.map((edit) => {
    if (edit.row && !one.lines.some((line) => 'row' in line && line.row === edit.row)) throw new Error(`${table.name} has no row ${edit.row}: leave out a new row's id.`)
    const set = Object.fromEntries(Object.entries(edit.set ?? {}).map(([ref, value]) => {
      const property = propertyOf(table, ref)
      if (!property || property.deleted) throw new Error(`${table.name} has no column "${ref}": its columns are ${table.properties.filter((one) => !one.deleted).map((one) => one.name).join(', ')}.`)
      // A relation's row by its id or its name (D560).
      const target = property.type === 'relation' && value !== null ? one.related?.get(String(property.collection)) : undefined
      const cell = target ? rowNamed(target.rows, one.names ?? new Map(), value) : value
      const wrong = cell === undefined ? `${property.name} takes a row of ${target?.table.name}, by its name or its id: ${JSON.stringify(value)} names none, or more than one.` : checkCell(property, cell)
      if (wrong) throw new Error(wrong)
      return [property.id, cell]
    }))
    return { row: edit.row || /** @type {string} */ (ids.shift()), ...(Object.keys(set).length && { set }), ...(edit.delete !== undefined && { delete: Boolean(edit.delete) }) }
  }).filter((edit) => edit.set || edit.delete !== undefined)
  if (!ready.length) return []
  const lines = stamp(one.lines, ready, { by, why })
  const more = grown(table, ready.map((edit) => edit.set ?? {}), lines[0].at)
  await written(one)
  if (more) await writeTable(one, more)
  await app.fs.append(`${one.dir}/${one.folder}/changes.jsonl`, stringifyChanges(lines))
  // Undone, a row made goes, one deleted comes back and each cell set is as it was.
  const was = new Map(fold(one.lines, { deleted: true }).map((row) => [row.id, row]))
  if (undoable) did(one, { forth: ready, back: ready.map(({ row, set, delete: gone }) => ((before) => (before ? { row, ...(set && { set: Object.fromEntries(Object.keys(set).map((id) => [id, before.cells[id] ?? null])) }),
    ...(gone !== undefined && { delete: Boolean(before.deleted) }) } : { row, delete: true }))(was.get(row))) })
  await reread(one)
  return ready.map((edit) => edit.row)
}

/**
 * What the user did to each collection in this visit, by its place, to undo with ⌘Z and do again with ⇧⌘Z (D620): each step's cells and rows
 * as they were and as it left them, and its collection.json before and after it. @typedef {{ back?: Edit[], forth?: Edit[], before?: Table, after?: Table }} Step
 * @type {Map<string, { done: Step[], undone: Step[] }>}
 */
const steps = new Map()
/** @param {Loaded} one @param {Step} step */
const did = (one, step) => steps.set(one.folder, { done: [...(steps.get(one.folder)?.done ?? []).slice(-99), step], undone: [] })
/**
 * The user's last step on a collection undone, or the last one undone done again, as a change of the user's own: its name, columns, views and
 * rows' order as they were, then its cells, but for one changed since, which stays as it is. @param {Loaded} one @param {boolean} [again]
 */
export const undoStep = (one, again = false) => (reshaping = reshaping.catch(() => {}).then(async () => {
  const all = steps.get(one.folder), step = all?.[again ? 'undone' : 'done'].pop(), was = (await load(one.folder, one.dir)) ?? one
  if (!all || !step) return
  all[again ? 'done' : 'undone'].push(step)
  const [table, edits, from] = again ? [step.after, step.forth, step.back] : [step.before, step.back, step.forth], { name, properties, views, order } = table ?? was.table
  if (table) await writeTable(was, { ...was.table, name, properties, views, order, changed: new Date().toISOString() })
  const now = table ? (await load(was.folder, was.dir)) ?? was : was, cells = new Map(now.rows.map((row) => [row.id, row.cells]))
  if (edits) await change(now, edits.map((edit, i) => ({ ...edit, ...(edit.set && { set: Object.fromEntries(Object.entries(edit.set).filter(([id]) => canonical(cells.get(edit.row)?.[id] ?? null) === canonical(from?.[i].set?.[id] ?? null))) }) })), 'user', undefined, false)
  await reread(now)
}))

/** The changes to tables' names and columns, one after the other, so that none is made on a collection.json another is changing. */
let reshaping = /** @type {Promise<unknown>} */ (Promise.resolve())
/**
 * The user renames a table, adds, renames or takes away a column, or puts its rows in an order, in its view (D494, D547), on its
 * collection.json as it is by then, a step to undo unless it is part of another. @param {Loaded} one @param {Parameters<typeof reshape>[1]} edit @param {boolean} [undoable]
 */
export const reshapeTable = (one, edit, undoable = true) => /** @type {Promise<Table>} as it is now */ (reshaping = reshaping.catch(() => {}).then(async () => {
  const now = (await load(one.folder, one.dir)) ?? one, table = reshape(now.table, edit, new Date().toISOString())
  await writeTable(now, table)
  if (undoable) did(now, { before: now.table, after: table })
  await reread(now)
  return table
}))

/**
 * A column the user makes another kind (D547), or a relation to a `collection` (D560): each cell with a value of that kind written as one, by
 * the user, a relation's the row of that name, and the choices among them added; one with none stays as it was, unseen, to come back if the
 * kind does. @param {Loaded} one @param {string} id @param {string} type @param {string} [collection]
 */
export const retype = (one, id, type, collection) => (reshaping = reshaping.catch(() => {}).then(async () => {
  const now = (await load(one.folder, one.dir)) ?? one, at = new Date().toISOString(), table = reshape(now.table, { retype: { id, type, collection } }, at)
  const [was, is] = [now.table, table].map((each) => /** @type {Property} */ (each.properties.find((property) => property.id === id)))
  const target = is.type === 'relation' && await targetOf(now, String(is.collection)), names = target ? namesOf(target.table, target.rows) : new Map()
  const values = now.rows.map((row) => converted(is, valueOf(row, was, now.names), target ? (name) => rowNamed(target.rows, names, name) : undefined))
  const edits = now.rows.flatMap((row, i) => (values[i] === undefined || canonical(values[i]) === canonical(row.cells[id] ?? null) ? [] : [{ row: row.id, set: { [id]: values[i] } }]))
  const after = grown(table, values.map((value, i) => ({ [id]: value ?? now.rows[i].cells[id] })), at) ?? table
  await writeTable(now, after)
  if (edits.length) await app.fs.append(`${now.dir}/${now.folder}/changes.jsonl`, stringifyChanges(stamp(now.lines, edits, { by: 'user' })))
  did(now, { before: now.table, after, forth: edits, back: edits.map(({ row }) => ({ row, set: { [id]: now.rows.find((one) => one.id === row)?.cells[id] ?? null } })) })
  await reread(now)
}))

/** A table made with its files, and the rows given, as the user's. @param {Table} table @param {{ row: string, set: Record<string, unknown> }[]} [rows] */
async function made(table, rows = []) {
  const one = { dir: app.projectDir, folder: folderOf(table), table, lines: [], rows: [] }
  await writeTable(one, table)
  await app.fs.write(`${one.dir}/${one.folder}/changes.jsonl`, stringifyChanges(stamp([], rows, { by: 'user' })))
  return (await load(one.folder)) ?? one
}

/** A collection pinned or renamed from the Creations page (D544), as its view renames it. @param {{ path: string }} item @param {{ pinned?: boolean, name?: string }} edit */
const amend = ({ path }, { pinned, name }) => (reshaping = reshaping.catch(() => {}).then(async () => {
  const one = await load(path)
  if (!one) return
  const { pinned: was, ...table } = name ? reshape(one.table, { name }, new Date().toISOString()) : one.table
  await writeTable(one, { ...table, ...((pinned ?? was) && { pinned: true }) })
  await reread(one)
}))
/**
 * table_create's columns, a relation's collection named by its place, or by its name, this new one's among them, as its place (D564).
 * @param {any} args @param {string} id the new table's
 */
async function placed(args, id) {
  const all = [{ folder: folderOf({ id, name: String(args?.name ?? '').trim() }), name: String(args?.name ?? '') }, ...await collections()], key = (/** @type {unknown} */ name) => String(name ?? '').trim().toLocaleLowerCase()
  const to = (/** @type {any} */ column) => all.find(({ folder, name }) => folder === column.collection || key(name) === key(column.collection))?.folder ?? column.collection
  return Array.isArray(args?.columns) ? { ...args, columns: args.columns.map((/** @type {any} */ column) => (column?.type === 'relation' ? { ...column, collection: to(column) } : column)) } : args
}

/** A copy, the user's, by the name given, with its rows as they are. @param {{ path: string }} item @param {string} name */
async function copy({ path }, name) {
  const one = await load(path), now = new Date().toISOString()
  if (!one) throw new Error(`There is no collection ${path}.`)
  const { pinned, kept, ...table } = one.table, id = ulid()
  // Its relations to itself are to the copy, whose rows keep their ids (D560).
  const properties = table.properties.map((property) => (property.collection === path ? { ...property, collection: folderOf({ id, name }) } : property))
  return (await made({ ...table, properties, id, name, author: 'user', created: now, changed: now }, one.rows.filter((row) => !row.deleted).map((row) => ({ row: row.id, set: row.cells })))).folder
}

/** The user's new table: a column for each row's name and one empty row. */
const untitled = () => createTable({ name: t('tables.untitled'), columns: [{ name: t('tables.nameColumn'), type: 'text' }] }, { id: ulid(), author: 'user', at: new Date().toISOString() })
const empty = () => made(untitled(), [{ row: ulid(), set: {} }])
/** One from a document's "/" (D494), its place for the document to hold. */
export async function blank() {
  const { folder } = await empty()
  fresh.add(folder)
  return folder
}
/** One from the Creations page (D502), beside the task, its name taking the keyboard, written once the user changes it (D544). */
async function fromPage() {
  const table = untitled(), lines = stamp([], [{ row: ulid(), set: {} }], { by: 'user' }), one = { dir: app.projectDir, folder: folderOf(table), table, lines, rows: fold(lines) }
  drafts.set(one.folder, one)
  await open(one)
  requestAnimationFrame(() => /** @type {HTMLInputElement | null} */ (document.querySelector('app-preview .table-name'))?.select())
}

/** Jean's changes the user hasn't accepted or rejected, the latest last. @param {Loaded} one @returns {Change[]} */
export function unkept(one) {
  const undone = new Set(one.lines.flatMap((line) => ('undoes' in line && line.undoes ? [line.undoes] : [])))
  return /** @type {Change[]} */ (one.lines.filter((line) => 'row' in line && line.by === 'jean' && !line.undoes && line.at > (one.table.kept ?? '') && !undone.has(line.at)))
}

/** The user accepts Jean's changes: they show as the user's own from now on. @param {Loaded} one */
export async function accept(one) {
  const at = unkept(one).at(-1)?.at
  if (at) await writeTable(one, { ...one.table, kept: at })
  await reread(one)
}

/** The user rejects Jean's changes, the latest first; a cell the user changed since stays as it is. @param {Loaded} one */
export async function reject(one) {
  let lines = one.lines
  /** @type {Line[]} */
  const back = []
  for (let n = new Set(unkept(one).map((line) => line.at)).size; n > 0; n--) {
    const done = undo(lines, { author: 'jean', by: 'user' })
    if (!done) break
    lines = [...lines, ...done.lines]
    back.push(...done.lines)
  }
  if (back.length) await app.fs.append(`${one.dir}/${one.folder}/changes.jsonl`, stringifyChanges(back))
  await reread(one)
}

/** A table as a workbook, for the preview's Download: its rows as its view shows them. @param {string} folder */
export async function workbook(folder) {
  const one = await load(folder)
  return one && exportTable(one.table, one.rows, 'xlsx', { names: one.names })
}

/**
 * The tables a project keeps (the open one's unless named), the latest made first, with their columns' names and a line for each row as text (what search_files reads),
 * how to open them, and their first four columns' heads and six rows for a card (`grid`), read again each time as documents are. @param {string} [dir] the project's
 */
export async function kept(dir = app.projectDir) {
  const all = await Promise.all((await folders(dir)).map((folder) => load(folder, dir).catch(() => null)))
  const cell = (/** @type {unknown} */ value) => (Array.isArray(value) ? value.join(', ') : value === true ? '✓' : value === false || value == null ? '' : String(value))
  return all.flatMap((one) => (one ? [{ path: one.folder, name: one.table.name, changed: one.lines.reduce((latest, line) => ('at' in line && line.at > latest ? line.at : latest), one.table.changed), created: one.table.created, pinned: one.table.pinned === true,
    grid: ((heads) => [heads.map((property) => property.name), ...one.rows.slice(0, 6).map((row) => heads.map((property) => cell(property.type === 'relation' ? valueOf(row, property, one.names) : row.cells[property.id])))])(one.table.properties.filter((property) => !property.deleted).slice(0, 4)),
    link: /** @type {import('../../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: one.folder, name: one.table.name, title: one.table.name }), text: ((columns) => [columns.map((property) => property.name).join(', '), ...one.rows.map((row) => columns.flatMap((property) => {
      const value = cell(property.type === 'relation' ? valueOf(row, property, one.names) : row.cells[property.id])
      return value ? [`${property.name}: ${value}`] : []
    }).join('; '))].join('\n'))(one.table.properties.filter((property) => !property.deleted)) }] : []))
}

/** What the preview's address names: a table by its name, a workbook once it downloads. @param {string} folder */
export async function metaOf(folder) {
  const one = await load(folder).catch(() => null)
  return one ? { name: one.table.name, title: one.table.name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } : null
}

/**
 * A table's view, for the preview (ui/preview.js): its box, drawn from the table on show, let go with the view.
 * @param {{ uri: string }} file @param {(() => void)[]} holds
 */
export async function editor(file, holds) {
  const one = await load(file.uri)
  if (!one) return null
  shown.value = one
  const { view } = await import('./view.js')
  const box = view(holds)
  holds.push(() => { if (shown.peek()?.folder === one.folder) shown.value = null })
  return box
}

/** A table, in the preview beside the conversation, once it is on show. @param {Loaded} one */
async function open(one) {
  if (shown.peek()?.folder === one.folder) return
  const meta = await metaOf(one.folder)
  ;(await import('../../ui/preview.js')).preview({ uri: one.folder, name: meta?.name ?? one.table.name, title: one.table.name })
  for (let wait = 0; wait < 100 && shown.peek()?.folder !== one.folder; wait++) await new Promise((resolve) => setTimeout(resolve, 50))
}

/** Its columns, as the brain reads them: each name, its kind, a select's choices or a status's steps, and a relation's collection. @param {Loaded} one */
const columnsOf = ({ table, related }) => table.properties.filter((property) => !property.deleted)
  .map((property) => `${property.name} (${property.type}${property.options?.length ? `: ${property.options.map((option) => option.name).join(', ')}` : ''}${property.type === 'relation'
    ? ` to a row of ${related?.get(String(property.collection))?.table.name ?? 'a collection deleted'}, by its name` : ''})`).join(', ')

/** A table the brain names by its place; throws with the project's tables when there is none. @param {unknown} folder */
async function named(folder) {
  const one = await load(String(folder ?? '')).catch(() => null)
  if (one) return one
  const all = (await kept()).map((table) => `${table.name}: ${table.path}`)
  throw new Error(`There is no table ${folder}.${all.length ? ` The project's tables: ${all.join('; ')}.` : ' Make one with table_create.'}`)
}

/** A brain that doesn't make tables right is told so, and the call does nothing (D491). @param {import('../../core/loop.js').ToolContext} ctx */
function refuse(ctx) {
  if (!passes(ctx.brain)) throw new Error('Tables need a brain in the cloud or a plan: the brain answering now doesn\'t make them reliably yet. Say so to the user.')
}

/** Whether the call's task is the one on screen, where a table opens. @param {import('../../core/loop.js').ToolContext} ctx */
const here = (ctx) => conversationOf(ctx.signal)?.path === app.current.peek()?.path

/** @type {import('../../core/loop.js').Tool} */
const createTool = {
  spec: tableCreate(locale.peek()),
  kind: 'edit',
  for: passes,
  title: (args) => `Table ${args?.name ?? ''}`,
  run: async (args, ctx) => {
    refuse(ctx)
    const id = ulid(), one = await made(createTable(await placed(args, id), { id, author: 'jean', at: new Date().toISOString() }))
    if (here(ctx)) await open(one)
    return `Made ${one.table.name}, at ${one.folder}, open beside the conversation, with no rows yet: add them with table_change. Its columns: ${columnsOf(one)}.`
  },
}

/** @type {import('../../core/loop.js').Tool} */
const rowsTool = {
  spec: {
    name: 'table_rows',
    description: 'Read the rows of a table the user keeps, each with its id, which table_change needs. A filter keeps some: { property, op, value }, op being is, is-not, contains, is-empty, greater-than or less-than.',
    parameters: { type: 'object', required: ['table'], properties: { table: { type: 'string', description: 'Its place, as table_create gave it' }, filter: { type: 'object' } } },
  },
  kind: 'read',
  title: (args) => `Read ${args?.table ?? ''}`,
  run: async (args, ctx) => {
    const one = await named(args?.table)
    const { rows } = query(one.table, one.rows, { ...(args?.filter && { filter: args.filter }), locale: locale.peek(), names: one.names })
    const columns = one.table.properties.filter((property) => !property.deleted)
    if (here(ctx)) await open(one)
    const lines = rows.slice(0, ROWS).map((row) => JSON.stringify({ row: row.id, ...Object.fromEntries(columns.flatMap((property) => (row.cells[property.id] === undefined ? []
      : [[property.name, property.type === 'relation' ? valueOf(row, property, one.names) : row.cells[property.id]]]))) }))
    return `${one.table.name} (${one.folder}): ${rows.length} of its ${one.rows.length} rows. Its columns: ${columnsOf(one)}.\n${lines.join('\n')}${rows.length > ROWS ? `\nand ${rows.length - ROWS} more: filter them.` : ''}`
  },
}

/** @type {import('../../core/loop.js').Tool} */
const changeTool = {
  spec: {
    name: 'table_change',
    description: 'Add or change rows of a table the user keeps: set each cell by its column\'s name; a row without its id is a new one; delete: true removes a row. The user sees each change, to accept or reject.',
    parameters: { type: 'object', required: ['table', 'rows'], properties: {
      table: { type: 'string', description: 'Its place, as table_create gave it' },
      rows: { type: 'array', items: { type: 'object', properties: { row: { type: 'string' }, set: { type: 'object' }, delete: { type: 'boolean' } } } },
      why: { type: 'string', description: 'What it comes from, in a few words, e.g. "the email of 23 October"' },
    } },
  },
  kind: 'edit',
  for: passes,
  title: (args) => `Change ${args?.table ?? ''}`,
  run: async (args, ctx) => {
    refuse(ctx)
    const one = await named(args?.table)
    const ids = await change(one, Array.isArray(args?.rows) ? args.rows : [], 'jean', typeof args?.why === 'string' ? args.why : undefined)
    if (here(ctx)) await open(one)
    return ids.length ? `Changed ${ids.length} rows of ${one.table.name}, beside the conversation for the user to accept or reject: ${ids.join(', ')}.` : 'Nothing changed: give each row a set or delete.'
  },
}

/**
 * The note a message comes with while a table is on show and the brain hasn't heard of it as it is now:
 * its place, its columns and how many rows it has, or the user changed.
 * @param {import('../../core/types.js').Envelope[]} records
 */
function notes(records) {
  const one = shown.peek()
  if (!one) return []
  const text = `The table ${one.table.name} (${one.folder}) is open beside the conversation: ${one.rows.length} rows. Its columns: ${columnsOf(one)}. Read its rows with table_rows.`
  const last = records.findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data.kind === 'table')
  return last?.update?.sessionUpdate === '_system_note' && last.update.text === text ? [] : [noteRecord(text, { kind: 'table', uri: one.folder })]
}

// A table a document holds, where its ```table block names it (D494): its view, its name to change; the place itself when there is no such table.
// Another place is another element (drawn.js keys it by its place).
customElements.define('app-table', class extends HTMLElement {
  /** @type {(() => void)[]} */
  holds = []

  async connectedCallback() {
    const [holds, folder] = [this.holds, this.getAttribute('folder') ?? '']
    const [one, { view }] = await Promise.all([load(folder).catch(() => null), import('./view.js')])
    if (holds !== this.holds || !this.isConnected) return
    if (!one) return void (this.textContent = folder)
    const where = signal(/** @type {Loaded | null} */ (one))
    showing.add(where)
    holds.push(() => showing.delete(where))
    this.replaceChildren(view(holds, where))
    // Its heads stay at the top of what the document shows while its rows pass under it (D547): they stick in the table's own box,
    // which scrolls sideways, and are lifted down as far as the view the document scrolls in starts below the box's top, never past its last row.
    const lift = (/** @type {Event} */ event) => {
      const view = event.target instanceof Element ? event.target : null, box = /** @type {HTMLElement | null} */ (this.querySelector('.table-scroll'))
      if (view && !view.contains(this)) return
      const { top = 0, height = 0 } = box?.getBoundingClientRect() ?? {}
      box?.style.setProperty('--lift', `${Math.max(0, Math.min((view?.getBoundingClientRect().top ?? 0) - top, height - (this.querySelector('thead')?.getBoundingClientRect().height ?? 0)))}px`)
    }
    document.addEventListener('scroll', lift, { capture: true, passive: true })
    holds.push(() => document.removeEventListener('scroll', lift, { capture: true }))
    // One just made from a document's "/" takes the keyboard in its first row's name.
    if (fresh.delete(folder)) /** @type {HTMLInputElement | null} */ (this.querySelector('td input'))?.focus()
  }

  disconnectedCallback() {
    for (const hold of this.holds) hold()
    this.holds = []
  }
})

register({
  id: 'tables',
  tools: [createTool, rowsTool, changeTool],
  lines: [LINE],
  // The project's tables, the latest made first, by name and place, which a relation of table_create's names (D564).
  sections: async () => {
    const all = (await kept()).map(({ path, name }) => `- ${name}: ${path}`)
    return all.length ? { tables: ['A relation column of table_create names one of these in collection, its place or name; each of its cells is then a row of it, set by its name.',
      ...all.slice(0, LISTED), ...(all.length > LISTED ? [`- and ${all.length - LISTED} older ones`] : [])].join('\n') } : {}
  },
  slots: { modes: { at: 10, draw: () => null, notes }, creations: { id: 'tables', at: 2, draw: () => icons.table, kept, mention: 'table', preview: (/** @type {{ grid: string[][] }} */ item) => grid(item.grid), make: fromPage,
    // Dragged into a document, its view there (D494, D573).
    held: (/** @type {{ path: string }} */ { path }) => `\`\`\`table\n${path}\n\`\`\``,
    pin: (/** @type {{ path: string }} */ item, /** @type {boolean} */ pinned) => amend(item, { pinned }), rename: (/** @type {{ path: string }} */ item, /** @type {string} */ name) => amend(item, { name }), copy,
    remove: (/** @type {{ path: string }} */ { path }) => app.fs.remove(`${app.projectDir}/${path}`) }, main: page },
})
