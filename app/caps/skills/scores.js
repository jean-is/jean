// Scores among the creations (D542): the tunes a project's answers hold, as Music score writes them (```abc, D196), each task
// read again once it has changed, named by its title or its task's; on its card, the score drawn by the capability that draws
// it, loaded on sight. Picked, one opens beside the task, its player on top, playing at once (D544). A new one is asked for in the box, Jean's own
// Music score brought into the room first; one is pinned, renamed or taken off the page by a record in its task (D544). Skills
// gives them, as the kinds of block answers draw are its skills' (D196).
import { html } from 'lit-html'
import { app } from '../../ui/state.js'
import { unlock } from '../../ui/caps.js'
import { drawn } from '../../ui/markdown.js'
import { skillFor } from '../../ui/composer.js'
import { ask } from '../../ui/creations.js'
import { listConversations, loadConversation } from '../../core/conversations.js'
import { readJSON, writeJSON } from '../../core/fs.js'
import { foldTurns } from '../../core/events.js'
import { t } from '../../core/i18n.js'
import { DIRECTORY } from './directory.js'

/** A tune in ABC notation, fenced in an answer. */
const ABC = /^ {0,3}(`{3,}|~{3,})abc[^\n]*\n([\s\S]*?)\n {0,3}\1/gim
const GLYPH = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d=${DIRECTORY.find((entry) => entry.name === 'music-score')?.icon ?? ''}></path></svg>`
/** Each task's tunes, as it was when last read: its source, its title, when its answer was written, and the user's marks on it (D544). @type {Map<string, { at: string, tunes: { source: string, title: string, changed: string }[], marks: Record<number, { name?: string, pinned?: boolean, hidden?: boolean }> }>} */
const read = new Map()

/** The tunes of a project's answers, the open one's unless named, found by name: their notes are no words. @param {string} [dir] @returns {Promise<import('../../ui/creations.js').Creation[]>} */
async function kept(dir = app.projectDir) {
  const talks = dir === app.projectDir ? app.conversations.peek() : await listConversations(app.fs, dir)
  // As last read, kept in .cache/ too, so that after a reload only the tasks changed since are read (D544).
  await (cached ??= readJSON(app.fs, CACHE, {}).then((all) => { for (const [path, one] of Object.entries(all)) if (!read.has(path)) read.set(path, one) }, () => {}))
  let fresh = false
  const found = (await Promise.all(talks.map(async ({ path, title, updatedAt }) => {
    if (read.get(path)?.at !== updatedAt) {
      fresh = true
      const records = (await loadConversation(app.fs, path).catch(() => null))?.records ?? [], marks = /** @type {Record<number, { name?: string, pinned?: boolean, hidden?: boolean }>} */ ({})
      for (const { meta } of records) if (meta?.tune) Object.assign(marks[meta.tune.n] ??= {}, meta.tune)
      read.set(path, { at: updatedAt, marks, tunes: foldTurns(records)
        .flatMap((turn) => [...turn.steps.map((step) => step.text).join('\n').matchAll(ABC)].map(([, , source]) => ({ source, title: /^T:[^\S\n]*(.+)$/m.exec(source)?.[1].trim() ?? '', changed: turn.end ?? turn.at }))) })
    }
    const { tunes = [], marks = {} } = read.get(path) ?? {}
    return tunes.flatMap(({ source, title: named, changed }, i) => (marks[i]?.hidden ? [] : [((name) => ({ path: `${path.slice(dir.length + 1)}#${i}`, name, changed, pinned: marks[i]?.pinned === true, text: '', source,
      link: /** @type {import('../../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: path, name: `${name}.abc`, mimeType: 'text/vnd.abc' }) }))(marks[i]?.name || named || title || t('conversation.untitled'))]))
  }))).flat()
  for (const path of read.keys()) if (path.startsWith(`${dir}/`) && !talks.some((one) => one.path === path)) (read.delete(path), (fresh = true))
  if (fresh) writeJSON(app.fs, CACHE, Object.fromEntries(read)).catch(() => {})
  return found
}
const CACHE = '.cache/tunes.json'
/** The cache read once into `read`. @type {Promise<unknown> | null} */
let cached = null

/** A tune pinned, renamed or taken off the page (D544): a record in its task, the answer that holds it never changed. @param {{ path: string, link: { uri: string } }} item @param {{ name?: string, pinned?: boolean, hidden?: boolean }} change */
async function mark({ path, link }, change) {
  read.delete(link.uri)
  await (await import('../../ui/title.js')).markConversation(link.uri, { tune: { n: Number(path.split('#').pop()), ...change } })
}

/** Their kind of creation, which @ leaves out: picked, one opens beside the task, playing; on its card, drawn; a new one asked for in the box, with Music score; marked in its task (D544). */
/** The tune a click asked to hear, which plays once drawn beside the task (D544). */
let asked = ''
/** A tune by its place, `conversations/<file>#<n>`, as its task has it now. @param {string} uri @returns {Promise<any>} */
const find = async (uri) => (await kept()).find((one) => one.path === uri)
/** What the preview's address names, a tune by its name; and its source, for the pane's Download. @param {string} uri */
export const metaOf = async (uri) => ((one) => one && { name: one.link.name, mimeType: 'text/vnd.abc' })(await find(uri))
export const bytesOf = async (/** @type {string} */ uri) => new TextEncoder().encode((await find(uri))?.source ?? '')
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
  pin: (/** @type {Parameters<typeof mark>[0]} */ item, /** @type {boolean} */ pinned) => mark(item, { pinned }), rename: (/** @type {Parameters<typeof mark>[0]} */ item, /** @type {string} */ name) => mark(item, { name }),
  hide: (/** @type {Parameters<typeof mark>[0]} */ item) => mark(item, { hidden: true }), like: () => skillFor('music'),
  preview: (/** @type {{ source: string }} */ { source }) => (unlock('scores'), drawn.value.abc?.(source, false) ?? GLYPH),
  make: { label: 'skills.newScore', run: async () => { await skillFor('music'); await ask('skills.askScore', 'skills.scoreExample') } } }
