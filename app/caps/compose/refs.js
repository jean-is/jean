// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a consumer's reference to a collection is the ```table block documents already hold, its first
// line the collection's place, `@published` or `@<n>` after it to read a version rather than the journal's head, then the recipe's lines,
// `key: value`; in a site's page, a table whose `data-from` says the same, its recipe in its other `data-` attributes, filled as the page is
// read; in a slide's words, a figure worked out from it, inline code that starts with `=`, its place, then what it works out and of which
// rows: `=collections/… sum Amount where Status is Paid`. The graph of who uses whom is read from the consumers' own files, and a reference
// that would close a loop is refused. Pure, so Node's tests run it.
import { PLACE, propertyOf, hueOf, kindOf } from '../tables/table.js'
import { fill, rules } from '../fill/fill.js'
import { query, total } from '../tables/query.js'
import { amount } from '../tables/export.js'
import { sorted } from './recipes.js'

/** @import { Table } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */
/** A reference: the source's place, which of it (`live`, the journal's head; `published`, its latest version; or a version's number), and the recipe's lines by key. @typedef {{ place: string, at: 'live' | 'published' | number, recipe: Record<string, string> }} Ref */
/**
 * An edge of the graph: a consumer's place, the source's, which of it, the recipe, and its place among the consumer's references; or, with `kind`, a link
 * that is no reference but still says what a change touches: a collection's relation to another (`relation`, its column's name its recipe's), or a
 * file held by its content (`file`), always the same; or a site's form that proposes into a collection (`form`, its name the recipe's), as a column its
 * port fills, renamed, changes what it writes; or the project's design system a deck, a site or a design wears (`kit`), live or at a version. @typedef {{ from: string, to: string, at: Ref['at'], recipe: Record<string, string>, index: number, kind?: 'relation' | 'file' | 'form' | 'kit' }} Edge
 */

const BLOCK = /^(`{3,}|~{3,})(?:table|section)[ \t]*\n([\s\S]*?)^\1[ \t]*$/gm, FIGURE = /`(=[ \t]*collections\/[^`\n]*)`/g, TABLE = /(<(table|section)\b[^>]*\bdata-from="[^"]*"[^>]*>)[\s\S]*?(<\/\2>)/gi
/** A document's place (D474), whose sections are a source (step 9). */
export const DOCUMENT = /^documents\/[0-9A-HJKMNP-TV-Z]{26}-[^/#@]*\.md$/
/** A heading: its marks, its words, and the id written after them once a reference names it (`## FAQ {#faq}`, Pandoc's), which a rename keeps. */
const HEADING = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+\{#([\p{L}\p{N}_-]+)\})?[ \t]*$/u, IDS = /^(#{1,6}[ \t].*?)[ \t]+\{#[\p{L}\p{N}_-]+\}[ \t]*$/gmu
const escaped = (/** @type {string} */ text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A `table` or `section` block's text read: a collection's place, or a document's and its section after `#`, the section in its recipe; null when it names neither. @param {string} text @returns {Ref | null} */
export function parseRef(text) {
  const [first = '', ...lines] = text.trim().split('\n').map((line) => line.trim()), [, named = '', at = 'live'] = /^(.*?)(?:@(live|published|[1-9]\d*))?$/.exec(first) ?? [], [place, section = ''] = named.split('#')
  return (PLACE.test(place) || DOCUMENT.test(place)) && !place.includes('@') ? { place, at: /^\d/.test(at) ? Number(at) : /** @type {'live' | 'published'} */ (at), recipe: { ...(section && { section }), ...Object.fromEntries(lines.flatMap((line) => ((kv) => (kv ? [[kv[1].toLowerCase(), kv[2].trim()]] : []))(/^(\w+):(.*)$/.exec(line)))) } } : null
}

/** A whiteboard's section as a reference shows it (`section: Ideas`): the words of the notes in it, found by its name or its name as an id; null where it has none. @param {Row[]} rows @param {string} section */
export const notesIn = (rows, section) => ((area) => (area ? rows.filter((row) => row.cells.area === area.id && kindOf(row) === 'note').map((row) => String(row.cells.note ?? '')) : null))(rows.find((row) => kindOf(row) === 'area' && [String(row.cells.note ?? '').trim(), slugOf(String(row.cells.note ?? ''))].includes(section.trim())))

/** A heading's words as an id, in any script. @param {string} words */
export const slugOf = (words) => words.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
/**
 * A section of a document's Markdown, its front matter left out: from its heading, found by its id, else by its words as an id, to the next heading as high;
 * without one, all but its title. Its headings' ids left out, with the line it starts at and the id it has; null where there is none. @param {string} body @param {string} [section] @returns {{ text: string, line: number, id: string } | null}
 */
export function sectionOf(body, section = '') {
  let fence = ''
  const lines = body.split('\n'), heads = lines.map((line) => ((open) => (fence ? ((fence = open && open[0] === fence[0] && open.length >= fence.length ? '' : fence), null) : open ? ((fence = open), null) : HEADING.exec(line)))(/^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1] ?? ''))
  const by = heads.findIndex((head) => head?.[3] === section), at = !section ? -1 : by < 0 ? heads.findIndex((head) => head && slugOf(head[2]) === section) : by
  if (section && at < 0) return null
  const head = heads[at], end = head ? heads.findIndex((one, i) => i > at && one && one[1].length <= head[1].length) : -1, title = heads.findIndex(Boolean)
  return { text: (head ? lines.slice(at, end < 0 ? undefined : end) : lines.filter((_, i) => i !== title || heads[i]?.[1] !== '#')).join('\n').replace(IDS, '$1').trim(), line: at, id: head?.[3] ?? '' }
}
/** A document's Markdown with a heading's id written after its words, once a reference names it by them; as it was where it has one already. @param {string} text @param {number} line its line, after the front matter's @param {string} id */
export const withId = (text, line, id) => ((lines) => (HEADING.exec(lines[line] ?? '')?.[3] !== undefined ? text : ((lines[line] = `${lines[line].trimEnd()} {#${id}}`), lines.join('\n'))))(text.split('\n'))

/** A figure's formula read, inline code's words: `=`, a collection's place and which of it, then `count`, `sum`, `average`, `min`, `max` or `percent`,
 * a column but for a count of rows, and `where …` for some rows; null when it is none. @param {string} text @returns {Ref | null} */
export function parseFigure(text) {
  const [, first = '', what = '', column = '', where = ''] = /^=\s*(\S+)\s+(count|sum|average|min|max|percent)\b\s*(.*?)\s*(?:\bwhere\s+(.+))?$/is.exec(text.trim()) ?? [], ref = first && parseRef(first)
  return ref ? { ...ref, recipe: { total: what.toLowerCase(), ...(column && { column }), ...(where && { where: where.trim() }) } } : null
}

/** A reference's first line: its place, a document's section after `#`, and which of it unless it is live. @param {Pick<Ref, 'place' | 'at'> & { recipe?: Ref['recipe'] }} ref */
export const placeOf = ({ place, at, recipe }) => `${place}${recipe?.section ? `#${recipe.section}` : ''}${at === 'live' ? '' : `@${at}`}`

/** The references a consumer holds, in order: a Markdown file's `table` blocks, or a page's tables that say `data-from`. @param {string} text */
export const refsIn = (text) => [...text.matchAll(BLOCK)].map(([, , inner]) => inner).concat([...text.matchAll(TABLE)].map(([, open]) => ((attrs) => [attrs.from, ...Object.entries(attrs).filter(([what]) => what !== 'from').map(([what, value]) => `${what}: ${value}`)].join('\n'))(
  Object.fromEntries([...open.matchAll(/\bdata-(\w+)="([^"]*)"/g)].map(([, what, value]) => [what.toLowerCase(), value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')])))))
  .flatMap((inner) => ((ref) => (ref ? [ref] : []))(parseRef(inner))).concat([...text.matchAll(FIGURE)].flatMap(([, formula]) => ((ref) => (ref ? [ref] : []))(parseFigure(formula))))

/** A Markdown consumer with its `index`th reference changed, written again whole: its place, which version, its recipe's lines; a figure's, after its blocks', its place and which version. @param {string} markdown @param {number} index @param {(ref: Ref) => Ref} change */
export function withRef(markdown, index, change) {
  let n = -1
  return markdown.replace(BLOCK, (all, fence, inner) => ((ref) => (ref && ++n === index ? ((now) => all.replace(inner, `${[placeOf(now), ...Object.entries(now.recipe).filter(([what]) => what !== 'section').map(([what, value]) => `${what}: ${value}`)].join('\n')}\n`))(change(ref)) : all))(parseRef(inner)))
    .replace(FIGURE, (all, formula) => ((ref) => (ref && ++n === index ? all.replace(/=\s*\S+/, `=${placeOf(change(ref))}`) : all))(parseFigure(formula)))
}

/**
 * Markdown as it leaves Jean (a Word file, a link), each reference as it shows now: a block as its rows' table (a chart's figures), its run's words
 * or why it shows nothing, then a figure as its value, else —. @param {string} text @param {(ref: Ref) => Promise<{ rows?: string[][], words?: string }>} shown
 */
export async function written(text, shown) {
  const line = (/** @type {string[]} */ cells) => `| ${cells.map((cell) => cell.replace(/[\\`*_[\]<>|~$&]/g, '\\$&').replace(/\s*\n\s*/g, ' ')).join(' | ')} |`, grid = (/** @type {string[][]} */ [heads = [], ...rows]) => [line(heads), line(heads.map(() => '---')), ...rows.map(line)].join('\n')
  const each = async (/** @type {string} */ text, /** @type {RegExp} */ found, /** @type {(match: RegExpMatchArray) => Promise<string | null>} */ as) => ((done, n = 0) => text.replace(found, (all) => done[n++] ?? all))(await Promise.all([...text.matchAll(found)].map(as)))
  const blocks = await each(text, BLOCK, async ([, , inner]) => ((ref) => ref && shown(ref).then((one) => one.words ?? grid(one.rows ?? [])))(parseRef(inner)))
  return each(blocks, FIGURE, async ([, formula]) => ((ref) => ref && shown(ref).then((one) => one.rows?.[0]?.[0] ?? '—'))(parseFigure(formula)))
}

/** Where each form of a site's pages sends what visitors propose: its `data-form` name to the collection its `data-to` names (./ports.js). @param {string} text */
export const formsTo = (text) => new Map([...text.matchAll(/<form\b[^>]*>/gi)].flatMap(([open]) => ((name, to) => (name && to && PLACE.test(to) ? [[name, to]] : []))(/\sdata-form="([^"]*)"/.exec(open)?.[1], /\sdata-to="([^"]*)"/.exec(open)?.[1])))

/** A site's page as it is kept: each table that says `data-from` empty, its rows filled only as the page is read, never kept in it. @param {string} page */
export const bare = (page) => page.replace(TABLE, (all, open, tag, close) => `${open}${close}`)

/** A site's page with each table or section that says `data-from` filled with what it shows: a table its heads then its rows, a section its HTML, those it can't show as written. @param {string} page @param {(string[][] | string | null)[]} shown each one's, in order */
export function filledPage(page, shown) {
  let n = 0
  return page.replace(TABLE, (all, open, tag, close) => ((rows) => (typeof rows === 'string' ? `${open}${rows}${close}` : rows ? `${open}<thead><tr>${rows[0].map((head) => `<th>${escaped(head)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${escaped(cell)}</td>`).join('')}</tr>`).join('')}</tbody>${close}` : all))(shown[n++] ?? null))
}

/** The links a creation holds that are no references: a collection's relations to others, by its columns (`collection.json`), the files any text holds by their content (`../files/sha256-…`), and a page's forms that propose into a collection (`formsTo()`). @param {string} from @param {{ properties?: { type: string, name: string, collection?: string }[] } | null} table @param {string} [text] @returns {Edge[]} */
export const linksIn = (from, table, text = '') => [...(table?.properties ?? []).flatMap(({ type, name, collection = '' }) => (type === 'relation' && collection !== from && PLACE.test(collection) ? [{ kind: /** @type {Edge['kind']} */ ('relation'), to: collection, recipe: { relation: name } }] : [])),
  ...[...new Set(text.match(/\bfiles\/sha256-[0-9a-f]{64}\.\w+/g))].map((to) => ({ kind: /** @type {Edge['kind']} */ ('file'), to, recipe: {} })), ...[...formsTo(text)].map(([form, to]) => ({ kind: /** @type {Edge['kind']} */ ('form'), to, recipe: { form } }))].map((link, index) => ({ from, at: /** @type {Ref['at']} */ ('live'), index, ...link }))

/**
 * What is reached from a place beyond its own links, each with the one of them it is reached through: what uses what uses it (`down`), else what
 * feeds what it uses, as far as it goes. @param {Edge[]} edges @param {string} place @param {boolean} down @returns {[string, string][]}
 */
export function further(edges, place, down) {
  const step = (/** @type {string} */ at) => edges.flatMap((edge) => ((down ? edge.to : edge.from) === at ? [down ? edge.from : edge.to] : []))
  const seen = new Map(step(place).map((one) => [one, ''])), next = [...seen.keys()].map((one) => [one, one])
  for (let [at, via] = next.shift() ?? []; at; [at, via] = next.shift() ?? []) for (const one of step(at)) if (one !== place && !seen.has(one)) seen.set(one, via), next.push([one, via])
  return [...seen].filter(([, via]) => via)
}

/** Whether a reference from `from` to `to` closes a loop: whether `from` is reached from `to`. @param {Edge[]} edges @param {string} from @param {string} to */
export function loops(edges, from, to) {
  const seen = new Set(), next = [to]
  for (let at = next.pop(); at !== undefined; at = next.pop()) {
    if (at === from) return true
    if (!seen.has(at)) seen.add(at), next.push(...edges.flatMap((edge) => (edge.from === at && !edge.kind ? [edge.to] : [])))
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
