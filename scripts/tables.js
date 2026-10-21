// Measures how well a brain makes a table from a request to keep track of something (Tables'
// phase 0): each request of test/tables/<lang>.json goes to the brain once, as the first message
// of a conversation, with Jean's base prompt, the capability's line, and table_create as its only
// tool (caps/tables/tool.js; Tables isn't in the app yet, so the prompt is built here rather than
// read from the page). What the brain sends is made into a table as Jean would make it, then
// scored against the table the request should give: every column it needs, named in the request's
// language (any of the names the set takes, in any form), of a kind that works for it, and a
// status's steps, all but one when there are three or more. Other columns are fine.
// The brain comes from the environment, as for npm run offers: BRAIN, <provider>:<model> as
// jean-cli's --brain (cli/brain.js), its key in <PROVIDER>_API_KEY, BRAIN_ADDRESS for a server of
// your own, and BRAIN_BODY, JSON added to each request.
// Usage: BRAIN=lmstudio:google/gemma-4-e2b BRAIN_BODY='{"reasoning_effort":"none"}' npm run tables
//                                            the device's brain, which doesn't think there either
//        npm run tables -- --lang fr,ja      some languages
//        npm run tables -- --only jobs,books some requests
//        npm run tables -- --runs 3          each request three times (default 1)
//        npm run tables -- --parallel 2      requests at a time (default 4)
//        npm run tables -- --write           also write this brain's section of test/tables/results.md
//        npm run tables -- --verbose         and every miss
//        npm run tables -- --description '…' table_create's description in place of its own, to try one
//        npm run tables -- --save <file>     also keep every reply, to score again
//        npm run tables -- --from <file>     score replies kept before, against the set as it is now, asking no brain
//        npm run tables -- --strict          the brain's reply held to what Jean takes while it decodes (STRICT), on a
//                                            server that holds replies to a JSON Schema (LM Studio, llama.cpp, vLLM)
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chooseBrain } from '../cli/brain.js'
import { buildSystemPrompt } from '../app/core/prompt.js'
import { streamChat } from '../app/core/llm.js'
import { toolCall } from '../app/caps/brain-local/gemma.js'
import { createTable, MADE } from '../app/caps/tables/table.js'
import { TABLE_CREATE, LINE } from '../app/caps/tables/tool.js'

/** @import { Chosen } from '../cli/brain.js' */
/** names: any of them, in any form; type: the kinds that are right (also: those that work); options: a status's or select's steps. @typedef {{ names: string[], type: string | string[], also?: string[], options?: { names: string[] }[] }} Expected */
/** taken: whether Jean made the table it sent; wanted: the columns the request needs; named, typed: those found, and of a kind that works; steps, stepped: those with steps, and right. @typedef {{ correct: boolean, taken: boolean, misses: string[], wanted: number, named: number, typed: number, steps: number, stepped: number }} Score */
/** tries: how many tables the brain sent before one Jean took, or gave up; read: from Gemma's syntax in the text. @typedef {Score & { lang: string, id: string, called: boolean, tries: number, read?: boolean, error?: string, said?: string, args?: unknown }} Outcome */
/** tool: table_create as measured; strict: its reply held to STRICT. @typedef {Chosen & { name: string, body?: Record<string, unknown>, tool: import('../app/core/types.js').ToolSpec, strict?: boolean }} Measured */

const DIR = fileURLToPath(new URL('../test/tables/', import.meta.url))
const LANGS = /** @type {Record<string, string>} */ ({ en: 'English', fr: 'French', ar: 'Arabic', ja: 'Japanese' })
const MAX_TOKENS = 4096
// As Jean's loop does, a refused table goes back to the brain, which may try again.
const TRIES = 3
const GATE = 0.8
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

const TEXT = { type: 'string', minLength: 1 }
/**
 * What Jean takes from table_create, as a JSON Schema a server can hold a brain's decoding to: a
 * name, columns of a type from the list, a select's choices and a status's two steps or more.
 * Only that names are each their own is left to Jean.
 */
export const STRICT = {
  type: 'object',
  properties: {
    name: TEXT,
    columns: {
      type: 'array',
      minItems: 1,
      items: {
        anyOf: [
          { type: 'object', properties: { name: TEXT, type: { enum: MADE.filter((type) => !['select', 'multi-select', 'status'].includes(type)) } }, required: ['name', 'type'], additionalProperties: false },
          { type: 'object', properties: { name: TEXT, type: { enum: ['select', 'multi-select'] }, options: { type: 'array', minItems: 1, items: TEXT } }, required: ['name', 'type', 'options'], additionalProperties: false },
          { type: 'object', properties: { name: TEXT, type: { const: 'status' }, options: { type: 'array', minItems: 2, items: TEXT } }, required: ['name', 'type', 'options'], additionalProperties: false },
        ],
      },
    },
  },
  required: ['name', 'columns'],
  additionalProperties: false,
}

/**
 * A name as compared: without accents or vowel marks, one form of each Arabic letter and no
 * "al-" before a word, lower case, its words apart.
 * @param {string} text
 */
export const normal = (text) => String(text).normalize('NFKD').replace(/[\u0300-\u036f\u0640\u064b-\u065f\u0670]/g, '').normalize('NFKC')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').map((word) => word.replace(/^(?:ال|وال|بال|لل)(?=\p{L}{2})/u, '')).join(' ')

/**
 * Whether a name is one the set takes: in Chinese or Japanese, the name holds it; else its words
 * start the name's words, one after the other ("interview" names "Interviewing", "date" not "Update").
 * @param {string} wanted @param {string} name
 */
function fits(wanted, name) {
  const [w, n] = [normal(wanted), normal(name)]
  if (!w || !n) return false
  if (CJK.test(w)) return n.replaceAll(' ', '').includes(w.replaceAll(' ', ''))
  const words = n.split(' ')
  const parts = w.split(' ')
  return words.some((_, i) => parts.every((part, j) => words[i + j]?.startsWith(part)))
}

/** The first of `names` that one of `wanted` fits, or -1. @param {string[]} wanted @param {string[]} names */
export const matchNames = (wanted, names) => names.findIndex((name) => wanted.some((one) => fits(one, name)))

/**
 * Which of `found` each of `wanted` is, one each, -1 for none: as many as can be, among the columns of
 * a kind that works (Kuhn's matching), each tried first when more of its steps are those wanted, then
 * when it is of a right kind, then by the first of the names that fits it. A column of a kind that
 * doesn't work goes, once no other is left, to what has none, so its miss says what came instead.
 * @param {{ names: string[], kinds?: string[], also?: string[], options?: { names: string[] }[] }[]} wanted
 * @param {{ name: string, type?: string, options?: { name: string }[] }[]} found @returns {number[]}
 */
function assign(wanted, found) {
  const ranked = wanted.map(({ names, kinds = [], also = [], options }) => {
    const works = (/** @type {number} */ j) => !found[j].type || [...kinds, ...also].includes(found[j].type ?? '')
    const rank = (/** @type {number} */ j) => {
      const { name, type = '', options: steps = [] } = found[j]
      return [options ? assign(options, steps).filter((at) => at < 0).length : 0, kinds.includes(type) ? 0 : 1, names.findIndex((one) => fits(one, name))]
    }
    const order = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.reduce((first, x, i) => first || x - b[i], 0)
    const all = found.map((_, j) => j).filter((j) => names.some((name) => fits(name, found[j].name))).sort((a, b) => order(rank(a), rank(b)))
    return { all, working: all.filter(works) }
  })
  const owner = found.map(() => -1)
  /** @param {number} i @param {Set<number>} seen @returns {boolean} */
  const take = (i, seen) => ranked[i].working.some((j) => {
    if (seen.has(j)) return false
    seen.add(j)
    if (owner[j] >= 0 && !take(owner[j], seen)) return false
    owner[j] = i
    return true
  })
  wanted.forEach((_, i) => take(i, new Set()))
  wanted.forEach((_, i) => {
    const j = owner.includes(i) ? undefined : ranked[i].all.find((one) => owner[one] < 0)
    if (j !== undefined) owner[j] = i
  })
  return wanted.map((_, i) => owner.indexOf(i))
}

/**
 * How the table a brain sent fares against the one its request should give.
 * @param {Expected[]} expected @param {unknown} args what the brain sent to table_create, null when it sent nothing
 * @returns {Score}
 */
export function score(expected, args) {
  const counts = { wanted: expected.length, named: 0, typed: 0, steps: 0, stepped: 0 }
  if (!args) return { correct: false, taken: false, misses: ['no table'], ...counts }
  let table
  try {
    table = createTable(args, { id: '0'.repeat(26), author: 'brain', at: new Date(0).toISOString() })
  } catch (error) {
    return { correct: false, taken: false, misses: [/** @type {Error} */ (error).message], ...counts }
  }
  const columns = table.properties
  const found = assign(expected.map((one) => ({ ...one, kinds: [one.type].flat() })), columns)
  /** @type {string[]} */
  const misses = []
  expected.forEach((property, i) => {
    const column = columns[found[i]]
    if (!column) return misses.push(`no ${property.names[0]}`)
    counts.named++
    if (![property.type, ...(property.also ?? [])].flat().includes(column.type)) return misses.push(`${column.name}: ${column.type}`)
    counts.typed++
    if (!property.options || !column.options) return
    counts.steps++
    const steps = assign(property.options, column.options ?? [])
    const missing = property.options.filter((_, j) => steps[j] < 0).map((option) => option.names[0])
    if (missing.length > (property.options.length >= 3 ? 1 : 0)) misses.push(`${column.name}: steps ${missing.join(', ')}`)
    else counts.stepped++
  })
  if (columns.length > 15) misses.push(`${columns.length} columns`)
  return { correct: !misses.length, taken: true, misses, ...counts }
}

/** The set in one language: its requests, and the tables they should give, the kinds from English. @param {string} lang */
async function setIn(lang) {
  const english = JSON.parse(await readFile(`${DIR}en.json`, 'utf8'))
  const set = lang === 'en' ? english : JSON.parse(await readFile(`${DIR}${lang}.json`, 'utf8'))
  /** @type {Record<string, Expected[]>} */
  const tables = Object.fromEntries(Object.entries(english.tables).map(([id, properties]) => [id, /** @type {Expected[]} */ (properties).map((property, i) => ({
    ...property, names: set.tables[id][i].names, ...(property.options ? { options: set.tables[id][i].options } : {}),
  }))]))
  return { requests: /** @type {Record<string, string>} */ (set.requests), tables }
}

/**
 * What the brain sends for one request: the arguments of its table_create, or what it said. A table
 * Jean refuses goes back to the brain with why, as in Jean, up to three tries in all. A call in
 * Gemma's own syntax that the server left in the text is read as Jean's device runtime reads it.
 * @param {Measured} measured @param {string} lang @param {string} text
 * @returns {Promise<{ args: unknown, said: string, tries: number, read?: boolean }>}
 */
async function ask({ brain, apiKey, body, tool, strict }, lang, text) {
  // Held to STRICT, the brain answers with table_create's arguments rather than calling it: told so,
  // with what the tool's declaration says, as a rule. (Held, the GGUF build of Gemma 4 E2B thinks
  // first in LM Studio, whatever reasoning_effort says; its MLX build doesn't.)
  const rules = strict ? [`Answer with the table to make, as the arguments of ${tool.name} in JSON: ${tool.description} Its arguments: ${JSON.stringify(tool.parameters)}`] : []
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
      if (event.type === 'tool_call' && event.call.name === TABLE_CREATE.name) call ??= event.call
      if (event.type === 'text') reply += event.delta
      if (event.type === 'done') message = event.message
    }
    said += reply
    if (!call) {
      const read = gemmaCall(reply)
      return read ? { args: read, said, tries, read: true } : { args, said, tries }
    }
    if (!message) return { args, said, tries }
    args = call.args
    try {
      createTable(args, { id: '0'.repeat(26), author: 'brain', at: new Date(0).toISOString() })
      return { args, said, tries }
    } catch (error) {
      messages.push(message, ...(message.toolCalls ?? []).map((one) => /** @type {const} */ ({ role: 'tool', toolCallId: one.id, name: one.name, isError: true, content: one === call ? /** @type {Error} */ (error).message : 'Not run.' })))
    }
  }
  return { args, said, tries: TRIES }
}

/**
 * A table_create call in Gemma 4's own syntax, table_create{name:<|"|>…<|"|>,…}, which a server's
 * parser may leave in the text, read by Jean's device runtime's parser (caps/brain-local/gemma.js).
 * @param {string} text @returns {unknown}
 */
function gemmaCall(text) {
  const start = text.search(new RegExp(`(?:call:)?${TABLE_CREATE.name}\\s*\\{`))
  if (start < 0) return null
  const ends = [...text.slice(start).matchAll(/\}/g)].map((match) => start + /** @type {number} */ (match.index) + 1).reverse()
  for (const end of ends) {
    const { args } = toolCall(text.slice(start, end), 1)
    if (!args.__invalidJSON) return args
  }
  return null
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
 * This brain's section: how often its table was right, against the gate, then why not: the
 * columns it named, their kinds, a status's steps; per language and per request.
 * @param {Measured} measured @param {Outcome[]} all @param {number} runs
 */
function report({ name }, all, runs) {
  // A request the server failed says nothing of the brain.
  const outcomes = all.filter((one) => !one.error)
  const right = outcomes.filter((one) => one.correct).length
  /** @param {Outcome[]} items */
  const row = (items) => {
    const taken = items.filter((one) => one.taken)
    const sum = (/** @type {'wanted' | 'named' | 'typed' | 'steps' | 'stepped'} */ key) => taken.reduce((total, one) => total + one[key], 0)
    return `${percent(items.filter((one) => one.called).length, items.length)} | ${percent(taken.length, items.length)} | ${percent(sum('named'), sum('wanted'))} | ${percent(sum('typed'), sum('named'))} | ${percent(sum('stepped'), sum('steps'))} | ${percent(items.filter((one) => one.correct && one.tries === 1).length, items.length)} | **${percent(items.filter((one) => one.correct).length, items.length)}**`
  }
  const langs = [...new Set(outcomes.map((one) => one.lang))]
  const ids = [...new Set(outcomes.map((one) => one.id))]
  const errors = all.length - outcomes.length
  const read = outcomes.filter((one) => one.read).length
  return `## ${name}, ${new Date().toISOString().slice(0, 10)}

Right on ${percent(right, outcomes.length)} of ${outcomes.length} tables (${langs.length} languages, ${ids.length} requests${runs > 1 ? `, ${runs} runs each` : ''}): ${right / outcomes.length >= GATE ? 'over' : 'under'} the gate of ${GATE * 100}%.${read ? ` ${read} calls were read from Gemma's syntax in the text, as Jean's device runtime reads them.` : ''}${errors ? ` ${errors} requests the server failed are left out.` : ''}

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
${langs.map((lang) => `| ${lang} | ${row(outcomes.filter((one) => one.lang === lang))} |`).join('\n')}
| **All** | ${row(outcomes)} |

| Request | ${langs.join(' | ')} | Commonest misses |
|---|${langs.map(() => '---:').join('|')}|---|
${ids.map((id) => {
    const of = outcomes.filter((one) => one.id === id)
    const misses = Object.entries(Object.groupBy(of.flatMap((one) => one.misses), (miss) => miss)).sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0)).slice(0, 3).map(([miss, list]) => `${miss.replaceAll('|', '/').replaceAll('\n', ' ')} (${list?.length})`).join('; ')
    return `| ${id} | ${langs.map((lang) => { const items = of.filter((one) => one.lang === lang); return `${items.filter((one) => one.correct).length}/${items.length}` }).join(' | ')} | ${misses || '—'} |`
  }).join('\n')}
`
}

const SUMMARY = '## Every brain'

/** Every brain's share of right tables, read back from its section. @param {string[]} sections */
function summary(sections) {
  return `${SUMMARY}

| Brain | Right | Gate (${GATE * 100}%) |
|---|---:|---|
${sections.map((part) => {
    const heading = part.slice(3, part.indexOf('\n'))
    const right = /^Right on (\d+)%/m.exec(part)?.[1]
    return `| ${heading.slice(0, heading.lastIndexOf(', '))} | ${right ? `${right}%` : '—'} | ${right && Number(right) >= GATE * 100 ? 'passes' : 'fails'} |`
  }).join('\n')}`
}

/** Writes this brain's section into results.md, in place of its last one. @param {Measured} measured @param {string} section */
async function write({ name }, section) {
  const before = await readFile(`${DIR}results.md`, 'utf8').catch(() => '')
  const kept = before.split(/^(?=## )/m).slice(1).filter((part) => !part.startsWith(`## ${name}, `) && !part.startsWith(SUMMARY))
  const sections = [section, ...kept].map((part) => part.trimEnd())
  await writeFile(`${DIR}results.md`, `# Tables: how well brains make one

Written by \`npm run tables -- --write\`, one section per brain, replaced when that brain is measured
again. Each request asks to keep track of something, as the first message of a conversation, with
Jean's base prompt, the line of table_create and that tool alone; a table Jean refuses goes back to the
brain with why, as in Jean, up to three tries ("right at once": the first); "taken": a table Jean made from
what the brain sent, in the end. Columns, kinds and steps are counted in the tables taken. A table is right when it has every
column the request needs (named in the request's language, any of the names the set takes), each of a
kind that works for it, and a status's steps (all but one, when there are three or more); other
columns are fine. Tables is offered with the device's brain only if it is right about ${GATE * 100}% of the time.

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
  const description = flag('--description')
  const tool = description ? { ...TABLE_CREATE, description } : TABLE_CREATE
  const strict = argv.includes('--strict')
  /** @type {Measured} */
  const chosen = { ...found, body, tool, strict, name: `${found.brain.model} (${[found.brain.provider, env.BRAIN_BODY, description && `"${description}"`, strict && 'held to what Jean takes'].filter(Boolean).join(', ')})` }
  const langs = (flag('--lang')?.split(',') ?? Object.keys(LANGS)).filter((lang) => LANGS[lang])
  const runs = Number(flag('--runs') ?? 1)
  const parallel = Number(flag('--parallel') ?? 4)
  console.log(`tables: ${chosen.name}`)
  /** @type {Outcome[]} */
  const outcomes = []
  try {
    for (const lang of langs) {
      const { requests, tables } = await setIn(lang)
      const only = flag('--only')?.split(',')
      const jobs = Object.keys(requests).filter((id) => !only || only.includes(id)).flatMap((id) => Array.from({ length: runs }, () => id))
      /** @type {Outcome[]} */
      const here = []
      const work = async (/** @type {string} */ id) => {
        try {
          const { args, said, tries, read } = await ask(chosen, lang, requests[id])
          here.push({ lang, id, called: Boolean(args), tries, ...(read ? { read } : {}), ...score(tables[id], args), ...(args ? { args } : { said: said.slice(0, 300) }) })
        } catch (error) {
          here.push({ lang, id, called: false, tries: 0, ...score(tables[id], null), misses: ['error'], error: /** @type {Error} */ (error).message })
        }
      }
      // The first request alone: a server that loads its brain on demand (LM Studio) refuses others meanwhile.
      if (lang === langs[0] && jobs.length) await work(/** @type {string} */ (jobs.shift()))
      await pool(jobs, parallel, work)
      here.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      outcomes.push(...here)
      const errors = here.filter((one) => one.error)
      console.log(`${lang.padEnd(4)} right ${here.filter((one) => one.correct).length}/${here.length}${errors.length ? `  errors ${errors.length}: ${errors[0].error}` : ''}`)
      if (errors.length === here.length) throw new Error(`every request failed: ${errors[0].error}`)
    }
  } finally {
    await chosen.close?.()
  }
  if (argv.includes('--verbose')) {
    for (const one of outcomes.filter((item) => !item.correct)) console.log(`${one.lang} ${one.id}: ${one.misses.join('; ')}\n  ${JSON.stringify(one.args ?? one.said ?? one.error)}`)
  }
  const save = flag('--save')
  if (save) await writeFile(save, JSON.stringify({ name: chosen.name, runs, outcomes }))
  const section = report(chosen, outcomes, runs)
  console.log(`\n${section}`)
  if (argv.includes('--write')) await write(chosen, section)
}

/** Replies kept by --save, scored again against the set as it is now. @param {string[]} argv @param {{ name: string, runs: number, outcomes: Outcome[] }} kept */
async function rescore(argv, { name, runs, outcomes }) {
  /** @type {Record<string, Record<string, Expected[]>>} */
  const sets = {}
  for (const lang of new Set(outcomes.map((one) => one.lang))) sets[lang] = (await setIn(lang)).tables
  const scored = outcomes.map((one) => ({ ...one, ...score(sets[one.lang][one.id], one.args ?? null), ...(one.error ? { correct: false, misses: ['error'] } : {}) }))
  if (argv.includes('--verbose')) for (const one of scored.filter((item) => !item.correct)) console.log(`${one.lang} ${one.id}: ${one.misses.join('; ')}\n  ${JSON.stringify(one.args ?? one.said ?? one.error)}`)
  const measured = /** @type {Measured} */ ({ name })
  const section = report(measured, scored, runs)
  console.log(section)
  if (argv.includes('--write')) await write(measured, section)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).catch((error) => {
    console.error(`tables: ${error.message}`)
    process.exit(1)
  })
}
