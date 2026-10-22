// Slides (D200): a ```marp block in an answer, read as Marp writes a deck (./deck.js) and shown a
// slide at a time, in the room's colours, its type sized with its width: paged with its buttons or
// the arrow keys, presented full screen, printed one slide under another, and copied as its source
// and the slide's picture at once.
// While the answer writes it, the slide being written shows; once written, the first, unless the
// user has paged. Loaded by the first deck an answer holds; until then it shows as code.
import { html, render, nothing } from 'lit-html'
import { notify } from '../../ui/state.js'
import { copyDrawing, pictureOf } from '../../ui/save.js'
import { drawn } from '../../ui/markdown.js'
import { drawnActions } from '../../ui/caps.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { lex, blocks, inline } from '../../ui/markdown.js'
import { t, locale, useStrings } from '../../core/i18n.js'
import { readDeck } from './deck.js'

await Promise.all([useStrings('slides'), styleSheet(new URL('slides.css', import.meta.url))])

/** Marp's classes the room's look draws: a title in the middle, and the colours swapped. */
const CLASSES = ['lead', 'invert']

/** A slide's own colours, as the properties its style reads, when they are colours. @param {Record<string, string>} settings */
const colours = (settings) => [['--slide-paper', settings.backgroundColor], ['--slide-ink', settings.color]]
  .filter(([, colour]) => colour && CSS.supports('color', colour)).map(([name, colour]) => `${name}: ${colour}`).join('; ')

/** @param {any} token */
const shown = (token) => token.type === 'heading'
  ? html`<p class="heading h${token.depth}" role="heading" aria-level=${Math.min(6, token.depth + 2)}>${inline(token.tokens)}</p>`
  : blocks([token])

class AppSlides extends HTMLElement {
  static observedAttributes = ['source', 'open']
  /** @type {import('./deck.js').Slide[]} */
  slides = []
  at = 0
  /** Once the user pages, the deck stays where they are. */
  paged = false

  attributeChangedCallback() {
    this.slides = readDeck(this.getAttribute('source') ?? '', lex)
    this.at = this.paged ? Math.min(this.at, this.slides.length - 1) : this.hasAttribute('open') ? this.slides.length - 1 : 0
    this.paint()
  }

  paint() {
    const source = this.getAttribute('source') ?? ''
    const { slides, at } = this
    if (!slides.some((slide) => slide.tokens.length)) {
      return render(html`<p class="drawn-status muted small" role="status"><span class="while">${t('slides.drawing')}</span><span class="failed">${t('slides.failed')}</span></p>
        <pre dir="ltr" tabindex="0"><code>${source}</code></pre>`, this)
    }
    const number = new Intl.NumberFormat(locale.value).format
    // Every slide is laid out, the others hidden behind the one shown: a chart on one is drawn at its size, and all of them print.
    render(html`<div class="slides-stage" tabindex="0" role="region" aria-label=${t('slides.deck')} @keydown=${this.key} @click=${this.clicked}>
        ${slides.map(({ tokens, settings }, i) => html`<section class=${['slide', ...CLASSES.filter((name) => settings.class?.split(/\s+/).includes(name)), ...(i === at ? ['is-shown'] : [])].join(' ')}
          .style=${colours(settings)} role="group" aria-roledescription=${t('slides.slide')} aria-label=${t('slides.where', { n: i + 1, count: slides.length })} dir="auto">
          ${settings.header ? html`<header>${blocks(lex(settings.header))}</header>` : nothing}
          <div class="slide-body">${tokens.map(shown)}</div>
          ${settings.footer ? html`<footer>${blocks(lex(settings.footer))}</footer>` : nothing}
          ${settings.paginate === 'true' ? html`<span class="slide-number">${number(i + 1)}</span>` : nothing}
        </section>`)}
      </div>
      <div class="slides-bar">
        <button class="icon-button subtle back" aria-label=${t('slides.previous')} ?disabled=${at === 0} @click=${() => this.go(at - 1)}>${icons.back}</button>
        <span class="slides-where">${number(at + 1)} / ${number(slides.length)}</span>
        <button class="icon-button subtle" aria-label=${t('slides.next')} ?disabled=${at >= slides.length - 1} @click=${() => this.go(at + 1)}>${icons.arrow}</button>
        ${document.fullscreenEnabled ? html`<button class="icon-button subtle end" aria-label=${t('slides.present')} @click=${() => this.present()}>${icons.fullscreen}</button>` : nothing}
        <button class="icon-button subtle end" aria-label=${t('action.copy')}
          @click=${() => copyDrawing(source, this.picture()).then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))}>${icons.copy}</button>
        ${drawnActions('marp', source)}
      </div>`, this)
  }

  /** @param {number} slide */
  go(slide) {
    this.paged = true
    this.at = Math.max(0, Math.min(this.slides.length - 1, slide))
    this.paint()
  }

  present() {
    const stage = /** @type {HTMLElement} */ (this.querySelector('.slides-stage'))
    stage.requestFullscreen().then(() => stage.focus(), () => {})
  }

  /** The arrow keys, Page Up and Down, Home and End, and the space bar, as a presenter's clicker sends them. @param {KeyboardEvent} event */
  key = (event) => {
    const forward = getComputedStyle(this).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
    const back = forward === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft'
    const to = { [forward]: this.at + 1, PageDown: this.at + 1, ' ': this.at + 1, [back]: this.at - 1, PageUp: this.at - 1, Home: 0, End: this.slides.length - 1 }[event.key]
    if (to === undefined || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    this.go(to)
  }

  /** Presented, a click anywhere but on a link moves on. @param {MouseEvent} event */
  clicked = (event) => {
    if (document.fullscreenElement && !(/** @type {Element} */ (event.target).closest('a, button'))) this.go(this.at + 1)
  }

  /**
   * The slide shown as a picture to put in a document: a copy of it with each element's style as
   * it is drawn now, in an SVG's foreignObject; a chart's canvas as its picture. @returns {Promise<Blob>}
   */
  async picture() {
    const slide = /** @type {HTMLElement} */ (this.querySelector('.slide.is-shown'))
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
drawn.value = { ...drawn.peek(), marp: (source, open) => html`<app-slides source=${source} ?open=${open}></app-slides>` }
