// The retrieval eval: what each way of reading would put before the brain for a question, best
// first, and how much of the question's evidence that covers within a budget of tokens. No brain
// is asked: the same passages, the same evidence spans, the same budgets for every strategy.
import { estimateTokens, indexOf, preselect } from '../../app/core/files.js'
import { lookup } from '../../app/core/search.js'
import { every } from '../../app/caps/files/search.js'
import { place } from './gold.js'

/** @typedef {import('./corpus.js').Question} Question */
/** @typedef {{ doc: number, page: number, start: number, end: number, tokens: number }} Unit  a passage or a whole page, what a strategy hands over */
/** @typedef {{ name: string, pages: string[], index: ReturnType<typeof indexOf>, units: Unit[] }} Doc */
/** @typedef {{ docs: Doc[], vectors?: Record<string, { matrix: Int8Array, dims: number, query: (q: Question) => Int8Array }> }} Context */

/** The files, cut and indexed once. @param {{ name: string, pages: string[] }[]} files */
export function prepare(files, size = 100) {
  return files.map((file, doc) => {
    const index = indexOf(file.pages, size)
    const units = index.passages.map((p) => ({ doc, page: p.page, start: p.start, end: p.end, tokens: estimateTokens(`${p.head}\n${file.pages[p.page - 1].slice(p.start, p.end)}`) }))
    return { name: file.name, pages: file.pages, index, units }
  })
}

/** A whole page as a unit. @param {Doc} d @param {number} doc @param {number} page */
const pageUnit = (d, doc, page) => ({ doc, page, start: 0, end: d.pages[page - 1].length, tokens: estimateTokens(d.pages[page - 1]) })

/** Codes a question names: C-4471, IR-5003, INV-200313. @param {string} text */
export const codes = (text) => text.match(/\b[A-Z]{1,4}-\d{3,6}\b/g) ?? []

/**
 * Each strategy's units for a question, best first; budget is for the ones that choose pages by it.
 * @type {Record<string, (q: Question, ctx: Context, budget: number) => Unit[]>}
 */
export const STRATEGIES = {
  // Today's: the first pages of each file, then the next ones (what read would bring).
  pages: (q, { docs }) => docs.flatMap((d, doc) => d.pages.map((_, i) => pageUnit(d, doc, i + 1))),
  // BM25 over the passages, the question's own words as the query.
  lexical: (q, { docs }) => lookup(docs.map((d) => d.index.lexicon), q.text).map((hit) => docs[hit.doc].units[hit.passage]),
  // Every place a code the question names is, in order, as the passages holding them.
  exact: (q, { docs }) => {
    /** @type {Unit[]} */
    const out = []
    for (const code of codes(q.text)) {
      for (const [doc, d] of docs.entries()) {
        for (const { page, at } of every(d.pages, code)) {
          const unit = d.units.find((u) => u.page === page && u.start <= at && at < u.end)
          if (unit && !out.includes(unit)) out.push(unit)
        }
      }
    }
    return out
  },
  // What a brain using both would see: the code's places first, then the best passages.
  'lexical+exact': (q, ctx, budget) => [...new Set([...STRATEGIES.exact(q, ctx, budget), ...STRATEGIES.lexical(q, ctx, budget)])],
  // For a small brain: the pages that match, chosen within the budget (D55 decides them once).
  preselect: (q, { docs }, budget) => docs.flatMap((d, doc) => preselect(d.pages, q.text, budget / docs.length, d.index).flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => pageUnit(d, doc, a + i)))),
}

/**
 * Dense and hybrid strategies for an embedder whose vectors are in the context.
 * @param {string} model a key of ctx.vectors
 */
export function denseStrategies(model) {
  /** @type {(q: Question, ctx: Context) => Unit[]} */
  const dense = (q, ctx) => {
    const v = /** @type {NonNullable<Context['vectors']>} */ (ctx.vectors)[model]
    const all = ctx.docs.flatMap((d) => d.units)
    return nearest(v.matrix, v.dims, v.query(q), 200).map((i) => all[i])
  }
  return {
    [`dense:${model}`]: dense,
    [`hybrid:${model}`]: (/** @type {Question} */ q, /** @type {Context} */ ctx) => fuse([STRATEGIES.lexical(q, ctx, 0).slice(0, 200), dense(q, ctx)]),
  }
}

/**
 * The rows of a flat Int8 matrix nearest a query, by dot product (vectors are normalised): a scan of
 * every row, keeping the best as it goes; no index.
 * @param {Int8Array} matrix @param {number} dims @param {Int8Array} query @param {number} top
 */
export function nearest(matrix, dims, query, top) {
  const rows = matrix.length / dims
  /** @type {number[]} */
  const best = []
  /** @type {number[]} */
  const scores = []
  for (let r = 0; r < rows; r++) {
    let dot = 0
    const base = r * dims
    for (let i = 0; i < dims; i++) dot += matrix[base + i] * query[i]
    if (best.length === top && dot <= scores[top - 1]) continue
    let at = best.length
    while (at > 0 && scores[at - 1] < dot) at--
    best.splice(at, 0, r)
    scores.splice(at, 0, dot)
    if (best.length > top) {
      best.pop()
      scores.pop()
    }
  }
  return best
}

/** Reciprocal rank fusion of ranked lists. @template T @param {T[][]} lists @returns {T[]} */
export function fuse(lists, k = 60) {
  /** @type {Map<T, number>} */
  const scores = new Map()
  for (const list of lists) list.forEach((item, rank) => scores.set(item, (scores.get(item) ?? 0) + 1 / (k + rank + 1)))
  return [...scores.keys()].sort((a, b) => /** @type {number} */ (scores.get(b)) - /** @type {number} */ (scores.get(a)))
}

/** Whether a unit holds at least half of a place. @param {Unit} unit @param {Doc[]} docs @param {import('./gold.js').Place} at */
const covers = (unit, docs, at) => docs[unit.doc].name === at.file && unit.page === at.page && Math.min(unit.end, at.end) - Math.max(unit.start, at.start) >= (at.end - at.start) / 2

/**
 * How a strategy's units score for a question: evidence covered within each budget, all of it or
 * not, the first unit's rank that holds some, and whether a lure was handed over.
 * @param {Unit[]} ranked @param {Doc[]} docs @param {(import('./gold.js').Place | null)[]} evidence @param {(import('./gold.js').Place | null)[]} lures @param {number[]} budgets
 */
export function score(ranked, docs, evidence, lures, budgets) {
  const found = evidence.filter((e) => e !== null)
  const first = ranked.slice(0, 50).findIndex((unit) => found.some((e) => covers(unit, docs, e)))
  /** @type {Record<number, { recall: number, strict: number, lure: number }>} */
  const at = {}
  for (const budget of budgets) {
    /** @type {Unit[]} */
    const given = []
    let used = 0
    for (const unit of ranked) {
      if (given.length && used + unit.tokens > budget) break
      given.push(unit)
      used += unit.tokens
    }
    const hit = found.filter((e) => given.some((unit) => covers(unit, docs, e))).length
    at[budget] = {
      recall: found.length ? hit / found.length : 0,
      strict: found.length && hit === found.length ? 1 : 0,
      lure: lures.some((l) => l && given.some((unit) => covers(unit, docs, l))) ? 1 : 0,
    }
  }
  return { rr: first < 0 ? 0 : 1 / (first + 1), at }
}

/**
 * Every question of a corpus, scored by every strategy asked for.
 * @param {Question[]} questions @param {{ name: string, pages: string[] }[]} files as extracted
 * @param {Context} ctx @param {Record<string, (q: Question, ctx: Context, budget: number) => Unit[]>} strategies @param {number[]} budgets
 */
export function evaluate(questions, files, ctx, strategies, budgets) {
  return questions.map((q) => {
    const evidence = q.evidence.map((e) => place(files, e))
    const lures = (q.lures ?? []).map((e) => place(files, e))
    /** @type {Record<string, ReturnType<typeof score> & { ms: number }>} */
    const by = {}
    for (const [name, strategy] of Object.entries(strategies)) {
      const started = performance.now()
      // A strategy that picks pages by budget is asked once per budget; the others once.
      const perBudget = name === 'preselect'
      const result = perBudget
        ? { rr: 0, at: Object.fromEntries(budgets.map((b) => [b, score(strategy(q, ctx, b), ctx.docs, evidence, lures, [b]).at[b]])) }
        : score(strategy(q, ctx, Math.max(...budgets)), ctx.docs, evidence, lures, budgets)
      by[name] = { ...result, ms: performance.now() - started }
    }
    return { id: q.id, type: q.type, lang: q.lang, split: q.split, missing: evidence.filter((e) => e === null).length, by }
  })
}
