// Jean's changes as suggestions (D485): the document Jean's brain proposes is compared with the one open, block by
// block and then word by word inside a block that changed, and each difference is drawn where it
// is, what goes struck through (<del>) and what comes underlined (<ins>), until the person keeps or
// undoes it. Nothing of a suggestion is in the document until it is kept, so saving never writes one.
import { Plugin, PluginKey, TextSelection, Decoration, DecorationSet, DOMSerializer, Fragment, Mark } from '#prosemirror'
import { el } from './ui.js'

/** @typedef {import('prosemirror-model').Node} PMNode */
/** @typedef {import('prosemirror-state').EditorState} EditorState */
/** @typedef {import('prosemirror-state').Transaction} Transaction */
/** @typedef {import('prosemirror-view').EditorView} EditorView */
/**
 * One change: what it replaces (from–to in the document open), what it puts there, and whether
 * that is text in a line or whole blocks. @typedef {{ id: number, from: number, to: number, content: Fragment, inline: boolean }} Hunk
 */
/** @typedef {{ hunks: Hunk[], deco: DecorationSet }} State */

export const suggestionKey = /** @type {PluginKey<State>} */ (new PluginKey('suggestions'))

/**
 * The longest common subsequence's table, for lists of up to a few thousand items.
 * @template T @param {T[]} a @param {T[]} b @param {(x: T, y: T) => boolean} eq
 */
function lcs(a, b, eq) {
  const rows = a.length + 1, cols = b.length + 1
  const table = new Uint32Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = eq(a[i], b[j]) ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
    }
  }
  /** Runs of what differs between matches: [i0, i1) of a for [j0, j1) of b. */
  const runs = /** @type {Array<[number, number, number, number]>} */ ([])
  let i = 0, j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && eq(a[i], b[j])) { i++; j++; continue }
    const i0 = i, j0 = j
    while ((i < a.length || j < b.length) && !(i < a.length && j < b.length && eq(a[i], b[j]))) {
      if (j >= b.length || (i < a.length && table[(i + 1) * cols + j] >= table[i * cols + j + 1])) i++
      else j++
    }
    runs.push([i0, i, j0, j])
  }
  return runs
}

/** A node's or a fragment's children. @param {PMNode | Fragment} node */
const childList = (node) => { const list = /** @type {PMNode[]} */ ([]); node.forEach((child) => list.push(child)); return list }

/** Where each child starts, inside a node whose content starts at `start`. @param {PMNode[]} list @param {number} start */
function starts(list, start) {
  const out = [start]
  for (const child of list) out.push(out[out.length - 1] + child.nodeSize)
  return out
}

// Words, as the language has them where it can tell (Japanese has no spaces between them).
const words = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null
/** @param {string} text */
const split = (text) => (words ? [...words.segment(text)].map(({ segment }) => segment) : text.split(/(\s+|[^\p{L}\p{N}\s])/u).filter(Boolean))

/**
 * A line's content as units to compare: its words, spaces and signs with their marks, and each
 * other inline node. @param {PMNode} block
 * @returns {Array<{ text: string | null, node: PMNode | null, marks: readonly Mark[], at: number, size: number }>}
 */
function units(block) {
  /** @type {Array<{ text: string | null, node: PMNode | null, marks: readonly Mark[], at: number, size: number }>} */
  const out = []
  block.forEach((child, offset) => {
    if (!child.isText) { out.push({ text: null, node: child, marks: child.marks, at: offset, size: child.nodeSize }); return }
    let at = offset
    for (const piece of split(/** @type {string} */ (child.text))) {
      out.push({ text: piece, node: null, marks: child.marks, at, size: piece.length })
      at += piece.length
    }
  })
  return out
}

/**
 * The differences between two lines, as changes of a few words each.
 * @param {PMNode} a @param {PMNode} b @param {number} startA @param {number} startB where their content starts
 * @returns {Omit<Hunk, 'id'>[]}
 */
function diffInline(a, b, startA, startB) {
  const ua = units(a), ub = units(b)
  const eq = (/** @type {typeof ua[number]} */ x, /** @type {typeof ua[number]} */ y) => (x.node ? Boolean(y.node && x.node.eq(y.node)) : x.text === y.text) && Mark.sameSet(x.marks, y.marks)
  const runs = lcs(ua, ub, eq)
  // Words changed with only spaces or a sign or two between them are one change: "19:30" → "20:00".
  /** @type {Array<[number, number, number, number]>} */
  const merged = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    const gap = last ? ua.slice(last[1], run[0]) : []
    if (last && gap.every((u) => u.text !== null && /^[\s\p{P}\p{S}]*$/u.test(u.text)) && (gap.length <= 3 || gap.every((u) => !/\S/.test(/** @type {string} */ (u.text))))) {
      last[1] = run[1]
      last[3] = run[3]
    } else merged.push([...run])
  }
  const end = (/** @type {typeof ua} */ list, /** @type {number} */ i) => (i < list.length ? list[i].at : list.length ? list[list.length - 1].at + list[list.length - 1].size : 0)
  return merged.map(([i0, i1, j0, j1]) => {
    const fromA = end(ua, i0), toA = end(ua, i1), fromB = end(ub, j0), toB = end(ub, j1)
    return { from: startA + fromA, to: startA + toA, content: b.content.cut(fromB, toB), inline: true }
  })
}

/**
 * The differences between two nodes' children: a block that only changed inside is compared inside.
 * @param {PMNode} a @param {PMNode} b @param {number} startA @param {number} startB @returns {Omit<Hunk, 'id'>[]}
 */
function diffChildren(a, b, startA, startB) {
  const la = childList(a), lb = childList(b)
  const pa = starts(la, startA), pb = starts(lb, startB)
  /** @type {Omit<Hunk, 'id'>[]} */
  const out = []
  for (const [i0, i1, j0, j1] of lcs(la, lb, (x, y) => x.eq(y))) {
    const pairs = i1 - i0 === j1 - j0 && la.slice(i0, i1).every((x, k) => x.sameMarkup(lb[j0 + k]) && !x.isLeaf)
    if (pairs) {
      for (let k = 0; k < i1 - i0; k++) {
        const x = la[i0 + k], y = lb[j0 + k]
        out.push(...(x.isTextblock ? diffInline(x, y, pa[i0 + k] + 1, pb[j0 + k] + 1) : diffChildren(x, y, pa[i0 + k] + 1, pb[j0 + k] + 1)))
      }
    } else {
      out.push({ from: pa[i0], to: pa[i1], content: Fragment.fromArray(lb.slice(j0, j1)), inline: false })
    }
  }
  return out
}

/** What changes between the document open and the one Jean proposes. @param {PMNode} doc @param {PMNode} proposed */
export const diff = (doc, proposed) => diffChildren(doc, proposed, 0, 0)

let ids = 0

/**
 * The plugin that holds the suggestions and draws them. `strings` names the buttons drawn with each
 * change, `act` keeps or undoes one from them, and `changed` hears each time the suggestions change.
 * @param {{ strings: () => Record<string, any>, act: (kind: 'keep' | 'undo', ids: number[]) => void, changed: (hunks: Hunk[], view: EditorView) => void }} options
 */
export function suggestions({ strings, act, changed }) {
  return new Plugin({
    key: suggestionKey,
    state: {
      init: () => /** @type {State} */ ({ hunks: [], deco: DecorationSet.empty }),
      apply(tr, value, _old, state) {
        const meta = tr.getMeta(suggestionKey)
        let hunks = value.hunks
        if (tr.docChanged) {
          hunks = hunks.flatMap((hunk) => {
            const from = tr.mapping.mapResult(hunk.from, 1), to = tr.mapping.mapResult(hunk.to, -1)
            return from.pos > to.pos || (hunk.from < hunk.to && from.deletedAcross && to.deletedAcross) ? [] : [{ ...hunk, from: from.pos, to: Math.max(from.pos, to.pos) }]
          })
        }
        if (meta?.clear) hunks = []
        if (meta?.add) hunks = [...hunks, ...meta.add]
        if (meta?.remove) hunks = hunks.filter((hunk) => !meta.remove.includes(hunk.id))
        if (hunks === value.hunks && !tr.docChanged) return value
        return { hunks, deco: draw(state.doc, hunks, strings(), act) }
      },
    },
    props: { decorations: (state) => suggestionKey.getState(state)?.deco },
    view: () => ({
      update(view, previous) {
        const now = suggestionKey.getState(view.state)?.hunks, was = suggestionKey.getState(previous)?.hunks
        if (now !== was) changed(now ?? [], view)
      },
    }),
  })
}

/**
 * Each change drawn: what goes, struck through where it is, and what comes, after it.
 * @param {PMNode} doc @param {Hunk[]} hunks @param {Record<string, string>} strings @param {(kind: 'keep' | 'undo', ids: number[]) => void} act
 */
function draw(doc, hunks, strings, act) {
  const serializer = DOMSerializer.fromSchema(doc.type.schema)
  /** @type {Decoration[]} */
  const list = []
  for (const hunk of hunks) {
    if (hunk.to > hunk.from) {
      list.push(Decoration.inline(hunk.from, hunk.to, { nodeName: 'del', class: 'suggest-del', 'data-suggestion': String(hunk.id) }))
      if (!hunk.inline) doc.nodesBetween(hunk.from, hunk.to, (node, pos) => {
        if (pos >= hunk.from && pos + node.nodeSize <= hunk.to) { list.push(Decoration.node(pos, pos + node.nodeSize, { class: 'suggest-del-block' })); return false }
        return true
      })
    }
    const nodes = hunk.inline ? (hunk.content.size ? [hunk.content] : []) : childList(hunk.content)
    nodes.forEach((piece, k) => {
      const last = k === nodes.length - 1
      list.push(Decoration.widget(hunk.to, () => {
        const dom = hunk.inline
          ? inlineWidget(/** @type {DocumentFragment} */ (serializer.serializeFragment(/** @type {Fragment} */ (piece))))
          : blockWidget(/** @type {HTMLElement} */ (serializer.serializeNode(/** @type {PMNode} */ (piece))))
        if (last) actions(dom, hunk, strings, act)
        return dom
      }, { side: 1, key: `suggest-${hunk.id}-${k}`, ignoreSelection: true, stopEvent: () => true, marks: [] }))
    })
    if (!nodes.length) {
      list.push(Decoration.widget(hunk.to, () => actions(el('span', { class: 'suggest suggest-only-actions' }), hunk, strings, act), { side: 1, key: `suggest-${hunk.id}-x`, ignoreSelection: true, stopEvent: () => true }))
    }
  }
  return DecorationSet.create(doc, list)
}

/** @param {DocumentFragment} content */
const inlineWidget = (content) => el('span', { class: 'suggest suggest-inline', contenteditable: 'false' }, el('ins', { class: 'suggest-ins' }, content))

/** A block that comes: its text inside <ins>, so that it reads as an insertion. @param {HTMLElement} dom */
function blockWidget(dom) {
  dom.classList.add('suggest', 'suggest-block')
  dom.contentEditable = 'false'
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT)
  /** @type {Text[]} */
  const texts = []
  while (walker.nextNode()) texts.push(/** @type {Text} */ (walker.currentNode))
  for (const text of texts) text.replaceWith(el('ins', { class: 'suggest-ins' }, text.data))
  return dom
}

/**
 * Keep and Undo beside a change, for a pointer: from the keyboard, the review bar does the same.
 * @param {HTMLElement} dom @param {Hunk} hunk @param {Record<string, string>} strings @param {(kind: 'keep' | 'undo', ids: number[]) => void} act
 */
function actions(dom, hunk, strings, act) {
  // The review bar is where the keyboard and a screen reader keep or undo: these would only be read into the line's name.
  const box = el('span', { class: 'suggest-actions', 'aria-hidden': 'true' })
  for (const [kind, label, glyph] of /** @type {const} */ ([['keep', strings.keep, '✓'], ['undo', strings.undoChange, '✕']])) {
    const button = el('button', { type: 'button', tabindex: '-1', class: `suggest-${kind}`, 'aria-label': label }, glyph)
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => act(kind, [hunk.id]))
    box.append(button)
  }
  ;(dom.matches('tr') ? dom.lastElementChild ?? dom : dom).append(box)
  return dom
}

/**
 * Shows what Jean proposes, as suggestions. @param {EditorView} view @param {PMNode} proposed
 * @returns {number} how many changes
 */
export function suggest(view, proposed) {
  const hunks = diff(view.state.doc, proposed).map((hunk) => ({ ...hunk, id: ++ids }))
  view.dispatch(view.state.tr.setMeta(suggestionKey, { clear: true, add: hunks }).setMeta('addToHistory', false))
  return hunks.length
}

/** @param {EditorState} state */
export const pending = (state) => suggestionKey.getState(state)?.hunks ?? []

/** Keeps changes: they go into the document, as one step ⌘Z undoes. @param {EditorView} view @param {number[]} ids */
export function keep(view, ids) {
  const chosen = pending(view.state).filter((hunk) => ids.includes(hunk.id)).sort((x, y) => y.from - x.from)
  if (!chosen.length) return
  const tr = view.state.tr
  for (const hunk of chosen) tr.replaceWith(hunk.from, hunk.to, hunk.content)
  tr.setMeta(suggestionKey, { remove: chosen.map((hunk) => hunk.id) })
  const at = tr.mapping.map(chosen[chosen.length - 1].from)
  view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at, tr.doc.content.size)))))
}

/** Undoes changes Jean proposed: the document stays as it is. @param {EditorView} view @param {number[]} ids */
export function dismiss(view, ids) {
  view.dispatch(view.state.tr.setMeta(suggestionKey, { remove: ids }).setMeta('addToHistory', false))
}
