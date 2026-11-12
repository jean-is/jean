// SPDX-License-Identifier: MIT
// Each one's caret in a document worked on together (D733), in their colour with their name over it, and what they selected, where their
// copy says: a plugin of the document's editor (caps/documents), which loads ProseMirror. A place goes as another copy finds it whatever
// changed above it meanwhile: its block, how far into the block, and a hash of the block's words, the nearest block whose words hash
// alike taken first, else the one at its index; between two words from them, it moves with what changes here. This person's own goes
// once they are in the document, then as it moves, others' words merged in included, until its pane closes. Pure, so node --test runs it.
import { Plugin, PluginKey, Decoration, DecorationSet } from '#prosemirror'
import { computed } from '@preact/signals-core'

/** @typedef {import('prosemirror-model').Node} PMNode */
/** A place, as another copy finds it: its block's index, how far into the block, a hash of the block's words. @typedef {[number, number, string]} Spot */
/** Someone else in the document: who, as nobody else is; their name; their colour, a CSS one; and their selection's anchor and head. @typedef {{ who: string, name: string, colour: string, spots: [Spot, Spot] }} Other */

/** @param {string} text */
const hash = (text) => [...text].reduce((sum, char) => (Math.imul(sum, 31) + /** @type {number} */ (char.codePointAt(0))) | 0, 7).toString(36)
/** Where a top-level block starts. @param {PMNode} doc @param {number} index */
const start = (doc, index) => { let at = 0; for (let i = 0; i < index; i++) at += doc.child(i).nodeSize; return at }

/** A place in the document, as another copy finds it. @param {PMNode} doc @param {number} pos @returns {Spot} */
export function spot(doc, pos) {
  const index = Math.min(doc.resolve(pos).index(0), doc.childCount - 1)
  return [index, pos - start(doc, index), hash(doc.child(index).textContent)]
}

/** Where a place another copy gave is here, inside a block. @param {PMNode} doc @param {Spot} spot */
export function place(doc, [index, into, words]) {
  let found = -1
  doc.forEach((node, _, i) => { if (hash(node.textContent) === words && (found < 0 || Math.abs(i - index) < Math.abs(found - index))) found = i })
  const i = found < 0 ? Math.max(0, Math.min(index | 0, doc.childCount - 1)) : found, at = start(doc, i)
  return Math.max(at, Math.min(at + (into | 0), at + doc.child(i).nodeSize - 1))
}

/** Their caret, their name over it, kept out of the text's and the screen reader's way. @param {string} name @param {string} style */
const flag = (name, style) => { const caret = Object.assign(document.createElement('span'), { className: 'together-caret', style, ariaHidden: 'true' }); caret.append(Object.assign(document.createElement('bdi'), { textContent: name })); return caret }
/** Each one's selection, tinted, and their caret. @param {PMNode} doc @param {Other[]} list */
const draw = (doc, list) => DecorationSet.create(doc, list.flatMap(({ who, name, colour, spots }) => {
  const [anchor, head] = spots.map((one) => place(doc, one)), style = `--badge: ${colour}`
  return [...(anchor === head ? [] : [Decoration.inline(Math.min(anchor, head), Math.max(anchor, head), { class: 'together-selection', style })]),
    Decoration.widget(head, () => flag(name, style), { key: `${who} ${name} ${colour}`, side: 10, ignoreSelection: true })]
}))

const key = new PluginKey('carets')
/**
 * The plugin for the document at `path`: the others in it, as `of` gives them, drawn again as they change, moved meanwhile with what changes
 * here; and this person's selection given to `say`, null once the pane closes.
 * @param {string} path @param {(path: string, spots: [Spot, Spot] | null) => void} say @param {(path: string) => Other[]} of
 */
export function carets(path, say, of) {
  let said = false
  const tell = (/** @type {import('prosemirror-view').EditorView} */ view) => { said = true; say(path, [spot(view.state.doc, view.state.selection.anchor), spot(view.state.doc, view.state.selection.head)]) }
  return new Plugin({
    key,
    state: { init: () => DecorationSet.empty, apply: (tr, set) => ((list) => (list ? draw(tr.doc, list) : set.map(tr.mapping, tr.doc)))(tr.getMeta(key)) },
    props: { decorations: (state) => key.getState(state), handleDOMEvents: { focus: (view) => (tell(view), false) } },
    view: (view) => {
      const stop = computed(() => of(path)).subscribe((list) => queueMicrotask(() => view.isDestroyed || view.dispatch(view.state.tr.setMeta(key, list).setMeta('addToHistory', false))))
      return {
        update: (view, was) => { if ((said || view.hasFocus()) && (view.state.doc !== was.doc || !view.state.selection.eq(was.selection))) tell(view) },
        destroy: () => { stop(); say(path, null) },
      }
    },
  })
}

/** The plugin added to a document's editor, once, from the start or once working together comes. @param {import('prosemirror-view').EditorView} view @param {Parameters<typeof carets>} args */
export const plug = (view, ...args) => { if (!view.isDestroyed && !key.get(view.state)) view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, carets(...args)] })) }
