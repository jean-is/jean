// Tiles (D635): what the drawer drags onto the screen, a task or a pinned creation, a part of it beside the conversation, for someone
// who reads several at once, face to face, as the dock lays its panes out (ui/dock.js). Dropped near the middle of a task's or a
// creation's pane, it takes its place; a quarter from an edge of any part, half of it, a box showing where as it goes; a task dropped
// in the middle of the conversation opens there. A task's or a pinned creation's menu opens it beside the task, without dragging. A
// creation is a pane as anything opened is (ui/preview.js); another task's is a pane of its own here, as the others are, its head
// naming it, dragging it and closing it, that reads it as it is kept, and a click makes it the one the box is for where it is, the one
// before taking its place. The dock keeps them in the address with the other panes (`?split=row(here,col(01J…,documents/01J…))`). Never
// offered: found with a second task or pinned creation in the drawer of a wide window, whose rows it lets drag.
import { html, nothing, svg } from 'lit-html'
import { effect, signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register } from '../../ui/caps.js'
import { app, openConversation, openFile, turnPage } from '../../ui/state.js'
import { asked } from '../../ui/chat.js'
import { markdown } from '../../ui/markdown.js'
import { icon, icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import * as dock from '../../ui/dock.js'
import { loadConversation } from '../../core/conversations.js'
import { filesMade, foldTurns, splitSuggestions } from '../../core/events.js'
import { t } from '../../core/i18n.js'
import { MOST, leaves, put, rename, swap, without } from '../../ui/tree.js'

/** @import { Tree } from '../../ui/tree.js' */

await Promise.all([styleSheet(new URL('../../ui/view.css', import.meta.url)), styleSheet(new URL('split.css', import.meta.url))])

/** What a drag from the drawer carries: a task's id or a creation's place. */
const TYPE = 'text/x-app-tile'
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
const BESIDE = icon(svg`<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M12 4.5v15M15 12h2.5"/>`)
const { layout } = dock

/** Records kept, which another task's pane reads it again after. */
const changed = signal(0)
/** A task's file, by its id. @param {string} id */
const pathOf = (id) => app.conversations.peek().find((item) => item.id === id)?.path

// Each other task a pane of the dock, made as its part comes and let go as it goes; a creation's, ui/preview.js's.
const tasks = /** @type {Map<string, HTMLElement>} */ (new Map())
let made = 0
effect(() => {
  const all = leaves(layout.value), wanted = all.filter((leaf) => ULID.test(leaf))
  if (all.some((leaf) => leaf.includes('/'))) import('../../ui/preview.js')
  for (const [leaf, element] of tasks) if (!wanted.includes(leaf)) tasks.delete(leaf), dock.leave(element)
  for (const leaf of wanted.filter((one) => !tasks.has(one))) {
    const element = Object.assign(document.createElement('app-tile'), { id: `tile-${++made}` })
    element.setAttribute('leaf', leaf)
    tasks.set(leaf, element)
    dock.join(element, leaf)
  }
})
// A task opened that has a pane takes the box there, the one it was for taking its place, gone if it was new.
let was = app.current.peek()?.id
effect(() => {
  const now = app.current.value?.id, before = was, tree = layout.peek()
  was = now
  if (now && now !== before && leaves(tree).includes(now)) layout.value = before ? rename(swap(tree, now, 'here'), now, before) : rename(/** @type {Tree} */ (without(tree, 'here')), now, 'here')
})
// Another project's tasks aren't this one's.
let room = app.project.peek().dir
effect(() => { if (app.project.value.dir !== room) layout.value = leaves(layout.peek()).filter((leaf) => ULID.test(leaf)).reduce((tree, leaf) => without(tree, leaf) ?? 'here', layout.peek()); room = app.project.value.dir })

// ─── Dragged from the drawer ─────────────────────────────────────────────────

/** What is being dragged: `here` for the screen's task, another task by its id, a creation by its place. */
let dragged = ''
document.addEventListener('dragstart', (event) => {
  const leaf = event.target instanceof HTMLElement && event.target.closest('app-inbox [data-tile]')?.getAttribute('data-tile')
  if (!leaf || !event.dataTransfer) return
  dragged = leaf === app.current.peek()?.id ? 'here' : leaf
  event.dataTransfer.setData(TYPE, leaf)
  event.dataTransfer.effectAllowed = 'move'
})
// WebKit drops only where dragenter was taken as well as dragover; the drop is taken before the box, which would write what was dropped.
for (const type of ['dragenter', 'dragover', 'drop']) {
  document.addEventListener(type, (event) => {
    const { clientX, clientY, dataTransfer } = /** @type {DragEvent} */ (event)
    const target = dragged && dataTransfer?.types.includes(TYPE) ? dock.aim(clientX, clientY, dragged, true) : null
    dock.show(type === 'drop' ? null : target)
    if (!target) return
    event.preventDefault()
    if (type === 'drop') event.stopPropagation(), land(target)
  }, true)
}
document.addEventListener('dragleave', (event) => { if (!event.relatedTarget) dock.show(null) })
document.addEventListener('dragend', () => { dragged = ''; dock.show(null) })

/** Dropped: a task in the middle of the conversation opens there, from where it was; anything else goes as the dock lays out what is dropped. @param {NonNullable<ReturnType<typeof dock.aim>>} target */
function land(target) {
  const leaf = dragged, path = pathOf(leaf)
  dragged = ''
  if (target.leaf !== 'here' || target.at !== 'center') return dock.land(leaf, target, true)
  if (path) turnPage(() => { layout.value = without(layout.peek(), leaf) ?? 'here'; return openConversation(path) })
}

/** Opened beside the task from its menu, as if dropped at its end. @param {string} leaf */
const besideHere = (leaf) => { layout.value = put(without(layout.peek(), leaf) ?? 'here', 'here', leaf, 'end') }
/** Whether a menu offers it: on a wide window, another task or a creation, while the screen has room. @param {string} leaf */
const offered = (leaf) => dock.wide.value && leaf !== app.current.value?.id && (leaves(layout.value).length < MOST || leaves(layout.value).includes(leaf))

// ─── Another task's pane ─────────────────────────────────────────────────────

/** A task as it is kept, to read: each request, and each answer's words with the files it was given or made, as a saved copy shows it (ui/reader.js). @param {import('../../core/types.js').Envelope[]} records */
const turns = (records) => html`<ol class="turns">${foldTurns(records).map((turn) => {
  const { text } = splitSuggestions(turn.steps.map((step) => step.text).filter(Boolean).join('\n\n'))
  const files = [...new Map([...(turn.user?.files ?? []), ...filesMade(turn.steps.flatMap((step) => step.tools))].map((link) => [link.uri, link])).values()]
  return html`<li class="turn">
    ${turn.user?.text ? html`<p class="msg msg-user" dir="auto">${asked.value(turn.user.text)}</p>` : nothing}
    ${text ? html`<article class="msg msg-jean"><div class="prose" dir="auto">${markdown(text)}</div></article>` : nothing}
    ${files.length ? html`<ul class="msg-files">${files.map((link) => html`<li><button class="file-chip" @click=${() => openFile({ type: 'resource_link', ...link })}>${icons.file}<span dir="auto">${link.name}</span></button></li>`)}</ul>` : nothing}
  </li>`
})}</ol>`

/** Another task's pane, as the dock's are: its head naming it, a light while it is answered, and Close; its turns under it, read as kept. */
class Tile extends Element {
  #records = signal(/** @type {import('../../core/types.js').Envelope[] | null} */ (null))
  #reading = /** @type {(() => void) | undefined} */ (undefined)
  #timer = 0

  get leaf() { return this.getAttribute('leaf') ?? '' }

  connectedCallback() {
    super.connectedCallback()
    // Read again as it may have changed, after each record kept, at once the first time.
    this.#reading = effect(() => {
      void [app.conversations.value, changed.value]
      clearTimeout(this.#timer)
      this.#timer = setTimeout(() => this.#read(), this.#records.peek() ? 400 : 0)
    })
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.#reading?.(), clearTimeout(this.#timer)
  }

  async #read() {
    const leaf = this.leaf, path = pathOf(leaf), read = path ? await loadConversation(app.fs, path).catch(() => null) : null
    if (this.isConnected) read ? (this.#records.value = read.records) : (layout.value = without(layout.peek(), leaf) ?? 'here')
  }

  /** The task becomes the one the box is for, where it is. */
  #talk = () => { const path = pathOf(this.leaf); if (path) turnPage(() => openConversation(path)) }
  /** A click in its view, not on what does something of its own or ending a selection, does so too. @param {MouseEvent} event */
  #clicked = (event) => { if (getSelection()?.isCollapsed !== false && !/** @type {Element} */ (event.target).closest('a, button, summary, input, select, textarea, [tabindex]:not(.tile)')) this.#talk() }

  render() {
    const leaf = this.leaf, task = app.conversations.value.find((item) => item.id === leaf), records = this.#records.value, name = task?.title || t('conversation.untitled')
    return html`<aside class="pane tile" tabindex="-1" aria-label=${name}>
      <header class="pane-head">
        ${task && app.running.value.includes(task.path) ? html`<span class="ember" role="img" aria-label=${t('activity.working')}></span>` : nothing}
        <h2><button class="tile-name" @click=${this.#talk}><span dir="auto">${name}</span></button></h2>
        <button class="icon-button" aria-label=${t('action.close')} @click=${() => { layout.value = without(layout.peek(), leaf) ?? 'here' }}>${icons.close}</button>
      </header>
      <div class="view" @click=${this.#clicked}>${records ? turns(records) : nothing}</div>
    </aside>`
  }

  updated() { dock.place(this, true) }
}
define('app-tile', Tile)

register({
  id: 'split',
  // Each record kept may change another task's pane.
  hooks: [{ on: 'record', run: (e, next) => { changed.value++; return next(e) } }],
  slots: {
    task: { at: 5, draw: (/** @type {{ id: string }} */ item, /** @type {Function} */ action) => (offered(item.id) ? action(BESIDE, t('action.beside'), () => besideHere(item.id)) : nothing) },
    kept: { at: 0, draw: (/** @type {{ path: string }} */ item, /** @type {Function} */ action) => (offered(item.path) ? action(BESIDE, t('action.beside'), () => besideHere(item.path)) : nothing) },
  },
})
