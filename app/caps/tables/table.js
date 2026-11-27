// SPDX-License-Identifier: MIT
// A table Jean keeps (D473, D474, D491), a collection (D507): its collection.json, the columns (properties) and views, read and
// checked; a table made from what a brain's table_create sends; and two copies' collection.json merged after
// Sync, column by column. A column's id comes from its first name and never changes, so renaming it
// rewrites no change. A status a brain gives no steps is a select, and a select's choices grow as values
// come (D491), as Notion's do. A relation is to a collection, this one or another, by its place, and each of its cells to one row
// there, by the row's ULID; a brain makes one too. A whiteboard (D747) is a collection of its own kind: its notes' words in `note`, the
// area each is in in `area`, a relation to itself, and areas, texts and drawn lines rows too, told apart by cells whose keys start with @,
// which only the person and Jean's own code write. Pure, so Node's tests run it.
import { slug } from '../../core/settings.js'
import { renamed as rewritten } from './formula.js'

export const FORMAT = 1
/** What a brain may make, in the order table_create lists them. */
export const MADE = /** @type {const} */ (['text', 'number', 'select', 'multi-select', 'status', 'date', 'checkbox', 'link', 'email', 'phone', 'person', 'place', 'files', 'relation'])
/** Worked out by Jean, never set: a formula's cells too (./formula.js). */
export const COMPUTED = /** @type {const} */ (['created-by', 'created-at', 'changed-by', 'changed-at', 'formula'])
/** Every kind: a picture among them, which people make and table_create's list, measured as it is, doesn't name. */
export const TYPES = /** @type {const} */ ([...MADE, 'picture', ...COMPUTED])
export const GROUPS = /** @type {const} */ (['todo', 'doing', 'done'])
/** How many colours a choice or a person's face has, a whiteboard's seven. */
export const HUES = 7
const VIEWS = ['table', 'board', 'list', 'calendar', 'gallery', 'timeline']
const CHOICES = new Set(['select', 'multi-select', 'status'])
/** What a board's lanes are by: a choice, a step, a person or a box (D752). */
const LANES = ['select', 'status', 'person', 'checkbox']
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
/** A file a picture's or a files cell names: in its collection's own folder, named by its content's SHA-256, so never a way out of it. */
export const FILE = /^files\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/
export const PLACE = /^collections\/[0-9A-HJKMNP-TV-Z]{26}-[^/]+$/
export const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
// The words brains use for kinds of columns, as Jean's.
const ALIASES = /** @type {Record<string, PropertyType>} */ ({
  string: 'text', title: 'text', 'rich-text': 'text', integer: 'number', float: 'number', decimal: 'number', currency: 'number', money: 'number',
  url: 'link', boolean: 'checkbox', bool: 'checkbox', multiselect: 'multi-select', tags: 'multi-select', datetime: 'date', 'date-time': 'date',
  tel: 'phone', 'phone-number': 'phone', location: 'place', address: 'place', user: 'person', people: 'person', file: 'files', attachments: 'files',
  image: 'picture', images: 'picture', photo: 'picture', photos: 'picture', pictures: 'picture',
})

/** @typedef {typeof TYPES[number]} PropertyType */
/** A choice; hue: the colour the person picked for it, one of HUES by its place. @typedef {{ name: string, group?: typeof GROUPS[number], hue?: number }} Option */
/**
 * A column; collection: a relation's, by its place; formula: a Formula's; format: a number's, money (in `currency`, its ISO 4217 code) or a share of a
 * hundred (D752); time: a date's, with a time of day; gone: the choices taken away, which no merge brings back until one is given again; deleted: when it was removed. @typedef {{ id: string, name: string, type: PropertyType, options?: Option[], collection?: string, formula?: string, format?: 'money' | 'percent', currency?: string, time?: true, gone?: string[], deleted?: string }} Property
 */
/** @typedef {{ property: string, direction?: 'ascending' | 'descending' }} Sort */
/** A rule of a view's filter. @typedef {{ property: string, op: import('./query.js').Op, value?: unknown }} Rule */
/**
 * A view; filter: the rules a row meets to show, hidden: the columns it doesn't show, sort: the column its rows are sorted by, calculate: what each column's foot works out,
 * 'none' kept as such (D752); group: what a table view's rows and its board's lanes are grouped by, a board's own its lanes else; colour: the choice whose colours its rows take; date: the date column a calendar's rows
 * are on, until: the one they last to. `table` is the collection's own arrangement, `board` and `calendar` what those are by; one with a name is a view the person kept,
 * shown as its type, arranged on its own; deleted: when it was taken away, kept so that no copy brings it back.
 * @typedef {{ id: string, type: 'table' | 'board' | 'list' | 'calendar' | 'gallery' | 'timeline', name?: string, group?: string, colour?: string, date?: string, until?: string, sort?: Sort[], filter?: { and: Rule[] }, hidden?: string[], calculate?: Partial<Record<string, import('./query.js').Total | 'none'>>, frozen?: number, deleted?: string }} View
 */
/**
 * kept: the time of Jean's latest change the user kept, after which Jean's changes are marked (D491); order: the rows' ids in the
 * order the user put them, those it doesn't name after them, as they were made; kind: a whiteboard's (D747), and dir: the direction it
 * was made in, the same for everyone who sees it.
 * @typedef {{ format: 1, id: string, name: string, author: string, created: string, changed: string, properties: Property[], views: View[], kept?: string, pinned?: boolean, order?: string[], kind?: 'whiteboard', dir?: 'ltr' | 'rtl' }} Table
 */

/** A column's id: its first name, in any script, lower case. @param {string} name @param {Set<string>} taken */
function idFor(name, taken) {
  const base = name.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'column'
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  taken.add(id)
  return id
}

/** Where a table's files are: collections/<ulid>-<slug>/, never renamed. @param {Pick<Table, 'id' | 'name'>} table */
export const folderOf = (table) => `collections/${table.id}-${slug(table.name) || 'collection'}`

/**
 * The table a brain's table_create makes: each column's id, a status's steps in groups (the first
 * to do, the last done, the others under way), a view as a table and a board by the status, else by
 * its first select. Throws what to change, in words a brain reads.
 * @param {any} spec { name, columns: [{ name, type, options? }] } @param {{ id: string, author: string, at: string }} made
 * @returns {Table}
 */
export function createTable(spec, { id, author, at }) {
  const name = typeof spec?.name === 'string' ? spec.name.trim() : ''
  if (!name) throw new Error('Give the table a name.')
  const columns = Array.isArray(spec.columns) ? spec.columns : []
  if (!columns.length) throw new Error('Give the table its columns.')
  /** @type {Set<string>} */
  const taken = new Set()
  /** @type {Set<string>} */
  const names = new Set()
  /** @type {Property[]} */
  const properties = columns.map((/** @type {any} */ column) => {
    const property = propertyFrom(column, taken)
    const key = property.name.toLocaleLowerCase()
    if (names.has(key)) throw new Error(`Two columns are named "${property.name}": give each its own name.`)
    names.add(key)
    return property
  })
  const group = properties.find((property) => property.type === 'status') ?? properties.find((property) => property.type === 'select')
  /** @type {Table} */
  const table = { format: FORMAT, id, name, author, created: at, changed: at, properties, views: [{ id: 'table', type: 'table' }, ...(group ? [/** @type {View} */ ({ id: 'board', type: 'board', group: group.id })] : [])] }
  const problems = tableProblems(table)
  if (problems.length) throw new Error(problems.join('\n'))
  return table
}

/** @param {any} column @param {Set<string>} taken @returns {Property} */
export function propertyFrom(column, taken) {
  const name = typeof column?.name === 'string' ? column.name.trim() : ''
  if (!name) throw new Error('Name each column.')
  const raw = String(column.type ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')
  let type = /** @type {PropertyType | undefined} */ (TYPES.includes(/** @type {any} */ (raw)) ? raw : ALIASES[raw])
  if (!type) throw new Error(`${name}: "${column.type}" isn't a kind of column. Use one of ${MADE.join(', ')}.`)
  /** @type {Property} */
  const property = { id: idFor(name, taken), name, type }
  if (type === 'formula') property.formula = typeof column.formula === 'string' ? column.formula : ''
  // A number of money, a brain's money or currency type too, or a share (D752).
  const format = /^(money|currency)$/.test(raw) ? 'money' : column.format
  if (type === 'number' && (format === 'money' || format === 'percent')) property.format = format
  if (property.format === 'money' && /^[A-Z]{3}$/.test(column.currency)) property.currency = column.currency
  if (type === 'date' && column.time === true) property.time = true
  if (type === 'relation' && !PLACE.test(property.collection = column.collection)) throw new Error(`${name}: a relation names its collection, one the project keeps by its place, or this one by its name.`)
  if (CHOICES.has(type)) {
    const given = Array.isArray(column.options) ? column.options : [], named = (/** @type {any} */ option) => String((option && typeof option === 'object' ? option.name : option) ?? '').trim()
    const options = [...new Set(given.map(named).filter(Boolean))]
    // The colour each was given stays its own, whatever kind its column becomes.
    const hue = (/** @type {string} */ name) => ((picked) => (Number.isInteger(picked) ? { hue: picked } : {}))(given.find((/** @type {any} */ option) => named(option) === name)?.hue)
    // A status with fewer than two steps is a select, whose choices come as values do (D491).
    if (type === 'status' && options.length < 2) property.type = type = 'select'
    property.options = options.map((option, i) => ({ name: option, ...(type === 'status' && { group: GROUPS[i === 0 ? 0 : i === options.length - 1 ? 2 : 1] }), ...hue(option) }))
  }
  return property
}

/** A collection.json's text as a table; throws what is wrong with it. @param {string} text @returns {Table} */
export function readTable(text) {
  let table
  try {
    table = JSON.parse(text)
  } catch (error) {
    throw new Error(`collection.json isn't JSON: ${/** @type {Error} */ (error).message}`)
  }
  const problems = tableProblems(table)
  if (problems.length) throw new Error(problems.join('\n'))
  return table
}

/** What is wrong with a table, in words a brain or a person reads; none when it is right. @param {any} table @returns {string[]} */
export function tableProblems(table) {
  if (table?.format !== FORMAT) return [typeof table?.format === 'number' && table.format > FORMAT ? `A newer Jean made this table (format ${table.format}).` : 'This is not a table: it has no format 1.']
  /** @type {string[]} */
  const problems = []
  if (!ULID.test(table.id)) problems.push('The table has no ULID.')
  if (typeof table.name !== 'string' || !table.name.trim()) problems.push('The table has no name.')
  if (typeof table.author !== 'string' || !table.author) problems.push('The table has no author.')
  for (const key of ['created', 'changed']) if (!TIME.test(table[key])) problems.push(`The table's ${key} time isn't an ISO time in UTC.`)
  if (table.kind !== undefined && table.kind !== 'whiteboard') problems.push(`"${table.kind}" isn't a kind of collection.`)
  if (table.dir !== undefined && table.dir !== 'ltr' && table.dir !== 'rtl') problems.push('The table\'s direction is ltr or rtl.')
  if (table.order !== undefined && !(Array.isArray(table.order) && table.order.every((/** @type {unknown} */ id) => typeof id === 'string'))) problems.push('The table\'s order isn\'t a list of its rows\' ids.')
  if (!Array.isArray(table.properties) || !table.properties.length) return [...problems, 'The table has no columns.']
  /** @type {Map<string, any>} */
  const ids = new Map()
  /** @type {Set<string>} */
  const names = new Set()
  for (const property of table.properties) {
    const label = property?.name ?? property?.id
    if (typeof property?.id !== 'string' || !property.id) problems.push('A column has no id.')
    else if (ids.has(property.id)) problems.push(`Two columns have the id "${property.id}".`)
    else ids.set(property.id, property)
    if (isOwn(String(property?.id))) problems.push(`${label}: a column's id never starts with @.`)
    if (typeof property?.name !== 'string' || !property.name.trim()) problems.push(`The column "${property?.id}" has no name.`)
    else if (!property.deleted && names.has(property.name.toLocaleLowerCase())) problems.push(`Two columns are named "${property.name}".`)
    else if (!property.deleted) names.add(property.name.toLocaleLowerCase())
    if (property?.deleted !== undefined && !TIME.test(property.deleted)) problems.push(`${label}: when it was removed isn't an ISO time.`)
    if (!TYPES.includes(property?.type)) problems.push(`${label}: "${property?.type}" isn't a kind of column.`)
    else if (CHOICES.has(property.type)) problems.push(...optionProblems(property, label))
    else if (property.type === 'relation' && !PLACE.test(property.collection)) problems.push(`${label}: a relation names its collection by its place.`)
    if (property?.format !== undefined && !(property.type === 'number' && ['money', 'percent'].includes(property.format))) problems.push(`${label}: only a number is money or a share.`)
    if (property?.currency !== undefined && !(property.format === 'money' && /^[A-Z]{3}$/.test(property.currency))) problems.push(`${label}: money's currency is its ISO 4217 code, such as EUR.`)
    if (property?.time !== undefined && !(property.type === 'date' && property.time === true)) problems.push(`${label}: only a date takes a time.`)
  }
  if (table.kind && !(ids.get('note')?.type === 'text' && ids.get('area')?.type === 'relation' && !ids.get('note').deleted && !ids.get('area').deleted)) problems.push('A whiteboard keeps its notes\' words in note, and their areas in area.')
  if (!Array.isArray(table.views)) return [...problems, 'The table has no views.']
  /** @type {Set<string>} */
  const views = new Set()
  for (const view of table.views) {
    if (typeof view?.id !== 'string' || views.has(view.id)) problems.push(`A view has no id of its own: "${view?.id}".`)
    views.add(view?.id)
    if (!VIEWS.includes(view?.type)) problems.push(`The view "${view?.id}": "${view?.type}" isn't a kind of view.`)
    if (view?.name !== undefined && !(typeof view.name === 'string' && view.name.trim())) problems.push(`The view "${view.id}" needs a name.`)
    if (view?.type === 'board' && !view.name && !LANES.includes(ids.get(view.group)?.type)) problems.push(`The view "${view.id}": a board is grouped by a select, status, person or checkbox column.`)
    if (view?.type === 'calendar' && !view.name && !(ids.get(view.date)?.type === 'date' && (view.until === undefined || (ids.get(view.until)?.type === 'date' && view.until !== view.date)))) problems.push(`The view "${view.id}": a calendar is by a date column, its rows lasting until another.`)
    for (const sort of [...view?.sort ?? [], ...view?.filter?.and ?? []]) if (!ids.has(sort?.property)) problems.push(`The view "${view.id}" sorts or filters by a column the table hasn't: "${sort?.property}".`)
  }
  return problems
}

/** @param {any} property @param {string} label */
function optionProblems(property, label) {
  if (!Array.isArray(property.options)) return [`${label}: its choices are missing.`]
  /** @type {string[]} */
  const problems = []
  /** @type {Set<string>} */
  const seen = new Set()
  for (const option of property.options) {
    if (typeof option?.name !== 'string' || !option.name.trim() || seen.has(option.name)) problems.push(`${label}: each choice needs a name of its own.`)
    seen.add(option?.name)
    if (property.type === 'status' && !GROUPS.includes(option?.group)) problems.push(`${label}: the step "${option?.name}" is in no group: todo, doing or done.`)
    if (option?.hue !== undefined && !(Number.isInteger(option.hue) && option.hue >= 0 && option.hue < HUES)) problems.push(`${label}: the choice "${option?.name}" has a colour that isn't one of the ${HUES}.`)
  }
  return problems
}

/**
 * The colour a choice shows, one of HUES: the one the person picked, else its place among its column's choices; a step none until one is
 * picked, its group's look saying where it stands. @param {Property} property @param {unknown} name @returns {number | undefined}
 */
export function hueOf(property, name) {
  const at = property.options?.findIndex((option) => option.name === name) ?? -1
  return at < 0 ? undefined : property.options?.[at].hue ?? (property.type === 'status' ? undefined : at % HUES)
}
/** The colour of a person's face, one of HUES, from their name: the same wherever it is read. @param {string} name */
export const hueFor = (name) => [...name.normalize('NFKC').toLocaleLowerCase()].reduce((sum, letter) => (sum * 31 + (letter.codePointAt(0) ?? 0)) % 9973, 0) % HUES

/**
 * What a collection's calendar is by: its date columns, the one its rows are on, the first until one is picked, and the one they last until, if
 * picked; null where no column is a date. @param {Pick<Table, 'properties' | 'views'>} table @returns {{ date: Property, until?: Property, dates: Property[] } | null}
 */
export function calendarOf(table) {
  const dates = table.properties.filter((property) => property.type === 'date' && !property.deleted), view = table.views.find((one) => one.id === 'calendar'), date = dates.find((property) => property.id === view?.date) ?? dates[0]
  return date ? { date, until: dates.find((property) => property.id === view?.until && property !== date), dates } : null
}

/** The views the person kept, each by its name, those taken away left out. @param {Pick<Table, 'views'>} table */
export const keptViews = (table) => table.views.filter((view) => view.name && !view.deleted)
/**
 * What a view shows: the kept view of that id, else one proposed to this person under it (among theirs, with a name; D755), else the collection's own
 * arrangement, with what the person arranged of it since and hasn't kept over it.
 * @param {Pick<Table, 'views'>} table @param {string} [id] @param {Record<string, Partial<View>>} [yours] by view @returns {View}
 */
export const viewOf = (table, id, yours) => ((view) => ({ ...view, ...yours?.[view.id], id: view.id }))(keptViews(table).find((view) => view.id === id)
  ?? (id && id !== 'table' && yours?.[id]?.name ? /** @type {View} */ ({ id, type: 'table' }) : table.views.find((view) => view.id === 'table') ?? /** @type {View} */ ({ id: 'table', type: 'table' })))

/** The column that names a collection's rows: its first text column, else its first. @param {Table} table @returns {Property | undefined} */
export const titleOf = (table) => ((live) => live.find((property) => property.type === 'text') ?? live[0])(table.properties.filter((property) => !property.deleted))

/** A column by its id, else by its name in any case. @param {Table} table @param {string} ref @returns {Property | undefined} */
export function propertyOf(table, ref) {
  const key = String(ref).normalize('NFKC').toLocaleLowerCase()
  return table.properties.find((property) => property.id === ref) ?? table.properties.find((property) => !property.deleted && property.name.normalize('NFKC').toLocaleLowerCase() === key)
}

/**
 * What is wrong with a value for a column, in words a brain reads; null when it fits. null clears any
 * cell; a select or a multi-select takes any choice, which grown() adds to it.
 * @param {Property} property @param {unknown} value @returns {string | null}
 */
export function checkCell(property, value) {
  const { name, type } = property
  if (COMPUTED.includes(/** @type {typeof COMPUTED[number]} */ (type))) return `${name} is worked out by Jean: it can't be set.`
  if (value === null) return null
  const choice = (/** @type {unknown} */ v) => typeof v === 'string' && v.trim() !== ''
  const steps = property.options?.map((option) => option.name) ?? []
  const kept = /** @type {[(value: any) => boolean, string]} */ ([(v) => Array.isArray(v) && filesOf(v).length === v.length && v.every((file) => file.type === undefined || typeof file.type === 'string'), 'a list of files, each { name, file }, its file one the collection keeps'])
  const fits = /** @type {Record<Exclude<PropertyType, typeof COMPUTED[number]>, [(value: any) => boolean, string]>} */ ({
    text: [(v) => typeof v === 'string', 'text'],
    number: [(v) => typeof v === 'number' && Number.isFinite(v), 'a number'],
    select: [choice, 'a choice'],
    'multi-select': [(v) => Array.isArray(v) && v.every(choice), 'a list of choices'],
    status: [(v) => steps.includes(v), `one of its steps: ${steps.join(', ')}`],
    date: [isDate, 'a date as 2026-10-21, or 2026-10-21T14:30'],
    checkbox: [(v) => typeof v === 'boolean', 'true or false'],
    link: [(v) => typeof v === 'string' && URL.canParse(v) && /^https?:$/.test(new URL(v).protocol), 'a web address, https://…'],
    email: [(v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'an email address'],
    phone: [(v) => typeof v === 'string' && /^\+?[\d\s().\-/]{3,}$/.test(v) && /\d.*\d.*\d/.test(v), 'a phone number'],
    person: [(v) => typeof v === 'string', 'a name'],
    place: [(v) => typeof v === 'string' || (typeof v?.name === 'string' && ['lat', 'lon'].every((key) => v[key] === undefined || Number.isFinite(v[key]))), 'a place: its name, or { name, lat, lon }'],
    files: kept, picture: kept,
    relation: [(v) => typeof v === 'string' && ULID.test(v), 'a row of its collection, by its name or its id'],
  })
  const [check, what] = fits[/** @type {Exclude<PropertyType, typeof COMPUTED[number]>} */ (type)]
  return check(value) ? null : `${name} takes ${what}: ${JSON.stringify(value)} isn't one.`
}

/** The files a picture's or a files cell names, each `{ name, file, type? }`, its file one the collection keeps. @param {unknown} value @returns {{ name: string, file: string, type?: string }[]} */
export const filesOf = (value) => (Array.isArray(value) ? value.filter((file) => typeof file?.name === 'string' && FILE.test(file?.file)) : [])

/**
 * A value as a column of another kind holds it: its text as a number, a date, a link, choices by commas, the row `named` so…;
 * undefined when it has none there, a box's tick among them, so that its cell stays as it was, to come back with the kind.
 * @param {Property} property @param {unknown} value @param {(name: string) => unknown} [named] a row of a relation's collection by its name
 * @returns {unknown}
 */
export function converted(property, value, named) {
  const text = Array.isArray(value) ? value.map((/** @type {{ name?: unknown } | null} */ one) => one?.name ?? one).join(', ') : typeof value === 'string' || typeof value === 'number' ? String(value) : /** @type {{ name?: unknown } | null} */ (value)?.name
  if (typeof text !== 'string' || !text.trim()) return undefined
  const next = property.type === 'number' ? Number(text.replace(/\s/g, '').replace(',', '.')) : property.type === 'multi-select' ? text.split(/[,،、]/).map((one) => one.trim()).filter(Boolean) : property.type === 'relation' ? named?.(text) : text.trim()
  return checkCell(property, next) ? undefined : next
}

/**
 * The table with the choices its selects don't have yet among `values` (by column id), in the order
 * they come; null when it has them all.
 * @param {Table} table @param {Record<string, unknown>[]} values @param {string} at
 * @returns {Table | null}
 */
export function grown(table, values, at) {
  let more = false
  const properties = table.properties.map((property) => {
    if (property.type !== 'select' && property.type !== 'multi-select') return property
    const names = new Set(property.options?.map((option) => option.name))
    const added = values.flatMap((set) => [set[property.id]].flat()).filter((value) => typeof value === 'string' && value.trim() && !names.has(value) && names.add(value))
    if (!added.length) return property
    more = true
    return { ...property, options: [...property.options ?? [], ...added.map((name) => ({ name: String(name) }))], ...(property.gone && { gone: property.gone.filter((name) => !added.includes(name)) }) }
  })
  return more ? { ...table, properties, changed: at } : null
}

/**
 * The table renamed, or a column added (at the end or `at` a place among them all), renamed, made another kind, moved before or after another, taken away or brought back, or its
 * rows put in an order, as the user changes it in its view, or what its table view filters, hides and works out, given or made from it, or a Formula's
 * formula, or a choice's colour, or a column's choices as given, those taken away kept as gone, or a date's time of day, or what its calendar is by, or a view (`of`, else the collection's own) arranged, kept under a name with what it
 * shows (the collection's own then whole again, its feet staying), renamed or taken away, each formula naming a column renamed written with its new name: a name
 * another column has gets a number, an empty one changes nothing, the last column stays, a board goes with its column's choices, and a
 * select or a status added or made groups one when there is none.
 * @param {Table} table
 * @param {{ name?: string, add?: { name: string, type: string, at?: number, collection?: string, options?: string[] }, rename?: { id: string, name: string }, retype?: { id: string, type: string, collection?: string, options?: string[] }, move?: { id: string, to: string, after: boolean }, remove?: string, restore?: string, order?: string[], formula?: { id: string, text: string }, choices?: { id: string, options: Option[] }, hue?: { id: string, name: string, hue?: number }, time?: { id: string, on: boolean }, calendar?: { date?: string, until?: string }, number?: { id: string, format?: 'money' | 'percent', currency?: string }, view?: Partial<View> | ((view: View) => Partial<View>), of?: string, keep?: Partial<View> & { name: string, from?: string }, named?: { id: string, name: string }, drop?: string }} edit
 * @param {string} at @returns {Table}
 */
export function reshape(table, edit, at) {
  const live = table.properties.filter((property) => !property.deleted)
  /** A name no other column has. @param {string} name @param {string} [id] the column's own */
  const free = (name, id) => {
    const taken = new Set(live.filter((property) => property.id !== id).map((property) => property.name.toLocaleLowerCase()))
    let n = 1
    while (taken.has((n > 1 ? `${name} ${n}` : name).toLocaleLowerCase())) n++
    return n > 1 ? `${name} ${n}` : name
  }
  let { name, properties, views } = table, made = /** @type {Property | undefined} */ (undefined)
  // A whiteboard's own two columns stay as they are.
  if (table.kind && ['note', 'area'].some((id) => id === edit.remove || id === edit.retype?.id)) return table
  if (edit.name?.trim()) name = edit.name.trim()
  if (edit.add) {
    made = propertyFrom({ ...edit.add, name: free(edit.add.name.trim()) }, new Set(properties.map((one) => one.id)))
    const place = edit.add.at ?? properties.length
    properties = [...properties.slice(0, place), made, ...properties.slice(place)]
  }
  const renamed = edit.rename?.name.trim()
  if (edit.rename && renamed) {
    const { id } = edit.rename, name = free(renamed, id)
    properties = properties.map((property) => (property.id === id ? { ...property, name } : property.formula ? { ...property, formula: rewritten(property.formula, live, id, name) } : property))
  }
  if (edit.formula) properties = properties.map((property) => (property.id === edit.formula?.id ? { ...property, formula: edit.formula.text } : property))
  if (edit.choices) properties = properties.map(({ gone = [], ...property }) => (property.id === edit.choices?.id ? ((options, left) => ({ ...property, options, ...(left.length && { gone: left }) }))(edit.choices.options, [...new Set([...gone, ...(property.options ?? []).map((option) => option.name)])].filter((name) => !edit.choices?.options.some((option) => option.name === name))) : { ...property, ...(gone.length && { gone }) }))
  // A date with a time of day, or without one again.
  if (edit.time) properties = properties.map((property) => (property.id === edit.time?.id && property.type === 'date' ? (({ time, ...plain }) => ({ ...plain, ...(edit.time?.on && { time: /** @type {const} */ (true) }) }))(property) : property))
  // A choice's colour picked, or none again, its place's then.
  if (edit.hue) properties = properties.map((property) => (property.id === edit.hue?.id ? { ...property, options: property.options?.map(({ hue, ...option }) => ({ ...option, ...(option.name === edit.hue?.name ? edit.hue.hue !== undefined && { hue: edit.hue.hue } : hue !== undefined && { hue }) })) } : property))
  // A number made money in a currency, a share, or a plain number again.
  if (edit.number) properties = properties.map((property) => (property.id === edit.number?.id && property.type === 'number' ? (({ format, currency, ...plain }) => ({ ...plain, ...(edit.number?.format && { format: edit.number.format }), ...(edit.number?.format === 'money' && { currency: edit.number.currency }) }))(property) : property))
  // Another kind keeps its id, its name and the choices it had, as names; a relation, the collection it is to unless given another.
  if (edit.retype) properties = properties.map((property) => (property.id === edit.retype?.id ? (made = Object.assign(propertyFrom({ ...property, ...edit.retype }, new Set()), { id: property.id })) : property))
  if (edit.move) {
    const { id, to, after } = edit.move, moved = properties.find((property) => property.id === id), rest = properties.filter((property) => property.id !== id), i = rest.findIndex((property) => property.id === to)
    if (moved && i >= 0) properties = [...rest.slice(0, i + (after ? 1 : 0)), moved, ...rest.slice(i + (after ? 1 : 0))]
  }
  if (edit.remove && live.length > 1) properties = properties.map((property) => (property.id === edit.remove ? { ...property, deleted: at } : property))
  // Brought back where it was, numbered if another has its name by then.
  if (edit.restore) properties = properties.map((property) => (property.id === edit.restore && property.deleted ? (({ deleted, ...back }) => ({ ...back, name: free(back.name, back.id) }))(property) : property))
  views = views.filter((view) => view.id !== 'board' || properties.some((property) => property.id === view.group && LANES.includes(property.type)))
  if ((made?.type === 'select' || made?.type === 'status') && !table.kind && !views.some((view) => view.id === 'board')) views = [...views, { id: 'board', type: 'board', group: made.id }]
  /** A view with what it holds alone, nothing where it was told to hold none. @param {View} view @returns {View} */
  const held = (view) => /** @type {View} */ (Object.fromEntries(Object.entries(view).filter(([, value]) => value != null)))
  if (edit.view) views = views.map((view) => (view.id === (edit.of ?? 'table') ? held({ ...view, ...(typeof edit.view === 'function' ? edit.view(view) : edit.view), id: view.id }) : view))
  // A view kept under a name, with what it shows: an id of its own, from when. The collection's own arrangement, kept as it is, is whole again;
  // kept with anything one person arranged over it, it stays as it is for the others.
  const { from = 'table', ...shown } = edit.keep ?? { name: '' }, source = shown.name.trim() && views.find((view) => view.id === from)
  if (source) {
    let id = `v${at.replace(/\D/g, '')}`
    while (views.some((view) => view.id === id)) id += '0'
    const kept = held({ ...source, ...shown, id, name: shown.name.trim() }), moved = source.id === 'table' && Object.keys(shown).every((key) => key === 'name' || key === 'type')
    views = [...views.map((view) => (moved && view === source ? (({ group, colour, filter, hidden, sort, ...whole }) => whole)(view) : view)), kept]
  }
  if (edit.named?.name.trim()) views = views.map((view) => (view.id === edit.named?.id && view.name ? { ...view, name: edit.named.name.trim() } : view))
  if (edit.drop) views = views.map((view) => (view.id === edit.drop && view.name ? { id: view.id, type: view.type, name: view.name, deleted: at } : view))
  // The calendar's date column picked, or the one its rows last until, none with ''; kept while they are dates, a row never lasting until the day it is on.
  const was = calendarOf({ ...table, properties, views }), dated = (/** @type {string | undefined} */ id) => was?.dates.find((property) => property.id === id)
  const [date, until] = [dated(edit.calendar?.date) ?? was?.date, edit.calendar?.until === undefined ? was?.until : dated(edit.calendar.until)]
  views = [...views.filter((view) => view.id !== 'calendar'), ...(date && (edit.calendar || views.some((view) => view.id === 'calendar' && dated(view.date))) ? [/** @type {View} */ ({ id: 'calendar', type: 'calendar', date: date.id, ...(until && until !== date && { until: until.id }) })] : [])]
  return { ...table, name, properties, views, ...(edit.order && { order: edit.order }), changed: at }
}

/** Whether a cell is a whiteboard's own (D747): what kind of row it is and where it lies, written by the person and Jean's code alone. @param {string} key */
export const isOwn = (key) => key[0] === '@'
/**
 * What is wrong with a whiteboard's own cell, in words; null when it fits: an area, a text, a drawn line or an arrow (a note has no kind), an arrow's two rows; where it
 * lies, an area's id or none (the ground), in whole units of the board; a text's size; a line's points from its corner, x and y in turn, at
 * most 2,000; its ink, or an area colour's place; a note's colour, one of those places. null clears it. @param {string} key @param {unknown} value
 */
export function ownProblem(key, value) {
  const whole = (/** @type {unknown} */ n) => Number.isInteger(n) && Math.abs(/** @type {number} */ (n)) <= 1e6, it = /** @type {any} */ (value), hue = () => Number.isInteger(it) && it >= 0 && it < 7
  const fits = /** @type {Record<string, () => boolean>} */ ({ '@kind': () => ['area', 'text', 'line', 'arrow'].includes(it), '@ends': () => Array.isArray(it) && it.length === 2 && it.every((id) => ULID.test(id)) && it[0] !== it[1], '@spot': () => (it?.area === null || ULID.test(it?.area)) && whole(it.x) && whole(it.y),
    '@size': () => it === 'title' || it === 'line', '@path': () => Array.isArray(it) && it.length % 2 === 0 && it.length <= 4000 && it.every(whole), '@ink': () => it === 'ink' || hue(), '@hue': hue })[key]
  return value === null || fits?.() ? null : `${key} can't be ${JSON.stringify(value)?.slice(0, 40)}.`
}
/** A row's kind on a whiteboard: an area, a text, a drawn line, an arrow, else a note, as every row of a collection is. @param {{ cells: Record<string, unknown> }} row */
export const kindOf = (row) => /** @type {'note' | 'area' | 'text' | 'line' | 'arrow'} */ (row.cells['@kind'] ?? 'note')
/** What a grid, a workbook, a list or paper shows of a collection's rows: a whiteboard's notes alone. @template {{ cells: Record<string, unknown> }} R @param {R[]} rows */
export const notesOf = (rows) => rows.filter((row) => kindOf(row) === 'note')
/**
 * Where a whiteboard's row lies: its spot, while the area it names is the row's own and is still there (an area's, and one on the ground,
 * name none); else undefined, in its area's flow, or on the shelf. @param {{ cells: Record<string, unknown> }} row @param {Set<unknown>} areas their ids
 * @returns {{ area: string | null, x: number, y: number } | undefined}
 */
export const spotOf = (row, areas) => ((spot, area) => (spot?.area === area ? spot : undefined))(/** @type {any} */ (row.cells['@spot']), areas.has(row.cells.area) ? row.cells.area : null)
/** A whiteboard's notes as a grid or paper lists them: by area, in the order they were made, then those in none; in each, those placed by hand first, top to bottom, from the start. @template {{ id: string, cells: Record<string, unknown> }} R @param {R[]} rows */
export function arranged(rows) {
  const areas = rows.flatMap((row) => (kindOf(row) === 'area' ? [row.id] : [])), ids = new Set(areas)
  const key = (/** @type {R} */ row) => ((spot, area) => [area < 0 ? areas.length : area, spot ? 0 : 1, spot?.y ?? 0, spot?.x ?? 0])(spotOf(row, ids), areas.indexOf(String(row.cells.area)))
  return notesOf(rows).map((row, i) => ({ row, at: [...key(row), i] })).sort((a, b) => a.at.reduce((by, n, i) => by || n - b.at[i], 0)).map(({ row }) => row)
}

/**
 * A region's currency, by its ISO 3166 code: the euro's where it is, else the one ISO 4217 names after it (US, USD), but three that start a fund's
 * code; the euro's when none does. @param {string} [region]
 */
export const currencyOf = (region = '') => (/^(AT|BE|CY|DE|EE|ES|FI|FR|GR|HR|IE|IT|LT|LU|LV|MT|NL|PT|SI|SK|AD|MC|SM|VA|ME|XK)$/.test(region) ? 'EUR'
  : ({ CH: 'CHF', CL: 'CLP', UY: 'UYU' })[region] ?? ((/^[A-Z]{2}$/.test(region) && Intl.supportedValuesOf('currency').find((code) => code.startsWith(region))) || 'EUR'))

/** A date, or a date and time, as ISO 8601 writes it, that is on the calendar. @param {unknown} value */
function isDate(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value)
  if (!match) return false
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return day.getUTCMonth() === Number(match[2]) - 1 && day.getUTCDate() === Number(match[3])
}

/**
 * Two copies' collection.json after Sync: the newer copy's, with the columns and views only the other
 * has, and each select's, multi-select's or status's choices from both, so that no cell's value
 * loses its choice; a view taken away on either stays so; what the user kept, the later. The same column changed on both copies: the newer
 * copy's wins, whole.
 * @param {Table} a @param {Table} b @returns {Table}
 */
export function mergeTables(a, b) {
  const [newer, older] = a.changed > b.changed || (a.changed === b.changed && canonical(a) >= canonical(b)) ? [a, b] : [b, a]
  const properties = union(newer.properties, older.properties, (mine, theirs) => (mine.options && theirs.options
    ? { ...mine, options: [...mine.options, ...theirs.options.filter((option) => !mine.options?.some((kept) => kept.name === option.name) && !mine.gone?.includes(option.name))] }
    : mine))
  const kept = [newer.kept, older.kept].filter(Boolean).sort().at(-1)
  return { ...newer, properties, views: union(newer.views, older.views, (mine, theirs) => (theirs.deleted && !mine.deleted ? theirs : mine)), ...(kept && { kept }) }
}

/**
 * @template {{ id: string }} T @param {T[]} mine @param {T[]} theirs @param {(mine: T, theirs: T) => T} both
 * @returns {T[]}
 */
const union = (mine, theirs, both) => [
  ...mine.map((item) => {
    const other = theirs.find((one) => one.id === item.id)
    return other ? both(item, other) : item
  }),
  ...theirs.filter((item) => !mine.some((one) => one.id === item.id)),
]

/** JSON with every object's keys in order, so the same value reads the same however it was written. @param {unknown} value */
export const canonical = (value) => JSON.stringify(value, (_, part) => (part && typeof part === 'object' && !Array.isArray(part)
  ? Object.fromEntries(Object.entries(part).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
  : part)) ?? 'null'
