// SPDX-License-Identifier: MIT
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
import { icon, icons } from '../../ui/menu-icons.js'
import { t } from '../../core/i18n.js'
import { ask, page } from '../../ui/creations.js'
import { held } from '../../ui/held.js'
import { capability, named, page as drawn } from './interactive.js'
import { frozen } from './parts.js'

/** Four tiles, the last turned on its corner: what is made to be used. */
const GLYPH = icon(svg`<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/><g transform="rotate(45 16.75 7.25)"><rect x="14" y="4.5" width="5.5" height="5.5" rx="1.5"/></g>`, 'flip-rtl')

const { kept, find, metaOf, pin, rename, hide } = held({ fence: 'html', record: 'app', at: 'app-', latest: true, named, extension: 'html', mimeType: 'text/html' })
/** An app's page as the pane's Download gives it, what it shows of the project's collections written in (D633). @param {string} uri */
const bytesOf = async (uri) => ((source) => import('./view-parts.js').then(async (parts) => new TextEncoder().encode(frozen(source, await parts.snapshot(source)))))((await find(uri))?.source ?? '')
export { metaOf, bytesOf }

/** Its view in its pane: the page itself, which works beside the task as in its answer. @param {{ uri: string }} file */
export const editor = async ({ uri }) => ((one) => (one ? shown(one, 'beside') : null))(await find(uri))
/** An app as its answer draws it, in the answer's styles, in its task. @param {{ source: string, link: { uri: string } }} one @param {string} [kind] its class */
const shown = ({ source, link }, kind) => html`<div class="prose">${drawn(source, false, kind, link.uri)}</div>`

export const apps = { id: 'apps', at: 6, draw: () => GLYPH, kept,
  open: (/** @type {{ path: string, name: string, link: { name: string } }} */ { path, name, link }) => import('../../ui/preview.js').then(({ preview }) => preview({ uri: path, name: link.name, title: name, mimeType: 'text/html' }, true)),
  pin, rename, hide, like: async () => {},
  preview: (/** @type {{ source: string, link: { uri: string } }} */ one) => shown(one),
  make: () => ask('interactive.askApp', 'interactive.appExample') }

/**
 * What an app can do (ui/out.js): a link holds its page as an answer's does, the system's sheet and Download its page on its own, and paper what it shows now.
 * @param {{ uri: string, name: string, title: string }} file @param {Element} pane @returns {import('../../ui/out.js').Ways}
 */
const ways = (file, pane) => ({ share: async () => ({ text: `\`\`\`html\n${(await find(file.uri))?.source ?? ''}\n\`\`\`` }), page: () => bytesOf(file.uri),
  send: { file: file.name, type: 'text/html', make: async () => ({ title: file.title, files: [new File([await bytesOf(file.uri)], file.name, { type: 'text/html' })] }) },
  files: [{ id: '', glyph: icons.download, label: t('out.webPage'), run: async () => (await import('../../ui/preview.js')).download(file) }],
  print: { id: 'print', run: async () => (await import('../made/paper.js')).printPage(/** @type {HTMLElement} */ (pane.querySelector('.view .prose'))) } })

/** Its slots, Creations' page among them, once the project holds an app; until then only its card to start one, on the page another kind opens (D553). */
const joined = signal(/** @type {Record<string, unknown>} */ ({ starts: apps }))
let here = ''
effect(() => {
  const dir = (void app.conversations.value, app.projectDir)
  if (dir !== here) (here = dir, (joined.value = { starts: apps }))
  if (!joined.peek().creations) kept().then((list) => { if (here === dir && list.length) joined.value = { creations: apps, main: page } }, console.warn)
})
effect(() => register({ ...capability, slots: { ...capability.slots, ...joined.value, out: { at: 2, draw: () => null, of: (/** @type {{ uri: string }} */ { uri }) => /#app-\d+$/.test(uri), load: async () => ({ ways }) } } }))
