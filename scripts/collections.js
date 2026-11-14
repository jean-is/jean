// SPDX-License-Identifier: MIT
// Collections phase 0, b: two things measured on a brain before anything is built (the plan "Collections, taken further").
//   sums:   whether a brain asks Jean for a sum rather than reading rows and adding. 24 questions on four seeded collections of 500
//           rows (test/collections/set.js), in English, French, Arabic and Japanese, each the first message of a conversation with
//           Jean's base prompt, Tables' line and its three tools, the collection open beside the task, each call answered as Jean
//           would, up to eight steps. table_rows comes in two forms (test/collections/tools.js): A, today's, 200 rows and a filter;
//           B, the plan's, with `where`, `sum`, `count` and `by` worked out on every row; C, B under fewer words. A conversation is right when its last
//           answer holds the figure, however it is written (digit grouping, a currency, Arabic-Indic or full-width digits, 万);
//           a wrong figure said with no word of doubt is counted apart, the worst there is.
//   format: whether a `format` on table_create's number columns hurts ordinary tables: the 80 requests of test/tables/, asked and
//           scored as npm run tables does, with `format: "money" | "percent"` and `currency` added to the tool.
// The gate, written before the first run: with B, Haiku right on 85% of conversations or more and Sonnet on 90%, Arabic and
// Japanese within 10 points of English; with `format`, ordinary tables no lower than without it, beyond what runs differ by.
// The brain comes from the environment, as for npm run tables: BRAIN=<provider>:<model> (cli/brain.js).
// Usage: BRAIN=claudecode:haiku node scripts/collections.js --part sums --form B --runs 3 --save <file.jsonl>
//        node scripts/collections.js --part sums --form A                     today's tool, to compare (C: B in fewer words)
//        node scripts/collections.js --part sums --smoke                      eight conversations, both forms, to see it works
//        node scripts/collections.js --part format --runs 2 --save <file.jsonl>
//        node scripts/collections.js --lang fr,ja --only left-to-pay,unpaid   some languages, some questions or requests
//        node scripts/collections.js --parallel 2                             conversations at a time (3 at most, the default)
//        node scripts/collections.js --save <file.jsonl> --resume             leave out what the file already holds
//        node scripts/collections.js --from <a.jsonl>,<b.jsonl>               score kept conversations again and report, asking no brain
//        node scripts/collections.js --check                                  the set held to the tools, asking no brain
//        node scripts/collections.js --verbose                                and every miss
// A plan's limit or a rate limit stops the run where it is: nothing is asked again.
import { readFile, appendFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chooseBrain } from '../cli/brain.js'
import { buildSystemPrompt } from '../app/core/prompt.js'
import { streamChat } from '../app/core/llm.js'
import { createTable } from '../app/caps/tables/table.js'
import { tableCreate, LINE } from '../app/caps/tables/tool.js'
import { score, matchNames } from './tables.js'
import { QUESTIONS, COLLECTIONS, LANGS as SET_LANGS, TODAY, seeded } from '../test/collections/set.js'
import { ROWS_A, ROWS_B, ROWS_C, CHANGE, FORMAT, noteOf, named, rowsA, rowsB, figures, tableCreateFormat, tokensOf } from '../test/collections/tools.js'

/** @import { Question, Seeded } from '../test/collections/set.js' */
/** One call of a conversation: its tool, what it sent, and what was wrong with it. @typedef {{ name: string, args: any, error?: string }} Call */
/** outcome: right, or a wrong figure said plainly (confident), one said with a doubt (hedged), or no figure at all (none). @typedef {{ part: 'sums', brain: string, form: 'A' | 'B' | 'C', lang: string, id: string, kind: string, run: number, right: boolean, outcome: 'right' | 'confident' | 'hedged' | 'none', hit: number, asked: boolean, calls: Call[], said: string, tokens?: { in: number, out: number }, error?: string }} Sum */
/** A table as npm run tables scores it, with what the brain sent. @typedef {{ part: 'format', brain: string, lang: string, id: string, run: number, called: boolean, tries: number, correct: boolean, taken: boolean, misses: string[], wanted: number, named: number, typed: number, steps: number, stepped: number, args?: any, said?: string, error?: string }} Made */

const TABLES = fileURLToPath(new URL('../test/tables/', import.meta.url))
const LANGS = /** @type {Record<string, string>} */ ({ en: 'English', fr: 'French', ar: 'Arabic', ja: 'Japanese' })
const STEPS = 8
const MAX_TOKENS = 4096
const TRIES = 3
const PARALLEL = 3
/** How long one step of a conversation may take. */
const STEP_MS = 240_000
const GATE = /** @type {Record<string, number>} */ ({ haiku: 0.85, sonnet: 0.9 })
/** What a page's `where` and Jean's answers count dates from, and the words for a box. @param {string} lang */
const how = (lang) => ({ locales: [lang], labels: { yes: 'yes', no: 'no' }, today: TODAY })
/** The eight conversations of a smoke: both forms, every language, a sum, a count, by group and one row. */
const SMOKE = /** @type {[('A' | 'B'), string, string][]} */ ([['B', 'en', 'left-to-pay'], ['B', 'ar', 'by-category'], ['B', 'ja', 'no-answer'], ['B', 'fr', 'defibrillator'], ['A', 'en', 'left-to-pay'], ['A', 'ar', 'no-receipt'], ['A', 'ja', 'by-status'], ['A', 'fr', 'order']])
/** The requests of test/tables/ whose table has a column that is plainly money, by its place among the columns the set wants. */
const MONEY = /** @type {Record<string, number>} */ ({ expenses: 1, invoices: 1, stock: 2, subscriptions: 1, flats: 1, car: 2, gifts: 2 })
/** The currencies a request's language makes right: the euro in French, the yen in Japanese, an Arab country's in Arabic; English names no country. */
const CURRENCIES = /** @type {Record<string, RegExp>} */ ({ en: /^(USD|GBP|EUR|CAD|AUD|NZD)$/, fr: /^(EUR|CHF|CAD)$/, ja: /^JPY$/, ar: /^(SAR|AED|EGP|MAD|DZD|TND|JOD|KWD|QAR|BHD|OMR|LBP|IQD|SYP|LYD|SDG|YER)$/ })

// ─── Reading an answer's figures ─────────────────────────────────────────────

/**
 * What a run of digits and marks may be worth: every mark grouping thousands, or the last one a decimal mark, or numbers a space apart.
 * @param {string} token @returns {number[]}
 */
function readings(token) {
  const groups = token.split(/[ ,.'’]/), marks = token.replace(/\d/g, '').split('')
  if (groups.length === 1) return [Number(token)]
  const thousands = (/** @type {string[]} */ some) => some.length === 1 || (some[0].length <= 3 && some.slice(1).every((group) => group.length === 3))
  const last = /** @type {string} */ (marks.at(-1))
  return [...(thousands(groups) ? [Number(groups.join(''))] : []),
    ...((last === ',' || last === '.') && thousands(groups.slice(0, -1)) && !marks.slice(0, -1).includes(last) ? [Number(`${groups.slice(0, -1).join('')}.${groups.at(-1)}`)] : []),
    ...(marks.includes(' ') ? token.split(' ').flatMap(readings) : [])]
}

/**
 * Every number a text may hold, read leniently: digits of any script and width, thousands grouped by a comma, a dot, a space or an
 * apostrophe, a decimal comma or dot, Arabic's own marks, and Japanese's 万 and 億. @param {string} text @returns {Set<number>}
 */
export function numbersIn(text) {
  const plain = text.normalize('NFKC').replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/٬/g, ',').replace(/٫/g, '.').replace(/(?<=\d)،(?=\d)/g, ',')
  const found = new Set(), bare = (/** @type {string | undefined} */ digits) => Number((digits ?? '0').replace(/,/g, '').replace(/\.$/, ''))
  for (const [, first, unit, tenThousands, rest] of plain.matchAll(/(\d[\d,.]*)\s*([億万])(?:\s*(\d[\d,.]*)\s*万)?(?:\s*(\d[\d,.]*))?/g)) {
    found.add(unit === '億' ? bare(first) * 1e8 + bare(tenThousands) * 1e4 + bare(rest) : bare(first) * 1e4 + bare(rest))
    found.add(unit === '億' ? bare(first) * 1e8 + bare(tenThousands) * 1e4 : bare(first) * 1e4)
  }
  for (const [token] of plain.matchAll(/\d+(?:[ ,.'’]\d+)*/g)) for (const value of readings(token)) if (Number.isFinite(value)) found.add(value)
  return found
}

/** Whether an answer's numbers hold a figure: to the cent, or rounded to the unit or to a tenth. @param {Set<number>} found @param {number} figure */
const holds = (found, figure) => [...found].some((value) => Math.abs(value - figure) < 0.005) || (!Number.isInteger(figure) && (found.has(Math.round(figure)) || found.has(Math.round(figure * 10) / 10)))

/** Words of doubt about a figure, in the four languages: only some rows read, at least, about, could not, added by hand and to be checked. */
const DOUBT = /\b(only|partial(ly)?|incomplete|at least|not all|approximate(ly)?|roughly|estimate[ds]?|could(n['’]t| not)|can(['’]t|not)|unable|first 200|may be missing|might be missing|by hand|manually|double.?check)\b|seulement|uniquement|partiel|incompl|au moins|environ|approximati|estimation|pas pu|impossible|ne peux pas|premières lignes|200 premières|à la main|manuellement|à vérifier|erreur .{0,20}possible|فقط|جزئي|غير مكتمل|غير كامل|على الأقل|تقريب|لم أتمكن|لا أستطيع|تعذ|أول 200|يدوي|فراجع|للتحقق|のみ|だけ|一部|不完全|少なくとも|おおよそ|およそ|概算|できません|できなかった|最初の200|手計算|手作業|ご確認/i

/**
 * How an answer fares against a question's figure: right when it holds it, each group's for a question by group; else whether it gave
 * a figure at all, and with a word of doubt or none. @param {Question} question @param {string} lang @param {string} said
 */
export function judge(question, lang, said) {
  const found = numbersIn(said), wanted = typeof question.right === 'number' ? [question.right] : Object.values(question.right), hit = wanted.filter((figure) => holds(found, figure)).length
  if (hit === wanted.length) return { right: true, outcome: /** @type {const} */ ('right'), hit }
  // Numbers that are no figure of the answer's own: the question's, how many rows there are or were read, the years.
  const given = numbersIn(question.text[/** @type {'en'} */ (lang)]), offered = [...found].filter((value) => !given.has(value) && ![200, 300, 500, 2025, 2026].includes(value))
  return { right: false, outcome: /** @type {'none' | 'hedged' | 'confident'} */ (!said.trim() || !offered.length ? 'none' : DOUBT.test(said) || found.has(200) ? 'hedged' : 'confident'), hit }
}

// ─── Conversations ───────────────────────────────────────────────────────────

/** A failure that is the plan's or the provider's limit, where a run stops: never asked again. @param {any} error */
const isLimit = (error) => ['rate_limit', 'credits', 'auth'].includes(error?.code) || /usage limit|rate.?limit|limit reached|hit your|out of (extra )?usage|quota|too many requests|overloaded|credit/i.test(String(error?.message ?? error))

/**
 * One conversation about a collection open beside the task: the question, each call answered as Jean would, until the brain answers in
 * words or STEPS run out. @param {{ brain: any, apiKey?: string, body?: object }} chosen @param {string} lang @param {{ text: string, note: string, tools: any[], answer: (call: { name: string, args: any }) => string }} turn
 */
async function converse({ brain, apiKey, body }, lang, { text, note, tools, answer }) {
  const system = buildSystemPrompt({ assistantName: 'Jean', uiLanguage: LANGS[lang], tools: [LINE], now: TODAY })
  /** @type {typeof fetch} */
  const fetch = (url, init) => globalThis.fetch(url, body && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...body }) } : init)
  /** @type {any[]} */
  const messages = [{ role: 'system', content: note }, { role: 'user', content: text }]
  /** @type {Call[]} */
  const calls = []
  const tokens = { in: 0, out: 0 }
  let said = ''
  for (let step = 0; step < STEPS; step++) {
    /** @type {any} */
    let message
    said = ''
    for await (const event of streamChat({ brain, apiKey, fetch, system, messages, tools, maxTokens: MAX_TOKENS, signal: AbortSignal.timeout(STEP_MS) })) {
      if (event.type === 'text') said += event.delta
      if (event.type === 'done') { message = event.message; tokens.in += event.usage?.inputTokens ?? 0; tokens.out += event.usage?.outputTokens ?? 0 }
    }
    const asked = message?.toolCalls ?? []
    // A plan's bridge says its own failures as text ("Error: Execution failed: …"): the server's, not the brain's.
    if (!asked.length && /^(API )?Error: /.test(said.trim())) throw new Error(said.trim().slice(0, 300))
    if (!asked.length) return { calls, said, tokens }
    messages.push(message)
    for (const call of asked) {
      let content = '', error
      try { content = answer(call) } catch (thrown) { content = error = /** @type {Error} */ (thrown).message }
      calls.push({ name: call.name, args: call.args, ...(error && { error }) })
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content, ...(error && { isError: true }) })
    }
  }
  // Out of steps with a call still asked: no answer.
  return { calls, said: '', tokens }
}

/** One question, asked of a brain with one form of table_rows. @param {any} chosen @param {'A' | 'B' | 'C'} form @param {string} lang @param {Question} question @param {Record<string, Seeded>} all the collections in this language */
async function sumOne(chosen, form, lang, question, all) {
  const one = all[question.collection], every = Object.values(all)
  const { calls, said, tokens } = await converse(chosen, lang, { text: question.text[/** @type {'en'} */ (lang)], note: noteOf(one), tools: [tableCreate(lang), form === 'A' ? ROWS_A : form === 'C' ? ROWS_C : ROWS_B, CHANGE],
    answer: ({ name, args }) => {
      if (name === 'table_rows') return form === 'A' ? rowsA(named(every, args?.table), args) : rowsB(named(every, args?.table), args, how(lang))
      if (name === 'table_create') { createTable(args, { id: '0'.repeat(26), author: 'jean', at: new Date(0).toISOString() }); return 'Made the table, open beside the conversation, with no rows yet: add them with table_change.' }
      if (name === 'table_change') return `Changed ${Array.isArray(args?.rows) ? args.rows.length : 0} rows of ${named(every, args?.table).table.name}, beside the conversation for the user to accept or reject.`
      throw new Error(`No tool ${name} here.`)
    } })
  return { kind: question.kind, ...judge(question, lang, said), asked: calls.some((call) => call.name === 'table_rows' && (call.args?.sum || call.args?.count || call.args?.by)), calls, said: said.slice(0, 2500), tokens }
}

/** The tables set in one language, the kinds from English, as scripts/tables.js reads it. @param {string} lang */
async function tablesIn(lang) {
  const english = JSON.parse(await readFile(`${TABLES}en.json`, 'utf8'))
  const set = lang === 'en' ? english : JSON.parse(await readFile(`${TABLES}${lang}.json`, 'utf8'))
  const expected = Object.fromEntries(Object.entries(english.tables).map(([id, properties]) => [id, /** @type {any[]} */ (properties).map((property, i) => ({
    ...property, names: set.tables[id][i].names, ...(property.options ? { options: set.tables[id][i].options } : {}) }))]))
  return { requests: /** @type {Record<string, string>} */ (set.requests), expected }
}

/**
 * One request to keep track of something, as npm run tables asks it (`ask()`), with `format` on table_create: Jean's base prompt, the
 * capability's line and that tool alone; a table Jean refuses goes back with why, up to three tries. @param {any} chosen @param {string} lang @param {string} text
 */
async function ask({ brain, apiKey, body }, lang, text) {
  const tool = tableCreateFormat(lang), system = buildSystemPrompt({ assistantName: 'Jean', uiLanguage: LANGS[lang], tools: [LINE], now: new Date() })
  /** @type {typeof fetch} */
  const fetch = (url, init) => globalThis.fetch(url, body && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...body }) } : init)
  /** @type {any[]} */
  const messages = [{ role: 'user', content: text }]
  let said = '', args = /** @type {unknown} */ (null)
  for (let tries = 1; tries <= TRIES; tries++) {
    /** @type {any} */
    let call, message
    let reply = ''
    for await (const event of streamChat({ brain, apiKey, fetch, system, messages, tools: [tool], maxTokens: MAX_TOKENS, signal: AbortSignal.timeout(STEP_MS) })) {
      if (event.type === 'tool_call' && event.call.name === tool.name) call ??= event.call
      if (event.type === 'text') reply += event.delta
      if (event.type === 'done') message = event.message
    }
    said += reply
    if (!call && /^(API )?Error: /.test(reply.trim())) throw new Error(reply.trim().slice(0, 300))
    if (!call || !message) return { args, said, tries }
    args = call.args
    try {
      createTable(args, { id: '0'.repeat(26), author: 'brain', at: new Date(0).toISOString() })
      return { args, said, tries }
    } catch (error) {
      messages.push(message, ...(message.toolCalls ?? []).map((/** @type {any} */ one) => ({ role: 'tool', toolCallId: one.id, name: one.name, isError: true, content: one === call ? /** @type {Error} */ (error).message : 'Not run.' })))
    }
  }
  return { args, said, tries: TRIES }
}

/** Runs `work` over `items`, `parallel` at a time, until `stopped()`. @template T @param {T[]} items @param {number} parallel @param {(item: T) => Promise<void>} work @param {() => boolean} stopped */
async function pool(items, parallel, work, stopped) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, async () => { while (next < items.length && !stopped()) await work(items[next++]) }))
}

// ─── Reports ─────────────────────────────────────────────────────────────────

/** @param {number} part @param {number} whole */
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—')
/** @template T @param {T[]} items @param {(item: T) => string} key @returns {[string, T[]][]} */
const groupBy = (items, key) => [...items.reduce((groups, item) => groups.set(key(item), [...(groups.get(key(item)) ?? []), item]), /** @type {Map<string, T[]>} */ (new Map()))]

/** The sums of one brain and one form: by language against the gate, by kind of question, by run, then its misses. @param {string} brain @param {'A' | 'B' | 'C'} form @param {Sum[]} all @param {boolean} verbose */
function sumsReport(brain, form, all, verbose) {
  const done = all.filter((one) => !one.error), failed = all.length - done.length
  const cell = (/** @type {Sum[]} */ some) => `${percent(some.filter((one) => one.right).length, some.length)} (${some.filter((one) => one.right).length}/${some.length})`
  const row = (/** @type {string} */ name, /** @type {Sum[]} */ some) => {
    const sums = some.filter((one) => one.kind !== 'row'), calls = some.reduce((sum, one) => sum + one.calls.length, 0), count = (/** @type {string} */ outcome) => some.filter((one) => one.outcome === outcome).length
    return `| ${name} | ${cell(some)} | ${form !== 'A' ? `${percent(sums.filter((one) => one.asked).length, sums.length)} | ` : ''}${some.length ? (calls / some.length).toFixed(1) : '—'} | ${count('confident')} | ${count('hedged')} | ${count('none')} | ${some.length ? Math.round(some.reduce((sum, one) => sum + (one.tokens?.in ?? 0), 0) / some.length).toLocaleString('en') : '—'} |`
  }
  const head = `| | Right | ${form !== 'A' ? 'Asked for the figure | ' : ''}Calls | Wrong, said plainly | Wrong, with a doubt | No figure | Tokens read |\n|---|---:|${form !== 'A' ? '---:|' : ''}---:|---:|---:|---:|---:|`
  const langs = [...new Set(done.map((one) => one.lang))], kinds = ['sum', 'count', 'by', 'row'].filter((kind) => done.some((one) => one.kind === kind)), runs = [...new Set(done.map((one) => one.run))].sort()
  const share = (/** @type {Sum[]} */ some) => some.filter((one) => one.right).length / (some.length || 1), gate = GATE[brain.split(' ')[0]]
  const english = share(done.filter((one) => one.lang === 'en')), apart = ['ar', 'ja'].filter((lang) => done.some((one) => one.lang === lang)).map((lang) => `${LANGS[lang]} ${Math.round((share(done.filter((one) => one.lang === lang)) - english) * 100)} points from English`)
  const misses = groupBy(done.filter((one) => !one.right), (one) => one.id).sort((a, b) => b[1].length - a[1].length).map(([id, some]) => `${id} ${some.length} (${groupBy(some, (one) => one.lang).map(([lang, of]) => `${lang} ${of.length}`).join(', ')})`)
  const refused = groupBy(done.flatMap((one) => one.calls.filter((call) => call.error).map((call) => ({ lang: one.lang, said: call.args?.where ?? JSON.stringify(call.args?.filter ?? call.args), error: /** @type {string} */ (call.error) }))), (one) => one.error.replace(/".*?"/, '"…"').slice(0, 60))
  return `### ${brain}, table_rows ${form}

${done.length} conversations${runs.length > 1 ? `, ${runs.length} runs` : ''}${failed ? `; ${failed} the server failed are left out` : ''}.${form !== 'A' && gate ? ` Right on ${(share(done) * 100).toFixed(1)}%: ${share(done) >= gate ? 'over' : 'under'} its gate of ${gate * 100}%; ${apart.join(', ')}.` : ''}

${head}
${langs.map((lang) => row(lang, done.filter((one) => one.lang === lang))).join('\n')}
${kinds.map((kind) => row(kind === 'row' ? 'one row (control)' : kind === 'by' ? 'by group' : kind, done.filter((one) => one.kind === kind))).join('\n')}
${runs.length > 1 ? `${runs.map((run) => row(`run ${run}`, done.filter((one) => one.run === run))).join('\n')}\n` : ''}${row('**All**', done)}
${form !== 'A' ? `\nOf the sums, counts and groups: right ${cell(done.filter((one) => one.kind !== 'row' && one.asked))} when the brain asked for the figure, ${cell(done.filter((one) => one.kind !== 'row' && !one.asked))} when it didn't.\n` : ''}
Misses: ${misses.join('; ') || 'none'}.
${refused.length ? `\nCalls refused: ${refused.map(([error, some]) => `${error}… (${some.length})`).join('; ')}.\n` : ''}${verbose ? `\n${done.filter((one) => !one.right).map((one) => `- ${one.lang} ${one.id} run ${one.run}, ${one.outcome} [${one.calls.map((call) => `${call.name}${call.name === 'table_rows' ? JSON.stringify(Object.fromEntries(Object.entries(call.args ?? {}).filter(([key]) => key !== 'table'))) : ''}${call.error ? ' ✗' : ''}`).join(' → ')}]\n  ${one.said.replace(/<suggestions>[\s\S]*$/, '').replace(/\s+/g, ' ').slice(0, 420)}`).join('\n')}\n` : ''}`
}

/** A column of a table a brain sent that the set's money column names, if it has one. @param {any} args @param {string[]} names */
const moneyOf = (args, names) => (Array.isArray(args?.columns) ? args.columns[matchNames(names, args.columns.map((/** @type {any} */ column) => String(column?.name ?? '')))] : undefined)

/** The tables of one brain made with `format`: as npm run tables reports them, then what became of the columns of money. @param {string} brain @param {Made[]} all @param {Record<string, Record<string, any[]>>} expected by language @param {boolean} verbose */
function formatReport(brain, all, expected, verbose) {
  const done = all.filter((one) => !one.error), langs = [...new Set(done.map((one) => one.lang))], runs = [...new Set(done.map((one) => one.run))].sort()
  const cell = (/** @type {Made[]} */ some) => `${percent(some.filter((one) => one.correct).length, some.length)} (${some.filter((one) => one.correct).length}/${some.length})`
  const money = done.filter((one) => one.id in MONEY && one.taken).map((one) => ({ ...one, column: moneyOf(one.args, expected[one.lang][one.id][MONEY[one.id]].names) })).filter((one) => one.column)
  const marked = money.filter((one) => one.column.format === 'money'), others = done.flatMap((one) => (Array.isArray(one.args?.columns) ? one.args.columns : []).filter((/** @type {any} */ column) => column?.format).map((/** @type {any} */ column) => ({ lang: one.lang, id: one.id, ...column })))
  const misses = groupBy(done.flatMap((one) => one.misses.map((miss) => `${one.id}: ${miss.replace(/\d+ columns/, 'n columns')}`)), (miss) => miss).sort((a, b) => b[1].length - a[1].length).slice(0, 12).map(([miss, some]) => `${miss.replaceAll('\n', ' ')} (${some.length})`)
  return `### ${brain}, table_create with format

${done.length} tables${runs.length > 1 ? `, ${runs.length} runs` : ''}${all.length > done.length ? `; ${all.length - done.length} the server failed are left out` : ''}: right ${cell(done)}; right at once ${percent(done.filter((one) => one.correct && one.tries === 1).length, done.length)}; taken ${percent(done.filter((one) => one.taken).length, done.length)}.

| | ${langs.join(' | ')} | All |
|---|${langs.map(() => '---:').join('|')}|---:|
${runs.map((run) => `| run ${run} | ${langs.map((lang) => cell(done.filter((one) => one.run === run && one.lang === lang))).join(' | ')} | ${cell(done.filter((one) => one.run === run))} |`).join('\n')}
| **All** | ${langs.map((lang) => cell(done.filter((one) => one.lang === lang))).join(' | ')} | ${cell(done)} |

Misses: ${misses.join('; ') || 'none'}.

Columns plainly money (${Object.entries(MONEY).map(([id, at]) => `${id}'s ${expected.en[id][at].names[0]}`).join(', ')}): ${money.length} found, ${percent(marked.length, money.length)} with format "money" (${marked.length}).

| | Money columns | format "money" | With a currency | A currency right for the language | Currencies |
|---|---:|---:|---:|---:|---|
${langs.map((lang) => {
    const of = money.filter((one) => one.lang === lang), with_ = of.filter((one) => one.column.format === 'money'), codes = with_.filter((one) => one.column.currency)
    return `| ${lang} | ${of.length} | ${percent(with_.length, of.length)} (${with_.length}) | ${percent(codes.length, with_.length)} (${codes.length}) | ${percent(codes.filter((one) => CURRENCIES[lang].test(String(one.column.currency).toUpperCase())).length, with_.length)} | ${groupBy(codes, (one) => String(one.column.currency)).map(([code, some]) => `${code} ${some.length}`).join(', ') || '—'} |`
  }).join('\n')}

Every column given a format: ${groupBy(others, (column) => `${column.format}${column.type && !/^(number|integer|float|decimal|currency|money)$/i.test(column.type) ? ` on a ${column.type}` : ''}`).map(([format, some]) => `${format} ${some.length}`).join(', ') || 'none'}. Percent: ${others.filter((column) => column.format === 'percent').map((column) => `${column.id} ${column.name}`).join('; ') || 'none'}.
${verbose ? `\nEach column given format "money": ${groupBy(others.filter((column) => column.format === 'money'), (column) => `${column.id} ${column.name}`).map(([name, some]) => `${name} (${some.length})`).join('; ')}\n\n${done.filter((one) => !one.correct).map((one) => `- ${one.lang} ${one.id} run ${one.run}: ${one.misses.join('; ')}\n  ${JSON.stringify(one.args ?? one.said).slice(0, 600)}`).join('\n')}\n` : ''}`
}

/** Kept conversations scored again, as the set and the reading of figures are now. @param {(Sum | Made)[]} records @param {Record<string, Record<string, any[]>>} expected */
function rescored(records, expected) {
  return records.map((one) => {
    if (one.error) return one
    if (one.part === 'sums') return { ...one, ...judge(/** @type {Question} */ (QUESTIONS.find((question) => question.id === one.id)), one.lang, one.said) }
    return { ...one, ...score(expected[one.lang][one.id], one.args ?? null) }
  })
}

/** @param {(Sum | Made)[]} records @param {Record<string, Record<string, any[]>>} expected @param {boolean} verbose */
function report(records, expected, verbose) {
  const sums = /** @type {Sum[]} */ (records.filter((one) => one.part === 'sums')), made = /** @type {Made[]} */ (records.filter((one) => one.part === 'format'))
  return [...groupBy(sums, (one) => `${one.brain}\n${one.form}`).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, some]) => sumsReport(key.split('\n')[0], /** @type {'A' | 'B' | 'C'} */ (key.split('\n')[1]), some, verbose)),
    ...groupBy(made, (one) => one.brain).map(([brain, some]) => formatReport(brain, some, expected, verbose))].join('\n')
}

// ─── The set held to the tools ───────────────────────────────────────────────

/** Whether two figures are the same to the cent. */
const same = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < 0.005

/** The set against the tools, asking no brain: each question's figure from B's own call in each language, what A shows of it, how figures are read, and what B's words weigh. */
function check() {
  let wrong = 0
  const fail = (/** @type {string} */ what) => { wrong++; console.log(`✗ ${what}`) }
  for (const lang of SET_LANGS) {
    const all = Object.fromEntries(COLLECTIONS.map((id) => [id, seeded(id, lang)]))
    for (const question of QUESTIONS) {
      const one = all[question.collection], key = question.key(one), got = figures(one, key, how(lang))
      if (!question.past) fail(`${question.id}: the first 200 rows give its figure`)
      if (typeof question.right === 'number') { if (!same(key.sum ? /** @type {number} */ (got.sum) : got.rows, question.right)) fail(`${lang} ${question.id}: B gives ${key.sum ? got.sum : got.rows}, the set ${question.right} (${JSON.stringify(key)})`) }
      else for (const [option, figure] of Object.entries(question.right)) {
        const group = got.groups?.find((each) => each.value === one.option(option))
        if (!group || !same(key.sum ? /** @type {number} */ (group.sum) : group.rows, figure)) fail(`${lang} ${question.id}: B gives ${JSON.stringify(group)} for ${option}, the set ${figure}`)
      }
      // B's answer, read back as an answer would be, holds the figure; A's first 200 rows, added up, don't.
      if (!judge(question, lang, rowsB(one, key, how(lang))).right) fail(`${lang} ${question.id}: the figure isn't read back from B's own words`)
    }
  }
  const reads = /** @type {[string, number][]} */ ([['23,861.45', 23861.45], ['23 861,45 €', 23861.45], ['23.861,45', 23861.45], ['٢٣٬٨٦١٫٤٥', 23861.45], ['２３，８６１．４５円', 23861.45], ['4万6,500円', 46500], ['1 189 €', 1189], ['about 6,510', 6509.95], ['¥46,500', 46500], ['１９１件', 191], ['in 2025 717 items', 717], ['١٩١', 191], ['148,60', 148.6], ['148.6', 148.6]])
  for (const [text, figure] of reads) if (!holds(numbersIn(text), figure)) fail(`"${text}" isn't read as ${figure}`)
  if (holds(numbersIn('2026-10-01, 200 of its 500 rows'), 23861.45) || holds(numbersIn('23,861'), 23861.45) === false) fail('a figure read where there is none, or a rounded one not taken')
  const english = seeded('expenses', 'en')
  console.log(`${QUESTIONS.length} questions in ${SET_LANGS.length} languages on ${COLLECTIONS.length} collections of ${english.rows.length} rows: ${wrong ? `${wrong} wrong` : 'every figure is B\'s own, and none is in the first 200 rows alone'}.`)
  console.log(`table_rows weighs ${tokensOf(ROWS_A)} tokens today and ${tokensOf(ROWS_B)} as the plan has it: ${tokensOf(ROWS_B) - tokensOf(ROWS_A)} more (a quarter of its characters, as the budgets count). Its words: ${ROWS_A.description.length} characters, then ${ROWS_B.description.length}.`)
  console.log(`table_create weighs ${tokensOf(tableCreate('en'))} tokens today and ${tokensOf(tableCreateFormat('en'))} with format: ${tokensOf(tableCreateFormat('en')) - tokensOf(tableCreate('en'))} more. The sentence: ${FORMAT}`)
  console.log(`A's 200 rows of ${english.table.name}: ${rowsA(english, {}).length.toLocaleString('en')} characters in English, ${rowsA(seeded('expenses', 'ar'), {}).length.toLocaleString('en')} in Arabic, ${rowsA(seeded('expenses', 'ja'), {}).length.toLocaleString('en')} in Japanese.`)
  if (wrong) process.exitCode = 1
}

// ─── Running ─────────────────────────────────────────────────────────────────

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
async function main(argv, env) {
  const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const verbose = argv.includes('--verbose'), langs = (flag('--lang')?.split(',') ?? Object.keys(LANGS)).filter((lang) => LANGS[lang]), only = flag('--only')?.split(',')
  if (argv.includes('--check')) return check()
  const expected = Object.fromEntries(await Promise.all(Object.keys(LANGS).map(async (lang) => [lang, (await tablesIn(lang)).expected])))
  const from = flag('--from')
  if (from) {
    const kept = (await Promise.all(from.split(',').map((file) => readFile(file, 'utf8')))).flatMap((text) => text.split('\n').filter(Boolean).map((line) => JSON.parse(line)))
    return console.log(report(rescored(kept, expected), expected, verbose))
  }
  if (!env.BRAIN) throw new Error('name a brain: BRAIN=<provider>:<model> (cli/brain.js)')
  const found = await chooseBrain({ named: env.BRAIN, address: env.BRAIN_ADDRESS, env })
  if (!found || 'needs' in found) throw new Error(`no brain "${env.BRAIN}"`)
  const chosen = { ...found, body: env.BRAIN_BODY ? JSON.parse(env.BRAIN_BODY) : undefined }, brain = `${found.brain.model} (${found.brain.provider})`
  const part = flag('--part') ?? 'sums', form = /** @type {'A' | 'B' | 'C'} */ (['A', 'C'].includes(flag('--form') ?? '') ? flag('--form') : 'B'), runs = Number(flag('--runs') ?? 1), parallel = Math.min(PARALLEL, Number(flag('--parallel') ?? PARALLEL)), save = flag('--save')
  const before = save && argv.includes('--resume') ? (await readFile(save, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((one) => !one.error) : []
  const had = new Set(before.map((one) => [one.part, one.brain, one.form ?? '', one.lang, one.id, one.run].join('|')))
  const collections = Object.fromEntries(langs.map((lang) => [lang, Object.fromEntries(COLLECTIONS.map((id) => [id, seeded(id, lang)]))]))
  const tables = Object.fromEntries(await Promise.all(langs.map(async (lang) => [lang, await tablesIn(lang)])))
  /** Every conversation to have, a run after the other, each question in every language before the next. @type {{ key: string, base: object, run: () => Promise<object> }[]} */
  const jobs = []
  const add = (/** @type {object} */ base, /** @type {() => Promise<object>} */ run) => { const key = Object.values(base).join('|'); if (!had.has(key)) jobs.push({ key, base, run }) }
  if (part === 'sums' && argv.includes('--smoke')) for (const [each, lang, id] of SMOKE) add({ part, brain, form: each, lang, id, run: 0 }, () => sumOne(chosen, each, lang, /** @type {Question} */ (QUESTIONS.find((question) => question.id === id)), collections[lang] ?? Object.fromEntries(COLLECTIONS.map((one) => [one, seeded(one, /** @type {'en'} */ (lang))]))))
  else if (part === 'sums') for (let run = 1; run <= runs; run++) for (const question of QUESTIONS.filter((one) => !only || only.includes(one.id))) for (const lang of langs) add({ part, brain, form, lang, id: question.id, run }, () => sumOne(chosen, form, lang, question, collections[lang]))
  else for (let run = 1; run <= runs; run++) for (const id of Object.keys(tables[langs[0]].requests).filter((one) => !only || only.includes(one))) for (const lang of langs) add({ part: 'format', brain, form: '', lang, id, run }, async () => {
    const { args, said, tries } = await ask(chosen, lang, tables[lang].requests[id])
    return { called: Boolean(args), tries, ...score(tables[lang].expected[id], args), ...(args ? { args } : { said: said.slice(0, 300) }) }
  })
  console.log(`collections: ${brain}, ${part}${part === 'sums' ? ` ${argv.includes('--smoke') ? 'smoke' : form}` : ''}, ${jobs.length} conversations${before.length ? ` (${before.length} kept from before)` : ''}, ${parallel} at a time`)
  /** @type {any[]} */
  const records = []
  let stopped = '', failures = 0, at = 0
  try {
    await pool(jobs, parallel, async (job) => {
      /** @type {any} */
      let record
      try { record = { ...job.base, ...(await job.run()) }; failures = 0 } catch (error) {
        record = { ...job.base, right: false, correct: false, calls: [], misses: ['error'], said: '', error: String(/** @type {Error} */ (error).message).slice(0, 300) }
        // A limit stops the run at once; so do six failures in a row, whatever they are. Nothing is asked again.
        if (isLimit(error) || ++failures >= 6) stopped ||= record.error
      }
      records.push(record)
      if (save) await appendFile(save, `${JSON.stringify(record)}\n`)
      if (++at % 12 === 0 || record.error) console.log(`${String(at).padStart(4)}/${jobs.length}  right ${records.filter((one) => one.right || one.correct).length}/${records.filter((one) => !one.error).length}${record.error ? `  error (${record.lang} ${record.id}): ${record.error}` : ''}`)
    }, () => Boolean(stopped))
  } finally {
    await /** @type {any} */ (found).close?.()
  }
  if (stopped) console.log(`\nStopped after ${records.length} of ${jobs.length} conversations, nothing asked again: ${stopped}`)
  console.log(`\n${report([...before.filter((one) => one.brain === brain && one.part === (part === 'sums' ? 'sums' : 'format') && (part !== 'sums' || argv.includes('--smoke') || one.form === form)), ...records], expected, verbose)}`)
  if (stopped) process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2), process.env).catch((error) => { console.error(`collections: ${error.message}`); process.exitCode = 1 })
