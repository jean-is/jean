// <app-camera> (D645): the camera's picture. On a touch screen it is a viewfinder over the room, a modal <dialog> the rest of
// the page can't be reached behind: what the user says and the end of what Jean answers as captions at its foot, on a dark
// panel whatever the picture, and its buttons where a thumb reaches. Elsewhere, and once Task or Escape shrinks it, the same
// dialog shown without a backdrop is a tile at a corner of the window, dragged or moved by its button to another; a tap on
// its picture makes it the viewfinder again. Its state, and that a camera is on, always show in words.
import { html, nothing, svg } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { app } from '../../ui/state.js'
import { isDenied, unlock } from '../../ui/caps.js'
import { live } from '../../ui/dictation.js'
import { icon, icons } from '../../ui/icons.js'
import { icons as menu } from '../../ui/menu-icons.js'
import { plainText } from '../../ui/spoken.js'
import { foldTurns, splitSuggestions } from '../../core/events.js'
import { t, locale } from '../../core/i18n.js'
import { state, full, can, light, mirrored, kept, watching, video, open, close, turn, toggleLight, closely, drop, toggleWatching } from './camera.js'

const glyphs = {
  turn: icon(svg`<path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15M4.5 19.5V15H9"/>`),
  eye: icon(svg`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>`),
  move: icon(svg`<path d="M12 3.5v17M3.5 12h17M9.5 6 12 3.5 14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5 3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5"/>`),
}
/** The tile's corners, in the order its Move button goes round them. */
const CORNERS = ['top-end', 'bottom-end', 'bottom-start', 'top-start']
const corner = signal(CORNERS[0])
/** Characters of Jean's answer the captions show, its last sentences. */
const CAPTION = 180

/** @param {unknown} glyph @param {string} key @param {() => unknown} run @param {boolean} [pressed] */
const button = (glyph, key, run, pressed) => html`<button type="button" class="icon-button" aria-label=${t(key)}
  aria-pressed=${pressed === undefined ? nothing : String(pressed)} @click=${run}>${glyph}</button>`

/** Talking hands-free, on or off, from the camera. */
const talk = async () => { if (await unlock('live')) (await import('../live/live.js')).toggle() }

/** The end of what Jean says: the answer being written, else the last one, as it is read aloud. */
function answer() {
  const turn = app.live.value?.turn ?? foldTurns(app.current.value?.records ?? []).at(-1)
  const text = plainText(splitSuggestions((turn?.steps ?? []).map((step) => step.text).filter(Boolean).join('\n\n')).text).trim()
  const sentences = [...new Intl.Segmenter(locale.value, { granularity: 'sentence' }).segment(text)].map((part) => part.segment)
  let end = ''
  while (sentences.length && end.length + (sentences.at(-1)?.length ?? 0) <= CAPTION) end = sentences.pop() + end
  return end.trim() || (text && `…${text.slice(-CAPTION)}`)
}

class Camera extends Element {
  /** @type {{ x: number, y: number } | null} */
  #from = null

  render() {
    const now = state.value
    if (now === 'off') return nothing
    const watched = watching.value
    const picture = kept.value
    const hands = live.value
    const said = app.draft.value.trim()
    const saying = full.value ? answer() : ''
    return html`<dialog class="camera ${full.value ? 'is-full' : 'is-tile'}" data-corner=${corner.value} aria-label=${t('cap.camera.name')}
      @cancel=${(/** @type {Event} */ event) => { event.preventDefault(); full.value = false }}>
      <div class="camera-view" @pointerdown=${this.#down} @pointermove=${this.#move} @pointerup=${this.#up} @pointercancel=${this.#up}>
        ${video}
        ${now === 'paused' ? html`<button type="button" class="camera-paused" @click=${open}>${t('camera.paused')}</button>` : nothing}
      </div>
      <p class="camera-state" role="status">${watched ? glyphs.eye : html`<span class="camera-dot"></span>`}<span>${t(watched ? 'camera.watching' : 'cap.camera.name')}</span></p>
      ${full.value ? html`
        <div class="camera-top">
          ${can.value.turn ? button(glyphs.turn, 'camera.turn', turn) : nothing}
          ${can.value.light ? button(menu.bolt, 'camera.light', toggleLight, light.value) : nothing}
          ${button(icons.close, 'camera.close', close)}
        </div>
        <div class="camera-foot">
          ${said || saying ? html`<div class="camera-captions">
            ${said ? html`<p class="camera-said" dir="auto">${said}</p>` : nothing}
            ${saying ? html`<p dir="auto">${saying}</p>` : nothing}
          </div>` : nothing}
          <div class="camera-buttons">
            ${button(menu.task, 'camera.task', () => { full.value = false })}
            <button type="button" class="camera-shutter" aria-label=${t('camera.closely')} @click=${closely}></button>
            ${button(glyphs.eye, 'camera.watch', toggleWatching, Boolean(watched))}
            ${isDenied('live') ? nothing : button(hands === 'off' ? icons.mic : icons.voice, hands === 'off' ? 'live.start' : 'live.stop', talk, hands !== 'off')}
          </div>
        </div>` : html`
        <div class="camera-buttons">
          ${button(icons.capture, 'camera.closely', closely)}
          ${button(glyphs.eye, 'camera.watch', toggleWatching, Boolean(watched))}
          ${button(glyphs.move, 'camera.move', () => { corner.value = CORNERS[(CORNERS.indexOf(corner.peek()) + 1) % CORNERS.length] })}
          ${button(icons.close, 'camera.close', close)}
        </div>`}
      ${picture ? html`<figure class="camera-kept"><img src=${picture.url} alt=${t('camera.kept')}>${button(icons.close, 'camera.drop', drop)}</figure>` : nothing}
    </dialog>`
  }

  updated() {
    video.classList.toggle('is-mirrored', mirrored.value)
    const dialog = this.querySelector('dialog')
    if (!dialog) return
    // Modal over the room as a viewfinder, open without a backdrop as a tile.
    const modal = dialog.matches(':modal')
    if (full.value === modal && dialog.open) return
    if (dialog.open) dialog.close()
    if (full.value) dialog.showModal()
    else dialog.show()
  }

  /** The tile is dragged by its picture; a tap makes it the viewfinder. @param {PointerEvent} event */
  #down = (event) => {
    if (full.peek() || /** @type {Element} */ (event.target).closest('button')) return
    this.#from = { x: event.clientX, y: event.clientY }
    ;/** @type {Element} */ (event.currentTarget).setPointerCapture(event.pointerId)
  }

  /** @param {PointerEvent} event */
  #move = (event) => {
    const dialog = this.querySelector('dialog')
    if (this.#from && dialog) dialog.style.translate = `${event.clientX - this.#from.x}px ${event.clientY - this.#from.y}px`
  }

  /** Let go: where it was let go says its corner. @param {PointerEvent} event */
  #up = (event) => {
    const from = this.#from
    this.#from = null
    const dialog = this.querySelector('dialog')
    if (!from || !dialog) return
    dialog.style.translate = ''
    if (event.type === 'pointercancel') return
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) < 8) return void (full.value = true)
    const rtl = getComputedStyle(dialog).direction === 'rtl'
    corner.value = `${event.clientY < innerHeight / 2 ? 'top' : 'bottom'}-${(event.clientX < innerWidth / 2) !== rtl ? 'start' : 'end'}`
  }
}

define('app-camera', Camera)
