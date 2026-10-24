// The windows beside the conversation, in the address after its place (D220): the preview, the
// browser, the terminal and Flows, each by its name and what it shows, in the order they opened, as
// `#/c/<ulid>?browser=https://example.com/&terminal`. Reloading, sharing the tab or going back to
// another place shows them as they were there; Back and Forward within a place (a site's own pages,
// Settings closing) leave them as they are. A window's module keeps it here as it loads; one an
// address names whose module hasn't loaded yet loads once its capability is found, and a name Jean
// doesn't know is passed over. The room waits for those an address names before it first shows,
// so that it shows as they leave it, the dock with its panes and Creations' page in place of the
// welcome, never moving as each comes (D582). A window shown again never takes the keys. Loaded
// with the first window, or with an address that names one.
import { computed, effect, signal } from '@preact/signals-core'
import { app } from './state.js'
import { loaded, unlock } from './caps.js'
import { beside } from './router.js'

/**
 * A window, as the address keeps it: what it shows, null while it is closed ('' when it is open on
 * nothing in particular), and how to show that again (null closes it), done once it shows. Each
 * window writes its own state, and checks one it is given.
 * @typedef {{ get: () => string | null, set: (state: string | null) => unknown }} Kept
 */

/** Where each window comes from: the capability found first, if any, and its module. */
const SOURCES = /** @type {Record<string, [string, () => Promise<unknown>]>} */ ({
  preview: ['', () => import('./preview.js')],
  browser: ['browser', () => import('../caps/browser/browser.js')],
  terminal: ['computer', () => import('../caps/computer/terminal.js')],
  flow: ['flows', () => import('../caps/flows/flows.js')],
  creations: ['', () => import('./creations.js')],
})

const windows = signal(/** @type {Map<string, Kept>} */ (new Map()))
/** The names of the windows open, in the order they opened. @type {string[]} */
let order = []
/** The last address followed, so an earlier one still loading gives way. */
let asked = 0

/** A window's module keeps it as it loads. @param {string} name @param {Kept} kept */
export const keep = (name, kept) => { windows.value = new Map(windows.peek()).set(name, kept) }

/** The windows open, as the address writes them: each state with its slashes and colons as they are. */
export const written = computed(() => {
  /** @type {Map<string, string>} */
  const open = new Map()
  for (const [name, kept] of windows.value) { const state = kept.get(); if (state !== null) open.set(name, state) }
  order = [...order.filter((name) => open.has(name)), ...[...open.keys()].filter((name) => !order.includes(name))]
  return order.map((name) => {
    const state = open.get(name)
    return state ? `${name}=${encodeURIComponent(state).replace(/%2F|%3A/g, decodeURIComponent)}` : name
  }).join('&')
})
// Into the address once they change, not before: an address being followed holds its own until then.
let last = ''
effect(() => {
  if (written.value !== last) beside.value = last = written.value
})

/**
 * Every capability the user found, or policy turns on, once it has come back, as `app.ready` says after the room first shows: what a
 * window shows may need another's (a document holding a collection, a folder's page), and the room waits for it then (D582).
 */
const found = () => Promise.all([...app.settings.peek().unlocked, ...(app.policy.capabilities?.preUnlock ?? [])].map(unlock))

/**
 * Closes the windows an address doesn't name, and those open out of its order, then shows those it names, in its order, once what
 * the user found has come back; done once they show, or after a second, so that a window slow to come never holds the room back
 * (D582). @param {string} query what follows the `?`
 */
export const follow = (query) => Promise.race([show(query), new Promise((resolve) => setTimeout(resolve, 1000))])

/** @param {string} query */
async function show(query) {
  const at = ++asked
  const wanted = new Map(new URLSearchParams(query)), names = [...wanted.keys()]
  await found().catch(() => {})
  for (const [name, kept] of windows.peek()) if (at === asked && !wanted.has(name)) await quietly(kept, null)
  const moved = order.findIndex((name, i) => name !== names[i])
  for (const name of moved < 0 ? [] : order.slice(moved)) if (at === asked) await quietly(windows.peek().get(name), null)
  for (const [name, state] of wanted) {
    const [needs, load] = SOURCES[name] ?? []
    if (load && (!needs || loaded.peek().has(needs))) await load().catch((error) => console.warn('Windows', error))
    if (at !== asked) return
    await quietly(windows.peek().get(name), state)
  }
  if (at === asked) beside.value = last = written.peek()
}

/** A window shown or closed, the keys staying where they were. @param {Kept | undefined} kept @param {string | null} state */
async function quietly(kept, state) {
  const focused = document.activeElement
  try { await kept?.set(state) } catch (error) { console.warn('Windows', error) }
  if (document.activeElement === focused) return
  if (focused instanceof HTMLElement && focused !== document.body) focused.focus()
  else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}
