// The box. Enter sends (never while an IME is composing), Shift+Enter adds a line.
import { html } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { Element, define } from './base.js'
import { app, activeBrain, brainLabel, send, stop, setPresence } from './state.js'
import { t } from '../core/i18n.js'
import { icons } from './icons.js'

class Composer extends Element {
  render() {
    const busy = app.busy.value
    const brain = activeBrain.value
    const empty = !app.draft.value.trim()
    return html`
      <form class="composer" @submit=${this.#submit}>
        <label class="visually-hidden" for="prompt">${t('composer.label')}</label>
        <textarea id="prompt" rows="1" dir="auto" enterkeyhint="send"
          placeholder=${t('composer.placeholder')}
          .value=${live(app.draft.value)}
          @input=${this.#input} @keydown=${this.#keydown}
          @focus=${() => !busy && setPresence('listening')}
          @blur=${() => app.presence.value === 'listening' && setPresence('idle')}></textarea>
        <div class="composer-row">
          <button type="button" class="brain-chip" @click=${() => { app.dialog.value = 'brain' }}>
            ${icons.spark}<span>${brain ? brainLabel(brain) : t('brain.choose')}</span>
          </button>
          ${busy
            ? html`<button type="button" class="send is-stop" @click=${stop} aria-label=${t('action.stop')} title=${t('action.stop')}>${icons.stop}</button>`
            : html`<button class="send" ?disabled=${empty} aria-label=${t('action.send')} title=${t('action.send')}>${icons.send}</button>`}
        </div>
      </form>`
  }

  /** @param {Event} event */
  #input = (event) => {
    const area = /** @type {HTMLTextAreaElement} */ (event.target)
    app.draft.value = area.value
    if (!CSS.supports('field-sizing', 'content')) {
      area.style.height = 'auto'
      area.style.height = `${area.scrollHeight}px`
    }
  }

  /** @param {KeyboardEvent} event */
  #keydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault()
      this.#submit(event)
    }
  }

  /** @param {Event} event */
  #submit = (event) => {
    event.preventDefault()
    if (!app.busy.value) send(app.draft.value)
  }
}

export function focusComposer() {
  /** @type {HTMLTextAreaElement | null} */ (document.getElementById('prompt'))?.focus()
}

define('app-composer', Composer)
