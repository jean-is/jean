// About this answer (D252): a button under each answer shows, on hover or click, how long it took,
// what it cost and where it was done. Its certificate says which brains answered, whether each ran
// on this device, and what the page reached outside it meanwhile, as the browser itself recorded it
// (Resource Timing), kept in the conversation as each answer ends; saved, it is sealed with a key
// this device keeps and never gives out. Loaded with the first message, so the browser's record
// covers the first answer, and never offered.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register } from '../../ui/caps.js'
import { app, brainLabel, loadModels } from '../../ui/state.js'
import { deviceKey } from '../../ui/secrets.js'
import { priceOf } from '../../ui/prices.js'
import { save } from '../../ui/save.js'
import { icons } from '../../ui/icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { appendRecords } from '../../core/conversations.js'
import { metaRecord } from '../../core/events.js'
import { t, locale, formatDuration, useStrings } from '../../core/i18n.js'
import { factsOf, costOf, certificate, seal } from './certificate.js'

/** @import { Turn } from '../../core/events.js' */
/** @import { Envelope } from '../../core/types.js' */
/** @import { Brain, Facts, Reached } from './certificate.js' */

await Promise.all([useStrings('receipt'), styleSheet(new URL('receipt.css', import.meta.url))])

const INFO = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.5v.5"/></svg>`

// ─── What the page reached ───────────────────────────────────────────────────

/** The page's requests anywhere but to Jean's own address, as the browser recorded them, once each ended (ms). @type {{ start: number, end: number, host: string }[]} */
const requests = []
/** @param {PerformanceEntryList} entries */
function keep(entries) {
  for (const { name, startTime, duration } of entries) {
    const url = new URL(name)
    if (/^https?:$/.test(url.protocol) && url.origin !== location.origin) requests.push({ start: performance.timeOrigin + startTime, end: performance.timeOrigin + startTime + duration, host: url.host })
  }
}
const observer = new PerformanceObserver((list) => keep(list.getEntries()))
observer.observe({ type: 'resource', buffered: true })

/** When each conversation being answered began to be, by path (D147: on screen or not). @type {Map<string, number>} */
const answering = new Map()
/** Answers that ended, whose record is still to be kept. @type {Set<{ from: number, to: number }>} */
const ended = new Set()
effect(() => {
  const running = app.running.value
  for (const path of running) if (!answering.has(path)) answering.set(path, Date.now())
  for (const [path, from] of answering) {
    if (running.includes(path)) continue
    answering.delete(path)
    const answer = { from, to: Date.now() }
    ended.add(answer)
    // The browser tells of a request a moment after it ends.
    setTimeout(() => note(path, answer).catch((error) => console.warn('Receipt', error)), 1000)
  }
})

/**
 * Keeps in the conversation what the page reached while it was answered: every request that ran
 * meanwhile, another conversation's too, which can only make an answer look less private than it was.
 * @param {string} path @param {{ from: number, to: number }} answer
 */
async function note(path, answer) {
  const { from, to } = answer
  keep(observer.takeRecords())
  /** @type {Record<string, number>} */
  const hosts = {}
  for (const { start, end, host } of requests) if (start <= to && end >= from) hosts[host] = (hosts[host] ?? 0) + 1
  // What no answer still needs goes.
  ended.delete(answer)
  const since = Math.min(...answering.values(), ...[...ended].map((other) => other.from))
  requests.splice(0, requests.length, ...requests.filter(({ end }) => end >= since))
  const record = metaRecord(app.deviceId, { reached: /** @type {Reached} */ ({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), hosts }) })
  await appendRecords(app.fs, path, [record])
  const current = app.current.peek()
  if (current?.path === path) app.current.value = { ...current, records: [...current.records, record] }
}

/** @type {WeakMap<Envelope[], Reached[]>} */
const kept = new WeakMap()
/** What the conversation keeps of what its answers reached, read once for each version of its records. @param {Envelope[]} records @returns {Reached[]} */
const reachedIn = (records) => kept.get(records) ?? /** @type {Reached[]} */ (kept.set(records, records.flatMap(({ meta }) => (meta?.reached ? [meta.reached] : []))).get(records))

// ─── The card ────────────────────────────────────────────────────────────────

/** A brain's prices per token, as the picker shows them: its provider's, or models.dev's (D255). @param {Brain} brain */
function pricing({ provider, model }) {
  const connected = app.settings.value.brains.find((one) => one.provider === provider)
  const found = priceOf(provider, model, connected && app.models.value[connected.id]?.find((info) => info.id === model)?.pricing)
  if (!found && connected) loadModels(connected)
  return found
}

/** "about $0.004", "Free", or "Not known". @param {number | null} cost */
const costText = (cost) => (cost === null ? t('receipt.costUnknown') : !cost ? t('receipt.free')
  : t('receipt.costAbout', { cost: new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 }).format(cost) }))

/** @param {Facts} facts @param {Turn} turn @param {string} text */
function card(facts, turn, text) {
  const brains = [...new Map(facts.brains.map((brain) => [`${brain.provider} ${brain.model}`, brain])).values()]
  return html`
    <p class="receipt-verdict is-${facts.verdict}">${facts.verdict === 'local' ? icons.shield : facts.verdict === 'out' ? icons.globe : INFO}<strong>${t(`receipt.${facts.verdict}`)}</strong></p>
    ${facts.verdict === 'out' ? nothing : html`<p class="receipt-note">${t(`receipt.${facts.verdict}.text`)}</p>`}
    <dl>
      <dt>${t('receipt.time')}</dt><dd>${formatDuration(facts.ms)}</dd>
      <dt>${t('receipt.cost')}</dt><dd>${costText(costOf(facts.brains, pricing))}</dd>
      ${brains.length ? html`<dt>${t('receipt.by')}</dt><dd>${brains.map(({ provider, model, local }) => html`<span>
        <bdi>${brainLabel(/** @type {any} */ ({ provider, model, api: provider === 'device' ? 'device' : '' }))}</bdi> · ${t(local ? 'receipt.here' : 'receipt.cloud')}</span>`)}</dd>` : nothing}
      ${facts.outside.length ? html`<dt>${t('receipt.sentTo')}</dt><dd>${facts.outside.map((host) => html`<bdi dir="ltr">${host}</bdi>`)}</dd>` : nothing}
    </dl>
    <button class="button subtle" @click=${() => keepCertificate(facts, turn, text)}>${icons.download}${t('receipt.save')}</button>`
}

/** Saves the answer's certificate, sealed with this device's key where the browser keeps one. @param {Facts} facts @param {Turn} turn @param {string} text */
async function keepCertificate(facts, turn, text) {
  const document = await certificate({ facts, turn, text, conversation: app.current.peek()?.id ?? '', by: app.deviceId, origin: location.origin })
  const keys = await deviceKey('seal', () => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']))
  const sealed = keys ? await seal(document, keys) : document
  save(new Blob([JSON.stringify(sealed, null, 2)], { type: 'application/json' }), `${t('receipt.file', { date: turn.at.slice(0, 10) })}.json`)
}

/** Under an answer: its button, a shield when it was done on this device, and the card it opens. */
class Receipt extends Element {
  #open = signal(false)
  /** How a glance opened the card, or is about to: the mouse or the keyboard's focus. It closes as that leaves, unless clicked. */
  #glance = ''
  #coming = ''
  #timer = 0

  render() {
    const { turn, text = '' } = /** @type {{ turn?: Turn, text?: string }} */ (/** @type {unknown} */ (this))
    if (!turn) return nothing
    const facts = factsOf(turn, reachedIn(app.current.value?.records ?? []))
    const id = `receipt-${turn.at.replace(/\D/g, '')}`
    const glimpse = (/** @type {Event} */ event) => this.#glimpse(event)
    // Named in words it doesn't show, so that its card is its only tip (D233).
    return html`<button class="icon-button subtle receipt-button is-${facts.verdict}" popovertarget=${id}
        @pointerenter=${glimpse} @pointerleave=${glimpse} @focusin=${glimpse} @focusout=${glimpse} @click=${this.#pin}>
        ${facts.verdict === 'local' ? icons.shield : INFO}<span class="visually-hidden">${t('receipt.about')}</span></button>
      <div id=${id} class="receipt" popover @pointerenter=${glimpse} @pointerleave=${glimpse} @focusout=${glimpse}
        @toggle=${(/** @type {ToggleEvent} */ event) => { this.#open.value = event.newState === 'open'; if (!this.#open.value) this.#glance = '' }}>
        ${this.#open.value ? card(facts, turn, text) : nothing}
      </div>`
  }

  /** The card is the button's tip: it shows while a mouse rests on either, or the keyboard brings them focus. @param {Event} event */
  #glimpse(event) {
    const [button, receipt] = /** @type {HTMLElement[]} */ ([...this.children])
    const by = event instanceof PointerEvent ? 'pointer' : 'focus'
    const coming = event.type === 'pointerenter' || event.type === 'focusin'
    // Focus that moves between the button and its card, or that a click brought, changes nothing.
    const other = /** @type {Node | null} */ (/** @type {FocusEvent} */ (event).relatedTarget)
    if (by === 'pointer' ? /** @type {PointerEvent} */ (event).pointerType !== 'mouse' : this.contains(other) || (coming && !button.matches(':focus-visible'))) return
    const open = receipt.matches(':popover-open')
    // Back on it: a close to come doesn't. Gone: only what it was itself to show or close.
    if (coming || (open ? this.#glance : this.#coming) === by) clearTimeout(this.#timer)
    if (coming && !open) {
      this.#coming = by
      this.#timer = setTimeout(() => { this.#glance = by; receipt.showPopover(/** @type {any} */ ({ source: button })) }, by === 'pointer' ? 400 : 0)
    } else if (!coming && open && this.#glance === by) this.#timer = setTimeout(() => receipt.hidePopover(), 300)
  }

  /** A click keeps the card a glance opened. @param {MouseEvent} event */
  #pin = (event) => {
    clearTimeout(this.#timer)
    if (!this.#glance) return
    this.#glance = ''
    event.preventDefault()
  }
}

define('app-receipt', Receipt)
register({ id: 'receipt' })
