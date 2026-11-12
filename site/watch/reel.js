// SPDX-License-Identifier: MIT
// The reel player (D687, docs/reels.md): `reel.html#reel=<name>&lang=<lang>` plays one of Jean's reels, framed by a
// page of the site or alone. A reel is scenes end to end (schedule.js): cards it draws, and tasks Jean did, each
// played again by demo.html in a frame (D457), whose waits and stops demo.js asks this player for (window.reel.lend).
// Everything shown or heard is a function of one clock, the reel's time: pause, seek, speed, a language changed
// halfway and the README's animation, drawn frame by frame (scripts/reel.js), are the same mechanism. Going back in a task loads its frame
// again and plays it at once up to where the reel is, behind the one shown, then shows it: nothing blinks.
// The stage (1280 × 720) is scaled to its frame as a video is: what is said on one side, large, Jean in its window
// beside it, magnified; the controls are sized by the player.
import { words } from '#app/ui/replay.js'
import { reelTime, steps, taskTime } from './schedule.js'
import { Score } from './score.js'

/** @import { Card, Hold, Scene, Stop, Task, TaskTime } from './schedule.js' */

const STAGE = { width: 1280, height: 720 }
/** What the window shows of the conversation, under its bar (reel.css). */
const VIEW = { width: 732, height: 630 }
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
/** How much the conversation is magnified in the window: laid out at 523 pixels, as on a phone, it fills 732 (reel.css). */
const LENS = 1.4
/** How long the conversation takes to scroll to what a stop names, and the pointer to get there, in the reel's milliseconds. */
const POINT = 750
/** What an approval's stop points at and the reel clicks: Allow once, on its card (app/ui/chat.js). */
const ALLOW = '.approval .approval-actions .button.primary'

const params = new URLSearchParams(location.hash.slice(1))
const root = document.documentElement
const name = params.get('reel') ?? 'jean'
const exporting = params.has('export')
const still = matchMedia('(prefers-reduced-motion: reduce)').matches
/** Whether scenes cut from one to the next rather than fade: with less motion asked for, and in the README's animation, whose every changed pixel is kept as it is. */
const cuts = still || exporting

// ─── Small helpers ───────────────────────────────────────────────────────────

const clamp = (/** @type {number} */ x, min = 0, max = 1) => Math.min(max, Math.max(min, x))
const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ p) => a + (b - a) * p
const easeOut = (/** @type {number} */ p) => 1 - (1 - p) ** 3
const easeInOut = (/** @type {number} */ p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2)
/** A viewer's convenience kept in this browser, where it may be kept. @param {string} key */
const kept = (key) => { try { return localStorage.getItem(`reel.${key}`) } catch { return null } }
const keep = (/** @type {string} */ key, /** @type {string} */ value) => { try { localStorage.setItem(`reel.${key}`, value) } catch { /* private window: forgotten */ } }

/**
 * An element with its attributes and children.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, string | number | boolean | undefined>} [attrs] @param {Array<Node | string | null | undefined>} children
 * @returns {HTMLElementTagNameMap[K]}
 */
function h (tag, attrs = {}, ...children) {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== false) element.setAttribute(key, value === true ? '' : String(value))
  element.append(...children.filter((child) => child !== null && child !== undefined))
  return element
}

/** One of the player's glyphs, from reel.html's template (Jean's own, or drawn in their grid). @param {string} glyph */
const icon = (glyph) => /** @type {SVGElement} */ (/** @type {HTMLTemplateElement} */ (document.getElementById('reel-icons')).content.querySelector(`[data-icon="${glyph}"]`)?.cloneNode(true))

/** A macrotask's turn, so that what a replay does once a wait ends is done before the next one ends. */
const turn = () => new Promise((resolve) => { const { port1, port2 } = new MessageChannel(); port1.onmessage = () => { port1.close(); resolve(undefined) }; port2.postMessage(null) })

// ─── A reel, loaded ──────────────────────────────────────────────────────────

/**
 * A reel as its file says it (site/watch/reels.js writes one per language), with its time worked out.
 * @typedef {{ format: 1, kind: 'reel', name: string, lang: string, dir: 'ltr' | 'rtl', title: string, address: string,
 *   languages: Array<{ lang: string, name: string }>, words: Record<string, string>, scenes: Scene[] }} ReelFile
 * @typedef {Scene & { start: number, end: number }} Timed
 * @typedef {Omit<ReelFile, 'scenes'> & { scenes: Timed[], tasks: Array<TaskTime | null>, length: number }} Reel
 */

/** A task's time, from its file, as demo.js will play it. @param {Task} scene @param {(text: string) => string[]} cut */
async function timeOf (scene, cut) {
  const response = await fetch(scene.src)
  if (!response.ok) throw new Error(`reel: ${response.status} for ${scene.src}`)
  // Read as demo.js reads it: each record's line, the header left out.
  /** @type {Map<any, number>} */
  const lineOf = new Map()
  const records = (await response.text()).split('\n').flatMap((line, i) => { try { const record = JSON.parse(line); lineOf.set(record, i + 1); return [record] } catch { return [] } })
  if (records[0]?.kind === 'conversation') records.shift()
  return taskTime(steps(records, (record) => lineOf.get(record) ?? 0, cut), scene.stops, scene.tail)
}

/** The reel in a language, or English's where it has none. @param {string} code @returns {Promise<Reel>} */
async function load (code) {
  let response = await fetch(`reels/${name}.${code}.json`)
  if (!response.ok && code !== 'en') response = await fetch(`reels/${name}.en.json`)
  if (!response.ok) throw new Error(`reel: ${response.status} for ${name}`)
  /** @type {ReelFile} */
  const file = await response.json()
  // Less motion asked for: demo.js writes each answer whole, so the reel's time is shorter.
  const cut = still ? (/** @type {string} */ text) => [text] : words(file.lang)
  const tasks = await Promise.all(file.scenes.map((scene) => (scene.kind === 'task' ? timeOf(scene, cut) : null)))
  const { scenes, length } = reelTime(file.scenes, (scene, i) => (scene.kind === 'card' ? scene.hold : tasks[i]?.length ?? 0))
  return { ...file, scenes, tasks, length }
}

// ─── The queue: what the reel's time ends, in order ──────────────────────────

/**
 * What ends at a time: a replay's wait (`then`), or what the reel does to its frame then (`act`), after the replay has
 * gone on at that time, so that what a stop opens or clicks is there.
 * @typedef {{ time: number, kind: 'then' | 'act', order: number, run: () => void, frame: Frame }} Item
 */
const queue = {
  /** @type {Item[]} */
  items: [],
  order: 0,
  /** @param {number} time @param {Item['kind']} kind @param {() => void} run @param {Frame} frame */
  add (time, kind, run, frame) {
    this.items.push({ time, kind, order: this.order++, run, frame })
    this.items.sort((a, b) => a.time - b.time || Number(a.kind === 'act') - Number(b.kind === 'act') || a.order - b.order)
  },
  /** @param {Frame} frame */
  drop (frame) { this.items = this.items.filter((item) => item.frame !== frame) },
}

/** @type {Promise<void> | null} */
let flushing = null
const due = () => Boolean(queue.items[0] && queue.items[0].time <= time)
/**
 * Ends every wait and does every action due by the reel's time, one turn each, so a replay catches up in order. It
 * starts only with something due, so its first turn always comes before it is done.
 */
function flush () {
  if (!flushing && due()) {
    flushing = (async () => {
      do {
        /** @type {Item} */ (queue.items.shift()).run()
        await turn()
      } while (due())
      flushing = null
    })()
  }
  return flushing ?? Promise.resolve()
}

// ─── A task's frame ──────────────────────────────────────────────────────────

/** A task played in a frame of demo.html, its waits and stops lent by the reel. */
class Frame {
  /** @param {number} index  its scene's */
  constructor (index) {
    this.index = index
    this.scene = /** @type {Timed & Task} */ (reel.scenes[index])
    this.task = /** @type {TaskTime} */ (reel.tasks[index])
    /** The next of the task's calls demo.js is yet to make, and the reel's time of the last thing it played. */
    this.next = 0
    this.reached = -Infinity
    /** How many of demo.js's waits and moments the task's time didn't foresee: none, unless it no longer plays as schedule.js says. */
    this.drift = 0
    this.last = this.scene.start
    /** Whether demo.js has its task and was lent the reel's clock, and whether it has asked it anything yet. */
    this.started = false
    this.asked = false
    const at = new URLSearchParams({ src: this.scene.src, lang: reel.lang, theme: root.dataset.theme ?? 'light', look: root.dataset.look ?? 'tilde' })
    this.element = h('iframe', { class: 'reel-frame', src: `demo.html#${at}`, title: '', tabindex: -1, 'aria-hidden': 'true', inert: true })
    view.insertBefore(this.element, ring)
  }

  /**
   * What the reel does to it as it goes by, once its replay has started, so none of it runs ahead of the replay: each
   * stop's lists closed over what it points at, opened as it starts and closed as it ends, as a guided tour does; its
   * click; each approval's Allow once.
   */
  act () {
    this.asked = true
    const { start } = this.scene
    for (const { stop, start: from, end } of this.task.holds) {
      if (stop.on) {
        queue.add(start + from, 'act', () => this.open(stop), this)
        queue.add(start + end, 'act', () => this.shut(), this)
      }
      if (stop.click) queue.add(start + end, 'act', () => this.find(stop.on)?.click(), this)
    }
    for (const ask of this.task.asks) queue.add(start + ask.time, 'act', () => this.find(ALLOW)?.click(), this)
  }

  /** Whether it has played up to the reel's time: nothing of it due, and something of it still to come, or nothing left. */
  get caught () {
    const mine = queue.items.filter((item) => item.frame === this)
    return this.asked && !mine.some((item) => item.time <= time) && (mine.length > 0 || this.next >= this.task.calls.length)
  }

  get document () { try { return this.element.contentDocument } catch { return null } }

  /** What demo.js is lent: its waits end, and its stops go on, at the task's times. */
  lender () {
    const { start } = this.scene
    this.started = true
    return {
      wait: (/** @type {number} */ ms) => {
        if (!this.asked) this.act()
        const call = this.call('wait')
        if (!call) this.drift++
        return this.when(call ? start + call.time : this.last + ms)
      },
      at: (/** @type {number | string} */ moment) => {
        if (!this.asked) this.act()
        const call = this.call('at', moment)
        if (!call) this.drift++
        return call?.kind === 'at' && call.held ? this.when(start + call.time).then(() => true) : Promise.resolve(false)
      },
    }
  }

  /** The next call of a kind, at a moment, past those demo.js skipped. @param {'at' | 'wait'} kind @param {number | string} [moment] */
  call (kind, moment) {
    const { calls } = this.task
    for (let i = this.next; i < calls.length; i++) {
      const call = calls[i]
      if (call.kind === kind && (call.kind === 'wait' || call.moment === moment)) {
        this.next = i + 1
        return call
      }
    }
    return null
  }

  /** A promise the reel's time keeps. @param {number} at */
  when (at) {
    this.last = at
    return new Promise((resolve) => queue.add(at, 'then', () => { this.reached = at; resolve(undefined) }, this))
  }

  /** The last element a selector finds that shows, or would once a list closed over it opens. @param {string | undefined} selector @returns {HTMLElement | null} */
  find (selector) {
    if (!selector || !this.document) return null
    try {
      return /** @type {HTMLElement | null} */ ([...this.document.querySelectorAll(selector)].filter((element) => element.checkVisibility() || element.closest('details:not([open])')).at(-1) ?? null)
    } catch { return null }
  }

  /** @type {Element[]} */
  opened = []
  /** A stop starts: the lists closed over what it points at open. @param {Stop} stop */
  open (stop) {
    const target = this.find(stop.on)
    for (let shut = target?.parentElement?.closest('details:not([open])'); shut; shut = shut.parentElement?.closest('details:not([open])')) {
      shut.toggleAttribute('open', true)
      this.opened.push(shut)
    }
  }

  shut () {
    for (const list of this.opened.splice(0)) list.toggleAttribute('open', false)
  }

  remove () {
    queue.drop(this)
    this.element.remove()
  }
}

// ─── The reel's state ────────────────────────────────────────────────────────

/** @type {Reel} */
let reel
let time = 0
/** Before the reel first plays, the moment it shows: its first card, drawn. @type {number | null} */
let poster = null
let rate = Number(kept('speed')) || 1
let playing = false
let muted = kept('muted') === 'true' || params.has('muted')
/** Each task's frame shown, and the one made to replace it after going back, by scene. @type {Map<number, Frame>} */
const shown = new Map()
/** @type {Map<number, Frame>} */
const coming = new Map()
/** @type {Score | null} */
let score = null

// ─── The stage ───────────────────────────────────────────────────────────────

const main = /** @type {HTMLElement} */ (document.getElementById('main'))
const stage = h('div', { class: 'reel-stage' })
const win = h('div', { class: 'reel-window', 'aria-hidden': 'true' })
const view = h('div', { class: 'reel-view' })
const ring = h('div', { class: 'reel-ring' })
const pointer = h('div', { class: 'reel-pointer' }, icon('pointer'))
const ripple = h('div', { class: 'reel-ripple' })
const address = h('span', { class: 'reel-address' }, icon('lock'), h('span'))
view.append(ring, ripple, pointer)
win.append(h('div', { class: 'reel-bar' }, h('span', { class: 'reel-dots' }, h('i'), h('i'), h('i')), address), view)
/** Beside the window: the chapter, and what each stop says, which stays while Jean goes on. */
const part = h('span', { dir: 'auto' })
const caption = h('p', { class: 'reel-caption' })
const side = h('div', { class: 'reel-side', 'aria-hidden': 'true' }, h('p', { class: 'reel-part' }, icon('wave'), part), caption)
const cards = h('div', { class: 'reel-cards' })
stage.append(h('div', { class: 'reel-backdrop', 'aria-hidden': 'true' }, icon('wave')), side, win, cards)

/** What a screen reader hears: each caption and each card's words, as they come. */
const spoken = h('p', { class: 'reel-spoken', 'aria-live': 'polite' })
const big = h('button', { class: 'reel-big', type: 'button' }, icon('play'))
const seek = h('input', { class: 'reel-seek', type: 'range', min: 0, step: 100, value: 0 })
const marks = h('div', { class: 'reel-marks', 'aria-hidden': 'true' })
const toggle = h('button', { class: 'reel-button', type: 'button' })
const sound = h('button', { class: 'reel-button', type: 'button' })
const clock = h('span', { class: 'reel-time' })
const chapter = h('span', { class: 'reel-chapter', dir: 'auto' })
const speed = h('button', { class: 'reel-button is-text', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', popovertarget: 'reel-speeds' })
const language = h('button', { class: 'reel-button', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', popovertarget: 'reel-languages' }, icon('language'))
const full = h('button', { class: 'reel-button', type: 'button' })
const speeds = h('div', { class: 'reel-menu', id: 'reel-speeds', popover: 'auto', role: 'menu' })
const languages = h('div', { class: 'reel-menu', id: 'reel-languages', popover: 'auto', role: 'menu' })
const controls = h('div', { class: 'reel-controls' },
  h('div', { class: 'reel-track' }, marks, seek),
  h('div', { class: 'reel-row' }, toggle, sound, clock, chapter, speed, language, full))
main.append(stage, spoken, big, controls, speeds, languages)
if (exporting) main.dataset.export = ''

/** The stage scaled to its frame, as a video is: the same picture at any size. */
new ResizeObserver(() => {
  const scale = Math.min(main.clientWidth / STAGE.width, main.clientHeight / STAGE.height)
  stage.style.setProperty('--scale', String(scale))
}).observe(main)

/**
 * A card's parts that rise one after the other, in its language's own words: each piece's element and when it comes.
 * @typedef {{ element: HTMLElement | SVGElement, at: number, kind?: 'draw' }} Piece
 * @typedef {{ element: HTMLElement, pieces: Piece[] }} Drawn
 */
/** @type {Map<number, Drawn>} */
const drawn = new Map()

/**
 * Words that rise one after the other, from a moment, apart by a step, in the words of the reel's language. Spaces
 * stay where lines may break; a mark rises with the word it holds to (the full stop after it, the quote before it),
 * so no line starts or ends on one alone. @param {string} text @param {number} at @param {Piece[]} pieces @param {number} [step]
 */
function rising (text, at, pieces, step = 70) {
  const element = h('span', { dir: 'auto' })
  /** @type {HTMLElement | null} */
  let word = null
  let [held, n] = ['', 0]
  for (const { segment, isWordLike } of new Intl.Segmenter(reel.lang, { granularity: 'word' }).segment(text)) {
    if (isWordLike) {
      word = h('span', { class: 'reel-word' }, held + segment)
      held = ''
      element.append(word)
      pieces.push({ element: word, at: at + step * n++ })
    } else if (/^\s+$/.test(segment)) {
      element.append(segment)
      word = null
    } else if (word) word.append(segment)
    else held += segment
  }
  if (held) element.append(held)
  return element
}

/** A card as it is drawn, its pieces timed. @param {Card} card */
function drawCard (card) {
  /** @type {Piece[]} */
  const pieces = []
  const element = h('div', { class: `reel-card is-${card.look}`, inert: true })
  if (card.look !== 'facts') {
    const wave = icon('wave')
    wave.classList.add('reel-mark')
    element.append(wave)
    pieces.push({ element: wave, at: 120, kind: 'draw' })
  }
  // The first card's name is there from the first moment, so a reel never starts on an empty picture.
  element.append(h('p', { class: card.look === 'open' ? 'reel-name' : 'reel-title', 'aria-hidden': 'true' }, rising(card.title, card.look === 'open' ? -1000 : 250, pieces, 90)))
  if (card.line) element.append(h('p', { class: 'reel-line', 'aria-hidden': 'true' }, rising(card.line, card.look === 'open' ? 1100 : 900, pieces, 45)))
  if (card.facts) {
    const list = h('ul', { class: 'reel-facts', 'aria-hidden': 'true' })
    card.facts.forEach((fact, i) => {
      const tick = icon('tick')
      const at = 600 + i * 900
      list.append(h('li', {}, tick, rising(fact, at, pieces, 35)))
      pieces.push({ element: tick, at: at + 150, kind: 'draw' })
    })
    element.append(list)
  }
  if (card.cta) {
    const link = h('a', { class: 'button primary reel-cta', href: card.cta.href, target: '_top' }, card.cta.text)
    element.append(link)
    pieces.push({ element: link, at: 1100 })
  }
  return { element, pieces }
}

/** The controls' words, the cards, the chapters and the menus, in the reel's language. */
function build () {
  root.lang = reel.lang
  root.dir = reel.dir
  document.title = reel.title
  main.setAttribute('aria-label', fill('player', { title: reel.title }))
  const where = /** @type {HTMLElement} */ (address.lastElementChild)
  where.textContent = reel.address
  seek.max = String(reel.length)
  seek.setAttribute('aria-label', reel.words.seek)
  speed.setAttribute('aria-label', reel.words.speed)
  speeds.setAttribute('aria-label', reel.words.speed)
  language.setAttribute('aria-label', reel.words.language)
  languages.setAttribute('aria-label', reel.words.language)
  cards.replaceChildren()
  drawn.clear()
  reel.scenes.forEach((scene, i) => {
    if (scene.kind !== 'card') return
    const card = drawCard(scene)
    drawn.set(i, card)
    cards.append(card.element)
  })
  marks.replaceChildren(...reel.scenes.map((scene) => {
    const mark = h('span', {}, h('i'))
    mark.style.flexGrow = String(scene.end - scene.start)
    return mark
  }))
  menus()
  labels()
}

/** The speeds and the languages, each menu a list of choices, the one on ticked. */
function menus () {
  const number = new Intl.NumberFormat(reel.lang, { maximumFractionDigits: 2 })
  const menu = (/** @type {HTMLElement} */ popover, /** @type {Array<[string, string, boolean, () => void]>} */ rows) => popover.replaceChildren(h('ul', { role: 'none' }, ...rows.map(([label, code, checked, pick]) => {
    const row = h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(checked), lang: code || undefined, dir: 'auto' }, icon('check'), label)
    row.addEventListener('click', () => { pick(); popover.hidePopover() })
    return h('li', { role: 'none' }, row)
  })))
  menu(speeds, SPEEDS.map((value) => [fill('times', { n: number.format(value) }), '', value === rate, () => setRate(value)]))
  menu(languages, reel.languages.map(({ lang, name: own }) => [own, lang, lang === reel.lang, () => setLanguage(lang)]))
  speed.textContent = fill('times', { n: number.format(rate) })
}

/** A word of the player's, its {params} filled. @param {string} key @param {Record<string, string>} [params] */
const fill = (key, params = {}) => (reel.words[key] ?? key).replace(/\{(\w+)\}/g, (whole, param) => params[param] ?? whole)

/** The buttons' names and glyphs, as the reel stands. */
function labels () {
  const ended = time >= reel.length
  const now = playing ? 'pause' : ended ? 'again' : 'play'
  toggle.setAttribute('aria-label', reel.words[now])
  toggle.replaceChildren(icon(now === 'again' ? 'retry' : now))
  big.replaceChildren(icon('play'), h('span', {}, reel.words.play))
  sound.setAttribute('aria-label', reel.words[muted ? 'unmute' : 'mute'])
  sound.replaceChildren(icon(muted ? 'muted' : 'speaker'))
  sound.setAttribute('aria-pressed', String(muted))
  const isFull = Boolean(document.fullscreenElement) || main.classList.contains('is-full')
  full.setAttribute('aria-label', reel.words[isFull ? 'leave' : 'full'])
  full.replaceChildren(icon(isFull ? 'shrink' : 'fullscreen'))
  main.dataset.state = playing ? 'playing' : ended ? 'ended' : time ? 'paused' : 'ready'
}

// ─── Drawing a moment ────────────────────────────────────────────────────────

/** The scene at a time: the last one started. @param {number} at */
function sceneAt (at) {
  const i = reel.scenes.findIndex((scene) => at < scene.end)
  return i < 0 ? reel.scenes.length - 1 : i
}

/** An element's box in the view's coordinates: its frame's, magnified. @param {Element} element */
function boxOf (element) {
  const box = element.getBoundingClientRect()
  return { x: box.left * LENS, y: box.top * LENS, width: box.width * LENS, height: box.height * LENS }
}

/**
 * Where the conversation is scrolled while a stop points: its end, as Jean keeps it while it writes, or what the stop
 * points at in view, glided to as the stop starts and back as the stops pointing one after the other end.
 * @param {Hold[]} holds @param {Frame} frame @param {number} u
 */
function scrollAt (holds, frame, u) {
  const doc = frame.document
  if (!doc?.scrollingElement) return
  const page = doc.scrollingElement
  const bottom = page.scrollHeight - page.clientHeight
  const pointing = holds.filter(({ stop }) => stop.on)
  const i = pointing.findIndex((hold) => hold.start <= u && u < hold.end)
  if (i < 0) return
  /** Where what a stop points at is in view, a margin round it. @param {Hold} hold */
  const need = (hold) => {
    const target = frame.find(hold.stop.on)
    if (!target) return bottom
    const box = target.getBoundingClientRect()
    const [top, end] = [box.top + page.scrollTop - 24, box.bottom + page.scrollTop + 24]
    const y = Math.min(Math.max(page.scrollTop, end - page.clientHeight), top)
    return clamp(y, 0, bottom)
  }
  const hold = pointing[i]
  const previous = pointing[i - 1]
  const chained = previous && hold.start - previous.end < 1
  const next = pointing[i + 1]
  const last = !next || next.start - hold.end >= 1
  let y = lerp(chained ? need(previous) : bottom, need(hold), still ? 1 : easeInOut(clamp((u - hold.start) / POINT)))
  if (last) y = lerp(y, bottom, still ? 0 : easeInOut(clamp((u - (hold.end - 500)) / 500)))
  page.scrollTop = y
}

/** Where each stop last pointed, in the view. @type {WeakMap<Hold, { x: number, y: number }>} */
const pointed = new WeakMap()

/** Where the pointer is in a task, and whether it presses: it travels to what each stop points at, and clicks as one with a click goes on. @param {Hold[]} holds @param {Frame} frame @param {number} u @param {Array<{ at: number }>} clicks */
function pointerAt (holds, frame, u, clicks) {
  const pointing = holds.filter(({ stop }) => stop.on)
  const i = pointing.findLastIndex((hold) => hold.start <= u)
  const rest = { x: VIEW.width * 0.82, y: VIEW.height * 0.9 }
  // Where a stop points; once what it points at is gone (a card answered), where it last was, as a hand stays.
  const where = (/** @type {Hold | undefined} */ hold) => {
    const target = hold && frame.find(hold.stop.on)
    if (!target) return (hold && pointed.get(hold)) ?? rest
    const box = boxOf(target)
    const at = { x: box.x + Math.min(box.width * 0.5, 160), y: box.y + box.height * 0.55 }
    if (hold) pointed.set(hold, at)
    return at
  }
  if (i < 0) return { ...rest, shown: 0, press: 0, rippled: -1 }
  const [from, to] = [where(pointing[i - 1]), where(pointing[i])]
  const p = still ? 1 : easeInOut(clamp((u - pointing[i].start) / POINT))
  // A hand's path bows a little.
  const bow = Math.sin(p * Math.PI) * 0.12
  const x = lerp(from.x, to.x, p) - (to.y - from.y) * bow
  const y = lerp(from.y, to.y, p) + (to.x - from.x) * bow
  const shown = clamp((u - pointing[0].start) / 300)
  const near = clicks.map(({ at }) => u - at).find((d) => d > -220 && d < 500)
  const press = near === undefined ? 0 : near < 0 ? clamp((near + 220) / 120) : clamp(1 - near / 160)
  return { x, y, shown, press, rippled: near !== undefined && near >= 0 ? near / 500 : -1 }
}

/** What shows at the reel's time: the scene, its card or its task's frame, the pointer and what is said. */
function draw () {
  const at = poster ?? time
  const i = sceneAt(at)
  const scene = reel.scenes[i]
  const u = at - scene.start
  const [before, after] = [reel.scenes[i - 1], reel.scenes[i + 1]]
  // The cards: the one on, its pieces risen as far as they have; the last stays once the reel ends.
  for (const [k, card] of drawn) {
    card.element.hidden = k !== i
    if (k !== i) continue
    card.element.toggleAttribute('inert', at < reel.length && Boolean(after))
    const leaving = after ? clamp((scene.end - at) / 450) : 1
    card.element.style.opacity = String(cuts ? Number(leaving > 0) : easeOut(leaving))
    for (const piece of card.pieces) {
      const p = still ? 1 : easeOut(clamp((u - piece.at) / (piece.kind === 'draw' ? 1300 : 700)))
      if (piece.kind === 'draw') {
        piece.element.style.setProperty('--drawn', String(p))
        piece.element.style.opacity = String(Number(p > 0))
      }
      else {
        piece.element.style.opacity = String(p)
        piece.element.style.translate = `0 ${((1 - p) * 0.3).toFixed(3)}em`
      }
    }
  }
  // The window and what is said beside it: they rise in after a card and fade out before one; between tasks, they
  // stay and the frames cross.
  const task = scene.kind === 'task'
  win.hidden = side.hidden = !task
  const frame = task ? shown.get(i) : undefined
  for (const other of shown.values()) other.element.style.opacity = '0'
  if (!task || !frame) {
    ring.style.opacity = pointer.style.opacity = '0'
    speak(scene.kind === 'card' ? [scene.title, scene.line, ...scene.facts ?? []].filter(Boolean).join(' ') : '')
    return
  }
  const enter = before?.kind === 'task' || cuts ? 1 : easeOut(clamp(u / 800))
  const leave = after?.kind === 'task' || !after || cuts ? 1 : easeOut(clamp((scene.end - at) / 500))
  win.style.opacity = side.style.opacity = String(Math.min(enter, leave))
  win.style.translate = `0 ${((1 - enter) * 40).toFixed(1)}px`
  const crossIn = before?.kind === 'task' && !cuts ? clamp(u / 450) : 1
  const crossOut = after?.kind === 'task' && !cuts ? clamp((scene.end - at) / 350) : 1
  frame.element.style.opacity = String(Math.min(crossIn, crossOut))
  if (part.textContent !== scene.chapter) part.textContent = scene.chapter
  const holds = /** @type {TaskTime} */ (reel.tasks[i]).holds
  // The conversation scrolled to what a stop points at, then the ring round it and the pointer.
  scrollAt(holds, frame, u)
  const hold = holds.find((one) => one.start <= u && u < one.end)
  const target = hold?.stop.on ? frame.find(hold.stop.on) : null
  if (hold && target) {
    const box = boxOf(target)
    const p = clamp((u - hold.start - POINT * 0.6) / 250) * clamp((hold.end - u) / 200)
    Object.assign(ring.style, { opacity: String(still ? Number(p > 0) : p), translate: `${box.x - 6}px ${box.y - 6}px`, width: `${box.width + 12}px`, height: `${box.height + 12}px` })
  } else ring.style.opacity = '0'
  const clicks = [...holds.filter(({ stop }) => stop.click).map(({ end }) => ({ at: end })), ...reel.tasks[i]?.asks.map(({ time: when }) => ({ at: when })) ?? []]
  const hand = pointerAt(holds, frame, u, clicks)
  pointer.style.opacity = String(hand.shown * Math.min(leave, crossOut))
  pointer.style.translate = `${hand.x.toFixed(1)}px ${hand.y.toFixed(1)}px`
  pointer.style.scale = String(1 - 0.16 * hand.press)
  ripple.style.translate = pointer.style.translate
  ripple.style.opacity = String(hand.rippled >= 0 ? (1 - hand.rippled) * 0.7 : 0)
  ripple.style.scale = String(0.3 + Math.max(hand.rippled, 0) * 1.4)
  // What is said: the words of the last stop reached, rising one after the other, there until the next stop's.
  const told = holds.findLast((one) => one.stop.say && one.start <= u)
  if (told !== telling.hold) {
    telling.hold = told
    telling.pieces = []
    const text = told?.stop.say ?? ''
    // Smaller as it has more to say, a character of Chinese, Japanese or Korean counting for two.
    const weight = [...text].reduce((sum, c) => sum + (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(c) ? 2 : 1), 0)
    caption.style.fontSize = `${Math.round(lerp(46, 31, clamp((weight - 45) / 70)))}px`
    caption.replaceChildren(text ? rising(text, 0, telling.pieces, 40) : '')
  }
  for (const piece of telling.pieces) {
    const p = still || !told ? 1 : easeOut(clamp((u - told.start - piece.at) / 500))
    piece.element.style.opacity = String(p)
    piece.element.style.translate = `0 ${((1 - p) * 0.3).toFixed(3)}em`
  }
  speak(told?.stop.say ?? '')
}

/** The stop whose words show beside the window, and their pieces. @type {{ hold: Hold | undefined, pieces: Piece[] }} */
const telling = { hold: undefined, pieces: [] }

let said = ''
/** Words for a screen reader, once each time they change. @param {string} words */
function speak (words) {
  if (words === said || exporting) return
  said = words
  spoken.textContent = words
}

/** The time, the chapter and where the bar is, as the reel stands. */
function status () {
  const i = sceneAt(time)
  const at = format(time)
  const all = format(reel.length)
  const text = fill('time', { now: at, all })
  if (clock.textContent !== `${at} / ${all}`) clock.textContent = `${at} / ${all}`
  clock.setAttribute('aria-label', text)
  const name = fill('chapter', { n: new Intl.NumberFormat(reel.lang).format(i + 1), count: new Intl.NumberFormat(reel.lang).format(reel.scenes.length), chapter: reel.scenes[i].chapter })
  if (chapter.textContent !== reel.scenes[i].chapter) chapter.textContent = reel.scenes[i].chapter
  if (document.activeElement !== seek) seek.value = String(Math.round(time))
  seek.setAttribute('aria-valuetext', `${text} · ${name}`)
  ;[...marks.children].forEach((mark, k) => {
    const { start, end } = reel.scenes[k]
    const played = /** @type {HTMLElement} */ (mark.firstElementChild)
    played.style.scale = `${clamp((time - start) / (end - start))} 1`
  })
}

/** A time as a player's clock shows it, 0:42, in the reel's language's digits. @param {number} ms */
function format (ms) {
  const seconds = Math.floor(ms / 1000)
  return `${new Intl.NumberFormat(reel.lang).format(Math.floor(seconds / 60))}:${new Intl.NumberFormat(reel.lang, { minimumIntegerDigits: 2 }).format(seconds % 60)}`
}

// ─── Frames as the reel goes ─────────────────────────────────────────────────

/** The tasks' frames the reel's time needs: the one on and the next, made ahead, and none other; after going back, a new one played up to now. */
function frames () {
  const i = sceneAt(time)
  const wanted = new Set([i, i + 1].filter((k) => reel.scenes[k]?.kind === 'task'))
  if (exporting) for (const [k, scene] of reel.scenes.entries()) if (scene.kind === 'task') wanted.add(k)
  for (const [k, frame] of [...shown]) {
    if (!wanted.has(k)) { frame.remove(); shown.delete(k) }
  }
  for (const k of wanted) {
    const frame = shown.get(k)
    if (!frame) shown.set(k, new Frame(k))
    // Gone past where the reel is now: a new one plays up to it behind it, and takes its place once it has.
    else if (frame.reached > time && !coming.has(k)) coming.set(k, new Frame(k))
  }
  for (const [k, next] of [...coming]) {
    if (!wanted.has(k)) { next.remove(); coming.delete(k); continue }
    if (!next.caught) continue
    shown.get(k)?.remove()
    shown.set(k, next)
    coming.delete(k)
  }
}

// ─── The clock ───────────────────────────────────────────────────────────────

let last = 0
/** One frame of the reel: its time moved on as far as the clock went at its speed, then what that time shows. @param {number} now */
function tick (now) {
  if (playing) {
    time = Math.min(reel.length, time + (now - last) * rate)
    if (time >= reel.length) pause()
  }
  last = now
  frames()
  flush()
  animations()
  draw()
  status()
  requestAnimationFrame(tick)
}

/** Jean's own animations in the frames (a message coming in, a chart drawing) keep the reel's time: paused with it, at its speed; exported, frame by frame. */
function animations () {
  for (const frame of shown.values()) {
    const doc = frame.document
    if (!doc) continue
    for (const animation of doc.getAnimations()) {
      if (exporting) {
        if (!born.has(animation)) born.set(animation, time - (Number(animation.currentTime) || 0))
        animation.pause()
        animation.currentTime = (time - /** @type {number} */ (born.get(animation))) * animation.playbackRate
      } else {
        // Paused, what was moving holds still; what a seek made while paused (a message coming in) is shown done.
        const known = seen.has(animation)
        seen.add(animation)
        if (animation.playbackRate !== rate) animation.playbackRate = rate
        if (!playing && !known && Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish()
        else if (!playing && animation.playState === 'running') animation.pause()
        else if (playing && animation.playState === 'paused') animation.play()
      }
    }
  }
}
/** When each of Jean's animations started, in the reel's time, for an export; and each one already seen. @type {WeakMap<Animation, number>} */
const born = new WeakMap()
/** @type {WeakSet<Animation>} */
const seen = new WeakSet()

function play () {
  poster = null
  if (time >= reel.length) seekTo(0)
  playing = true
  score ??= new Score(scoreOf(reel))
  score.play(time, rate, muted)
  labels()
}

function pause () {
  playing = false
  score?.pause()
  labels()
}

/** @param {number} at */
function seekTo (at) {
  poster = null
  time = clamp(at, 0, reel.length)
  score?.seek(time)
  frames()
  labels()
}

/** @param {number} value */
function setRate (value) {
  rate = value
  keep('speed', String(value))
  score?.rate(rate, time)
  menus()
}

/** The reel in another language, going on where it was in its scene. @param {string} code */
async function setLanguage (code) {
  const [i, was] = [sceneAt(time), playing]
  const into = (time - reel.scenes[i].start) / (reel.scenes[i].end - reel.scenes[i].start)
  pause()
  reel = await load(code)
  for (const frame of [...shown.values(), ...coming.values()]) frame.remove()
  shown.clear()
  coming.clear()
  score = null
  history.replaceState(null, '', `#${new URLSearchParams({ ...Object.fromEntries(params), lang: reel.lang })}`)
  build()
  const scene = reel.scenes[Math.min(i, reel.scenes.length - 1)]
  seekTo(scene.start + into * (scene.end - scene.start))
  if (was) play()
}

/** The score's plan of the reel: its scenes, and where the pointer clicks. @param {Reel} at */
function scoreOf (at) {
  const clicks = at.scenes.flatMap((scene, i) => {
    const task = at.tasks[i]
    return task ? [...task.holds.filter(({ stop }) => stop.click).map(({ end }) => scene.start + end), ...task.asks.map(({ time: t }) => scene.start + t)] : []
  })
  return { length: at.length, scenes: at.scenes.map(({ kind, start, end, ...scene }) => ({ kind, look: kind === 'card' ? /** @type {Card} */ (scene).look : undefined, start, end })), clicks }
}

// ─── Controls ────────────────────────────────────────────────────────────────

const toggling = () => (playing ? pause() : play())
for (const button of [toggle, big]) button.addEventListener('click', toggling)
stage.addEventListener('click', (event) => { if (!/** @type {Element} */ (event.target).closest('a')) toggling() })
stage.addEventListener('dblclick', () => fullScreen())
sound.addEventListener('click', () => {
  muted = !muted
  keep('muted', String(muted))
  score?.mute(muted, time)
  labels()
})
full.addEventListener('click', () => fullScreen())
let wasPlaying = false
seek.addEventListener('pointerdown', () => { wasPlaying = playing; if (playing) pause() })
seek.addEventListener('input', () => seekTo(Number(seek.value)))
seek.addEventListener('change', () => { if (wasPlaying) play(); wasPlaying = false })
for (const [button, menu] of /** @type {const} */ ([[speed, speeds], [language, languages]])) {
  menu.addEventListener('toggle', (event) => {
    const open = /** @type {ToggleEvent} */ (event).newState === 'open'
    button.setAttribute('aria-expanded', String(open))
    if (!open) return
    // Above its button, its end with the button's; in a frame too short for all its rows, they go on in a column
    // beside, as few as fit and none left alone, so a short player cuts none of it.
    const box = button.getBoundingClientRect()
    const room = box.top - 16
    menu.style.insetBlockEnd = `${innerHeight - box.top + 8}px`
    menu.style.insetInlineEnd = `${root.dir === 'rtl' ? box.left : innerWidth - box.right}px`
    const list = /** @type {HTMLElement} */ (menu.firstElementChild)
    const count = list.children.length
    menu.style.maxBlockSize = ''
    menu.style.setProperty('--rows', String(count))
    const [row, edges] = [list.offsetHeight / count, menu.offsetHeight - list.offsetHeight]
    const fit = Math.max(1, Math.floor((room - edges) / row))
    menu.style.setProperty('--rows', String(Math.ceil(count / Math.ceil(count / fit))))
    menu.style.maxBlockSize = `${Math.max(room, 0)}px`
    const chosen = /** @type {HTMLElement | null} */ (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button'))
    chosen?.focus()
  })
  menu.addEventListener('keydown', (event) => {
    const rows = [...menu.querySelectorAll('button')]
    const at = rows.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement))
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: rows.length - 1 }[event.key]
    if (to === undefined) return
    event.preventDefault()
    rows[(to + rows.length) % rows.length]?.focus()
  })
}

/** Full screen, or the window filled where a browser can't (an iPhone). */
function fullScreen () {
  if (document.fullscreenElement) document.exitFullscreen()
  else if (main.classList.contains('is-full')) main.classList.remove('is-full')
  else if (main.requestFullscreen) main.requestFullscreen().catch(() => main.classList.add('is-full'))
  else main.classList.add('is-full')
  labels()
}
document.addEventListener('fullscreenchange', labels)

/** A chapter's start, from the one on: the next, or this one's start, or the one before when it has only just started. @param {number} by */
function chapterBy (by) {
  const i = sceneAt(time)
  const k = by < 0 && time - reel.scenes[i].start > 1500 ? i : clamp(i + by, 0, reel.scenes.length - 1)
  seekTo(reel.scenes[k].start)
}

addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || /** @type {Element} */ (event.target).closest('.reel-menu')) return
  const onControl = /** @type {Element} */ (event.target).closest('button, a, input')
  const forward = root.dir === 'rtl' ? -1 : 1
  /** @type {Record<string, () => void>} */
  const keys = {
    ' ': () => !onControl && toggling(),
    k: toggling,
    m: () => sound.click(),
    f: () => fullScreen(),
    j: () => seekTo(time - 10_000),
    l: () => seekTo(time + 10_000),
    ArrowLeft: () => seekTo(time - 5000 * forward),
    ArrowRight: () => seekTo(time + 5000 * forward),
    Home: () => seekTo(0),
    End: () => seekTo(reel.length),
    PageUp: () => chapterBy(-1),
    PageDown: () => chapterBy(1),
    '<': () => setRate(SPEEDS[Math.max(0, SPEEDS.indexOf(rate) - 1)] ?? 1),
    '>': () => setRate(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(rate) + 1)] ?? 1),
  }
  const key = /^\d$/.test(event.key) ? 'digit' : event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (key === 'digit') return seekTo((reel.length * Number(event.key)) / 10)
  const run = keys[key] ?? keys[event.key]
  // The bar moves itself with its keys; a button presses itself with Space.
  if (!run || (onControl && key === ' ') || (event.target === seek && /^(Arrow|Home|End)/.test(event.key))) return
  event.preventDefault()
  run()
  awake()
})

/** The controls show while the pointer moves or a key is pressed, and go once it rests while the reel plays. */
let resting = 0
function awake () {
  delete main.dataset.idle
  clearTimeout(resting)
  resting = setTimeout(() => { if (playing && !controls.matches(':focus-within')) main.dataset.idle = '' }, 2500)
}
main.addEventListener('pointermove', awake)
main.addEventListener('focusin', awake)

// ─── Starting, and what another page or an export asks ───────────────────────

/** Whether every task's frame has its task and waits on the reel (an export makes them all first). */
const ready = async () => {
  while (![...shown.values()].every((frame) => frame.started) || !shown.size) await new Promise((resolve) => setTimeout(resolve, 50))
  await Promise.all([document, ...[...shown.values()].map((frame) => frame.document)].map((doc) => doc?.fonts.ready))
}

/** What another page, demo.js in a frame or an export reaches of the player. @type {any} */
const shared = globalThis
shared.reel = {
  /** What demo.js in one of the reel's frames is lent, or nothing for any other window. @param {Window} asking */
  lend (asking) {
    for (const frame of [...shown.values(), ...coming.values()]) if (frame.element.contentWindow === asking) return frame.lender()
    return undefined
  },
  get length () { return reel?.length ?? 0 },
  /** Each scene's kind, chapter, start and end. */
  scenes () { return reel.scenes.map(({ kind, chapter, start, end }) => ({ kind, chapter, start, end })) },
  /** What each task's frame has played, and what the reel waits to end: for a test, or a curious reader. */
  state () {
    return {
      time,
      playing,
      frames: [...shown.values()].map(({ index, started, asked, next, reached, drift, task }) => ({ index, started, asked, next, calls: task.calls.length, reached, drift })),
      queued: queue.items.map((item) => ({ time: item.time, kind: item.kind, frame: item.frame.index })),
    }
  },
  get time () { return time },
  ready,
  /** Once the replays have caught up with the reel's time and drawn it: what an export waits for before each picture. */
  async settled () {
    await flush()
    await turn()
    draw()
  },
  /** Plays from the start for an export, its clock Playwright's. */
  record () { playing = true; last = performance.now() },
}

reel = await load(params.get('lang') ?? 'en')
build()
// Before the first play: the first card as it stands once drawn, under the button that plays it.
time = Number(params.get('t') ?? 0) * 1000
if (!time && !exporting && reel.scenes[0].kind === 'card') poster = Math.min(2600, reel.scenes[0].end - 500)
requestAnimationFrame((now) => { last = now; tick(now) })
if (params.has('autoplay') && !still && !exporting) { muted = true; play() }
