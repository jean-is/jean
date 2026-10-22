// Jean's changes (D485, D505): Jean's version of the document, compared with the one open block by block; a block
// changed, a run added and a run taken away are each a change, shown where it is as Jean's version (its new words
// tinted, Before showing the person's) with Jean's few words, Accept and Reject. Nothing of one is in the document
// until it is accepted; what is left to decide is kept beside it (documents.js).
import { Plugin, PluginKey, Selection, Decoration, DecorationSet, DOMSerializer, Fragment, Mark } from '#prosemirror'
import { el } from './ui.js'

/** @typedef {import('prosemirror-model').Node} PMNode */
/** @typedef {import('prosemirror-state').EditorState} EditorState */
/** @typedef {import('prosemirror-view').EditorView} EditorView */
/** The blocks a change replaces (from–to; none: from = to), Jean's (none for blocks taken away), how many, and Jean's words. @typedef {{ id: number, from: number, to: number, content: Fragment, size: number, why: string }} Change */
/** @typedef {{ changes: Change[], deco: DecorationSet }} State */
/** Blocks as an answer draws them (drawn.js). @typedef {{ drawn: (node: PMNode) => boolean, draw: (node: PMNode, plain: () => Node) => (HTMLElement & { stop: () => void }) | null }} Form */

export const suggestionKey = /** @type {PluginKey<State>} */ (new PluginKey('suggestions'))

/**
 * How two lists line up (their longest common subsequence): [i, j] the same in both, [i, -1] or [-1, j] in one only.
 * @template T @param {T[]} a @param {T[]} b @param {(x: T, y: T) => boolean} eq @returns {Array<[number, number]>}
 */
function steps(a, b, eq) {
  const rows = a.length + 1, cols = b.length + 1
  const table = new Uint32Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = eq(a[i], b[j]) ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
    }
  }
  /** @type {Array<[number, number]>} */
  const out = []
  let i = 0, j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && eq(a[i], b[j])) out.push([i++, j++])
    else if (j >= b.length || (i < a.length && table[(i + 1) * cols + j] >= table[i * cols + j + 1])) out.push([i++, -1])
    else out.push([-1, j++])
  }
  return out
}

/** A node's or a fragment's children. @param {PMNode | Fragment} node */
const childList = (node) => { const list = /** @type {PMNode[]} */ ([]); node.forEach((child) => list.push(child)); return list }

// Words, as the language has them where it can tell (Japanese has no spaces between them).
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null
/** @param {string} text */
const split = (text) => (segmenter ? [...segmenter.segment(text)].map(({ segment }) => segment) : text.split(/(\s+|[^\p{L}\p{N}\s])/u).filter(Boolean))

/** Whether Jean's block is the person's changed: of its kind, sharing a quarter of their words. @param {PMNode} x @param {PMNode} y */
function alike(x, y) {
  if (x.type !== y.type) return false
  const words = (/** @type {PMNode} */ node) => split(node.textContent).filter((piece) => /[\p{L}\p{N}]/u.test(piece)).map((piece) => piece.toLocaleLowerCase())
  const [a, b, left] = [words(x), words(y), new Map()]
  for (const word of a) left.set(word, (left.get(word) ?? 0) + 1)
  let shared = 0
  for (const word of b) if (left.get(word)) { shared++; left.set(word, left.get(word) - 1) }
  return 8 * shared >= a.length + b.length
}

/** The changes from the document open to Jean's, block by block at its top. @param {PMNode} doc @param {PMNode} proposed @returns {Omit<Change, 'id' | 'why'>[]} */
export function diff(doc, proposed) {
  const la = childList(doc), lb = childList(proposed)
  const at = [0]
  for (const node of la) at.push(at[at.length - 1] + node.nodeSize)
  /** @type {Omit<Change, 'id' | 'why'>[]} */
  const out = []
  const top = steps(la, lb, (x, y) => x.eq(y))
  let i = 0
  for (let k = 0; k < top.length;) {
    if (top[k][0] >= 0 && top[k][1] >= 0) { k++; i++; continue }
    /** @type {[PMNode[], PMNode[]]} */
    const [old, ours] = [[], []]
    for (; k < top.length && !(top[k][0] >= 0 && top[k][1] >= 0); k++) (top[k][0] >= 0 ? old : ours).push(top[k][0] >= 0 ? la[top[k][0]] : lb[top[k][1]])
    // One block for one, of a kind, is the same block changed, however much.
    const only = old.length === 1 && ours.length === 1
    for (const [x, y] of steps(old, ours, (one, two) => (only && one.type === two.type) || alike(one, two))) {
      const last = out[out.length - 1]
      if (x >= 0 && y >= 0) out.push({ from: at[i], to: at[i + 1], content: Fragment.from(ours[y]), size: 1 })
      else if (x >= 0 && last && !last.content.size && last.to === at[i]) Object.assign(last, { to: at[i + 1], size: last.size + 1 })
      else if (x >= 0) out.push({ from: at[i], to: at[i + 1], content: Fragment.empty, size: 1 })
      else if (last && last.from === last.to && last.from === at[i]) Object.assign(last, { content: last.content.addToEnd(ours[y]), size: last.size + 1 })
      else out.push({ from: at[i], to: at[i], content: Fragment.from(ours[y]), size: 1 })
      if (x >= 0) i++
    }
  }
  return out
}

/** Where Jean's line differs from the person's, runs a space or a sign apart made one ("19:30" → "20:00"). @param {PMNode} a @param {PMNode} b @returns {Array<[number, number]>} */
export function tints(a, b) {
  /** @param {PMNode} block */
  const units = (block) => {
    /** @type {Array<{ text: string | null, node: PMNode | null, marks: readonly Mark[], at: number, size: number }>} */
    const out = []
    block.forEach((child, offset) => {
      if (!child.isText) return void out.push({ text: null, node: child, marks: child.marks, at: offset, size: child.nodeSize })
      let at = offset
      for (const piece of split(/** @type {string} */ (child.text))) out.push({ text: piece, node: null, marks: child.marks, at, size: (at += piece.length, piece.length) })
    })
    return out
  }
  const [ua, ub] = [units(a), units(b)]
  /** @type {Array<[number, number]>} */
  const runs = []
  for (const [x, y] of steps(ua, ub, (one, two) => (one.node ? Boolean(two.node && one.node.eq(two.node)) : one.text === two.text) && Mark.sameSet(one.marks, two.marks))) {
    if (x >= 0 || y < 0) continue
    const unit = ub[y], last = runs[runs.length - 1]
    const gap = last ? ub.filter((one) => one.at >= last[1] && one.at < unit.at) : []
    if (last && gap.length <= 3 && gap.every((one) => one.text !== null && /^[\s\p{P}\p{S}]*$/u.test(one.text))) last[1] = unit.at + unit.size
    else runs.push([unit.at, unit.at + unit.size])
  }
  return runs
}

let ids = 0

/**
 * The plugin that holds the changes and draws them, `act` accepting or rejecting one, `changed` hearing each time they change.
 * @param {{ strings: () => Record<string, string>, act: (kind: 'accept' | 'reject', ids: number[]) => void, changed: (changes: Change[], view: EditorView) => void, form?: Form }} options
 */
export function suggestions({ strings, act, changed, form }) {
  return new Plugin({
    key: suggestionKey,
    state: {
      init: () => /** @type {State} */ ({ changes: [], deco: DecorationSet.empty }),
      apply(tr, value, _old, state) {
        const meta = tr.getMeta(suggestionKey)
        if (!meta && !value.changes.length) return value
        let changes = value.changes
        if (tr.docChanged) {
          changes = changes.flatMap((change) => {
            const from = tr.mapping.mapResult(change.from, 1), to = tr.mapping.mapResult(change.to, -1)
            return from.pos > to.pos || (change.from < change.to && from.deletedAcross && to.deletedAcross) ? [] : [{ ...change, from: from.pos, to: Math.max(from.pos, to.pos) }]
          })
        }
        if (meta?.set) changes = meta.set
        if (meta?.remove) changes = changes.filter((change) => !meta.remove.includes(change.id))
        if (changes === value.changes && !tr.docChanged) return value
        return { changes, deco: draw(state.doc, changes, strings(), act, form) }
      },
    },
    props: { decorations: (state) => suggestionKey.getState(state)?.deco },
    // The caret never stays in a block a change hides.
    appendTransaction(_trs, before, state) {
      const { head } = state.selection
      const inside = pending(state).find((change) => change.from < head && head < change.to)
      if (!inside) return null
      const dir = head < before.selection.head ? -1 : 1
      const [ahead, behind] = dir < 0 ? [inside.from, inside.to] : [inside.to, inside.from]
      const found = Selection.findFrom(state.doc.resolve(ahead), dir, true) ?? Selection.findFrom(state.doc.resolve(behind), -dir, true)
      return found && state.tr.setSelection(found)
    },
    view: () => ({
      update(view, previous) {
        const now = suggestionKey.getState(view.state)?.changes, was = suggestionKey.getState(previous)?.changes
        if (now !== was) changed(now ?? [], view)
      },
    }),
  })
}

/**
 * Each change: the person's blocks hidden, Jean's version before them.
 * @param {PMNode} doc @param {Change[]} changes @param {Record<string, string>} strings @param {(kind: 'accept' | 'reject', ids: number[]) => void} act @param {Form} [form]
 */
function draw(doc, changes, strings, act, form) {
  const serializer = DOMSerializer.fromSchema(doc.type.schema)
  /** A block as an answer draws it, or as its text. @param {PMNode} node */
  const shown = (node) => form?.draw(node, () => serializer.serializeNode(node)) ?? serializer.serializeNode(node)
  /** @type {Decoration[]} */
  const list = []
  for (const change of changes) {
    doc.nodesBetween(change.from, change.to, (node, pos) => { list.push(Decoration.node(pos, pos + node.nodeSize, { class: 'suggest-old' })); return false })
    list.push(Decoration.widget(change.from, () => widget(doc.slice(change.from, change.to).content, change, strings, act, shown, serializer),
      { side: change.from === change.to ? -2 : -1, key: `suggest-${change.id}`, ignoreSelection: true, stopEvent: () => true, destroy: stop }))
  }
  return DecorationSet.create(doc, list)
}

/** What a widget drew, let go with it. @param {Node} dom */
const stop = (dom) => /** @type {HTMLElement} */ (dom).querySelectorAll?.('.suggest-form').forEach((one) => /** @type {any} */ (one).stop())

/**
 * A change where it is: Jean's version, its row, and for a block changed, the person's under Before. @param {Fragment} old @param {Change} change @param {Record<string, string>} strings
 * @param {(kind: 'accept' | 'reject', ids: number[]) => void} act @param {(node: PMNode) => Node} shown @param {DOMSerializer} serializer
 */
function widget(old, change, strings, act, shown, serializer) {
  const kind = !change.content.size ? 'gone' : old.size ? 'changed' : 'added'
  const box = el('div', { class: `suggest is-${kind}`, contenteditable: 'false', 'data-change': String(change.id) })
  const first = old.firstChild
  for (const node of childList(kind === 'gone' ? old : change.content)) {
    // A line of text changed has the words Jean changes tinted.
    if (kind !== 'changed' || !first?.isTextblock || !node.isTextblock || node.type.spec.code) { box.append(shown(node)); continue }
    const line = /** @type {HTMLElement} */ (serializer.serializeNode(node.copy()))
    let at = 0
    for (const [from, to] of [...tints(first, node), [node.content.size, node.content.size]]) {
      line.append(serializer.serializeFragment(node.content.cut(at, from)))
      if (to > from) line.append(el('span', { class: 'suggest-new' }, serializer.serializeFragment(node.content.cut(from, to))))
      at = to
    }
    box.append(line)
  }
  // Drawn when Before first opens, with its width.
  const before = el('div', { class: 'suggest-was', hidden: '' })
  const row = el('div', { class: 'suggest-row', role: 'group', 'aria-label': change.why || strings[kind] })
  if (kind === 'added') row.append(el('span', { class: 'suggest-tag' }, strings.added))
  if (change.why || kind === 'gone') row.append(el('span', { class: 'suggest-why' }, change.why || strings.gone))
  /** @param {string} name @param {string} label @param {() => void} run */
  const button = (name, label, run) => {
    const one = el('button', { type: 'button', class: `suggest-${name}` }, label)
    // A click leaves the caret where it is.
    one.addEventListener('mousedown', (event) => event.preventDefault())
    one.addEventListener('click', run)
    row.append(one)
    return one
  }
  if (kind === 'changed') {
    const open = button('before', strings.before, () => {
      before.hidden = !before.hidden
      if (!before.firstChild) before.append(...childList(old).map(shown))
      open.setAttribute('aria-expanded', String(!before.hidden))
    })
    open.setAttribute('aria-expanded', 'false')
  }
  button('accept', strings.accept, () => act('accept', [change.id]))
  button('reject', strings.reject, () => act('reject', [change.id]))
  box.append(row)
  if (kind === 'changed') box.append(before)
  return box
}

/**
 * Shows Jean's version as changes, with Jean's words if it gave one for each change, or for each block. @param {EditorView} view @param {PMNode} proposed @param {string[]} [notes]
 * @returns {number} how many changes
 */
export function suggest(view, proposed, notes = []) {
  const found = diff(view.state.doc, proposed)
  const blocks = found.reduce((sum, change) => sum + change.size, 0)
  let k = 0
  const changes = found.map((change) => {
    const words = notes.length === found.length ? [notes[k++]] : notes.length === blocks ? notes.slice(k, (k += change.size)) : []
    return { ...change, id: ++ids, why: words.map((one) => String(one).trim()).filter(Boolean).join(' · ') }
  })
  view.dispatch(view.state.tr.setMeta(suggestionKey, { set: changes }).setMeta('addToHistory', false))
  return changes.length
}

/** @param {EditorState} state */
export const pending = (state) => suggestionKey.getState(state)?.changes ?? []

/** The document with every change left accepted. @param {EditorState} state */
export function proposal(state) {
  const tr = state.tr
  for (const change of [...pending(state)].reverse()) tr.replaceWith(change.from, change.to, change.content)
  return tr.doc
}

/** Accepts changes: they go into the document, as one step ⌘Z undoes. @param {EditorView} view @param {number[]} ids */
export function accept(view, ids) {
  const chosen = pending(view.state).filter((change) => ids.includes(change.id)).reverse()
  if (!chosen.length) return
  const tr = view.state.tr
  for (const change of chosen) tr.replaceWith(change.from, change.to, change.content)
  tr.setMeta(suggestionKey, { remove: chosen.map((change) => change.id) })
  const at = tr.mapping.map(chosen[chosen.length - 1].from, -1)
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(Math.min(at, tr.doc.content.size)))))
}

/** Rejects changes Jean proposed: the document stays as it is. @param {EditorView} view @param {number[]} ids */
export function reject(view, ids) {
  view.dispatch(view.state.tr.setMeta(suggestionKey, { remove: ids }).setMeta('addToHistory', false))
}
