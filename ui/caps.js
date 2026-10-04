// Capabilities: one module each, imported when it is first needed (unlocking it), then
// remembered. A capability may add tools and prompt lines, which conversations started
// later declare in their frozen prompt; an earlier conversation gets them through a
// system note (D46, D47). Policy can deny a capability (never offered, never downloaded)
// or unlock it in advance (docs/enterprise.md).
import { signal } from '@preact/signals-core'

/**
 * @typedef {Object} Capability
 * @property {string} id
 * @property {import('../core/loop.js').Tool[]} [tools]
 * @property {{ name: string, line: string }[]} [lines]  one line per tool, for the prompt
 * @property {string[]} [rules]                           a few prompt rules
 * @property {() => Promise<import('../core/prompt.js').Sections>} [sections]  context it adds (memory, skills)
 * @property {typeof import('../core/llm.js').streamChat} [stream]  a brain that runs here (the on-device brain)
 * @property {import('../core/decide.js').Decide} [decide]  reflexes, once their weights are loaded
 */

const LOADERS = /** @type {Record<string, () => Promise<unknown>>} */ ({
  files: () => import('../caps/files/files.js'),
  memory: () => import('../caps/memory/memory.js'),
  find: () => import('../caps/find/find.js'),
  projects: () => import('../caps/projects/projects.js'),
  skills: () => import('../caps/skills/skills.js'),
  routines: () => import('../caps/routines/routines.js'),
  python: () => import('../caps/python/python.js'),
  made: () => import('../caps/made/made.js'),
  backup: () => import('../caps/backup/backup.js'),
  'brain-local': () => import('../caps/brain-local/brain-local.js'),
  voice: () => import('../caps/voice/voice.js'),
  compute: () => import('../caps/compute/compute.js'),
  reflexes: () => import('../caps/reflexes/reflexes.js'),
  search: () => import('../caps/search/search.js'),
  connections: () => import('../caps/connections/connections.js'),
  live: () => import('../caps/live/live.js'),
  helpers: () => import('../caps/helpers/helpers.js'),
  check: () => import('../caps/check/check.js'),
  since: () => import('../caps/since/since.js'),
  names: () => import('../caps/names/names.js'),
})

/** What turning a capability on downloads, once, in bytes: shown when it is offered. */
export const SIZES = /** @type {Record<string, number>} */ ({ reflexes: 345e6, python: 14e6, live: 82e6 })

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
      gate.remember(id)
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
  }
}
