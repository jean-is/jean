// A document's editor (D485), in Jean's own document, under its own policy: a Markdown file edited as a
// document, which caps/documents/documents.js opens in the preview with create(). There is no toolbar:
// Markdown typed at a line's start, "/" for a menu of what the line can become, a bubble over the text
// selected, the usual keys, and the browser's own Format menu (iOS's B I U) shape the text; whole blocks
// are selected from the margin or their grip, then removed, moved or turned into another kind. What an
// answer draws of a block (steps, a comparison, a chart, a formula…) it draws too, by Jean's own code
// (./drawn.js). Each change is saved a moment later; Jean hears what is selected, and what the person did
// with its suggestions. What ProseMirror would read with innerHTML, the HTML a paste or a drop brings, is
// read instead in a small sealed frame of preview.html's kind, which hands back only a tree of what a
// document keeps (./clipboard.js), built again in an inert document where nothing loads.
import {
  EditorState, Plugin, TextSelection, Fragment, Slice, DOMParser as SchemaParser, EditorView, Decoration, DecorationSet, history, undo, redo, keymap,
  baseKeymap, toggleMark, setBlockType, wrapIn, chainCommands, exitCode, InputRule, inputRules, wrappingInputRule, textblockTypeInputRule, undoInputRule,
  splitListItem, liftListItem, sinkListItem, wrapInList, tableEditing, goToNextCell, addRowAfter, isInTable, TableView, dropCursor, gapCursor,
} from '#prosemirror'
import { effect } from '@preact/signals-core'
import { t as translate } from '../../core/i18n.js'
import { assistantName } from '../../ui/state.js'
import { PAGE_SANDBOX, pagePolicy } from '../../ui/csp.js'
import { encode } from '../../ui/seal.js'
import { unlock } from '../../ui/caps.js'
import { schema, parse, serialize, sliceMarkdown, safeHref, Sources, words } from './markdown.js'
import { el } from './ui.js'
import { fromTree } from './clipboard.js'
import { suggestions, suggest, keep, dismiss, pending } from './suggest.js'
import { slashMenu } from './slash.js'
import { bubble } from './bubble.js'
import { blocks } from './blocks.js'
import { drawnViews, inPlace } from './drawn.js'

/** @typedef {import('prosemirror-model').Node} PMNode */
/** @typedef {import('prosemirror-state').Command} Command */

const { nodes: N, marks: M } = schema
const MAC = /Mac|iP(hone|[oa]d)/.test(navigator.platform)

/** The editor's words, in Jean's language. @param {string} key @param {Record<string, string | number>} [values] `n` picks a plural's form */
const t = (key, values = {}) => translate(`documents.${key}`, { name: assistantName(), ...values, count: Number(values.n ?? 0) })

// ── The small sealed frame that reads what a paste or a drop brings as HTML ─────────────────────────────
/** Its scripts run, as a page's whose scripts are data; nothing comes from the web or goes to it, whatever Settings let pages do. */
const POLICY = pagePolicy({ scripts: true, fullscreen: false, downloads: false, web: false, network: false, maps: false }, [], true)
/** @type {Promise<Window> | null} */
let reader = null

/** The frame, made at the first paste and kept: preview.html's relay, writing a page that answers each message's port with clipboard.js's tree. */
function sealed() {
  reader ??= new Promise((resolve) => {
    const frame = /** @type {HTMLIFrameElement} */ (el('iframe', { sandbox: PAGE_SANDBOX, 'aria-hidden': 'true', tabindex: '-1', hidden: '' }))
    addEventListener('message', ({ source, data }) => { if (source && source === frame.contentWindow && data?.reader) resolve(source) })
    frame.addEventListener('load', async () => {
      const module = `data:text/javascript;base64,${encode(new Uint8Array(await (await fetch(new URL('clipboard.js', import.meta.url))).arrayBuffer()))}`
      const page = /* html */ `<script type="importmap">${JSON.stringify({ imports: { 'documents/clipboard.js': module } })}</script>
<script type="module">import { cleanTree } from 'documents/clipboard.js'
addEventListener('message', ({ source, data, ports }) => { if (source === parent && typeof data?.html === 'string') ports[0]?.postMessage(cleanTree(data.html)) })
parent.postMessage({ reader: true }, '*')</script>`
      frame.contentWindow?.postMessage({ page, policy: POLICY }, '*')
    }, { once: true })
    frame.src = new URL('../../preview.html', import.meta.url).href
    document.body.append(frame)
  })
  return reader
}

/** HTML a paste or a drop brought, read in the frame, built in an inert document, put in. @param {EditorView} view @param {string} html @param {number | null} at */
async function insertHTML(view, html, at) {
  const { port1, port2 } = new MessageChannel()
  ;(await sealed()).postMessage({ html }, '*', [port2])
  const tree = await new Promise((resolve) => { port1.onmessage = ({ data }) => resolve(Array.isArray(data) ? data : []) })
  const { state } = view
  const read = SchemaParser.fromSchema(schema).parseSlice(fromTree(tree, document.implementation.createHTMLDocument('')), { context: at === null ? state.selection.$from : state.doc.resolve(at) })
  const slice = new Slice(plainHeads(read.content), read.openStart, read.openEnd)
  view.dispatch((at === null ? state.tr.replaceSelection(slice) : state.tr.replaceRange(at, at, slice)).scrollIntoView().setMeta('paste', true).setMeta('uiEvent', at === null ? 'paste' : 'drop'))
}

/**
 * A table's first row is its head, bold already in Markdown: Word and Google Docs copy it as cells,
 * their text bold. @param {Fragment} content @returns {Fragment}
 */
function plainHeads(content) {
  /** @type {PMNode[]} */
  const out = []
  content.forEach((node) => {
    if (node.type !== N.table) return void out.push(node.isLeaf || node.isText ? node : node.copy(plainHeads(node.content)))
    /** @type {PMNode[]} */
    const cells = []
    node.child(0).forEach((cell) => cells.push(N.table_header.create(cell.attrs, Fragment.fromArray(cell.content.content.map((child) => child.mark(M.strong.removeFromSet(child.marks)))), cell.marks)))
    out.push(node.copy(node.content.replaceChild(0, node.child(0).copy(Fragment.fromArray(cells)))))
  })
  return Fragment.fromArray(out)
}

// ── What the keys, "/" and the bubble do ──────────────────────────────────────────────────────────────
/** How deep the list's item a selection is in sits, or 0. @param {import('prosemirror-state').Selection} selection */
const itemDepth = ({ $from }) => { let depth = $from.depth; while (depth > 0 && $from.node(depth).type !== N.list_item) depth--; return depth }

/** Tab moves into a list's item or to a table's next cell; anywhere else, focus leaves the editor. @param {1 | -1} dir @returns {Command} */
const tab = (dir) => (state, dispatch, view) => {
  if (itemDepth(state.selection)) {
    (dir > 0 ? sinkListItem : liftListItem)(N.list_item)(state, dispatch)
    return true
  }
  if (!isInTable(state)) return false
  if (goToNextCell(dir)(state, dispatch)) return true
  if (dir > 0 && view && addRowAfter(state, dispatch)) goToNextCell(1)(view.state, view.dispatch)
  return true
}

/** @type {Command} */
const lineBreak = (state, dispatch) => (dispatch?.(state.tr.replaceSelectionWith(N.hard_break.create()).scrollIntoView()), true)

/** @type {Record<string, Command>} */
const KEYS = {
  'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
  'Mod-b': toggleMark(M.strong), 'Mod-i': toggleMark(M.em), 'Mod-e': toggleMark(M.code), 'Mod-Shift-x': toggleMark(M.del),
  'Mod-Alt-1': setBlockType(N.heading, { level: 1 }), 'Mod-Alt-2': setBlockType(N.heading, { level: 2 }), 'Mod-Alt-3': setBlockType(N.heading, { level: 3 }), 'Mod-Alt-0': setBlockType(N.paragraph),
  // In a task, Enter makes the next line a task too.
  Enter: (state, dispatch) => Boolean(itemDepth(state.selection)) && splitListItem(N.list_item, state.selection.$from.node(itemDepth(state.selection)).attrs.checked === null ? undefined : { checked: false })(state, dispatch),
  'Shift-Enter': chainCommands(exitCode, lineBreak), 'Mod-Enter': chainCommands(exitCode, lineBreak),
  Tab: tab(1), 'Shift-Tab': tab(-1), Backspace: undoInputRule,
}

// What "/" offers (slash.js): what the line can become, by its name and a few words to find it by.
/** A list of tasks to tick. @type {Command} */
const taskList = (state, dispatch) => wrapInList(N.bullet_list)(state, dispatch && ((tr) => dispatch(tr.setNodeMarkup(tr.selection.$from.before(itemDepth(tr.selection)), null, { checked: false }))))
/**
 * Blocks put where the line is, when it is empty, or after it; the caret goes into the first of
 * them that holds text. @param {() => PMNode[]} make @returns {Command}
 */
const insertBlocks = (make) => (state, dispatch) => {
  const { $from } = state.selection
  if ($from.depth !== 1) return false
  if (dispatch) {
    const empty = $from.parent.content.size === 0
    const at = empty ? $from.before() : $from.after()
    const tr = state.tr.replaceWith(at, empty ? $from.after() : at, make())
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1))).scrollIntoView())
  }
  return true
}
const ITEMS = [
  { key: 'text', glyph: '¶', words: 'text paragraph plain', run: setBlockType(N.paragraph) },
  { key: 'heading1', glyph: 'H1', words: 'heading title h1 #', run: setBlockType(N.heading, { level: 1 }) },
  { key: 'heading2', glyph: 'H2', words: 'heading subtitle h2 ##', run: setBlockType(N.heading, { level: 2 }) },
  { key: 'heading3', glyph: 'H3', words: 'heading h3 ###', run: setBlockType(N.heading, { level: 3 }) },
  { key: 'bullets', glyph: '•', words: 'bulleted list bullets unordered ul -', run: wrapInList(N.bullet_list) },
  { key: 'numbers', glyph: '1.', words: 'numbered list ordered ol 1.', run: wrapInList(N.ordered_list) },
  { key: 'tasks', glyph: '☐', words: 'to-do todo task checklist checkbox [ ]', run: taskList },
  { key: 'quote', glyph: '❝', words: 'quote blockquote citation >', run: wrapIn(N.blockquote) },
  { key: 'codeBlock', glyph: '‹›', words: 'code snippet ```', run: setBlockType(N.code_block) },
  { key: 'table', glyph: '▦', words: 'table grid columns', run: insertBlocks(() => [N.table.create(null, [N.table_row.create(null, [N.table_header.create(), N.table_header.create()]), N.table_row.create(null, [N.table_cell.create(), N.table_cell.create()])]), N.paragraph.create()]) },
  { key: 'divider', glyph: '—', words: 'divider separator line rule hr ---', run: insertBlocks(() => [N.horizontal_rule.create(), N.paragraph.create()]) },
]

// What the bubble over a selection puts on (bubble.js).
const FORMATS = [
  { key: 'bold', glyph: 'B', type: M.strong, keys: 'B' },
  { key: 'italic', glyph: 'I', type: M.em, keys: 'I' },
  { key: 'strike', glyph: 'S', type: M.del, keys: 'Shift+X' },
]
/**
 * A typed address as a link's: https:// added when it has no scheme, mailto: for an e-mail
 * address, a place in the file kept; never an address that runs (safeHref). @param {string} typed
 */
function linkHref(typed) {
  const text = typed.trim()
  if (!text || /\s/.test(text)) return null
  if (/^([a-z][a-z\d+.-]*:|#|\/)/i.test(text)) return safeHref(text)
  if (/^[^@/]+@[^@/]+\.[^@/]+$/.test(text)) return `mailto:${text}`
  return /^[^/]+\.[a-z]{2,}(\/|$)/i.test(text) ? `https://${text}` : null
}

const RULES = inputRules({ rules: [
  textblockTypeInputRule(/^(#{1,6})\s$/, N.heading, (match) => ({ level: match[1].length })),
  wrappingInputRule(/^\s*>\s$/, N.blockquote),
  wrappingInputRule(/^\s*([-+*])\s$/, N.bullet_list, (match) => ({ bullet: match[1] })),
  wrappingInputRule(/^(\d+)([.)])\s$/, N.ordered_list, (match) => ({ order: Number(match[1]), delim: match[2] }), (match, node) => node.childCount + node.attrs.order === Number(match[1])),
  textblockTypeInputRule(/^```([\w-]*)\s$/, N.code_block, (match) => ({ lang: match[1] })),
  // "---" alone on a line is a divider, as Markdown reads it, and the caret goes to the line after it.
  new InputRule(/^(---|\*\*\*|___)$/, (state, match, start, end) => {
    const $start = state.doc.resolve(start)
    if ($start.depth !== 1 || $start.parent.type !== N.paragraph || state.doc.resolve(end).parentOffset !== $start.parent.content.size) return null
    const tr = state.tr.replaceWith($start.before(), $start.after(), [N.horizontal_rule.create({ markup: match[1] }), N.paragraph.create()])
    return tr.setSelection(TextSelection.create(tr.doc, $start.before() + 2))
  }),
] })

// A line with no letter yet (empty, a slash, a number) reads as the document does, where dir="auto"
// would make it left to right: in Arabic, a new line starts on the right. Every line gets its dir
// here, as ProseMirror drops an attribute a decoration had set rather than give back toDOM's. A list or a
// quote takes its first letter's, its bullets and boxes on that side: dir="auto" passes over lines with a dir.
// A note's own mark ([!TIP]) is no letter of its text.
const RTL = /^[֐-ࣿיִ-﷿ﹰ-﻿]/
const direction = new Plugin({
  props: {
    decorations(state) {
      const dir = document.documentElement.dir || 'ltr'
      /** @type {Decoration[]} */
      const list = []
      state.doc.descendants((node, pos) => {
        const letter = /\p{L}/u.exec(node.textContent.replace(/^\[!\w+\]/, ''))?.[0]
        if (/^(bullet_list|ordered_list|blockquote|table)$/.test(node.type.name)) list.push(Decoration.node(pos, pos + node.nodeSize, { dir: letter ? (RTL.test(letter) ? 'rtl' : 'ltr') : dir }))
        if (!node.isTextblock) return true
        if (!node.type.spec.code) list.push(Decoration.node(pos, pos + node.nodeSize, { dir: /\p{L}/u.test(node.textContent) ? 'auto' : dir }))
        return false
      })
      return DecorationSet.create(state.doc, list)
    },
  },
})

// ── An editor ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * A document's editor in `box`: its name and text, `write` for each change, and `tell` for what Jean's
 * brain hears with the next message (what is selected, what the person did with Jean's suggestions).
 * @param {HTMLElement} box @param {{ name: string, markdown: string, write: (markdown: string) => Promise<void>, tell: (context: string) => void }} file
 */
export function create(box, { name, markdown: text, write, tell }) {
  unlock('layouts')
  const reviewText = el('p', { class: 'review-text' })
  const position = el('span', { class: 'review-position' })
  const review = el('div', { role: 'region', class: 'review', hidden: '' }, reviewText, position)
  const live = el('p', { class: 'visually-hidden', 'aria-live': 'polite' })
  const mount = el('div', { class: 'doc-wrap' })
  box.append(review, mount, live)
  /** @param {string} said */
  const announce = (said) => { live.textContent = ''; setTimeout(() => { live.textContent = said }, 50) }

  const read = parse(text)
  const { sources } = read
  let tally = { kept: 0, undone: 0 }
  /** @type {number | null} */
  let current = null

  /** The review bar's buttons, by their words' keys, and what each does. */
  const reviewButtons = /** @type {Record<string, HTMLButtonElement>} */ (Object.fromEntries(Object.entries({
    previous: () => go(-1), next: () => go(1), keep: () => current !== null && act('keep', [current]), undoChange: () => current !== null && act('undo', [current]),
    keepAll: () => act('keep', pending(view.state).map((hunk) => hunk.id)), undoAll: () => act('undo', pending(view.state).map((hunk) => hunk.id)),
  }).map(([key, run]) => {
    const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: `review-${key}` }))
    button.addEventListener('click', run)
    review.append(button)
    return [key, button]
  })))

  /** @param {'keep' | 'undo'} kind @param {number[]} ids */
  function act(kind, ids) {
    ;(kind === 'keep' ? keep : dismiss)(view, ids)
    tally[kind === 'keep' ? 'kept' : 'undone'] += ids.length
    announce(t(kind === 'keep' ? 'kept' : 'undone'))
    // The keyboard in the document, unless it is on the review bar: a click doesn't move it in Safari.
    if (!pending(view.state).length || !box.contains(document.activeElement)) view.focus()
    if (!pending(view.state).length) tell(`Of the changes suggested to ${name}, the user kept ${tally.kept} and undid ${tally.undone}.`)
  }

  const plugins = [
    // First, so that its Enter, Tab and arrows come before the keymaps' while it is open.
    slashMenu({ items: ITEMS, label: t, announce }),
    bubble({ formats: FORMATS, link: M.link, href: linkHref, label: t, mac: MAC, tabbable: (state) => !itemDepth(state.selection) && !isInTable(state) }),
    blocks({ label: t, announce, mac: MAC, kinds: ITEMS.filter((item) => item.key !== 'table' && item.key !== 'divider') }),
    inPlace,
    RULES,
    keymap({ ...KEYS, 'Mod-s': () => (flush(), true) }),
    keymap(baseKeymap),
    history(),
    dropCursor(),
    gapCursor(),
    tableEditing(),
    suggestions({ strings: () => ({ keep: t('keep'), undoChange: t('undoChange') }), act, changed: (hunks) => showReview(hunks) }),
    direction,
  ]

  /** @param {EditorState} _state */
  const attributes = (_state) => ({ id: 'doc', class: 'doc prose', role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('document', { file: name }), spellcheck: 'true' })

  // A table scrolls sideways in a box of its own, so a wide one never widens the pane.
  const views = () => drawnViews((node) => new TableView(node, 64))
  words.done = t('done')
  const view = new EditorView(mount, {
    state: EditorState.create({ doc: read.doc, plugins }),
    attributes,
    nodeViews: views(),
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr))
      if (tr.docChanged) later(save, 300)
      if (tr.selectionSet || tr.docChanged) later(select, 250)
    },
    handleDOMEvents: {
      // A link in the document is text to change: a click puts the caret in it, as anywhere else; with ⌘ or Ctrl, it opens.
      click(_view, event) {
        const link = /** @type {HTMLElement} */ (event.target).closest?.('a[href]')
        if (!link) return false
        event.preventDefault()
        const href = safeHref(link.getAttribute('href') ?? '')
        if ((MAC ? event.metaKey : event.ctrlKey) && href && /^(https?|mailto):/i.test(href)) open(href, '_blank', 'noopener,noreferrer')
        return true
      },
      // A task's box, ticked or not, is its item's: the browser's own click, never ProseMirror's.
      mousedown: (_view, event) => Boolean(/** @type {Element} */ (event.target).closest?.('.task-box')),
      change(view, event) {
        const box = /** @type {HTMLInputElement} */ (event.target)
        const at = box.matches('.task-box input') ? view.posAtDOM(/** @type {Node} */ (box.closest('li')?.lastElementChild), 0) - 1 : -1
        if (view.state.doc.nodeAt(at)?.type !== N.list_item) return false
        view.dispatch(view.state.tr.setNodeMarkup(at, null, { ...view.state.doc.nodeAt(at)?.attrs, checked: box.checked }))
        return true
      },
      // The browser's own Format menu: Bold, Italic and Strikethrough, as iOS offers them on a selection.
      beforeinput(view, event) {
        const command = /** @type {Record<string, Command>} */ ({ formatBold: toggleMark(M.strong), formatItalic: toggleMark(M.em), formatStrikeThrough: toggleMark(M.del) })[event.inputType]
        if (!command) return false
        event.preventDefault()
        return command(view.state, view.dispatch)
      },
      // A paste's HTML, read in the sealed frame, never here: on the DOM's own event, as ProseMirror reads the HTML
      // before it asks handlePaste. Text alone is ProseMirror's own way, which builds its elements one by one.
      paste(view, event) {
        const html = event.clipboardData?.getData('text/html')
        if (!html || view.composing) return false
        event.preventDefault()
        insertHTML(view, html, null)
        return true
      },
      // A drop of HTML from elsewhere, the same; a block moved inside the document is ProseMirror's, and files are Jean's, for the box.
      drop(view, event) {
        const html = event.dataTransfer?.getData('text/html')
        if (view.dragging || !html) return false
        event.preventDefault()
        insertHTML(view, html, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null)
        return true
      },
      // The keyboard gone elsewhere says what was typed last.
      blur: () => (flush(), false),
    },
  })

  /** @type {Record<string, ReturnType<typeof setTimeout>>} */
  const timers = {}
  /** @param {() => void} work @param {number} ms */
  function later(work, ms) {
    clearTimeout(timers[work.name])
    timers[work.name] = setTimeout(work, ms)
  }

  const markdown = () => serialize(view.state.doc, sources)
  let saved = text
  function save() {
    const now = markdown()
    if (now === saved) return
    saved = now
    write(now).catch(() => { saved = '' })
  }
  function flush() {
    clearTimeout(timers.save)
    save()
  }
  // The page going away says what was typed last.
  addEventListener('pagehide', flush)

  let selected = false
  function select() {
    const { from, to, empty } = view.state.selection
    if (empty && !selected) return
    selected = !empty
    tell(empty ? '' : `Selected in ${name}:\n\n${sliceMarkdown(view.state.doc, from, to)}`)
  }

  /** The bar that goes through the changes, which keeps or undoes them from the keyboard. @param {import('./suggest.js').Hunk[]} hunks */
  function showReview(hunks) {
    const had = !review.hidden
    review.hidden = hunks.length === 0
    if (!hunks.length) { current = null; return }
    if (current === null || !hunks.some((hunk) => hunk.id === current)) current = hunks[0].id
    const at = hunks.findIndex((hunk) => hunk.id === current)
    reviewText.textContent = t('suggests', { n: hunks.length })
    position.textContent = t('change', { i: at + 1, n: hunks.length })
    reviewButtons.previous.disabled = reviewButtons.next.disabled = hunks.length < 2
    if (!had) announce(reviewText.textContent)
  }

  /** @param {number} step */
  function go(step) {
    const hunks = pending(view.state)
    if (!hunks.length) return
    const at = (hunks.findIndex((hunk) => hunk.id === current) + step + hunks.length) % hunks.length
    current = hunks[at].id
    const { from, to } = hunks[at]
    view.dispatch(view.state.tr.setSelection(TextSelection.between(view.state.doc.resolve(from), view.state.doc.resolve(to))).scrollIntoView())
    showReview(hunks)
  }

  // ⌘Z and ⌘⇧Z from the review bar (after Keep, say) undo and redo in the document.
  review.addEventListener('keydown', (event) => {
    if (!(MAC ? event.metaKey : event.ctrlKey) || event.key.toLowerCase() !== 'z' || event.isComposing) return
    ;(event.shiftKey ? redo : undo)(view.state, view.dispatch)
    event.preventDefault()
  })

  // Its words in Jean's language, again when it changes, the document drawn again with them.
  const stop = effect(() => {
    const was = words.done
    words.done = t('done')
    review.setAttribute('aria-label', t('review'))
    for (const [key, button] of Object.entries(reviewButtons)) button.textContent = t(key)
    view.setProps({ attributes, ...(was !== words.done && { nodeViews: views() }) })
    showReview(pending(view.state))
  })

  return {
    view,
    markdown,
    flush,
    /** Jean's new version, shown as changes to keep or undo. @param {string} proposed */
    suggest(proposed) {
      const next = parse(proposed)
      sources.merge(next.sources)
      tally = { kept: 0, undone: 0 }
      const changes = suggest(view, next.doc)
      return changes ? `Shown as ${changes} changes for the person to keep or undo.` : 'Nothing differs.'
    },
    destroy() {
      flush()
      stop()
      removeEventListener('pagehide', flush)
      view.destroy()
    },
  }
}
