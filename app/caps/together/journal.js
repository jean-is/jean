// The relay's journals, from Jean's side (relay/journal.js, D733): creating one, posting changes, parts and fleeting messages,
// and following one as a stream, or as long polls where a proxy holds the stream back (no line within 30 seconds, though the
// relay sends its clock every 20). A follower picks up from the last change it saw, waiting longer after each failure.
import { base64url, bytesOf, idOf } from '../share/seal.js'

/** Seconds without a line after which a stream is taken as held back; seconds a long poll waits. */
const QUIET = 30
const WAIT = 25

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
 * Follows a journal from `after`: each change to `onChange` in the relay's order, each fleeting message to `onFleeting`, the relay's
 * clock to `onClock`, `onCaught` once what the journal held when it was first read is in, and how it ended to `onEnd` (expired,
 * deleted or moved), until `signal` aborts.
 * @param {Where & { after: number, signal: AbortSignal, onChange(line: Line, bytes: Uint8Array): Promise<void>, onFleeting(bytes: Uint8Array): void,
 *   onClock?(now: number): void, onCaught?(): void, onEnd(how: { expired?: true, deleted?: true, moved?: true }): void }} options
 */
export async function follow({ base, id, read, after, signal, onChange, onFleeting, onClock, onCaught, onEnd }) {
  let [polling, failures, caught] = [false, 0, false]
  /** Once the changes before `next` are in: the stream's first line says which that is. @param {number} next */
  const reached = (next) => { if (!caught && after >= next - 1) { caught = true; onCaught?.() } }
  let next = Infinity
  const headers = { authorization: `Bearer ${read}` }
  /** One line of the relay's, taken: false once the journal ended. @param {any} line */
  const taken = async (line) => {
    if (typeof line.seq === 'number' && line.seq > after) {
      await onChange(line, bytesOf(line.body))
      after = line.seq
    } else if (line.fleeting) onFleeting(bytesOf(line.fleeting))
    if (line.now) onClock?.(line.now)
    if (typeof line.next === 'number') next = line.next
    reached(next)
    if (line.moved || line.deleted || line.expired) return onEnd(line), false
    return true
  }
  while (!signal.aborted) {
    try {
      const response = await fetch(`${base}v1/j/${id}?after=${after}${polling ? `&wait=${WAIT}` : ''}`, { headers, signal })
      if (response.status === 404 || response.status === 410) return onEnd(await response.json().catch(() => ({})))
      if (!response.ok) throw new Error(String(response.status))
      failures = 0
      if (polling) {
        const { changes, moved, now } = await response.json()
        for (const line of changes) await taken(line)
        if (!(await taken({ now, next: after + 1, ...(moved && { moved }) }))) return
        continue
      }
      if (!(await streamed(/** @type {ReadableStream<Uint8Array>} */ (response.body), taken))) return
    } catch (error) {
      if (signal.aborted) return
      // Held back: a stream that brought nothing within its quiet, or broke at once, falls back to polls for good.
      if (/** @type {Error} */ (error).name === 'TimeoutError') polling = true
      await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, 1_000 * 2 ** failures++)))
    }
  }
}

/** A stream's lines, each to `taken`, until it ends (true: read again) or the journal does (false). @param {ReadableStream<Uint8Array>} body @param {(line: any) => Promise<boolean>} taken */
async function streamed(body, taken) {
  const [reader, decoder] = [body.getReader(), new TextDecoder()]
  let rest = ''
  for (;;) {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let quiet
    const part = await Promise.race([reader.read(), new Promise((_, reject) => { quiet = setTimeout(() => reject(Object.assign(new Error('quiet'), { name: 'TimeoutError' })), QUIET * 1_000) })])
      .finally(() => clearTimeout(quiet))
    if (part.done) return true
    const lines = (rest + decoder.decode(part.value, { stream: true })).split('\n')
    rest = /** @type {string} */ (lines.pop())
    for (const line of lines.filter(Boolean)) if (!(await taken(JSON.parse(line)))) return reader.cancel().then(() => false)
  }
}
