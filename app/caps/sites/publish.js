// Publishing a site (D720): Publish… in its pane's one button out opens this dialog, loaded then, where the share host says it
// publishes sites. A name, Jean's suggestion from the site's name at first, said free or taken by the host as it is typed; what
// publishing means; then the site's list, and only the files the host lacks. A site's first publish makes its secret, kept among
// the secrets (never in a backup, export or share) and shown once as its recovery code, which brings it to another device. Once
// published: its address, until when, what changed, Publish again and Take it offline. Asked each time: nothing goes before
// the person presses Publish.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { syncDialog, closed, backdrop, head } from '../../ui/dialogs.js'
import { app, notify } from '../../ui/state.js'
import { getSecret, setSecret } from '../../ui/secrets.js'
import { icons } from '../../ui/menu-icons.js'
import { t, intlLocales } from '../../core/i18n.js'
import { slug } from '../../core/settings.js'
import { TYPES, codeOf, secretOf, tokenOf } from './file.js'
import { load, remember, hostOf } from './sites.js'

/**
 * The site in the dialog: its record and files, their hashes, the share host and what it offers, and its secret here, if any.
 * @typedef {import('./sites.js').One & { hashes: Record<string, string>, host: string, offer: { address: string }, secret: string }} Shown
 */
const site = signal(/** @type {Shown | null} */ (null))
/** The name typed, what the host says of it, the recovery code typed (null while its field is closed), the code just made, whether it was kept. */
const [name, said, typed, made, kept] = [signal(''), signal(/** @type {{ state: string, why?: string }} */ ({ state: '' })), signal(/** @type {string | null} */ (null)), signal(''), signal(false)]
/** The files sent so far while publishing, what the dialog last said, what was just copied. */
const [working, told, copied] = [signal(/** @type {{ done: number, count: number } | null} */ (null)), signal(/** @type {{ text: string, alert?: boolean }} */ ({ text: '' })), signal('')]

const SHAPE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
/** Where a site's secret is kept: its folder's ULID. @param {string} path */
const keyOf = (path) => `site:${path.split('/')[1].split('-')[0]}`
/** A file's SHA-256, as the host names it. @param {Uint8Array} bytes */
const digest = async (bytes) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** The secret this publish uses: this device's, the code typed, or none yet. */
const secretNow = () => (site.peek()?.secret ? secretOf(site.peek()?.secret ?? '') : typed.peek() ? secretOf(typed.peek() ?? '') : null)
const day = (/** @type {string} */ when) => new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'long' }).format(new Date(when))

/** Opens the dialog on a site. @param {string} path @param {{ address: string }} offer */
export async function openPublish(path, offer) {
  const one = await load(path)
  if (!one) return
  const hashes = Object.fromEntries(await Promise.all([...one.files].map(async ([file, bytes]) => [file, await digest(bytes)])))
  site.value = { ...one, hashes, host: hostOf(), offer, secret: String(await getSecret(app.fs, keyOf(path)) ?? '') }
  said.value = { state: '' }; typed.value = null; made.value = ''; told.value = { text: '' }
  pick(one.record.published?.name ?? ((suggested) => (suggested.length >= 3 ? suggested : ''))(slug(one.record.name).slice(0, 40).replace(/-$/, '')))
  app.dialog.value = 'publish'
}

/** Asks the host about a name, or changes it with its token. @param {string} path @param {RequestInit} [init] @param {string} [token] */
const ask = (path, init = {}, token = '') => fetch(new URL(`v1/sites/${path}`, site.peek()?.host), { ...init, headers: { ...(token && { authorization: `Bearer ${token}` }), ...init.headers } })

let asking = 0
/** A name typed: its shape here, then the host's word on it, with the token this device or the code typed holds. @param {string} value */
async function pick(value) {
  name.value = value
  const turn = ++asking, secret = secretNow()
  if (!SHAPE.test(value) || value.includes('--')) return void (said.value = { state: value ? 'refused' : '', why: 'shape' })
  said.value = { state: '' }
  await new Promise((resolve) => setTimeout(resolve, 300))
  const answer = turn === asking && await ask(value, {}, secret ? await tokenOf(secret) : '').then((response) => response.json(), () => ({ state: '' }))
  if (turn === asking) said.value = answer
}

/** Sends the site: its list, each file the host lacks, its list again; then keeps what was published. */
async function publish() {
  const one = site.peek()
  if (!one || working.peek()) return
  const fresh = !one.secret, code = typed.peek(), secret = secretNow() ?? crypto.getRandomValues(new Uint8Array(16)), token = await tokenOf(secret)
  working.value = { done: 0, count: 0 }
  told.value = { text: '' }
  try {
    // A secret made here is kept before the name is claimed, so that no claim outlives what holds it; one typed, once the host took it.
    if (fresh && !code) await setSecret(app.fs, keyOf(one.path), codeOf(secret))
    const list = () => ask(name.peek(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files: one.hashes }) }, token).then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    let answer = await list()
    working.value = { done: 0, count: answer.need?.length ?? 0 }
    for (const path of answer.need ?? []) {
      const response = await ask(`${name.peek()}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { 'content-type': TYPES[path.toLowerCase().split('.').pop() ?? ''] }, body: /** @type {BodyInit} */ (one.files.get(path)) }, token)
      if (!response.ok) throw new Error(String(response.status))
      working.value = { done: (working.peek()?.done ?? 0) + 1, count: answer.need.length }
    }
    if (answer.need?.length) answer = await list()
    const published = { host: one.host, name: name.peek(), address: String(answer.address), expires: String(answer.expires), at: new Date().toISOString(), files: one.hashes }
    if (code) await setSecret(app.fs, keyOf(one.path), codeOf(secret))
    await remember(one.path, published)
    site.value = { ...one, secret: codeOf(secret), record: { ...one.record, published } }
    // The code shows once, when Jean made it: one typed is already the person's.
    if (!code && (fresh || !one.record.published)) made.value = codeOf(secret), kept.value = false
    told.value = { text: t('sites.published') }
  } catch (error) {
    console.warn(error)
    told.value = { text: t(code && String(/** @type {Error} */ (error).message) === '403' ? 'sites.wrongCode' : 'sites.failed'), alert: true }
  } finally {
    working.value = null
  }
}

/** Takes it offline: its files gone from the host, its name kept for its token a year. */
async function offline() {
  const one = site.peek(), out = one?.record.published, secret = secretNow()
  if (!one || !out || !secret || !confirm(t('sites.confirmOffline'))) return
  const response = await ask(out.name, { method: 'DELETE' }, await tokenOf(secret)).catch(() => null)
  if (!response?.ok && response?.status !== 404) return void (told.value = { text: t('sites.failed'), alert: true })
  const published = { ...out, expires: new Date().toISOString() }
  await remember(one.path, published)
  site.value = { ...one, record: { ...one.record, published } }
  told.value = { text: t('sites.wentOffline') }
  notify(t('sites.wentOffline'))
}

/** Copies the address or the code, whose button says so for two seconds. @param {string} text @param {string} which */
const copy = (text, which) => navigator.clipboard.writeText(text).then(() => { copied.value = which; setTimeout(() => { if (copied.peek() === which) copied.value = '' }, 2000) })
/** What the host said of the name typed, in words. */
const nameSaid = () => ({ free: t('sites.free'), taken: t(typed.value ? 'sites.wrongCode' : 'sites.taken'), refused: t(said.value.why === 'shape' ? 'sites.shape' : 'sites.held') })[said.value.state] ?? ''

class PublishDialog extends Element {
  render() {
    const one = site.value, out = one?.record.published, step = working.value
    if (!one) return html`<dialog class="sheet site-publish" @close=${closed('publish')} @click=${backdrop}></dialog>`
    const live = Boolean(out) && Date.parse(out?.expires ?? '') > Date.now(), mine = Boolean(one.secret) || Boolean(typed.value && secretOf(typed.value))
    const changed = out ? new Set([...Object.keys(one.hashes), ...Object.keys(out.files)].filter((path) => one.hashes[path] !== out.files[path])).size : 0
    const forms = [...one.files].some(([path, bytes]) => path.endsWith('.html') && /<form\b/i.test(new TextDecoder().decode(bytes)))
    const [before, after] = one.offer.address.replace(/^https?:\/\//, '').split('{name}')
    const done = (/** @type {string} */ which) => (copied.value === which ? icons.check : icons.copy)
    const code = html`<label for="publish-code">${t('sites.code')}</label><input id="publish-code" dir="ltr" autocomplete="off" spellcheck="false" aria-describedby="publish-code-shape"
      .value=${typed.value ?? ''} @input=${(/** @type {Event} */ event) => { typed.value = /** @type {HTMLInputElement} */ (event.target).value; if (!out) pick(name.peek()) }}><small id="publish-code-shape">${t('sites.codeShape')}</small>`
    const ready = !step && (out ? mine && (changed > 0 || !live || !one.secret) : (said.value.state === 'free' || said.value.state === 'yours') && (!typed.value || mine))
    return html`<dialog class="sheet site-publish" @close=${closed('publish')} @click=${backdrop}>
      ${head(t('sites.publishTitle', { name: one.record.name }))}
      ${made.value ? html`<section class="stack"><p>${t('sites.keep')}</p><code class="site-code" dir="ltr">${made.value}</code>
          <button class="button" @click=${() => copy(made.value, 'code')}>${done('code')} <span aria-live="polite">${t(copied.value === 'code' ? 'toast.copied' : 'sites.copyCode')}</span></button>
          <label class="site-kept" for="publish-kept"><input id="publish-kept" type="checkbox" .checked=${kept.value} @change=${(/** @type {Event} */ event) => { kept.value = /** @type {HTMLInputElement} */ (event.target).checked }}>${t('sites.kept')}</label></section>`
        : out ? html`<section class="stack"><div class="site-out"><a href=${out.address} target="_blank" rel="noopener" dir="ltr">${out.address}</a>
            <button class="button" @click=${() => copy(out.address, 'address')}>${done('address')} <span aria-live="polite">${t(copied.value === 'address' ? 'toast.copied' : 'action.copy')}</span></button></div>
          <p>${t(live ? 'sites.online' : 'sites.ended', { date: day(out.expires) })}</p>
          ${one.secret ? html`<p>${changed ? t('sites.changed', { count: changed }) : t('sites.same')}</p>` : html`<p>${t('sites.elsewhere')}</p>${code}`}</section>`
        : html`<form id="publish-form" class="stack" @submit=${(/** @type {Event} */ event) => { event.preventDefault(); if (ready) publish() }}>
          <label for="publish-name">${t('sites.address')}</label>
          <span class="site-name" dir="ltr"><span aria-hidden="true">${before}</span><input id="publish-name" autocomplete="off" spellcheck="false" maxlength="40" aria-describedby="publish-said"
            .value=${name.value} @input=${(/** @type {Event} */ event) => pick(/** @type {HTMLInputElement} */ (event.target).value.toLowerCase())}><span aria-hidden="true">${after.replace(/\/$/, '')}</span></span>
          <small id="publish-said" role="status">${nameSaid()}</small>
          ${typed.value === null ? html`<button type="button" class="button subtle" @click=${() => { typed.value = '' }}>${t('sites.haveCode')}</button>` : code}
          <p class="hint">${t('sites.public')} ${t('sites.year')}</p></form>`}
      ${forms && !made.value ? html`<p class="hint">${t('sites.formWaits')}</p>` : nothing}
      <p class="site-told" role="status">${told.value.alert ? '' : told.value.text}</p><p class="site-told" role="alert">${told.value.alert ? told.value.text : ''}</p>
      <footer class="dialog-foot">${made.value ? html`<button class="button primary" ?disabled=${!kept.value} @click=${() => { made.value = '' }}>${t('sites.done')}</button>`
        : html`${out && live && mine ? html`<button class="button subtle danger" @click=${offline}>${t('sites.offline')}</button>` : nothing}
          <button class="button primary" ?disabled=${!ready} @click=${() => (out ? publish() : null)} form=${out ? nothing : 'publish-form'}>${icons.globe}
            ${step ? t('sites.publishing', { done: step.done, count: step.count }) : t(out ? 'sites.again' : 'sites.go')}</button>`}</footer>
    </dialog>`
  }

  updated() {
    syncDialog(this, 'publish')
  }
}

define('app-site-publish', PublishDialog)
