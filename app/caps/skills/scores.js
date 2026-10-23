// Scores among the creations (D542): the tunes a project's answers hold, as Music score writes them (```abc, D196), each task
// read again once it has changed, named by its title or its task's; on its card, the score drawn by the capability that draws
// it, loaded on sight. Picked, one opens beside the task, its player on top, playing at once (D544). A new one is asked for in the box, Jean's own
// Music score brought into the room first; one is pinned, renamed or taken off the page by a record in its task (D544). Skills
// gives them, as the kinds of block answers draw are its skills' (D196).
import { html } from 'lit-html'
import { unlock } from '../../ui/caps.js'
import { drawn } from '../../ui/markdown.js'
import { skillFor } from '../../ui/composer.js'
import { ask } from '../../ui/creations.js'
import { held } from '../../ui/held.js'
import { DIRECTORY } from './directory.js'

const GLYPH = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d=${DIRECTORY.find((entry) => entry.name === 'music-score')?.icon ?? ''}></path></svg>`
/** The tunes of a project's answers (ui/held.js): a tune is named by its `T:`, its notes no words; its marks are `meta.tune` records. */
const { kept, find, metaOf, bytesOf, pin, rename, hide } = held({ fence: 'abc', record: 'tune', named: (source) => /^T:[^\S\n]*(.+)$/m.exec(source)?.[1].trim() ?? '', extension: 'abc', mimeType: 'text/vnd.abc' })
export { metaOf, bytesOf }

/** Their kind of creation, which @ leaves out: picked, one opens beside the task, playing; on its card, drawn; a new one asked for in the box, with Music score; marked in its task (D544). */
/** The tune a click asked to hear, which plays once drawn beside the task (D544). */
let asked = ''
/** Its view in the preview: Scores' <app-score>, its player on top, playing at once when a click opened it. @param {{ uri: string }} file */
export async function editor({ uri }) {
  const one = await find(uri), score = Object.assign(document.createElement('app-score'), { className: 'beside' })
  if (!one) return null
  await unlock('scores')
  if (asked === uri) score.setAttribute('autoplay', '')
  asked = ''
  score.setAttribute('source', one.source)
  return score
}

export const scores = { id: 'music', at: 5, draw: () => GLYPH, kept,
  // Its sound started on the click itself, which a browser asks of what plays.
  open: (/** @type {{ path: string, link: { name: string } }} */ { path, link }) => { /** @type {any} */ (customElements.get('app-score'))?.wake(); asked = path; import('../../ui/preview.js').then(({ preview }) => preview({ uri: path, name: link.name, mimeType: 'text/vnd.abc' })) },
  pin, rename, hide, like: () => skillFor('music'),
  preview: (/** @type {{ source: string }} */ { source }) => (unlock('scores'), drawn.value.abc?.(source, false) ?? GLYPH),
  make: { label: 'skills.newScore', run: async () => { await skillFor('music'); await ask('skills.askScore', 'skills.scoreExample') } } }
