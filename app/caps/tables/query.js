// Rows as a view shows them (D491): filtered, sorted and grouped; and the value of a column Jean works
// out: who made a row and changed it, and when. Columns are named by id or name, and an unknown one is
// refused with the table's columns, in words a brain reads. Pure, so Node's tests run it.
import { propertyOf, GROUPS } from './table.js'

/** @import { Table, Property } from './table.js' */
/** @import { Row } from './changes.js' */
/** @typedef {'is' | 'is-not' | 'contains' | 'does-not-contain' | 'is-empty' | 'is-not-empty' | 'greater-than' | 'less-than' | 'at-least' | 'at-most'} Op */
/** @typedef {{ property: string, op: Op, value?: unknown } | { and: Filter[] } | { or: Filter[] }} Filter */
/** @typedef {{ property: string, direction?: 'ascending' | 'descending' }} Sort */
/** by: 'group', a status's groups (todo, doing, done) rather than its steps. @typedef {{ property: string, by?: 'group' }} Group */

const OPS = ['is', 'is-not', 'contains', 'does-not-contain', 'is-empty', 'is-not-empty', 'greater-than', 'less-than', 'at-least', 'at-most']

/** @param {Table} table @param {string} ref */
function columnOf(table, ref) {
  const property = propertyOf(table, ref)
  if (property && !property.deleted) return property
  throw new Error(`The table has no column "${ref}": its columns are ${table.properties.filter((one) => !one.deleted).map((one) => one.name).join(', ')}.`)
}

/**
 * A cell's value as a view shows it: an unticked box is false, a missing value null.
 * @param {Row} row @param {Property} property @returns {unknown}
 */
export function valueOf(row, property) {
  switch (property.type) {
    case 'created-by': return row.created.by
    case 'created-at': return row.created.at
    case 'changed-by': return row.changed.by
    case 'changed-at': return row.changed.at
    case 'checkbox': return row.cells[property.id] === true
    default: return row.cells[property.id] ?? null
  }
}

/** @param {unknown} value */
const isEmpty = (value) => value === null || value === '' || (Array.isArray(value) && !value.length)
/** @param {unknown} value */
const lower = (value) => (typeof value === 'string' ? value.normalize('NFKC').toLocaleLowerCase() : JSON.stringify(value))
/** @param {unknown} a @param {unknown} b */
const same = (a, b) => (typeof a === 'string' && typeof b === 'string' ? lower(a) === lower(b) : JSON.stringify(a) === JSON.stringify(b))
/** Numbers by size, anything else as text: ISO dates and times by when. @param {unknown} a @param {unknown} b */
const compare = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)

/** @param {Table} table @param {Row} row @param {Filter} filter @returns {boolean} */
function matches(table, row, filter) {
  if ('and' in filter) return filter.and.every((one) => matches(table, row, one))
  if ('or' in filter) return filter.or.some((one) => matches(table, row, one))
  if (!OPS.includes(filter.op)) throw new Error(`"${filter.op}" isn't a way to filter: use ${OPS.join(', ')}.`)
  const value = valueOf(row, columnOf(table, filter.property))
  const contains = () => (Array.isArray(value) ? value.some((one) => same(one, filter.value)) : !isEmpty(value) && lower(String(value)).includes(lower(String(filter.value))))
  switch (filter.op) {
    case 'is': return same(value, filter.value)
    case 'is-not': return !same(value, filter.value)
    case 'contains': return contains()
    case 'does-not-contain': return !contains()
    case 'is-empty': return isEmpty(value)
    case 'is-not-empty': return !isEmpty(value)
    case 'greater-than': return !isEmpty(value) && compare(value, filter.value) > 0
    case 'less-than': return !isEmpty(value) && compare(value, filter.value) < 0
    case 'at-least': return !isEmpty(value) && compare(value, filter.value) >= 0
    default: return !isEmpty(value) && compare(value, filter.value) <= 0
  }
}

/**
 * How two values of a column sort: steps and choices in their order, numbers by size, boxes
 * unticked first, dates by when, text as the language sorts it.
 * @param {Property} property @param {unknown} a @param {unknown} b @param {Intl.Collator} collator
 */
function compareIn(property, a, b, collator) {
  if (property.options && typeof a === 'string' && typeof b === 'string') {
    const names = property.options.map((option) => option.name)
    const [x, y] = [a, b].map((value) => (names.includes(value) ? names.indexOf(value) : names.length))
    return x - y || collator.compare(a, b)
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (property.type === 'date' || property.type.endsWith('-at')) return compare(a, b)
  return collator.compare(Array.isArray(a) ? a.join(', ') : String(a), Array.isArray(b) ? b.join(', ') : String(b))
}

/**
 * The rows a view shows: those its filter keeps, sorted, empty cells last whichever way; with a
 * group, also in groups: each step or choice in its order, even with no row, a row in each of its
 * labels, then the values no choice names, then empty cells.
 * @param {Table} table @param {Row[]} rows
 * @param {{ filter?: Filter, sort?: Sort[], group?: Group, locale?: string }} [view]
 * @returns {{ rows: Row[], groups?: { value: unknown, rows: Row[] }[] }}
 */
export function query(table, rows, { filter, sort = [], group, locale } = {}) {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  const keys = sort.map((one) => ({ property: columnOf(table, one.property), down: one.direction === 'descending' }))
  const shown = rows.filter((row) => !filter || matches(table, row, filter)).sort((a, b) => {
    for (const { property, down } of keys) {
      const [x, y] = [a, b].map((row) => valueOf(row, property))
      if (isEmpty(x) || isEmpty(y)) {
        if (isEmpty(x) !== isEmpty(y)) return isEmpty(x) ? 1 : -1
        continue
      }
      const order = compareIn(property, x, y, collator)
      if (order) return down ? -order : order
    }
    return 0
  })
  if (!group) return { rows: shown }
  const property = columnOf(table, group.property)
  const byGroup = group.by === 'group' && property.type === 'status'
  /** @param {Row} row @returns {unknown[]} */
  const valuesOf = (row) => {
    const value = valueOf(row, property)
    const values = Array.isArray(value) ? value : [value]
    if (!values.length || isEmpty(value)) return [null]
    return byGroup ? values.map((one) => property.options?.find((option) => option.name === one)?.group ?? null) : values
  }
  const found = shown.flatMap(valuesOf)
  /** @type {unknown[]} */
  const named = byGroup ? [...GROUPS] : property.type === 'checkbox' ? [false, true] : property.options?.map((option) => option.name) ?? []
  const others = [...new Set(found.filter((value) => value !== null && !named.includes(value)))]
    .sort((a, b) => compareIn(property, a, b, collator))
  const values = [...named, ...others, ...(found.includes(null) ? [null] : [])]
  return { rows: shown, groups: values.map((value) => ({ value, rows: shown.filter((row) => valuesOf(row).some((one) => one === value)) })) }
}
