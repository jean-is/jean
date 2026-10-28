// A game's page (D648): its facts, the shell (./shell.js) and its styles, and the game, guarded (./guard.js). In a frame of Jean's
// (./frame.js) its engine is lent; as a page of its own, which Save gives and a task saved as a page or shared by link shows
// (ui/view.js), its engine is inside it: offline, its card where scripts don't run, and what it saves kept in the browser's storage
// where the page has one (a file opened), else for the visit.
import { pagePolicy } from '../../ui/csp.js'
import { still } from '../../ui/sheet.js'
import { t, locale, dir, useStrings } from '../../core/i18n.js'
import { guard } from './guard.js'
import { actionsOf, gameOf, PICTURE } from './file.js'

/** What a game imports by name: its engine's, and ZzFX. */
export const LENT = /** @type {Record<string, string>} */ ({ phaser: '../../vendor/phaser/phaser.mjs', babylon: '../../vendor/babylon/babylon.mjs', zzfx: '../../vendor/zzfx/zzfx.mjs' })
/** The names a game imports. @param {{ meta: { engine: string } }} game */
export const lent = (game) => [game.meta.engine, 'zzfx'].filter((name) => Object.hasOwn(LENT, name))
const read = /** @type {Map<string, Promise<string>>} */ (new Map())
/** A file beside this module, read once. @param {string} path */
export const text = (path) => read.get(path) ?? /** @type {Promise<string>} */ (read.set(path, fetch(new URL(path, import.meta.url)).then((response) => response.text())).get(path))
const escaped = (/** @type {string} */ words) => words.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/**
 * A game's page. `imports`: its import map, none for a page whose `boot` makes its own; `head`, what its head starts with.
 * @param {import('./file.js').Game} game
 * @param {{ test?: { frames: number, seed: number, press: { action: string, from: number, to: number }[] } | null, saved?: { save: string | null, storage: Record<string, string> },
 *   imports?: Record<string, string> | null, head?: string, boot?: string }} [options]
 */
export async function pageOf(game, { test = null, saved = { save: null, storage: {} }, imports = null, head = '', boot = '' } = {}) {
  const lang = locale.peek(), [shell, css] = await Promise.all([text('./shell.js'), text('./frame.css')])
  const words = Object.fromEntries(['play', 'resume', 'paused', 'pause', 'mute', 'full', 'left', 'right', 'up', 'down'].map((key) => [key, t(`games.${key}`)]))
  const given = JSON.stringify({ test, saved, words, actions: actionsOf(game.meta.actions), reduced: still(), title: game.name, pictured: Boolean(game.picture) }).replace(/</g, '\\u003c')
  return /* html */ `<html lang="${lang}" dir="${dir(lang)}"><meta charset="utf-8">${head}${imports ? `<script type="importmap">${JSON.stringify({ imports })}</script>` : ''}<script>window.__game=${given}</script>${boot}<script>${shell}</script><style>${css}</style>
<body><noscript><article dir="auto">${game.picture && PICTURE.test(game.picture) ? `<img src="${game.picture}" alt="">` : ''}<h1>${escaped(game.name)}</h1><p>${escaped(game.card)}</p></article></noscript><div id="stage" tabindex="-1"></div><script type="text/x-game" id="game">${guard(game.code, '__loop()').replace(/<\/(script)/gi, '<\\/$1')}</script>`
}

/**
 * A game's file as a page of its own: each engine as an inert script, made a module and mapped to its name before the shell runs,
 * what it saves read from the browser's storage where it has one and written there as the shell sends it, motion as the user's
 * Motion was when it was saved (D523). @param {string} file
 */
export async function alone(file) {
  const game = gameOf(file)
  if (!game) return file
  await useStrings('games')
  // An engine stays inert whatever it holds: "</script" and "<!--" written as JavaScript reads them the same.
  const engines = await Promise.all(lent(game).map(async (name) => `<script type="text/x-engine" data-name="${name}">${(await text(LENT[name])).replace(/<(\/script|!--)/gi, '\\x3C$1')}</script>`))
  const boot = `(()=>{const g=window.__game,key=${JSON.stringify(`game ${game.meta.created} ${game.name}`)},imports={};let store=null
try{store=localStorage;Object.assign(g.saved,JSON.parse(store.getItem(key)||'{}'))}catch{store=null}
for(const e of document.querySelectorAll('script[type="text/x-engine"]'))imports[e.dataset.name]=URL.createObjectURL(new Blob([e.textContent],{type:'text/javascript'}))
document.head.append(Object.assign(document.createElement('script'),{type:'importmap',textContent:JSON.stringify({imports})}))
if(parent===window&&store){const send=postMessage.bind(window);window.postMessage=(m,o)=>{if(m&&m.keep)try{store.setItem(key,JSON.stringify(m.keep))}catch{}send(m,o)}}})()`
  const head = `<meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${pagePolicy({ scripts: true, web: false, network: false, downloads: false, fullscreen: true, maps: false }, [], true)}"><title>${escaped(game.name)}</title>`
  return `<!doctype html>${await pageOf(game, { head, boot: `${engines.join('')}<script>${boot}</script>` })}`
}
