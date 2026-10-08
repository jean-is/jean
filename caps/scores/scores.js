// Scores (D196): a ```abc block in an answer, music in ABC notation, drawn as a score by abcjs and
// played by Jean's own small synthesizer (./notes.js), each note lit as it sounds, with where it
// is to move, and copied as its source and its picture at once. One score plays at a time. Drawn
// again, at most every quarter second, while the answer is written. Loaded by the first score an
// answer holds; until then, or when abcjs finds no music in a block, it shows as code.
import { html, render, svg } from 'lit-html'
import { notify } from '../../ui/state.js'
import { copyDrawing } from '../../ui/save.js'
import { icons } from '../../ui/icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { t, locale, useStrings } from '../../core/i18n.js'
import { notesOf, wholeNote } from './notes.js'

/** @typedef {import('./notes.js').Note} Note */

const [{ renderAbc }] = await Promise.all([
  import(new URL('../../vendor/abcjs/abcjs.mjs', import.meta.url).href),
  useStrings('scores'),
  styleSheet(new URL('scores.css', import.meta.url)),
])

/** @param {unknown} paths */
const icon = (paths) => html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`
const PLAY = icon(svg`<path d="M8 5.5v13l10.5-6.5Z"/>`)
const PAUSE = icon(svg`<path d="M8.5 5.5v13M15.5 5.5v13"/>`)

/** The sound, made at the first Play (browsers start it only on a click), and the score playing. */
let context = /** @type {AudioContext | null} */ (null)
let playing = /** @type {AppScore | null} */ (null)

/**
 * One note: a triangle wave and, softer, its octave, struck and fading as a plucked string does,
 * then let go. @param {AudioContext} sound @param {AudioNode} out @param {Note} note @param {number} at @param {number} end
 */
function tone(sound, out, note, at, end) {
  const loud = 0.6 * note.volume
  const envelope = sound.createGain()
  envelope.gain.setValueAtTime(0, at)
  envelope.gain.linearRampToValueAtTime(loud, at + 0.008)
  envelope.gain.setTargetAtTime(loud * 0.3, at + 0.008, 0.3)
  envelope.gain.setTargetAtTime(0, Math.max(end, at + 0.03), 0.04)
  envelope.connect(out)
  for (const [type, octave, level] of /** @type {const} */ ([['triangle', 1, 1], ['sine', 2, 0.25]])) {
    const wave = sound.createOscillator()
    const share = sound.createGain()
    wave.type = type
    wave.frequency.value = note.frequency * octave
    share.gain.value = level
    wave.connect(share).connect(envelope)
    wave.start(at)
    wave.stop(Math.max(end, at + 0.03) + 0.3)
  }
}

class AppScore extends HTMLElement {
  static observedAttributes = ['source']
  /** @type {Note[]} */
  notes = []
  /** abcjs's moments, each with the notes that sound then. @type {{ milliseconds: number, elements?: Element[][] }[]} */
  moments = []
  /** In seconds: how long it lasts, where it is, and when that was 0 on the sound's clock while it plays. */
  length = 0
  at = 0
  started = /** @type {number | null} */ (null)
  /** @type {GainNode | null} */
  out = null
  /** @type {Element[]} */
  lit = []
  label = ''
  drawn = /** @type {string | null} */ (null)
  timer = 0
  frame = 0

  attributeChangedCallback() {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.draw(), this.drawn === null ? 0 : 250)
  }

  disconnectedCallback() {
    this.pause()
  }

  draw() {
    const source = this.getAttribute('source') ?? ''
    if (source === this.drawn) return
    this.drawn = source
    this.pause()
    this.paint()
    const sheet = /** @type {HTMLElement} */ (this.querySelector('.score-sheet'))
    /** @type {any} */
    let tune = null
    try {
      tune = renderAbc(sheet, source, { responsive: 'resize', add_classes: true })[0]
    } catch (error) {
      console.warn('Score', error)
    }
    const music = tune?.lines?.some((/** @type {any} */ line) => line.staff)
    this.notes = music ? notesOf(tune.setUpAudio(), wholeNote(tune.millisecondsPerMeasure(), tune.getMeterFraction())) : []
    this.moments = music ? tune.setTiming().filter((/** @type {any} */ moment) => moment.type === 'event') : []
    this.length = Math.max(0, ...this.notes.map((note) => note.at + note.length))
    this.at = Math.min(this.at, this.length)
    this.label = music ? String(tune.metaText?.title ?? '') : ''
    if (!music) {
      sheet.replaceChildren()
      sheet.style.cssText = ''
    }
    this.paint()
  }

  paint() {
    const music = this.moments.length > 0
    const on = this.started !== null
    const source = this.getAttribute('source') ?? ''
    render(html`<div class="score-sheet" dir="ltr" role="img" aria-label=${this.label || t('scores.score')}></div>
      ${!music ? html`<p class="drawn-status muted small" role="status"><span class="while">${t('scores.drawing')}</span><span class="failed">${t('scores.failed')}</span></p>
        <pre dir="ltr"><code>${source}</code></pre>`
      : html`<div class="score-player" dir="ltr">${this.notes.length ? html`
        <button class="icon-button" aria-label=${t(on ? 'scores.pause' : 'scores.play')} title=${t(on ? 'scores.pause' : 'scores.play')} @click=${() => (on ? this.pause() : this.play())}>${on ? PAUSE : PLAY}</button>
        <input type="range" min="0" max=${this.length} step="0.05" .value=${String(this.at)} aria-label=${t('scores.where')} aria-valuetext=${clock(this.at)}
          @input=${(/** @type {Event} */ e) => this.seek(Number(/** @type {HTMLInputElement} */ (e.target).value))}>
        <span class="score-time">${clock(this.at)} / ${clock(this.length)}</span>` : ''}
        <button class="icon-button subtle" aria-label=${t('action.copy')} title=${t('action.copy')}
          @click=${() => copyDrawing(source, this.picture()).then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))}>${icons.copy}</button>
      </div>`}`, this)
  }

  /**
   * The score as a picture to put in a document, a PNG: its drawing as abcjs made it, in black on
   * white, twice as fine. @returns {Promise<Blob>}
   */
  async picture() {
    const drawn = /** @type {SVGSVGElement} */ (this.querySelector('.score-sheet svg'))
    const [width, height] = (drawn.getAttribute('viewBox')?.split(/\s+/).slice(2) ?? [drawn.getAttribute('width'), drawn.getAttribute('height')]).map(Number)
    const copy = /** @type {SVGSVGElement} */ (drawn.cloneNode(true))
    copy.removeAttribute('style')
    copy.setAttribute('width', String(width))
    copy.setAttribute('height', String(height))
    const address = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }))
    try {
      const image = new Image()
      image.src = address
      await image.decode()
      const canvas = Object.assign(document.createElement('canvas'), { width: width * 2, height: height * 2 })
      const pen = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
      pen.fillStyle = '#fff'
      pen.fillRect(0, 0, canvas.width, canvas.height)
      pen.drawImage(image, 0, 0, canvas.width, canvas.height)
      return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No picture'))), 'image/png'))
    } finally {
      URL.revokeObjectURL(address)
    }
  }

  play() {
    if (playing && playing !== this) playing.pause()
    context ??= new AudioContext()
    void context.resume()
    if (this.at >= this.length - 0.05) this.at = 0
    const out = context.createGain()
    out.gain.value = 0.3
    out.connect(context.destination)
    const zero = context.currentTime + 0.05 - this.at
    for (const note of this.notes) {
      if (note.at + note.length > this.at) tone(context, out, note, zero + Math.max(note.at, this.at), zero + note.at + note.length)
    }
    this.out = out
    this.started = zero
    playing = this
    this.tick()
  }

  /** Stops where it is, fading out over a few milliseconds rather than cutting a note. */
  pause() {
    if (this.started === null || !context) return
    this.at = Math.min(this.length, Math.max(0, context.currentTime - this.started))
    const out = this.out
    out?.gain.setTargetAtTime(0, context.currentTime, 0.015)
    setTimeout(() => out?.disconnect(), 200)
    this.out = this.started = null
    if (playing === this) playing = null
    cancelAnimationFrame(this.frame)
    this.light([])
    this.paint()
  }

  /** @param {number} seconds */
  seek(seconds) {
    const on = this.started !== null
    this.pause()
    this.at = seconds
    if (on) this.play()
    else this.paint()
  }

  /** Where it is now, and the notes sounding, lit; at the end it stops, ready to play again. */
  tick() {
    if (this.started === null || !context) return
    const now = context.currentTime - this.started
    if (now >= this.length) {
      this.pause()
      this.at = 0
      return this.paint()
    }
    this.at = Math.max(0, now)
    const moment = this.moments.findLast((candidate) => candidate.milliseconds <= this.at * 1000)
    this.light(moment?.elements?.flat() ?? [])
    this.paint()
    this.frame = requestAnimationFrame(() => this.tick())
  }

  /** @param {Element[]} elements */
  light(elements) {
    if (elements.length === this.lit.length && elements.every((element, i) => element === this.lit[i])) return
    for (const element of this.lit) element.classList.remove('is-sounding')
    for (const element of elements) element.classList.add('is-sounding')
    this.lit = elements
  }
}

/** "1:05", with the language's digits. @param {number} seconds */
function clock(seconds) {
  const whole = Math.floor(seconds)
  return `${new Intl.NumberFormat(locale.value).format(Math.floor(whole / 60))}:${new Intl.NumberFormat(locale.value, { minimumIntegerDigits: 2 }).format(whole % 60)}`
}

customElements.define('app-score', AppScore)
