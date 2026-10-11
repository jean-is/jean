// The document evals' report: each strategy's scores by size and kind of question, each registered
// hypothesis marked confirmed, refuted or inconclusive by its rule (hypotheses.json), and what each
// strategy is for, as test/documents/results.md and strategies.json.
import { mean, pairedCI } from './stats.js'

/** @typedef {{ id: string, type: string, lang: string, split: string, missing: number, overlap?: number, by: Record<string, { rr: number, ms: number, at: Record<string, { recall: number, strict: number, lure: number }> }> }} Row */
/** @typedef {{ seed: number, size: string, split: string, passage: number, ext: string, indexMs: number, passages: number, pages: number, budgets: number[], results: Row[] }} Run */

/** The value a question gives a metric: recall, strict or lure at a budget, or rr. @param {Row} row @param {string} strategy @param {string} metric @param {number} budget */
export const value = (row, strategy, metric, budget) => (metric === 'mrr' ? row.by[strategy]?.rr : row.by[strategy]?.at[budget]?.[/** @type {'recall'} */ (metric.replace('@B', ''))]) ?? NaN

/** Rows of runs of a size, pooled over seeds, of some kinds of question. @param {Run[]} runs @param {string} size @param {string[]} [types] */
export const rows = (runs, size, types) => runs.filter((run) => run.size === size).flatMap((run) => run.results).filter((row) => !types || types.includes(row.type))

/**
 * A rule comparing two strategies on the same questions: the paired interval of a − b.
 * @param {Row[]} list @param {string} a @param {string} b @param {string} metric @param {number} budget
 */
export function compare(list, a, b, metric, budget) {
  const both = list.filter((row) => row.by[a] && row.by[b])
  return pairedCI(both.map((row) => value(row, a, metric, budget)), both.map((row) => value(row, b, metric, budget)))
}

/** @param {{ mean: number, low: number, high: number, n: number }} c */
export const said = (c) => `${(c.mean * 100).toFixed(1)} points (95% CI ${(c.low * 100).toFixed(1)} to ${(c.high * 100).toFixed(1)}, n = ${c.n})`

/**
 * Each hypothesis's verdict from the runs, benches and answers there are; 'not run' when its data isn't.
 * @param {any} hypotheses hypotheses.json @param {{ runs: Run[], bench: Record<string, any>, answers: Row[], dense: string }} data
 * @returns {{ id: string, claim: string, verdict: 'confirmed' | 'refuted' | 'inconclusive' | 'audit' | 'not run', evidence: string }[]}
 */
export function verdicts(hypotheses, { runs, bench, answers, dense }) {
  return hypotheses.hypotheses.map((/** @type {any} */ h) => {
    const r = h.rule
    const out = (/** @type {any} */ verdict, /** @type {string} */ evidence) => ({ id: h.id, claim: h.claim, verdict, evidence })
    if (r.bench === 'scan') {
      const cells = Object.entries(bench).filter(([key]) => /^scan-\d+-10x$/.test(key))
      if (!cells.length) return out('not run', '')
      const worst = Math.max(...cells.map(([, cell]) => cell.p95))
      const ingest = Object.entries(bench).filter(([key]) => key.startsWith('embed-')).map(([key, cell]) => `${key.slice(6)}: ${Math.round(cell.minutesXL)} min to embed XL on this computer's CPU`).join('; ')
      return out(worst < r.p95Ms.lt ? 'confirmed' : 'refuted', `${cells.map(([key, cell]) => `${cell.rows} vectors of ${cell.dims}: p95 ${cell.p95.toFixed(1)} ms`).join('; ')}${ingest ? `. Ingestion: ${ingest}` : ''}`)
    }
    if (r.bench === 'first-search') {
      const cell = bench[`first-search-${r.cpuThrottle}x`]
      if (!cell) return out('not run', '')
      return out(cell.total < r.ms.lt ? 'confirmed' : 'refuted', `${Math.round(cell.total)} ms with the CPU ${r.cpuThrottle}× slower (index ${Math.round(cell.build)} ms, query ${Math.round(cell.query)} ms, ${cell.passages} passages); ${Math.round(bench['first-search-1x']?.total ?? NaN)} ms at full speed`)
    }
    if (r.answers) {
      const list = answers.filter((row) => (r.types ?? []).includes(row.type) && (!r.size || row.id.includes(`-${r.size}-`)) && (!r.sizes || r.sizes.some((/** @type {string} */ s) => row.id.includes(`-${s}-`))))
      if (!list.some((row) => row.by[r.a] && row.by[r.b])) return out('not run', '')
      const c = compare(list, r.a, r.b, 'accuracy', 0)
      const accuracy = (/** @type {string} */ s) => mean(list.filter((row) => row.by[s]).map((row) => value(row, s, 'accuracy', 0)))
      const text = `${r.a} ${(accuracy(r.a) * 100).toFixed(0)}%, ${r.b} ${(accuracy(r.b) * 100).toFixed(0)}%; ${r.a} − ${r.b}: ${said(c)}`
      if (r.ci?.within) return out(c.low >= r.ci.within[0] && c.high <= r.ci.within[1] ? 'confirmed' : c.high < r.refutedIf.ciHigh.lt ? 'refuted' : 'inconclusive', text)
      if (r.ciHigh) return out(c.high < r.ciHigh.lt ? 'confirmed' : c.low >= r.ciHigh.lt ? 'refuted' : 'inconclusive', text)
      const enough = (r.aAtLeast === undefined || accuracy(r.a) >= r.aAtLeast) && (r.mean === undefined || c.mean >= r.mean.gte)
      return out(enough && c.low >= (r.ciLow?.gte ?? -Infinity) && c.low > (r.ciLow?.gt ?? -Infinity) ? 'confirmed' : c.high < (r.ciLow?.gte ?? r.ciLow?.gt ?? 0) || !enough && c.high < (r.mean?.gte ?? 0) ? 'refuted' : 'inconclusive', text)
    }
    const b = r.b === 'dense' ? dense : r.b
    const a = r.a === 'dense' ? dense : r.a
    let list = rows(runs, r.size, r.types)
    if (r.overlap === 'low') list = list.filter((row) => (row.overlap ?? 1) <= 0.2)
    if (!list.some((row) => row.by[a] && row.by[b])) return out('not run', '')
    const c = compare(list, a, b, r.metric, r.budget)
    let text = `${a} − ${b}, ${r.metric.replace('B', String(r.budget / 1000) + 'k')}: ${said(c)}`
    let ok = r.ciLow.gte !== undefined ? c.low >= r.ciLow.gte : c.low > r.ciLow.gt
    let bad = r.ciLow.gte !== undefined ? c.high < r.ciLow.gte : c.high <= r.ciLow.gt
    if (r.and) {
      const a2 = r.and.a === 'dense' ? dense : r.and.a
      const b2 = r.and.b === 'dense' ? dense : r.and.b
      const c2 = compare(rows(runs, r.size, r.and.types), a2, b2, r.and.metric, r.budget)
      text += `; on ${r.and.types.join(', ')}, ${a2} − ${b2}, ${r.and.metric.replace('B', String(r.budget / 1000) + 'k')}: ${said(c2)}`
      ok = ok && c2.low >= r.and.ciLow.gte
      bad = bad || c2.high < r.and.ciLow.gte
    }
    if (h.id === 'H3' && !ok) return out('audit', text)
    return out(ok ? 'confirmed' : bad ? 'refuted' : 'inconclusive', text)
  })
}

/** A Markdown table. @param {string[]} head @param {(string | number)[][]} body */
export const table = (head, body) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map((row) => `| ${row.join(' | ')} |`)].join('\n')

/** @param {number} x */
export const pct = (x) => (Number.isNaN(x) ? '–' : `${Math.round(x * 100)}`)
