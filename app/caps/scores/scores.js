// Scores (D196): a ```abc block in an answer, music in ABC notation, drawn as a score by abcjs and
// played on the instruments it names, MS Basic's, made (./sound.js, D338) the first time it plays, in
// a worker, or on the page in a saved copy, while it waits showing how much of them has come; without
// them (offline the first time), on Jean's own small synthesizer. Each note is lit as it sounds, a
// band gliding behind the place it has come to, with where it is to move, and it is copied as
// its source and its picture at once. One score plays at a time. Beside the task, Save takes it out
// four ways: printed alone, its .abc, a MIDI file or sent to an app here. Drawn again, at most every quarter second, while the answer is written. Loaded by the
// first score an answer holds; until then, or when abcjs finds no music in a block, it shows as code.
import { html, nothing, render, svg } from 'lit-html'
import { app, notify } from '../../ui/state.js'
import { copyDrawing, pictureOf, save } from '../../ui/save.js'
import { act } from '../../ui/acts.js'
import { drawn } from '../../ui/markdown.js'
import { drawnActions, register } from '../../ui/caps.js'
import { icon, icons } from '../../ui/menu-icons.js'
import { styleSheet, still } from '../../ui/sheet.js'
import { modelWorker } from '../../ui/model.js'
import { t, useStrings, intlLocales } from '../../core/i18n.js'
import { notesOf, wholeNote } from './notes.js'

/** @typedef {import('./notes.js').Note} Note */
/** @typedef {import('../../ui/preview.js').Shown} Shown */

const [{ renderAbc, default: abcjs }] = await Promise.all([
  import(new URL('../../vendor/abcjs/abcjs.mjs', import.meta.url).href),
  useStrings('scores'),
  styleSheet(new URL('scores.css', import.meta.url)),
])

/** Its lines broken again for the width it has, four bars a line where they fit (abcjs's wrap). */
const WRAP = { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 }
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
  const [loud, envelope] = [0.6 * note.volume, new GainNode(sound)]
  envelope.gain.setValueAtTime(0, at).linearRampToValueAtTime(loud, at + 0.008).setTargetAtTime(loud * 0.3, at + 0.008, 0.3).setTargetAtTime(0, Math.max(end, at + 0.03), 0.04)
  envelope.connect(out)
  for (const [type, octave, level] of /** @type {const} */ ([['triangle', 1, 1], ['sine', 2, 0.25]])) {
    const wave = new OscillatorNode(sound, { type, frequency: note.frequency * octave })
    wave.connect(new GainNode(sound, { gain: level })).connect(envelope)
    wave.start(at)
    wave.stop(Math.max(end, at + 0.03) + 0.3)
  }
}

class AppScore extends HTMLElement {
  static observedAttributes = ['source']
  /** @type {Note[]} */
  notes = []
  /** abcjs's moments, each with the notes that sound then and their place on the drawing. @type {{ milliseconds: number, elements?: Element[][], line: number, left: number, top: number, width: number, height: number }[]} */
  moments = []
  /** Where the band is drawn: x, y, width and height on the drawing. @type {number[] | undefined} */
  zone
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

  attributeChangedCallback() { clearTimeout(this.timer); this.timer = setTimeout(() => this.draw(), this.drawn === null ? 0 : 250) }

  disconnectedCallback() { this.pause() }

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
      // Its lines broken again for the width it has (WRAP): as written, a line of several staves
      // could run twice past it, and the whole score shrank.
      const { paddingInlineStart, paddingInlineEnd } = getComputedStyle(this)
      const width = Math.max(400, this.clientWidth ? this.clientWidth - parseFloat(paddingInlineStart) - parseFloat(paddingInlineEnd) : 770)
      tune = renderAbc(sheet, source, { responsive: 'resize', add_classes: true, staffwidth: width - 30, wrap: WRAP })[0]
    } catch (error) {
      console.warn('Score', error)
    }
    const music = tune?.lines?.some((/** @type {any} */ line) => line.staff)
    this.notes = music ? notesOf(tune.setUpAudio(), wholeNote(tune.millisecondsPerMeasure(), tune.getMeterFraction())) : []
    this.moments = music ? tune.setTiming().filter((/** @type {any} */ moment) => moment.type === 'event') : []
    this.length = Math.max(0, ...this.notes.map((note) => note.at + note.length))
    this.at = Math.min(this.at, this.length)
    this.label = music ? String(tune.metaText?.title ?? '') : ''
    this.zone = undefined
    const drawing = sheet.querySelector('svg')
    if (music && drawing) render(svg`<rect class="score-band" rx="4" width="0"></rect>`, drawing, { renderBefore: drawing.firstChild })
    else (sheet.replaceChildren(), (sheet.style.cssText = ''))
    this.paint()
  }

  paint() {
    const music = this.moments.length > 0
    const on = this.started !== null || this.loading !== null
    const source = this.getAttribute('source') ?? ''
    render(html`<div class="score-sheet" dir="ltr" role="img" aria-label=${this.label || t('scores.score')}></div>
      ${!music ? html`<p class="drawn-status muted small" role="status"><span class="while">${t('scores.drawing')}</span><span class="failed">${t('scores.failed')}</span></p>
        <pre dir="ltr" tabindex="0"><code>${source}</code></pre>`
      : html`<div class="score-player" dir="ltr" aria-busy=${this.loading !== null}>${this.notes.length ? html`
        <button class="icon-button" aria-label=${t(on ? 'scores.pause' : 'scores.play')} @click=${() => (on ? this.pause() : this.play())}>${on ? PAUSE : icons.play}</button>
        <input type="range" min="0" max=${this.length} step="0.05" .value=${String(this.at)} aria-label=${t('scores.where')} aria-valuetext=${clock(this.at)}
          @input=${(/** @type {Event} */ e) => this.seek(Number(/** @type {HTMLInputElement} */ (e.target).value))}>
        <span class="score-time">${this.loading ? new Intl.NumberFormat(intlLocales(), { style: 'percent' }).format(this.loading) : `${clock(this.at)} / ${clock(this.length)}`}</span>` : ''}
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
    copy.querySelector('.score-band')?.remove()
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
    this.follow(seconds, Infinity)
    if (on) this.play()
    else this.paint()
  }

  /** Where it is now, the band there and the notes sounding lit; at the end it stops, ready to play again. */
  tick() {
    if (this.started === null || !context) return
    const now = context.currentTime - this.started
    if (now >= this.length) {
      this.pause(true)
      this.at = 0
      this.follow(-1, 0)
      return this.paint()
    }
    this.light(this.follow(now, now - this.at)?.elements?.flat() ?? [])
    this.at = Math.max(0, now)
    this.paint()
    this.frame = requestAnimationFrame(() => this.tick())
  }

  /**
   * The band behind the place `seconds` has come to, as high as its line of staves, from the
   * notes sounding to the next ones on that line, or a little past them: it glides there from where it
   * was, `step` seconds ago, and goes there at once on a new line, after a seek or with less motion.
   * It stays where the music paused, and goes before it starts. @param {number} seconds @param {number} step
   */
  follow(seconds, step) {
    const index = this.moments.findLastIndex((moment) => moment.milliseconds <= seconds * 1000)
    const [moment, next] = [this.moments[index], this.moments[index + 1]]
    const goal = moment && [moment.left - 4, moment.top, (next?.line === moment.line && next.left > moment.left ? next.left : moment.left + moment.width + 8) - moment.left, moment.height]
    const stay = goal && this.zone?.[1] === goal[1] && !still() ? Math.exp(-Math.max(0, step) / 0.06) : 0
    this.zone = goal?.map((value, i) => value + ((this.zone?.[i] ?? value) - value) * stay)
    for (const [i, name] of ['x', 'y', 'width', 'height'].entries()) this.querySelector('.score-band')?.setAttribute(name, String(this.zone?.[i] ?? 0))
    return moment
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
  return `${new Intl.NumberFormat(intlLocales()).format(Math.floor(whole / 60))}:${new Intl.NumberFormat(intlLocales(), { minimumIntegerDigits: 2 }).format(whole % 60)}`
}

/**
 * What Save takes out of the tune on show, from its ABC as the pane has it (ui/preview.js): its title, a
 * MIDI file of abcjs's, and what Send gives, its MIDI and its ABC where the system takes them, else its
 * picture. Made as the menu opens, so that Send has it within the click the system's sheet needs.
 * @param {Shown} file
 */
async function made(file) {
  const { name, bytes } = await (await import('../../ui/preview.js')).fileBytes(file)
  const source = new TextDecoder().decode(bytes ?? new Uint8Array()), title = name.replace(/\.abc$/i, '')
  const midi = new File([abcjs.synth.getMidiFile(source, { midiOutputType: 'binary' })[0]], `${title}.mid`, { type: 'audio/midi' }), files = [midi, new File([source], name, { type: 'text/vnd.abc' })]
  const picture = navigator.canShare?.({ files }) ? null : await /** @type {AppScore | null} */ (document.querySelector('app-preview app-score'))?.picture()
  return { title, source, midi, files: picture ? [new File([picture], `${title}.png`, { type: 'image/png' })] : files }
}
let ready = /** @type {ReturnType<typeof made> | null} */ (null)

/** Printed alone: drawn again for the page out of sight, in black on white, then gone. @param {string} source */
function print(source) {
  const holder = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'score-print', dir: 'ltr', ariaHidden: 'true' })), root = document.documentElement.classList
  renderAbc(holder, source, { add_classes: true, responsive: 'resize', staffwidth: 640, wrap: WRAP })
  root.add('is-printing-score')
  addEventListener('afterprint', () => (root.remove('is-printing-score'), holder.remove()), { once: true })
  window.print()
}

/** What Save does with each choice. @param {string} how @param {Shown} file */
async function out(how, file) {
  try {
    const { title, source, midi, files } = await (ready ?? made(file))
    if (how === 'abc') return (await import('../../ui/preview.js')).download(file)
    await (how === 'print' ? print(source) : how === 'send' ? navigator.share({ files, title }) : save(midi, midi.name))
    act('file.save', { task: app.current.peek()?.path, path: file.uri, format: how })
  } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) (console.warn('Save', error), notify(t('scores.notSaved'))) }
}

/** Save and its menu, at the top of the pane while a tune is on show. @param {Shown} file */
function saveMenu(file) {
  const item = (/** @type {string} */ how, /** @type {unknown} */ glyph, /** @type {string} */ label, /** @type {string} */ about) => html`<button type="button" popovertarget="score-save" popovertargetaction="hide"
    @click=${() => out(how, file)}>${glyph}<span><b>${label}</b><small>${about}</small></span></button>`
  return html`<button type="button" class="button score-save" popovertarget="score-save">${t('scores.save')}${icons.chevron}</button>
    <div id="score-save" class="menu score-out" role="menu" popover @toggle=${(/** @type {ToggleEvent} */ e) => { if (e.newState === 'open') (ready = made(file)).catch(() => {}) }}>
      ${item('print', icons.print, t('scores.out.print'), t('scores.out.printAbout'))}
      ${item('abc', icons.download, t('scores.out.abc'), t('scores.out.abcAbout'))}
      ${item('midi', icons.download, t('scores.out.midi'), t('scores.out.midiAbout'))}
      ${typeof navigator.canShare === 'function' ? item('send', icons.share, t('scores.out.send'), t('scores.out.apps')) : nothing}
    </div>`
}

customElements.define('app-score', AppScore)
register({ id: 'scores', slots: { head: { at: 2, draw: (/** @type {Shown} */ file) => (/\.abc$/i.test(file.name) ? saveMenu(file) : nothing) } } })
drawn.value = { ...drawn.peek(), abc: (source) => html`<app-score source=${source}></app-score>` }
