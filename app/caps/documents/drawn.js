// What an answer draws, drawn in a document too (D485), by Jean's own code (ui/markdown.js, caps/layouts): a
// block an answer would show otherwise than as its text (steps, a timeline, key figures, a comparison, a
// note; a formula, a chart, a score, a deck, a page, a diagram, a map) shows as the answer shows it while
// the caret is elsewhere, and as its text once the caret goes into it, by the arrows or a click, or Jean
// suggests a change to it: always editable, with no modes. A formula in a line is drawn in its place the
// same way, and a column of amounts lines up at its end, as in an answer. A list of tasks stays the
// document's own, its ticks written in the file.
import { effect, signal } from '@preact/signals-core'
import { render, nothing } from 'lit-html'
import { Plugin, Selection, TextSelection, Decoration, DecorationSet, DOMSerializer } from '#prosemirror'
import { blocks, lex, shapes, widget, withFormulas } from '../../ui/markdown.js'
import { aligned, compared, figured, noted, stepped, timed } from '../layouts/shapes.js'
import { blockMarkdown, schema } from './markdown.js'
import { pending } from './suggest.js'
import { BlockSelection } from './blocks.js'
import { el } from './ui.js'

/** @typedef {import('prosemirror-model').Node} PMNode */
/** @typedef {import('prosemirror-view').EditorView} EditorView */
/** @typedef {{ dom: Node, contentDOM?: HTMLElement | null, update?: (node: PMNode) => boolean, ignoreMutation?: (mutation: any) => boolean, destroy?: () => void }} Own */

/** The blocks an answer may draw, and so a document. */
const DRAWABLE = ['bullet_list', 'ordered_list', 'blockquote', 'table', 'code_block', 'raw_block']

/** A block's token, as an answer reads its Markdown, kept for as long as the block is the same. @type {WeakMap<PMNode, any>} */
const read = new WeakMap()
/** @param {PMNode} node */
const tokenOf = (node) => (read.has(node) ? read : read.set(node, lex(blockMarkdown(node)).find((token) => token.type !== 'space'))).get(node)

/** Whether an answer draws a block otherwise than as its text, by the kind of its token. @type {Record<string, (token: any) => boolean>} */
const DRAWN = {
  code: (token) => token.lang === 'math' || /^(la)?tex$/i.test(token.lang) || widget(token) !== null,
  math: () => true,
  list: (token) => Boolean(shapes.value.list) && (stepped(token) || timed(token) || figured(token)),
  table: (token) => Boolean(shapes.value.table) && compared(token) !== null,
  blockquote: (token) => Boolean(shapes.value.blockquote) && noted(token) !== null,
}

/**
 * A block of the document as ProseMirror draws it (`own`), in a box that also holds, while it is drawn,
 * the answer's form of it, drawn again as the block changes or what draws it loads.
 * @param {PMNode} node @param {EditorView} view @param {() => number | undefined} getPos @param {Own} own
 */
function drawable(node, view, getPos, own) {
  const form = el('div', { class: 'drawn-form prose', contenteditable: 'false' })
  const dom = el('div', { class: 'drawn' }, form, own.dom)
  // The box takes the block's direction (editor.js), which a list or a quote of its own would pass over.
  if (!node.type.spec.code && own.dom instanceof HTMLElement) own.dom.removeAttribute('dir')
  const now = signal(node)
  const stop = effect(() => {
    const token = tokenOf(now.value)
    const on = Boolean(token && DRAWN[token.type]?.(token))
    dom.classList.toggle('is-drawn', on)
    render(on ? blocks([token]) : nothing, form)
  })
  // A click on the form, but on what it holds that does something, puts the caret in the block, which shows its text.
  form.addEventListener('mousedown', (event) => {
    if (/** @type {Element} */ (event.target).closest('a, button, input, select, textarea, label, summary, [tabindex]')) return
    event.preventDefault()
    view.focus()
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve((getPos() ?? 0) + 1))))
  })
  return {
    dom, contentDOM: own.contentDOM,
    /** @param {PMNode} next */
    update(next) {
      if (next.type !== node.type || !(own.update ? own.update(next) : next.sameMarkup(node))) return false
      now.value = node = next
      return true
    },
    /** @param {MutationRecord | { type: 'selection', target: Node }} mutation */
    ignoreMutation: (mutation) => form.contains(mutation.target) || (mutation.type === 'attributes' && mutation.target === dom) || (own.ignoreMutation?.(mutation) ?? false),
    /** @param {Event} event */
    stopEvent: (event) => form.contains(/** @type {Node} */ (event.target)),
    destroy() {
      stop()
      render(nothing, form)
      own.destroy?.()
    },
  }
}

/** ProseMirror's own drawing of a block, as its toDOM has it. @param {PMNode} node @returns {Own} */
const plain = (node) => DOMSerializer.renderSpec(document, /** @type {any} */ (node.type.spec.toDOM)(node))

/** The views of the blocks an answer may draw, at the document's top level; a table's own view (`table`) inside them too. @param {(node: PMNode) => Own} table */
export function drawnViews(table) {
  /** @param {string} name @returns {import('prosemirror-view').NodeViewConstructor} */
  const make = (name) => (node, view, getPos) => {
    const own = name === 'table' ? table(node) : null
    if (view.state.doc.resolve(getPos() ?? 0).depth) return /** @type {any} */ (own)
    return /** @type {any} */ (drawable(node, view, getPos, own ?? plain(node)))
  }
  return Object.fromEntries(DRAWABLE.map((name) => [name, make(name)]))
}

/** A formula of a line, as an answer draws it; a click on it puts the caret in its text. @param {EditorView} view @param {() => number | undefined} getPos @param {string} tex @param {boolean} display */
function formula(view, getPos, tex, display) {
  const box = el('span', { class: 'drawn-formula', contenteditable: 'false' })
  render(withFormulas(display ? `$$${tex}$$` : `$${tex}$`), box)
  box.addEventListener('mousedown', (event) => { event.preventDefault(); view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, (getPos() ?? 1) - 1))) })
  return box
}

/**
 * Which blocks show as their text (the caret's, those a selection of text crosses, those Jean suggests a change
 * to), each formula of a line drawn where the caret isn't, and a column of amounts at its end; the arrows go into
 * a block drawn before or after the caret's.
 */
export const inPlace = new Plugin({
  props: {
    decorations(state) {
      const { from, to } = state.selection
      const text = !(state.selection instanceof BlockSelection)
      const hunks = pending(state)
      /** @type {Decoration[]} */
      const list = []
      state.doc.forEach((node, pos) => {
        const end = pos + node.nodeSize
        if (DRAWABLE.includes(node.type.name) && ((text && from < end && to > pos) || hunks.some((hunk) => hunk.from < end && hunk.to > pos))) list.push(Decoration.node(pos, end, { class: 'is-editing' }))
      })
      state.doc.descendants((node, pos, parent, i) => {
        const math = node.marks.find((mark) => mark.type === schema.marks.math)
        if (math && node.isText && (to < pos || from > pos + node.nodeSize)) {
          list.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'drawn-source' }), Decoration.widget(pos + node.nodeSize, (view, getPos) => formula(view, getPos, node.text ?? '', math.attrs.display), { side: -1, marks: [], key: `${math.attrs.display}${node.text}`, ignoreSelection: true }))
        }
        // A cell of a column an answer lines up at its end, its amounts', which the table doesn't line up itself.
        const table = parent?.type === schema.nodes.table_row ? state.doc.resolve(pos).node(-1) : null
        if (table && !node.attrs.align && aligned(tokenOf(table))[i] === 'right') list.push(Decoration.node(pos, pos + node.nodeSize, { 'data-align': 'right' }))
        return !node.isTextblock || node.inlineContent
      })
      return DecorationSet.create(state.doc, list)
    },
    handleKeyDown(view, event) {
      const rtl = view.dom.ownerDocument.documentElement.dir === 'rtl'
      const forward = /** @type {Record<string, boolean>} */ ({ ArrowDown: true, ArrowUp: false, ArrowRight: !rtl, ArrowLeft: rtl })[event.key]
      const { $head, empty } = view.state.selection
      if (forward === undefined || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey || !empty || !$head.parent.isTextblock) return false
      if (!view.endOfTextblock(/** @type {any} */ ({ ArrowDown: 'down', ArrowUp: 'up', ArrowRight: 'right', ArrowLeft: 'left' })[event.key])) return false
      const found = Selection.findFrom(view.state.doc.resolve(forward ? $head.after() : $head.before()), forward ? 1 : -1, true)
      if (!found || found.$head.index(0) === $head.index(0)) return false
      const block = view.nodeDOM(found.$head.before(1))
      if (!(block instanceof HTMLElement) || !block.matches('.drawn.is-drawn')) return false
      view.dispatch(view.state.tr.setSelection(found).scrollIntoView())
      return true
    },
  },
})
