// A game played (D648): `<app-game>`, a game's frame in its pane, and the frames of its play-tests, out of sight. Each is a frame of
// a file pane's kind (preview.html, D126): an opaque origin, scripts and forms, under the policy Settings give web pages, but never
// reaching the internet whatever they allow, and allowed gamepads besides. Its page is the shell (./shell.js) and its styles, the
// game's facts, and the game, guarded (./guard.js) and run as a module that imports its engine by name: Phaser for 2D, a kit of
// Babylon.js for 3D, and ZzFX for its sounds, are lent through stand-ins that ask Jean for them, as ECharts is to a page in an answer. What it saves is kept beside it,
// `games/.saves/<ulid>.json`, and given back when it starts again. Once played, its pane is kept, as a pane a click changed is.
import { html, nothing, render } from 'lit-html'
import { computed, effect } from '@preact/signals-core'
import { app, effective } from '../../ui/state.js'
import { pageRights, pagePolicy, pageAllow, PAGE_SANDBOX } from '../../ui/csp.js'
import { still } from '../../ui/sheet.js'
import { t, locale, dir } from '../../core/i18n.js'
import { guard } from './guard.js'
import { actionsOf } from './file.js'

/** @typedef {{ path: string, name: string, card: string, code: string, meta: import('./file.js').Meta }} Kept */

const FRAME = new URL('../../preview.html', import.meta.url).href
const rights = computed(() => pageRights(effective.value.settings, app.policy))
/** A game's policy: a web page's, offline. */
const policy = () => pagePolicy({ ...rights.peek().allows, web: false, network: false }, [], true)
/** What a game imports by name, each read once: its engine's, and ZzFX. */
const LENT = /** @type {Record<string, string>} */ ({ phaser: '../../vendor/phaser/phaser.mjs', babylon: '../../vendor/babylon/babylon.mjs', zzfx: '../../vendor/zzfx/zzfx.mjs' })
const read = /** @type {Map<string, Promise<string>>} */ (new Map())
const text = (/** @type {string} */ path) => read.get(path) ?? /** @type {Promise<string>} */ (read.set(path, fetch(new URL(path, import.meta.url)).then((response) => response.text())).get(path))
/** @type {Map<string, Promise<string>>} */
const stands = new Map()

/** The module a game's page imports by a lent name: one that asks Jean for the module and gives its exports. @param {string} name */
const stand = (name) => stands.get(name) ?? /** @type {Promise<string>} */ (stands.set(name, text(LENT[name]).then((source) => {
  const at = Math.max(source.lastIndexOf('export{'), source.lastIndexOf('export {'))
  const names = source.slice(source.indexOf('{', at) + 1, source.indexOf('}', at)).split(',').map((one) => one.trim().split(/\s+as\s+/).pop() ?? '').filter((one) => /^[\w$]+$/.test(one))
  const code = `const text=await new Promise((done)=>{addEventListener('message',function got({data,source}){if(source===parent&&data?.lent===${JSON.stringify(name)})removeEventListener('message',got),done(data.text)});parent.postMessage({need:${JSON.stringify(name)}},'*')})
const m=await import(URL.createObjectURL(new Blob([text],{type:'text/javascript'})))
export const {${names.filter((one) => one !== 'default').join(',')}}=m
export default ${names.includes('default') ? 'm.default' : 'm'}`
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`
})).get(name))

/** Lends what a game's page asks for. @param {MessageEvent} event */
const lend = ({ source, data }) => { if (typeof data?.need === 'string' && Object.hasOwn(LENT, data.need)) void text(LENT[data.need]).then((lent) => /** @type {Window} */ (source).postMessage({ lent: data.need, text: lent }, '*')) }

/** Where a game's saves are kept. @param {string} path */
export const savesOf = (path) => path.replace(/^games\/([^-/]+)-[^/]*$/, 'games/.saves/$1.json')
/** A game's saves: what it saved, and its localStorage. @param {string} path @returns {Promise<{ save: string | null, storage: Record<string, string> }>} */
const savedFor = async (path) => ({ save: null, storage: {}, ...JSON.parse((await app.fs.read(`${app.projectDir}/${savesOf(path)}`)) ?? '{}') })
/** What a game saves, 64 KB at most of each, kept. @param {string} path @param {{ save?: unknown, storage?: unknown }} kept */
async function keep(path, { save, storage }) {
  const stored = Object.fromEntries(Object.entries(storage && typeof storage === 'object' ? storage : {}).map(([key, value]) => [String(key), String(value)]))
  if ((typeof save !== 'string' && save !== null) || String(save).length > 65536 || JSON.stringify(stored).length > 65536) return
  await app.fs.write(`${app.projectDir}/${savesOf(path)}`, JSON.stringify({ format: 1, save, storage: stored }))
}

/**
 * A game's page: its facts, the shell, its styles and the game, guarded. @param {Kept} game
 * @param {{ test?: { frames: number, seed: number, press: { action: string, from: number, to: number }[] } | null, saved?: { save: string | null, storage: Record<string, string> } }} [options]
 */
export async function pageOf(game, { test = null, saved = { save: null, storage: {} } } = {}) {
  const lang = locale.peek(), [shell, css] = await Promise.all([text('./shell.js'), text('./frame.css')])
  const imports = Object.fromEntries(await Promise.all([game.meta.engine, 'zzfx'].filter((name) => Object.hasOwn(LENT, name)).map(async (name) => [name, await stand(name)])))
  const words = Object.fromEntries(['play', 'resume', 'paused', 'pause', 'mute', 'full', 'left', 'right', 'up', 'down'].map((key) => [key, t(`games.${key}`)]))
  const given = JSON.stringify({ test, saved, words, actions: actionsOf(game.meta.actions), reduced: still(), title: game.name }).replace(/</g, '\\u003c')
  return /* html */ `<html lang="${lang}" dir="${dir(lang)}"><meta charset="utf-8"><script type="importmap">${JSON.stringify({ imports })}</script><script>window.__game=${given}</script><script>${shell}</script><style>${css}</style>
<body><div id="stage" tabindex="-1"></div><script type="text/x-game" id="game">${guard(game.code, '__loop()').replace(/<\/(script)/gi, '<\\/$1')}</script>`
}

/**
 * One run of a play-test, in a frame out of sight: the shell's report, else how many frames it reached in time.
 * @param {Kept} game @param {NonNullable<Parameters<typeof pageOf>[1]>['test']} test @param {number} ms @param {AbortSignal} [signal]
 * @returns {Promise<any>}
 */
export function run(game, test, ms, signal) {
  const box = Object.assign(document.createElement('div'), { className: 'game-test', inert: true }), frame = Object.assign(document.createElement('iframe'), { src: FRAME })
  frame.setAttribute('sandbox', PAGE_SANDBOX)
  box.setAttribute('aria-hidden', 'true')
  return new Promise((resolve) => {
    let frames = 0
    const done = (/** @type {unknown} */ report) => { clearTimeout(timer); removeEventListener('message', heard); box.remove(); resolve(report) }
    const heard = (/** @type {MessageEvent} */ event) => {
      if (event.source !== frame.contentWindow) return
      if (Number.isFinite(event.data?.progress)) frames = event.data.progress
      else if (event.data?.report) done(event.data.report)
      else lend(event)
    }
    const timer = setTimeout(() => done({ timeout: true, frames }), ms)
    signal?.addEventListener('abort', () => done({ timeout: true, frames }), { once: true })
    addEventListener('message', heard)
    frame.addEventListener('load', async () => frame.contentWindow?.postMessage({ page: await pageOf(game, { test }), policy: policy() }, '*'), { once: true })
    box.append(frame)
    document.body.append(box)
  })
}

customElements.define('app-game', class extends HTMLElement {
  #game = /** @type {Kept | null} */ (null)
  /** What its frame was made for. */
  made = ''
  #stop = () => {}
  set game(game) { this.#game = game; if (this.isConnected) this.draw() }
  get game() { return this.#game }

  connectedCallback() {
    addEventListener('message', this.heard)
    this.#stop = effect(() => { void [rights.value, locale.value]; this.draw() })
  }

  disconnectedCallback() { removeEventListener('message', this.heard); this.#stop(); this.made = '' }

  /** Its frame, made again when the game, what pages may do or the language changes; with scripts turned off, its card. */
  draw() {
    const game = this.#game, { allows } = rights.peek()
    if (!game) return
    if (!allows.scripts) return void (this.made = '', render(html`<div class="game-off"><h2 dir="auto">${game.name}</h2><p dir="auto">${game.card}</p><p>${t('games.off')}</p></div>`, this))
    const made = [game.path, game.code, pageAllow(allows), locale.peek()].join('\n')
    if (made === this.made) return
    this.made = made
    render(nothing, this)
    const begin = async (/** @type {Event} */ event) => /** @type {HTMLIFrameElement} */ (event.target).contentWindow?.postMessage({ page: await pageOf(game, { saved: await savedFor(game.path) }), policy: policy() }, '*')
    render(html`<iframe sandbox=${PAGE_SANDBOX} allow=${`${pageAllow(allows)}; gamepad *`} src=${FRAME} title=${t('games.frame', { name: game.name })} @load=${begin}></iframe>`, this)
  }

  /** What its frame says: an engine it needs, what it saves, that it is being played. @param {MessageEvent} event */
  heard = (event) => {
    if (!this.#game || event.source !== this.querySelector('iframe')?.contentWindow) return
    if (event.data?.keep && typeof event.data.keep === 'object') void keep(this.#game.path, event.data.keep).catch(console.warn)
    else if (event.data?.playing) this.dispatchEvent(new Event('input', { bubbles: true }))
    else lend(event)
  }
})
