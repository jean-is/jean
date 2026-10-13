// A request edited where it is (D312): a double click on its words, once its answer is written, puts
// them in a box in their place. Enter or Send, once the user agrees, goes back to the request as Try
// again does (D188) and asks it in its new words, with the files it shared, and the box goes with the
// words it held; Escape or Close leaves the request as it was. Enter never sends while an IME
// composes. Loaded with the first double click.
import { html } from 'lit-html'
import { Element, define } from './base.js'
import { rewind } from './send.js'
import { editing } from './chat.js'
import { t } from '../core/i18n.js'
import { icons } from './icons.js'
import { styleSheet } from './sheet.js'

await styleSheet(new URL('edit.css', import.meta.url))

class Edit extends Element {
  /** @type {import('../core/events.js').UserTurn | undefined} */
  request

  // Setting its words put the caret after them.
  connectedCallback() {
    super.connectedCallback()
    this.querySelector('textarea')?.focus()
  }

  render() {
    return html`<textarea dir="auto" enterkeyhint="send" required aria-label=${t('composer.label')} .value=${this.request?.text ?? ''} @keydown=${this.#keydown}></textarea>
      <div><button class="icon-button subtle" aria-label=${t('action.close')} @click=${() => { editing.value = '' }}>${icons.close}</button><button class="icon-button subtle" aria-label=${t('action.send')} @click=${this.#send}>${icons.send}</button></div>`
  }

  /** @param {KeyboardEvent} event */
  #keydown = (event) => {
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') editing.value = ''
    if (event.key === 'Enter' && !event.shiftKey) this.#send(event)
  }

  /** @param {Event} event */
  #send = (event) => {
    event.preventDefault()
    const text = this.querySelector('textarea')?.value.trim()
    if (text && this.request && confirm(t('rewind.confirm'))) rewind(this.request.upTo, text)
  }
}

define('app-edit', Edit)
