// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D762): a consumer's reference to a collection is the ```table block documents already hold, its first
// line the collection's place, `@published` or `@<n>` after it to read a version rather than the journal's head, then the recipe's lines,
// `key: value`; in a site's page, a table whose `data-from` says the same, its recipe in its other `data-` attributes, filled as the page is
// read. The graph of who uses whom is read from the consumers' own files, and a reference that would close a loop is refused. Pure, so
// Node's tests run it.
import { PLACE } from '../tables/table.js'
import { fill } from '../fill/fill.js'
import { sorted } from './recipes.js'

/** @import { Table } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */
/** A reference: the source's place, which of it (`live`, the journal's head; `published`, its latest version; or a version's number), and the recipe's lines by key. @typedef {{ place: string, at: 'live' | 'published' | number, recipe: Record<string, string> }} Ref */
/** An edge of the graph: a consumer's place, the source's, which of it, the recipe, and its place among the consumer's references. @typedef {{ from: string, to: string, at: Ref['at'], recipe: Record<string, string>, index: number }} Edge */

const BLOCK = /^(`{3,}|~{3,})table[ \t]*\n([\s\S]*?)^\1[ \t]*$/gm, TABLE = /(<table\b[^>]*\bdata-from="[^"]*"[^>]*>)[\s\S]*?(<\/table>)/gi
const escaped = (/** @type {string} */ text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A `table` block's text read; null when its first line names no collection. @param {string} text @returns {Ref | null} */
export function parseRef(text) {
  const [first = '', ...lines] = text.trim().split('\n').map((line) => line.trim()), [, place = '', at = 'live'] = /^(.*?)(?:@(live|published|[1-9]\d*))?$/.exec(first) ?? []
  return PLACE.test(place) && !place.includes('@') ? { place, at: /^\d/.test(at) ? Number(at) : /** @type {'live' | 'published'} */ (at), recipe: Object.fromEntries(lines.flatMap((line) => ((kv) => (kv ? [[kv[1].toLowerCase(), kv[2].trim()]] : []))(/^(\w+):(.*)$/.exec(line)))) } : null
}

/** A reference's first line: its place, and which of it unless it is live. @param {Pick<Ref, 'place' | 'at'>} ref */
export const placeOf = ({ place, at }) => (at === 'live' ? place : `${place}@${at}`)

/** The references a consumer holds, in order: a Markdown file's `table` blocks, or a page's tables that say `data-from`. @param {string} text */
export const refsIn = (text) => [...text.matchAll(BLOCK)].map(([, , inner]) => inner).concat([...text.matchAll(TABLE)].map(([, open]) => ((attrs) => [attrs.from, ...Object.entries(attrs).filter(([what]) => what !== 'from').map(([what, value]) => `${what}: ${value}`)].join('\n'))(
  Object.fromEntries([...open.matchAll(/\bdata-(\w+)="([^"]*)"/g)].map(([, what, value]) => [what.toLowerCase(), value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')])))))
  .flatMap((inner) => ((ref) => (ref ? [ref] : []))(parseRef(inner)))

/** A Markdown consumer with its `index`th reference changed, written again whole: its place, which version, its recipe's lines. @param {string} markdown @param {number} index @param {(ref: Ref) => Ref} change */
export function withRef(markdown, index, change) {
  let n = -1
  return markdown.replace(BLOCK, (all, fence, inner) => ((ref) => (ref && ++n === index ? ((now) => all.replace(inner, `${[placeOf(now), ...Object.entries(now.recipe).map(([what, value]) => `${what}: ${value}`)].join('\n')}\n`))(change(ref)) : all))(parseRef(inner)))
}

/** Where each form of a site's pages sends what visitors propose: its `data-form` name to the collection its `data-to` names (./ports.js). @param {string} text */
export const formsTo = (text) => new Map([...text.matchAll(/<form\b[^>]*>/gi)].flatMap(([open]) => ((name, to) => (name && to && PLACE.test(to) ? [[name, to]] : []))(/\sdata-form="([^"]*)"/.exec(open)?.[1], /\sdata-to="([^"]*)"/.exec(open)?.[1])))

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
 * `where` keeps, in its `sort`'s order, worked out as a page's part is (caps/fill). @param {{ table: Table, rows: Row[], names?: Map<string, string> }} one
 * @param {Record<string, string>} recipe @param {import('../fill/fill.js').How} how @returns {string[][]}
 */
export const tableOf = (one, recipe, how, most = 12) => fill({ ...one, rows: sorted(one.table, one.rows, recipe.sort) }, { tag: 'app-table', attrs: recipe.where ? { where: recipe.where } : {}, text: recipe.fields ?? '' }, how).text
  .split('\n').slice(0, most + 1).map((line) => line.split(' | '))
