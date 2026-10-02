// Markdown → lit-html templates, from marked's tokens. No innerHTML anywhere:
// raw HTML in model output is shown as text, and images are never loaded
// (an image URL is a classic way for injected instructions to leak data).
import { html, nothing } from 'lit-html'
import { lexer } from 'marked'

/** @typedef {import('marked').Token} Token */
/** @typedef {Map<number, { name: string, label: string, open: () => void }>} Sources  by the number the brain cites */

/** Sources for the text being rendered: `[n]` becomes a chip when n is one of them. @type {Sources | null} */
let cited = null

/** @param {string} source @param {Sources} [sources] */
export function markdown(source, sources) {
  cited = sources ?? null
  try {
    return blocks(lexer(source))
  } catch {
    return html`<p>${source}</p>`
  } finally {
    cited = null
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
      const source = /** @type {{ name: string, label: string, open: () => void }} */ (sources.get(n))
      return html`<button class="cite" title=${source.name} aria-label=${source.label} @click=${source.open}>${n}</button>`
    })
  })
}

/** @param {Token[]} tokens */
const blocks = (tokens) => tokens.map(block)

/** @param {any} token @returns {unknown} */
function block(token) {
  switch (token.type) {
    case 'heading': return heading(token.depth, inline(token.tokens))
    case 'paragraph': return html`<p>${inline(token.tokens)}</p>`
    case 'code': return html`<pre dir="ltr"><code>${token.text}</code></pre>`
    case 'blockquote': return html`<blockquote>${blocks(token.tokens)}</blockquote>`
    case 'list': return list(token)
    case 'table': return table(token)
    case 'hr': return html`<hr>`
    case 'space': return nothing
    case 'text': return html`<p>${token.tokens ? inline(token.tokens) : cite(decode(token.text))}</p>`
    default: return html`<p>${token.raw}</p>`
  }
}

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
function inline(tokens = []) {
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
      case 'image': return html`<span class="image-alt">[${token.text || token.href}]</span>`
      case 'escape': return token.text
      default: return token.raw
    }
  })
}

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

/** Plain text for reading aloud and copying. @param {string} source */
export function plainText(source) {
  return source
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|~]+/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
