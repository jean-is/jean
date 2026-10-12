// Conversation titles (D112): written while the first answer is, in one short request outside
// the conversation, by the simplest brain at hand: the fast model of the provider answering, or
// that brain itself. The message goes where it is going anyway, and the conversation's prompt
// and cache are untouched. When there is no brain to ask, the message's first words.
import { app, loadModels, refreshConversations } from './state.js'
import { getSecret } from './secrets.js'
import { TIERS } from './auto.js'
import { appendRecords } from '../core/conversations.js'
import { linkedFiles, metaRecord, openingOf, routineOf, titleOf } from '../core/events.js'
import { firstWords } from '../core/i18n.js'
import { fire } from '../core/hooks.js'
import { contributions } from './caps.js'

/** @import { Envelope, BrainConfig } from '../core/types.js' */

const TITLER = 'Write a title for the conversation this message starts: at most six words, in the language of the message, with no quotes and no full stop. Reply with the title alone.'

/** Conversations being named, by path. @type {Map<string, Promise<void>>} */
const naming = new Map()

/**
 * Names a conversation from the message that opened it, unless it has a name or one is coming.
 * @param {string} path @param {Envelope[]} records @param {BrainConfig} brain the brain answering it
 */
export function nameConversation(path, records, brain) {
  if (titleOf(records) || naming.has(path)) return naming.get(path)
  const job = titleFor(records, brain).then(async (title) => {
    // The user named it meanwhile (D288).
    if (!title || app.conversations.peek().find((item) => item.path === path)?.title) return
    const record = metaRecord(app.deviceId, { title })
    await appendRecords(app.fs, path, [record])
    const current = app.current.peek()
    if (current?.path === path) app.current.value = { ...current, records: [...current.records, record] }
    await refreshConversations()
  }).catch((error) => console.warn('Title', error)).finally(() => naming.delete(path))
  naming.set(path, job)
  return job
}

/** @param {Envelope[]} records @param {BrainConfig} brain */
async function titleFor(records, brain) {
  // A routine's run takes its routine's name (D122).
  const routine = routineOf(records)
  if (routine) return routine.title
  const text = openingOf(records)
  const names = linkedFiles(records).map((link) => link.name)
  if (!text) return names[0] ?? ''
  const fallback = firstWords(text)
  // The device's brain writes one answer at a time: a title would hold this one up.
  if (brain.api === 'device') return fallback
  try {
    const { streamChat } = await import('../core/llm.js')
    const [asked, apiKey] = await Promise.all([simplest(brain), getSecret(app.fs, brain.id)])
    let reply = ''
    // A step of its own, through the capabilities' hooks as a turn's are.
    const events = await fire(contributions().hooks, 'turn.step', {
      brain: asked,
      system: [TITLER, app.policy.instructions].filter(Boolean).join('\n\n'),
      messages: [{ role: 'user', content: [text.slice(0, 2000), names.length ? `(${names.join(', ')})` : ''].filter(Boolean).join('\n\n') }],
      tools: [],
      maxTokens: 400,
      signal: AbortSignal.timeout(20_000),
    }, (e) => streamChat({ ...e, apiKey: apiKey ?? undefined }))
    for await (const event of events) if (event.type === 'text') reply += event.delta
    return tidy(reply) || fallback
  } catch (error) {
    console.debug('Title from the first words', error)
    return fallback
  }
}

/** The provider's fast model when it offers it, or the brain as it is. @param {BrainConfig} brain */
async function simplest(brain) {
  const model = /** @type {Record<string, string[]>} */ (app.policy.tiers ?? TIERS)[brain.provider]?.[0]
  if (!model || model === brain.model) return brain
  await loadModels(brain)
  return (app.models.value[brain.id] ?? []).some((info) => info.id === model) ? { ...brain, model } : brain
}

/** A reply's first line, without Markdown, quotes or a final full stop. @param {string} reply */
const tidy = (reply) => firstWords(reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim().split('\n')[0]
  .replace(/^[#*_>\s]+|[*_\s]+$/g, '').replace(/^["'“”‘’«»「『]+|["'“”‘’«»」』.。]+$/g, '').trim(), 10)
