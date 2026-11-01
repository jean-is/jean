// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Policy's `session` (D676), read, and the clock behind its `idle`: pure, tested under node --test.

/** Hours and minutes as ISO 8601 says them ("PT15M"), in milliseconds; throws on anything else, or a minute at least. @param {unknown} text */
export function idleMs(text) {
  const match = typeof text === 'string' ? /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(text) : null
  const ms = match ? (Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)) * 60_000 : 0
  if (!ms) throw new Error(`policy.json's session.idle is not a time such as "PT15M": ${JSON.stringify(text)}`)
  return ms
}

/**
 * Policy's `session`, read: throws, saying why, on what can't hold. Going idle locks, or signs out, so it needs one of them; a wipe can't
 * follow a moment away from the screen, so idle with a wipe needs the lock; and a wipe can't keep what retention must.
 * @param {Record<string, any>} policy @returns {{ idle?: number, wipe: boolean }}
 */
export function session({ session: given, lock, signIn, retention }) {
  if (!given || typeof given !== 'object') throw new Error("policy.json's session is not an object")
  if (given.signOut !== undefined && given.signOut !== 'wipe') throw new Error(`policy.json's session.signOut can only be "wipe": ${JSON.stringify(given.signOut)}`)
  const wipe = given.signOut === 'wipe'
  if (wipe && !signIn) throw new Error("policy.json's session.signOut needs signIn: nobody signs out without it")
  if (wipe && retention !== undefined) throw new Error("policy.json's session.signOut wipes what its retention must keep: choose one")
  if (given.idle === undefined) return { wipe }
  const idle = idleMs(given.idle)
  if (lock !== 'required' && (wipe || !signIn)) throw new Error(`policy.json's session.idle needs "lock": "required"${wipe ? ', since a wipe never follows a moment away' : ' or signIn'}`)
  return { idle, wipe }
}

/**
 * Watches for a person gone: `touch` when they do something, in any tab; `tick` every so often, which gives `done` once, when nothing
 * has been done for `after`, unless Jean is at work. @param {{ after: number, busy: () => boolean, done: () => void, now?: () => number }} options
 */
export function clock({ after, busy, done, now = Date.now }) {
  let last = now()
  let gone = false
  return {
    // Done again, so that it can come again: nothing may have locked when it did.
    touch() { last = now(); gone = false },
    tick() {
      if (busy()) last = now()
      if (gone || now() - last < after) return
      gone = true
      done()
    },
  }
}
