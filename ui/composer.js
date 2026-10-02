// The box. Enter sends (never while an IME is composing), Shift+Enter adds a line.
// Files can be picked, pasted or dropped anywhere on the page, and a screen captured;
// dictation writes into it.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { Element, define } from './base.js'
import { app, activeBrain, chipLabel, effective, send, stop, setPresence, warm, removeAttachment, openFile, notify } from './state.js'
import { unlock, isDenied, loaded } from './caps.js'
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
            ${item.preview && item.link ? html`<button type="button" class="attachment-preview" title=${t('files.open')} @click=${() => item.link && openFile(item.link)}>
              <img src=${item.preview} alt=""></button>` : icons.file}<span class="attachment-name" dir="auto">${item.name}</span>
            <span class="attachment-note">${item.status === 'reading' ? t('files.reading')
              : item.status === 'failed' ? item.error ?? t('files.unreadable')
              : item.preview ? t('files.picture') : t('files.pages', { count: item.pages?.length ?? 0 })}</span>
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
            ${isDenied('files') || !CAPTURE ? nothing : html`<button type="button" class="icon-button"
              aria-label=${t('capture.start')} title=${t('capture.start')} @click=${captureScreen}>${icons.capture}</button>`}
            ${dictation.value.state === 'unavailable' ? nothing : html`<button type="button"
              class="icon-button ${listening ? 'is-active is-listening' : working ? 'is-active is-working' : ''}" aria-pressed=${listening ? 'true' : 'false'} ?disabled=${working}
              aria-label=${t(listening ? 'dictation.stop' : 'dictation.start')} title=${t(listening ? 'dictation.stop' : 'dictation.start')}
              @click=${toggleDictation}>${icons.mic}</button>`}
            ${loaded.value.has('live') ? html`<app-live></app-live>` : nothing}
            <button type="button" class="brain-chip" aria-haspopup="dialog" @click=${openPicker}>
              ${brain?.api === 'device' && !effective.value.settings.auto ? icons.chip : icons.spark}<span>${chipLabel.value}</span>${icons.chevron}
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
    // A long paste is a document in disguise: offer files (an event, so any language works).
    if (!files.length && (event.clipboardData?.getData('text').length ?? 0) > LONG_PASTE) import('./discovery.js').then((module) => module.offerOnce('files'))
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

const LONG_PASTE = 2000
/** Whether this browser can share a screen (not phones). */
const CAPTURE = Boolean(navigator.mediaDevices?.getDisplayMedia)

/** The brain picker, or choosing a first brain. */
async function openPicker() {
  if (!effective.value.settings.brains.length) return void (app.dialog.value = 'brain')
  await import('./picker.js')
  app.dialog.value = 'picker'
}

/**
 * A picture of a screen, window or tab the user picks, for the next message. The browser asks
 * at once (it wants the click), and what makes the picture loads meanwhile.
 */
async function captureScreen() {
  const controller = 'CaptureController' in globalThis ? new (/** @type {any} */ (globalThis).CaptureController)() : undefined
  // Stay in Jean once something is picked: Chrome would bring it to the front.
  try { controller?.setFocusBehavior?.('no-focus-change') } catch {}
  const asked = navigator.mediaDevices.getDisplayMedia(/** @type {DisplayMediaStreamOptions} */ ({ video: true, audio: false, selfBrowserSurface: 'exclude', controller }))
  const pictures = unlock('files').then((ok) => (ok ? import('../caps/files/pictures.js') : null))
  try {
    const stream = await asked
    const module = await pictures
    if (module) attachFiles([await module.screenshot(stream)])
    else for (const track of stream.getTracks()) track.stop()
  } catch (error) {
    // Closing the browser's picker isn't a failure.
    if (/** @type {any} */ (error)?.name !== 'NotAllowedError') notify(t('capture.failed'))
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
