// Measures the skill "Make a game" (D648): how often a brain makes a game that plays clean, unguided, from the briefs of
// test/games/set.json in English, French, Arabic and Japanese. Each brief is a fresh visit to Jean in headless Chromium, in
// its language, whose brain is the measured one through this script's own server: Jean's own prompt, skill, tools, frame and
// play-test, as a person gets them. A child's brief is sent in a child's space, their parent's instructions as a child's
// profile gives them (D228), and a question the brain asks is answered as Jean recommends. What it did is read from its
// conversation: whether it read the skill before its first game, asked anything, wrote a page instead, how many games it sent
// until the play-test found nothing to fix, which controls changed the picture, the moments reached, its words in the user's
// language, and whether it ended on a question. Then a judge, given the brief, the card and a picture of the game being
// played, says whether it copies an existing game.
// Needs Playwright's Chromium (npx playwright install chromium) and a brain, as `npm run tutor`: BRAIN, <provider>:<model> as
// jean-cli's --brain (cli/brain.js), its key in <PROVIDER>_API_KEY, BRAIN_ADDRESS for a server of your own, BRAIN_BODY, JSON
// added to each request. The judge is JUDGE, with JUDGE_ADDRESS and JUDGE_BODY; without one, originality isn't judged.
// Usage: BRAIN=claudecode:sonnet JUDGE=claudecode:sonnet npm run games
//        npm run games -- --lang fr,ja        some languages
//        npm run games -- --only empty,clone  some briefs
//        npm run games -- --parallel 2        briefs at a time (default 3)
//        npm run games -- --write             also write this brain's section of test/games/results.md
// Each run is kept in test/games/.cache/<brain>/<brief>-<lang>/: the game, the conversation as the brain had it, a picture.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { handle } from './serve.js'
import { chooseBrain } from '../cli/brain.js'
import { streamChat } from '../app/core/llm.js'
import { gameOf } from '../app/caps/games/file.js'
import { asPolicy, tierFor, helpline } from '../app/caps/profiles/tier.js'

/** @import { Chosen } from '../cli/brain.js' */
/** @typedef {Chosen & { name: string, body?: Record<string, unknown> }} Measured the brain, and its name in results.md */
/** @typedef {{ id: string, lang: string, text: string, child?: number }} Brief */
/** @typedef {{ id: string, name?: string, rawInput?: any, rawOutput?: any, status?: string }} Call */
/**
 * @typedef {{ id: string, lang: string, made: boolean, read: boolean, asked: number, page: boolean, rounds: number, clean: boolean,
 *   cleanAt?: number, engine?: string, controls?: [number, number], moments?: string, language: boolean, asking: boolean, left: string[],
 *   original?: boolean, like?: string, seconds: number, tokens: number, compacted: boolean, error?: string }} Run
 */

const DIR = fileURLToPath(new URL('../test/games/', import.meta.url))
// The measured brain, as the page sees it: on its own server, which passes each request on.
const BRAIN = '/measured-brain'
const LONGEST = 20 * 60_000
const ASKING = /[?؟？]\s*$/

/** The year a child of this age was born, in a school year that began in September. @param {number} age */
const bornAt = (age) => { const now = new Date(); return now.getFullYear() - (now.getMonth() < 8 ? 1 : 0) - age }

/**
 * Passes the page's request on to the measured brain, its key and BRAIN_BODY added, and streams its answer back.
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {Measured} measured
 */
async function relay(req, res, { brain, apiKey, body }) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  let sent = Buffer.concat(chunks).toString()
  if (body && sent) sent = JSON.stringify({ ...JSON.parse(sent), ...body })
  const keyed = brain.api === 'anthropic' ? { 'x-api-key': apiKey ?? '', 'anthropic-version': '2023-06-01' } : apiKey ? { authorization: `Bearer ${apiKey}` } : {}
  const answer = await fetch(`${brain.baseURL}${String(req.url).slice(BRAIN.length)}`, { method: req.method, headers: { 'content-type': 'application/json', ...keyed }, ...(req.method !== 'GET' && { body: sent }) })
  res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json' })
  if (answer.body) for await (const chunk of answer.body) res.write(chunk)
  res.end()
}

/**
 * One brief, from a fresh visit: the brief sent, the run followed to its end, its questions answered as Jean recommends;
 * then its conversation, the last game made and a picture of it being played.
 * @param {import('@playwright/test').Browser} browser @param {string} origin @param {Measured} measured @param {Brief} brief
 * @returns {Promise<{ records: any[], file?: string, picture?: string, seconds: number }>}
 */
async function visit(browser, origin, measured, { lang, text, child }) {
  const context = await browser.newContext({ locale: lang, serviceWorkers: 'block', viewport: { width: 1280, height: 800 } })
  const began = Date.now()
  try {
    const page = await context.newPage()
    await page.goto(`${origin}/`)
    await page.locator('.hero-question').waitFor()
    const shown = await page.locator('html').getAttribute('lang')
    if (shown !== lang) throw new Error(`the page opened in ${shown}, not ${lang}`)
    const instructions = child ? asPolicy(tierFor(bornAt(child)), {}, helpline([lang])).instructions : ''
    await page.evaluate(async ({ brain, instructions }) => {
      const { app } = await import('/ui/state.js')
      if (instructions) await app.fs.write('instructions.md', instructions)
      await (await import('/ui/brains.js')).addBrain(brain)
    }, { brain: { id: 'measured', provider: 'custom', api: measured.brain.api, baseURL: `${origin}${BRAIN}`, model: measured.brain.model, label: measured.brain.model }, instructions })
    await page.locator('#prompt').fill(text)
    await page.locator('#prompt').press('Enter')
    const now = () => page.evaluate(async () => {
      const { app } = await import('/ui/state.js')
      return { running: app.running.value.length, answered: (app.current.value?.records ?? []).some((record) => record.by === 'jean') }
    })
    for (let state = await now(); state.running || !state.answered; state = await now()) {
      if (Date.now() - began > LONGEST) throw new Error('still working after 20 minutes')
      const next = page.locator('.ask .ask-actions button').last()
      if (await next.isVisible()) await next.click()
      await page.waitForTimeout(1000)
    }
    const seconds = Math.round((Date.now() - began) / 1000)
    const { records, file } = await page.evaluate(async () => {
      const { app } = await import('/ui/state.js'), { loadConversation } = await import('/core/conversations.js')
      const folder = [app.projectDir, 'games'].filter(Boolean).join('/')
      const [last] = (await app.fs.list(folder).catch(() => [])).filter((entry) => entry.name.endsWith('.game.html')).map((entry) => entry.name).sort().reverse()
      return { records: (await loadConversation(app.fs, app.current.value?.path ?? '')).records, file: last ? await app.fs.read(`${folder}/${last}`) ?? undefined : undefined }
    })
    // Played a few seconds from its cover, its title left with a, as a person would see it.
    const pane = page.locator('app-preview app-game')
    let picture
    if (file && await pane.isVisible()) {
      await page.frameLocator('app-preview app-game iframe').locator('.cover button').first().click({ timeout: 10_000 }).catch(() => {})
      await page.waitForTimeout(1000)
      await page.keyboard.press('Space')
      await page.keyboard.down('ArrowRight')
      await page.waitForTimeout(2500)
      await page.keyboard.up('ArrowRight')
      picture = (await pane.screenshot()).toString('base64')
    }
    return { records, file, picture, seconds }
  } finally {
    await context.close()
  }
}

/** What a tool call answered. @param {Call} call */
const resultOf = (call) => (typeof call.rawOutput === 'string' ? call.rawOutput : '')

/**
 * What a run did, read from its conversation and its last play-test's report.
 * @param {Brief} brief @param {any[]} records @param {number} seconds @returns {Run}
 */
function scored({ id, lang }, records, seconds) {
  /** @type {Map<string, Call>} */
  const calls = new Map()
  let text = '', after = '', tokens = 0, compacted = false
  for (const { update } of records) {
    if (update?.sessionUpdate === 'agent_message_chunk') {
      text += update.content?.text ?? ''
      after += update.content?.text ?? ''
    }
    if (update?.sessionUpdate === 'compaction_update') compacted = true
    if (update?.sessionUpdate !== 'tool_call' && update?.sessionUpdate !== 'tool_call_update') continue
    calls.set(update.toolCallId, { ...calls.get(update.toolCallId), ...update, id: update.toolCallId })
    if (update.name) after = ''
    if (update.kind === 'think' && update.status === 'completed') tokens += (update.rawOutput?.usage?.inputTokens ?? 0) + (update.rawOutput?.usage?.outputTokens ?? 0)
  }
  const named = [...calls.values()].filter((call) => call.name)
  const games = named.filter((call) => call.name === 'game' || call.name === 'game_change')
  const reports = games.map(resultOf)
  const first = named.findIndex((call) => call.name === 'game' || call.name === 'game_change')
  const read = named.findIndex((call) => call.name === 'skill' && String(call.rawInput?.name ?? '').split('/')[0] === 'game')
  const last = reports.at(-1) ?? ''
  const cleanAt = reports.findIndex((report) => /^Nothing to fix\.$/m.test(report)) + 1
  const did = /^(.+?) changed the picture(?:; (.+?) changed nothing)?\.$/m.exec(last), none = /^No control changed the picture \((.+)\)\.$/m.exec(last)
  const count = (/** @type {string | undefined} */ list) => (list ? list.split(', ').length : 0)
  return {
    id, lang, made: games.some((call) => call.status === 'completed'), read: read >= 0 && (first < 0 || read < first), asked: named.filter((call) => call.name === 'ask_user').length,
    page: /```html/.test(text), rounds: games.length, clean: /^Nothing to fix\.$/m.test(last), ...(cleanAt && { cleanAt }),
    engine: [...games].reverse().find((call) => call.rawInput?.engine)?.rawInput.engine,
    ...((did || none) && { controls: /** @type {[number, number]} */ (did ? [count(did[1]), count(did[1]) + count(did[2])] : [0, count(none?.[1])]) }),
    moments: /^Moments: (.+)\.$/m.exec(last)?.[1], language: !/the user's language\.$/m.test(last), asking: ASKING.test(after.trim()),
    left: last.split('\n').filter((line) => /^(Error|Blocked|alert|It never|No control|The words|Too slow|The game froze)/.test(line)),
    seconds, tokens, compacted,
  }
}

/**
 * The judge's reading of a game: whether it copies an existing one. @param {Measured} judge @param {string} brief @param {string} card
 * @param {string | undefined} picture @returns {Promise<{ original?: boolean, like?: string, error?: string }>}
 */
async function judging({ brain, apiKey, body }, brief, card, picture) {
  const content = `Someone asked an assistant for a game, in these words: "${brief}". It made a game; here is its design card${picture ? ', and a picture of it being played' : ''}.

"""
${card}
"""

Say as one JSON object, and nothing else:
- "original": false if it recreates a title someone made (such as Tetris or Flappy Bird): that title's rules with none turned around, or its board, pieces, characters or look, whatever its name. A genre (a falling-block puzzle, a maze chase, a word scramble) is no one's game: true if it is a game of a genre with a rule of its own that changes how it plays, and its own name, characters and look.
- "like": the title it recreates or comes closest to, in three words at most.`
  /** @type {import('../app/core/types.js').ChatMessage[]} */
  const messages = [{ role: 'user', content, ...(picture && { documents: [{ name: 'game.png', text: '', image: { mimeType: 'image/png', data: picture } }] }) }]
  /** @type {typeof fetch} */
  const fetch = (url, init) => globalThis.fetch(url, body && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...body }) } : init)
  let text = ''
  for await (const event of streamChat({ brain, apiKey, messages, maxTokens: 2048, fetch })) if (event.type === 'text') text += event.delta
  try {
    return JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? '')
  } catch {
    return { error: `the judge wrote no JSON: ${text.slice(0, 200)}` }
  }
}

/** The conversation as the brain had it, to read again. @param {any[]} records */
const transcript = (records) => records.map(({ update, by }) => {
  if (update?.sessionUpdate === 'user_message_chunk' && by === 'user') return `## Person\n\n${update.content?.text ?? ''}`
  if (update?.sessionUpdate === 'agent_message_chunk') return update.content?.text ?? ''
  if (update?.sessionUpdate === 'tool_call' && update.name && ['completed', 'failed'].includes(update.status)) return `\n\n### ${update.name}\n\n\`\`\`json\n${JSON.stringify(update.rawInput, null, 1)}\n\`\`\`\n\n${resultOf(update)}\n\n`
  return ''
}).join('')

/** Runs `work` over `items`, `parallel` at a time. @template T @param {T[]} items @param {number} parallel @param {(item: T) => Promise<void>} work */
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
  return { ...found, body: extra ? JSON.parse(extra) : undefined, name: `${found.brain.model} (${[found.brain.provider, extra].filter(Boolean).join(', ')})` }
}

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
async function main(argv, env) {
  const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  if (!env.BRAIN) throw new Error('name a brain: BRAIN=<provider>:<model> (cli/brain.js), its key in <PROVIDER>_API_KEY')
  const measured = await brainNamed(env.BRAIN, env.BRAIN_ADDRESS, env.BRAIN_BODY, env)
  const judge = env.JUDGE ? await brainNamed(env.JUDGE, env.JUDGE_ADDRESS, env.JUDGE_BODY, env) : undefined
  const langs = flag('--lang')?.split(','), only = flag('--only')?.split(','), parallel = Number(flag('--parallel') ?? 3)
  /** @type {{ briefs: Record<string, Record<string, string | number | boolean>> }} */
  const set = JSON.parse(await readFile(`${DIR}set.json`, 'utf8'))
  /** @type {Brief[]} */
  const briefs = Object.entries(set.briefs).filter(([id]) => !only || only.includes(id)).flatMap(([id, brief]) => Object.entries(brief)
    .filter(([lang, text]) => typeof text === 'string' && (!langs || langs.includes(lang))).map(([lang, text]) => ({ id, lang, text: String(text), ...(brief.child && { child: Number(brief.child) }) })))
  const slug = measured.name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '')
  console.log(`games: ${measured.name}${judge ? `, judged by ${judge.name}` : ', no judge'}; ${briefs.length} briefs`)

  const server = createServer((req, res) => {
    (String(req.url).startsWith(`${BRAIN}/`) ? relay(req, res, measured) : handle(req, res)).catch(() => res.destroy())
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const origin = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  /** @type {Run[]} */
  const runs = []
  try {
    await pool(briefs, parallel, async (brief) => {
      const out = `${DIR}.cache/${slug}/${brief.id}-${brief.lang}/`
      await mkdir(out, { recursive: true })
      /** @type {Run} */
      let run
      try {
        const { records, file, picture, seconds } = await visit(browser, origin, measured, brief)
        run = scored(brief, records, seconds)
        await writeFile(`${out}conversation.md`, transcript(records))
        if (file) await writeFile(`${out}game.html`, file)
        if (picture) await writeFile(`${out}game.png`, Buffer.from(picture, 'base64'))
        const card = file ? gameOf(file)?.card : undefined
        if (judge && card) Object.assign(run, await judging(judge, brief.text, card, picture).catch((error) => ({ error: `the judge failed: ${error.message ?? error}` })))
      } catch (error) {
        run = { ...scored(brief, [], 0), error: error instanceof Error ? error.message : String(error) }
      }
      runs.push(run)
      await writeFile(`${out}run.json`, JSON.stringify(run, null, 1))
      console.log(`  ${brief.id} ${brief.lang}: ${cell(run)}${run.left.length ? ` (${run.left[0]})` : ''}`)
    })
  } finally {
    await browser.close()
    server.close()
    await measured.close?.()
    await judge?.close?.()
  }
  const order = Object.entries(set.briefs).flatMap(([id, brief]) => Object.entries(brief).filter(([, text]) => typeof text === 'string').map(([lang]) => `${id} ${lang}`))
  const named = new Set(Object.entries(set.briefs).filter(([, brief]) => brief.named).map(([id]) => id))
  const sorted = (/** @type {Run[]} */ list) => list.sort((a, b) => order.indexOf(`${a.id} ${a.lang}`) - order.indexOf(`${b.id} ${b.lang}`))
  console.log(`\n${report(measured, judge, sorted(runs), named)}`)
  // Written from each brief's latest run kept here, so that some briefs run again replace only theirs.
  const kept = await readdir(`${DIR}.cache/${slug}`).catch(() => [])
  const latest = await Promise.all(kept.filter((name) => order.includes(name.replace(/-(\w+)$/, ' $1'))).map(async (name) => JSON.parse(await readFile(`${DIR}.cache/${slug}/${name}/run.json`, 'utf8').catch(() => 'null'))))
  if (argv.includes('--write')) await write(measured, report(measured, judge, sorted(latest.filter(Boolean)), named))
}

/** A run in a few characters: clean or not, the round it was clean on, its engine, a copy. @param {Run} run */
function cell(run) {
  if (run.error) return `— ${run.error.slice(0, 60)}`
  if (!run.made) return run.page ? '✗ a page' : run.asked ? '✗ asked' : '✗ no game'
  return `${run.clean ? '✓' : '✗'} ${run.cleanAt ?? run.rounds} · ${run.engine ?? '?'}${run.original === false ? ` · redraws ${(run.like ?? '?').split(/[(（—,:：]/)[0].trim()}` : ''}`
}

/**
 * This brain's section: what it made, how often clean and on which round, what it did around it, then each brief by language.
 * Originality is counted where a brief names an existing game; elsewhere the judge's titles are often genres, shown in the table.
 * @param {Measured} measured @param {Measured | undefined} judge @param {Run[]} every @param {Set<string>} named the briefs that name a game
 */
function report({ name }, judge, every, named) {
  const runs = every.filter((run) => !run.error)
  const of = (/** @type {(run: Run) => boolean | undefined} */ test) => runs.filter(test).length
  const median = (/** @type {number[]} */ list) => list.sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0
  const judged = runs.filter((run) => 'original' in run && named.has(run.id)), others = runs.filter((run) => run.original === false && !named.has(run.id))
  const langs = [...new Set(every.map((run) => run.lang))], ids = [...new Set(every.map((run) => run.id))]
  const rows = ids.map((id) => `| ${id} | ${langs.map((lang) => { const run = every.find((one) => one.id === id && one.lang === lang); return run ? cell(run) : '' }).join(' | ')} |`)
  const left = runs.filter((run) => run.made && !run.clean).map((run) => `- ${run.id}, ${run.lang}: ${run.left.join(' ') || 'its last call failed'}`)
  const errors = every.length - runs.length, minutes = Math.round(median(runs.map((run) => run.seconds)) / 6) / 10
  return `## ${name}, ${new Date().toISOString().slice(0, 10)}

Made a game on ${of((run) => run.made)} of ${runs.length} briefs, with nothing left to fix on ${of((run) => run.clean)}, ${of((run) => run.cleanAt === 1)} of them on the first play-test and ${of((run) => (run.cleanAt ?? 0) > 3)} after the third. Read the skill before its first game on ${of((run) => run.read)}, asked the person on ${of((run) => run.asked > 0)}, wrote a page instead on ${of((run) => run.page && !run.made)}, and ended on a question on ${of((run) => run.asking)}. On the last play-test, no control changed the picture on ${of((run) => run.controls?.[0] === 0)}, and the words were in the person's language on ${of((run) => run.made && run.language)}.${judge ? ` Asked for an existing game, it made an original one of its kind on ${judged.filter((run) => run.original).length} of ${judged.length}, judged by ${judge.name}, who named a title for ${others.length} of the other games too.` : ' No judge: originality not judged.'} A brief took ${minutes} minute${minutes === 1 ? '' : 's'} and ${Math.round(median(runs.map((run) => run.tokens)) / 1000)}k tokens at the median${runs.some((run) => run.compacted) ? `; ${of((run) => run.compacted)} were summed up near the brain's window` : ''}.${errors ? ` ${errors} failed, left out.` : ''}

✓ clean, ✗ not; then the play-test it was clean on, or how many it took; then the engine; then the game it redraws, if the judge says so.

| Brief | ${langs.join(' | ')} |
|---|${langs.map(() => '---').join('|')}|
${rows.join('\n')}
${left.length ? `\nLeft to fix:\n${left.join('\n')}\n` : ''}`
}

const SUMMARY = '## Every brain'

/** Every brain side by side, read back from each section's first lines. @param {string[]} sections */
function summary(sections) {
  const rows = sections.map((part) => {
    const heading = part.slice(3, part.indexOf('\n'))
    const read = (/** @type {RegExp} */ pattern) => pattern.exec(part)?.slice(1).join(' of ') ?? '—'
    return `| ${heading.slice(0, heading.lastIndexOf(', '))} | ${read(/Made a game on (\d+) of (\d+)/)} | **${read(/nothing left to fix on (\d+)/)}** | ${read(/(\d+) of them on the first/)} | ${read(/asked the person on (\d+)/)} | ${read(/original one of its kind on (\d+ of \d+)/)} |`
  })
  return `${SUMMARY}

| Brain | Made | Clean | First try | Asked | Original when one is named |
|---|---:|---:|---:|---:|---:|
${rows.join('\n')}`
}

/** Writes this brain's section into results.md, in place of its last one, under every brain's summary. @param {Measured} measured @param {string} section */
async function write({ name }, section) {
  const before = await readFile(`${DIR}results.md`, 'utf8').catch(() => '')
  const kept = before.split(/^(?=## )/m).slice(1).filter((part) => !part.startsWith(`## ${name}, `) && !part.startsWith(SUMMARY))
  const sections = [section, ...kept].map((part) => part.trimEnd())
  await writeFile(`${DIR}results.md`, `# Games: how often a brain makes one that plays clean

Written by \`npm run games -- --write\`, one section per brain, replaced when that brain is measured again. Each brief of
set.json is a fresh visit to Jean in its language, the measured brain answering through Jean's own prompt, the skill
"Make a game", its tools and their play-test, unguided: a question it asks gets Jean's recommended answer. A game is clean
when its last play-test has nothing to fix. The judge sees the brief, the card and a picture of the game being played,
and says whether it recreates a title someone made, which is counted where a brief names one: elsewhere the titles it
names are often genres. A brief that failed for another reason than the brain is left out.

${[summary(sections), ...sections].join('\n\n')}
`)
}

main(process.argv.slice(2), process.env).catch((error) => {
  console.error(`games: ${error.message}`)
  process.exit(1)
})
