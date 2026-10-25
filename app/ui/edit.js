// A request edited where it is (D312): a double click on its words, or Enter on them, once its answer
// is written, puts them in a box in their place. Enter or Send, once the user agrees, goes back to the
// request as Try again does (D188) and asks it in its new words, with the files it shared, and the box
// goes with the words it held, the keyboard going to the message box as after any request; Escape or
// Close leaves the request as it was, the keyboard back on it, as after renaming a task. Enter never
// sends while an IME composes. What it names is a chip there, as in the message box (ui/marks.js, D610). Loaded with the first double click or Enter.
import { html } from 'lit-html'
import { Element, define } from './base.js'
import { rewind } from './send.js'
import { editing } from './chat.js'
import { focusComposer, plain } from './composer.js'
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
    const box = this.querySelector('textarea')
    box?.focus()
    if (box) import('./marks.js').then((module) => module.attach(box))
    this.addEventListener('mousedown', this.#press)
    this.addEventListener('click', this.#press)
  }

  /** A press anywhere in the bubble but its buttons is for its words, the caret by the nearest of them. @param {MouseEvent} event */
  #press = (event) => {
    const box = this.querySelector('textarea')
    if (!box || /** @type {Element} */ (event.target).closest('textarea, button')) return
    if (event.type === 'mousedown') return event.preventDefault()
    const { left, top, right, bottom } = box.getBoundingClientRect()
    const at = document.caretPositionFromPoint?.(Math.min(Math.max(event.clientX, left + 1), right - 1), Math.min(Math.max(event.clientY, top + 1), bottom - 1))
    box.focus()
    if (at?.offsetNode === box) box.setSelectionRange(at.offset, at.offset)
  }

  render() {
    return html`<textarea dir="auto" enterkeyhint="send" required aria-label=${t('composer.label')} .value=${this.request?.text ?? ''} @keydown=${this.#keydown}></textarea>
      <div><button class="icon-button subtle" aria-label=${t('action.close')} @click=${this.#close}>${icons.close}</button><button class="icon-button subtle" aria-label=${t('action.send')} @click=${this.#send}>${icons.send}</button></div>`
  }

  /** @param {KeyboardEvent} event */
  #keydown = (event) => {
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') this.#close()
    if (event.key === 'Enter' && !event.shiftKey) this.#send(event)
  }

  /** @param {Event} event */
  #send = (event) => {
    event.preventDefault()
    const text = plain.of(this.querySelector('textarea')?.value ?? '').trim()
    if (!text || !this.request || !confirm(t('rewind.confirm'))) return
    focusComposer()
    rewind(this.request.upTo, text)
  }

  #close = () => {
    const turn = this.closest('.turn')
    editing.value = ''
    const request = /** @type {HTMLElement | null | undefined} */ (turn?.querySelector('p.msg-user'))
    request?.focus({ preventScroll: true })
  }
}

define('app-edit', Edit)
