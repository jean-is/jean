// Scores (D196): a ```abc block in an answer, music in ABC notation, drawn as a score by abcjs and
// played on the instruments it names, MS Basic's, made (./sound.js, D338) the first time it plays, in
// a worker, or on the page in a saved copy, while it waits showing how much of them has come; without
// them (offline the first time), on Jean's own small synthesizer. Each note is lit as it sounds,
// with where it is to move, and it is copied as its source and its picture at once. One score plays
// at a time. Drawn again, at most every quarter second, while the answer is written. Loaded by the
// first score an answer holds; until then, or when abcjs finds no music in a block, it shows as code.
import { html, render, svg } from 'lit-html'
import { app, notify } from '../../ui/state.js'
import { copyDrawing, pictureOf } from '../../ui/save.js'
import { drawn } from '../../ui/markdown.js'
import { drawnActions } from '../../ui/caps.js'
import { icon, icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { modelWorker } from '../../ui/model.js'
import { t, locale, useStrings } from '../../core/i18n.js'
import { notesOf, wholeNote } from './notes.js'

/** @typedef {import('./notes.js').Note} Note */

const [{ renderAbc }] = await Promise.all([
  import(new URL('../../vendor/abcjs/abcjs.mjs', import.meta.url).href),
  useStrings('scores'),
  styleSheet(new URL('scores.css', import.meta.url)),
])

const PAUSE = icon(svg`<path d="M9 5.5v13M15 5.5v13"/>`)

/** The sound, made at the first Play (browsers start it only on a click), and the score playing. */
let context = /** @type {AudioContext | null} */ (null)
let playing = /** @type {AppScore | null} */ (null)
/** Where the music is made: a worker of this Jean's own, or none in a saved copy, whose files come from an address that starts none. */
const WORKER = new URL('./sound-worker.js', import.meta.url)
const sounds = WORKER.origin === location.origin ? modelWorker(WORKER, 'The score’s sound stopped') : null

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
  /** The music as its instruments play it, a second at a time, as they come; false once they can't. @type {{ at: number, buffer: AudioBuffer }[] | false | null} */
  parts = null
  /** What of its instruments has come, while it waits for them to play. @type {number | null} */
  loading = null
  /** @type {AudioBufferSourceNode[]} */
  sources = []
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
    this.parts = null
    this.paint()
    const sheet = /** @type {HTMLElement} */ (this.querySelector('.score-sheet'))
    /** @type {any} */
    let tune = null
    try {
      // Its lines broken again for the width it has, four bars a line where they fit (abcjs's wrap):
      // as written, a line of several staves could run twice past it, and the whole score shrank.
      const { paddingInlineStart, paddingInlineEnd } = getComputedStyle(this)
      const width = Math.max(400, this.clientWidth ? this.clientWidth - parseFloat(paddingInlineStart) - parseFloat(paddingInlineEnd) : 770)
      tune = renderAbc(sheet, source, { responsive: 'resize', add_classes: true, staffwidth: width - 30, wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 } })[0]
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
    const on = this.started !== null || this.loading !== null
    const source = this.getAttribute('source') ?? ''
    render(html`<div class="score-sheet" dir="ltr" role="img" aria-label=${this.label || t('scores.score')}></div>
      ${!music ? html`<p class="drawn-status muted small" role="status"><span class="while">${t('scores.drawing')}</span><span class="failed">${t('scores.failed')}</span></p>
        <pre dir="ltr"><code>${source}</code></pre>`
      : html`<div class="score-player" dir="ltr" aria-busy=${this.loading !== null}>${this.notes.length ? html`
        <button class="icon-button" aria-label=${t(on ? 'scores.pause' : 'scores.play')} @click=${() => (on ? this.pause() : this.play())}>${on ? PAUSE : icons.play}</button>
        <input type="range" min="0" max=${this.length} step="0.05" .value=${String(this.at)} aria-label=${t('scores.where')} aria-valuetext=${clock(this.at)}
          @input=${(/** @type {Event} */ e) => this.seek(Number(/** @type {HTMLInputElement} */ (e.target).value))}>
        <span class="score-time">${this.loading ? new Intl.NumberFormat(locale.value, { style: 'percent' }).format(this.loading) : `${clock(this.at)} / ${clock(this.length)}`}</span>` : ''}
      </div>
      <div class="drawn-foot">
        <button class="icon-button subtle" aria-label=${t('action.copy')}
          @click=${() => copyDrawing(source, this.picture()).then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))}>${icons.copy}</button>
        ${drawnActions('abc', source)}
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
    return pictureOf(new XMLSerializer().serializeToString(copy), width, height)
  }

  play() {
    if (playing && playing !== this) playing.pause()
    context ??= new AudioContext()
    void context.resume()
    if (this.at >= this.length - 0.05) this.at = 0
    playing = this
    if (this.parts === null) this.load(context)
    else if (this.parts && !this.parts.length) (this.loading = 0), this.paint()
    else this.start(context)
  }

  /**
   * The music as its instruments play it, made in the worker or, in a saved copy, on the page: it
   * starts with its first second, or on the synthesizer when they can't come. @param {AudioContext} sound
   */
  load(sound) {
    const parts = (this.parts = /** @type {{ at: number, buffer: AudioBuffer }[]} */ ([]))
    this.loading = 0
    this.paint()
    const ready = () => {
      if (this.loading === null) return
      this.loading = null
      this.start(sound)
    }
    const request = { notes: this.notes, rate: sound.sampleRate, base: (/** @type {Record<string, string>} */ (app.settings.peek().urls ?? {})).sounds }
    const made = (/** @type {Record<string, any>} */ message) => {
      if (this.parts !== parts) return
      if (message.type === 'progress') return this.loading !== null && ((this.loading = message.loaded / message.total), this.paint())
      const buffer = sound.createBuffer(2, message.left.length, sound.sampleRate)
      buffer.copyToChannel(message.left, 0)
      buffer.copyToChannel(message.right, 1)
      parts.push({ at: message.at, buffer })
      if (this.started !== null) this.schedule(parts[parts.length - 1])
      ready()
    }
    const making = sounds ? sounds.call(request, { onMessage: made }) : import('./sound.js').then(({ render }) => render(request, made, () => this.parts !== parts))
    making.catch((error) => {
      console.warn('Score', error)
      if (this.parts !== parts || parts.length) return
      this.parts = false
      ready()
    })
  }

  /** Plays from where it is: its parts as they come, or each note on the synthesizer. @param {AudioContext} sound */
  start(sound) {
    const out = sound.createGain()
    // As loud on either: MS Basic plays at about a third of the synthesizer's level, chords well below clipping.
    out.gain.value = this.parts ? 2.5 : 0.3
    out.connect(sound.destination)
    this.out = out
    this.started = sound.currentTime + 0.05 - this.at
    if (this.parts) for (const part of this.parts) this.schedule(part)
    else for (const note of this.notes) {
      if (note.at + note.length > this.at) tone(sound, out, note, this.started + Math.max(note.at, this.at), this.started + note.at + note.length)
    }
    this.tick()
  }

  /** A second of the music, from where it is. @param {{ at: number, buffer: AudioBuffer }} part */
  schedule({ at, buffer }) {
    if (!context || !this.out || this.started === null || at + buffer.duration <= this.at) return
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(this.out)
    const offset = Math.max(0, this.at - at)
    source.start(this.started + at + offset, offset)
    this.sources.push(source)
  }

  /** Stops where it is, fading out over a few milliseconds rather than cutting a note; at the end, the last notes ring on. */
  pause(end = false) {
    if (this.loading !== null) this.loading = null
    else if (this.started === null || !context) return
    if (context && this.started !== null) this.at = Math.min(this.length, Math.max(0, context.currentTime - this.started))
    const [out, sources] = [this.out, this.sources]
    out?.gain.setTargetAtTime(0, context?.currentTime ?? 0, end ? 0.5 : 0.015)
    setTimeout(() => (out?.disconnect(), sources.forEach((source) => source.stop())), end ? 3000 : 200)
    this.out = this.started = null
    this.sources = []
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
      this.pause(true)
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
drawn.value = { ...drawn.peek(), abc: (source) => html`<app-score source=${source}></app-score>` }
