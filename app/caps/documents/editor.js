// A document's editor (D485), in its opaque frame (preview.html's relay writes it there, as it writes a
// page; caps/documents/documents.js makes the page): a Markdown file edited as a document, which speaks to
// Jean as an MCP App does (JSON-RPC 2.0 over postMessage). Jean calls the app's tools: `open` loads a file,
// `suggest` shows what Jean's brain proposes as changes to keep or undo, `read` gives the file as it is.
// The app calls Jean's `save` tool after each change, and tells Jean what is selected
// (ui/update-model-context). There is no toolbar: Markdown typed at a line's start, "/" for a menu of what
// the line can become, a bubble over the text selected, the usual keys, and the browser's own Format menu
// (iOS's B I U) shape the text; whole blocks are selected from the margin or their grip, then removed,
// moved or turned into another kind. Its look is Jean's: the theme, colours and type Jean sends (MCP Apps'
// standard variables), light or dark as Jean is, and its words, in Jean's language. What only Jean does
// goes out to it, as messages of Jean's own (`jean/…`): Escape and Jean's shortcuts the editor leaves, and
// files dropped on the document, which Jean shares in the conversation.
import { EditorState, Plugin, TextSelection } from 'prosemirror-state'
import { Fragment, Slice } from 'prosemirror-model'
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view'
import { history, undo, redo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark, setBlockType, wrapIn, chainCommands, exitCode } from 'prosemirror-commands'
import { InputRule, inputRules, wrappingInputRule, textblockTypeInputRule, undoInputRule } from 'prosemirror-inputrules'
import { splitListItem, liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list'
import { tableEditing, goToNextCell, addRowAfter, isInTable, TableView } from 'prosemirror-tables'
import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { schema, parse, serialize, sliceMarkdown, safeHref, Sources, words } from './markdown.js'
import { el } from './ui.js'
import { suggestions, suggest, keep, dismiss, pending } from './suggest.js'
import { slashMenu } from './slash.js'
import { bubble } from './bubble.js'
import { blocks } from './blocks.js'

/** @typedef {import('prosemirror-model').Node} PMNode */
/** @typedef {import('prosemirror-state').Command} Command */

const { nodes: N, marks: M } = schema
const MAC = /Mac|iP(hone|[oa]d)/.test(navigator.platform)

/** The words the frame shows, in Jean's language, a plural by its forms: they come with the host's context. */
let strings = /** @type {Record<string, string | Record<string, string>>} */ ({})
/** @param {string} key @param {Record<string, string | number>} [values] `n` picks a plural's form */
const t = (key, values = {}) => {
  const entry = strings[key] ?? key
  const text = typeof entry === 'string' ? entry : entry[new Intl.PluralRules(document.documentElement.lang || 'en').select(Number(values.n ?? 0))] ?? entry.other
  return String(text).replace(/\{(\w+)\}/g, (_, name) => (typeof values[name] === 'number' ? new Intl.NumberFormat(document.documentElement.lang || 'en').format(Number(values[name])) : String(values[name] ?? '')))
}

// ── Messages ────────────────────────────────────────────────────────────────────────────────
let lastId = 0
/** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>} */
const waiting = new Map()
/** @param {object} message */
const send = (message) => parent.postMessage({ jsonrpc: '2.0', ...message }, '*')
/** @param {string} method @param {object} [params] @returns {Promise<any>} */
const request = (method, params) => new Promise((resolve, reject) => {
  const id = ++lastId
  waiting.set(id, { resolve, reject })
  send({ id, method, params })
})
/** @param {string} method @param {object} [params] */
const notify = (method, params) => send({ method, params })

const TOOLS = [
  { name: 'open', description: 'Opens a Markdown file in the editor.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, markdown: { type: 'string' } }, required: ['markdown'] } },
  { name: 'suggest', description: 'Shows a new version of the open file as changes the person keeps or undoes, each where it is.', inputSchema: { type: 'object', properties: { markdown: { type: 'string' } }, required: ['markdown'] } },
  { name: 'read', description: 'The open file as it is now, in Markdown.', inputSchema: { type: 'object', properties: {} } },
]

/** @param {any} params */
function callTool({ name, arguments: args = {} }) {
  if (name === 'open') {
    open(String(args.name ?? ''), String(args.markdown ?? ''))
    return { content: [{ type: 'text', text: 'Opened.' }] }
  }
  if (name === 'suggest') {
    const proposed = parse(String(args.markdown ?? ''))
    sources.merge(proposed.sources)
    const changes = suggest(view, proposed.doc)
    tally = { kept: 0, undone: 0 }
    return { content: [{ type: 'text', text: changes ? `Shown as ${changes} changes for the person to keep or undo.` : 'Nothing differs.' }], structuredContent: { changes } }
  }
  if (name === 'read') return { content: [{ type: 'text', text: markdown() }], structuredContent: { name: fileName, markdown: markdown() } }
  throw Object.assign(new Error(`No tool ${name}`), { code: -32602 })
}

addEventListener('message', ({ source, data }) => {
  if (source !== parent || data?.jsonrpc !== '2.0') return
  if (data.method === undefined) {
    const call = waiting.get(data.id)
    waiting.delete(data.id)
    if (data.error) call?.reject(new Error(data.error.message))
    else call?.resolve(data.result)
    return
  }
  /** @param {() => any} work */
  const answer = (work) => {
    if (data.id === undefined) return void work()
    try { send({ id: data.id, result: work() }) } catch (error) { send({ id: data.id, error: { code: /** @type {any} */ (error).code ?? -32603, message: String(/** @type {Error} */ (error).message) } }) }
  }
  if (data.method === 'tools/call') answer(() => callTool(data.params))
  else if (data.method === 'tools/list') answer(() => ({ tools: TOOLS }))
  else if (data.method === 'ui/notifications/host-context-changed') context(data.params)
  else if (data.method === 'ui/resource-teardown') answer(() => { flush(); return {} })
  else if (data.method === 'ping') answer(() => ({}))
  else if (data.id !== undefined) send({ id: data.id, error: { code: -32601, message: `No method ${data.method}` } })
})

/** What the host says of itself: its theme and colours, its language and the words to show. @param {any} host */
function context(host) {
  if (host?.locale) {
    document.documentElement.lang = host.locale
    document.documentElement.dir = /^(ar|he|fa|ur|ps|sd|ug|yi|dv|ckb)\b/.test(host.locale) ? 'rtl' : 'ltr'
  }
  // Jean's theme, whatever the system's: the frame's color-scheme picks from its own light-dark() defaults, and
  // the colours Jean sends are the room's, sent again with each change.
  if (host?.theme) {
    document.documentElement.dataset.theme = host.theme
    document.documentElement.style.colorScheme = host.theme
  }
  for (const [name, value] of Object.entries(host?.styles?.variables ?? {})) document.documentElement.style.setProperty(name, String(value))
  if (host?.['jean/strings']) strings = { ...strings, ...host['jean/strings'] }
  if (host?.locale || host?.['jean/strings']) label()
}

// ── The page ───────────────────────────────────────────────────────────────────────────────
const reviewText = el('p', { class: 'review-text' })
const position = el('span', { class: 'review-position' })
const review = el('div', { role: 'region', class: 'review', hidden: '' }, reviewText, position)
const live = el('p', { class: 'visually-hidden', 'aria-live': 'polite' })
const mount = el('div', { class: 'doc-wrap' })
document.body.append(review, mount, live)

/** @param {string} text */
const announce = (text) => { live.textContent = ''; setTimeout(() => { live.textContent = text }, 50) }

/** How deep the list's item a selection is in sits, or 0. @param {import('prosemirror-state').Selection} selection */
const itemDepth = ({ $from }) => { let depth = $from.depth; while (depth > 0 && $from.node(depth).type !== N.list_item) depth--; return depth }

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

/** Labels in the frame's language, again when it changes. */
function label() {
  words.done = t('done')
  review.setAttribute('aria-label', t('review'))
  for (const [key, button] of Object.entries(reviewButtons)) button.textContent = t(key)
  if (view) {
    view.setProps({ attributes })
    view.updateState(view.state)
    showReview(pending(view.state))
  }
}

// ── The editor ─────────────────────────────────────────────────────────────────────────────
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
  Tab: tab(1), 'Shift-Tab': tab(-1), Backspace: undoInputRule, 'Mod-s': () => (flush(), true),
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

let fileName = ''
let sources = new Sources()
let tally = { kept: 0, undone: 0 }
/** @type {number | null} */
let current = null

/** @param {'keep' | 'undo'} kind @param {number[]} ids */
function act(kind, ids) {
  ;(kind === 'keep' ? keep : dismiss)(view, ids)
  tally[kind === 'keep' ? 'kept' : 'undone'] += ids.length
  announce(t(kind === 'keep' ? 'kept' : 'undone'))
  if (!pending(view.state).length) {
    request('ui/update-model-context', { content: [{ type: 'text', text: `Of the changes suggested to ${fileName}, the user kept ${tally.kept} and undid ${tally.undone}.` }], structuredContent: { suggestion: { ...tally } } })
    view.focus()
  }
}

// A line with no letter yet (empty, a slash, a number) reads as the document does, where dir="auto"
// would make it left to right: in Arabic, a new line starts on the right. Every line gets its dir
// here, as ProseMirror drops an attribute a decoration had set rather than give back toDOM's. A list or a
// quote takes its first letter's, its bullets and boxes on that side: dir="auto" passes over lines with a dir.
const RTL = /^[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/
const direction = new Plugin({
  props: {
    decorations(state) {
      const dir = document.documentElement.dir || 'ltr'
      /** @type {Decoration[]} */
      const list = []
      state.doc.descendants((node, pos) => {
        const letter = /\p{L}/u.exec(node.textContent)?.[0]
        if (/^(bullet_list|ordered_list|blockquote|table)$/.test(node.type.name)) list.push(Decoration.node(pos, pos + node.nodeSize, { dir: letter ? (RTL.test(letter) ? 'rtl' : 'ltr') : dir }))
        if (!node.isTextblock) return true
        if (!node.type.spec.code) list.push(Decoration.node(pos, pos + node.nodeSize, { dir: /\p{L}/u.test(node.textContent) ? 'auto' : dir }))
        return false
      })
      return DecorationSet.create(state.doc, list)
    },
  },
})

const plugins = [
  // First, so that its Enter, Tab and arrows come before the keymaps' while it is open.
  slashMenu({ items: ITEMS, label: t, announce }),
  bubble({ formats: FORMATS, link: M.link, href: linkHref, label: t, mac: MAC, tabbable: (state) => !itemDepth(state.selection) && !isInTable(state) }),
  blocks({ label: t, announce, mac: MAC, kinds: ITEMS.filter((item) => item.key !== 'table' && item.key !== 'divider') }),
  RULES,
  keymap(KEYS),
  keymap(baseKeymap),
  history(),
  dropCursor(),
  gapCursor(),
  tableEditing(),
  suggestions({ strings: () => strings, act, changed: (hunks) => showReview(hunks) }),
  direction,
]

/** @param {EditorState} _state */
const attributes = (_state) => ({ id: 'doc', class: 'doc', role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('document', { file: fileName }), spellcheck: 'true' })

/** @param {string} name @param {string} markdown */
function open(name, markdown) {
  fileName = name
  const read = parse(markdown)
  sources = read.sources
  view.updateState(EditorState.create({ doc: read.doc, plugins }))
  view.setProps({ attributes })
}

const view = new EditorView(mount, {
  state: EditorState.create({ doc: parse('').doc, plugins }),
  attributes,
  // A table scrolls sideways in a box of its own, so a wide one never widens the page.
  nodeViews: { table: (node) => new TableView(node, 64) },
  dispatchTransaction(tr) {
    const state = view.state.apply(tr)
    view.updateState(state)
    if (tr.docChanged) later(save, 300)
    if (tr.selectionSet || tr.docChanged) later(select, 250)
  },
  handleDOMEvents: {
    // A link in the document is text to change: a click puts the caret in it, as anywhere else, and
    // never reaches the relay, which would open it; with ⌘ or Ctrl, Jean opens it.
    click(_view, event) {
      const link = /** @type {HTMLElement} */ (event.target).closest?.('a[href]')
      if (!link) return false
      event.stopPropagation()
      event.preventDefault()
      if (MAC ? event.metaKey : event.ctrlKey) request('ui/open-link', { url: link.getAttribute('href') })
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
  },
  // Word puts its lists on the clipboard as paragraphs that only look like lists, Google Docs a
  // list inside a list beside the item it belongs to.
  transformPastedHTML: lists,
  // A table's first row is its head in Markdown, bold already: Word and Google Docs copy it as
  // cells, their text bold.
  transformPasted: (slice) => new Slice(plainHeads(slice.content), slice.openStart, slice.openEnd),
})

/** @type {Record<string, ReturnType<typeof setTimeout>>} */
const timers = {}
/** @param {() => void} work @param {number} ms */
function later(work, ms) {
  clearTimeout(timers[work.name])
  timers[work.name] = setTimeout(work, ms)
}

const markdown = () => serialize(view.state.doc, sources)
let saved = ''
function save() {
  const text = markdown()
  if (text === saved) return
  saved = text
  request('tools/call', { name: 'save', arguments: { name: fileName, markdown: text } }).catch(() => { saved = '' })
}
function flush() {
  clearTimeout(timers.save)
  save()
}
// The keyboard gone to Jean (its pane closed, another task) or the frame taken away says what was typed last.
addEventListener('blur', flush)
addEventListener('pagehide', flush)

let selected = false
function select() {
  const { from, to, empty } = view.state.selection
  if (empty && !selected) return
  selected = !empty
  const text = empty ? '' : sliceMarkdown(view.state.doc, from, to)
  request('ui/update-model-context', empty ? { content: [], structuredContent: { document: fileName, selection: null } } : {
    content: [{ type: 'text', text: `Selected in ${fileName}:\n\n${text}` }],
    structuredContent: { document: fileName, selection: { markdown: text, text: view.state.doc.textBetween(from, to, '\n', ' '), from, to } },
  })
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
document.addEventListener('keydown', (event) => {
  if (view.dom.contains(/** @type {Node} */ (event.target)) || !(MAC ? event.metaKey : event.ctrlKey) || event.key.toLowerCase() !== 'z' || event.isComposing) return
  ;(event.shiftKey ? redo : undo)(view.state, view.dispatch)
  event.preventDefault()
})

// The frame focused as a whole (Jean opening it) gives the document the caret.
addEventListener('focus', () => { if (document.activeElement === document.body) view.focus() })

// What the editor leaves goes to Jean, as a key pressed on the frame: Escape, and a shortcut with ⌘ or Ctrl,
// which never reach Jean's document from here. Only a key's name and modifiers cross.
addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.isComposing || !(event.key === 'Escape' || (MAC ? event.metaKey : event.ctrlKey))) return
  const { key, code, metaKey, ctrlKey, shiftKey, altKey } = event
  notify('jean/key', { key, code, metaKey, ctrlKey, shiftKey, altKey })
})
// A file dropped on the document is Jean's to share in the conversation: the file crosses as it is.
addEventListener('drop', (event) => {
  const files = [...event.dataTransfer?.files ?? []]
  if (!files.length) return
  event.preventDefault()
  notify('jean/files', { files })
}, true)

/**
 * Lists as lists: Word puts them on the clipboard as paragraphs styled mso-list, how deep each is in
 * that style (`level2`), and its bullet or number as text only other programs read, between
 * <!--[if !supportLists]--> and <![endif]-->; Google Docs a list inside a list, beside its item.
 * @param {string} html
 */
function lists(html) {
  if (!/mso-list|<(ul|ol)[^>]*>[\s\S]*<(ul|ol)/i.test(html)) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  /** @type {Array<{ list: HTMLElement, level: number }>} */
  let stack = []
  /** @type {Element | null} */
  let previous = null
  for (const p of [...doc.body.querySelectorAll('p')].filter((p) => /mso-list:\s*l\d+\s+level\d+/i.test(p.getAttribute('style') ?? ''))) {
    let marker = ''
    const walker = doc.createTreeWalker(p, NodeFilter.SHOW_COMMENT)
    const comments = []
    for (let comment = walker.nextNode(); comment; comment = walker.nextNode()) comments.push(comment)
    for (const comment of comments.filter((one) => /\[if !supportLists\]/.test(/** @type {Comment} */ (one).data))) {
      for (let next = comment.nextSibling; next && !(next.nodeType === Node.COMMENT_NODE && /\[endif\]/.test(/** @type {Comment} */ (next).data)); next = comment.nextSibling) {
        marker += next.textContent ?? ''
        next.remove()
      }
    }
    const level = Number(/level(\d+)/i.exec(p.getAttribute('style') ?? '')?.[1] ?? 1)
    if (previous?.nextElementSibling !== p) stack = []
    while (stack.length && stack[stack.length - 1].level > level) stack.pop()
    if (!stack.length || stack[stack.length - 1].level < level) {
      const list = doc.createElement(/^\s*(\d+|[a-z]|[ivxlc]+)[.)]/i.test(marker) ? 'ol' : 'ul')
      if (stack.length) (stack[stack.length - 1].list.lastElementChild ?? stack[stack.length - 1].list).append(list)
      else p.before(list)
      stack.push({ list, level })
    }
    const li = doc.createElement('li')
    li.append(...p.childNodes)
    stack[stack.length - 1].list.append(li)
    // A mark where the paragraph was, so that the next one knows it follows it.
    previous = doc.createElement('template')
    p.replaceWith(previous)
  }
  for (const mark of doc.body.querySelectorAll('template')) mark.remove()
  for (const list of doc.body.querySelectorAll(':is(ul, ol) > :is(ul, ol)')) if (list.previousElementSibling?.tagName === 'LI') list.previousElementSibling.append(list)
  return doc.body.innerHTML
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

label()

// What the tests read in the frame: the editor itself, and the Markdown it writes.
Object.assign(globalThis, { editor: { view, markdown } })

// MCP Apps' handshake: the app says what it is and that it has tools; Jean answers with its context.
const answer = await request('ui/initialize', { protocolVersion: '2026-01-26', appInfo: { name: 'jean-documents', version: '1.0.0' }, appCapabilities: { tools: { listChanged: false } } })
context(answer?.hostContext)
notify('ui/notifications/initialized', {})
