// The box. Enter sends (never while an IME is composing), steering a task at work (D365); Shift+Enter adds a line, ↑ from an empty box
// brings back what was asked (D187), / and @ at a word's start open a menu of what can be named (D199). At its top, the
// questions waiting in the task on screen, the first asked first, which the box's words answer (caps/ask, D343), after what a
// capability draws there (a task paused between steps, D364). Under it (D123):
// + (files, a folder once Folders is on, a capture of the screen, the room's skills and connections, Visual answers, Web search's switch) and dictation,
// then the modes + turned on, the brain, and one button to go. Below it, once a task has started, a line says the assistant
// is an AI and can make mistakes (EU AI Act, art. 50; D273); before, it links to the privacy policy and terms (D356).
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { live as current } from 'lit-html/directives/live.js'
import { repeat } from 'lit-html/directives/repeat.js'
import { Element, define } from './base.js'
import { app, activeBrain, brainsHere, chipLabel, decisionsHere, effective, send, steer, stop, setPresence, warm, removeAttachment, openFile, notify, assistantName, SHORTCUTS } from './state.js'
import { unlock, isDenied, loaded, slots } from './caps.js'
import { t, locale } from '../core/i18n.js'
import { serviceURL } from '../core/settings.js'
import { requestsOf } from '../core/events.js'
import { icons } from './icons.js'
import { dictation, toggleDictation, live } from './dictation.js'

const LIVE = { preparing: 'dictation.preparing', listening: 'dictation.listening', thinking: 'activity.thinking', speaking: 'live.speaking' }

/** The menu shown beside a row of +, the room's skills or connections (ui/plus.js, D292). @type {import('@preact/signals-core').Signal<{ id: string, view: () => unknown } | null>} */
export const sub = signal(null)
/**
 * A row of + that opens a menu beside it, pointed at or pressed: Skills' and Connections' entries in the add slot (D293).
 * @param {'skills' | 'connections'} id @param {unknown} icon
 */
export const subRow = (id, icon) => html`<button type="button" class="submenu" data-page=${id} aria-expanded=${sub.value?.id === id} @click=${openSub} @pointerenter=${openSub}>
  ${icon}${t(`cap.${id}.name`)}${icons.chevron}</button>`
/** @param {Event} event */
const openSub = (event) => import('./plus.js').then((module) => module.open(event))

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
    // A menu when + adds more than files: what capabilities add there (a folder; on a new task, flow mode, D218; a menu beside it of
    // skills, and of connections, D292), and a capture of the screen.
    const more = [...slots('add'), ...(CAPTURE ? [{ at: 2, draw: () => html`<button type="button" popovertarget="add-menu" popovertargetaction="hide" @click=${captureScreen}>${icons.capture}${t('capture.start')}</button>` }] : [])]
      .sort((a, b) => a.at - b.at).map((entry) => entry.draw(app.current.value)).filter((drawn) => drawn !== nothing)
    const menu = more.length > 0
    const add = t(menu ? 'composer.add' : 'files.attach')
    const asked = decisionsHere().filter((decision) => 'questions' in decision).slice(0, 1)
    const legal = /** @type {const} */ (['privacy', 'terms']).map((name) => [name, serviceURL(name, app.settings.value, app.policy)]).filter(([, url]) => url)
    return html`
      <form class="composer" @submit=${this.#submit} @mousedown=${this.#press} @click=${this.#press}>
        ${slots('box').map((entry) => entry.draw())}
        ${repeat(asked, (decision) => decision.id, (decision) => html`<app-ask .decision=${decision}></app-ask>`)}
        <app-complete></app-complete>
        ${attachments.length ? html`<ul class="attachments" aria-label=${t('files.attached')}>${attachments.map((item) => html`
          <li class="attachment" data-status=${item.status} title=${item.error ?? ''}>
            ${item.preview && item.link ? html`<button type="button" class="attachment-preview" title=${t('files.open')} @click=${() => item.link && openFile(item.link)}>
              <img src=${item.preview} alt=""></button>` : icons.file}<span class="attachment-name" dir="auto">${item.name}</span>
            <span class="attachment-note">${item.status === 'reading' ? t('files.reading')
              : item.status === 'failed' ? item.error ?? t('files.unreadable')
              : item.preview ? t('files.picture') : t('files.pages', { count: item.pages?.length ?? 0 })}</span>
            <button type="button" class="icon-button subtle" aria-label=${t('files.remove', { name: item.name })}
              @click=${() => removeAttachment(item.key)}>${icons.close}</button>
          </li>`)}</ul>` : nothing}
        <label class="visually-hidden" for="prompt">${t('composer.label')}</label>
        <textarea id="prompt" rows="1" dir="auto" enterkeyhint="send" aria-describedby="ai-note"
          placeholder=${status || t(asked.length ? 'inbox.answer' : 'composer.placeholder')}
          .value=${current(app.draft.value)}
          @input=${this.#input} @keydown=${this.#keydown} @paste=${this.#paste}
          @focus=${() => !busy && setPresence('listening')}
          @blur=${() => app.presence.value === 'listening' && setPresence('idle')}></textarea>
        <span class="visually-hidden" role="status">${status}</span>
        <div class="composer-row">
          <div class="composer-tools">
            ${files ? html`<button type="button" class="icon-button add" aria-label=${add}
              popovertarget=${menu ? 'add-menu' : nothing} @click=${menu ? undefined : this.#files}>${icons.plus}</button>` : nothing}
            ${files && menu ? html`<div id="add-menu" class="menu" popover>
              <button type="button" popovertarget="add-menu" popovertargetaction="hide" @click=${this.#files}>${icons.attach}${t('files.attach')}</button>
              ${more}${sub.value?.view()}
            </div>` : nothing}
            ${voice.state === 'unavailable' ? nothing : html`<button type="button"
              class="icon-button ${listening ? 'is-active is-listening' : working ? 'is-active is-working' : ''}" aria-pressed=${listening ? 'true' : 'false'} ?disabled=${working}
              aria-keyshortcuts=${SHORTCUTS.dictation} aria-label=${t(listening ? 'dictation.stop' : 'dictation.start')}
              @click=${toggleDictation}>${icons.mic}</button>`}
            ${slots('modes').map((mode) => mode.draw())}
          </div>
          <app-seal></app-seal>
          <button type="button" class="brain-chip" popovertarget=${brainsHere.value.length ? 'brain-menu' : nothing} @click=${openPicker}>
            ${brain?.api === 'device' && !auto ? icons.lock : icons.spark}<span>${chipLabel.value}</span>${icons.chevron}
          </button>
          ${primary(busy && !app.draft.value.trim(), empty, hands)}
        </div>
        ${files ? html`<input type="file" multiple class="visually-hidden" tabindex="-1" aria-hidden="true" @change=${this.#pick}>` : nothing}
      </form>
      ${app.current.value?.records.length ? html`<p class="ai-note" id="ai-note">${t('composer.ai', { name: assistantName() })}</p>`
        : legal.length ? html`<p class="legal">${legal.map(([name, url], i) => html`${i ? ' · ' : ''}<a href=${`${url}#${locale.value}`} target="_blank">${t(`welcome.${name}`)}</a>`)}</p>` : nothing}`
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
    complete(area)
    if (!CSS.supports('field-sizing', 'content')) {
      area.style.height = 'auto'
      area.style.height = `${area.scrollHeight}px`
    }
    warm()
  }

  /** @param {KeyboardEvent} event */
  #keydown = (event) => {
    if (event.isComposing || event.keyCode === 229 || naming?.keydown(event)) return
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
    if (!files.length && (event.clipboardData?.getData('text').length ?? 0) > LONG_PASTE) import('./discovery.js').then((module) => module.offerOnce('files', true))
    if (!files.length) return
    event.preventDefault()
    attachFiles(files)
  }

  /** A tap anywhere in the box but its buttons and questions is for its words. @param {Event} event */
  #press = (event) => {
    if (/** @type {Element} */ (event.target).closest('textarea, button, app-ask')) return
    if (event.type === 'click') focusComposer()
    else event.preventDefault()
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
    const asked = /** @type {(HTMLElement & { answer: (own: string) => void }) | null} */ (this.querySelector('app-ask'))
    const words = app.draft.value.trim()
    // While questions wait, the box's words answer the one on screen, else steer the task at work (D365); send() waits for a page
    // being turned, which frees the box, before it looks whether it is busy.
    if (asked && words) { asked.answer(app.draft.value); app.draft.value = '' } else if (words && app.busy.value) { app.draft.value = ''; steer(words) } else send(app.draft.value)
  }
}

/**
 * Stop, while the box has no words (D365); send; or, while the box is empty, start and end a live conversation (D123).
 * @param {boolean} busy @param {boolean} empty @param {import('./dictation.js').Live} hands
 */
function primary(busy, empty, hands) {
  const on = hands !== 'off'
  if (busy && !on) return html`<button type="button" class="send is-stop" @click=${stop} aria-keyshortcuts="Escape" aria-label=${t('action.stop')}>${icons.stop}</button>`
  if (empty ? on || loaded.value.has('live') : on && busy) return html`<button type="button" class="send ${on ? 'is-live' : ''}"
    aria-keyshortcuts=${SHORTCUTS.live} aria-label=${t(on ? 'live.stop' : 'live.start')}
    @click=${() => import('../caps/live/live.js').then((module) => module.toggle())}>${on ? icons.close : icons.wave}</button>`
  return html`<button class="send" ?disabled=${empty} aria-label=${t('action.send')}>${icons.send}</button>`
}

const LONG_PASTE = 2000

/** The menu of what / and @ can name (ui/complete.js, D199), loaded once either is typed at a word's start. @type {typeof import('./complete.js') | null} */
let naming = null
/** @param {HTMLTextAreaElement} area */
function complete(area) {
  if (naming) naming.follow(area)
  else if (/(?:^|\s)[/@／＠]\S*$/u.test(area.value.slice(0, area.selectionStart))) import('./complete.js').then((module) => (naming = module).follow(area))
}

/** Whether this browser can share a screen (not phones, where + only adds files). */
const CAPTURE = Boolean(navigator.mediaDevices?.getDisplayMedia)

/** The brain picker, a menu above the chip, or the first brain's dialog (D329). */
async function openPicker() {
  if (!brainsHere.value.length) return (await import('../caps/first/first.js')).open()
  if (!customElements.get('app-picker')) (await import('./picker.js')).openPicker()
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
