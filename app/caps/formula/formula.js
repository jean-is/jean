// SPDX-License-Identifier: MIT
// A Formula's dialog, over the page (caps/tables/view.js fetches this folder as one is first opened): its column's name, then its formula's words, which
// take the keyboard, the caret at their end, and what a formula is written with. Save keeps the formula once it can be read, the dialog then closing;
// one that can't be read is said, the dialog staying; Escape or Close leave it as it was. Tables' words come from the view, whose strings they are.
import { html, nothing } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { t } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { reshapeTable, reread } from '../tables/tables.js'
import { compile } from '../tables/formula.js'

await import('../../ui/dialogs.js')

/** @import { Property } from '../tables/table.js' */
/** @import { Loaded } from '../tables/tables.js' */

/** Shown once it is on the page, as it is first drawn, its words taking the keyboard, the caret at their end. */
const shown = ref((dialog) => queueMicrotask(() => {
  if (!(dialog instanceof HTMLDialogElement) || !dialog.isConnected || dialog.open) return
  dialog.showModal()
  const words = dialog.querySelector('textarea')
  words?.focus()
  words?.setSelectionRange(words.value.length, words.value.length)
}))

/** @param {{ one: Loaded, columns: Property[], property: Property, state: import('../tables/view.js').State, parts: typeof import('../tables/view.js').parts, words: { yours: string, hint: string, wrong: string, save: string } }} given */
export default function formula({ one, columns, property, state, parts, words }) {
  /** @param {SubmitEvent} event */
  const save = (event) => {
    const text = /** @type {HTMLFormElement} */ (event.target).querySelector('textarea')?.value.trim() ?? ''
    try { if (text) compile(text, columns) } catch { event.preventDefault(); state.wrong.value = true; return }
    if (text !== (property.formula ?? '')) reshapeTable(one, { formula: { id: property.id, text } }).catch(() => reread(one))
  }
  return html`<dialog class="sheet table-formula" aria-label=${property.name} ${shown} @close=${() => { state.formula.value = '' }} @keydown=${(/** @type {KeyboardEvent} */ e) => e.key === 'Escape' && e.stopPropagation()}>
    <form method="dialog" @submit=${save}>
      <header class="dialog-head"><h2 dir="auto">${parts.glyphs.formula}${property.name}</h2><button type="button" class="icon-button" aria-label=${t('action.close')} @click=${(/** @type {Event} */ e) => /** @type {Element} */ (e.currentTarget).closest('dialog')?.close()}>${icons.close}</button></header>
      <textarea dir="auto" rows="4" spellcheck="false" title=${property.name} placeholder=${words.yours} .value=${property.formula ?? ''} @input=${() => { state.wrong.value = false }}></textarea>
      <p class="muted small">${words.hint}</p>${state.wrong.value ? html`<p class="table-formula-wrong" role="alert">${words.wrong}</p>` : nothing}
      <footer class="dialog-foot"><button class="button primary">${words.save}</button></footer>
    </form></dialog>`
}
