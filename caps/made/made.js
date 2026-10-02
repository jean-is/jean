// Things Jean made: an answer copied as rich text (pastes formatted into Word, Outlook
// and Google Docs), or its tables as CSV (opens in Excel). Browser features only; no
// file-format library.
import { html, nothing, render } from 'lit-html'
import { lexer } from 'marked'
import { Element, define } from '../../ui/base.js'
import { register } from '../../ui/caps.js'
import { notify } from '../../ui/state.js'
import { save } from '../../ui/save.js'
import { markdown } from '../../ui/markdown.js'
import { icons } from '../../ui/icons.js'
import { t, locale } from '../../core/i18n.js'

register({ id: 'made' })

class Made extends Element {
  render() {
    const source = /** @type {string} */ (/** @type {any} */ (this).source ?? '')
    if (!source) return nothing
    const tables = tablesIn(source)
    return html`
      <button class="icon-button subtle" aria-label=${t('action.copy')} title=${t('made.copyTitle')} @click=${() => copyRich(source)}>${icons.copy}</button>
      ${tables.map((table, i) => html`<button class="icon-button subtle" title=${t('made.csvTitle')}
        aria-label=${tables.length > 1 ? t('made.csvNumbered', { count: i + 1 }) : t('made.csvTitle')}
        @click=${() => downloadCSV(table, i + 1)}>${icons.table}</button>`)}`
  }
}

// ─── Rich text ───────────────────────────────────────────────────────────────

/** @param {string} source Markdown */
export async function copyRich(source) {
  const holder = document.createElement('div')
  render(markdown(source), holder)
  // lit-html leaves marker comments; the clipboard doesn't need them.
  const walker = document.createTreeWalker(holder, NodeFilter.SHOW_COMMENT)
  /** @type {ChildNode[]} */
  const comments = []
  while (walker.nextNode()) comments.push(/** @type {ChildNode} */ (walker.currentNode))
  for (const comment of comments) comment.remove()
  const rich = new XMLSerializer().serializeToString(holder)
  try {
    if (typeof ClipboardItem === 'function' && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([rich], { type: 'text/html' }),
        'text/plain': new Blob([source], { type: 'text/plain' }),
      })])
    } else await navigator.clipboard.writeText(source)
    notify(t('toast.copied'))
  } catch (error) {
    console.warn('Copy', error)
    notify(t('made.copyFailed'))
  }
}

// ─── Tables ──────────────────────────────────────────────────────────────────

/** @typedef {string[][]} Table rows of cells, the header first */

/** @param {string} source @returns {Table[]} */
export function tablesIn(source) {
  /** @type {Table[]} */
  const tables = []
  /** @param {any[]} tokens */
  const visit = (tokens) => {
    for (const token of tokens) {
      if (token.type === 'table') {
        tables.push([token.header, ...token.rows].map((/** @type {any[]} */ row) => row.map((cell) => inlineText(cell.tokens))))
      } else if (token.tokens && token.type !== 'paragraph') visit(token.tokens)
      else if (token.items) visit(token.items)
    }
  }
  try {
    visit(lexer(source))
  } catch {}
  return tables
}

/** @param {any[] | undefined} tokens @returns {string} */
function inlineText(tokens = []) {
  return tokens.map((token) => {
    if (token.tokens) return inlineText(token.tokens)
    if (token.type === 'br') return ' '
    return decode(token.text ?? token.raw ?? '')
  }).join('')
}

const ENTITIES = /** @type {Record<string, string>} */ ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })
/** @param {string} text */
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity])

/**
 * CSV the way spreadsheets in this locale expect it: `;` where the decimal mark is a
 * comma (as Excel does in French), a BOM so Excel reads UTF-8.
 * @param {Table} table @param {string} lang
 */
export function toCSV(table, lang) {
  const decimal = new Intl.NumberFormat(lang).formatToParts(1.5).find((part) => part.type === 'decimal')?.value
  const separator = decimal === ',' ? ';' : ','
  const quote = (/** @type {string} */ cell) => (/[",;\n\r]/.test(cell) || /^\s|\s$/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)
  return '﻿' + table.map((row) => row.map(quote).join(separator)).join('\r\n') + '\r\n'
}

/** @param {Table} table @param {number} index */
function downloadCSV(table, index) {
  save(new Blob([toCSV(table, locale.value)], { type: 'text/csv;charset=utf-8' }), `${t('made.tableFile', { count: index })}.csv`)
}

define('app-made', Made)
