// What npm run longtasks counts, borrowed from published methods and kept pure so node --test runs it: pass^k as
// τ-bench estimates it, TheAgentCompany's partial credit per checkpoint, a pairwise verdict asked in both orders (a
// position swap, as MT-Bench's judges are asked), the language a text is written in, and what a run's records say of
// its plan, its summaries (D359) and the work done again after it stopped.

/** @import { Envelope, PlanEntry } from '../../app/core/types.js' */

/** @param {number[]} values */
export const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN)

/** How many ways to pick k of n. @param {number} n @param {number} k */
export function choose(n, k) {
  if (k < 0 || k > n) return 0
  let ways = 1
  for (let i = 1; i <= k; i++) ways = (ways * (n - k + i)) / i
  return ways
}

/**
 * pass^k (τ-bench, Yao et al. 2024): the chance that k runs of a task all succeed, estimated without bias from n ≥ k
 * runs of which c succeeded, C(c, k) / C(n, k), averaged over tasks. pass^1 is the success rate.
 * @param {{ n: number, c: number }[]} tasks @param {number} k
 */
export const passHat = (tasks, k) => mean(tasks.filter(({ n }) => n >= k).map(({ n, c }) => choose(c, k) / choose(n, k)))

/**
 * TheAgentCompany's score (Xu et al. 2024): half for the share of checkpoints passed, half more when all are.
 * @param {boolean[]} checks
 */
export const partial = (checks) => (checks.length ? (0.5 * checks.filter(Boolean).length) / checks.length + (checks.every(Boolean) ? 0.5 : 0) : 0)

/**
 * A judge's two verdicts on one pair, the second with the deliverables swapped and read back: one side only when both
 * agree, else a tie, as a judge that changes its mind with the order has no preference to trust.
 * @param {'A' | 'B' | 'tie' | null} first @param {'A' | 'B' | 'tie' | null} swapped what it said with B shown first, as it named them
 * @returns {{ verdict: 'A' | 'B' | 'tie', consistent: boolean }}
 */
export function bothOrders(first, swapped) {
  const back = swapped === 'A' ? 'B' : swapped === 'B' ? 'A' : swapped
  if (!first || !back) return { verdict: 'tie', consistent: false }
  return { verdict: first === back ? first : 'tie', consistent: first === back }
}

/** A, B or a tie, from a judge's JSON or its last word on it. @param {string} text @returns {'A' | 'B' | 'tie' | null} */
export function verdictOf(text) {
  const said = /"better"\s*:\s*"(A|B|tie)"/i.exec(text)?.[1] ?? /\b(?:better|verdict)\b[^A-Za-z]{0,12}\b(A|B|tie)\b/i.exec(text)?.[1]
  return said ? /** @type {'A' | 'B' | 'tie'} */ (said.length === 1 ? said.toUpperCase() : 'tie') : null
}

/** The first JSON object in a text, as brains wrap it in prose or fences; null when there is none. @param {string} text @returns {any} */
export function jsonIn(text) {
  const start = text.indexOf('{')
  for (let end = text.lastIndexOf('}'); start >= 0 && end > start; end = text.lastIndexOf('}', end - 1)) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {}
  }
  return null
}

/** A share of wins, ties counted half (GDPval's "wins or ties" is reported beside it). @param {('A' | 'B' | 'tie')[]} verdicts @param {'A' | 'B'} side */
export const winRate = (verdicts, side) => mean(verdicts.map((verdict) => (verdict === side ? 1 : verdict === 'tie' ? 0.5 : 0)))

const FRENCH = /\b(le|la|les|des|du|est|et|pour|une|dans|qui|que|sur|au|aux|avec|pas|vous|nous)\b/gi
const ENGLISH = /\b(the|and|of|is|to|for|in|that|with|on|are|this|you|we|was|be)\b/gi

/**
 * The language of a text among those the eval runs, by its letters, then for Latin ones by their commonest words;
 * '?' when it can't tell. @param {string} text @returns {'en' | 'fr' | 'ar' | 'ja' | '?'}
 */
export function languageOf(text) {
  const count = (/** @type {RegExp} */ pattern) => text.match(pattern)?.length ?? 0
  const arabic = count(/[؀-ۿ]/g)
  const japanese = count(/[぀-ヿ一-鿿]/g)
  const latin = count(/[A-Za-zÀ-ÿ]/g)
  if (arabic > latin && arabic >= japanese && arabic) return 'ar'
  if (japanese > latin / 3 && japanese) return 'ja'
  const [fr, en] = [count(FRENCH), count(ENGLISH)]
  return fr + en < 3 ? '?' : fr > en ? 'fr' : 'en'
}

/**
 * The numbers a text holds, with separators of any locale read: "1 234,50", "1,234.50", "1234.5"; a space groups
 * thousands only before three digits, so a table's cells, apart by tabs or spaces, stay apart. @param {string} text
 */
export function numbersIn(text) {
  return [...text.matchAll(/-?\d+(?:[ \u00a0\u202f'](?=\d{3}(?!\d))\d{3})*(?:[.,]\d+)*/g)].flatMap(([raw]) => {
    const digits = raw.replace(/[ \u00a0\u202f']/g, '')
    const comma = digits.lastIndexOf(',')
    const dot = digits.lastIndexOf('.')
    // The last of comma and dot is the decimal mark when two digits or one follow it, else both group thousands.
    const mark = Math.max(comma, dot)
    const decimals = mark >= 0 && digits.length - mark - 1 <= 2 && digits.length - mark - 1 > 0
    const whole = decimals ? digits.slice(0, mark).replace(/[.,]/g, '') : digits.replace(/[.,]/g, '')
    const value = Number(decimals ? `${whole}.${digits.slice(mark + 1)}` : whole)
    return Number.isFinite(value) ? [value] : []
  })
}

/** Whether a text gives a number, within a share of it. @param {string} text @param {number} value @param {number} [within] */
export const gives = (text, value, within = 0.005) => numbersIn(text).some((found) => Math.abs(found - value) <= Math.max(0.01, Math.abs(value) * within))

/** Whether a text names a thing, case and accents aside. @param {string} text @param {string} name */
export const names = (text, name) => fold(text).includes(fold(name))

/** @param {string} text */
const fold = (text) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * What a run's records say of its plan (D364): the brain step its first plan came in, how many plans it showed, its
 * last plan's steps, whether all are done, and how many brain steps the run took.
 * @param {Envelope[]} records
 */
export function planOf(records) {
  const plans = records.flatMap(({ update, step = 0 }) => (update?.sessionUpdate === 'plan' ? [{ step, entries: /** @type {PlanEntry[]} */ (update.entries) }] : []))
  const last = plans.at(-1)?.entries ?? []
  return { first: plans[0]?.step ?? null, plans: plans.length, entries: last.length, settled: last.length > 0 && last.every((entry) => entry.status === 'completed'), steps: brainSteps(records) }
}

/** The brain steps a run took: its entries that answered, summaries aside. @param {Envelope[]} records */
export const brainSteps = (records) => records.filter(({ update }) => update?.sessionUpdate === 'tool_call' && update.kind === 'think' && !update.name && update.status === 'completed' && !update._meta?.compact && !update._meta?.parent).length

/**
 * What each summary of a run kept (D359, D363): the brain's words, in the conversation's language or not; the source
 * numbers cited before it that it gives again; and whether what Jean adds holds the request at work and the notes in force
 * (null where none was in force).
 * @param {Envelope[]} records @param {string} lang
 */
export function summariesOf(records, lang) {
  return records.flatMap(({ update }, i) => {
    if (update?.sessionUpdate !== 'compaction_update' || update.status !== 'completed') return []
    const text = (update.summary ?? []).map((block) => block.text).join('\n')
    const read = String(update._meta?.text ?? '')
    const cited = new Set(records.slice(0, i).flatMap(({ update: before }) => {
      if (before?.sessionUpdate === 'agent_message_chunk') return [...before.content.text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]))
      return []
    }))
    const kept = [...cited].filter((n) => text.includes(`[${n}]`))
    return [{ reason: update._meta?.reason, language: languageOf(text), inLanguage: languageOf(text) === lang, cited: cited.size, kept: kept.length,
      // Notes in force are kept only where there were some: null where there were none to keep.
      request: /<request>[\s\S]+<\/request>/.test(read), notes: standing(records.slice(0, i)) ? read.includes('Notes in force:') : null, chars: text.length }]
  })
}

/** The kinds of note that hold until another of their kind, as caps/compact/compact.js keeps them. */
const STANDING = ['language', 'date', 'section', 'tools', 'switch']

/** Whether records hold a note in force. @param {Envelope[]} records */
const standing = (records) => records.some(({ update }) => update?.sessionUpdate === '_system_note' && STANDING.includes(update.data.kind))

/**
 * The work a run did again after it stopped (TheAgentCompany's question of what a cut costs): the calls after step
 * `at` that repeat one made before it, same tool and same arguments, and those calls in all.
 * @param {Envelope[]} records @param {number} at
 */
export function redone(records, at) {
  const calls = records.flatMap(({ update, step = 0 }) => (update?.sessionUpdate === 'tool_call' && update.name && update.status === 'completed' && !update._meta?.parent
    ? [{ step, key: `${update.name} ${JSON.stringify(update.rawInput ?? {})}` }] : []))
  const before = new Set(calls.filter((call) => call.step <= at).map((call) => call.key))
  const after = calls.filter((call) => call.step > at)
  return { after: after.length, again: after.filter((call) => before.has(call.key)).length }
}
