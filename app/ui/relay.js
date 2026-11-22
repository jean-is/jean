// SPDX-License-Identifier: MIT
// Jean's side of the relay (relay/relay.js, D45): mailboxes on the relay that settings or policy name (`urls.relay`), each
// opened by a token only its device holds, where anyone may leave bytes, sealed before they get here (ui/seal.js).
// One tab reads, the one in sight, holding a Web Lock it takes back as it comes in sight, since a suspended tab behind
// keeps holding it. Nothing reads while Jean is hidden, which also leaves the relay less of a trail of the device's
// addresses. Web-standard (fetch, Web Crypto, Web Locks), so node --test runs it against the relay itself.
/** @param {Uint8Array} bytes */
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** @param {string} text */
const bytesOf = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))
/** A token's mailbox, as the relay names it: its SHA-256's first 16 bytes (a shell module, so not caps/share/seal.js's). @param {string} token */
const idOf = async (token) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).slice(0, 16))

/** @typedef {{ seq: number, at: number, bytes: Uint8Array }} Message */

/** Seconds a read waits on the relay for something to come; the longest pause after failures, in milliseconds. */
const [WAIT, LONGEST] = [25, 60_000]

/** The relay's answer, or an Error with its status (404, 409, 413, 429, 507…) when it refuses. @param {string} url @param {RequestInit} [init] */
export async function ask(url, init) {
  const response = await fetch(url, init)
  if (response.ok) return response
  const { error = `The relay answered ${response.status}.` } = await response.json().catch(() => ({}))
  throw Object.assign(new Error(error), { status: response.status })
}
/** A mailbox's address, from its token. @param {string} base @param {string} token */
const addressOf = async (base, token) => `${base}v1/m/${await idOf(token)}`
/** @param {string} token @param {RequestInit} [init] */
const bearer = (token, init) => ({ ...init, headers: { authorization: `Bearer ${token}` } })

/** A fresh mailbox: the token that opens it, and its id, the start of the token's SHA-256. */
export async function mailbox() {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)))
  return { token, id: await idOf(token) }
}

/** Opens a mailbox, or keeps it open; `once`, it takes one message, then refuses (409). @param {string} base @param {string} token @param {{ once?: boolean }} [options] */
export const open = async (base, token, { once = false } = {}) => { await ask(await addressOf(base, token), bearer(token, { method: 'PUT', ...(once && { body: '{"once":true}' }) })) }

/** Leaves bytes in a mailbox, and gives their number there. @param {string} base @param {string} id @param {Uint8Array} bytes @returns {Promise<number>} */
export const send = async (base, id, bytes) => (await (await ask(`${base}v1/m/${id}`, { method: 'POST', body: /** @type {BodyInit} */ (bytes) })).json()).seq

/**
 * What came after `after`, a large message's bytes fetched by its number; the read drops what is at or before `after`.
 * `now` is the relay's clock, `next` the number the mailbox's next message will have.
 * @param {string} base @param {string} token @param {{ after?: number, wait?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<{ messages: Message[], now: number, next?: number }>}
 */
export async function read(base, token, { after = 0, wait = 0, signal } = {}) {
  const address = await addressOf(base, token)
  /** @type {{ messages: { seq: number, at: number, body?: string }[], now: number, next?: number }} */
  const { messages, now, next } = wait ? await waiting(base, token, after, signal) : await (await ask(`${address}?after=${after}`, bearer(token, { signal }))).json()
  // A large one gone as it is fetched (past its days, or its body lost) is passed over, never the whole batch failed for it.
  const all = await Promise.all(messages.map(async ({ seq, at, body }) => ({ seq, at, bytes: body ? bytesOf(body)
    : await ask(`${address}/${seq}`, bearer(token, { signal })).then(async (one) => new Uint8Array(await one.arrayBuffer()), (/** @type {any} */ error) => { if (error?.status !== 404) throw error }) })))
  return { now, next, messages: /** @type {Message[]} */ (all.filter((one) => one.bytes)) }
}

/**
 * A relay's waiting reads, all of a tab's in one request (D737), so that People's and Your devices' take one of the six connections a
 * browser opens to an HTTP/1.1 relay however many mailboxes they wait on, the others left to journals and what is sent: each read's token,
 * the point it reads after and how it settles; the request under way, and its opening again a moment after a read comes or goes.
 * @typedef {{ token: string, after: number, settle: (error: unknown, answer?: any) => void }} Waiting
 * @type {Map<string, { reads: Set<Waiting>, control?: AbortController, again?: ReturnType<typeof setTimeout> }>}
 */
const groups = new Map()
/** Mailboxes one request reads at most, as the relay takes. */
const READS = 64

/** A waiting read joined to its relay's, settled once its mailbox holds something or can't be read, or the wait is up for them all. @param {string} base @param {string} token @param {number} after @param {AbortSignal} [signal] */
function waiting(base, token, after, signal) {
  const group = groups.get(base) ?? /** @type {NonNullable<ReturnType<typeof groups.get>>} */ (groups.set(base, { reads: new Set() }).get(base))
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    /** @type {Waiting} */
    const one = { token, after, settle: (error, answer) => { group.reads.delete(one); signal?.removeEventListener('abort', gone); if (error) reject(error); else resolve(answer) } }
    const gone = () => { one.settle(signal?.reason); soon(base, group) }
    signal?.addEventListener('abort', gone, { once: true })
    group.reads.add(one)
    soon(base, group)
  })
}
/** A relay's request opened again in a moment, with the reads waiting then. @param {string} base @param {NonNullable<ReturnType<typeof groups.get>>} group */
const soon = (base, group) => { clearTimeout(group.again); group.again = setTimeout(() => { group.control?.abort(); together(base, group) }, 50) }
/**
 * One request for a relay's waiting reads: those whose mailbox holds something or can't be read are settled, the others wait on in the
 * next, unless the wait was up for them all; a failure settles them all, each read's own pause deciding when it comes again.
 * @param {string} base @param {NonNullable<ReturnType<typeof groups.get>>} group
 */
async function together(base, group) {
  const [reads, control] = [[...group.reads].slice(0, READS), (group.control = new AbortController())]
  if (!reads.length) return
  try {
    /** @type {{ reads: ({ messages: any[], next: number } & { status?: number, error?: string })[], now: number }} */
    const { reads: answers, now } = await (await ask(`${base}v1/m?wait=${WAIT}`, { method: 'POST', body: JSON.stringify(reads.map(({ token, after }) => ({ token, after }))), signal: control.signal })).json()
    const said = reads.filter((_, i) => answers[i].status || answers[i].messages.length)
    for (const one of said.length ? said : reads) ((answer) => one.settle(answer.status && Object.assign(new Error(answer.error), { status: answer.status }), { ...answer, now }))(answers[reads.indexOf(one)])
  } catch (error) {
    if (control.signal.aborted) return
    for (const one of reads) one.settle(error)
  }
  if (group.reads.size && group.control === control) soon(base, group)
}

/** Removes a mailbox and all it holds. @param {string} base @param {string} token */
export const remove = async (base, token) => { await ask(await addressOf(base, token), bearer(token, { method: 'DELETE' })) }

/** The next message of a mailbox, and done() to tell the relay it was read. @typedef {(() => Promise<Uint8Array>) & { done: () => Promise<unknown> }} Reader */

/**
 * The next message a mailbox holds, waiting as long as it takes, until `signal` ends it, a failure without a status tried again; only
 * what it handed out goes from the relay, at its next read or at done(), so what came with it stays for whoever reads next. `clock` hears
 * the relay's. @param {string} base @param {string} token @param {AbortSignal} signal @param {(now: number) => void} [clock] @returns {Reader}
 */
export function reader(base, token, signal, clock) {
  let after = 0
  /** @type {Message[]} */
  const queue = []
  const next = async () => {
    while (!queue.length) {
      signal.throwIfAborted()
      try {
        const { messages, now } = await read(base, token, { after, wait: WAIT, signal })
        clock?.(now)
        queue.push(...messages)
      } catch (error) {
        if (signal.aborted || /** @type {any} */ (error)?.status) throw error
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
    const { seq, bytes } = /** @type {Message} */ (queue.shift())
    after = seq
    return bytes
  }
  return Object.assign(next, { done: () => read(base, token, { after }).catch(() => {}) })
}

/**
 * Reads a mailbox while Jean is in sight, hands each batch to `onMessages`, then reads on past it, which tells the relay
 * it was read: a batch whose handling fails comes again, and one may come twice as another tab takes over. A failure
 * pauses it, a second, then twice as long each time up to a minute, or until the device is back online. Its mailbox gone (the relay
 * lost it), it is opened again, or `lost` decides; numbered lower than what was read (the relay rolled back), it is read from its start. `clock` hears the
 * relay's time at each read. `quiet`, a signal, holds it back while it is true, ending a read under way: nothing goes to the relay while
 * an answer is written, which reads what the page reached meanwhile (caps/receipt). `hidden` reads on out of sight while it says so, as long as
 * no window in sight takes the reading. Gives what stops it.
 * @param {{ base: string, token: string, lock: string, onMessages: (messages: Message[]) => unknown, clock?: (now: number) => void, lost?: typeof open,
 *   quiet?: { peek: () => boolean, subscribe: (heard: (on: boolean) => void) => () => void }, hidden?: () => boolean }} options
 */
export function listen({ base, token, lock, onMessages, clock, lost = open, quiet, hidden }) {
  const [page, locks] = [globalThis.document, globalThis.navigator?.locks]
  /** Whether stop() ran, the number of the last message read, and this tab's reading, which Jean hidden (unless `hidden` says so), another tab taking the lock or stop() ends. */
  let [stopped, after, held] = [false, 0, /** @type {AbortController | undefined} */ (undefined)]
  /** One reading at a time, the last one's batch handled before the next reads; and what ends the pause under way, back online. */
  let [turn, wake] = [Promise.resolve(), () => {}]
  /** @param {number} ms @param {AbortSignal} signal */
  const rest = (ms, signal) => new Promise((resolve) => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(undefined) }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done)
    wake = done
  })
  /** @param {AbortSignal} signal */
  const reading = async (signal) => {
    for (let pause = 1000; !signal.aborted;) {
      try {
        const asked = Date.now()
        const { messages, now, next } = await read(base, token, { after, wait: WAIT, signal })
        clock?.(now)
        if (next !== undefined && after >= next) after = 0
        pause = 1000
        // Nothing, long before the wait was up (a relay that can't wait): a second before the next read, never a spin.
        if (!messages.length && Date.now() - asked < WAIT * 500 && !signal.aborted) await rest(1000, signal)
        if (!messages.length || signal.aborted) continue
        await onMessages(messages)
        after = messages[messages.length - 1].seq
      } catch (error) {
        if (/** @type {any} */ (error)?.status === 404) await lost(base, token).then(() => { after = 0 }, () => {})
        if (!signal.aborted) await rest(pause, signal)
        pause = Math.min(pause * 2, LONGEST)
      }
    }
  }
  const hold = (steal = true) => {
    if (stopped || quiet?.peek() || (page?.visibilityState === 'hidden' && !hidden?.())) return
    held?.abort()
    const mine = (held = new AbortController())
    const run = () => (turn = turn.then(() => reading(mine.signal)))
    // Taken by another tab while this one is still in sight: it waits its turn, and reads again as soon as that one lets it go.
    if (locks) locks.request(lock, steal ? { steal: true } : { signal: mine.signal }, run).catch(() => { mine.abort(); if (held === mine) hold(false) })
    else run()
  }
  const [seen, online] = [() => (page?.visibilityState !== 'hidden' ? hold() : hidden?.() ? undefined : held?.abort()), () => wake()]
  page?.addEventListener('visibilitychange', seen)
  globalThis.addEventListener?.('online', online)
  const unquiet = quiet?.subscribe((on) => (on ? held?.abort() : hold())) ?? (hold(), undefined)
  return () => { stopped = true; unquiet?.(); held?.abort(); page?.removeEventListener('visibilitychange', seen); globalThis.removeEventListener?.('online', online) }
}
