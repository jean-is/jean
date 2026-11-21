// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a consumer's reference to a collection is the ```table block documents already hold, its first
// line the collection's place, then the recipe's lines, `key: value`. The graph of who uses whom is read from the consumers' own files, and a
// reference that would close a loop is refused. Pure, so Node's tests run it.
import { PLACE } from '../tables/table.js'
import { fill } from '../fill/fill.js'

/** @import { Table } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */
/** A reference: the source's place, which of it (`live`, the journal's head), and the recipe's lines by key. @typedef {{ place: string, at: 'live', recipe: Record<string, string> }} Ref */
/** An edge of the graph: a consumer's place, the source's, and which of it. @typedef {{ from: string, to: string, at: Ref['at'] }} Edge */

/** A `table` block's text read; null when its first line names no collection. @param {string} text @returns {Ref | null} */
export function parseRef(text) {
  const [place = '', ...lines] = text.trim().split('\n').map((line) => line.trim())
  return PLACE.test(place) ? { place, at: 'live', recipe: Object.fromEntries(lines.flatMap((line) => ((kv) => (kv ? [[kv[1].toLowerCase(), kv[2].trim()]] : []))(/^(\w+):(.*)$/.exec(line)))) } : null
}

/** The references a consumer's Markdown holds, each `table` block's, in order. @param {string} markdown */
export const refsIn = (markdown) => [...markdown.matchAll(/^(`{3,}|~{3,})table[ \t]*\n([\s\S]*?)^\1[ \t]*$/gm)].flatMap(([, , text]) => ((ref) => (ref ? [ref] : []))(parseRef(text)))

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

/**
 * What a reference shows of a collection: its heads, then at most `most` rows, of the columns its recipe's `fields` names and the rows its
 * `where` keeps, worked out as a page's part is (caps/fill). @param {{ table: Table, rows: Row[], names?: Map<string, string> }} one
 * @param {Record<string, string>} recipe @param {import('../fill/fill.js').How} how @returns {string[][]}
 */
export const tableOf = (one, recipe, how, most = 12) => fill(one, { tag: 'app-table', attrs: recipe.where ? { where: recipe.where } : {}, text: recipe.fields ?? '' }, how).text
  .split('\n').slice(0, most + 1).map((line) => line.split(' | '))
