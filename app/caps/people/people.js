// People (D727): the people this profile met, to send tasks and what Jean made to, and get their answers back. Meeting is a state machine
// the page (./page.js) drives: on the inviting side `inviting`, with each invitation kept on its device until it ends and its mailboxes read
// while Jean is in sight; on the invited side `accepting`, which the link's arrival (#/meet/…) opens and the person's Accept starts. Once met,
// every device of the person reads its person mailbox for what comes, and what goes to them goes from share's dialog, whose second audience
// this draws. The steps are pure in ./flow.js, on pairing's exchange.
import { html, nothing } from 'lit-html'
import { signal, computed, effect } from '@preact/signals-core'
import { register, unlock } from '../../ui/caps.js'
import { app, pairs, refreshConversations, openConversation, conversationOf, keepRecords } from '../../ui/state.js'
import { act } from '../../ui/acts.js'
import { callsIn, filesMade, metaRecord, requestsOf } from '../../core/events.js'
import { filesIn } from '../../ui/export.js'
import { mine } from '../../ui/opfs.js'
import { host } from '../../ui/host.js'
import { lazyPage } from '../../ui/lazy-page.js'
import { icons } from '../../ui/menu-icons.js'
import { t, tParts, useStrings, locale, intlLocales, formatBytes } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { styleSheet } from '../../ui/sheet.js'
import { getSecret, setSecrets, secretsWhere } from '../../ui/secrets.js'
import { VAULT } from '../../ui/seal.js'
import { listen, reader } from '../../ui/relay.js'
import { serviceURL } from '../../core/settings.js'
import { parseLink, pairingBox } from '../devices/pair.js'
import { base64url, bytesOf, random } from '../share/seal.js'
import { personOf, peopleOf, invite as invited, heardHello, heardReveal, confirmed, ended, accept as accepted, heardNonce, heardMet, dropped, received, forget, tidy, nameId, arrivalsOf, sendTo, ARRIVALS, LIMIT, turn } from './flow.js'
import * as colleague from './colleagues.js'

/** @typedef {import('./flow.js').Invite} Invite */
/** @typedef {import('./flow.js').Met} Met */
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
/** The people met as one each, a colleague's devices together by their account (D731), with whom of each can be sent to and whether one of theirs is held. */
export const groups = computed(() => [...people.value.reduce((all, one) => all.set(one.account ?? one.fp, [...all.get(one.account ?? one.fp) ?? [], one]), /** @type {Map<string, typeof people.value>} */ (new Map())).values()]
  .map((all) => ({ ...all[0], fps: all.map((one) => one.fp), asking: all.some((one) => one.asking), able: all.filter((one) => !one.waiting && !one.again && !one.asking).map((one) => one.fp) })))
/** Colleagues found on the organisation's list: what was asked, who came of it, and whether it went wrong. @type {import('@preact/signals-core').Signal<{ asked: string, found?: import('./colleagues.js').Listed[], wrong?: boolean }>} */
export const finding = signal({ asked: '' })

await Promise.all([useStrings('people'), styleSheet(new URL('people.css', import.meta.url))])
/** Whether this is a child's profile, which meets no one. */
const child = Boolean(JSON.parse(await app.fs.read(VAULT) ?? 'null')?.parent)
const relayOf = () => String(serviceURL('relay', app.settings.peek(), app.policy) ?? '').replace(/^(.+?)\/?$/, '$1/')
/** Whether the organisation's own relay lists the people its sign-in names (D731), where policy signs in: People is there only then. */
export const colleagues = Boolean(app.policy.signIn && relayOf()) && await colleague.lists(relayOf(), String(app.policy.signIn?.issuer))
/** Whether this Jean meets people: it pairs devices, or its organisation's relay lists colleagues; and policy lets it share. */
export const offered = () => (pairs() || colleagues) && !child && app.policy.rules?.share !== 'never'
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
  // A turn of the key a tab left halfway is ended here (./flow.js, turn()).
  if ((await me()).pending) await locked('app-person', async () => turn(ctx)).catch(warn)
  const person = await me()
  if (colleagues) listOn(person).catch(warn)
  const stop = listen({ base, token: person.token, lock: mine('app-people'), quiet: answering, onMessages: async (messages) => {
    for (const { bytes } of messages) {
      // A colleague who writes first is looked up on the list (D731).
      if (colleagues) await colleague.introduced(ctx, person, bytes).catch(warn)
      if ((await received(ctx, bytes).catch(() => null))?.kind) await refresh()
    }
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
    if (!signal.aborted) { warn(error); await dropped(ctx, one); accepting.value = { step: 'failed', reason: reasonOf(error) } }
  }
}

/** Listed among colleagues on the organisation's relay, at most daily and as soon as the person mailbox changed (D731). @param {import('./flow.js').Person} person */
async function listOn(person) {
  const [kept, at] = [mine('app.listed'), Date.now()], last = JSON.parse(localStorage.getItem(kept) ?? 'null')
  const proof = last?.mailbox === person.mailbox && at - last.at < 864e5 ? null : await (await import('../signin/signin.js')).idToken()
  if (proof) await colleague.listed(relayOf(), person, proof).then(() => localStorage.setItem(kept, JSON.stringify({ mailbox: person.mailbox, at })))
}

/** Colleagues found by a few words, three letters at least. @param {string} asked */
export async function findColleagues(asked) {
  finding.value = { asked }
  const found = await colleague.find(relayOf(), await me(), new URLSearchParams({ q: asked }).toString()).catch(() => null)
  if (finding.peek().asked === asked) finding.value = found ? { asked, found } : { asked, wrong: true }
}
/** A colleague found kept, each of their devices pinned. @param {import('./colleagues.js').Listed} one */
export const addColleague = async (one) => { await colleague.keep(await contextOf(), one); await refresh() }
/** A colleague's held devices trusted. @param {string} account */
export const trustColleague = async (account) => { await colleague.trust(await contextOf(), account); await refresh() }

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
  const done = await confirmed(ctx, JSON.parse(kept), typed).catch((error) => { warn(error); inviting.value = { step: 'failed', reason: reasonOf(error) }; return null }), step = inviting.peek()
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

/** What this person calls someone met, changed, each device of a colleague's. @param {string[]} fps @param {string} name */
export const rename = async (fps, name) => { await setSecrets(app.fs, Object.fromEntries(fps.map((fp) => [nameId(fp), name.trim().slice(0, 80)]))); await refresh() }
/** Someone forgotten, on every device of the person, and told so, on each device of a colleague's. @param {string[]} fps */
export const remove = async (fps) => { const ctx = await contextOf(); for (const fp of fps) await forget(ctx, fp); await refresh() }

/** The link that came (`#/meet/…`, the router's), asked about on People's page, refused there where this Jean meets no one. */
export function fromAddress() {
  const link = location.href
  history.replaceState(null, '', `${location.pathname}#/settings/people`)
  accepting.value = !offered() ? { step: 'failed', reason: child ? 'child' : 'relay' } : parseLink(link, 'meet') ? { step: 'ask', link } : { step: 'failed', reason: 'link' }
}

/**
 * The profile's key turned as a device is removed (caps/devices), which knew it: one tab at a time, then read again on the new mailbox. Gives
 * the names of the people met, which the removal lists to be checked. @returns {Promise<string[]>}
 */
export async function turned() {
  await locked('app-person', async () => turn(await contextOf()))
  await watch()
  return people.peek().map((one) => one.name)
}

// ─── Sending and what comes ──────────────────────────────────────────────────

/** Once no answer is being written, so that an answer's record holds only what it reached (caps/receipt). */
const quiet = () => new Promise((done) => { const stop = effect(() => { if (!answering.value) { done(undefined); queueMicrotask(() => stop()) } }) })

/**
 * Sends a task, or one thing it made, to someone met, each device of a colleague's that takes it, with what Jean read for a task when the
 * person says so and a few words of theirs; the task keeps that it went, which an answer back follows (D727). During an answer only for
 * send_to, whose answer then counts it. Its size. An answer back (`back`, the thread a task someone sent opens) holds only what came after
 * it, or after the last answer.
 * @param {string[]} fps @param {import('../share/value.js').What} what @param {{ reading?: boolean, words?: string, back?: { task: string, id: string } }} [options] @param {boolean} [during]
 */
export async function sendIt(fps, what, { reading = false, words = '', back } = {}, during = false) {
  if (!during) await quiet()
  const value = await (await import('../share/value.js')).valueOf(app.fs, what, { reading, lang: locale.peek(), aFile: t('people.aFile'), since: Boolean(back) })
  const [thread, ctx, went] = [back ?? { task: what.path.slice(-32, -6), id: base64url(random(16)) }, await contextOf(), /** @type {string[]} */ ([])]
  let [size, failed] = [0, /** @type {unknown} */ (null)]
  // A device of a colleague's gone is passed over while another takes it.
  for (const fp of fps) await sendTo(ctx, fp, { title: what.title, words: words.trim().slice(0, 280), value, thread }, back ? 'reply' : 'send').then((sent) => { size = sent; went.push(fp) }, (error) => { failed ??= error })
  if (!went.length) throw failed
  await keepRecords(what.path, went.map((fp) => metaRecord(app.deviceId, { sent: { to: fp, thread } })), !during)
  act('people.send', { task: what.path, kind: back ? 'reply' : what.item ? 'item' : 'task', size })
  return size
}

/** @typedef {import('../share/value.js').What} What */
/** What goes, its value as it would, with what Jean read or not, and how sending it stands. @typedef {{ what: What, reading: boolean, value?: import('../share/value.js').Value, busy?: boolean, said?: string, wrong?: string }} Sending */
const sending = signal(/** @type {Sending | null} */ (null))
/** What would go, as it would, with what Jean read or not. @param {What} what @param {boolean} reading */
async function measure(what, reading) {
  sending.value = { what, reading }
  const value = await (await import('../share/value.js')).valueOf(app.fs, what, { reading, lang: locale.peek(), aFile: t('people.aFile'), since: Boolean(threadOf(what)) })
  if (sending.peek()?.what === what && sending.peek()?.reading === reading) sending.value = { what, reading, value }
}
/** The thread the task on screen opens, sent by someone met, whom an answer goes back to on it; none for another task. @param {{ path: string }} what */
const threadOf = (what) => (app.current.peek()?.path === what.path ? app.current.peek()?.records ?? [] : []).flatMap(({ update: u }) => (u?.sessionUpdate === '_system_note'
  && u.data.kind === 'shared' && !u.data.end && u.data.person && u.data.thread ? [{ fp: u.data.person, thread: u.data.thread }] : [])).at(-1)
/** A JSONL's records, those that read. @param {string} file */
const recordsOf = (file) => file.split('\n').flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })

/** Sent to whom was picked, with the words written: said so, or why not. @param {SubmitEvent} event */
async function submit(event) {
  event.preventDefault()
  const [now, form] = [sending.peek(), new FormData(/** @type {HTMLFormElement} */ (event.target))], one = groups.peek().find((person) => person.fp === form.get('to'))
  if (!now || !one || now.busy) return
  sending.value = { ...now, busy: true, wrong: '' }
  try {
    // An answer back goes to the device that sent the task, which alone holds its thread.
    const back = threadOf(now.what), mine = back && one.fps.includes(back.fp)
    await sendIt(mine ? [back.fp] : one.able, now.what, { reading: now.reading, words: String(form.get('words') ?? ''), back: mine ? back.thread : undefined })
    sending.value = { ...now, busy: false, said: t('people.sentTo', { name: one.name }) }
  } catch (/** @type {any} */ error) {
    sending.value = { ...now, busy: false, wrong: t(`people.why.${error?.reason === 'waiting' || error?.reason === 'large' ? error.reason : 'unreached'}`, { name: BRAND.name }) }
  }
}

/** Add a person, from the pane: People's page, asking who it is for. */
const add = () => import('../../ui/dialogs.js').then((dialogs) => { inviting.value = { step: 'name' }; return dialogs.openSettings('people') })

/**
 * Only people chosen, in share's dialog: to whom, those who answered (the others waiting), Add a person; with what Jean read for a whole
 * task, a few words, what goes (its requests and answers, each file and its size) and the total against what the relay carries; they have
 * a week to open it. Measured again whenever the dialog opens on something. @param {What} what
 */
function pane(what) {
  if (sending.peek()?.what !== what) queueMicrotask(() => { if (sending.peek()?.what !== what) measure(what, false) })
  // The person a task came from first, for an answer back; else the first who can be sent to: answered, and not to meet again.
  const now = sending.value?.what === what ? sending.value : null, back = threadOf(what), able = (/** @type {{ able: string[] }} */ one) => one.able.length > 0
  const first = groups.value.find((one) => able(one) && one.fps.includes(back?.fp ?? '')) ?? groups.value.find(able)
  const records = now?.value ? recordsOf(now.value.file) : [], total = now?.value ? JSON.stringify(now.value).length : 0
  const files = filesIn(records).flatMap(({ uri, name }) => ((data) => (data ? [{ name, size: Math.floor((data.length - data.indexOf(',') - 1) * 0.75) }] : []))(now?.value?.files[uri] ?? ''))
  return html`<section>${now?.said ? nothing : html`<form id="people-send" class="stack people-pane" @submit=${submit}>
      <fieldset><legend>${t('people.toWhom')}</legend>${groups.value.map((one) => html`<label class="row" for=${`people-to-${one.fp}`}>
        <input id=${`people-to-${one.fp}`} type="radio" name="to" value=${one.fp} ?disabled=${!able(one)} ?checked=${one === first} required><bdi>${one.name}</bdi>
        ${one.waiting ? html`<small class="muted">${t('people.answer')}</small>` : nothing}</label>`)}
        <button type="button" class="button subtle" @click=${add}>${icons.plus} ${t('people.add')}</button></fieldset>
      ${what.item ? nothing : html`<label class="setting" for="people-read">${t('people.reading', { name: BRAND.name })}<input id="people-read" type="checkbox" class="switch" role="switch"
        .checked=${now?.reading ?? false} @change=${(/** @type {Event} */ e) => measure(what, /** @type {HTMLInputElement} */ (e.target).checked)}></label>`}
      <label for="people-words">${t('people.words')}</label><textarea id="people-words" name="words" rows="2" maxlength="280" dir="auto"></textarea>
      <p class="hint">${!now?.value ? t('people.measuring') : html`${what.item ? nothing : html`${t('people.asked', { count: requestsOf(records).length })} · `}${t('people.size', { size: formatBytes(total), limit: formatBytes(LIMIT) })}`}</p>
      ${files.length ? html`<ul class="people-files">${files.map((file) => html`<li><bdi>${file.name}</bdi> · ${formatBytes(file.size)}</li>`)}</ul>` : nothing}
      <p class="hint">${t('people.opens')}</p></form>`}
    <p role="status">${now?.said ?? ''}</p><p class="people-wrong" role="alert">${now?.wrong ?? ''}</p></section>
    <footer class="dialog-foot">${now?.said ? html`<button class="button primary" @click=${() => { app.dialog.value = null }}>${t('people.ok')}</button>`
      : html`<button class="button primary" form="people-send" ?disabled=${!now?.value || now.busy || total > LIMIT || !first}>${icons.people} ${t('people.go')}</button>`}</footer>`
}

/** Whom a task went to, as the person calls them, for the Share at its top: its `sent` records'. @param {unknown[]} records */
const went = (records) => {
  const names = [...new Set(records.flatMap((record) => /** @type {any} */ (record).meta?.sent?.to ?? []).flatMap((fp) => people.value.find((one) => one.fp === fp)?.name ?? []))]
  return names.length ? t('people.sentTo', { name: new Intl.ListFormat(intlLocales()).format(names) }) : ''
}

/** What came opened: a task of the person's in the project on screen, after a note that it is someone else's (../share/value.js), and gone from what waits. @param {Awaited<ReturnType<typeof arrivalsOf>>[number]} one */
export async function openArrival(one) {
  const { takeIn, takeInto } = await import('../share/value.js'), into = one.kind === 'reply' ? await answered(one) : ''
  const options = { by: app.deviceId, aFile: t('people.aFile'), words: one.words, from: { from: one.from, person: one.from, id: one.id, ...(one.thread && { thread: one.thread }) } }
  const path = into ? (await takeInto(app.fs, into, one.value, options), into) : (await takeIn(app.fs, one.value, { ...options, projectDir: app.projectDir })).path
  await app.fs.remove(`${ARRIVALS}/${one.id}.json`)
  await Promise.all([refreshConversations(), refresh()])
  // In the project on screen it opens there, read again even where it was open; in another, by its address.
  if (path.startsWith(`${app.projectDir}/`)) await openConversation(path)
  else location.hash = (await import('../../ui/router.js')).hashFor(app.projects.value.find((project) => path.startsWith(`${project.dir}/`)) ?? app.project.value, path.slice(-32, -6))
}

/**
 * The task an answer answers, in any project: the one its thread names, holding that it went to whoever answers, on that thread; none
 * otherwise, the answer then opening as a task of its own. @param {Awaited<ReturnType<typeof arrivalsOf>>[number]} one
 */
async function answered(one) {
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(one.thread?.task ?? '')) return ''
  for (const dir of new Set([app.projectDir, ...app.projects.value.map((project) => project.dir)])) {
    const path = `${dir}/conversations/${one.thread?.task}.jsonl`
    if (((await app.fs.read(path)) ?? '').split('\n').some((line) => { try { const sent = JSON.parse(line).meta?.sent; return sent?.to === one.from && sent.thread?.id === one.thread?.id } catch { return false } })) return path
  }
  return ''
}

/** The card of what came, above the conversation on each of the person's devices: who sent what, their words, Open and Not now. @param {Awaited<ReturnType<typeof arrivalsOf>>[number]} one */
const card = (one) => html`<aside class="offer people-card" role="note"><p>${tParts(one.kind === 'reply' ? 'people.answered' : 'people.came', { name: html`<bdi>${one.name}</bdi>`, title: html`<bdi>${one.title || t('conversation.untitled')}</bdi>` })}</p>
  ${one.words ? html`<p dir="auto">${one.words}</p>` : nothing}<div class="row"><button class="button primary" @click=${() => openArrival(one).catch(warn)}>${t(one.kind === 'reply' ? 'people.takeIn' : 'people.open')}</button>
  <button class="button subtle" @click=${() => { later.value = new Set([...later.peek(), one.id]) }}>${t('people.notNow')}</button></div></aside>`

/** send_to: this task, or one file it made, to one of the person's people by the name they gave them; asked first, as any `other` call is. @type {import('../../core/loop.js').Tool} */
const sendTool = {
  spec: { name: 'send_to', description: "Send this task, or one file it made, to one of the user's people, named as the user names them, with a few words of the user's if they gave some. The user is asked first.",
    parameters: { type: 'object', properties: { person: { type: 'string' }, file: { type: 'string', description: 'the name of a file the task made, to send it alone' }, words: { type: 'string' } }, required: ['person'] } },
  kind: 'other',
  title: (args) => (args?.file ? `Send ${args.file} to ${args?.person ?? ''}` : `Send this task to ${args?.person ?? ''}`),
  run: async (args, ctx) => {
    const [asked, met] = [String(args?.person ?? '').trim().toLowerCase(), groups.peek().filter((one) => one.able.length)]
    const exact = met.filter((one) => one.name.toLowerCase() === asked), found = exact.length ? exact : met.filter((one) => asked && one.name.toLowerCase().includes(asked))
    if (found.length !== 1) throw new Error(`${found.length ? 'More than one' : 'No one'} of the user's people is named so. They are: ${met.map((one) => one.name).join(', ') || 'none yet'}.`)
    const task = conversationOf(ctx.signal)
    if (!task) throw new Error('There is no task to send.')
    const file = args?.file ? filesMade(callsIn(task.records)).findLast((one) => one.name === args.file) : null
    if (args?.file && !file) throw new Error(`This task made no file named ${args.file}.`)
    const title = app.conversations.peek().find((one) => one.path === task.path)?.title ?? ''
    await sendIt(found[0].able, { path: task.path, title, ...(file && { item: { text: '', files: [file] } }) }, { words: String(args?.words ?? '') }, true)
    return `Sent to ${found[0].name}. They have a week to open it.`
  },
}

register({ id: 'people', tools: [sendTool], lines: [{ name: 'send_to', line: "send this task, or a file it made, to one of the user's people; it asks first" }], slots: {
  // Its own section of Settings, settings/people (./page.js), which ⌘K finds by Add a person too.
  settings: { id: 'people', at: 135, label: 'cap.people.name', icon: icons.people, also: () => t('people.add'), draw: lazyPage(() => import('./page.js')) },
  // What came, above the conversation, each until it is opened here or on another device, or put off.
  above: { at: 2, draw: () => arrivals.value.filter((one) => !later.value.has(one.id)).map(card) },
  // In the ⋮ menu of a task someone met sent, on screen: Send back to them, in share's dialog on its people.
  task: { at: 3, draw: (/** @type {{ path: string, title: string }} */ item, /** @type {(icon: unknown, label: string, act: () => unknown) => unknown} */ action) => ((back) => (back
    ? action(icons.people, t('people.back', { name: people.value.find((one) => one.fp === back.fp)?.name ?? '' }), () => import('../share/share.js').then((share) => share.openShare(item, null, true))) : []))(threadOf(item)) },
  // Only people chosen, share's dialog's second audience (caps/share/dialog.js), and whom a task went to, which its Share at the top says.
  audience: { at: 1, when: offered, label: () => t('people.only'), draw: pane, went },
  // The room's line over what someone sent names them as the person does (ui/chat.js).
  came: { at: 1, draw: () => nothing, name: (/** @type {string} */ fp) => people.value.find((one) => one.fp === fp)?.name ?? '' },
} })
// The secrets, where the people met follow the person's devices, and what came, which the store brings from them, changed in any tab or by another device.
app.fs.watch?.((path) => { if (path === '.secrets/keys.json' || path.startsWith(`${ARRIVALS}/`)) refresh().catch(warn) }, { all: true })
// What goes to people goes from share's dialog, found with People. A tab open for days lists the person again each day.
if (offered()) { watch().catch(warn); unlock('share') } else refresh().catch(warn)
if (colleagues) setInterval(() => me().then(listOn).catch(warn), 36e5)
