// The relay's store (D721): a person's files, sealed on their devices, kept for those devices alone. The relay can neither read
// nor name what it keeps: an object is named by an HMAC of its path under a key only the devices hold, its meta and parts are
// sealed there, and parts are named by the SHA-256 of their sealed bytes. Each device has a token of its own, whose SHA-256 the
// store lists; changing who is in the store also takes a proof (`Store-Proof`, whose SHA-256 the store keeps), derived from the
// key of the store's epoch, so only a device behind its lock can shut the person out. A deletion is a version too, its meta sealed,
// so that devices take a deletion only when they can open it, never on the relay's word. What it records of each change, sealed as
// a mailbox's are, is once per store, address and hour.
//
//   PUT    /v1/s/<sid>               makes a store: Authorization: Bearer <token>, { id, proof }, the first device's id and the
//                                    proof's SHA-256; 409 if it exists
//   GET    /v1/s/<sid>               { epoch, since, last, devices: [{ id, added }], envelope, use, quota }, envelope the caller's
//   GET    /v1/s/<sid>/changes?after=<rev>
//                                    { changes: [{ oid, rev, epoch, meta, parts, gone? }], last, more }, a page in the order of rev,
//                                    `last` the cursor to read on from; { reset: true, last } when `after` is older than the
//                                    deletions swept, to read again from 0
//   PUT    /v1/s/<sid>/b             a part, its SHA-256 in Store-Part; 507 past the store's quota, 503 when the relay is short of room
//   GET    /v1/s/<sid>/b             a part's bytes, its SHA-256 in Store-Part
//   PUT    /v1/s/<sid>/o             a version of the object named in Store-Object, If-Match: <rev> or If-None-Match: *,
//                                    { meta, parts, epoch }: { rev }; 412 with the version that won; 409 { epoch } for an older epoch
//   DELETE /v1/s/<sid>/o             with If-Match, { meta, epoch }, the deletion's meta: { rev }, or 412
//   POST   /v1/s/<sid>/devices       with Store-Proof: { id, token?, envelope?, epoch } adds a device, or gives one its envelope; a
//                                    device not in yet adds itself, Authorization its own token, the one it names
//   POST   /v1/s/<sid>/epoch         with Store-Proof: { epoch, remove, proof, envelopes }, the next epoch, devices removed, the
//                                    next proof's SHA-256 and each remaining device's envelope, in one write; 409 { epoch } if
//                                    another went first
//
// Web-standard: what it keeps goes through a backend, a folder on Node (serve.js).
import { base64url, hashOf, within } from '../host/host.js'

export const STORE = Object.freeze({
  /** Bytes a store holds: its parts, its metas, and 1 KiB for each object or deletion. */
  quota: 1_000_000_000,
  part: 4_194_304,
  meta: 4_096,
  devices: 16,
  /** Changes in a page of the feed. */
  page: 1_000,
  /** Days a store nobody uses stays, a part no version names stays, and a deletion stays. */
  unused: 183,
  orphans: 1,
  tombstones: 90,
  /** Stores a network makes in a day, and the bytes of parts it puts in a day. */
  made: 10,
  sent: 2_000_000_000,
  /** Bytes of disk under which no store takes more: above the mailboxes' floor, so that they go on. */
  free: 2_000_000_000,
})
const DAY = 86_400_000
const HOUR = 3_600_000
/** A store's index, read again once it was left this long. */
const IDLE = 15 * 60_000
const PATH = /^\/v1\/s\/([\w-]{22})(?:\/(changes|b|o|devices|epoch))?$/
const ID = /^[\w-]{22}$/
/** Parts a version names at most: 4 GiB of 4 MiB parts. */
const PARTS = 1_024
const HASH = /^[\w-]{43}$/

/**
 * A store as the backend keeps it: its devices by id, each with its token's hash, when it came and its envelope for this epoch; the
 * devices removed, never let in again; the epoch, its proof's hash and the rev it began after; the last rev; the rev up to which
 * deletions were swept; the bytes it holds; when it was last used.
 * @typedef {{ format: 1, devices: Record<string, { token: string, added: number, envelope?: string }>, removed: string[], epoch: number,
 *   proof: string, since: number, last: number, floor: number, use: number, touched: number }} Meta
 * @typedef {{ rev: number, epoch: number, meta: string, parts: string[], gone?: true }} Version
 * @typedef {{ store(sid: string): Promise<Meta | null>, saveStore(sid: string, meta: Meta): Promise<void>, removeStore(sid: string): Promise<void>,
 *   stores(): Promise<string[]>, objects(sid: string): Promise<Record<string, Version>>, saveObject(sid: string, oid: string, version: Version): Promise<void>,
 *   dropObject(sid: string, oid: string): Promise<void>, part(sid: string, hash: string): Promise<Uint8Array | null>, hasPart(sid: string, hash: string): Promise<boolean>,
 *   addPart(sid: string, hash: string, bytes: Uint8Array): Promise<void>, parts(sid: string): Promise<{ hash: string, size: number, at: number }[]>,
 *   dropPart(sid: string, hash: string): Promise<void>, counts?(): Promise<Record<string, Count>>, saveCounts?(counts: Record<string, Count>): Promise<void> }} Backend
 * @typedef {{ day: number, made: number, sent: number }} Count
 */

/**
 * @param {{ backend: Backend, limits: typeof STORE, now: () => number, inTurn: <T>(key: string, task: () => Promise<T>) => Promise<T>,
 *   record: (text: string) => unknown, free: () => Promise<number> }} options
 */
export function stores({ backend, limits, now, inTurn, record, free }) {
  /** Each store's versions, read from the backend once and kept while it is used. @type {Map<string, { versions: Map<string, Version>, used: number }>} */
  const held = new Map()
  /** @param {string} sid @param {number} at */
  const index = async (sid, at) => {
    for (const [other, one] of held) if (at - one.used > IDLE) held.delete(other)
    const one = held.get(sid) ?? { versions: new Map(Object.entries(await backend.objects(sid))), used: at }
    held.set(sid, Object.assign(one, { used: at }))
    return one.versions
  }
  /** What each network did today, kept across a restart, written at most once a minute. @type {Map<string, Count>} */
  const counts = new Map()
  const loaded = (backend.counts?.() ?? Promise.resolve({})).then((kept) => { for (const [net, one] of Object.entries(kept)) counts.set(net, one) }, () => {})
  let saved = 0
  /** @param {string} network @param {number} at */
  const countOf = (network, at) => {
    const one = counts.get(network) ?? { day: at, made: 0, sent: 0 }
    if (at - one.day >= DAY) Object.assign(one, { day: at, made: 0, sent: 0 })
    counts.set(network, one)
    return one
  }
  /** @param {number} at @param {boolean} [now] whether to write at once, as for a store made, which is rare */
  const keepCounts = (at, now = false) => {
    if (!now && at - saved < 60_000) return
    saved = at
    for (const [net, one] of counts) if (at - one.day >= DAY) counts.delete(net)
    backend.saveCounts?.(Object.fromEntries(counts))?.catch(() => {})
  }
  /** Changes already recorded this hour, by store, address and kind. @type {Set<string>} */
  const noted = new Set()
  let hour = 0

  /** @param {Request} request @param {import('../host/host.js').Client} client @param {{ network: string, answer: (status: number, body?: object) => Response, cors: Headers }} context */
  async function handle(request, client, { network, answer, cors }) {
    await loaded
    const url = new URL(request.url)
    const [, sid, part] = PATH.exec(url.pathname) ?? []
    if (!sid) return answer(404, { error: 'Nothing is here.' })
    const at = now()
    const token = /^Bearer ([\w-]{43})$/.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!token) return answer(401, { error: 'This store’s token is needed.' })
    const hash = await hashOf(token)
    const mine = countOf(network, at)
    /** A change, with where it came from, once an hour for each store, address and kind; never a read. @param {string} operation */
    const note = (operation) => {
      if (at - hour >= HOUR) { hour = at; noted.clear() }
      const key = `${sid} ${client.address} ${operation}`
      if (noted.has(key)) return
      noted.add(key)
      return record(JSON.stringify({ at: new Date(at).toISOString(), address: client.address, port: client.port, protocol: client.protocol ?? '', store: sid, operation }))
    }
    /** A JSON body of at most `limit` bytes, or null. @param {number} limit @returns {Promise<any>} */
    const json = async (limit) => { try { return JSON.parse(new TextDecoder().decode(await within(request, limit) ?? new Uint8Array())) } catch { return null } }

    if (!part && request.method === 'PUT') {
      const asked = await json(1_000)
      if (!ID.test(asked?.id) || !HASH.test(asked?.proof)) return answer(400, { error: 'A store needs its first device and its proof.' })
      if (mine.made >= limits.made) return answer(429, { error: 'Too many stores made. Try again later.' })
      if (await free() < limits.free + limits.quota) return answer(503, { error: 'The relay has no room for a store. Try again later.' })
      return inTurn(`s:${sid}`, async () => {
        if (await backend.store(sid)) return answer(409, { error: 'This store exists.' })
        await backend.saveStore(sid, { format: 1, devices: { [asked.id]: { token: hash, added: at } }, removed: [], epoch: 0, proof: asked.proof, since: 0, last: 0, floor: 0, use: 0, touched: at })
        held.set(sid, { versions: new Map(), used: at })
        mine.made += 1
        keepCounts(at, true)
        await note('store')
        return answer(201, {})
      })
    }

    // A part's bytes, read outside the store's turn: a large one never holds up the others.
    if (part === 'b' && request.method === 'GET') {
      const meta = await backend.store(sid)
      if (!meta) return answer(404, { error: 'No store is here.' })
      if (!Object.values(meta.devices).some((one) => one.token === hash)) return answer(403, { error: 'This store is someone else’s.' })
      const name = request.headers.get('store-part') ?? ''
      const bytes = HASH.test(name) ? await backend.part(sid, name) : null
      if (!bytes) return answer(404, { error: 'This part is gone.' })
      cors.set('content-type', 'application/octet-stream')
      return new Response(/** @type {BodyInit} */ (bytes), { headers: cors })
    }
    // A part's bytes come before the store's turn, checked against their name.
    /** @type {Uint8Array | null} */
    let bytes = null
    if (part === 'b' && request.method === 'PUT') {
      const name = request.headers.get('store-part') ?? ''
      if (!HASH.test(name)) return answer(400, { error: 'A part is named by its SHA-256.' })
      bytes = await within(request, limits.part)
      if (!bytes) return answer(413, { error: 'This part is too large.' })
      if (base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes)))) !== name) return answer(400, { error: 'This part is not what its name says.' })
      if (mine.sent + bytes.length > limits.sent) return answer(429, { error: 'Too much stored today. Try again later.' })
      if (await free() < limits.free) return answer(503, { error: 'The relay is full. Try again later.' })
    }
    const body = part === 'o' || part === 'devices' || part === 'epoch' ? await json(limits.meta + 65_536 + PARTS * 50) : null

    return inTurn(`s:${sid}`, async () => {
      const meta = await backend.store(sid)
      if (!meta) return answer(404, { error: 'No store is here.' })
      const device = Object.entries(meta.devices).find(([, one]) => one.token === hash)?.[0]
      // A device that holds the store's keys, sent by another of the person's, comes in by itself: its own token, with the proof.
      const itself = part === 'devices' && request.method === 'POST' && body?.token === hash && ID.test(body?.id) && !meta.devices[body.id]
      if (!device && !itself) return answer(403, { error: 'This store is someone else’s.' })
      const save = () => backend.saveStore(sid, meta)
      if (at - meta.touched > HOUR) { meta.touched = at; await save() }
      const proved = async () => (await hashOf(request.headers.get('store-proof') ?? '')) === meta.proof

      if (!part && request.method === 'GET') {
        return answer(200, { epoch: meta.epoch, since: meta.since, last: meta.last, devices: Object.entries(meta.devices).map(([id, one]) => ({ id, added: one.added })),
          envelope: meta.devices[device ?? '']?.envelope ?? null, use: meta.use, quota: limits.quota })
      }
      if (part === 'changes' && request.method === 'GET') {
        const after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0))
        if (after > 0 && after < meta.floor) return answer(200, { reset: true, last: meta.last })
        const newer = [...(await index(sid, at))].filter(([, one]) => one.rev > after).sort(([, a], [, b]) => a.rev - b.rev)
        const page = newer.slice(0, limits.page).map(([oid, one]) => ({ oid, ...one }))
        const more = newer.length > page.length
        return answer(200, { changes: page, last: more ? page[page.length - 1].rev : Math.max(after, meta.last), more })
      }
      if (part === 'b' && request.method === 'PUT' && bytes) {
        const name = /** @type {string} */ (request.headers.get('store-part'))
        if (await backend.hasPart(sid, name)) return answer(200, {})
        if (meta.use + bytes.length > limits.quota) return answer(507, { error: 'This store is full.' })
        await backend.addPart(sid, name, bytes)
        meta.use += bytes.length
        mine.sent += bytes.length
        keepCounts(at)
        await save()
        return answer(201, {})
      }
      if (part === 'o' && (request.method === 'PUT' || request.method === 'DELETE')) {
        const oid = request.headers.get('store-object') ?? ''
        const gone = request.method === 'DELETE'
        if (!ID.test(oid) || typeof body?.meta !== 'string' || body.meta.length > limits.meta || !Number.isInteger(body?.epoch)) return answer(400, { error: 'A version needs its object, its meta and its epoch.' })
        const parts = gone ? [] : body.parts
        if (!Array.isArray(parts) || parts.length > PARTS || !parts.every((one) => HASH.test(one))) return answer(400, { error: 'A version names its parts.' })
        if (body.epoch !== meta.epoch) return answer(409, { error: 'This store has a newer epoch.', epoch: meta.epoch })
        const versions = await index(sid, at)
        const current = versions.get(oid)
        const [match, none] = [request.headers.get('if-match'), request.headers.get('if-none-match')]
        if (!match && none !== '*') return answer(428, { error: 'A version says which it replaces.' })
        const fits = match ? Boolean(current) && !(gone && current?.gone) && String(current?.rev) === match : !current || Boolean(current.gone)
        if (!fits) return answer(412, current ? { oid, ...current } : { oid, gone: true, rev: 0 })
        for (const one of parts) if (!(await backend.hasPart(sid, one))) return answer(400, { error: 'A part this version names is not here.' })
        const grown = body.meta.length + 1_024 - (current ? current.meta.length + 1_024 : 0)
        if (grown > 0 && meta.use + grown > limits.quota) return answer(507, { error: 'This store is full.' })
        const rev = Math.max(at, meta.last + 1)
        /** @type {Version} */
        const version = { rev, epoch: meta.epoch, meta: body.meta, parts, ...(gone && { gone: /** @type {const} */ (true) }) }
        await backend.saveObject(sid, oid, version)
        versions.set(oid, version)
        Object.assign(meta, { last: rev, use: meta.use + grown })
        await save()
        await note('object')
        return answer(200, { rev })
      }
      if (part === 'devices' && request.method === 'POST') {
        if (!(await proved())) return answer(403, { error: 'Changing who is in this store takes its proof.' })
        const { id, token: theirs, envelope, epoch } = body ?? {}
        if (!ID.test(id) || (theirs !== undefined && !HASH.test(theirs)) || (envelope !== undefined && (typeof envelope !== 'string' || envelope.length > limits.meta))) return answer(400, { error: 'A device needs its id.' })
        if (meta.removed.includes(id)) return answer(403, { error: 'This device was removed from this store.' })
        if (epoch !== meta.epoch) return answer(409, { error: 'This store has a newer epoch.', epoch: meta.epoch })
        const known = meta.devices[id]
        if (!known && (!theirs || Object.keys(meta.devices).length >= limits.devices)) return answer(409, { error: 'This store takes no more devices.' })
        meta.devices[id] = { ...known, token: known?.token ?? theirs, added: known?.added ?? at, ...(envelope !== undefined && { envelope }) }
        await save()
        await note('device')
        return answer(200, {})
      }
      if (part === 'epoch' && request.method === 'POST') {
        if (!(await proved())) return answer(403, { error: 'Changing who is in this store takes its proof.' })
        const { epoch, remove = [], proof, envelopes = {} } = body ?? {}
        if (!Array.isArray(remove) || !remove.every((one) => ID.test(one)) || !HASH.test(proof) || typeof envelopes !== 'object') return answer(400, { error: 'An epoch needs its proof and its envelopes.' })
        if (epoch !== meta.epoch + 1) return answer(409, { error: 'Another epoch came first.', epoch: meta.epoch })
        for (const id of remove) delete meta.devices[id]
        meta.removed = [...new Set([...meta.removed, ...remove])]
        for (const [id, one] of Object.entries(meta.devices)) {
          const envelope = envelopes[id]
          meta.devices[id] = { token: one.token, added: one.added, ...(typeof envelope === 'string' && envelope.length <= limits.meta && { envelope }) }
        }
        Object.assign(meta, { epoch, proof, since: meta.last })
        await save()
        await note('epoch')
        return answer(200, { epoch })
      }
      return answer(405, { error: 'Not here.' })
    })
  }

  /**
   * A store tidied in its turn, as the daily sweep asks: gone if nobody used it for its days; its deletions past their days dropped, the
   * feed's floor raised past them; its parts no version names, a day after they came, dropped. @param {string} sid @param {number} at
   */
  const tidy = (sid, at) => inTurn(`s:${sid}`, async () => {
    const meta = await backend.store(sid)
    if (!meta) return
    if (at - meta.touched > limits.unused * DAY) {
      held.delete(sid)
      return backend.removeStore(sid)
    }
    const versions = await index(sid, at)
    for (const [oid, one] of versions) {
      if (!one.gone || at - one.rev <= limits.tombstones * DAY) continue
      await backend.dropObject(sid, oid)
      versions.delete(oid)
      Object.assign(meta, { floor: Math.max(meta.floor, one.rev), use: meta.use - one.meta.length - 1_024 })
    }
    const named = new Set([...versions.values()].flatMap((one) => one.parts))
    for (const one of await backend.parts(sid)) {
      if (named.has(one.hash) || at - one.at <= limits.orphans * DAY) continue
      await backend.dropPart(sid, one.hash)
      meta.use -= one.size
    }
    await backend.saveStore(sid, meta)
  })

  return { handle, tidy, ids: () => backend.stores() }
}
