// Progressive discovery (docs/product.md): what Jean can do, and how each capability shows
// up. Triggers are events that carry no language (a long paste, a spreadsheet shared, a
// few conversations, plenty of them, the same kind of request a third time, or on three different days,
// links opened from answers, and for what brains rarely offer, D286: something said again, a task on three
// days, an email, an invitation or a picture shared, a big request, a backup restored),
// reflexes, and the brain's own offer tool, never keywords (D6). Also find_tools, so tools
// that arrive mid-conversation can be reached (D47).
import { effect, signal } from '@preact/signals-core'
import { register, unlock, isDenied, loaded, contributions } from './caps.js'
import { app, effective, answerOffer, notify, send, updateSettings, conversationOf, CITED } from './state.js'
import { findTools, reach } from '../core/deferred.js'
import { REFLEXES, CAPABILITIES, OFFERED, FOLLOW_UPS, YES, likeliest, exchange } from '../caps/reflexes/questions.js'
import { words, alike, restated } from '../core/search.js'
import { foldTurns, openingOf, noteRecord, routineOf, isPicture } from '../core/events.js'
import { t, firstWords } from '../core/i18n.js'
import { host } from './host.js'

/** @typedef {import('./auto.js').Signals} Signals */

const folders = 'showDirectoryPicker' in globalThis || !!(await host) // where Sync opens a folder: in the page, or through the desktop app's host (D169)
/** What Jean can do, in the order the house lights up (the collection page). */
export const CATALOGUE = ['files', 'made', 'computer', 'reflexes', 'memory', 'find', 'projects', 'folders', 'skills', 'routines', 'flows', 'search', 'browser', 'pictures', 'machine', 'connections', 'helpers', 'check', 'since', 'names', 'live', 'backup', ...(folders ? ['sync'] : []), 'brain-local']

/** What the brain may offer, described for it in English, in a few words: it goes with every request. */
const OFFERS = /** @type {Record<string, string>} */ ({
  files: 'reading files the user shares (PDF, Word, Excel, CSV…)',
  computer: 'a computer in a sandbox, for exact numbers, data work and commands',
  memory: 'remembering lasting facts and preferences from one conversation to the next',
  projects: 'a project of its own, with its notes and files, for something the user keeps coming back to',
  folders: 'working on the files of a folder of their computer, where they are',
  skills: 'saving how a task the user repeats is done',
  routines: 'doing a task on a schedule, once later like a reminder, or each time a file comes',
  flows: 'the steps of a task the user repeats, drawn and run again',
  search: 'searching the web for current or specific facts',
  browser: 'showing a web page beside the conversation',
  pictures: 'making or changing pictures and short films',
  machine: "running commands on the user's own computer, such as a site's dev server",
  connections: 'connecting a service the user uses (email, documents, calendar…)',
  helpers: 'helpers doing the independent parts of a large task at the same time',
  ...(folders && { sync: 'keeping their work the same on their other computers' }),
})
/** What policy leaves to offer: it is set before this module loads (ui/app.js). */
const offerable = Object.keys(OFFERS).filter((id) => !isDenied(id))

/** The tools a capability brings, by name. @param {string} id */
const toolsOf = (id) => (loaded.value.get(id)?.tools ?? []).filter((tool) => !tool.hidden).map((tool) => tool.spec.name)

/** @type {import('../core/loop.js').Tool} */
const offerTool = {
  spec: {
    name: 'offer',
    description: `Suggest turning on something the user hasn't discovered yet, and wait for their answer. ${offerable.map((id) => `${id}: ${OFFERS[id]}.`).join(' ')}`,
    parameters: { type: 'object', properties: { capability: { type: 'string', enum: offerable } }, required: ['capability'] },
  },
  kind: 'think',
  title: (args) => `Offer ${args?.capability ?? ''}`,
  run: async (args, ctx) => {
    const id = String(args?.capability ?? '')
    if (!Object.hasOwn(OFFERS, id) || isDenied(id)) return `"${id}" can't be offered.`
    if (id === 'search' && !loaded.value.has(id) && everywhere.value < SEARCHABLE) return `"${id}" can't be offered yet.`
    if (!loaded.value.has(id)) {
      // A no is for good, here as above the box: the brain hears it again, and the user sees nothing (D219).
      if (effective.value.settings.offers[id]) return 'The user said no to it before. Go on without it.'
      // One offer waits at a time, in the conversation that made it (D147).
      if (app.offering.peek()) return 'Another offer is waiting for the user. Go on without it.'
      const yes = await new Promise((resolve) => { app.offering.value = { id, conversation: conversationOf(ctx.signal)?.path, resolve } })
      app.offering.value = null
      if (!yes) {
        // Only the user's own no is for good: an answer stopped, or left for another project, said nothing (D219).
        if (!ctx.signal?.aborted) await answerOffer(id)
        return 'The user said no. Go on without it.'
      }
      // Turned on meanwhile above the box or from its trophy, it has begun there.
      if (!loaded.value.has(id)) {
        if (!(await unlock(id))) return 'It could not be turned on.'
        // A project to name, or a service to connect: the answer waits for the user.
        await begin(id)
      }
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

/**
 * Offers a capability above the box, once, one at a time (D72): an offer about what the user is
 * doing now takes the place of the one shown, unless a download is under way; one merely due
 * (a count reached) waits until nothing is shown.
 * @param {string} id @param {boolean} [now]
 */
export function offerOnce(id, now = false) {
  const { settings } = effective.value
  // Peeked: an effect that offers must not run again because the offer it showed went away.
  const shown = app.offer.peek()
  // Turned on before, it is still loading after first paint, so not loaded yet: never offered.
  if ((shown && (shown.progress !== undefined || !now || shown.id === id)) || isDenied(id) || loaded.value.has(id) || settings.unlocked.includes(id) || settings.offers[id] || (id === 'backup' && app.ephemeral.value)) return
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
  // Offered after the same kind of request a third time: make this one the first skill, or the
  // first routine when it came on three different days.
  if (id === 'skills' || id === 'routines') follow(id === 'skills' ? 'skill' : 'routine')
  // Offered after a task of several steps: those steps become the first flow.
  else if (id === 'flows' && stepped(app.current.peek()?.records ?? [])) follow('flow')
  else begin(id)
}

/** What a capability leads to as soon as it is on: a project or an assistant to name, a service to connect, a conversation to have. @param {string} id */
export async function begin(id) {
  if (id === 'projects') (await import('../caps/projects/projects.js')).editProject()
  if (id === 'names' && !app.project.value.data.default) (await import('../caps/projects/projects.js')).editProject(app.project.value)
  if (id === 'connections') await (await import('../caps/connections/connections.js')).connect()
  if (id === 'live') await (await import('../caps/live/live.js')).toggle()
  if (id === 'find') app.dialog.value = 'find'
  if (id === 'browser') (await import('../caps/browser/browser.js')).show()
  if (id === 'flows') (await import('../caps/flows/flows.js')).here()
  if (id === 'machine') (await import('../caps/machine/machine.js')).show()
  if (id === 'pictures' && !(await (await import('../caps/pictures/pictures.js')).ready())) (await import('./dialogs.js')).openSettings('brains')
  // A folder to choose, which the browser lets a page ask for just after a click: if that has gone by, a button asks.
  if (id === 'folders' || id === 'sync') {
    const { choose } = await (id === 'sync' ? import('../caps/sync/sync.js') : import('../caps/folders/folders.js'))
    if (navigator.userActivation?.isActive === false) notify(t(`cap.${id}.offer`), { label: t(`cap.${id}.yes`), run: () => choose() })
    else await choose()
  }
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

// An offer goes once what it offers is on, or turned down, however that happened: above the box,
// or in an answer, which then goes on.
effect(() => {
  const shown = app.offer.value
  if (shown && shown.progress === undefined && loaded.value.has(shown.id) && shown.id !== 'reflexes') app.offer.value = null
  const offering = app.offering.value
  if (offering && (loaded.value.has(offering.id) || effective.value.settings.offers[offering.id])) offering.resolve(loaded.value.has(offering.id))
})

/** Conversations in every project: what search, backup and Intuition are offered for is all of them. */
export const everywhere = signal(0)
let counting = 0
effect(() => {
  const here = app.conversations.value.length
  const others = app.projects.value.filter((project) => project.dir !== app.projectDir)
  const round = ++counting
  Promise.all(others.map((project) => app.fs.list(`${project.dir}/conversations`))).then((lists) => {
    if (round === counting) everywhere.value = here + lists.flat().filter((entry) => entry.kind === 'file' && entry.name.endsWith('.jsonl')).length
  })
})

// Events that carry no language. Offers due at once wait their turn, in this order.
effect(() => {
  const count = everywhere.value
  if (count >= 3) offerOnce('backup')
  if (count >= 2 && effective.value.settings.brains.length) offerOnce('reflexes')
})
/** Conversations before search is offered: plenty to look back on, what was asked, answered and shared (D133). */
export const FINDABLE = 10
/** Conversations before the brain may offer web search, so the first ones show what Jean does on its own (D145). */
export const SEARCHABLE = 5
effect(() => {
  if (everywhere.value >= FINDABLE) offerOnce('find')
})
effect(() => {
  // Someone who dictates often may rather talk.
  if ((effective.value.settings.dictated ?? 0) >= 3) offerOnce('live')
})
effect(() => {
  // Back after time away, with services connected: what's new there?
  if (app.back.value && ((effective.value.settings.connections ?? []).length || (app.policy.connections ?? []).length)) offerOnce('since', true)
})
effect(() => {
  // Some use inside a project: its assistant could have a name.
  const { data } = app.project.value
  if (!data.default && data.name && !data.assistantName && app.conversations.value.length >= 3) offerOnce('names')
})
/** Links opened from answers before the browser is offered: pages could open beside the conversation (D140). */
export const BROWSED = 3
document.addEventListener('click', (event) => {
  if (loaded.value.has('browser') || !(event.target instanceof Element) || !event.target.closest('app-conversation a[href^="http"]')) return
  updateSettings({ browsed: (app.settings.value.browsed ?? 0) + 1 })
})
effect(() => {
  if ((effective.value.settings.browsed ?? 0) >= BROWSED) offerOnce('browser')
})
// A server the sandbox refused could run on the user's own computer (D198).
document.addEventListener('app-server-refused', () => offerOnce('machine', true))
// A web page made or changed in the conversation's folder could show there too (D156).
document.addEventListener('app-folder-changed', (event) => { if (/\.html?$/i.test(/** @type {CustomEvent} */ (event).detail.path)) offerOnce('browser', true) })
effect(() => {
  // Citations in regular use: each answer could be checked against them.
  if ((effective.value.settings.cited ?? 0) >= CITED) offerOnce('check')
})
effect(() => {
  const shared = app.attachments.value.filter((item) => item.status === 'ready')
  // Rows of data: exact numbers are a script away.
  if (shared.some((item) => /\.(csv|tsv|xlsx?)$/i.test(item.name))) offerOnce('computer', true)
  // An email, an invitation or a contact card, read or not: the service it came from could be connected (D286).
  if (app.attachments.value.some((item) => /\.(eml|ics|vcf)$/i.test(item.name))) offerOnce('connections', true)
  // A picture: it could be changed (D286).
  if (shared.some((item) => item.link && isPicture(item.link))) offerOnce('pictures', true)
})
effect(() => {
  // A backup restored here, most likely from another computer: Sync keeps the two the same (D286).
  if (folders && effective.value.settings.restored) offerOnce('sync', true)
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
  const candidates = Object.fromEntries(Object.entries(CAPABILITIES).filter(([choice]) => open(OFFERED[choice])))
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
  if (capability?.type === 'choice' && capability.choice !== 'none' && capability.probabilities[capability.choice] >= YES) offerOnce(OFFERED[capability.choice], true)
  // A lasting fact, preference or correction: memory could keep it.
  if (lasting?.type === 'noul' && lasting.noul >= YES) offerOnce('memory', true)
  return {
    ...(demand?.type === 'score' && { demand: likeliest(demand.probabilities) }),
    ...(personal?.type === 'noul' && { personal: personal.noul >= YES }),
    ...(after?.unhappy?.type === 'noul' && { unhappy: after.unhappy.noul >= YES }),
  }
}

// Past this many words, "Shorter" is offered: a length, so it works in every language.
const LONG_ANSWER = 220

// Requests whose first words are at least this alike are the same kind (core/search.js); so are
// a request and a skill's description (D121).
export const SAME_KIND = 0.5

/**
 * Whether the request that opened this conversation is the third of its kind: two earlier
 * conversations in this project began alike. The user's own requests compared word by word,
 * so it works in every language, with no keyword (D6). Returns its first words and when each
 * request of the kind was made, oldest first.
 * @param {import('../core/types.js').Envelope[]} records @param {string | undefined} id its own, left out of the count
 * @returns {{ opening: string, times: Date[] } | null}
 */
function sameKind(records, id) {
  // Not the titles: a brain writes those, and this one may still be on its way. Not a routine's
  // runs either: their request is the routine's, sent by Jean (D122).
  const opening = firstWords(openingOf(records))
  if (!opening || foldTurns(records).length !== 1 || routineOf(records)) return null
  const others = app.conversations.value.filter((item) => item.id !== id && item.opening && !item.routine)
  const scores = alike(opening, others.map((item) => firstWords(item.opening)))
  const kind = others.filter((_, i) => scores[i] >= SAME_KIND)
  if (kind.length < 2) return null
  const times = [...kind.map((item) => new Date(item.createdAt)), new Date(records[0]?.at ?? Date.now())]
  return { opening, times: times.sort((a, b) => a.getTime() - b.getTime()) }
}

/** Whether something the user keeps already covers a request: one of these texts is of its kind. @param {string} opening @param {string[]} texts */
const covered = (opening, texts) => alike(opening, texts).some((score) => score >= SAME_KIND)

/** Tasks of several steps before Flows is offered, and the calls that make one (D218). */
export const STEPPED = 2
const STEPS = 4
/** Whether the last request took several calls: steps a flow could keep. @param {import('../core/types.js').Envelope[]} records */
const stepped = (records) => (foldTurns(records).at(-1)?.steps ?? []).flatMap((step) => step.tools).filter((tool) => tool.name && !tool._meta?.parent).length >= STEPS

/** Requests made on three different days look like a habit a routine could keep (D122). @param {Date[]} times */
const habitual = (times) => new Set(times.map((time) => time.toDateString())).size >= 3

/**
 * Whether the request that opened this conversation says again something the user said in an
 * earlier one, other than a request of the same kind (D286): memory could keep it.
 * @param {import('../core/types.js').Envelope[]} records @param {string | undefined} id its own, left out
 */
function said(records, id) {
  const opening = openingOf(records)
  if (!opening || loaded.value.has('memory') || foldTurns(records).length !== 1 || routineOf(records)) return false
  return restated(opening, app.conversations.value.filter((item) => item.id !== id && item.opening && !item.routine).map((item) => item.opening), SAME_KIND)
}

/** Files made in one request before Helpers is offered (D286). */
const MADE = 3
/** Whether the last request was a big one: it made three files or more, or an answer of it stopped at its length limit. @param {import('../core/types.js').Envelope[]} records */
function large(records) {
  const tools = (foldTurns(records).at(-1)?.steps ?? []).flatMap((step) => step.tools).filter((tool) => !tool._meta?.parent)
  return new Set(tools.flatMap((tool) => (tool.name === 'write' && tool.status === 'completed' ? [tool.rawInput?.name] : []))).size >= MADE
    || tools.some((tool) => tool.rawOutput?.stopReason === 'max_tokens')
}

/**
 * Follow-ups from the translated catalogue that fit an answer: "Shorter" for a long one; for
 * the third request of a kind, a ready-made skill from elsewhere when one fits, otherwise "Save
 * this as a skill" (offered above the box until skills are on), and "Make this a routine" when
 * the requests came on three different days; a skill the brain suggested; and, when the
 * reflexes are on, "As a table" and "Draft an email" when they fit.
 * @param {string} answer @param {import('../core/types.js').Envelope[]} records the conversation
 * @param {{ id: string, path: string }} conversation the one answered, which may no longer be on screen
 * @returns {Promise<string[]>}
 */
export async function followUps(answer, records, { id, path }) {
  const ids = words(answer).length > LONG_ANSWER ? ['shorter'] : []
  const kind = sameKind(records, id)
  const skills = loaded.value.has('skills') ? await import('../caps/skills/skills.js') : null
  if (kind && !isDenied('skills') && !covered(kind.opening, (await skills?.skills() ?? []).map((skill) => `${skill.name.replace(/-/g, ' ')} ${skill.title} ${skill.description}`))) {
    const found = skills && path ? await skills.lookFor(kind.opening).catch(() => null) : null
    if (found && path) skills?.suggested.set(path, found)
    else if (skills) ids.push('skill')
    else offerOnce('skills', true)
  }
  if (kind && habitual(kind.times) && !isDenied('routines')) {
    const routines = loaded.value.has('routines') ? await import('../caps/routines/routines.js') : null
    if (!routines) offerOnce('routines', true)
    else if (!covered(kind.opening, (await routines.routines()).map((routine) => `${routine.title} ${routine.request}`))) ids.push('routine')
  }
  if (path && skills?.suggested.has(path)) ids.push('ready')
  // A task of several steps could be a flow, to see and run again (D218); twice, and Flows is offered.
  if (stepped(records) && !isDenied('flows')) {
    if (loaded.value.has('flows')) ids.push('flow')
    else {
      const count = (effective.value.settings.stepped ?? 0) + 1
      await updateSettings({ stepped: count })
      if (count >= STEPPED) offerOnce('flows', true)
    }
  }
  // What brains rarely offer themselves (D286): the same task on three different days could be a project
  // (a routine's runs are one task), something said again could be kept, and a big request shared out.
  if (!routineOf(records) && habitual(foldTurns(records).flatMap((turn) => (turn.user ? [new Date(turn.user.at)] : [])))) offerOnce('projects', true)
  if (said(records, id)) offerOnce('memory', true)
  if (large(records)) offerOnce('helpers', true)
  const decide = loaded.value.get('reflexes')?.decide
  const result = decide ? await quickly(decide(clip(answer), FOLLOW_UPS), 4000) : null
  for (const [id, answer] of Object.entries(result ?? {})) if (answer.type === 'noul' && answer.noul >= YES) ids.push(id)
  return ids
}

/**
 * A follow-up from the catalogue, taken: its request is sent; a ready-made skill opens to be read.
 * "Make this a routine" tells the brain when requests of the kind were made, so the routine fits
 * the habit (D122).
 * @param {string} id
 */
export async function follow(id) {
  const path = app.current.peek()?.path
  if (id === 'ready') {
    const found = path && loaded.value.has('skills') ? (await import('../caps/skills/skills.js')).suggested.get(path) : null
    if (found) (await import('../caps/skills/ready.js')).preview(found)
    return
  }
  const times = id === 'routine' ? sameKind(app.current.peek()?.records ?? [], app.current.peek()?.id)?.times : null
  const stamps = (times ?? []).map((time) => time.toString().slice(0, 21))
  const notes = stamps.length ? [noteRecord(`Requests like this one were made on ${stamps.join(', ')} (local time).`, { kind: 'habit', at: (times ?? []).map((time) => time.toISOString()) })] : []
  send(t(`suggest.${id}.prompt`), { notes })
}
