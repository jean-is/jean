// What a part of a page shows of a collection (D633), worked out by Jean so that the page shows the rows as they are and follows
// them (./tables.js, `follow`): the lines a brain writes for that part (../interactive/parts.js). A table's heads, then its rows, of
// the columns its first line names or those its table view shows; a chart's labels, then the sum of a column (`sum`) or the count of
// rows for each value of a column (`by`), a date's by month; key figures, each line's `sum <column>` or `count` worked out; a form's
// fields, one for each column it names or every column a row is made with, by its kind. A part's `where` keeps only some of the rows
// (D636), in words a brain writes: a column, a way to compare and a value, a date's from today. Pure, so Node's tests run it.
import { query, total, valueOf } from './query.js'
import { propertyOf, converted } from './table.js'
import { said } from './export.js'

/** @import { Table, Property } from './table.js' */
/** @import { Row } from './changes.js' */
/** @import { Filter, Op } from './query.js' */
/** @typedef {{ tag: string, attrs: Record<string, string>, text: string }} Part */
/** today, which a `where`'s dates count from. @typedef {{ locales: string[], labels: { yes: string, no: string }, today: Date }} How */

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

/** Each way a `where` compares, in words or signs, the longer first, onto query.js's: as the Filter menu says them, or table_rows. @type {[RegExp, Op][]} */
const COMPARE = /** @type {[string, Op][]} */ ([['is not empty', 'is-not-empty'], ['is empty', 'is-empty'], ['does not contain', 'does-not-contain'], ['contains', 'contains'], ['is not', 'is-not'], ['!=', 'is-not'], ['≠', 'is-not'], ['at least', 'at-least'], ['>=', 'at-least'], ['≥', 'at-least'],
  ['at most', 'at-most'], ['<=', 'at-most'], ['≤', 'at-most'], ['greater than', 'greater-than'], ['after', 'greater-than'], ['>', 'greater-than'], ['less than', 'less-than'], ['before', 'less-than'], ['<', 'less-than'], ['is', 'is'], ['=', 'is']]).map(([words, op]) => [new RegExp(`^${words.replaceAll(' ', '[\\s-]+')}${/\w$/.test(words) ? '(?=\\s|$)' : ''}`, 'i'), op])
/** The dates a `where` takes: today, this or last week, month or year, the last N days, a day or a month. */
const DATES = /^(?:(today)|(this|last) (week|month|year)|last (\d+) days|(\d{4})-(\d{2})(?:-(\d{2}))?)$/i
/** Text as names are matched, in any case or width; a day as a date column holds it. */
const key = (/** @type {string} */ text) => text.normalize('NFKC').toLocaleLowerCase(), day = (/** @type {Date} */ date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((n) => String(n).padStart(2, '0')).join('-')

/**
 * The days a date's words name, from the first to the one after the last, on the device's calendar, a week from the first day the
 * language's says. @param {string} text @param {How} how @returns {Date[] | undefined}
 */
function span(text, { today, locales }) {
  const [, now, which = '', unit = '', days, y, m, d] = DATES.exec(text.replace(/\s+/g, ' ')) ?? [], [Y, M, D] = [today.getFullYear(), today.getMonth(), today.getDate()], back = Number(/last/i.test(which)), here = /** @type {any} */ (new Intl.Locale(locales[0] ?? 'en'))
  const at = (/** @type {number} */ y, m = 0, d = 1) => new Date(y, m, d), week = D - ((today.getDay() - ((here.getWeekInfo?.() ?? here.weekInfo)?.firstDay ?? 1) + 7) % 7) - 7 * back
  return now ? [at(Y, M, D), at(Y, M, D + 1)] : days ? [at(Y, M, D + 1 - Number(days)), at(Y, M, D + 1)] : y ? (d ? [at(+y, +m - 1, +d), at(+y, +m - 1, +d + 1)] : [at(+y, +m - 1), at(+y, +m)])
    : /week/i.test(unit) ? [at(Y, M, week), at(Y, M, week + 7)] : /month/i.test(unit) ? [at(Y, M - back), at(Y, M - back + 1)] : unit ? [at(Y - back), at(Y - back + 1)] : undefined
}

/**
 * A rule on one value, as its column's kind takes it: a date, the span of days it names, `is` within it, `after` past its last; a box,
 * yes or no; a choice, by its name; a number, as a cell takes it. Null when the column takes no such value.
 * @param {Property} property @param {Op} op @param {string} value @param {How} how @returns {Filter | null}
 */
function one(property, op, value, how) {
  const rule = (/** @type {Op} */ op, /** @type {unknown} */ value) => ({ property: property.id, op, value }), dated = /date|-at$/.test(property.type), [from, to] = (dated && span(value, how)?.map((date) => (property.type === 'date' ? day(date) : date.toISOString()))) || []
  if (dated) return !to ? null : /^(is|contains)$/.test(op) ? { and: [rule('at-least', from), rule('less-than', to)] } : /not/.test(op) ? { or: [rule('less-than', from), rule('at-least', to)] }
    : op === 'greater-than' ? rule('at-least', to) : op === 'at-most' ? rule('less-than', to) : rule(op === 'at-least' ? op : 'less-than', from)
  return ((taken) => (taken === undefined ? null : rule(op, taken)))(property.type === 'checkbox' ? /^(yes|true|✓|checked|ticked)$/i.test(value) || (/^(no|false|✗|un(checked|ticked))$/i.test(value) ? false : undefined)
    : property.options ? property.options.find((option) => key(option.name) === key(value))?.name : property.type === 'number' ? converted(property, value) : value)
}

/**
 * A part's `where` (D636): rules joined by `and`, then by `or`, as SQL joins them, each a column, the longest its words begin with, a way to
 * compare and a value, "A or B" (a choice's "A, B") either of them; an `and` or an `or` that no column follows is its value's own. An empty
 * box is one not ticked. Throws what it can't read. @param {Table} table @param {string} text @param {How} how @returns {Filter}
 */
export function rules(table, text, how) {
  const live = table.properties.filter((property) => !property.deleted).sort((a, b) => b.name.length - a.name.length), begins = (/** @type {string} */ said) => live.find((property) => key(said).startsWith(key(property.name)) && /^(\s|[!=<>≠≥≤]|$)/.test(said.slice(property.name.length)))
  const pieces = (/** @type {string} */ said, /** @type {string} */ word) => said.split(new RegExp(`\\s+${word}\\s+`, 'i')).reduce((/** @type {string[]} */ all, piece) => (all.length && !begins(piece) ? [...all.slice(0, -1), `${all.at(-1)} ${word} ${piece}`] : [...all, piece]), [])
  const read = (/** @type {string} */ said) => {
    const property = begins(said), rest = said.slice(property?.name.length).trim(), [words, op] = COMPARE.find(([words]) => words.test(rest)) ?? []
    if (!property || !words || !op) throw new Error(said)
    if (op.endsWith('empty')) return property.type === 'checkbox' ? { property: property.id, op: /** @type {Op} */ ('is'), value: op === 'is-not-empty' } : { property: property.id, op }
    const value = rest.replace(words, '').trim().replace(/^["'“«「](.*)["'”»」]$/s, '$1').trim(), each = (property.options?.some((option) => key(option.name) === key(value)) ? [value]
      : value.split(property.options ? /\s+or\s+|\s*[,،、]\s*/i : /\s+or\s+/i)).map((value) => one(property, op, value, how))
    if (each.includes(null)) throw new Error(said)
    return each.length === 1 ? /** @type {Filter} */ (each[0]) : /not/.test(op) ? { and: /** @type {Filter[]} */ (each) } : { or: /** @type {Filter[]} */ (each) }
  }
  return ((either) => (either.length === 1 ? either[0] : { or: either }))(pieces(text.trim(), 'or').map((alternative) => ({ and: pieces(alternative, 'and').map((said) => read(said.trim())) })))
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
export function fill({ table, rows: all, names }, part, how) {
  const own = lines(part), plain = new Intl.NumberFormat(how.locales), rows = part.attrs.where ? query(table, all, { filter: rules(table, part.attrs.where, how), names }).rows : all
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
