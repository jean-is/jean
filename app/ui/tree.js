// The screen's parts (D635), as the dock lays them out (./dock.js) and the address keeps them: a split is a row, side by side along
// the line, or a column, one above the other, of two parts, each a part or another split, and the first part's share of it when it
// isn't half. A part is `here`, the conversation and its box, a pane by its name (`preview`, `browser`, `terminal`, `flows`), another
// task by its id, or a creation by its place in the project: `row(here,col40(preview,documents/01J…-notes.md))`. Pure, so that node runs it.

/** @typedef {string | { split: 'row' | 'col', share: number, a: Tree, b: Tree }} Tree */
/** Where a tile dropped goes on another: its place, or a half of it, along the line or across. @typedef {'center' | 'start' | 'end' | 'top' | 'bottom'} Zone */

/** The most tiles a screen holds. */
export const MOST = 8
const SPLIT = /^(row|col)(\d{1,2})?\(/

/** A layout as the address writes it, or null when it isn't one: its tiles each once, `here` among them. @param {string} text @returns {Tree | null} */
export function parse(text) {
  let at = 0
  /** @returns {Tree} */
  const part = () => {
    const head = SPLIT.exec(text.slice(at))
    if (!head) {
      const leaf = /^[^(),]+/.exec(text.slice(at))?.[0] ?? ''
      at += leaf.length
      if (!leaf) throw new Error(text)
      return decodeURIComponent(leaf)
    }
    at += head[0].length
    const a = part()
    if (text[at++] !== ',') throw new Error(text)
    const b = part()
    if (text[at++] !== ')') throw new Error(text)
    return { split: /** @type {'row' | 'col'} */ (head[1]), share: head[2] ? Math.min(Math.max(Number(head[2]) / 100, 0.1), 0.9) : 0.5, a, b }
  }
  try {
    const tree = part(), all = leaves(tree)
    return at === text.length && new Set(all).size === all.length && all.length <= MOST && all.includes('here') ? tree : null
  } catch {
    return null
  }
}

/** A layout as the address writes it: a tile's place with its brackets and commas escaped. @param {Tree} tree @returns {string} */
export const write = (tree) => (typeof tree === 'string' ? tree.replace(/[%(),]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  : `${tree.split}${tree.share === 0.5 ? '' : Math.round(tree.share * 100)}(${write(tree.a)},${write(tree.b)})`)

/** Its tiles, along the line first. @param {Tree} tree @returns {string[]} */
export const leaves = (tree) => (typeof tree === 'string' ? [tree] : [...leaves(tree.a), ...leaves(tree.b)])

/** Each tile changed as `change` says, null taking it away and its split with it. @param {Tree} tree @param {(leaf: string) => Tree | null} change @returns {Tree | null} */
function map(tree, change) {
  if (typeof tree === 'string') return change(tree)
  const [a, b] = [map(tree.a, change), map(tree.b, change)]
  return a && b ? { ...tree, a, b } : a ?? b
}

/** Without a tile, its split's other part taking the room. @param {Tree} tree @param {string} leaf */
export const without = (tree, leaf) => map(tree, (one) => (one === leaf ? null : one))
/** Two tiles in each other's places. @param {Tree} tree @param {string} a @param {string} b */
export const swap = (tree, a, b) => /** @type {Tree} */ (map(tree, (one) => (one === a ? b : one === b ? a : one)))
/** A tile named another. @param {Tree} tree @param {string} from @param {string} to */
export const rename = (tree, from, to) => /** @type {Tree} */ (map(tree, (one) => (one === from ? to : one)))

/** A part dropped on another: in its place, or beside it, taking half of it unless the first's share is given. @param {Tree} tree @param {string} target @param {string} leaf @param {Zone} zone */
export const put = (tree, target, leaf, zone, share = 0.5) => /** @type {Tree} */ (map(tree, (one) => (one !== target ? one : zone === 'center' ? leaf
  : /** @type {Tree} */ ({ split: zone === 'start' || zone === 'end' ? 'row' : 'col', share, ...(zone === 'start' || zone === 'top' ? { a: leaf, b: one } : { a: one, b: leaf }) }))))

/** Where on a tile a drop goes, by where in it the pointer is, as shares of it along the line and down: a quarter from an edge splits it. @param {number} u @param {number} v @returns {Zone} */
export function zone(u, v) {
  const [near, side] = /** @type {[number, Zone][]} */ ([[u, 'start'], [1 - u, 'end'], [v, 'top'], [1 - v, 'bottom']]).sort((a, b) => a[0] - b[0])[0]
  return near < 0.25 ? side : 'center'
}

/**
 * Each part's place and each split's, as shares of the screen along the line and down, a split by the way to it (`a`, `b`) with its parts.
 * @param {Tree} tree @returns {{ tiles: Place[], splits: (Place & { path: string, split: 'row' | 'col', share: number, parts: [Tree, Tree] })[] }}
 * @typedef {{ leaf: string, x: number, y: number, w: number, h: number }} Place
 */
export function places(tree, x = 0, y = 0, w = 1, h = 1, path = '', found = { tiles: /** @type {Place[]} */ ([]), splits: /** @type {any[]} */ ([]) }) {
  if (typeof tree === 'string') return found.tiles.push({ leaf: tree, x, y, w, h }), found
  const row = tree.split === 'row', [aw, ah] = row ? [w * tree.share, h] : [w, h * tree.share]
  found.splits.push({ leaf: '', x, y, w, h, path, split: tree.split, share: tree.share, parts: [tree.a, tree.b] })
  places(tree.a, x, y, aw, ah, `${path}a`, found)
  places(tree.b, row ? x + aw : x, row ? y : y + ah, row ? w - aw : w, row ? h : h - ah, `${path}b`, found)
  return found
}

/** A split's first part given another share. @param {Tree} tree @param {string} path @param {number} share @returns {Tree} */
export const reshare = (tree, path, share) => (typeof tree === 'string' ? tree : !path ? { ...tree, share }
  : { ...tree, [path[0]]: reshare(tree[/** @type {'a' | 'b'} */ (path[0])], path.slice(1), share) })
