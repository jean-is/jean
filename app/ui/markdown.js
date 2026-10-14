// Markdown → lit-html templates, from marked's tokens. No innerHTML anywhere:
// raw HTML in model output is shown as text, and an image shows only as a source gave
// it (D35: an image URL is a classic way for injected instructions to leak data).
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Marked } from 'marked'
import { unlock } from './caps.js'

/** @typedef {import('marked').Token} Token */
/** @typedef {Map<number, { name: string, label: string, open?: () => void, url?: string, site?: string, icon?: string, picture?: string, file?: import('../core/types.js').ResourceLink }>} Sources  by the number the brain cites: a file opens, a web page is a link, some can't be opened; a picture, its own or the one shared */

/** Sources for the text being rendered: `[n]` becomes a chip when n is one of them. @type {Sources | null} */
export let cited = null
/** Whether the text being rendered is an answer still being written, whose last block may not be whole yet. */
let writing = false

// Formulas in LaTeX (D185): $…$ and \(…\) in a line, $$…$$ and \[…\] set apart. As in Pandoc, a $
// opens before a non-space and closes after one, never before a digit, so "$5 and $10" stays text.
export const FORMULA = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)((?:\\[\s\S]|[^\\$])+?)(?<!\s)\$(?!\d))/
const FORMULA_BLOCK = /^ {0,3}(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n+|$)/
/** @param {RegExpExecArray | null} match */
const formulaToken = (match) => match ? { type: 'math', raw: match[0], text: (match[1] ?? match[2] ?? match[3] ?? match[4]).trim(), block: (match[1] ?? match[2]) !== undefined } : undefined
const parser = new Marked({ extensions: [
  { name: 'math', level: 'block', start: (src) => src.match(/(?<=\n) {0,3}(?:\$\$|\\\[)/)?.index, tokenizer: (src) => formulaToken(FORMULA_BLOCK.exec(src)) },
  { name: 'math', level: 'inline', start: (src) => src.match(/\$|\\[([]/)?.index, tokenizer: (src) => formulaToken(FORMULA.exec(src)) },
] })

/** marked's tokens, formulas among them. @param {string} source */
export const lex = (source) => parser.lexer(source)

/** @param {string} source @param {Sources} [sources] @param {boolean} [still] true while the answer is still being written */
export function markdown(source, sources, still = false) {
  cited = sources ?? null
  writing = still
  try {
    return blocks(lex(source))
  } catch {
    return html`<p>${source}</p>`
  } finally {
    cited = null
    writing = false
  }
}

/** "[1]" or "[1, 3]" → source chips; anything else stays text. @param {string} text */
function cite(text) {
  const sources = cited
  if (!sources?.size || !/\[\d/.test(text)) return text
  return text.split(/(\[\d+(?:,\s*\d+)*\])/).map((part) => {
    const numbers = /^\[([\d,\s]+)\]$/.exec(part)?.[1].split(/,\s*/).map(Number)
    if (!numbers?.every((n) => sources.has(n))) return part
    return numbers.map((n) => {
      const source = /** @type {NonNullable<ReturnType<Sources['get']>>} */ (sources.get(n))
      return source.url ? html`<a class="cite" href=${source.url} target="_blank" rel="noopener noreferrer" aria-label=${source.label}>${n}<span class="cite-tip">${source.icon ? html`<img src=${source.icon} alt="" loading="lazy">` : nothing}${source.site}<span dir="auto">${source.name}</span></span></a>`
        : source.open ? html`<button class="cite" title=${source.name} aria-label=${source.label} @click=${source.open}>${n}</button>`
        : html`<span class="cite" title=${source.name}>${n}</span>`
    })
  })
}

/** @param {Token[]} tokens */
export const blocks = (tokens) => (shapes.value.blocks?.(tokens) ?? (unlock('layouts'), tokens)).map(block)

/** @param {any} token @returns {unknown} */
function block(token) {
  switch (token.type) {
    case 'heading': return heading(token.depth, inline(token.tokens))
    case 'paragraph': return html`<p>${inline(token.tokens)}</p>`
    case 'code': return opening(token) ? nothing : token.lang === 'math' ? formula({ text: token.text, block: true }) : /^(la)?tex$/i.test(token.lang) ? latex(token) : widget(token) ?? html`<pre dir="ltr"><code>${token.text}</code></pre>`
    case 'blockquote': return shape(token) ?? html`<blockquote>${blocks(token.tokens)}</blockquote>`
    case 'list': return shape(token) ?? list(token)
    case 'table': return shape(token) ?? table(token)
    case 'hr': return html`<hr>`
    case 'math': return formula(token)
    case 'space': return nothing
    case 'text': return html`<p>${token.tokens ? inline(token.tokens) : cite(decode(token.text))}</p>`
    default: return html`<p>${token.raw}</p>`
  }
}

// Shapes (D215): comparisons, steps and notes, laid out by the layouts capability, which the first answer loads.
export const shapes = signal(/** @type {Record<string, (token: any) => any>} */ ({}))
/** @param {any} token */
const shape = (token) => shapes.value[token.type]?.(token)

/** @param {number} depth @param {unknown} content */
function heading(depth, content) {
  if (depth <= 2) return html`<h3>${content}</h3>`
  if (depth === 3) return html`<h4>${content}</h4>`
  return html`<h5>${content}</h5>`
}

/** @param {any} token */
function list(token) {
  const items = token.items.map((/** @type {any} */ item) => html`<li>${item.task ? html`<input type="checkbox" disabled ?checked=${item.checked}> ` : nothing}${listItem(item)}</li>`)
  return token.ordered ? html`<ol start=${token.start || 1}>${items}</ol>` : html`<ul>${items}</ul>`
}

/** @param {any} item */
function listItem(item) {
  if (item.loose) return blocks(item.tokens)
  return item.tokens.map((/** @type {any} */ token) => (token.type === 'text' ? (token.tokens ? inline(token.tokens) : cite(decode(token.text))) : block(token)))
}

/** @param {any} token */
function table(token) {
  /** @param {any} cell @param {number} index */
  const align = (cell, index) => (token.align[index] ? `align-${token.align[index]}` : '')
  return html`<div class="table" tabindex="0"><table>
    <thead><tr>${token.header.map((/** @type {any} */ cell, /** @type {number} */ i) => html`<th class=${align(cell, i)}>${inline(cell.tokens)}</th>`)}</tr></thead>
    <tbody>${token.rows.map((/** @type {any[]} */ row) => html`<tr>${row.map((cell, i) => html`<td class=${align(cell, i)}>${inline(cell.tokens)}</td>`)}</tr>`)}</tbody>
  </table></div>`
}

/** @param {Token[] | undefined} tokens @returns {unknown} */
export function inline(tokens = []) {
  return tokens.map((/** @type {any} */ token) => {
    switch (token.type) {
      case 'text': return token.tokens ? inline(token.tokens) : cite(decode(token.text))
      case 'strong': return html`<strong>${inline(token.tokens)}</strong>`
      case 'em': return html`<em>${inline(token.tokens)}</em>`
      case 'del': return html`<del>${inline(token.tokens)}</del>`
      case 'codespan': return html`<code>${decode(token.text)}</code>`
      case 'br': return html`<br>`
      case 'link': return safeHref(token.href)
        ? html`<a href=${token.href} target="_blank" rel="noopener noreferrer">${inline(token.tokens)}</a>`
        : inline(token.tokens)
      case 'image': return shape(token) ?? html`<span class="image-alt">[${token.text || token.href}]</span>`
      case 'escape': return token.text
      case 'math': return formula(token)
      default: return token.raw
    }
  })
}

/** @type {Promise<boolean> | undefined} */
let drawing
/** A formula, which the math capability draws once it has loaded; until then, or if it can't, its source shows. @param {{ text: string, block?: boolean }} token */
function formula(token) {
  drawing ??= unlock('math')
  return html`<app-math dir="ltr" tex=${token.text} ?block=${token.block}></app-math>`
}

// Requests and follow-ups: their formulas in the line, nothing else read as Markdown. Split keeps FORMULA's 4 groups.
const FORMULAS = new RegExp(`(?<!\\\\)${FORMULA.source.slice(1)}`, 'g')
/** @param {string} text @param {(token: { text: string }) => unknown} [draw] */
export const withFormulas = (text, draw = formula) => text.split(FORMULAS).map((part, i) => (i % 5 ? part && draw({ text: part.trim() }) : part))

/** A LaTeX document, which the math capability lays out; until then, or if it can't, its source shows. @param {any} token */
function latex(token) {
  drawing ??= unlock('math')
  return html`<app-latex dir="auto" source=${token.text} ?open=${open(token)}></app-latex>`
}

/** Widgets (D196): a block of a kind the room's skills declare, which the skills capability keeps, drawn by its capability. */
export const declared = signal(/** @type {ReadonlySet<string>} */ (new Set()))
/** How each kind is drawn, which its capability says once it has loaded: until then, its code. */
export const drawn = signal(/** @type {Record<string, (source: string, open: boolean) => unknown>} */ ({}))
const WIDGETS = /** @type {Record<string, string>} */ ({ echarts: 'charts', abc: 'scores', marp: 'slides' })

/** @param {any} token */
function widget(token) {
  const kind = String(token.lang).toLowerCase()
  if (!declared.value.has(kind)) return null
  if (Object.hasOwn(WIDGETS, kind)) unlock(WIDGETS[kind])
  return drawn.value[kind]?.(token.text, open(token)) ?? null
}

// marked doesn't wait for a closing fence: until it is written, the block is still being written. An
// answer that ended without one (a brain may leave it out) is as whole as it will be.
const CLOSED = /^ {0,3}(`{3,}(?!`)|~{3,}(?!~))[^\n]*\n(?:[\s\S]*\n)? {0,3}\1[`~]* *\n*$/
/** @param {any} token */
const open = (token) => writing && !CLOSED.test(token.raw)
/** A fence whose first line is still being written, kind and all: nothing to show yet. @param {any} token */
const opening = (token) => token.codeBlockStyle !== 'indented' && !token.raw.includes('\n')

/** @param {string} href */
function safeHref(href) {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(href).protocol)
  } catch {
    return false
  }
}

const ENTITIES = /** @type {Record<string, string>} */ ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' })

/** @param {string} text */
function decode(text) {
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity])
}
