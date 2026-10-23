// The Computer's internet (D162): what Settings › Computer and policy allow, which site a request
// goes to and whether it may, the relay it goes through and the token a registry gets. The computer
// has no network of its own: Jean makes each request, with no cookies. Tested in Node.
import { site } from '../../ui/csp.js'
import { resolveRule } from '../../core/rules.js'

/** @typedef {import('../../core/types.js').RuleValue} RuleValue */

/** @typedef {{ internet: 'ask' | 'any' | 'off', sites: string[], relay: string, timeMs: number, limitMB: number, workspaceMB: number }} ComputerBase */
/** Ask before a new site; two minutes a command; 100 MB a response; a workspace up to 256 MB; directly, without a relay. */
export const COMPUTER_DEFAULTS = /** @type {Readonly<ComputerBase>} */ (Object.freeze({ internet: 'ask', sites: [], relay: '', timeMs: 120_000, limitMB: 100, workspaceMB: 256 }))

/** Kinds of packages, each from a registry Settings can replace (an Artifactory instance): the default addresses' names in `DEFAULT_URLS`. */
export const REGISTRIES = /** @type {const} */ (['pyodide', 'pypi', 'npm'])

/**
 * What the computer may reach: `relay` is the address requests go through, with {url} in it, or
 * empty, and directly, through the device's own proxy.
 * @typedef {ComputerBase & { registries: Partial<Record<typeof REGISTRIES[number], string>> }} ComputerRights
 */
/** @typedef {Partial<ComputerRights>} ComputerSettings */

/**
 * Defaults ← user ← policy (`computer` in policy.json), and what the organisation set, locked. A
 * registry is locked by itself (`registries.npm`). Approvals' Using the internet (`fetch`) is the most it
 * may do: Never turns its internet off; a rule an organisation or a parent locked short of Do it takes Any
 * site (`any`) away, and in a child's profile the sites the child added (D533).
 * @param {{ computer?: ComputerSettings, rules?: Record<string, RuleValue> }} settings
 * @param {{ computer?: ComputerSettings, rules?: Record<string, RuleValue>, child?: boolean }} [policy]
 * @param {Record<string, string>} [defaults] the registries' default addresses
 */
export function computerRights(settings, policy = {}, defaults = {}) {
  const mine = settings.computer ?? {}
  const theirs = policy.computer ?? {}
  const rights = /** @type {ComputerRights} */ ({ ...COMPUTER_DEFAULTS, ...mine, ...theirs, registries: {} })
  const locked = new Set(Object.keys(theirs).filter((key) => key !== 'registries'))
  for (const kind of REGISTRIES) {
    rights.registries[kind] = theirs.registries?.[kind] || mine.registries?.[kind] || defaults[kind] || ''
    if (theirs.registries?.[kind]) locked.add(`registries.${kind}`)
  }
  const rule = resolveRule('fetch', { user: settings.rules, policy: policy.rules })
  if (rule === 'never') {
    rights.internet = 'off'
    locked.add('internet')
  } else if (policy.rules?.fetch && rule !== 'allow') {
    if (rights.internet === 'any') rights.internet = 'ask'
    rights.sites = (policy.child ? theirs.sites ?? [] : rights.sites).filter((entry) => entry !== '*')
    locked.add('any')
    if (policy.child) locked.add('sites')
  }
  return { rights, locked, rule }
}

/** A request through a relay: the address with {url} in it, or the relay's address and the request's after it. @param {string} url @param {string} relay */
export function relayed(url, relay) {
  if (!relay) return url
  return relay.includes('{url}') ? relay.replace('{url}', encodeURIComponent(url)) : relay + url
}

/** This computer and the private networks, which a request reaches only when its site is listed. */
const PRIVATE = /^(localhost|.*\.localhost|.*\.local|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[::1?\]|\[f[cd][0-9a-f:]*\]|\[fe80:[0-9a-f:]*\])$/i

/** Whether a listed site (as `site()` writes it) covers a request's address. @param {string} entry @param {URL} url */
export function covers(entry, url) {
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(entry.replace(/^\*\./, ''))
  if (entry === '*') return url.protocol === 'https:' && !PRIVATE.test(url.hostname)
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return false
  const [, wild = '', host = '', port] = /^(\*\.)?([^:]+)(?::(\d+|\*))?$/.exec(entry) ?? []
  const named = wild ? url.hostname === host || url.hostname.endsWith(`.${host}`) : url.hostname === host
  return named && (port === '*' || (port ?? '') === url.port)
}

/**
 * Whether the computer may make a request: at once, after asking the user, or not at all. Only
 * https, and this computer over http when listed; never Jean's own origin; the private networks
 * only when listed; a registry's address always, unless the internet is off.
 * @param {string} address @param {{ rights: ComputerRights, origin?: string }} options
 * @returns {{ verdict: 'allow' | 'ask' | 'deny', site: string, why?: string }}
 */
export function judge(address, { rights, origin }) {
  let url
  try {
    url = new URL(address)
  } catch {
    return { verdict: 'deny', site: '', why: `${address} isn't an address on the internet.` }
  }
  const named = siteOf(url)
  if (rights.internet === 'off') return { verdict: 'deny', site: named, why: 'The computer has no internet: the user turns it on in Settings › Computer.' }
  if (origin && url.origin === origin) return { verdict: 'deny', site: named, why: "The computer can't reach Jean's own pages." }
  if (!/^https?:$/.test(url.protocol)) return { verdict: 'deny', site: named, why: 'Only https addresses can be reached.' }
  const listed = rights.sites.map(site).filter((entry) => entry !== null)
  if (listed.some((entry) => entry !== '*' && covers(entry, url))) return { verdict: 'allow', site: named }
  if (PRIVATE.test(url.hostname) || url.protocol !== 'https:') return { verdict: 'deny', site: named, why: `${named} is on this computer or its network: the user lists it in Settings › Computer first.` }
  if (Object.values(rights.registries).some((registry) => registry && sameSite(registry, url))) return { verdict: 'allow', site: named }
  if (rights.internet === 'any' || listed.includes('*')) return { verdict: 'allow', site: named }
  return { verdict: 'ask', site: named }
}

/** The site an address belongs to, as Settings lists it: its host, and its port when it has one. @param {URL} url */
export const siteOf = (url) => url.host

/** @param {string} registry @param {URL} url */
function sameSite(registry, url) {
  try {
    return new URL(registry.replace(/\{[^}]*\}/g, 'x')).host === url.host
  } catch {
    return false
  }
}

/** The registry an address is under, whose token goes with it. @param {string} address @param {ComputerRights} rights */
export function registryOf(address, rights) {
  return REGISTRIES.find((kind) => {
    const base = rights.registries[kind]?.replace(/\{[^}]*\}.*$/, '')
    return base && address.startsWith(base)
  })
}

/** A registry's token as a header: `user:token` is Basic, anything else Bearer. @param {string} token */
export const authorization = (token) => (token.includes(':') && !/\s/.test(token) ? `Basic ${btoa(token)}` : `Bearer ${token}`)

/**
 * Makes a request for the computer, with no cookies and no referrer, the response cut short past
 * `limit` bytes. A redirect elsewhere is followed only to a site it may reach.
 * @param {{ url: string, method?: string, headers?: Record<string, string>, body?: ArrayBuffer }} request
 * @param {{ relay?: string, token?: string, limit: number, allowed: (url: string) => boolean, signal?: AbortSignal, fetch?: typeof globalThis.fetch }} options
 */
export async function reach({ url, method = 'GET', headers = {}, body }, { relay = '', token, limit, allowed, signal, fetch = globalThis.fetch }) {
  const sent = { ...headers, ...(token && { authorization: authorization(token) }) }
  const response = await fetch(relayed(url, relay), { method, headers: sent, body, credentials: 'omit', referrerPolicy: 'no-referrer', signal })
  const final = relay ? url : response.url || url
  if (final !== url && !allowed(final)) throw new Error(`${url} sent the request on to ${final}, which the computer may not reach.`)
  /** @type {Uint8Array[]} */
  const chunks = []
  let size = 0
  const reader = response.body?.getReader()
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      await reader.cancel()
      throw new Error(`The response is larger than ${Math.round(limit / 1e6)} MB, the most Settings › Computer allows.`)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return { status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers), url: final, body: bytes.buffer }
}
