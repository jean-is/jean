// Charts (D196): a ```echarts block in an answer, drawn by ECharts on a canvas, with the theme's
// light or dark, the room's type and numbers in the user's language; drawn again as its box, the
// theme, the look or the language changes, and saved as a picture on light paper. The block is
// data (./option.js). Loaded by the first chart an answer holds, never offered; until then, while
// the block is still being written, or when it isn't a chart, its source shows a click away.
import { html, render } from 'lit-html'
import { effect } from '@preact/signals-core'
import { app, theme } from '../../ui/state.js'
import { save } from '../../ui/save.js'
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
  static observedAttributes = ['source']
  /** @type {any} ECharts' instance, while a chart is drawn */
  chart = null
  /** What was drawn last: the source, in a theme, look and language. */
  drawn = ''
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
  }

  attributeChangedCallback() {
    if (this.isConnected) this.draw()
  }

  draw() {
    const source = this.getAttribute('source') ?? ''
    const key = [theme.peek(), app.look.peek(), locale.peek(), source].join('\n')
    if (key === this.drawn) return
    this.drawn = key
    this.chart?.dispose()
    this.chart = null
    const option = readOption(source)
    this.paint(source, option)
    const box = this.querySelector('.chart')
    if (!option || !box) return
    try {
      this.chart = echarts.init(box, theme.peek() === 'dark' ? 'dark' : undefined, { renderer: 'canvas' })
      this.chart.setOption(dressed(option, getComputedStyle(this).fontFamily))
      this.sized.observe(box)
    } catch (error) {
      console.warn('Chart', error)
      this.chart?.dispose()
      this.chart = null
      this.paint(source, null)
    }
  }

  /** @param {string} source @param {Option | null} option */
  paint(source, option) {
    const title = option ? titleOf(option) : ''
    const code = html`<details><summary>echarts</summary><pre dir="ltr"><code>${source}</code></pre></details>`
    render(option ? html`<div class="chart" dir="ltr" role="img" aria-label=${title || t('charts.chart')}></div>
      <div class="drawn-foot"><button class="link-button small" @click=${() => this.picture(option, title)}>${t('charts.save')}</button>${code}</div>`
      : html`<p class="drawn-status muted small" role="status"><span class="while">${t('charts.drawing')}</span><span class="failed">${t('charts.failed')}</span></p>${code}`, this)
  }

  /**
   * Saves the chart as a picture to put in a document: drawn again off the page, as it shows on
   * light paper, twice as fine. @param {Option} option @param {string} title
   */
  picture(option, title) {
    const box = /** @type {HTMLElement} */ (this.querySelector('.chart'))
    const paper = echarts.init(document.createElement('div'), undefined, { renderer: 'canvas', width: box.clientWidth, height: box.clientHeight })
    try {
      paper.setOption({ ...dressed(option, getComputedStyle(this).fontFamily), animation: false })
      paper.renderToCanvas({ pixelRatio: 2, backgroundColor: '#fff' }).toBlob((/** @type {Blob | null} */ blob) => {
        if (blob) save(blob, `${title || t('charts.chart')}.png`)
      }, 'image/png')
    } finally {
      paper.dispose()
    }
  }
}

customElements.define('app-chart', AppChart)
