// search_files: the passages of the files the brain may read that hold the words asked, or every
// place a phrase is (D24). Core ranks (search.js) and cuts passages (files.js); this is the tool.
import { estimateTokens, fileText, indexOf, ranges, splitPages } from '../../core/files.js'
import { lookup, every } from '../../core/search.js'
import { isPicture } from '../../core/events.js'

/** @import { FS, ResourceLink } from '../../core/types.js' */

/**
 * The `search_files` tool: the passages of the files the brain may read that hold the words asked,
 * best first, each with its file, page and heading; or every place a phrase is, counted, in order.
 * A file's index is made in memory the first time it is searched (its text never changes: files are
 * named by content). A file not shared in the task is numbered as a source by the turn.
 * @param {{ fs: FS, projectDir: () => string, files: (signal?: AbortSignal) => ResourceLink[], maxTokens?: number }} options
 * @returns {import('../../core/loop.js').Tool}
 */
export function searchTool({ fs, projectDir, files, maxTokens = 6000 }) {
  /** @type {Map<string, Promise<{ pages: string[], index: ReturnType<typeof indexOf> }>>} */
  const indexes = new Map()
  /** @param {ResourceLink} link */
  const load = (link) => indexes.get(link.uri) ?? indexes.set(link.uri, fileText(fs, projectDir(), link.uri).then((text) => {
    const pages = splitPages(text ?? '')
    return { pages, index: indexOf(pages) }
  })).get(link.uri)
  return {
    spec: {
      name: 'search_files',
      description: 'Find passages in the files by words they hold: names, numbers and codes work best; write them as the files do, in their language. With every, each place a phrase is, counted: for totals, or the latest of several versions.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, file: { type: 'string', description: 'One file, by name; omit for all' }, every: { type: 'boolean' } }, required: ['query'] },
    },
    kind: 'search',
    title: (args) => `Search ${args?.query ?? ''}`,
    run: async (args, ctx) => {
      const query = String(args?.query ?? '')
      const wanted = String(args?.file ?? '').trim().toLowerCase()
      const links = files(ctx?.signal).filter((link) => !isPicture(link) && (!wanted || link.name.toLowerCase() === wanted))
      const loaded = /** @type {{ pages: string[], index: ReturnType<typeof indexOf> }[]} */ (await Promise.all(links.map(load)))
      /** @type {Map<number, number>} */
      const numbers = new Map()
      const source = (/** @type {number} */ d) => numbers.get(d) ?? numbers.set(d, links[d]._meta?.source ?? ctx?.cite?.([{ title: links[d].name, url: links[d].uri }])[0] ?? d + 1).get(d)
      const head = (/** @type {number} */ d, /** @type {number} */ page) => `Source [${source(d)}]: ${links[d].name}, page ${page}`
      let out = ''
      const room = (/** @type {string} */ text) => !out || estimateTokens(out + text) <= maxTokens
      if (args?.every) {
        const found = loaded.map(({ pages }) => every(pages, query))
        const total = found.reduce((sum, list) => sum + list.length, 0)
        const shown = new Set()
        for (const [d, list] of found.entries()) {
          for (const { page, at } of list) {
            const text = loaded[d].pages[page - 1]
            const line = text.slice(text.lastIndexOf('\n', at) + 1, (text.indexOf('\n', at) + 1 || text.length + 1) - 1).trim().slice(0, 300)
            const block = `${shown.has(`${d}:${page}`) ? '' : `\n${head(d, page)}`}\n${line}`
            if (!room(block)) break
            shown.add(`${d}:${page}`)
            out += block
          }
          if (list.length && !shown.has(`${d}:${list[list.length - 1].page}`)) out += `\n(${links[d].name}: also on pages ${ranges(list.map((place) => place.page)).map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(', ')})`
        }
        const count = found.filter((list) => list.length).length
        if (total) return `${total} ${total === 1 ? 'place' : 'places'} in ${count} ${count === 1 ? 'file' : 'files'}:${out}`
      } else {
        for (const { doc, passage } of lookup(loaded.map((l) => l.index.lexicon), query)) {
          const p = loaded[doc].index.passages[passage]
          const block = `${out ? '\n\n' : ''}${head(doc, p.page)}${p.head && !/^#/.test(loaded[doc].pages[p.page - 1].slice(p.start)) ? ` — ${p.head.split('\n')[0]}` : ''}\n${loaded[doc].pages[p.page - 1].slice(p.start, p.end).trim()}`
          if (!room(block)) break
          out += block
        }
        if (out) return out
      }
      return `Nothing in ${wanted && links.length ? links[0].name : 'the files'} matches "${query}".`
    },
  }
}
