// What the room's modules read of Jean in a task saved as a web page (D305), in ui/state.js's place:
// the task and what the page was saved with (the look, what pages may do, the map service, where a
// score's instruments are, D338), light or
// dark as the system has it, and nothing kept or sent, since a copy is read, not worked in. The words
// come from the package, in the language the page was saved in, before any module that shows them runs.
// A demo (ui/demo.js, D457) draws the room's own conversation over it, with the answer being written.
import { computed, signal } from '@preact/signals-core'
import { BRAND } from '../brand.js'
import { setLoader, useLocale, t } from '../core/i18n.js'

setLoader(async (lang, part) => {
  const response = await fetch(new URL(`../locales/${part && `${part}/`}${lang}.json`, import.meta.url))
  return response.ok ? response.json() : null
})
await useLocale(document.documentElement.lang || 'en')

/** What the page was saved with (ui/export.js). */
const saved = JSON.parse(document.getElementById('settings')?.textContent || '{}')
const dark = matchMedia('(prefers-color-scheme: dark)')
const printing = matchMedia('print')

/** Light or dark, as the system is, and as it changes; printing, which says light, leaves it as it was. */
export const theme = signal(dark.matches ? 'dark' : 'light')
dark.addEventListener('change', () => { if (!printing.matches) theme.value = dark.matches ? 'dark' : 'light' })

export const app = {
  /** The task, which ui/reader.js reads from the page; a box ticked in it stays ticked until the page closes. */
  current: signal(/** @type {{ id: string, path: string, records: import('../core/types.js').Envelope[] } | null} */ (null)),
  /** The answer a demo is writing. */
  live: signal(/** @type {{ turn: import('../core/events.js').Turn, steers: string[] } | null} */ (null)),
  look: signal(String(saved.look ?? 'room')),
  busy: signal(false),
  error: signal(null),
  offering: signal(null),
  actions: signal({}),
  ready: Promise.resolve(),
  settings: signal({ pages: saved.pages ?? {}, urls: saved.urls ?? {}, ...(saved.mapStyles && { mapStyles: saved.mapStyles }) }),
  policy: {},
  deviceId: 'reader',
}

export const effective = computed(() => ({ settings: app.settings.value, locked: new Set() }))
export const notify = (/** @type {string} */ _text) => {}
/** What the page last sent: a follow-up, a page's message. A copy sends nothing; a demo plays the request it names next. */
export const sent = signal(/** @type {{ text: string } | null} */ (null))
export const send = (/** @type {string} */ text) => { sent.value = { text } }
export const updateSettings = async (/** @type {unknown} */ _changes) => {}
export const keepRecords = async (/** @type {string} */ _path, /** @type {unknown[]} */ _records) => {}
export const assistantName = () => BRAND.name
export const brainLabel = (/** @type {{ provider: string, model: string, api: string }} */ brain) => (brain.api === 'device' ? t('provider.device') : `${t(`provider.${brain.provider}`)} · ${brain.model.split('/').at(-1)}`)
/** The approval a demo's call waits on (ui/demo.js), drawn as the room's inbox draws one. */
export const decisions = signal(/** @type {any[]} */ ([]))
export const decisionsHere = () => decisions.value
export const canStepUp = (/** @type {unknown} */ _brain) => false
// Nothing to try again, go back to, answer in a new task, open or ask a smarter brain.
const none = (/** @type {unknown} */ _what) => {}
export { none as retry, none as rewind, none as fork, none as openFile, none as askSmarter }
