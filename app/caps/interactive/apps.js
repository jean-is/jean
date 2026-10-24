// Apps among the creations (D553): the pages a project's answers hold (```html, D289), each a small app Jean made, the newest
// of each name in a task alone, as a brain writes one whole again for each change; named by its <title>, else its first heading,
// else its task's title. On its card, the app itself at half size, still; picked, it opens beside the task and works there as in
// its answer; downloaded, it is its page. A new one is asked for in the box; one is pinned, renamed or taken off the page by a
// record in its task, its answer keeping it (ui/held.js). The room loads the pages' capability through this module, which a
// saved copy never loads: it holds no project.
import { html, svg } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app } from '../../ui/state.js'
import { register } from '../../ui/caps.js'
import { icon } from '../../ui/menu-icons.js'
import { ask, page } from '../../ui/creations.js'
import { held } from '../../ui/held.js'
import { capability } from './interactive.js'

/** Four tiles, the last turned on its corner: what is made to be used. */
const GLYPH = icon(svg`<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/><g transform="rotate(45 16.75 7.25)"><rect x="14" y="4.5" width="5.5" height="5.5" rx="1.5"/></g>`, 'flip-rtl')
/** What a page calls itself, as text: its title, else its first heading. @param {string} source */
const named = (source) => ((/<title[^>]*>([^<]*)</i.exec(source) ?? /<h[12][^>]*>([\s\S]*?)<\/h[12]>/i.exec(source))?.[1] ?? '')
  .replace(/<[^>]*>/g, '').replaceAll('&amp;', '&').replace(/\s+/g, ' ').trim()

const { kept, find, metaOf, bytesOf, pin, rename, hide } = held({ fence: 'html', record: 'app', at: 'app-', latest: true, named, extension: 'html', mimeType: 'text/html' })
export { metaOf, bytesOf }

/** Its view in the preview: the page itself, which works beside the task as in its answer. @param {{ uri: string }} file */
export const editor = async ({ uri }) => ((one) => (one ? html`<app-page class="beside" source=${one.source}></app-page>` : null))(await find(uri))

export const apps = { id: 'apps', at: 6, draw: () => GLYPH, kept,
  open: (/** @type {{ path: string, link: { name: string } }} */ { path, link }) => import('../../ui/preview.js').then(({ preview }) => preview({ uri: path, name: link.name, mimeType: 'text/html' })),
  pin, rename, hide, like: async () => {},
  preview: (/** @type {{ source: string }} */ { source }) => html`<app-page source=${source}></app-page>`,
  make: () => ask('interactive.askApp', 'interactive.appExample') }

/** Its slots, Creations' page among them, once the project holds an app; none until then, so nothing of them shows before (D553). */
const joined = signal(/** @type {Record<string, unknown>} */ ({}))
let here = ''
effect(() => {
  const dir = (void app.conversations.value, app.projectDir)
  if (dir !== here) (here = dir, (joined.value = {}))
  if (!joined.peek().creations) kept().then((list) => { if (here === dir && list.length) joined.value = { creations: apps, main: page } }, console.warn)
})
effect(() => register({ ...capability, slots: { ...capability.slots, ...joined.value } }))
