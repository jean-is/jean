// Pages in answers (D196, D289): a ```html block is a page that runs where it is, in every room, in a
// frame of the preview's kind (preview.html, D126): an opaque origin, scripts and forms, under the
// policy Settings give web pages (D143), so by default nothing comes from the internet or goes to
// it. It comes as the answer writes it: its frame begins with the first lines and is given the rest
// as it comes, so its markup shows at once and its script, written last, runs once it is whole. It is
// given the user's language and its direction, the room's colours and type as MCP Apps' standard
// variables (`--color-text-primary`…), a few base styles, and ECharts as `import * as echarts from
// 'echarts'`: a stand-in that asks Jean for the library, sent only to a page that imports it, whose
// charts take the room's light or dark. It is as tall as what it shows, or, made to fill a screen
// (its root or body as tall as its frame, 100% or 100vh), as tall as a page may be; it speaks to Jean on a click
// of the user's only: `sendPrompt(text)` sends the text as the user's next message, as a follow-up
// does, and a link opens in a new tab. With Run its code off, it is code. Copy puts its source on the
// clipboard. Loaded with the first message, for its rule, then at each visit, so that pages written
// before show again, or by the first page a conversation holds. Written again under a new policy,
// which a page keeps from its start; a new theme, look or language is put on the page as it is
// (`room`), its charts, diagrams and maps following, so that what was typed in it stays.
// Components (D291): a ```mermaid block is a diagram, drawn here (./diagram.js); a ```geojson block,
// a page made of a map (./map.js). A page is lent both when it holds one (<app-diagram>, <app-map>,
// their text what the blocks hold), and lays out its <main> and an <aside> side by side, so that a
// form and a map beside it are one page, in step through its own code. A map's library and every
// address it reaches come through Jean, from the map service Settings name, once maps are allowed.
import { html, nothing, render } from 'lit-html'
import { computed, effect, signal } from '@preact/signals-core'
import { app, effective, theme, notify, send, updateSettings } from '../../ui/state.js'
import { register, drawnActions } from '../../ui/caps.js'
import { declared, drawn, PAGES } from '../../ui/markdown.js'
import { pageRights, pagePolicy, pageAllow, mapStyles, PAGE_SANDBOX } from '../../ui/csp.js'
import { copyDrawing } from '../../ui/save.js'
import { icons } from '../../ui/icons.js'
import { styleSheet, still } from '../../ui/sheet.js'
import { t, locale, dir, useStrings } from '../../core/i18n.js'
import { row, chip, notes } from './mode.js'

await Promise.all([useStrings('interactive'), styleSheet(new URL('interactive.css', import.meta.url))])

register({
  id: 'interactive',
  rules: ["Bills, loans, recipes, timezones, quizzes, science: end with a working ```html tool, not code: offline, var(--color-*), import 'echarts', sendPrompt(text)."],
  // Visual answers as a mode of the box (./mode.js, D300): a row of +, then pressed at the box's foot while it is on.
  slots: { add: { at: 6, draw: row }, modes: { at: 0, draw: chip, notes } },
})
// A page, a diagram or a map needs no skill to declare it (D289, D291): they stay among the kinds drawn, however often the room's skills are read again.
effect(() => { if (PAGES.some((kind) => !declared.value.has(kind))) declared.value = new Set([...declared.value, ...PAGES]) })

const FRAME = new URL('../../preview.html', import.meta.url).href
// A task saved as a web page (D305) has it from the render package, whose server sends it as text: there its relay is written in the frame.
const RELAY = new URL(FRAME).origin === location.origin ? null : await fetch(FRAME).then((response) => response.text())
const rights = computed(() => pageRights(effective.value.settings, app.policy))

/** MCP Apps' standard variables (its host context's `styles.variables`), from the room's own. */
const VARIABLES = Object.entries({
  'color-text-primary': 'ink', 'color-text-secondary': 'ink-soft', 'color-text-tertiary': 'ink-faint', 'color-text-danger': 'danger', 'color-text-inverse': 'on-flame',
  'color-border-primary': 'line-strong', 'color-border-secondary': 'line', 'color-background-secondary': 'glass', 'color-background-inverse': 'flame',
  'color-ring-primary': 'flame', 'font-sans': 'sans', 'font-mono': 'mono', 'border-radius-lg': 'radius',
})
/**
 * The names brains give them when they guess, as Claude's do, often with light colours to fall back
 * on: the room's colours too, so a page they write is readable in the dark. Its background is the answer's,
 * and its accent the room's, as dark in light and dark alike, as brains write white on it.
 */
const ALIASES = Object.entries({
  'color-text': 'var(--color-text-primary)', 'color-text-muted': 'var(--color-text-secondary)', 'color-muted': 'var(--color-text-secondary)',
  'color-border': 'var(--color-border-primary)', 'color-surface': 'var(--color-background-secondary)', 'color-primary': 'oklch(from var(--color-ring-primary) 0.55 c h)',
  'color-accent': 'var(--color-primary)', 'color-on-primary': 'white', 'color-danger': 'var(--color-text-danger)',
  'color-background-primary': 'transparent', 'color-background': 'transparent', 'color-bg': 'transparent',
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
const dark = () => getComputedStyle(document.documentElement).colorScheme === 'dark'
// Charts in the page's light or dark; on a new one, what was set on each since it last began afresh, which
// setTheme forgets, is set again (up to 500 times, beyond which a chart keeps its colours).
const own = new Map()
addEventListener('message', ({ data, source }) => {
  if (source === parent && data?.room) for (const [chart, { set, calls }] of own) {
    if (chart.isDisposed()) { own.delete(chart); continue }
    chart.setTheme(dark() ? 'dark' : {}, { silent: true })
    calls.slice(1).forEach(([option, opts], i, rest) => set(option, { replaceMerge: opts?.replaceMerge, lazyUpdate: i < rest.length - 1, silent: true }))
  }
})
export const init = (element, theme, options) => {
  const chart = m.init(element, theme ?? (dark() ? 'dark' : null), options), set = chart.setOption.bind(chart), calls = []
  if (theme == null) own.set(chart, { set, calls })
  chart.setOption = (option, ...rest) => {
    const given = { backgroundColor: 'transparent', ...option }
    if (rest[0] === true || rest[0]?.notMerge) calls.length = 0
    if (own.has(chart) && calls.push([given, typeof rest[0] === 'object' ? rest[0] : null]) > 500) own.delete(chart)
    return set(given, ...rest)
  }
  return chart
}
export const { ${names.join(', ')} } = m
export default { ...m, init }`
  return { text, url: `data:text/javascript;charset=utf-8,${encodeURIComponent(stand)}` }
}, () => ({ text: '', url: 'data:text/javascript,' })))

/** What a page is lent when it holds one, each read once: Jean's diagrams and maps, and MapLibre for the maps. @type {Map<string, Promise<string>>} */
const parts = new Map()
/** @param {string} path */
const part = (path) => parts.get(path) ?? /** @type {Promise<string>} */ (parts.set(path, fetch(new URL(path, import.meta.url)).then((response) => response.text())).get(path))
const LENT = /** @type {Record<string, string>} */ ({ diagram: './diagram.js', map: './map.js' })

/** The map service's styles, light and dark, and the addresses that may be fetched for a map: theirs. */
const styles = () => mapStyles(/** @type {any} */ (effective.peek().settings), app.policy)
const mapSites = () => Object.values(styles()).map((address) => new URL(address).origin)

// Each component a page holds is asked for as it appears, and lent then; the rest isn't.
const LOADER = /* html */ `<script>{const want={'app-diagram':'diagram','app-map':'map'},got=new Set()
const look=()=>{for(const[tag,need]of Object.entries(want))if(!got.has(need)&&document.querySelector(tag)){got.add(need);const id=Math.random()
addEventListener('message',function on({data,source}){if(source===parent&&data?.id===id)removeEventListener('message',on),import(URL.createObjectURL(new Blob([data.text],{type:'text/javascript'})))})
parent.postMessage({need,id},'*')}};new MutationObserver(look).observe(document,{childList:true,subtree:true})}</script>`

// The room put on the page as it is: the style sheet before it, the root's language, direction, light or
// dark and look, which diagrams and maps watch.
const ROOM = /* html */ `<script>{const sheet=document.currentScript.previousElementSibling,root=document.documentElement
addEventListener('message',({data,source})=>{const room=data?.room;if(source!==parent||!room)return
sheet.textContent=room.css;Object.assign(root,{lang:room.lang,dir:room.dir});Object.assign(root.dataset,{theme:room.theme,look:room.look})})}</script>`

/**
 * The room as a page wears it: the user's language and its direction, light or dark, the look, and its
 * colours and type, which the page's own root can't give other colours. A frame whose colour scheme
 * isn't the room's would be opaque.
 * @param {CSSStyleDeclaration} style
 */
function room(style) {
  const lang = locale.peek()
  const variables = [...VARIABLES.map(([name, own]) => [name, style.getPropertyValue(`--${own}`).trim()]), ...ALIASES].map(([name, value]) => `--${name}: ${value} !important;`).join(' ')
  return { lang, dir: dir(lang), theme: theme.peek(), look: app.look.peek(), motion: still() ? 'less' : 'full', css: `:root { color-scheme: ${theme.peek()}; ${variables} }` }
}

/**
 * What goes ahead of the page: the room, ECharts, its components' loader, controls in its style, and
 * its <main> and <aside> side by side on a wide screen.
 * @param {CSSStyleDeclaration} style @param {string} charts the address of ECharts' stand-in
 */
function head(style, charts) {
  const { lang, dir, theme, look, motion, css } = room(style)
  return /* html */ `<html lang="${lang}" dir="${dir}" data-theme="${theme}" data-look="${look}" data-motion="${motion}"><script type="importmap">${JSON.stringify({ imports: { echarts: charts } })}</script>${LOADER}<style>${css}</style>${ROOM}<style>
:root { --border-radius-md: calc(var(--border-radius-lg) / 2) !important; accent-color: var(--color-ring-primary); }
body { margin: 0; padding: 0.25rem; color: var(--color-text-primary); font: 1rem/1.5 var(--font-sans); overflow-wrap: anywhere; }
button, input, select, textarea { font: inherit; color: inherit; }
button, select, textarea, input:not([type=range], [type=checkbox], [type=radio], [type=color]) { padding: 0.4em 0.8em; border: 1px solid var(--color-border-primary); border-radius: var(--border-radius-md); background: var(--color-background-secondary); }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--color-ring-primary); outline-offset: 2px; }
[data-motion=less] *, [data-motion=less] ::before, [data-motion=less] ::after { animation: none !important; transition: none !important; }
@media (min-width: 36rem) { body:has(> main + aside) { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 1rem; align-items: start; } }
app-map, app-diagram { display: block; }
</style>`
}

class AppPage extends HTMLElement {
  /** `open` while its block's closing fence isn't written yet. */
  static observedAttributes = ['source', 'open']
  /** What its frame was made for: the policy. */
  made = ''
  /** The theme, look and language its page wears. */
  worn = ''
  /** What starts its page once its frame has loaded. @type {{ once: true, handleEvent: (event: Event) => Promise<void> } | undefined} */
  begin
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

  /**
   * What its page is: its source, or a map's GeoJSON in <app-map>, closed once whole. While it is
   * written, whole lines alone: its last may be the closing fence coming, which isn't the page's.
   */
  text() {
    const open = this.hasAttribute('open')
    const source = this.getAttribute('source') ?? ''
    const lines = open ? source.slice(0, source.lastIndexOf('\n') + 1) : source
    return this.hasAttribute('map') ? /* html */ `<app-map>${lines.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}${open ? '' : '</app-map>'}` : lines
  }

  draw() {
    const source = this.text()
    const { allows, sites } = rights.peek()
    if (!allows.scripts) {
      this.made = ''
      return render(html`<pre dir="ltr" tabindex="0"><code>${this.getAttribute('source')}</code></pre>`, this)
    }
    const policy = pagePolicy(allows, sites, true)
    const made = [policy, pageAllow(allows)].join('\n')
    const worn = [theme.peek(), app.look.peek(), locale.peek()].join('\n')
    if (made === this.made) {
      // A new theme, look or language, put on the page as it is; one still loading takes them as it starts.
      if (worn !== this.worn) {
        this.worn = worn
        this.shell(allows)
        if (this.written !== null) this.querySelector('iframe')?.contentWindow?.postMessage({ room: room(getComputedStyle(this)) }, '*')
      }
      // More of a page being written goes on the page begun; a frame still loading takes what there is
      // then; a step back, as the answer settles, waits for it to come again.
      if (this.written === null || (this.whole && source === this.written)) return
      const kept = this.written.trimEnd()
      if (!this.whole && (source.startsWith(kept) || kept.startsWith(source.trimEnd()))) return this.feed()
    }
    this.made = made
    this.worn = worn
    this.written = null
    this.whole = false
    // A new page in a new frame: the one before is let go.
    render(nothing, this)
    this.begin = { once: true, handleEvent: async (/** @type {Event} */ event) => {
      const frame = /** @type {HTMLIFrameElement} */ (event.target)
      const { url } = await library()
      const now = this.text()
      const open = this.hasAttribute('open')
      frame.contentWindow?.postMessage({ page: head(getComputedStyle(this), url) + now, policy, open }, '*')
      this.written = now
      this.whole = !open
    } }
    this.shell(allows)
  }

  /**
   * Its frame and Copy, named in the user's language; drawn again, the frame stays as it is.
   * @param {Record<import('../../ui/csp.js').PageRight, boolean>} allows
   */
  shell(allows) {
    render(html`<iframe sandbox=${PAGE_SANDBOX} allow=${pageAllow(allows)} loading="lazy" src=${RELAY === null ? FRAME : nothing} srcdoc=${RELAY ?? nothing} title=${t(this.hasAttribute('map') ? 'interactive.map' : 'interactive.page')} @load=${this.begin}></iframe>
      <div class="drawn-foot">
        <button class="icon-button subtle" aria-label=${t('action.copy')}
          @click=${() => navigator.clipboard.writeText(this.getAttribute('source') ?? '').then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))}>${icons.copy}</button>
        ${this.hasAttribute('map') ? nothing : drawnActions('html', this.getAttribute('source') ?? '')}
      </div>`, this)
  }

  /** Gives the page what has come of it beyond what it was given, never twice, and closes it once it is whole. */
  feed() {
    const source = this.text()
    const open = this.hasAttribute('open')
    const written = /** @type {string} */ (this.written)
    const more = source.length > written.length ? source.slice(written.length) : ''
    if (!more && open) return
    this.querySelector('iframe')?.contentWindow?.postMessage({ page: more, open }, '*')
    if (more) this.written = source
    this.whole = !open
  }

  /**
   * What its page says (preview.html's relay, ECharts' stand-in, its components): how tall it is, that
   * it imports ECharts or holds a component, what a map of it would fetch; and, on a click of the
   * user's, that maps are allowed, text to send or a link to open. Anything else, or from another
   * frame, is ignored.
   * @param {MessageEvent} event
   */
  heard = ({ source, data }) => {
    const frame = this.querySelector('iframe')
    if (!frame || !source || source !== frame.contentWindow) return
    const answer = (/** @type {Record<string, unknown>} */ reply, /** @type {Transferable[]} */ transfer = []) => frame.contentWindow?.postMessage({ ...reply, id: data.id }, '*', transfer)
    if (Number.isFinite(data?.height)) frame.style.blockSize = `${Math.max(32, data.fills ? innerHeight * 0.85 : Math.min(data.height, innerHeight * 0.85))}px`
    else if (data?.need === 'echarts') void library().then(({ text }) => frame.contentWindow?.postMessage({ echarts: text }, '*'))
    else if (Object.hasOwn(LENT, data?.need)) void part(LENT[data.need]).then((text) => answer({ text }))
    else if (data?.need === 'maplibre') void this.maps().then(answer)
    else if (typeof data?.fetch === 'string') void this.fetched(data.fetch).then(({ bytes, error }) => answer({ bytes, error }, bytes ? [bytes.buffer] : []))
    else if (navigator.userActivation?.isActive === false) return
    else if (data?.allow === 'maps') void this.allow().then((allowed) => answer({ allowed }))
    else if (typeof data?.prompt === 'string' && data.prompt.trim() && !app.busy.peek()) send(data.prompt.trim().slice(0, 2000))
    else if (typeof data?.open === 'string' && /^https:\/\//i.test(data.open)) window.open(data.open, '_blank', 'noopener')
  }

  /** MapLibre, its worker and its style sheet, the styles for light and dark, and whether maps are allowed; the words its card asks with. */
  async maps() {
    const [library, worker, css] = await Promise.all(['maplibre-gl.mjs', 'maplibre-gl-worker.js', 'maplibre-gl.css'].map((file) => part(`../../vendor/maplibre/${file}`)))
    const site = new URL(styles()[theme.peek() === 'dark' ? 'dark' : 'light']).hostname
    return { library, worker, css, styles: styles(), allowed: rights.peek().allows.maps, strings: { show: t('interactive.mapShow'), from: t('interactive.mapFrom', { site }) } }
  }

  /** Maps allowed, from now on, unless the organisation says otherwise. */
  async allow() {
    const { allows, locked } = rights.peek()
    if (!allows.maps && !locked.has('maps')) await updateSettings({ pages: /** @type {any} */ ({ ...app.settings.peek().pages, maps: true }) })
    return rights.peek().allows.maps
  }

  /** An address a map needs, once maps are allowed, from the map service alone. @param {string} address */
  async fetched(address) {
    try {
      if (!rights.peek().allows.maps || !mapSites().includes(new URL(address).origin)) return { error: 'Not a map' }
      const response = await fetch(address, { credentials: 'omit', referrerPolicy: 'no-referrer' })
      return response.ok ? { bytes: new Uint8Array(await response.arrayBuffer()) } : { error: `HTTP ${response.status}` }
    } catch (error) {
      return { error: String(error) }
    }
  }
}

customElements.define('app-page', AppPage)

/** The diagrams' module, loaded with the first: until then, a diagram is its code. @type {import('@preact/signals-core').Signal<typeof import('./diagram.js') | null>} */
const diagrams = signal(null)

/** A diagram, with Copy; one that can't be read once written is its code. @param {string} source @param {boolean} open */
function diagram(source, open) {
  const module = diagrams.value
  if (!module) return void import('./diagram.js').then((loaded) => { diagrams.value = loaded }), null
  if (!open && !module.parse(source)) return null
  /** @param {Event} event */
  const copy = (event) => {
    const shown = /** @type {HTMLElement & { picture: () => Promise<Blob> }} */ (/** @type {HTMLElement} */ (event.currentTarget).closest('figure')?.querySelector('app-diagram'))
    copyDrawing(source, shown.picture()).then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))
  }
  return html`<figure class="diagram"><app-diagram source=${source} role="img" aria-label=${t('interactive.diagram')}></app-diagram>
    <div class="drawn-foot"><button class="icon-button subtle" aria-label=${t('action.copy')} @click=${copy}>${icons.copy}</button>${drawnActions('mermaid', source)}</div></figure>`
}

/** Whether a whole block is GeoJSON. @param {string} source */
const isGeo = (source) => { try { return typeof JSON.parse(source)?.type === 'string' } catch { return false } }

drawn.value = { ...drawn.peek(),
  html: (source, open) => html`<app-page source=${source} ?open=${open}></app-page>`,
  geojson: (source, open) => (open || isGeo(source) ? html`<app-page map source=${source} ?open=${open}></app-page>` : null),
  mermaid: diagram,
}
