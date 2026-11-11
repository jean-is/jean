// Measures the skill "Make a site" (D720), first before Sites was built (its phase 0): how often a brain makes a site that passes
// the check, from the briefs of test/sites/set.json in English, French, Arabic and Japanese, then changes it as asked in
// the same task. Each brief is a task of Jean's run in Node (test/longtasks/jean.js): Jean's prompt and its own
// capabilities, the skill tool listing Jean's own skills with the draft among them, and the tools Sites would declare,
// `site` and `site_change`, whose check runs in Chromium (test/sites/check.js). A question the brain asks gets the
// recommended answer. What it did is read from its conversation: whether it read the skill before its first site, asked
// (where the brief is open, leaving two choices or more that change the whole site, the skill asks once; elsewhere it
// asks nothing) and whether before reading the skill, wrote a page instead, how many checks it took until nothing was left
// to fix, and how its change went. Then a
// judge, given the brief and the first page as a computer and a phone show it, says whether the person would put it
// online as it is, and for the SaaS brief whether the answer said plainly what a site can't do.
// Needs Playwright's Chromium (npx playwright install chromium) and a brain, as `npm run games`: BRAIN, <provider>:<model>
// as jean-cli's --brain (cli/brain.js), its key in <PROVIDER>_API_KEY, BRAIN_ADDRESS for a server of your own, BRAIN_BODY,
// JSON added to each request. The judge is JUDGE, with JUDGE_ADDRESS and JUDGE_BODY; without one, nothing is judged.
// Usage: BRAIN=claudecode:sonnet JUDGE=claudecode:sonnet npm run sites
//        npm run sites -- --lang fr,ja        some languages
//        npm run sites -- --only landing,saas some briefs
//        npm run sites -- --parallel 2        briefs at a time (default 3)
//        npm run sites -- --write             also write this brain's section of test/sites/results.md
//        npm run sites -- --judge             judge the kept runs again, as the first request left each site, making nothing
// Each run is kept in test/sites/.cache/<brain>/<brief>-<lang>/: its sites, the conversation, the pictures, run.json.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chooseBrain } from '../cli/brain.js'
import { streamChat } from '../app/core/llm.js'
import { runTask, willing } from '../test/longtasks/jean.js'
import { siteTools, skillLine, LINES } from '../test/sites/tools.js'
import { sharedFor } from '../test/sites/fixtures.js'
import { check } from '../test/sites/check.js'
import { extractPages } from '../app/caps/files/extract.js'
import { LOOK, cssOf } from '../app/caps/sites/look.js'

/** @import { Chosen } from '../cli/brain.js' */
/** @typedef {Chosen & { name: string, body?: Record<string, unknown>, maxTokens?: number }} Measured the brain, and its name in results.md */
/** @typedef {{ id: string, lang: string, text: string, change: string, files?: string, open?: boolean }} Brief */
/**
 * @typedef {{ id: string, lang: string, open?: boolean, made: boolean, read: boolean, asked: number, early: boolean, page: boolean, rounds: number, clean: boolean, cleanAt?: number,
 *   changed: boolean, changedClean: boolean, pages: number, languages: string[], weight: number, fill: number, left: string[],
 *   online?: boolean, why?: string, honest?: boolean, seconds: number, tokens: number, error?: string }} Run
 */

const DIR = fileURLToPath(new URL('../test/sites/', import.meta.url))
// An answer's longest: Jean asks Anthropic's brains for 64,000 tokens, and a site of a few pages is often past 8,192.
const ANSWER = 32000

/** The records' tool calls that ended, in order, with where each request began. @param {any[]} records */
function readCalls(records) {
  // A request is a message's words: each file it shares is a record of its own, a link, before them.
  const requests = records.flatMap(({ update, by }, index) => (update?.sessionUpdate === 'user_message_chunk' && update.content?.type === 'text' && by !== 'jean' && !update._meta?.steer ? [index] : []))
  const calls = records.flatMap(({ update }, index) => (update?.sessionUpdate === 'tool_call' && update.name && !update._meta?.parent && ['completed', 'failed'].includes(update.status) ? [{ index, name: String(update.name), status: String(update.status), input: update.rawInput }] : []))
  const said = (/** @type {number} */ from, /** @type {number} */ to) => records.slice(from, to).map(({ update }) => (update?.sessionUpdate === 'agent_message_chunk' ? update.content?.text ?? '' : '')).join('')
  return { calls, second: requests[1] ?? Infinity, said }
}

/**
 * A brief's run, scored from its conversation and the check of each call. @param {Brief} brief @param {any[]} records
 * @param {import('../test/sites/tools.js').Call[]} checks @param {{ ms: number, inputTokens: number, outputTokens: number }} spent
 * @returns {{ run: Run, first?: import('../test/sites/tools.js').Call, answer: string }}
 */
function scored(brief, records, checks, spent) {
  const { calls, second, said } = readCalls(records)
  const sites = calls.filter((call) => call.name === 'site' || call.name === 'site_change')
  const done = sites.filter((call) => call.status === 'completed')
  const before = done.filter((call) => call.index < second).length
  const ours = checks.slice(0, before), theirs = checks.slice(before)
  const cleanAt = ours.findIndex((call) => !call.report.problems.length)
  const first = ours.at(-1), last = theirs.at(-1) ?? first
  const firstSite = sites[0]?.index ?? Infinity
  const skill = calls.find((call) => call.name === 'skill' && /^site(\/|$)/.test(String(call.input?.name ?? '')))?.index ?? Infinity
  const asks = calls.filter((call) => call.name === 'ask_user')
  const answer = said(0, Number.isFinite(second) ? second : records.length)
  return {
    first, answer,
    run: {
      id: brief.id, lang: brief.lang, ...(brief.open && { open: true }), made: ours.length > 0,
      read: skill < firstSite,
      asked: asks.length, early: asks.some((call) => call.index < skill),
      page: !ours.length && (/```html/.test(answer) || calls.some((call) => call.name === 'write' && /\.html?$/i.test(String(call.input?.name ?? call.input?.path ?? '')))),
      rounds: ours.length, clean: !!first && !first.report.problems.length, ...(cleanAt >= 0 && { cleanAt: cleanAt + 1 }),
      changed: theirs.length > 0, changedClean: !!theirs.length && !theirs.at(-1)?.report.problems.length,
      pages: last?.report.pages.length ?? 0, languages: last?.report.languages ?? [], weight: first?.report.weight ?? 0, fill: first?.report.fill.length ?? 0,
      left: (first?.report.problems ?? []).slice(0, 3),
      seconds: Math.round(spent.ms / 1000), tokens: spent.inputTokens + spent.outputTokens,
    },
  }
}

/**
 * The judge's word on a site: whether its person would put it online as it is, and for the SaaS brief, whether the
 * answer said plainly what a site can't do. @param {Measured} judge @param {Brief} brief @param {import('../test/sites/check.js').Report} report @param {string} answer
 */
async function judging({ brain, apiKey, body }, brief, report, answer) {
  const saas = brief.id === 'saas', shots = /** @type {NonNullable<typeof report.shots>} */ (report.shots)
  const files = await sharedFor(brief.files, brief.lang)
  // What the person shared, which the site's facts may come from: a CV's words, or photographs' names.
  const shared = brief.files === 'cv' ? `\n\nThey shared their CV, which the site is made from:\n"""\n${(await Promise.all(files.map(async (file) => (await extractPages(file.name, file.bytes))?.join('\n') ?? ''))).join('\n')}\n"""`
    : files.length ? `\n\nThey shared photographs named ${files.map((file) => file.name).join(', ')}; the site's are plain stand-ins for their own.` : ''
  const content = `Someone asked an assistant for a website, in these words: "${brief.text}". Here is the site's first page as a computer shows it, then as a phone does. Its forms reach the person through the site's host. Its pages:
${report.outline.join('\n')}${shared}${saas ? `\n\nThe assistant answered:\n"""\n${answer.slice(0, 3000)}\n"""` : ''}

Say as one JSON object, and nothing else:
- "online": true if the person would put this site online as it is, apart from filling in words in square brackets: it looks finished and cared for, fits what was asked, reads well on both, and claims nothing that isn't so; false otherwise.
- "why": what decided it, in twelve words at most.${saas ? '\n- "honest": true if the answer says plainly that a site can\'t sign clients in or show each their own invoices, and offers what it made instead, with no sign-in page or password field on the site; false otherwise.' : ''}`
  /** @type {import('../app/core/types.js').ChatMessage[]} */
  const messages = [{ role: 'user', content, documents: [{ name: 'computer.png', text: '', images: [{ mimeType: 'image/png', data: shots.wide.toString('base64') }] }, { name: 'phone.png', text: '', images: [{ mimeType: 'image/png', data: shots.narrow.toString('base64') }] }] }]
  /** @type {typeof fetch} */
  const fetch = (url, init) => globalThis.fetch(url, body && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...body }) } : init)
  let text = ''
  for await (const event of streamChat({ brain, apiKey, messages, maxTokens: 2048, fetch })) if (event.type === 'text') text += event.delta
  try {
    const said = JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? '')
    return { online: !!said.online, why: String(said.why ?? ''), ...(saas && { honest: !!said.honest }) }
  } catch {
    return { error: `the judge wrote no JSON: ${text.slice(0, 200)}` }
  }
}

/**
 * Each look the first request's site was dealt (D739), its look.css in place of the one it wore, checked as that one was, by day and by
 * night. @param {import('../test/sites/tools.js').Call} call @param {import('@playwright/test').Browser} browser
 * @returns {Promise<{ look: string, clean: boolean, left: string[] }[]>}
 */
async function looksChecked(call, browser) {
  const out = []
  for (const look of call.looks) {
    const report = look === call.look ? call.report : await check(new Map(call.files).set(LOOK, new TextEncoder().encode(cssOf(look))), browser)
    out.push({ look: `${look.id} ${look.voice}`, clean: !report.problems.length, left: report.problems.slice(0, 2) })
  }
  return out
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

/** A kept site's files, by their path in it. @param {string} folder @returns {Promise<Map<string, Uint8Array>>} */
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
  const langs = flag('--lang')?.split(','), only = flag('--only')?.split(','), parallel = Number(flag('--parallel') ?? 3)
  /** @type {{ change: Record<string, string>, briefs: Record<string, Record<string, any>> }} */
  const set = JSON.parse(await readFile(`${DIR}set.json`, 'utf8'))
  /** @type {Brief[]} */
  const briefs = Object.entries(set.briefs).filter(([id]) => !only || only.includes(id)).flatMap(([id, brief]) => Object.entries(brief)
    .filter(([lang, text]) => typeof text === 'string' && lang !== 'files' && (!langs || langs.includes(lang)))
    .map(([lang, text]) => ({ id, lang, text: String(text), change: (brief.change ?? set.change)[lang], ...(brief.files && { files: brief.files }), ...(brief.open && { open: true }) })))
  const slug = measured.name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '')
  console.log(`sites: ${measured.name}${judge ? `, judged by ${judge.name}` : ', no judge'}; ${briefs.length} briefs`)

  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  /** @type {Run[]} */
  const runs = []
  try {
    // --judge: each kept run judged again, its site as the first request left it, with no brain making anything.
    if (argv.includes('--judge')) await pool(briefs, parallel, async (brief) => {
      if (!judge) throw new Error('name a judge: JUDGE=<provider>:<model>')
      const out = `${DIR}.cache/${slug}/${brief.id}-${brief.lang}/`
      /** @type {Run | null} */
      const run = JSON.parse(await readFile(`${out}run.json`, 'utf8').catch(() => 'null'))
      if (!run?.made) return void (run && runs.push(run))
      const report = await check(await filesIn(`${out}calls/${run.rounds}/`), browser)
      const answer = await readFile(`${out}answer.txt`, 'utf8').catch(() => null)
      /** @type {any} */
      const said = report.shots ? await judging(judge, brief, report, answer ?? '').catch((error) => ({ error: `the judge failed: ${error.message ?? error}` })) : { error: 'no picture of its first page' }
      // The SaaS answer is judged only where the run kept it.
      Object.assign(run, said.error ? { error: said.error } : { online: said.online, why: said.why, ...(said.honest !== undefined && answer !== null && { honest: said.honest }) })
      if (report.shots) { await writeFile(`${out}computer.png`, report.shots.wide); await writeFile(`${out}phone.png`, report.shots.narrow) }
      await writeFile(`${out}run.json`, JSON.stringify(run, null, 1))
      runs.push(run)
      console.log(`  ${brief.id} ${brief.lang}: ${cell(run)}${run.why && !run.online ? ` (${run.why})` : ''}`)
    })
    else await pool(briefs, parallel, async (brief) => {
      const out = `${DIR}.cache/${slug}/${brief.id}-${brief.lang}/`
      await rm(out, { recursive: true, force: true })
      await mkdir(out, { recursive: true })
      /** @type {import('../test/sites/tools.js').Call[]} */
      const checks = []
      /** @type {Run} */
      let run
      try {
        const files = await sharedFor(brief.files, brief.lang)
        const tools = siteTools({ dir: out, browser, shared: new Map(files.map((file) => [file.name, file.bytes])), calls: checks })
        const outcome = await runTask(measured, {
          lang: brief.lang, request: brief.text, files, where: 'files', window: 0,
          features: { plan: false, compact: true, keep: 1 },
          user: { ...willing, then: brief.change },
          own: { tools, lines: [...LINES, await skillLine()] },
        }, `${DIR}.cache/${slug}/tasks/${brief.id}-${brief.lang}`)
        const { run: found, first, answer } = scored(brief, outcome.records, checks, outcome.spent)
        run = { ...found, ...(outcome.error && { error: outcome.error }) }
        if (first?.looks) Object.assign(run, { looks: await looksChecked(first, browser) })
        await writeFile(`${out}conversation.md`, transcript(outcome.records))
        await writeFile(`${out}answer.txt`, answer)
        if (first?.report.shots) {
          await writeFile(`${out}computer.png`, first.report.shots.wide)
          await writeFile(`${out}phone.png`, first.report.shots.narrow)
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
  const order = Object.entries(set.briefs).flatMap(([id, brief]) => Object.entries(brief).filter(([lang, text]) => typeof text === 'string' && lang !== 'files').map(([lang]) => `${id} ${lang}`))
  const sorted = (/** @type {Run[]} */ list) => list.sort((a, b) => order.indexOf(`${a.id} ${a.lang}`) - order.indexOf(`${b.id} ${b.lang}`))
  console.log(`\n${report(measured, sorted(runs))}`)
  // Written from each brief's latest run kept here, so that some briefs run again replace only theirs.
  const kept = await readdir(`${DIR}.cache/${slug}`).catch(() => [])
  const latest = await Promise.all(kept.filter((name) => order.includes(name.replace(/-([\w-]+)$/, ' $1'))).map(async (name) => JSON.parse(await readFile(`${DIR}.cache/${slug}/${name}/run.json`, 'utf8').catch(() => 'null'))))
  if (argv.includes('--write')) await write(measured, report(measured, sorted(latest.filter(Boolean))))
}

/** A run in a few characters: clean or not and the check it was clean on, its change, and the judge's word. @param {Run} run */
function cell(run) {
  if (run.error && !run.made) return `— ${run.error.slice(0, 60)}`
  if (!run.made) return run.page ? '✗ a page' : run.asked ? '✗ asked' : '✗ no site'
  const judged = run.online === undefined ? '' : run.online ? ' · online' : ' · not online'
  const asked = run.asked ? ` · asked${run.asked > 1 ? ` ${run.asked} times` : ''}${run.early ? ' before the skill' : ''}` : ''
  return `${run.clean ? '✓' : '✗'} ${run.cleanAt ?? run.rounds} · ${run.changed ? (run.changedClean ? 'change ✓' : 'change ✗') : 'no change'}${judged}${run.honest === undefined ? '' : run.honest ? ' · honest' : ' · not honest'}${asked}`
}

/** This brain's section: what it made, how often clean and on which check, its changes, the judge's words, then each brief by language. @param {Measured} measured @param {Run[]} every */
function report({ name }, every) {
  const runs = every.filter((run) => !(run.error && !run.made))
  const of = (/** @type {(run: Run) => boolean | undefined} */ test) => runs.filter(test).length
  const median = (/** @type {number[]} */ list) => list.sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0
  const judged = runs.filter((run) => run.online !== undefined), saas = runs.filter((run) => run.honest !== undefined)
  const open = runs.filter((run) => run.open), closed = runs.filter((run) => !run.open)
  const langs = [...new Set(every.map((run) => run.lang))], ids = [...new Set(every.map((run) => run.id))]
  const rows = ids.map((id) => `| ${id} | ${langs.map((lang) => { const run = every.find((one) => one.id === id && one.lang === lang); return run ? cell(run) : '' }).join(' | ')} |`)
  const left = runs.filter((run) => run.made && !run.clean).map((run) => `- ${run.id}, ${run.lang}: ${run.left.join(' ') || 'its last call failed'}`)
  const why = judged.filter((run) => !run.online).map((run) => `- ${run.id}, ${run.lang}: ${run.why}`)
  const minutes = Math.round(median(runs.map((run) => run.seconds)) / 6) / 10, kb = Math.round(median(runs.filter((run) => run.made).map((run) => run.weight)) / 1024)
  return `## ${name}, ${new Date().toISOString().slice(0, 10)}

Made a site on ${of((run) => run.made)} of ${runs.length} briefs, with nothing left to fix on ${of((run) => run.clean)}, ${of((run) => run.cleanAt === 1)} of them on the first check and ${of((run) => (run.cleanAt ?? 0) > 3)} after the third. Its change was clean on ${of((run) => run.changedClean)} of ${of((run) => run.changed)}. ${judged.length ? `Would go online on ${of((run) => run.online)} of ${judged.length} judged` : 'Not judged'}${saas.length ? `, honest on the SaaS brief in ${of((run) => run.honest)} of ${saas.length}` : ''}. Read the skill before its first site on ${of((run) => run.read)}, wrote a page instead on ${of((run) => run.page)}. Asked once on ${open.filter((run) => run.asked === 1).length} of ${open.length} open briefs, and on ${closed.filter((run) => run.asked > 0).length} of ${closed.length} others; more than once on ${of((run) => run.asked > 1)}, before reading the skill on ${of((run) => run.early)}. A brief took ${minutes} minutes at the median, and a first page weighs ${kb} KB.

✓ nothing left to fix, ✗ something; then the check it was clean on, or how many it took; then its change; then the judge's word.

| Brief | ${langs.join(' | ')} |
|---|${langs.map(() => '---').join('|')}|
${rows.join('\n')}
${left.length ? `\nLeft to fix:\n${left.join('\n')}\n` : ''}${why.length ? `\nNot online, the judge says:\n${why.join('\n')}\n` : ''}${looked(runs)}`
}

/** Its sites' looks (D739): how many sites had every look clean by day and by night, and what each other look left. @param {(Run & { looks?: { look: string, clean: boolean, left: string[] }[] })[]} runs */
function looked(runs) {
  const dealt = runs.filter((run) => run.looks?.length), left = dealt.flatMap((run) => (run.looks ?? []).filter((one) => !one.clean).map((one) => `- ${run.id}, ${run.lang}, ${one.look}: ${one.left.join(' ')}`))
  return dealt.length ? `\nEvery look of its first site clean by day and by night on ${dealt.filter((run) => run.looks?.every((one) => one.clean)).length} of ${dealt.length}, ${dealt.flatMap((run) => run.looks ?? []).filter((one) => one.clean).length} of ${dealt.flatMap((run) => run.looks ?? []).length} looks.\n${left.length ? `${left.join('\n')}\n` : ''}` : ''
}

const SUMMARY = '## Every brain'

/** Every brain side by side, read back from each section's first lines. @param {string[]} sections */
function summary(sections) {
  const rows = sections.map((part) => {
    const heading = part.slice(3, part.indexOf('\n'))
    const read = (/** @type {RegExp} */ pattern) => pattern.exec(part)?.slice(1).join(' of ') ?? '—'
    return `| ${heading.slice(0, heading.lastIndexOf(', '))} | ${read(/Made a site on (\d+) of (\d+)/)} | **${read(/nothing left to fix on (\d+)/)}** | ${read(/(\d+) of them on the first/)} | ${read(/change was clean on (\d+ of \d+)/)} | ${read(/online on (\d+ of \d+)/)} | ${read(/SaaS brief in (\d+ of \d+)/)} | ${read(/Asked once on (\d+ of \d+) open/)} | ${read(/and on (\d+ of \d+) others/)} |`
  })
  return `${SUMMARY}

| Brain | Made | Clean | First check | Change clean | Would go online | Honest on SaaS | Asked once, open | Asked, others |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${rows.join('\n')}`
}

/** Writes this brain's section into results.md, in place of its last one, under every brain's summary. @param {Measured} measured @param {string} section */
async function write({ name }, section) {
  const before = await readFile(`${DIR}results.md`, 'utf8').catch(() => '')
  const kept = before.split(/^(?=## )/m).slice(1).filter((part) => !part.startsWith(`## ${name}, `) && !part.startsWith(SUMMARY))
  const sections = [section, ...kept].map((part) => part.trimEnd())
  await writeFile(`${DIR}results.md`, `# Sites: how often a brain makes one that passes its check

Written by \`npm run sites -- --write\`, one section per brain, replaced when that brain is measured again: first Sites' phase 0,
before the kind was built (D720). Each brief of set.json is a task of Jean's run in Node in its language, the measured brain
answering through Jean's prompt and own capabilities, the skill "Make a site" among Jean's own, and the two
tools Sites would declare, unguided: a question it asks gets the recommended answer. Its change follows in the same task.
A site is clean when its last check has nothing to fix. The judge sees the brief and the first page on a computer and a
phone, and says whether the person would put it online as it is. A brief that failed for another reason than the brain is
left out. The gate to build the kind, on the eight briefs it was set on: clean on 26 of 32, online on 22 of 32, honest on
the SaaS brief in 4 of 4, Arabic and Japanese each within one brief of English. Asking: once on the open briefs (those
leaving two choices or more that change the whole site), after reading the skill, and never on the others.

${[summary(sections), ...sections].join('\n\n')}
`)
}

main(process.argv.slice(2), process.env).catch((error) => {
  console.error(`sites: ${error.message}`)
  process.exit(1)
})
