// Scores among the creations (D542): the tunes a project's answers hold, as Music score writes them (```abc, D196), each task
// read again once it has changed, named by its title or its task's; on its card, the score drawn by the capability that draws
// it, loaded on sight. Picked, one opens its task, where it plays and is changed. A new one is asked for in the box, Jean's own
// Music score brought into the room first; one is pinned, renamed or taken off the page by a record in its task (D544). Skills
// gives them, as the kinds of block answers draw are its skills' (D196).
import { html } from 'lit-html'
import { app, openConversation, turnPage } from '../../ui/state.js'
import { unlock } from '../../ui/caps.js'
import { drawn } from '../../ui/markdown.js'
import { skillFor } from '../../ui/composer.js'
import { ask } from '../../ui/creations.js'
import { listConversations, loadConversation } from '../../core/conversations.js'
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
  return (await Promise.all(talks.map(async ({ path, title, updatedAt }) => {
    if (read.get(path)?.at !== updatedAt) {
      const records = (await loadConversation(app.fs, path).catch(() => null))?.records ?? [], marks = /** @type {Record<number, { name?: string, pinned?: boolean, hidden?: boolean }>} */ ({})
      for (const { meta } of records) if (meta?.tune) Object.assign(marks[meta.tune.n] ??= {}, meta.tune)
      read.set(path, { at: updatedAt, marks, tunes: foldTurns(records)
        .flatMap((turn) => [...turn.steps.map((step) => step.text).join('\n').matchAll(ABC)].map(([, , source]) => ({ source, title: /^T:[^\S\n]*(.+)$/m.exec(source)?.[1].trim() ?? '', changed: turn.end ?? turn.at }))) })
    }
    const { tunes = [], marks = {} } = read.get(path) ?? {}
    return tunes.flatMap(({ source, title: named, changed }, i) => (marks[i]?.hidden ? [] : [((name) => ({ path: `${path.slice(dir.length + 1)}#${i}`, name, changed, pinned: marks[i]?.pinned === true, text: '', source,
      link: /** @type {import('../../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: path, name: `${name}.abc`, mimeType: 'text/vnd.abc' }) }))(marks[i]?.name || named || title || t('conversation.untitled'))]))
  }))).flat()
}

/** A tune pinned, renamed or taken off the page (D544): a record in its task, the answer that holds it never changed. @param {{ path: string, link: { uri: string } }} item @param {{ name?: string, pinned?: boolean, hidden?: boolean }} change */
async function mark({ path, link }, change) {
  read.delete(link.uri)
  await (await import('../../ui/title.js')).markConversation(link.uri, { tune: { n: Number(path.split('#').pop()), ...change } })
}

/** Their kind of creation, which @ leaves out: picked, one opens its task; on its card, drawn; a new one asked for in the box, with Music score; marked in its task (D544). */
export const scores = { id: 'scores', at: 5, draw: () => GLYPH, kept, open: (/** @type {{ link: { uri: string } }} */ { link }) => turnPage(() => openConversation(link.uri)),
  pin: (/** @type {Parameters<typeof mark>[0]} */ item, /** @type {boolean} */ pinned) => mark(item, { pinned }), rename: (/** @type {Parameters<typeof mark>[0]} */ item, /** @type {string} */ name) => mark(item, { name }),
  hide: (/** @type {Parameters<typeof mark>[0]} */ item) => mark(item, { hidden: true }), like: () => skillFor('music'),
  preview: (/** @type {{ source: string }} */ { source }) => (unlock('scores'), drawn.value.abc?.(source, false) ?? GLYPH),
  make: { label: 'skills.newScore', run: async () => { await skillFor('music'); await ask('skills.askScore', 'skills.scoreExample') } } }
