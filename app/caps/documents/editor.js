// A document's editor (D485), in Jean's own document, under its own policy: a Markdown file edited as a
// document, which caps/documents/documents.js opens in a pane with create(). There is no toolbar:
// Markdown typed at a line's start, "/" for a menu of what the line can become, a bubble over the text
// selected, the usual keys, and the browser's own Format menu (iOS's B I U) shape the text; whole blocks
// are selected from the margin or their grip, then removed, moved or turned into another kind. What an
// answer draws of a block (steps, a comparison, a chart, a formula…) it draws too, by Jean's own code
// (./drawn.js). Each change is saved a moment later; Jean hears what is selected, and what the person did
// with its suggestions. What ProseMirror would read with innerHTML, the HTML a paste or a drop brings, is
// read instead in a small sealed frame of preview.html's kind, which hands back only a tree of what a
// document keeps (./clipboard.js), built again in an inert document where nothing loads. A picture pasted
// is kept as a file of the project, and a creation dragged from Creations is held as a block.
import {
  EditorState, Plugin, PluginKey, Selection, TextSelection, NodeSelection, Fragment, Slice, DOMParser as SchemaParser, DOMSerializer, EditorView, Decoration, DecorationSet, history, undo, redo, keymap,
  baseKeymap, toggleMark, setBlockType, wrapIn, chainCommands, exitCode, InputRule, inputRules, wrappingInputRule, textblockTypeInputRule, undoInputRule,
  splitListItem, liftListItem, sinkListItem, wrapInList, tableEditing, goToNextCell, addRowAfter, isInTable, TableView, dropCursor, gapCursor,
} from '#prosemirror'
import { effect } from '@preact/signals-core'
import { render, nothing } from 'lit-html'
import { t as translate } from '../../core/i18n.js'
import { assistantName, openFile } from '../../ui/state.js'
import { reviewBar } from '../../ui/review.js'
import { PAGE_SANDBOX, pagePolicy } from '../../ui/csp.js'
import { encode } from '../../ui/seal.js'
import { unlock, loaded } from '../../ui/caps.js'
import { declared, PAGES } from '../../ui/markdown.js'
import { schema, parse, titled, serialize, sliceMarkdown, safeHref, words, brought } from './markdown.js'
import { el } from './ui.js'
import { fromTree } from './clipboard.js'
import { suggestions, suggest, accept, reject, pending, proposal } from './suggest.js'
import { slashMenu, slashKey } from './slash.js'
import { bookmarks, askKey } from './bookmark.js'
import { bubble } from './bubble.js'
import { blocks } from './blocks.js'
import { drawnViews, inPlace, forms } from './drawn.js'
import '../../ui/shown.js'

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
      const page = /* html */ `<script type="importmap">${JSON.stringify({ imports: { 'documents/clipboard.js': module } })}</script><script type="module">import { cleanTree } from 'documents/clipboard.js'
addEventListener('message', ({ source, data, ports }) => { if (source === parent && typeof data?.html === 'string') ports[0]?.postMessage(cleanTree(data.html)) }); parent.postMessage({ reader: true }, '*')</script>`
      frame.contentWindow?.postMessage({ page, policy: POLICY }, '*')
    }, { once: true })
    frame.src = new URL('../../preview.html', import.meta.url).href
    document.body.append(frame)
  })
  return reader
}

/**
 * HTML a paste or a drop brought, read in the frame, built in an inert document, put in; a paste's pictures with no words, kept, in place
 * of the addresses that came with them (D35). @param {EditorView} view @param {string} html @param {number | null} at @param {File[]} pictures @param {Keep} [keep] a paste's
 */
async function insertHTML(view, html, at, pictures, keep) {
  const { port1, port2 } = new MessageChannel()
  ;(await sealed()).postMessage({ html }, '*', [port2])
  const tree = await new Promise((resolve) => { port1.onmessage = ({ data }) => resolve(Array.isArray(data) ? data : []) })
  let read = SchemaParser.fromSchema(schema).parseSlice(fromTree(tree, document.implementation.createHTMLDocument('')), { context: at === null ? view.state.selection.$from : view.state.doc.resolve(at) })
  // Pasted in the title, which holds text alone, they go on a line of their own after it.
  let to = at
  if (pictures.length && !read.content.textBetween(0, read.content.size).trim()) {
    const alts = /** @type {string[]} */ ([]), kept = await Promise.all(pictures.map((file) => keep?.(file) ?? null)), title = at === null && view.state.selection.$from.parent.type === N.title
    read.content.descendants((node) => void (node.type === N.image && alts.push(node.attrs.alt)))
    read = new Slice(Fragment.from(N.paragraph.create(null, kept.flatMap((src, i) => (src ? [N.image.create({ src, alt: alts[i] })] : [])))), title ? 0 : 1, title ? 0 : 1)
    if (title) to = view.state.doc.firstChild?.nodeSize ?? 0
  }
  // Pictures pasted with words, at their pages' addresses: drawn from there, which the user brought, then each kept once fetched.
  const remote = new Set()
  if (keep) read.content.descendants((node) => { if (node.type === N.image && /^(https:|data:image\/)/.test(node.attrs.src)) brought.add(node.attrs.src), remote.add(node.attrs.src) })
  const { state } = view, slice = new Slice(plainHeads(read.content), read.openStart, read.openEnd)
  view.dispatch((to === null ? state.tr.replaceSelection(slice) : state.tr.replaceRange(to, to, slice)).scrollIntoView().setMeta('paste', true).setMeta('uiEvent', at === null ? 'paste' : 'drop'))
  for (const src of remote) {
    fetched(src).then((file) => file && keep?.(file)).then((kept) => {
      const tr = view.state.tr
      if (kept && !view.isDestroyed) view.state.doc.descendants((node, pos) => void (node.type === N.image && node.attrs.src === src && tr.setNodeMarkup(pos, null, { ...node.attrs, src: kept })))
      if (tr.docChanged) view.dispatch(tr.setMeta('addToHistory', false))
    }).catch(() => {})
  }
}

/** A picture's bytes, a data: one's from itself, another's from its address, with no cookies and no page's address; none when it isn't one. @param {string} src */
async function fetched(src) {
  const data = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(src)
  const blob = data ? new Blob([Uint8Array.from(atob(data[2]), (c) => c.charCodeAt(0))], { type: data[1] }) : await (await fetch(src, { credentials: 'omit', referrerPolicy: 'no-referrer' })).blob()
  return blob.type.startsWith('image/') ? new File([blob], `picture.${blob.type.slice(6).replace(/[^a-z].*/, '')}`, { type: blob.type }) : null
}

/**
 * A paste's or a drop's HTML, and a paste's pictures, taken from ProseMirror and read in the frame; nothing for text alone, which ProseMirror reads itself.
 * @param {EditorView} view @param {Event} event @param {DataTransfer | null | undefined} data @param {number | null} at @param {Keep} [keep] @returns {boolean}
 */
function taken(view, event, data, at, keep) {
  const html = data?.getData('text/html'), pictures = keep ? [...(data?.files ?? [])].filter((file) => file.type.startsWith('image/')) : []
  if ((!html && !pictures.length) || view.composing) return false
  event.preventDefault()
  insertHTML(view, html ?? '', at, pictures, keep)
  return true
}
/** @typedef {(file: File) => Promise<string | null>} Keep a picture kept, its place from the document's folder */

/** A copy's pictures as <img>, in ProseMirror's inert document, so that they paste as pictures. */
const COPY = new DOMSerializer({ ...DOMSerializer.nodesFromSchema(schema), image: ({ attrs }) => ['img', attrs] }, DOMSerializer.marksFromSchema(schema))

// A creation dragged from Creations (D575), as the Markdown a document holds of it: a reference where it is let go, in a line that
// takes one; a collection, `BLOCK`, between blocks, where the drop line shows, which takes it as columns (top-level blocks, D501), the caret
// on the line after it; any other drop forgets it.
const BLOCK = 'text/x-creation-block', HOLD = /** @type {any} */ ({ slice: new Slice(Fragment.from(N.columns.create(null, N.column.create(null, N.paragraph.create()))), 0, 0) })
/** @param {EditorView} view @param {DragEvent} event */
function dropped(view, event) {
  const block = event.dataTransfer?.getData(BLOCK), markdown = block || event.dataTransfer?.getData('text/x-creation')
  const $at = view.state.doc.resolve(view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? 0)
  if (view.dragging === HOLD) view.dragging = null
  if (!markdown) return false
  event.preventDefault()
  const ref = !block && parse(markdown).doc.firstChild?.firstChild
  if (ref && $at.parent.canReplaceWith($at.index(), $at.index(), ref.type)) return view.focus(), view.dispatch(view.state.tr.insert($at.pos, ref).scrollIntoView()), true
  // Never before the title.
  const at = Math.max(!$at.depth ? $at.pos : $at.pos <= ($at.start(1) + $at.end(1)) / 2 ? $at.before(1) : $at.after(1), view.state.doc.firstChild?.nodeSize ?? 0)
  const { content } = parse(markdown).doc, tr = view.state.tr.insert(at, content), end = at + content.size, next = tr.doc.nodeAt(end)
  if (!next?.isTextblock || next.type.spec.code) tr.insert(end, N.paragraph.create())
  view.focus()
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView())
  return true
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

/** A mark's key, the document's even where the mark can't go (the title, code): never Jean's or the browser's. @param {import('prosemirror-model').MarkType} type @returns {Command} */
const format = (type) => (state, dispatch) => (toggleMark(type)(state, dispatch), true)
/** None in the title, which holds text alone, nor the browser's own. @type {Command} */
const lineBreak = (state, dispatch) => (state.selection.$from.parent.type !== N.title && dispatch?.(state.tr.replaceSelectionWith(N.hard_break.create()).scrollIntoView()), true)

/**
 * In a column, Backspace at a line's start, or Delete at its end, that nothing else took does nothing, where the browser
 * would join two columns (D501). @param {-1 | 1} dir @returns {Command}
 */
const edge = (dir) => ({ selection: { $from, empty } }) => empty && $from.depth > 2 && $from.node(1).type === N.columns && (dir < 0 ? !$from.parentOffset : $from.parentOffset === $from.parent.content.size)

/** @type {Record<string, Command>} */
const KEYS = {
  'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
  'Mod-b': format(M.strong), 'Mod-i': format(M.em), 'Mod-e': format(M.code), 'Mod-Shift-x': format(M.del),
  'Mod-Alt-1': setBlockType(N.heading, { level: 1 }), 'Mod-Alt-2': setBlockType(N.heading, { level: 2 }), 'Mod-Alt-3': setBlockType(N.heading, { level: 3 }), 'Mod-Alt-0': setBlockType(N.paragraph),
  // In a task, Enter makes the next line a task too.
  Enter: (state, dispatch) => followSelected(state) || (Boolean(itemDepth(state.selection)) && splitListItem(N.list_item, state.selection.$from.node(itemDepth(state.selection)).attrs.checked === null ? undefined : { checked: false })(state, dispatch)),
  'Shift-Enter': chainCommands(exitCode, lineBreak), 'Mod-Enter': chainCommands(exitCode, lineBreak),
  Tab: tab(1), 'Shift-Tab': tab(-1), Backspace: undoInputRule,
}

// What "/" offers (slash.js): what the line can become, by its name and a few words to find it by.
/** A list of tasks to tick. @type {Command} */
const taskList = (state, dispatch) => wrapInList(N.bullet_list)(state, dispatch && ((tr) => dispatch(tr.setNodeMarkup(tr.selection.$from.before(itemDepth(tr.selection)), null, { checked: false }))))
/**
 * Blocks put where the line is, when it is empty, or after it; the caret goes into the first of
 * them that holds text, from the `into`th on. @param {() => PMNode[]} make @param {number} [into] @returns {Command}
 */
const insertBlocks = (make, into = 0) => (state, dispatch) => {
  const { $from } = state.selection
  if ($from.depth !== 1) return false
  if (dispatch) {
    const [empty, blocks] = [$from.parent.content.size === 0, make()]
    const at = empty ? $from.before() : $from.after()
    const tr = state.tr.replaceWith(at, empty ? $from.after() : at, blocks)
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(blocks.slice(0, into).reduce((pos, block) => pos + block.nodeSize, at) + 1))).scrollIntoView())
  }
  return true
}
/** A block an answer draws, of this kind, from this start. @param {string} kind @param {string} text */
const widget = (kind, text) => ({ kind, run: insertBlocks(() => [N.code_block.create({ lang: kind }, text ? schema.text(text) : null), N.paragraph.create()], text ? 1 : 0) })
/** A callout: a quote that starts with 💡, drawn as a note, the caret after it. @type {Command} */
const callout = (state, dispatch) => insertBlocks(() => [N.blockquote.create(null, N.paragraph.create(null, schema.text('💡 '))), N.paragraph.create()])(state, dispatch && ((tr) => dispatch(tr.setSelection(TextSelection.create(tr.doc, tr.selection.from + 3)))))
/** A web bookmark: a line that asks for an address (./bookmark.js). @type {Command} */
const bookmark = (state, dispatch) => insertBlocks(() => [N.paragraph.create()])(state, dispatch && ((tr) => dispatch(tr.setMeta(askKey, tr.selection.$from.before()))))
/** Columns side by side (D501), `n` of them, the caret in the first. @param {number} n */
const columns = (n) => insertBlocks(() => [N.columns.create(null, Array.from({ length: n }, () => N.column.create(null, N.paragraph.create()))), N.paragraph.create()])
/** A collection's place in a table block, which drawn.js draws as its view. @param {string} folder */
const holding = (folder) => insertBlocks(() => [N.code_block.create({ lang: 'table' }, schema.text(folder)), N.paragraph.create()], 1)
/** A picture of the project's, drawn where the line is. @param {string} uri @param {string} alt */
const picture = (uri, alt) => insertBlocks(() => [N.paragraph.create(null, N.image.create({ src: `../${uri}`, alt })), N.paragraph.create()], 1)
// References (D575): a creation of the project, which a click on it, or Enter, follows.
/** One where the caret is. @param {string} uri @param {string} label @returns {Command} */
const reference = (uri, label) => (state, dispatch) => {
  const { $from } = state.selection
  if (!$from.parent.canReplaceWith($from.index(), $from.index(), N.ref)) return false
  dispatch?.(state.tr.replaceSelectionWith(N.ref.create({ uri, label }), false).scrollIntoView())
  return true
}
/** The creation one names, by its place or else its name, opened as Creations opens it. @param {string} uri */
async function follow(uri) {
  const all = await (await import('../../ui/creations.js')).creationsHere(), name = uri.toLocaleLowerCase()
  const item = all.find((one) => one.link.uri === uri || one.path === uri) ?? all.find((one) => one.name.toLocaleLowerCase() === name)
  if (item) item.kind.open ? item.kind.open(item) : openFile(item.link)
}
/** Enter on one selected follows it. @type {Command} */
const followSelected = ({ selection }) => selection instanceof NodeSelection && selection.node.type === N.ref && (follow(selection.node.attrs.uri), true)
/** What "[[" offers of each kind, by a glyph. */
const KINDS = /** @type {Record<string, string>} */ ({ documents: '¶', tables: '⊞', pictures: '▨', films: '▶', music: '♪', slides: '▭', apps: '⧉' })
const refKey = /** @type {PluginKey<any>} */ (new PluginKey('refs'))

/** A new collection, held where the line is. @type {Command} */
const tableView = (state, _dispatch, view) => {
  if (state.selection.$from.depth !== 1) return false
  if (view) import('../tables/tables.js').then(({ blank }) => blank()).then((folder) => holding(folder)(view.state, view.dispatch))
  return true
}
const ITEMS = [
  // Text on any line, which "/" offers first.
  { key: 'text', glyph: '¶', words: 'text paragraph plain', run: /** @type {Command} */ ((state, dispatch) => (state.selection.empty && state.selection.$from.parent.type === N.paragraph) || setBlockType(N.paragraph)(state, dispatch)) },
  { key: 'heading1', glyph: 'H1', words: 'heading title h1 #', run: setBlockType(N.heading, { level: 1 }) },
  { key: 'heading2', glyph: 'H2', words: 'heading subtitle h2 ##', run: setBlockType(N.heading, { level: 2 }) },
  { key: 'heading3', glyph: 'H3', words: 'heading h3 ###', run: setBlockType(N.heading, { level: 3 }) },
  { key: 'bullets', glyph: '•', words: 'bulleted list bullets unordered ul -', run: wrapInList(N.bullet_list) },
  { key: 'numbers', glyph: '1.', words: 'numbered list ordered ol 1.', run: wrapInList(N.ordered_list) },
  { key: 'tasks', glyph: '☐', words: 'to-do todo task checklist checkbox [ ]', run: taskList },
  { key: 'quote', glyph: '❝', words: 'quote blockquote citation >', run: wrapIn(N.blockquote) },
  { key: 'callout', glyph: '💡', words: 'callout note tip info aside box', run: callout },
  { key: 'codeBlock', glyph: '‹›', words: 'code snippet ```', run: setBlockType(N.code_block) },
  { key: 'table', glyph: '▦', words: 'table grid columns', run: insertBlocks(() => [N.table.create(null, [N.table_row.create(null, [N.table_header.create(), N.table_header.create()]), N.table_row.create(null, [N.table_cell.create(), N.table_cell.create()])]), N.paragraph.create()]) },
  { key: 'tableView', glyph: '⊞', words: 'table view database data board spreadsheet', kind: 'table', run: tableView },
  { key: 'divider', glyph: '—', words: 'divider separator line rule hr ---', run: insertBlocks(() => [N.horizontal_rule.create(), N.paragraph.create()]) },
  { key: 'columns2', glyph: 'Ⅱ', words: 'columns two 2 side by side layout', run: columns(2) },
  { key: 'columns3', glyph: 'Ⅲ', words: 'columns three 3 side by side layout', run: columns(3) },
  { key: 'columns4', glyph: 'Ⅳ', words: 'columns four 4 side by side layout', run: columns(4) },
  { key: 'bookmark', glyph: '↗', words: 'web bookmark link url address site embed', run: bookmark },
  // What an answer draws, each with a start drawn at once, the caret on the line after it (a page's in its text): a formula, a page, a
  // diagram and a map always, a chart, a score and slides while a skill of the room writes them (widgets()).
  { key: 'formula', glyph: '∑', words: 'formula equation math latex', ...widget('math', 'a^2 + b^2 = c^2') },
  { key: 'chart', glyph: '▥', words: 'chart graph plot bar line pie echarts', ...widget('echarts', '{"xAxis":{"type":"category","data":["A","B","C"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[3,5,2]}]}') },
  { key: 'score', glyph: '♪', words: 'music score tune notes sheet abc', ...widget('abc', 'X:1\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |') },
  { key: 'slides', glyph: '▭', words: 'slides deck presentation slidev', ...widget('deck', '# 1\n\n---\n\n## 2') },
  { key: 'page', glyph: '</>', words: 'page html app web interactive', ...widget('html', '') },
  { key: 'diagram', glyph: '◇', words: 'diagram flowchart graph mermaid', ...widget('mermaid', 'graph LR\n  A --> B') },
  { key: 'map', glyph: '⌖', words: 'map places geojson', ...widget('geojson', '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[2.35,48.86]},"properties":{}}]}') },
]
/** What "/" offers now, as the room's skills change: the blocks an answer draws only as it can (`kind`), and a table view once Tables is found. */
const widgets = () => ITEMS.filter(({ kind }) => !kind || kind === 'math' || PAGES.includes(kind) || declared.value.has(kind) || (kind === 'table' && loaded.value.has('tables')))
/** What a block can be turned into from its grip's menu, which puts the rest below it (blocks.js). */
const TURNS = ITEMS.filter((item) => !('kind' in item) && !/^(table|divider|callout|bookmark|columns\d)$/.test(item.key))

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
      // The empty line the caret is on, at the top or in a column and not asking for an address, says what "/" adds there.
      const { $from, empty } = state.selection
      const hint = empty && $from.parent.type === N.paragraph && !$from.parent.content.size && ($from.depth === 1 || $from.node(-1).type === N.column) && askKey.getState(state) !== $from.before() ? $from.before() : -1
      /** @type {Decoration[]} */
      const list = []
      state.doc.descendants((node, pos) => {
        const letter = /\p{L}/u.exec(node.textContent.replace(/^\[!\w+\]/, ''))?.[0]
        if (/^(bullet_list|ordered_list|blockquote|table)$/.test(node.type.name)) list.push(Decoration.node(pos, pos + node.nodeSize, { dir: letter ? (RTL.test(letter) ? 'rtl' : 'ltr') : dir }))
        if (!node.isTextblock) return true
        // The title, empty, says what it is for.
        if (!node.type.spec.code) list.push(Decoration.node(pos, pos + node.nodeSize, { dir: /\p{L}/u.test(node.textContent) ? 'auto' : dir, ...(node.type === N.title ? { 'data-placeholder': t('untitled') } : pos === hint && { 'data-placeholder': t('hint') }) }))
        return false
      })
      return DecorationSet.create(state.doc, list)
    },
  },
})

// The first line of a document is its title, a node of its own (markdown.js): first, text alone, nothing before it, never
// another kind; empty, it isn't written, so an empty document stays empty in its file until something is written. Blocks let go on it
// go after it.
/** @type {(view: EditorView, event: DragEvent, slice: Slice, moved: boolean) => boolean} */
function belowTitle(view, event, slice, moved) {
  const $at = view.state.doc.resolve(view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? 0), tr = view.state.tr
  if ($at.parent.type !== N.title || slice.openStart || !slice.content.firstChild?.isBlock) return false
  if (moved) tr.deleteSelection()
  view.dispatch(tr.insert(tr.mapping.map(view.state.doc.firstChild?.nodeSize ?? 0), slice.content).scrollIntoView())
  return true
}

// ── An editor ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * A document's editor in `box`: its name, its place and its text, `write` for each change, `keep` for a picture pasted, `tell` for what Jean's brain hears
 * with the next message, and Jean's changes left to decide, `held` as it opens, given to `hold` as they change.
 * The addresses of the pictures the user pasted, which it draws from the web, come as `pictures` and go back with each write.
 * @param {HTMLElement} box @param {{ name: string, path?: string, markdown: string, pictures?: string, write: (markdown: string, pictures: string) => Promise<void>, keep: Keep, tell: (context: string) => void,
 *   held?: { markdown: string, notes?: string[] } | null, hold?: (left: { markdown: string, notes: string[] } | null) => void }} file
 */
export function create(box, { name, path, markdown: text, pictures, write, keep, tell, held, hold }) {
  brought.clear()
  for (const src of pictures?.split(' ') ?? []) if (src) brought.add(src)
  unlock('layouts')
  const review = el('div', { class: 'review-slot' })
  const live = el('p', { class: 'visually-hidden', 'aria-live': 'polite' })
  const mount = el('div', { class: 'doc-wrap' })
  box.append(review, mount, live)
  /** @param {string} said */
  const announce = (said) => { live.textContent = ''; setTimeout(() => { live.textContent = said }, 50) }

  const read = titled(parse(text))
  const { sources } = read
  let tally = { accepted: 0, rejected: 0 }
  /** The change the bar's arrows went to last. @type {number | null} */
  let current = null

  /** @param {'accept' | 'reject'} kind @param {number[]} ids */
  function act(kind, ids) {
    const from = pending(view.state).find((change) => ids.includes(change.id))?.from ?? 0
    const onIt = ids.includes(Number(document.activeElement?.closest('.suggest')?.getAttribute('data-change')))
    ;(kind === 'accept' ? accept : reject)(view, ids)
    // Accepted, a block an answer draws shows as it now is: the caret before it rather than in its text.
    const at = view.state.selection.$head.depth ? view.state.selection.$head.before(1) : -1
    if (at >= 0 && /** @type {HTMLElement | null} */ (view.nodeDOM(at))?.matches('.drawn.is-drawn')) view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(at), -1)))
    tally[kind === 'accept' ? 'accepted' : 'rejected'] += ids.length
    announce(t(kind === 'accept' ? 'accepted' : 'rejected'))
    const left = pending(view.state)
    // The keyboard goes on to the next change from the one decided.
    if (left.length && onIt) reach(left.find((change) => change.from >= from) ?? left[0])
    else if (!left.length || !box.contains(document.activeElement)) view.focus()
    if (!left.length) tell(`Of the changes suggested to ${name}, the user accepted ${tally.accepted} and rejected ${tally.rejected}.`)
  }

  // The project's collections, which "/" offers by name, read again a moment apart, the menu drawn again with them.
  let known = /** @type {{ path: string, name: string }[]} */ ([])
  let asked = 0
  const collections = () => {
    if (!loaded.peek().has('tables')) return []
    if (Date.now() - asked > 2000) {
      asked = Date.now()
      import('../tables/tables.js').then(({ kept }) => kept()).then((all) => {
        known = all
        if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(slashKey, {}))
      })
    }
    return known.map(({ path, name }) => ({ key: path, name, typed: true, glyph: '⊞', words: `collection ${t('collection')}`, run: holding(path) }))
  }
  // All the project's creations, which "[[" offers (D575), read again a moment apart: a collection or a picture drawn where the line is, as "/" puts one, any other referred to.
  let made = /** @type {any[]} */ ([])
  let looked = 0
  const creations = () => {
    if (Date.now() - looked > 2000) {
      looked = Date.now()
      import('../../ui/creations.js').then(({ creationsHere }) => creationsHere()).then((all) => { made = all; if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(refKey, {})) })
    }
    return made.flatMap((item) => (item.path === path ? [] : [{ key: item.path, name: item.name, glyph: KINDS[item.kind.id] ?? '↗', words: item.kind.id, run: item.kind.id === 'tables' ? holding(item.path) : item.kind.id === 'pictures' ? picture(item.link.uri, item.name) : reference(item.link.uri, item.name) }]))
  }

  const plugins = [
    // First, so that its Enter, Tab and arrows come before the keymaps' while it is open.
    slashMenu({ items: () => [...widgets(), ...collections()], label: t, announce }),
    slashMenu({ items: creations, label: t, announce, key: refKey, trigger: /[[［]{2}([^\]］\n]{0,32})$/, id: 'refs', name: () => translate('creations.title') }),
    bookmarks({ href: linkHref, label: t, announce }),
    bubble({ formats: FORMATS, link: M.link, href: linkHref, label: t, mac: MAC, tabbable: (state) => !itemDepth(state.selection) && !isInTable(state) }),
    blocks({ label: t, announce, mac: MAC, kinds: TURNS, adds: () => widgets().filter((item) => !TURNS.includes(item)) }),
    inPlace,
    RULES,
    keymap({ ...KEYS, 'Mod-s': () => (flush(), true) }),
    keymap(baseKeymap),
    keymap({ Backspace: edge(-1), Delete: edge(1) }),
    history(),
    // In the look's colour (editor.css), not black, which a dark page hides.
    dropCursor({ color: false, width: 2 }),
    gapCursor(),
    tableEditing(),
    suggestions({ strings: () => ({ accept: t('accept'), reject: t('reject'), before: t('before'), added: t('added'), gone: t('gone'), changed: t('suggests', { n: 1 }) }),
      act, changed: (changes) => { showReview(changes); later(keepLeft, 300) }, form: forms }),
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
    clipboardSerializer: COPY,
    handleDrop: belowTitle,
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr))
      if (tr.docChanged) later(save, 300)
      if (tr.selectionSet || tr.docChanged) later(select, 250)
    },
    handleDOMEvents: {
      // A link in the document is text to change: a click puts the caret in it, as anywhere else; with ⌘ or Ctrl, it opens. A reference opens, and
      // a tag opens Creations' page finding it, as Obsidian's search does (D576).
      click(_view, event) {
        const ref = /** @type {HTMLElement} */ (event.target).closest?.('.ref')
        if (ref) return event.preventDefault(), follow(ref.getAttribute('data-uri') ?? ''), true
        const tag = /** @type {HTMLElement} */ (event.target).closest?.('.tag')
        if (tag) return event.preventDefault(), import('../../ui/creations.js').then(({ seek }) => seek(tag.getAttribute('data-tag') ?? '')), true
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
        // Any other field's change (a table's a document holds) is its own.
        if (at < 0 || view.state.doc.nodeAt(at)?.type !== N.list_item) return false
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
      paste: (view, event) => taken(view, event, event.clipboardData, null, keep),
      // A drop of HTML from elsewhere, the same, and a creation's, `dropped`; a block moved inside the document is ProseMirror's, and files are Jean's, for the box.
      dragover: (view, event) => { view.dragging = event.dataTransfer?.types.includes(BLOCK) ? HOLD : view.dragging === HOLD ? null : view.dragging },
      drop: (view, event) => dropped(view, event) || (!view.dragging && taken(view, event, event.dataTransfer, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null)),
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
    write(now, [...brought].filter((src) => now.includes(src)).join(' ')).catch(() => { saved = '' })
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

  /** What is left to decide, kept beside the document. */
  function keepLeft() {
    const left = pending(view.state)
    hold?.(left.length ? { markdown: serialize(proposal(view.state), sources), notes: left.map((change) => change.why) } : null)
  }

  /** The bar over the changes (ui/review.js). @param {import('./suggest.js').Change[]} changes */
  function showReview(changes) {
    if (!changes.some((change) => change.id === current)) current = null
    const at = changes.findIndex((change) => change.id === current)
    const all = changes.map((change) => change.id)
    if (changes.length && !review.firstElementChild) announce(t('suggests', { n: changes.length }))
    render(changes.length ? reviewBar({
      label: t('review'), count: t('suggests', { n: changes.length }), at: at >= 0 ? t('change', { i: at + 1, n: changes.length }) : '', go: changes.length > 1 ? go : null,
      previous: t('previous'), next: t('next'), accept: () => act('accept', all), reject: () => act('reject', all), acceptAll: t('acceptAll'), rejectAll: t('rejectAll'),
    }) : nothing, review)
  }

  /** A change in view, the keyboard on its Accept. @param {import('./suggest.js').Change} change */
  function reach(change) {
    current = change.id
    showReview(pending(view.state))
    const button = /** @type {HTMLElement | null} */ (view.dom.querySelector(`[data-change="${change.id}"] .suggest-accept`))
    button?.focus()
    button?.closest('.suggest')?.scrollIntoView({ block: 'nearest' })
  }

  /** @param {1 | -1} step */
  function go(step) {
    const changes = pending(view.state)
    const at = changes.findIndex((change) => change.id === current)
    if (changes.length) reach(changes[at < 0 ? (step > 0 ? 0 : changes.length - 1) : (at + step + changes.length) % changes.length])
  }

  // A key with ⌘ (Ctrl) the document acted on is its alone: ⌘B makes bold and leaves the drawer be, ⌘S saves it and no copy of the task.
  view.dom.addEventListener('keydown', (event) => { if (event.defaultPrevented && (MAC ? event.metaKey : event.ctrlKey)) event.stopPropagation() })

  // ⌘Z and ⌘⇧Z from the bar or a change's row undo and redo in the document.
  box.addEventListener('keydown', (event) => {
    if (!(MAC ? event.metaKey : event.ctrlKey) || event.key.toLowerCase() !== 'z' || event.isComposing || !/** @type {Element} */ (event.target).closest('.review-slot, .suggest-row')) return
    ;(event.shiftKey ? redo : undo)(view.state, view.dispatch)
    event.preventDefault()
  })

  // What "[[" offers, read as it opens, so that it has them at once, and again when it first opens (D575).
  creations()
  looked = 0

  // Jean's changes left to decide.
  if (held?.markdown) {
    const next = titled(parse(held.markdown), view.state.doc.firstChild ?? undefined)
    sources.merge(next.sources)
    suggest(view, next.doc, held.notes)
  }

  // Its words in Jean's language, again when it changes, the document drawn again with them.
  const stop = effect(() => {
    const was = words.done
    words.done = t('done')
    view.setProps({ attributes, ...(was !== words.done && { nodeViews: views() }) })
    showReview(pending(view.state))
  })

  return {
    view,
    markdown,
    flush,
    /** Jean's version, as changes, with Jean's words. @param {string} proposed @param {string[]} [notes] */
    suggest(proposed, notes) {
      const next = titled(parse(proposed), view.state.doc.firstChild ?? undefined)
      sources.merge(next.sources)
      tally = { accepted: 0, rejected: 0 }
      const changes = suggest(view, next.doc, notes)
      return changes ? `Shown as ${changes} changes for the person to accept or reject.` : 'Nothing differs.'
    },
    /** Its title renamed. @param {string} name */
    retitle(name) {
      view.dispatch(view.state.tr.insertText(name, 1, (view.state.doc.firstChild?.nodeSize ?? 2) - 1))
    },
    destroy() {
      flush()
      clearTimeout(timers.keepLeft)
      keepLeft()
      stop()
      removeEventListener('pagehide', flush)
      view.destroy()
    },
  }
}
