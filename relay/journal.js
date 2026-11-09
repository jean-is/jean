// The relay's journals (D733): what people work on together, a task, a document or a collection, as an ordered list of changes
// sealed on their devices, which the relay numbers and can neither read nor name. Each member keeps their own copy; a journal only
// keeps the copies in step, and goes 7 days after its last change. Three tokens: the read token, whose SHA-256's first 16 bytes
// are the journal's id, as a mailbox's are; the write token and the owner token, whose SHA-256s it keeps. A link to view carries
// the read token alone, a link to edit the write token too, and the owner token never leaves its owner's devices. A tombstone,
// kept 90 days, says what became of a journal that expired, was deleted or moved, so that only its own write token opens it again,
// and nobody a deleted or moved one. What it records of each write, sealed as a mailbox's are, is once per journal, address and
// hour; never a read. Changes are kept 7 days, or until the journal holds its bytes; past that, what came before the newest seed
// ten minutes old goes, with the parts only those changes named, so that a newcomer always has a seed and what came after it.
//
//   PUT    /v1/j/<id>                   creates it, or opens it again once expired: Authorization: Bearer <read>, Journal-Write: <write>,
//                                       { owner } its token's SHA-256. 201 made, 200 already open with that write token, 403 under
//                                       another, 410 deleted or moved
//   POST   /v1/j/<id>                   Authorization: Write <write>: a change of at most `change` bytes, { seq, at }; Journal-Seed: 1
//                                       marks a seed, Journal-Parts the parts it names, by their SHA-256, comma-separated
//   PUT    /v1/j/<id>/p/<sha256>        Write: a sealed part of at most `part` bytes, named by its SHA-256
//   GET    /v1/j/<id>/p/<sha256>        Bearer <read>: a part's bytes
//   GET    /v1/j/<id>?after=<seq>       Bearer <read>: NDJSON, { now, next } first, then each change after seq, { seq, at, body, seed?,
//                                       parts? }, then each change and fleeting message as it comes, { fleeting, at }, and { now }
//                                       every `beat` seconds; it ends after `stream` seconds, or with { deleted }, { moved } or
//                                       { expired }. A seq at or past the next reads from the start
//   GET    /v1/j/<id>?after=<seq>&wait=<seconds>
//                                       the same as one long poll, for networks whose proxies hold a stream back: { changes, now,
//                                       next, moved? }, waiting up to 25 seconds for one
//   POST   /v1/j/<id>/fleeting          Write: at most `fleeting` bytes, passed to the open streams, never kept: 202
//   DELETE /v1/j/<id>                   Authorization: Owner <owner>: all it holds, a tombstone left
//   POST   /v1/j/<id>/moved             Owner: posts refused from then on, its last change, the owner's `moved`, kept readable
//
// Web-standard: what it keeps goes through a backend, a folder on Node (serve.js).
import { base64url, hashOf, idOf, within } from '../host/host.js'

export const JOURNAL = Object.freeze({
  /** A change's bytes, a part's, a fleeting message's. */
  change: 65_536,
  part: 4_194_304,
  fleeting: 8_192,
  /** Bytes a journal holds, its changes and parts. */
  bytes: 64_000_000,
  /** Days a journal stays after its last change, and every change stays; days a tombstone stays; minutes a seed waits before what came before it may go. */
  days: 7,
  tombstones: 90,
  settle: 10,
  /** Changes a journal takes in a minute; fleeting messages it passes on in a second, and from one network. */
  perMinute: 600,
  fleetingPerSecond: 30,
  fleetingPerNetwork: 10,
  /** Streams open on one journal, and from one network; seconds a stream lasts, between its clock's lines, and a long poll waits at most. */
  streams: 32,
  streamsPerNetwork: 4,
  stream: 300,
  beat: 20,
  wait: 25,
  /** Journals a network opens in an hour; bytes it sends in a day; days a part no change names stays. */
  opens: 60,
  sent: 512_000_000,
  orphans: 1,
  /** Bytes of disk under which no journal takes more: above the mailboxes' floor, so that they go on. */
  free: 2_000_000_000,
})
const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const PATH = /^\/v1\/j\/([\w-]{22})(?:\/(?:p\/([\w-]{43})|(fleeting|moved)))?$/
const HASH = /^[\w-]{43}$/
/** Parts a change names at most. */
const PARTS = 1_024

/**
 * A journal as the backend keeps it: its write and owner tokens' hashes; open, expired, deleted or moved; the next change's number;
 * when its last change came; its changes and parts; the bytes they hold; when its tombstone goes.
 * @typedef {{ seq: number, at: number, size: number, seed?: true, parts?: string[] }} Entry
 * @typedef {{ format: 1, write: string, owner: string, state: 'open' | 'expired' | 'deleted' | 'moved', next: number, last: number, changes: Entry[],
 *   parts: Record<string, { size: number, at: number }>, bytes: number, until?: number }} Meta
 * @typedef {{ journal(id: string): Promise<Meta | null>, saveJournal(id: string, meta: Meta): Promise<void>, removeJournal(id: string): Promise<void>,
 *   journalIds(): Promise<string[]>, addChange(id: string, seq: number, bytes: Uint8Array): Promise<void>, change(id: string, seq: number): Promise<Uint8Array | null>,
 *   dropChange(id: string, seq: number): Promise<void>, addJournalPart(id: string, hash: string, bytes: Uint8Array): Promise<void>,
 *   journalPart(id: string, hash: string): Promise<Uint8Array | null>, dropJournalPart(id: string, hash: string): Promise<void> }} Backend
 * @typedef {{ network: string, push(line: Record<string, unknown>): void, end(line?: Record<string, unknown>): void }} Listener
 */

/**
 * @param {{ backend: Backend, limits: typeof JOURNAL, now: () => number, inTurn: <T>(key: string, task: () => Promise<T>) => Promise<T>,
 *   record: (text: string) => unknown, free: () => Promise<number> }} options
 */
export function journals({ backend, limits, now, inTurn, record, free }) {
  /** What each network did: journals opened this hour, bytes sent today. @type {Map<string, { hour: number, opens: number, day: number, sent: number }>} */
  const counts = new Map()
  /** Changes each journal took this minute; fleeting messages it passed on this second, in all and by network. */
  const minutes = /** @type {Map<string, { from: number, count: number }>} */ (new Map())
  const seconds = /** @type {Map<string, { second: number, count: number, networks: Map<string, number> }>} */ (new Map())
  /** Who has each journal open. @type {Map<string, Set<Listener>>} */
  const open = new Map()
  /** Writes already recorded this hour, by journal, address and kind. @type {Set<string>} */
  const noted = new Set()
  let hour = 0
  /** @param {string} id */
  const turn = (id) => `j:${id}`

  /** @param {string} network @param {number} at */
  const countOf = (network, at) => {
    if (counts.size > 100_000) for (const [other, one] of counts) if (at - one.day >= DAY) counts.delete(other)
    const one = counts.get(network) ?? { hour: at, opens: 0, day: at, sent: 0 }
    if (at - one.hour >= HOUR) Object.assign(one, { hour: at, opens: 0 })
    if (at - one.day >= DAY) Object.assign(one, { day: at, sent: 0 })
    counts.set(network, one)
    return one
  }
  /** A line for every open reader of a journal. @param {string} id @param {Record<string, unknown>} line */
  const tell = (id, line) => { for (const one of open.get(id) ?? []) one.push(line) }
  /** Every open reader told its last line, and ended. @param {string} id @param {Record<string, unknown>} line */
  const close = (id, line) => { for (const one of [...open.get(id) ?? []]) one.end(line) }
  /** A change as a reader gets it, or null when its body is gone. @param {string} id @param {Entry} entry */
  const lineOf = async (id, entry) => {
    const bytes = await backend.change(id, entry.seq)
    return bytes && { seq: entry.seq, at: entry.at, body: base64url(bytes), ...(entry.seed && { seed: true }), ...(entry.parts && { parts: entry.parts }) }
  }
  /** What a journal no longer holds, its bytes given back. @param {string} id @param {Meta} meta @param {Entry[]} gone */
  const forget = async (id, meta, gone) => {
    for (const entry of gone) {
      await backend.dropChange(id, entry.seq)
      meta.bytes -= entry.size
    }
    meta.changes = meta.changes.filter((entry) => !gone.includes(entry))
    const named = new Set(meta.changes.flatMap((entry) => entry.parts ?? []))
    for (const hash of new Set(gone.flatMap((entry) => entry.parts ?? []))) {
      if (named.has(hash) || !meta.parts[hash]) continue
      await backend.dropJournalPart(id, hash)
      meta.bytes -= meta.parts[hash].size
      delete meta.parts[hash]
    }
  }
  /**
   * What came before the newest seed ten minutes old goes: the changes past their days, or all of them when the journal is past its
   * bytes; true when any went. @param {string} id @param {Meta} meta @param {number} at @param {boolean} all
   */
  const trim = async (id, meta, at, all) => {
    const seed = meta.changes.findLast((entry) => entry.seed && at - entry.at >= limits.settle * MINUTE)
    const gone = seed ? meta.changes.filter((entry) => entry.seq < seed.seq && (all || at - entry.at > limits.days * DAY)) : []
    if (gone.length) await forget(id, meta, gone)
    return gone.length > 0
  }
  /** All a journal holds dropped, its tombstone left. @param {string} id @param {Meta} meta @param {'expired' | 'deleted'} state @param {number} at */
  const bury = async (id, meta, state, at) => {
    for (const entry of meta.changes) await backend.dropChange(id, entry.seq)
    for (const hash of Object.keys(meta.parts)) await backend.dropJournalPart(id, hash)
    await backend.saveJournal(id, { ...meta, state, changes: [], parts: {}, bytes: 0, until: at + limits.tombstones * DAY })
    close(id, { [state]: true })
  }

  /** @param {Request} request @param {import('../host/host.js').Client} client @param {{ network: string, answer: (status: number, body?: object) => Response, cors: Headers }} context */
  async function handle(request, client, { network, answer, cors }) {
    const url = new URL(request.url)
    const [, id, part, action] = PATH.exec(url.pathname) ?? []
    if (!id) return answer(404, { error: 'Nothing is here.' })
    const at = now()
    const [, scheme, token] = /^(Bearer|Write|Owner) ([\w-]{43})$/.exec(request.headers.get('authorization') ?? '') ?? []
    if (!token) return answer(401, { error: 'This journal’s token is needed.' })
    const hash = await hashOf(token)
    const mine = countOf(network, at)
    /** A write, with where it came from, once an hour for each journal, address and kind; never a read. @param {string} operation */
    const note = (operation) => {
      if (at - hour >= HOUR) { hour = at; noted.clear() }
      const key = `${id} ${client.address} ${operation}`
      if (noted.has(key)) return
      noted.add(key)
      return record(JSON.stringify({ at: new Date(at).toISOString(), address: client.address, port: client.port, protocol: client.protocol ?? '', journal: id, operation }))
    }
    /** Why a write can't go to this journal, if it can't. @param {Meta | null} meta */
    const shut = (meta) => {
      if (!meta) return answer(404, { error: 'No journal is here.' })
      if (meta.write !== hash) return answer(403, { error: 'This journal is someone else’s.' })
      if (meta.state === 'expired') return answer(404, { error: 'This journal expired.', expired: true })
      if (meta.state !== 'open') return answer(410, { error: 'This journal was stopped.', [meta.state]: true })
      return null
    }
    const reading = request.method === 'GET' || request.method === 'HEAD'
    if (reading && (scheme !== 'Bearer' || (await idOf(token)) !== id)) return answer(scheme === 'Bearer' ? 403 : 401, { error: 'Reading a journal takes its read token.' })

    // Created with its read token, which names it, and its write token, which alone opens it again.
    if (request.method === 'PUT' && !part) {
      const write = request.headers.get('journal-write') ?? ''
      if (scheme !== 'Bearer' || !HASH.test(write)) return answer(401, { error: 'Creating a journal takes its read and write tokens.' })
      if ((await idOf(token)) !== id) return answer(403, { error: 'This journal is someone else’s.' })
      const writing = await hashOf(write)
      /** @type {{ owner?: unknown } | null} */
      let asked = null
      try { asked = JSON.parse(new TextDecoder().decode(await within(request, 1_000) ?? new Uint8Array())) } catch {}
      return inTurn(turn(id), async () => {
        const meta = await backend.journal(id)
        if (meta && meta.write !== writing) return answer(403, { error: 'This journal is someone else’s.' })
        if (meta && (meta.state === 'deleted' || meta.state === 'moved')) return answer(410, { error: 'This journal was stopped.', [meta.state]: true })
        if (meta?.state === 'open') return answer(200, {})
        if (meta) {
          // Expired: open again under its own tokens, numbering on, so that no member's last number reads as a newer one.
          const { until: _, ...rest } = meta
          await backend.saveJournal(id, { ...rest, state: 'open', last: at, changes: [], parts: {}, bytes: 0 })
          await note('open')
          return answer(201, {})
        }
        if (typeof asked?.owner !== 'string' || !HASH.test(asked.owner)) return answer(400, { error: 'A journal names its owner token’s SHA-256.' })
        if (mine.opens >= limits.opens) return answer(429, { error: 'Too many journals. Try again later.' })
        if (await free() < limits.free) return answer(503, { error: 'The relay has no room for a journal. Try again later.' })
        await backend.saveJournal(id, { format: 1, write: writing, owner: asked.owner, state: 'open', next: 1, last: at, changes: [], parts: {}, bytes: 0 })
        mine.opens += 1
        await note('open')
        return answer(201, {})
      })
    }

    // The owner's alone: deleting it, or moving everyone else to the next journal.
    if ((request.method === 'DELETE' && !part && !action) || (request.method === 'POST' && action === 'moved')) {
      const moving = action === 'moved'
      return inTurn(turn(id), async () => {
        const meta = await backend.journal(id)
        if (!meta) return answer(404, { error: 'No journal is here.' })
        if (meta.owner !== hash) return answer(403, { error: 'Only its owner may.' })
        if (meta.state === (moving ? 'moved' : 'deleted')) return answer(200, {})
        if (moving) {
          if (meta.state !== 'open') return answer(meta.state === 'expired' ? 404 : 410, { error: 'This journal is not open.' })
          await forget(id, meta, meta.changes.slice(0, -1))
          await backend.saveJournal(id, { ...meta, state: 'moved', until: at + limits.tombstones * DAY })
          close(id, { moved: true })
        } else await bury(id, meta, 'deleted', at)
        await note(moving ? 'moved' : 'delete')
        return answer(200, {})
      })
    }

    if (request.method === 'POST' && action === 'fleeting') {
      if (scheme !== 'Write') return answer(401, { error: 'Saying something takes the write token.' })
      const body = await within(request, limits.fleeting)
      if (!body) return answer(413, { error: 'This is too long to pass on.' })
      if (!body.length) return answer(400, { error: 'This is empty.' })
      const refused = shut(await backend.journal(id))
      if (refused) return refused
      const second = Math.floor(at / 1_000)
      const window = ((one) => (one && one.second === second ? one : { second, count: 0, networks: new Map() }))(seconds.get(id))
      const theirs = window.networks.get(network) ?? 0
      if (theirs >= limits.fleetingPerNetwork || window.count >= limits.fleetingPerSecond) return answer(429, { error: 'Too much at once.' })
      window.count += 1
      window.networks.set(network, theirs + 1)
      seconds.set(id, window)
      if (seconds.size > 10_000) for (const [other, one] of seconds) if (one.second !== second) seconds.delete(other)
      tell(id, { fleeting: base64url(body), at })
      return answer(202, {})
    }

    // A part's bytes come before the journal's turn, checked against their name.
    if (request.method === 'PUT' && part) {
      if (scheme !== 'Write') return answer(401, { error: 'A part takes the write token.' })
      const bytes = await within(request, limits.part)
      if (!bytes) return answer(413, { error: 'This part is too large.' })
      if (base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes)))) !== part) return answer(400, { error: 'This part is not what its name says.' })
      if (mine.sent + bytes.length > limits.sent) return answer(429, { error: 'Too much sent today. Try again later.' })
      if (await free() < limits.free) return answer(507, { error: 'The relay is full. Try again later.' })
      return inTurn(turn(id), async () => {
        const meta = await backend.journal(id)
        const refused = shut(meta)
        if (refused || !meta) return /** @type {Response} */ (refused)
        if (meta.parts[part]) return answer(200, {})
        if (meta.bytes + bytes.length > limits.bytes && !((await trim(id, meta, at, true)) && meta.bytes + bytes.length <= limits.bytes)) {
          await backend.saveJournal(id, meta)
          return answer(507, { error: 'This journal is full.' })
        }
        await backend.addJournalPart(id, part, bytes)
        meta.parts[part] = { size: bytes.length, at }
        meta.bytes += bytes.length
        await backend.saveJournal(id, meta)
        mine.sent += bytes.length
        await note('part')
        return answer(201, {})
      })
    }

    if (request.method === 'POST' && !part && !action) {
      if (scheme !== 'Write') return answer(401, { error: 'A change takes the write token.' })
      const body = await within(request, limits.change)
      if (!body) return answer(413, { error: 'This change is too large.' })
      if (!body.length) return answer(400, { error: 'This change is empty.' })
      const seed = request.headers.get('journal-seed') === '1'
      const named = (request.headers.get('journal-parts') ?? '').split(',').map((one) => one.trim()).filter(Boolean)
      if (named.length > PARTS || !named.every((one) => HASH.test(one))) return answer(400, { error: 'A change names its parts by their SHA-256.' })
      if (await free() < limits.free) return answer(507, { error: 'The relay is full. Try again later.' })
      if (mine.sent + body.length > limits.sent) return answer(429, { error: 'Too much sent today. Try again later.' })
      return inTurn(turn(id), async () => {
        const meta = await backend.journal(id)
        const refused = shut(meta)
        if (refused || !meta) return /** @type {Response} */ (refused)
        if (named.some((one) => !meta.parts[one])) return answer(400, { error: 'A part this change names is not here.' })
        const minute = ((one) => (one && at - one.from < MINUTE ? one : { from: at, count: 0 }))(minutes.get(id))
        if (minute.count >= limits.perMinute) return answer(429, { error: 'Too many changes. Try again later.' })
        // Past its bytes, what came before the newest seed ten minutes old goes; still past them, it is full until a newer seed comes.
        if (meta.bytes + body.length > limits.bytes && !((await trim(id, meta, at, true)) && meta.bytes + body.length <= limits.bytes)) {
          await backend.saveJournal(id, meta)
          return answer(507, { error: 'This journal is full.' })
        }
        const seq = meta.next
        await backend.addChange(id, seq, body)
        /** @type {Entry} */
        const entry = { seq, at, size: body.length, ...(seed && { seed: /** @type {const} */ (true) }), ...(named.length && { parts: named }) }
        meta.changes.push(entry)
        Object.assign(meta, { next: seq + 1, last: at, bytes: meta.bytes + body.length })
        await backend.saveJournal(id, meta)
        mine.sent += body.length
        minutes.set(id, { from: minute.from, count: minute.count + 1 })
        if (minutes.size > 10_000) for (const [other, one] of minutes) if (at - one.from >= MINUTE) minutes.delete(other)
        await note('change')
        tell(id, { seq, at, body: base64url(body), ...(seed && { seed: true }), ...(named.length && { parts: named }) })
        return answer(201, { seq, at })
      })
    }

    if (!reading) return answer(405, { error: 'Not here.' })
    const meta = await backend.journal(id)
    if (!meta || meta.state === 'expired') return answer(404, { error: meta ? 'This journal expired.' : 'No journal is here.', ...(meta && { expired: true }) })
    if (meta.state === 'deleted') return answer(410, { error: 'This journal was stopped.', deleted: true })

    if (part) {
      const bytes = meta.parts[part] ? await backend.journalPart(id, part) : null
      if (!bytes) return answer(404, { error: 'This part is gone.' })
      cors.set('content-type', 'application/octet-stream')
      return new Response(/** @type {BodyInit} */ (bytes), { headers: cors })
    }

    let after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0))
    if (after >= meta.next) after = 0
    /** Who has it open now, looked up each time: a reader leaving can empty and drop the set. */
    const readers = () => [...open.get(id) ?? []]
    /** @param {Listener} listener */
    const join = (listener) => open.set(id, (open.get(id) ?? new Set()).add(listener))
    /** @param {Listener} listener */
    const leave = (listener) => {
      const set = open.get(id)
      set?.delete(listener)
      if (set && !set.size) open.delete(id)
    }

    // One long poll: what came after, or the first change to come within its wait.
    if (url.searchParams.has('wait')) {
      const wait = Math.min(limits.wait, Math.max(0, Number(url.searchParams.get('wait')) || 0))
      const lines = async (/** @type {Meta} */ held) => (await Promise.all(held.changes.filter((entry) => entry.seq > after).map((entry) => lineOf(id, entry)))).filter(Boolean)
      let [held, changes] = [meta, await lines(meta)]
      if (!changes.length && wait > 0 && meta.state === 'open') {
        await new Promise((resolve) => {
          /** @type {Listener} */
          const listener = { network, push: (line) => { if (line.seq) done() }, end: () => done() }
          const done = () => { clearTimeout(timer); leave(listener); resolve(undefined) }
          const timer = setTimeout(done, wait * 1_000)
          join(listener)
        })
        held = await backend.journal(id) ?? meta
        changes = await lines(held)
      }
      return answer(200, { changes, now: now(), next: held.next, ...(held.state === 'moved' && { moved: true }) })
    }

    // A stream: one network's oldest goes first, as a reconnect leaves one behind; past the journal's own, refused.
    const theirs = readers().filter((one) => one.network === network)
    if (theirs.length >= limits.streamsPerNetwork) theirs[0].end()
    if (readers().length >= limits.streams) return answer(429, { error: 'Too many readers. Try again later.' })
    const encoder = new TextEncoder()
    /** @type {ReturnType<typeof setInterval> | undefined} */
    let beat
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer
    let closed = false
    /** @type {Listener} */
    const listener = { network, push: () => {}, end: () => {} }
    const stop = () => { closed = true; clearInterval(beat); clearTimeout(timer); leave(listener) }
    join(listener)
    const body = new ReadableStream({
      async start(controller) {
        const send = (/** @type {Record<string, unknown>} */ line) => { if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`)) }
        listener.end = (line) => {
          if (closed) return
          if (line) send(line)
          stop()
          controller.close()
        }
        // What comes while what came before is read waits its turn, so that nothing is sent twice or out of order.
        /** @type {Record<string, unknown>[]} */
        const waiting = []
        let last = after
        listener.push = (line) => waiting.push(line)
        send({ now: now(), next: meta.next })
        for (const entry of meta.changes.filter((one) => one.seq > after)) {
          const line = await lineOf(id, entry)
          if (line) send(line)
          last = entry.seq
        }
        listener.push = (line) => {
          if (typeof line.seq === 'number') { if (line.seq <= last) return; last = line.seq }
          send(line)
        }
        for (const line of waiting.splice(0)) listener.push(line)
        if (meta.state === 'moved') return listener.end({ moved: true })
        beat = setInterval(() => send({ now: now() }), limits.beat * 1_000)
        timer = setTimeout(() => listener.end(), limits.stream * 1_000)
      },
      cancel() { stop() },
    })
    cors.set('content-type', 'application/x-ndjson')
    cors.set('x-accel-buffering', 'no')
    return new Response(body, { headers: cors })
  }

  /**
   * A journal tidied in its turn, as the daily sweep asks: its tombstone gone after its days; expired 7 days after its last change;
   * what came before its newest seed ten minutes old and past its days dropped; a part no change names, a day after it came.
   * @param {string} id @param {number} at
   */
  const tidy = (id, at) => inTurn(turn(id), async () => {
    const meta = await backend.journal(id)
    if (!meta) return
    if (meta.until !== undefined && at > meta.until) return backend.removeJournal(id)
    if (meta.state !== 'open') return
    if (at - meta.last > limits.days * DAY) return bury(id, meta, 'expired', at)
    let changed = await trim(id, meta, at, false)
    const named = new Set(meta.changes.flatMap((entry) => entry.parts ?? []))
    for (const [hash, one] of Object.entries(meta.parts)) {
      if (named.has(hash) || at - one.at <= limits.orphans * DAY) continue
      await backend.dropJournalPart(id, hash)
      meta.bytes -= one.size
      delete meta.parts[hash]
      changed = true
    }
    if (changed) await backend.saveJournal(id, meta)
  })

  return { handle, tidy, ids: () => backend.journalIds() }
}
