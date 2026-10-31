// Slides (D591): decks drawn by deck (@codename/deck, Jean's own library), Slidev's Markdown read liberally. In an answer, a
// ```deck block, drawn slide by slide as it is written, the slide being written on show, then the first unless the user paged;
// paged with its bar or a clicker's keys, presented full screen, with the presenter's view and all slides at once. Beside the
// conversation, a deck kept as a file of the project's (caps/skills/decks.js), changed three ways: by typing on a slide (a double
// click on its words), as its Markdown beside the slides (Source), or by asking Jean, whose version waits for the user to accept
// or reject it slide by slide (D505), the brain told of the deck on show, its slide and the part pointed at; its Slide layout menu
// lays a slide out again from the deck's kit (./kit.js), and Save takes it out (./save.js). A chart is Charts' own, drawn in SVG
// for PowerPoint's writer to read; a diagram Pele's, as an answer's is (../interactive/diagram.js, D592), shown as a picture in
// the deck's colours; a picture, one of the project's files, which the brain names by the name it made it under, read for it.
// Loaded by the first deck shown; until then it shows as code.
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
import { reviewBar } from '../../ui/review.js'
import { noteRecord, linkedFiles, filesMade, callsIn } from '../../core/events.js'
import { t, useStrings, locale, intlLocales } from '../../core/i18n.js'
import { kitHere, withNames, words } from './kit.js'
import { kitSlot } from './kit-slot.js'
import { cjk } from '../layouts/shapes.js'
import { drawing, coloured, wordsOf } from '../interactive/diagram.js'
import { withLayout, withoutKit, changesOf, swapped, withPictures, namedIn, placeIn } from './edit.js'

await Promise.all([useStrings('slides'), styleSheet(new URL('../../vendor/deck/deck.css', import.meta.url)), styleSheet(new URL('slides.css', import.meta.url))])

/** A deck kept, as its pane opens it (caps/skills/decks.js): its place, name and Markdown, Jean's version waiting, and how either is written. @typedef {{ path: string, name: string, source: string, theirs: string | null, keep: (mine: string, theirs: string | null) => Promise<unknown> }} Kept */
/** @typedef {ReturnType<typeof import('@codename/deck').createDeck>} DeckView */

/** The deck on show beside the conversation, which the brain hears of, its slide and the words pointed at. */
export const shown = signal(/** @type {{ path: string, name: string, source: string, at: number, count: number, part: string } | null} */ (null))

/** A slide's Markdown read as an answer's is, emphasis beside the punctuation of Chinese, Japanese and Korean too. */
const reader = new Marked({ gfm: true }, cjk)
/** The bar's words, deck's names for them (its scheme's and PowerPoint's buttons aren't shown: the room says light or dark, Save says the rest). */
const LAYOUT = icon(svg`<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M3.5 9.5h17M12 9.5v9"/>`)

/** A diagram's picture in the deck's colours, a pie's and a chart's in its series, its words the picture's text; kept, to colour again. @param {HTMLImageElement} picture @param {string} drawn Pele's SVG */
function colour(picture, drawn) {
  pictures.set(picture, drawn)
  const look = getComputedStyle(picture), deck = (/** @type {string} */ name) => look.getPropertyValue(`--deck-${name}`).trim()
  const props = { bg: 'transparent', fg: deck('ink'), muted: deck('muted'), line: deck('muted'), surface: deck('soft'), 'surface-alt': deck('line'), border: deck('primary'), accent: deck('primary'), font: deck('body'),
    ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((n) => [`series-${n + 1}`, deck(`series-${(n % 6) + 1}`)])) }
  picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coloured(drawn, props))}`
}

/** Jean's drawers of a deck's fenced blocks, given the options after the fence's language. @type {Record<string, (box: HTMLElement, source: string, options?: Record<string, any>) => void | Promise<void>>} */
export const BLOCKS = {
  // Charts' own element, in SVG, the chart it draws being what PowerPoint's writer reads (`box.chart`); in the deck's colours, unless it names its own.
  echarts: async (box, source) => {
    await unlock('charts')
    const chart = document.createElement('app-chart'), look = getComputedStyle(box), series = [1, 2, 3, 4, 5, 6].map((n) => look.getPropertyValue(`--deck-series-${n}`).trim())
    const option = (() => { try { return JSON.parse(source) } catch { return null } })()
    // Read the way the deck reads: in a language written from the right, its categories start there and its values stand on the right.
    const mirrored = (/** @type {any} */ axes, /** @type {object} */ turn) => (look.direction === 'rtl' && axes ? [axes].flat().map((axis) => ({ ...axis, ...turn })) : axes)
    chart.setAttribute('source', option && typeof option === 'object' ? JSON.stringify({ ...(series[0] && !option.color && { color: series }), ...option,
      xAxis: mirrored(option.xAxis, { inverse: true }), yAxis: mirrored(option.yAxis, { position: 'right' }) }) : source)
    chart.setAttribute('svg', '')
    Object.defineProperty(box, 'chart', { get: () => /** @type {any} */ (chart).chart, configurable: true })
    box.append(chart)
  },
  // Its options as Slidev writes them (```mermaid {scale: 0.8}): `scale` the share of its box it takes, the rest Pele's settings, `theme` aside as its colours are the deck's.
  mermaid: async (box, source, { scale, theme, ...config } = {}) => {
    const look = getComputedStyle(box), font = look.getPropertyValue('--deck-body').trim() || 'system-ui, sans-serif'
    const { svg: drawn } = await drawing(source, { fontFamily: font, links: false, images: false, autoDirection: true, maxWidth: Math.max(320, box.clientWidth * 1.4), ...(Object.keys(config).length && { config }) }, look.direction === 'rtl')
    const picture = Object.assign(document.createElement('img'), { alt: wordsOf(drawn) }), place = Object.assign(document.createElement('div'), { className: 'deck-diagram' })
    if (scale > 0 && scale < 1) for (const side of ['max-inline-size', 'max-block-size']) picture.style.setProperty(side, `${scale * 100}%`)
    box.appendChild(place).append(picture)
    colour(picture, drawn)
  },
}
/** The slide of Jean's version a change shows on: its first, or for slides taken away, the one before where they were. @param {{ theirs: [number, number] }} change */
const placeOf = ({ theirs: [from, to] }) => (from === to ? Math.max(0, from - 1) : from)
/** Whether Jean's version is the project's new look alone, but for its kit the user's deck (D601). @param {Kept | null} file */
const isLook = (file) => Boolean(file?.theirs) && withoutKit(String(file?.source)) === withoutKit(String(file?.theirs))
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
  /** The pictures it names, each read once from the project, by the place or name the deck gives it. @type {Map<string, string>} */
  urls = new Map()
  /** A picture's address as the page loads it: one of the project's, read; the web's or one held inside, as it is; no other. @param {string} src */
  resolve = (src) => this.urls.get(src) || (/^[a-z][\w+.-]*:/i.test(src) ? src : null)

  connectedCallback() {
    // Made again in another look or language, its scheme set again in light or dark: read before the deck is drawn too, or
    // the effect wouldn't hear a later change.
    this.unwatch = effect(() => {
      const made = [app.look.value, app.settings.value.look?.accent, locale.value].join(' '), scheme = theme.value === 'dark' ? 'dark' : 'light'
      if (this.made && made !== this.made) this.remake()
      this.view?.setScheme(scheme)
    })
    this.draw()
  }

  disconnectedCallback() {
    this.unwatch?.()
    this.view?.destroy()
    this.view = null
    this.made = ''
    this.urls.forEach((url) => URL.revokeObjectURL(url)); this.urls.clear()
    if (this.file && shown.peek()?.path === this.file.path) shown.value = null
  }

  attributeChangedCallback() {
    clearTimeout(this.timer)
    // While the answer writes it, drawn a few times a second, its charts with it.
    this.timer = setTimeout(() => this.draw(), this.hasAttribute('open') ? 250 : 0)
  }

  /** What is on show: the answer's block, else Jean's version waiting, else the deck kept. */
  get source() { return this.file ? (this.file.theirs && !this.theirsHidden ? this.file.theirs : this.file.source) : this.getAttribute('source') ?? '' }

  remake() { this.view?.destroy(); this.view = null; this.draw() }

  /** The pictures the deck names that aren't read yet: one of the task's by the name the brain gave it, else at its place from the deck's folder; none in a task saved as a page, whose room has no files. */
  async held() {
    const records = app.current.peek()?.records ?? [], pictures = [...linkedFiles(records), ...filesMade(callsIn(records, app.live.peek()?.turn?.steps))].filter((one) => /^image\//.test(one.mimeType ?? '')), places = /** @type {string[]} */ ([])
    withPictures(this.source, (place) => void (!app.fs || /^[a-z][\w+.-]*:/i.test(place) || this.urls.has(place) || (places.push(place), this.urls.set(place, ''))))
    await Promise.all(places.map((place) => ((uri) => uri && app.fs.readBytes(`${app.projectDir}/${uri}`).then((bytes) => bytes && this.urls.set(place, URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: /\.svg$/i.test(uri) ? 'image/svg+xml' : '' })))))(namedIn(pictures, place)?.uri ?? placeIn(place))))
    return this.isConnected
  }

  async draw() {
    if (!(await this.held())) return
    if (this.view) {
      if (this.source !== this.view.source) this.view.setSource(this.source)
    } else {
      this.made = [app.look.peek(), app.settings.peek().look?.accent, locale.peek()].join(' ')
      const kit = await kitHere(), deciding = Boolean(this.file?.theirs)
      if (this.view || !this.isConnected) return
      render(html`${this.file ? html`<div class="slides-review"></div>` : nothing}<div class="slides-deck"></div><div class="slides-more"></div>`, /** @type {HTMLElement} */ (this))
      // Jean's own buttons, taken before deck makes its bar anew (made again in another look or language, they are in the last one).
      const root = /** @type {HTMLElement} */ (this.querySelector('.slides-deck')), more = /** @type {HTMLElement} */ (this.querySelector('.slides-more'))
      this.view = createDeck(root, { source: this.source, kit, scheme: theme.peek() === 'dark' ? 'dark' : 'light', blocks: BLOCKS, resolve: this.resolve, strings: words(), headings: 'aria', lex: (markdown) => reader.lexer(markdown),
        editable: Boolean(this.file) && !deciding, ...(this.file && !deciding && { onChange: (text) => this.typed(text) }) })
      root.addEventListener('deck-scheme', () => { for (const picture of root.querySelectorAll('img')) { const drawn = pictures.get(picture); if (drawn) colour(picture, drawn) } })
      root.addEventListener('deck-move', () => this.moved())
      for (const kind of ['pointerdown', 'keydown']) root.addEventListener(kind, () => { this.paged = true })
      root.querySelector('.deck-stage')?.addEventListener('click', (event) => this.pointed(event))
      // deck's bar after its paging: full screen, by Play, the presenter's view, all slides, Jean's own buttons, then the Markdown;
      // a button deck leaves out (no full screen, a deck not to change) is an empty fragment.
      const bar = /** @type {HTMLElement} */ (root.querySelector('.deck-bar')), act = (/** @type {string} */ name) => /** @type {HTMLElement | DocumentFragment} */ (bar.querySelector(`[data-act='${name}']`) ?? new DocumentFragment()), present = act('present')
      bar.append(present, act('presenter'), act('grid'), more, act('edit')); present.replaceChildren(); render(icons.play, present)
    }
    if (!this.paged) this.view.go(this.hasAttribute('open') ? this.view.deck.slides.length - 1 : this.file?.theirs ? this.firstChange() : 0)
    this.paint()
  }

  /** Jean's buttons, and the bar over Jean's version: each slide it changes, adds or takes away, accepted or rejected. */
  paint() {
    const { view, file } = this
    if (!view) return
    const source = view.source, more = this.querySelector('.slides-more'), review = this.querySelector('.slides-review')
    if (more instanceof HTMLElement) render(file ? html`${this.layouts()}` : html`<button type="button" class="icon-button subtle" aria-label=${t('action.copy')}
        @click=${() => copyDrawing(source, this.picture()).then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))}>${icons.copy}</button>
      ${drawnActions('deck', source)}`, more)
    if (!(review instanceof HTMLElement) || !file) return
    const changes = file.theirs ? changesOf(file.source, file.theirs) : [], at = view.at
    // The project's new look (D601), Jean's version but for its kit: the whole deck at once, a line under any slide, no bar.
    const look = isLook(file)
    for (const [i, slide] of view.slides().entries()) slide.classList.toggle('is-jean', !this.theirsHidden && !look && changes.some((change) => i >= change.theirs[0] && i < change.theirs[1]))
    const here = look ? changes[0] : changes.find((change) => placeOf(change) === at || (at >= change.theirs[0] && at < change.theirs[1]))
    const number = new Intl.NumberFormat(intlLocales()).format
    render(changes.length ? html`${look ? nothing : reviewBar({ label: t('slides.review'), count: t('slides.changed', { count: changes.length }),
        go: changes.length > 1 ? (step) => this.goTo(changes[(changes.indexOf(here ?? changes[0]) + step + changes.length) % changes.length]) : null,
        previous: t('slides.previousChange'), next: t('slides.nextChange'), acceptAll: t('slides.acceptAll'), rejectAll: t('slides.rejectAll'),
        accept: () => this.decide(changes, true), reject: () => this.decide(changes, false) })}
      ${here ? html`<p class="slides-change"><span>${look ? t('slides.newLook') : here.theirs[0] === here.theirs[1] ? t('slides.removed', { n: number(here.mine[0] + 1) }) : here.mine[0] === here.mine[1] ? t('slides.added') : t('slides.jeans')}</span>
        <button type="button" class="button subtle" aria-pressed=${String(this.theirsHidden)} @click=${() => { this.theirsHidden = !this.theirsHidden; this.draw() }}>${t('slides.before')}</button>
        <button type="button" class="button" @click=${() => this.decide([here], false)}>${t('slides.reject')}</button>
        <button type="button" class="button primary" @click=${() => this.decide([here], true)}>${t('slides.accept')}</button></p>` : nothing}` : nothing, review)
  }

  /** Where the first of Jean's changes is. */
  firstChange() { return isLook(this.file) ? this.firstInColour() : ((first) => (first ? Math.min(placeOf(first), (this.view?.deck.slides.length ?? 1) - 1) : 0))(this.file?.theirs ? changesOf(this.file.source, this.file.theirs)[0] : undefined) }

  /** The first slide where the deck's colour shows, its words, lines, markers or a chart's marks, where a new look is seen (D601); else the first. */
  firstInColour() {
    const slides = this.view?.slides() ?? [], probe = this.querySelector('.deck')?.appendChild(document.createElement('i'))
    if (!probe) return 0
    probe.style.color = 'var(--deck-primary)'
    const colour = getComputedStyle(probe).color, painted = (/** @type {Element} */ one) => ((look) => [look.color, look.borderBlockEndColor, look.borderInlineStartColor, look.backgroundColor, look.fill, look.stroke].includes(colour)
      || (one.localName === 'li' && getComputedStyle(one, '::marker').color === colour))(getComputedStyle(one))
    probe.remove()
    return Math.max(0, slides.findIndex((slide) => [...slide.querySelectorAll('*')].some(painted)))
  }

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
    if (!this.file) return
    const file = (this.file = { ...this.file, source: text })
    clearTimeout(this.timer)
    this.timer = setTimeout(() => file.keep(text, null), 400)
    this.moved()
  }

  /** The Slide layout menu: the kit's layouts that hold what the slide holds, the one it is laid out by checked. */
  layouts() {
    const view = this.view, slide = view?.deck.slides[view.at]
    if (!view || !slide || this.file?.theirs) return nothing
    const used = slide.slots.map((slot) => slot.name), now = view.slides()[view.at]?.dataset.layout, fits = Object.entries(withNames(view.kit).layouts).filter(([name, layout]) => used.every((one) => layout.slots.includes(one)) && (!/^image/.test(name) || slide.settings.image))
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
  look: kitSlot,
  head: { at: 2, draw: (/** @type {{ uri: string, name: string }} */ file) => (/^decks\//.test(file.uri) ? (saving.value ?? (import('./save.js').then((module) => { saving.value = module.saveMenu }), () => nothing))(file) : nothing) } } })
