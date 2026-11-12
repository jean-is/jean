// SPDX-License-Identifier: MIT
// The relay's journals, from Jean's side (relay/journal.js, D733): creating one, posting changes, parts and fleeting messages,
// and following them, all of a relay's over one connection (D737), as a stream, or as long polls where a proxy holds the stream
// back (no line within 30 seconds, though the relay sends its clock every 20). Each journal picks up from the last change it took.
import { base64url, bytesOf, idOf } from '../share/seal.js'

/** Seconds without a line after which a stream is taken as held back; seconds a long poll waits; journals one stream reads, as many as the relay reads at once (relay/journal.js). */
const QUIET = 30
const WAIT = 25
const FOLLOWS = 64

/** @typedef {{ base: string, id: string, read: string, write?: string }} Where */
/** @typedef {{ seq: number, at: number, body: string, seed?: true, parts?: string[] }} Line */

/** A request to the journal, its status kept on what it throws. @param {string} url @param {RequestInit} init */
async function ask(url, init) {
  const response = await fetch(url, init)
  if (response.ok) return response
  const said = await response.json().catch(() => ({}))
  throw Object.assign(new Error(said.error ?? `The relay answered ${response.status}.`), { ...said, status: response.status })
}

/**
 * Creates the journal, or opens it again once expired: 'made' to whoever made it, 'open' when it already was; throws 403 when it
 * is someone else's and 410 once it was stopped. @param {Where} where @param {string} owner the owner token's SHA-256, which every member keeps
 */
export async function create({ base, id, read, write }, owner) {
  const response = await ask(`${base}v1/j/${id}`, { method: 'PUT', headers: { authorization: `Bearer ${read}`, 'journal-write': /** @type {string} */ (write) }, body: JSON.stringify({ owner }) })
  return response.status === 201 ? 'made' : 'open'
}

/** A change posted, sealed already: its number and the relay's time. @param {Where} where @param {Uint8Array} sealed @param {{ seed?: boolean, parts?: string[] }} [options] @returns {Promise<{ seq: number, at: number }>} */
export const post = async ({ base, id, write }, sealed, { seed = false, parts = [] } = {}) => (await ask(`${base}v1/j/${id}`, { method: 'POST', body: /** @type {BodyInit} */ (sealed),
  headers: { authorization: `Write ${write}`, ...(seed && { 'journal-seed': '1' }), ...(parts.length && { 'journal-parts': parts.join(',') }) } })).json()

/** A sealed part put up, named by its SHA-256. @param {Where} where @param {Uint8Array} sealed */
export async function putPart({ base, id, write }, sealed) {
  const name = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (sealed))))
  await ask(`${base}v1/j/${id}/p/${name}`, { method: 'PUT', body: /** @type {BodyInit} */ (sealed), headers: { authorization: `Write ${write}` } })
  return name
}

/** A part's sealed bytes. @param {Where} where @param {string} name */
export const getPart = async ({ base, id, read }, name) => new Uint8Array(await (await ask(`${base}v1/j/${id}/p/${name}`, { headers: { authorization: `Bearer ${read}` } })).arrayBuffer())

/** A fleeting message, sealed, for whoever has it open now; lost if it can't go. @param {Where} where @param {Uint8Array} sealed */
export const say = ({ base, id, write }, sealed) => fetch(`${base}v1/j/${id}/fleeting`, { method: 'POST', body: /** @type {BodyInit} */ (sealed), headers: { authorization: `Write ${write}` } }).catch(() => {})

/** The owner's: the journal deleted, or marked moved. @param {Where} where @param {string} owner @param {'delete' | 'moved'} what */
export const end = ({ base, id }, owner, what) => ask(`${base}v1/j/${id}${what === 'moved' ? '/moved' : ''}`, { method: what === 'moved' ? 'POST' : 'DELETE', headers: { authorization: `Owner ${owner}` } })

/** A journal's id, from its read token. @param {string} read */
export const journalOf = (read) => idOf(read)

/** Whether a relay keeps journals (its root says so). @param {string} base */
export const keeps = (base) => fetch(base).then((response) => response.json()).then((root) => Boolean(root?.journals), () => false)

/**
 * @typedef {Where & { after: number, signal: AbortSignal, onChange(line: Line, bytes: Uint8Array): Promise<void>, onFleeting(bytes: Uint8Array): void, onCaught?(): void,
 *   onEnd(how: { expired?: true, deleted?: true, moved?: true, gone?: true }): void }} Follower
 * A relay's journals followed here, FOLLOWS at most, over one connection: each one's follower, the next number its stream gave, whether it took
 * all it held then, its failures and until when it waits after one; whether a proxy held the stream back; the stream read, and its reopening.
 * @typedef {{ base: string, ones: Map<string, Follower & { next: number, caught?: true, failures: number, until?: number }>, polling: boolean,
 *   control?: AbortController, again?: ReturnType<typeof setTimeout>, running?: Promise<void> }} Group
 */
/** @type {Map<string, Group[]>} */
const groups = new Map()

/**
 * Follows a journal from `after`, over the connection its relay's journals share: each change to `onChange` in the relay's order, each fleeting
 * message to `onFleeting`, `onCaught` once what the journal held when it was first read is in, and how it ended to `onEnd` (expired, deleted, moved
 * or gone), until `signal` aborts. @param {Follower} follower
 */
export function follow(follower) {
  const { base, id, signal } = follower
  if (signal.aborted) return
  const list = groups.get(base) ?? /** @type {Group[]} */ (groups.set(base, []).get(base))
  const group = list.find((one) => one.ones.has(id)) ?? list.find((one) => one.ones.size < FOLLOWS) ?? list[list.push({ base, ones: new Map(), polling: false }) - 1]
  const one = { ...follower, next: Infinity, failures: 0 }
  group.ones.set(id, one)
  signal.addEventListener('abort', () => { if (group.ones.get(id) === one) { group.ones.delete(id); changed(group) } })
  changed(group)
}

/** The group's stream opened again a moment after it changes, so that the journals followed at once go in one request. @param {Group} group */
function changed(group) {
  clearTimeout(group.again)
  group.again = setTimeout(() => { if (group.running) group.control?.abort(); else group.running = run(group).finally(() => { group.running = undefined }) }, 50)
}

/** A group's stream, each journal read after the last change it took, until none is left; held back, read as long polls for good. @param {Group} group */
async function run(group) {
  let failures = 0
  while (group.ones.size) {
    // A journal whose change failed waits its turn out of the request, so that it never holds the others back.
    const ones = new Map([...group.ones].filter(([, one]) => (one.until ?? 0) <= Date.now()))
    if (!ones.size) return
    const control = group.control = new AbortController()
    try {
      const response = await fetch(`${group.base}v1/j${group.polling ? `?wait=${WAIT}` : ''}`, { method: 'POST', signal: control.signal, body: JSON.stringify([...ones.values()].map(({ read, after }) => ({ read, after }))) })
      if (!response.ok) throw new Error(String(response.status))
      failures = 0
      await streamed(/** @type {ReadableStream<Uint8Array>} */ (response.body), async (line) => {
        const one = ones.get(line.id)
        if (!one || group.ones.get(line.id) !== one || (one.until ?? 0) > Date.now()) return
        try {
          if (typeof line.seq === 'number' && line.seq > one.after) { await one.onChange(line, bytesOf(line.body)); Object.assign(one, { after: line.seq, failures: 0 }) }
          else if (line.fleeting) one.onFleeting(bytesOf(line.fleeting))
        } catch (error) {
          console.warn('Together', error)
          const wait = Math.min(60_000, 1_000 * 2 ** one.failures++)
          one.until = Date.now() + wait
          return void setTimeout(() => changed(group), wait)
        }
        if (typeof line.next === 'number') one.next = line.next
        if (!one.caught && one.after >= one.next - 1) { one.caught = true; one.onCaught?.() }
        if (line.moved || line.deleted || line.expired || line.gone) {
          group.ones.delete(line.id)
          if (!group.ones.size) control.abort()
          one.onEnd(line)
        }
      })
    } catch (error) {
      if (control.signal.aborted) continue
      if (/** @type {Error} */ (error).name === 'TimeoutError') group.polling = true
      await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, 1_000 * 2 ** failures++)))
    } finally { control.abort() }
  }
}

/** A stream's lines, each to `taken` in turn, until it ends; quiet past QUIET seconds, it throws, as held back. @param {ReadableStream<Uint8Array>} body @param {(line: any) => Promise<void>} taken */
async function streamed(body, taken) {
  const [reader, decoder] = [body.getReader(), new TextDecoder()]
  let rest = ''
  for (;;) {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let quiet
    const part = await Promise.race([reader.read(), new Promise((_, reject) => { quiet = setTimeout(() => reject(Object.assign(new Error('quiet'), { name: 'TimeoutError' })), QUIET * 1_000) })])
      .finally(() => clearTimeout(quiet))
    if (part.done) return
    const lines = (rest + decoder.decode(part.value, { stream: true })).split('\n')
    rest = /** @type {string} */ (lines.pop())
    for (const line of lines.filter(Boolean)) await taken(JSON.parse(line))
  }
}
