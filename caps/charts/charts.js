// Charts (D196): a ```echarts block in an answer, drawn by ECharts on a canvas, with the theme's
// light or dark, the room's type and numbers in the user's language; drawn again as its box, the
// theme, the look or the language changes; copied as its source and its picture, on light paper,
// at once. The block is data (./option.js). While it is written, what is whole of it so far is
// drawn, and the chart grows as more comes. Loaded by the first chart an answer holds; until then,
// or when it isn't a chart, it shows as code.
import { html, render } from 'lit-html'
import { effect } from '@preact/signals-core'
import { app, theme, notify } from '../../ui/state.js'
import { copyDrawing } from '../../ui/save.js'
import { icons } from '../../ui/icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { t, locale, useStrings } from '../../core/i18n.js'
import { readOption, localize, titleOf } from './option.js'

/** @typedef {import('./option.js').Option} Option */

const [echarts] = await Promise.all([
  import(new URL('../../vendor/echarts/echarts.mjs', import.meta.url).href),
  useStrings('charts'),
  styleSheet(new URL('charts.css', import.meta.url)),
])

const still = matchMedia('(prefers-reduced-motion: reduce)')
const contrast = matchMedia('(prefers-contrast: more), (forced-colors: active)')

/**
 * The option as drawn here: numbers in the user's language, the room's type, no animation for
 * those who'd rather not, and patterns on top of colours where more contrast is asked for.
 * @param {Option} option @param {string} font
 */
function dressed(option, font) {
  return {
    ...localize(option, new Intl.NumberFormat(locale.peek()).format),
    textStyle: { fontFamily: font, ...option.textStyle },
    ...(still.matches && { animation: false }),
    ...(contrast.matches && { aria: { enabled: true, decal: { show: true } } }),
  }
}

class AppChart extends HTMLElement {
  /** `open` while its block's closing fence isn't written yet: the answer is still writing it. */
  static observedAttributes = ['source', 'open']
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
  sized = new ResizeObserver(() => this.chart?.resize())
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

  attributeChangedCallback() {
    if (this.isConnected) this.draw()
  }

  draw() {
    const source = this.getAttribute('source') ?? ''
    const open = this.hasAttribute('open')
    const look = [theme.peek(), app.look.peek(), locale.peek()].join('\n')
    const key = [look, open, source].join('\n')
    if (key === this.drawn) return
    this.drawn = key
    // More of a block being written goes on the chart already drawn.
    const more = Boolean(this.chart) && this.made === look && this.growing !== null && source.startsWith(this.growing)
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
      this.chart ??= echarts.init(box, theme.peek() === 'dark' ? 'dark' : undefined, { renderer: 'canvas' })
      this.made = look
      // Without animation while it grows: each would start again with the next few values.
      this.chart.setOption({ ...dressed(option, getComputedStyle(this).fontFamily), ...(open && { animation: false }) })
      this.sized.observe(box)
    } catch (error) {
      // Half an option may not draw yet; a whole one that doesn't is worth a word.
      if (!open) console.warn('Chart', error)
      this.chart?.dispose()
      this.chart = null
      this.paint(source, null)
    }
  }

  /** @param {string} source @param {Option | null} option */
  paint(source, option) {
    const title = option ? titleOf(option) : ''
    render(option ? html`<div class="chart" dir="ltr" role="img" aria-label=${title || t('charts.chart')}></div>
      <div class="drawn-foot">
        <button class="icon-button subtle" aria-label=${t('action.copy')}
          @click=${() => copyDrawing(source, this.picture()).then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))}>${icons.copy}</button>
      </div>`
      : html`<p class="drawn-status muted small" role="status"><span class="while">${t('charts.drawing')}</span><span class="failed">${t('charts.failed')}</span></p>
        <pre dir="ltr"><code>${source}</code></pre>`, this)
  }

  /**
   * The chart as a picture to put in a document, a PNG: drawn again off the page, as it shows on
   * light paper, twice as fine. Copy takes it, and so does copying the answer (caps/made/made.js).
   * @returns {Promise<Blob>}
   */
  async picture() {
    const { option } = this
    const box = this.querySelector('.chart')
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

customElements.define('app-chart', AppChart)
