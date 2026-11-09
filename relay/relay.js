// The relay (D45 · D226): mailboxes for messages sealed between people's devices, which it can't read.
// Whoever serves Jean runs one, or none, and Jean names it in settings or policy (`urls.relay`). A
// mailbox is named by the token that opens it, as the share host names a share (D361): its id is the
// token's SHA-256's first 16 bytes, so the relay holds no key and no name. It keeps each change's
// address, as French law asks of hosts, sealed by the store, and nothing about who reads. What a mailbox
// takes is counted for each network that sends, so that one sender, a stolen device knowing every
// mailbox, can't fill it for the others: each message keeps 24 bits of a hash of its mailbox and network.
// The mailbox's own ceiling, a few networks' worth, holds only against a network at or past its fair share;
// one under it takes the room of the oldest message of the network furthest past its own, if any is.
//
//   GET    /                    what it keeps: { format: 1, message, days, store?, journals?, issuers? }, store its { quota, part, devices } where
//                               it keeps stores, journals their { change, part, days } where it keeps them, issuers those whose people it lists
//   PUT    /v1/m/<id>           opens a mailbox: Authorization: Bearer <token>, whose SHA-256 the id is the start of;
//                               { "once": true } as its body takes one message, then refuses (409)
//   POST   /v1/m/<id>           leaves a sealed message in an open mailbox, from anyone: { seq }
//   GET    /v1/m/<id>?after=<seq>&wait=<seconds>
//                               with the token: what came after seq, each small one whole, waiting up to 25 seconds
//                               for one; what is at or before seq has been read, and goes:
//                               { messages: [{ seq, at, size, body? }], now, next }, now the relay's clock, next the next
//                               message's number; a seq at or above it, a reader's from before a rollback, reads from the start
//   GET    /v1/m/<id>/<seq>     with the token: a large message's bytes
//   DELETE /v1/m/<id>           with the token: the mailbox and all it holds
//   …      /v1/s/<sid>…         a person's store, where its configuration has `stores` (store.js)
//   …      /v1/j/<id>…          what people work on together, where its configuration has `journals` (journal.js)
//   …      /v1/people…          the organisation's people, where its configuration has `issuers` (colleagues.js)
//
// Its configuration, a JSON object in RELAY_CONFIG:
//   origins  the Jeans that use it, e.g. ["https://jean.is", "http://127.0.0.1:24601"]
//   limits   any of LIMITS below, to change it
//   stores   any of store.js's STORE, {} for them all, to keep stores: none are kept without it
//   journals any of journal.js's JOURNAL, {} for them all, to keep journals: none are kept without it
//   issuers  the organisation's sign-ins whose people it lists (colleagues.js): none are listed without it
//
// Web-standard (fetch, Request, Response, Web Crypto): what it keeps goes through a store, a folder on Node (serve.js).
import { base64url, hashOf, idOf, networkOf, within } from '../host/host.js'
import { stores, STORE } from './store.js'
import { journals, JOURNAL } from './journal.js'
import { colleagues } from './colleagues.js'

export const LIMITS = Object.freeze({
  /** A message's bytes. */
  message: 25_000_000,
  /** A message small enough to come whole in a read. */
  inline: 65_536,
  /** Messages a mailbox holds from one network, and their bytes. */
  messages: 500,
  bytes: 64_000_000,
  /** Days a message stays, and days a mailbox nobody opens or reads stays. */
  days: 7,
  idle: 90,
  /** Messages a mailbox takes from one network in an hour, mailboxes a network opens in an hour, bytes a network sends in a day. */
  writes: 200,
  opens: 60,
  sent: 256_000_000,
  /** Reads waiting on one mailbox at once: a person's devices, each its own; and how many networks' share of messages a mailbox takes in all. */
  waits: 4,
  networks: 4,
  /** Bytes of disk under which no message is taken. */
  free: 1_000_000_000,
})
/** Seconds a read waits at most. */
const WAIT = 25
const HOUR = 3_600_000
const DAY = 86_400_000
const PATH = /^\/v1\/m\/([\w-]{22})(?:\/(\d{1,9}))?$/

/**
 * A mailbox as the store keeps it: its token's hash, whether it takes one message (and took it), the next message's number,
 * where its messages are, and when it was last opened or read.
 * @typedef {{ format: 1, token: string, once?: true, used?: true, next: number, messages: Entry[], touched: number }} Box
 * @typedef {{ seq: number, at: number, size: number, net?: string }} Entry
 * @typedef {{ box(id: string): Promise<Box | null>, save(id: string, box: Box): Promise<void>, add(id: string, seq: number, body: Uint8Array): Promise<void>,
 *   read(id: string, seq: number): Promise<Uint8Array | null>, drop(id: string, seqs: number[]): Promise<void>, remove(id: string): Promise<void>,
 *   record(text: string): Promise<void>, free?(): Promise<number> } & Partial<import('./store.js').Backend> & Partial<import('./journal.js').Backend> & Partial<import('./colleagues.js').Backend>} Store
 * @typedef {{ origins?: string[], limits?: Partial<typeof LIMITS>, stores?: Partial<typeof STORE>, journals?: Partial<typeof JOURNAL>, issuers?: import('./colleagues.js').Issuer[], store?: Store, now?: () => number,
 *   fetch?: typeof fetch }} Config  fetch: what reads an issuer's keys
 * @typedef {import('../host/host.js').Client} Client
 */

/**
 * @param {Config} config
 * @returns {((request: Request, client?: Client) => Promise<Response>) & { tidy(id: string, at: number): Promise<void>, tidyStore?(sid: string, at: number): Promise<void>, stores?(): Promise<string[]>,
 *   tidyJournal?(id: string, at: number): Promise<void>, journalIds?(): Promise<string[]>, tidyPeople?(at: number): Promise<void> }}
 */
export function relay(config) {
  const { origins = [], store } = config
  const limits = { ...LIMITS, ...config.limits }
  const now = config.now ?? Date.now
  /** What each network did: mailboxes opened this hour, bytes sent today. @type {Map<string, { hour: number, opens: number, day: number, sent: number }>} */
  const seen = new Map()
  /** Messages each mailbox took this hour. @type {Map<string, { from: number, count: number }>} */
  const taken = new Map()
  /** Reads waiting on each mailbox, each ended by calling it. @type {Map<string, Set<() => void>>} */
  const waiting = new Map()
  let swept = 0
  /** Each mailbox's changes, one at a time. @type {Map<string, Promise<unknown>>} */
  const turns = new Map()
  /** @template T @param {string} id @param {() => Promise<T>} task @returns {Promise<T>} */
  const inTurn = (id, task) => {
    const turn = (turns.get(id) ?? Promise.resolve()).then(task, task)
    turns.set(id, turn)
    const over = () => { if (turns.get(id) === turn) turns.delete(id) }
    turn.then(over, over)
    return turn
  }
  /** Every read waiting on a mailbox, answered. @param {string} id */
  const wake = (id) => { for (const done of waiting.get(id) ?? []) done() }
  /** A mailbox, without the messages past their days. @param {string} id @param {number} at */
  const live = async (id, at) => {
    const box = await store?.box(id) ?? null
    const old = box?.messages.filter((entry) => at - entry.at > limits.days * DAY) ?? []
    if (box && old.length) {
      await store?.drop(id, old.map((entry) => entry.seq))
      box.messages = box.messages.filter((entry) => !old.includes(entry))
      await store?.save(id, box)
    }
    return box
  }

  /** A mailbox tidied in its turn, as the daily sweep asks: its messages past their days dropped, or all of it, nobody opened or read for its idle days. @param {string} id @param {number} at */
  const tidy = (id, at) => inTurn(id, async () => { const box = await live(id, at); if (!box || at - box.touched > limits.idle * DAY) await store?.remove(id) })
  // People's stores, where the configuration asks for them and the store can keep them.
  const shelves = { ...STORE, ...config.stores }
  const kept = config.stores && store?.store ? stores({ backend: /** @type {import('./store.js').Backend} */ (store), limits: shelves, now, inTurn,
    record: (text) => store.record(text), free: async () => await store.free?.() ?? Infinity }) : null
  // What people work on together, where the configuration asks for journals and the store can keep them.
  const pages = { ...JOURNAL, ...config.journals }
  const book = config.journals && store?.journal ? journals({ backend: /** @type {import('./journal.js').Backend} */ (store), limits: pages, now, inTurn,
    record: (text) => store.record(text), free: async () => await store.free?.() ?? Infinity }) : null
  // The organisation's people, where the configuration names its sign-ins.
  const listed = config.issuers?.length && store?.entries ? colleagues({ backend: /** @type {import('./colleagues.js').Backend} */ (store), issuers: config.issuers, fetch: config.fetch ?? fetch, now, inTurn,
    record: (text) => store.record(text), owns: async (id, hash) => ((box) => (box ? box.token === hash : null))(await store.box(id)) }) : null

  return Object.assign(async (/** @type {Request} */ request, /** @type {Client} */ client = { address: '', port: 0 }) => {
    const url = new URL(request.url)
    const origin = request.headers.get('origin') ?? ''
    const ours = origins.includes(origin)
    const cors = new Headers({ vary: 'origin', 'access-control-allow-origin': ours ? origin : '*', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' })
    const answer = (/** @type {number} */ status, /** @type {object} */ body = {}) => Response.json(body, { status, headers: cors })
    if (request.method === 'OPTIONS') {
      cors.set('access-control-allow-methods', 'GET, PUT, POST, DELETE')
      cors.set('access-control-allow-headers', 'authorization, content-type, if-match, if-none-match, store-proof, store-part, store-object, journal-write, journal-seed, journal-parts')
      // A poll every 25 seconds, never with a preflight before each.
      cors.set('access-control-max-age', '7200')
      return new Response(null, { status: 204, headers: cors })
    }
    const reading = request.method === 'GET' || request.method === 'HEAD'
    if (url.pathname === '/' && reading) {
      return answer(200, { format: 1, message: limits.message, days: limits.days, ...(kept && { store: { quota: shelves.quota, part: shelves.part, devices: shelves.devices } }),
        ...(book && { journals: { change: pages.change, part: pages.part, days: pages.days } }), ...(listed && { issuers: listed.issuers }) })
    }
    const [, id, seq] = PATH.exec(url.pathname) ?? []
    const shelf = kept && url.pathname.startsWith('/v1/s/')
    const page = book && url.pathname.startsWith('/v1/j/')
    const people = listed && listed.handles(url.pathname)
    if (!id && !shelf && !page && !people) return answer(404, { error: 'Nothing is here.' })
    // Only the Jeans it serves, which a browser always names.
    if (!ours) return answer(403, { error: 'This relay does not serve this origin.' })
    if (shelf) return kept.handle(request, client, { network: networkOf(client.address), answer, cors })
    if (page) return book.handle(request, client, { network: networkOf(client.address), answer, cors })
    if (people) return listed.handle(request, client, { answer })

    const at = now()
    const network = networkOf(client.address)
    // One count per network, changed in place, so that a request from it meanwhile counts with this one, never over it.
    const mine = seen.get(network) ?? { hour: at, opens: 0, day: at, sent: 0 }
    if (at - mine.hour >= HOUR) Object.assign(mine, { hour: at, opens: 0 })
    if (at - mine.day >= DAY) Object.assign(mine, { day: at, sent: 0 })
    // Grown long, what is past its day goes, once a minute at most; far past that, all goes.
    if (seen.size > 100_000 && at - swept > 60_000) {
      swept = at
      for (const [other, one] of seen) if (at - one.day >= DAY) seen.delete(other)
      for (const [other, one] of taken) if (at - one.from >= HOUR) taken.delete(other)
      if (seen.size > 1_000_000) seen.clear()
    }
    seen.set(network, mine)
    const token = /^Bearer ([\w-]{43})$/.exec(request.headers.get('authorization') ?? '')?.[1]
    const owner = Boolean(token) && await idOf(/** @type {string} */ (token)) === id
    const hash = token ? await hashOf(token) : ''
    /** A change, with where it came from, as French law asks of a host; never a read. @param {'open' | 'message' | 'delete'} operation */
    const record = (operation) => store?.record(JSON.stringify({ at: new Date(at).toISOString(), address: client.address, port: client.port, protocol: client.protocol ?? '', id, operation }))

    if (request.method === 'POST' && !seq) {
      const body = await within(request, limits.message)
      if (!body) return answer(413, { error: 'This message is too large.' })
      if (!body.length) return answer(400, { error: 'This message is empty.' })
      if (mine.sent + body.length > limits.sent) return answer(429, { error: 'Too much sent today. Try again later.' })
      // Counted before anything waits, and given back unless it is taken, whatever stops it.
      mine.sent += body.length
      let status = 0
      try {
      const done = await (async () => {
      if ((await store?.free?.() ?? Infinity) < limits.free) return answer(507, { error: 'The relay is full. Try again later.' })
      const net = (await hashOf(`${id} ${network}`)).slice(0, 4)
      return inTurn(id, async () => {
        const box = await live(id, at)
        if (!box) return answer(404, { error: 'No mailbox is open here.' })
        if (box.once && box.used) return answer(409, { error: 'This mailbox took its message.' })
        // This network's share of the mailbox, and the mailbox's own, a few networks' worth, which holds only against a network at or past
        // its fair share of it: one under it takes room from the network holding the most, its oldest first, so that a few never shut out another.
        const [hour, all] = [`${id} ${net}`, id].map((key) => ((one) => (one && at - one.from < HOUR ? one : { from: at, count: 0 }))(taken.get(key)))
        if (hour.count >= limits.writes || (all.count >= limits.writes * limits.networks && hour.count >= limits.writes / limits.networks)) return answer(429, { error: 'Too many messages. Try again later.' })
        const bytes = (/** @type {Entry[]} */ list) => list.reduce((sum, entry) => sum + entry.size, body.length)
        const full = (/** @type {Entry[]} */ list, /** @type {number} */ times) => list.length >= limits.messages * times || bytes(list) > limits.bytes * times
        const ours = box.messages.filter((entry) => entry.net === net)
        if (full(ours, 1)) return answer(507, { error: 'This mailbox is full.' })
        while (full(box.messages, limits.networks)) {
          if (ours.length >= limits.messages / limits.networks || bytes(ours) > limits.bytes / limits.networks) return answer(507, { error: 'This mailbox is full.' })
          /** @type {Map<string | undefined, Entry[]>} */
          const held = new Map()
          for (const entry of box.messages) held.set(entry.net, [...held.get(entry.net) ?? [], entry])
          // Only from a network past its share, the furthest over first: what one within its share was told was taken stays.
          const over = (/** @type {Entry[]} */ list) => Math.max(list.length / (limits.messages / limits.networks), (bytes(list) - body.length) / (limits.bytes / limits.networks))
          const [most] = [...held.values()].filter((list) => over(list) > 1).sort((a, b) => over(b) - over(a))
          if (!most) return answer(507, { error: 'This mailbox is full.' })
          await store?.drop(id, [most[0].seq])
          box.messages = box.messages.filter((entry) => entry !== most[0])
        }
        await store?.add(id, box.next, body)
        box.messages.push({ seq: box.next, at, size: body.length, net })
        const sent = box.next
        box.next += 1
        if (box.once) box.used = true
        await store?.save(id, box)
        taken.set(`${id} ${net}`, { from: hour.from, count: hour.count + 1 })
        taken.set(id, { from: all.from, count: all.count + 1 })
        await record('message')
        wake(id)
        return answer(201, { seq: sent })
      })
      })()
      status = done.status
      return done
      } finally { if (status !== 201) mine.sent -= body.length }
    }

    // The rest is the mailbox's own, with its token.
    if (!token) return answer(401, { error: 'This mailbox’s token is needed.' })
    if (!owner) return answer(403, { error: 'This mailbox is someone else’s.' })

    if (request.method === 'PUT' && !seq) {
      /** @type {{ once?: unknown }} */
      let asked = {}
      try { asked = JSON.parse(new TextDecoder().decode(await within(request, 1_000) ?? new Uint8Array())) } catch {}
      return inTurn(id, async () => {
        const held = await store?.box(id)
        if (held && held.token !== hash) return answer(403, { error: 'This mailbox is someone else’s.' })
        if (held) {
          await store?.save(id, { ...held, touched: at })
          return answer(200, {})
        }
        // Only a new mailbox counts: a device opens its own again at each start, many behind one office's address.
        if (++mine.opens > limits.opens) return answer(429, { error: 'Too many mailboxes. Try again later.' })
        await store?.save(id, { format: 1, token: hash, ...(asked.once === true && { once: /** @type {const} */ (true) }), next: 1, messages: [], touched: at })
        await record('open')
        return answer(201, {})
      })
    }

    if (request.method === 'DELETE' && !seq) {
      return inTurn(id, async () => {
        const held = await store?.box(id)
        if (held && held.token !== hash) return answer(403, { error: 'This mailbox is someone else’s.' })
        if (held) {
          await store?.remove(id)
          await record('delete')
          wake(id)
        }
        return answer(200, {})
      })
    }

    if (!reading) return answer(405, { error: 'Not here.' })
    if (seq) {
      // Outside the mailbox's turn, what is past its days is passed over, never saved: that is for the turn's read, or the sweep.
      const box = await store?.box(id)
      if (box && box.token !== hash) return answer(403, { error: 'This mailbox is someone else’s.' })
      const listed = box?.messages.some((entry) => entry.seq === Number(seq) && at - entry.at <= limits.days * DAY)
      const body = listed ? await store?.read(id, Number(seq)) : null
      // Listed, its body gone: dropped from the mailbox in its turn, as a read does, so that it is never handed out again.
      if (listed && !body) await inTurn(id, async () => { const held = await store?.box(id); if (held) await store?.save(id, { ...held, messages: held.messages.filter((entry) => entry.seq !== Number(seq)) }) })
      if (!body) return answer(404, { error: 'This message is gone.' })
      cors.set('content-type', 'application/octet-stream')
      return new Response(/** @type {BodyInit} */ (body), { headers: cors })
    }
    let after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0))
    const wait = Math.min(WAIT, Math.max(0, Number(url.searchParams.get('wait')) || 0))
    // What was read goes.
    const opened = await inTurn(id, async () => {
      const box = await live(id, at)
      if (!box || box.token !== hash) return box
      if (after >= box.next) after = 0
      const read = box.messages.filter((entry) => entry.seq <= after)
      if (read.length) await store?.drop(id, read.map((entry) => entry.seq))
      const kept = { ...box, messages: box.messages.filter((entry) => entry.seq > after), touched: at }
      await store?.save(id, kept)
      return kept
    })
    if (!opened) return answer(404, { error: 'No mailbox is open here.' })
    if (opened.token !== hash) return answer(403, { error: 'This mailbox is someone else’s.' })
    /** What a mailbox holds past `after`, each small one whole; an entry whose body is gone (an older sweep) is dropped from it. @param {Box} box */
    const handed = async (box) => {
      const out = await Promise.all(box.messages.filter((entry) => entry.seq > after).map(async (entry) => {
        if (entry.size > limits.inline) return { seq: entry.seq, at: entry.at, size: entry.size }
        const body = await store?.read(id, entry.seq)
        return body ? { seq: entry.seq, at: entry.at, size: entry.size, body: base64url(body) } : entry.seq
      }))
      const gone = out.filter((one) => typeof one === 'number')
      if (gone.length) await inTurn(id, async () => { const held = await store?.box(id); if (held) await store?.save(id, { ...held, messages: held.messages.filter((entry) => !gone.includes(entry.seq)) }) })
      return out.filter((one) => typeof one !== 'number')
    }
    let [box, messages] = [opened, await handed(opened)]
    // Nothing to hand out: the read waits for what comes, outside the mailbox's turn, so others go on.
    if (!messages.length && wait > 0) {
      await new Promise((resolve) => {
        // One device too many: the oldest wait ends, empty, as its device has likely gone, before this one takes its place.
        if ((waiting.get(id)?.size ?? 0) >= limits.waits) [...waiting.get(id) ?? []][0]()
        const set = waiting.get(id) ?? new Set()
        waiting.set(id, set)
        const done = () => {
          clearTimeout(timer)
          set.delete(done)
          if (!set.size && waiting.get(id) === set) waiting.delete(id)
          resolve(undefined)
        }
        const timer = setTimeout(done, wait * 1000)
        set.add(done)
      })
      box = await store?.box(id) ?? { ...box, messages: [] }
      messages = await handed(box)
    }
    return answer(200, { messages, now: now(), next: box.next })
  }, { tidy, ...(kept && { tidyStore: kept.tidy, stores: kept.ids }), ...(book && { tidyJournal: book.tidy, journalIds: book.ids }), ...(listed && { tidyPeople: listed.tidy }) })
}
