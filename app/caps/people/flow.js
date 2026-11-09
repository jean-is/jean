// People (D727): this profile as a person, the people it met, and the meeting, on pairing's exchange (../devices/pair.js) under its own
// route and labels. Ana's link carries a secret `s` and her profile key's fingerprint; Bob's Jean, once he accepts, opens a reply mailbox
// and says hello in a mailbox drawn from `s`, opened once, which only Ana's inviting device reads; her nonce comes to his reply mailbox, his
// reveal to a second mailbox drawn from `s`; the six digits Bob's screen shows, over everything that crossed and both names, are typed on
// Ana's. Then each sends the other, in an envelope from profile key to profile key, the person mailbox every device of theirs reads: what
// came before the digits gave no one a way in. People are secrets, `people:<fingerprint of the key they were met with>` and
// `people:<…>:name`, what this person calls them, so they follow the person's devices as the keys that cross do; an invitation and an
// acceptance under way stay on the device that made them. Pure, no DOM and no app state: node --test runs it against the relay.
import { boxPair, fingerprintOf } from '../../ui/seal.js'
import { mailbox, open, send, remove } from '../../ui/relay.js'
import { ulid } from '../../core/ulid.js'
import { base64url, bytesOf, random } from '../share/seal.js'
import { linkOf, parseLink, pairingBox, sealHello, openHello, sealNonce, openNonce, sealReveal, openReveal, codeOf, sameCode, envelope, openEnvelope } from '../devices/pair.js'

/** A key turned: the new one, the fingerprint of the one before, the new mailbox, when. @typedef {{ kind: 'chain', key: JsonWebKey, prior: string, mailbox: string, at: number }} Chain */
/**
 * This profile as a person: its key pair and the mailbox every device of it reads; after a turn, the pairs it had and the chain to this one; a
 * turn under way. @typedef {{ key: JsonWebKey, public: JsonWebKey, token: string, mailbox: string, old?: { key: JsonWebKey, public: JsonWebKey }[], chain?: Chain, pending?: Person }} Person
 */
/**
 * Someone met, as `people:<fp>` keeps them: their key, the name they gave themselves, how they were met, when, where they read once they
 * answered; their key before a turn; which of this profile's keys they took; whether they are to be met again. A colleague found on the
 * organisation's list (./colleagues.js) has a record for each device, its account theirs, one held until the person trusts it `asking`, with
 * what the list gives: their groups and roles, whether a guest, and the certificate of the device's key (ee/, D732).
 * @typedef {{ format: 1, key: JsonWebKey, said: string, met: 'side' | 'link' | 'organisation', at: number, mailbox?: string, waiting?: true, before?: JsonWebKey, took?: string, again?: true,
 *   account?: string, asking?: true, groups?: string[] | null, guest?: true, chain?: string[] }} Met
 */
/** B's hello as A read it. @typedef {{ key: JsonWebKey, mailbox: string, name: string, commit: string }} Hello */
/** An invitation under way on the device that made it (`invite:<id>`): its secret, who it is for, which way, when, the tries left, and what came. @typedef {{ id: string, s: string, name: string, way: 'side' | 'link', at: number, tries: number, said?: string, hello?: Hello, nA?: string, code?: string }} Invite */
/** An acceptance under way on the device that made it (`accept:<id>`): the link's secret and key, its reply mailbox, who it came from, and what came. @typedef {{ id: string, s: string, fpA: string, token: string, name: string, said: string, nB: string, at: number, key?: JsonWebKey, theirs?: string, code?: string }} Accept */
/**
 * What the meeting needs of the app: the secrets, the profile's files, the relay's address, this Jean's web address ('' in the desktop app),
 * the clock, the name this profile gives itself, the organisation's word on what People does (`person.check`, ee/, D732), which lets
 * all through where it has none, and how a task runs alone across the profile's tabs. @typedef {{ get: (id: string) => Promise<string | null>, set: (values: Record<string, string | null>) => Promise<unknown>,
 *   all: () => Promise<Record<string, string>>, fs: import('../../core/types.js').FS, base: string, address: string, now: () => number, said: () => Promise<string>,
 *   check?: (e: Check) => Promise<Check & { refuse?: string }>, alone?: <T>(run: () => Promise<T>) => Promise<T> }} Context
 */
/**
 * What People asks the organisation's controls (ee/, D732) before a meeting, before someone is found, kept, sent to or heard, and before
 * this device is listed, with the profile key as it signs a certificate's request: the event as they let it through, the devices of
 * someone they vouch for, the listing's certificate, or a refusal. @typedef {{ action: 'meet' | 'find' | 'add' | 'send' | 'open' | 'list', person?: Someone,
 *   keys?: CryptoKeyPair, proof?: string, chain?: string[] }} Check
 * Someone as the controls see them: a colleague as the list gives them, or someone met, with their device.
 * @typedef {{ name: string, account?: string, met: Met['met'], groups?: string[] | null, guest?: true, devices: { key: JsonWebKey, mailbox?: string, chain?: string[] }[] }} Someone
 */

export const PERSON = 'person'
export const WEEK = 7 * 864e5
/** The most a message may be as the relay carries it (relay/relay.js): nothing larger is sent. */
export const LIMIT = 25_000_000
/** Where what came from someone waits, sealed as it came, under its id; the person's store carries it to their other devices. */
export const ARRIVALS = 'people'
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
/** The ids of someone met: who they are, and what this person calls them. @param {string} fp */
export const metId = (fp) => `people:${fp}`
/** @param {string} fp */
export const nameId = (fp) => `people:${fp}:name`
/** Someone met, as kept; null for no one. @param {Context} ctx @param {string} fp @returns {Promise<Met | null>} */
const metOf = async (ctx, fp) => JSON.parse(await ctx.get(metId(fp)) || 'null')
/** The controls' word on what People does. @param {Context} ctx @param {Check} e */
export const checked = (ctx, e) => ctx.check?.(e) ?? Promise.resolve(/** @type {Check & { refuse?: string }} */ (e))
/** Someone met as the controls see them. @param {Met} one @returns {Someone} */
const someone = ({ said, met, account, groups, guest, key, mailbox, chain }) => ({ name: said, met, ...(account && { account }), ...(groups !== undefined && { groups }), ...(guest && { guest }),
  devices: [{ key, ...(mailbox && { mailbox }), ...(chain && { chain }) }] })
/** What went wrong, and why, as the page says it. @type {(reason: string) => never} */
const refuse = (reason) => { throw Object.assign(new Error(`The meeting stopped: ${reason}.`), { reason }) }

/** A person made: a key pair and a mailbox not yet opened, which reading it opens. */
export const madePerson = async () => ((box) => ({ ...box.pair, token: box.token, mailbox: box.id }))({ pair: await boxPair(), ...await mailbox() })
/**
 * This profile as a person, made where it has none: one call at a time, the context's `alone`, which reads again first, so that two at once
 * (People's own and a refresh a secret written meanwhile starts) never make two, the one lost being the one a listing named. @param {Context} ctx @returns {Promise<Person>}
 */
export async function personOf(ctx) {
  const kept = await ctx.get(PERSON)
  if (kept) return JSON.parse(kept)
  return (ctx.alone ?? ((run) => run()))(async () => {
    const again = await ctx.get(PERSON)
    if (again) return /** @type {Person} */ (JSON.parse(again))
    const made = await madePerson()
    await ctx.set({ [PERSON]: JSON.stringify(made) })
    return made
  })
}

/** The people met, by fingerprint, with what this person calls each. @param {Context} ctx @returns {Promise<(Met & { fp: string, name: string })[]>} */
export async function peopleOf(ctx) {
  const all = await ctx.all()
  return Object.entries(all).flatMap(([id, value]) => { const fp = /^people:([\w-]{22})$/.exec(id)?.[1]; return fp ? [{ ...JSON.parse(value), fp, name: all[nameId(fp)] ?? '' }] : [] })
}
/** A value from this profile to someone met, as the relay carries it. @param {Person} me @param {JsonWebKey} to @param {string} kind @param {object} body @param {Context} ctx */
export const letter = (me, to, kind, body, ctx) => envelope(me, to, { format: 1, kind, id: ulid(), at: ctx.now(), body })
const [encoder, decoder] = [new TextEncoder(), new TextDecoder()]
/** What came, read as JSON; nothing when it isn't. @param {Uint8Array} bytes @returns {any} */
export const parsed = (bytes) => { try { return JSON.parse(decoder.decode(bytes)) } catch { return {} } }
/** @param {JsonWebKey} a @param {JsonWebKey} b */
const same = (a, b) => a.x === b.x && a.y === b.y
/** A letter to someone met and, until they took this profile's key since its turn, the chain to it, sealed from the key they knew. @param {Context} ctx @param {Person} me @param {Met} one @param {string} kind @param {object} body */
async function letterTo(ctx, me, one, kind, body) {
  const [bytes, was] = [await letter(me, one.key, kind, body, ctx), me.old?.at(-1)]
  // To a colleague, where this device reads, which their Jean looks up on the organisation's list the first time (./colleagues.js).
  const sent = { ...JSON.parse(decoder.decode(bytes)), ...(one.met === 'organisation' && { mailbox: me.mailbox }) }
  if (me.chain && was && one.took !== await fingerprintOf(me.public)) sent.chain = decoder.decode(await envelope(was, one.key, me.chain))
  return encoder.encode(JSON.stringify(sent))
}
/** What came, opened with this profile's key or one it had before a turn, from one of the keys given; null otherwise. @param {Person} me @param {JsonWebKey[]} keys @param {Uint8Array} bytes */
async function openAny(me, keys, bytes) {
  for (const pair of [me, ...(me.old ?? []).toReversed()]) { const one = await openEnvelope(pair, keys, bytes).catch(() => null); if (one) return one }
  return null
}
/** Someone met, changed. @param {Context} ctx @param {Met & { fp: string, name?: string }} one @param {Partial<Met>} change */
const update = (ctx, { fp, name, ...kept }, change) => ctx.set({ [metId(fp)]: JSON.stringify({ ...kept, ...change }) })

// ─── Ana's side ──────────────────────────────────────────────────────────────

/** Saved as it goes, so that a tab closed meanwhile leaves the next to read on. @template {Invite | Accept} T @param {Context} ctx @param {'invite' | 'accept'} kind @param {T} one @returns {Promise<T>} */
const save = async (ctx, kind, one) => { await ctx.set({ [`${kind}:${one.id}`]: JSON.stringify(one) }); return one }
/** The two mailboxes drawn from an invitation's secret: the hello's, opened once, and the reveal's. @param {string} s */
export const boxesOf = (s) => Promise.all([pairingBox(bytesOf(s), 'meet'), pairingBox(bytesOf(s), 'meet-back')])

/**
 * Invites someone, named as this person calls them: the two mailboxes opened, the invitation kept on this device, and the link.
 * @param {Context} ctx @param {{ name: string, way: 'side' | 'link' }} options @returns {Promise<{ invite: Invite, link: string }>}
 */
export async function invite(ctx, { name, way }) {
  const [me, s] = [await personOf(ctx), random(32)]
  const one = { id: '', s: base64url(s), name, way, at: ctx.now(), tries: 3 }
  const [meet, back] = await boxesOf(one.s)
  await Promise.all([open(ctx.base, meet.token, { once: true }), open(ctx.base, back.token)])
  return { invite: await save(ctx, 'invite', { ...one, id: meet.id }), link: linkOf(ctx.address, s, await fingerprintOf(me.public), 'meet') }
}

/** Bob's hello: refused from this profile's own key or someone met already; else Ana's nonce, with her name, to his reply mailbox. @param {Context} ctx @param {Invite} one @param {Uint8Array} bytes */
export async function heardHello(ctx, one, bytes) {
  const [me, hello] = [await personOf(ctx), await openHello(bytesOf(one.s), bytes)]
  const fp = await fingerprintOf(hello.key)
  if (fp === await fingerprintOf(me.public)) refuse('self')
  if (await ctx.get(metId(fp))) refuse('known')
  const [said, [, back]] = [await ctx.said(), await boxesOf(one.s)]
  const nonce = await sealNonce(bytesOf(one.s), { key: me.public, mailbox: back.id, name: said })
  await send(ctx.base, hello.mailbox, nonce.bytes)
  return save(ctx, 'invite', { ...one, said, hello, nA: nonce.nA })
}

/** Bob's reveal: the six digits his screen shows, drawn here too. @param {Context} ctx @param {Invite} one @param {Uint8Array} bytes */
export async function heardReveal(ctx, one, bytes) {
  const { hello, nA = '', said = '' } = one
  if (!hello) refuse('broken')
  const [me, nB] = [await personOf(ctx), await openReveal(bytesOf(one.s), hello.commit, bytes)]
  const code = await codeOf({ label: 'meet', s: bytesOf(one.s), fpA: await fingerprintOf(me.public), keyB: hello.key, mailboxB: hello.mailbox, nA, nB, names: [hello.name, said] })
  return save(ctx, 'invite', { ...one, code })
}

/**
 * The digits typed on Ana's device. Right, Bob is kept, waiting for his answer, sent her person mailbox, and the invitation's mailboxes go;
 * wrong, a try fewer, the third telling him it stopped. @param {Context} ctx @param {Invite} one @param {string} typed @returns {Promise<'met' | 'wrong' | 'tries'>}
 */
export async function confirmed(ctx, one, typed) {
  const me = await personOf(ctx)
  if (!one.hello || !one.code) refuse('broken')
  if (!sameCode(typed, one.code)) {
    if (one.tries > 1) return (await save(ctx, 'invite', { ...one, tries: one.tries - 1 }), 'wrong')
    await send(ctx.base, one.hello.mailbox, await letter(me, one.hello.key, 'refused', {}, ctx)).catch(() => {})
    await ended(ctx, one)
    return 'tries'
  }
  const fp = await fingerprintOf(one.hello.key)
  /** @type {Met} */
  const met = { format: 1, key: one.hello.key, said: one.hello.name.slice(0, 80), met: one.way, at: ctx.now(), waiting: true }
  await Promise.all([ctx.set({ [metId(fp)]: JSON.stringify(met), [nameId(fp)]: one.name }), open(ctx.base, me.token)])
  await send(ctx.base, one.hello.mailbox, await letter(me, one.hello.key, 'met', { mailbox: me.mailbox, said: one.said, way: one.way }, ctx))
  await ended(ctx, one)
  return 'met'
}

/** An invitation over: its mailboxes removed, and it forgotten. @param {Context} ctx @param {Invite} one */
export async function ended(ctx, one) {
  await Promise.all((await boxesOf(one.s)).map((box) => remove(ctx.base, box.token).catch(() => {})))
  await ctx.set({ [`invite:${one.id}`]: null })
}

// ─── Bob's side ──────────────────────────────────────────────────────────────

/**
 * Bob accepts a link, naming who sent it as he calls them: refused for his own or someone met already; else his reply mailbox opened and
 * his hello sent, with his name, which a second opener's Jean finds taken (409). @param {Context} ctx @param {{ link: string, name: string }} options @returns {Promise<Accept>}
 */
export async function accept(ctx, { link, name }) {
  const [parsed, me] = [parseLink(link, 'meet'), await personOf(ctx)]
  if (!parsed) refuse('link')
  if (parsed.fpA === await fingerprintOf(me.public)) refuse('self')
  if (await ctx.get(metId(parsed.fpA))) refuse('known')
  const [reply, said, [meet]] = [await mailbox(), await ctx.said(), await boxesOf(base64url(parsed.s))]
  await open(ctx.base, reply.token)
  const hello = await sealHello(parsed.s, { key: me.public, mailbox: reply.id, name: said })
  await send(ctx.base, meet.id, hello.bytes).catch(async (error) => { await remove(ctx.base, reply.token).catch(() => {}); refuse(error?.status === 409 ? 'used' : error?.status === 404 ? 'gone' : 'relay') })
  return save(ctx, 'accept', { id: reply.id, s: base64url(parsed.s), fpA: parsed.fpA, token: reply.token, name, said, nB: hello.nB, at: ctx.now() })
}

/** Ana's nonce, from the key the link named: Bob's reveal sent, and the six digits to show, with the name she gives herself. @param {Context} ctx @param {Accept} one @param {Uint8Array} bytes */
export async function heardNonce(ctx, one, bytes) {
  const [me, nonce] = [await personOf(ctx), await openNonce(bytesOf(one.s), one.fpA, bytes)]
  await send(ctx.base, nonce.mailbox, await sealReveal(bytesOf(one.s), one.nB))
  const code = await codeOf({ label: 'meet', s: bytesOf(one.s), fpA: one.fpA, keyB: me.public, mailboxB: one.id, nA: nonce.nA, nB: one.nB, names: [one.said, nonce.name] })
  return save(ctx, 'accept', { ...one, key: nonce.key, theirs: nonce.name.slice(0, 80), code })
}

/**
 * Ana's answer, from her key alone: `met`, and she is kept with her person mailbox, which is sent Bob's; `refused`, it stopped there.
 * Either way the acceptance is over. @param {Context} ctx @param {Accept} one @param {Uint8Array} bytes @returns {Promise<Met>}
 */
export async function heardMet(ctx, one, bytes) {
  const me = await personOf(ctx)
  if (!one.key) refuse('broken')
  const { value } = await openEnvelope(me, [one.key], bytes)
  await dropped(ctx, one)
  if (value?.kind !== 'met' || typeof value.body?.mailbox !== 'string') refuse(value?.kind === 'refused' ? 'tries' : 'broken')
  /** @type {Met} */
  const met = { format: 1, key: one.key, said: String(value.body.said ?? one.theirs ?? '').slice(0, 80), met: value.body.way === 'side' ? 'side' : 'link', at: ctx.now(), mailbox: value.body.mailbox }
  await Promise.all([ctx.set({ [metId(one.fpA)]: JSON.stringify(met), [nameId(one.fpA)]: one.name }), open(ctx.base, me.token)])
  await send(ctx.base, met.mailbox ?? '', await letter(me, one.key, 'met', { mailbox: me.mailbox, said: one.said }, ctx))
  return met
}

/** An acceptance stopped before it ended: its reply mailbox removed, and it forgotten. @param {Context} ctx @param {Accept} one */
export const dropped = (ctx, one) => Promise.all([remove(ctx.base, one.token).catch(() => {}), ctx.set({ [`accept:${one.id}`]: null })])

// ─── The person mailbox ──────────────────────────────────────────────────────

/**
 * What came to the person mailbox, opened with the keys of the people met, anything else dropped: `met` from someone waiting fills in where
 * they read. What it was, or null. @param {Context} ctx @param {Uint8Array} bytes @returns {Promise<{ kind: string, from: string, body: any, id: string } | null>}
 */
export async function received(ctx, bytes) {
  const me = await personOf(ctx)
  const sent = parsed(bytes)
  if (typeof sent?.chain === 'string') await chained(ctx, me, encoder.encode(sent.chain))
  const people = await peopleOf(ctx), opened = await openAny(me, people.map((one) => one.key), bytes)
  const from = opened && people.find((one) => same(one.key, opened.from))
  if (!opened || !from || typeof opened.value?.kind !== 'string') return null
  const { kind, body = {}, id = '' } = opened.value
  if (kind === 'met' && from.waiting && typeof body.mailbox === 'string') await update(ctx, from, { mailbox: body.mailbox, waiting: undefined })
  if (kind === 'took' && body.key === await fingerprintOf(me.public)) await update(ctx, from, { took: body.key })
  // Removed by them: forgotten here too, unless what says so is older than this record of them, as a relay giving it again would be.
  if (kind === 'gone' && Number(opened.value.at) >= from.at) await ctx.set({ [metId(from.fp)]: null, [nameId(from.fp)]: null })
  // What the organisation keeps from this person isn't kept (ee/, D732).
  if ((kind === 'send' || kind === 'reply') && typeof id === 'string' && ULID.test(id) && !(await checked(ctx, { action: 'open', person: someone(from) })).refuse) await keep(ctx, from.fp, id, bytes)
  return { kind, from: from.fp, body, id }
}

/** What waits from someone, as kept. @param {Context} ctx @returns {Promise<{ name: string, from: string, box: string }[]>} */
const kept = async (ctx) => (await Promise.all((await ctx.fs.list(ARRIVALS)).filter((one) => one.name.endsWith('.json'))
  .map(async ({ name }) => ({ name, ...JSON.parse(await ctx.fs.read(`${ARRIVALS}/${name}`) ?? '{}') })))).filter((one) => one.box)
/** What came kept as it came, under its id, never over one there already; dropped once its sender has 20 waiting or 100 MB. @param {Context} ctx @param {string} fp @param {string} id @param {Uint8Array} bytes */
async function keep(ctx, fp, id, bytes) {
  const theirs = (await kept(ctx)).filter((one) => one.from === fp)
  if (await ctx.fs.exists(`${ARRIVALS}/${id}.json`) || theirs.length >= 20 || theirs.reduce((sum, one) => sum + one.box.length, bytes.length) > 100e6) return
  await ctx.fs.write(`${ARRIVALS}/${id}.json`, JSON.stringify({ format: 1, from: fp, box: base64url(bytes) }))
}

/**
 * What waits, opened with this profile's key: each with who sent it, as this person calls them, its title, their words and its value. One that
 * doesn't open here (from someone forgotten, or kept by a folder this device shares without being paired) is passed over, never deleted.
 * @param {Context} ctx @returns {Promise<{ id: string, kind: 'send' | 'reply', from: string, name: string, at: number, title: string, words: string, value: any, thread?: { task: string, id: string } }[]>}
 */
export async function arrivalsOf(ctx) {
  const [me, people] = [await personOf(ctx), await peopleOf(ctx)]
  const opened = await Promise.all((await kept(ctx)).map(async ({ name, from, box }) => {
    const one = people.find((person) => person.fp === from)
    const { value } = (one && await openAny(me, [one.key, ...(one.before ? [one.before] : [])], bytesOf(box))) ?? {}
    return one && !one.asking && (value?.kind === 'send' || value?.kind === 'reply') && `${value.id}.json` === name ? [{ id: value.id, kind: value.kind, from, name: one.name, at: Number(value.at) || 0, title: String(value.body?.title ?? '').slice(0, 200),
      words: String(value.body?.words ?? '').slice(0, 280), value: value.body?.value ?? {}, ...(value.body?.thread && { thread: value.body.thread }) }] : []
  }))
  return opened.flat().sort((a, b) => a.at - b.at)
}

/**
 * A value sent to someone met, or an answer back on the thread they sent, sealed to them and posted where they read: refused for someone who
 * never answered, gone, kept from the person by their organisation, or past what the relay carries; or, `joined`, word to a colleague who invited the person that they use Jean now
 * (./colleagues.js). Its size. @param {Context} ctx @param {string} fp
 * @param {{ title: string, words: string, value: object, thread: { task: string, id: string } } | {}} body @param {'send' | 'reply' | 'joined'} [kind]
 */
export async function sendTo(ctx, fp, body, kind = 'send') {
  const [me, one] = [await personOf(ctx), await metOf(ctx, fp)]
  if (!one?.mailbox || one.again || one.asking) refuse(one?.again || one?.asking ? 'again' : one ? 'waiting' : 'gone')
  if ((await checked(ctx, { action: 'send', person: someone(one) })).refuse) refuse('refused')
  const bytes = await letterTo(ctx, me, one, kind, body)
  if (bytes.length > LIMIT) refuse('large')
  await send(ctx.base, one.mailbox, bytes).catch((error) => refuse(error?.status === 404 ? 'gone' : error?.status === 413 ? 'large' : 'relay'))
  return bytes.length
}

/** Someone forgotten here and on the person's other devices, told where they read. @param {Context} ctx @param {string} fp */
export async function forget(ctx, fp) {
  const [me, one] = [await personOf(ctx), await metOf(ctx, fp)]
  if (one?.mailbox) await send(ctx.base, one.mailbox, await letterTo(ctx, me, one, 'gone', {})).catch(() => {})
  await ctx.set({ [metId(fp)]: null, [nameId(fp)]: null })
}

/** What a week left behind: invitations and acceptances older than that, gone with their mailboxes; and those who never answered, forgotten. @param {Context} ctx */
export async function tidy(ctx) {
  for (const [id, value] of Object.entries(await ctx.all())) {
    const one = /^(invite:|accept:|people:[\w-]{22}$)/.test(id) ? JSON.parse(value) : null
    if (!one || !(ctx.now() - one.at > WEEK)) continue
    if (id.startsWith('invite:')) await ended(ctx, one)
    else if (id.startsWith('accept:')) await dropped(ctx, one)
    else if (one.waiting) await ctx.set({ [id]: null, [`${id}:name`]: null })
  }
}

// ─── A key turned ────────────────────────────────────────────────────────────

/**
 * This profile's key turned, as a device removed knew it, its person mailbox's token and everyone's mailbox (D727): a new pair and mailbox
 * kept as the turn under way first, so that any device finding it there ends it; each person met told, in a letter from the new key with the
 * chain from the old; then the new one is the person, the old pair kept for what was sealed to it, and the old mailbox gone. @param {Context} ctx
 */
export async function turn(ctx) {
  const me = await personOf(ctx)
  const next = me.pending ?? await (async () => { const made = await madePerson()
    return { ...made, old: [...me.old ?? [], { key: me.key, public: me.public }], chain: /** @type {Chain} */ ({ kind: 'chain', key: made.public, prior: await fingerprintOf(me.public), mailbox: made.mailbox, at: ctx.now() }) } })()
  if (!me.pending) await ctx.set({ [PERSON]: JSON.stringify({ ...me, pending: next }) })
  await open(ctx.base, next.token)
  const said = await ctx.said()
  for (const one of (await peopleOf(ctx)).filter((person) => person.mailbox && !person.again)) await send(ctx.base, String(one.mailbox), await letterTo(ctx, next, one, 'met', { mailbox: next.mailbox, said })).catch(() => {})
  await ctx.set({ [PERSON]: JSON.stringify(next) })
  await remove(ctx.base, me.token).catch(() => {})
}

/**
 * A chain someone's Jean attached: their new key and mailbox, sealed from the key held for them. Taken from that key, and told back (`took`);
 * one from the key before it naming yet another key is a second turn from one key, which can't be told apart from a stolen device's, so they
 * are to be met again. @param {Context} ctx @param {Person} me @param {Uint8Array} bytes
 */
async function chained(ctx, me, bytes) {
  for (const one of await peopleOf(ctx)) {
    const opened = await openAny(me, [one.key, ...(one.before ? [one.before] : [])], bytes), chain = opened?.value
    if (!opened || chain?.kind !== 'chain' || typeof chain.mailbox !== 'string' || typeof chain.key?.x !== 'string') continue
    const key = { kty: 'EC', crv: 'P-256', x: chain.key.x, y: chain.key.y }, fresh = await fingerprintOf(key).catch(() => '')
    if (!fresh) return
    if (!same(key, one.key) && !same(opened.from, one.key)) return update(ctx, one, { again: true })
    if (!same(key, one.key)) await update(ctx, one, { key, before: one.key, mailbox: chain.mailbox, at: ctx.now() })
    return send(ctx.base, chain.mailbox, await letterTo(ctx, me, { ...one, key }, 'took', { key: fresh })).catch(() => {})
  }
}
