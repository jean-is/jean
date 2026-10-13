// What the room's modules read of Jean in a task saved as a web page (D305), in ui/state.js's place:
// the task and what the page was saved with (the look, what pages may do, the map service), light or
// dark as the system has it, and nothing kept or sent, since a copy is read, not worked in. The words
// come from the package, in the language the page was saved in, before any module that shows them runs.
import { computed, signal } from '@preact/signals-core'
import { setLoader, useLocale } from '../core/i18n.js'

setLoader(async (lang, part) => {
  const response = await fetch(new URL(`../locales/${part && `${part}/`}${lang}.json`, import.meta.url))
  return response.ok ? response.json() : null
})
await useLocale(document.documentElement.lang || 'en')

/** What the page was saved with (ui/export.js). */
const saved = JSON.parse(document.getElementById('settings')?.textContent || '{}')
const dark = matchMedia('(prefers-color-scheme: dark)')

/** Light or dark, as the system is, and as it changes. */
export const theme = signal(dark.matches ? 'dark' : 'light')
dark.addEventListener('change', () => { theme.value = dark.matches ? 'dark' : 'light' })

export const app = {
  /** The task, which ui/reader.js reads from the page; a box ticked in it stays ticked until the page closes. */
  current: signal(/** @type {{ id: string, path: string, records: import('../core/types.js').Envelope[] } | null} */ (null)),
  look: signal(String(saved.look ?? 'room')),
  busy: signal(false),
  settings: signal({ pages: saved.pages ?? {}, ...(saved.mapStyles && { mapStyles: saved.mapStyles }) }),
  policy: {},
  deviceId: 'reader',
}

export const effective = computed(() => ({ settings: app.settings.value, locked: new Set() }))
export const notify = (/** @type {string} */ _text) => {}
export const send = (/** @type {string} */ _text) => {}
export const updateSettings = async (/** @type {unknown} */ _changes) => {}
export const keepRecords = async (/** @type {string} */ _path, /** @type {unknown[]} */ _records) => {}
