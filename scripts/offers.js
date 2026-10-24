// Measures the brain's own offers (D284): how often a brain calls `offer` for what a request needs,
// and for what it doesn't. Each labelled request of test/offers/ is the first message of a first
// conversation, sent with Jean's own frozen prompt and declared tools, which the page itself sends
// in headless Chromium, language by language. The request goes through core's loop to the brain,
// and what is measured is whether its reply offers, and what. Jean's tools answer as they do in a
// first conversation, the user taking each recommended answer; the reply ends at an offer, or at a
// call to a tool that can't be answered here.
// Needs Playwright's Chromium, as the e2e tests do (npx playwright install chromium), and a brain.
// The brain comes from the environment: BRAIN, <provider>:<model> as jean-cli's --brain (cli/brain.js),
// its key in <PROVIDER>_API_KEY, BRAIN_ADDRESS for a server of your own, and BRAIN_BODY, JSON added to
// each request.
// Usage: BRAIN=openrouter:openai/gpt-5-mini OPENROUTER_API_KEY=… npm run offers
//        BRAIN=lmstudio:google/gemma-4-e2b BRAIN_BODY='{"reasoning_effort":"none"}' npm run offers
//                                            the device's brain, which doesn't think there either
//        npm run offers -- --lang fr,ja      some languages
//        npm run offers -- --only de1,de2    some requests, never with --write
//        npm run offers -- --parallel 2      requests at a time (default 4)
//        npm run offers -- --write           also write this brain's section of test/offers/results.md
//        npm run offers -- --verbose         and every miss
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { handle } from './serve.js'
import { chooseBrain } from '../cli/brain.js'
import { runTurn } from '../app/core/loop.js'
import { streamChat, LLMError } from '../app/core/llm.js'
import { findTools } from '../app/core/deferred.js'
import { questionsOf, reply, start } from '../app/caps/ask/answers.js'

/** @import { Chosen } from '../cli/brain.js' */
/** @import { ToolCall, ToolSpec } from '../app/core/types.js' */
/** @typedef {{ system: string, tools: ToolSpec[] }} Prompt */
/** @typedef {{ offered?: string, called?: string, error?: string }} Outcome what the reply offered, else the tools it called */
/** @typedef {Chosen & { name: string, body?: Record<string, unknown> }} Measured the brain, and its name in results.md */

const DIR = fileURLToPath(new URL('../test/offers/', import.meta.url))
// Where the page's brain is, on the page's own server: the request never leaves the browser.
const BRAIN = '/measured-brain/v1'
const ANSWER = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`
// An answer can't run on: an offer comes before or right after it.
const MAX_TOKENS = 4096

/**
 * What the tools of a first conversation answer (caps/ask, caps/made, caps/you), the user taking
 * each recommended answer and skipping the rest. find_tools is Jean's own.
 * @type {Record<string, (args: any) => string>}
 */
const ANSWERS = {
  ask_user: (args) => {
    const questions = questionsOf(args)
    if (!questions.length) throw new Error('Give at least one question, with its text.')
    return reply(questions, questions.map(start))
  },
  write: (args) => `Saved ${args?.name}. It shows under your answer, ready to save.`,
  edit: (args) => `Changed ${args?.file}. The new version, version 2, shows under your answer, and the earlier one stays under its own.`,
  save_name: () => 'Saved.',
}

/** Jean's frozen prompt and declared tools for a first conversation in this language, as the page sends them. @param {import('@playwright/test').Browser} browser @param {string} origin @param {string} lang @returns {Promise<Prompt>} */
async function capture(browser, origin, lang) {
  const context = await browser.newContext({ locale: lang, serviceWorkers: 'block' })
  try {
    const page = await context.newPage()
    /** @type {(prompt: Prompt) => void} */
    let sent = () => {}
    const prompt = /** @type {Promise<Prompt>} */ (new Promise((resolve) => { sent = resolve }))
    await page.route(`${origin}${BRAIN}/**`, (route) => {
      const body = route.request().postDataJSON()
      if (body?.tools) sent({ system: body.messages[0].content, tools: body.tools.map((/** @type {any} */ tool) => tool.function) })
      if (!route.request().url().endsWith('/chat/completions')) return route.fulfill({ json: { data: [] } })
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: ANSWER })
    })
    await page.goto(`${origin}/`)
    await page.locator('.hero-question').waitFor()
    const shown = await page.locator('html').getAttribute('lang')
    if (shown !== lang) throw new Error(`the page opened in ${shown}, not ${lang}`)
    await page.evaluate(async (baseURL) => {
      const { addBrain } = await import('/ui/brains.js')
      await addBrain({ id: 'measured', provider: 'custom', api: 'openai', baseURL, model: 'measured' })
    }, `${origin}${BRAIN}`)
    await page.locator('#prompt').fill('…')
    await page.locator('#prompt').press('Enter')
    return await Promise.race([prompt, new Promise((_, failed) => setTimeout(() => failed(new Error('the page sent nothing to its brain')), 30_000))])
  } finally {
    await context.close()
  }
}

/**
 * Whether the brain's reply to a request offers, and what; else the tools it called, or none.
 * @param {Measured} measured @param {Prompt} prompt @param {string} text @returns {Promise<Outcome>}
 */
async function measure({ brain, apiKey, body }, prompt, text) {
  const controller = new AbortController()
  /** @type {ToolCall[]} */
  const calls = []
  const stand = prompt.tools.map((spec) => ({ spec, kind: /** @type {const} */ ('think'), title: () => spec.name, run: async (/** @type {any} */ args) => ANSWERS[spec.name]?.(args) ?? '' }))
  const tools = stand.map((tool) => (tool.spec.name === 'find_tools' ? findTools({ tools: () => stand }) : tool))
  /** @type {typeof fetch} */
  const fetch = (url, init) => globalThis.fetch(url, body && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...body }) } : init)
  /** Jean's stream, ended after an offer or a call nothing here answers. @type {typeof streamChat} */
  async function* stream(options) {
    if (calls.some((call) => call.name !== 'find_tools' && !ANSWERS[call.name])) {
      controller.abort()
      throw new LLMError('Measured', { code: 'aborted' })
    }
    for await (const event of streamChat({ ...options, maxTokens: MAX_TOKENS, fetch })) {
      if (event.type === 'tool_call') calls.push(event.call)
      yield event
    }
  }
  try {
    await runTurn({ brain, apiKey, system: prompt.system, history: [{ role: 'user', content: text }], tools, declared: prompt.tools.map((spec) => spec.name), rule: () => 'allow', stream, signal: controller.signal, maxSteps: 8 })
  } catch (error) {
    if (!controller.signal.aborted) return { error: error instanceof Error ? error.message : String(error) }
  }
  const offer = calls.find((call) => call.name === 'offer')
  if (offer) return { offered: String(offer.args?.capability ?? '') }
  const called = [...new Set(calls.map((call) => call.name).filter((name) => name !== 'find_tools'))]
  return called.length ? { called: called.join(' ') } : {}
}

/** Runs `work` over `items`, `parallel` at a time. @template T @param {T[]} items @param {number} parallel @param {(item: T) => Promise<void>} work */
async function pool(items, parallel, work) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, async () => {
    while (next < items.length) await work(items[next++])
  }))
}

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
async function main(argv, env) {
  const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  if (!env.BRAIN) throw new Error('name a brain: BRAIN=<provider>:<model> (cli/brain.js), its key in <PROVIDER>_API_KEY')
  const found = await chooseBrain({ named: env.BRAIN, address: env.BRAIN_ADDRESS, env })
  if (!found) throw new Error(`no brain "${env.BRAIN}"`)
  if ('needs' in found) throw new Error(`name ${found.needs}'s model: BRAIN=${found.needs}:<model>`)
  const body = env.BRAIN_BODY ? JSON.parse(env.BRAIN_BODY) : undefined
  /** @type {Measured} */
  const chosen = { ...found, body, name: `${found.brain.model} (${[found.brain.provider, env.BRAIN_BODY].filter(Boolean).join(', ')})` }
  const only = flag('--lang')?.split(','), ids = flag('--only')?.split(',')
  if (ids && argv.includes('--write')) throw new Error('--write needs every request: leave --only out')
  const parallel = Number(flag('--parallel') ?? 4)
  const english = JSON.parse(await readFile(`${DIR}en.json`, 'utf8'))
  /** @type {Record<string, string>} */
  const labels = Object.fromEntries(Object.entries(english.labels).filter(([id]) => !ids || ids.includes(id)))
  const langs = (await readdir(DIR)).filter((file) => /^[\w-]+\.json$/.test(file)).map((file) => file.slice(0, -5))
    .filter((lang) => !only || only.includes(lang)).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a < b ? -1 : 1))

  // Jean's prompt in each language, as the page sends it.
  const { chromium } = await import('@playwright/test')
  const server = createServer((req, res) => { handle(req, res).catch(() => res.destroy()) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const origin = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
  const browser = await chromium.launch()
  /** @type {Record<string, Prompt>} */
  const prompts = {}
  try {
    for (const lang of langs) prompts[lang] = await capture(browser, origin, lang)
  } finally {
    await browser.close()
    server.close()
  }
  const offerable = /** @type {string[]} */ (prompts[langs[0]].tools.find((spec) => spec.name === 'offer')?.parameters?.properties?.capability?.enum ?? [])
  console.log(`offers: ${chosen.name}; declared: ${prompts[langs[0]].tools.map((spec) => spec.name).join(', ')}`)

  /** @type {Record<string, Record<string, Outcome>>} lang → id → what the brain did */
  const outcomes = {}
  try {
    for (const lang of langs) {
      const { requests } = lang === 'en' ? english : JSON.parse(await readFile(`${DIR}${lang}.json`, 'utf8'))
      outcomes[lang] = {}
      await pool(Object.keys(labels), parallel, async (id) => {
        if (requests[id] === undefined) throw new Error(`${lang}.json has no ${id}`)
        outcomes[lang][id] = await measure(chosen, prompts[lang], requests[id])
      })
      const all = Object.entries(outcomes[lang])
      const right = all.filter(([id, outcome]) => (outcome.offered ?? 'none') === labels[id]).length
      const errors = all.filter(([, outcome]) => outcome.error)
      console.log(`${lang.padEnd(8)} right ${right}/${all.length}${errors.length ? `  errors ${errors.length}: ${errors[0][1].error}` : ''}`)
      if (errors.length === all.length) throw new Error(`every request failed: ${errors[0][1].error}`)
    }
  } finally {
    await chosen.close?.()
  }
  if (argv.includes('--verbose')) {
    for (const [lang, byId] of Object.entries(outcomes)) {
      for (const [id, outcome] of Object.entries(byId)) if ((outcome.offered ?? 'none') !== labels[id]) console.log(`${lang} ${id} (${labels[id]}): ${JSON.stringify(outcome)}`)
    }
  }
  const section = report(chosen, labels, offerable, outcomes)
  console.log(`\n${section}`)
  if (argv.includes('--write')) await write(chosen, section, langs.length, Object.keys(labels).length)
}

/**
 * This brain's section: per capability, how often it was offered when the request needed it, what
 * came instead, and how often it was offered when the request didn't; then per language.
 * @param {Measured} measured @param {Record<string, string>} labels @param {string[]} offerable @param {Record<string, Record<string, Outcome>>} outcomes
 */
function report({ name }, labels, offerable, outcomes) {
  const all = Object.entries(outcomes).flatMap(([lang, byId]) => Object.entries(byId).map(([id, outcome]) => ({ lang, label: labels[id], ...outcome })))
  const percent = (/** @type {number} */ part, /** @type {number} */ whole) => (whole ? `${Math.round(part / whole * 100)}%` : '—')
  const count = (/** @type {string[]} */ names) => Object.entries(Object.groupBy(names, (name) => name)).sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0)).map(([name, list]) => `${name} ${list?.length}`).join(', ') || '—'
  const rows = [...offerable, 'none'].map((capability) => {
    const due = all.filter((item) => item.label === capability)
    const right = due.filter((item) => (item.offered ?? 'none') === capability).length
    const instead = due.filter((item) => (item.offered ?? 'none') !== capability).map((item) => item.offered ?? (item.called ? `\`${item.called}\`` : item.error ? 'error' : 'none'))
    const others = all.filter((item) => item.label !== capability)
    const wrong = others.filter((item) => item.offered === capability).length
    return `| ${capability} | ${due.length} | ${percent(right, due.length)}${due.length ? ` (${right})` : ''} | ${count(instead)} | ${capability === 'none' ? '—' : `${percent(wrong, others.length)} (${wrong})`} |`
  })
  const due = all.filter((item) => item.label !== 'none')
  const none = all.filter((item) => item.label === 'none')
  const langs = Object.keys(outcomes).map((lang) => {
    const items = all.filter((item) => item.lang === lang)
    const right = items.filter((item) => (item.offered ?? 'none') === item.label).length
    return `| ${lang} | ${percent(items.filter((item) => item.label !== 'none' && item.offered === item.label).length, items.filter((item) => item.label !== 'none').length)} | ${percent(items.filter((item) => item.label === 'none' && item.offered).length, items.filter((item) => item.label === 'none').length)} | **${percent(right, items.length)}** |`
  })
  const errors = all.filter((item) => item.error).length
  return `## ${name}, ${new Date().toISOString().slice(0, 10)}

Right on ${percent(all.filter((item) => (item.offered ?? 'none') === item.label).length, all.length)} of ${all.length} requests. Of those that needed an offer, ${percent(due.filter((item) => item.offered === item.label).length, due.length)} got the right one and ${percent(due.filter((item) => !item.offered).length, due.length)} none; of those that needed none, ${percent(none.filter((item) => item.offered).length, none.length)} got one.${errors ? ` ${errors} requests failed.` : ''}

| Capability | Requests that need it | Offered then | What came instead | Offered when not needed |
|---|---:|---:|---|---:|
${rows.join('\n')}

| Language | Needed offers made | Offers not needed | Right |
|---|---:|---:|---:|
${langs.join('\n')}
`
}

const SUMMARY = '## Every brain: offered when needed'

/**
 * Every brain side by side: how often each capability was offered when a request needed it, read
 * back from each section's own table, and how often the brain was right overall.
 * @param {string[]} sections
 */
function summary(sections) {
  const brains = sections.map((part) => {
    const heading = part.slice(3, part.indexOf('\n'))
    const cells = new Map([...part.matchAll(/^\| ([\w-]+) \| (\d+) \| (\d+%) /gm)].filter((row) => row[1] !== 'none').map((row) => [row[1], row[3]]))
    return { name: heading.slice(0, heading.lastIndexOf(', ')), cells, right: /^Right on (\d+%)/m.exec(part)?.[1] ?? '—' }
  })
  const capabilities = [...new Set(brains.flatMap((brain) => [...brain.cells.keys()]))]
  return `${SUMMARY}

| Capability | ${brains.map((brain) => brain.name).join(' | ')} |
|---|${brains.map(() => '---:').join('|')}|
${capabilities.map((id) => `| ${id} | ${brains.map((brain) => brain.cells.get(id) ?? '—').join(' | ')} |`).join('\n')}
| **Right, all requests** | ${brains.map((brain) => `**${brain.right}**`).join(' | ')} |`
}

/** Writes this brain's section into results.md, in place of its last one, under every brain's summary. @param {Measured} measured @param {string} section @param {number} langs @param {number} requests */
async function write({ name }, section, langs, requests) {
  const before = await readFile(`${DIR}results.md`, 'utf8').catch(() => '')
  const kept = before.split(/^(?=## )/m).slice(1).filter((part) => !part.startsWith(`## ${name}, `) && !part.startsWith(SUMMARY))
  const sections = [section, ...kept].map((part) => part.trimEnd())
  await writeFile(`${DIR}results.md`, `# Offers: what brains offer, and when

Written by \`npm run offers -- --write\`, one section per brain, replaced when that brain is measured again.
Each request is the first message of a first conversation, with Jean's own frozen prompt and declared
tools in its language (${langs} languages, ${requests} requests each, one reply each); what counts is
whether the reply calls \`offer\`, and with what. Jean's tools answer as in a first conversation, the user
taking each recommended answer to \`ask_user\`. "What came instead" names the offer made in its place,
the tools the reply called in backticks, or none: an answer and nothing else. Jean refuses to offer
search before five conversations (D145); the brain's call counts all the same.

${[summary(sections), ...sections].join('\n\n')}
`)
}

main(process.argv.slice(2), process.env).catch((error) => {
  console.error(`offers: ${error.message}`)
  process.exit(1)
})
