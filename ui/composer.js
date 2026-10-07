// The box. Enter sends (never while an IME is composing), Shift+Enter adds a line, ↑ from an empty box
// brings back what was asked (D187). Under it (D123):
// + (files, a folder once Folders is on, a capture of the screen) and dictation; then the brain, and one button to go.
import { html, nothing } from 'lit-html'
import { live as current } from 'lit-html/directives/live.js'
import { Element, define } from './base.js'
import { app, activeBrain, chipLabel, effective, send, stop, setPresence, warm, removeAttachment, openFile, notify } from './state.js'
import { unlock, isDenied, loaded } from './caps.js'
import { t } from '../core/i18n.js'
import { requestsOf } from '../core/events.js'
import { icons } from './icons.js'
import { dictation, toggleDictation, live } from './dictation.js'

const LIVE = { preparing: 'dictation.preparing', listening: 'dictation.listening', thinking: 'activity.thinking', speaking: 'live.speaking' }

class Composer extends Element {
  render() {
    const busy = app.busy.value
    const brain = activeBrain.value
    const { auto } = effective.value.settings
    const attachments = app.attachments.value
    const empty = !app.draft.value.trim() && !attachments.some((item) => item.status === 'ready')
    const voice = dictation.value
    const listening = voice.state === 'listening'
    const working = voice.state === 'preparing' || voice.state === 'transcribing'
    const downloading = voice.progress !== undefined && voice.progress < 1
    const hands = live.value
    // What the voice is doing is said in the box, not beside it.
    const status = hands !== 'off' ? t(LIVE[hands])
      : listening ? t('dictation.listening')
      : working ? (downloading ? t('dictation.downloading', { percent: Math.round((voice.progress ?? 0) * 100) }) : t(`dictation.${voice.state}`))
      : ''
    const files = !isDenied('files')
    // A menu when + adds more than files.
    const folders = loaded.value.has('folders')
    const menu = CAPTURE || folders
    const add = t(menu ? 'composer.add' : 'files.attach')
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
          placeholder=${status || t('composer.placeholder')}
          .value=${current(app.draft.value)}
          @input=${this.#input} @keydown=${this.#keydown} @paste=${this.#paste}
          @focus=${() => !busy && setPresence('listening')}
          @blur=${() => app.presence.value === 'listening' && setPresence('idle')}></textarea>
        <span class="visually-hidden" role="status">${status}</span>
        <div class="composer-row">
          <div class="composer-tools">
            ${files ? html`<button type="button" class="icon-button add" aria-label=${add} title=${add}
              popovertarget=${menu ? 'add-menu' : nothing} @click=${menu ? undefined : this.#files}>${icons.plus}</button>` : nothing}
            ${files && menu ? html`<div id="add-menu" class="menu" popover>
              <button type="button" popovertarget="add-menu" popovertargetaction="hide" @click=${this.#files}>${icons.attach}${t('files.attach')}</button>
              ${folders ? html`<button type="button" popovertarget="add-menu" popovertargetaction="hide"
                @click=${() => import('../caps/folders/folders.js').then((module) => module.choose())}>${icons.folder}${t('composer.folder')}</button>` : nothing}
              ${CAPTURE ? html`<button type="button" popovertarget="add-menu" popovertargetaction="hide" @click=${captureScreen}>${icons.capture}${t('capture.start')}</button>` : nothing}
            </div>` : nothing}
            ${voice.state === 'unavailable' ? nothing : html`<button type="button"
              class="icon-button ${listening ? 'is-active is-listening' : working ? 'is-active is-working' : ''}" aria-pressed=${listening ? 'true' : 'false'} ?disabled=${working}
              aria-label=${t(listening ? 'dictation.stop' : 'dictation.start')} title=${t(listening ? 'dictation.stop' : 'dictation.start')}
              @click=${toggleDictation}>${icons.mic}</button>`}
          </div>
          <button type="button" class="brain-chip" aria-haspopup="dialog" @click=${openPicker}>
            ${brain?.api === 'device' && !auto ? icons.chip : icons.spark}<span>${chipLabel.value}</span>${icons.chevron}
          </button>
          ${primary(busy, empty, hands)}
        </div>
        ${files ? html`<input type="file" multiple class="visually-hidden" tabindex="-1" aria-hidden="true" @change=${this.#pick}>` : nothing}
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
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      this.#submit(event)
    } else if (/^Arrow(Up|Down)$/.test(event.key) && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) this.#recall(event)
  }

  /** The request ↑ brought back, counted from the newest (0); -1 when none. */
  #back = -1

  /**
   * From an empty box, ↑ and ↓ go through what was asked in this conversation, newest first, as in
   * a terminal, until the request brought back is changed; in one of several lines, through its lines first (D187).
   * @param {KeyboardEvent} event
   */
  #recall = (event) => {
    const area = /** @type {HTMLTextAreaElement} */ (event.target)
    const asked = requestsOf(app.current.value?.records ?? []).reverse()
    const up = event.key === 'ArrowUp'
    const at = !area.value ? -1 : area.value === asked[this.#back] ? this.#back : NaN
    const next = at + (up ? 1 : -1)
    const edge = !(up ? area.value.slice(0, area.selectionStart) : area.value.slice(area.selectionEnd)).includes('\n')
    if (!edge || !(next >= -1 && next < asked.length)) return
    event.preventDefault()
    this.#back = next
    app.draft.value = asked[next] ?? ''
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

  #files = () => /** @type {HTMLInputElement | null} */ (this.querySelector('input[type="file"]'))?.click()

  /** @param {Event} event */
  #pick = (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target)
    attachFiles([...(input.files ?? [])])
    input.value = ''
  }

  /** @param {Event} event */
  #submit = (event) => {
    event.preventDefault()
    // send() waits for a page being turned, which frees the box, before it looks whether it is busy.
    send(app.draft.value)
  }
}

/**
 * Stop, send, or, while the box is empty, start and end a live conversation (D123).
 * @param {boolean} busy @param {boolean} empty @param {import('./dictation.js').Live} hands
 */
function primary(busy, empty, hands) {
  const on = hands !== 'off'
  if (busy && !on) return html`<button type="button" class="send is-stop" @click=${stop} aria-label=${t('action.stop')} title=${t('action.stop')}>${icons.stop}</button>`
  if (empty ? on || loaded.value.has('live') : on && busy) return html`<button type="button" class="send ${on ? 'is-live' : ''}"
    aria-label=${t(on ? 'live.stop' : 'live.start')} title=${t(on ? 'live.stop' : 'live.start')}
    @click=${() => import('../caps/live/live.js').then((module) => module.toggle())}>${on ? icons.close : icons.wave}</button>`
  return html`<button class="send" ?disabled=${empty} aria-label=${t('action.send')} title=${t('action.send')}>${icons.send}</button>`
}

const LONG_PASTE = 2000
/** Whether this browser can share a screen (not phones, where + only adds files). */
const CAPTURE = Boolean(navigator.mediaDevices?.getDisplayMedia)

/** The brain picker, or choosing a first brain. */
async function openPicker() {
  if (!effective.value.settings.brains.length) return (await import('./dialogs.js')).openSettings('brains')
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
  /** @type {File[]} */
  const files = []
  /** @type {{ entry: FileSystemDirectoryEntry, handle?: Promise<FileSystemHandle | null> }[]} */
  const folders = []
  // A folder is worked on where it is (D141). What the drop holds can only be asked for during it.
  for (const item of event.dataTransfer?.items ?? []) {
    const entry = item.kind === 'file' ? item.webkitGetAsEntry?.() : null
    if (entry?.isDirectory) folders.push({ entry: /** @type {FileSystemDirectoryEntry} */ (entry), handle: /** @type {any} */ (item).getAsFileSystemHandle?.() })
    else if (item.kind === 'file') files.push(...[item.getAsFile()].filter((file) => file !== null))
  }
  if (folders.length) unlock('folders').then(async (ok) => { if (ok) (await import('../caps/folders/folders.js')).dropped(folders[0]) })
  attachFiles(files)
}

export function focusComposer() {
  /** @type {HTMLTextAreaElement | null} */ (document.getElementById('prompt'))?.focus()
}

define('app-composer', Composer)
