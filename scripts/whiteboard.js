// SPDX-License-Identifier: MIT
// Whiteboard phase 0, a: how well a brain makes and sorts a whiteboard with its own two tools (test/whiteboard/tools.js), from
// requests in English, French, Arabic and Japanese (test/whiteboard/set.json), as the first message of a conversation with Jean's
// base prompt and the capability's lines, each call answered as Jean would, up to eight steps.
//   make:    a whiteboard asked for from words: its areas (how many, in the request's language, in time's order where asked),
//            a note in each, and every owner the request names.
//   regroup: a whiteboard of notes waiting on the shelf, open beside the task; sorted by id through table_rows then
//            whiteboard_change: every note in one area, none made but the actions asked for, ids intact.
//   choose:  every tool present (whiteboard, table_create, write): a whiteboard made where one is right, and none elsewhere.
//   tables:  test/tables/'s requests with the whiteboard's tools beside table_create: tables still right, whiteboards made for them.
//   skill:make, skill:choose, skill:tables: the same requests as Jean meets them before Whiteboards is found (T5): table_create, write
//            and `skill`, its line naming Jean's own skills, as own-skills declares them; reading "whiteboard" answers its steps and
//            declares whiteboard and whiteboard_change from the next step, as Jean does. Right: the skill read, then a whiteboard
//            made right where one is right, and none where a table or words are. With --found, as Jean is once Skills is found:
//            `skill`'s line names none, Skills adds save_skill and its rule, and <skills> lists Jean's own by their few English words.
// The brain comes from the environment, as for npm run tables: BRAIN=<provider>:<model> (cli/brain.js).
// Usage: BRAIN=claudecode:haiku npm run whiteboard                  every part, every language, once
//        npm run whiteboard -- --parts make,regroup --lang fr,ja --runs 3 --parallel 4 --write
//        npm run whiteboard -- --parts skill:make,skill:choose,skill:tables --runs 3 --verbose       through the skill
//        npm run whiteboard -- --parts skill:make,skill:choose,skill:tables --runs 3 --found         … once Skills is found
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chooseBrain } from '../cli/brain.js'
import { buildSystemPrompt } from '../app/core/prompt.js'
import { streamChat } from '../app/core/llm.js'
import { tableCreate, LINE as TABLE_LINE } from '../app/caps/tables/tool.js'
import { WHITEBOARD, WHITEBOARD_CHANGE, LINES, made, changed } from '../test/whiteboard/tools.js'
import { DIRECTORY, readFor, shownIn, listedOwn } from '../app/caps/skills/directory.js'
import { skillNamed, skillLines, parseSkill } from '../app/core/skills.js'
import { score, normal } from './tables.js'

const DIR = fileURLToPath(new URL('../test/whiteboard/', import.meta.url))
const TABLES = fileURLToPath(new URL('../test/tables/', import.meta.url))
const LANGS = /** @type {Record<string, string>} */ ({ en: 'English', fr: 'French', ar: 'Arabic', ja: 'Japanese' })
const STEPS = 8
const PARTS = ['make', 'regroup', 'choose', 'tables', 'skill:make', 'skill:choose', 'skill:tables']
const SCRIPT = { ar: /\p{Script=Arabic}/u, ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u }
const ROWS = { name: 'table_rows', description: 'Read the rows of a table the user keeps, each with its id, which table_change needs.', parameters: { type: 'object', required: ['table'], properties: { table: { type: 'string' } } } }
const WRITE = { name: 'write', description: 'Make a file the user keeps: a Word document from Markdown, a spreadsheet from a table, or text.', parameters: { type: 'object', required: ['name', 'content'], properties: { name: { type: 'string' }, content: { type: 'string' } } } }
const WRITE_LINE = { name: 'write', line: 'make a file: a Word document, a spreadsheet or text' }
/**
 * Jean's `skill` and its line as own-skills declares them before Skills is found, naming the directory's skills in its order and what
 * some are read for. A wording to try in their place, measured before any goes into Jean: SKILL_LINE, the whole line; TABLE_NOTE, the
 * words after table_create's description in place of its whiteboard's, none when empty (the line naming the skills alone and an empty
 * TABLE_NOTE measure Jean as it was before them).
 */
const SKILL = { name: 'skill', description: 'Read the steps of a skill.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } }
const SKILL_LINE = { name: 'skill', line: process.env.SKILL_LINE || `read the steps of a skill before asking the user anything for it or following it: ${DIRECTORY.map((entry) => entry.name).join(', ')}${readFor(DIRECTORY.map((entry) => entry.name))}` }
/** table_create as Tables declares it where the whiteboard's skill can be read, in the request's language, or with TABLE_NOTE's words. @param {string} lang */
const tableSpec = (lang) => (process.env.TABLE_NOTE == null ? tableCreate(lang, { whiteboard: true }) : ((spec) => ({ ...spec, description: [spec.description, process.env.TABLE_NOTE].filter(Boolean).join(' ') }))(tableCreate(lang)))
/**
 * Once Skills is found (--found), as app/caps/skills/skills.js declares it: `skill`'s line naming none, save_skill and its line, the
 * rule, and <skills> listing each of Jean's own by its `text-en` and what some are read for, in the directory's order, as listed() does
 * for a fresh room (listedOwn). SKILLS_TEXT in the environment takes the place of whiteboard's `when` there, as it stands, none when
 * empty (Jean before it), measured before any goes into Jean.
 */
const FOUND_LINE = { name: 'skill', line: process.env.SKILL_LINE || 'read the steps of a skill before asking the user anything for it or following it' }
const SAVE = { name: 'save_skill', description: 'Save a skill: how a task is done, to do it the same way every time. For a new one the user asks for, first ask the few things you need to know (what it is for, what they will give it, what should come back and how) unless the conversation already says, then save it. name: a few English words joined by hyphens; description: when to use it; example: a short request that uses it, complete enough to send as it is; steps: Markdown starting with a "# " title. Description, example and steps in the user’s language.',
  parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, example: { type: 'string' }, steps: { type: 'string' } }, required: ['name', 'description', 'example', 'steps'] } }
const SAVE_LINE = { name: 'save_skill', line: 'save how a task is done as a skill, or make one with the user, when they ask' }
const FOUND_RULE = 'When a request matches a skill, read it and follow its steps.'
/** <skills> once Skills is found. */
async function listing() {
  const own = await Promise.all(DIRECTORY.map(async ({ name }) => parseSkill(await readFile(new URL(`../app/caps/skills/directory/${name}/SKILL.md`, import.meta.url), 'utf8'), `skills/${name}/SKILL.md`) ?? { name, description: '' }))
  return skillLines(process.env.SKILLS_TEXT == null ? listedOwn(own, []) : own.map((skill) => ({ name: skill.name, description: `${shownIn(skill, 'en').text}${skill.name === 'whiteboard' ? process.env.SKILLS_TEXT : ''}` })))
}
/** Whether Skills is found, and its <skills>, from --found. */
const state = { found: false, skills: '' }
/** A skill's steps without its front matter, as `skill` answers; reading "whiteboard" says the tools it brings, as Jean does. @param {string} named */
async function skillRead(named) {
  const name = skillNamed(named).toLowerCase(), [dir, sheet] = name.split('/')
  const text = DIRECTORY.some((entry) => entry.name === dir) ? await readFile(new URL(`../app/caps/skills/directory/${dir}/${sheet ? `${sheet}.md` : 'SKILL.md'}`, import.meta.url), 'utf8').catch(() => null) : null
  if (!text) throw new Error(`There is no skill named "${name}".`)
  const steps = text.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
  return { name: dir, brings: dir === 'whiteboard' && !sheet, steps: dir === 'whiteboard' && !sheet ? `${steps}\n\nNew tools: whiteboard, whiteboard_change. You can call them directly from your next step.` : steps }
}
/** What a brain did where a whiteboard was right and none came. @param {string[]} calls */
const why = (calls) => (calls.includes('skill:whiteboard') ? `read the skill, then ${calls.filter((call) => !call.startsWith('skill')).join(', ') || 'words'}` : `skill not read: ${calls.join(', ') || 'words'}`)

/** @typedef {{ name: string, areas: { id: string, name: string }[], notes: { id: string, words: string, area: string, owner?: string, due?: string, added?: boolean }[] }} Board */
/** @typedef {{ part: string, lang: string, id: string, right: boolean, misses: string[], calls: string[], want?: boolean, error?: string }} Outcome */

/** A made-up note id, as a ULID looks. @param {number} i */
const idOf = (i) => `01JC${String(i).padStart(4, '0')}${'ABCDEFGHJKMNPQRSTVWXYZ'.repeat(2).slice(i % 7, i % 7 + 18)}`

/**
 * One conversation: the request (and a note beside it), each call answered as Jean would, until the brain answers in words or
 * STEPS run out; with `skills`, Jean's `skill` too, whose "whiteboard" declares the whiteboard's tools from the next step.
 * @param {any} chosen @param {string} lang @param {{ text: string, note?: string, tools: any[], lines: any[], board?: Board, skills?: boolean }} turn
 */
async function converse({ brain, apiKey, body }, lang, { text, note, tools, lines, board, skills = false }) {
  if (skills) (tools = [...tools, SKILL, ...(state.found ? [SAVE] : [])]), (lines = [...lines, ...(state.found ? [FOUND_LINE, SAVE_LINE] : [SKILL_LINE])])
  const system = buildSystemPrompt({ assistantName: 'Jean', uiLanguage: LANGS[lang], tools: lines, ...(skills && state.found && { rules: [FOUND_RULE], sections: { skills: state.skills } }), now: new Date() })
  /** @type {typeof fetch} */
  const fetch = (url, init) => globalThis.fetch(url, body && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...body }) } : init)
  /** @type {any[]} */
  const messages = [...(note ? [{ role: 'system', content: note }] : []), { role: 'user', content: text }]
  /** @type {string[]} */
  const calls = []
  /** @type {any[]} */
  const tables = []
  let made_ = /** @type {Board | null} */ (null)
  for (let step = 0; step < STEPS; step++) {
    /** @type {any} */
    let message
    let said = ''
    for await (const event of streamChat({ brain, apiKey, fetch, system, messages, tools, maxTokens: 8192 })) { if (event.type === 'text') said += event.delta; if (event.type === 'done') message = event.message }
    const asked = message?.toolCalls ?? []
    // A plan's bridge says its own failures as text ("Error: Execution failed: …"): the server's, not the brain's.
    if (!asked.length && /^Error: /.test(said.trim())) throw new Error(said.trim().slice(0, 200))
    if (!asked.length) break
    messages.push(message)
    for (const call of asked) {
      calls.push(call.name)
      let content = '', isError = false
      try {
        if (call.name === 'skill' && skills) {
          const read = await skillRead(String(call.args?.name ?? ''))
          calls[calls.length - 1] = `skill:${read.name}`
          content = read.steps
          if (read.brings && !tools.includes(WHITEBOARD)) tools = [...tools, WHITEBOARD, WHITEBOARD_CHANGE]
        } else if (call.name.startsWith('whiteboard') && !tools.includes(WHITEBOARD)) throw new Error(`There is no tool named "${call.name}".`)
        else if (call.name === 'whiteboard') {
          const one = made(call.args)
          made_ = { name: one.name, areas: one.areas.map((name, i) => ({ id: idOf(800 + i), name })), notes: one.notes.map((n, i) => ({ id: idOf(900 + i), ...n })) }
          content = `Made ${one.name}, at collections/01JCWHITEBOARD0000000000000-board, open beside the conversation: ${one.areas.length} areas, ${one.notes.length} notes.`
        } else if (call.name === 'table_rows' && board) {
          content = `${board.name} (collections/01JCSEEDED000000000000000-board), a whiteboard: ${board.areas.length} areas, ${board.notes.length} notes.\n${[
            ...board.areas.map((a) => JSON.stringify({ area: a.id, name: a.name })),
            ...board.notes.map((n) => JSON.stringify({ row: n.id, Note: n.words, ...(n.area ? { area: n.area } : { shelf: true }) }))].join('\n')}`
        } else if (call.name === 'whiteboard_change' && board) {
          const { move, add, rename, made: fresh } = changed(call.args, new Set(board.notes.map((n) => n.id)), board.areas)
          for (const name of fresh) board.areas.push({ id: name, name })
          for (const one of rename) for (const a of board.areas) if (a.id === one.area) a.name = one.name
          for (const one of move) { const n = board.notes.find((m) => m.id === one.note); if (n) n.area = one.area }
          for (const one of add) board.notes.push({ id: idOf(500 + board.notes.length), ...one, added: true })
          content = `Changed ${board.name}: ${move.length} notes moved, ${add.length} added, ${rename.length} areas renamed, beside the conversation for the user to accept or reject.`
        } else if (call.name === 'table_create') {
          tables.push(call.args)
          content = 'Made the table, open beside the conversation, with no rows yet.'
        } else if (call.name === 'write') content = `Made ${call.args?.name ?? 'the file'}.`
        else if (call.name === 'save_skill' && state.found) content = `Saved the skill ${call.args?.name ?? ''}.`
        else throw new Error(`No tool ${call.name} here.`)
      } catch (error) { content = /** @type {Error} */ (error).message; isError = true }
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content, ...(isError && { isError }) })
    }
  }
  return { calls, made: made_, tables }
}

/** Whether a name is in the request's language, as far as its script tells. @param {string} lang @param {string} name */
const inLanguage = (lang, name) => (SCRIPT[lang] ? SCRIPT[lang].test(name) : /\p{Script=Latin}/u.test(name) || /\d/.test(name))

/** Where an area falls in time, from a number or a month or an ordinal in its name; -1 for none. @param {string} name */
function when(name) {
  const digits = name.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).match(/\d+/)
  if (digits) return Number(digits[0])
  const words = normal(name)
  const known = [['first', 'premier', 'premiere', 'اول', 'october', 'octobre', 'اكتوبر'], ['second', 'deuxieme', 'seconde', 'ثاني', 'november', 'novembre', 'نوفمبر'],
    ['third', 'troisieme', 'ثالث', 'december', 'decembre', 'ديسمبر'], ['fourth', 'quatrieme', 'رابع'], ['fifth', 'cinquieme', 'خامس']]
  const at = known.findIndex((list) => list.some((word) => words.includes(word)))
  return at < 0 ? -1 : at + 1
}

/** Whether every owner named is in a note, by its words or its owner. @param {string[]} owners @param {{ words: string, owner?: string }[]} notes */
const owned = (owners, notes) => owners.filter((owner) => !notes.some((n) => normal(`${n.words} ${n.owner ?? ''}`).includes(normal(owner))))

/** @param {{ min: number, max: number, order?: boolean }} want @param {string[]} areas @param {string} lang @param {string[]} misses */
function areasRight(want, areas, lang, misses) {
  if (areas.length < want.min || areas.length > want.max) misses.push(`${areas.length} areas`)
  const foreign = areas.filter((name) => !inLanguage(lang, name))
  if (foreign.length) misses.push(`not in ${lang}: ${foreign.slice(0, 2).join(', ')}`)
  if (want.order) {
    const times = areas.map(when).filter((at) => at >= 0)
    if (times.length < Math.min(3, areas.length) || times.some((at, i) => i && at <= times[i - 1])) misses.push(`order: ${areas.slice(0, 5).join(' / ')}`)
  }
}

/** @param {any} chosen @param {any} set @param {string} lang @param {string} id @param {boolean} [skills] through the skill */
async function makeOne(chosen, set, lang, id, skills = false) {
  const brief = set.make[id]
  const { calls, made: board } = await converse(chosen, lang, { text: brief[lang], ...(skills ? { tools: [tableSpec(lang), WRITE], lines: [TABLE_LINE, WRITE_LINE], skills } : { tools: [WHITEBOARD, WHITEBOARD_CHANGE], lines: LINES }) })
  const misses = []
  if (!board) misses.push(skills ? `no whiteboard, ${why(calls)}` : 'no whiteboard')
  else {
    const names = board.areas.map((a) => a.name)
    areasRight(brief.areas, names, lang, misses)
    const empty = board.areas.filter((a) => !board.notes.some((n) => n.area === a.name)).map((a) => a.name)
    if (empty.length) misses.push(`empty: ${empty.slice(0, 2).join(', ')}`)
    const lost = owned(brief.owners?.[lang] ?? [], board.notes)
    if (lost.length) misses.push(`owner ${lost.join(', ')}`)
  }
  return { right: !misses.length, misses, calls }
}

/** @param {any} chosen @param {any} set @param {string} lang @param {string} id */
async function regroupOne(chosen, set, lang, id) {
  const seed = set.regroup[id]
  /** @type {Board} */
  const board = { name: id, areas: [], notes: seed.notes[lang].map((/** @type {string} */ words, /** @type {number} */ i) => ({ id: idOf(i), words, area: '' })) }
  const note = `The whiteboard ${id} (collections/01JCSEEDED000000000000000-board) is open beside the conversation: ${board.notes.length} notes waiting on its shelf, in no area yet. Read its notes with table_rows.`
  const { calls } = await converse(chosen, lang, { text: seed.request[lang], note, tools: [ROWS, WHITEBOARD, WHITEBOARD_CHANGE], lines: [...LINES, { name: 'table_rows', line: 'read the rows of a table or a whiteboard, with their ids' }], board })
  const misses = []
  if (calls.includes('whiteboard')) misses.push('made another whiteboard')
  const seeded = board.notes.filter((n) => !n.added)
  const left = seeded.filter((n) => !n.area)
  if (left.length) misses.push(`${left.length} notes left on the shelf`)
  const reworded = seeded.filter((n, i) => n.words !== seed.notes[lang][i])
  if (reworded.length) misses.push(`${reworded.length} reworded`)
  const used = board.areas.filter((a) => board.notes.some((n) => n.area === a.id)).map((a) => a.name)
  areasRight(seed.areas, used, lang, misses)
  const added = board.notes.filter((n) => n.added)
  if (!seed.owners && added.length) misses.push(`${added.length} notes made`)
  const lost = owned(seed.owners?.[lang] ?? [], added)
  if (lost.length) misses.push(`owner ${lost.join(', ')}`)
  return { right: !misses.length, misses, calls }
}

/** @param {any} chosen @param {any} set @param {string} lang @param {number} i */
async function chooseOne(chosen, set, lang, i) {
  const request = set.choose[i]
  const { calls } = await converse(chosen, lang, { text: request[lang], tools: [WHITEBOARD, WHITEBOARD_CHANGE, tableCreate(lang), WRITE], lines: [...LINES, TABLE_LINE, WRITE_LINE] })
  const did = calls.includes('whiteboard')
  return { right: did === request.whiteboard, misses: did === request.whiteboard ? [] : [did ? 'made a whiteboard' : `none: ${calls.join(', ') || 'words'}`], calls }
}

/**
 * A choosing request through the skill: where a whiteboard is right, the skill read, then one made of three to seven areas in the
 * request's language, a note in each; elsewhere none. @param {any} chosen @param {any} set @param {string} lang @param {number} i
 */
async function skillChooseOne(chosen, set, lang, i) {
  const request = set.choose[i]
  const { calls, made: board } = await converse(chosen, lang, { text: request[lang], tools: [tableSpec(lang), WRITE], lines: [TABLE_LINE, WRITE_LINE], skills: true })
  const misses = []
  if (!request.whiteboard && calls.includes('whiteboard')) misses.push('made a whiteboard')
  if (request.whiteboard && !board) misses.push(`no whiteboard, ${why(calls)}`)
  if (request.whiteboard && board) {
    areasRight({ min: 3, max: 7 }, board.areas.map((a) => a.name), lang, misses)
    const empty = board.areas.filter((a) => !board.notes.some((n) => n.area === a.name)).map((a) => a.name)
    if (empty.length) misses.push(`empty: ${empty.slice(0, 2).join(', ')}`)
  }
  return { right: !misses.length, misses, calls, want: request.whiteboard }
}

/** @param {any} chosen @param {string} lang @param {string} id @param {any} expected @param {string} text @param {boolean} [skills] through the skill */
async function tableOne(chosen, lang, id, expected, text, skills = false) {
  const { calls, tables } = await converse(chosen, lang, { text, ...(skills ? { tools: [tableSpec(lang), WRITE], lines: [TABLE_LINE, WRITE_LINE], skills } : { tools: [tableCreate(lang), WHITEBOARD, WHITEBOARD_CHANGE], lines: [TABLE_LINE, ...LINES] }) })
  const scored = score(expected, tables[0] ?? null)
  const misses = [...(calls.includes('whiteboard') ? ['made a whiteboard'] : []), ...scored.misses]
  return { right: scored.correct && !calls.includes('whiteboard'), misses, calls }
}

/** The tables set in one language, the kinds from English, as scripts/tables.js reads it. @param {string} lang */
async function tablesIn(lang) {
  const english = JSON.parse(await readFile(`${TABLES}en.json`, 'utf8'))
  const set = lang === 'en' ? english : JSON.parse(await readFile(`${TABLES}${lang}.json`, 'utf8'))
  const expected = Object.fromEntries(Object.entries(english.tables).map(([id, properties]) => [id, /** @type {any[]} */ (properties).map((property, i) => ({
    ...property, names: set.tables[id][i].names, ...(property.options ? { options: set.tables[id][i].options } : {}) }))]))
  return { requests: /** @type {Record<string, string>} */ (set.requests), expected }
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
  const outcomes = all.filter((one) => !one.error)
  const parts = [...new Set(outcomes.map((one) => one.part))], langs = [...new Set(outcomes.map((one) => one.lang))]
  const cell = (/** @type {Outcome[]} */ items) => `${percent(items.filter((one) => one.right).length, items.length)} (${items.filter((one) => one.right).length}/${items.length})`
  const misses = (/** @type {Outcome[]} */ items) => Object.entries(Object.groupBy(items.flatMap((one) => one.misses.map((miss) => miss.replace(/\d+/g, 'n').slice(0, 60))), (miss) => miss))
    .sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0)).slice(0, 4).map(([miss, list]) => `${miss.replaceAll('|', '/')} (${list?.length})`).join('; ') || '—'
  const whiteboards = outcomes.filter((one) => one.part.endsWith('tables') && one.calls.includes('whiteboard')).length
  // Through the skill: where a whiteboard is right, made right after reading it, by language; and those made where none is.
  const wanted = outcomes.filter((one) => one.part === 'skill:make' || (one.part === 'skill:choose' && one.want)), unwanted = outcomes.filter((one) => one.part === 'skill:choose' && one.want === false)
  const found = wanted.length ? ` Through the skill, a whiteboard made right where one is right: ${cell(wanted)}, ${langs.map((lang) => `${lang} ${percent(wanted.filter((one) => one.lang === lang && one.right).length, wanted.filter((one) => one.lang === lang).length)}`).join(', ')}; the skill read on ${percent(wanted.filter((one) => one.calls.includes('skill:whiteboard')).length, wanted.length)} of them. Whiteboards made where a table or words are right: ${unwanted.filter((one) => one.calls.includes('whiteboard')).length} of ${unwanted.length}.` : ''
  return `## ${name}, ${new Date().toISOString().slice(0, 10)}

${outcomes.length} conversations${runs > 1 ? `, ${runs} runs each` : ''}${state.found ? ', Skills found' : ''}${all.length > outcomes.length ? `; ${all.length - outcomes.length} failed at the server and are left out` : ''}.${parts.some((part) => part.endsWith('tables')) ? ` Whiteboards made for ordinary tables: ${whiteboards}.` : ''}${found}

| Part | ${langs.join(' | ')} | All | Commonest misses |
|---|${langs.map(() => '---:').join('|')}|---:|---|
${parts.map((part) => { const of = outcomes.filter((one) => one.part === part); return `| ${part} | ${langs.map((lang) => cell(of.filter((one) => one.lang === lang))).join(' | ')} | ${cell(of)} | ${misses(of)} |` }).join('\n')}
`
}

/** @param {string} name @param {string} section */
async function write(name, section) {
  const before = await readFile(`${DIR}results.md`, 'utf8').catch(() => '')
  const kept = before.split(/^(?=## )/m).slice(1).filter((part) => !part.startsWith(`## ${name}, `))
  await writeFile(`${DIR}results.md`, `# Whiteboard: how well brains make and sort one

Written by \`npm run whiteboard -- --write\`, one section per brain, replaced when that brain is measured again. Each conversation
has Jean's base prompt and the lines of the tools present, each call answered as Jean would, up to ${STEPS} steps (scripts/whiteboard.js).
The gate, written before the first run: Haiku right on 85% of runs or more and Sonnet on 90%, Arabic and Japanese within 10 points
of English, ordinary tables right on 96% or more, and at most 2 whiteboards made for them.

${[section, ...kept].map((part) => part.trimEnd()).join('\n\n')}
`)
}

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
async function main(argv, env) {
  const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  if (!env.BRAIN) throw new Error('name a brain: BRAIN=<provider>:<model> (cli/brain.js)')
  const found = await chooseBrain({ named: env.BRAIN, address: env.BRAIN_ADDRESS, env })
  if (!found || 'needs' in found) throw new Error(`no brain "${env.BRAIN}"`)
  const chosen = { ...found, body: env.BRAIN_BODY ? JSON.parse(env.BRAIN_BODY) : undefined }
  const name = `${found.brain.model} (${found.brain.provider})`
  const langs = (flag('--lang')?.split(',') ?? Object.keys(LANGS)).filter((lang) => LANGS[lang])
  const parts = (flag('--parts')?.split(',') ?? PARTS).filter((part) => PARTS.includes(part))
  const runs = Number(flag('--runs') ?? 1), parallel = Number(flag('--parallel') ?? 4)
  const set = JSON.parse(await readFile(`${DIR}set.json`, 'utf8'))
  if (argv.includes('--found')) Object.assign(state, { found: true, skills: await listing() })
  console.log(`whiteboard: ${name}, ${parts.join(', ')}${state.found ? ', Skills found' : ''}`)
  /** @type {Outcome[]} */
  const outcomes = []
  try {
    for (const lang of langs) {
      const tables = parts.some((part) => part.endsWith('tables')) ? await tablesIn(lang) : null
      /** @type {{ part: string, id: string, run: () => Promise<{ right: boolean, misses: string[], calls: string[] }> }[]} */
      const jobs = [
        ...(parts.includes('make') ? Object.keys(set.make).map((id) => ({ part: 'make', id, run: () => makeOne(chosen, set, lang, id) })) : []),
        ...(parts.includes('regroup') ? Object.keys(set.regroup).map((id) => ({ part: 'regroup', id, run: () => regroupOne(chosen, set, lang, id) })) : []),
        ...(parts.includes('choose') ? set.choose.map((/** @type {any} */ _, /** @type {number} */ i) => ({ part: 'choose', id: String(i), run: () => chooseOne(chosen, set, lang, i) })) : []),
        ...(tables && parts.includes('tables') ? Object.keys(tables.requests).map((id) => ({ part: 'tables', id, run: () => tableOne(chosen, lang, id, tables.expected[id], tables.requests[id]) })) : []),
        ...(parts.includes('skill:make') ? Object.keys(set.make).map((id) => ({ part: 'skill:make', id, run: () => makeOne(chosen, set, lang, id, true) })) : []),
        ...(parts.includes('skill:choose') ? set.choose.map((/** @type {any} */ _, /** @type {number} */ i) => ({ part: 'skill:choose', id: String(i), run: () => skillChooseOne(chosen, set, lang, i) })) : []),
        ...(tables && parts.includes('skill:tables') ? Object.keys(tables.requests).map((id) => ({ part: 'skill:tables', id, run: () => tableOne(chosen, lang, id, tables.expected[id], tables.requests[id], true) })) : []),
      ].flatMap((job) => Array.from({ length: runs }, () => job))
      /** @type {Outcome[]} */
      const here = []
      await pool(jobs, parallel, async (job) => {
        try { here.push({ part: job.part, lang, id: job.id, ...(await job.run()) }) } catch (error) { here.push({ part: job.part, lang, id: job.id, right: false, misses: ['error'], calls: [], error: /** @type {Error} */ (error).message }) }
      })
      outcomes.push(...here)
      console.log(`${lang.padEnd(3)} ${parts.map((part) => { const of = here.filter((one) => one.part === part && !one.error); return `${part} ${of.filter((one) => one.right).length}/${of.length}` }).join('  ')}${here.some((one) => one.error) ? `  errors ${here.filter((one) => one.error).length}: ${here.find((one) => one.error)?.error}` : ''}`)
    }
  } finally {
    await /** @type {any} */ (found).close?.()
  }
  const section = report(name, outcomes, runs)
  console.log(`\n${section}`)
  if (argv.includes('--verbose')) for (const one of outcomes.filter((each) => !each.right)) console.log(`${one.part} ${one.lang} ${one.id}: ${one.misses.join('; ')} [${one.calls.join(', ')}]${one.error ? ` ${one.error}` : ''}`)
  if (argv.includes('--write')) await write(name, section)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2), process.env).catch((error) => { console.error(error.message); process.exitCode = 1 })
