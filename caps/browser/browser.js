// The browser (D140): web pages beside the conversation, or over it on a narrow screen, in a pane
// of the dock (D144) that a file's preview shares, with back, forward and reload, an address or
// words to look up, a new tab and full screen. Links in answers
// open there, and the brain opens pages there with `browse`, which reads a page's words when its
// site lets other sites read it. The page on show is the prompt's <page> section, so the brain
// knows what the user is looking at.
//
// A site can refuse to show inside another page, and browsers hide that refusal from the page
// that frames it, on purpose: no event, no header. So a page from a site not seen showing yet
// comes with a way out, a new tab, and a site the user opens that way is remembered: from then on
// it opens in a tab of its own, and Jean recommends installing it as an app (a site's account
// only works in its own tab too, since a framed site's cookies are cut off).
//
// The page is framed in caps/browser/browser.html, whose policy alone lets a frame show another
// site. Its frame keeps the site's own origin (allow-scripts with allow-same-origin, the one frame
// that has both: it never holds Jean's origin, a blob or data), and can't take Jean's place.
//
// The conversation's folder shows there too (D156), at "<folder>/<path>": a page put together by
// Folders (caps/folders/site.js) in a frame of the preview's kind (preview.html, scripts only), its
// links followed here. A page Jean makes or changes there opens by itself, and the page on show
// comes again when a file it was made of changes, whoever changed it.
import { html, svg, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal, computed, effect } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import * as dock from '../../ui/dock.js'
import { register, loaded as unlocked } from '../../ui/caps.js'
import { app, effective, updateSettings, notify, conversationOf } from '../../ui/state.js'
import { icons } from '../../ui/icons.js'
import { pageRights, pagePolicy, pageAllow } from '../../ui/csp.js'
import { savePage } from '../../ui/save.js'
import { serviceURL } from '../../core/settings.js'
import { t, locale, useStrings } from '../../core/i18n.js'
import { addressOf, showable, siteOf, pageText, installer, Trail } from './pages.js'

const HOST = new URL('browser.html', import.meta.url).href
const PAGE = new URL('../../preview.html', import.meta.url).href
/** What an address of the conversation's folder starts with, before "<folder>/<path>". */
const FOLDER = 'folder:'
const isLocal = (/** @type {string} */ url) => url.startsWith(FOLDER)
// Scripts, forms and pop-ups in the site's own origin; never the top: the site can't take Jean's place.
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-storage-access-by-user-activation'
const ALLOW = 'fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture'
// What the brain reads of a page, at most, and how long it waits for it.
const READ_CHARS = 12000
const READ_MS = 10000

await Promise.all([useStrings('browser'), new Promise((resolve) => {
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('browser.css', import.meta.url).href })
  link.addEventListener('load', resolve, { once: true })
  link.addEventListener('error', resolve, { once: true })
  document.head.append(link)
})])

// Back points the way the text goes; the others don't turn.
const glyph = (/** @type {unknown} */ paths, flip = '') => html`<svg class="icon ${flip}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`
const GLYPHS = {
  back: glyph(svg`<path d="M19 12H5M11 6l-6 6 6 6"/>`, 'flip-rtl'),
  tab: glyph(svg`<path d="M13.5 4.5h6v6M19.5 4.5 11 13M17 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4"/>`),
  full: glyph(svg`<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>`),
  exit: glyph(svg`<path d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5"/>`),
}

/** Whether the pane is open; what it shows: an address, in the frame or as a site that opens in a tab of its own. */
const open = signal(false)
const page = signal(/** @type {{ url: string, own: boolean } | null} */ (null))
const loading = signal(false)
const full = signal(false)
/** A page from a site not seen showing yet: the way out stays under it until the site shows it does. */
const unsure = signal(false)
/** What is typed in the address field, until it is sent or left. */
const typed = signal(/** @type {string | null} */ (null))
/** Bumped when Back, Forward or the address change, which the trail itself doesn't say. */
const moves = signal(0)
const trail = new Trail()
/** Sites seen showing in the frame, this visit: a page of theirs went on by itself. */
const shows = new Set()
/** The folder's page on show: its frame, the path its links start from, the files it was made of, by size and date; or why it can't show. */
const local = signal(/** @type {{ frame: HTMLIFrameElement, html: string, path: string, files: Record<string, string> } | { note: string } | null} */ (null))
/** Folders' module, once it is on: the conversation's folder, and its pages. @type {typeof import('../folders/folders.js') | null} */
let folders = null
const foldersOn = async () => (unlocked.peek().has('folders') ? (folders = await import('../folders/folders.js')) : null)
effect(() => {
  if (unlocked.value.has('folders') && !folders) foldersOn().then(() => bump())
})
// What a page may do, as Settings and policy have it (D143, D158), with its scripts as data.
const rights = computed(() => pageRights(effective.value.settings, app.policy))
const policy = computed(() => pagePolicy(rights.value.allows, rights.value.sites, true))
const allow = computed(() => pageAllow(rights.value.allows))

/** The browser.html frame, once loaded, and the site's frame in it. @type {HTMLIFrameElement | null} */
let host = null
/** @type {HTMLIFrameElement | null} */
let frame = null
/** An address waiting for the host to load. @type {string | null} */
let pending = null

/** Sites the user opens in a tab of their own, on this device. */
const windowed = () => effective.peek().settings.windowed ?? []
const searchPage = () => serviceURL('searchPage', app.settings.peek(), app.policy)
const bump = () => { moves.value++ }

/** Opens the pane, empty or on the page it had. */
export function show() {
  if (open.peek()) return
  open.value = true
  const shown = page.peek()
  const made = shown ? null : lastMade()
  if (shown && isLocal(shown.url)) frameTo(shown.url)
  else if (shown && !shown.own) pending = trail.reload()
  else if (made) visit(made)
}

/** The last web page Jean made or changed in this conversation's folder, which the browser opens on. */
function lastMade() {
  const records = (app.current.peek()?.records ?? []).flatMap(({ update }) => (update?.sessionUpdate === 'tool_call' ? [/** @type {import('../../core/types.js').ToolCallInfo} */ (update)] : []))
  const calls = [...records, ...(app.live.peek()?.turn.steps ?? []).flatMap((/** @type {any} */ step) => step.tools)]
  const path = (/** @type {any} */ call) => call.content?.find((/** @type {any} */ part) => part.type === 'diff')?.path ?? ''
  const made = calls.findLast((call) => call.name === 'change' && call.status !== 'failed' && call._meta?.folder && /\.html?$/i.test(path(call)))
  return made && `${FOLDER}${made._meta?.folder}/${path(made)}`
}

export function close() {
  open.value = false
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  full.value = false
  host = frame = null
  local.value = null
  loading.value = false
}

export const toggle = () => (open.peek() ? close() : show())

/**
 * Takes the pane to an address. A site that can't show here (one the user opens in its own tab,
 * or one a secure page can't frame) opens in a new tab when the user asked for it, and says so in
 * the pane otherwise (pop-ups need the user's click). Returns whether it shows in the frame.
 * @param {string} url @param {{ click?: boolean }} [how] a click of the user's, which may open a tab
 */
export function visit(url, { click = false } = {}) {
  typed.value = null
  if (!isLocal(url) && (!showable(url, location.href) || windowed().includes(siteOf(url)))) {
    if (click) openTab(url)
    if (!click || open.peek()) {
      page.value = { url, own: true }
      open.value = true
      frame?.remove()
      frame = null
      loading.value = false
    }
    return false
  }
  trail.open(url)
  page.value = { url, own: false }
  open.value = true
  frameTo(url, click)
  return true
}

/** @param {string} url */
const openTab = (url) => window.open(url, '_blank', 'noopener,noreferrer')

/**
 * A fresh frame for each address, so the tab's history holds only this site's pages. A site not
 * seen showing yet has its way out from the start: a refused page may never say it loaded.
 * @param {string} url @param {boolean} [click] a click of the user's, which lets the browser ask to open a folder
 */
function frameTo(url, click = false) {
  if (isLocal(url)) return void folderTo(url, click)
  local.value = null
  unsure.value = !shows.has(siteOf(url))
  bump()
  const doc = host?.contentDocument
  if (!doc?.body) return void (pending = url)
  pending = null
  // Jean walked its own history (Settings closing goes back): an entry may be ahead, which the
  // site's first page would take the place of without growing the history. One entry of Jean's
  // own address drops it, so the site's pages count from here. The Navigation API says whether
  // there is one; without it, the walks seen since this loaded, and any before, are guessed.
  if (/** @type {any} */ (globalThis).navigation?.canGoForward ?? ahead) history.pushState(history.state, '', location.href)
  ahead = false
  doc.body.replaceChildren()
  frame = doc.createElement('iframe')
  frame.setAttribute('sandbox', SANDBOX)
  frame.setAttribute('allow', ALLOW)
  frame.setAttribute('referrerpolicy', 'no-referrer')
  frame.title = url
  const mine = frame
  frame.addEventListener('load', () => mine === frame && loaded(url))
  frame.src = url
  doc.body.append(frame)
  loading.value = true
}

let asked = 0
/** A page of the conversation's folder, put together anew in a fresh frame; or why it can't show. @param {string} url @param {boolean} [click] */
async function folderTo(url, click = false) {
  frame?.remove()
  frame = null
  unsure.value = false
  loading.value = true
  bump()
  const at = ++asked
  const address = url.slice(FOLDER.length)
  const shown = await (await foldersOn())?.folderPage(address, click).catch((/** @type {unknown} */ error) => console.warn('Browser', error)) ?? { note: 'elsewhere' }
  if (at !== asked) return
  loading.value = false
  const [folder, ...path] = address.split('/')
  local.value = 'html' in shown ? { ...shown, frame: pageFrame(shown.html, policy.peek(), allow.peek(), address) } : { note: t(`browser.${shown.note}`, { folder, page: path.join('/') }) }
}

/**
 * A page of the folder in a frame of the preview's kind (D126, D143, D158): an opaque origin, which
 * can't read Jean's storage, its policy written ahead of it, what it allows set before its address.
 * @param {string} source @param {string} rules @param {string} allows @param {string} title
 */
function pageFrame(source, rules, allows, title) {
  const element = Object.assign(document.createElement('iframe'), { className: 'browser-page', title })
  element.setAttribute('sandbox', 'allow-scripts')
  element.setAttribute('allow', allows)
  element.addEventListener('load', () => element.contentWindow?.postMessage({ page: source, policy: rules }, '*'), { once: true })
  element.src = PAGE
  return element
}
// What a page may do changed in Settings: the page on show comes again under it.
effect(() => {
  const rules = policy.value
  const allows = allow.value
  const shown = local.peek()
  if (shown && 'html' in shown) local.value = { ...shown, frame: pageFrame(shown.html, rules, allows, shown.frame.title) }
})

// A link followed in a page of the folder: another of its pages, or a site; or a file it made, saved (D158).
addEventListener('message', ({ source, data }) => {
  const shown = local.peek()
  const [folder] = (page.peek()?.url ?? '').slice(FOLDER.length).split('/')
  if (!shown || !('frame' in shown) || source !== shown.frame.contentWindow) return
  if (typeof data?.open !== 'string') return savePage(data, rights.peek().allows.downloads)
  const base = new URL(shown.path.split('/').map(encodeURIComponent).join('/'), 'https://folder.invalid/')
  const to = new URL(data.open, base)
  if (to.origin === base.origin) visit(`${FOLDER}${folder}/${decodeURIComponent(to.pathname.slice(1))}`, { click: true })
  else if (/^https?:$/.test(to.protocol)) visit(to.href, { click: true })
})

// A page Jean made or changed in the folder opens; the page on show comes again when a file it was
// made of changed since: Jean's change, the user's own editor, a sync.
document.addEventListener('app-folder-changed', (event) => {
  const { folder, path } = /** @type {CustomEvent} */ (event).detail
  const url = `${FOLDER}${folder}/${path}`
  if (/\.html?$/i.test(path)) (open.peek() && page.peek()?.url === url ? frameTo(url) : visit(url))
})
setInterval(async () => {
  const shown = page.peek()
  const made = local.peek()
  if (!open.peek() || !shown || !isLocal(shown.url) || !made || !('files' in made) || document.hidden || loading.peek()) return
  if ((await (await foldersOn())?.pageMoved(shown.url.slice(FOLDER.length).split('/')[0], made.files)) && local.peek() === made) frameTo(shown.url)
}, 1500)

/** A page loaded in the frame: the one asked for, or one the site went to by itself, which shows it shows. @param {string} url */
function loaded(url) {
  loading.value = false
  settled = Date.now() + HOLD_MS
  if (trail.loaded(history.length)) shows.add(siteOf(url))
  unsure.value = !shows.has(siteOf(url))
  bump()
}

// Some browsers put a page that refuses to show in a frame in the place of the page around it:
// Arc takes Jean's tab to the site, with no script or header of the site's, past the sandbox. So
// while a page opens in the frame, and a moment after it loads, Jean's tab keeps to Jean: going to
// the site on show is called off where the Navigation API lets it be, and leaving otherwise asks.
const HOLD_MS = 3000
/** Until when, once the page in the frame has loaded, Jean's tab keeps to Jean. */
let settled = 0
const holds = () => open.peek() && page.peek()?.own === false && (loading.peek() || Date.now() < settled)
const navigation = /** @type {any} */ (globalThis).navigation
navigation?.addEventListener('navigate', (/** @type {any} */ event) => {
  const shown = page.peek()
  if (event.cancelable && holds() && shown && new URL(event.destination.url).origin === new URL(shown.url).origin) event.preventDefault()
})
addEventListener('beforeunload', (event) => { if (holds()) event.preventDefault() })

let guard = { until: 0, undo: 0 }
/** Whether Jean's own history may have been walked back since (before this loaded, it may have been). */
let ahead = true

/** @param {'back' | 'forward'} way */
function walk(way) {
  trail.sync(history.length)
  const step = way === 'back' ? trail.back() : trail.forward()
  if (step === 'history') {
    // Walking the tab's history never goes past the site's own pages; if it did reach Jean's, it comes straight back.
    guard = { until: Date.now() + 1500, undo: way === 'back' ? 1 : -1 }
    history.go(-guard.undo)
  } else if (step) {
    page.value = { url: step, own: false }
    frameTo(step, true)
  }
  bump()
}

addEventListener('popstate', () => {
  if (Date.now() < guard.until) history.go(guard.undo)
  guard.until = 0
  ahead = true
  trail.elsewhere()
  bump()
})
// A site that changes its address by script adds to the tab's history without loading a page:
// seen when the user comes back to Jean from it.
addEventListener('focus', () => {
  trail.sync(history.length)
  bump()
})
// Another conversation or project is an entry of Jean's own in the tab's history.
let place = ''
effect(() => {
  const here = `${app.project.value.dir}/${app.current.value?.id ?? ''}`
  if (place && here !== place) trail.elsewhere()
  place = here
})

function reload() {
  const shown = page.peek()
  if (!shown) return
  if (shown.own) return void visit(shown.url)
  frameTo(trail.reload(), true)
}

async function fullscreen() {
  const pane = /** @type {HTMLElement | null} */ (document.querySelector('.browser'))
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
  else if (document.fullscreenEnabled && pane?.requestFullscreen) await pane.requestFullscreen().catch(() => { full.value = !full.peek() })
  // Where a page can't go full screen (an iPhone), the pane covers the window instead.
  else full.value = !full.peek()
}
document.addEventListener('fullscreenchange', () => { full.value = Boolean(document.fullscreenElement?.matches('.browser')) })

/** Whatever was typed in the address field: an address, a site or words. @param {SubmitEvent} event */
function submit(event) {
  event.preventDefault()
  const text = String(new FormData(/** @type {HTMLFormElement} */ (event.target)).get('address') ?? '')
  // The conversation's folder, by its name, or the web.
  const folder = folders?.folderOf(app.current.peek())?.name
  const url = folder && `${text.trim()}/`.startsWith(`${folder}/`) ? `${FOLDER}${text.trim() === folder ? `${folder}/` : text.trim()}` : addressOf(text, searchPage(), locale.peek().split('-')[0])
  const field = /** @type {HTMLInputElement | null} */ (document.querySelector('.browser-bar input'))
  field?.blur()
  if (url) visit(url, { click: true })
  else if (text.trim()) notify(t('browser.refused'))
}

/** The site the user found doesn't show here: a tab of its own, now and from then on. @param {string} url */
async function ownTab(url) {
  openTab(url)
  const site = siteOf(url)
  if (!windowed().includes(site)) await updateSettings({ windowed: [...windowed(), site] })
  visit(url)
}

/** Shown here again, after all. @param {string} url */
async function retry(url) {
  const site = siteOf(url)
  await updateSettings({ windowed: windowed().filter((other) => other !== site) })
  visit(url)
}

class Browser extends Element {
  render() {
    if (!open.value) return nothing
    void moves.value
    const shown = page.value
    const here = shown && isLocal(shown.url) ? local.value : null
    const address = shown && isLocal(shown.url) ? shown.url.slice(FOLDER.length) : shown?.url ?? ''
    const folder = folders?.folderOf(app.current.value)
    const button = (/** @type {string} */ label, /** @type {unknown} */ icon, /** @type {() => unknown} */ run, disabled = false) => html`<button class="icon-button"
      title=${label} aria-label=${label} ?disabled=${disabled} @click=${run}>${icon}</button>`
    return html`<aside class="pane browser ${full.value ? 'is-full' : ''}" aria-label=${t('cap.browser.name')}>
      <header class="pane-head browser-bar">
        ${button(t('browser.back'), GLYPHS.back, () => walk('back'), !trail.canBack)}
        ${button(t('browser.forward'), icons.arrow, () => walk('forward'), !trail.canForward)}
        ${button(t('browser.reload'), icons.retry, reload, !shown)}
        <form @submit=${submit}>
          <input name="address" type="text" inputmode="url" enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false" dir="auto"
            class=${shown && !shown.own && trail.moved ? 'is-moved' : ''} aria-label=${t('browser.address')} placeholder=${t('browser.placeholder')}
            .value=${live(typed.value ?? address)} @input=${(/** @type {InputEvent} */ event) => { typed.value = /** @type {HTMLInputElement} */ (event.target).value }}
            @focus=${(/** @type {FocusEvent} */ event) => /** @type {HTMLInputElement} */ (event.target).select()}
            @keydown=${(/** @type {KeyboardEvent} */ event) => { if (event.key === 'Escape' && !event.isComposing) typed.value = null }}
            @blur=${() => { typed.value = null }}>
        </form>
        ${button(t('browser.tab'), GLYPHS.tab, () => openTab(address), !shown || isLocal(shown.url))}
        ${button(full.value ? t('browser.exitFullscreen') : t('browser.fullscreen'), full.value ? GLYPHS.exit : GLYPHS.full, fullscreen)}
        ${button(t('action.close'), icons.close, close)}
      </header>
      <div class="browser-body">
        ${loading.value ? html`<div class="browser-loading" role="progressbar" aria-label=${t('browser.reload')}></div>` : nothing}
        <iframe class="browser-host" src=${HOST} title=${address || t('cap.browser.name')} allow="fullscreen" ?hidden=${!shown || shown.own || isLocal(shown.url)} @load=${hosted}></iframe>
        ${!shown ? html`<div class="browser-note"><p>${t('browser.empty')}</p>
          ${folder ? html`<div class="row"><button class="button" @click=${() => visit(`${FOLDER}${folder.name}/`, { click: true })}>${icons.folder} ${t('browser.folder', { folder: folder.name })}</button></div>` : nothing}</div>`
        : shown.own ? own(shown.url) : here ? ('frame' in here ? here.frame : html`<div class="browser-note"><p>${here.note}</p></div>`) : nothing}
        ${shown && !shown.own && !isLocal(shown.url) && unsure.value ? html`<div class="browser-strip" role="status">
          <p>${t('browser.blank')}</p>
          <button class="button" @click=${() => ownTab(shown.url)}>${GLYPHS.tab} ${t('browser.tab')}</button>
          <button class="icon-button subtle" title=${t('action.close')} aria-label=${t('action.close')} @click=${() => { shows.add(siteOf(shown.url)); unsure.value = false }}>${icons.close}</button>
        </div>` : nothing}
      </div>
    </aside>`
  }

  updated() {
    // Opened empty, it takes an address.
    if (dock.place(this, open.value) && !page.value) /** @type {HTMLInputElement | null} */ (this.querySelector('.browser-bar input'))?.focus()
  }
}

/** The host document is in: the address waiting for it goes in. @param {Event} event */
function hosted(event) {
  host = /** @type {HTMLIFrameElement} */ (event.target)
  if (pending) frameTo(pending)
}

/**
 * A site that opens in a tab of its own, and how to install it as an app, which gives it a window
 * of its own and a place on the desktop: the steps of this browser, or a bookmark where it can't.
 * @param {string} url
 */
function own(url) {
  const way = installer(/** @type {any} */ (navigator))
  const here = showable(url, location.href)
  return html`<div class="browser-note">
    <h2 dir="auto">${t('browser.own.title', { site: siteOf(url) })}</h2>
    <p>${t('browser.own.text')}</p>
    <div class="row">
      <button class="button primary" @click=${() => openTab(url)}>${GLYPHS.tab} ${t('browser.tab')}</button>
      ${here ? html`<button class="button subtle" @click=${() => retry(url)}>${t('browser.retry')}</button>` : nothing}
    </div>
    <div class="browser-install">
      ${way === 'none' ? nothing : html`<p>${t('browser.install')}</p>`}
      <p>${t(`browser.install.${way}`)}</p>
    </div>
  </div>`
}

// ─── Links in answers ────────────────────────────────────────────────────────

// A web link in the conversation opens beside it; with a modifier key, where the browser puts it.
document.addEventListener('click', (event) => {
  // window.Element: Element here is the base of Jean's own elements.
  const link = event.target instanceof window.Element ? event.target.closest('app-conversation a[href]') : null
  if (!(link instanceof HTMLAnchorElement) || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const { href } = link
  if (!/^https?:/i.test(href)) return
  event.preventDefault()
  visit(href, { click: true })
})

// ─── For the brain ───────────────────────────────────────────────────────────

/**
 * A page's words, when its site lets other sites read it (CORS): most don't, and then there is
 * nothing to read from here. No cookies go with it. @param {string} url @param {AbortSignal} [signal]
 */
async function read(url, signal) {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), READ_MS)
  signal?.addEventListener('abort', () => stop.abort(), { once: true })
  try {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: stop.signal })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !/^text\/|json|xml/.test(type)) return null
    const body = await response.text()
    return /html|xml/.test(type) ? pageText(body, READ_CHARS) : { title: '', text: body.slice(0, READ_CHARS), manifest: false }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** @type {import('../../core/loop.js').Tool} */
const browseTool = {
  spec: {
    name: 'browse',
    description: 'Show the user a web page in the browser beside the conversation, and read its text when the site allows it: the text is a numbered source to cite. Or show a file of the conversation\'s folder there by its path (a page you make or change there shows by itself). Or go back, forward or reload there. <page> says which page is open.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The address to open, e.g. https://example.com' },
        path: { type: 'string', description: 'A file of the conversation\'s folder, e.g. site/index.html; empty for the folder' },
        go: { type: 'string', enum: ['back', 'forward', 'reload'] },
      },
    },
  },
  kind: 'fetch',
  // The address itself: what the user approves, in any language.
  title: (args) => (args?.go ? `${args.go}` : String(args?.path ?? args?.url ?? '')),
  run: async (args, ctx) => {
    if (typeof args?.path === 'string') {
      const folder = folders?.folderOf(conversationOf(ctx.signal))?.name
      if (!folder) throw new Error('No folder is open in this conversation.')
      const path = args.path.trim().replace(/^\.?\/+/, '')
      visit(`${FOLDER}${folder}/${path}`)
      return `Showing ${path || 'the folder'} from "${folder}" beside the conversation.`
    }
    if (args?.go) {
      if (!page.peek()) return 'Nothing is open in the browser.'
      if (args.go === 'reload') reload()
      else walk(args.go === 'forward' ? 'forward' : 'back')
      await new Promise((resolve) => setTimeout(resolve, 300))
      return trail.moved ? 'Done. The page it went to can’t be named from here.' : `Done. It shows ${page.peek()?.url}.`
    }
    const url = addressOf(String(args?.url ?? ''), searchPage(), locale.peek().split('-')[0])
    if (!url) throw new Error('Give a web address, like https://example.com.')
    const shown = visit(url)
    const status = shown ? `Showing ${url} beside the conversation.` : `${siteOf(url)} can’t show beside the conversation: the user can open it in a tab of its own, or install the site as an app.`
    const found = await read(url, ctx.signal)
    if (!found?.text) return `${status} Its text can’t be read from here: the site doesn’t let other sites read it. Ask the user what they see, or search the web.`
    const title = found.title || siteOf(url)
    const [n] = ctx.cite([{ title, url, quote: found.text.slice(0, 150) }])
    return `${status}${found.manifest ? ' The site is made to install as an app.' : ''}\n\nSource [${n}]: ${title} (${url})\n${found.text}`
  },
}

register({
  id: 'browser',
  tools: [browseTool],
  lines: [{ name: 'browse', line: 'show the user a web page beside the conversation, and read it when the site allows' }],
  // What the user is looking at, without what follows # (where a sign-in may leave a token).
  sections: async () => {
    const shown = page.peek()
    if (!open.peek() || !shown || shown.own) return {}
    if (isLocal(shown.url)) return { page: `The browser beside the conversation shows ${shown.url.slice(FOLDER.length)}, from the user's folder.` }
    return { page: `The browser beside the conversation shows ${shown.url.split('#')[0]}${trail.moved ? ', or a page the user went to from there' : ''}.` }
  },
})

define('app-browser', Browser)
dock.join(document.createElement('app-browser'))
