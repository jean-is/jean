// Measures how well a brain gives a design's facts (Designs' phase 0, take 8): each request of
// test/designs/<lang>.json goes to the brain once, as the first message of a conversation, with Jean's
// base prompt, the capability's line and rule, and design as its only tool (spikes/designs/tool.js).
// What the brain sends is repaired as Jean would (repair()), then scored against what the request
// should give (test/designs/set.json and the language's facts): every fact of the request, as that
// language writes it; nothing made up that the request didn't give (a phone number, a time, a date, a
// price); a size that's right for it; words in the request's script; and the marks Jean's checks put
// on it (a weekday that isn't its date's, a gap where a fact is missing), none where none is due.
// Every brain gets Designs, so this sets no gate: it says where the schema, Jean's repairs and the
// person's hand have to make up the difference.
// The brain comes from the environment, as for npm run tables: BRAIN, <provider>:<model> as
// jean-cli's --brain (cli/brain.js), its key in <PROVIDER>_API_KEY, BRAIN_ADDRESS for a server of
// your own, and BRAIN_BODY, JSON added to each request.
// Usage: BRAIN=lmstudio:google/gemma-4-e2b BRAIN_BODY='{"reasoning_effort":"none"}' npm run designs
//        npm run designs -- --lang fr,ja      some languages
//        npm run designs -- --only menu,garage some requests
//        npm run designs -- --runs 3          each request three times (default 1)
//        npm run designs -- --parallel 2      requests at a time (default 4)
//        npm run designs -- --strict          the reply held to what Jean takes while it decodes (STRICT), on a
//                                             server that holds replies to a JSON Schema (LM Studio, llama.cpp, vLLM)
//        npm run designs -- --wording a     design as first measured (DESIGN_A: no list, a gap for anything missing),
//                                             or c (DESIGN_C: a gap for anything missing, the list, "numbers too")
//        npm run designs -- --write           also write this brain's section of test/designs/results.md
//        npm run designs -- --verbose         and every miss
//        npm run designs -- --save <file>     also keep every reply, to score again
//        npm run designs -- --from <file>     score replies kept before, against the set as it is now, asking no brain
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chooseBrain } from '../cli/brain.js'
import { buildSystemPrompt } from '../app/core/prompt.js'
import { streamChat } from '../app/core/llm.js'
import { toolCall } from '../app/caps/brain-local/gemma.js'
import { DESIGN, DESIGN_A, DESIGN_C, STRICT, LINE, RULE, ROLES, repair, partsOf } from '../spikes/designs/tool.js'
import { marks, readDates, fold } from '../spikes/designs/checks.js'

/** @import { Chosen } from '../cli/brain.js' */
/** @typedef {{ facts: string[][], size: string[], missing: string[], marks: string[] }} Expected */
/** @typedef {{ right: boolean, taken: boolean, misses: string[], facts: number, found: number, madeUp: string[], sized: boolean, scripted: boolean, marked: boolean, falseMarks: string[], repairs: string[] }} Score */
/** @typedef {Score & { lang: string, id: string, called: boolean, tries: number, read?: boolean, error?: string, said?: string, args?: unknown }} Outcome */
/** tool: design as measured, its first wording (A) or the one tool.js holds. @typedef {Chosen & { name: string, body?: Record<string, unknown>, strict?: boolean, tool: import('../app/core/types.js').ToolSpec }} Measured */

const DIR = fileURLToPath(new URL('../test/designs/', import.meta.url))
const LANGS = /** @type {Record<string, string>} */ ({ en: 'English', fr: 'French', ar: 'Arabic', ja: 'Japanese', es: 'Spanish', de: 'German', ru: 'Russian', vi: 'Vietnamese' })
const MAX_TOKENS = 4096
const TRIES = 3

// What a brain may make up, as the words show it, after folding (ASCII digits, no accents).
const MADE_UP = /** @type {Record<string, (text: string, lang: string) => boolean>} */ ({
  phone: (text) => [...text.matchAll(/\+?\d[\d .\-()]{5,}\d/g)].some(([run]) => run.replace(/\D/g, '').length >= 8 && !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(run.trim())),
  time: (text) => [
    /(?<!\d)\d{1,2}\s?[:h]\s?\d{2}(?!\d)/, /(?<!\d)\d{1,2}\s?(?:am|pm|a\.\s?m|p\.\s?m)(?!\p{L})/u, /(?<!\d)\d{1,2}\s?(?:h|uhr|gio|ч|heures?)(?!\p{L})/u,
    /午[前後]\s?\d|\d{1,2}\s?時/, /الساعة\s?\d/, /\d\s?(?:صباحا|مساء|عصرا|ظهرا)/,
  ].some((pattern) => pattern.test(text)),
  date: (text, lang) => readDates(text, lang).length > 0,
  price: (text) => /[€$£¥₽]\s?\d|\d\s?[€$£¥₽]|\d\s?(?:eur|euros?|dollars?|円|يورو|руб|đong)(?!\p{L})/u.test(text),
})

/** Whether the words are in the request's script: Arabic, Japanese, Cyrillic, else Latin. @param {string} text @param {string} lang */
function scripted(text, lang) {
  const letters = [...text].filter((char) => /\p{L}/u.test(char))
  if (!letters.length) return false
  const share = (/** @type {RegExp} */ pattern) => letters.filter((char) => pattern.test(char)).length / letters.length
  if (lang === 'ar') return share(/\p{Script=Arabic}/u) >= 0.6
  if (lang === 'ja') return share(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u) >= 0.4
  if (lang === 'ru') return share(/\p{Script=Cyrillic}/u) >= 0.6
  return share(/\p{Script=Latin}/u) >= 0.8
}

/**
 * How a design the brain sent fares against what its request should give, once Jean has repaired it.
 * @param {Expected} expected @param {unknown} args what the brain sent to design, null when it sent nothing
 * @param {string} lang @param {Date} now @returns {Score}
 */
export function score(expected, args, lang, now) {
  const none = { facts: expected.facts.length, found: 0, madeUp: [], sized: false, scripted: false, marked: false, falseMarks: [], repairs: [] }
  const repaired = repair(args, lang)
  if (!repaired) return { right: false, taken: false, misses: [args ? 'nothing to lay out' : 'no design'], ...none }
  const { facts, repairs } = repaired
  const words = fold(ROLES.map((role) => facts.words[role] ?? '').join('\n'), lang)
  /** @type {string[]} */
  const misses = []
  const found = expected.facts.filter((names) => names.some((name) => words.includes(fold(name, lang))))
  for (const names of expected.facts) if (!found.includes(names)) misses.push(`no ${names[0]}`)
  const madeUp = expected.missing.filter((kind) => MADE_UP[kind]?.(words, lang))
  for (const kind of madeUp) misses.push(`made up a ${kind}`)
  const sized = expected.size.includes(facts.size)
  if (!sized) misses.push(`size ${facts.size}`)
  const inScript = scripted(words, lang)
  if (!inScript) misses.push('not in its script')
  const kinds = new Set(marks(partsOf(facts, lang), { now }).map((mark) => mark.kind))
  const marked = expected.marks.every((kind) => kinds.has(kind))
  for (const kind of expected.marks) if (!kinds.has(kind)) misses.push(`no ${kind} mark`)
  // A weekday or reply mark where none is due is wrong; an event "past" on a date that isn't one is a false alarm, counted apart.
  const wrong = ['weekday', 'reply'].filter((kind) => kinds.has(kind) && !expected.marks.includes(kind))
  for (const kind of wrong) misses.push(`${kind} mark`)
  const falseMarks = [...kinds].filter((kind) => !expected.marks.includes(kind) && !wrong.includes(kind))
  return { right: !misses.length, taken: true, misses, facts: expected.facts.length, found: found.length, madeUp, sized, scripted: inScript, marked: marked && !wrong.length, falseMarks, repairs }
}

/** The set in one language: its requests, and what each should give. @param {string} lang */
export async function setIn(lang) {
  const shared = JSON.parse(await readFile(`${DIR}set.json`, 'utf8')).requests
  const set = JSON.parse(await readFile(`${DIR}${lang}.json`, 'utf8'))
  /** @type {Record<string, Expected>} */
  const expected = Object.fromEntries(Object.keys(shared).map((id) => [id, { ...shared[id], facts: set.facts[id] }]))
  return { requests: /** @type {Record<string, string>} */ (set.requests), expected }
}

/**
 * A design call in Gemma 4's own syntax, design{…}, which a server's parser may leave in the text,
 * read by Jean's device runtime's parser (caps/brain-local/gemma.js).
 * @param {string} text @returns {unknown}
 */
function gemmaCall(text) {
  const start = text.search(new RegExp(`(?:call:)?${DESIGN.name}\\s*\\{`))
  if (start < 0) return null
  const ends = [...text.slice(start).matchAll(/\}/g)].map((match) => start + /** @type {number} */ (match.index) + 1).reverse()
  for (const end of ends) {
    const { args } = toolCall(text.slice(start, end), 1)
    if (!args.__invalidJSON) return args
  }
  return null
}

/**
 * What the brain sends for one request: the arguments of its design call, or what it said. A design
 * Jean can make nothing of goes back to the brain with why, as in Jean, up to three tries in all.
 * @param {Measured} measured @param {string} lang @param {string} text
 * @returns {Promise<{ args: unknown, said: string, tries: number, read?: boolean }>}
 */
async function ask({ brain, apiKey, body, strict, tool }, lang, text) {
  const rules = [RULE, ...(strict ? [`Answer with the design to lay out, as the arguments of ${tool.name} in JSON: ${tool.description} Its arguments: ${JSON.stringify(tool.parameters)}`] : [])]
  const system = buildSystemPrompt({ assistantName: 'Jean', uiLanguage: LANGS[lang], tools: [LINE], rules, now: new Date() })
  const added = { ...body, ...(strict ? { response_format: { type: 'json_schema', json_schema: { name: tool.name, strict: true, schema: STRICT } } } : {}) }
  /** @type {typeof fetch} */
  const fetch = (url, init) => globalThis.fetch(url, typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...added }) } : init)
  /** @type {import('../app/core/types.js').ChatMessage[]} */
  const messages = [{ role: 'user', content: text }]
  if (strict) {
    let reply = ''
    for await (const event of streamChat({ brain, apiKey, fetch, system, messages, maxTokens: MAX_TOKENS })) if (event.type === 'text') reply += event.delta
    try {
      return { args: JSON.parse(reply), said: reply, tries: 1 }
    } catch {
      return { args: null, said: reply, tries: 1 }
    }
  }
  let said = ''
  /** @type {unknown} */
  let args = null
  for (let tries = 1; tries <= TRIES; tries++) {
    /** @type {import('../app/core/types.js').ToolCall | undefined} */
    let call
    /** @type {import('../app/core/types.js').AssistantMessage | undefined} */
    let message
    let reply = ''
    for await (const event of streamChat({ brain, apiKey, fetch, system, messages, tools: [tool], maxTokens: MAX_TOKENS })) {
      if (event.type === 'tool_call' && event.call.name === DESIGN.name) call ??= event.call
      if (event.type === 'text') reply += event.delta
      if (event.type === 'done') message = event.message
    }
    said += reply
    if (!call) {
      const read = gemmaCall(reply)
      return read ? { args: read, said, tries, read: true } : { args, said, tries }
    }
    args = call.args
    if (repair(args) || !message) return { args, said, tries }
    messages.push(message, ...(message.toolCalls ?? []).map((one) => /** @type {const} */ ({ role: 'tool', toolCallId: one.id, name: one.name, isError: true, content: one === call ? 'There is nothing to lay out: give words, with a title at least.' : 'Not run.' })))
  }
  return { args, said, tries: TRIES }
}

/** Runs `work` over `items`, `parallel` at a time. @template T @param {T[]} items @param {number} parallel @param {(item: T) => Promise<void>} work */
async function pool(items, parallel, work) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, async () => {
    while (next < items.length) await work(items[next++])
  }))
}

/** @param {number} part @param {number} whole */
const percent = (part, whole) => (whole ? `${Math.round(part / whole * 100)}%` : '—')

/**
 * This brain's section: how often its design was right, then why not: the facts it kept, what it made
 * up, the size, the script, the marks; per language and per request.
 * @param {Measured} measured @param {Outcome[]} all @param {number} runs
 */
function report({ name }, all, runs) {
  // A request the server failed says nothing of the brain.
  const outcomes = all.filter((one) => !one.error)
  const right = outcomes.filter((one) => one.right).length
  /** @param {Outcome[]} items */
  const row = (items) => {
    const taken = items.filter((one) => one.taken)
    const sum = (/** @type {'facts' | 'found'} */ key) => taken.reduce((total, one) => total + one[key], 0)
    return `${percent(items.filter((one) => one.called).length, items.length)} | ${percent(taken.length, items.length)} | ${percent(sum('found'), sum('facts'))} | ${percent(taken.filter((one) => !one.madeUp.length).length, taken.length)} | ${percent(taken.filter((one) => one.sized).length, taken.length)} | ${percent(taken.filter((one) => one.scripted).length, taken.length)} | ${percent(taken.filter((one) => one.marked).length, taken.length)} | **${percent(items.filter((one) => one.right).length, items.length)}**`
  }
  const langs = [...new Set(outcomes.map((one) => one.lang))]
  const ids = [...new Set(outcomes.map((one) => one.id))]
  const errors = all.length - outcomes.length
  const read = outcomes.filter((one) => one.read).length
  const repaired = outcomes.filter((one) => one.repairs.length)
  const repairs = Object.entries(Object.groupBy(repaired.flatMap((one) => one.repairs), (kind) => kind)).sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0)).map(([kind, list]) => `${kind} (${list?.length})`).join(', ')
  const alarms = Object.entries(Object.groupBy(outcomes.flatMap((one) => one.falseMarks.map((kind) => `${kind} on ${one.id}`)), (kind) => kind)).map(([kind, list]) => `${kind} (${list?.length})`).join(', ')
  return `## ${name}, ${new Date().toISOString().slice(0, 10)}

Right on ${percent(right, outcomes.length)} of ${outcomes.length} designs (${langs.length} languages, ${ids.length} requests${runs > 1 ? `, ${runs} runs each` : ''}).${read ? ` ${read} calls were read from Gemma's syntax in the text, as Jean's device runtime reads them.` : ''}${errors ? ` ${errors} requests the server failed are left out.` : ''}${repaired.length ? ` Jean repaired ${repaired.length}: ${repairs}.` : ''}${alarms ? ` Marks no request called for, as false alarms: ${alarms}.` : ''}

| Language | Called design | Taken | Facts kept | Nothing made up | Size | Script | Marks | Right |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${langs.map((lang) => `| ${lang} | ${row(outcomes.filter((one) => one.lang === lang))} |`).join('\n')}
| **All** | ${row(outcomes)} |

| Request | ${langs.join(' | ')} | Commonest misses |
|---|${langs.map(() => '---:').join('|')}|---|
${ids.map((id) => {
    const of = outcomes.filter((one) => one.id === id)
    const misses = Object.entries(Object.groupBy(of.flatMap((one) => one.misses), (miss) => miss)).sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0)).slice(0, 3).map(([miss, list]) => `${miss.replaceAll('|', '/').replaceAll('\n', ' ')} (${list?.length})`).join('; ')
    return `| ${id} | ${langs.map((lang) => { const items = of.filter((one) => one.lang === lang); return `${items.filter((one) => one.right).length}/${items.length}` }).join(' | ')} | ${misses || '—'} |`
  }).join('\n')}
`
}

const SUMMARY = '## Every brain'

/** Every brain's share of right designs, read back from its section. @param {string[]} sections */
function summary(sections) {
  return `${SUMMARY}

| Brain | Right | Facts kept | Nothing made up |
|---|---:|---:|---:|
${sections.map((part) => {
    const heading = part.slice(3, part.indexOf('\n'))
    const right = /^Right on (\d+)%/m.exec(part)?.[1]
    const all = /^\| \*\*All\*\* \|(.*)$/m.exec(part)?.[1].split('|').map((cell) => cell.trim()) ?? []
    return `| ${heading.slice(0, heading.lastIndexOf(', '))} | ${right ? `${right}%` : '—'} | ${all[2] ?? '—'} | ${all[3] ?? '—'} |`
  }).join('\n')}`
}

/** Writes this brain's section into results.md, in place of its last one. @param {Measured} measured @param {string} section */
async function write({ name }, section) {
  const before = await readFile(`${DIR}results.md`, 'utf8').catch(() => '')
  const kept = before.split(/^(?=## )/m).slice(1).filter((part) => !part.startsWith(`## ${name}, `) && !part.startsWith(SUMMARY))
  const sections = [section, ...kept].map((part) => part.trimEnd())
  await writeFile(`${DIR}results.md`, `# Designs: how well brains give a design's facts

Written by \`npm run designs -- --write\`, one section per brain, replaced when that brain is measured
again. Each request asks for something to print, post or send, as the first message of a conversation,
with Jean's base prompt, design's line and rule, and that tool alone; a design Jean can make nothing of
goes back to the brain with why, up to three tries. What the brain sends is repaired as Jean would, then
scored: every fact of the request, as its language writes it ("facts kept", over the designs taken);
nothing made up that the request didn't give (a phone number, a time, a date, a price); a size that's
right for it; words in the request's script; and the marks Jean's checks put on it, a weekday that isn't
its date's and a gap where a fact is missing, with none where none is due. A design is right when all of
that holds. Every brain gets Designs (24 October 2026), so there is no gate: this says where the schema,
Jean's repairs and the person's hand have to make up the difference.

${[summary(sections), ...sections].join('\n\n')}
`)
}

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
async function main(argv, env) {
  const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const from = flag('--from')
  if (from) return rescore(argv, JSON.parse(await readFile(from, 'utf8')))
  if (!env.BRAIN) throw new Error('name a brain: BRAIN=<provider>:<model> (cli/brain.js), its key in <PROVIDER>_API_KEY')
  const found = await chooseBrain({ named: env.BRAIN, address: env.BRAIN_ADDRESS, env })
  if (!found) throw new Error(`no brain "${env.BRAIN}"`)
  if ('needs' in found) throw new Error(`name ${found.needs}'s model: BRAIN=${found.needs}:<model>`)
  const body = env.BRAIN_BODY ? JSON.parse(env.BRAIN_BODY) : undefined
  const strict = argv.includes('--strict')
  const wording = flag('--wording')
  /** @type {Measured} */
  const chosen = { ...found, body, strict, tool: wording === 'a' ? DESIGN_A : wording === 'c' ? DESIGN_C : DESIGN, name: `${found.brain.model} (${[found.brain.provider, env.BRAIN_BODY, strict && 'held to what Jean takes', wording && `wording ${wording.toUpperCase()}`].filter(Boolean).join(', ')})` }
  const langs = (flag('--lang')?.split(',') ?? Object.keys(LANGS)).filter((lang) => LANGS[lang])
  const runs = Number(flag('--runs') ?? 1)
  const parallel = Number(flag('--parallel') ?? 4)
  const now = new Date()
  console.log(`designs: ${chosen.name}`)
  /** @type {Outcome[]} */
  const outcomes = []
  try {
    for (const lang of langs) {
      const { requests, expected } = await setIn(lang)
      const only = flag('--only')?.split(',')
      const jobs = Object.keys(requests).filter((id) => !only || only.includes(id)).flatMap((id) => Array.from({ length: runs }, () => id))
      /** @type {Outcome[]} */
      const here = []
      const work = async (/** @type {string} */ id) => {
        try {
          const { args, said, tries, read } = await ask(chosen, lang, requests[id])
          here.push({ lang, id, called: Boolean(args), tries, ...(read ? { read } : {}), ...score(expected[id], args, lang, now), ...(args ? { args } : { said: said.slice(0, 300) }) })
        } catch (error) {
          here.push({ lang, id, called: false, tries: 0, ...score(expected[id], null, lang, now), misses: ['error'], error: /** @type {Error} */ (error).message })
        }
      }
      // The first request alone: a server that loads its brain on demand (LM Studio) refuses others meanwhile.
      if (lang === langs[0] && jobs.length) await work(/** @type {string} */ (jobs.shift()))
      await pool(jobs, parallel, work)
      here.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      outcomes.push(...here)
      const errors = here.filter((one) => one.error)
      console.log(`${lang.padEnd(4)} right ${here.filter((one) => one.right).length}/${here.length}${errors.length ? `  errors ${errors.length}: ${errors[0].error}` : ''}`)
      if (errors.length === here.length) throw new Error(`every request failed: ${errors[0].error}`)
    }
  } finally {
    await chosen.close?.()
  }
  if (argv.includes('--verbose')) {
    for (const one of outcomes.filter((item) => !item.right)) console.log(`${one.lang} ${one.id}: ${one.misses.join('; ')}\n  ${JSON.stringify(one.args ?? one.said ?? one.error)}`)
  }
  const save = flag('--save')
  if (save) await writeFile(save, JSON.stringify({ name: chosen.name, runs, now: now.toISOString(), outcomes }))
  const section = report(chosen, outcomes, runs)
  console.log(`\n${section}`)
  if (argv.includes('--write')) await write(chosen, section)
}

/** Replies kept by --save, scored again against the set as it is now. @param {string[]} argv @param {{ name: string, runs: number, now: string, outcomes: Outcome[] }} kept */
async function rescore(argv, { name, runs, now, outcomes }) {
  /** @type {Record<string, Record<string, Expected>>} */
  const sets = {}
  for (const lang of new Set(outcomes.map((one) => one.lang))) sets[lang] = (await setIn(lang)).expected
  const scored = outcomes.map((one) => ({ ...one, ...score(sets[one.lang][one.id], one.args ?? null, one.lang, new Date(now)), ...(one.error ? { right: false, misses: ['error'] } : {}) }))
  if (argv.includes('--verbose')) for (const one of scored.filter((item) => !item.right)) console.log(`${one.lang} ${one.id}: ${one.misses.join('; ')}\n  ${JSON.stringify(one.args ?? one.said ?? one.error)}`)
  const measured = /** @type {Measured} */ ({ name })
  const section = report(measured, scored, runs)
  console.log(section)
  if (argv.includes('--write')) await write(measured, section)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).catch((error) => {
    console.error(`designs: ${error.message}`)
    process.exit(1)
  })
}
