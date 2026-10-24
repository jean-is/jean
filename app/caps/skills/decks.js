// Slides among the creations (D558): the decks a project's answers hold, as Slides writes them (```marp, D200), the newest of
// each name in a task alone, as a brain writes a deck whole again for each change; named by the title in its front matter, else
// its first heading, else its task's title. On its card, its first slide, drawn by the capability that draws decks, loaded on
// sight (its <app-slides> upgrading then); picked, it opens beside the task, to page through and present; downloaded, its
// Markdown, which Marp reads. A new one is asked for in the box, Jean's own Slides brought into the room first; one is pinned,
// renamed or taken off the page by a record in its task, its answer keeping it (ui/held.js). Skills gives them, as it gives the
// scores (./scores.js).
import { html } from 'lit-html'
import { unlock } from '../../ui/caps.js'
import { skillFor } from '../../ui/composer.js'
import { icons } from '../../ui/menu-icons.js'
import { ask } from '../../ui/creations.js'
import { held } from '../../ui/held.js'

/** The decks of a project's answers (ui/held.js): a deck is named by the title in its front matter, else its first heading, as text; its marks are `meta.deck` records. */
const { kept, find, metaOf, bytesOf, pin, rename, hide } = held({ fence: 'marp', record: 'deck', at: 'deck-', latest: true, extension: 'md', mimeType: 'text/markdown',
  named: (source) => ((/^---[ \t]*\n(?:(?!---).*\n)*?title:[^\S\n]*(.+)/.exec(source) ?? /^#{1,6}[^\S\n]+(.+)$/m.exec(source))?.[1] ?? '').replace(/^(['"])(.*)\1$/, '$2').replace(/[*_`]/g, '').trim() })
export { metaOf, bytesOf }

/** A deck, as Slides draws it once loaded: on its card, or beside the task. @param {string} source @param {string} [where] */
const deck = (source, where = '') => (unlock('slides'), html`<app-slides class=${where} source=${source}></app-slides>`)
/** Its view in the preview: the deck, to page through and present. @param {{ uri: string }} file */
export const editor = async ({ uri }) => ((one) => one && deck(one.source, 'beside'))(await find(uri)) ?? null

export const decks = { id: 'slides', at: 2.5, draw: () => icons.slides, kept, pin, rename, hide, like: () => skillFor('slides'), preview: (/** @type {{ source: string }} */ { source }) => deck(source),
  open: (/** @type {{ path: string, link: { name: string } }} */ { path, link }) => import('../../ui/preview.js').then(({ preview }) => preview({ uri: path, name: link.name, mimeType: 'text/markdown' })),
  make: async () => { await skillFor('slides'); await ask('skills.askDeck', 'skills.deckExample') } }
