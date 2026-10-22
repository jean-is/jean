// A table Jean keeps (D473, D474, D491): its table.json, the columns (properties) and views, read and
// checked; a table made from what a brain's table_create sends; and two copies' table.json merged after
// Sync, column by column. A column's id comes from its first name and never changes, so renaming it
// rewrites no change. A status a brain gives no steps is a select, and a select's choices grow as values
// come (D491), as Notion's do. Pure, so Node's tests run it.
import { slug } from '../../core/settings.js'

export const FORMAT = 1
/** What a brain may make, in the order table_create lists them. */
export const MADE = /** @type {const} */ (['text', 'number', 'select', 'multi-select', 'status', 'date', 'checkbox', 'link', 'email', 'phone', 'person', 'place', 'files'])
/** Worked out by Jean, never set. */
export const COMPUTED = /** @type {const} */ (['created-by', 'created-at', 'changed-by', 'changed-at'])
export const TYPES = /** @type {const} */ ([...MADE, ...COMPUTED])
export const GROUPS = /** @type {const} */ (['todo', 'doing', 'done'])
const VIEWS = ['table', 'board', 'list', 'calendar', 'gallery']
const CHOICES = new Set(['select', 'multi-select', 'status'])
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
export const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
// The words brains use for kinds of columns, as Jean's.
const ALIASES = /** @type {Record<string, PropertyType>} */ ({
  string: 'text', title: 'text', 'rich-text': 'text', integer: 'number', float: 'number', decimal: 'number', currency: 'number', money: 'number',
  url: 'link', boolean: 'checkbox', bool: 'checkbox', multiselect: 'multi-select', tags: 'multi-select', datetime: 'date', 'date-time': 'date',
  tel: 'phone', 'phone-number': 'phone', location: 'place', address: 'place', user: 'person', people: 'person', file: 'files', attachments: 'files',
})

/** @typedef {typeof TYPES[number]} PropertyType */
/** @typedef {{ name: string, group?: typeof GROUPS[number] }} Option */
/** A column; deleted: when it was removed. @typedef {{ id: string, name: string, type: PropertyType, options?: Option[], deleted?: string }} Property */
/** @typedef {{ property: string, direction?: 'ascending' | 'descending' }} Sort */
/** @typedef {{ id: string, type: 'table' | 'board' | 'list' | 'calendar' | 'gallery', name?: string, group?: string, sort?: Sort[], filter?: unknown }} View */
/**
 * kept: the time of Jean's latest change the user kept, after which Jean's changes are marked (D491).
 * @typedef {{ format: 1, id: string, name: string, author: string, created: string, changed: string, properties: Property[], views: View[], kept?: string }} Table
 */

/** A column's id: its first name, in any script, lower case. @param {string} name @param {Set<string>} taken */
function idFor(name, taken) {
  const base = name.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'column'
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  taken.add(id)
  return id
}

/** Where a table's files are: tables/<ulid>-<slug>/, never renamed. @param {Pick<Table, 'id' | 'name'>} table */
export const folderOf = (table) => `tables/${table.id}-${slug(table.name) || 'table'}`

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
  if (CHOICES.has(type)) {
    const options = [...new Set((Array.isArray(column.options) ? column.options : []).map((/** @type {any} */ option) => String((option && typeof option === 'object' ? option.name : option) ?? '').trim()).filter(Boolean))]
    // A status with fewer than two steps is a select, whose choices come as values do (D491).
    if (type === 'status' && options.length < 2) property.type = type = 'select'
    property.options = options.map((option, i) => (type === 'status' ? { name: option, group: GROUPS[i === 0 ? 0 : i === options.length - 1 ? 2 : 1] } : { name: option }))
  }
  return property
}

/** A table.json's text as a table; throws what is wrong with it. @param {string} text @returns {Table} */
export function readTable(text) {
  let table
  try {
    table = JSON.parse(text)
  } catch (error) {
    throw new Error(`table.json isn't JSON: ${/** @type {Error} */ (error).message}`)
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
    if (typeof property?.name !== 'string' || !property.name.trim()) problems.push(`The column "${property?.id}" has no name.`)
    else if (!property.deleted && names.has(property.name.toLocaleLowerCase())) problems.push(`Two columns are named "${property.name}".`)
    else if (!property.deleted) names.add(property.name.toLocaleLowerCase())
    if (property?.deleted !== undefined && !TIME.test(property.deleted)) problems.push(`${label}: when it was removed isn't an ISO time.`)
    if (!TYPES.includes(property?.type)) problems.push(`${label}: "${property?.type}" isn't a kind of column.`)
    else if (CHOICES.has(property.type)) problems.push(...optionProblems(property, label))
  }
  if (!Array.isArray(table.views)) return [...problems, 'The table has no views.']
  /** @type {Set<string>} */
  const views = new Set()
  for (const view of table.views) {
    if (typeof view?.id !== 'string' || views.has(view.id)) problems.push(`A view has no id of its own: "${view?.id}".`)
    views.add(view?.id)
    if (!VIEWS.includes(view?.type)) problems.push(`The view "${view?.id}": "${view?.type}" isn't a kind of view.`)
    if (view?.type === 'board' && !['select', 'status'].includes(ids.get(view.group)?.type)) problems.push(`The view "${view.id}": a board is grouped by a select or status column.`)
    for (const sort of view?.sort ?? []) if (!ids.has(sort?.property)) problems.push(`The view "${view.id}" sorts by a column the table hasn't: "${sort?.property}".`)
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
  }
  return problems
}

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
  if (COMPUTED.includes(/** @type {any} */ (type))) return `${name} is worked out by Jean: it can't be set.`
  if (value === null) return null
  const choice = (/** @type {unknown} */ v) => typeof v === 'string' && v.trim() !== ''
  const steps = property.options?.map((option) => option.name) ?? []
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
    files: [(v) => Array.isArray(v) && v.every((file) => typeof file?.name === 'string'), 'a list of files, each { name, file }'],
  })
  const [check, what] = fits[/** @type {Exclude<PropertyType, typeof COMPUTED[number]>} */ (type)]
  return check(value) ? null : `${name} takes ${what}: ${JSON.stringify(value)} isn't one.`
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
    return { ...property, options: [...property.options ?? [], ...added.map((name) => ({ name: String(name) }))] }
  })
  return more ? { ...table, properties, changed: at } : null
}

/**
 * The table renamed, or a column added, renamed or taken away, as the user changes it in its view (D494): a name
 * another column has gets a number, an empty one changes nothing, the last column stays, and a select added
 * groups a board when there is none. @param {Table} table
 * @param {{ name?: string, add?: { name: string, type: string }, rename?: { id: string, name: string }, remove?: string }} edit @param {string} at
 * @returns {Table}
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
  let { name, properties, views } = table
  if (edit.name?.trim()) name = edit.name.trim()
  if (edit.add) {
    const property = propertyFrom({ ...edit.add, name: free(edit.add.name.trim()) }, new Set(properties.map((one) => one.id)))
    properties = [...properties, property]
    if (property.type === 'select' && !views.some((view) => view.type === 'board')) views = [...views, { id: 'board', type: 'board', group: property.id }]
  }
  const renamed = edit.rename?.name.trim()
  if (edit.rename && renamed) properties = properties.map((property) => (property.id === edit.rename?.id ? { ...property, name: free(renamed, property.id) } : property))
  if (edit.remove && live.length > 1) properties = properties.map((property) => (property.id === edit.remove ? { ...property, deleted: at } : property))
  return { ...table, name, properties, views, changed: at }
}

/** A date, or a date and time, as ISO 8601 writes it, that is on the calendar. @param {unknown} value */
function isDate(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value)
  if (!match) return false
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return day.getUTCMonth() === Number(match[2]) - 1 && day.getUTCDate() === Number(match[3])
}

/**
 * Two copies' table.json after Sync: the newer copy's, with the columns and views only the other
 * has, and each select's, multi-select's or status's choices from both, so that no cell's value
 * loses its choice; what the user kept, the later. The same column changed on both copies: the newer
 * copy's wins, whole.
 * @param {Table} a @param {Table} b @returns {Table}
 */
export function mergeTables(a, b) {
  const [newer, older] = a.changed > b.changed || (a.changed === b.changed && canonical(a) >= canonical(b)) ? [a, b] : [b, a]
  const properties = union(newer.properties, older.properties, (mine, theirs) => (mine.options && theirs.options
    ? { ...mine, options: [...mine.options, ...theirs.options.filter((option) => !mine.options?.some((kept) => kept.name === option.name))] }
    : mine))
  const kept = [newer.kept, older.kept].filter(Boolean).sort().at(-1)
  return { ...newer, properties, views: union(newer.views, older.views, (mine) => mine), ...(kept && { kept }) }
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
