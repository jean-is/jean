// The relay (D45 · D226): mailboxes for messages sealed between people's devices, which it can't read.
// Whoever serves Jean runs one, or none, and Jean names it in settings or policy (`urls.relay`). A
// mailbox is named by the token that opens it, as the share host names a share (D361): its id is the
// token's SHA-256's first 16 bytes, so the relay holds no key and no name. It keeps each change's
// address, as French law asks of hosts, sealed by the store, and nothing about who reads.
//
//   GET    /                    what it keeps: { format: 1, message, days }
//   PUT    /v1/m/<id>           opens a mailbox: Authorization: Bearer <token>, whose SHA-256 the id is the start of;
//                               { "once": true } as its body takes one message, then refuses (409)
//   POST   /v1/m/<id>           leaves a sealed message in an open mailbox, from anyone: { seq }
//   GET    /v1/m/<id>?after=<seq>&wait=<seconds>
//                               with the token: what came after seq, each small one whole, waiting up to 25 seconds
//                               for one; what is at or before seq has been read, and goes:
//                               { messages: [{ seq, at, size, body? }], now }, now the relay's clock
//   GET    /v1/m/<id>/<seq>     with the token: a large message's bytes
//   DELETE /v1/m/<id>           with the token: the mailbox and all it holds
//
// Its configuration, a JSON object in RELAY_CONFIG:
//   origins  the Jeans that use it, e.g. ["https://jean.is", "http://127.0.0.1:24601"]
//   limits   any of LIMITS below, to change it
//
// Web-standard (fetch, Request, Response, Web Crypto): what it keeps goes through a store, a folder on Node (serve.js).
import { base64url, hashOf, idOf, networkOf, within } from '../host/host.js'

export const LIMITS = Object.freeze({
  /** A message's bytes. */
  message: 25_000_000,
  /** A message small enough to come whole in a read. */
  inline: 65_536,
  /** Messages a mailbox holds, and their bytes. */
  messages: 500,
  bytes: 64_000_000,
  /** Days a message stays, and days a mailbox nobody opens or reads stays. */
  days: 7,
  idle: 90,
  /** Messages a mailbox takes in an hour, mailboxes a network opens in an hour, bytes a network sends in a day. */
  writes: 200,
  opens: 60,
  sent: 256_000_000,
  /** Reads waiting on one mailbox at once: a person's devices, each its own. */
  waits: 4,
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
 * @typedef {{ seq: number, at: number, size: number }} Entry
 * @typedef {{ box(id: string): Promise<Box | null>, save(id: string, box: Box): Promise<void>, add(id: string, seq: number, body: Uint8Array): Promise<void>,
 *   read(id: string, seq: number): Promise<Uint8Array | null>, drop(id: string, seqs: number[]): Promise<void>, remove(id: string): Promise<void>,
 *   record(text: string): Promise<void>, free?(): Promise<number> }} Store
 * @typedef {{ origins?: string[], limits?: Partial<typeof LIMITS>, store?: Store, now?: () => number }} Config
 * @typedef {import('../host/host.js').Client} Client
 */

/** @param {Config} config @returns {(request: Request, client?: Client) => Promise<Response>} */
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

  return async (request, client = { address: '', port: 0 }) => {
    const url = new URL(request.url)
    const origin = request.headers.get('origin') ?? ''
    const ours = origins.includes(origin)
    const cors = new Headers({ vary: 'origin', 'access-control-allow-origin': ours ? origin : '*', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' })
    const answer = (/** @type {number} */ status, /** @type {object} */ body = {}) => Response.json(body, { status, headers: cors })
    if (request.method === 'OPTIONS') {
      cors.set('access-control-allow-methods', 'GET, PUT, POST, DELETE')
      cors.set('access-control-allow-headers', 'authorization, content-type')
      // A poll every 25 seconds, never with a preflight before each.
      cors.set('access-control-max-age', '7200')
      return new Response(null, { status: 204, headers: cors })
    }
    const reading = request.method === 'GET' || request.method === 'HEAD'
    if (url.pathname === '/' && reading) return answer(200, { format: 1, message: limits.message, days: limits.days })
    const [, id, seq] = PATH.exec(url.pathname) ?? []
    if (!id) return answer(404, { error: 'Nothing is here.' })
    // Only the Jeans it serves, which a browser always names.
    if (!ours) return answer(403, { error: 'This relay does not serve this origin.' })

    const at = now()
    const network = networkOf(client.address)
    const was = seen.get(network)
    const mine = { hour: at, opens: 0, day: at, sent: 0, ...was }
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
      if ((await store?.free?.() ?? Infinity) < limits.free) return answer(507, { error: 'The relay is full. Try again later.' })
      return inTurn(id, async () => {
        const box = await live(id, at)
        if (!box) return answer(404, { error: 'No mailbox is open here.' })
        if (box.once && box.used) return answer(409, { error: 'This mailbox took its message.' })
        const hour = taken.get(id)
        const count = hour && at - hour.from < HOUR ? hour : { from: at, count: 0 }
        if (count.count >= limits.writes) return answer(429, { error: 'Too many messages. Try again later.' })
        const held = box.messages.reduce((sum, entry) => sum + entry.size, 0)
        if (box.messages.length >= limits.messages || held + body.length > limits.bytes) return answer(507, { error: 'This mailbox is full.' })
        await store?.add(id, box.next, body)
        box.messages.push({ seq: box.next, at, size: body.length })
        const sent = box.next
        box.next += 1
        if (box.once) box.used = true
        await store?.save(id, box)
        mine.sent += body.length
        taken.set(id, { from: count.from, count: count.count + 1 })
        await record('message')
        wake(id)
        return answer(201, { seq: sent })
      })
    }

    // The rest is the mailbox's own, with its token.
    if (!token) return answer(401, { error: 'This mailbox’s token is needed.' })
    if (!owner) return answer(403, { error: 'This mailbox is someone else’s.' })

    if (request.method === 'PUT' && !seq) {
      if (++mine.opens > limits.opens) return answer(429, { error: 'Too many mailboxes. Try again later.' })
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
      const box = await live(id, at)
      if (box && box.token !== hash) return answer(403, { error: 'This mailbox is someone else’s.' })
      const body = box?.messages.some((entry) => entry.seq === Number(seq)) ? await store?.read(id, Number(seq)) : null
      if (!body) return answer(404, { error: 'This message is gone.' })
      cors.set('content-type', 'application/octet-stream')
      return new Response(/** @type {BodyInit} */ (body), { headers: cors })
    }
    const after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0))
    const wait = Math.min(WAIT, Math.max(0, Number(url.searchParams.get('wait')) || 0))
    // What was read goes; then, with nothing new, the read waits outside the mailbox's turn, so others go on.
    const opened = await inTurn(id, async () => {
      const box = await live(id, at)
      if (!box || box.token !== hash) return box
      const read = box.messages.filter((entry) => entry.seq <= after)
      if (read.length) await store?.drop(id, read.map((entry) => entry.seq))
      const kept = { ...box, messages: box.messages.filter((entry) => entry.seq > after), touched: at }
      await store?.save(id, kept)
      return kept
    })
    if (!opened) return answer(404, { error: 'No mailbox is open here.' })
    if (opened.token !== hash) return answer(403, { error: 'This mailbox is someone else’s.' })
    let box = opened
    if (!box.messages.length && wait > 0) {
      await new Promise((resolve) => {
        const set = waiting.get(id) ?? new Set()
        waiting.set(id, set)
        // One device too many: the oldest wait ends, empty, as its device has likely gone.
        if (set.size >= limits.waits) [...set][0]()
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
    }
    const messages = (await Promise.all(box.messages.filter((entry) => entry.seq > after).map(async (entry) => {
      if (entry.size > limits.inline) return { seq: entry.seq, at: entry.at, size: entry.size }
      const body = await store?.read(id, entry.seq)
      return body && { seq: entry.seq, at: entry.at, size: entry.size, body: base64url(body) }
    }))).filter(Boolean)
    return answer(200, { messages, now: now() })
  }
}
