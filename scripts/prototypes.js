// SPDX-License-Identifier: MIT
// Measures Prototypes (D742), first in its phase 0 before it was built: how often a brain makes a clickable prototype of an
// app or a flow, a screen per page, that passes its check and whose flow works, from the briefs of test/prototypes/set.json in
// English, French, Arabic and Japanese, then changes it as asked in the same task. Each brief is a task of Jean's run in Node
// (test/longtasks/jean.js): Jean's prompt and own capabilities, the skill tool listing Jean's own skills, "Make a prototype" among
// them, and Prototypes' tools, `prototype` and `prototype_change`, whose check presses through every page in Chromium as the tab
// does (test/prototypes/check.js). A question the brain asks gets the recommended answer. What it did
// is read from its conversation: whether it read the skill before its first prototype, asked, wrote a page instead, how many
// checks it took until nothing was left to fix, whether its flow works (every screen reached from the first, no control doing
// nothing), and how its change went. Then a judge, given the brief, every screen on a phone side by side and the first on a
// computer, says whether the person would show it to colleagues as a prototype of their idea, and for the brief with a payment
// whether paying is shown as a demo.
// Needs Playwright's Chromium (npx playwright install chromium) and a brain, as `npm run sites`: BRAIN, <provider>:<model> as
// jean-cli's --brain (cli/brain.js), its key in <PROVIDER>_API_KEY, BRAIN_ADDRESS for a server of your own, BRAIN_BODY, JSON added
// to each request, BRAIN_WINDOW, its window in tokens when it is small (a local brain's). The judge is JUDGE, with JUDGE_ADDRESS
// and JUDGE_BODY; without one, nothing is judged.
// Usage: BRAIN=claudecode:sonnet JUDGE=claudecode:sonnet npm run prototypes
//        npm run prototypes -- --lang fr,ja           some languages
//        npm run prototypes -- --only salon,survey    some briefs
//        npm run prototypes -- --parallel 2           briefs at a time (default 3)
//        npm run prototypes -- --write                also write this brain's section of test/prototypes/results.md
//        npm run prototypes -- --judge                judge the kept runs again, as the first request left each one, making nothing
//        npm run prototypes -- --report --write       write this brain's section again from the kept runs, making and judging nothing
// Each run is kept in test/prototypes/.cache/<brain>/<brief>-<lang>/: its prototypes, each call's files, the conversation, the pictures, run.json.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chooseBrain } from '../cli/brain.js'
import { streamChat } from '../app/core/llm.js'
import { runTask, willing } from '../test/longtasks/jean.js'
import { prototypeTools, skillLine, LINES } from '../test/prototypes/tools.js'
import { check, flows, TYPED } from '../test/prototypes/check.js'

/** @import { Chosen } from '../cli/brain.js' */
/** @typedef {Chosen & { name: string, body?: Record<string, unknown>, maxTokens?: number }} Measured the brain, and its name in results.md */
/** @typedef {{ id: string, lang: string, text: string, change: string, pay?: boolean }} Brief */
/**
 * @typedef {{ id: string, lang: string, made: boolean, read: boolean, sheets: string[], asked: number, early: boolean, page: boolean, rounds: number, clean: boolean, cleanAt?: number,
 *   flows: boolean, screens: number, reached: number, pressed: number, dead: number, look: boolean,
 *   changed: boolean, changedClean: boolean, changedFlows: boolean, weight: number, left: string[],
 *   shown?: boolean, why?: string, honest?: boolean, seconds: number, tokens: number, error?: string }} Run
 */

const DIR = fileURLToPath(new URL('../test/prototypes/', import.meta.url))
// An answer's longest: a prototype of six screens is often past 8,192 tokens.
const ANSWER = 32000

/** The records' tool calls that ended, in order, with where each request began. @param {any[]} records */
function readCalls(records) {
  const requests = records.flatMap(({ update, by }, index) => (update?.sessionUpdate === 'user_message_chunk' && update.content?.type === 'text' && by !== 'jean' && !update._meta?.steer ? [index] : []))
  const calls = records.flatMap(({ update }, index) => (update?.sessionUpdate === 'tool_call' && update.name && !update._meta?.parent && ['completed', 'failed'].includes(update.status) ? [{ index, name: String(update.name), status: String(update.status), input: update.rawInput }] : []))
  const said = (/** @type {number} */ from, /** @type {number} */ to) => records.slice(from, to).map(({ update }) => (update?.sessionUpdate === 'agent_message_chunk' ? update.content?.text ?? '' : '')).join('')
  return { calls, second: requests[1] ?? Infinity, said }
}

/**
 * A brief's run, scored from its conversation and the check of each call. @param {Brief} brief @param {any[]} records
 * @param {import('../test/prototypes/tools.js').Call[]} checks @param {{ ms: number, inputTokens: number, outputTokens: number }} spent
 * @returns {{ run: Run, first?: import('../test/prototypes/tools.js').Call, answer: string }}
 */
function scored(brief, records, checks, spent) {
  const { calls, second, said } = readCalls(records)
  const made = calls.filter((call) => call.name === 'prototype' || call.name === 'prototype_change')
  const before = made.filter((call) => call.status === 'completed' && call.index < second).length
  const ours = checks.slice(0, before), theirs = checks.slice(before)
  const cleanAt = ours.findIndex((call) => !call.report.problems.length)
  const first = ours.at(-1), last = theirs.at(-1)
  const firstMade = made[0]?.index ?? Infinity
  const skills = calls.filter((call) => call.name === 'skill')
  const skill = skills.find((call) => /^prototype(\/|$)/.test(String(call.input?.name ?? '')))?.index ?? Infinity
  const asks = calls.filter((call) => call.name === 'ask_user')
  const answer = said(0, Number.isFinite(second) ? second : records.length)
  const flow = first?.report.flow
  return {
    first, answer,
    run: {
      id: brief.id, lang: brief.lang, made: ours.length > 0,
      read: skill < firstMade, sheets: [...new Set(skills.filter((call) => call.index < second && String(call.input?.name ?? '').includes('/')).map((call) => String(call.input.name)))],
      asked: asks.length, early: asks.some((call) => call.index < skill),
      page: !ours.length && (/```html/.test(answer) || calls.some((call) => call.name === 'write' && /\.html?$/i.test(String(call.input?.name ?? call.input?.path ?? '')))),
      rounds: ours.length, clean: !!first && !first.report.problems.length, ...(cleanAt >= 0 && { cleanAt: cleanAt + 1 }),
      flows: !!first && flows(first.report), screens: first?.report.pages.length ?? 0, reached: flow?.reached.length ?? 0, pressed: (flow?.pressed ?? 0) + (flow?.followed ?? 0), dead: flow?.dead.length ?? 0,
      look: ours.some((call) => call.given),
      changed: theirs.length > 0, changedClean: !!last && !last.report.problems.length, changedFlows: !!last && flows(last.report),
      weight: first?.report.weight ?? 0, left: (first?.report.problems ?? []).slice(0, 3),
      seconds: Math.round(spent.ms / 1000), tokens: spent.inputTokens + spent.outputTokens,
    },
  }
}

/**
 * The judge's word on a prototype: whether its person would show it to colleagues as a prototype of their idea, and for the brief
 * with a payment, whether paying is shown as a demo. @param {Measured} judge @param {Brief} brief @param {import('../test/prototypes/check.js').Report} report @param {string} answer
 */
async function judging({ brain, apiKey, body }, brief, report, answer) {
  const shots = /** @type {NonNullable<typeof report.shots>} */ (report.shots)
  const leads = new Map(report.flow?.leads ?? [])
  const outline = report.outline.map((line) => { const screen = line.slice(0, line.indexOf(':')), to = leads.get(screen); return to?.length ? `${line}; leads to ${to.join(', ')}` : line })
  const [name, sentence] = TYPED[brief.lang] ?? TYPED.en
  const content = `Someone asked an assistant for a prototype, in these words: "${brief.text}". Here are its screens on a phone, numbered in the order a person reaches them by pressing through, then its first screen on a computer. Each screen, and where its controls lead:
${outline.join('\n')}

A screen after a form shows what a tester typed into its fields where they gave no sample of their own: the name “${name}”, “${sentence}”, sara@example.com, 0612345678, a date a week ahead. Words a tester typed are no fault of the prototype, even where they differ from its own sample names.${brief.pay ? `\n\nThe assistant answered:\n"""\n${answer.slice(0, 3000)}\n"""` : ''}

Say as one JSON object, and nothing else:
- "shown": true if the person would show this to colleagues as it is, as a prototype of their idea: it fits what was asked, its screens look finished and cared for on both, its words and sample figures make sense together, and nothing on it would embarrass them; false otherwise.
- "why": what decided it, in twelve words at most.${brief.pay ? '\n- "honest": true if paying is shown as a demo: no field asks for a card or bank number, and nothing claims real money was taken; false otherwise.' : ''}`
  /** @type {import('../app/core/types.js').ChatMessage[]} */
  const messages = [{ role: 'user', content, documents: [{ name: 'phone.png', text: '', images: [{ mimeType: 'image/png', data: shots.sheet.toString('base64') }] }, { name: 'computer.png', text: '', images: [{ mimeType: 'image/png', data: shots.wide.toString('base64') }] }] }]
  /** @type {typeof fetch} */
  const fetch = (url, init) => globalThis.fetch(url, body && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...body }) } : init)
  let text = ''
  for await (const event of streamChat({ brain, apiKey, messages, maxTokens: 2048, fetch })) if (event.type === 'text') text += event.delta
  try {
    const said = JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? '')
    return { shown: !!said.shown, why: String(said.why ?? ''), ...(brief.pay && { honest: !!said.honest }) }
  } catch {
    return { error: `the judge wrote no JSON: ${text.slice(0, 200)}` }
  }
}

/** The conversation as the brain had it, to read again. @param {any[]} records */
const transcript = (records) => records.map(({ update, by }) => {
  if (update?.sessionUpdate === 'user_message_chunk' && by !== 'jean') return update.content?.type === 'text' ? `\n\n## Person\n\n${update.content.text}\n\n` : `\n(shared: ${update.content?.name ?? update.content?.uri ?? 'a file'})`
  if (update?.sessionUpdate === 'agent_message_chunk') return update.content?.text ?? ''
  if (update?.sessionUpdate === 'tool_call' && update.name && ['completed', 'failed'].includes(update.status)) {
    const input = { ...update.rawInput, ...(Array.isArray(update.rawInput?.files) && { files: update.rawInput.files.map((/** @type {any} */ file) => file.from ? file : { path: file.path, text: `(${String(file.text ?? '').length} characters)` }) }) }
    const output = Array.isArray(update.content) ? update.content.map((/** @type {any} */ part) => part.content?.text ?? part.text ?? '').join('') : String(update.rawOutput?.text ?? update.rawOutput ?? '')
    return `\n\n### ${update.name} (${update.status})\n\n\`\`\`json\n${JSON.stringify(input, null, 1).slice(0, 4000)}\n\`\`\`\n\n${output.slice(0, 4000)}\n\n`
  }
  return ''
}).join('')

/** A kept prototype's files, by their path in it. @param {string} folder @returns {Promise<Map<string, Uint8Array>>} */
async function filesIn(folder) {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true })
  const files = new Map()
  for (const entry of entries) if (entry.isFile()) files.set(relative(folder, join(entry.parentPath, entry.name)), new Uint8Array(await readFile(join(entry.parentPath, entry.name))))
  return files
}

/** Runs the work on the items, `parallel` at a time. @template T @param {T[]} items @param {number} parallel @param {(item: T) => Promise<void>} work */
async function pool(items, parallel, work) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, async () => {
    while (next < items.length) await work(items[next++])
  }))
}

/** @param {string} named @param {string | undefined} address @param {string | undefined} extra @param {Record<string, string | undefined>} env @returns {Promise<Measured>} */
async function brainNamed(named, address, extra, env) {
  const found = await chooseBrain({ named, address, env })
  if (!found) throw new Error(`no brain "${named}"`)
  if ('needs' in found) throw new Error(`name ${found.needs}'s model: ${found.needs}:<model>`)
  return { ...found, body: extra ? JSON.parse(extra) : undefined, maxTokens: ANSWER, name: `${found.brain.model} (${[found.brain.provider, extra].filter(Boolean).join(', ')})` }
}

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
async function main(argv, env) {
  const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  if (!env.BRAIN) throw new Error('name a brain: BRAIN=<provider>:<model> (cli/brain.js), its key in <PROVIDER>_API_KEY')
  const measured = await brainNamed(env.BRAIN, env.BRAIN_ADDRESS, env.BRAIN_BODY, env)
  const judge = env.JUDGE ? await brainNamed(env.JUDGE, env.JUDGE_ADDRESS, env.JUDGE_BODY, env) : undefined
  const langs = flag('--lang')?.split(','), only = flag('--only')?.split(','), parallel = Number(flag('--parallel') ?? 3), window = Number(env.BRAIN_WINDOW ?? 0)
  /** @type {{ briefs: Record<string, Record<string, any>> }} */
  const set = JSON.parse(await readFile(`${DIR}set.json`, 'utf8'))
  /** @type {Brief[]} */
  const briefs = Object.entries(set.briefs).filter(([id]) => !only || only.includes(id)).flatMap(([id, brief]) => Object.entries(brief)
    .filter(([lang, text]) => typeof text === 'string' && (!langs || langs.includes(lang)))
    .map(([lang, text]) => ({ id, lang, text: String(text), change: brief.change[lang], ...(brief.pay && { pay: true }) })))
  const slug = measured.name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '')
  console.log(`prototypes: ${measured.name}${judge ? `, judged by ${judge.name}` : ', no judge'}; ${briefs.length} briefs`)

  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  /** @type {Run[]} */
  const runs = []
  try {
    if (argv.includes('--judge')) await pool(briefs, parallel, async (brief) => {
      if (!judge) throw new Error('name a judge: JUDGE=<provider>:<model>')
      const out = `${DIR}.cache/${slug}/${brief.id}-${brief.lang}/`
      /** @type {Run | null} */
      const run = JSON.parse(await readFile(`${out}run.json`, 'utf8').catch(() => 'null'))
      if (!run?.made) return void (run && runs.push(run))
      const report = await check(await filesIn(`${out}calls/${run.rounds}/`), browser)
      const answer = await readFile(`${out}answer.txt`, 'utf8').catch(() => '')
      /** @type {any} */
      const said = report.shots ? await judging(judge, brief, report, answer).catch((error) => ({ error: `the judge failed: ${error.message ?? error}` })) : { error: 'no picture of its screens' }
      delete run.error
      Object.assign(run, said.error ? { error: said.error } : { shown: said.shown, why: said.why, ...(said.honest !== undefined && { honest: said.honest }) })
      if (report.shots) { await writeFile(`${out}computer.png`, report.shots.wide); await writeFile(`${out}phone.png`, report.shots.sheet) }
      await writeFile(`${out}run.json`, JSON.stringify(run, null, 1))
      runs.push(run)
      console.log(`  ${brief.id} ${brief.lang}: ${cell(run)}${run.why && !run.shown ? ` (${run.why})` : ''}`)
    })
    else if (!argv.includes('--report')) await pool(briefs, parallel, async (brief) => {
      const out = `${DIR}.cache/${slug}/${brief.id}-${brief.lang}/`
      await rm(out, { recursive: true, force: true })
      await mkdir(out, { recursive: true })
      /** @type {import('../test/prototypes/tools.js').Call[]} */
      const checks = []
      /** @type {Run} */
      let run
      try {
        const tools = prototypeTools({ dir: out, browser, shared: new Map(), calls: checks })
        const outcome = await runTask(measured, {
          lang: brief.lang, request: brief.text, files: [], where: 'files', window,
          features: { plan: false, compact: true, keep: 1 },
          user: { ...willing, then: brief.change },
          own: { tools, lines: [...LINES, await skillLine()] },
        }, `${DIR}.cache/${slug}/tasks/${brief.id}-${brief.lang}`)
        const { run: found, first, answer } = scored(brief, outcome.records, checks, outcome.spent)
        run = { ...found, ...(outcome.error && { error: outcome.error }) }
        await writeFile(`${out}conversation.md`, transcript(outcome.records))
        await writeFile(`${out}answer.txt`, answer)
        if (first?.report.shots) {
          await writeFile(`${out}computer.png`, first.report.shots.wide)
          await writeFile(`${out}phone.png`, first.report.shots.sheet)
          if (judge) Object.assign(run, await judging(judge, brief, first.report, answer).catch((error) => ({ error: `the judge failed: ${error.message ?? error}` })))
        }
      } catch (error) {
        run = { ...scored(brief, [], checks, { ms: 0, inputTokens: 0, outputTokens: 0 }).run, error: error instanceof Error ? error.message : String(error) }
      }
      runs.push(run)
      await writeFile(`${out}run.json`, JSON.stringify(run, null, 1))
      console.log(`  ${brief.id} ${brief.lang}: ${cell(run)}${run.left.length ? ` (${run.left[0]})` : ''}`)
    })
  } finally {
    await browser.close()
    await measured.close?.()
    await judge?.close?.()
  }
  const order = Object.entries(set.briefs).flatMap(([id, brief]) => Object.entries(brief).filter(([, text]) => typeof text === 'string').map(([lang]) => `${id} ${lang}`))
  const sorted = (/** @type {Run[]} */ list) => list.sort((a, b) => order.indexOf(`${a.id} ${a.lang}`) - order.indexOf(`${b.id} ${b.lang}`))
  console.log(`\n${report(measured, sorted(runs))}`)
  // Written from each brief's latest run kept here, so that some briefs run again replace only theirs.
  const kept = await readdir(`${DIR}.cache/${slug}`).catch(() => [])
  const latest = await Promise.all(kept.filter((name) => order.includes(name.replace(/-([\w-]+)$/, ' $1'))).map(async (name) => JSON.parse(await readFile(`${DIR}.cache/${slug}/${name}/run.json`, 'utf8').catch(() => 'null'))))
  if (argv.includes('--write')) await write(measured, report(measured, sorted(latest.filter(Boolean))))
}

/** A run in a few characters: clean or not and the check it was clean on, its flow, its change, and the judge's word. @param {Run} run */
function cell(run) {
  if (run.error && !run.made) return `— ${run.error.slice(0, 60)}`
  if (!run.made) return run.page ? '✗ a page' : run.asked ? '✗ asked' : '✗ none'
  const judged = run.shown === undefined ? '' : run.shown ? ' · shown' : ' · not shown'
  const asked = run.asked ? ` · asked${run.asked > 1 ? ` ${run.asked} times` : ''}` : ''
  return `${run.clean ? '✓' : '✗'} ${run.cleanAt ?? run.rounds} · flow ${run.flows ? '✓' : '✗'} · ${run.changed ? `change ${run.changedClean ? '✓' : run.changedFlows ? '~' : '✗'}` : 'no change'}${judged}${run.honest === undefined ? '' : run.honest ? ' · honest' : ' · not honest'}${asked}`
}

/** This brain's section: what it made, how often clean, flowing and shown, by language, then each brief by language. @param {Measured} measured @param {Run[]} every */
function report({ name }, every) {
  const runs = every.filter((run) => !(run.error && !run.made))
  const of = (/** @type {(run: Run) => boolean | undefined} */ test, list = runs) => list.filter(test).length
  const median = (/** @type {number[]} */ list) => list.sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0
  const judged = runs.filter((run) => run.shown !== undefined), paid = runs.filter((run) => run.honest !== undefined)
  const langs = [...new Set(every.map((run) => run.lang))], ids = [...new Set(every.map((run) => run.id))]
  const rows = ids.map((id) => `| ${id} | ${langs.map((lang) => { const run = every.find((one) => one.id === id && one.lang === lang); return run ? cell(run) : '' }).join(' | ')} |`)
  const byLang = langs.map((lang) => { const here = runs.filter((run) => run.lang === lang); return `| ${lang} | ${of((run) => run.made, here)} of ${here.length} | ${of((run) => run.clean, here)} | ${of((run) => run.flows, here)} | ${of((run) => run.changedClean, here)} | ${of((run) => run.shown, here)} of ${here.filter((run) => run.shown !== undefined).length} |` })
  const left = runs.filter((run) => run.made && !run.clean).map((run) => `- ${run.id}, ${run.lang}: ${run.left.join(' ') || 'its last call failed'}`)
  const why = judged.filter((run) => !run.shown).map((run) => `- ${run.id}, ${run.lang}: ${run.why}`)
  const failed = every.filter((run) => run.error && !run.made).map((run) => `- ${run.id}, ${run.lang}: ${run.error?.slice(0, 160)}`)
  const minutes = Math.round(median(runs.map((run) => run.seconds)) / 6) / 10, kb = Math.round(median(runs.filter((run) => run.made).map((run) => run.weight)) / 1024)
  const screens = median(runs.filter((run) => run.made).map((run) => run.screens)), pressed = median(runs.filter((run) => run.made).map((run) => run.pressed))
  return `## ${name}, ${new Date().toISOString().slice(0, 10)}

Made a prototype on ${of((run) => run.made)} of ${runs.length} briefs, with nothing left to fix on ${of((run) => run.clean)}, ${of((run) => run.cleanAt === 1)} of them on the first check and ${of((run) => (run.cleanAt ?? 0) > 3)} after the third. Its flow worked on ${of((run) => run.flows)}: every screen reached from the first and no control doing nothing; a control did nothing on ${of((run) => run.made && run.dead > 0)}. Its change was clean on ${of((run) => run.changedClean)} of ${of((run) => run.changed)}, its flow working after it on ${of((run) => run.changedFlows)}. ${judged.length ? `Would be shown to colleagues on ${of((run) => run.shown)} of ${judged.length} judged` : 'Not judged'}${paid.length ? `, paying shown as a demo in ${of((run) => run.honest)} of ${paid.length}` : ''}. Read the skill before its first prototype on ${of((run) => run.read)}, gave a look on ${of((run) => run.look)}, wrote a page instead on ${of((run) => run.page)}, asked on ${of((run) => run.asked > 0)}. A brief took ${minutes} minutes at the median; a prototype had ${screens} screens and ${pressed} links and controls tried, and its first screen weighs ${kb} KB.

| Language | Made | Clean | Flow works | Change clean | Shown |
|---|---:|---:|---:|---:|---:|
${byLang.join('\n')}

✓ nothing left to fix, ✗ something; then the check it was clean on, or how many it took; then whether its flow works; then its change (~: its flow works, something else left); then the judge's word.

| Brief | ${langs.join(' | ')} |
|---|${langs.map(() => '---').join('|')}|
${rows.join('\n')}
${left.length ? `\nLeft to fix:\n${left.join('\n')}\n` : ''}${why.length ? `\nNot shown, the judge says:\n${why.join('\n')}\n` : ''}${failed.length ? `\nFailed for another reason than the brain, left out:\n${failed.join('\n')}\n` : ''}`
}

const SUMMARY = '## Every brain'

/** Every brain side by side, read back from each section's first lines. @param {string[]} sections */
function summary(sections) {
  const rows = sections.map((part) => {
    const heading = part.slice(3, part.indexOf('\n'))
    const read = (/** @type {RegExp} */ pattern) => pattern.exec(part)?.slice(1).join(' of ') ?? '—'
    return `| ${heading.slice(0, heading.lastIndexOf(', '))} | ${read(/Made a prototype on (\d+) of (\d+)/)} | **${read(/nothing left to fix on (\d+)/)}** | **${read(/flow worked on (\d+)/)}** | ${read(/change was clean on (\d+ of \d+)/)} | **${read(/shown to colleagues on (\d+ of \d+)/)}** | ${read(/demo in (\d+ of \d+)/)} | ${read(/A brief took ([\d.]+) minutes/)} |`
  })
  return `${SUMMARY}

| Brain | Made | Clean | Flow works | Change clean | Shown | Paying a demo | Minutes |
|---|---:|---:|---:|---:|---:|---:|---:|
${rows.join('\n')}`
}

/** Writes this brain's section into results.md, in place of its last one, under every brain's summary. @param {Measured} measured @param {string} section */
async function write({ name }, section) {
  const before = await readFile(`${DIR}results.md`, 'utf8').catch(() => '')
  const kept = before.split(/^(?=## )/m).slice(1).filter((part) => !part.startsWith(`## ${name}, `) && !part.startsWith(SUMMARY))
  const sections = [section, ...kept].map((part) => part.trimEnd())
  await writeFile(`${DIR}results.md`, `# Prototypes: how often a brain makes one whose flow works

Written by \`npm run prototypes -- --write\`, one section per brain, replaced when that brain is measured again: first Prototypes'
phase 0, before it was built (findings.md), then the capability (D742). Each brief of set.json is a task of Jean's run in Node in
its language, the measured brain answering through Jean's prompt and own capabilities, the skill "Make a prototype" among Jean's own,
and Prototypes' two tools, unguided: a question it asks gets the recommended answer. Its change follows in
the same task. A prototype is clean when its last check has nothing to fix; its flow works when every screen is reached from the
first by pressing what it shows, and no control does nothing. The judge sees the brief, every screen reached on a phone side by
side and the first on a computer, and says whether the person would show it to colleagues as a prototype of their idea. A brief
that failed for another reason than the brain is left out. The gate proposed before measuring, on the eight briefs: clean on 26
of 32, flow working on 26 of 32, shown on 22 of 32, paying a demo in 4 of 4, Arabic and Japanese each within one brief of English.

${[summary(sections), ...sections].join('\n\n')}
`)
}

main(process.argv.slice(2), process.env).catch((error) => {
  console.error(`prototypes: ${error.message}`)
  process.exit(1)
})
