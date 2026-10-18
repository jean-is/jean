// The page that checks a site (policy.html, D415), for its IT: what the policy.json index.html names holds that
// this version doesn't read or reads otherwise, or one chosen here before it goes up (checks.js); the addresses
// it names, whether the site's own Content-Security-Policy lets Jean reach each, and on a click whether each
// answers, as Jean would ask it; what ee/ says of its enterprise parts; and whether the server sends the
// header set, the types and the pages of deploy/README.md. In the visitor's language; nothing is kept.
import { html, render, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { setLoader, useLocale, useStrings, pickLocale, locale, dir, t } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { checkPolicy, policiesOf, allows, HEADERS, TYPES, PAGES } from './checks.js'

/** @import { Problem } from './checks.js' */

const root = document.documentElement
root.dataset.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
setLoader(async (lang, part) => {
  const response = await fetch(`locales/${part && `${part}/`}${lang}.json`)
  return response.ok ? response.json() : null
})
const listing = await fetch('capabilities.json').then((response) => response.json(), () => ({}))
await useLocale(pickLocale((listing.locales ?? []).flatMap((/** @type {string} */ path) => /^locales\/([\w-]+)\.json$/.exec(path)?.[1] ?? []), navigator.languages))
await useStrings('policy')

/** The server's own answer, past the service worker, which answers GETs alone, and the browser's cache. @param {string} path */
const head = (path) => fetch(path, { method: 'HEAD', cache: 'no-store' }).catch(() => null)
const site = await head('./')
const csp = policiesOf(site?.headers.get('content-security-policy') ?? null)

/**
 * The policy being checked: where it comes from, and what it holds or why it can't be read.
 * @typedef {{ file: string, status?: number, chosen?: boolean, policy?: unknown, error?: string }} Source
 */
const source = signal(/** @type {Source | null} */ (null))
/** Each address's answer once tried: its status, or null for none this site may read. */
const reached = signal(/** @type {Map<string, number | null> | null} */ (null))
/** What ee/ says of the enterprise parts. */
const enterprise = signal(/** @type {{ organisation: string, until: number, trial: boolean } | { error: string } | null} */ (null))
/** The server's lines: what is expected, and whether it came, or what came. @type {import('@preact/signals-core').Signal<Array<[string, true | string | null]>>} */
const server = signal([])

/** @param {Source} given */
async function check(given) {
  source.value = given
  reached.value = null
  enterprise.value = null
  const policy = /** @type {Record<string, unknown>} */ (given.policy)
  if (policy && typeof policy === 'object' && ['key', 'audit', 'retention'].some((part) => part in policy)) {
    enterprise.value = await import('../enterprise/enterprise.js').then((door) => door.check(policy)).catch((error) => ({ error: String(error?.message ?? error) }))
  }
}

/** A text as a policy: what it holds, or why it isn't JSON. @param {string} text @param {Source} where */
function take(text, where) {
  try { check({ ...where, policy: JSON.parse(text) }) } catch (error) { check({ ...where, error: String(/** @type {Error} */ (error).message) }) }
}

/** The policy index.html names, as Jean reads it at its start (ui/app.js). */
async function named() {
  const index = await fetch(`index.html?${Date.now()}`, { cache: 'no-store' }).then((response) => response.text(), () => '')
  const file = /<meta\s[^>]*name=["']?app-policy["'\s>][^>]*>/i.exec(index)?.[0].match(/content=["']?([^"'\s>]+)/i)?.[1]
  if (!file) return check({ file: '' })
  const response = await fetch(file, { cache: 'no-store' }).catch(() => null)
  if (!response?.ok) return check({ file, status: response?.status ?? 0 })
  take(await response.text(), { file })
}

/** Where Jean asks an address what it is, as it would: a brain's list, an issuer's discovery, a collector's export. @param {string} path @param {string} address */
function ask(path, address) {
  const bare = address.replace(/\/$/, '')
  /** No cookies, no referrer, ten seconds at most. */
  const how = /** @type {RequestInit} */ ({ mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10_000) })
  if (/^brains\[\d+\]\.baseURL$/.test(path)) return fetch(`${bare}/models`, how)
  if (path === 'signIn.issuer') return fetch(`${bare}/.well-known/openid-configuration`, how)
  if (path === 'audit.otlpEndpoint') return fetch(address, { ...how, method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"resourceSpans":[]}' })
  return fetch(address, how)
}

/** @param {Array<[string, string]>} addresses */
async function tryAll(addresses) {
  const answers = new Map()
  await Promise.all(addresses.filter(([, address]) => !address.includes('{') && allows(csp, address, location.href)).map(async ([path, address]) => {
    answers.set(address, await ask(path, address).then((response) => response.status, () => null))
  }))
  reached.value = answers
}

/** The header set, the types and the pages, as the server sends them (deploy/README.md). */
async function serve() {
  /** @type {Array<[string, true | string | null]>} */
  const lines = []
  for (const [name, pattern, value] of HEADERS) {
    if (name === 'strict-transport-security' && location.protocol !== 'https:') continue
    const got = site?.headers.get(name) ?? null
    lines.push([`${name}: ${value}`, got && pattern.test(got) ? true : got])
  }
  const files = Object.keys(listing.integrity ?? {})
  for (const ending of ['.js', '.mjs', '.css', '.json', '.wasm', '.webmanifest']) {
    const path = files.find((file) => file.endsWith(ending))
    const got = path ? (await head(path))?.headers.get('content-type') ?? null : null
    if (path) lines.push([`${ending} ${TYPES[ending]}`, got?.split(';')[0].trim().toLowerCase() === TYPES[ending] ? true : got])
  }
  for (const page of PAGES) {
    const response = await head(page)
    const type = response?.headers.get('content-type') ?? ''
    lines.push([`/${page}`, response?.ok && type.startsWith('text/html') ? true : response ? `${response.status} ${type}`.trim() : null])
  }
  const css = files.find((file) => file.endsWith('.css'))
  const encoding = css ? (await fetch(`${css}?${Date.now()}`, { cache: 'no-store' }).catch(() => null))?.headers.get('content-encoding') ?? null : null
  lines.push(['content-encoding: br, gzip', encoding && /\b(br|gzip|zstd)\b/.test(encoding) ? true : encoding])
  server.value = lines
}

const PROBLEMS = /** @type {Record<string, string>} */ ({ text: 'site.textValue', missing: 'site.missingPart' })
/** @param {Problem} problem */
function said([, problem, detail]) {
  if (problem === 'unread') return detail ? t('site.unreadNear', { name: String(detail) }) : t('site.unread')
  if (problem === 'oneOf') return t('site.oneOf', { values: new Intl.ListFormat(locale.value, { type: 'disjunction' }).format(/** @type {unknown[]} */ (detail).map((value) => JSON.stringify(value))) })
  return t(PROBLEMS[problem] ?? `site.${problem}`)
}

/** An address's answer: there, even asking to sign in first (401, 403), or not. @param {number | null | undefined} status */
const answer = (status) => (status == null ? html`<span class="site-bad">${t('site.unreached')}</span>`
  : html`<span class=${status < 400 || status === 401 || status === 403 ? 'site-ok' : 'site-bad'}>${t('site.reached', { status: String(status) })}</span>`)

/** @param {true | string | null} got */
const state = (got) => (got === true ? html`<span class="site-ok">${t('site.sent')}</span>` : got ? html`<span class="site-bad">${t('site.got', { value: got })}</span>` : html`<span class="site-bad">${t('site.notSent')}</span>`)

/** @param {Source} given */
function policyPart(given) {
  const capabilities = Object.keys(listing.capabilities ?? {})
  const { problems, addresses } = given.policy === undefined ? { problems: [], addresses: [] } : checkPolicy(given.policy, capabilities.length ? capabilities : undefined)
  const where = given.chosen ? t('site.chosen', { file: given.file }) : !given.file ? t('site.unnamed') : given.status !== undefined ? t('site.missing', { file: given.file, status: given.status }) : t('site.named', { file: given.file })
  const answers = reached.value
  return html`<section>
    <h2>${t('site.policy')}</h2>
    <p>${where}</p>
    ${given.error ? html`<p class="site-bad">${t('site.unreadable')} <code dir="auto">${given.error}</code></p>` : nothing}
    ${given.policy === undefined ? nothing : problems.length
      ? html`<ul class="site-list">${problems.map((problem) => html`<li><code dir="ltr">${problem[0] || '{ }'}</code> <span class=${problem[1] === 'unread' ? 'site-warn' : 'site-bad'}>${said(problem)}</span></li>`)}</ul>`
      : html`<p class="site-ok">${t('site.fine')}</p>`}
    <label class="button">${t('site.choose')}<input type="file" accept=".json,application/json" class="visually-hidden"
      @change=${(/** @type {Event} */ event) => { const file = /** @type {HTMLInputElement} */ (event.target).files?.[0]; file?.text().then((text) => take(text, { file: file.name, chosen: true })) }}></label>
  </section>
  ${given.policy === undefined ? nothing : html`<section>
    <h2>${t('site.addresses')}</h2>
    ${addresses.length ? html`<ul class="site-list">${addresses.map(([path, address]) => html`<li><code dir="ltr">${path}</code> <span dir="ltr">${address}</span>
      ${!allows(csp, address, location.href) ? html`<span class="site-bad">${t('site.refused')}</span>`
        : answers?.has(address) ? answer(answers.get(address)) : nothing}</li>`)}</ul>
      <button class="button" @click=${() => tryAll(addresses)}>${t('site.reach')}</button>` : html`<p class="muted">${t('site.noAddresses')}</p>`}
  </section>`}
  ${enterprise.value ? html`<section>
    <h2>${t('site.enterprise')}</h2>
    ${'error' in enterprise.value ? html`<p class="site-bad">${t('site.keyless')} <code dir="auto">${enterprise.value.error}</code></p>`
      : html`<p class="site-ok">${enterprise.value.until === Infinity ? t('site.local')
        : t(enterprise.value.trial ? 'site.trial' : 'site.key', { organisation: enterprise.value.organisation, date: new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(enterprise.value.until) })}</p>`}
  </section>` : nothing}`
}

effect(() => {
  root.lang = locale.value
  root.dir = dir(locale.value)
  document.title = `${t('site.title')} · ${BRAND.name}`
  render(html`<main class="site-page">
    <h1>${t('site.title')}</h1>
    <p class="muted">${t('site.text')}</p>
    ${source.value ? policyPart(source.value) : nothing}
    <section>
      <h2>${t('site.server')}</h2>
      <ul class="site-list">${server.value.map(([line, got]) => html`<li><code dir="ltr">${line}</code> ${state(got)}</li>`)}</ul>
    </section>
  </main>`, document.body)
})

named()
serve()
