// The bar over Jean's changes (D505), in a document (caps/documents) and in a table (caps/tables): how many there
// are and which one is in view, the arrows to the one before and after where there are several, Accept all and
// Reject all. One row, at the top of what it is about, at the bottom on a phone (review.css).
import { html, nothing } from 'lit-html'
import { styleSheet } from './sheet.js'
import { icons } from './icons.js'

styleSheet(new URL('review.css', import.meta.url))

/**
 * @param {{ label: string, count: string, at?: string, go?: ((step: 1 | -1) => void) | null, previous: string, next: string,
 *   accept: () => void, reject: () => void, acceptAll: string, rejectAll: string }} bar its words, in the user's language, and what it does
 */
export const reviewBar = (bar) => html`<div class="review" role="region" aria-label=${bar.label}>
  <p><b>${bar.count}</b>${bar.at ? html` <span class="review-at">· ${bar.at}</span>` : nothing}</p>
  ${bar.go ? html`<button type="button" class="icon-button review-previous" aria-label=${bar.previous} @click=${() => bar.go?.(-1)}>${icons.chevron}</button>
    <button type="button" class="icon-button" aria-label=${bar.next} @click=${() => bar.go?.(1)}>${icons.chevron}</button>` : nothing}
  <button type="button" class="button primary" @click=${bar.accept}>${bar.acceptAll}</button>
  <button type="button" class="button" @click=${bar.reject}>${bar.rejectAll}</button>
</div>`
