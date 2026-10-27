// Slides among the creations (D558, D591): the project's decks, each a file of its own, `decks/<ulid>-<slug>.deck.html`, named
// once and never renamed: a web page any browser opens and presents, its Markdown whole inside it (deck's format), which is all
// Jean reads (readDeckFile), never running the page; its name its title, and its author, when it was made and changed, whether
// it is pinned and the task it came from in its head. A deck an answer writes is kept once the answer ends (keep(), Skills'
// turn.end): a new file with the kit it was drawn with (caps/slides/kit.js), the pictures of the task it names by their names at
// their places in the project (D599), open beside the task when that is on screen; or,
// when it goes by the name of the deck on show as the user asked, or of one the task made, or shares a slide with it, Jean's
// version of that one, waiting in `decks/.suggested/<file>.md` to be accepted or rejected slide by slide (D505), as a design's
// changes wait (D572). On its card, its first slide; picked, it opens beside the task, to page, present, change and save
// (caps/slides/); downloaded, the file with its pictures inside (D591). Skills gives them, as it gives the scores (./scores.js).
import { html, nothing } from 'lit-html'
import { app, notify } from '../../ui/state.js'
import { declared } from '../../ui/markdown.js'
import { unlock } from '../../ui/caps.js'
import { skillFor } from '../../ui/composer.js'
import { icons } from '../../ui/menu-icons.js'
import { ask, reread } from '../../ui/creations.js'
import { languageOf } from '../../ui/language.js'
import { ulid } from '../../core/ulid.js'
import { slug, serviceURL } from '../../core/settings.js'
import { t, locale, dir as dirOf } from '../../core/i18n.js'

const PLACE = /^decks\/[^/]+\.deck\.html$/
/** What Jean keeps of a deck in its page's head, beside its title: with its task, the print of the project's look it was given (D601). */
const KEYS = ['author', 'created', 'changed', 'pinned', 'source', 'look']
/** @typedef {{ author: string, created: string, changed: string, pinned?: string, source?: string, look?: string }} Meta */
/** @typedef {{ dir: string, path: string, name: string, source: string, theirs: string | null, meta: Meta }} One */

/** Where Jean's version of a deck waits for the user (D505). @param {string} path */
const waiting = (path) => path.replace(/^decks\//, 'decks/.suggested/').replace(/\.deck\.html$/, '.md')
/** @param {string} text */
const escaped = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The address a deck file links its renderer at (D591), as Settings or policy name it. @param {string} version */
const renderer = (version) => ({ src: serviceURL('deck', app.settings.peek(), app.policy).replace('{version}', version) })

/** A deck's file: deck's page around its Markdown, Jean's few facts in its head when it is kept here. @param {string} markdown @param {string} name @param {Meta | null} meta */
async function fileOf(markdown, name, meta) {
  const { writeDeckFile, parseDeck, VERSION } = await import('@codename/deck')
  const lang = String(parseDeck(markdown).settings.lang ?? languageOf(markdown, locale.peek()))
  const page = writeDeckFile(markdown, { title: name, lang, dir: dirOf(lang), renderer: renderer(VERSION) })
  return meta ? page.replace('<title>', `${KEYS.flatMap((key) => (meta[/** @type {keyof Meta} */ (key)] ? [`<meta name="${key}" content="${escaped(String(meta[/** @type {keyof Meta} */ (key)]))}">\n`] : [])).join('')}<title>`) : page
}

/** A deck of a project, its Markdown read from its page alone, and Jean's version of it waiting; null when there is none. @param {string} path @param {string} [dir] @returns {Promise<One | null>} */
export async function load(path, dir = app.projectDir) {
  const page = PLACE.test(path) && await app.fs.read(`${dir}/${path}`)
  if (!page) return null
  const head = page.slice(0, page.indexOf('<script')), source = (await import('@codename/deck')).readDeckFile(page)
  if (source === null) return null
  const meta = /** @type {Meta} */ (Object.fromEntries([...head.matchAll(/<meta name="(\w+)" content="([^"]*)">/g)].filter(([, key]) => KEYS.includes(key))
    .map(([, key, value]) => [key, value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&')])))
  const name = (/<title>([^<]*)<\/title>/.exec(head)?.[1] ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  return { dir, path, name, source, theirs: (await app.fs.read(`${dir}/${waiting(path)}`)) ?? null, meta }
}

/** The writes, one after the other, so that none is lost under another. */
let writing = /** @type {Promise<unknown>} */ (Promise.resolve())
/** A deck written, with Jean's version beside it while there is one. @param {One} one */
const write = (one) => (writing = writing.catch(() => {}).then(async () => Promise.all([app.fs.write(`${one.dir}/${one.path}`, await fileOf(one.source, one.name, one.meta)),
  one.theirs ? app.fs.write(`${one.dir}/${waiting(one.path)}`, one.theirs) : app.fs.remove(`${one.dir}/${waiting(one.path)}`)])))

/** A deck changed as it is now, written. @param {string} path @param {(one: One) => One} change @param {string} [dir] */
async function update(path, change, dir) {
  const one = await load(path, dir)
  if (one) await write(change({ ...one, meta: { ...one.meta, changed: new Date().toISOString() } }))
  return one
}

/** Open beside the task, when it is on screen. @param {One} one */
const open = (one) => import('../../ui/preview.js').then(({ preview }) => preview({ uri: one.path, name: one.name, title: one.name, mimeType: 'text/html' }))

/**
 * The project's decks, the latest made first, with their words, how to open them, and their Markdown for a card.
 * @param {string} [dir] @returns {Promise<import('../../ui/creations.js').Creation[]>}
 */
export async function kept(dir = app.projectDir) {
  const files = (await app.fs.list(`${dir}/decks`)).flatMap(({ kind, name }) => (kind === 'file' && name.endsWith('.deck.html') ? [`decks/${name}`] : [])).sort().reverse()
  const all = await Promise.all(files.map((path) => load(path, dir).catch(() => null)))
  return all.flatMap((one) => (one ? [{ path: one.path, name: one.name, changed: one.meta.changed, created: one.meta.created, pinned: one.meta.pinned === 'true', text: one.source, source: one.source,
    link: /** @type {import('../../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: one.path, name: `${one.name}.deck.html`, title: one.name, mimeType: 'text/html' }) }] : []))
}

/** What an address names: a deck by its name. @param {string} path */
export const metaOf = async (path) => ((one) => one && { name: one.name, title: one.name, mimeType: 'text/html' })(await load(path).catch(() => null))

/**
 * A deck's file as it goes out (D591): its pictures inside it, each read at its place from the deck's folder, those on the web
 * left as links, and none of Jean's facts. @param {string} path @param {string} [source] the deck as on show
 */
export async function bytesOf(path, source) {
  const one = await load(path)
  if (!one) return null
  const [{ inlinePictures }, { placeIn }] = await Promise.all([import('@codename/deck'), import('../slides/edit.js')])
  const read = async (/** @type {string} */ place) => ((bytes) => bytes && { type: ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' })[/\.(\w+)$/.exec(place)?.[1].toLowerCase() ?? ''] ?? '', bytes })(await app.fs.readBytes(`${one.dir}/${placeIn(place)}`))
  return new TextEncoder().encode(await fileOf((await inlinePictures(source ?? one.source, read)).source, one.name, null))
}

/** A deck's view, for its pane (ui/preview.js): Slides', to page, present, change and save. @param {{ uri: string }} file */
export async function editor({ uri }) {
  const one = await offered(await load(uri))
  if (!one || !(await unlock('slides'))) return null
  // The pane gives it again each time it draws (in another language too), so it follows what is kept, never as it first opened.
  const file = /** @type {import('../slides/slides.js').Kept} */ ({ path: uri, name: one.name, source: one.source, theirs: one.theirs, keep: (mine, theirs) => (Object.assign(file, { source: mine, theirs }), update(uri, (now) => ({ ...now, source: mine, theirs }), one.dir)) })
  return html`<app-slides class="beside" .file=${file}></app-slides>`
}

/**
 * A deck whose project's look changed since it was given one (D601), with nothing of Jean's waiting: the deck in the new kit is
 * Jean's version, for the user to accept or reject as any (D505); the look it was offered kept, so that it is offered once.
 * @param {One | null} one
 */
async function offered(one) {
  if (!one || one.theirs) return one
  const [{ kitHere, copyOf, lookPrint }, { withKit }] = await Promise.all([import('../slides/kit.js'), import('../slides/edit.js')])
  const look = await lookPrint(one.dir)
  if (one.meta.look === look) return one
  const theirs = withKit(one.source, copyOf(await kitHere(one.dir)), true), next = { ...one, theirs: theirs === one.source ? null : theirs, meta: { ...one.meta, look } }
  await write(next)
  return next
}

/**
 * A deck an answer wrote, kept once it ends (Skills' turn.end): Jean's version of the deck on show as the user asked, or of one
 * the task made, that goes by its name or shares a slide with it; else a new deck, opened beside the task when that is on screen.
 * @param {{ task: string, answer: string, records: import('../../core/types.js').Envelope[], routine?: unknown }} turn
 */
export async function keep({ task, answer, records }) {
  if (!/^ {0,3}(`{3,}|~{3,})/m.test(answer) || !declared.peek().has('deck')) return
  const [{ deckIn, parseDeck }, { piecesOf, changesOf, withKit, withPictures, namedIn }, { kitHere, copyOf, lookPrint }, { linkedFiles, filesMade, callsIn }] = await Promise.all([import('@codename/deck'), import('../slides/edit.js'), import('../slides/kit.js'), import('../../core/events.js')])
  // A picture of the task, which the brain names by its name, kept at its place from the deck's folder (D599).
  const pictures = [...linkedFiles(records), ...filesMade(callsIn(records))].filter((one) => /^image\//.test(one.mimeType ?? '')), source = ((found) => found && withPictures(found.source, (place) => ((one) => one && `../${one.uri}`)(namedIn(pictures, place))))(deckIn(answer))
  if (!source) return
  const dir = task.slice(0, task.indexOf('/conversations/')), deck = parseDeck(source)
  const name = String(deck.settings.title ?? deck.slides[0]?.title ?? app.conversations.peek().find((one) => one.path === task)?.title ?? t('conversation.untitled')).replace(/[*_`#]/g, '').trim()
  // The deck on show as the user asked (its note just before the request), then the task's own, the latest first.
  const asked = records.findLastIndex(({ update }) => update?.sessionUpdate === 'user_message_chunk')
  const answered = records.slice(0, asked).findLastIndex(({ update }) => update?.sessionUpdate === 'agent_message_chunk')
  const note = records.slice(answered + 1, asked).findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'deck')?.update
  const noted = note?.sessionUpdate === '_system_note' && note.data?.kind === 'deck' ? note.data.uri : ''
  const pieces = piecesOf(source).map((piece) => piece.trim())
  for (const path of [...(noted ? [noted] : []), ...(await kept(dir)).map((item) => item.path).filter((path) => path !== noted)]) {
    const one = await load(path, dir)
    if (!one || (path !== noted && one.meta.source !== task) || (one.name !== name && !piecesOf(one.source).some((piece) => pieces.includes(piece.trim())))) continue
    const own = parseDeck(one.source).settings.kit, theirs = own ? withKit(source, own) : source
    if (!changesOf(one.source, theirs).length) return
    await write({ ...one, theirs, meta: { ...one.meta, changed: new Date().toISOString() } })
    if (app.current.peek()?.path === task) await open(one)
    return void reread()
  }
  const now = new Date().toISOString()
  const one = { dir, path: `decks/${ulid()}-${slug(name) || 'deck'}.deck.html`, name, theirs: null, source: withKit(source, copyOf(await kitHere(dir))), meta: { author: 'jean', created: now, changed: now, source: task, look: await lookPrint(dir) } }
  await write(one)
  if (app.current.peek()?.path === task) await open(one)
  reread()
}

/** Under a deck in an answer, beside Copy: the deck it is kept as, open beside the task. @param {{ text: string }} item */
const opener = ({ text }) => (/^```deck\n/.test(text) ? html`<button class="icon-button subtle" aria-label=${t('skills.openDeck')} @click=${async () => {
  const { parseDeck } = await import('@codename/deck'), title = parseDeck(text.slice(8, -4)).settings.title, task = app.current.peek()?.path
  const all = await Promise.all((await kept()).map((item) => load(item.path)))
  const one = all.find((each) => each?.meta.source === task && (!title || each?.name === title)) ?? all.find((each) => each?.meta.source === task)
  if (one) open(one); else notify(t('skills.deckNotKept'))
}}>${icons.slides}</button>` : nothing)

/** Pinned or renamed from the Creations page (D544). @param {{ path: string }} item @param {{ pinned?: boolean, name?: string }} edit */
const amend = async ({ path }, { pinned, name }) => {
  const { withTitle } = await import('../slides/edit.js')
  await update(path, (one) => ({ ...one, ...(name && { name, source: withTitle(one.source, name) }), meta: { ...one.meta, ...(pinned !== undefined && { pinned: pinned ? 'true' : '' }) } }))
}

/** A copy, the user's, by the name given. @param {{ path: string }} item @param {string} name */
async function copy({ path }, name) {
  const one = await load(path), now = new Date().toISOString(), to = `decks/${ulid()}-${slug(name) || 'deck'}.deck.html`
  if (!one) throw new Error(`There is no deck ${path}.`)
  const { withTitle } = await import('../slides/edit.js')
  await write({ ...one, path: to, name, source: withTitle(one.source, name), theirs: null, meta: { author: 'user', created: now, changed: now } })
  return to
}

/** A deck, as Slides draws it once loaded: on its card, its first slide. @param {{ source: string }} item */
const card = ({ source }) => (unlock('slides'), html`<app-slides source=${source}></app-slides>`)

export const decks = { id: 'slides', at: 2.5, draw: () => icons.slides, kept, preview: card, like: () => skillFor('slides'), copy,
  pin: (/** @type {{ path: string }} */ item, /** @type {boolean} */ pinned) => amend(item, { pinned }), rename: (/** @type {{ path: string }} */ item, /** @type {string} */ name) => amend(item, { name }),
  remove: (/** @type {{ path: string }} */ { path }) => Promise.all([path, waiting(path)].map((one) => app.fs.remove(`${app.projectDir}/${one}`))),
  make: async () => { await skillFor('slides'); await ask('skills.askDeck', 'skills.deckExample') } }
export { opener }
