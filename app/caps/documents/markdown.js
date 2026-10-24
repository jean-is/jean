// A document's Markdown ⇄ ProseMirror (D485), in the editor and under node --test. marked's
// lexer reads the file, as Jean's own renderer does (ui/markdown.js), so the editor sees the blocks an
// answer shows; the writer is prosemirror-markdown's, without its markdown-it parser. A block the
// person didn't touch goes back as it was read, byte for byte, its blank lines with it: only what
// changed is written again, with the markers it was written with, and escaped no more than reading it
// back needs. Two lists of a kind that end up next to each other stay two: the second is written with
// the other marker, which Markdown reads as another list. Columns side by side are Pandoc's fenced divs (D501).
// A document's first line is its title (D574), text alone, which the editor holds as a node of its own (`titled()`). A creation
// is referred to as Obsidian does, `[[its place|its name]]` (D575).
import { Schema, tableNodes, MarkdownSerializer, MarkdownSerializerState } from '#prosemirror'
import { Marked } from 'marked'
import { columns } from '../layouts/shapes.js'

/** @typedef {import('prosemirror-model').Node} PMNode */
/** @typedef {import('prosemirror-model').Mark} PMMark */

// Formulas as Jean reads them (ui/markdown.js, D185): the same two expressions.
const FORMULA = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)((?:\\[\s\S]|[^\\$])+?)(?<!\s)\$(?!\d))/
const FORMULA_BLOCK = /^ {0,3}(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n+|$)/
/** @param {RegExpExecArray | null} match */
const formulaToken = (match) => match ? { type: 'math', raw: match[0], text: (match[1] ?? match[2] ?? match[3] ?? match[4]).trim(), block: (match[1] ?? match[2]) !== undefined } : undefined
/** A reference (D575): `[[place|name]]`, or `[[name]]`. @param {RegExpExecArray | null} match */
const refToken = (match) => match ? { type: 'ref', raw: match[0], uri: match[1].trim(), label: (match[2] ?? match[1]).trim() } : undefined
const marked = new Marked({ extensions: [
  { name: 'ref', level: 'inline', start: (src) => src.indexOf('[['), tokenizer: (src) => refToken(/^\[\[([^[\]|\n]+)(?:\|([^[\]\n]+))?\]\]/.exec(src)) },
  { name: 'math', level: 'block', start: (src) => src.match(/(?<=\n) {0,3}(?:\$\$|\\\[)/)?.index, tokenizer: (src) => formulaToken(FORMULA_BLOCK.exec(src)) },
  { name: 'math', level: 'inline', start: (src) => src.match(/\$|\\[([]/)?.index, tokenizer: (src) => formulaToken(FORMULA.exec(src)) },
  columns,
] })

/** The entities Jean decodes (ui/markdown.js), and so the ones written back as entities. */
const ENTITIES = /** @type {Record<string, string>} */ ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': '\u00a0' })
/** @param {string} text */
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity])

/**
 * A link the editor keeps: any address but those that run or carry something themselves. A link to
 * another file of the folder stays; opening one is Jean's to decide (ui/open-link).
 * @param {string | null} href
 */
export function safeHref(href) {
  if (!href) return null
  return /^(javascript|vbscript|data|blob|file):/i.test(href.replace(/[\u0000-\u0020\u007f]/g, '')) ? null : href
}

const dirAuto = { dir: 'auto' }
/** The words the document's own elements show, which the editor sets in the user's language. */
export const words = { done: '' }
/** The addresses of the pictures the user pasted in the document open (D573), the only ones drawn from the web. @type {Set<string>} */
export const brought = new Set()

const TABLES = tableNodes({
  tableGroup: 'block', cellContent: 'inline*',
  // A column's alignment as an attribute the style sheet reads, since Jean's page refuses style attributes; a pasted cell gives its own as a style.
  cellAttributes: { align: { default: null, getFromDOM: (dom) => /** @type {HTMLElement} */ (dom).getAttribute('data-align') || /** @type {HTMLElement} */ (dom).style.textAlign || null, setDOMAttr: (value, attrs) => { if (value) attrs['data-align'] = value } } },
})
TABLES.table = { ...TABLES.table, attrs: { rule: { default: null } } }

export const schema = new Schema({
  nodes: {
    doc: { content: 'title (block | columns)*' },
    // The title (D574): first, text alone, written as a heading of the first level; no block is let go on it, which goes after it (editor.js).
    title: { content: 'text*', marks: '', defining: true, disableDropCursor: (/** @type {any} */ view) => Boolean(view.dragging && !view.dragging.slice.openStart), toDOM: () => ['h1', dirAuto, 0] },
    // A paragraph in a table's cell, as Word and Google Docs copy one, is only its text.
    paragraph: { content: 'inline*', group: 'block', parseDOM: [{ tag: 'p', context: 'table_cell/|table_header/', skip: true, priority: 60 }, { tag: 'p' }], toDOM: () => ['p', dirAuto, 0] },
    heading: {
      attrs: { level: { default: 1 } }, content: 'inline*', group: 'block', defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: (node) => [`h${node.attrs.level}`, dirAuto, 0],
    },
    blockquote: { content: 'block+', group: 'block', defining: true, parseDOM: [{ tag: 'blockquote' }], toDOM: () => ['blockquote', dirAuto, 0] },
    code_block: {
      attrs: { lang: { default: '' }, fence: { default: '```' } }, content: 'text*', marks: '', group: 'block', code: true, defining: true,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full', getAttrs: (dom) => ({ lang: dom.getAttribute('data-lang') ?? '' }) }],
      toDOM: (node) => ['pre', { dir: 'ltr', 'data-lang': node.attrs.lang || null }, ['code', 0]],
    },
    // What the editor shows as written and writes back as it was: raw HTML, a link's definition, a
    // formula set apart. It can still be changed, as text.
    raw_block: {
      attrs: { kind: { default: 'html' } }, content: 'text*', marks: '', group: 'block', code: true, defining: true,
      parseDOM: [{ tag: 'pre.raw', preserveWhitespace: 'full' }],
      toDOM: (node) => ['pre', { class: `raw raw-${node.attrs.kind}`, dir: 'ltr' }, ['code', 0]],
    },
    horizontal_rule: { attrs: { markup: { default: '---' } }, group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: () => ['hr'] },
    bullet_list: {
      attrs: { tight: { default: true }, bullet: { default: '-' } }, content: 'list_item+', group: 'block',
      parseDOM: [{ tag: 'ul' }], toDOM: () => ['ul', dirAuto, 0],
    },
    ordered_list: {
      attrs: { order: { default: 1 }, tight: { default: true }, delim: { default: '.' } }, content: 'list_item+', group: 'block',
      parseDOM: [{ tag: 'ol', getAttrs: (dom) => ({ order: Number(dom.getAttribute('start') ?? 1) || 1 }) }],
      toDOM: (node) => ['ol', { dir: 'auto', start: node.attrs.order === 1 ? null : node.attrs.order }, 0],
    },
    list_item: {
      attrs: { checked: { default: null } }, content: 'paragraph block*', defining: true,
      parseDOM: [{ tag: 'li', getAttrs: (dom) => ({ checked: dom.hasAttribute('data-checked') ? dom.getAttribute('data-checked') === 'true' : null }) }],
      // A task's item, with its box to tick, which the editor hears (editor.js).
      toDOM: (node) => (node.attrs.checked === null ? ['li', 0] : ['li', { 'data-checked': String(node.attrs.checked) },
        ['span', { class: 'task-box', contenteditable: 'false' }, ['input', { type: 'checkbox', 'aria-label': words.done, checked: node.attrs.checked ? '' : null }]], ['div', { class: 'task-text' }, 0]]),
    },
    // Markdown's tables: one line of text in each cell, its column aligned, and the line under its
    // head as it was written, kept while the columns and how they align stay as they were.
    ...TABLES,
    text: { group: 'inline' },
    // A picture shows by what it says it is, never by loading it (D35), but a file of the project's (D573), which loads nothing from the web.
    image: {
      attrs: { src: {}, alt: { default: '' }, title: { default: null } }, inline: true, group: 'inline', draggable: true,
      parseDOM: [{ tag: 'img[src]', getAttrs: (dom) => ({ src: dom.getAttribute('src'), alt: dom.getAttribute('alt') ?? '', title: dom.getAttribute('title') }) }],
      toDOM: ({ attrs: { src, alt } }) => (/^\.\.\/files\/sha256-[\da-f]{64}\.\w+$/.test(src) ? ['app-shared', { class: 'picture', uri: src.slice(3), ...(alt && { role: 'img', 'aria-label': alt }) }]
        : brought.has(src) ? ['img', { class: 'picture', src, alt, referrerpolicy: 'no-referrer', loading: 'lazy' }]
        : ['span', { class: 'image-alt', 'data-src': src, role: 'img', 'aria-label': alt || src }, `[${alt || src}]`]),
    },
    // A reference to a creation (D575), by its place, or its name, which a click follows (editor.js).
    ref: {
      attrs: { uri: {}, label: { default: '' } }, inline: true, group: 'inline', atom: true,
      toDOM: ({ attrs: { uri, label } }) => ['span', { class: 'ref', role: 'link', 'data-uri': uri, dir: 'auto' }, label || uri],
    },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
    // Columns (D501), at the top level only; nothing crosses from one column to the next.
    columns: { content: 'column+', isolating: true, toDOM: () => ['div', { class: 'columns' }, 0] },
    column: { content: 'block+', isolating: true, toDOM: () => ['div', { class: 'column' }, 0] },
  },
  marks: {
    link: {
      attrs: { href: {}, title: { default: null } }, inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: (dom) => { const href = safeHref(dom.getAttribute('href')); return href ? { href, title: dom.getAttribute('title') } : false } }],
      toDOM: (mark) => ['a', { href: mark.attrs.href, title: mark.attrs.title, rel: 'noopener noreferrer' }, 0],
    },
    em: {
      attrs: { marker: { default: '*' } },
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }, { style: 'font-style=normal', clearMark: (mark) => mark.type.name === 'em' }],
      toDOM: () => ['em', 0],
    },
    strong: {
      attrs: { marker: { default: '**' } },
      parseDOM: [
        { tag: 'strong' },
        // Google Docs wraps what it copies in <b style="font-weight:normal">.
        { tag: 'b', getAttrs: (dom) => dom.style.fontWeight !== 'normal' && null },
        { style: 'font-weight=400', clearMark: (mark) => mark.type.name === 'strong' },
        { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null },
      ],
      toDOM: () => ['strong', 0],
    },
    del: {
      attrs: { marker: { default: '~~' } },
      parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration', getAttrs: (value) => /line-through/.test(value) && null }, { style: 'text-decoration-line', getAttrs: (value) => /line-through/.test(value) && null }],
      toDOM: () => ['del', 0],
    },
    code: { code: true, parseDOM: [{ tag: 'code' }], toDOM: () => ['code', { dir: 'ltr' }, 0] },
    // A formula in a line, and HTML in a line: shown as written, written back as they are.
    math: { attrs: { display: { default: false } }, code: true, toDOM: () => ['code', { class: 'math', dir: 'ltr' }, 0] },
    html: { code: true, toDOM: () => ['code', { class: 'html', dir: 'ltr' }, 0] },
  },
})

const { nodes: N, marks: M } = schema

/**
 * Inline tokens as nodes. @param {any[]} tokens @param {readonly PMMark[]} marks @returns {PMNode[]}
 */
function inline(tokens, marks = []) {
  return tokens.flatMap((token) => {
    const text = (/** @type {string} */ value, /** @type {readonly PMMark[]} */ more = marks) => (value ? [schema.text(value, more)] : [])
    switch (token.type) {
      case 'text': return token.tokens ? inline(token.tokens, marks) : text(decode(token.text))
      case 'escape': return text(token.text)
      case 'strong': return inline(token.tokens, M.strong.create({ marker: token.raw.slice(0, 2) }).addToSet(marks))
      case 'em': return inline(token.tokens, M.em.create({ marker: token.raw[0] }).addToSet(marks))
      case 'del': return inline(token.tokens, M.del.create({ marker: token.raw.startsWith('~~') ? '~~' : '~' }).addToSet(marks))
      case 'codespan': return text(token.text, M.code.create().addToSet(marks))
      case 'link': {
        const href = safeHref(token.href)
        return inline(token.tokens, href ? M.link.create({ href, title: token.title || null }).addToSet(marks) : marks)
      }
      case 'image': return [N.image.create({ src: token.href, alt: token.text ?? '', title: token.title || null }, null, marks)]
      case 'ref': return [N.ref.create({ uri: token.uri, label: token.label }, null, marks)]
      case 'br': return [N.hard_break.create(null, null, marks)]
      case 'math': return text(token.text, M.math.create({ display: token.block }).addToSet(marks))
      case 'html': return text(token.raw, M.html.create().addToSet(marks))
      case 'checkbox': return []
      default: return text(token.raw)
    }
  })
}

/** @param {PMNode[]} content */
const paragraph = (content) => N.paragraph.create(null, content)

/**
 * Block tokens as nodes, each with the source it was read from. @param {any[]} tokens
 * @returns {Array<{ node: PMNode, raw: string }>}
 */
function blocks(tokens) {
  /** @type {Array<{ node: PMNode, raw: string }>} */
  const out = []
  for (const token of tokens) {
    // Blank lines and what makes no block go with the block before.
    const node = token.type === 'space' ? null : block(token)
    if (node) out.push({ node, raw: token.raw })
    else if (out.length) out[out.length - 1].raw += token.raw
  }
  return out
}

/** Blocks inside another, columns there staying as written. @param {any[]} tokens */
const children = (tokens) => blocks(tokens).map(({ node, raw }) => (node.type === N.columns ? N.raw_block.create({ kind: 'columns' }, schema.text(raw.replace(/\n+$/, ''))) : node))
/** Those, or an empty line. @param {any[]} tokens */
const filled = (tokens) => ((content) => (content.length ? content : [paragraph([])]))(children(tokens))

/** @param {any} token @returns {PMNode | null} */
function block(token) {
  switch (token.type) {
    case 'heading': return N.heading.create({ level: token.depth }, inline(token.tokens))
    case 'paragraph': return paragraph(inline(token.tokens))
    case 'text': return paragraph(token.tokens ? inline(token.tokens) : inline([{ type: 'text', text: token.text }]))
    case 'code': {
      const fence = /^ {0,3}(`{3,}|~{3,})/.exec(token.raw)?.[1] ?? '```'
      return N.code_block.create({ lang: token.lang ?? '', fence }, token.text ? schema.text(token.text) : null)
    }
    case 'blockquote': return N.blockquote.create(null, filled(token.tokens))
    case 'columns': return N.columns.create(null, token.columns.map((/** @type {any} */ column) => N.column.create(null, filled(column.tokens))))
    case 'list': {
      const items = token.items.map((/** @type {any} */ item) => {
        const content = children(item.tokens)
        if (content[0]?.type !== N.paragraph) content.unshift(paragraph([]))
        return N.list_item.create({ checked: item.task ? Boolean(item.checked) : null }, content)
      })
      const marker = /^ {0,3}([-*+]|\d{1,9}([.)]))/.exec(token.raw)
      return token.ordered
        ? N.ordered_list.create({ order: Number(token.start) || 1, tight: !token.loose, delim: marker?.[2] ?? '.' }, items)
        : N.bullet_list.create({ tight: !token.loose, bullet: marker?.[1] ?? '-' }, items)
    }
    case 'table': {
      const row = (/** @type {any[]} */ cells, /** @type {any} */ type) => N.table_row.create(null, cells.map((cell, i) => type.create({ align: token.align[i] ?? null }, inline(cell.tokens))))
      const rule = token.raw.split('\n')[1]?.trim() ?? null
      return N.table.create({ rule }, [row(token.header, N.table_header), ...token.rows.map((/** @type {any[]} */ cells) => row(cells, N.table_cell))])
    }
    case 'hr': return N.horizontal_rule.create({ markup: token.raw.trim() })
    case 'checkbox': return null
    // HTML, a link's definition, a formula set apart, and whatever else marked reads.
    default: return token.raw.trim() ? N.raw_block.create({ kind: token.type }, schema.text(token.raw.replace(/\n+$/, ''))) : null
  }
}

/**
 * A Markdown file as a document, and what each of its blocks was read from; none, a title (D568).
 * @param {string} source @returns {{ doc: PMNode, sources: Sources }}
 */
export function parse(source) {
  const read = blocks(marked.lexer(source))
  if (!read.length) read.push({ node: N.heading.create(), raw: '' })
  const doc = N.doc.create(null, read.map(({ node }) => node))
  return { doc, sources: new Sources(read) }
}

/** The document a piece of Markdown makes, without its sources. @param {string} source */
export const parseDoc = (source) => parse(source).doc

/**
 * A document as the editor holds it (D574): its first heading of the first level, if it comes first, as its title, its text alone; else
 * `keep` (Jean's version keeps the title it left out) or an empty one, which isn't written. @param {{ doc: PMNode, sources: Sources }} read @param {PMNode} [keep]
 */
export function titled({ doc, sources }, keep) {
  const first = doc.firstChild, heading = first?.type === N.heading && first.attrs.level === 1
  const text = heading ? first.textBetween(0, first.content.size, ' ', ' ').replace(/\s+/g, ' ').trim() : ''
  const title = heading || !keep ? N.title.create(null, text ? schema.text(text) : null) : keep
  const read = heading ? sources.list.find((entry) => entry.node === first) : null
  if (read && first?.content.eq(title.content)) read.node = title
  return { doc: N.doc.create(null, heading ? doc.content.replaceChild(0, title) : doc.content.addToStart(title)), sources }
}

/**
 * What each block was read from: by the block itself, which ProseMirror keeps as long as nothing in
 * it changes, or by a block equal to it, as one is again once a change is undone.
 */
export class Sources {
  /** @param {Array<{ node: PMNode, raw: string }>} [list] */
  constructor(list = []) {
    this.list = [...list]
  }

  /** @param {Sources} other */
  merge(other) {
    this.list.push(...other.list)
  }

  /** What a block was read from, and where it was in the file. @param {PMNode} node @param {Set<string>} used */
  entry(node, used) {
    const found = this.list.find((entry) => entry.node === node) ?? this.list.find((entry) => !used.has(entry.raw) && entry.node.eq(node))
    return found && { raw: found.raw, index: this.list.indexOf(found) }
  }
}

// What changed is written as prosemirror-markdown writes it, with the markers it was read with.
/** @type {Record<string, (state: MarkdownSerializerState, node: PMNode, parent: PMNode, index: number) => void>} */
const NODES = {
  blockquote: (state, node) => state.wrapBlock('> ', null, node, () => state.renderContent(node)),
  code_block(state, node) {
    const { fence, lang } = node.attrs
    const longest = (node.textContent.match(new RegExp(`${fence[0] === '~' ? '~' : '`'}{3,}`, 'g')) ?? []).reduce((max, run) => Math.max(max, run.length), 0)
    const marks = fence[0].repeat(Math.max(fence.length, longest + 1))
    state.write(`${marks}${lang}\n`)
    state.text(node.textContent, false)
    state.ensureNewLine()
    state.write(marks)
    state.closeBlock(node)
  },
  raw_block(state, node) {
    state.text(node.textContent, false)
    state.closeBlock(node)
  },
  // Pandoc's fenced divs: four colons around the columns, three around each.
  columns(state, node) {
    state.write(':::: columns\n')
    node.forEach((column, _, i) => {
      state.write(`${i ? '\n' : ''}::: column\n`)
      state.renderContent(column)
      ;/** @type {any} */ (state).flushClose(1)
      state.write(':::\n')
    })
    state.write('::::')
    state.closeBlock(node)
  },
  heading(state, node) {
    state.write(`${state.repeat('#', node.attrs.level)} `)
    state.renderInline(node, false)
    state.closeBlock(node)
  },
  title: (state, node, parent, index) => NODES.heading(state, N.heading.create({ level: 1 }, node.content), parent, index),
  horizontal_rule(state, node) {
    state.write(node.attrs.markup)
    state.closeBlock(node)
  },
  bullet_list: (state, node) => state.renderList(node, '  ', () => `${node.attrs.bullet} `),
  ordered_list(state, node) {
    const start = node.attrs.order
    const width = String(start + node.childCount - 1).length
    state.renderList(node, state.repeat(' ', width + 2), (i) => `${String(start + i).padStart(width)}${node.attrs.delim} `)
  },
  list_item(state, node) {
    if (node.attrs.checked !== null) state.write(node.attrs.checked ? '[x] ' : '[ ] ')
    state.renderContent(node)
  },
  paragraph(state, node) {
    state.renderInline(node)
    state.closeBlock(node)
  },
  table(state, node) {
    /** @type {string[][]} */
    const rows = []
    /** @type {Array<string | null>} */
    const align = []
    node.forEach((row) => {
      /** @type {string[]} */
      const cells = []
      row.forEach((cell, _, i) => {
        if (rows.length === 0) align[i] = cell.attrs.align
        cells.push(inlineMarkdown(cell).replace(/\|/g, '\\|').replace(/\n/g, ' '))
      })
      rows.push(cells)
    })
    const width = Math.max(...rows.map((cells) => cells.length))
    const line = (/** @type {string[]} */ cells) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`
    const rule = Array.from({ length: width }, (_, i) => ({ left: ':--', right: '--:', center: ':-:' })[/** @type {string} */ (align[i])] ?? '---')
    const was = /** @type {string | null} */ (node.attrs.rule)
    const wasRule = was?.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
    const kept = wasRule?.length === width && wasRule.every((cell, i) => (cell.startsWith(':') ? (cell.endsWith(':') ? ':-:' : ':--') : cell.endsWith(':') ? '--:' : '---') === rule[i])
    state.text([line(rows[0]), kept ? /** @type {string} */ (was) : `| ${rule.join(' | ')} |`, ...rows.slice(1).map(line)].join('\n'), false)
    state.closeBlock(node)
  },
  image(state, node) {
    const { src, alt, title } = node.attrs
    state.write(`![${state.esc(alt)}](${src.replace(/[()\s]/g, (/** @type {string} */ c) => encodeURI(c) === c ? `\\${c}` : encodeURI(c))}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`)
  },
  ref(state, { attrs: { uri, label } }) {
    // Its name without what would end it.
    const name = String(label).replace(/[[\]|\n]+/g, ' ').trim()
    state.write(`[[${uri}${name && name !== uri ? `|${name}` : ''}]]`)
  },
  hard_break(state, node, parent, index) {
    for (let i = index + 1; i < parent.childCount; i++) {
      if (parent.child(i).type !== node.type) {
        state.write('\\\n')
        return
      }
    }
  },
  text: (state, node) => state.text(/** @type {string} */ (node.text), !(/** @type {any} */ (state).inAutolink)),
}

/** @param {PMNode} node @param {number} side */
function backticksFor(node, side) {
  let longest = 0
  if (node.isText) for (const [run] of /** @type {string} */ (node.text).matchAll(/`+/g)) longest = Math.max(longest, run.length)
  const ticks = '`'.repeat(longest + 1)
  const pad = longest > 0 || (node.isText && /^`|`$/.test(/** @type {string} */ (node.text)))
  return side < 0 ? ticks + (pad ? ' ' : '') : (pad ? ' ' : '') + ticks
}

/** @param {PMMark} link @param {PMNode} parent @param {number} index */
function plainURL(link, parent, index) {
  if (link.attrs.title || !/^\w+:/.test(link.attrs.href)) return false
  const content = parent.child(index)
  if (!content.isText || content.text !== link.attrs.href || content.marks[content.marks.length - 1] !== link) return false
  return index === parent.childCount - 1 || !link.isInSet(parent.child(index + 1).marks)
}

const MARKED = { open: (/** @type {any} */ _s, /** @type {PMMark} */ mark) => mark.attrs.marker, close: (/** @type {any} */ _s, /** @type {PMMark} */ mark) => mark.attrs.marker, mixable: true, expelEnclosingWhitespace: true }
/** @type {Record<string, any>} */
const MARKS = {
  em: MARKED, strong: MARKED, del: MARKED,
  link: {
    open(/** @type {any} */ state, /** @type {PMMark} */ mark, /** @type {PMNode} */ parent, /** @type {number} */ index) {
      state.inAutolink = plainURL(mark, parent, index)
      return state.inAutolink ? '<' : '['
    },
    close(/** @type {any} */ state, /** @type {PMMark} */ mark) {
      const { inAutolink } = state
      state.inAutolink = undefined
      return inAutolink ? '>' : `](${mark.attrs.href.replace(/[()"\s]/g, '\\$&')}${mark.attrs.title ? ` "${mark.attrs.title.replace(/"/g, '\\"')}"` : ''})`
    },
    mixable: true,
  },
  code: {
    open: (/** @type {any} */ _s, /** @type {PMMark} */ _m, /** @type {PMNode} */ parent, /** @type {number} */ index) => backticksFor(parent.child(index), -1),
    close: (/** @type {any} */ _s, /** @type {PMMark} */ _m, /** @type {PMNode} */ parent, /** @type {number} */ index) => backticksFor(parent.child(index - 1), 1),
    escape: false,
  },
  math: { open: (/** @type {any} */ _s, /** @type {PMMark} */ mark) => (mark.attrs.display ? '$$' : '$'), close: (/** @type {any} */ _s, /** @type {PMMark} */ mark) => (mark.attrs.display ? '$$' : '$'), escape: false },
  html: { open: '', close: '', escape: false },
}

const serializer = new MarkdownSerializer(NODES, MARKS, /** @type {any} */ ({ tightLists: true }))

// Escaping: as little as reading the block back needs. A changed block is first written escaping
// only what is always markup, then read back; if it isn't the same block, it is written again with
// everything escaped that could be. Never `\[`, which Jean reads as a formula's start (D185): `\]`
// is enough to keep a bracket from closing a link.
/** @param {string} text @param {boolean} startOfLine */
function lightEscape(text, startOfLine) {
  let out = text
    .replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\')
    .replace(/[`*]|~~|_/g, (m, i, all) => (m === '_' && i > 0 && i + 1 < all.length && /\w/.test(all[i - 1]) && /\w/.test(all[i + 1]) ? m : `\\${m}`))
    .replace(/&(?=(amp|lt|gt|quot|#39|nbsp);)/g, '&amp;')
    .replace(/<(?=[a-zA-Z/!?])/g, '&lt;')
  if (startOfLine) out = out.replace(/^(\+[ ]|[-*>])/, '\\$&').replace(/^(\s*)(#{1,6})(\s|$)/, '$1\\$2$3').replace(/^(\s*\d+)([.)])(\s)/, '$1\\$2$3')
  return out
}

/** @param {string} text @param {boolean} startOfLine */
function fullEscape(text, startOfLine) {
  let out = text
    .replace(/[`*\\~\]_$|]/g, (m, i, all) => (m === '_' && i > 0 && i + 1 < all.length && /\w/.test(all[i - 1]) && /\w/.test(all[i + 1]) ? m : `\\${m}`))
    .replace(/&(?=[a-zA-Z#][a-zA-Z0-9]*;)/g, '&amp;')
    .replace(/<(?=[a-zA-Z/!?])/g, '&lt;')
  if (startOfLine) out = out.replace(/^(\+[ ]|[-*>=])/, '\\$&').replace(/^(\s*)(#{1,6})(\s|$)/, '$1\\$2$3').replace(/^(\s*\d+)([.)])(\s)/, '$1\\$2$3')
  return out
}

/**
 * One node's Markdown, escaped one way or the other. @param {PMNode} node @param {(text: string, start: boolean) => string} esc
 */
function write(node, esc) {
  const state = /** @type {any} */ (new (/** @type {any} */ (MarkdownSerializerState))(serializer.nodes, serializer.marks, { tightLists: true }))
  state.esc = esc
  if (node.type === N.doc) state.renderContent(node)
  else state.render(node, N.doc.create(null, [node]), 0)
  return state.out
}

/** A cell's or a paragraph's inline content as Markdown. @param {PMNode} node */
function inlineMarkdown(node) {
  const block = N.paragraph.create(null, node.content)
  const light = write(block, lightEscape)
  return same(parseDoc(light).firstChild, block) ? light : write(block, fullEscape)
}

/**
 * Whether two blocks hold the same, whatever markers wrote them. @param {PMNode | null | undefined} a @param {PMNode} b
 */
export function same(a, b) {
  return Boolean(a) && JSON.stringify(canonical(/** @type {PMNode} */ (a).toJSON())) === JSON.stringify(canonical(b.toJSON()))
}

const MARKERS = new Set(['marker', 'bullet', 'delim', 'fence', 'markup', 'tight', 'rule'])
/** @param {any} value @returns {any} */
function canonical(value) {
  if (Array.isArray(value)) return mergeText(value.map(canonical))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !MARKERS.has(key)).map(([key, inner]) => [key, canonical(inner)]))
}
/** Adjacent text with the same marks, as one. @param {any[]} list */
function mergeText(list) {
  return list.reduce((out, item) => {
    const last = out[out.length - 1]
    if (item?.type === 'text' && last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(item.marks ?? [])) last.text += item.text
    else out.push(item)
    return out
  }, [])
}

/** A changed block's Markdown: lightly escaped when that reads back the same. @param {PMNode} node */
export function blockMarkdown(node) {
  const light = write(node, lightEscape)
  const back = parseDoc(light)
  if (back.childCount === 1 && same(back.firstChild, node.type === N.title ? N.heading.create({ level: 1 }, node.content) : node)) return light
  return write(node, fullEscape)
}

/** A list's marker, by its kind, and the one that starts another list of that kind after it. */
const MARKER = /** @type {Record<string, string>} */ ({ bullet_list: 'bullet', ordered_list: 'delim' })
const OTHER = /** @type {Record<string, string>} */ ({ '-': '*', '*': '-', '+': '-', '.': ')', ')': '.' })

/**
 * The document as Markdown: each block as it was read when it hasn't changed, the others written
 * again, a blank line before and after them. @param {PMNode} doc @param {Sources} [sources]
 * @param {{ endsWithNewline?: boolean }} [options]
 */
export function serialize(doc, sources = new Sources(), { endsWithNewline = true } = {}) {
  let out = ''
  /** @type {Set<string>} */
  const used = new Set()
  let previous = -2
  /** @type {PMNode | null} */
  let last = null
  doc.forEach((block) => {
    // An empty paragraph (or one of line breaks, as Google Docs copies the space between lists) is
    // nothing in Markdown: it would be gone once the file is read again. So is an empty title (D574).
    if ((block.type === N.paragraph || block.type === N.title) && !block.textContent.trim() && !block.content.content.some((child) => !child.isText && child.type !== N.hard_break)) return void (previous = -2)
    let node = block
    const mark = MARKER[node.type.name]
    // A list of a kind right after one with its marker would read back as one list with it.
    if (mark && last?.type === node.type && last.attrs[mark] === node.attrs[mark]) node = node.type.create({ ...node.attrs, [mark]: OTHER[node.attrs[mark]] ?? '-' }, node.content)
    last = node
    const read = node === block ? sources.entry(node, used) : null
    if (read) {
      used.add(read.raw)
      // Blocks that followed each other in the file keep what was between them; others, moved
      // next to each other, get a blank line, or two paragraphs would read back as one.
      if (out && read.index !== previous + 1 && !out.endsWith('\n\n')) out += out.endsWith('\n') ? '\n' : '\n\n'
      else if (out && !out.endsWith('\n')) out += '\n'
      out += read.raw
      previous = read.index
      return
    }
    previous = -2
    if (out && !out.endsWith('\n\n')) out += out.endsWith('\n') ? '\n' : '\n\n'
    out += `${blockMarkdown(node)}\n\n`
  })
  out = out.replace(/\n+$/, '')
  return out && endsWithNewline ? `${out}\n` : out
}

/** A piece of the document (what is selected) as Markdown. @param {PMNode} doc @param {number} from @param {number} to */
export const sliceMarkdown = (doc, from, to) => write(doc.cut(from, to), lightEscape).replace(/\n+$/, '')
