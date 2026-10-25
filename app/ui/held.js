// What a project's answers hold, kept as creations (D542, D553): the blocks of one kind fenced in them, a tune's ```abc
// or an app's ```html, each task read again once it has changed or been marked, and what was read kept in .cache/, so that after a reload only the
// tasks changed since are read (D544). Each goes by what it calls itself, else its task's title; with `latest`, a task keeps the
// newest of each name alone, in the place of its first, as a brain writes a page whole again for each change. The user's marks
// on one, its name, pinned or taken off the page, are a record in its task, the answer that holds it never changed (D544).
import { app } from './state.js'
import { listConversations, loadConversation } from '../core/conversations.js'
import { readJSON, writeJSON } from '../core/fs.js'
import { foldTurns } from '../core/events.js'
import { t } from '../core/i18n.js'

/** @typedef {{ name?: string, pinned?: boolean, hidden?: boolean }} Mark */

/**
 * A kind of block the answers hold: its fence's word, the record its marks are kept in (`meta.<record>`, its blocks in
 * `.cache/<record>s.json`), what its place has after `#`, what a block calls itself, and its file's extension and type.
 * @param {{ fence: string, record: string, at?: string, latest?: boolean, named: (source: string) => string, extension: string, mimeType: string }} kind
 */
export function held({ fence, record, at = '', latest = false, named, extension, mimeType }) {
  const FENCE = new RegExp(`^ {0,3}(\`{3,}|~{3,})${fence}[^\\n]*\\n([\\s\\S]*?)\\n {0,3}\\1`, 'gim')
  const plural = `${record}s`, CACHE = `.cache/${plural}.json`
  /** Each task's blocks, as it was when last read, and the user's marks on them. @type {Map<string, any>} */
  const read = new Map()
  /** The cache, read once into `read`. @type {Promise<unknown> | null} */
  let cached = null
  /** How many times each task was marked here: a mark changes no `updatedAt`, so a read begun before one is read again after it. @type {Map<string, number>} */
  const marked = new Map()

  /** A task's blocks, in order, each with its name and when its answer was written; the newest of each name alone with `latest`. @param {import('../core/types.js').Envelope[]} records */
  const blocks = (records) => ((all) => (latest ? [...new Map(all.map((block) => [block.title, block])).values()] : all))(foldTurns(records)
    .flatMap((turn) => [...turn.steps.map((step) => step.text).join('\n').matchAll(FENCE)].map(([, , source]) => ({ source, title: named(source), changed: turn.end ?? turn.at }))))

  /** Those of a project's answers, the open one's unless named, found by name. @param {string} [dir] @returns {Promise<import('./creations.js').Creation[]>} */
  async function kept(dir = app.projectDir) {
    const talks = dir === app.projectDir ? app.conversations.peek() : await listConversations(app.fs, dir)
    await (cached ??= readJSON(app.fs, CACHE, {}).then((all) => { for (const [path, one] of Object.entries(all)) if (!read.has(path)) read.set(path, one) }, () => {}))
    let fresh = false
    const found = (await Promise.all(talks.map(async ({ path, title, updatedAt }) => {
      const seen = `${updatedAt} ${marked.get(path) ?? 0}`
      if (read.get(path)?.at !== seen) {
        fresh = true
        const records = (await loadConversation(app.fs, path).catch(() => null))?.records ?? [], marks = /** @type {Record<number, Mark>} */ ({})
        for (const { meta } of records) if (meta?.[record]) Object.assign(marks[meta[record].n] ??= {}, meta[record])
        read.set(path, { at: seen, marks, [plural]: blocks(records) })
      }
      const { [plural]: list = [], marks = {} } = read.get(path) ?? {}
      return list.flatMap((/** @type {{ source: string, title: string, changed: string }} */ { source, title: own, changed }, /** @type {number} */ i) => (marks[i]?.hidden ? [] : [((name) => ({
        path: `${path.slice(dir.length + 1)}#${at}${i}`, name, changed, pinned: marks[i]?.pinned === true, text: '', source,
        link: /** @type {import('../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: path, name: `${name}.${extension}`, mimeType }) }))(marks[i]?.name || own || title || t('conversation.untitled'))]))
    }))).flat()
    for (const path of read.keys()) if (path.startsWith(`${dir}/`) && !talks.some((one) => one.path === path)) (read.delete(path), (fresh = true))
    if (fresh) writeJSON(app.fs, CACHE, Object.fromEntries(read)).catch(() => {})
    return found
  }

  /** One pinned, renamed or taken off the page: a record in its task, its task read again after. @param {{ path: string, link: { uri: string } }} item @param {Mark} change */
  const mark = async ({ path, link }, change) => { await (await import('./title.js')).markConversation(link.uri, { [record]: { n: Number(path.slice(path.lastIndexOf('#') + 1 + at.length)), ...change } }); marked.set(link.uri, (marked.get(link.uri) ?? 0) + 1) }

  /** One by its place, `conversations/<file>#<at><n>`, as its task has it now. @param {string} uri */
  const find = async (uri) => /** @type {(import('./creations.js').Creation & { source: string }) | undefined} */ ((await kept()).find((one) => one.path === uri))
  return { kept, mark, find,
    /** What the preview's address names, one by its name; and its source, for the pane's Download. @param {string} uri */
    metaOf: async (uri) => ((one) => one && { name: one.link.name, mimeType })(await find(uri)),
    bytesOf: async (/** @type {string} */ uri) => new TextEncoder().encode((await find(uri))?.source ?? ''),
    /** Its card's menu: pinned, renamed, taken off the page. */
    pin: (/** @type {Parameters<typeof mark>[0]} */ item, /** @type {boolean} */ pinned) => mark(item, { pinned }), rename: (/** @type {Parameters<typeof mark>[0]} */ item, /** @type {string} */ name) => mark(item, { name }),
    hide: (/** @type {Parameters<typeof mark>[0]} */ item) => mark(item, { hidden: true }) }
}
