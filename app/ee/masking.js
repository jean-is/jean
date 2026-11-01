// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Masked requests in the room (D681, mask.js): policy's `dlp.mask` made hooks, in the room's words. The map stays in the
// conversation as notes of its own, so that going back, Sync and backups carry it, and a share leaves it out. What can't be
// masked isn't sent: where someone is looking, a toast says so and the picker opens on the brains the organisation allows.
// Under an answer, what the brain didn't see, and a way to hide one thing more.
import { html, nothing } from 'lit-html'
import { register } from '../ui/caps.js'
import { act } from '../ui/acts.js'
import { app, assistantName, keepRecords, notify, updateSettings } from '../ui/state.js'
import { styleSheet } from '../ui/sheet.js'
import { icons } from '../ui/menu-icons.js'
import { loadConversation } from '../core/conversations.js'
import { metaRecord } from '../core/events.js'
import { LLMError } from '../core/llm.js'
import { isLocal } from '../core/settings.js'
import { t, intlLocales } from '../core/i18n.js'
import { computerRights } from '../caps/computer/net.js'
import { maskHooks } from './mask.js'

/** What a request held at its end, masked, by task: for this page's life, never kept. @type {Map<string, string>} */
const lastRead = new Map()

/** The words the person added: more to hide, never less. */
const addedWords = () => /** @type {string[]} */ (/** @type {any} */ (app.settings.peek()).maskWords ?? [])

/** Whether the Computer reaches sites without asking first, so that a site's own card can't stand for what goes. */
function reachesUnasked() {
  const { internet, sites } = computerRights(app.settings.value, app.policy).rights
  return internet === 'any' || sites.includes('*')
}

/** @type {WeakMap<any[], [string, string][]>} */
const maps = new WeakMap()
/** What a conversation's notes say was masked, read once for each version of its records. @param {any[]} records */
function mapIn(records) {
  const had = maps.get(records)
  if (had) return had
  const map = /** @type {[string, string][]} */ (records.flatMap(({ meta }) => Object.entries(meta?.masked ?? {})))
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
        <label dir="auto">${t('dlp.mask.hide')}<input name="word" autocomplete="off" dir="auto"
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
      open: reachesUnasked,
      more: addedWords,
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
      async* refused(why, e) {
        console.warn('Mask', why)
        if (!e.signal?.aborted && e.step !== undefined) {
          notify(t('dlp.mask.stopped'))
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
