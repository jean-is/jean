// A document or a deck worked on together (D733): its changes are its words as they are saved, a document's Markdown, the file itself,
// or a deck's, inside its page (caps/skills/decks.js), each merged three ways from the last version both had (ui/merge.js), so that
// each person's words since stay, both sides of a clash kept. An open document takes the file in by the path Sync's changes come
// (caps/documents, take()), the caret where it was; an open deck is given its new words. A version a few hundred milliseconds apart,
// as the editor saves while someone types.
import { app } from '../../ui/state.js'
import { merge3 } from '../../ui/merge.js'

/** Where a document is: its project's folder and its file there. @typedef {{ dir: string, folder: string }} Place */
/** What the journal holds of it: its text as the journal last had it. @typedef {{ lines: Set<string>, table: string }} Held */

const DECK = /\.deck\.html$/
const decks = () => import('../skills/decks.js')
/** @param {Place} place */
const pathOf = ({ dir, folder }) => `${dir}/${folder}`
/** @param {Place} place */
const deckOf = async (place) => (await decks()).load(place.folder, place.dir)
/** Its words: a deck's Markdown from its page, else the file. @param {Place} place */
const read = async (place) => (DECK.test(place.folder) ? (await deckOf(place))?.source : await app.fs.read(pathOf(place))) ?? ''

/** Its words written; a deck's over its page, made where there is none, and given to its pane where it is open. @param {Place} place @param {string} text @param {string} title */
async function write(place, text, title) {
  if (!DECK.test(place.folder)) return app.fs.write(pathOf(place), text)
  await (await decks()).rewrite(place.folder, text, title, place.dir)
  const pane = /** @type {any} */ ([...document.querySelectorAll('app-slides')].find((one) => /** @type {any} */ (one).file?.path === place.folder))
  if (pane?.file) { pane.file.source = text; pane.draw() }
}

/** A document's name, its file's; a deck's, its title. @param {Place} place */
export const titleOf = async (place) => (DECK.test(place.folder) ? (await deckOf(place))?.name : place.folder.split('/').at(-1)?.replace(/\.md$/, '')) ?? ''

/** All of it, for a seed: its place in a project, its name and its words. @param {Place} place */
export const seedOf = async (place) => ({ doc: place.folder, title: await titleOf(place), markdown: await read(place) })

/** What a seed holds, taken as the journal's. @param {Held} held @param {{ markdown: string }} content */
export const hold = (held, { markdown }) => { held.table = markdown }

/**
 * A version that came, merged into the one here from the last both had, and written where it differs; a newcomer's first seed makes
 * the document. @param {Place} place @param {{ markdown?: string, title?: string }} body @param {Held} held
 */
export async function take(place, body, held) {
  if (typeof body.markdown !== 'string') return
  const here = await read(place)
  const merged = here ? merge3(held.table || here, here, body.markdown) ?? body.markdown : body.markdown
  held.table = body.markdown
  if (merged !== here) await write(place, merged, body.title ?? '')
}

/** What the person writes here goes, each version the editor saves that the journal doesn't hold. @param {Place} place @param {Held} held @param {(body: { markdown: string }) => Promise<unknown>} post */
export function watch(place, held, post) {
  const path = pathOf(place)
  let running = Promise.resolve()
  const look = () => (running = running.then(async () => {
    const now = await read(place)
    if (now === held.table) return
    held.table = now
    await post({ markdown: now })
  }).catch((error) => console.warn('Together', error)))
  look()
  return app.fs.watch?.((changed) => { if (changed === path) look() }, { all: true }) ?? (() => {})
}
