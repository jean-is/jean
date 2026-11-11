// Together's engine (D733): people work on one thing at once, each keeping their own copy, a journal on the relay keeping the copies in step
// (relay/journal.js). ./circle.js says who is in, ./journal.js talks to the relay, and each kind's binding says what its changes are
// (./collection.js, for a collection). A circle is a secret, `circle:<journal id>`, which follows the person's devices (D700): the relay,
// the tokens their role gives, each epoch's key, the owner's fingerprint and token hash (and token, on the owner's devices), and where
// the thing is here. The visible tab follows every circle from the start of its journal, one tab at a time, and posts what changes here,
// numbered per device; nothing is followed while Jean is hidden, so a phone in a pocket is no beacon. Found from Share's "Work on it
// together", an invitation, or a link (#/join/).
import { signal } from '@preact/signals-core'
import { contributions } from '../../ui/caps.js'
import { fire } from '../../core/hooks.js'
import { app, notify, refreshConversations, openConversation, refreshProjects, enterProject } from '../../ui/state.js'
import { mine } from '../../ui/opfs.js'
import { getSecret, setSecrets, secretsWhere } from '../../ui/secrets.js'
import { serviceURL } from '../../core/settings.js'
import { encode, decode, fingerprintOf, sealFor } from '../../ui/seal.js'
import { base64url, hashOf, random } from '../share/seal.js'
import { t } from '../../core/i18n.js'
import { personOf } from '../people/flow.js'
import { apart } from '../sync/mirror.js'
import { folderOf } from '../tables/table.js'
import * as circle from './circle.js'
import * as journal from './journal.js'
import * as collection from './collection.js'
import * as task from './task.js'
import * as document from './document.js'
import * as project from './project.js'

/** What each kind adds (D733): its changes, how they apply, its seed. */
const bindings = { collection, task, document, deck: document, project }
/** @typedef {keyof typeof bindings} Kind */

/**
 * A circle as the secret keeps it. `links` whether a link may join; `role` what a link gives, editing or viewing.
 * @typedef {{ format: 1, relay: string, kind: Kind, place: import('./collection.js').Place | null, title: string, owner: string, ownerHash: string, ownerToken?: string,
 *   epoch: number, keys: Record<string, string>, read: string, write?: string, links: boolean, role?: 'edit' | 'view' }} Kept
 * A circle followed: who is in, what the journal holds of the thing, this device's counter, who is here, and how to stop.
 * @typedef {{ id: string, kept: Kept, me: string, state: circle.State, held: import('./collection.js').Held, n: number, members: Set<string>,
 *   here: Map<string, number>, ready: Promise<void>, caught: () => void, settled?: true, stop: () => void, unwatch?: () => void, joining?: { name: string, invite?: object },
 *   baton: { holder: string | null, at: number, queue: string[] }, waits: Map<string, () => void> }} Live
 */

/** The circles followed here, by journal. */
export const circles = signal(/** @type {Map<string, Live>} */ (new Map()))
/** Circles being started here, not yet in `circles`: a key that comes meanwhile starts nothing twice. */
export const starting = new Set()
/** What others asked this person's Jean in a task worked on together, waiting for them to let it answer (D734). */
export const asking = signal(/** @type {{ id: string, circle: string, from: string, text: string }[]} */ ([]))
const changed = () => { circles.value = new Map(circles.peek()) }
const ctx = { get: (/** @type {string} */ id) => getSecret(app.fs, id), set: (/** @type {Record<string, string | null>} */ values) => setSecrets(app.fs, values),
  alone: (/** @type {() => Promise<any>} */ run) => navigator.locks?.request(mine('app-person-made'), run) ?? run() }
/** This profile as a person (caps/people/flow.js): its key signs every change. */
const me = () => personOf(/** @type {any} */ (ctx))
const token = () => base64url(random(32))
/** The relay that keeps journals, where this Jean names one; not for a child's profile (D389). */
export const relayOf = () => (app.policy.child || app.policy.rules?.share === 'never' ? '' : serviceURL('relay', app.settings.peek(), app.policy))
/** The organisation's word (ee/, D732): where people come from its list alone, no link joins. */
const linked = async () => !(await fire(contributions().hooks, 'person.check', { action: 'meet' }, (/** @type {any} */ e) => e)).refuse
const keysOf = (/** @type {Kept} */ kept) => Object.fromEntries(Object.entries(kept.keys).map(([epoch, key]) => [epoch, decode(key)]))
const whereOf = (/** @type {Live} */ live) => ({ base: live.kept.relay, id: live.id, read: live.kept.read, write: live.kept.write })
const cache = (/** @type {string} */ id) => `.cache/together/${id}.json`
const save = (/** @type {string} */ id, /** @type {Kept | null} */ kept) => setSecrets(app.fs, { [`circle:${id}`]: kept && JSON.stringify(kept) })

/**
 * A change posted, signed and sealed: one too large for the journal goes as sealed parts, which it names. Its number and its sealed bytes.
 * @param {Live} live @param {string} kind @param {any} body @param {{ seed?: boolean }} [options]
 */
async function post(live, kind, body, { seed = false } = {}) {
  await live.ready
  const [person, where, at] = [await me(), whereOf(live), { id: live.id, epoch: live.kept.epoch, key: decode(live.kept.keys[live.kept.epoch]) }]
  const text = new TextEncoder().encode(JSON.stringify(body))
  const parts = text.length > 48_000 ? await Promise.all(Array.from({ length: Math.ceil(text.length / 3e6) }, async (_, i) => journal.putPart(where, await circle.sealPart(at, text.slice(i * 3e6, (i + 1) * 3e6))))) : []
  const sealed = await circle.sealChange(at, person.key, { member: live.me, device: app.deviceId, n: ++live.n, kind, as: 'person', body: parts.length ? { parts } : body })
  await app.fs.write(cache(live.id), JSON.stringify({ n: live.n, members: [...live.members] }))
  await journal.post(where, sealed, { seed, parts })
  return sealed
}

/** A body that went as parts, put back together. @param {Live} live @param {string[]} parts @param {number} epoch */
const assembled = async (live, parts, epoch) => JSON.parse(new TextDecoder().decode(new Uint8Array((await Promise.all(parts.map(async (name) => [...await circle.openPart(live.id, epoch, decode(live.kept.keys[epoch]), await journal.getPart(whereOf(live), name))]))).flat())))

/** A member's name, as the journal gives it. @param {Live} live @param {string} fp */
const nameIn = (live, fp) => live.state.members[fp]?.name ?? ''
/** The binding of a circle's kind. @param {Kept} kept */
const bindingOf = (kept) => bindings[kept.kind]

/**
 * The baton (D733): one at a time does what only one may, answering a task. The first `take` after the last `release`, in the journal's
 * order, holds it, the later ones waiting their turn; `hold` keeps it, and a holder silent for 90 seconds by the relay's clock loses it at
 * the next change anyone posts, as every copy decides alike. @param {Live} live @param {import('./circle.js').Change} change @param {number} at
 */
function passed(live, change, at) {
  const baton = live.baton
  if (baton.holder && at - baton.at > 90_000) Object.assign(baton, { holder: baton.queue.shift() ?? null, at })
  if (change.kind === 'take') { if (!baton.holder) Object.assign(baton, { holder: change.member, at }); else if (baton.holder !== change.member && !baton.queue.includes(change.member)) baton.queue.push(change.member) }
  if (change.kind === 'hold' && baton.holder === change.member) baton.at = at
  if (change.kind === 'release' && baton.holder === change.member) Object.assign(baton, { holder: baton.queue.shift() ?? null, at })
  if (baton.holder) live.waits.get(baton.holder)?.()
}

/** A change of the journal, taken as every copy takes it. @param {Live} live @param {Uint8Array} sealed @param {number} at the relay's time */
async function taken(live, sealed, at) {
  const opened = await circle.openChange(live.id, keysOf(live.kept), sealed)
  if (opened?.change.member === live.me && opened.change.device === app.deviceId) live.n = Math.max(live.n, opened.change.n)
  const change = await circle.take(live.state, live.id, opened)
  if (!change || !opened) return
  passed(live, change, at)
  if (circle.isMembership(change)) live.members.add(encode(sealed))
  const body = change.body?.parts && !circle.isMembership(change) ? await assembled(live, change.body.parts, opened.epoch) : change.body
  if (change.kind === 'begin' && typeof body.ownerHash === 'string' && !live.kept.ownerHash) live.kept.ownerHash = body.ownerHash
  // What the circle shares, as its owner began it: a link doesn't say.
  if (change.kind === 'begin' && Object.hasOwn(bindings, body.kind)) live.kept.kind = body.kind
  if (change.kind === 'seed') {
    for (const one of Array.isArray(body.members) ? body.members : []) await taken(live, decode(one), at)
    if (!live.kept.place && body.content?.table?.id) live.kept.place = { dir: app.projectDir, folder: folderOf(body.content.table) }
    if (!live.kept.place && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(String(body.content?.id))) live.kept.place = { dir: app.projectDir, folder: `conversations/${body.content.id}.jsonl` }
    if (!live.kept.place && /^(documents\/[^/]+\.md|decks\/[^/]+\.deck\.html)$/.test(String(body.content?.doc))) live.kept.place = { dir: app.projectDir, folder: body.content.doc }
    if (!live.kept.place && /^[0-9A-HJKMNP-TV-Z]{26}-[a-z0-9-]+$/.test(String(body.content?.project?.folder))) live.kept.place = { dir: 'projects', folder: body.content.project.folder }
    if (!live.kept.title && typeof body.content?.title === 'string') live.kept.title = body.content.title
  }
  if ((change.kind === 'seed' ? body.content : change.kind === 'change' && body) && live.kept.place) {
    await bindingOf(live.kept).take(live.kept.place, change.kind === 'seed' ? body.content : body, live.held, { me: live.me, names: (fp) => nameIn(live, fp) })
  }
  if (change.kind === 'moved' && change.member !== live.me) await moved(live, body)
  // Someone asks this person's Jean: a card, until they let it answer or put it off.
  if (change.kind === 'ask' && body.to === live.me && typeof body.text === 'string' && live.settled) asking.value = [...asking.peek(), { id: `${live.id}:${change.member}:${change.n}`, circle: live.id, from: nameIn(live, change.member), text: body.text.slice(0, 2000) }]
  if ((change.kind === 'remove' || change.kind === 'block') && body.fp === live.me) return ended(live, 'removed')
  if (live.settled) watching(live)
  if (change.kind === 'join' && change.member === live.me && live.settled) here(live)
  if (change.kind === 'join' && change.member !== live.me && live.settled) notify(t(body.how === 'link' ? 'together.joinedLink' : 'together.joined', { name: live.state.members[change.member]?.name ?? '' }))
  changed()
}

/** A circle that ended for this person: removed, stopped by its owner, or moved without them; their copy stays theirs. @param {Live} live @param {'removed' | 'stopped'} how */
async function ended(live, how) {
  live.stop()
  live.unwatch?.()
  circles.peek().delete(live.id)
  for (const place of apartOf(live.kept)) apart.delete(place)
  await save(live.id, null)
  await app.fs.remove(cache(live.id)).catch(() => {})
  // A link that never opened anything has no title to name.
  notify(live.kept.title ? t(how === 'removed' ? 'together.removed' : 'together.stopped', { title: live.kept.title }) : t('together.gone'))
  changed()
}

/** The owner moved everyone to the next journal: this person follows, with the key sealed to them, or is out. @param {Live} live @param {any} body */
async function moved(live, body) {
  const next = await circle.followed(body, live.me, (await me()).key)
  if (!next) return ended(live, 'removed')
  const { write: _, ...rest } = live.kept
  const kept = { ...rest, epoch: next.epoch, keys: { ...live.kept.keys, [next.epoch]: next.key }, read: next.read, ...(next.write && { write: next.write }), links: next.links }
  const id = await journal.journalOf(next.read)
  live.stop()
  live.unwatch?.()
  circles.peek().delete(live.id)
  await save(live.id, null)
  await save(id, kept)
  follow(id, kept)
}

/**
 * Follows a circle from the start of its journal: once caught up, a joiner says so and opens the thing, and what changes here goes.
 * A journal gone after its days is made again by whoever can write, from their copy, with the membership changes they keep.
 * @param {string} id @param {Kept} kept @param {Live['joining']} [joining]
 */
export async function follow(id, kept, joining) {
  starting.add(id)
  const person = await me()
  const saved = JSON.parse(await app.fs.read(cache(id)) ?? '{}')
  /** @type {() => void} */
  let caught = () => {}
  const ready = new Promise((resolve) => { caught = () => resolve(undefined) })
  const control = new AbortController()
  /** @type {Live} */
  const live = { id, kept, me: await fingerprintOf(person.public), state: circle.begun(kept.owner), held: { lines: new Set(), table: '' }, n: Number(saved.n) || 0,
    members: new Set(saved.members ?? []), here: new Map(), ready, caught, stop: () => control.abort(), joining, baton: { holder: null, at: 0, queue: [] }, waits: new Map() }
  circles.peek().get(id)?.stop()
  circles.peek().set(id, live)
  starting.delete(id)
  changed()
  journal.follow({ ...whereOf(live), after: 0, signal: control.signal,
    onChange: (line, bytes) => taken(live, bytes, line.at),
    onFleeting: async (bytes) => { const said = await circle.heard(live.state, id, await circle.openChange(id, keysOf(live.kept), bytes)); if (said) { live.here.set(said.member, Date.now()); changed() } },
    onCaught: () => settled(live),
    onEnd: async (how) => {
      // Deleted, or gone from the relay after its days: nothing more comes of it, and nothing posted would ever go.
      if (how.deleted || how.gone) return ended(live, 'stopped')
      if (!how.expired || !live.kept.write) return
      // Expired: made again, the first to come back posting a seed from their copy; another member reads it and merges theirs in.
      if ((await journal.create(whereOf(live), live.kept.ownerHash)) === 'made' && live.kept.place) {
        follow(id, live.kept)
        const again = /** @type {Live} */ (circles.peek().get(id))
        await post(again, 'seed', { members: [...live.members], content: await seedOf(again) }, { seed: true })
      } else follow(id, live.kept)
    } })
  return live
}

/** Caught up with the journal: a joiner joins and sees the thing; what changes here goes from now on. @param {Live} live */
async function settled(live) {
  live.caught()
  live.settled = true
  const { joining, kept } = live
  if (joining && kept.write && !live.state.members[live.me]) {
    const person = await me()
    await post(live, 'join', { key: person.public, name: joining.name.slice(0, 80), how: joining.invite ? 'invite' : 'link', ...(joining.invite && { invite: joining.invite }), mailbox: person.mailbox })
  }
  if (!kept.place) return
  kept.title = await bindingOf(kept).titleOf(kept.place) || kept.title
  await save(live.id, kept)
  for (const place of apartOf(kept)) apart.add(place)
  watching(live)
  here(live)
  if (joining) {
    delete live.joining
    if (kept.kind === 'project') {
      // A project of their own now, so projects are theirs too.
      await (await import('../../ui/caps.js')).unlock('projects')
      await refreshProjects()
      const made = app.projects.peek().find((one) => one.dir === `projects/${kept.place?.folder}`)
      if (made) await enterProject(made)
    } else if (kept.kind === 'task') {
      await refreshConversations()
      if (kept.place.dir === app.projectDir) await openConversation(`${kept.place.dir}/${kept.place.folder}`)
    } else {
      const [cap, file] = /** @type {Record<string, string[]>} */ ({ document: ['documents', 'documents/documents'], deck: ['skills', 'skills/decks'] })[kept.kind] ?? ['tables', 'tables/tables']
      const [{ unlock }, { metaOf }, { preview }] = await Promise.all([import('../../ui/caps.js'), import(`../${file}.js`), import('../../ui/preview.js')])
      await unlock(cap)
      const meta = await metaOf(kept.place.folder)
      if (meta) preview({ uri: kept.place.folder, ...meta })
    }
  }
  changed()
}

/** What changes here goes, once this person is in and may write: a task's records named as theirs. @param {Live} live */
const watching = (live) => {
  if (!live.state.members[live.me] || !live.kept.write || !live.kept.place) return
  live.unwatch ??= bindingOf(live.kept).watch(live.kept.place, live.held, (/** @type {any} */ body) => post(live, 'change', body.records ? { records: body.records.map((/** @type {any} */ one) => ({ ...one, who: { fp: live.me } })) } : body))
}
/** All of a circle's thing, for a seed, a task's records named as their writer's, this person's where nobody is. @param {Live} live */
const seedOf = async (live) => {
  const content = await bindingOf(live.kept).seedOf(/** @type {any} */ (live.kept.place))
  return 'records' in content ? { ...content, records: content.records.map((one) => ({ ...one, who: one.who ?? { fp: live.me } })) } : content
}

/** The baton for this task: taken, then waited for, until it's this person's turn. @param {Live} live */
export async function turn(live) {
  if (live.baton.holder === live.me) return
  const mine = new Promise((resolve) => live.waits.set(live.me, () => resolve(undefined)))
  await post(live, 'take', {})
  if (live.baton.holder && live.baton.holder !== live.me) notify(t('together.waiting', { name: nameIn(live, live.baton.holder) }))
  await mine
  live.waits.delete(live.me)
}
/** The baton passed on, once this person's answer ended; held meanwhile every 30 seconds. @param {Live} live */
export const done = (live) => (live.baton.holder === live.me ? post(live, 'release', {}).catch(() => {}) : undefined)
/** @param {Live} live */
export const holding = (live) => (live.baton.holder === live.me ? post(live, 'hold', {}).catch(() => {}) : undefined)

/**
 * Starts working together on a collection: its journal made, its circle begun with the owner's key, and its seed, the collection as it
 * is, posted for whoever joins. @param {import('./collection.js').Place} place @param {{ links: boolean, role: 'edit' | 'view', kind?: Kind }} choice
 */
export async function begin(place, { links, role, kind = /** @type {Kind} */ ('collection') }) {
  const relay = relayOf()
  if (!relay || !(await journal.keeps(relay))) throw new Error(t('together.noPlace'))
  if (links && !(await linked())) throw new Error(t('together.inside'))
  const [person, read, write, ownerToken, key] = [await me(), token(), token(), token(), random(32)]
  const [id, ownerHash, owner] = [await journal.journalOf(read), await hashOf(ownerToken), await fingerprintOf(person.public)]
  await journal.create({ base: relay, id, read, write }, ownerHash)
  /** @type {Kept} */
  const kept = { format: 1, relay, kind, place, title: await bindings[kind].titleOf(place), owner, ownerHash, ownerToken, epoch: 0, keys: { 0: encode(key) }, read, write, links, role }
  await save(id, kept)
  const live = await follow(id, kept), content = await seedOf(live)
  // What the seed holds is the journal's already, so that nothing of it goes again as a change.
  bindingOf(kept).hold(live.held, /** @type {any} */ (content))
  const begun = await post(live, 'begin', { key: person.public, name: await nameOf(), kind, links, ownerHash, mailbox: person.mailbox })
  await post(live, 'seed', { members: [encode(begun)], content }, { seed: true })
  return live
}

/** The name the others see: the one the person gave themselves. */
const nameOf = async () => String(JSON.parse(await app.fs.read('.secrets/vault.json') ?? '{}').name ?? '') || app.settings.peek().name || ''

/** A link to join, for anyone holding it: the owner's alone (./circle.js `linkOf`), to edit or to view as they chose. @param {Live} live */
export const linkFor = ({ kept }) => `${location.origin}${location.pathname}#/join/${circle.linkOf({ owner: kept.owner, epoch: kept.epoch, read: kept.read, key: decode(kept.keys[kept.epoch]), ...(kept.role !== 'view' && { write: kept.write }) })}`

/** Joins from a link or an invitation: follows the journal, and once caught up says so and opens the thing. @param {string} text @param {{ name: string, invite?: object, kind?: Kind }} joining */
export async function join(text, joining) {
  const link = circle.fromLink(text)
  const relay = relayOf()
  if (!link || !relay) throw new Error(t('together.gone'))
  if (!joining.invite && !(await linked())) throw new Error(t('together.inside'))
  const id = await journal.journalOf(link.read)
  if (circles.peek().has(id)) return circles.peek().get(id)
  /** @type {Kept} */
  const kept = { format: 1, relay, kind: /** @type {Kind} */ (joining.kind ?? 'collection'), place: null, title: '', owner: link.owner, ownerHash: '', epoch: link.epoch, keys: { [link.epoch]: encode(link.key) }, read: link.read, ...(link.write && { write: link.write }), links: true }
  await save(id, kept)
  return follow(id, kept, joining)
}

/** The owner's: someone given another role, or their changes stopped. @param {Live} live @param {string} fp @param {'editor' | 'viewer' | 'block'} what */
export const set = (live, fp, what) => post(live, what === 'block' ? 'block' : 'role', what === 'block' ? { fp } : { fp, role: what })

/**
 * The owner's: everyone left moved to the next journal, with a key the removed can't open; with no one removed, the link turned off,
 * or on where `links` asks. @param {Live} live @param {string[]} leaving @param {boolean} [links] @returns {Promise<Live>} the circle moved to
 */
export async function move(live, leaving, links = leaving.length > 0 && live.kept.links) {
  if (links && !live.kept.links && !(await linked())) throw new Error(t('together.inside'))
  const [person, read, write, key, epoch] = [await me(), token(), token(), random(32), live.kept.epoch + 1]
  const next = { epoch, read, write, key: encode(key), links }
  await post(live, 'moved', { envelopes: Object.fromEntries(await Promise.all(circle.membersOf(live.state).filter((one) => !leaving.includes(one.fp) && one.fp !== live.me)
    .map(async (one) => [one.fp, await sealFor(one.key, one.role === 'viewer' ? { ...next, write: undefined } : next)]))) })
  const id = await journal.journalOf(read)
  await journal.create({ base: live.kept.relay, id, read, write }, live.kept.ownerHash)
  const kept = { ...live.kept, epoch, keys: { ...live.kept.keys, [epoch]: next.key }, read, write, links: next.links }
  await journal.end(whereOf(live), /** @type {string} */ (live.kept.ownerToken), 'moved')
  live.stop()
  live.unwatch?.()
  circles.peek().delete(live.id)
  await save(live.id, null)
  await save(id, kept)
  const moving = await follow(id, kept)
  const content = kept.place && await seedOf(moving)
  if (content) bindingOf(kept).hold(moving.held, /** @type {any} */ (content))
  const members = circle.membersOf(live.state).filter((one) => !leaving.includes(one.fp) && one.fp !== live.me).map(({ fp, key: theirs, name, role, colour, how, mailbox }) => ({ fp, key: theirs, name, role, colour, how, mailbox }))
  const begun = await post(moving, 'begin', { key: person.public, name: await nameOf(), kind: kept.kind, links: next.links, ownerHash: kept.ownerHash, mailbox: person.mailbox, members })
  if (content) await post(moving, 'seed', { members: [encode(begun)], content }, { seed: true })
  return moving
}

/** Another member's Jean asked something, which they let it answer or not (D226, D734). @param {Live} live @param {string} to @param {string} text */
export const ask = (live, to, text) => post(live, 'ask', { to, text })

/** Leaves, or, for its owner, stops working together: everyone keeps their copy. @param {Live} live */
export async function stop(live) {
  if (live.kept.ownerToken) await journal.end(whereOf(live), live.kept.ownerToken, 'delete').catch(() => {})
  else await post(live, 'leave', {}).catch(() => {})
  await ended(live, 'stopped')
}

/** That this person is here, for whoever has the thing open: a fleeting message, never kept, sent while they're in and may write. @param {Live} live */
export async function here(live) {
  if (!live.state.members[live.me] || !live.kept.write) return
  const at = { id: live.id, epoch: live.kept.epoch, key: decode(live.kept.keys[live.kept.epoch]) }
  journal.say(whereOf(live), await circle.sealChange(at, (await me()).key, { member: live.me, device: app.deviceId, n: 0, kind: 'here', body: {} }))
}

/** Who is here: those who said so in the last 45 seconds. @param {Live} live */
export const hereNow = (live) => new Set([...live.here].filter(([, at]) => Date.now() - at < 45_000).map(([fp]) => fp))

/** The circle a collection is in here, if any. @param {string} folder */
export const circleOf = (folder) => [...circles.value.values()].find((live) => live.kept.place?.folder === folder && live.kept.place.dir === app.projectDir) ?? null
/** The circle a file is in, by its path, as a task's is. @param {string} path */
export const circleAt = (path) => [...circles.value.values()].find((live) => live.kept.place && `${live.kept.place.dir}/${live.kept.place.folder}` === path) ?? null
/** A member's name in any circle followed here: the room's line over another's turn (ui/chat.js). @param {string} fp */
export const memberName = (fp) => [...circles.peek().values()].map((live) => nameIn(live, fp)).find(Boolean) ?? ''

/** What Sync and the store leave out of a circle's thing: the thing, or a project's folders that go (caps/sync/mirror.js). @param {Kept} kept */
export const apartOf = ({ kind, place }) => (place ? (kind === 'project' ? project.FOLDERS : ['']).map((one) => `${place.dir}/${place.folder}${one && `/${one}`}`) : [])
/** Every circle kept here. */
export const all = async () => Object.entries(await secretsWhere(app.fs, (id) => id.startsWith('circle:'))).map(([id, text]) => /** @type {[string, Kept]} */ ([id.slice(7), JSON.parse(text)]))
/** This person's key, signing their invitations. */
export const key = async () => (await me()).key
