// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a consumer's reference to a collection is the ```table block documents already hold, its first
// line the collection's place, `@published` or `@<n>` after it to read a version rather than the journal's head, then the recipe's lines,
// `key: value`; in a site's page, a table whose `data-from` says the same, its recipe in its other `data-` attributes, filled as the page is
// read; in a slide's words, a figure worked out from it, inline code that starts with `=`, its place, then what it works out and of which
// rows: `=collections/… sum Amount where Status is Paid`. The graph of who uses whom is read from the consumers' own files, and a reference
// that would close a loop is refused. Pure, so Node's tests run it.
import { PLACE, propertyOf, hueOf } from '../tables/table.js'
import { fill, rules } from '../fill/fill.js'
import { query, total } from '../tables/query.js'
import { amount } from '../tables/export.js'
import { sorted } from './recipes.js'

/** @import { Table } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */
/** A reference: the source's place, which of it (`live`, the journal's head; `published`, its latest version; or a version's number), and the recipe's lines by key. @typedef {{ place: string, at: 'live' | 'published' | number, recipe: Record<string, string> }} Ref */
/** An edge of the graph: a consumer's place, the source's, which of it, the recipe, and its place among the consumer's references. @typedef {{ from: string, to: string, at: Ref['at'], recipe: Record<string, string>, index: number }} Edge */

const BLOCK = /^(`{3,}|~{3,})table[ \t]*\n([\s\S]*?)^\1[ \t]*$/gm, FIGURE = /`(=[ \t]*collections\/[^`\n]*)`/g, TABLE = /(<table\b[^>]*\bdata-from="[^"]*"[^>]*>)[\s\S]*?(<\/table>)/gi
const escaped = (/** @type {string} */ text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A `table` block's text read; null when its first line names no collection. @param {string} text @returns {Ref | null} */
export function parseRef(text) {
  const [first = '', ...lines] = text.trim().split('\n').map((line) => line.trim()), [, place = '', at = 'live'] = /^(.*?)(?:@(live|published|[1-9]\d*))?$/.exec(first) ?? []
  return PLACE.test(place) && !place.includes('@') ? { place, at: /^\d/.test(at) ? Number(at) : /** @type {'live' | 'published'} */ (at), recipe: Object.fromEntries(lines.flatMap((line) => ((kv) => (kv ? [[kv[1].toLowerCase(), kv[2].trim()]] : []))(/^(\w+):(.*)$/.exec(line)))) } : null
}

/** A figure's formula read, inline code's words: `=`, a collection's place and which of it, then `count`, `sum`, `average`, `min`, `max` or `percent`,
 * a column but for a count of rows, and `where …` for some rows; null when it is none. @param {string} text @returns {Ref | null} */
export function parseFigure(text) {
  const [, first = '', what = '', column = '', where = ''] = /^=\s*(\S+)\s+(count|sum|average|min|max|percent)\b\s*(.*?)\s*(?:\bwhere\s+(.+))?$/is.exec(text.trim()) ?? [], ref = first && parseRef(first)
  return ref ? { ...ref, recipe: { total: what.toLowerCase(), ...(column && { column }), ...(where && { where: where.trim() }) } } : null
}

/** A reference's first line: its place, and which of it unless it is live. @param {Pick<Ref, 'place' | 'at'>} ref */
export const placeOf = ({ place, at }) => (at === 'live' ? place : `${place}@${at}`)

/** The references a consumer holds, in order: a Markdown file's `table` blocks, or a page's tables that say `data-from`. @param {string} text */
export const refsIn = (text) => [...text.matchAll(BLOCK)].map(([, , inner]) => inner).concat([...text.matchAll(TABLE)].map(([, open]) => ((attrs) => [attrs.from, ...Object.entries(attrs).filter(([what]) => what !== 'from').map(([what, value]) => `${what}: ${value}`)].join('\n'))(
  Object.fromEntries([...open.matchAll(/\bdata-(\w+)="([^"]*)"/g)].map(([, what, value]) => [what.toLowerCase(), value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')])))))
  .flatMap((inner) => ((ref) => (ref ? [ref] : []))(parseRef(inner))).concat([...text.matchAll(FIGURE)].flatMap(([, formula]) => ((ref) => (ref ? [ref] : []))(parseFigure(formula))))

/** A Markdown consumer with its `index`th reference changed, written again whole: its place, which version, its recipe's lines; a figure's, after its blocks', its place and which version. @param {string} markdown @param {number} index @param {(ref: Ref) => Ref} change */
export function withRef(markdown, index, change) {
  let n = -1
  return markdown.replace(BLOCK, (all, fence, inner) => ((ref) => (ref && ++n === index ? ((now) => all.replace(inner, `${[placeOf(now), ...Object.entries(now.recipe).map(([what, value]) => `${what}: ${value}`)].join('\n')}\n`))(change(ref)) : all))(parseRef(inner)))
    .replace(FIGURE, (all, formula) => ((ref) => (ref && ++n === index ? all.replace(/=\s*\S+/, `=${placeOf(change(ref))}`) : all))(parseFigure(formula)))
}

/** Where each form of a site's pages sends what visitors propose: its `data-form` name to the collection its `data-to` names (./ports.js). @param {string} text */
export const formsTo = (text) => new Map([...text.matchAll(/<form\b[^>]*>/gi)].flatMap(([open]) => ((name, to) => (name && to && PLACE.test(to) ? [[name, to]] : []))(/\sdata-form="([^"]*)"/.exec(open)?.[1], /\sdata-to="([^"]*)"/.exec(open)?.[1])))

/** A site's page as it is kept: each table that says `data-from` empty, its rows filled only as the page is read, never kept in it. @param {string} page */
export const bare = (page) => page.replace(TABLE, (all, open, close) => `${open}${close}`)

/** A site's page with each table that says `data-from` filled with what it shows, its heads then its rows, those it can't show as written. @param {string} page @param {(string[][] | null)[]} shown each one's, in order */
export function filledPage(page, shown) {
  let n = 0
  return page.replace(TABLE, (all, open, close) => ((rows) => (rows ? `${open}<thead><tr>${rows[0].map((head) => `<th>${escaped(head)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${escaped(cell)}</td>`).join('')}</tr>`).join('')}</tbody>${close}` : all))(shown[n++] ?? null))
}

/** Whether a reference from `from` to `to` closes a loop: whether `from` is reached from `to`. @param {Edge[]} edges @param {string} from @param {string} to */
export function loops(edges, from, to) {
  const seen = new Set(), next = [to]
  for (let at = next.pop(); at !== undefined; at = next.pop()) {
    if (at === from) return true
    if (!seen.has(at)) seen.add(at), next.push(...edges.flatMap((edge) => (edge.from === at ? [edge.to] : [])))
  }
  return false
}

/**
 * Why a consumer may not read a source, asked at each resolution, or '' when it may, in this order: Tables turned off or denied by policy; a
 * task brought in from someone else's, which never reads the project's collections; a loop; none at that place in the consumer's project.
 * @param {{ denied?: boolean, shared?: boolean, loop?: boolean, found?: boolean }} at @returns {'' | 'denied' | 'shared' | 'loop' | 'missing'}
 */
export const refused = ({ denied, shared, loop, found }) => (denied ? 'denied' : shared ? 'shared' : loop ? 'loop' : found ? '' : 'missing')
/** Why a reference reads no version: its collection has none yet, or not that one. @param {Ref['at']} at */
export const versionless = (at) => (at === 'published' ? 'unpublished' : 'noVersion')

/**
 * What a reference shows of a collection: its heads, then at most `most` rows, of the columns its recipe's `fields` names and the rows its
 * `where` keeps, in its `sort`'s order, worked out as a page's part is (caps/fill). A recipe that says `chart` shows a chart's figures instead:
 * its `by` column's name and the total's, then each value of that column and its rows' total, their count or their `sum` column's added up.
 * @param {{ table: Table, rows: Row[], names?: Map<string, string> }} one @param {Record<string, string>} recipe @param {import('../fill/fill.js').How} how @returns {string[][]}
 */
export function tableOf(one, recipe, how, most = 12) {
  const kept = { ...one, rows: sorted(one.table, one.rows, recipe.sort) }, where = /** @type {Record<string, string>} */ (recipe.where ? { where: recipe.where } : {}), by = recipe.chart && propertyOf(one.table, (recipe.by ?? '').trim())
  if (recipe.total) return [[figureOf(kept, recipe, how)]]
  if (!recipe.chart) return fill(kept, { tag: 'app-table', attrs: where, text: recipe.fields ?? '' }, how).text.split('\n').slice(0, most + 1).map((line) => line.split(' | '))
  const [labels = '', series = ''] = fill(kept, { tag: 'app-chart', attrs: { ...where, by: recipe.by ?? '', ...(recipe.sum ? { sum: recipe.sum } : {}) }, text: '' }, how).text.split('\n'), at = series.indexOf(': '), values = series.slice(at + 2).split(', ')
  if (!by || !series) throw new Error(`No column to chart by: ${recipe.by}`)
  return [[by.name, series.slice(0, at)], ...(labels ? labels.split(' | ') : []).map((label, i) => [label, values[i] || '0'])]
}

/** A chart's option for ECharts from the figures a `chart` recipe shows (tableOf), in the kind it names, bars unless it names another it draws. @param {string[][]} figures @param {string} [kind] */
export const chartOf = ([[, name = ''] = ['', ''], ...rows], kind = '') => ({ kind: ['line', 'area', 'hbar', 'pie'].includes(kind.trim().toLowerCase()) ? kind.trim().toLowerCase() : 'bar', labels: rows.map(([label]) => label), series: [{ name, data: rows.map(([, value]) => Number(value)) }] })

/** The choice column a head names, whose cells and bars show in the colours Tables gives its choices; null for another kind. @param {Table} table @param {string} [name] */
export const choiceIn = (table, name = '') => ((property) => (property && /^(select|multi-select|status)$/.test(property.type) ? property : null))(propertyOf(table, name.trim()))
/** A choice cell's choices: each a choice of its column, its colour as Tables shows it (its hue, else a step's group); the cell as it is otherwise. @param {import('../tables/table.js').Property} property @param {string} cell */
export const choicesIn = (property, cell) => ((parts) => (cell && parts.every((part) => property.options?.some((option) => option.name === part)) ? parts : [cell]))(cell.split(', ')).map((name) => ({ name, hue: hueOf(property, name), group: property.options?.find((option) => option.name === name)?.group }))
/** A chart's bars or slices, each in its colour where it has one, its colours those too when each has one, which PowerPoint's writer reads; lines keep their series' colour. @param {Record<string, any>} option @param {(string | undefined)[]} colours */
export const tinted = (option, colours) => ({ ...option, ...(colours.length && colours.every(Boolean) && option.series.every((/** @type {any} */ one) => one.type !== 'line') && { color: colours }), series: option.series.map((/** @type {any} */ series) => (series.type === 'line' ? series : { ...series, data: series.data.map((/** @type {any} */ one, /** @type {number} */ i) => (colours[i] ? { ...(one && typeof one === 'object' ? one : { value: one }), itemStyle: { color: colours[i] } } : one)) })) })

/** What a figure works out of a collection's rows, those its `where` keeps, in the language's digits: their count, or of its column how many are filled,
 * their share, or its numbers' sum, average, smallest or largest, as the column writes an amount; — when there is no number. Throws on a column it hasn't.
 * @param {{ table: Table, rows: Row[], names?: Map<string, string> }} one @param {Record<string, string>} recipe @param {import('../fill/fill.js').How} how */
export function figureOf({ table, rows: all, names }, recipe, how, rows = recipe.where ? query(table, all, { filter: rules(table, recipe.where, how), names }).rows : all, what = /** @type {import('../tables/query.js').Total} */ (recipe.total)) {
  const property = recipe.column ? propertyOf(table, recipe.column.trim()) : undefined, value = property && !property.deleted ? total(rows, property, what) : what === 'count' && !recipe.column ? rows.length : undefined
  if (value === undefined) throw new Error(`No column to work out: ${recipe.column}`)
  return value === null ? '—' : what === 'percent' ? new Intl.NumberFormat(how.locales, { style: 'percent', maximumFractionDigits: 1 }).format(value) : property && what !== 'count' ? amount(value, property, how.locales) : new Intl.NumberFormat(how.locales).format(value)
}
