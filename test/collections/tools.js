// SPDX-License-Identifier: MIT
// Collections phase 0b, the tools measured (scripts/collections.js), outside the app: table_rows in two forms, each answered over a
// seeded collection as Tables answers (app/caps/tables/tables.js, `rowsTool`), and table_create with a `format` on its number columns.
//   A: today's table_rows, word for word: 200 rows at most, a JSON filter, then "and N more: filter them."
//   B: the plan's ("Jean answers from every row, and shows its working"): `where` in the words a page's parts take (`rules()`,
//      app/caps/tables/fill.js), and `sum`, `count` and `by`, worked out on every row the where keeps, never the first 200: the
//      figures, how many rows they count and how many had no value. Rows themselves still stop at 200. A `filter`, which a
//      conversation begun before knows, is still taken, and said nowhere.
//   C: B's answers under fewer words, tried to see how few do.
import { query, valueOf } from '../../app/caps/tables/query.js'
import { rules } from '../../app/caps/tables/fill.js'
import { propertyOf } from '../../app/caps/tables/table.js'
import { tableCreate } from '../../app/caps/tables/tool.js'

/** @import { Table, Property } from '../../app/caps/tables/table.js' */
/** @import { Row } from '../../app/caps/tables/changes.js' */
/** @import { ToolSpec } from '../../app/core/types.js' */
/** A collection read, as Tables holds one. @typedef {{ folder: string, table: Table, rows: Row[] }} Loaded */
/** today, which a `where`'s dates count from. @typedef {{ locales: string[], labels: { yes: string, no: string }, today: Date }} How */
/** What sum, count and by give: the rows counted, a column's sum and how many of them had no number there, and the same for each value of `by`, null for the rows with none. @typedef {{ rows: number, sum?: number, empty?: number, groups?: { value: unknown, rows: number, sum?: number, empty?: number }[] }} Figures */

/** How many rows table_rows gives at most, as Tables has it. */
export const ROWS = 200

/** A collection's columns as the brain reads them, as Tables says them (`columnsOf`); no collection here has a relation. @param {Loaded} one */
export const columnsOf = ({ table }) => table.properties.filter((property) => !property.deleted)
  .map((property) => `${property.name} (${property.type}${property.options?.length ? `: ${property.options.map((option) => option.name).join(', ')}` : ''})`).join(', ')

/** What the brain hears of a collection open beside the task, in Tables' words. @param {Loaded} one */
export const noteOf = (one) => `The table ${one.table.name} (${one.folder}) is open beside the conversation: ${one.rows.length} rows. Its columns: ${columnsOf(one)}. Read its rows with table_rows.`

const TABLE = { type: 'string', description: 'Its place, as table_create gave it' }

/** A: table_rows as Tables declares it today. @type {ToolSpec} */
export const ROWS_A = {
  name: 'table_rows',
  description: 'Read the rows of a table the user keeps, each with its id, which table_change needs. A filter keeps some: { property, op, value }, op being is, is-not, contains, is-empty, greater-than or less-than.',
  parameters: { type: 'object', required: ['table'], properties: { table: TABLE, filter: { type: 'object' } } },
}

/** The words a `where` takes, as a collection named with @ already tells them (`mentioned()`), with the dates `rules()` reads. */
const WHERE = 'a column, then is, is not, contains, before, after, >, < or is empty, then a value, joined by and; a date can be 2026-10-21, 2026-10, today, this week, this month, last month, this year, last year or last 30 days'

/** B: the plan's table_rows. @type {ToolSpec} */
export const ROWS_B = {
  name: 'table_rows',
  description: `Read the rows of a table the user keeps, each with its id, which table_change needs: 200 at most. For a total or a count, ask for it rather than adding up rows: sum (a number column), count, and by (a column) for a figure per value; they are worked out on every row. where keeps some rows: ${WHERE}.`,
  parameters: { type: 'object', required: ['table'], properties: { table: TABLE, where: { type: 'string', description: 'e.g. Status is Paid and Date is this year' }, sum: { type: 'string', description: 'A number column' }, count: { type: 'boolean' }, by: { type: 'string', description: 'A column' } } },
}

/** B in fewer words, tried beside it: what a `where` takes is left to its example, and to what a refusal says. @type {ToolSpec} */
export const ROWS_C = { ...ROWS_B, description: 'Read the rows of a table the user keeps, each with its id, which table_change needs: 200 at most. For a total or a count, ask for sum (a number column), count or by (a column) rather than adding up rows: they are worked out on every row. where keeps some rows, in words.' }

/** table_change as Tables declares it, so that a brain has the tools it has in Jean. @type {ToolSpec} */
export const CHANGE = {
  name: 'table_change',
  description: 'Add or change rows of a table the user keeps: set each cell by its column\'s name; a row without its id is a new one; delete: true removes a row. The user sees each change, to accept or reject.',
  parameters: { type: 'object', required: ['table', 'rows'], properties: {
    table: TABLE,
    rows: { type: 'array', items: { type: 'object', properties: { row: { type: 'string' }, set: { type: 'object' }, delete: { type: 'boolean' } } } },
    why: { type: 'string', description: 'What it comes from, in a few words, e.g. "the email of 23 October"' },
  } },
}

/** The collection a call names, by its place; throws as Tables does. @param {Loaded[]} all @param {unknown} folder */
export function named(all, folder) {
  const one = all.find((each) => each.folder === String(folder ?? ''))
  if (one) return one
  throw new Error(`There is no table ${folder}. The project's tables: ${all.map((each) => `${each.table.name}: ${each.folder}`).join('; ')}.`)
}

/** Rows as table_rows lists them: 200 at most, each cell by its column's name, then how many more there are. @param {Loaded} one @param {Row[]} rows @param {(more: number) => string} more */
function listed(one, rows, more) {
  const columns = one.table.properties.filter((property) => !property.deleted)
  const lines = rows.slice(0, ROWS).map((row) => JSON.stringify({ row: row.id, ...Object.fromEntries(columns.flatMap((property) => (row.cells[property.id] === undefined ? [] : [[property.name, row.cells[property.id]]]))) }))
  return `${one.table.name} (${one.folder}): ${rows.length} of its ${one.rows.length} rows. Its columns: ${columnsOf(one)}.\n${lines.join('\n')}${rows.length > ROWS ? `\n${more(rows.length - ROWS)}` : ''}`
}

/** A: what table_rows answers today. @param {Loaded} one @param {any} args */
export function rowsA(one, args) {
  const { rows } = query(one.table, one.rows, { ...(args?.filter && { filter: args.filter }) })
  return listed(one, rows, (more) => `and ${more} more: filter them.`)
}

/** A column a call names, live; throws with the collection's columns, as query.js does. @param {Loaded} one @param {unknown} ref */
function columnOf(one, ref) {
  const property = propertyOf(one.table, String(ref).trim())
  if (property && !property.deleted) return property
  throw new Error(`${one.table.name} has no column "${ref}": its columns are ${one.table.properties.filter((each) => !each.deleted).map((each) => each.name).join(', ')}.`)
}

/** Numbers added without a float's dust: to as many decimals as the longest of them has. @param {number[]} numbers */
function added(numbers) {
  const places = Math.min(6, Math.max(0, ...numbers.map((number) => (String(number).split('.')[1] ?? '').length)))
  return Math.round(numbers.reduce((sum, number) => sum + number, 0) * 10 ** places) / 10 ** places
}

/**
 * The rows a call keeps, every one: its `where`, in rules()' words, and a `filter` if it sends one. Throws what it can't read, with the
 * words it takes. @param {Loaded} one @param {any} args @param {How} how
 */
function kept(one, args, how) {
  /** @type {import('../../app/caps/tables/query.js').Filter[]} */
  const filters = args?.filter && typeof args.filter === 'object' ? [args.filter] : []
  if (typeof args?.where === 'string' && args.where.trim()) {
    try { filters.push(rules(one.table, args.where, how)) } catch (error) {
      throw new Error(`where can't be read at "${/** @type {Error} */ (error).message}". It takes ${WHERE}. The columns: ${columnsOf(one)}.`)
    }
  }
  return query(one.table, one.rows, { ...(filters.length && { filter: filters.length > 1 ? { and: filters } : filters[0] }) }).rows
}

/**
 * B's figures, on every row its `where` keeps: how many there are, the sum of a number column and how many of them have no number there,
 * and with `by` the same for each value of that column, a date's by month, a list's by each of its items, in the order of its choices,
 * then the rows with none. @param {Loaded} one @param {any} args @param {How} how @returns {Figures}
 */
export function figures(one, args, how) {
  const rows = kept(one, args, how), sum = args?.sum ? columnOf(one, args.sum) : null, by = args?.by ? columnOf(one, args.by) : null
  if (sum && sum.type !== 'number') throw new Error(`${sum.name} isn't a number column: sum takes ${one.table.properties.filter((each) => !each.deleted && each.type === 'number').map((each) => each.name).join(' or ') || 'none of this table\'s'}.`)
  const worked = (/** @type {Row[]} */ some) => {
    const numbers = sum ? some.map((row) => valueOf(row, sum)).filter((value) => typeof value === 'number') : []
    return { rows: some.length, ...(sum && { sum: added(numbers), empty: some.length - numbers.length }) }
  }
  if (!by) return worked(rows)
  /** @type {Map<unknown, Row[]>} */
  const groups = new Map((by.options ?? []).map((option) => [option.name, []]))
  for (const row of rows) {
    const value = valueOf(row, by), values = Array.isArray(value) ? value : [/date|-at$/.test(by.type) && value ? String(value).slice(0, 7) : value]
    for (const each of values.length ? values : [null]) groups.set(each === '' ? null : each, [...(groups.get(each === '' ? null : each) ?? []), row])
  }
  const order = [...groups].filter(([value, some]) => value !== null && (some.length || by.options)).sort(([a], [b]) => (by.options ? 0 : typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : 1))
  return { ...worked(rows), groups: [...order, ...(groups.get(null)?.length ? [/** @type {[unknown, Row[]]} */ ([null, groups.get(null)])] : [])].map(([value, some]) => ({ value, ...worked(some) })) }
}

/**
 * B: what the plan's table_rows answers. With `sum`, `count` or `by`, figures and no rows; else rows as today, those `where` keeps, and
 * past the 200th a word on how to total them. @param {Loaded} one @param {any} args @param {How} how
 */
export function rowsB(one, args, how) {
  if (!args?.sum && !args?.by && !args?.count) return listed(one, kept(one, args, how), (more) => `and ${more} more, not shown: narrow where to read them, or ask for sum or count, which take every row.`)
  const all = figures(one, args, how), sum = args.sum ? columnOf(one, args.sum) : null, by = args.by ? columnOf(one, args.by) : null
  const said = (/** @type {{ rows: number, sum?: number, empty?: number }} */ each) => `${each.rows} rows${sum ? `, ${sum.name} ${each.sum}${each.empty ? ` (${each.empty} with no ${sum.name})` : ''}` : ''}`
  const head = `${one.table.name} (${one.folder}): ${all.rows} of its ${one.rows.length} rows${typeof args.where === 'string' && args.where.trim() ? ` where ${args.where.trim()}` : ''}, every one of them counted.`
  if (!by) return `${head}\n${sum ? `Sum of ${sum.name}: ${all.sum}, over ${all.rows} rows${all.empty ? `, ${all.empty} of them with no ${sum.name}` : ''}.` : `Count: ${all.rows} rows.`}`
  const label = (/** @type {unknown} */ value) => (value === null ? `No ${by.name}` : typeof value === 'boolean' ? how.labels[value ? 'yes' : 'no'] : String(value))
  return `${head}\nBy ${by.name}${sum ? `, the sum of ${sum.name}` : ''}:\n${(all.groups ?? []).map((group) => `${label(group.value)}: ${said(group)}`).join('\n')}\nAll: ${said(all)}`
}

/** The sentence table_create gains, after the kinds it lists. */
export const FORMAT = 'A number column of money takes format "money" and the user\'s currency (EUR, JPY…); a share takes format "percent".'

/**
 * table_create as Tables declares it in a language, with a `format` and a `currency` its number columns may take (the plan's "A grid
 * that reads"), and one sentence for them before its example. @param {string} lang @returns {ToolSpec}
 */
export function tableCreateFormat(lang) {
  const tool = tableCreate(lang), columns = /** @type {any} */ (tool.parameters).properties.columns
  return { ...tool, description: tool.description.replace(' For plants to water:', ` ${FORMAT} For plants to water:`),
    parameters: { ...tool.parameters, properties: { .../** @type {any} */ (tool.parameters).properties, columns: { ...columns, items: { ...columns.items, properties: { ...columns.items.properties, format: { type: 'string', enum: ['money', 'percent'] }, currency: { type: 'string', description: 'Its code: EUR, JPY…' } } } } } } }
}

/** How many tokens a tool's words and arguments weigh, as the budgets count a prompt: a quarter of its characters. @param {ToolSpec} tool */
export const tokensOf = (tool) => Math.ceil((tool.description.length + JSON.stringify(tool.parameters).length) / 4)
