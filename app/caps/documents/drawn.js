// What an answer draws, drawn in a document too (D485), by Jean's own code (ui/markdown.js, caps/layouts): a
// block an answer would show otherwise than as its text (steps, a timeline, key figures, a comparison, a
// note; a formula, a chart, a score, a deck, a page, a diagram, a map) shows as the answer shows it while
// the caret is elsewhere, and as its text once the caret goes into it, by the arrows or a click: always
// editable, with no modes. Jean's suggestions draw such a block too (`forms`, suggest.js).
// A formula in a line is drawn in its place the same way, and a column of amounts lines up at its end, as in
// an answer. A list of tasks stays the document's own, its ticks written in the file. A ```table block naming
// a table of the project's is that table's view, Tables' own, changed in place. A tag, #name in a line's text, is drawn as one, which a
// click looks for among the creations (D576). A table of contents, `[TOC]` alone on its line (markdown.js), is the headings in their
// order, each under the one above it, drawn again as soon as what they say changes; a click on one puts the caret at its start.
import { effect, signal } from '@preact/signals-core'
import { html, render, nothing } from 'lit-html'
import { keyed } from 'lit-html/directives/keyed.js'
import { Plugin, Selection, TextSelection, Decoration, DecorationSet, DOMSerializer } from '#prosemirror'
import { blocks, lex, shapes, widget, withFormulas, namesRows } from '../../ui/markdown.js'
import { TAG } from '../../ui/mentions.js'
import { aligned, compared, figured, noted, stepped, timed } from '../layouts/shapes.js'
import { blockMarkdown, schema, outline, tree } from './markdown.js'
import { BlockSelection } from './blocks.js'
import { unlock } from '../../ui/caps.js'
import { el } from './ui.js'

/** @import { Tokens } from 'marked' */
/** @import { PMNode, EditorView, Own, Form, ToDOM } from './types.js' */

/** The blocks an answer may draw, and so a document. */
const DRAWABLE = ['bullet_list', 'ordered_list', 'blockquote', 'table', 'code_block', 'raw_block']

/** A block's token, as an answer reads its Markdown, kept for as long as the block is the same. @type {WeakMap<PMNode, any>} */
const read = new WeakMap()
/** @param {PMNode} node */
const tokenOf = (node) => (read.has(node) ? read : read.set(node, lex(blockMarkdown(node)).find((token) => token.type !== 'space'))).get(node)

/** The place of a table of the project's that a block of code of the kind table names. @param {any} token */
const tableOf = (token) => (token.lang === 'table' && /^collections\/[0-9A-HJKMNP-TV-Z]{26}-[^/\s]+$/.test(token.text.trim()) ? token.text.trim() : null)
/** A block as drawn: a table as Tables draws it, which loads Tables if it isn't yet, an element for each place; else as an answer draws it. @param {any} token */
const shape = (token) => (tableOf(token) ? (unlock('tables'), keyed(tableOf(token), html`<app-table folder=${tableOf(token)}></app-table>`)) : blocks([token]))

/** Whether an answer draws a block otherwise than as its text, by the kind of its token. @type {Record<string, (token: any) => boolean>} */
const DRAWN = {
  code: (token) => token.lang === 'math' || /^(la)?tex$/i.test(token.lang) || widget(token) !== null || tableOf(token) !== null,
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
    render(on ? shape(token) : nothing, form)
  })
  // A click on the form, but on what it holds that does something, puts the caret in the block, which shows its text.
  form.addEventListener('mousedown', (event) => {
    if (/** @type {Element} */ (event.target).closest('a, button, input, select, textarea, label, summary, [tabindex], app-table')) return
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
const plain = (node) => DOMSerializer.renderSpec(document, /** @type {ToDOM} */ (node.type.spec.toDOM)(node))

/** The views of the blocks an answer may draw, at the document's top level; a table's own view (`table`) inside them too. @param {(node: PMNode) => Own} table */
export function drawnViews(table) {
  /** @param {string} name @returns {import('prosemirror-view').NodeViewConstructor} */
  const make = (name) => (node, view, getPos) => {
    const own = name === 'table' ? table(node) : null
    if (view.state.doc.resolve(getPos() ?? 0).depth) return /** @type {any} */ (own)
    return drawable(node, view, getPos, own ?? plain(node))
  }
  return Object.fromEntries(DRAWABLE.map((name) => [name, make(name)]))
}

/** Blocks as an answer draws them, for Jean's suggestions (suggest.js): drawn again as what draws them loads. @type {Form} */
export const forms = {
  drawn: (node) => Boolean(DRAWN[tokenOf(node)?.type]?.(tokenOf(node))),
  draw(node, text) {
    if (!DRAWABLE.includes(node.type.name)) return null
    const [box, token] = [el('div', { class: 'suggest-form prose' }), tokenOf(node)]
    return Object.assign(box, { stop: effect(() => void render(DRAWN[token?.type]?.(token) ? shape(token) : text(), box)) })
  },
}

/** A formula of a line, as an answer draws it; a click on it puts the caret in its text. @param {EditorView} view @param {() => number | undefined} getPos @param {string} tex @param {boolean} display */
function formula(view, getPos, tex, display) {
  const box = el('span', { class: 'drawn-formula', contenteditable: 'false' })
  render(withFormulas(display ? `$$${tex}$$` : `$${tex}$`), box)
  box.addEventListener('mousedown', (event) => { event.preventDefault(); view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, (getPos() ?? 1) - 1))) })
  return box
}

/**
 * Which blocks show as their text (the caret's, those a selection of text crosses), each formula of a line drawn
 * where the caret isn't, a tag as one, and a column of amounts at its end; the arrows go into
 * a block drawn before or after the caret's.
 */
export const inPlace = new Plugin({
  props: {
    decorations(state) {
      const { from, to } = state.selection
      const text = !(state.selection instanceof BlockSelection)
      /** @type {Decoration[]} */
      const list = []
      state.doc.forEach((node, pos) => {
        const end = pos + node.nodeSize
        if (DRAWABLE.includes(node.type.name) && text && from < end && to > pos) list.push(Decoration.node(pos, end, { class: 'is-editing' }))
      })
      state.doc.descendants((node, pos, parent, i) => {
        const math = node.marks.find((mark) => mark.type === schema.marks.math)
        if (math && node.isText && (to < pos || from > pos + node.nodeSize)) {
          list.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'drawn-source' }), Decoration.widget(pos + node.nodeSize, (view, getPos) => formula(view, getPos, node.text ?? '', math.attrs.display), { side: -1, marks: [], key: `${math.attrs.display}${node.text}`, ignoreSelection: true }))
        }
        // Not in the title, which holds words alone, nor in code or a link.
        if (node.isText && parent?.type !== schema.nodes.title && !node.marks.some((mark) => mark.type.spec.code || mark.type === schema.marks.link)) {
          for (const tag of /** @type {string} */ (node.text).matchAll(TAG)) list.push(Decoration.inline(pos + (tag.index ?? 0), pos + (tag.index ?? 0) + tag[0].length, { class: 'tag', 'data-tag': tag[0] }))
        }
        // A cell of a column an answer lines up at its end, its amounts', which the table doesn't line up itself; row heads by namesRows().
        const $cell = parent?.type === schema.nodes.table_row ? state.doc.resolve(pos) : null, row = $cell?.index(-1), token = $cell && tokenOf($cell.node(-1))
        if (token && !node.attrs.align && aligned(token)[i] === 'right') list.push(Decoration.node(pos, pos + node.nodeSize, { 'data-align': 'right' }))
        if (token && (!row || !i) && (token.heads ??= namesRows(token.header[0]?.text ?? '', token.rows.map((/** @type {Tokens.TableCell[]} */ cells) => cells[0]?.text.trim() ?? '')))) list.push(Decoration.node(pos, pos + node.nodeSize, row ? { role: 'rowheader' } : { scope: 'col' }))
        return !node.isTextblock || node.inlineContent
      })
      return DecorationSet.create(state.doc, list)
    },
    handleKeyDown(view, event) {
      const forward = /** @type {Record<string, boolean>} */ ({ ArrowDown: true, ArrowUp: false, ArrowRight: document.dir !== 'rtl', ArrowLeft: document.dir === 'rtl' })[event.key]
      const { $head, empty } = view.state.selection
      if (forward === undefined || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey || !empty || !$head.parent.isTextblock) return false
      if (!view.endOfTextblock(/** @type {Record<string, 'down' | 'up' | 'right' | 'left'>} */ ({ ArrowDown: 'down', ArrowUp: 'up', ArrowRight: 'right', ArrowLeft: 'left' })[event.key])) return false
      const found = Selection.findFrom(view.state.doc.resolve(forward ? $head.after() : $head.before()), forward ? 1 : -1, true)
      if (!found || found.$head.index(0) === $head.index(0)) return false
      const block = view.nodeDOM(found.$head.before(1))
      if (!(block instanceof HTMLElement) || !block.matches('.drawn.is-drawn')) return false
      view.dispatch(view.state.tr.setSelection(found).scrollIntoView())
      return true
    },
  },
})

// ── A table of contents ──────────────────────────────────────────────────────────────────────────────
/** What the headings say, once for each state of the document. @type {WeakMap<PMNode, string>} */
const outlines = new WeakMap()
/** @param {PMNode} doc */
const said = (doc) => outlines.get(doc) ?? /** @type {string} */ (outlines.set(doc, outline(doc).map(({ node }) => `${node.attrs.level} ${node.textContent}`).join('\n')).get(doc))

/** Each table of contents marked with what the headings say, so that ProseMirror hands it to its view again once that changes. */
export const contents = new Plugin({
  props: {
    decorations(state) {
      /** @type {Decoration[]} */
      const list = []
      state.doc.forEach((node, pos) => { if (node.type === schema.nodes.toc) list.push(Decoration.node(pos, pos + node.nodeSize, {}, { said: said(state.doc) })) })
      return DecorationSet.create(state.doc, list)
    },
  },
})

/** A table of contents' view, its words from `label`. @param {(key: string) => string} label @returns {import('prosemirror-view').NodeViewConstructor} */
export const contentsView = (label) => (node, view) => {
  const dom = el('nav', { class: 'toc', contenteditable: 'false' })
  /** The `i`th heading: the caret at its start, it at the top. @param {number} i */
  const go = (i) => {
    const head = outline(view.state.doc)[i], line = head && /** @type {HTMLElement | null} */ (view.nodeDOM(head.pos))
    if (!head) return
    view.focus()
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, head.pos + 1)))
    line?.scrollIntoView({ block: 'start' })
  }
  /** @param {import('./markdown.js').Entry[]} entries @returns {HTMLElement} */
  const list = (entries) => el('ul', {}, ...entries.map(({ node: head, i, kids }) => {
    const button = el('button', { type: 'button', dir: 'auto' }, head.textContent)
    button.addEventListener('click', () => go(i))
    return el('li', {}, button, ...(kids.length ? [list(kids)] : []))
  }))
  const draw = () => {
    const entries = tree(outline(view.state.doc))
    dom.setAttribute('aria-label', label('toc'))
    dom.replaceChildren(entries.length ? list(entries) : el('p', {}, label('tocEmpty')))
  }
  draw()
  return { dom, update: (next) => next.type === node.type && (draw(), true), ignoreMutation: () => true, stopEvent: (event) => Boolean(/** @type {Element} */ (event.target).closest?.('button')) }
}
