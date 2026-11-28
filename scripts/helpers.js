// SPDX-License-Identifier: MIT
// Measures helpers a step under their task's brain (D7), before Jean gives them one: each request of test/helpers/set.json,
// a large task in independent parts, run as Jean runs a task in Node (test/longtasks/jean.js) with the helpers capability
// as its own, twice by the same brain: its helpers on that brain, then on HELPER_MODEL, its version a step under at the
// same service. A judge, given the request and both answers blind, in both orders, says which does what was asked better,
// or neither. A pair counts only when both runs handed parts to helpers.
// Usage: BRAIN=claudecode:sonnet HELPER_MODEL=haiku JUDGE=claudecode:opus npm run helpers
//        npm run helpers -- --lang en,fr   some languages (default: en, fr, ar, ja)
//        npm run helpers -- --only posts   some requests
//        npm run helpers -- --parallel 2   tasks at a time (default 3)
//        npm run helpers -- --write        also write test/helpers/results.md
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chooseBrain } from '../cli/brain.js'
import { streamChat } from '../app/core/llm.js'
import { runTask, textOf, willing } from '../test/longtasks/jean.js'
import { bothOrders, verdictOf, winRate } from '../test/longtasks/score.js'

/** @import { Envelope } from '../app/core/types.js' */

const DIR = new URL('../test/helpers/', import.meta.url)
const argv = process.argv.slice(2)
const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)

// The room Jean's capabilities run in here keeps each one that registers, so that a helper has the tools its task's
// capabilities give, as the page's contributions() gives them, and the assistant has its name.
const room = /** @type {any} */ (globalThis)[Symbol.for('jean.longtasks.room')]
/** @type {Map<string, any>} */
const caps = new Map()
const registered = room['caps.js'].register
room['caps.js'] = { ...room['caps.js'], register: (/** @type {any} */ cap) => { caps.set(cap.id, cap); registered(cap) }, contributions: () => ({ tools: [...caps.values()].flatMap((cap) => cap.tools ?? []) }) }
room['state.js'] = { ...room['state.js'], assistantName: () => 'Jean' }
const { chooseHelperBrain } = await import('../app/caps/helpers/helpers.js')
const helpers = caps.get('helpers')

const lead = await chooseBrain({ named: process.env.BRAIN ?? '' })
const under = process.env.HELPER_MODEL
const judge = await chooseBrain({ named: process.env.JUDGE ?? process.env.BRAIN ?? '' })
if (!lead || 'needs' in lead || !judge || 'needs' in judge || !under) throw new Error('BRAIN=<provider>:<model> HELPER_MODEL=<its version a step under> JUDGE=<provider>:<model>')

/** One request to a brain, its words back. @param {import('../cli/brain.js').Chosen} chosen @param {string} text */
async function asked(chosen, text) {
  let reply = ''
  for await (const event of streamChat({ brain: chosen.brain, apiKey: chosen.apiKey, messages: [{ role: 'user', content: text }], tools: [], maxTokens: 4096 })) if (event.type === 'text') reply += event.delta
  return reply
}

/**
 * A task run to its end: whether it handed parts to helpers, its answer with the files it made, what it spent.
 * @param {{ id: string, lang: string, request: string }} job @param {string} side
 */
async function run({ id, lang, request }, side) {
  const outcome = await runTask(lead, { lang, request, files: [], where: 'files', features: { plan: false, compact: false, keep: 0 }, window: 0, user: willing,
    own: { tools: helpers.tools, lines: helpers.lines } }, join(tmpdir(), 'jean-helpers', `${id}-${lang}-${side}`))
  const records = /** @type {Envelope[]} */ (outcome.records)
  const delegated = records.some(({ update }) => update?.sessionUpdate === 'tool_call' && update.name === 'delegate')
  const said = records.flatMap(({ update }) => (update?.sessionUpdate === 'agent_message_chunk' ? [update.content.text] : [])).join('')
  const files = await Promise.all(outcome.made.map(async (file) => `<file name="${file.name}">\n${await textOf(file)}\n</file>`))
  console.log(`  ${id} ${lang} ${side}: ${delegated ? 'helpers' : 'no helpers'} · ${outcome.spent.requests} requests${outcome.error ? ` · ${outcome.error}` : ''}`)
  return { delegated, text: [said, ...files].join('\n\n').trim(), spent: outcome.spent }
}

/** Runs the jobs a few at a time, in their order. @template T, R @param {T[]} items @param {(item: T) => Promise<R>} work @returns {Promise<R[]>} */
async function pool(items, work) {
  /** @type {R[]} */
  const done = []
  let next = 0
  const worker = async () => { for (let i = next++; i < items.length; i = next++) done[i] = await work(items[i]) }
  await Promise.all(Array.from({ length: Math.min(Number(flag('--parallel')) || 3, items.length) }, worker))
  return done
}

const ASK = "You compare two answers to the same request, shown blind. Judge only how well each does what was asked: every part done, right, clear and useful, in the request's language."
/** Which of two answers is better, asked in both orders, A being the first. @param {string} request @param {string} a @param {string} b */
async function judged(request, a, b) {
  const one = async (/** @type {string} */ first, /** @type {string} */ second) => verdictOf(await asked(/** @type {any} */ (judge), [ASK, `<request>\n${request}\n</request>`,
    `<answer name="A">\n${first || '(nothing)'}\n</answer>`, `<answer name="B">\n${second || '(nothing)'}\n</answer>`, 'Reply with JSON only: {"better": "A" or "B" or "tie", "why": "one sentence"}'].join('\n\n')))
  return bothOrders(await one(a, b), await one(b, a))
}

const langs = flag('--lang')?.split(',') ?? ['en', 'fr', 'ar', 'ja']
const set = /** @type {Record<string, Record<string, string>>} */ (JSON.parse(await readFile(new URL('set.json', DIR), 'utf8')).requests)
const jobs = Object.entries(set).filter(([id]) => !flag('--only') || flag('--only')?.split(',').includes(id)).flatMap(([id, by]) => langs.map((lang) => ({ id, lang, request: by[lang] })))
const name = `${lead.brain.model} (${lead.brain.provider})`
try {
  console.log(`helpers: ${name}, its helpers on itself, then on ${under}; judged by ${judge.brain.model}; ${jobs.length} tasks`)
  // One side at a time: the helper's brain is the capability's, the same for every task running.
  chooseHelperBrain((brain) => brain)
  const same = await pool(jobs, (job) => run(job, 'same'))
  chooseHelperBrain((brain) => ({ ...brain, model: under }))
  const lower = await pool(jobs, (job) => run(job, 'under'))
  const pairs = await pool(jobs.map((job, i) => ({ job, same: same[i], lower: lower[i] })).filter((pair) => pair.same.delegated && pair.lower.delegated),
    async (pair) => ({ ...pair, ...await judged(pair.job.request, pair.same.text, pair.lower.text) }))
  const share = (/** @type {typeof pairs} */ some) => (some.length ? `${Math.round(winRate(some.map((pair) => pair.verdict), 'B') * 100)}%` : '—')
  const spent = (/** @type {typeof same} */ side) => side.reduce((sum, one) => sum + one.spent.outputTokens, 0).toLocaleString('en')
  const rows = langs.map((lang) => ((some) => `| ${lang} | ${some.length} | ${some.filter((pair) => pair.verdict === 'A').length} | ${some.filter((pair) => pair.verdict === 'B').length} | ${some.filter((pair) => pair.verdict === 'tie').length} | ${share(some)} |`)(pairs.filter((pair) => pair.job.lang === lang)))
  const report = `# Helpers a step under: ${name}, its helpers on ${under}

Written by \`npm run helpers -- --write\`, ${new Date().toISOString().slice(0, 10)}. Each request of [set.json](set.json), a large task in parts, run twice
by ${lead.brain.model} as Jean runs a task in Node: its helpers on ${lead.brain.model}, then on ${under}; ${judge.brain.model}, given both answers
blind in both orders, says which does what was asked better, a tie when its two words disagree. Only pairs where both runs handed
parts to helpers count: ${pairs.length} of ${jobs.length} (helpers in ${same.filter((one) => one.delegated).length} runs on ${lead.brain.model}'s helpers, ${lower.filter((one) => one.delegated).length} on ${under}'s).
"A step under, as good" is the share of pairs ${under}'s helpers won or tied, a tie counting half.

| Language | Pairs | ${lead.brain.model}'s helpers better | ${under}'s helpers better | Tie | A step under, as good |
|---|---:|---:|---:|---:|---:|
${rows.join('\n')}
| **All** | ${pairs.length} | ${pairs.filter((pair) => pair.verdict === 'A').length} | ${pairs.filter((pair) => pair.verdict === 'B').length} | ${pairs.filter((pair) => pair.verdict === 'tie').length} | **${share(pairs)}** |

Tokens written: ${spent(same)} with ${lead.brain.model}'s helpers, ${spent(lower)} with ${under}'s. Pairs judged differently in the two orders, counted
as ties: ${pairs.filter((pair) => !pair.consistent).length}.
`
  console.log(report)
  if (argv.includes('--write')) await writeFile(new URL('results.md', DIR), report)
} finally {
  await lead.close?.()
  await judge.close?.()
}
