// pi-style system prompt: a short preamble plus sections, frozen when a conversation
// starts (D46). Later changes become system notes in the transcript, never edits.
// Instructions stay in English (models follow them best); replies follow the user.
// Then what the brain reads after it: the conversation's records as messages.
import { metaRecord, noteRecord, foldTurns } from './events.js'

/** @import { Envelope, PromptState, ChatMessage, ToolMessage, ResourceLink, DocumentPart } from './types.js' */

const PREAMBLE = `You are {name}, an assistant that does work for people, right in their web browser.
You read the files they share, work things out, and hand back results they can use.`

const RULES = [
  'The user is not technical. Use plain words. Show code only if asked.',
  'Do the work first, then say briefly what you did and where the result is.',
  'If the request is unclear, ask one short question. Otherwise, proceed.',
  'Never invent facts, numbers, quotes or sources. Say when you are unsure.',
  'Cite numbered sources as [n].',
  'Write math in a ```latex block, and formulas in a sentence as $…$.',
  'Be concise.',
  'End with up to 3 short requests the user might send next, inside <suggestions>, one per line.',
]

/**
 * The context a conversation starts with, in prompt order: the project's name, the user's
 * instructions (organisation, global, project), what Jean noticed, the skills ("name: when
 * to use it"), the connected services and their tools, the folder the conversation works in (D141),
 * the page open in the browser. Each is frozen with the rest, then changed by notes.
 * @typedef {Partial<Record<'project' | 'instructions' | 'memory' | 'skills' | 'connections' | 'folder' | 'page', string>>} Sections
 */
const SECTIONS = /** @type {const} */ (['project', 'instructions', 'memory', 'skills', 'connections', 'folder', 'page'])

/**
 * @typedef {Object} PromptInput
 * @property {string} assistantName
 * @property {string} uiLanguage          language name in English, e.g. "French"
 * @property {{ name: string, line: string }[]} [tools]
 * @property {string[]} [rules]          contributed by capabilities
 * @property {Sections} [sections]
 * @property {Date} [now]
 */

/** @param {PromptInput} input */
export function buildSystemPrompt(input) {
  const { assistantName, uiLanguage, tools = [], rules = [], sections = {}, now } = input
  const parts = [PREAMBLE.replace('{name}', assistantName)]
  if (tools.length) parts.push(tag('tools', tools.map((tool) => `- ${tool.name}: ${tool.line}`).join('\n')))
  parts.push(tag('rules', [...new Set([...RULES, ...rules])].map((rule) => `- ${rule}`).join('\n')))
  parts.push(tag('language', `Reply in the language of the user's last message. If that is unclear, use ${uiLanguage}.`))
  for (const name of SECTIONS) if (sections[name]) parts.push(tag(name, /** @type {string} */ (sections[name])))
  if (now) parts.push(tag('context', `Today is ${localDate(now)}.`))
  return parts.join('\n\n')
}

/** @param {string} name @param {string} body */
const tag = (name, body) => `<${name}>\n${body}\n</${name}>`

/** Base prompt measured by scripts/budgets.js. */
export const basePromptForBudget = () => buildSystemPrompt({ assistantName: 'Jean', uiLanguage: 'English' })

/**
 * What the brain is told about the world at this moment. Sections are kept as fingerprints,
 * enough to notice that one changed.
 * @param {{ language: string, tools: string[], now?: Date, sections?: Sections }} input language in English, e.g. "French"
 * @returns {PromptState}
 */
export function promptState({ language, tools, now = new Date(), sections = {} }) {
  const prints = Object.fromEntries(SECTIONS.flatMap((name) => (sections[name] ? [[name, fingerprint(/** @type {string} */ (sections[name]))]] : [])))
  return { language, date: localDate(now), tools: [...tools].sort(), ...(Object.keys(prints).length && { sections: prints }) }
}

/** FNV-1a, in base 36. @param {string} text */
function fingerprint(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(36)
}

/** YYYY-MM-DD in the device's time zone. @param {Date} date */
const localDate = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

/** The record that freezes a conversation's prompt. @param {string} by @param {string} system @param {PromptState} state */
export const promptRecord = (by, system, state) => metaRecord(by, { prompt: { system, state } })

/**
 * The frozen prompt, and the state the brain knows of now: the frozen state with every
 * later note applied. Null for a conversation that has never been sent to a brain.
 * @param {Envelope[]} records
 * @returns {{ system: string, state: PromptState } | null}
 */
export function frozenPrompt(records) {
  const first = records.find((record) => record.meta?.prompt)?.meta?.prompt
  if (!first) return null
  const state = { ...first.state, tools: [...first.state.tools], deferred: [...first.state.deferred ?? []], off: /** @type {string[]} */ ([]), sections: { ...first.state.sections } }
  /** @param {'tools' | 'deferred' | 'off'} list @param {string[]} names */
  const add = (list, names) => { state[list] = [...new Set([...state[list], ...names])].sort() }
  for (const record of records) {
    const update = record.update
    // find_tools and accepted offers declare tools from the next request on (D47); a helper's, for itself.
    if (update?.sessionUpdate === 'tool_call' && update._meta?.declare && !update._meta.parent) add('tools', update._meta.declare)
    if (update?.sessionUpdate !== '_system_note') continue
    const { data } = update
    if (data.kind === 'language') state.language = data.language
    else if (data.kind === 'date') state.date = data.date
    else if (data.kind === 'tools') add('deferred', data.added)
    else if (data.kind === 'switch') state.off = [...state.off, ...data.off ?? []].filter((name, i, all) => !data.on?.includes(name) && all.indexOf(name) === i).sort()
    else if (data.kind === 'section') state.sections[data.name] = data.version
  }
  const { deferred, off, sections, ...rest } = state
  return { system: first.system, state: { ...rest, ...(deferred.length && { deferred }), ...(off.length && { off }), ...(Object.keys(sections).length && { sections }) } }
}

/**
 * Notes for whatever changed between what the brain knows and now, one change per note.
 * A section that changed is given whole. Tools are only ever added, deferred: found with
 * find_tools (D47); one the user turns off stays declared, and the brain is told (D304).
 * @param {PromptState} known @param {PromptState} now @param {Sections} [sections] their text now
 * @param {string[]} [off] the tools the user turned off now
 * @returns {Envelope[]}
 */
export function changeNotes(known, now, sections = {}, off = []) {
  const notes = []
  if (now.language !== known.language) notes.push(noteRecord(`The interface language is now ${now.language}.`, { kind: 'language', language: now.language }))
  if (now.date !== known.date) notes.push(noteRecord(`Today is ${now.date}.`, { kind: 'date', date: now.date }))
  for (const name of SECTIONS) {
    const version = now.sections?.[name] ?? ''
    if (version === (known.sections?.[name] ?? '')) continue
    const text = version ? `The <${name}> section is now:\n${sections[name]}` : `The <${name}> section is now empty.`
    notes.push(noteRecord(text, { kind: 'section', name, version }))
  }
  const added = now.tools.filter((name) => !known.tools.includes(name) && !known.deferred?.includes(name))
  if (added.length) notes.push(noteRecord(`New tools can be found with find_tools: ${added.join(', ')}.`, { kind: 'tools', added }))
  const knows = (/** @type {string} */ name) => known.tools.includes(name) || Boolean(known.deferred?.includes(name))
  const turned = off.filter((name) => knows(name) && !known.off?.includes(name))
  if (turned.length) notes.push(noteRecord(`Turned off by the user, not to be called until it is on again: ${turned.join(', ')}.`, { kind: 'switch', off: turned }))
  const back = (known.off ?? []).filter((name) => !off.includes(name) && now.tools.includes(name))
  if (back.length) notes.push(noteRecord(`Turned on again by the user: ${back.join(', ')}.`, { kind: 'switch', on: back }))
  return notes
}

/**
 * The model's context: system notes and user messages, then per step one assistant
 * message followed by its tool results. Brain entries (kind "think", no name) are skipped,
 * except for the provider-native blocks they keep for replay.
 * @param {Envelope[]} records
 * @param {(link: ResourceLink) => DocumentPart} [document] the text the brain reads for a linked file
 * @param {{ step: number } | null} [resume] the last turn's step whose unended calls run again now, their results to come (D212)
 * @returns {ChatMessage[]}
 */
export function toChatMessages(records, document = (link) => ({ name: link.name, text: '' }), resume = null) {
  /** @type {ChatMessage[]} */
  const messages = []
  const turns = foldTurns(records)
  for (const turn of turns) {
    for (const note of turn.notes) messages.push({ role: 'system', content: note.text })
    if (turn.user) {
      const documents = turn.user.files.map(document)
      messages.push({ role: 'user', content: turn.user.text, ...(documents.length && { documents }) })
    }
    for (const step of [...turn.steps].sort((a, b) => a.index - b.index)) {
      // A script's own calls (codemode) are part of its result, not of the brain's turn.
      const calls = step.tools.filter((tool) => tool.name && !tool._meta?.parent)
      if (!step.text && !calls.length) continue
      const brain = step.tools.find((tool) => tool.kind === 'think' && !tool.name && tool._meta?.raw)
      messages.push({
        role: 'assistant',
        content: step.text,
        ...(calls.length && { toolCalls: calls.map((tool) => ({ id: tool.toolCallId, name: String(tool.name), args: tool.rawInput ?? {} })) }),
        ...(brain && { raw: brain._meta?.raw, rawModel: brain.rawInput?.model }),
      })
      for (const tool of calls) {
        // A call that never ended (stopped, or the page closed) was cut short, unless it runs again now (D212).
        if (tool.status === 'pending' && turn === turns.at(-1) && step.index === resume?.step) continue
        /** @type {ToolMessage} */
        const result = { role: 'tool', toolCallId: tool.toolCallId, name: String(tool.name), content: tool.status === 'pending' || tool.status === 'in_progress' ? 'Cut short before it ended: it may not have been done.' : stringify(tool.rawOutput) }
        if (tool.status !== 'completed') result.isError = true
        messages.push(result)
      }
    }
  }
  return messages
}

/** @param {unknown} value */
const stringify = (value) => (value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value))
