// Your devices (D45, D700): a person's devices paired, each with keys of its own in each profile and a mailbox on the relay (ui/relay.js).
// Adding one is a state machine the screens (./page.js) drive through `adding`, joining one through `joining`, which asks the person
// before it starts and again before the profile that came opens; once paired, each device listens on its mailbox for the devices the
// profile knows, settings and keys that follow the person, a task handed over, or its own removal. The steps are pure in ./pair.js, what
// crosses in ./bundle.js, and what a device keeps and does with what comes in ./flow.js.
import { html } from 'lit-html'
import { signal, effect, computed } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, changeSettings, rememberUnlocked, refreshConversations, refreshProjects, brainLabel, notify } from '../../ui/state.js'
import { PLACE, here, mine } from '../../ui/opfs.js'
import { host } from '../../ui/host.js'
import { handheld } from '../../ui/model.js'
import { lazyPage } from '../../ui/lazy-page.js'
import { icons } from '../../ui/menu-icons.js'
import { t, useStrings, useLocale } from '../../core/i18n.js'
import { switchTo, initialOf, whoOf } from '../../ui/curtain.js'
import { getSecret, setSecret } from '../../ui/secrets.js'
import { VAULT, boxPair, fingerprintOf, close, deviceKey } from '../../ui/seal.js'
import { mailbox, open, send, read, remove, listen, reader } from '../../ui/relay.js'
import { DEFAULT_SETTINGS, loadSettings, serviceURL } from '../../core/settings.js'
import { ulid } from '../../core/ulid.js'
import { BRAND } from '../../brand.js'
import { random } from '../share/seal.js'
import { linkOf, parseLink, pairingBox, sealHello, openHello, sealNonce, openNonce, sealReveal, openReveal, codeOf, sameCode, envelope, openEnvelope } from './pair.js'
import { SECRET, LIMIT, ULID, PROFILE, deviceName, recordOf, recordFor, recordsOf, listOf, sameKey, writeRecord, writeOwn, inPlace, tell, look, mark, share, unreached, known, quiet, bundleOf, adopt, refill, untouched, broughtFrom, taskOf, receive, removal, back, firstOf, alone } from './flow.js'

/** @typedef {import('./flow.js').Identity} Identity */
/** @typedef {import('./flow.js').Device} Device */
/** @typedef {import('./flow.js').Context} Context */
/** Why a pairing failed. @typedef {'link' | 'used' | 'gone' | 'key' | 'child' | 'relay' | 'storage' | 'exists' | 'tries' | 'broken'} Reason */
/**
 * Adding a device, on the one that has the Jean: the link to show, with Jean's web address (none in the desktop app: the link is then only
 * pasted), B's name, the lock to ask first where the profile has one (caps/lock/lock.js's ways(passed)), the code and the tries left, sending,
 * done; or why it failed. @typedef {{ step: 'idle' } | { step: 'waiting', link: string, address: string } | { step: 'lock' | 'sending' | 'done', name: string }
 *   | { step: 'code', name: string, left: number } | { step: 'failed', reason: Reason }} Adding
 */
/**
 * Joining, on the new device: a link that came, what it does said and Join asked for; first, in an iPhone's Safari, adding Jean to the
 * Home Screen, whose Jean keeps files of its own, the link kept to paste there; waiting for A, the code to show, the profile that came
 * and the device it came from, to open or not, the profile being made, then made; or why it failed.
 * @typedef {{ step: 'idle' | 'waiting' | 'adopting' | 'done' } | { step: 'ask' | 'home', link: string } | { step: 'code', code: string } | { step: 'trust', profile: string, device: string }
 *   | { step: 'failed', reason: Reason }} Joining
 */
/**
 * The pairing under way, on either side: what ends its reads, the mailboxes it opened, removed as it ends; on A what the code needs and
 * the reader of B's answers; on B the person's Join on what came, and how A hears that it was left unopened.
 * @typedef {{ controller: AbortController, boxes: string[], me?: Identity, hello?: { key: JsonWebKey, mailbox: string, name: string }, code?: string,
 *   answers?: import('../../ui/relay.js').Reader, agree?: () => void, leave?: () => Promise<unknown> }} Flow
 */

export const adding = signal(/** @type {Adding} */ ({ step: 'idle' }))
export const joining = signal(/** @type {Joining} */ ({ step: 'idle' }))
/** The devices this profile knows, this one among them, and this one's id, '' until it has one. */
export const devices = signal(/** @type {Device[]} */ ([]))
export const own = signal('')

await useStrings('devices')
/** Whether this is a child's profile, which never pairs: their parent's slot needs the parent's vault key, another on each device. */
const child = Boolean(JSON.parse(await app.fs.read(VAULT) ?? 'null')?.parent)
/** The relay's address, ending in /, or '' where none is named. */
const relayOf = () => String(serviceURL('relay', app.settings.peek(), app.policy) ?? '').replace(/^(.+?)\/?$/, '$1/')
/** Whether this Jean pairs devices: a relay named, not a child's profile, and no organisation's sign-in, for now. */
export const offered = () => Boolean(relayOf()) && !child && !app.policy.signIn
/** How far the relay's clock is from this device's, as its last read said, kept for a Jean opened offline, its clock off as it may be. */
let offset = (() => { try { return Number(localStorage.getItem('app.relay-offset')) || 0 } catch { return 0 } })()
/** @param {number} at the relay's clock */
const clocked = (at) => { offset = at - Date.now(); try { localStorage.setItem('app.relay-offset', String(offset)) } catch {} }
const now = () => Date.now() + offset
/** @template T @param {string} name @param {() => Promise<T>} run @returns {Promise<T>} */
const locked = (name, run) => navigator.locks?.request(mine(name), run) ?? run()
/** Whether the profile opens with a lock, which adding a device asks for first. */
const lockedHere = async () => ((kept) => Boolean(kept) && !kept.slots?.some((/** @type {{ kind: string }} */ slot) => slot.kind === 'device'))(JSON.parse(await app.fs.read(VAULT) ?? 'null'))

/** This device's name, as its browser tells it, or the desktop app its system. */
const nameHere = async (told = /** @type {any} */ (navigator).userAgentData) => deviceName({ userAgent: navigator.userAgent, platform: told?.platform, brands: told?.brands, touch: navigator.maxTouchPoints, os: (await host)?.os, app: BRAND.name })
/** Whether an answer is being written: nothing goes to the relay meanwhile but what the person asks for, so its record holds what it reached (caps/receipt). */
const answering = computed(() => app.running.value.length > 0)

/** What went wrong, said in the console, as nothing waits on it. @param {unknown} error */
const warn = (error) => console.warn('Devices', error)
/** The devices this one has, none where it was removed and kept Jean on its own, which keeps them only to be added again in place. */
const refresh = () => (async () => {
  own.value = (await identity(false))?.id ?? ''
  devices.value = own.value ? await recordsOf(app.fs) : []
})().catch(warn)

/**
 * This device's identity in this profile: made the first time it is needed, one tab at a time, with its record, its mailbox opened on the
 * relay, and then listened on; null when there is none and it isn't to be made. @param {boolean} [make]
 * @returns {Promise<Identity | null>}
 */
export async function identity(make = true) {
  const kept = await getSecret(app.fs, SECRET)
  if (kept || !make) return kept ? JSON.parse(kept) : null
  const me = await locked('app-device', async () => {
    const again = await getSecret(app.fs, SECRET)
    if (again) return /** @type {Identity} */ (JSON.parse(again))
    const box = await mailbox()
    await open(relayOf(), box.token)
    const made = { id: ulid(), ...await boxPair(), token: box.token, mailbox: box.id }
    await setSecret(app.fs, SECRET, JSON.stringify(made))
    await writeOwn(app.fs, recordFor(made, await nameHere(), now()), locked)
    rememberUnlocked('devices')
    return made
  })
  refresh()
  listening().catch(warn)
  return me
}

/** What ./flow.js handles with, for this device: a language that came from another is the one Jean speaks here too. @param {Identity} me @returns {Promise<Context>} */
const contextOf = async (me) => ({ fs: app.fs, me, now, catalogue: (await import('../../ui/discovery.js')).CATALOGUE, lock: locked, policy: app.policy,
  settings: () => loadSettings(app.fs), change: async (patch) => { await changeSettings(patch); if (typeof patch.locale === 'string') await useLocale(patch.locale) },
  send: async (to, value) => send(relayOf(), to.mailbox, await envelope(me, to.key, value)) })

// ─── Listening ───────────────────────────────────────────────────────────────

let [stop, listenings] = [() => {}, 0]
/** Listens on this device's mailbox, once it has one and a relay is named, the tab in sight reading (ui/relay.js); after a quiet week, asks the others for their settings, and sends what never went. */
async function listening() {
  stop()
  const turn = ++listenings
  const [me, base] = [await identity(false), relayOf()]
  if (!me || !base) return
  await open(base, me.token).catch(() => {})
  await read(base, me.token).then(({ now: at }) => clocked(at), () => {})
  const ctx = await contextOf(me)
  if (turn !== listenings) return
  // Its identity gone or another now, as this device's removal was acted on in another tab, its mailbox is never opened again.
  stop = listen({ base, token: me.token, lock: mine('app-devices'), onMessages: (messages) => heard(ctx, messages), clock: clocked, quiet: answering,
    lost: async (...box) => ((await identity(false))?.id === me.id ? open(...box) : stop()) })
  // Paired, or once was: a device removed here may still be owed its removal.
  if ((await listOf(app.fs)).length < 2) return
  if (await quiet(ctx)) await tell(ctx, { kind: 'ask' })
  // What changed here and never went, the tab closed too soon, or that a device didn't take.
  if ((await look(ctx)).pending || await unreached(app.fs)) later(ctx)
}

/**
 * Each message opened with the keys of the devices this profile knows, anything else dropped, then done; one from a device removed here,
 * which may be back with its mailbox gone, owes it its removal again (back()). This device's removal is acted on once all that came is
 * read, each removal's list taken (firstOf()); by a tab whose identity went or is another now, nothing is. @param {Context} ctx @param {import('../../ui/relay.js').Message[]} messages
 */
async function heard(ctx, messages) {
  if ((await identity(false))?.id !== ctx.me.id) return stop()
  const removals = /** @type {{ erase: boolean, by: string }[]} */ ([])
  for (const { bytes, at } of messages) {
    const known = await listOf(app.fs)
    const opened = await openEnvelope(ctx.me, known.map((one) => one.key), bytes).catch(() => null)
    const from = opened && known.find((one) => one.id !== ctx.me.id && one.key.x === opened.from.x && one.key.y === opened.from.y)
    if (from?.removedAt && await back(ctx, from, opened?.value)) later(ctx)
    if (!opened || !from || from.removedAt) continue
    const done = await receive(ctx, from, opened.value, at).catch((error) => { warn(error); return null })
    // A device the last share didn't reach writes: what waits goes to it now.
    if (await unreached(app.fs, from.id)) later(ctx)
    if (done && 'removed' in done) removals.push({ ...done.removed, by: from.id })
    if (done && 'arrived' in done) {
      const { path, title } = done.arrived
      await Promise.all([refreshProjects(), refreshConversations()])
      notify(t('devices.from', { device: from.name, title: title || t('conversation.untitled') }), { label: t('devices.openTask'), run: () => openTask(path) })
    }
  }
  if (removals.length) return removed(await firstOf(app.fs, removals), ctx.me.id)
  await again(ctx)
  refresh()
}

/**
 * This device removed by another of the person's: with `erase`, Jean erased here as removing the profile would (D412), the person having
 * confirmed there, then another profile or a fresh start; otherwise, or when that is refused, its identity forgotten and the devices kept
 * only as removed but the one that removed it, which may add it again in place; only as the identity it was sent to.
 * @param {{ erase: boolean, by: string }} removal by the device's id @param {string} as
 */
async function removed({ erase, by }, as) {
  stop()
  cancel()
  // Acted on already, in another tab, or meant for an identity this profile no longer has.
  const me = await identity(false)
  if (me?.id !== as) return refresh()
  // Its mailbox goes once it acted, so that a tab closed between leaves the others telling it again, never its identity untold.
  const gone = () => remove(relayOf(), me.token).catch(() => {})
  if (erase && await (await import('../profiles/made.js')).erase(here())) {
    await gone()
    const next = (await app.whole?.list('profiles') ?? []).map(({ name }) => `profiles/${name}`).find((dir) => dir !== here())
    return switchTo(next ?? '', next ? whoOf(JSON.parse(await app.whole?.read(`${next}/${VAULT}`) ?? 'null')) : { name: '', initial: '' })
  }
  await alone(app.fs, by, now(), me.id, locked)
  await gone()
  notify(t('devices.forgotten', { name: BRAND.name }))
  refresh()
}

/** A task handed over, opened in its project, as its address would. @param {string} path */
const openTask = async (path) => { location.hash = (await import('../../ui/router.js')).hashFor(app.projects.value.find((one) => path.startsWith(`${one.dir}/`)) ?? app.project.value, path.slice(-32, -6)) }

let [timer, retrying, wait] = [/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined), /** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined), 60_000]
/** What waits sent to the others a moment after the last change, which leaves time for the next. @param {Context} ctx */
const later = (ctx) => { clearTimeout(timer); timer = setTimeout(() => sent(ctx, false), 2000) }
/** What waits sent, then what a device didn't take sent again on its own (again()); removals owed only by that timer, at most hourly. @param {Context} ctx @param {boolean} [notices] */
async function sent(ctx, notices = true) {
  if (answering.peek()) return later(ctx)
  clearTimeout(retrying)
  retrying = undefined
  await share(ctx, false, notices).catch(warn)
  await again(ctx)
}
/** While a device didn't take what went, it goes again a minute later, then twice as long each time up to an hour, unless already due. @param {Context} ctx */
async function again(ctx) {
  if (!(await unreached(app.fs))) wait = 60_000
  else if (!retrying) [retrying, wait] = [setTimeout(() => sent(ctx), wait), Math.min(wait * 2, 3_600_000)]
}
/**
 * Settings or keys changed, here or in another tab: what follows the person is stamped at once, when it changed, and sent a moment later
 * by the tab that stamped it; `waiting`, as the device comes back online, what still waits goes too. @param {boolean} [waiting]
 */
async function noticed(waiting = false) {
  const me = await identity(false)
  if (!me || !relayOf() || (await listOf(app.fs)).length < 2) return
  const ctx = await contextOf(me)
  const { changed, pending } = await look(ctx)
  if (changed || (waiting && (pending || await unreached(app.fs)))) later(ctx)
}

// ─── Pairing ─────────────────────────────────────────────────────────────────

let flow = /** @type {Flow | null} */ (null)
/** A new pairing, the last one ended. @returns {Flow} */
const begin = () => { cancel(); return (flow = { controller: new AbortController(), boxes: [] }) }
/** A pairing ended: its reads stopped, its mailboxes removed. @param {Flow} one */
async function end(one) {
  one.controller.abort()
  if (flow === one) flow = null
  await Promise.all(one.boxes.splice(0).map((token) => remove(relayOf(), token).catch(() => {})))
}

/** The new device told the adding stopped here, rather than left showing its digits for a profile that won't come: three wrong tries, or Cancel. @param {Flow} one @param {'tries' | 'gone'} reason */
const refuse = ({ me, hello }, reason) => { if (me && hello) envelope(me, hello.key, { kind: 'refused', reason }).then((bytes) => send(relayOf(), hello.mailbox, bytes)).catch(() => {}) }

/** Stops the pairing under way, on either side, and removes what it opened; the other device hears of it. */
export function cancel() {
  if (flow) { refuse(flow, 'gone'); flow.leave?.().catch(() => {}); end(flow) }
  adding.value = { step: 'idle' }
  joining.value = { step: 'idle' }
}

/** Why a pairing failed, from what refused it. @param {any} error @returns {Reason} */
const reasonOf = (error) => error?.reason ?? (error?.status === 409 ? 'used' : error?.status === 404 ? 'gone' : error?.status || error instanceof TypeError ? 'relay' : /another key/.test(error?.message) ? 'key' : 'broken')
/** A pairing ended by what went wrong, said on its side, unless it was stopped. @param {Flow} one @param {typeof adding | typeof joining} side @param {unknown} error */
function failed(one, side, error) {
  if (one.controller.signal.aborted) return
  warn(error)
  one.leave?.().catch(() => {})
  end(one)
  side.value = { step: 'failed', reason: reasonOf(error) }
}

/**
 * Adds a device, on A: the pairing mailbox opened once and one for B's answers, the link shown, then B's hello, A's nonce, B's reveal, and
 * the lock asked for where the profile has one, then the code B shows, typed here (confirm()).
 */
export async function start() {
  if (!offered() || !app.whole) {
    cancel()
    adding.value = { step: 'failed', reason: child ? 'child' : app.whole ? 'relay' : 'storage' }
    return
  }
  const one = begin()
  try {
    const [base, me] = [relayOf(), /** @type {Identity} */ (await identity())]
    const [s, answers] = [random(32), await mailbox()]
    const pairing = await pairingBox(s)
    one.boxes.push(pairing.token, answers.token)
    await Promise.all([open(base, pairing.token, { once: true }), open(base, answers.token)])
    // The desktop app's 127.0.0.1 is no address another device reaches, and its web copy's isn't known: the link is pasted there.
    const address = (await host) ? '' : location.origin + location.pathname
    const fpA = await fingerprintOf(me.public)
    adding.value = { step: 'waiting', link: linkOf(address, s, fpA), address }
    const hello = await openHello(s, await reader(base, pairing.token, one.controller.signal, clocked)())
    const nonce = await sealNonce(s, { key: me.public, mailbox: answers.id })
    await send(base, hello.mailbox, nonce.bytes)
    one.answers = reader(base, answers.token, one.controller.signal, clocked)
    const nB = await openReveal(s, hello.commit, await one.answers())
    Object.assign(one, { me, hello, code: await codeOf({ s, fpA, keyB: hello.key, mailboxB: hello.mailbox, nA: nonce.nA, nB }) })
    s.fill(0)
    adding.value = await lockedHere() ? { step: 'lock', name: hello.name } : { step: 'code', name: hello.name, left: 3 }
  } catch (error) {
    failed(one, adding, error)
  }
}

/** The lock gave its key (caps/lock/lock.js's ways(passed)): on to the code. @param {Uint8Array} [raw] */
export function passed(raw) {
  raw?.fill(0)
  const step = adding.peek()
  if (step.step === 'lock') adding.value = { step: 'code', name: step.name, left: 3 }
}

/**
 * The code typed on A. Right, the bundle goes to B; once B says it opened it, B's record is kept, the pairing mailboxes go, and the other
 * devices are told; left unopened there, nothing is kept. Wrong, a try fewer, the third ending the pairing. Whether it was right.
 * @param {string} typed
 */
export async function confirm(typed) {
  const [one, step] = [flow, adding.peek()]
  if (!one?.me || !one.hello || !one.code || !one.answers || step.step !== 'code') return false
  if (!sameCode(typed, one.code)) {
    if (step.left > 1) adding.value = { ...step, left: step.left - 1 }
    else {
      refuse(one, 'tries')
      end(one)
      adding.value = { step: 'failed', reason: 'tries' }
    }
    return false
  }
  const { me, hello } = one
  adding.value = { step: 'sending', name: hello.name }
  try {
    const ctx = await contextOf(me)
    const you = recordFor({ id: ulid(), public: hello.key, mailbox: hello.mailbox }, hello.name, now(), me.id)
    const kept = JSON.parse(await app.fs.read(VAULT) ?? '{}')
    const bundle = await bundleOf(ctx, { dir: here(), name: kept.name ?? '', ...(kept.colour && { colour: kept.colour }) }, you)
    await send(relayOf(), hello.mailbox, await envelope(me, hello.key, bundle))
    // B shows what came and asks before it opens it: only then is it one of this profile's devices, which B waits to hear before it
    // makes anything. Then every device has the list, B too, whose mailbox, read in order, holds it before anything a device removed
    // meanwhile may send; one that didn't take it gets it again (share()).
    if (await answerOf(one.answers, me, hello.key) !== 'joined') throw Object.assign(new Error('The other device didn’t open it.'), { reason: 'gone' })
    if ((await identity(false))?.id !== me.id) throw new Error('This device was removed meanwhile.')
    await writeRecord(app.fs, you, locked)
    await mark(ctx)
    await send(relayOf(), hello.mailbox, await envelope(me, hello.key, { kind: 'kept' }))
    await end(one)
    adding.value = { step: 'done', name: hello.name }
    refresh()
    await share(ctx)
  } catch (error) {
    failed(one, adding, error)
  }
  return true
}

/** What B said of the bundle, from B's key alone: opened, or left. @param {import('../../ui/relay.js').Reader} next @param {Identity} me @param {JsonWebKey} key B's */
async function answerOf(next, me, key) {
  for (;;) {
    const kind = (await openEnvelope(me, [key], await next()).catch(() => null))?.value?.kind
    if (kind === 'joined' || kind === 'left') return kind
  }
}

/**
 * Joins the person's other device, on B, from its link, once the person chose Join: this device's keys and mailbox made, the hello sent
 * (a link used already is said so), A's nonce taken only from the link's key, the reveal sent, the code shown, then A's bundle taken only
 * from that key; the profile it names and the device it comes from shown, and only on the person's Join again (trusted()), made here.
 * Its catalogue isn't sent: B leaves out what its own lacks as the bundle and every snapshot arrive.
 * @param {string | { s: Uint8Array, fpA: string } | null} link a link, or what parseLink() gave
 */
export async function join(link) {
  const got = typeof link === 'string' ? parseLink(link) : link
  const base = relayOf()
  const reason = !got ? 'link' : child ? 'child' : !base || app.policy.signIn ? 'relay' : !app.whole ? 'storage' : null
  if (!got || reason) {
    cancel()
    joining.value = { step: 'failed', reason: reason ?? 'link' }
    return
  }
  const one = begin()
  // At once, so that Join pressed twice joins once.
  joining.value = { step: 'waiting' }
  try {
    const box = await mailbox()
    const me = { id: '', ...await boxPair(), token: box.token, mailbox: box.id }
    one.boxes.push(me.token)
    await open(base, me.token)
    const hello = await sealHello(got.s, { key: me.public, mailbox: me.mailbox, name: await nameHere() })
    await send(base, (await pairingBox(got.s)).id, hello.bytes)
    const next = reader(base, me.token, one.controller.signal, clocked)
    const nonce = await openNonce(got.s, got.fpA, await next())
    await send(base, nonce.mailbox, await sealReveal(got.s, hello.nB))
    joining.value = { step: 'code', code: await codeOf({ s: got.s, fpA: got.fpA, keyB: me.public, mailboxB: me.mailbox, nA: nonce.nA, nB: hello.nB }) }
    /** The next message of this kind from A's key alone; A's refusal ends the pairing. @param {string} kind @returns {Promise<any>} */
    const fromA = async (kind) => {
      for (;;) {
        const value = (await openEnvelope(me, [nonce.key], await next()).catch(() => null))?.value
        if (value?.kind === 'refused') throw Object.assign(new Error('The other device stopped adding this one.'), { reason: value.reason === 'gone' ? 'gone' : 'tries' })
        if (value?.kind === kind && (kind !== 'bundle' || ULID.test(value.you))) return value
      }
    }
    const bundle = await fromA('bundle')
    // From here, A hears whether its bundle was opened: left, when the person cancels or it can't be taken.
    one.leave = async () => send(base, nonce.mailbox, await envelope(me, nonce.key, { kind: 'left' }))
    const again = await welcome(bundle, nonce.key)
    await next.done()
    const from = (Array.isArray(bundle.devices) ? bundle.devices : []).map(recordOf).find((/** @type {Device | null} */ record) => record && sameKey(record.key, nonce.key))
    joining.value = { step: 'trust', profile: bundle.profile.name || BRAND.name, device: from?.name ?? '' }
    await new Promise((resolve, reject) => {
      one.agree = () => resolve(undefined)
      one.controller.signal.addEventListener('abort', () => reject(one.controller.signal.reason), { once: true })
    })
    // A told, which keeps B, then says so: only then is anything made here. Gone meanwhile (Cancel there, its tab closed), B goes on
    // waiting, and says so, until the person cancels here.
    joining.value = { step: 'waiting' }
    await send(base, nonce.mailbox, await envelope(me, nonce.key, { kind: 'joined' }))
    await fromA('kept')
    await next.done()
    one.leave = undefined
    joining.value = { step: 'adopting' }
    await adoptHere(bundle, { ...me, id: bundle.you }, one, again)
  } catch (error) {
    failed(one, joining, error)
  }
}

/** The person's Join on the profile that came and the device it came from: it is made here. */
export const trusted = () => flow?.agree?.()

/**
 * Whether a bundle may be taken here, before the person is asked: a profile named as profiles are, not here already, unless it is the
 * one open here, filled again in place, which only a device removed that kept Jean on its own takes (alone(), no identity left), and
 * only from a device it had and never saw removed: a device removed since can't take back the one that removed it. Gives whether it is
 * that one. @param {any} bundle @param {JsonWebKey} key A's
 */
async function welcome(bundle, key) {
  const { dir, name } = bundle.profile ?? {}
  if (!PROFILE.test(dir) || typeof name !== 'string') throw Object.assign(new Error('No profile in the bundle'), { reason: 'broken' })
  const again = dir === here()
  if (again ? !await inPlace(app.fs, key) : await app.whole?.exists(dir)) throw Object.assign(new Error('This profile is here already'), { reason: 'exists' })
  return again
}

/**
 * A's profile made here under its folder's own name, with a vault of its own, filled before it first opens, with what this device keeps
 * of its own from the profile open until now; the profile first run made removed when nothing was ever done in it; then opened. Joined
 * again where a removal kept this Jean (removed(false)), the profile open is that one, filled again in place.
 * @param {any} bundle @param {Identity} me @param {Flow} one @param {boolean} again
 */
async function adoptHere(bundle, me, one, again) {
  const { dir, name, colour } = bundle.profile
  const tint = typeof colour === 'string' && /^oklch\([\d. ]+\)$/.test(colour) ? colour : undefined
  const [{ vaulted, into, erase }, { CATALOGUE: catalogue }] = await Promise.all([import('../profiles/made.js'), import('../../ui/discovery.js')])
  // What this device keeps of its own comes only from the first run's profile, never from one with work, maybe another person's.
  const brought = again ? null : await broughtFrom(app.fs, app.settings.peek())
  // The profile left beside it has a lock: the new one has Lock, and opens on it, since it doesn't have one yet.
  const lock = !again && await lockedHere()
  const mine = { settings: brought ?? DEFAULT_SETTINGS, catalogue, me, now: now(), policy: app.policy, lock }
  if (again) await refill(await contextOf(me), bundle)
  else try {
    const raw = random(32)
    const key = await vaulted(dir, raw, [await close(raw, /** @type {CryptoKey} */ (await deviceKey('make', dir)), { kind: 'device' })], { name, ...(tint && { colour: tint }) })
    raw.fill(0)
    const { worker, fs } = await into(dir, key)
    try { await adopt(fs, bundle, mine) } finally { worker.terminate() }
  } catch (error) {
    await app.whole?.remove(dir)
    await deviceKey('forget', dir)
    throw error
  }
  one.boxes.length = 0
  // Done, said a moment before the switch, which reloads the page.
  joining.value = { step: 'done' }
  await new Promise((resolve) => setTimeout(resolve, 1500))
  // Never a profile another's names as its parent: its family key would go with it, and the child's settings stay locked.
  const parent = (await Promise.all((await app.whole?.list('profiles') ?? []).map(async ({ name }) => JSON.parse(await app.whole?.read(`profiles/${name}/${VAULT}`) ?? 'null')?.parent?.profile))).includes(here())
  if (brought && !parent && await untouched(app.fs)) await erase(here())
  if (lock) sessionStorage.setItem(`${PLACE}:${dir}`, JSON.stringify({ place: '#/settings/data/lock', caret: null }))
  switchTo(dir, { name, initial: initialOf(name), colour: tint })
}

/**
 * The router's arrival at #/pair/…: the link taken from the address, which keeps no trace of it, and Your devices opened there instead,
 * on what joining does, with Join, or first, in an iPhone's Safari, on adding Jean to the Home Screen. Nothing is joined from an address
 * alone: whoever sends the person a link of theirs would otherwise have their Jean open on the person's device.
 */
export function fromAddress() {
  const link = location.href
  history.replaceState(null, '', `${location.pathname}#/settings/data/devices`)
  if (!parseLink(link)) return join(link)
  cancel()
  joining.value = /** @type {any} */ (navigator).standalone === false && handheld() ? { step: 'home', link } : { step: 'ask', link }
}

// ─── Once paired ─────────────────────────────────────────────────────────────

/**
 * Hands a task to another device: its conversation, its project's project.md and the files it names, in one message. 'sent'; 'kept' for a
 * project kept on this device; 'large' past what the relay takes; 'gone' for a device or a task not known here. @param {string} path @param {string} id the device's
 * @returns {Promise<'sent' | 'kept' | 'large' | 'gone'>}
 */
export async function sendTask(path, id) {
  const me = await identity(false)
  const to = (await recordsOf(app.fs)).find((one) => one.id === id && one.id !== me?.id)
  if (!me || !to || !relayOf()) return 'gone'
  const message = await taskOf(app.fs, path)
  if (typeof message === 'string') return message
  const bytes = await envelope(me, to.key, message)
  if (bytes.length > LIMIT) return 'large'
  await send(relayOf(), to.mailbox, bytes)
  await known({ fs: app.fs, lock: locked }, path)
  return 'sent'
}

/**
 * Removes a device from this profile's: the others get the list with it removed, then it is told, and to erase Jean there unless `erase`
 * is false. Gives what may be revoked where it was made, the brains' and services' names, the sites' online, never a key, and the devices that took nothing
 * yet, by name, which it goes again to on its own. @param {string} id @param {{ erase?: boolean }} [options]
 */
export async function removeDevice(id, { erase = true } = {}) {
  const ctx = await identity(false).then((me) => me && contextOf(me))
  try {
    const done = ctx ? await removal(ctx, id, erase) : null
    if (ctx) await again(ctx)
    return { left: done ? [...done.brains.map(brainLabel), ...done.services] : [], sites: done?.sites ?? [], unreached: done?.unreached ?? [] }
  } finally { refresh() }
}

/** A task handed to another device, and how it went, said. @param {string} path @param {Device} to */
const handOver = (path, to) => sendTask(path, to.id).then((said) => notify(t(`devices.task.${said}`, { device: to.name }), said === 'sent' ? undefined : { alert: true }),
  (error) => { warn(error); notify(t('devices.task.failed', { device: to.name }), { alert: true }) })

if (offered()) {
  register({ id: 'devices', slots: {
    // Its row in Your data, among the copies the person keeps, and its page, data/devices (./page.js).
    data: { id: 'devices', at: 2, group: 'copies', icon: icons.devices, label: 'cap.devices.name', text: () => t('devices.count', { count: Math.max(devices.value.length, 1) }),
      line: () => t('devices.line'), draw: lazyPage(() => import('./page.js')) },
    // In a task's ⋮ menu, Send to each other device, unless its project is kept on this one.
    task: { at: 2, draw: (/** @type {{ path: string }} */ item, /** @type {(icon: unknown, label: string, act: () => unknown) => unknown} */ action) =>
      (app.projects.value.find((one) => item.path.startsWith(`${one.dir}/`))?.data.cloud === false ? []
        : devices.value.filter((one) => one.id !== own.value).map((one) => action(icons.devices, t('devices.send', { device: one.name }), () => handOver(item.path, one)))) },
    // In the person's menu, Your devices.
    profile: { at: 2, draw: (/** @type {string} */ menu) => html`<button type="button" popovertarget=${menu} popovertargetaction="hide"
      @click=${() => import('../../ui/dialogs.js').then((dialogs) => dialogs.openSettings('data/devices'))}>${icons.devices}${t('cap.devices.name')}</button>` },
  } })
  // The keys, where this device's identity and the devices it knows are kept too, changed in any tab, this one's as well.
  app.fs.watch?.((path) => { if (path === '.secrets/keys.json') { refresh(); noticed().catch(warn) } }, { all: true })
  // Back online, or in sight again, what waits goes.
  addEventListener('online', () => noticed(true).catch(warn))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && noticed(true).catch(warn))
  effect(() => {
    void app.settings.value
    noticed().catch(warn)
  })
  refresh()
  listening().catch(warn)
}
