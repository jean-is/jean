// Slides (D591): decks drawn by deck (@codename/deck, Jean's own library), Slidev's Markdown read liberally. In an answer, a
// ```deck block, drawn slide by slide as it is written, the slide being written on show, then the first unless the user paged;
// paged with its bar or a clicker's keys, presented full screen, with the presenter's view and all slides at once. Beside the
// conversation, a deck kept as a file of the project's (caps/skills/decks.js), changed three ways: by typing on a slide (a double
// click on its words), as its Markdown beside the slides (Text), or by asking Jean, whose version waits for the user to accept
// or reject it slide by slide (D505), the brain told of the deck on show, its slide and the part pointed at; its Layout menu
// lays a slide out again from the deck's kit (./kit.js), and Save takes it out (./save.js). A chart is Charts' own, drawn in SVG
// for PowerPoint's writer to read; a diagram Pele's, drawn in a worker (D592) and shown as a picture, as its SVG holds style
// attributes. Loaded by the first deck shown; until then it shows as code.
import { html, render, nothing, svg } from 'lit-html'
import { effect, signal } from '@preact/signals-core'
import { createDeck, labelOf } from '@codename/deck'
import { Marked } from 'marked'
import { app, theme, notify } from '../../ui/state.js'
import { copyDrawing, pictureOf } from '../../ui/save.js'
import { drawn } from '../../ui/markdown.js'
import { drawnActions, register, unlock } from '../../ui/caps.js'
import { icon } from '../../ui/icons.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { scriptURL } from '../../ui/trusted.js'
import { reviewBar } from '../../ui/review.js'
import { noteRecord } from '../../core/events.js'
import { t, useStrings, locale, intlLocales } from '../../core/i18n.js'
import { kitHere } from './kit.js'
import { cjk } from '../layouts/shapes.js'
import { withLayout, withoutKit, changesOf, swapped } from './edit.js'

await Promise.all([useStrings('slides'), styleSheet(new URL('../../vendor/deck/deck.css', import.meta.url)), styleSheet(new URL('slides.css', import.meta.url))])

/** A deck kept, as the preview opens it (caps/skills/decks.js): its place, name and Markdown, Jean's version waiting, and how either is written. @typedef {{ path: string, name: string, source: string, theirs: string | null, keep: (mine: string, theirs: string | null) => Promise<unknown> }} Kept */
/** @typedef {ReturnType<typeof import('@codename/deck').createDeck>} DeckView */

/** The deck on show beside the conversation, which the brain hears of, its slide and the words pointed at. */
export const shown = signal(/** @type {{ path: string, name: string, source: string, at: number, count: number, part: string } | null} */ (null))

/** A slide's Markdown read as an answer's is, emphasis beside the punctuation of Chinese, Japanese and Korean too (D590). */
const reader = new Marked({ gfm: true }, cjk)
/** The bar's words, deck's names for them (its scheme's and PowerPoint's buttons aren't shown: the room says light or dark, Save says the rest). */
const words = () => Object.fromEntries(['deck', 'previous', 'next', 'where', 'present', 'presenter', 'overview', 'edit', 'source', 'notes', 'noNotes', 'upNext', 'last', 'slide', 'carousel'].map((key) => [key, t(`slides.${key}`)]))
const LAYOUT = icon(svg`<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M3.5 9.5h17M12 9.5v9"/>`)

/** Pele, in its worker, once a diagram shows: an SVG for Mermaid's language. @type {Worker | null} */
let worker = null
const asked = /** @type {Map<number, { resolve: (svg: string) => void, reject: (error: Error) => void }>} */ (new Map())
/** @param {string} source @param {object} options @returns {Promise<string>} */
const peled = (source, options) => new Promise((resolve, reject) => {
  if (!worker) {
    worker = new Worker(scriptURL(new URL('diagram-worker.js', import.meta.url)), { type: 'module' })
    worker.onmessage = ({ data }) => { const one = asked.get(data.id); asked.delete(data.id); if (data.svg) one?.resolve(data.svg); else one?.reject(new Error(data.error)) }
  }
  const id = asked.size + Date.now()
  asked.set(id, { resolve, reject })
  worker.postMessage({ id, source, options })
})

/** A diagram's picture, its colours the deck's as Pele's own properties inside it, its words the picture's text. @param {HTMLImageElement} picture @param {string} drawing */
function colour(picture, drawing) {
  const look = getComputedStyle(picture), deck = (/** @type {string} */ name) => look.getPropertyValue(`--deck-${name}`).trim()
  const props = { bg: 'transparent', fg: deck('ink'), muted: deck('muted'), line: deck('muted'), surface: deck('soft'), 'surface-alt': deck('line'), border: deck('primary'), accent: deck('primary'), font: deck('body').replace(/[<>"]/g, '') }
  picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.replace(/^(<svg\b[^>]*>)/, `$1<style>svg{${Object.entries(props).map(([name, value]) => `--pele-${name}:${value}`).join(';')}}</style>`))}`
}

/** Jean's drawers of a deck's fenced blocks. @type {Record<string, (box: HTMLElement, source: string) => void | Promise<void>>} */
export const BLOCKS = {
  // Charts' own element, in SVG, the chart it draws being what PowerPoint's writer reads (`box.chart`); in the deck's colours, unless it names its own.
  echarts: async (box, source) => {
    await unlock('charts')
    const chart = document.createElement('app-chart'), look = getComputedStyle(box), series = [1, 2, 3, 4, 5, 6].map((n) => look.getPropertyValue(`--deck-series-${n}`).trim())
    let option = null
    try { option = JSON.parse(source) } catch {}
    // Read the way the deck reads: in a language written from the right, its categories start there and its values stand on the right.
    const mirrored = (/** @type {any} */ axes, /** @type {object} */ turn) => (look.direction === 'rtl' && axes ? [axes].flat().map((axis) => ({ ...axis, ...turn })) : axes)
    chart.setAttribute('source', option && typeof option === 'object' ? JSON.stringify({ ...(series[0] && !option.color && { color: series }), ...option,
      xAxis: mirrored(option.xAxis, { inverse: true }), yAxis: mirrored(option.yAxis, { position: 'right' }) }) : source)
    chart.setAttribute('svg', '')
    Object.defineProperty(box, 'chart', { get: () => /** @type {any} */ (chart).chart, configurable: true })
    box.append(chart)
  },
  mermaid: async (box, source) => {
    const font = getComputedStyle(box).getPropertyValue('--deck-body').trim() || 'system-ui, sans-serif'
    const drawing = await peled(source, { fontFamily: font, links: false, images: false, autoDirection: true, maxWidth: Math.max(320, box.clientWidth * 1.4) })
    const picture = Object.assign(document.createElement('img'), { alt: source }), place = Object.assign(document.createElement('div'), { className: 'deck-diagram' })
    place.append(picture)
    box.append(place)
    pictures.set(picture, drawing)
    colour(picture, drawing)
  },
}
/** The slide of Jean's version a change shows on: its first, or for slides taken away, the one before where they were. @param {{ theirs: [number, number] }} change */
const placeOf = ({ theirs: [from, to] }) => (from === to ? Math.max(0, from - 1) : from)
/** Each diagram drawn and its SVG, coloured again when the deck's colours change. */
const pictures = /** @type {WeakMap<HTMLImageElement, string>} */ (new WeakMap())

class AppSlides extends HTMLElement {
  static observedAttributes = ['source', 'open']
  /** @type {DeckView | null} */
  view = null
  /** Beside the conversation: the deck kept, which its changes are written to. @type {Kept | null} */
  file = null
  /** Once the user pages, the deck stays where they are. */
  paged = false
  /** While deciding on Jean's version: the user's deck shown instead of it. */
  theirsHidden = false
  /** What the deck was made with: the look, light or dark, and the language. */
  made = ''
  timer = 0
  /** @type {(() => void) | undefined} */
  unwatch

  connectedCallback() {
    // Made again in another look or language, its scheme set again in light or dark.
    this.unwatch = effect(() => {
      const made = [app.look.value, app.settings.value.look?.accent, locale.value].join(' ')
      if (this.made && made !== this.made) this.remake()
      this.view?.setScheme(theme.value === 'dark' ? 'dark' : 'light')
    })
    this.draw()
  }

  disconnectedCallback() {
    this.unwatch?.()
    this.view?.destroy()
    this.view = null
    this.made = ''
    if (this.file && shown.peek()?.path === this.file.path) shown.value = null
  }

  attributeChangedCallback() {
    clearTimeout(this.timer)
    // While the answer writes it, drawn a few times a second, its charts with it.
    this.timer = setTimeout(() => this.draw(), this.hasAttribute('open') ? 250 : 0)
  }

  /** What is on show: the answer's block, else Jean's version waiting, else the deck kept. */
  get source() { return this.file ? (this.file.theirs && !this.theirsHidden ? this.file.theirs : this.file.source) : this.getAttribute('source') ?? '' }

  remake() {
    this.view?.destroy()
    this.view = null
    this.draw()
  }

  async draw() {
    if (!this.isConnected) return
    if (this.view) {
      if (this.source !== this.view.source) this.view.setSource(this.source)
    } else {
      const deciding = Boolean(this.file?.theirs)
      this.made = [app.look.peek(), app.settings.peek().look?.accent, locale.peek()].join(' ')
      const kit = await kitHere()
      if (this.view || !this.isConnected) return
      render(html`${this.file ? html`<div class="slides-review"></div>` : nothing}<div class="slides-deck"></div><div class="slides-more"></div>`, /** @type {HTMLElement} */ (this))
      const root = /** @type {HTMLElement} */ (this.querySelector('.slides-deck'))
      this.view = createDeck(root, { source: this.source, kit, scheme: theme.peek() === 'dark' ? 'dark' : 'light', blocks: BLOCKS, strings: words(), headings: 'aria', lex: (markdown) => reader.lexer(markdown),
        editable: Boolean(this.file) && !deciding, ...(this.file && !deciding && { onChange: (text) => this.typed(text) }) })
      root.addEventListener('deck-scheme', () => { for (const picture of root.querySelectorAll('img')) { const drawing = pictures.get(picture); if (drawing) colour(picture, drawing) } })
      root.addEventListener('deck-move', () => this.moved())
      for (const kind of ['pointerdown', 'keydown']) root.addEventListener(kind, () => { this.paged = true })
      root.querySelector('.deck-stage')?.addEventListener('click', (event) => this.pointed(event))
      // Jean's own buttons after deck's, in its bar.
      root.querySelector('.deck-bar')?.append(/** @type {Element} */ (this.querySelector('.slides-more')))
    }
    if (!this.paged) this.view.go(this.hasAttribute('open') ? this.view.deck.slides.length - 1 : this.file?.theirs ? this.firstChange() : 0)
    this.paint()
  }

  /** Jean's buttons, and the bar over Jean's version: each slide it changes, adds or takes away, accepted or rejected. */
  paint() {
    const { view, file } = this
    if (!view) return
    const source = view.source
    const more = this.querySelector('.slides-more'), review = this.querySelector('.slides-review')
    if (more instanceof HTMLElement) render(file ? html`${this.layouts()}` : html`<button type="button" class="icon-button subtle" aria-label=${t('action.copy')}
        @click=${() => copyDrawing(source, this.picture()).then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))}>${icons.copy}</button>
      ${drawnActions('deck', source)}`, more)
    if (!(review instanceof HTMLElement) || !file) return
    const changes = file.theirs ? changesOf(file.source, file.theirs) : [], at = view.at
    for (const [i, slide] of view.slides().entries()) slide.classList.toggle('is-jean', !this.theirsHidden && changes.some((change) => i >= change.theirs[0] && i < change.theirs[1]))
    const here = changes.find((change) => placeOf(change) === at || (at >= change.theirs[0] && at < change.theirs[1]))
    const number = new Intl.NumberFormat(intlLocales()).format
    render(changes.length ? html`${reviewBar({ label: t('slides.review'), count: t('slides.changed', { count: changes.length }),
        go: changes.length > 1 ? (step) => this.goTo(changes[(changes.indexOf(here ?? changes[0]) + step + changes.length) % changes.length]) : null,
        previous: t('slides.previousChange'), next: t('slides.nextChange'), acceptAll: t('slides.acceptAll'), rejectAll: t('slides.rejectAll'),
        accept: () => this.decide(changes, true), reject: () => this.decide(changes, false) })}
      ${here ? html`<p class="slides-change"><span>${here.theirs[0] === here.theirs[1] ? t('slides.removed', { n: number(here.mine[0] + 1) }) : here.mine[0] === here.mine[1] ? t('slides.added') : t('slides.jeans')}</span>
        <button type="button" class="button subtle" aria-pressed=${String(this.theirsHidden)} @click=${() => { this.theirsHidden = !this.theirsHidden; this.draw() }}>${t('slides.before')}</button>
        <button type="button" class="button" @click=${() => this.decide([here], false)}>${t('slides.reject')}</button>
        <button type="button" class="button primary" @click=${() => this.decide([here], true)}>${t('slides.accept')}</button></p>` : nothing}` : nothing, review)
  }

  /** Where the first of Jean's changes is. */
  firstChange() { return ((first) => (first ? Math.min(placeOf(first), (this.view?.deck.slides.length ?? 1) - 1) : 0))(this.file?.theirs ? changesOf(this.file.source, this.file.theirs)[0] : undefined) }

  /** @param {{ theirs: [number, number] }} change */
  goTo(change) { this.view?.go(Math.min(placeOf(change), (this.view?.deck.slides.length ?? 1) - 1)); this.paint() }

  /**
   * Jean's changes accepted, into the user's deck, or rejected, out of Jean's version, the last first so that where the others
   * are holds; the deck as the user has it once none is left. @param {{ mine: [number, number], theirs: [number, number] }[]} changes @param {boolean} yes
   */
  async decide(changes, yes) {
    const file = this.file
    if (!file?.theirs) return
    let mine = file.source, theirs = file.theirs
    for (const change of [...changes].sort((a, b) => b.theirs[0] - a.theirs[0])) {
      if (yes) mine = swapped(mine, change.mine, theirs, change.theirs)
      else theirs = swapped(theirs, change.theirs, mine, change.mine)
    }
    const left = changesOf(mine, theirs).length ? theirs : null
    this.file = { ...file, source: mine, theirs: left }
    this.theirsHidden = false
    await file.keep(mine, left)
    if (left) this.draw()
    else this.remake()
    notify(t(yes ? 'slides.accepted' : 'slides.rejected'))
  }

  /** Typed on a slide or as its Markdown: written a moment after the last key. @param {string} text */
  typed(text) {
    const file = this.file
    if (!file) return
    this.file = { ...file, source: text }
    clearTimeout(this.timer)
    this.timer = setTimeout(() => file.keep(text, null), 400)
    this.moved()
  }

  /** The Layout menu: the kit's layouts that hold what the slide holds, the one it is laid out by checked. */
  layouts() {
    const view = this.view, slide = view?.deck.slides[view.at]
    if (!view || !slide || this.file?.theirs) return nothing
    const used = slide.slots.map((slot) => slot.name), now = view.slides()[view.at]?.dataset.layout
    const fits = Object.entries(view.kit.layouts).filter(([name, layout]) => used.every((one) => layout.slots.includes(one)) && (!/^image/.test(name) || slide.settings.image))
    return html`<button type="button" class="icon-button subtle" popovertarget="slides-layouts" aria-label=${t('slides.layout')}>${LAYOUT}</button>
      <div id="slides-layouts" class="menu" role="menu" popover>${fits.map(([name, layout]) => html`<button type="button" role="menuitemradio" aria-checked=${String(name === now)}
        popovertarget="slides-layouts" popovertargetaction="hide" @click=${() => name !== now && view.setSource(withLayout(view.source, view.at, name))}>${icons.check}${labelOf(layout, name, locale.peek())}</button>`)}</div>`
  }

  /** The words the user points at on a slide, for the brain to know: a click on a part, nothing elsewhere. @param {Event} event */
  pointed(event) {
    const part = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-edit]'))
    for (const one of this.querySelectorAll('.is-pointed')) one.classList.remove('is-pointed')
    part?.classList.add('is-pointed')
    this.moved(part?.textContent?.trim().slice(0, 200) ?? '')
  }

  /** Where the deck on show is, for the brain. @param {string} [part] */
  moved(part) {
    const { view, file } = this
    if (!view || !file) return
    shown.value = { path: file.path, name: file.name, source: withoutKit(file.source), at: view.at, count: view.deck.slides.length, part: part ?? (shown.peek()?.path === file.path ? shown.peek()?.part ?? '' : '') }
    this.paint()
  }

  /**
   * The slide shown as a picture to put in a document: a copy of it with each element's style as it is drawn now, in an SVG's
   * foreignObject; a chart as its picture. @returns {Promise<Blob>}
   */
  async picture() {
    const slide = /** @type {HTMLElement} */ (this.querySelector('.deck-slide.is-shown'))
    const copy = /** @type {HTMLElement} */ (slide.cloneNode(true))
    const copies = [copy, ...copy.querySelectorAll('*')]
    for (const [i, element] of [slide, ...slide.querySelectorAll('*')].entries()) {
      const style = getComputedStyle(element)
      const into = /** @type {HTMLElement} */ (copies[i])
      for (const name of style) into.style?.setProperty(name, style.getPropertyValue(name))
      if (element instanceof HTMLCanvasElement) into.replaceWith(Object.assign(new Image(element.clientWidth), { src: element.toDataURL() }))
    }
    const { width, height } = slide.getBoundingClientRect()
    return pictureOf(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(copy)}</foreignObject></svg>`, width, height)
  }
}

customElements.define('app-slides', AppSlides)
/** @param {string} source @param {boolean} open */
const deck = (source, open) => html`<app-slides source=${source} ?open=${open}></app-slides>`
/** A deck fenced as brains fence one (D591), as Markdown or Slidev's: a deck once it has two rules, else the code it is. @param {string} source @param {boolean} open */
const fenced = (source, open) => (/^---[ \t]*\n[\s\S]*^---[ \t]*$/m.test(source) ? deck(source, open) : html`<pre dir="ltr" tabindex="0"><code>${source}</code></pre>`)
drawn.value = { ...drawn.peek(), deck, markdown: fenced, md: fenced, slidev: fenced }

/**
 * The note a message comes with while a deck is on show and the brain hasn't heard of it as it is: its place, the slide on show,
 * the words pointed at, and its Markdown, to write again whole with what is asked changed. @param {import('../../core/types.js').Envelope[]} records
 */
function notes(records) {
  const one = shown.peek()
  if (!one) return []
  const text = `The deck ${one.name} (${one.path}) is open beside the conversation, on slide ${one.at + 1} of ${one.count}.${one.part ? ` The user points at its words "${one.part}".` : ''} As it is now:\n\n\`\`\`\`deck\n${one.source.trim()}\n\`\`\`\`\n\nTo change it, write it again whole in a \`\`\`\`deck block with only what is asked changed: the user accepts or rejects each slide you change.`
  const last = records.findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'deck')
  return last?.update?.sessionUpdate === '_system_note' && last.update.text === text ? [] : [noteRecord(text, { kind: 'deck', uri: one.path })]
}

/** Save's menu, once its module is in (./save.js). */
const saving = signal(/** @type {((file: { uri: string, name: string }) => unknown) | null} */ (null))
register({ id: 'slides', slots: { modes: { at: 12, draw: () => null, notes },
  head: { at: 2, draw: (/** @type {{ uri: string, name: string }} */ file) => (/^decks\//.test(file.uri) ? (saving.value ?? (import('./save.js').then((module) => { saving.value = module.saveMenu }), () => nothing))(file) : nothing) } } })
