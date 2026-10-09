// Layouts (D215): what an answer's Markdown shows it to be, laid out as that, from its structure alone
// (./shapes.js): a comparison as its options side by side, steps one after the other, notes set apart,
// a column of amounts at the end. Loaded with the first answer, never offered; until then, and for the
// others, ui/markdown.js shows them as they are. The same Markdown copies as it was.
import { html, nothing } from 'lit-html'
import { shapes, blocks, inline, lex } from '../../ui/markdown.js'
import { styleSheet } from '../../ui/sheet.js'
import { t, useStrings } from '../../core/i18n.js'
import { aligned, compared, marked, roomy, stepped, titled, sequenced, noted } from './shapes.js'

await Promise.all([useStrings('layouts'), styleSheet(new URL('layouts.css', import.meta.url))])

/** Options as cards, the best of each row lit, the one recommended framed under its badge; any other table as it is, its amounts at the end. @param {any} token */
function table(token) {
  const shape = compared(token)
  if (!shape) {
    const align = aligned(token).map((side) => side && `align-${side}`)
    return html`<div class="table" tabindex="0"><table>
      <thead><tr>${token.header.map((/** @type {any} */ cell, /** @type {number} */ i) => html`<th class=${align[i]}>${inline(cell.tokens)}</th>`)}</tr></thead>
      <tbody>${token.rows.map((/** @type {any[]} */ row) => html`<tr>${row.map((cell, i) => html`<td class=${align[i]}>${inline(cell.tokens)}</td>`)}</tr>`)}</tbody>
    </table></div>`
  }
  // The criteria, often in bold, are no option's best.
  /** @param {any} cell @param {number} i @param {boolean} [head] */
  const classes = (cell, i, head) => [token.align[i] && `align-${token.align[i]}`, i === shape.pick && 'is-pick', !head && i > 0 && marked(cell)].filter(Boolean).join(' ')
  return html`<div class="table is-compare ${roomy(token) ? 'is-roomy' : ''}" tabindex="0"><table>
    <thead><tr>${token.header.map((/** @type {any} */ cell, /** @type {number} */ i) => html`<th class=${classes(cell, i, true)} data-pick=${i === shape.pick ? t('layouts.recommended') : nothing}>${inline(cell.tokens)}</th>`)}</tr></thead>
    <tbody>${token.rows.map((/** @type {any[]} */ row) => html`<tr>${row.map((cell, i) => html`<td class=${classes(cell, i)}>${inline(cell.tokens)}</td>`)}</tr>`)}</tbody>
  </table></div>`
}

/** Steps, each number in a ring, a title on a line of its own. @param {any} token */
const list = (token) => stepped(token) ? html`<ol class="steps" start=${token.start || 1}>${token.items.map(step)}</ol>` : null

/** @param {any} item */
function step(item) {
  const [first, ...rest] = item.tokens
  const title = titled(first.tokens)
  const lead = title ? html`${inline(first.tokens.slice(0, 1))}<span class="end">${title.end}</span>${inline(title.rest)}` : inline(first.tokens)
  return html`<li>${first.type === 'paragraph' ? html`<p>${lead}</p>` : lead}${rest.map((/** @type {any} */ token) => (token.type === 'text' ? inline(token.tokens ?? [token]) : blocks([token])))}</li>`
}

/** A note, in its kind's colour, titled with the kind's name or its own words. @param {any} token */
function blockquote(token) {
  const note = noted(token)
  if (!note) return null
  return html`<blockquote class="callout is-${note.kind}">${note.text === undefined ? blocks(token.tokens)
    : html`<p class="callout-title">${note.title ? inline(/** @type {any} */ (lex(note.title)[0])?.tokens) : t(`layouts.${note.kind}`)}</p>${blocks(lex(note.text))}`}</blockquote>`
}

shapes.value = { table, list, blockquote, blocks: sequenced }
