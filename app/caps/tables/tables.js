// SPDX-License-Identifier: MIT
// Tables you keep (D473, D474, D491), collections (D507): a table is a folder of the project's, collections/<ulid>-<slug>/, named once
// and never renamed: its collection.json (./table.js), its columns and views, and its changes.jsonl (./changes.js),
// each change's cells with when and by whom. Any brain reads its rows with table_rows, and finds them with search_files;
// it makes one with table_create and changes it with table_change only if it makes tables right: one in the cloud or a
// plan, never the device's or a local server, which phase 0 measured short of the 80% gate (`passes`). It
// opens beside the conversation in a pane (./view.js), as a table or a board, where the user changes
// it too, and Jean's changes show marked until the user accepts or rejects them (D505). From any task, @ in the box
// lists the project's tables, and the brain knows them from its <tables> section. A document's "/" makes a table
// too, which the document holds where its ```table block names it, drawn there by <app-table>, and so
// does the Creations page, which opens it beside the task. A relation's cells are rows of a collection of the project, this
// one or another, by its place: load() reads those collections and their rows' names, which the view, the brain and the workbook show.
import { html } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { register, unlock, isDenied, slots } from '../../ui/caps.js'
import { keep } from '../../ui/windows.js'
import { onPaper } from '../../ui/kit.js'
import { kitSlot } from '../slides/kit-slot.js'
import '../made/paper.js'
import { app, conversationOf, effective } from '../../ui/state.js'
import { styleSheet } from '../../ui/sheet.js'
import { noteRecord } from '../../core/events.js'
import { isLocal } from '../../core/settings.js'
import { ulid } from '../../core/ulid.js'
import { sha256Hex } from '../../core/files.js'
import { useStrings, locale, t, intlLocales } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { page, grid, reread as listed } from '../../ui/creations.js'
import { createTable, readTable, folderOf, propertyOf, checkCell, grown, reshape, converted, canonical, isOwn, ownProblem, kindOf, notesOf, spotOf, arranged, currencyOf, filesOf, viewOf, PLACE as FOLDER } from './table.js'
import { stringifyChanges, stamp, fold, undo, reading, marked, inverse } from './changes.js'
import { query, ordered, valueOf, filterOf, total } from './query.js'
import { exportTable, namesOf, rowNamed, said, digitsOf, amount, calcOf } from './export.js'
import { tableCreate, tableView, LINE, TABLE_ROWS, TABLE_CHANGE } from './tool.js'

await Promise.all([useStrings('tables'), styleSheet(new URL('tables.css', import.meta.url))])

/** @import { Table, Property } from './table.js' */
/** @import { Line, Change, Row, Edit } from './changes.js' */
/**
 * A table read: its project, its place there, collection.json and changes.jsonl, and its rows; with the collections its relations are
 * to, by their places, and their rows' names, by their ids. @typedef {{ dir: string, folder: string, table: Table, lines: Line[], rows: Row[], related?: Map<string, Loaded>, names?: Map<string, string> }} Loaded
 */

/** Whether a brain makes tables right: not the device's nor a local server's (D491). @param {import('../../core/types.js').BrainConfig} brain */
export const passes = (brain) => !isLocal(brain)
/** How many of the project's tables the brain's <tables> names, and how many rows table_rows gives at most. */
const LISTED = 20
const ROWS = 200

/** The table opened last beside the conversation, which waits to be on show where it opens (D635). */
export const shown = signal(/** @type {Loaded | null} */ (null))
/** The tables drawn now: those beside the conversation and those documents hold, each read again as it changes; those beside it, which the brain hears of (D635). */
const showing = new Set([shown]), besides = new Set([shown])
/**
 * How each collection beside the task shows, by its id, which the address keeps as `show=<id>:<as>:<words>,…` (D752): `as`, '' as it opens (a
 * table; a whiteboard, a board), and Find's words, set back as its pane closes. @type {Map<string, { as: import('@preact/signals-core').Signal<string>, find: import('@preact/signals-core').Signal<string> }>}
 */
const ways = new Map(), shows = signal(0)
/** @param {string} folder a collection's place */
export const wayOf = (folder) => { const id = folder.slice(12, 38); if (!ways.has(id)) ways.set(id, { as: signal(''), find: signal('') }), shows.value++; return /** @type {{ as: import('@preact/signals-core').Signal<string>, find: import('@preact/signals-core').Signal<string> }} */ (ways.get(id)) }
keep('show', {
  get: () => (shows.value, [...ways].flatMap(([id, { as, find }]) => (as.value || find.value ? [`${id}:${as.value}${find.value ? `:${encodeURIComponent(find.value)}` : ''}`] : [])).join(',') || null),
  set: (state) => { const named = new Map((state ?? '').split(',').map((item) => [item.slice(0, 26), item.slice(27).split(':')])); for (const id of named.keys()) if (id) wayOf(`collections/${id}`); for (const [id, way] of ways) [way.as.value, way.find.value] = [named.get(id)?.[0] ?? '', decodeURIComponent(named.get(id)?.[1] ?? '')] },
})
/**
 * What the person arranged of each collection and hasn't kept, by view: theirs alone, in the collection's `yours.json`, which is no part of what
 * the others who work on it get (caps/together/collection.js), read as the collection is first shown. @type {Map<string, import('@preact/signals-core').Signal<Record<string, Partial<import('./table.js').View>>>>}
 */
const yours = new Map()
/** Each one's file once read, which a change waits for: none is written over what the file held. @type {WeakMap<object, Promise<unknown>>} */
const reads = new WeakMap()
/** @param {Pick<Loaded, 'dir' | 'folder'>} one */
export function yoursOf({ dir, folder }) {
  const at = `${dir}/${folder}/yours.json`, kept = yours.get(at) ?? signal(/** @type {Record<string, Partial<import('./table.js').View>>} */ ({}))
  if (!yours.has(at)) reads.set(yours.set(at, kept) && kept, app.fs.read(at).then((text) => { const views = text && JSON.parse(text).views; if (views) kept.value = { ...views, ...kept.peek() } }).catch(() => {}))
  return kept
}
/** A view arranged for this person alone, until kept; with nothing, as it is for everyone again. @param {Loaded} one @param {string} id the view's @param {Partial<import('./table.js').View>} [view] */
export async function alone(one, id, view) {
  const kept = yoursOf(one), at = `${one.dir}/${one.folder}/yours.json`
  await reads.get(kept)
  const { [id]: was, ...all } = kept.peek()
  kept.value = view ? Object.assign(all, { [id]: view }) : all
  // What it no longer holds is written as none, so that it still holds none once read again.
  return Object.keys(all).length ? app.fs.write(at, `${JSON.stringify({ format: 1, views: all }, (_, value) => value ?? null, 2)}\n`) : app.fs.remove(at)
}
/** Its rows with each formula's cells worked out, by ../formula/engine.js, fetched for a collection that has one. @param {Table} table @param {Row[]} rows @returns {Promise<Row[]>} */
const worked = async (table, rows) => (table.properties.some((property) => property.type === 'formula' && !property.deleted) ? (await import('../formula/engine.js')).worked(table, rows) : rows)
/** The name the person goes by in a collection, which a rule on "Me" keeps: the one those who work on it with them see, else the one they gave Jean. @param {Loaded} one @returns {string | undefined} */
export const meIn = (one) => slots('names').map((part) => part.me?.(one.folder)).find(Boolean) ?? effective.value.settings.name
/** The tables blank() made that a document hasn't drawn yet, whose first field then takes the keyboard. */
const fresh = new Set()

/**
 * A table of a project, read, with the collections its relations are to unless `alone`; null when there is none there.
 * @param {string} folder @param {string} [dir] @param {boolean} [alone] @returns {Promise<Loaded | null>}
 */
export async function load(folder, dir = app.projectDir, alone = false) {
  const text = FOLDER.test(folder) && await app.fs.read(`${dir}/${folder}/collection.json`)
  if (!text) return drafts.get(folder) ?? null
  const { lines, rows } = reading(`${dir}/${folder}`, (await app.fs.read(`${dir}/${folder}/changes.jsonl`)) ?? ''), table = readTable(text)
  const one = { dir, folder, table, lines, rows: await worked(table, ordered(rows(), table.order)) }
  if (alone) return one
  const places = [...new Set(table.properties.flatMap((property) => (property.type === 'relation' && !property.deleted ? [String(property.collection)] : [])))]
  const related = new Map(/** @type {[string, Loaded][]} */ ((await Promise.all(places.map(async (place) => [place, await targetOf(one, place)]))).filter(([, target]) => target)))
  return { ...one, related, names: new Map([...related.values()].flatMap((target) => [...namesOf(target.table, target.rows)])) }
}

/** The places of a project's collections, the latest made first. @param {string} dir */
export const folders = async (dir) => (await app.fs.list(`${dir}/collections`)).flatMap(({ kind, name }) => (kind === 'directory' ? [`collections/${name}`] : [])).sort().reverse()
/** The collection a relation is to, read: this one, a whiteboard's areas alone (D747), or another of the project's; null once it is gone. @param {Loaded} one @param {string} place */
const targetOf = (one, place) => (place !== one.folder ? load(place, one.dir, true).catch(() => null) : one.table.kind ? { ...one, rows: one.rows.filter((row) => kindOf(row) === 'area') } : one)
/** The project's collections by place and name, the latest made first, for a relation to be to one. @param {string} [dir] */
export const collections = async (dir = app.projectDir) => (await Promise.all((await folders(dir)).map((folder) => load(folder, dir, true).catch(() => null))))
  .flatMap((one) => (one && !one.table.kind ? [{ folder: one.folder, name: one.table.name }] : []))

/** A table drawn read again, wherever it is, after a change here or the brain's, or one refused, and those whose relations are to it. @param {Loaded} one */
export async function reread(one) {
  const fresh = await load(one.folder, one.dir)
  for (const where of showing) {
    const drawn = where.peek(), here = drawn?.dir === one.dir
    if (here && drawn.folder === one.folder) where.value = fresh
    else if (here && drawn.related?.has(one.folder)) where.value = await load(drawn.folder, drawn.dir)
  }
}

/** A signal of a collection drawn, read again with each change, until `holds` lets it go. @param {import('@preact/signals-core').Signal<Loaded | null>} where @param {(() => void)[]} holds */
export const watched = (where, holds) => { showing.add(where); holds.push(() => showing.delete(where)) }
/** What works out a page's part from a collection, in a folder of its own (caps/fill) that only such pages need: fetched as one first follows a collection. @type {typeof import('../fill/fill.js').fill | undefined} */
let fill
/**
 * A collection of the project's by its name, in any case, or its place, read into a signal drawn with the others, so that a page's parts
 * follow each change (D633); null when there is none. @param {string} name @param {(() => void)[]} holds
 */
export async function follow(name, holds) {
  fill ??= (await import('../fill/fill.js')).fill
  const key = (/** @type {string} */ text) => text.trim().normalize('NFKC').toLocaleLowerCase(), found = (await collections()).find((one) => one.folder === name.trim() || key(one.name) === key(name))
  const one = found && (await load(found.folder).catch(() => null)), where = signal(/** @type {Loaded | null} */ (one || null))
  return one ? (showing.add(where), holds.push(() => showing.delete(where)), where) : null
}
/** A row a page's form adds (D633), as the user's own change: each field, by its column's id, the value that column takes. @param {Loaded} one @param {Record<string, string>} fields */
export function addRow(one, fields) {
  const set = Object.fromEntries(Object.entries(fields).flatMap(([id, text]) => {
    const property = propertyOf(one.table, id), value = property?.type === 'checkbox' ? text === '✓' : property && converted(property, text)
    return value === undefined || value === null ? [] : [[id, value]]
  }))
  return change(one, [{ set }], 'user')
}
/** The collections Sync brought in, read again wherever they are drawn. @param {string[]} paths */
export async function came(paths) {
  const at = `${app.projectDir}/collections/`
  for (const folder of new Set(paths.flatMap((path) => (path.startsWith(at) ? [`collections/${path.slice(at.length).split('/')[0]}`] : [])))) await load(folder).then((one) => one && reread(one), () => {})
}
/**
 * What the brain is told of a collection the user names with @: its columns, and a page that shows it in its own names, which the app
 * fills and keeps current (D633); how a part keeps only some rows, and the filter its table keeps now. Phase 0 measured these words:
 * a brain on this computer, not thinking, bound seven pages of eight with them, and filtered nine of ten as asked.
 * @param {string} folder @returns {Promise<{ columns: string, body: string } | null>}
 */
export async function mentioned(folder) {
  const one = await load(folder).catch(() => null), live = one?.table.properties.filter((property) => !property.deleted) ?? [], name = one?.table.name
  if (!one) return null
  const [by, sum, date] = [['select', 'status'], ['number'], ['date']].map((types) => live.find((property) => types.includes(property.type))), kept = filterOf(one.table)
  return { columns: columnsOf(one), body: [`In a page, a collection is named, not copied, and the app fills each part from it and keeps it current, its rows the user's own, not samples. For ${name}, for example:`, '```html',
    `<app-figures from="${name}">`, `count | ${name}`, ...(sum ? [`sum ${sum.name} | ${sum.name}`] : []), '</app-figures>', ...(by ? [`<app-chart kind="bar" from="${name}" by="${by.name}"${sum ? ` sum="${sum.name}"` : ' count'}></app-chart>`] : []),
    ...(date ? [`<app-chart kind="line" from="${name}" by="${date.name}" count></app-chart>`] : []), `<app-table from="${name}">`, live.slice(0, 3).map((property) => property.name).join(' | '), '</app-table>', `<app-form ask="Add" to="${name}"></app-form>`, '```',
    `\`count\` counts rows, a date column groups by month, and a form with no lines has a field per column. A part's \`where\` keeps only some rows, when only some are asked for: \`where="${date ? `${date.name} is this month` : by ? `${by.name} is ${by.options?.[0]?.name ?? ''}` : `${live[0]?.name} is empty`}"\`, a column, then is, is not, contains, before, after, >, < or is empty, then a value, joined by and; a date can be today, this week, this month, last month, this year or last 30 days.`,
    ...(kept.length ? [`Its table shows only the rows where ${kept.map((rule) => `${propertyOf(one.table, rule.property)?.name} ${rule.op.replaceAll('-', ' ')}${rule.op.endsWith('empty') ? '' : ` ${typeof rule.value === 'boolean' ? (rule.value ? 'yes' : 'no') : rule.value}`}`).join(' and ')} now: a page shows every row unless its where says so too.`] : [])].join('\n') }
}
/** What a page's part shows of a collection (caps/fill), in the user's language, its dates from today; null when its `where` can't be read, or before a page follows one. @param {Loaded} one @param {import('../fill/fill.js').Part} part */
export function filled(one, part) { try { return fill?.(one, part, { locales: intlLocales(locale.peek()), labels: { yes: t('tables.yes'), no: t('tables.no') }, today: new Date() }) ?? null } catch { return null } }

/** @param {Loaded} one @param {Table} table */
const writeTable = async (one, table) => { await written(one); await app.fs.write(`${one.dir}/${one.folder}/collection.json`, `${JSON.stringify(table, null, 2)}\n`) }
/** Those the Creations page made, on show but not written until the user changes something in them. @type {Map<string, Loaded>} */
const drafts = new Map()
/** A whiteboard shown while the call that makes it is written (D747), or none any more. @param {string} folder @param {Loaded} [one] */
export const drafted = (folder, one) => void (one ? drafts.set(folder, one) : drafts.delete(folder))
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
 * wrong, in words a brain reads; the user's is a step to undo. A whiteboard's own cells (D747) come only from the person or Jean's own code
 * (`own`), which may name new rows, an area made in the same change among them. @param {Loaded} one @param {{ row?: string, set?: Record<string, unknown>, delete?: boolean }[]} edits
 * @param {string} by @param {string} [why] @param {boolean} [undoable] @param {boolean} [own] @returns {Promise<string[]>} the rows', in order
 */
export async function change(one, edits, by, why, undoable = by === 'user', own = by === 'user') {
  const { table } = one, named = new Set(edits.map((edit) => edit.row))
  // New rows' ids in order, so that rows made in one change keep the order they came in.
  const ids = edits.filter((edit) => !edit.row).map(() => ulid()).sort()
  const ready = edits.map((edit) => {
    if (edit.row && !own && !one.lines.some((line) => 'row' in line && line.row === edit.row)) throw new Error(`${table.name} has no row ${edit.row}: leave out a new row's id.`)
    const set = Object.fromEntries(Object.entries(edit.set ?? {}).map(([ref, value]) => {
      const mine = isOwn(ref) && (own ? ownProblem(ref, value) : `Only the person places what is on a whiteboard: leave out ${ref}.`)
      if (isOwn(ref)) return mine ? (() => { throw new Error(mine) })() : [ref, value]
      const property = propertyOf(table, ref)
      if (!property || property.deleted) throw new Error(`${table.name} has no column "${ref}": its columns are ${table.properties.filter((one) => !one.deleted).map((one) => one.name).join(', ')}.`)
      // A relation's row by its id or its name.
      const target = property.type === 'relation' && value !== null ? one.related?.get(String(property.collection)) : undefined
      const cell = target && !(own && named.has(/** @type {string} */ (value))) ? rowNamed(target.rows, one.names ?? new Map(), value) : value
      const wrong = cell === undefined ? `${property.name} takes a row of ${target?.table.name}, by its name or its id: ${JSON.stringify(value)} names none, or more than one.` : checkCell(property, cell)
      if (wrong) throw new Error(wrong)
      return [property.id, cell]
    }))
    return { row: edit.row || /** @type {string} */ (ids.shift()), ...(Object.keys(set).length && { set }), ...(edit.delete !== undefined && { delete: Boolean(edit.delete) }) }
  }).filter((edit) => edit.set || edit.delete !== undefined)
  if (!ready.length) return []
  const lines = stamp(one.lines, ready, { by, why })
  const more = grown(table, ready.map((edit) => edit.set ?? {}), lines[0].at)
  // A draft's files written first, with its columns grown where a select took new choices.
  await (more ? writeTable(one, more) : written(one))
  await app.fs.append(`${one.dir}/${one.folder}/changes.jsonl`, stringifyChanges(lines))
  // Undone, a row made goes, one deleted comes back and each cell set is as it was.
  if (undoable) did(one, { forth: ready, back: inverse(one.lines, ready) })
  await reread(one)
  return ready.map((edit) => edit.row)
}

/** How big a file a cell takes at most: what a letter to someone carries (caps/people). */
const MAX = 25_000_000
/**
 * Files given to a picture's or a files cell: each kept in the collection's own folder, named by its content's hash, so the same one twice is kept
 * once, a picture as a browser opens one (caps/files/pictures.js), then named in the cell after those it holds, as the user's change. One that is no
 * picture, or too big, is left out. @param {Loaded} one @param {Row} row @param {Property} property @param {File[]} files @returns {Promise<number>} how many were left out
 */
export async function attach(one, row, property, files) {
  const kept = []
  for (const file of files) {
    const fit = property.type === 'picture' ? await (await import('../files/pictures.js')).fitPicture(file) : { name: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }
    if (!fit || fit.bytes.length > MAX) continue
    const path = `files/${await sha256Hex(fit.bytes)}.${/\.([a-z0-9]{1,8})$/i.exec(fit.name)?.[1]?.toLowerCase() ?? 'bin'}`, at = `${one.dir}/${one.folder}/${path}`
    if (!(await app.fs.exists(at))) await app.fs.writeBytes(at, fit.bytes)
    kept.push({ name: fit.name, file: path, ...(fit.mimeType && { type: fit.mimeType }) })
  }
  if (kept.length) await change(one, [{ row: row.id, set: { [property.id]: [...filesOf(row.cells[property.id]), ...kept] } }], 'user')
  return files.length - kept.length
}

/**
 * What the user did to each collection in this visit, by its place, to undo with ⌘Z and do again with ⇧⌘Z: each step's cells and rows
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
 * The user renames a table, adds, renames or takes away a column, or puts its rows in an order, in its view, on its
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
 * A column the user makes another kind, or a relation to a `collection`: each cell with a value of that kind written as one, by
 * the user, a relation's the row of that name, and the choices among them added; one with none stays as it was, unseen, to come back if the
 * kind does. @param {Loaded} one @param {string} id @param {string} type @param {string} [collection] @param {string[]} [options] a status's steps, in place of its choices
 */
export const retype = (one, id, type, collection, options) => (reshaping = reshaping.catch(() => {}).then(async () => {
  const now = (await load(one.folder, one.dir)) ?? one, at = new Date().toISOString(), table = reshape(now.table, { retype: { id, type, collection, ...(options && { options }) } }, at)
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
/**
 * A collection made with no conversation, empty, in a project, `dir`, as a site's replies make one (D751); its place. @param {{ name: string, columns: { name: string, type: string }[] }} spec
 * @param {string} dir
 */
export async function makeTable(spec, dir) {
  const table = createTable(spec, { id: ulid(), author: 'user', at: new Date().toISOString() }), one = { dir, folder: folderOf(table), table, lines: [], rows: [] }
  await writeTable(one, table)
  await app.fs.write(`${dir}/${one.folder}/changes.jsonl`, '')
  listed()
  return one.folder
}

/** A collection pinned or renamed from the Creations page, as its view renames it. @param {{ path: string }} item @param {{ pinned?: boolean, name?: string }} edit */
export const amend = ({ path }, { pinned, name }) => (reshaping = reshaping.catch(() => {}).then(async () => {
  const one = await load(path)
  if (!one) return
  const { pinned: was, ...table } = name ? reshape(one.table, { name }, new Date().toISOString()) : one.table
  await writeTable(one, { ...table, ...((pinned ?? was) && { pinned: true }) })
  await reread(one)
}))
/**
 * table_create's columns, a relation's collection named by its place, or by its name, this new one's among them, as its place.
 * @param {any} args @param {string} id the new table's
 */
async function placed(args, id) {
  const all = [{ folder: folderOf({ id, name: String(args?.name ?? '').trim() }), name: String(args?.name ?? '') }, ...await collections()], key = (/** @type {unknown} */ name) => String(name ?? '').trim().toLocaleLowerCase()
  const to = (/** @type {any} */ column) => all.find(({ folder, name }) => folder === column.collection || key(name) === key(column.collection))?.folder ?? column.collection
  // Money in the currency the request names, else the person's region's (D752).
  const money = (/** @type {any} */ column) => (column?.format === 'money' || /^(money|currency)$/i.test(column?.type) ? { ...column, currency: column.currency ?? localCurrency() } : column)
  return Array.isArray(args?.columns) ? { ...args, columns: args.columns.map((/** @type {any} */ column) => (column?.type === 'relation' ? { ...column, collection: to(column) } : money(column))) } : args
}

/** The currency of the person's region, for money nobody named one for. */
export const localCurrency = () => currencyOf(new Intl.Locale(intlLocales()[0] ?? 'en').maximize().region)

/** A copy, the user's, by the name given, with its rows as they are and the files they name. @param {{ path: string }} item @param {string} name */
export async function copy({ path }, name) {
  const one = await load(path), now = new Date().toISOString()
  if (!one) throw new Error(`There is no collection ${path}.`)
  const { pinned, kept, ...table } = one.table, id = ulid()
  // Its relations to itself are to the copy, whose rows keep their ids.
  const properties = table.properties.map((property) => (property.collection === path ? { ...property, collection: folderOf({ id, name }) } : property))
  const { folder } = await made({ ...table, properties, id, name, author: 'user', created: now, changed: now }, one.rows.filter((row) => !row.deleted).map((row) => ({ row: row.id, set: row.cells })))
  // The files its cells name go with it.
  for (const { name: file } of await app.fs.list(`${one.dir}/${path}/files`).catch(() => [])) await app.fs.readBytes(`${one.dir}/${path}/files/${file}`).then((bytes) => bytes && app.fs.writeBytes(`${app.projectDir}/${folder}/files/${file}`, bytes))
  return folder
}

/** The user's new table: a column for each row's name and one empty row. */
const untitled = () => createTable({ name: t('tables.untitled'), columns: [{ name: t('tables.nameColumn'), type: 'text' }] }, { id: ulid(), author: 'user', at: new Date().toISOString() })
/** One from a document's "/", its place for the document to hold. */
export async function blank() {
  const { folder } = await made(untitled(), [{ row: ulid(), set: {} }])
  fresh.add(folder)
  return folder
}
/** One from the Creations page, beside the task, its name taking the keyboard, written once the user changes it. */
async function fromPage() {
  const table = untitled(), lines = stamp([], [{ row: ulid(), set: {} }], { by: 'user' }), one = { dir: app.projectDir, folder: folderOf(table), table, lines, rows: fold(lines) }
  drafts.set(one.folder, one)
  await open(one)
  requestAnimationFrame(() => /** @type {HTMLInputElement | null} */ (document.querySelector('app-preview .pane-name'))?.select())
}

/** Jean's changes the user hasn't accepted or rejected, the latest last (./changes.js), worked out once for each copy read, not at each draw. @type {WeakMap<Line[], { kept?: string, marked: Change[] }>} */
const unkepts = new WeakMap()
/** @param {Loaded} one @returns {Change[]} */
export const unkept = (one) => { const was = unkepts.get(one.lines); if (was && was.kept === one.table.kept) return was.marked; const now = marked(one.lines, one.table.kept); unkepts.set(one.lines, { kept: one.table.kept, marked: now }); return now }

/** The user accepts Jean's changes, or one row's, which become the user's own: they show so from now on. @param {Loaded} one @param {string} [row] */
export async function accept(one, row) {
  const marked = unkept(one), at = marked.at(-1)?.at, cells = one.rows.find((each) => each.id === row)?.cells ?? {}
  if (row) await app.fs.append(`${one.dir}/${one.folder}/changes.jsonl`, stringifyChanges(stamp(one.lines, [{ row, set: Object.fromEntries(marked.filter((line) => line.row === row).flatMap((line) => Object.keys(line.set ?? {}).filter((id) => !isOwn(id))).map((id) => [id, cells[id] ?? null])) }], { by: 'user' })))
  else if (at) await writeTable(one, { ...one.table, kept: at })
  await reread(one)
}

/**
 * The user rejects Jean's changes, or one row's, the latest first; a cell the user changed since stays as it is. A row Jean made that nobody else
 * has written in goes whole, whatever Jean changed in it after: undone change by change, it was left empty (D752). @param {Loaded} one @param {string} [row]
 */
export async function reject(one, row) {
  const lines = unkept(one).filter((each) => !row || each.row === row), born = new Map(one.rows.map((each) => [each.id, each.created]))
  const theirs = new Set(one.lines.flatMap((line) => ('row' in line && line.by !== 'jean' ? [line.row] : [])))
  const gone = new Set(lines.flatMap((line) => (!theirs.has(line.row) && born.get(line.row)?.at === line.at && born.get(line.row)?.by === 'jean' ? [line.row] : [])))
  /** @type {Line[]} */
  const back = gone.size ? stamp(one.lines, [...gone].map((id) => ({ row: id, delete: true })), { by: 'user' }) : []
  for (const line of lines.filter((each) => !gone.has(each.row)).reverse()) back.push(...undo([...one.lines, ...back].filter((each) => !('row' in each) || each.row === line.row), { author: 'jean', by: 'user', only: line.at })?.lines ?? [])
  if (back.length) await app.fs.append(`${one.dir}/${one.folder}/changes.jsonl`, stringifyChanges(back))
  await reread(one)
}

/** A table as a workbook or as CSV, for its pane's Download: its rows as its view shows them. @param {string} folder @param {'xlsx' | 'csv'} [kind] */
export async function workbook(folder, kind = 'xlsx') {
  const one = await load(folder)
  return one && exportTable(one.table, one.table.kind ? arranged(one.rows) : one.rows, kind, { names: one.names, look: await onPaper() })
}

/** A group's name (D752): a value as its column says it, none as "No …", a box yes or no, a month in the user's words. @param {unknown} value @param {Property} by */
export const groupName = (value, by) => (value === null ? t('tables.none', { column: by.name }) : typeof value === 'boolean' ? t(value ? 'tables.yes' : 'tables.no')
  : /^(date|created-at|changed-at)$/.test(by.type) ? new Intl.DateTimeFormat(intlLocales(), { month: 'long', year: 'numeric' }).format(new Date(`${value}-01T00:00`)) : String(value))

/**
 * A collection as a print or a Word file says it (D664): its name, its columns' over its rows, each cell as the language writes it, as its
 * table view keeps and groups them, each group under a head of its name, how many and its subtotals (`heads`, their rows' places), its foot's
 * totals under them, and which columns line up at their end. @param {string} folder
 */
export async function gridIn(folder) {
  const one = await load(folder)
  if (!one) return null
  const view = viewOf(one.table, wayOf(folder).as.peek(), yoursOf(one).peek()), hidden = view.hidden ?? [], kept = filterOf(one.table, view), columns = one.table.properties.filter((property) => !property.deleted && !hidden.includes(property.id))
  const all = one.table.kind ? arranged(one.rows) : query(one.table, one.rows, { ...(kept.length && { filter: { and: kept } }), sort: view.sort?.filter((sort) => propertyOf(one.table, sort.property)), locale: locale.value, names: one.names, me: meIn(one) }).rows
  const digits = columns.map((property) => digitsOf(all, property)), how = { locales: intlLocales(), names: one.names, labels: { yes: '✓', no: '' } }, number = new Intl.NumberFormat(intlLocales())
  const line = (/** @type {Row} */ row) => columns.map((property, i) => said(row, property, { ...how, digits: property.type === 'number' ? digits[i] : undefined }))
  /** What each column's foot works out over some rows, as its word and the figure. @param {Row[]} rows */
  const totals = (rows) => columns.map((property, i) => ((calc, value) => (calc && value !== null ? `${t(`tables.calc.${calc === 'percent' && property.type === 'checkbox' ? 'ticked' : calc}`)} ${calc === 'count' ? number.format(value) : calc === 'percent' ? new Intl.NumberFormat(intlLocales(), { style: 'percent' }).format(value) : amount(value, property, intlLocales(), calc === 'average' ? undefined : digits[i])}` : ''))(calcOf(property, view?.calculate), calcOf(property, view?.calculate) ? total(rows, property, /** @type {import('./query.js').Total} */ (calcOf(property, view?.calculate))) : null))
  const by = !one.table.kind ? columns.find((property) => property.id === view?.group && /^(select|status|person|checkbox|date)$/.test(property.type)) : undefined
  const groups = by ? query(one.table, all, { group: { property: by.id }, locale: locale.value, names: one.names }).groups?.filter((group) => group.rows.length) ?? [] : [{ value: undefined, rows: all }]
  const rows = /** @type {string[][]} */ ([]), heads = /** @type {number[]} */ ([])
  for (const group of groups) {
    if (by) heads.push(rows.length + 1), rows.push(totals(group.rows).map((cell, i) => (i ? cell : `${groupName(group.value, by)} · ${number.format(group.rows.length)}`)))
    rows.push(...group.rows.map(line))
  }
  const foot = totals(all)
  return { name: one.table.name, right: columns.map((property) => property.type === 'number'), rows: [columns.map((property) => property.name), ...rows], heads, foot: foot.some(Boolean) ? foot : null }
}

/**
 * The tables a project keeps (the open one's unless named), the latest made first, with their columns' names and a line for each row as text (what search_files reads),
 * how to open them, and their first four columns' heads and six rows for a card (`grid`), read again each time as documents are. @param {string} [dir] the project's
 */
export async function kept(dir = app.projectDir) {
  const all = await Promise.all((await folders(dir)).map((folder) => load(folder, dir).catch(() => null)))
  /** A cell as text, a relation's the name of its row, a file's its name. @param {Loaded} one @param {Row} row @param {Property} property */
  const cell = (one, row, property) => ((value) => (Array.isArray(value) ? value.map((item) => item?.name ?? item).join(', ') : value === true ? '✓' : value === false || value == null ? '' : String(value)))(property.type === 'relation' ? valueOf(row, property, one.names) : row.cells[property.id])
  return all.flatMap((one) => (one && !one.table.kind ? [{ path: one.folder, name: one.table.name, changed: one.lines.reduce((latest, line) => ('at' in line && line.at > latest ? line.at : latest), one.table.changed), created: one.table.created, pinned: one.table.pinned === true,
    grid: ((heads) => [heads.map((property) => property.name), ...one.rows.slice(0, 6).map((row) => heads.map((property) => cell(one, row, property)))])(one.table.properties.filter((property) => !property.deleted).slice(0, 4)),
    link: /** @type {import('../../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: one.folder, name: one.table.name, title: one.table.name }), text: ((columns) => [columns.map((property) => property.name).join(', '),
      ...one.rows.map((row) => columns.flatMap((property) => [cell(one, row, property)].filter(Boolean).map((value) => `${property.name}: ${value}`)).join('; '))].join('\n'))(one.table.properties.filter((property) => !property.deleted)) }] : []))
}

/** What an address names: a table by its name, a workbook once it downloads. @param {string} folder */
export async function metaOf(folder) {
  const one = await load(folder).catch(() => null)
  return one ? { name: one.table.name, title: one.table.name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } : null
}

/**
 * A table's view beside the conversation (ui/preview.js, D635): its editor, as a document holds one, following its own place, which the
 * brain hears of; as many as there are. @param {{ uri: string }} file @param {(() => void)[]} holds
 */
export async function editor(file, holds) {
  // Its view's module fetched meanwhile, which a whiteboard's draws with too.
  const [one] = await Promise.all([load(file.uri), import('./view.js')])
  if (!one) return null
  // A whiteboard, Whiteboards' view, which comes once a whiteboard does (D747).
  if (one.table.kind && await unlock('whiteboards')) return (await import('../whiteboards/whiteboards.js')).editor(file, holds)
  shown.value = one
  holds.push(() => { if (shown.peek()?.folder === one.folder) shown.value = null })
  return html`<app-table folder=${file.uri} beside></app-table>`
}

/**
 * A collection's name in its pane's head (ui/preview.js), changed there; a whiteboard's too, with its own tip. @param {{ uri: string, title: string }} file
 * @param {(name: string) => void} renamed @param {string} [tip]
 */
export const nameField = (file, renamed, tip = t('tables.tableName')) => html`<input class="pane-name" dir="auto" title=${tip} .value=${live(file.title)}
  @change=${(/** @type {Event} */ e) => { const name = /** @type {HTMLInputElement} */ (e.target).value.trim(); if (name) renamed(name), amend({ path: file.uri }, { name }) }}>`

/** A table, beside the conversation, once it is on show. @param {Loaded} one */
async function open(one) {
  if (shown.peek()?.folder === one.folder) return
  ;(await import('../../ui/preview.js')).preview({ uri: one.folder, name: (await metaOf(one.folder))?.name ?? one.table.name, title: one.table.name })
  for (let wait = 0; wait < 100 && shown.peek()?.folder !== one.folder; wait++) await new Promise((resolve) => setTimeout(resolve, 50))
}

/** Its columns, as the brain reads them: each name, its kind, a select's choices or a status's steps, and a relation's collection. @param {Loaded} one */
export const columnsOf = ({ table, related }) => table.properties.filter((property) => !property.deleted)
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
  spec: tableCreate(locale.peek(), { whiteboard: !app.policy.skills?.only && !isDenied('skills') && !isDenied('whiteboards') }),
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

/**
 * A whiteboard as table_rows gives it (D747), as phase 0 measured: its areas by id, then its notes, each with its area's id, or where it
 * waits, then its texts, then its arrows by the ids they join; never a drawn line. @param {Loaded} one
 */
function boardRows(one) {
  const areas = one.rows.filter((row) => kindOf(row) === 'area'), ids = new Set(/** @type {unknown[]} */ (areas.map((row) => row.id))), notes = notesOf(one.rows), columns = one.table.properties.filter((property) => !property.deleted && property.id !== 'area')
  const cells = (/** @type {Row} */ row) => Object.fromEntries(columns.flatMap((property) => (row.cells[property.id] === undefined ? [] : [[property.name, row.cells[property.id]]])))
  return [`${one.table.name} (${one.folder}), a whiteboard: ${areas.length} areas, ${notes.length} notes.`, ...areas.map((row) => JSON.stringify({ area: row.id, name: row.cells.note ?? '' })),
    ...notes.map((row) => JSON.stringify({ row: row.id, ...cells(row), ...(ids.has(row.cells.area) ? { area: row.cells.area } : spotOf(row, ids) ? { ground: true } : { shelf: true }) })),
    ...one.rows.filter((row) => kindOf(row) === 'text').map((row) => JSON.stringify({ row: row.id, kind: 'text', ...cells(row) })),
    ...one.rows.flatMap((row) => ((ends) => (kindOf(row) === 'arrow' && ends.length && ends.every((id) => one.rows.some((other) => other.id === id && kindOf(other) !== 'line')) ? [JSON.stringify({ arrow: row.id, from: ends[0], to: ends[1] })] : []))(/** @type {string[]} */ (row.cells['@ends'] ?? [])))].join('\n')
}

/** @type {import('../../core/loop.js').Tool} */
const rowsTool = {
  spec: TABLE_ROWS,
  kind: 'read',
  title: (args) => `Read ${args?.table ?? ''}`,
  // A read leaves the screen and its address as they are: nothing opens beside the task (D657).
  run: async (args, ctx) => {
    const one = await named(args?.table)
    ctx.meta.read = one.folder
    if (one.table.kind) return boardRows(one)
    const { rows } = query(one.table, one.rows, { ...(args?.filter && { filter: args.filter }), locale: locale.peek(), names: one.names })
    const columns = one.table.properties.filter((property) => !property.deleted)
    const lines = rows.slice(0, ROWS).map((row) => JSON.stringify({ row: row.id, ...Object.fromEntries(columns.flatMap((property) => (row.cells[property.id] === undefined ? []
      : [[property.name, property.type === 'relation' ? valueOf(row, property, one.names) : row.cells[property.id]]]))) }))
    return `${one.table.name} (${one.folder}): ${rows.length} of its ${one.rows.length} rows. Its columns: ${columnsOf(one)}.\n${lines.join('\n')}${rows.length > ROWS ? `\nand ${rows.length - ROWS} more: filter them.` : ''}`
  },
}

/** @type {import('../../core/loop.js').Tool} */
const changeTool = {
  spec: TABLE_CHANGE,
  kind: 'edit',
  for: passes,
  title: (args) => `Change ${args?.table ?? ''}`,
  run: async (args, ctx) => {
    refuse(ctx)
    const one = await named(args?.table)
    if (one.table.kind) throw new Error(`${one.table.name} is a whiteboard: change it with whiteboard_change.`)
    const ids = await change(one, Array.isArray(args?.rows) ? args.rows : [], 'jean', typeof args?.why === 'string' ? args.why : undefined)
    if (here(ctx)) await open(one)
    return ids.length ? `Changed ${ids.length} rows of ${one.table.name}, beside the conversation for the user to accept or reject: ${ids.join(', ')}.` : 'Nothing changed: give each row a set or delete.'
  },
}

/** @type {import('../../core/loop.js').Tool} */
const viewTool = {
  spec: tableView(),
  kind: 'edit',
  for: passes,
  title: (args) => `View ${args?.name ?? ''}`,
  // A view proposed (D755), made of what the brain sent by a folder of its own (caps/views): this person's alone, under an id of its own, on show at
  // once where its task is on screen, for them to keep or not. Nothing of the collection changes.
  run: async (args, ctx) => {
    refuse(ctx)
    const one = await named(args?.table), view = (await import('../views/views.js')).viewFrom(one.table, args), mine = yoursOf(one)
    await reads.get(mine)
    // Proposed again under a name, it takes the place of the one proposed before.
    const id = Object.keys(mine.peek()).find((key) => mine.peek()[key].name === view.name) ?? `p${ulid()}`
    await alone(one, id, view)
    if (here(ctx)) await open(one), (wayOf(one.folder).as.value = id)
    const { rows } = query(one.table, one.rows, { ...(view.filter && { filter: view.filter }), locale: locale.peek(), names: one.names, me: meIn(one) })
    return `Proposed the view ${view.name} of ${one.table.name}: it keeps ${rows.length} of its ${one.rows.length} rows. The user sees it over the collection, theirs alone, to keep or not; nothing else changed.`
  },
}

/**
 * The notes a message comes with for each table beside the task whose brain hasn't heard of it as it is now:
 * its place, its columns and how many rows it has, or the user changed.
 * @param {import('../../core/types.js').Envelope[]} records
 */
const notes = (records) => [...new Map([...besides].flatMap((where) => (where.peek() ? [[where.peek()?.folder, /** @type {Loaded} */ (where.peek())]] : []))).values()].flatMap((one) => {
  const text = `The table ${one.table.name} (${one.folder}) is open beside the conversation: ${one.rows.length} rows. Its columns: ${columnsOf(one)}. Read its rows with table_rows.`
  const last = records.findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data.kind === 'table' && update.data.uri === one.folder)
  return last?.update?.sessionUpdate === '_system_note' && last.update.text === text ? [] : [noteRecord(text, { kind: 'table', uri: one.folder })]
})

// A table a document holds, where its ```table block names it: its view, its name to change; the place itself when there is no such table.
// Another place is another element (drawn.js keys it by its place).
customElements.define('app-table', class extends HTMLElement {
  /** @type {(() => void)[]} */
  holds = []

  async connectedCallback() {
    const [holds, folder, beside] = [this.holds, this.getAttribute('folder') ?? '', this.hasAttribute('beside')]
    // Beside the task, as editor() has just read it.
    const [one, { view }] = await Promise.all([beside && shown.peek()?.folder === folder ? shown.peek() : load(folder).catch(() => null), import('./view.js')])
    if (holds !== this.holds || !this.isConnected) return
    if (!one) return void (this.textContent = folder)
    const where = signal(/** @type {Loaded | null} */ (one)), sets = beside ? [showing, besides] : [showing]
    for (const set of sets) set.add(where), holds.push(() => set.delete(where))
    this.replaceChildren(view(holds, where, beside))
    // Its heads stay at the top of what the document shows while its rows pass under it: they stick in the table's own box,
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
    if (fresh.delete(folder)) /** @type {HTMLInputElement | null} */ (this.querySelector('tbody input'))?.focus()
  }

  disconnectedCallback() {
    for (const hold of this.holds) hold()
    this.holds = []
  }
})

register({
  id: 'tables',
  tools: [createTool, rowsTool, changeTool, viewTool],
  lines: [LINE],
  // The project's tables, the latest made first, by name and place, which a relation of table_create's names.
  sections: async () => {
    const all = (await kept()).map(({ path, name }) => `- ${name}: ${path}`)
    return all.length ? { tables: ['A relation column of table_create names one of these in collection, its place or name; each of its cells is then a row of it, set by its name.',
      ...all.slice(0, LISTED), ...(all.length > LISTED ? [`- and ${all.length - LISTED} older ones`] : [])].join('\n') } : {}
  },
  slots: { modes: { at: 10, draw: () => null, notes }, head: { at: 2, draw: () => null, named: (/** @type {{ uri: string, title: string }} */ file, /** @type {(name: string) => void} */ renamed) => FOLDER.test(file.uri) && nameField(file, renamed) }, look: kitSlot, out: { at: 2, draw: () => null, of: (/** @type {{ uri: string }} */ { uri }) => FOLDER.test(uri), load: async () => ({ ways: (await import('../made/ways.js')).collectionWays }) }, creations: { id: 'tables', at: 2, draw: () => icons.table, kept, mention: 'table', preview: (/** @type {{ grid: string[][] }} */ item) => grid(item.grid), make: () => import('../begin/begin.js').then(({ begin }) => begin(fromPage)),
    // Dragged into a document, its view there.
    held: (/** @type {{ path: string }} */ { path }) => `\`\`\`table\n${path}\n\`\`\``,
    pin: (/** @type {{ path: string }} */ item, /** @type {boolean} */ pinned) => amend(item, { pinned }), rename: (/** @type {{ path: string }} */ item, /** @type {string} */ name) => amend(item, { name }), copy,
    remove: (/** @type {{ path: string }} */ { path }) => app.fs.remove(`${app.projectDir}/${path}`) }, main: page },
})
