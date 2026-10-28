// Games (D648): original games the brain makes with its skill "Make a game", which plays them here. Each is a file of the project,
// `games/<ulid>-<slug>.game.html` (./file.js), made or replaced whole by `game` and changed by exact passages with `game_change`;
// each call plays it out of sight and tells the brain what broke, what each control did and what moments it reached (./test.js),
// so that it fixes the game before showing it. A game opens beside the task in its own frame (./frame.js): a cover to start it,
// pause, mute, full screen, buttons on a touch screen, saves kept beside it. Among the creations once the project holds one; until
// then its card to start one. Found by its skill, which brings it (D401); nothing of it shows before.
import { html, svg } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, conversationOf } from '../../ui/state.js'
import { register, unlock } from '../../ui/caps.js'
import { icon } from '../../ui/menu-icons.js'
import { ask, reread, prose, page } from '../../ui/creations.js'
import { languageOf } from '../../ui/language.js'
import { styleSheet } from '../../ui/sheet.js'
import { noteRecord } from '../../core/events.js'
import { ulid } from '../../core/ulid.js'
import { slug } from '../../core/settings.js'
import { locale, useStrings } from '../../core/i18n.js'
import { PLACE, ENGINES, fileOf, gameOf, actionsOf, replaceOnce } from './file.js'
import { LINES, GAME, CHANGE } from './tool.js'
import { savesOf } from './frame.js'
import { playtest } from './test.js'

await Promise.all([useStrings('games'), styleSheet(new URL('games.css', import.meta.url))])

/** A gamepad. */
const GLYPH = icon(svg`<path d="M7.5 7h9a4.5 4.5 0 0 1 4.4 5.4l-1 4.4a2.3 2.3 0 0 1-4 1L14 16h-4l-1.9 1.8a2.3 2.3 0 0 1-4-1l-1-4.4A4.5 4.5 0 0 1 7.5 7zM8 10v4M6 12h4M15.5 10.5v.01M17.5 13v.01"/>`)

/** @typedef {import('./frame.js').Kept & { dir: string }} One */

/** Its skill in the room, as reading it would bring it (D401). */
const skill = async () => { if (await unlock('skills')) await (await import('../skills/skills.js')).bring(['game']).catch(console.warn) }

/** A game of a project; null when there is none. @param {string} path @param {string} [dir] @returns {Promise<One | null>} */
async function load(path, dir = app.projectDir) {
  const game = PLACE.test(path) && gameOf((await app.fs.read(`${dir}/${path}`)) ?? '')
  return game ? { ...game, dir, path } : null
}
/** In the language of its words, the user's own where they are theirs. @param {One} one */
const write = (one) => app.fs.write(`${one.dir}/${one.path}`, fileOf(one, ((base) => (locale.peek().split('-')[0] === base ? locale.peek() : base))(languageOf(`${one.name}\n${one.card}`, locale.peek()))))
/** A game changed as it is now, written. @param {string} path @param {(one: One) => One} change */
const update = async (path, change) => { const one = await load(path); if (one) await write(change({ ...one, meta: { ...one.meta, changed: new Date().toISOString() } })) }

/** The project's games, the latest made first. @param {string} [dir] @returns {Promise<import('../../ui/creations.js').Creation[]>} */
async function kept(dir = app.projectDir) {
  const files = (await app.fs.list(`${dir}/games`)).flatMap(({ kind, name }) => (kind === 'file' && name.endsWith('.game.html') ? [`games/${name}`] : [])).sort().reverse()
  return (await Promise.all(files.map((path) => load(path, dir).catch(() => null)))).flatMap((one) => (one ? [{ path: one.path, name: one.name, changed: one.meta.changed, created: one.meta.created, pinned: one.meta.pinned === 'true', text: one.card,
    link: /** @type {import('../../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: one.path, name: `${one.name}.game.html`, title: one.name, mimeType: 'text/html' }) }] : []))
}

/** What an address names: a game by its name. @param {string} path */
export const metaOf = async (path) => ((one) => one && { name: one.name, title: one.name, mimeType: 'text/html' })(await load(path).catch(() => null))
/** Its view in its pane: the game, to play. @param {{ uri: string }} file */
export const editor = async ({ uri }) => ((one) => one && html`<app-game class="beside" .game=${one}></app-game>`)(await load(uri))
/** Open beside the task. @param {One} one */
const open = (one) => import('../../ui/preview.js').then(({ preview }) => preview({ uri: one.path, name: `${one.name}.game.html`, title: one.name, mimeType: 'text/html' }))

/** What a call makes of a game: played, and said. @param {One} one @param {import('../../core/loop.js').ToolContext} ctx @param {string} done */
async function played(one, ctx, done) {
  await write(one)
  ctx.meta.files = [{ uri: one.path, name: `${one.name}.game.html`, mimeType: 'text/html', size: one.code.length }]
  if (conversationOf(ctx.signal)?.path === app.current.peek()?.path) await open(one)
  reread()
  return `${done} ${one.name}, at ${one.path}. Its play-test:\n${(await playtest(one, ctx)).text}`
}

/** @type {import('../../core/loop.js').Tool} */
const gameTool = {
  spec: GAME,
  kind: 'edit',
  title: (args) => `Game ${args?.name ?? ''}`,
  run: async (args, ctx) => {
    const name = String(args?.name ?? '').trim(), code = String(args?.code ?? ''), now = new Date().toISOString(), before = args?.game ? await load(String(args.game)) : null
    if (!name || !code.trim()) throw new Error('Give the game its name and its whole code.')
    const facts = { name, card: String(args?.card ?? ''), code, meta: { engine: ENGINES.includes(args?.engine) ? args.engine : 'none', actions: actionsOf(args?.actions).join(' '), changed: now } }
    return played(before ? { ...before, ...facts, meta: { ...before.meta, ...facts.meta } } : { dir: app.projectDir, path: `games/${ulid()}-${slug(name) || 'game'}.game.html`, ...facts,
      meta: { ...facts.meta, author: 'jean', created: now, source: conversationOf(ctx.signal)?.path ?? '' } }, ctx, before ? 'Replaced' : 'Made')
  },
}

/** @type {import('../../core/loop.js').Tool} */
const changeTool = {
  spec: CHANGE,
  kind: 'edit',
  title: (args) => `Change the game ${args?.game ?? ''}`,
  run: async (args, ctx) => {
    const one = await load(String(args?.game ?? ''))
    if (!one) throw new Error(`There is no game at ${args?.game}.`)
    const changed = replaceOnce(one.code, (Array.isArray(args?.changes) ? args.changes : []).map((/** @type {any} */ change) => ({ old: String(change?.old ?? ''), new: String(change?.new ?? '') })))
    if ('error' in changed) throw new Error(changed.error)
    return played({ ...one, code: changed.code, card: args?.card ? String(args.card) : one.card, meta: { ...one.meta, changed: new Date().toISOString() } }, ctx, 'Changed')
  },
}

/** The note a message comes with while a game is open beside the task, as it is now, once. @param {import('../../core/types.js').Envelope[]} records */
function notes(records) {
  const one = /** @type {any} */ (document.querySelector('app-preview app-game'))?.game
  if (!one) return []
  const text = `The game ${one.name} (${one.path}) is open beside the conversation. Change it with game_change. Its code now:\n\n\`\`\`js\n${one.code}\n\`\`\``
  const last = records.findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'game')
  return last?.update?.sessionUpdate === '_system_note' && last.update.text === text ? [] : [noteRecord(text, { kind: 'game', uri: one.path })]
}

const games = { id: 'games', at: 2.7, draw: () => GLYPH, kept, preview: (/** @type {{ text: string }} */ item) => prose(item.text), like: skill,
  pin: (/** @type {{ path: string }} */ { path }, /** @type {boolean} */ pinned) => update(path, (one) => ({ ...one, meta: { ...one.meta, pinned: pinned ? 'true' : '' } })),
  rename: (/** @type {{ path: string }} */ { path }, /** @type {string} */ name) => update(path, (one) => ({ ...one, name })),
  copy: async (/** @type {{ path: string }} */ { path }, /** @type {string} */ name) => {
    const one = await load(path), now = new Date().toISOString(), to = `games/${ulid()}-${slug(name) || 'game'}.game.html`
    if (!one) throw new Error(`There is no game ${path}.`)
    await write({ ...one, path: to, name, meta: { ...one.meta, author: 'user', created: now, changed: now, pinned: '', source: '' } })
    return to
  },
  remove: (/** @type {{ path: string }} */ { path }) => Promise.all([path, savesOf(path)].map((one) => app.fs.remove(`${app.projectDir}/${one}`))),
  make: async () => { await skill(); await ask('games.ask', 'games.example') } }

// Among the creations once the project holds a game; until then only its card to start one (D553).
const joined = signal(/** @type {Record<string, unknown>} */ ({ starts: games }))
let here = ''
effect(() => {
  const dir = (void app.conversations.value, app.projectDir)
  if (dir !== here) (here = dir, (joined.value = { starts: games }))
  if (!joined.peek().creations) kept().then((list) => { if (here === dir && list.length) joined.value = { creations: games, main: page } }, console.warn)
})
effect(() => register({ id: 'games', tools: [gameTool, changeTool], lines: LINES, slots: { ...joined.value, modes: { at: 13, draw: () => null, notes } } }))
