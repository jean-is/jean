// Connections (docs/product.md): the services the user already uses, their email, documents or
// calendar, reached through MCP (D21, D86). A connection is an address, plus a key or a sign-in
// when the service asks for one, kept encrypted in .secrets/ and never in a backup. A service can
// be connected once an account, and a connection kept to some projects; one that doesn't answer a
// browser goes through the gateway, when one is named (D191). Its tools are deferred (D47):
// <connections> names those of the room's project, and the brain finds them with find_tools or
// calls them from a script. Reading through a connection is "Using the internet", anything else
// "Sending and sharing": both "Ask me first" by default, unless the user chose otherwise for that
// service alone, where its page says, or on a card (D529). What they bring in is cited by number.
// Their section of Settings is ./page.js, loaded the first time it shows (D134, D529).
import { nothing } from 'lit-html'
import { signal, computed, effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { act } from '../../ui/acts.js'
import { app, effective, updateSettings, notify } from '../../ui/state.js'
import { getSecret, setSecret, deleteSecret } from '../../ui/secrets.js'
import { openSettings, sectionOpen } from '../../ui/dialogs.js'
import { returnTo } from '../../ui/router.js'
import { mcpClient, MCPError, searchesWeb, toolsOf } from './mcp.js'
import { apiClient } from './apis.js'
import { discover, registerClient, authorization, finish, refresh } from './auth.js'
import { known, knownFor, covers, logoAt } from './directory.js'
import { slug, serviceURL } from '../../core/settings.js'
import { LLMError, mayTrain, mayRead } from '../../core/llm.js'
import { STRICT } from '../../core/rules.js'
import { loadConversation } from '../../core/conversations.js'
import { identifier } from '../../core/deferred.js'
import { ulid } from '../../core/ulid.js'
import { BRAND } from '../../brand.js'
import { t, locale, intlLocales, useStrings } from '../../core/i18n.js'
import { byName } from '../../core/search.js'
import { icons } from '../../ui/menu-icons.js'
import { subRow } from '../../ui/composer.js'

/** @import { Connection } from '../../core/settings.js' */
/** @import { RuleValue } from '../../core/types.js' */
/** @import { McpTool, CallResult } from './mcp.js' */
/** @import { Listed } from './directory.js' */

await useStrings('connections')

// Kept in this tab while the user signs in elsewhere.
const PENDING = 'app.connect'
// Longer results are cut, so one call can't flood a small brain's context.
const MAX_OUTPUT = 12_000

/** What each connection offers now: its tools, each with its server, or why they couldn't be listed or run; a refusal's challenge, for the sign-in. */
export const status = signal(/** @type {Record<string, { tools?: (McpTool & { at: string })[], error?: 'auth' | 'failed', challenge?: string | null }>} */ ({}))
/** How the connection just asked for goes, which the page it was asked from says. */
export const message = signal(/** @type {{ kind: 'busy' | 'error', text: string } | null} */ (null))
/** Settings' Connections, from ./page.js, loaded the first time it shows (D529): declared before the slot that draws it. */
const page = signal(/** @type {(() => unknown) | null} */ (null))
let paging = false

/** The organisation's connections (policy), then the user's. @returns {Connection[]} */
export const all = () => [...(app.policy.connections ?? []), ...(effective.value.settings.connections ?? [])]
/** Those of the room's project: the connections of every project, and those kept to this one. */
const here = () => all().filter((connection) => !connection.projects || connection.projects.includes(app.project.value.id))
/** Whether a connection reaches Google's APIs, whose user data no model may be trained on (Limited Use, D440). @param {Connection} connection */
export const limited = (connection) => [connection.url, ...connection.servers ?? []].some((address) => /\.googleapis\.com$/.test(new URL(address).hostname))

/** What the user chose for a service's reading (`fetch`) or acting (`other`), over its kind's rule, by its id (D529). @param {string} id @param {string} kind */
export const chosen = (id, kind) => effective.value.settings.services?.[id]?.[kind]
/** Sets it, or with none, back to its kind's rule. @param {string} id @param {string} kind @param {RuleValue} [rule] */
export function choose(id, kind, rule) {
  const { [id]: was = {}, ...others } = app.settings.value.services ?? {}
  const { [kind]: _, ...rest } = was
  const now = rule ? { ...rest, [kind]: rule } : rest
  return updateSettings({ services: Object.keys(now).length ? { ...others, [id]: now } : others })
}
/** A card's Always allow or Never on a service's call, kept to that service (ui/send.js), with where it is changed. @param {string} id @param {string} kind @param {RuleValue} rule */
export async function keep(id, kind, rule) {
  await choose(id, kind, rule)
  const connection = all().find((one) => one.id === id)
  if (connection) notify(t('connections.kept', { service: called(connection) }), { label: t('cap.connections.name'), run: () => openSettings(`connections/${id}`) })
}

// ─── The gateway (D191) ──────────────────────────────────────────────────────

/** Its address, from policy or settings: none until one is named. */
export const gatewayAt = computed(() => serviceURL('gateway', app.settings.value, app.policy))
/** What it serves: the hosts it relays to, and the apps it holds, by sign-in server. */
export const served = signal(/** @type {{ hosts: string[], clients: Record<string, string> }} */ ({ hosts: [], clients: {} }))

// Asked again whenever its address changes; an answer for an address since changed is dropped.
effect(() => {
  const address = gatewayAt.value
  served.value = { hosts: [], clients: {} }
  if (!address) return
  fetch(address, { headers: { accept: 'application/json' } }).then((res) => res.json()).then(({ hosts, clients }) => {
    if (gatewayAt.peek() === address) served.value = { hosts: Array.isArray(hosts) ? hosts.map(String) : [], clients: { ...clients } }
  }, (error) => console.warn(address, error))
})

/**
 * How a connection reaches its service: the browser's own fetch, or each address through the
 * gateway, as `<gateway>?url=<address>`.
 * @param {Connection} connection @returns {typeof globalThis.fetch | undefined}
 */
const reach = (connection) => (connection.gateway ? (/** @type {RequestInfo | URL} */ input, /** @type {RequestInit | undefined} */ init) => {
  const address = gatewayAt.peek()
  if (!address) return Promise.reject(new TypeError('No gateway'))
  const url = new URL(address)
  url.searchParams.set('url', String(input))
  return fetch(url, init)
} : undefined)

// ─── Tools ───────────────────────────────────────────────────────────────────

/** @type {Map<string, ReturnType<typeof mcpClient>>} */
const clients = new Map()

/**
 * A client for each server of a connection (D344), or for Google's API it calls, straight from the
 * browser (D349), made again once it signs in. @param {Connection} connection @param {string} [address]
 */
function client(connection, address = connection.url) {
  const key = `${connection.id} ${connection.auth} ${address}`
  const authorization = () => credential(connection)
  return /** @type {ReturnType<typeof mcpClient>} */ (clients.get(key) ?? clients.set(key, apiClient({ url: address, authorization }) ?? mcpClient({ url: address, client: { name: BRAND.name, version: '0.6' }, authorization, fetch: reach(connection) })).get(key))
}

/** What the brain reads when a service wants the user to sign in, first or again. @param {Connection} connection */
const signInFirst = (connection, name = called(connection)) => `${name} needs the user to sign in. Ask them to sign in to ${name} at the top of Settings › Connections, then try again.`
/** Renewals under way, one a connection, which each of its servers waits for. @type {Map<string, Promise<import('./auth.js').Tokens>>} */
const renewing = new Map()

/**
 * New tokens, kept. A renewal the service refuses (not a network lost) leaves the connection to
 * sign in again (D344). @param {Connection} connection @param {import('./auth.js').Tokens} tokens
 */
const renewal = (connection, tokens) => refresh(tokens, reach(connection)).then(async (fresh) => (await setSecret(app.fs, connection.id, JSON.stringify(fresh)), fresh), (error) => {
  if (error instanceof TypeError) throw error
  status.value = { ...status.value, [connection.id]: { ...status.value[connection.id], error: 'auth' } }
  throw new MCPError(signInFirst(connection), { status: 401 })
}).finally(() => renewing.delete(connection.id))

/** The Authorization header: a key, or an access token renewed before it runs out, once for all its servers. @param {Connection} connection @param {boolean} [renew] */
async function credential(connection, renew = false) {
  const secret = connection.auth === 'none' ? null : await getSecret(app.fs, connection.id)
  if (!secret || connection.auth === 'key') return secret ? `Bearer ${secret}` : undefined
  let tokens = JSON.parse(secret)
  if (renew || tokens.expiresAt < Date.now() + 60_000) tokens = await (renewing.get(connection.id) ?? renewing.set(connection.id, renewal(connection, tokens)).get(connection.id))
  return `Bearer ${tokens.access}`
}

/** The tools of each server a connection reaches (D344). @param {Connection} connection */
const toolsAt = (connection) => toolsOf([connection.url, ...connection.servers ?? []].map((address) => [address, client(connection, address)]))

/** The connections asked what they offer, so one that comes later (another tab, a sync) is asked as it comes. */
const asked = new Set()
/** Asks each connection what it offers. @param {Connection[]} [connections] */
export const list = (connections = all()) => Promise.all(connections.map(async (connection) => {
  asked.add(connection.id)
  const now = await toolsAt(connection).then((tools) => ({ tools }), (error) => {
    console.warn(connection.name, error)
    return { error: /** @type {'auth' | 'failed'} */ (error instanceof MCPError && error.auth ? 'auth' : 'failed') }
  })
  status.value = { ...status.value, [connection.id]: now }
}))

/** The connections whose tools' names start as this one's, its name's, in the order they were made (by ULID). @param {Connection} connection */
const alike = (connection) => all().filter((other) => slug(other.name).slice(0, 16) === slug(connection.name).slice(0, 16)).sort((a, b) => (a.id < b.id ? -1 : 1))

/**
 * What the user and the brain call a connection: its name, and, when another is named alike, who
 * signed in ("Gmail (ana@example.com)", D357), or else which it is ("Notion 1", "Notion 2").
 * @param {Connection} connection
 */
export const called = (connection, same = alike(connection)) => (same.length < 2 ? connection.name : connection.account ? `${connection.name} (${connection.account})`
  : `${connection.name} ${same.findIndex((other) => other.id === connection.id) + 1 || same.length + 1}`)

/** The name the brain calls a tool by, in a script too: `mail_search_emails`, then `mail_2_search_emails` for another account alike. @param {Connection} connection @param {string} name */
export const toolName = (connection, name, rank = alike(connection).findIndex((other) => other.id === connection.id)) => identifier(`${slug(connection.name).slice(0, 16) || 'service'}${rank > 0 ? `_${rank + 1}` : ''}_${name}`).slice(0, 64)

/** What a tool is called where the user sees it. @param {McpTool} tool */
export function labelOf(tool) { return tool.title ?? tool.annotations?.title ?? tool.name }
/** The logo of the service Jean knows a connection is made to, if any (D159). @param {Connection} connection */
export function logoOf(connection) { return known(app.policy).find((entry) => entry.url === connection.url)?.logo }

/** @param {Connection} connection @param {McpTool & { at: string }} tool @returns {import('../../core/loop.js').Tool} */
function asTool(connection, tool) {
  const { $schema, ...schema } = tool.inputSchema ?? {}
  const label = labelOf(tool)
  const call = (/** @type {any} */ args, /** @type {AbortSignal | undefined} */ signal) => client(connection, tool.at).callTool(tool, args ?? {}, signal)
  return {
    spec: { name: toolName(connection, tool.name), description: `${called(connection)}: ${tool.description ?? label}`, parameters: { ...schema, type: 'object' } },
    kind: tool.annotations?.readOnlyHint ? 'fetch' : 'other',
    deferred: true,
    service: connection.id,
    title: () => `${called(connection)}: ${label}`,
    // An access token refused before it expired is renewed once, unless renewing it was refused. A
    // service that lists its tools to anyone may still run them only for someone signed in (D193):
    // its row offers it. Refused once signed in, it is what the sign-in didn't allow (D344). Google's services mark the task,
    // and run only for a brain whose service doesn't train on what it reads (D440).
    run: async (args, ctx) => {
      if (limited(connection) && (ctx.meta.limitedUse = true) && mayTrain(ctx.brain, app.policy)) throw new Error(`${called(connection)} isn't read by this brain: what Google's services bring in goes only to brains whose service never trains on it. Ask the user to pick one in the box, or to ask again with Auto, which picks one.`)
      return answer(connection, label, await call(args, ctx.signal).catch(async (error) => {
        if (!(error instanceof MCPError && error.auth)) throw error
        if (connection.auth === 'none') {
          status.value = { ...status.value, [connection.id]: { ...status.value[connection.id], error: 'auth', challenge: error.challenge } }
          throw new Error(signInFirst(connection))
        }
        if (error.status === 403 && connection.auth === 'oauth') throw new Error(`${called(connection)} refused this: the user's sign-in doesn't allow it. To allow it, they can disconnect ${called(connection)} in Settings › Connections and connect it again.`)
        if (error.status !== 401 || connection.auth !== 'oauth' || status.value[connection.id]?.error === 'auth') throw error
        await credential(connection, true)
        return call(args, ctx.signal)
      }), ctx)
    },
  }
}

/** A page, email or document a result brings in, if the item is one. @param {any} item */
const linked = (item) => (item.uri || item.resource?.uri ? { ...item, ...item.resource } : null)

/**
 * What the brain reads back. Each page, email or document the result brings in is a numbered
 * source; a result that names none is one source itself.
 * @param {Connection} connection @param {string} label @param {CallResult} result @param {import('../../core/loop.js').ToolContext} ctx
 */
function answer(connection, label, result, ctx) {
  const items = result.content ?? []
  if (result.isError) throw new Error(items.map((item) => item.text ?? '').join('\n').trim() || 'The service reported an error.')
  const sources = items.flatMap((item) => linked(item) ?? [])
  const numbers = ctx.cite(sources.length ? sources.map(({ uri, title, name, description }) => ({ title: title ?? name ?? uri, url: uri, ...(description && { quote: description }) }))
    : [{ title: `${called(connection)}: ${label}` }])
  let n = 0
  const out = [...(sources.length ? [] : [`Source [${numbers[0]}]: ${called(connection)}`]), ...items.map((item) => {
    const source = linked(item)
    return source ? `Source [${numbers[n++]}]: ${source.title ?? source.name ?? source.uri} (${source.uri})\n${source.text ?? source.description ?? ''}`.trim() : item.text ?? `(${item.type})`
  }), ...(items.length ? [] : [JSON.stringify(result.structuredContent ?? null)])].join('\n\n')
  return out.length > MAX_OUTPUT ? `${out.slice(0, MAX_OUTPUT)}\n… (cut here)` : out
}

effect(() => register({
  id: 'connections',
  tools: here().flatMap((connection) => (status.value[connection.id]?.tools ?? []).map((tool) => asTool(connection, tool))),
  rules: ['Find the tools of the services in <connections> with find_tools.'],
  // A task that used Google's services goes to no brain whose service may train on it, whoever asks it (D440).
  hooks: [{ on: 'turn.step', run: async (e, next) => (e.task && mayTrain(e.brain, app.policy) && !mayRead(e.brain, (await loadConversation(app.fs, e.task).catch(() => null))?.records ?? [], app.policy) ? refused(e.step !== undefined) : next(e)) },
    // What the user chose for a service stands over its kind's rule, freer only where the organisation set none; the guards
    // still come after (D295). Its calls are marked, so a card's Always allow or Never is kept to the service (D529).
    { on: 'tool.check', match: { service: /./ }, run: async (e, next) => {
      const said = await next(e)
      const own = chosen(e.service, e.kind)
      const freer = own && STRICT[own] < STRICT[/** @type {RuleValue} */ (said?.decision)]
      return said?.refuse || !own || (freer && app.policy.rules?.[e.kind]) ? { ...said, meta: { ...said?.meta, service: e.service } }
        : { decision: own, meta: { ...said?.meta, service: e.service }, ...(own === 'never' && { reason: "The user's settings for this service refuse this action." }) }
    } }],
  // Each service of the room's project, and the names of its tools.
  sections: async () => {
    const lines = here().map((connection) => [called(connection), ...(status.value[connection.id]?.tools ?? []).map((tool) => toolName(connection, tool.name))])
    return lines.length ? { connections: lines.map(([name, ...tools]) => `- ${name}${tools.length ? `: ${tools.join(', ')}` : ''}`).join('\n') } : {}
  },
  // Each service whose tools search the web, as they say themselves, for Settings › Web search (D271).
  searches: () => all().flatMap((connection) => {
    const [tools, logo] = [(status.value[connection.id]?.tools ?? []).filter(searchesWeb).map(labelOf), logoOf(connection)]
    return tools.length ? [{ name: called(connection), ...(logo && { logo: logoAt(logo) }), tools }] : []
  }),
  slots: {
    settings: { at: 80, id: 'connections', label: 'cap.connections.name', icon: icons.plug, draw: () => {
      if (!paging) { paging = true; import('./page.js').then((module) => { page.value = module.section }) }
      return page.value?.() ?? nothing
    } },
    // In +, a row whose menu beside it holds the room's connections (D292).
    add: { at: 5, draw: () => subRow('connections', icons.plug) },
    // What a service may do without asking, for Approvals' exceptions (D527), each taken back there.
    allowed: { at: 4, draw: () => all().flatMap((connection) => ['fetch', 'other'].filter((kind) => chosen(connection.id, kind) === 'allow')
      .map((kind) => ({ what: kind === 'fetch' ? 'reads' : 'acts', name: called(connection), stop: () => choose(connection.id, kind) }))) },
  },
}))
/** A request refused, which a turn's step says, with the picker open on the brains that may answer. @param {boolean} said */
async function* refused(said) {
  if (said) await useStrings('connections').then(() => (notify(t('connections.untrained')), import('../../ui/picker.js'))).then((picker) => picker.openPicker())
  throw new LLMError('This task used Google’s services, and this brain’s service may train on what it reads.', { code: 'aborted' })
}

/** Every connection's tools, asked for once this module loads (a brief waits for them). */
export const listed = list()
// One that comes after Jean opened (another tab, a sync) is asked as it comes, not once Jean opens again (D529).
effect(() => {
  const fresh = all().filter((connection) => !asked.has(connection.id))
  if (fresh.length) list(fresh)
})

/** The room's connections as the box's / names them (D199), by name: each with its logo and its tools' names. */
export const offered = () => byName(here(), called, locale.value).map((connection) => ({
  name: called(connection),
  logo: logoOf(connection),
  tools: (status.value[connection.id]?.tools ?? []).map((tool) => toolName(connection, tool.name)),
}))

// ─── Connecting ──────────────────────────────────────────────────────────────

/** "https://mcp.notion.com/mcp" → "Notion"; an address without a name keeps its host. @param {string} url */
export function nameFor(url) {
  const { hostname, host } = new URL(url)
  const words = hostname.split('.').filter((word) => !/^(mcp|www|api)$/.test(word))
  const name = /^[\d.]+$|^localhost$/.test(hostname) ? host : words.at(-2) ?? words[0] ?? host
  return name[0].toUpperCase() + name.slice(1)
}

/** Kept, and in Settings its page opened, which says what Jean may do there (D529). @param {Connection} connection @param {(McpTool & { at: string })[]} tools */
async function save(connection, tools) {
  const again = (app.settings.value.connections ?? []).some((other) => other.id === connection.id)
  asked.add(connection.id)
  await updateSettings({ connections: [...(app.settings.value.connections ?? []).filter((other) => other.id !== connection.id), connection] })
  status.value = { ...status.value, [connection.id]: { tools } }
  message.value = null
  notify(t('connections.connected', { service: called(connection) }))
  if (app.dialog.peek() === 'settings' && sectionOpen() === 'connections') app.section.value = `connections/${connection.id}`
  // Its host, never its whole address, which may hold a key; signed in again, it was there already (D421).
  if (!again) act('connection.add', { id: connection.id, address: new URL(connection.url).hostname, auth: connection.auth, title: connection.name })
}

/** Changes the user's own connection: what it is called, or the projects it is used in. @param {Connection} connection @param {Partial<Connection>} patch */
export const change = (connection, patch) => updateSettings({ connections: (app.settings.value.connections ?? []).map((other) => (other.id === connection.id ? { ...other, ...patch } : other)) })

/** Why it didn't connect: an address to check, or, for a service Jean knows, just that. @param {Connection} connection @param {string} key */
const failed = (connection, key) => (knownFor(connection.url, app.policy, served.value) ? t('connections.failedKnown', { service: called(connection) }) : t(key))

/**
 * Connects a service, with each server it reaches; one that wants a sign-in sends the user there,
 * at once when Jean knows what it asks for (D344), and one that doesn't answer a browser is tried
 * again through the gateway, when it relays to its host. True once connected.
 * @param {string} url @param {string} name @param {{ key?: string, gateway?: boolean }} [options]
 */
export async function connectTo(url, name, { key = '', gateway = false } = {}) {
  const entry = knownFor(url, app.policy, served.value)
  /** @type {Connection} */
  const connection = { id: ulid(), name, url, auth: key ? 'key' : 'none', ...(gateway && { gateway }), ...(entry?.servers && { servers: entry.servers }) }
  message.value = { kind: 'busy', text: t('brain.connecting') }
  if (entry?.scopes && !key) return signIn(connection).then(() => false)
  try {
    if (key) await setSecret(app.fs, connection.id, key)
    await save(connection, await toolsAt(connection))
    return true
  } catch (error) {
    if (key) await deleteSecret(app.fs, connection.id)
    else if (error instanceof MCPError && error.auth) return signIn(connection, error.challenge).then(() => false)
    if (error instanceof TypeError && !gateway && covers(served.value.hosts, new URL(url))) return connectTo(url, name, { key, gateway: true })
    console.warn(url, error)
    message.value = { kind: 'error', text: failed(connection, 'connections.failed') }
    return false
  }
}

/** The services Jean knows, those the gateway reaches included (D191), as Settings shows them. */
export const services = () => known(app.policy, served.value)
/** Those it reaches that no project has connected yet, which search offers to connect (D133). */
export const unconnected = () => services().filter((entry) => entry.via && entry.url && !all().some((connection) => connection.url === entry.url))

/**
 * A service picked in the box (D199), connected in a click, its sign-in included; Settings opens on
 * its page when it couldn't be, saying why. @param {Listed} entry
 */
export async function connectService(entry) {
  if (await connectTo(String(entry.url), entry.name, { gateway: entry.via === 'gateway' })) return
  const said = message.peek()
  if (said?.kind !== 'error') return
  openSettings(`connections/add/${entry.id}`)
  message.value = said
}

/**
 * Sends the user to the service's sign-in; they come back here with a code. Another account of a
 * service already connected is asked for by name. @param {Connection} connection @param {string | null} [challenge] its 401's
 */
export async function signIn(connection, challenge) {
  message.value = { kind: 'busy', text: t('brain.connecting') }
  try {
    const fetch = reach(connection)
    // An API names no sign-in server; its entry does (D349).
    const entry = knownFor(connection.url, app.policy, served.value)
    const metadata = await discover(connection.url, { challenge, fetch, issuer: entry?.api ? entry.app : undefined })
    const redirectURI = location.origin + location.pathname
    // A service that can't register Jean takes the app the organisation registered there, or the gateway's.
    const given = entry?.clientId ?? (connection.gateway ? served.value.clients[metadata.issuer] : undefined)
    const { clientId, scope: registered } = given ? { clientId: given } : await registerClient(metadata, { redirectURI, name: BRAND.name, fetch })
    const another = all().some((other) => other.id !== connection.id && other.url === connection.url)
    const { url, pending } = await authorization(metadata, { clientId, redirectURI, another, scopes: entry?.scopes, params: entry?.authorize, registered })
    sessionStorage.setItem(PENDING, JSON.stringify({ ...pending, connection: { ...connection, auth: 'oauth' }, route: location.hash, draft: app.draft.value }))
    location.assign(url)
  } catch (error) {
    console.warn(connection.url, error)
    message.value = { kind: 'error', text: failed(connection, 'connections.needsKey') }
  }
}

/** Back from signing in (`?state=…`): keep the tokens and the connection, where the user was, on its page. False when it wasn't a connection's. */
export async function finishSignIn() {
  const params = new URLSearchParams(location.search)
  const saved = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null')
  if (!saved) return false
  sessionStorage.removeItem(PENDING)
  // Settings opens once the conversation under it is open again, since opening one closes it.
  await returnTo(saved.route ?? '')
  app.draft.value = saved.draft ?? ''
  openSettings('connections')
  try {
    const { account, ...tokens } = await finish(params, saved, reach(saved.connection))
    await setSecret(app.fs, saved.connection.id, JSON.stringify(tokens))
    await save(Object.assign(saved.connection, account && { account }), await toolsAt(saved.connection))
  } catch (error) {
    console.warn(error)
    message.value = { kind: 'error', text: failed(saved.connection, 'connections.failed') }
  }
  return true
}

/** Disconnects the user's own, its key and what was chosen for it gone too, once its page asked. @param {Connection} connection */
export async function remove(connection) {
  await deleteSecret(app.fs, connection.id)
  const { [connection.id]: _, ...services } = app.settings.value.services ?? {}
  await updateSettings({ connections: (app.settings.value.connections ?? []).filter((other) => other.id !== connection.id), services })
  act('connection.remove', { id: connection.id, address: new URL(connection.url).hostname })
}

/** Opens Settings on Connections; resolves when it closes (the brain's offer waits for it). */
export const connect = () => new Promise((resolve) => {
  openSettings('connections')
  const stop = effect(() => {
    if (app.dialog.value !== 'settings') queueMicrotask(() => resolve(stop()))
  })
})

// A service that failed to connect is forgotten once Settings closes.
effect(() => {
  if (app.dialog.value !== 'settings' && message.peek()?.kind === 'error') message.value = null
})

/** "Outlook, OneDrive, Teams", in the user's language. @param {string[]} names */
export function products(names) { return new Intl.ListFormat(intlLocales(), { type: 'unit', style: 'short' }).format(names) }
