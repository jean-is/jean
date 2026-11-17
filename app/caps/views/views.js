// SPDX-License-Identifier: MIT
// A view a brain proposes of a collection (D755), from what its table_view sends (caps/tables/tool.js): checked against the collection's
// columns, what is wrong said in words a brain reads, and made what a view holds (caps/tables/table.js `View`). Proposing changes nothing:
// the view is the person's alone, to keep or dismiss (caps/tables/view.js). Pure, so Node's tests and the measure of brains run it
// (scripts/views.js); in a folder of its own, fetched as a brain first proposes one.
import { propertyOf, titleOf, calendarOf } from '../tables/table.js'

/** @import { Table, Property, View, Rule } from '../tables/table.js' */

const OPS = ['is', 'is-not', 'contains', 'does-not-contain', 'is-empty', 'is-not-empty', 'greater-than', 'less-than', 'at-least', 'at-most']
/** Other words brains write for a way to compare. */
const ALSO = /** @type {Record<string, string>} */ ({ equals: 'is', '=': 'is', 'not-equals': 'is-not', '!=': 'is-not', 'not-contains': 'does-not-contain', after: 'greater-than', '>': 'greater-than',
  before: 'less-than', '<': 'less-than', '>=': 'at-least', 'greater-than-or-equal': 'at-least', 'on-or-after': 'at-least', '<=': 'at-most', 'less-than-or-equal': 'at-most', 'on-or-before': 'at-most' })
const SHOWS = ['table', 'board', 'gallery', 'calendar']
/** The kinds rows are grouped by, and those that make a board's lanes. */
const GROUPED = /^(select|status|person|checkbox|date)$/, LANES = /^(select|status|person|checkbox)$/
const DATED = /^(date|created-at|changed-at)$/, DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/
/** @param {unknown} value */
const lower = (value) => String(value).trim().normalize('NFKC').toLocaleLowerCase()
/** @param {Table} table */
const live = (table) => table.properties.filter((property) => !property.deleted)

/** A column a brain names, by its name in any case or its id. @param {Table} table @param {unknown} ref */
function column(table, ref) {
  const property = typeof ref === 'string' && ref.trim() ? propertyOf(table, ref.trim()) : undefined
  if (!property || property.deleted) throw new Error(`The table has no column "${ref}": its columns are ${live(table).map((one) => one.name).join(', ')}.`)
  return property
}

/**
 * What a rule compares with, as its column's kind takes it: a box true or false, a number, a date of ISO 8601, a choice by its name as the
 * column writes it, and a person's "@me", whoever looks. @param {Property} property @param {string} op @param {unknown} value
 */
function compared({ name, type, options }, op, value) {
  const text = typeof value === 'string' ? value.trim() : value
  if (text === undefined || text === null || text === '') throw new Error(`Give the rule on "${name}" a value to compare with, or use is-empty.`)
  if (type === 'person' && lower(text) === '@me') return { me: true }
  if (type === 'checkbox') {
    if (typeof text === 'boolean' || /^(true|false|yes|no)$/i.test(String(text))) return text === true || /^(true|yes)$/i.test(String(text))
    throw new Error(`"${name}" is a checkbox: compare it with true or false.`)
  }
  if (type === 'number') {
    const number = typeof text === 'number' ? text : Number(String(text).replace(',', '.'))
    if (!Number.isFinite(number)) throw new Error(`"${name}" holds numbers: compare it with one, such as 100.`)
    return number
  }
  if (DATED.test(type)) {
    if (typeof text !== 'string' || !DATE.test(text)) throw new Error(`"${name}" holds dates: compare it with one written as 2026-10-21.`)
    return text
  }
  if (options && !/than|least|most/.test(op)) {
    const choice = options.find((option) => lower(option.name) === lower(text))
    if (!choice) throw new Error(`"${name}" has no choice "${value}": its choices are ${options.map((option) => option.name).join(', ')}.`)
    return choice.name
  }
  return text
}

/**
 * The view a brain's table_view asks for, checked: its name, how it shows, the rules a row meets, the column it sorts by, the one it
 * groups by and those it hides, each column by its id. Throws what is wrong, for the brain to send another.
 * @param {Table} table @param {any} args @returns {{ name: string, type: View['type'], filter?: { and: Rule[] }, sort?: NonNullable<View['sort']>, group?: string, hidden?: string[] }}
 */
export function viewFrom(table, args) {
  if (table.kind) throw new Error('A whiteboard has no views.')
  const name = typeof args?.name === 'string' ? args.name.trim().slice(0, 80) : ''
  if (!name) throw new Error('Give the view a name, in the user\'s language.')
  const type = /** @type {View['type']} */ (args.show === undefined || args.show === null ? 'table' : lower(args.show))
  if (!SHOWS.includes(type)) throw new Error(`"${args.show}" isn't a way to show a table: use ${SHOWS.join(', ')}.`)
  const given = args.filter?.and ?? args.filter ?? []
  if (args.filter?.or) throw new Error('A view keeps the rows that meet all its rules: it has no "or".')
  const rules = (Array.isArray(given) ? given : [given]).map((/** @type {any} */ rule) => {
    const property = column(table, rule?.property ?? rule?.column), word = lower(rule?.op ?? 'is').replace(/[\s_]+/g, '-'), op = /** @type {Rule['op']} */ (ALSO[word] ?? word)
    if (!OPS.includes(op)) throw new Error(`"${rule?.op}" isn't a way to compare: use ${OPS.join(', ')}.`)
    return { property: property.id, op, ...(!op.endsWith('empty') && { value: compared(property, op, rule.value) }) }
  })
  const [by] = [args.sort].flat().filter(Boolean), sorted = by && column(table, by.property ?? by.column ?? by)
  let grouped = args.group ? column(table, args.group) : undefined
  if (grouped && !GROUPED.test(grouped.type)) throw new Error(`Rows are grouped by a column of choices, steps, people, boxes or dates: "${grouped.name}" is ${grouped.type}.`)
  if (type === 'board') {
    // A board's lanes: the group asked for, else the board's own, else the first column of steps or choices.
    grouped = grouped ?? live(table).find((property) => property.id === table.views.find((view) => view.id === 'board')?.group) ?? live(table).find((property) => /^(status|select)$/.test(property.type))
    if (!grouped || !LANES.test(grouped.type)) throw new Error('A board\'s lanes are a column of choices, steps, people or boxes: name one in group.')
  }
  if (type === 'gallery' && !live(table).some((property) => property.type === 'picture')) throw new Error('A gallery shows pictures: this table has no picture column.')
  if (type === 'calendar' && !calendarOf(table)) throw new Error('A calendar shows dates: this table has no date column.')
  const hidden = [args.hide ?? []].flat().map((ref) => column(table, ref))
  if (hidden.includes(/** @type {Property} */ (titleOf(table)))) throw new Error(`"${titleOf(table)?.name}" names each row: it can't be hidden.`)
  return { name, type, ...(rules.length && { filter: { and: rules } }), ...(sorted && { sort: [{ property: sorted.id, direction: /^desc/i.test(String(by.direction ?? '')) ? 'descending' : 'ascending' }] }),
    ...(grouped && { group: grouped.id }), ...(hidden.length && { hidden: hidden.map((property) => property.id) }) }
}
