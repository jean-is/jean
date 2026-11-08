// People (D727): the people this profile met, to send tasks and what Jean made to, and get their answers back. Meeting is a state machine
// the page (./page.js) drives: on the inviting side `inviting`, with each invitation kept on its device until it ends and its mailboxes read
// while Jean is in sight; on the invited side `accepting`, which the link's arrival (#/meet/…) opens and the person's Accept starts. Once met,
// every device of the person reads its person mailbox for what comes. The steps are pure in ./flow.js, on pairing's exchange.
import { html, nothing } from 'lit-html'
import { signal, computed, effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, pairs, refreshConversations, openConversation, conversationOf } from '../../ui/state.js'
import { act } from '../../ui/acts.js'
import { appendRecords } from '../../core/conversations.js'
import { callsIn, filesMade, metaRecord } from '../../core/events.js'
import { mine } from '../../ui/opfs.js'
import { host } from '../../ui/host.js'
import { lazyPage } from '../../ui/lazy-page.js'
import { icons } from '../../ui/menu-icons.js'
import { t, tParts, useStrings, locale } from '../../core/i18n.js'
import { getSecret, setSecrets, secretsWhere } from '../../ui/secrets.js'
import { VAULT } from '../../ui/seal.js'
import { listen, reader } from '../../ui/relay.js'
import { serviceURL } from '../../core/settings.js'
import { parseLink, pairingBox } from '../devices/pair.js'
import { base64url, bytesOf, random } from '../share/seal.js'
import { personOf, peopleOf, invite as invited, heardHello, heardReveal, confirmed, ended, accept as accepted, heardNonce, heardMet, dropped, received, forget, tidy, nameId, arrivalsOf, sendTo, ARRIVALS } from './flow.js'

/** @typedef {import('./flow.js').Invite} Invite */
/** @typedef {import('./flow.js').Accept} Accept */
/** Why a meeting stopped. @typedef {'link' | 'used' | 'gone' | 'self' | 'known' | 'tries' | 'relay' | 'child' | 'broken'} Reason */
/**
 * Inviting, on Ana's device: who it is for being asked, the link to show or send, the digits to type and the tries left, done; or why it
 * stopped. @typedef {{ step: 'idle' | 'name' } | { step: 'waiting', id: string, name: string, link: string, way: 'side' | 'link' } | { step: 'code', id: string, name: string, left: number }
 *   | { step: 'done', name: string } | { step: 'failed', reason: Reason }} Inviting
 */
/**
 * Accepting, on Bob's: a link that came, Accept asked for with who sent it; waiting for Ana; the digits to show and the name she gives
 * herself; done; or why it stopped. @typedef {{ step: 'idle' | 'waiting' } | { step: 'ask', link: string } | { step: 'code', code: string, theirs: string }
 *   | { step: 'done', name: string } | { step: 'failed', reason: Reason }} Accepting
 */

export const [inviting, accepting] = [signal(/** @type {Inviting} */ ({ step: 'idle' })), signal(/** @type {Accepting} */ ({ step: 'idle' }))]
/** The people met, and the invitations this device sent that wait. */
export const [people, invitations] = [signal(/** @type {Awaited<ReturnType<typeof peopleOf>>} */ ([])), signal(/** @type {Invite[]} */ ([]))]
/** What came from the people met and waits, and what was put off here till Jean opens again. */
export const [arrivals, later] = [signal(/** @type {Awaited<ReturnType<typeof arrivalsOf>>} */ ([])), signal(/** @type {Set<string>} */ (new Set()))]

await useStrings('people')
/** Whether this is a child's profile, which meets no one. */
const child = Boolean(JSON.parse(await app.fs.read(VAULT) ?? 'null')?.parent)
/** Whether this Jean meets people: it pairs devices, and policy lets it share. */
export const offered = () => pairs() && !child && app.policy.rules?.share !== 'never'
const relayOf = () => String(serviceURL('relay', app.settings.peek(), app.policy) ?? '').replace(/^(.+?)\/?$/, '$1/')
/** Whether an answer is being written: nothing is read from the relay meanwhile but what the person asks for (caps/receipt). */
const answering = computed(() => app.running.value.length > 0)
/** @template T @param {string} name @param {() => Promise<T>} run @returns {Promise<T>} */
const locked = (name, run) => navigator.locks?.request(mine(name), run) ?? run()
/** @param {unknown} error */
const warn = (error) => console.warn('People', error)

/** What ./flow.js meets with, for this profile. @returns {Promise<import('./flow.js').Context>} */
const contextOf = async () => ({
  get: (id) => getSecret(app.fs, id), set: (values) => setSecrets(app.fs, values), all: () => secretsWhere(app.fs, (id) => /^(people:|invite:|accept:)/.test(id)),
  fs: app.fs, base: relayOf(), address: (await host) ? '' : location.origin + location.pathname, now: () => Date.now(),
  said: async () => String(JSON.parse(await app.fs.read(VAULT) ?? '{}').name ?? '') || app.settings.peek().name || '' })
/** This profile as a person, made one tab at a time where it has none. */
const me = async () => locked('app-person', async () => personOf(await contextOf()))
/** The people met, the invitations waiting and what came, read again. */
const refresh = async () => {
  const ctx = await contextOf()
  ;[people.value, invitations.value] = [await peopleOf(ctx), Object.entries(await ctx.all()).flatMap(([id, value]) => (id.startsWith('invite:') ? [JSON.parse(value)] : []))]
  if (offered()) arrivals.value = await arrivalsOf(ctx)
}
/** Why a step was refused, as the page says it. @param {any} error @returns {Reason} */
const reasonOf = (error) => error?.reason ?? (error?.status === 409 ? 'used' : error?.status === 404 ? 'gone' : error?.status || error instanceof TypeError ? 'relay' : 'broken')

// ─── Reading ─────────────────────────────────────────────────────────────────

let reading = new AbortController()
/**
 * Reads what this device waits for, while Jean is in sight: each invitation's two mailboxes, the acceptance's reply mailbox, and the person
 * mailbox, every device of the person reading it. Started again whenever one begins or ends.
 */
async function watch() {
  reading.abort()
  const [ctx, controller, base] = [await contextOf(), (reading = new AbortController()), relayOf()]
  if (!base) return
  await tidy(ctx).catch(warn)
  const person = await me()
  const stop = listen({ base, token: person.token, lock: mine('app-people'), quiet: answering, onMessages: async (messages) => {
    for (const { bytes } of messages) if ((await received(ctx, bytes).catch(() => null))?.kind) await refresh()
  } })
  controller.signal.addEventListener('abort', stop)
  for (const [id, value] of Object.entries(await ctx.all())) {
    if (id.startsWith('invite:')) follow(ctx, JSON.parse(value), controller.signal)
    if (id.startsWith('accept:')) answer(ctx, JSON.parse(value), controller.signal)
  }
  await refresh()
}

/** An invitation's mailboxes read: Bob's hello, then his reveal, then the digits to type, which the page asks for. @param {import('./flow.js').Context} ctx @param {Invite} one @param {AbortSignal} signal */
async function follow(ctx, one, signal) {
  const [meet, back] = await Promise.all([pairingBox(bytesOf(one.s), 'meet'), pairingBox(bytesOf(one.s), 'meet-back')])
  try {
    if (!one.hello) one = await heardHello(ctx, one, await reader(ctx.base, meet.token, signal)())
    if (!one.code) one = await heardReveal(ctx, one, await reader(ctx.base, back.token, signal)())
    // The digits asked for on the screen that showed its link, or on the page at rest; another invitation's screen is left as it is.
    const now = inviting.peek()
    if (now.step === 'idle' || (now.step === 'waiting' && now.id === one.id)) inviting.value = { step: 'code', id: one.id, name: one.name, left: one.tries }
    await refresh()
  } catch (error) {
    if (signal.aborted) return
    warn(error)
    await ended(ctx, one)
    if ('id' in inviting.peek() && /** @type {{ id: string }} */ (inviting.peek()).id === one.id) inviting.value = { step: 'failed', reason: reasonOf(error) }
    await refresh()
  }
}

/** The acceptance's reply mailbox read: Ana's nonce, then her answer. @param {import('./flow.js').Context} ctx @param {Accept} one @param {AbortSignal} signal */
async function answer(ctx, one, signal) {
  const next = reader(ctx.base, one.token, signal)
  try {
    if (!one.code) one = await heardNonce(ctx, one, await next())
    accepting.value = { step: 'code', code: String(one.code), theirs: String(one.theirs ?? '') }
    await heardMet(ctx, one, await next())
    accepting.value = { step: 'done', name: one.name }
    await refresh()
  } catch (error) {
    if (signal.aborted) return
    warn(error)
    await dropped(ctx, one)
    accepting.value = { step: 'failed', reason: reasonOf(error) }
  }
}

// ─── What the page does ──────────────────────────────────────────────────────

/** Invites someone, as this person names them, by a code to show beside them or a link to send. @param {string} name @param {'side' | 'link'} way */
export async function invite(name, way) {
  try {
    const { invite: one, link } = await invited(await contextOf(), { name, way })
    inviting.value = { step: 'waiting', id: one.id, name, link, way }
    await watch()
  } catch (error) { warn(error); inviting.value = { step: 'failed', reason: reasonOf(error) } }
}

/** The digits typed for an invitation; whether they were right. @param {string} id @param {string} typed */
export async function confirm(id, typed) {
  const ctx = await contextOf(), kept = await getSecret(app.fs, `invite:${id}`)
  if (!kept) return false
  const done = await confirmed(ctx, JSON.parse(kept), typed).catch((error) => { warn(error); inviting.value = { step: 'failed', reason: reasonOf(error) }; return null })
  const step = inviting.peek()
  if (done === 'wrong' && step.step === 'code') inviting.value = { ...step, left: step.left - 1 }
  else if (done) inviting.value = done === 'met' ? { step: 'done', name: JSON.parse(kept).name } : { step: 'failed', reason: 'tries' }
  await watch()
  return done === 'met'
}

/** An invitation stopped here, its mailboxes removed; or the screen of one left. @param {string} [id] */
export async function stopInvite(id) {
  const kept = id && await getSecret(app.fs, `invite:${id}`)
  if (kept) { await ended(await contextOf(), JSON.parse(kept)); await watch() }
  inviting.value = { step: 'idle' }
}

/** Bob accepts the link that came, naming who sent it. @param {string} link @param {string} name */
export async function accept(link, name) {
  accepting.value = { step: 'waiting' }
  try { await accepted(await contextOf(), { link, name }); await watch() } catch (error) { warn(error); accepting.value = { step: 'failed', reason: reasonOf(error) } }
}

/** The acceptance stopped here, its reply mailbox removed. */
export async function stopAccept() {
  const ctx = await contextOf()
  for (const [id, value] of Object.entries(await ctx.all())) if (id.startsWith('accept:')) await dropped(ctx, JSON.parse(value))
  accepting.value = { step: 'idle' }
  await watch()
}

/** What this person calls someone met, changed. @param {string} fp @param {string} name */
export const rename = async (fp, name) => { await setSecrets(app.fs, { [nameId(fp)]: name.trim().slice(0, 80) }); await refresh() }
/** Someone forgotten, on every device of the person, and told so. @param {string} fp */
export const remove = async (fp) => { await forget(await contextOf(), fp); await refresh() }

/** The link that came (`#/meet/…`, the router's), asked about on People's page, refused there where this Jean meets no one. */
export function fromAddress() {
  const link = location.href
  history.replaceState(null, '', `${location.pathname}#/settings/people`)
  accepting.value = !offered() ? { step: 'failed', reason: child ? 'child' : 'relay' } : parseLink(link, 'meet') ? { step: 'ask', link } : { step: 'failed', reason: 'link' }
}

// ─── Sending and what comes ──────────────────────────────────────────────────

/** Once no answer is being written, so that an answer's record holds only what it reached (caps/receipt). */
const quiet = () => new Promise((done) => { const stop = effect(() => { if (!answering.value) { done(undefined); queueMicrotask(() => stop()) } }) })
/** Whether someone met has answered, to be sent to. */
const reachable = () => people.value.some((one) => !one.waiting)

/**
 * Sends a task, or one thing it made, to someone met, with what Jean read for a task when the person says so and a few words of theirs; the
 * task keeps that it went, which an answer back follows (D727). During an answer only for send_to, whose answer then counts it. Its size.
 * @param {string} fp @param {import('../share/value.js').What} what @param {{ reading?: boolean, words?: string }} [options] @param {boolean} [during]
 */
export async function sendIt(fp, what, { reading = false, words = '' } = {}, during = false) {
  if (!during) await quiet()
  const { valueOf } = await import('../share/value.js')
  const value = await valueOf(app.fs, what, { reading, lang: locale.peek(), aFile: t('people.aFile') })
  const thread = { task: what.path.slice(-32, -6), id: base64url(random(16)) }
  const size = await sendTo(await contextOf(), fp, { title: what.title, words: words.trim().slice(0, 280), value, thread })
  await appendRecords(app.fs, what.path, [metaRecord(app.deviceId, { sent: { to: fp, thread } })])
  act('people.send', { task: what.path, kind: what.item ? 'item' : 'task', size })
  return size
}

/** Send to…, its dialog opened on what goes (./send.js). @param {import('../share/value.js').What} what */
export const openSend = (what) => import('./send.js').then((send) => send.open(what))

/** What came opened: a task of the person's in the project on screen, after a note that it is someone else's (../share/value.js), and gone from what waits. @param {Awaited<ReturnType<typeof arrivalsOf>>[number]} one */
export async function openArrival(one) {
  const { takeIn } = await import('../share/value.js')
  const { path } = await takeIn(app.fs, one.value, { projectDir: app.projectDir, by: app.deviceId, aFile: t('people.aFile'), words: one.words,
    from: { from: one.from, person: one.from, id: one.id, ...(one.thread && { thread: one.thread }) } })
  await app.fs.remove(`${ARRIVALS}/${one.id}.json`)
  await Promise.all([refreshConversations(), refresh()])
  await openConversation(path)
}

/** The card of what came, above the conversation on each of the person's devices: who sent what, their words, Open and Not now. @param {Awaited<ReturnType<typeof arrivalsOf>>[number]} one */
const card = (one) => html`<aside class="offer people-card" role="note"><p>${tParts('people.came', { name: html`<bdi>${one.name}</bdi>`, title: html`<bdi>${one.title || t('conversation.untitled')}</bdi>` })}</p>
  ${one.words ? html`<p dir="auto">${one.words}</p>` : nothing}<div class="row"><button class="button primary" @click=${() => openArrival(one).catch(warn)}>${t('people.open')}</button>
  <button class="button subtle" @click=${() => { later.value = new Set([...later.peek(), one.id]) }}>${t('people.notNow')}</button></div></aside>`

/** send_to: this task, or one file it made, to one of the person's people by the name they gave them; asked first, as any `other` call is. @type {import('../../core/loop.js').Tool} */
const sendTool = {
  spec: { name: 'send_to', description: "Send this task, or one file it made, to one of the user's people, named as the user names them, with a few words of the user's if they gave some. The user is asked first.",
    parameters: { type: 'object', properties: { person: { type: 'string' }, file: { type: 'string', description: 'the name of a file the task made, to send it alone' }, words: { type: 'string' } }, required: ['person'] } },
  kind: 'other',
  title: (args) => (args?.file ? `Send ${args.file} to ${args?.person ?? ''}` : `Send this task to ${args?.person ?? ''}`),
  run: async (args, ctx) => {
    const [asked, met] = [String(args?.person ?? '').trim().toLowerCase(), people.peek().filter((one) => !one.waiting)]
    const exact = met.filter((one) => one.name.toLowerCase() === asked), found = exact.length ? exact : met.filter((one) => asked && one.name.toLowerCase().includes(asked))
    if (found.length !== 1) throw new Error(`${found.length ? 'More than one' : 'No one'} of the user's people is named so. They are: ${met.map((one) => one.name).join(', ') || 'none yet'}.`)
    const task = conversationOf(ctx.signal)
    if (!task) throw new Error('There is no task to send.')
    const file = args?.file ? filesMade(callsIn(task.records)).findLast((one) => one.name === args.file) : null
    if (args?.file && !file) throw new Error(`This task made no file named ${args.file}.`)
    const title = app.conversations.peek().find((one) => one.path === task.path)?.title ?? ''
    await sendIt(found[0].fp, { path: task.path, title, ...(file && { item: { text: '', files: [file] } }) }, { words: String(args?.words ?? '') }, true)
    return `Sent to ${found[0].name}. They have a week to open it.`
  },
}

register({ id: 'people', tools: [sendTool], lines: [{ name: 'send_to', line: "send this task, or a file it made, to one of the user's people; it asks first" }], slots: {
  // Its own section of Settings, settings/people (./page.js), which ⌘K finds by Add a person too.
  settings: { id: 'people', at: 135, label: 'cap.people.name', icon: icons.people, also: () => t('people.add'), draw: lazyPage(() => import('./page.js')) },
  // What came, above the conversation, each until it is opened here or on another device, or put off.
  above: { at: 2, draw: () => arrivals.value.filter((one) => !later.value.has(one.id)).map(card) },
  // In a task's ⋮ menu, and beside Share under a page, a chart, a deck or a picture made: Send to…, once someone met has answered.
  task: { at: 3, draw: (/** @type {{ path: string, title: string }} */ item, /** @type {(icon: unknown, label: string, act: () => unknown) => unknown} */ action) =>
    (reachable() ? action(icons.people, t('people.sendTo'), () => openSend({ path: item.path, title: item.title })) : []) },
  drawn: { at: 2, draw: (/** @type {import('../share/value.js').Item} */ item, /** @type {((icon: unknown, label: string, act: () => unknown) => unknown) | undefined} */ action) => {
    const path = app.current.value?.path
    if (!path || !reachable()) return nothing
    const act = () => openSend({ path, title: app.conversations.value.find((one) => one.path === path)?.title ?? '', item })
    return action ? action(icons.people, t('people.sendTo'), act) : html`<button class="icon-button subtle" aria-label=${t('people.sendTo')} @click=${act}>${icons.people}</button>`
  } },
  dialog: { at: 2, draw: () => html`<app-people-send></app-people-send>` },
  // The room's line over what someone sent names them as the person does (ui/chat.js).
  came: { at: 1, draw: () => nothing, name: (/** @type {string} */ fp) => people.value.find((one) => one.fp === fp)?.name ?? '' },
} })
// The secrets, where the people met follow the person's devices, and what came, which the store brings from them, changed in any tab or by another device.
app.fs.watch?.((path) => { if (path === '.secrets/keys.json' || path.startsWith(`${ARRIVALS}/`)) refresh().catch(warn) }, { all: true })
if (offered()) watch().catch(warn)
else refresh().catch(warn)
