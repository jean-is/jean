// Capabilities: one module each, imported when it is first needed (unlocking it), then
// remembered. A capability may add tools and prompt lines, which conversations started
// later declare in their frozen prompt; an earlier conversation gets them through a
// system note (D46, D47). What it does on Jean's events are its hooks (core/hooks.js), and what it
// draws in the room's slots its slots, so the room knows none of them by name. Policy can deny a
// capability (never offered, never downloaded) or unlock it in advance (docs/enterprise.md).
import { signal } from '@preact/signals-core'

/**
 * @typedef {Object} Capability
 * @property {string} id
 * @property {import('../core/loop.js').Tool[]} [tools]
 * @property {{ name: string, line: string }[]} [lines]  one line per tool, for the prompt
 * @property {string[]} [rules]                           a few prompt rules
 * @property {(task: { id: string, records: import('../core/types.js').Envelope[] } | null) => Promise<import('../core/prompt.js').Sections>} [sections]  context it adds (memory, skills) for a task (null: a new one on screen)
 * @property {import('../core/decide.js').Decide} [decide]  reflexes, once their weights are loaded
 * @property {() => { name: string, logo?: string, tools: string[] }[]} [searches]  what else of it searches the web (D271)
 * @property {(url: string) => boolean} [ownTab]  a page whose site refuses frames (D271)
 * @property {import('../core/hooks.js').Hook[]} [hooks]  what it does on Jean's events: task.start, turn.step, tool.check, turn.end…
 * @property {Record<string, Slot>} [slots]  what it draws in the room's slots, by name: views, main, above, add, activity, settings…
 * @property {boolean} [ready]  its weights are here and loaded, for one of WEIGHTS
 */

/**
 * An entry in one of the room's slots: where it goes among the others (lowest first), and how it is drawn,
 * with whatever else its slot reads (a section of Settings: its id, label and icon).
 * @typedef {{ at: number, draw: (props?: any) => unknown } & Record<string, any>} Slot
 */

const LOADERS = /** @type {Record<string, () => Promise<unknown>>} */ ({
  files: () => import('../caps/files/files.js'),
  memory: () => import('../caps/memory/memory.js'),
  find: () => import('../caps/find/find.js'),
  projects: () => import('../caps/projects/projects.js'),
  skills: () => import('../caps/skills/skills.js'),
  routines: () => import('../caps/routines/routines.js'),
  flows: () => import('../caps/flows/flows.js'),
  made: () => import('../caps/made/made.js'),
  backup: () => import('../caps/backup/backup.js'),
  sync: () => import('../caps/sync/sync.js'),
  'brain-local': () => import('../caps/brain-local/brain-local.js'),
  voice: () => import('../caps/voice/voice.js'),
  computer: () => import('../caps/computer/computer.js'),
  machine: () => import('../caps/machine/machine.js'),
  reflexes: () => import('../caps/reflexes/reflexes.js'),
  meaning: () => import('../caps/meaning/meaning.js'),
  search: () => import('../caps/search/search.js'),
  connections: () => import('../caps/connections/connections.js'),
  live: () => import('../caps/live/live.js'),
  helpers: () => import('../caps/helpers/helpers.js'),
  check: () => import('../caps/check/check.js'),
  since: () => import('../caps/since/since.js'),
  notifications: () => import('../caps/notifications/notifications.js'),
  names: () => import('../caps/names/names.js'),
  browser: () => import('../caps/browser/browser.js'),
  ask: () => import('../caps/ask/ask.js'),
  folders: () => import('../caps/folders/folders.js'),
  you: () => import('../caps/you/you.js'),
  math: () => import('../caps/math/math.js'),
  layouts: () => import('../caps/layouts/layouts.js'),
  charts: () => import('../caps/charts/charts.js'),
  scores: () => import('../caps/scores/scores.js'),
  slides: () => import('../caps/slides/slides.js'),
  interactive: () => import('../caps/interactive/interactive.js'),
  pictures: () => import('../caps/pictures/pictures.js'),
  receipt: () => import('../caps/receipt/receipt.js'),
  certificates: () => import('../caps/certificates/certificates.js'),
  plugins: () => import('../caps/plugins/plugins.js'),
  compact: () => import('../caps/compact/compact.js'),
})

/** Widgets (D196), loaded when an answer holds one, never at the start. */
const ON_SIGHT = ['charts', 'scores', 'slides']

/** What turning a capability on downloads, once, in bytes: shown when it is offered. */
export const SIZES = /** @type {Record<string, number>} */ ({ reflexes: 345e6, live: 82e6, meaning: 175e6 })
/** Capabilities that work once their weights are downloaded, with consent, when they are turned on: Intuition, meaning search. */
export const WEIGHTS = ['reflexes', 'meaning']

/** Capabilities whose modules have loaded, by id. */
export const loaded = signal(/** @type {Map<string, Capability>} */ (new Map()))

/** @type {Map<string, Promise<boolean>>} */
const loading = new Map()
/** @type {{ deny: string[], remember: (id: string) => void }} */
const gate = { deny: [], remember: () => {} }

/** @param {{ deny?: string[], remember: (id: string) => void }} options */
export function configureCapabilities({ deny = [], remember }) {
  gate.deny = deny
  gate.remember = remember
}

/** @param {string} id */
export const isDenied = (id) => gate.deny.includes(id)

/** Called by a capability module when it loads. @param {Capability} capability */
export function register(capability) {
  loaded.value = new Map(loaded.peek()).set(capability.id, capability)
}

/**
 * Loads a capability's module (once), asks the service worker to keep its files for
 * offline use, and remembers it. Resolves false when denied or unavailable.
 * @param {string} id
 */
export function unlock(id) {
  if (isDenied(id) || !Object.hasOwn(LOADERS, id)) return Promise.resolve(false)
  let pending = loading.get(id)
  if (!pending) {
    pending = LOADERS[id]().then(() => {
      if (!ON_SIGHT.includes(id)) gate.remember(id)
      navigator.serviceWorker?.controller?.postMessage({ type: 'CACHE_CAPABILITY', id })
      return true
    }, (error) => {
      console.warn(`Capability ${id}`, error)
      loading.delete(id)
      return false
    })
    loading.set(id, pending)
  }
  return pending
}

/** Tools, their prompt lines, rules and context sections from every loaded capability, in a stable order. */
export function contributions() {
  const caps = [...loaded.value.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
  return {
    tools: caps.flatMap((cap) => cap.tools ?? []),
    lines: caps.flatMap((cap) => cap.lines ?? []),
    rules: caps.flatMap((cap) => cap.rules ?? []),
    sections: caps.flatMap((cap) => (cap.sections ? [cap.sections] : [])),
    // Each says whose it is: a capability's own are by its id (D299).
    hooks: caps.flatMap((cap) => (cap.hooks ?? []).map((hook) => (hook.by ? hook : { ...hook, by: cap.id }))),
  }
}

/** What the loaded capabilities have in one of the room's slots, in their order. @param {string} name @returns {Slot[]} */
export const slots = (name) => [...loaded.value.values()].flatMap((cap) => cap.slots?.[name] ?? []).sort((a, b) => a.at - b.at)
