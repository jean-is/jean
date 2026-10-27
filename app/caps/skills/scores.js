// Scores among the creations (D542): the tunes a project's answers hold, as Music score writes them (```abc, D196), each task
// read again once it has changed, named by its title or its task's; on its card, the top of a white sheet with its titles,
// Scores left unloaded. Picked, one opens beside the task, its player under it, staying at the pane's foot as it scrolls, waiting for Play (D544). A new one is asked for in the box, Jean's own
// Music score brought into the room first; one is pinned, renamed or taken off the page by a record in its task (D544). Skills
// gives them, as the kinds of block answers draw are its skills' (D196).
import { html } from 'lit-html'
import { unlock } from '../../ui/caps.js'
import { skillFor } from '../../ui/composer.js'
import { ask } from '../../ui/creations.js'
import { held } from '../../ui/held.js'
import { DIRECTORY } from './directory.js'

const GLYPH = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d=${DIRECTORY.find((entry) => entry.name === 'music-score')?.icon ?? ''}></path></svg>`
/** The tunes of a project's answers (ui/held.js): a tune is named by its `T:`, its notes no words; its marks are `meta.tune` records. */
const { kept, find, metaOf, bytesOf, pin, rename, hide } = held({ fence: 'abc', record: 'tune', named: (source) => /^T:[^\S\n]*(.+)$/m.exec(source)?.[1].trim() ?? '', extension: 'abc', mimeType: 'text/vnd.abc' })
export { metaOf, bytesOf }
/** A tune's titles, its `T:` lines, the first tune's alone where a block holds several. @param {string} source @returns {string[]} */
const titles = (source) => [...source.split(/\n(?=X:)/)[0].matchAll(/^T:[^\S\n]*(\S.*)$/gm)].map(([, title]) => title.trim())

/** Their kind of creation, which @ leaves out: picked, one opens beside the task; on its card, its titles; a new one asked for in the box, with Music score; marked in its task (D544). */
/** Its view in its pane: Scores' <app-score>, its player under it. @param {{ uri: string }} file */
export async function editor({ uri }) {
  const one = await find(uri), score = Object.assign(document.createElement('app-score'), { className: 'beside' })
  if (!one) return null
  await unlock('scores')
  score.setAttribute('source', one.source)
  return score
}

export const scores = { id: 'music', at: 5, draw: () => GLYPH, kept,
  open: (/** @type {{ path: string, name: string, link: { name: string } }} */ { path, name, link }) => { import('../../ui/preview.js').then(({ preview }) => preview({ uri: path, name: link.name, title: name, mimeType: 'text/vnd.abc' })) },
  pin, rename, hide, like: () => skillFor('music'),
  // On its card, the top of its sheet: its title, else its name, and the lines under it.
  preview: (/** @type {{ source: string, name: string }} */ { source, name }) => ((/** @type {string[]} */ [title = name, ...more]) => html`<div class="score-page">
    <b dir="auto">${title}</b>${more.map((line) => html`<span dir="auto">${line}</span>`)}</div>`)(titles(source)),
  make: async () => { await skillFor('music'); await ask('skills.askScore', 'skills.scoreExample') } }
