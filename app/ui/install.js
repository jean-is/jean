// SPDX-License-Identifier: MIT
// An app or a game Jean made, installed on this device as an app of its own, from Jean's own address, nothing published (D770). As the
// menu of its pane's one button out opens (./out.js), the page's manifest becomes one made for it in the page, a blob: its name, its picture
// or its initial on a colour of its own, and its address, Jean's own page with `?app` and, after `#`, which no server is sent, the profile,
// project and place it is at. A Chromium browser then offers to install it, which Install as an app asks; the menu closed, once that is
// answered, Jean's manifest is back. Opened at that address, Jean starts as it always does, its profile and lock first, then shows the
// creation alone, as its pane does, newest as it is now, what it keeps kept with its task; and in a browser's tab, Install as an app over it
// while the browser offers it. A browser whose installed apps don't share its storage (Safari's) is never offered it: there, nothing is found.
import { html, nothing, render } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, refreshConversations } from './state.js'
import { unlock } from './caps.js'
import { here, PROFILE } from './opfs.js'
import { icons } from './menu-icons.js'
import { t, locale, dir, useStrings } from '../core/i18n.js'

await useStrings('out')

/** @typedef {{ metaOf: (uri: string) => Promise<{ title: string, picture?: string } | null | undefined>, editor: (file: { uri: string }, holds: (() => void)[], close: () => void) => Promise<unknown> }} Kind */
/** What installs, by its place: its capability, its module, and for an app, its newest version of that name in its task, as a brain writes one whole again. */
const KINDS = /** @type {[RegExp, string, () => Promise<Kind>, ((kind: any, uri: string, name: string) => Promise<string | undefined>)?][]} */ ([
  [/^conversations\/[^#]+#app-\d+$/, 'interactive', () => import('../caps/interactive/apps.js'),
    async ({ apps }, uri, name) => (await apps.kept()).find((/** @type {{ path: string, name: string }} */ one) => one.path.replace(/#.*/, '') === uri.replace(/#.*/, '') && one.name === name)?.path],
  [/^games\//, 'games', () => import('../caps/games/games.js')]])
/** Whether a place is one that installs. @param {string} uri */
export const installs = (uri) => KINDS.some(([place]) => place.test(uri))

/** Where it opens alone: this page with `?app`, and after `#` what finds it. @param {string} uri @param {string} name */
const addressOf = (uri, name) => Object.assign(new URL('./?app', location.href), { hash: String(new URLSearchParams({ profile: here(), project: app.projectDir, uri, name })) }).href
/** What the browser knows it by, whatever its version: its place, an app's task and name. @param {string} uri @param {string} name */
const idOf = (uri, name) => new URL(`./?app=${encodeURIComponent([here(), app.projectDir, uri.startsWith('conversations/') ? `${uri.replace(/#.*/, '')}#${name}` : uri].join('|'))}`, location.href).href

/** Its icon, as a PNG `data:` address: its picture, cut square, or its initial on a colour its name gives. @param {string} name @param {string} [picture] */
async function iconOf(name, picture) {
  const canvas = new OffscreenCanvas(512, 512), c = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'))
  const image = picture ? Object.assign(new Image(), { src: picture }) : null, shown = await image?.decode().then(() => true, () => false)
  if (image && shown) { const side = Math.min(image.naturalWidth, image.naturalHeight); c.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 512, 512) }
  else {
    // White reads on it at AA: a mid lightness, whatever the hue.
    c.fillStyle = `oklch(0.5 0.15 ${[...name].reduce((hue, char) => (hue * 31 + (char.codePointAt(0) ?? 0)) % 360, 0)})`
    c.fillRect(0, 0, 512, 512)
    Object.assign(c, { fillStyle: '#fff', font: '600 256px system-ui, sans-serif', textAlign: 'center', textBaseline: 'middle' })
    c.fillText(([...new Intl.Segmenter(locale.peek()).segment(name.trim() || '?')][0]?.segment ?? '?').toLocaleUpperCase(locale.peek()), 256, 272)
  }
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Promise((resolve) => Object.assign(new FileReader(), { onload: (/** @type {ProgressEvent<FileReader>} */ { target }) => resolve(String(target?.result)) }).readAsDataURL(blob))
}

/** Its manifest, every address whole, as a blob's can't be a base. @param {string} uri @param {string} name @param {string} [picture] */
async function manifestOf(uri, name, picture) {
  const colour = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? undefined, src = await iconOf(name, picture)
  return { id: idOf(uri, name), name, short_name: name, start_url: addressOf(uri, name), scope: new URL('./', location.href).href, display: 'standalone', lang: locale.peek(), dir: dir(locale.peek()),
    theme_color: colour, background_color: colour, icons: ['any', 'maskable'].map((purpose) => ({ src, sizes: '512x512', type: 'image/png', purpose })) }
}

/** The browser's offer for the manifest made here, and the manifest it replaced. */
const offered = signal(/** @type {(Event & { prompt: () => Promise<unknown> }) | null} */ (null))
let made = '', jeans = '', turn = 0, asked = /** @type {Promise<unknown> | null} */ (null)
addEventListener('beforeinstallprompt', (event) => { if (made && document.querySelector('link[rel="manifest"]')?.getAttribute('href') === made) (event.preventDefault(), (offered.value = /** @type {any} */ (event))) })

/** The page's manifest made for one, by its place and name, a game's picture its icon. @param {string} uri @param {string} name @param {string} [picture] */
async function wear(uri, name, picture) {
  const link = document.querySelector('link[rel="manifest"]'), mine = ++turn, manifest = await manifestOf(uri, name, picture)
  if (!link || mine !== turn) return
  if (link.getAttribute('href') !== made) jeans = link.getAttribute('href') ?? ''
  URL.revokeObjectURL(made)
  offered.value = null
  link.setAttribute('href', (made = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }))))
}

/** The menu opened on one that installs: the page's manifest is its own. @param {{ uri: string, title: string }} file */
export async function ready({ uri, title }) {
  const [, , load] = KINDS.find(([place]) => place.test(uri)) ?? []
  if (load) await wear(uri, title, (await (await load()).metaOf(uri))?.picture)
}

/** The menu closed: Jean's own manifest back, once the browser's question, if asked, is answered. */
export async function done() {
  const mine = ++turn
  await asked
  const link = document.querySelector('link[rel="manifest"]')
  if (mine !== turn || !made) return
  if (link?.getAttribute('href') === made) link.setAttribute('href', jeans)
  URL.revokeObjectURL(made)
  made = ''
  offered.value = null
}

/** Install as an app: the browser's own question, else its page alone in a tab, where the browser offers it. @param {{ uri: string, title: string }} file */
export async function install({ uri, title }) {
  const offer = offered.peek()
  if (!offer) return void open(addressOf(uri, title), '_blank', 'noopener')
  offered.value = null
  // Its promise holds the person's answer.
  await (asked = offer.prompt().catch(() => null))
  asked = null
}

/** The rules of a page with one creation alone, which fills it. */
const ALONE = `:root[data-alone] .room { display: none; }
.alone { position: fixed; inset: 0; display: grid; overflow: auto; background: var(--room); color: var(--ink); }
.alone > .prose, .alone > app-game { min-block-size: 0; margin: 0; max-inline-size: none; }
.alone :is(app-page, app-parts) { block-size: 100%; } .alone iframe { block-size: 100% !important; inline-size: 100%; }
.alone-gone { margin: auto; padding: 1rem; } .alone-install { position: fixed; inset-block-start: 0.75rem; inset-inline-end: 0.75rem; }`

/**
 * This page at `?app`, once Jean has started (ui/app.js): the creation its address names, alone, in its profile, opened again where this tab
 * has another, its manifest the one it was installed with, so the browser keeps it as it is; one no longer here says so.
 */
export async function alone() {
  const at = new URLSearchParams(location.hash.slice(1)), uri = at.get('uri') ?? '', name = at.get('name') ?? '', project = app.projects.peek().find((one) => one.dir === at.get('project')), profile = at.get('profile')
  // Another profile than the one this tab opened: that one, opened again.
  if (profile !== null && profile !== here()) return (sessionStorage.setItem(PROFILE, profile), location.reload())
  if (project && project !== app.project.peek()) (app.project.value = project, await refreshConversations())
  const [, id, load, newest] = KINDS.find(([place]) => place.test(uri)) ?? []
  const kind = id && load && await unlock(id) ? await load() : null, now = kind && ((await kind.metaOf(uri)) ? uri : await newest?.(kind, uri, name)), meta = now ? await kind?.metaOf(now) : null
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(ALONE)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  document.documentElement.dataset.alone = ''
  document.title = meta?.title ?? name
  const main = document.body.appendChild(Object.assign(document.createElement('main'), { className: 'alone' })), bar = document.body.appendChild(document.createElement('div'))
  render(kind && now && meta ? await kind.editor({ uri: now }, [], () => {}) : html`<p class="alone-gone" role="alert" dir="auto">${t('out.gone', { name })}</p>`, main)
  document.documentElement.classList.add('is-ready')
  await wear(uri, name, meta?.picture).catch(console.warn)
  // In a browser's tab, what installs it, while the browser offers it.
  effect(() => { render(offered.value && matchMedia('(display-mode: browser)').matches ? html`<button class="button primary alone-install" @click=${() => install({ uri, title: name })}>${icons.devices}${t('out.install')}</button>` : nothing, bar) })
}
