// SPDX-License-Identifier: MIT
// Measures how well a brain proposes a view of a collection from words (D755): each request of test/views/<lang>.json goes to the
// brain as the first message of a conversation, with Jean's base prompt, Tables' line, the note Jean gives of a collection open
// beside the task (its place, its columns with their choices, how many rows) and Tables' four tools as Jean declares them
// (caps/tables/tool.js). table_rows answers as Jean does, and a view Jean refuses goes back to the brain with why, as in Jean. What
// the brain proposes is made a view as Jean makes one (caps/views/views.js) and scored by what it shows (test/views/expected.json):
// the rows it keeps, in order where one is asked, how it shows, what it groups by and hides, and a name in the request's language.
// Six requests in each language ask for something else, an answer or a change: right, there, is proposing no view.
// The brain comes from the environment, as for npm run tables: BRAIN, <provider>:<model> (cli/brain.js), its key in
// <PROVIDER>_API_KEY, BRAIN_ADDRESS for a server of your own, and BRAIN_BODY, JSON added to each request.
// Usage: BRAIN=claudecode:haiku npm run views
//        npm run views -- --lang fr,ja        some languages
//        npm run views -- --only cheap,mine   some requests
//        npm run views -- --runs 3            each request three times (default 1)
//        npm run views -- --parallel 2        requests at a time (default 4)
//        npm run views -- --write             also write this brain's section of test/views/results.md
//        npm run views -- --verbose           and every miss
//        npm run views -- --description '…'   table_view's description in place of its own, to try one
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chooseBrain } from '../cli/brain.js'
import { buildSystemPrompt } from '../app/core/prompt.js'
import { streamChat } from '../app/core/llm.js'
import { createTable, folderOf } from '../app/caps/tables/table.js'
import { fold } from '../app/caps/tables/changes.js'
import { query } from '../app/caps/tables/query.js'
import { tableCreate, tableView, LINE, TABLE_ROWS, TABLE_CHANGE } from '../app/caps/tables/tool.js'
import { viewFrom } from '../app/caps/views/views.js'

/** @import { Table } from '../app/caps/tables/table.js' */
/** @import { Row } from '../app/caps/tables/changes.js' */
/** A collection of the set as Jean keeps it. @typedef {{ table: Table, rows: Row[], folder: string }} Kept */
/** What a request should give: the rows kept, by their number in the set, sorted by a column (its place) one way, shown one of these ways (a table unless said), grouped by a column, some hidden; or no view at all. @typedef {{ table: string, keeps?: number[], sort?: [number, 'ascending' | 'descending'], show?: string[], group?: number, hide?: number[], none?: boolean }} Wanted */
/** called: table_view was; taken: Jean made a view of what it sent; once: right from its first call. @typedef {{ lang: string, id: string, none: boolean, called: boolean, taken: boolean, once: boolean, right: boolean, misses: string[], calls: string[], error?: string }} Outcome */

const DIR = fileURLToPath(new URL('../test/views/', import.meta.url))
const LANGS = /** @type {Record<string, string>} */ ({ en: 'English', fr: 'French', ar: 'Arabic', ja: 'Japanese' })
const STEPS = 6
/** The gate, written before the first run: right on 80% of the requests for a view, Tables' own gate, and no view on 90% of the others. */
const GATE = 0.8, QUIET = 0.9
/** The day every conversation is held on, so that "November" and "yesterday" mean the same at each run. */
const NOW = new Date('2026-11-17T10:00:00')
const SCRIPT = /** @type {Record<string, RegExp>} */ ({ ar: /\p{Script=Arabic}/u, ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u })

/**
 * A collection of the set, as Jean keeps one: its table made as table_create makes it, its rows in the set's order, and its place.
 * @param {{ name: string, columns: [string, string, string[]?][], rows: unknown[][] }} given @param {number} n its place among the set's @returns {Kept}
 */
export function fixture({ name, columns, rows }, n) {
  const table = createTable({ name, columns: columns.map(([name, type, options]) => ({ name, type, ...(options && { options }) })) }, { id: `01K9${n}${'0'.repeat(21)}`, author: 'user', at: '2026-11-01T09:00:00.000Z' })
  const lines = rows.map((cells, i) => ({ row: `01K9${n}${String(i + 1).padStart(21, '0')}`, set: Object.fromEntries(cells.flatMap((value, c) => (value === null ? [] : [[table.properties[c].id, value]]))), at: `2026-11-01T09:${i + 10}:00.000Z`, by: 'user' }))
  return { table, rows: fold(lines), folder: folderOf(table) }
}

/** A collection's columns as Jean tells them (caps/tables/tables.js `columnsOf()`). @param {Table} table */
const columnsOf = (table) => table.properties.map((property) => `${property.name} (${property.type}${property.options?.length ? `: ${property.options.map((option) => option.name).join(', ')}` : ''})`).join(', ')

/**
 * What is wrong with a view a brain proposed, against what its request should give: nothing when it is right. Its rows are those Jean
 * would show, in their order where the request asks for one. @param {Kept} one @param {Wanted} want
 * @param {ReturnType<typeof viewFrom>} view @param {{ lang: string, me: string }} who @returns {string[]}
 */
export function score({ table, rows }, want, view, { lang, me }) {
  const ids = table.properties.map((property) => property.id), named = (/** @type {string[]} */ shown) => shown.map((id) => rows.findIndex((row) => row.id === id) + 1).join(' ') || 'none'
  const shown = query(table, rows, { ...(view.filter && { filter: view.filter }), sort: view.sort ?? [], locale: lang, me }).rows.map((row) => row.id)
  const kept = (want.keeps ?? []).map((n) => rows[n - 1])
  const expected = (want.sort ? query(table, kept, { sort: [{ property: ids[want.sort[0]], direction: want.sort[1] }], locale: lang }).rows : kept).map((row) => row.id)
  const misses = []
  if ((want.sort ? shown : [...shown].sort()).join() !== (want.sort ? expected : [...expected].sort()).join()) misses.push(`rows ${named(shown)} for ${named(expected)}`)
  if (!(want.show ?? ['table']).includes(view.type)) misses.push(`shown as a ${view.type}`)
  if (want.group !== undefined && view.group !== ids[want.group]) misses.push(`grouped by ${view.group ?? 'nothing'}`)
  for (const column of want.hide ?? []) if (!view.hidden?.includes(ids[column])) misses.push(`${table.properties[column].name} not hidden`)
  if (!(SCRIPT[lang] ?? /\p{Script=Latin}/u).test(view.name)) misses.push(`named "${view.name}"`)
  return misses
}

/**
 * One conversation: the request with Jean's note of the collection open beside it, each call answered as Jean would, until the brain
 * answers in words or STEPS run out. @param {any} chosen @param {string} lang @param {Kept} one @param {string} text
 * @returns {Promise<{ calls: string[], views: (ReturnType<typeof viewFrom> | null)[] }>} views: what each table_view gave, null where Jean refused it
 */
async function converse({ brain, apiKey, body, description }, lang, one, text) {
  const system = buildSystemPrompt({ assistantName: 'Jean', uiLanguage: LANGS[lang], tools: [LINE], sections: { tables: `- ${one.table.name}: ${one.folder}` }, now: NOW })
  /** @type {typeof fetch} */
  const fetch = (url, init) => globalThis.fetch(url, body && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...body }) } : init)
  const said = `${one.table.name} (${one.folder})`, columns = columnsOf(one.table), tools = [tableCreate(lang), TABLE_ROWS, TABLE_CHANGE, tableView(description)]
  /** @type {any[]} */
  const messages = [{ role: 'system', content: `The table ${said} is open beside the conversation: ${one.rows.length} rows. Its columns: ${columns}. Read its rows with table_rows.` }, { role: 'user', content: text }]
  /** @type {string[]} */
  const calls = []
  /** @type {(ReturnType<typeof viewFrom> | null)[]} */
  const views = []
  for (let step = 0; step < STEPS; step++) {
    /** @type {any} */
    let message
    let words = ''
    for await (const event of streamChat({ brain, apiKey, fetch, system, messages, tools, maxTokens: 4096 })) { if (event.type === 'text') words += event.delta; if (event.type === 'done') message = event.message }
    const asked = message?.toolCalls ?? []
    // A plan's bridge says its own failures as text ("Error: Execution failed: …"): the server's, not the brain's.
    if (!asked.length && /^Error: /.test(words.trim())) throw new Error(words.trim().slice(0, 200))
    if (!asked.length) break
    messages.push(message)
    for (const call of asked) {
      calls.push(call.name)
      let content = '', isError = false
      try {
        if (call.name === 'table_rows') {
          const { rows } = query(one.table, one.rows, { ...(call.args?.filter && { filter: call.args.filter }), locale: lang })
          content = `${said}: ${rows.length} of its ${one.rows.length} rows. Its columns: ${columns}.\n${rows.map((row) => JSON.stringify({ row: row.id, ...Object.fromEntries(one.table.properties.flatMap((property) => (row.cells[property.id] === undefined ? [] : [[property.name, row.cells[property.id]]]))) })).join('\n')}`
        } else if (call.name === 'table_change') content = `Changed ${call.args?.rows?.length ?? 0} rows of ${one.table.name}, beside the conversation for the user to accept or reject.`
        else if (call.name === 'table_create') content = 'Made the table, open beside the conversation, with no rows yet.'
        else if (call.name === 'table_view') {
          views.push(null)
          const view = viewFrom(one.table, call.args)
          views[views.length - 1] = view
          content = `Proposed the view ${view.name} of ${one.table.name}: it keeps ${query(one.table, one.rows, { ...(view.filter && { filter: view.filter }), locale: lang }).rows.length} of its ${one.rows.length} rows. The user sees it over the collection, theirs alone, to keep or not; nothing else changed.`
        } else throw new Error(`No tool ${call.name} here.`)
      } catch (error) { content = /** @type {Error} */ (error).message; isError = true }
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content, ...(isError && { isError }) })
    }
  }
  return { calls, views }
}

/** One request, asked and scored. @param {any} chosen @param {string} lang @param {string} id @param {Kept} one @param {Wanted} want @param {string} text @param {string} me @returns {Promise<Outcome>} */
async function ask(chosen, lang, id, one, want, text, me) {
  const { calls, views } = await converse(chosen, lang, one, text), called = views.length > 0, taken = views.filter(Boolean), last = taken.at(-1)
  if (want.none) return { lang, id, none: true, called, taken: taken.length > 0, once: !called, right: !called, misses: called ? ['a view proposed'] : [], calls }
  const misses = last ? score(one, want, last, { lang, me }) : [called ? 'no view Jean takes' : 'no view proposed']
  return { lang, id, none: false, called, taken: taken.length > 0, once: Boolean(views[0]) && !score(one, want, /** @type {any} */ (views[0]), { lang, me }).length, right: !misses.length, misses, calls }
}

/** @template T @param {T[]} items @param {number} parallel @param {(item: T) => Promise<void>} work */
async function pool(items, parallel, work) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, async () => { while (next < items.length) await work(items[next++]) }))
}

/** @param {number} part @param {number} whole */
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—')

/** This brain's section of results.md. @param {string} name @param {Outcome[]} all @param {number} runs */
function report(name, all, runs) {
  const outcomes = all.filter((one) => !one.error), asked = outcomes.filter((one) => !one.none), others = outcomes.filter((one) => one.none), langs = [...new Set(outcomes.map((one) => one.lang))]
  const count = (/** @type {Outcome[]} */ items, /** @type {(one: Outcome) => boolean} */ is) => `${percent(items.filter(is).length, items.length)} (${items.filter(is).length}/${items.length})`
  const right = asked.filter((one) => one.right).length / (asked.length || 1), quiet = others.filter((one) => one.right).length / (others.length || 1)
  const misses = Object.entries(Object.groupBy(asked.filter((one) => !one.right).map((one) => `${one.id}: ${one.misses[0].replace(/\d+( \d+)*/g, 'n').slice(0, 50)}`), (miss) => miss))
    .sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0)).slice(0, 6).map(([miss, list]) => `${miss.replaceAll('|', '/')} (${list?.length})`).join('; ') || 'none'
  return `## ${name}, ${new Date().toISOString().slice(0, 10)}

Right on ${percent(asked.filter((one) => one.right).length, asked.length)} of ${asked.length} requests for a view (${langs.length} languages${runs > 1 ? `, ${runs} runs each` : ''}): ${right >= GATE ? 'over' : 'under'} the gate of ${GATE * 100}%. No view on ${percent(others.filter((one) => one.right).length, others.length)} of ${others.length} requests for something else: ${quiet >= QUIET ? 'over' : 'under'} the gate of ${QUIET * 100}%.${all.length > outcomes.length ? ` ${all.length - outcomes.length} conversations failed at the server and are left out.` : ''}

| Language | Called table_view | Taken | Right at once | Right | No view for something else |
|---|---:|---:|---:|---:|---:|
${langs.map((lang) => { const of = asked.filter((one) => one.lang === lang); return `| ${lang} | ${count(of, (one) => one.called)} | ${count(of, (one) => one.taken)} | ${count(of, (one) => one.once)} | ${count(of, (one) => one.right)} | ${count(others.filter((one) => one.lang === lang), (one) => one.right)} |` }).join('\n')}
| All | ${count(asked, (one) => one.called)} | ${count(asked, (one) => one.taken)} | ${count(asked, (one) => one.once)} | ${count(asked, (one) => one.right)} | ${count(others, (one) => one.right)} |

Commonest misses: ${misses}.
`
}

/** @param {string} name @param {string} section */
async function write(name, section) {
  const before = await readFile(`${DIR}results.md`, 'utf8').catch(() => '')
  const kept = before.split(/^(?=## )/m).slice(1).filter((part) => !part.startsWith(`## ${name}, `))
  await writeFile(`${DIR}results.md`, `# Views: how well brains propose one

Written by \`npm run views -- --write\`, one section per brain, replaced when that brain is measured again. Each request goes to the
brain as the first message of a conversation, with Jean's base prompt, the note of a collection open beside the task and Tables' four
tools, each call answered as Jean would, up to ${STEPS} steps (scripts/views.js). A view is right when Jean takes it and it shows what
the request asks: the rows it should keep, in order where one is asked, shown, grouped and hidden as asked, under a name in the
request's language. The gate, written before the first run: right on ${GATE * 100}% of the requests for a view or more, and no view on
${QUIET * 100}% or more of the requests for something else, an answer or a change.

${[section, ...kept].map((part) => part.trimEnd()).join('\n\n')}
`)
}

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
async function main(argv, env) {
  const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  if (!env.BRAIN) throw new Error('name a brain: BRAIN=<provider>:<model> (cli/brain.js)')
  const found = await chooseBrain({ named: env.BRAIN, address: env.BRAIN_ADDRESS, env })
  if (!found || 'needs' in found) throw new Error(`no brain "${env.BRAIN}"`)
  const chosen = { ...found, body: env.BRAIN_BODY ? JSON.parse(env.BRAIN_BODY) : undefined, description: flag('--description') }
  const name = `${found.brain.model} (${found.brain.provider}${chosen.description ? ', another wording' : ''})`
  const langs = (flag('--lang')?.split(',') ?? Object.keys(LANGS)).filter((lang) => LANGS[lang]), only = flag('--only')?.split(',')
  const runs = Number(flag('--runs') ?? 1), parallel = Number(flag('--parallel') ?? 4)
  const expected = /** @type {Record<string, Wanted>} */ (JSON.parse(await readFile(`${DIR}expected.json`, 'utf8')))
  console.log(`views: ${name}`)
  /** @type {Outcome[]} */
  const outcomes = []
  try {
    for (const lang of langs) {
      const set = JSON.parse(await readFile(`${DIR}${lang}.json`, 'utf8')), kept = Object.fromEntries(Object.entries(set.tables).map(([key, given], n) => [key, fixture(/** @type {any} */ (given), n + 1)]))
      const jobs = Object.keys(expected).filter((id) => !only || only.includes(id)).flatMap((id) => Array.from({ length: runs }, () => id))
      /** @type {Outcome[]} */
      const here = []
      await pool(jobs, parallel, async (id) => {
        try { here.push(await ask(chosen, lang, id, kept[expected[id].table], expected[id], set.requests[id], set.me)) } catch (error) { here.push({ lang, id, none: Boolean(expected[id].none), called: false, taken: false, once: false, right: false, misses: ['error'], calls: [], error: /** @type {Error} */ (error).message }) }
      })
      outcomes.push(...here)
      const done = here.filter((one) => !one.error)
      console.log(`${lang.padEnd(3)} views ${done.filter((one) => !one.none && one.right).length}/${done.filter((one) => !one.none).length}  others ${done.filter((one) => one.none && one.right).length}/${done.filter((one) => one.none).length}${here.length > done.length ? `  errors ${here.length - done.length}` : ''}`)
    }
  } finally {
    await /** @type {any} */ (found).close?.()
  }
  const section = report(name, outcomes, runs)
  console.log(`\n${section}`)
  if (argv.includes('--verbose')) for (const one of outcomes.filter((each) => !each.right)) console.log(`${one.lang} ${one.id}: ${one.misses.join('; ')} [${one.calls.join(', ')}]${one.error ? ` ${one.error}` : ''}`)
  if (argv.includes('--write')) await write(name, section)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2), process.env).catch((error) => { console.error(error.message); process.exitCode = 1 })
