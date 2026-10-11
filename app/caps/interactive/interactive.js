// Pages in answers (D196, D289): a ```html block is a page that runs where it is, in every room, in a
// frame of the preview's kind (preview.html, D126): an opaque origin, scripts only, under the policy
// Settings give web pages (D143), so by default nothing comes from the internet and nothing goes to
// it. It comes as the answer writes it: its frame begins with the first lines and is given the rest
// as it comes, so its markup shows at once and its script, written last, runs once it is whole. It is
// given the user's language and its direction, the room's colours and type as MCP Apps' standard
// variables (`--color-text-primary`…), a few base styles, and ECharts as `import * as echarts from
// 'echarts'`: a stand-in that asks Jean for the library, sent only to a page that imports it, whose
// charts take the room's light or dark. It is as tall as what it shows, and speaks to Jean on a click
// of the user's only: `sendPrompt(text)` sends the text as the user's next message, as a follow-up
// does, and a link opens in a new tab. With Run its code off, it is code. Copy puts its source on the
// clipboard. Loaded with the first message, for its rule, or by the first page a conversation holds;
// written again in a new theme, look, language or policy, as a chart is drawn again.
import { html, nothing, render } from 'lit-html'
import { computed, effect } from '@preact/signals-core'
import { app, effective, theme, notify, send } from '../../ui/state.js'
import { register } from '../../ui/caps.js'
import { declared } from '../../ui/markdown.js'
import { pageRights, pagePolicy, pageAllow } from '../../ui/csp.js'
import { icons } from '../../ui/icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { t, locale, dir, useStrings } from '../../core/i18n.js'
import { dataURL } from '../folders/site.js'

await Promise.all([useStrings('interactive'), styleSheet(new URL('interactive.css', import.meta.url))])

register({
  id: 'interactive',
  rules: ["A tool or something to explore can be a ```html block, run in the answer: offline, var(--color-*) colours, imports 'echarts', sendPrompt(text) sends a message."],
})
// A page needs no skill to declare it (D289): `html` stays among the kinds drawn, however often the room's skills are read again.
effect(() => { if (!declared.value.has('html')) declared.value = new Set([...declared.value, 'html']) })

const FRAME = new URL('../../preview.html', import.meta.url).href
const rights = computed(() => pageRights(effective.value.settings, app.policy))

/** MCP Apps' standard variables (its host context's `styles.variables`), from the room's own. */
const VARIABLES = Object.entries({
  'color-text-primary': 'ink', 'color-text-secondary': 'ink-soft', 'color-text-tertiary': 'ink-faint', 'color-text-danger': 'danger', 'color-text-inverse': 'on-flame',
  'color-border-primary': 'line-strong', 'color-border-secondary': 'line', 'color-background-secondary': 'glass', 'color-background-inverse': 'flame',
  'color-ring-primary': 'flame', 'font-sans': 'sans', 'font-mono': 'mono', 'border-radius-lg': 'radius',
})

/**
 * ECharts for pages, read when the first one is written: the stand-in that `echarts` names in a page,
 * whose exports are the library's, and the library itself, sent to a page whose stand-in asks for it.
 * Its charts take the page's light or dark, on no background of their own.
 * @type {Promise<{ text: string, url: string }> | undefined}
 */
let echarts
const library = () => (echarts ??= fetch(new URL('../../vendor/echarts/echarts.mjs', import.meta.url)).then((response) => response.text()).then((text) => {
  const names = (/export\s*\{([^}]*)\}\s*;?\s*$/.exec(text)?.[1] ?? '').split(',').map((name) => name.trim().split(/\s+as\s+/).pop()).filter((name) => /^\w+$/.test(String(name)) && name !== 'init')
  const stand = `const text = await new Promise((resolve) => { addEventListener('message', function got({ data, source }) { if (source === parent && typeof data?.echarts === 'string') removeEventListener('message', got), resolve(data.echarts) }); parent.postMessage({ need: 'echarts' }, '*') })
const m = await import(URL.createObjectURL(new Blob([text], { type: 'text/javascript' })))
const dark = getComputedStyle(document.documentElement).colorScheme === 'dark'
export const init = (element, theme, options) => { const chart = m.init(element, theme ?? (dark ? 'dark' : null), options), set = chart.setOption.bind(chart); chart.setOption = (option, ...rest) => set({ backgroundColor: 'transparent', ...option }, ...rest); return chart }
export const { ${names.join(', ')} } = m
export default { ...m, init }`
  return { text, url: dataURL('text/javascript', new TextEncoder().encode(stand)) }
}, () => ({ text: '', url: 'data:text/javascript,' })))

/**
 * What goes ahead of the page: its language and direction, ECharts, the room's colours and type, and
 * controls in its style. A frame whose colour scheme isn't the room's would be opaque.
 * @param {CSSStyleDeclaration} style @param {string} charts the address of ECharts' stand-in
 */
function head(style, charts) {
  const lang = locale.peek()
  const variables = VARIABLES.map(([name, own]) => `--${name}: ${style.getPropertyValue(`--${own}`).trim()};`).join(' ')
  return `<html lang="${lang}" dir="${dir(lang)}"><script type="importmap">${JSON.stringify({ imports: { echarts: charts } })}</script><style>
:root { color-scheme: ${theme.peek()}; ${variables} --border-radius-md: calc(var(--border-radius-lg) / 2); accent-color: var(--color-ring-primary); }
body { margin: 0; padding: 0.25rem; color: var(--color-text-primary); font: 1rem/1.5 var(--font-sans); overflow-wrap: anywhere; }
button, input, select, textarea { font: inherit; color: inherit; }
button, select, textarea, input:not([type=range], [type=checkbox], [type=radio], [type=color]) { padding: 0.4em 0.8em; border: 1px solid var(--color-border-primary); border-radius: var(--border-radius-md); background: var(--color-background-secondary); }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--color-ring-primary); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation: none !important; transition: none !important; } }
</style>`
}

class AppPage extends HTMLElement {
  /** `open` while its block's closing fence isn't written yet. */
  static observedAttributes = ['source', 'open']
  /** What its frame was made for: the policy, theme, look and language. */
  made = ''
  /** What of its source its page has been given; null while its frame loads. @type {string | null} */
  written = null
  /** Its page is closed: nothing more goes in. */
  whole = false
  /** @type {(() => void) | undefined} */
  unwatch

  connectedCallback() {
    addEventListener('message', this.heard)
    this.unwatch = effect(() => {
      void [theme.value, app.look.value, locale.value, rights.value]
      requestAnimationFrame(() => this.draw())
    })
  }

  disconnectedCallback() {
    removeEventListener('message', this.heard)
    this.unwatch?.()
    this.made = ''
  }

  attributeChangedCallback() {
    if (this.isConnected) this.draw()
  }

  draw() {
    const source = this.getAttribute('source') ?? ''
    const { allows, sites } = rights.peek()
    if (!allows.scripts) {
      this.made = ''
      return render(html`<pre dir="ltr"><code>${source}</code></pre>`, this)
    }
    const policy = pagePolicy(allows, sites, true)
    const made = [policy, pageAllow(allows), theme.peek(), app.look.peek(), locale.peek()].join('\n')
    if (made === this.made) {
      // More of a page being written goes on the page begun; a frame still loading takes what there is then.
      if (this.written === null || (this.whole && source === this.written)) return
      if (!this.whole && source.startsWith(this.written.trimEnd())) return this.feed()
    }
    this.made = made
    this.written = null
    this.whole = false
    // A new page in a new frame: the one before is let go.
    render(nothing, this)
    const begin = { once: true, handleEvent: async (/** @type {Event} */ event) => {
      const frame = /** @type {HTMLIFrameElement} */ (event.target)
      const { url } = await library()
      const now = this.getAttribute('source') ?? ''
      const open = this.hasAttribute('open')
      frame.contentWindow?.postMessage({ page: head(getComputedStyle(this), url) + now, policy, open }, '*')
      this.written = now
      this.whole = !open
    } }
    render(html`<iframe sandbox="allow-scripts" allow=${pageAllow(allows)} loading="lazy" src=${FRAME} title=${t('interactive.page')} @load=${begin}></iframe>
      <div class="drawn-foot">
        <button class="icon-button subtle" aria-label=${t('action.copy')}
          @click=${() => navigator.clipboard.writeText(this.getAttribute('source') ?? '').then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))}>${icons.copy}</button>
      </div>`, this)
  }

  /** Gives the page what has come of it since, and closes it once it is whole. */
  feed() {
    const source = this.getAttribute('source') ?? ''
    const open = this.hasAttribute('open')
    const more = source.slice(this.written?.length)
    if (!more && open) return
    this.querySelector('iframe')?.contentWindow?.postMessage({ page: more, open }, '*')
    this.written = source
    this.whole = !open
  }

  /**
   * What its page says (preview.html's relay, ECharts' stand-in): how tall it is, that it imports
   * ECharts, and, on a click of the user's, text to send or a link to open. Anything else, or from
   * another frame, is ignored.
   * @param {MessageEvent} event
   */
  heard = ({ source, data }) => {
    const frame = this.querySelector('iframe')
    if (!frame || !source || source !== frame.contentWindow) return
    if (Number.isFinite(data?.height)) frame.style.blockSize = `${Math.max(32, Math.min(data.height, innerHeight * 0.85))}px`
    else if (data?.need === 'echarts') void library().then(({ text }) => frame.contentWindow?.postMessage({ echarts: text }, '*'))
    else if (navigator.userActivation?.isActive === false) return
    else if (typeof data?.prompt === 'string' && data.prompt.trim() && !app.busy.peek()) send(data.prompt.trim().slice(0, 2000))
    else if (typeof data?.open === 'string' && /^https:\/\//i.test(data.open)) window.open(data.open, '_blank', 'noopener')
  }
}

customElements.define('app-page', AppPage)
