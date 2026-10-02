// Progressive discovery (docs/product.md): what Jean can do, and how each capability shows
// up. Triggers are events that carry no language (a long paste, a spreadsheet shared, a
// few conversations, the same kind of request a third time), reflexes, and the brain's own
// offer tool, never keywords (D6). Also find_tools, so tools that arrive mid-conversation
// can be reached (D47).
import { effect } from '@preact/signals-core'
import { register, unlock, isDenied, loaded, contributions } from './caps.js'
import { app, effective, answerOffer, notify, send } from './state.js'
import { findTools, reach } from '../core/deferred.js'
import { REFLEXES, CAPABILITIES, FOLLOW_UPS, YES, likeliest, exchange } from '../caps/reflexes/questions.js'
import { words, alike } from '../core/search.js'
import { foldTurns, titleOf } from '../core/events.js'
import { t } from '../core/i18n.js'

/** @typedef {import('./auto.js').Signals} Signals */

/** What Jean can do, in the order the house lights up (the collection page). */
export const CATALOGUE = ['files', 'made', 'compute', 'reflexes', 'memory', 'projects', 'routines', 'python', 'backup', 'brain-local']

/** What the brain may offer, described for it in English. */
const OFFERS = /** @type {Record<string, string>} */ ({
  files: 'reading files the user shares: PDF, Word, Excel, PowerPoint, CSV, text',
  compute: 'exact calculations and data analysis, by running code',
  memory: 'remembering lasting facts and preferences the user states, from one conversation to the next',
  projects: 'a separate project for something the user keeps coming back to, with its own notes and files',
  routines: 'saving how a task the user repeats is done, to do it the same way every time',
  python: 'Python for data work beyond simple maths (a one-time download of about 14 MB)',
})

/** The tools a capability brings, by name. @param {string} id */
const toolsOf = (id) => (loaded.value.get(id)?.tools ?? []).filter((tool) => !tool.hidden).map((tool) => tool.spec.name)

/** @type {import('../core/loop.js').Tool} */
const offerTool = {
  spec: {
    name: 'offer',
    description: `Suggest turning on something the user hasn't discovered yet, and wait for their answer. ${Object.entries(OFFERS).map(([id, about]) => `${id}: ${about}.`).join(' ')}`,
    parameters: { type: 'object', properties: { capability: { type: 'string', enum: Object.keys(OFFERS) } }, required: ['capability'] },
  },
  kind: 'think',
  title: (args) => `Offer ${args?.capability ?? ''}`,
  run: async (args, ctx) => {
    const id = String(args?.capability ?? '')
    if (!Object.hasOwn(OFFERS, id) || isDenied(id)) return `"${id}" can't be offered.`
    if (!loaded.value.has(id)) {
      const yes = await new Promise((resolve) => { app.offering.value = { id, resolve } })
      app.offering.value = null
      if (!yes) {
        await answerOffer(id)
        return 'The user said not now. Do not offer it again in this conversation.'
      }
      if (!(await unlock(id))) return 'It could not be turned on.'
      if (id === 'projects') begin(id)
    }
    const names = toolsOf(id).filter((name) => !ctx.declared.includes(name))
    return names.length ? `It is on. New tools: ${names.join(', ')}. ${reach(names, ctx)}` : 'It is on.'
  },
}

register({
  id: 'discovery',
  tools: [findTools({ tools: () => contributions().tools }), offerTool],
  lines: [
    { name: 'find_tools', line: "find tools that aren't listed here, and how to call them" },
    { name: 'offer', line: 'suggest turning on something the user has not discovered yet' },
  ],
  rules: ['Offer at most one new thing per reply, and only when it clearly helps.'],
})

// ─── Offers above the box ────────────────────────────────────────────────────

// Offers about nothing in particular give way to one about what the user is doing now.
const AMBIENT = new Set(['backup', 'reflexes'])

/** Offers a capability above the box, once, unless something more relevant is on offer. @param {string} id */
export function offerOnce(id) {
  const { settings } = effective.value
  const shown = app.offer.value
  if ((shown && (shown.progress !== undefined || !AMBIENT.has(shown.id) || AMBIENT.has(id))) || isDenied(id) || loaded.value.has(id) || settings.offers[id] || (id === 'backup' && app.ephemeral.value)) return
  app.offer.value = { id }
}

/** @param {string} id */
export async function accept(id) {
  if (id === 'backup') {
    app.offer.value = null
    return (await import('./dialogs.js')).backup()
  }
  if (!(await unlock(id))) return (app.offer.value = null)
  await answerOffer(id)
  if (id === 'reflexes') return downloadReflexes()
  app.offer.value = null
  notify(t('offer.on', { name: t(`cap.${id}.name`) }))
  // Offered after the same kind of request a third time: make this one the first routine.
  if (id === 'routines') send(t('suggest.routine.prompt'))
  else begin(id)
}

/** What a capability leads to as soon as it is on: a project to name. @param {string} id */
export async function begin(id) {
  if (id === 'projects') (await import('../caps/projects/projects.js')).newProject()
}

/** @param {string} id */
export async function decline(id) {
  app.offer.value = null
  await answerOffer(id)
}

/** Kev's download, with its progress shown where it was accepted. */
export async function downloadReflexes() {
  const module = await import('../caps/reflexes/reflexes.js')
  app.offer.value = { id: 'reflexes', progress: 0 }
  const stop = effect(() => {
    const state = module.download.value
    if (state.state === 'downloading') app.offer.value = { id: 'reflexes', progress: state.loaded / state.total }
  })
  try {
    await module.prepare()
    notify(t('offer.on', { name: t('cap.reflexes.name') }))
  } catch (error) {
    console.warn('Reflexes', error)
    notify(t('cap.reflexes.failed'))
  } finally {
    stop()
    app.offer.value = null
  }
}

/** Turns on everything that needs no download ("unlock everything", in settings). */
export async function unlockAll() {
  await Promise.all(CATALOGUE.map(unlock))
  notify(t('collection.allOn'))
}

// An offer above the box goes once what it offers is on, however that happened.
effect(() => {
  const shown = app.offer.value
  if (shown && shown.progress === undefined && loaded.value.has(shown.id) && shown.id !== 'reflexes') app.offer.value = null
})

// Events that carry no language.
effect(() => {
  const count = app.conversations.value.length
  if (count >= 3) offerOnce('backup')
  else if (count >= 2 && effective.value.settings.brains.length) offerOnce('reflexes')
})
effect(() => {
  // Rows of data: exact numbers are a script away.
  if (app.attachments.value.some((item) => item.status === 'ready' && /\.(csv|tsv|xlsx?)$/i.test(item.name))) offerOnce('compute')
})

// ─── Reflexes ────────────────────────────────────────────────────────────────

const clip = (/** @type {string} */ text) => (text.length > 1500 ? `${text.slice(0, 1200)}\n…\n${text.slice(-300)}` : text)

/** @template T @param {Promise<T>} promise @returns {Promise<T | null>} */
const quickly = (promise, ms = 2500) => Promise.race([promise.catch(() => null), new Promise((resolve) => setTimeout(() => resolve(null), ms))])

/**
 * What the reflexes make of a message, when they're on: how demanding it is, whether it is
 * personal, whether the previous answer missed, and which capability would help, which is
 * then offered. Never slows a message down for long.
 * @param {string} text @param {string} [previous] the answer before it
 * @returns {Promise<Signals>}
 */
export async function sense(text, previous) {
  const decide = loaded.value.get('reflexes')?.decide
  if (!decide || !text) return {}
  const { offers } = effective.value.settings
  const open = (/** @type {string} */ id) => !loaded.value.has(id) && !isDenied(id) && !offers[id]
  const candidates = Object.fromEntries(Object.entries(CAPABILITIES).filter(([id]) => open(id)))
  const [about, after] = await Promise.all([
    quickly(decide(clip(text), {
      demand: REFLEXES.demand,
      personal: REFLEXES.personal,
      ...(Object.keys(candidates).length && { capability: REFLEXES.capability(candidates) }),
      ...(open('memory') && { lasting: REFLEXES.lasting }),
    })),
    previous ? quickly(decide(exchange(clip(previous), clip(text)), { unhappy: REFLEXES.unhappy })) : null,
  ])
  const { demand, personal, capability, lasting } = about ?? {}
  if (capability?.type === 'choice' && capability.choice !== 'none' && capability.probabilities[capability.choice] >= YES) offerOnce(capability.choice)
  // A lasting fact, preference or correction: memory could keep it.
  if (lasting?.type === 'noul' && lasting.noul >= YES) offerOnce('memory')
  return {
    ...(demand?.type === 'score' && { demand: likeliest(demand.probabilities) }),
    ...(personal?.type === 'noul' && { personal: personal.noul >= YES }),
    ...(after?.unhappy?.type === 'noul' && { unhappy: after.unhappy.noul >= YES }),
  }
}

// Past this many words, "Shorter" is offered: a length, so it works in every language.
const LONG_ANSWER = 220

// Requests whose first words are at least this alike are the same kind (core/search.js).
const SAME_KIND = 0.5

/**
 * Whether the request that opened this conversation is the third of its kind: two earlier
 * conversations in this project began alike, and no routine covers it yet. The user's own
 * requests compared word by word, so it works in every language, with no keyword (D6).
 * @param {import('../core/types.js').Envelope[]} records
 */
async function repeated(records) {
  const title = titleOf(records)
  if (!title || foldTurns(records).length !== 1) return false
  const others = app.conversations.value.filter((item) => item.id !== app.current.value?.id && item.title).map((item) => item.title)
  if (alike(title, others).filter((score) => score >= SAME_KIND).length < 2) return false
  const known = loaded.value.has('routines') ? await (await import('../caps/routines/routines.js')).routines() : []
  return alike(title, known.map((skill) => `${skill.name.replace(/-/g, ' ')} ${skill.title} ${skill.description}`)).every((score) => score < SAME_KIND)
}

/**
 * Follow-ups from the translated catalogue that fit an answer: "Shorter" for a long one;
 * "Make this a routine" for the third request of a kind (offered above the box until routines
 * are on); and, when the reflexes are on, "As a table" and "Draft an email" when they fit.
 * @param {string} answer @param {import('../core/types.js').Envelope[]} records the conversation
 * @returns {Promise<string[]>}
 */
export async function followUps(answer, records) {
  const ids = words(answer).length > LONG_ANSWER ? ['shorter'] : []
  if (!isDenied('routines') && await repeated(records)) {
    if (loaded.value.has('routines')) ids.push('routine')
    else offerOnce('routines')
  }
  const decide = loaded.value.get('reflexes')?.decide
  const result = decide ? await quickly(decide(clip(answer), FOLLOW_UPS), 4000) : null
  for (const [id, answer] of Object.entries(result ?? {})) if (answer.type === 'noul' && answer.noul >= YES) ids.push(id)
  return ids
}
