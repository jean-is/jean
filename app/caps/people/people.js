// People (D727): the people this profile met, to send tasks and what Jean made to, and get their answers back. Meeting is a state machine
// the page (./page.js) drives: on the inviting side `inviting`, with each invitation kept on its device until it ends and its mailboxes read
// while Jean is in sight; on the invited side `accepting`, which the link's arrival (#/meet/…) opens and the person's Accept starts. Once met,
// every device of the person reads its person mailbox for what comes. The steps are pure in ./flow.js, on pairing's exchange.
import { signal, computed } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, pairs } from '../../ui/state.js'
import { mine } from '../../ui/opfs.js'
import { host } from '../../ui/host.js'
import { lazyPage } from '../../ui/lazy-page.js'
import { icons } from '../../ui/menu-icons.js'
import { t, useStrings } from '../../core/i18n.js'
import { getSecret, setSecrets, secretsWhere } from '../../ui/secrets.js'
import { VAULT } from '../../ui/seal.js'
import { listen, reader } from '../../ui/relay.js'
import { serviceURL } from '../../core/settings.js'
import { parseLink, pairingBox } from '../devices/pair.js'
import { bytesOf } from '../share/seal.js'
import { personOf, peopleOf, invite as invited, heardHello, heardReveal, confirmed, ended, accept as accepted, heardNonce, heardMet, dropped, received, forget, tidy, nameId } from './flow.js'

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
  base: relayOf(), address: (await host) ? '' : location.origin + location.pathname, now: () => Date.now(),
  said: async () => String(JSON.parse(await app.fs.read(VAULT) ?? '{}').name ?? '') || app.settings.peek().name || '' })
/** This profile as a person, made one tab at a time where it has none. */
const me = async () => locked('app-person', async () => personOf(await contextOf()))
/** The people met and the invitations waiting, read again. */
const refresh = async () => {
  const ctx = await contextOf()
  ;[people.value, invitations.value] = [await peopleOf(ctx), Object.entries(await ctx.all()).flatMap(([id, value]) => (id.startsWith('invite:') ? [JSON.parse(value)] : []))]
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

register({ id: 'people', slots: {
  // Its own section of Settings, settings/people (./page.js), which ⌘K finds by Add a person too.
  settings: { id: 'people', at: 135, label: 'cap.people.name', icon: icons.people, also: () => t('people.add'), draw: lazyPage(() => import('./page.js')) },
} })
// The secrets, where the people met follow the person's devices, changed in any tab or by another device.
app.fs.watch?.((path) => { if (path === '.secrets/keys.json') refresh().catch(warn) }, { all: true })
if (offered()) watch().catch(warn)
else refresh().catch(warn)
