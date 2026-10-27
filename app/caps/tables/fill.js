// What a part of a page shows of a collection (D633), worked out by Jean so that the page shows the rows as they are and follows
// them (./tables.js, `follow`): the lines a brain writes for that part (../interactive/parts.js). A table's heads, then its rows, of
// the columns its first line names or those its table view shows; a chart's labels, then the sum of a column (`sum`) or the count of
// rows for each value of a column (`by`), a date's by month; key figures, each line's `sum <column>` or `count` worked out; a form's
// fields, one for each column it names or every column a row is made with, by its kind. Pure, so Node's tests run it.
import { query, total, valueOf } from './query.js'
import { propertyOf } from './table.js'
import { said } from './export.js'

/** @import { Table, Property } from './table.js' */
/** @import { Row } from './changes.js' */
/** @typedef {{ tag: string, attrs: Record<string, string>, text: string }} Part */
/** @typedef {{ locales: string[], labels: { yes: string, no: string } }} How */

/** The rows a table shows at most. */
const ROWS = 200
/** How a form asks for each kind of column; the others it leaves out. @type {Record<string, (property: Property) => string>} */
const FIELDS = { text: () => '', number: () => 'number', date: () => 'date', checkbox: () => 'no', email: () => 'email', link: () => 'url', phone: () => 'tel', 'multi-select': () => '',
  select: (property) => ((property.options?.length ?? 0) > 1 ? (property.options ?? []).map((option) => option.name).join(', ') : '') }
FIELDS.status = FIELDS.select

/** A value as a part's line holds it: on one line, without `|`. @param {string} text */
const clean = (text) => text.replace(/\s*\n\s*/g, ' ').replaceAll('|', '¦')
/** @param {Part} part */
const lines = (part) => part.text.split('\n').map((line) => line.trim()).filter(Boolean)
/** The live column a part names, by its name or its id. @param {Table} table @param {string} name */
const named = (table, name) => ((property) => (property && !property.deleted ? [property] : []))(propertyOf(table, name.trim()))
/** The columns a line names, split by `|` or commas, else those the table view shows. @param {Table} table @param {string} [line] */
function columns(table, line) {
  const given = (line ?? '').split(/[|,،、]/).flatMap((name) => named(table, name)), hidden = new Set(table.views.find((view) => view.type === 'table')?.hidden ?? [])
  return given.length ? given : table.properties.filter((property) => !property.deleted && !hidden.has(property.id))
}

/** For each value of a column, the rows that hold it, as a chart's labels say it: a date's by month. @param {Table} table @param {Row[]} rows @param {Property} by @param {How} how @param {Map<string, string>} [names] */
function grouped(table, rows, by, how, names) {
  if (!/date|-at$/.test(by.type)) {
    return (query(table, rows, { group: { property: by.id }, names }).groups ?? []).flatMap((group) => (group.value === null ? []
      : [{ label: typeof group.value === 'boolean' ? how.labels[group.value ? 'yes' : 'no'] : String(group.value), rows: group.rows }]))
  }
  const months = /** @type {Map<string, Row[]>} */ (new Map()), month = new Intl.DateTimeFormat(how.locales, { month: 'short', year: 'numeric' })
  for (const row of rows) if (valueOf(row, by)) months.set(String(valueOf(row, by)).slice(0, 7), [...(months.get(String(valueOf(row, by)).slice(0, 7)) ?? []), row])
  return [...months].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, rows]) => ({ label: month.format(new Date(`${key}-01T00:00`)), rows }))
}

/**
 * What a part shows of a collection loaded: its text, and for a form the columns its fields set, in their order.
 * @param {{ table: Table, rows: Row[], names?: Map<string, string> }} one @param {Part} part @param {How} how
 * @returns {{ text: string, columns?: Property[] }}
 */
export function fill({ table, rows, names }, part, how) {
  const own = lines(part), plain = new Intl.NumberFormat(how.locales)
  if (part.tag === 'app-table') {
    const shown = columns(table, own[0])
    return { text: [shown.map((property) => property.name), ...rows.slice(0, ROWS).map((row) => shown.map((property) => said(row, property, { names, ...how })))].map((cells) => cells.map(clean).join(' | ')).join('\n') }
  }
  if (part.tag === 'app-figures') {
    return { text: own.map((line) => {
      const [what, words = ''] = line.split(/\|(.*)/s), [, kind = '', ref = ''] = /^(sum|count)\b(.*)$/i.exec(what.trim()) ?? [], [property] = ref.trim() ? named(table, ref) : []
      const value = /^sum$/i.test(kind) && property ? total(rows, property, 'sum') : /^count$/i.test(kind) ? (property ? Math.round(total(rows, property, 'percent') * rows.length) : rows.length) : null
      return value === null ? line : `${plain.format(value)} |${words}`
    }).join('\n') }
  }
  if (part.tag === 'app-chart') {
    const [by] = named(table, part.attrs.by ?? ''), [summed] = part.attrs.sum ? named(table, part.attrs.sum) : []
    const groups = by ? grouped(table, rows, by, how, names) : []
    return { text: by ? `${groups.map((group) => clean(group.label)).join(' | ')}\n${clean(summed?.name ?? table.name).replaceAll(':', ' ')}: ${groups.map((group) => (summed ? total(group.rows, summed, 'sum') : group.rows.length)).join(', ')}` : '' }
  }
  const fields = (own.length ? own.flatMap((line) => named(table, line.split(':')[0])) : table.properties).filter((property) => !property.deleted && FIELDS[property.type])
  return { text: fields.map((property) => `${clean(property.name).replace(/[:=]/g, ' ')}: ${FIELDS[property.type](property)}`).join('\n'), columns: fields }
}
