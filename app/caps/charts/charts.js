// SPDX-License-Identifier: MIT
// Charts (D196): a ```echarts block in an answer, drawn by ECharts on a canvas, with the theme's
// light or dark (on a slide, its paper's), the room's type and numbers in the user's language; drawn again as its box, the
// theme, the look or the language changes; copied as its source and its picture, on light paper,
// at once. The block is data (./option.js). While it is written, what is whole of it so far is
// drawn, and the chart grows as more comes. Loaded by the first chart an answer holds; until then,
// or when it isn't a chart, it shows as code.
import { html, nothing, render } from 'lit-html'
import { effect } from '@preact/signals-core'
import { app, theme, notify } from '../../ui/state.js'
import { copyDrawing } from '../../ui/save.js'
import { drawn } from '../../ui/markdown.js'
import { drawnActions } from '../../ui/caps.js'
import { icons } from '../../ui/icons.js'
import { styleSheet, still } from '../../ui/sheet.js'
import { t, dir, locale, intlLocales, useStrings } from '../../core/i18n.js'
import { readOption, localize, titleOf, namesIn, paperTheme, paperLabels, sideOf } from './option.js'

/** @typedef {import('./option.js').Option} Option */

const [echarts] = await Promise.all([import(new URL('../../vendor/echarts/echarts.mjs', import.meta.url).href), useStrings('charts'), styleSheet(new URL('charts.css', import.meta.url))])

const [contrast, forced] = [matchMedia('(prefers-contrast: more)'), matchMedia('(forced-colors: active)')]
let charts = 0
// Escape hides a tip.
addEventListener('keydown', (event) => { if (event.key === 'Escape') for (const one of document.querySelectorAll('app-chart')) /** @type {{ chart?: import('echarts').ECharts | null }} */ (one).chart?.dispatchAction({ type: 'hideTip' }) })

/**
 * The option as drawn here: numbers in the user's language, the room's type, no animation for
 * those who'd rather not, and patterns on top of colours where more contrast is asked for.
 * @param {Option} option @param {string} font
 */
function dressed(option, font) {
  return {
    ...localize(option, new Intl.NumberFormat(intlLocales(locale.peek())).format),
    textStyle: { fontFamily: font, ...option.textStyle },
    ...(still() && { animation: false }),
    ...((forced.matches || ({ more: true, usual: false }[document.documentElement.dataset.contrast ?? ''] ?? contrast.matches)) && { aria: { enabled: true, decal: { show: true } } }),
  }
}

/** A chart's numbers as a table, its categories down the side and a column for each series; its source where it has neither. @param {Option} option @param {string} source */
function figures(option, source) {
  const series = [option.series].flat().filter((one) => Array.isArray(one?.data)), axis = [option.xAxis, option.yAxis].flat().find((one) => Array.isArray(one?.data))?.data, value = (/** @type {any} */ one) => [one?.value ?? one].flat().join(', '), rows = Math.max(0, ...series.map((one) => one.data.length))
  const links = [option.series].flat().flatMap((one) => one?.links ?? one?.edges ?? []), set = [option.dataset].flat()[0]?.source; if (links.length) return html`<ul>${links.map((/** @type {any} */ one) => html`<li dir="auto">${one.source} → ${one.target}${one.value == null ? '' : ` (${one.value})`}</li>`)}</ul>`
  if (Array.isArray(set?.[0])) return html`<div class="table" tabindex="0"><table><thead><tr>${set[0].map((/** @type {any} */ head) => html`<th scope="col" dir="auto">${head}</th>`)}</tr></thead><tbody>${set.slice(1).map((/** @type {any[]} */ row) => html`<tr>${row.map((one, i) => (i ? html`<td>${one}</td>` : html`<th scope="row" dir="auto">${one}</th>`))}</tr>`)}</tbody></table></div>`
  return rows ? html`<div class="table" tabindex="0"><table><thead><tr><td></td>${series.map((one) => html`<th scope="col" dir="auto">${one.name ?? titleOf(option)}</th>`)}</tr></thead><tbody>${Array.from({ length: rows }, (_, i) => html`<tr><th scope="row" dir="auto">${value(axis?.[i] ?? series[0].data[i]?.name ?? i + 1)}</th>${series.map((one) => html`<td>${value(one.data[i])}</td>`)}</tr>`)}</tbody></table></div>` : html`<pre dir="ltr" tabindex="0">${source}</pre>`
}

class AppChart extends HTMLElement {
  /** `open` while its block's closing fence isn't written yet: the answer is still writing it. */
  static observedAttributes = ['source', 'open']
  /** Its figures' id, which its picture is described by. */
  wordsId = `chart-words-${++charts}`
  /** @type {any} ECharts' instance, while a chart is drawn */
  chart = null
  /** @type {Option | null} what it draws */
  option = null
  /** What was drawn last: the source, in a theme, look and language, and whether it was open. */
  drawn = ''
  /** The theme, look and language the chart was made in. */
  made = ''
  /** @type {string | null} what the block held when last drawn while open, which more of it grows from */
  growing = null
  frame = 0
  sized = new ResizeObserver(() => this.chart && this.fit())
  /** @type {(() => void) | undefined} */
  unwatch

  connectedCallback() {
    // Drawn again in a new theme, look or language, once its style sheet is in.
    this.unwatch = effect(() => {
      void [theme.value, app.look.value, locale.value]
      cancelAnimationFrame(this.frame)
      this.frame = requestAnimationFrame(() => this.draw())
    })
  }

  disconnectedCallback() {
    this.unwatch?.()
    cancelAnimationFrame(this.frame)
    this.sized.disconnect()
    this.chart?.dispose()
    this.chart = null
    this.drawn = ''
    this.growing = null
  }

  attributeChangedCallback() { if (this.isConnected) this.draw() }

  draw() {
    const source = this.getAttribute('source') ?? ''
    const open = this.hasAttribute('open')
    const paper = this.paper(), look = [theme.peek(), app.look.peek(), locale.peek(), paper?.textStyle.color].join('\n')
    const key = [look, open, source].join('\n')
    if (key === this.drawn) return
    this.drawn = key
    // More of a block being written, or a page's chart that follows its form (`live`, D670), goes on the chart already drawn.
    const more = Boolean(this.chart) && this.made === look && (this.hasAttribute('live') || (this.growing !== null && source.startsWith(this.growing)))
    this.growing = open ? source : null
    const option = readOption(source, open)
    // Nothing whole has come since: what is drawn stays.
    if (!option && open && more) return
    if (!option || !more) {
      this.chart?.dispose()
      this.chart = null
    }
    this.option = option
    this.paint(source, option)
    const box = this.querySelector('.chart')
    if (!option || !box) return
    try {
      // In SVG on a slide (`svg`), which a deck saved as PowerPoint reads as it is drawn (D593).
      this.chart ??= echarts.init(box, paper ?? (theme.peek() === 'dark' ? 'dark' : undefined), { renderer: this.hasAttribute('svg') ? 'svg' : 'canvas' })
      if (!more) this.fit()
      this.made = look
      // Without animation while it grows: each would start again with the next few values.
      this.chart.setOption({ ...dressed(paper ? { ...option, series: paperLabels(option.series, paper.textStyle.color) } : option, getComputedStyle(this).fontFamily), ...(open && { animation: false }) })
      this.sized.observe(box)
    } catch (error) {
      // Half an option may not draw yet; a whole one that doesn't is worth a word.
      if (!open) console.warn('Chart', error)
      this.chart?.dispose()
      this.chart = null
      this.paint(source, null)
    }
  }

  /** On a slide (`svg`), ECharts' theme for the paper under the chart, which a tile or a part may have over the slide's. */
  paper() {
    if (!this.hasAttribute('svg')) return null
    /** @type {Element} */
    let under = this
    while (under.parentElement && !getComputedStyle(under).backgroundColor.startsWith('rgb(')) under = under.parentElement
    return paperTheme(getComputedStyle(this).color, getComputedStyle(under).backgroundColor)
  }

  /**
   * The chart to its box. On a slide (`svg`), drawn at a size of its own and scaled up to it, so that its words, lines and margins
   * grow with the slide's as they all do, at any size of slide: ECharts' 12px as six tenths of the slide's type, or less in a short
   * box (a tile, a node), for it never to be drawn under the 240px high that ECharts' margins, fixed in height, leave its marks room in.
   */
  fit() {
    const box = /** @type {HTMLElement} */ (this.querySelector('.chart')), scale = this.hasAttribute('svg') ? Math.min(parseFloat(getComputedStyle(box).fontSize) / 20, box.clientHeight / 240) : 1
    this.chart.resize({ width: box.clientWidth / scale, height: box.clientHeight / scale })
    box.querySelector('div')?.style.setProperty('scale', String(scale))
  }

  /** @param {string} source @param {Option | null} option */
  paint(source, option) {
    const title = option ? titleOf(option) : '', names = option ? namesIn(option) : []
    render(option ? html`<div class="chart" dir="ltr" role="img" aria-describedby=${this.wordsId} lang=${title ? nothing : locale.value} aria-label=${title || (names.length ? t('charts.of', { names: new Intl.ListFormat(intlLocales(), { type: 'unit' }).format(names) }) : t('charts.chart'))}></div>
      <div class="drawn-foot" lang=${locale.value}>
        <button class="icon-button subtle" aria-label=${t('action.copy')}
          @click=${() => copyDrawing(source, this.picture()).then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed'), { alert: true }))}>${icons.copy}</button>
        ${drawnActions('echarts', source)}
      </div><details class="chart-data" id=${this.wordsId}><summary lang=${locale.value} dir=${dir()}>${t('charts.data')}</summary>${figures(option, source)}</details>`
      : html`<p class="drawn-status muted small" role="status"><span class="while">${t('charts.drawing')}</span><span class="failed" role="alert">${t('charts.failed')}</span></p>
        <pre dir="ltr" tabindex="0"><code>${source}</code></pre>`, this)
  }

  /**
   * The chart as a picture to put in a document, a PNG: drawn again off the page, as it shows on
   * light paper, twice as fine. Copy takes it, and so does copying the answer (caps/made/made.js).
   * @returns {Promise<Blob>}
   */
  async picture() {
    const { option } = this, box = this.querySelector('.chart')
    if (!option || !box) throw new Error('No chart')
    const paper = echarts.init(document.createElement('div'), undefined, { renderer: 'canvas', width: box.clientWidth, height: box.clientHeight })
    try {
      paper.setOption({ ...dressed(option, getComputedStyle(this).fontFamily), animation: false })
      const canvas = paper.renderToCanvas({ pixelRatio: 2, backgroundColor: '#fff' })
      return new Promise((resolve, reject) => canvas.toBlob((/** @type {Blob | null} */ blob) => (blob ? resolve(blob) : reject(new Error('No picture'))), 'image/png'))
    } finally {
      paper.dispose()
    }
  }
}

// A canvas draws its words in the one direction it is given: each is given its own, for the box's `dir="ltr"` not to flip a mixed one (in SVG: charts.css).
echarts.setPlatformAPI({ createCanvas() { const canvas = document.createElement('canvas'), context = /** @type {any} */ (canvas.getContext('2d')); for (const draw of /** @type {const} */ (['fillText', 'strokeText'])) context[draw] = (/** @type {string} */ word, /** @type {[number, number]} */ ...at) => { context.direction = sideOf(word); CanvasRenderingContext2D.prototype[draw].call(context, word, ...at) }; return canvas } })

customElements.define('app-chart', AppChart)
drawn.value = { ...drawn.peek(), echarts: (source, open) => html`<app-chart source=${source} ?open=${open}></app-chart>` }
