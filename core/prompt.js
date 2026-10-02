// pi-style system prompt: a short preamble plus sections, frozen when a conversation
// starts (D46). Later changes become system notes in the transcript, never edits.
// Instructions stay in English (models follow them best); replies follow the user.
// See prompts/system.md.
import { metaRecord, noteRecord } from './events.js'

/** @typedef {import('./types.js').Envelope} Envelope */
/** @typedef {import('./types.js').PromptState} PromptState */

const PREAMBLE = `You are {name}, an assistant that does work for people, right in their web browser.
You read the files they share, work things out, and hand back results they can use.`

const RULES = [
  'The user is not technical. Use plain words. Show code only if asked.',
  'Do the work first, then say briefly what you did and where the result is.',
  'If the request is unclear, ask one short question. Otherwise, proceed.',
  'Never invent facts, numbers, quotes or sources. Say when you are unsure.',
  'Be concise.',
]

/**
 * @typedef {Object} PromptInput
 * @property {string} assistantName
 * @property {string} uiLanguage          language name in English, e.g. "French"
 * @property {{ name: string, line: string }[]} [tools]
 * @property {string[]} [rules]          contributed by capabilities
 * @property {string} [project]          project name and short persona
 * @property {string[]} [instructions]   org (locked), global, project
 * @property {string[]} [memory]
 * @property {string[]} [skills]         "name: when to use it"
 * @property {Date} [now]
 */

/** @param {PromptInput} input */
export function buildSystemPrompt(input) {
  const { assistantName, uiLanguage, tools = [], rules = [], project, instructions = [], memory = [], skills = [], now } = input
  const sections = [PREAMBLE.replace('{name}', assistantName)]
  if (tools.length) sections.push(tag('tools', tools.map((tool) => `- ${tool.name}: ${tool.line}`).join('\n')))
  sections.push(tag('rules', [...RULES, ...rules].map((rule) => `- ${rule}`).join('\n')))
  sections.push(tag('language', `Reply in the language of the user's last message. If that is unclear, use ${uiLanguage}.`))
  if (project) sections.push(tag('project', project))
  if (instructions.length) sections.push(tag('instructions', instructions.join('\n\n')))
  if (memory.length) sections.push(tag('memory', memory.join('\n')))
  if (skills.length) sections.push(tag('skills', skills.map((skill) => `- ${skill}`).join('\n')))
  if (now) sections.push(tag('context', `Today is ${localDate(now)}.`))
  return sections.join('\n\n')
}

/** @param {string} name @param {string} body */
function tag(name, body) {
  return `<${name}>\n${body}\n</${name}>`
}

/** Base prompt measured by scripts/budgets.js. */
export function basePromptForBudget() {
  return buildSystemPrompt({ assistantName: 'Jean', uiLanguage: 'English' })
}

/**
 * What the brain is told about the world at this moment.
 * @param {{ language: string, tools: string[], now?: Date }} input language in English, e.g. "French"
 * @returns {PromptState}
 */
export function promptState({ language, tools, now = new Date() }) {
  return { language, date: localDate(now), tools: [...tools].sort() }
}

/** YYYY-MM-DD in the device's time zone. @param {Date} date */
const localDate = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

/** The record that freezes a conversation's prompt. @param {string} by @param {string} system @param {PromptState} state */
export function promptRecord(by, system, state) {
  return metaRecord(by, { prompt: { system, state } })
}

/**
 * The frozen prompt, and the state the brain knows of now: the frozen state with every
 * later note applied. Null for a conversation that has never been sent to a brain.
 * @param {Envelope[]} records
 * @returns {{ system: string, state: PromptState } | null}
 */
export function frozenPrompt(records) {
  const first = records.find((record) => record.meta?.prompt)?.meta?.prompt
  if (!first) return null
  const state = { ...first.state, tools: [...first.state.tools] }
  for (const record of records) {
    const update = record.update
    if (update?.sessionUpdate !== '_system_note') continue
    const { data } = update
    if (data.kind === 'language') state.language = data.language
    else if (data.kind === 'date') state.date = data.date
    else if (data.kind === 'tools') state.tools = [...new Set([...state.tools, ...data.added])].sort()
  }
  return { system: first.system, state }
}

/**
 * Notes for whatever changed between what the brain knows and now, one change per note.
 * Tools are only ever added: a tool the brain has seen stays declared (D47).
 * @param {PromptState} known @param {PromptState} now
 * @returns {Envelope[]}
 */
export function changeNotes(known, now) {
  const notes = []
  if (now.language !== known.language) {
    notes.push(noteRecord(`The interface language is now ${now.language}.`, { kind: 'language', language: now.language }))
  }
  if (now.date !== known.date) notes.push(noteRecord(`Today is ${now.date}.`, { kind: 'date', date: now.date }))
  const added = now.tools.filter((name) => !known.tools.includes(name))
  if (added.length) {
    notes.push(noteRecord(`New tools are available: ${added.join(', ')}.`, { kind: 'tools', added }))
  }
  return notes
}
