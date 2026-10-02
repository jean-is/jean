// The box. Enter sends (never while an IME is composing), Shift+Enter adds a line.
// Files can be picked, pasted or dropped anywhere on the page; dictation writes into it.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { Element, define } from './base.js'
import { app, activeBrain, brainLabel, send, stop, setPresence, warm, removeAttachment } from './state.js'
import { unlock, isDenied } from './caps.js'
import { t } from '../core/i18n.js'
import { icons } from './icons.js'
import { dictation, toggleDictation } from './dictation.js'

class Composer extends Element {
  render() {
    const busy = app.busy.value
    const brain = activeBrain.value
    const attachments = app.attachments.value
    const empty = !app.draft.value.trim() && !attachments.some((item) => item.status === 'ready')
    const voice = dictation.value
    const listening = voice.state === 'listening'
    const working = voice.state === 'preparing' || voice.state === 'transcribing'
    const downloading = voice.progress !== undefined && voice.progress < 1
    const placeholder = listening ? t('dictation.listening')
      : working ? (downloading ? t('dictation.downloading', { percent: Math.round((voice.progress ?? 0) * 100) }) : t(`dictation.${voice.state}`))
      : t('composer.placeholder')
    return html`
      <form class="composer" @submit=${this.#submit}>
        ${attachments.length ? html`<ul class="attachments" aria-label=${t('files.attached')}>${attachments.map((item) => html`
          <li class="attachment" data-status=${item.status} title=${item.error ?? ''}>
            ${icons.file}<span class="attachment-name" dir="auto">${item.name}</span>
            <span class="attachment-note">${item.status === 'reading' ? t('files.reading')
              : item.status === 'failed' ? item.error ?? t('files.unreadable')
              : t('files.pages', { count: item.pages?.length ?? 0 })}</span>
            <button type="button" class="icon-button subtle" aria-label=${t('files.remove', { name: item.name })} title=${t('action.remove')}
              @click=${() => removeAttachment(item.key)}>${icons.close}</button>
          </li>`)}</ul>` : nothing}
        <label class="visually-hidden" for="prompt">${t('composer.label')}</label>
        <textarea id="prompt" rows="1" dir="auto" enterkeyhint="send"
          placeholder=${placeholder}
          .value=${live(app.draft.value)}
          @input=${this.#input} @keydown=${this.#keydown} @paste=${this.#paste}
          @focus=${() => !busy && setPresence('listening')}
          @blur=${() => app.presence.value === 'listening' && setPresence('idle')}></textarea>
        <div class="composer-row">
          <div class="composer-tools">
            ${isDenied('files') ? nothing : html`<label class="icon-button" title=${t('files.attach')}>
              ${icons.attach}<span class="visually-hidden">${t('files.attach')}</span>
              <input type="file" multiple class="visually-hidden" aria-label=${t('files.attach')} @change=${this.#pick}>
            </label>`}
            ${dictation.value.state === 'unavailable' ? nothing : html`<button type="button"
              class="icon-button ${listening ? 'is-active is-listening' : working ? 'is-active is-working' : ''}" aria-pressed=${listening ? 'true' : 'false'} ?disabled=${working}
              aria-label=${t(listening ? 'dictation.stop' : 'dictation.start')} title=${t(listening ? 'dictation.stop' : 'dictation.start')}
              @click=${toggleDictation}>${icons.mic}</button>`}
            <button type="button" class="brain-chip" @click=${() => { app.dialog.value = 'brain' }}>
              ${brain?.api === 'device' ? icons.chip : icons.spark}<span>${brain ? brainLabel(brain) : t('brain.choose')}</span>
            </button>
          </div>
          ${busy
            ? html`<button type="button" class="send is-stop" @click=${stop} aria-label=${t('action.stop')} title=${t('action.stop')}>${icons.stop}</button>`
            : html`<button class="send" ?disabled=${empty} aria-label=${t('action.send')} title=${t('action.send')}>${icons.send}</button>`}
        </div>
      </form>`
  }

  connectedCallback() {
    super.connectedCallback()
    addEventListener('dragover', onDragOver)
    addEventListener('dragleave', onDragLeave)
    addEventListener('drop', onDrop)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    removeEventListener('dragover', onDragOver)
    removeEventListener('dragleave', onDragLeave)
    removeEventListener('drop', onDrop)
  }

  /** @param {Event} event */
  #input = (event) => {
    const area = /** @type {HTMLTextAreaElement} */ (event.target)
    app.draft.value = area.value
    if (!CSS.supports('field-sizing', 'content')) {
      area.style.height = 'auto'
      area.style.height = `${area.scrollHeight}px`
    }
    warm()
  }

  /** @param {KeyboardEvent} event */
  #keydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault()
      this.#submit(event)
    }
  }

  /** @param {ClipboardEvent} event */
  #paste = (event) => {
    const files = [...(event.clipboardData?.files ?? [])]
    if (!files.length) return
    event.preventDefault()
    attachFiles(files)
  }

  /** @param {Event} event */
  #pick = (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target)
    attachFiles([...(input.files ?? [])])
    input.value = ''
  }

  /** @param {Event} event */
  #submit = (event) => {
    event.preventDefault()
    if (!app.busy.value) send(app.draft.value)
  }
}

/** @param {File[]} files */
export async function attachFiles(files) {
  if (!files.length || !(await unlock('files'))) return
  const { addFiles } = await import('../caps/files/files.js')
  await addFiles(files)
  focusComposer()
}

/** @param {DragEvent} event */
const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files')

/** @param {DragEvent} event */
function onDragOver(event) {
  if (!hasFiles(event) || isDenied('files')) return
  event.preventDefault()
  document.documentElement.dataset.dropping = 'true'
}

/** @param {DragEvent} event */
function onDragLeave(event) {
  if (!event.relatedTarget) delete document.documentElement.dataset.dropping
}

/** @param {DragEvent} event */
function onDrop(event) {
  delete document.documentElement.dataset.dropping
  if (!hasFiles(event)) return
  event.preventDefault()
  attachFiles([...(event.dataTransfer?.files ?? [])])
}

export function focusComposer() {
  /** @type {HTMLTextAreaElement | null} */ (document.getElementById('prompt'))?.focus()
}

define('app-composer', Composer)
