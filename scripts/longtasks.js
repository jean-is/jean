// Measures Jean's long-task features with real brains: compaction (D359, D363), plans (D364), steering (D365) and Keep
// going, each against the same brain without it. What is measured is Jean's harness, not the brain. Four parts, each
// after a published method (test/longtasks/):
//   gdpval       GDPval's gold subset (OpenAI): a slice of its tasks Jean's tools can do, with the features on and off,
//                graded pairwise and blind with the task's rubric by a judge brain asked in both orders, and each against
//                the expert's own deliverable; a few tasks translated into French, Arabic and Japanese
//   steering     τ-bench's method (Sierra): a person played by a brain changes their mind while Jean works and answers its
//                approvals; sent while it works (D365) or once it answered, scored pass^k over k runs of each task
//   checkpoints  TheAgentCompany's (CMU): tasks with checkpoints, whole, cut short and resumed with Keep going, or carried
//                on by their plan; partial credit, and what was done again after the stop
//   diagnosis    what each summary kept (the request, the [n] sources, the notes, the language), plans' place and end,
//                one-step requests that should have none; English, French, Arabic and Japanese
// The brains come from the environment as for npm run offers: BRAIN, <provider>:<model> as jean-cli's --brain
// (cli/brain.js), its key in <PROVIDER>_API_KEY, BRAIN_ADDRESS for a server of your own, BRAIN_BODY, JSON added to each
// request; JUDGE and PERSON the same way for the judge and the simulated person (JUDGE_ADDRESS, PERSON_BODY…), each the
// one before by default. GDPval is fetched into test/longtasks/.cache/ at run time, never committed.
// Usage: BRAIN=openrouter:openai/gpt-5-mini OPENROUTER_API_KEY=… npm run longtasks
//        npm run longtasks -- --parts gdpval,steering    some parts (default: all four)
//        npm run longtasks -- --tasks 20 --translated 3  GDPval tasks, and how many of them also in fr, ar and ja
//        npm run longtasks -- --lang en,fr --k 3         the scenarios' languages, and runs of each for pass^k
//        npm run longtasks -- --scenarios prices         some of the scenarios (test/longtasks/scenarios.js)
//        npm run longtasks -- --cut 4 --most 60          where a task is cut short, and the brain steps any run stops at
//        npm run longtasks -- --window 32000             the brain's window GDPval's runs are given, in tokens (D359)
//        npm run longtasks -- --parallel 4               tasks at a time
//        npm run longtasks -- --write                    also write this brain's section of test/longtasks/results.md
//        npm run longtasks -- --hand 6                   lay out that many GDPval pairs in .cache/hand/ to grade by hand
//        npm run longtasks -- --agreement                how often the judge agrees with the grades written there
// Runs are kept in .cache/ by brain: a run that stops goes on where it was when started again.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chooseBrain } from '../cli/brain.js'
import { runTask, textOf, willing } from '../test/longtasks/jean.js'
import { simulated } from '../test/longtasks/people.js'
import { SCENARIOS } from '../test/longtasks/scenarios.js'
import { filesOf, judged, rows, rubricOf, slice, translated } from '../test/longtasks/gdpval.js'
import { mean, partial, passHat, planOf, redone, summariesOf, winRate } from '../test/longtasks/score.js'

/** @import { Brain, Features, Outcome } from '../test/longtasks/jean.js' */
/** @import { Lang, Scenario } from '../test/longtasks/scenarios.js' */
/** @import { Row } from '../test/longtasks/gdpval.js' */

const DIR = fileURLToPath(new URL('../test/longtasks/', import.meta.url))
const CACHE = `${DIR}.cache/`
/** Jean's features all on, the person pressing Keep going up to three times; and all off. @type {Features} */
const ON = { plan: true, compact: true, keep: 3 }
/** @type {Features} */
const OFF = { plan: false, compact: false, keep: 0 }
/** What a provider's failure says, as against Jean's own outcomes (a request past the window is one). */
const PROVIDER = /Copilot stopped|overloaded|rate limit|too many requests|fetch failed|network|ECONN|socket|timed? ?out|HTTP 5\d\d|server error/i
/** The diagnosis's long runs: a brain of a small window, for summaries to come (D359), with room for Jean's prompt and tools. */
const PROBE_WINDOW = 16000

/**
 * What a run left, kept as JSON: enough for every table without the conversation, which stays in .cache/.jean/.
 * @typedef {{ key: string, part: string, task: string, lang: string, condition: string, path: string, error?: string, blocks: { after: number, stopped: boolean, plan: boolean, made: string[] }[], spent: Outcome['spent'],
 *   made: { name: string, text: string }[], answer: string, plan: ReturnType<typeof planOf>, summaries: ReturnType<typeof summariesOf>,
 *   checks?: { name: string, pass: boolean }[], stopMade?: { name: string, text: string }[], redone?: ReturnType<typeof redone>, person?: { asked: number, approvals: number, declined: number }, capped?: boolean }} Kept
 */

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
async function main(argv, env) {
  const flag = (/** @type {string} */ name, /** @type {string} */ fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback)
  const brain = await brainOf(env, 'BRAIN')
  const judge = env.JUDGE ? await brainOf(env, 'JUDGE') : brain
  const person = env.PERSON ? await brainOf(env, 'PERSON') : judge
  const named = `${brain.brain.model} (${brain.brain.provider}${env.BRAIN_BODY ? `, ${env.BRAIN_BODY}` : ''})`
  const results = `${CACHE}results/${slug(named)}/`
  const only = flag('--scenarios', '').split(',').filter(Boolean)
  const options = {
    parts: flag('--parts', 'gdpval,steering,checkpoints,diagnosis').split(','),
    tasks: Number(flag('--tasks', '20')), translated: Number(flag('--translated', '3')), langs: /** @type {Lang[]} */ (flag('--lang', 'en,fr,ar,ja').split(',')),
    k: Number(flag('--k', '3')), window: Number(flag('--window', '32000')), cut: Number(flag('--cut', '4')), parallel: Number(flag('--parallel', '4')),
    most: Number(flag('--most', '60')), scenarios: SCENARIOS.filter((scenario) => !only.length || only.includes(scenario.id)),
  }
  try {
    if (argv.includes('--agreement')) return console.log(await agreement(results))
    console.log(`longtasks: ${named}; judge ${judge.brain.model}; person ${person.brain.model}; ${options.parts.join(', ')}`)
    /** @type {(() => Promise<void>)[]} */
    const jobs = []
    /** @type {Row[]} */
    let gdpvalRows = []
    if (options.parts.includes('gdpval')) gdpvalRows = await gdpvalJobs(jobs, results, brain, judge, options)
    if (options.parts.includes('steering')) steeringJobs(jobs, results, brain, person, options)
    if (options.parts.includes('checkpoints')) checkpointJobs(jobs, results, brain, options)
    if (options.parts.includes('diagnosis')) diagnosisJobs(jobs, results, brain, options)
    await pool(jobs, options.parallel)
    // Graded once both runs of a task are there.
    if (gdpvalRows.length) await pool(await judgeJobs(results, judge, gdpvalRows, options), options.parallel)
    const hand = Number(flag('--hand', '0'))
    if (hand) console.log(await handSample(results, gdpvalRows, hand))
    const section = await report(named, { judge: judge.brain.model, person: person === brain ? '' : person.brain.model }, results, options)
    console.log(`\n${section}`)
    if (argv.includes('--write')) await write(named, section)
  } finally {
    for (const one of new Set([brain, judge, person])) await one.close?.()
  }
}

/** A brain named in the environment, as offers' are. @param {Record<string, string | undefined>} env @param {string} name @returns {Promise<Brain>} */
async function brainOf(env, name) {
  if (!env[name]) throw new Error(`name a brain: ${name}=<provider>:<model> (cli/brain.js), its key in <PROVIDER>_API_KEY`)
  const found = await chooseBrain({ named: env[name], address: env[`${name}_ADDRESS`], env })
  if (!found) throw new Error(`no brain "${env[name]}"`)
  if ('needs' in found) throw new Error(`name ${found.needs}'s model: ${name}=${found.needs}:<model>`)
  const body = env[`${name}_BODY`]
  return { ...found, ...(body && { body: JSON.parse(body) }) }
}

/** @param {string} text */
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)

/** Runs `jobs`, `parallel` at a time. @param {(() => Promise<void>)[]} jobs @param {number} parallel */
async function pool(jobs, parallel) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
    while (next < jobs.length) await jobs[next++]()
  }))
}

/**
 * A run, unless it was kept before: the task run, what it made read as text, what was left kept.
 * @param {string} results @param {Omit<Kept, 'path' | 'blocks' | 'spent' | 'made' | 'answer' | 'plan' | 'summaries' | 'error'>} what
 * @param {(dir: string) => Promise<Outcome>} run @param {(outcome: Outcome, kept: Kept) => Promise<Partial<Kept>> | Partial<Kept>} [more]
 */
function once(results, what, run, more) {
  return async () => {
    const file = `${results}${what.part}/${what.key}.json`
    if (existsSync(file)) return
    const dir = `${CACHE}runs/${slug(what.key)}`
    const started = Date.now()
    const outcome = await run(dir)
    // The brain's provider failing isn't Jean's doing: nothing is kept, and the next start runs it again.
    if (outcome.error && PROVIDER.test(outcome.error)) return void console.log(`${what.part} ${what.key}: the brain failed, to run again: ${outcome.error.slice(0, 100)}`)
    const made = await Promise.all(outcome.made.map(async (file) => ({ name: file.name, text: await textOf(file) })))
    // The deliverables as files too, to open in Word or Excel when grading by hand.
    for (const file of outcome.made) {
      await mkdir(`${results}${what.part}/made/${what.key}/`, { recursive: true })
      await writeFile(`${results}${what.part}/made/${what.key}/${file.name.replace(/[/\\]/g, '_')}`, file.bytes)
    }
    const answer = outcome.records.filter(({ update }) => update?.sessionUpdate === 'agent_message_chunk').map(({ update }) => /** @type {any} */ (update).content.text).join('\n')
    /** @type {Kept} */
    const kept = { ...what, path: outcome.path, blocks: outcome.blocks.map(({ made, ...block }) => ({ ...block, made: made.map((file) => file.name) })), spent: outcome.spent, made, answer, plan: planOf(outcome.records), summaries: summariesOf(outcome.records, what.lang), ...(outcome.capped && { capped: true }), ...(outcome.error && { error: outcome.error }) }
    Object.assign(kept, await more?.(outcome, kept))
    await mkdir(`${results}${what.part}/`, { recursive: true })
    await writeFile(file, JSON.stringify(kept))
    const score = kept.checks ? ` ${kept.checks.filter((c) => c.pass).length}/${kept.checks.length}` : ''
    console.log(`${what.part} ${what.key}: ${kept.plan.steps} steps in ${kept.blocks.length} block(s)${kept.capped ? ', capped' : ''}, ${made.length} file(s)${score}${kept.error ? `, failed: ${kept.error.slice(0, 100)}` : ''} (${Math.round((Date.now() - started) / 1000)} s)`)
  }
}

/** Every run of a part, as kept. @param {string} results @param {string} part @returns {Promise<Kept[]>} */
async function kept(results, part) {
  const dir = `${results}${part}/`
  if (!existsSync(dir)) return []
  return Promise.all((await readdir(dir)).filter((name) => name.endsWith('.json')).map(async (name) => JSON.parse(await readFile(`${dir}${name}`, 'utf8'))))
}

// ─── GDPval ──────────────────────────────────────────────────────────────────

/**
 * The slice's runs, on and off, in English, and the first few translated.
 * @param {(() => Promise<void>)[]} jobs @param {string} results @param {Brain} brain @param {Brain} judge @param {{ tasks: number, translated: number, window: number, most: number }} options
 */
async function gdpvalJobs(jobs, results, brain, judge, { tasks, translated: count, window, most }) {
  const chosen = slice(await rows(CACHE), tasks)
  for (const [i, row] of chosen.entries()) {
    for (const lang of ['en', ...(i < count ? ['fr', 'ar', 'ja'] : [])]) {
      for (const [condition, features] of Object.entries({ on: ON, off: OFF })) {
        jobs.push(once(results, { key: `${row.task_id.slice(0, 8)}-${lang}-${condition}`, part: 'gdpval', task: row.task_id, lang, condition }, async (dir) => {
          const request = lang === 'en' ? row.prompt : await translated(CACHE, judge, row, lang)
          const files = await filesOf(CACHE, row.reference_files, row.reference_file_urls)
          return runTask(brain, { lang, request, files, where: 'files', features, window, most, user: willing }, dir)
        }))
      }
    }
  }
  return chosen
}

/**
 * The judge's verdicts on each task and language whose two runs are there: on against off, and each against the expert.
 * @param {string} results @param {Brain} judge @param {Row[]} chosen @param {{ translated: number }} options
 */
async function judgeJobs(results, judge, chosen, { translated: count }) {
  const runs = await kept(results, 'gdpval')
  /** @type {(() => Promise<void>)[]} */
  const jobs = []
  for (const [i, row] of chosen.entries()) {
    for (const lang of ['en', ...(i < count ? ['fr', 'ar', 'ja'] : [])]) {
      const [on, off] = ['on', 'off'].map((condition) => runs.find((run) => run.task === row.task_id && run.lang === lang && run.condition === condition))
      const file = `${results}judged/${row.task_id.slice(0, 8)}-${lang}.json`
      if (!on || !off || existsSync(file)) continue
      jobs.push(async () => {
        const expert = await Promise.all((await filesOf(CACHE, row.deliverable_files, row.deliverable_file_urls)).map(async (file) => ({ name: file.name, text: await textOf(file) })))
        // The rubric judges the request as written; a translated one is judged on its English words, as its rubric is.
        const task = { request: row.prompt, references: row.reference_files.map((path) => decodeURIComponent(path.split('/').pop() ?? '')), rubric: rubricOf(row) }
        const verdicts = { onOff: await judged(judge, task, on.made, off.made), onExpert: await judged(judge, task, on.made, expert), offExpert: await judged(judge, task, off.made, expert) }
        await mkdir(`${results}judged/`, { recursive: true })
        await writeFile(file, JSON.stringify({ task: row.task_id, lang, occupation: row.occupation, ...verdicts }))
        console.log(`judged ${row.task_id.slice(0, 8)} ${lang}: on vs off ${verdicts.onOff.verdict}${verdicts.onOff.consistent ? '' : ' (changed with the order)'}, rubric ${pct(verdicts.onOff.a)} vs ${pct(verdicts.onOff.b)}`)
      })
    }
  }
  return jobs
}

// ─── Steering and approvals (τ-bench) ────────────────────────────────────────

/**
 * Each scenario with a change of mind, in each language, k times sent while Jean works and k times once it answered,
 * Jean's features on, the person asked before each file is made (Ask me first) as a folder's changes always are.
 * @param {(() => Promise<void>)[]} jobs @param {string} results @param {Brain} brain @param {Brain} person @param {{ langs: Lang[], k: number, most: number, scenarios: Scenario[] }} options
 */
function steeringJobs(jobs, results, brain, person, { langs, k, most, scenarios }) {
  for (const scenario of scenarios.filter((one) => one.change)) {
    for (const lang of langs) {
      for (const condition of ['steer', 'wait']) {
        for (let n = 1; n <= k; n++) {
          jobs.push(once(results, { key: `${scenario.id}-${lang}-${condition}-${n}`, part: 'steering', task: scenario.id, lang, condition }, async (dir) => {
            const who = simulated(person, { lang, request: scenario.request[lang], goal: scenario.goal, changed: scenario.changed, change: scenario.change?.[lang], steer: condition === 'steer' })
            const outcome = await runTask(brain, { lang, request: scenario.request[lang], files: await scenario.files(lang), where: scenario.where, features: ON, window: 0, most, rules: { edit: 'ask' }, user: who }, dir)
            return Object.assign(outcome, { person: who.said })
          }, async (outcome, run) => ({ checks: scenario.check(run.made, run.answer, /** @type {Lang} */ (lang), true), person: /** @type {any} */ (outcome).person })))
        }
      }
    }
  }
}

// ─── Checkpoints (TheAgentCompany) ───────────────────────────────────────────

/**
 * Each long scenario in each language: whole, in one block of steps that never stops it; cut short after `cut` steps and
 * resumed with Keep going; and cut the same with a plan, which carries a task on by itself while it moves (D364).
 * @param {(() => Promise<void>)[]} jobs @param {string} results @param {Brain} brain @param {{ langs: Lang[], cut: number, most: number, scenarios: Scenario[] }} options
 */
function checkpointJobs(jobs, results, brain, { langs, cut, most, scenarios }) {
  /** @type {Record<string, { features: Features, steps: number }>} */
  const conditions = { whole: { features: OFF, steps: most }, cut: { features: { ...OFF, keep: 3 }, steps: cut }, plan: { features: { plan: true, compact: false, keep: 3 }, steps: cut } }
  for (const scenario of scenarios.filter((one) => one.long)) {
    for (const lang of langs) {
      for (const [condition, { features, steps }] of Object.entries(conditions)) {
        jobs.push(once(results, { key: `${scenario.id}-${lang}-${condition}`, part: 'checkpoints', task: scenario.id, lang, condition },
          async (dir) => runTask(brain, { lang, request: scenario.request[lang], files: await scenario.files(lang), where: scenario.where, features, window: 0, steps, most, user: willing }, dir),
          async (outcome, run) => {
            const at = outcome.blocks[0]
            const stopped = outcome.blocks.length > 1 && at?.made
            return {
              checks: scenario.check(run.made, run.answer, /** @type {Lang} */ (lang), false),
              ...(stopped && { stopMade: await Promise.all(at.made.map(async (file) => ({ name: file.name, text: await textOf(file) }))), redone: redone(outcome.records, steps - 1) }),
            }
          }))
      }
    }
  }
}

// ─── Diagnosis ───────────────────────────────────────────────────────────────

/**
 * The long scenarios with a brain of a small window, for their summaries in each language, and the one-step requests, for
 * plans that shouldn't come; the rest is read from every part's runs.
 * @param {(() => Promise<void>)[]} jobs @param {string} results @param {Brain} brain @param {{ langs: Lang[], most: number, scenarios: Scenario[] }} options
 */
function diagnosisJobs(jobs, results, brain, { langs, most, scenarios }) {
  for (const scenario of scenarios) {
    for (const lang of langs) {
      const window = scenario.long ? PROBE_WINDOW : 0
      jobs.push(once(results, { key: `${scenario.id}-${lang}`, part: 'diagnosis', task: scenario.id, lang, condition: scenario.long ? 'small window' : 'one step' },
        async (dir) => runTask(brain, { lang, request: scenario.request[lang], files: await scenario.files(lang), where: scenario.where, features: ON, window, most, user: willing }, dir),
        (_outcome, run) => ({ checks: scenario.check(run.made, run.answer, /** @type {Lang} */ (lang), false) })))
    }
  }
}

// ─── Grading by hand ─────────────────────────────────────────────────────────

/**
 * Pairs of GDPval deliverables laid out for the owner, blind: each folder has the request and rubric, A and B, and
 * grades.csv is filled in with A, B or tie; which was which stays in key.json.
 * @param {string} results @param {Row[]} chosen @param {number} count
 */
async function handSample(results, chosen, count) {
  const runs = await kept(results, 'gdpval')
  const dir = `${CACHE}hand/`
  /** @type {Record<string, { A: string, B: string, task: string }>} */
  const key = {}
  const lines = ['pair,better (A, B or tie),notes']
  for (const row of chosen) {
    if (Object.keys(key).length >= count) break
    const [on, off] = ['on', 'off'].map((condition) => runs.find((run) => run.task === row.task_id && run.lang === 'en' && run.condition === condition))
    if (!on || !off || (!on.made.length && !off.made.length)) continue
    const pair = String(Object.keys(key).length + 1)
    // Which side is on, by the task's id, so that it isn't always the same.
    const swap = parseInt(row.task_id.slice(0, 2), 16) % 2 === 1
    const [a, b] = swap ? [off, on] : [on, off]
    key[pair] = { A: a.condition, B: b.condition, task: row.task_id }
    await mkdir(`${dir}${pair}/`, { recursive: true })
    await writeFile(`${dir}${pair}/request.md`, `# ${row.occupation}\n\n${row.prompt}\n\n## Reference files\n\n${row.reference_files.map((path) => `- ${decodeURIComponent(path.split('/').pop() ?? '')}`).join('\n') || 'none'}\n\n## Rubric\n\n${row.rubric_pretty}\n`)
    for (const [side, run] of /** @type {[string, Kept][]} */ ([['A', a], ['B', b]])) {
      await mkdir(`${dir}${pair}/${side}/`, { recursive: true })
      for (const file of run.made) await writeFile(`${dir}${pair}/${side}/${file.name.replace(/[/\\]/g, '_')}`, await readFile(`${results}gdpval/made/${run.key}/${file.name.replace(/[/\\]/g, '_')}`))
    }
    lines.push(`${pair},,`)
  }
  await writeFile(`${dir}key.json`, JSON.stringify(key, null, 2))
  if (!existsSync(`${dir}grades.csv`)) await writeFile(`${dir}grades.csv`, `${lines.join('\n')}\n`)
  return `${Object.keys(key).length} pairs to grade by hand in ${dir}: fill in grades.csv, then npm run longtasks -- --agreement`
}

/** How often the judge's verdict on on against off is the owner's. @param {string} results */
async function agreement(results) {
  const dir = `${CACHE}hand/`
  if (!existsSync(`${dir}grades.csv`)) return 'No grades yet: npm run longtasks -- --hand 6 lays the pairs out.'
  const key = JSON.parse(await readFile(`${dir}key.json`, 'utf8'))
  const rows = (await readFile(`${dir}grades.csv`, 'utf8')).trim().split('\n').slice(1).map((line) => line.split(','))
  const pairs = []
  for (const [pair, grade] of rows) {
    const given = grade?.trim().toUpperCase()
    if (!key[pair] || !['A', 'B', 'TIE'].includes(given)) continue
    const judgedFile = `${results}judged/${key[pair].task.slice(0, 8)}-en.json`
    if (!existsSync(judgedFile)) continue
    const { onOff } = JSON.parse(await readFile(judgedFile, 'utf8'))
    const owner = given === 'TIE' ? 'tie' : key[pair][given] === 'on' ? 'A' : 'B'
    pairs.push(owner === onOff.verdict)
  }
  return pairs.length ? `The judge agrees with the grades on ${pairs.filter(Boolean).length} of ${pairs.length} pairs (${pct(mean(pairs.map(Number)))}); GDPval's own grader agreed with experts 66% of the time, experts with each other 71%.` : 'No pair graded yet.'
}

// ─── The report ──────────────────────────────────────────────────────────────

/**
 * A run's checkpoints, read again from what it left, so that a checker mended since counts for runs kept before.
 * @param {Kept} run @param {'made' | 'stopMade'} [which] the files at its end, or at its first stop
 */
function checksOf(run, which = 'made') {
  const scenario = SCENARIOS.find((one) => one.id === run.task)
  const made = run[which]
  return scenario && made ? scenario.check(made, which === 'made' ? run.answer : '', /** @type {Lang} */ (run.lang), run.part === 'steering') : undefined
}

/** @param {number} value */
const pct = (value) => (Number.isNaN(value) ? '—' : `${Math.round(value * 100)}%`)
/** @param {number} value @param {number} [digits] */
const num = (value, digits = 1) => (Number.isNaN(value) ? '—' : value.toFixed(digits))
/** @param {string[]} head @param {(string | number)[][]} rows */
const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map((_, i) => (i ? '---:' : '---')).join('|')}|\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}`

/**
 * This brain's section: each part's table, then what got worse with a feature on.
 * @param {string} named @param {{ judge: string, person: string }} others the judge's name, and the person's when not the brain's own
 * @param {string} results @param {{ k: number, window: number, cut: number }} options
 */
async function report(named, { judge: judgeName, person }, results, { k, window, cut }) {
  /** @type {string[]} */
  const parts = []
  /** @type {string[]} */
  const worse = []
  const runsLine = (/** @type {Kept[]} */ list) => [num(mean(list.map((run) => run.plan.steps))), num(mean(list.map((run) => run.blocks.length))), num(mean(list.map((run) => run.spent.requests))),
    list.some((run) => run.spent.inputTokens) ? `${num(mean(list.map((run) => run.spent.inputTokens)) / 1000, 0)}k` : '—', `${list.filter((run) => run.capped).length} / ${list.filter((run) => run.error).length}`]

  const gdpval = await kept(results, 'gdpval')
  if (gdpval.length) {
    const judgedDir = `${results}judged/`
    const verdicts = existsSync(judgedDir) ? await Promise.all((await readdir(judgedDir)).map(async (name) => JSON.parse(await readFile(`${judgedDir}${name}`, 'utf8')))) : []
    const groups = { English: verdicts.filter((v) => v.lang === 'en'), Translated: verdicts.filter((v) => v.lang !== 'en') }
    const rows = Object.entries(groups).filter(([, list]) => list.length).map(([name, list]) => {
      const onOff = list.map((v) => v.onOff)
      return [name, list.length, `${onOff.filter((v) => v.verdict === 'A').length} / ${onOff.filter((v) => v.verdict === 'tie').length} / ${onOff.filter((v) => v.verdict === 'B').length}`,
        pct(winRate(onOff.map((v) => v.verdict), 'A')), `${pct(mean(onOff.map((v) => v.a).filter((n) => !Number.isNaN(n))))} / ${pct(mean(onOff.map((v) => v.b).filter((n) => !Number.isNaN(n))))}`,
        `${pct(mean(list.map((v) => (v.onExpert.verdict !== 'B' ? 1 : 0))))} / ${pct(mean(list.map((v) => (v.offExpert.verdict !== 'B' ? 1 : 0))))}`,
        pct(mean(list.flatMap((v) => [v.onOff, v.onExpert, v.offExpert]).map((v) => (v.consistent ? 1 : 0))))]
    })
    const english = groups.English.map((v) => v.onOff)
    if (english.length && winRate(english.map((v) => v.verdict), 'A') < 0.5) worse.push(`GDPval: the judge preferred the runs with the features off (on's win rate ${pct(winRate(english.map((v) => v.verdict), 'A'))}).`)
    const byCondition = ['on', 'off'].map((condition) => gdpval.filter((run) => run.condition === condition))
    parts.push(`### GDPval, ${new Set(gdpval.map((run) => run.task)).size} tasks of its gold subset

Each task once with Jean's features on (plan, compaction, Keep going up to three times) and once off, as a brain of a ${window.toLocaleString('en')}-token window, the reference files shared with the request; graded by ${judgeName}, blind, twice with the deliverables swapped, with the task's rubric. A verdict that changed with the order counts as a tie. "Wins or ties against the expert" is GDPval's own measure, against the deliverable the occupation's expert made.

${table(['Requests', 'Tasks judged', 'On better / tie / off better', 'On\'s win rate (ties half)', 'Rubric met, on / off', 'Wins or ties against the expert, on / off', 'Verdicts that held both ways'], rows)}

${table(['Runs', 'Brain steps', 'Blocks', 'Requests', 'Tokens read', 'Stopped at the cap / failed'], byCondition.map((list, i) => [i ? 'Off' : 'On', ...runsLine(list)]))}

${table(['Task', 'Occupation', 'Language', 'Files made, on / off', 'Verdict', 'Rubric, on / off'], verdicts.toSorted((a, b) => (a.task + a.lang < b.task + b.lang ? -1 : 1)).map((v) => {
      const made = ['on', 'off'].map((condition) => gdpval.find((run) => run.task === v.task && run.lang === v.lang && run.condition === condition)?.made.length ?? 0)
      return [v.task.slice(0, 8), v.occupation, v.lang, made.join(' / '), v.onOff.verdict === 'A' ? 'on' : v.onOff.verdict === 'B' ? 'off' : 'tie', `${pct(v.onOff.a)} / ${pct(v.onOff.b)}`]
    }))}`)
  }

  const steering = await kept(results, 'steering')
  if (steering.length) {
    const success = (/** @type {Kept} */ run) => Boolean(checksOf(run)?.length && checksOf(run).every((check) => check.pass))
    const grouped = (/** @type {Kept[]} */ list) => Object.values(Object.groupBy(list, (run) => `${run.task} ${run.lang}`)).map((runs) => ({ n: runs?.length ?? 0, c: runs?.filter(success).length ?? 0 }))
    const rows = ['steer', 'wait'].map((condition) => {
      const list = steering.filter((run) => run.condition === condition)
      return [condition === 'steer' ? 'Sent while it works (D365)' : 'Sent once it answered', ...Array.from({ length: k }, (_, i) => pct(passHat(grouped(list), i + 1))),
        pct(mean(list.map((run) => partial(checksOf(run)?.map((check) => check.pass) ?? [])))), num(mean(list.map((run) => run.plan.steps))),
        `${list.reduce((n, run) => n + (run.person?.approvals ?? 0), 0)} / ${list.reduce((n, run) => n + (run.person?.declined ?? 0), 0)}`, list.filter((run) => run.error).length]
    })
    const langs = [...new Set(steering.map((run) => run.lang))]
    const byLang = langs.map((lang) => [lang, ...['steer', 'wait'].map((condition) => pct(passHat(grouped(steering.filter((run) => run.lang === lang && run.condition === condition)), 1)))])
    const [steer, wait] = ['steer', 'wait'].map((condition) => passHat(grouped(steering.filter((run) => run.condition === condition)), k))
    if (steer < wait) worse.push(`Steering: pass^${k} was lower when the change of mind was read while Jean worked (${pct(steer)}) than when it was sent once it answered (${pct(wait)}).`)
    parts.push(`### Steering and approvals, τ-bench's way

A person played by ${person ? `a second brain, ${person},` : 'the same brain'} asks for a task, then changes their mind after two steps; they answer Jean's questions and approvals (each file made or changed is asked first) from what they want at that point. Success is every checkpoint of the changed request met at the end. pass^k is the chance that k runs in a row all succeed (${k} ${k === 1 ? 'run' : 'runs'} of each scenario and language).

${table(['The change of mind', ...Array.from({ length: k }, (_, i) => `pass^${i + 1}`), 'Checkpoints (partial credit)', 'Brain steps', 'Approvals asked / declined', 'Failed'], rows)}

${table(['Language', 'pass^1 sent while it works', 'pass^1 sent once it answered'], byLang)}`)
  }

  const checkpoints = await kept(results, 'checkpoints')
  if (checkpoints.length) {
    const score = (/** @type {{ pass: boolean }[] | undefined} */ checks) => partial(checks?.map((check) => check.pass) ?? [])
    const names = { whole: 'Whole, never stopped', cut: `Cut after ${cut} steps, Keep going pressed`, plan: `Cut after ${cut} steps, with a plan` }
    const rows = Object.entries(names).map(([condition, name]) => {
      const list = checkpoints.filter((run) => run.condition === condition)
      const stopped = list.filter((run) => run.stopMade)
      return [name, list.length, pct(mean(list.map((run) => score(checksOf(run))))), pct(mean(list.map((run) => (checksOf(run)?.every((check) => check.pass) ? 1 : 0)))),
        stopped.length ? pct(mean(stopped.map((run) => score(checksOf(run, 'stopMade'))))) : '—', num(mean(list.map((run) => run.plan.steps))), num(mean(list.map((run) => run.blocks.length))),
        num(mean(list.filter((run) => run.blocks.length > 1).map((run) => run.blocks.filter((block) => block.plan).length))),
        stopped.length ? `${list.reduce((n, run) => n + (run.redone?.again ?? 0), 0)} of ${list.reduce((n, run) => n + (run.redone?.after ?? 0), 0)}` : '—']
    })
    const [whole, cutScore, planScore] = ['whole', 'cut', 'plan'].map((condition) => mean(checkpoints.filter((run) => run.condition === condition).map((run) => score(checksOf(run)))))
    if (planScore < cutScore) worse.push(`Checkpoints: with a plan, a task cut short scored less (${pct(planScore)}) than without one (${pct(cutScore)}).`)
    if (cutScore < whole) worse.push(`Checkpoints: cut short and resumed with Keep going, tasks scored ${pct(cutScore)} against ${pct(whole)} whole.`)
    parts.push(`### Long tasks cut short, TheAgentCompany's way

Each long scenario in each language, its checkpoints read from the files Jean left; partial credit is half the share of checkpoints passed, plus half when all are. A cut task stops after ${cut} steps and the person presses Keep going up to three times; with a plan, a confirmed plan that moved carries it on by itself first.

${table(['Run', 'Runs', 'Score', 'All checkpoints', 'Score at the first stop', 'Brain steps', 'Blocks', 'Blocks a plan carried on', 'Calls after the stop that repeat one before it'], rows)}`)
  }

  const all = [...gdpval, ...steering, ...checkpoints, ...await kept(results, 'diagnosis')]
  if (all.length) {
    const summaries = all.flatMap((run) => run.summaries.map((summary) => ({ ...summary, lang: run.lang })))
    const langs = [...new Set(all.map((run) => run.lang))]
    const summaryRows = langs.map((lang) => {
      const list = summaries.filter((summary) => summary.lang === lang)
      const cited = list.filter((summary) => summary.cited)
      return [lang, all.filter((run) => run.lang === lang && run.summaries.length).length, list.length, pct(mean(list.map((summary) => (summary.inLanguage ? 1 : 0)))),
        cited.length ? `${pct(mean(cited.map((summary) => summary.kept / summary.cited)))} (${cited.length})` : '—', pct(mean(list.map((summary) => (summary.request ? 1 : 0)))),
        pct(mean(list.map((summary) => (summary.notes ? 1 : 0))))]
    })
    const withPlan = all.filter((run) => ['on', 'steer', 'wait', 'plan', 'small window', 'one step'].includes(run.condition))
    const long = withPlan.filter((run) => run.condition !== 'one step')
    const short = withPlan.filter((run) => run.condition === 'one step')
    const planned = long.filter((run) => run.plan.plans)
    const ended = planned.filter((run) => !run.blocks.at(-1)?.stopped && !run.error)
    const firsts = planned.map((run) => /** @type {number} */ (run.plan.first)).sort((a, b) => a - b)
    const planRows = langs.map((lang) => {
      const [l, s] = [long, short].map((list) => list.filter((run) => run.lang === lang))
      const p = l.filter((run) => run.plan.plans)
      const e = p.filter((run) => !run.blocks.at(-1)?.stopped && !run.error)
      return [lang, `${pct(mean(l.map((run) => (run.plan.plans ? 1 : 0))))} (${l.length})`, num(mean(p.map((run) => /** @type {number} */ (run.plan.first)))), pct(mean(e.map((run) => (run.plan.settled ? 1 : 0)))), `${pct(mean(s.map((run) => (run.plan.plans ? 1 : 0))))} (${s.length})`]
    })
    if (short.some((run) => run.plan.plans)) worse.push(`Plans: ${short.filter((run) => run.plan.plans).length} of ${short.length} one-step requests got a plan.`)
    const off = summaries.filter((summary) => !summary.inLanguage)
    if (off.length) worse.push(`Compaction: ${off.length} of ${summaries.length} summaries weren't in the conversation's language.`)
    const small = all.filter((run) => run.condition === 'small window')
    parts.push(`### Diagnosis: what summaries keep, where plans come

Summaries from every run that had one, most from the long scenarios run again as a brain of a ${PROBE_WINDOW.toLocaleString('en')}-token window (${small.filter((run) => run.summaries.length).length} of ${small.length} got one; their checkpoints: ${pct(mean(small.map((run) => partial(checksOf(run)?.map((check) => check.pass) ?? []))))}). "Sources given again" counts the [n] cited before a summary that it cites too; the request at work and the notes in force are what Jean adds after the brain's words (D363).

${table(['Language', 'Runs with a summary', 'Summaries', 'In its language', 'Sources given again', 'Request kept word for word', 'Notes in force kept'], summaryRows)}

Plans, wherever Jean's features were on: long tasks should have one, one-step requests none, and a task that ended should have every step settled.

${table(['Language', 'Long tasks with a plan', 'Its first plan at brain step', 'Every step settled when it ended', 'One-step requests with a plan'], planRows)}

Over all languages: ${pct(mean(long.map((run) => (run.plan.plans ? 1 : 0))))} of ${long.length} long tasks had a plan, first shown at step ${firsts.length ? firsts[Math.floor(firsts.length / 2)] : '—'} (median), every step settled in ${pct(mean(ended.map((run) => (run.plan.settled ? 1 : 0))))} of the ${ended.length} that ended; ${short.filter((run) => run.plan.plans).length} of ${short.length} one-step requests had one.`)
  }

  return `## ${named}, ${new Date().toISOString().slice(0, 10)}

${parts.join('\n\n')}

### Where a feature made things worse

${worse.length ? worse.map((line) => `- ${line}`).join('\n') : 'Nowhere in these runs.'}
`
}

/** Writes this brain's section into results.md, in place of its last one. @param {string} named @param {string} section */
async function write(named, section) {
  const before = await readFile(`${DIR}results.md`, 'utf8').catch(() => '')
  const kept = before.split(/^(?=## )/m).slice(1).filter((part) => !part.startsWith(`## ${named}, `))
  await writeFile(`${DIR}results.md`, `# Long tasks: Jean's harness against the same brain without it

Written by \`npm run longtasks -- --write\`, one section per brain, replaced when that brain is measured again. What is
measured is Jean's long-task features (compaction, plans, steering, Keep going) against the same brain without them,
not the brain: every run has Jean's own loop, prompt and tools (core/loop.js, caps/made, caps/ask, caps/plan,
caps/compact, the Folders tools as jean-cli runs them), in Node, with stand-ins for what only a page has. GDPval's
gold subset (openai/gdpval) is fetched at run time and never committed; its card states no licence. Its translated
requests are the judge brain's translations, kept in .cache/ only; their files and rubric stay in English.

How far the judge can be trusted: GDPval's own experimental grader agreed with its experts 66% of the time, the experts
with each other 71% (arXiv 2510.04374). A cheaper judge is likely worse; "verdicts that held both ways" says how often it
kept its verdict with the deliverables swapped, and \`--hand\` lays out pairs for the owner to grade, which
\`--agreement\` compares with it. GDPval-AA (Artificial Analysis) runs brains in its own harness with a shell and web
search for up to 100 turns, graded pairwise into an ELO: its numbers aren't on this page's scale.

${[section, ...kept].map((part) => part.trimEnd()).join('\n\n')}
`)
}

main(process.argv.slice(2), process.env).catch((error) => {
  console.error(`longtasks: ${error.stack ?? error.message}`)
  process.exit(1)
})
