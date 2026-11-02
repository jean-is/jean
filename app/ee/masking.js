// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Masked requests in the room (D681, mask.js): policy's `dlp.mask` made hooks, in the room's words. The map stays in the
// conversation as notes of its own, so that going back, Sync and backups carry it, and a share leaves it out. What can't be
// masked isn't sent: where someone is looking, a toast says so and the picker opens on the brains the organisation allows.
// Under an answer, what the brain didn't see, and a way to hide one thing more. People's names are read in a worker, loaded
// when first needed and ended once idle, as what it takes (about 1 GB) doesn't come back any other way; what it found in the
// latest texts is kept in .cache/, by each text's hash, so that a conversation opened again isn't read again.
import { html, nothing } from 'lit-html'
import { register } from '../ui/caps.js'
import { act } from '../ui/acts.js'
import { app, assistantName, keepRecords, notify, updateSettings, weightsHost } from '../ui/state.js'
import { handheld, modelWorker } from '../ui/model.js'
import { styleSheet } from '../ui/sheet.js'
import { icons } from '../ui/menu-icons.js'
import { loadConversation } from '../core/conversations.js'
import { metaRecord } from '../core/events.js'
import { LLMError } from '../core/llm.js'
import { isLocal } from '../core/settings.js'
import { t, intlLocales } from '../core/i18n.js'
import { computerRights } from '../caps/computer/net.js'
import { maskHooks } from './mask.js'
import { MODEL, READER } from './model.js'
import { namesIn } from './names.js'

const REST = 60_000
const LONGEST_READ = 600_000
// A text this long, about two pages, takes long enough to say why nothing has happened yet.
const LONG_TEXT = 6000
const KEPT = '.cache/names.json'
const MOST_KEPT = 2000

const worker = modelWorker(new URL('./mask-worker.js', import.meta.url), 'The names reader stopped')
/** @type {Promise<unknown> | null} */
let loaded = null
let reading = 0
/** @type {ReturnType<typeof setTimeout> | undefined} */
let rest
/** What was read, by each text's hash, the latest last. @type {Map<string, [number, number, number][]> | null} */
let readings = null

/** What's kept of earlier readings: sealed like any file, and only ever a cache. */
async function keptReadings() {
  if (readings) return readings
  let kept = {}
  try { kept = JSON.parse(await app.fs.read(KEPT) ?? '{}') } catch {}
  readings ??= new Map(Object.entries(kept))
  return readings
}

/** Each token of a text that may be part of a name: as kept, or read here. A phone can't hold what reads them: nothing goes. @param {string} text @returns {Promise<[number, number, number][]>} */
async function flaggedIn(text) {
  if (!/\p{L}/u.test(text)) return []
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${READER}:${MODEL.revision}:${text}`)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const kept = await keptReadings()
  const had = kept.get(hash)
  if (had) {
    kept.delete(hash)
    kept.set(hash, had)
    return had
  }
  if (handheld()) throw new Error('names can\'t be read on a phone or a tablet')
  if (!loaded || text.length > LONG_TEXT) notify(t('dlp.mask.reading'))
  clearTimeout(rest)
  reading++
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let late
  try {
    const work = async () => {
      loaded ??= worker.call({ type: 'load', host: weightsHost(), model: MODEL.model, revision: MODEL.revision, files: MODEL.files })
      await loaded
      return worker.call({ type: 'read', text })
    }
    const { flagged } = await Promise.race([work(), new Promise((_, reject) => { late = setTimeout(() => reject(new Error('reading for names took too long')), LONGEST_READ) })])
    kept.set(hash, flagged)
    for (const oldest of kept.keys()) {
      if (kept.size <= MOST_KEPT) break
      kept.delete(oldest)
    }
    app.fs.write(KEPT, JSON.stringify(Object.fromEntries(kept))).catch(() => {})
    return flagged
  } catch (error) {
    // Whatever went wrong, the next text starts afresh.
    worker.stop()
    loaded = null
    throw error
  } finally {
    clearTimeout(late)
    if (!--reading) rest = setTimeout(() => { worker.stop(); loaded = null }, REST)
  }
}

/** What a request held at its end, masked, by task: for this page's life, never kept. @type {Map<string, string>} */
const lastRead = new Map()

/** The words the person added: more to hide, never less. */
const addedWords = () => /** @type {string[]} */ (/** @type {any} */ (app.settings.peek()).maskWords ?? [])

/** Whether the Computer can reach anything: a site it lists or a registry goes without a card of its own. */
const reaches = () => computerRights(app.settings.value, app.policy).rights.internet !== 'off'

/** @type {WeakMap<any[], [string, string][]>} */
const maps = new WeakMap()
/** What a conversation's notes say was masked, read once for each version of its records. @param {any[]} records */
function mapIn(records) {
  const had = maps.get(records)
  if (had) return had
  // Two tabs may each have kept the same mark.
  const map = /** @type {[string, string][]} */ ([...new Map(records.flatMap(({ meta }) => Object.entries(meta?.masked ?? {})))])
  maps.set(records, map)
  return map
}

/** @param {Event} event */
async function addWord(event) {
  event.preventDefault()
  const form = /** @type {HTMLFormElement} */ (event.target)
  const input = /** @type {HTMLInputElement} */ (form.elements.namedItem('word'))
  const word = input.value.trim()
  if (word.length < 2) return
  if (!addedWords().includes(word)) await updateSettings(/** @type {any} */ ({ maskWords: [...addedWords(), word] }))
  input.value = ''
  notify(t('dlp.mask.added'))
}

/** Under an answer, in a task with something masked: a card as the receipt's. @param {{ at: string }} props */
function under({ at }) {
  const current = app.current.value
  const map = current ? mapIn(current.records) : []
  if (!map.length) return nothing
  const id = `masked-${String(at).replace(/\D/g, '')}`
  const read = current && lastRead.get(current.path)
  return html`<button class="icon-button subtle mask-button" popovertarget=${id} aria-label=${t('dlp.mask.button')}>${icons.shield}</button>
    <div id=${id} class="receipt" popover>
      <p class="receipt-verdict" dir="auto">${t('dlp.mask.button')}</p>
      <p class="receipt-note" dir="auto">${t('dlp.mask.about')}</p>
      <dl class="mask-values">${map.map(([mark, value]) => html`<div><dt dir="auto">${value}</dt><dd class="receipt-host"><bdi dir="ltr">⟦${mark}⟧</bdi></dd></div>`)}</dl>
      ${read ? html`<details class="mask-read"><summary dir="auto">${t('dlp.mask.read')}</summary><p class="receipt-note receipt-read" dir="auto">${read}</p></details>` : nothing}
      <form class="mask-add" @submit=${addWord}>
        <label dir="auto" for=${`${id}-word`}>${t('dlp.mask.hide')}<input id=${`${id}-word`} name="word" autocomplete="off" dir="auto"
          @keydown=${(/** @type {KeyboardEvent} */ event) => { if (event.key === 'Enter' && event.isComposing) event.preventDefault() }}></label>
        <button class="link-button">${t('dlp.mask.hideButton')}</button>
      </form>
    </div>`
}

/** @param {import('./detect.js').Dlp} dlp */
export async function start(dlp) {
  await styleSheet(new URL('masking.css', import.meta.url))
  register({
    id: 'mask',
    hooks: maskHooks(dlp, {
      isLocal,
      load: async (task) => {
        const conversation = await loadConversation(app.fs, task)
        return conversation && { id: String(conversation.header.id), records: conversation.records }
      },
      keep: (task, meta) => keepRecords(task, [metaRecord(app.deviceId, meta)], true),
      assistant: assistantName,
      open: reaches,
      more: addedWords,
      ...(dlp.mask?.hide?.includes('person') && { names: async (/** @type {string} */ text) => namesIn(text, await flaggedIn(text)) }),
      told: (letters, task) => act('dlp.masked', { task, kinds: [...new Set(letters)], count: letters.length }),
      sent: (task, step) => {
        const last = step.messages.findLast((/** @type {any} */ message) => message.role === 'user')
        if (task && last) lastRead.set(task, [last.content, ...(last.documents ?? []).map((/** @type {any} */ part) => part.text)].filter(Boolean).join('\n\n').slice(0, 4000))
      },
      held: () => notify(t('dlp.mask.picture')),
      heldReason: () => "A picture was here. The organisation's rules keep pictures from this brain, as they can't be read for what to hide.",
      why: (values) => (values.length ? t('dlp.mask.reveal', { what: new Intl.ListFormat(intlLocales()).format(values) }) : t('dlp.mask.unsure')),
      mayGo: () => t('dlp.mask.site'),
      reason: () => "The organisation's rules refuse sending out what is hidden from you.",
      async* refused(why, e, script) {
        console.warn('Mask', why)
        if (!e.signal?.aborted && e.step !== undefined) {
          notify(t(script ? 'dlp.mask.script' : 'dlp.mask.stopped'))
          ;(await import('../ui/picker.js')).openPicker()
        }
        throw new LLMError(`This step couldn't be masked: ${why}`, { code: 'aborted' })
      },
    }),
    slots: {
      answer: { at: 3, draw: under },
      organization: { at: 4, draw: () => html`<section><h3>${t('dlp.mask.title')}</h3><p class="muted">${t('dlp.mask.text')}</p></section>` },
    },
  })
}
