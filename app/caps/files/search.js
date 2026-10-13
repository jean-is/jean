// search_files: the passages of the files the brain may read that hold the words asked, or every
// place a phrase is (D24). Core ranks (search.js) and cuts passages (files.js); this is the tool,
// and each file's index, kept in .cache/words/ by the file's content.
import { estimateTokens, fileText, indexOf, ranges, splitPages } from '../../core/files.js'
import { lookup, fold } from '../../core/search.js'
import { isPicture } from '../../core/events.js'
import { encoder } from '../../core/fs.js'

/** @import { FS, ResourceLink } from '../../core/types.js' */
/** @typedef {ReturnType<typeof indexOf>} Index */

// What a kept index holds and how, raised whenever passages() or keys() cut or fold otherwise:
// every kept one is then made again.
const FORMAT = 1
const decoder = new TextDecoder()

/**
 * An index as bytes: its header's length, the header (JSON: the format, the terms, the passages'
 * headings), then numbers: the count of passages, each one's length in terms, page, start, end and
 * heading, each term's list's length, and the lists. @param {Index} index
 */
export function pack({ passages, lexicon }) {
  /** @type {Map<string, number>} each heading, numbered once */
  const heads = new Map()
  for (const p of passages) if (!heads.has(p.head)) heads.set(p.head, heads.size)
  const header = encoder.encode(JSON.stringify({ format: FORMAT, terms: [...lexicon.postings.keys()], heads: [...heads.keys()] }))
  const lists = [...lexicon.postings.values()]
  const numbers = new Uint32Array(1 + 5 * passages.length + lists.length + lists.reduce((sum, list) => sum + list.length, 0))
  numbers[0] = passages.length
  passages.forEach((p, i) => numbers.set([lexicon.lengths[i], p.page, p.start, p.end, Number(heads.get(p.head))], 1 + 5 * i))
  let at = 1 + 5 * passages.length
  for (const list of lists) numbers[at++] = list.length
  for (const list of lists) at += (numbers.set(list, at), list.length)
  const out = new Uint8Array(4 + header.length + numbers.byteLength)
  new DataView(out.buffer).setUint32(0, header.length, true)
  out.set(header, 4)
  out.set(new Uint8Array(numbers.buffer), 4 + header.length)
  return out
}

/** An index from its bytes; null when another format made them. @param {Uint8Array} bytes @returns {Index | null} */
export function unpack(bytes) {
  const size = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true)
  const { format, terms, heads } = JSON.parse(decoder.decode(bytes.subarray(4, 4 + size)))
  if (format !== FORMAT) return null
  const numbers = new Uint32Array(bytes.slice(4 + size).buffer)
  const lengths = new Uint32Array(numbers[0])
  const passages = [...lengths].map((_, i) => {
    const [length, page, start, end, head] = numbers.subarray(1 + 5 * i, 6 + 5 * i)
    lengths[i] = length
    return { page, start, end, head: heads[head] }
  })
  const sizes = numbers.subarray(1 + 5 * lengths.length)
  let at = sizes.byteOffset / 4 + terms.length
  const postings = new Map(terms.map((/** @type {string} */ term, /** @type {number} */ t) => [term, numbers.subarray(at, (at += sizes[t]))]))
  return { passages, lexicon: { lengths, total: lengths.reduce((sum, n) => sum + n, 0), postings } }
}

/**
 * A file's pages and index: read from .cache/words/, or made and kept there (H6: making an XL file's
 * takes 2.5 s, 11 on a slow computer). Its text never changes: files are named by content. Null for
 * a file no longer there. @param {FS} fs @param {string} projectDir @param {string} uri
 * @returns {Promise<{ pages: string[], index: Index } | null>}
 */
export async function indexed(fs, projectDir, uri) {
  const text = await fileText(fs, projectDir, uri)
  if (text === null) return null
  const pages = splitPages(text)
  const path = `.cache/words/${String(uri.split('/').pop()).replace(/\.[^.]*$/, '')}.idx`
  const kept = await fs.readBytes(path).then((bytes) => bytes && unpack(bytes)).catch(() => null)
  if (kept) return { pages, index: kept }
  const index = indexOf(pages)
  // A cache that can't be written only costs the next search its time.
  await fs.writeBytes(path, pack(index)).catch(() => {})
  return { pages, index }
}

/**
 * Every place a phrase is in some pages, in order: case, accents and line breaks aside, and never
 * inside a longer word or code where words have spaces between them.
 * @param {string[]} pages @param {string} phrase @returns {{ page: number, at: number }[]}
 */
export function every(pages, phrase) {
  const parts = fold(phrase.normalize('NFC')).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return []
  const pattern = new RegExp(`${/^[a-z0-9]/.test(parts[0]) ? '(?<![a-z0-9])' : ''}${parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}${/[a-z0-9]$/.test(parts[parts.length - 1]) ? '(?![a-z0-9])' : ''}`, 'g')
  return pages.flatMap((text, i) => [...fold(text).matchAll(pattern)].map((match) => ({ page: i + 1, at: match.index ?? 0 })))
}

/**
 * The `search_files` tool: the passages of the files the brain may read that hold the words asked,
 * best first, each with its file, page and heading; or every place a phrase is, counted, in order.
 * A file's index is read or made the first time it is searched (`indexed`). A file not shared in the task is numbered as a source by the turn. With meaning
 * search on, the passages nearest by meaning are fused with those by words (D302), by their ranks.
 * @param {{ fs: FS, projectDir: () => string, files: (signal?: AbortSignal) => ResourceLink[], maxTokens?: number,
 *   meaning?: (query: string, links: ResourceLink[]) => Promise<{ doc: number, passage: number }[] | null>, unfound?: () => string }} options
 *   meaning: the passages nearest by meaning, or null while it is off; unfound: what to add when nothing matches
 * @returns {import('../../core/loop.js').Tool}
 */
export function searchTool({ fs, projectDir, files, maxTokens = 6000, meaning = async () => null, unfound = () => '' }) {
  /** @type {Map<string, Promise<{ pages: string[], index: Index }>>} */
  const indexes = new Map()
  /** @param {ResourceLink} link */
  const load = (link) => indexes.get(link.uri) ?? indexes.set(link.uri, indexed(fs, projectDir(), link.uri).then((found) => found ?? { pages: [], index: indexOf([]) })).get(link.uri)
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
      const loaded = /** @type {{ pages: string[], index: Index }[]} */ (await Promise.all(links.map(load)))
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
        const words = lookup(loaded.map((l) => l.index.lexicon), query)
        const near = await meaning(query, links)
        for (const { doc, passage } of near ? fuse([words.slice(0, 200), near]) : words) {
          const p = loaded[doc].index.passages[passage]
          const block = `${out ? '\n\n' : ''}${head(doc, p.page)}${p.head && !/^#/.test(loaded[doc].pages[p.page - 1].slice(p.start)) ? ` — ${p.head.split('\n')[0]}` : ''}\n${loaded[doc].pages[p.page - 1].slice(p.start, p.end).trim()}`
          if (!room(block)) break
          out += block
        }
        if (out) return out
      }
      return `Nothing in ${wanted && links.length ? links[0].name : 'the files'} matches "${query}".${args?.every ? '' : unfound()}`
    },
  }
}

/**
 * Reciprocal rank fusion (k = 60): passages ranked by how high each list puts them, as the document
 * evals' hybrid does. @param {{ doc: number, passage: number }[][]} lists
 */
function fuse(lists) {
  /** @type {Map<string, { doc: number, passage: number, score: number }>} */
  const scored = new Map()
  for (const list of lists) list.forEach(({ doc, passage }, rank) => {
    const key = `${doc}:${passage}`
    const entry = scored.get(key) ?? scored.set(key, { doc, passage, score: 0 }).get(key)
    if (entry) entry.score += 1 / (61 + rank)
  })
  return [...scored.values()].sort((a, b) => b.score - a.score)
}
