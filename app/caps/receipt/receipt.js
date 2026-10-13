// About this answer (D252): a button under each answer shows, on hover or click, how long it took,
// what it cost and where it was done. Its certificate says which brains answered and who made its
// pictures and films, each by name and whether it ran on this device (D263), and what the page
// reached outside it meanwhile, as the browser itself recorded it (Resource Timing), kept in the
// conversation as each answer ends; saved, it is sealed with a key this device keeps and never
// gives out, in standard forms whose words are salted digests, which the proof adds (D274). Loaded
// with the first message, so the browser's record covers the first answer, and never offered.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register } from '../../ui/caps.js'
import { app, brainLabel, loadModels, updateSettings, notify, keepRecords } from '../../ui/state.js'
import { serviceURL } from '../../core/settings.js'
import { deviceKey } from '../../ui/secrets.js'
import { priceOf, PLANS } from '../../ui/prices.js'
import { save } from '../../ui/save.js'
import { icons } from '../../ui/icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { PROVIDERS } from '../../core/llm.js'
import { metaRecord } from '../../core/events.js'
import { t, tParts, locale, formatDuration, useStrings } from '../../core/i18n.js'
import { factsOf, costOf, certificate, seal, makeSeal, thumbprint, ISSUER, compact, sealedOf, saysOf, proof, disclosuresOf, disclosed, witness, record } from './certificate.js'

/** @import { Turn } from '../../core/events.js' */
/** @import { Envelope, ProviderId } from '../../core/types.js' */
/** @import { Brain, Maker, Facts, Reached, Seal, Salts, Sealed } from './certificate.js' */

await Promise.all([useStrings('receipt'), styleSheet(new URL('receipt.css', import.meta.url))])

const INFO = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.5v.5"/></svg>`
const SEAL = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="9" r="5.5"/><path d="M8.8 13.5 7.5 20.5l4.5-2.5 4.5 2.5-1.3-7"/></svg>`
const CLOUD = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.5 18.5h9.25a3.75 3.75 0 0 0 .5-7.47 5.25 5.25 0 0 0-10.1-1.03A4.25 4.25 0 0 0 7.5 18.5Z"/></svg>`

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
  await append(path, { reached: /** @type {Reached} */ ({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), hosts }) })
}

/** Keeps a note in a conversation, and in the one on screen. @param {string} path @param {Record<string, any>} meta */
async function append(path, meta) {
  const record = metaRecord(app.deviceId, meta)
  await keepRecords(path, [record])
  const current = app.current.peek()
  if (current?.path === path) app.current.value = { ...current, records: [...current.records, record] }
}

/** @type {WeakMap<Envelope[], Reached[]>} */
const kept = new WeakMap()
/** What the conversation keeps of what its answers reached, read once for each version of its records. @param {Envelope[]} records @returns {Reached[]} */
const reachedIn = (records) => kept.get(records) ?? /** @type {Reached[]} */ (kept.set(records, records.flatMap(({ meta }) => (meta?.reached ? [meta.reached] : []))).get(records))

/** The page where anyone checks a certificate or its proof (D274). */
const CHECK = new URL('../../check.html', import.meta.url).href

// ─── The card ────────────────────────────────────────────────────────────────

/** A brain's prices per token, as the picker shows them: its provider's, or models.dev's (D255). @param {Brain} brain */
function pricing({ provider, model }) {
  const connected = app.settings.value.brains.find((one) => one.provider === provider)
  const found = priceOf(provider, model, connected && app.models.value[connected.id]?.find((info) => info.id === model)?.pricing)
  if (!found && connected) loadModels(connected)
  return found
}

/** "about $0.004", "Free", "In your Claude plan" when a plan answered, or "Not known". @param {number | null} cost @param {string} [plan] */
const costText = (cost, plan) => (cost === null ? t('receipt.costUnknown') : !cost ? (plan ? t('receipt.plan', { plan }) : t('receipt.free'))
  : t('receipt.costAbout', { cost: new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 }).format(cost) }))

/** Where a brain's requests go, as settings hold it, for its own line rather than among the rest. @param {string} provider */
function hostOf(provider) {
  try { return new URL(app.settings.value.brains.find((one) => one.provider === provider)?.baseURL ?? PROVIDERS[/** @type {ProviderId} */ (provider)]?.baseURL ?? '').host } catch { return '' }
}

/** Each one once, by provider and model. @template {{ provider: string, model: string }} T @param {T[]} all */
const once = (all) => [...new Map(all.map((one) => [`${one.provider} ${one.model}`, one])).values()]

/** A brain's or a maker's name: its provider's and its model's, or, on this device, its model's own (D263). @param {{ provider: string, model: string }} one */
const named = ({ provider, model }) => (provider === 'device' ? model.split('/').at(-1)?.replace(/-ONNX$/i, '') : brainLabel(/** @type {any} */ ({ provider, model, api: '' })))

/**
 * What the answer was, first: where it was done, then how long it took and what it cost, who answered,
 * who made its pictures and films, and the other addresses reached, apart from theirs, the brains'
 * alone given the conversation; last, folded, its certificate, the card being a glance, and folded
 * again within it, who dates it and where anyone checks it, open when a witness was chosen, so that
 * nothing goes out unseen.
 * @param {Facts} facts @param {Turn} turn @param {string} text @param {string} id @param {boolean} chosen
 */
function card(facts, turn, text, id, chosen) {
  const brains = once(facts.brains)
  const made = once(facts.made)
  const cloud = brains.some((brain) => !brain.local)
  const hosts = new Map([...brains, ...made].map(({ provider }) => [provider, hostOf(provider)]))
  const others = facts.outside.filter((host) => ![...hosts.values()].includes(host))
  /** One of them: its name, the address it was reached at outside this device, or that it ran here. @param {Brain | Maker} one */
  const entry = ({ provider, model, local }) => html`<dd class="receipt-brain">
    <bdi>${named({ provider, model })}</bdi>
    ${facts.outside.includes(hosts.get(provider) ?? '') ? html`<bdi class="receipt-host" dir="ltr">${hosts.get(provider)}</bdi>` : nothing}
    ${local && facts.verdict !== 'local' ? html`<span class="receipt-where">${icons.chip}${t('receipt.here')}</span>` : nothing}</dd>`
  return html`
    <div class="receipt-head is-${facts.verdict}">
      <span class="receipt-mark">${facts.verdict === 'local' ? icons.shield : cloud ? CLOUD : facts.verdict === 'out' ? icons.globe : INFO}</span>
      <div><p class="receipt-verdict">${t(cloud ? 'receipt.inCloud' : `receipt.${facts.verdict}`)}</p>
        ${cloud ? html`<p class="receipt-note">${t('receipt.inCloud.text')}</p>` : facts.verdict === 'out' ? nothing : html`<p class="receipt-note">${t(`receipt.${facts.verdict}.text`)}</p>`}</div>
    </div>
    <dl>
      <div class="receipt-stat"><dt>${t('receipt.time')}</dt><dd>${formatDuration(facts.ms)}</dd></div>
      <div class="receipt-stat"><dt>${t('receipt.cost')}</dt><dd>${costText(costOf(facts.brains, pricing), facts.brains.map(({ provider }) => PLANS[provider]).find(Boolean))}</dd></div>
      ${brains.length ? html`<div class="receipt-list"><dt>${t('receipt.by')}</dt>${brains.map(entry)}</div>` : nothing}
      ${made.length ? html`<div class="receipt-list"><dt>${t('receipt.made')}</dt>${made.map(entry)}</div>` : nothing}
      ${others.length ? html`<div class="receipt-list"><dt>${t('receipt.reached')}</dt><dd class="receipt-hosts">${others.map((host) => html`<bdi dir="ltr">${host}</bdi>`)}</dd></div>` : nothing}
    </dl>
    <details class="receipt-certify">
      <summary>${SEAL}${t('receipt.certificate')}${icons.chevron}</summary>
      ${saving(`${id}-save`, 'receipt.save', () => keepCertificate(facts, turn, text))}
      ${saving(`${id}-proof`, 'receipt.proof', () => keepCertificate(facts, turn, text, true))}
      <details class="receipt-more" ?open=${chosen}>
        <summary>${t('action.more')}${icons.chevron}</summary>
        ${vouchers.value.timestamps.length ? choice('date', t('receipt.date', { hosts: new Intl.ListFormat(locale.value).format(vouchers.value.timestamps.map(hostIn)) })) : nothing}
        ${vouchers.value.log ? choice('log', t('receipt.log', { host: hostIn(vouchers.value.log) })) : nothing}
        <p class="receipt-note">${tParts('receipt.checkAt', { address: html`<a href=${CHECK} target="_blank" rel="noopener" dir="ltr">${CHECK.replace(/^https?:\/\//, '')}</a>` })}</p>
      </details>
    </details>`
}

/** A file to save, named by its own words and described by what it holds. @param {string} id @param {string} key @param {() => void} click */
const saving = (id, key, click) => html`<button class="receipt-save" aria-labelledby=${id} aria-describedby=${`${id}-text`} @click=${click}>
  ${icons.download}<span id=${id}>${t(key)}</span><small id=${`${id}-text`}>${t(`${key}.text`)}</small></button>`

// ─── Witnesses (D276) ────────────────────────────────────────────────────────

/** @param {string} address */
const hostIn = (address) => new URL(address).host
const gatewayAt = () => serviceURL('gateway', app.settings.value, app.policy)
/** What each gateway announces, asked once. @type {Map<string, Promise<{ timestamps: string[], logs: string[] }>>} */
const announced = new Map()
/** Who dates a certificate, the witness settings or policy name and those the gateway announces, and the public log. */
async function witnesses() {
  const gateway = gatewayAt()
  if (gateway && !announced.has(gateway)) announced.set(gateway, fetch(gateway, { headers: { accept: 'application/json' } }).then((response) => response.json()).then(({ timestamps = [], logs = [] }) => ({ timestamps, logs }), () => ({ timestamps: [], logs: [] })))
  const from = (gateway && await announced.get(gateway)) || { timestamps: [], logs: [] }
  return { timestamps: [...new Set([serviceURL('timestamp', app.settings.value, app.policy), ...from.timestamps].filter(Boolean))], log: serviceURL('transparencyLog', app.settings.value, app.policy) || from.logs[0] || '' }
}
/** Them, as the card names them. */
const vouchers = signal({ timestamps: /** @type {string[]} */ ([]), log: '' })
effect(() => { if (app.settings.value) witnesses().then((found) => { vouchers.value = found }) })

/** A choice the user makes once, where the card says what goes where: nothing is sent out unasked. @param {'date' | 'log'} key @param {string} label */
const choice = (key, label) => html`<label class="receipt-choice"><input type="checkbox" .checked=${Boolean(app.settings.value.certificates?.[key])}
  @change=${(/** @type {Event} */ event) => updateSettings({ certificates: { ...app.settings.value.certificates, [key]: /** @type {HTMLInputElement} */ (event.target).checked } })}><span>${label}</span></label>`

/** Sends to a witness or the log: from the browser, else through the gateway, which reaches those that don't answer browsers. @param {string} address @param {RequestInit} init */
async function reach(address, init) {
  const response = await fetch(address, init).catch((error) => {
    const gateway = gatewayAt()
    if (!gateway) throw error
    const url = new URL(gateway)
    url.searchParams.set('url', address)
    return fetch(url, init)
  })
  if (!response.ok) throw new Error(`${address}: HTTP ${response.status}`)
  return response
}

/** Has the witnesses date a sealed certificate and the log record it, as the user chose; one that fails is said and left out. @param {Sealed} sealed */
async function vouched(sealed) {
  const { date, log } = app.settings.value.certificates ?? {}
  const found = await witnesses()
  /** @param {string} address @param {(sealed: Sealed) => Promise<Sealed>} vouch */
  const by = (address, vouch) => vouch(sealed).catch((error) => (console.warn(address, error), notify(t('receipt.unwitnessed', { host: hostIn(address) })), sealed))
  for (const address of date ? found.timestamps : []) {
    sealed = await by(address, (one) => witness(one, async (body) => new Uint8Array(await (await reach(address, { method: 'POST', headers: { 'content-type': 'application/timestamp-query' }, body: /** @type {BodyInit} */ (body) })).arrayBuffer())))
  }
  if (log && found.log) sealed = await by(found.log, (one) => record(one, async (entry) => (await reach(`${found.log}/api/v1/log/entries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) })).json()))
  return sealed
}

/** The device's seal, made with the first certificate and kept where the secrets' key is; one for this certificate alone where the browser keeps none. @returns {Promise<Seal>} */
const sealOf = async () => (await deviceKey('seal-x509', () => makeSeal())) ?? makeSeal()

/** The seal's fingerprint: its key's RFC 7638 thumbprint, which its certificates' issuer names, as Settings › Approvals shows it. */
export const fingerprint = async () => thumbprint((await sealOf()).keys.publicKey)

/** @type {Promise<string> | undefined} */
let version
/** Jean's version: the files that ran, as the list the service worker serves names them. */
const versionOf = () => (version ??= fetch(new URL('../../capabilities.json', import.meta.url)).then((response) => response.json()).then(({ version }) => String(version), () => ''))

/** Where a brain or a maker outside this device was reached, and in which country when its settings say. @param {string} provider */
function placed(provider) {
  const host = hostOf(provider)
  const jurisdiction = app.settings.value.brains.find((one) => one.provider === provider)?.jurisdiction
  return { ...(host && { host }), ...(jurisdiction && { jurisdiction }) }
}

/**
 * Saves the answer's certificate, made and sealed now and kept with its salts in the conversation
 * (`meta.certificate`); or its proof, from the last one kept for this answer, made first if there is none.
 * @param {Facts} facts @param {Turn} turn @param {string} text @param {boolean} [words]
 */
async function keepCertificate(facts, turn, text, words = false) {
  const current = app.current.peek()
  if (!current) return
  const answered = turn.end ?? turn.at
  const kept = words ? current.records.findLast(({ meta }) => meta?.certificate && saysOf(sealedOf(meta.certificate.jws)).credentialSubject?.answer?.at === answered)?.meta?.certificate : undefined
  /** @type {{ sealed: import('./certificate.js').Sealed, salts: Salts }} */
  let made
  if (kept) made = { sealed: sealedOf(kept.jws), salts: kept.salts }
  else {
    const own = await sealOf()
    const { credential, salts } = await certificate({ facts, turn, text, conversation: current.id, issuer: ISSUER + await thumbprint(own.keys.publicKey), origin: location.origin, version: await versionOf(), placed })
    made = { sealed: await vouched(await seal(credential, own)), salts }
    await append(current.path, { certificate: { id: credential.id, jws: compact(made.sealed), salts } })
  }
  const date = turn.at.slice(0, 10)
  if (!words) return save(new Blob([JSON.stringify(made.sealed, null, 2)], { type: 'application/jose+json' }), `${t('receipt.file', { date })}.json`)
  const disclosures = disclosed(await disclosuresOf(made.salts, { turn, text, made: facts.made }))
  save(new Blob([proof(made.sealed, disclosures)], { type: 'application/vc+sd-jwt' }), `${t('receipt.proof.file', { date })}.sd-jwt`)
}

/** Under an answer: its button, a shield when it was done on this device, and the card it opens. */
class Receipt extends Element {
  #open = signal(false)
  /** Whether a witness was chosen as the card opened: its choices then show unasked, and stay open while the user changes them. */
  #chosen = false
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
      <div id=${id} class="receipt" popover @click=${this.#pin} @pointerenter=${glimpse} @pointerleave=${glimpse} @focusout=${glimpse}
        @toggle=${(/** @type {ToggleEvent} */ event) => {
          const { date, log } = app.settings.peek().certificates ?? {}
          this.#chosen = Boolean(date || log)
          this.#open.value = event.newState === 'open'
          if (!this.#open.value) this.#glance = ''
        }}>
        ${this.#open.value ? card(facts, turn, text, id, this.#chosen) : nothing}
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

  /** A click keeps the card a glance opened, on its button or within it. @param {MouseEvent} event */
  #pin = (event) => {
    clearTimeout(this.#timer)
    if (!this.#glance) return
    this.#glance = ''
    // On the button, it would close the card again.
    if (event.currentTarget === this.firstElementChild) event.preventDefault()
  }
}

define('app-receipt', Receipt)
register({ id: 'receipt' })
