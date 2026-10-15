// Connections (docs/product.md): the services the user already uses, their email, documents or
// calendar, reached through MCP (D21, D86). A connection is an address, plus a key or a sign-in
// when the service asks for one, kept encrypted in .secrets/ and never in a backup. A service can
// be connected once an account, and a connection kept to some projects; one that doesn't answer a
// browser goes through the gateway, when one is named (D191). Its tools are deferred (D47):
// <connections> names those of the room's project, and the brain finds them with find_tools or
// calls them from a script. Reading through a connection is "Using the internet", anything else
// "Sending and sharing": both "Ask me first" by default. What they bring in is cited by number.
// They are a section of Settings, once on (D134).
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal, computed, effect } from '@preact/signals-core'
import { register, loaded } from '../../ui/caps.js'
import { app, effective, updateSettings, notify } from '../../ui/state.js'
import { getSecret, setSecret, deleteSecret } from '../../ui/secrets.js'
import { openSettings, placeable, where } from '../../ui/dialogs.js'
import { returnTo } from '../../ui/router.js'
import { mcpClient, MCPError, searchesWeb, toolsOf } from './mcp.js'
import { apiClient } from './google.js'
import { discover, registerClient, authorization, finish, refresh } from './auth.js'
import { known, knownFor, covers, logoAt } from './directory.js'
import { slug, serviceURL } from '../../core/settings.js'
import { identifier } from '../../core/deferred.js'
import { ulid } from '../../core/ulid.js'
import { BRAND } from '../../brand.js'
import { t, locale } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'
import { subRow } from '../../ui/composer.js'

/** @import { Connection, Project } from '../../core/settings.js' */
/** @import { McpTool, CallResult } from './mcp.js' */
/** @import { Known, Listed } from './directory.js' */

// Kept in this tab while the user signs in elsewhere.
const PENDING = 'app.connect'
// Longer results are cut, so one call can't flood a small brain's context.
const MAX_OUTPUT = 12_000

/** What each connection offers now: its tools, each with its server, or why they couldn't be listed or run; a refusal's challenge, for the sign-in. */
const status = signal(/** @type {Record<string, { tools?: (McpTool & { at: string })[], error?: 'auth' | 'failed', challenge?: string | null }>} */ ({}))
const message = signal(/** @type {{ kind: 'busy' | 'error', text: string } | null} */ (null))
/** Where what was clicked says how it went: under the services, or under the address typed. */
let place = /** @type {'top' | 'other'} */ ('top')
/** Whether the form for a service's address is open: null until the user says, then open only when no service is offered. */
const adding = signal(/** @type {boolean | null} */ (null))

/** The organisation's connections (policy), then the user's. @returns {Connection[]} */
const all = () => [...(app.policy.connections ?? []), ...(effective.value.settings.connections ?? [])]
/** Those of the room's project: the connections of every project, and those kept to this one. */
const here = () => all().filter((connection) => !connection.projects || connection.projects.includes(app.project.value.id))

// ─── The gateway (D191) ──────────────────────────────────────────────────────

/** Its address, from policy or settings: none until one is named. */
const gatewayAt = computed(() => serviceURL('gateway', app.settings.value, app.policy))
/** What it serves: the hosts it relays to, and the apps it holds, by sign-in server. */
const served = signal(/** @type {{ hosts: string[], clients: Record<string, string> }} */ ({ hosts: [], clients: {} }))

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
const signInFirst = (connection, name = called(connection)) => `${name} needs the user to sign in. Ask them to click Connect beside ${name} in Settings › Connections, then try again.`
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

/** Asks each connection what it offers. @param {Connection[]} [connections] */
const list = (connections = all()) => Promise.all(connections.map(async (connection) => {
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
const called = (connection, same = alike(connection)) => (same.length < 2 ? connection.name : connection.account ? `${connection.name} (${connection.account})`
  : `${connection.name} ${same.findIndex((other) => other.id === connection.id) + 1 || same.length + 1}`)

/** The name the brain calls a tool by, in a script too: `mail_search_emails`, then `mail_2_search_emails` for another account alike. @param {Connection} connection @param {string} name */
const toolName = (connection, name, rank = alike(connection).findIndex((other) => other.id === connection.id)) => identifier(`${slug(connection.name).slice(0, 16) || 'service'}${rank > 0 ? `_${rank + 1}` : ''}_${name}`).slice(0, 64)

/** What a tool is called where the user sees it. @param {McpTool} tool */
function labelOf(tool) { return tool.title ?? tool.annotations?.title ?? tool.name }
/** The logo of the service Jean knows a connection is made to, if any (D159). @param {Connection} connection */
function logoOf(connection) { return known(app.policy).find((entry) => entry.url === connection.url)?.logo }

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
    // its row offers it. Refused once signed in, it is what the sign-in didn't allow (D344).
    run: async (args, ctx) => answer(connection, label, await call(args, ctx.signal).catch(async (error) => {
      if (!(error instanceof MCPError && error.auth)) throw error
      if (connection.auth === 'none') {
        status.value = { ...status.value, [connection.id]: { ...status.value[connection.id], error: 'auth', challenge: error.challenge } }
        throw new Error(signInFirst(connection))
      }
      if (error.status === 403 && connection.auth === 'oauth') throw new Error(`${called(connection)} refused this: the user's sign-in doesn't allow it. To allow it, they can disconnect ${called(connection)} in Settings › Connections and connect it again.`)
      if (error.status !== 401 || connection.auth !== 'oauth' || status.value[connection.id]?.error === 'auth') throw error
      await credential(connection, true)
      return call(args, ctx.signal)
    }), ctx),
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
    settings: { at: 80, id: 'connections', label: 'cap.connections.name', icon: icons.plug, draw: panel },
    // In +, a row whose menu beside it holds the room's connections (D292).
    add: { at: 5, draw: () => subRow('connections', icons.plug) },
  },
}))
/** Every connection's tools, asked for once this module loads (a brief waits for them). */
export const listed = list()

/** The room's connections as the box's / names them (D199): each with its logo and its tools' names. */
export const offered = () => here().map((connection) => ({
  name: called(connection),
  logo: logoOf(connection),
  tools: (status.value[connection.id]?.tools ?? []).map((tool) => toolName(connection, tool.name)),
}))

// ─── Connecting ──────────────────────────────────────────────────────────────

/** "https://mcp.notion.com/mcp" → "Notion"; an address without a name keeps its host. @param {string} url */
function nameFor(url) {
  const { hostname, host } = new URL(url)
  const words = hostname.split('.').filter((word) => !/^(mcp|www|api)$/.test(word))
  const name = /^[\d.]+$|^localhost$/.test(hostname) ? host : words.at(-2) ?? words[0] ?? host
  return name[0].toUpperCase() + name.slice(1)
}

/** @param {Connection} connection @param {(McpTool & { at: string })[]} tools */
async function save(connection, tools) {
  await updateSettings({ connections: [...(app.settings.value.connections ?? []).filter((other) => other.id !== connection.id), connection] })
  status.value = { ...status.value, [connection.id]: { tools } }
  message.value = null
  notify(t('connections.connected', { service: called(connection) }))
}

/** Changes the user's own connection: what it is called, or the projects it is used in. @param {Connection} connection @param {Partial<Connection>} patch */
const change = (connection, patch) => updateSettings({ connections: (app.settings.value.connections ?? []).map((other) => (other.id === connection.id ? { ...other, ...patch } : other)) })

/** Why it didn't connect: an address to check, or, for a service Jean knows, just that. @param {Connection} connection @param {string} key */
const failed = (connection, key) => (knownFor(connection.url, app.policy, served.value) ? t('connections.failedKnown', { service: called(connection) }) : t(key))

/**
 * Connects a service, with each server it reaches; one that wants a sign-in sends the user there,
 * at once when Jean knows what it asks for (D344), and one that doesn't answer a browser is tried
 * again through the gateway, when it relays to its host. True once connected.
 * @param {string} url @param {string} name @param {{ key?: string, gateway?: boolean }} [options]
 */
async function connectTo(url, name, { key = '', gateway = false } = {}) {
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

/** The services Jean knows, those the gateway reaches included (D191), as the panel shows them. */
export const services = () => known(app.policy, served.value)

/**
 * A service picked in the box (D199), connected as its tile connects it, its sign-in included;
 * Settings opens on Connections when it couldn't be, saying why. @param {Listed} entry
 */
export async function connectService(entry) {
  place = 'top'
  if (!(await connectTo(String(entry.url), entry.name, { gateway: entry.via === 'gateway' })) && message.value?.kind === 'error') openSettings('connections')
}

/** @param {SubmitEvent} event */
async function add(event) {
  event.preventDefault()
  const form = /** @type {HTMLFormElement} */ (event.target)
  const { url, key, name } = Object.fromEntries([...new FormData(form)].map(([field, value]) => [field, String(value).trim()]))
  if (await connectTo(url, name || nameFor(url), { key })) adding.value = false
}

/**
 * Sends the user to the service's sign-in; they come back here with a code. Another account of a
 * service already connected is asked for by name. @param {Connection} connection @param {string | null} [challenge] its 401's
 */
async function signIn(connection, challenge) {
  message.value = { kind: 'busy', text: t('brain.connecting') }
  try {
    const fetch = reach(connection)
    // An API names no sign-in server; its entry does (D349).
    const entry = knownFor(connection.url, app.policy, served.value)
    const metadata = await discover(connection.url, { challenge, fetch, issuer: entry?.api ? entry.app : undefined })
    const redirectURI = location.origin + location.pathname
    // A service that can't register Jean takes the app the organisation registered there, or the gateway's.
    const clientId = entry?.clientId ?? (connection.gateway ? served.value.clients[metadata.issuer] : undefined)
      ?? await registerClient(metadata, { redirectURI, name: BRAND.name, fetch })
    const another = all().some((other) => other.id !== connection.id && other.url === connection.url)
    const { url, pending } = await authorization(metadata, { clientId, redirectURI, another, scopes: entry?.scopes, params: entry?.authorize })
    sessionStorage.setItem(PENDING, JSON.stringify({ ...pending, connection: { ...connection, auth: 'oauth' }, route: location.hash, draft: app.draft.value }))
    location.assign(url)
  } catch (error) {
    console.warn(connection.url, error)
    message.value = { kind: 'error', text: failed(connection, 'connections.needsKey') }
  }
}

/** Back from signing in (`?state=…`): keep the tokens and the connection, where the user was. False when it wasn't a connection's. */
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

/** @param {Connection} connection */
async function remove(connection) {
  if (!confirm(t('connections.confirmRemove', { service: called(connection) }))) return
  await deleteSecret(app.fs, connection.id)
  await updateSettings({ connections: (app.settings.value.connections ?? []).filter((other) => other.id !== connection.id) })
}

/** Opens Settings on Connections; resolves when it closes (the brain's offer waits for it). */
export const connect = () => new Promise((resolve) => {
  openSettings('connections')
  const stop = effect(() => {
    if (app.dialog.value !== 'settings') queueMicrotask(() => resolve(stop()))
  })
})

// A service that failed to connect is forgotten once Settings closes, and the address's form closes.
effect(() => {
  if (app.dialog.value === 'settings') return
  if (message.peek()?.kind === 'error') message.value = null
  adding.value = null
})

// ─── Settings › Connections ──────────────────────────────────────────────────

// Declared, not assigned, as the panel is: Settings may show it before this module has run to its end.
/** A service's logo (D159), or else its first letter. @param {Pick<Known, 'name' | 'logo'>} entry @param {string} [kind] */
function monogram({ name, logo }, kind = 'monogram') {
  return logo ? html`<img class="${kind} is-logo" src=${logoAt(logo)} alt="">` : html`<span class=${kind} aria-hidden="true">${[...name][0]}</span>`
}
/** "Outlook, OneDrive, Teams", in the user's language. @param {string[]} names */
function products(names) { return new Intl.ListFormat(locale.value, { type: 'unit', style: 'short' }).format(names) }
/** A project as its menu names it: the home project goes by the assistant's name. @param {Project} project */
function nameOf(project) { return String(project.data.default === true ? project.data.assistantName || BRAND.name : project.data.name) }
/** The projects that can be chosen: once projects are on, and there is more than one. */
function projects() { return loaded.value.has('projects') && app.projects.value.length > 1 ? app.projects.value : [] }

/** A service connected, opened to what it can do and to disconnect it; or why it can't be reached, and what fixes it. @param {Connection} connection */
function row(connection) {
  const { tools, error, challenge } = status.value[connection.id] ?? {}
  const own = (app.settings.value.connections ?? []).includes(connection)
  const kept = connection.projects && projects().filter((project) => connection.projects?.includes(project.id)).map(nameOf)
  const head = html`${monogram({ name: connection.name, logo: logoOf(connection) }, 'item-icon')}<span class="item-text"><strong><bdi>${called(connection)}</bdi></strong>${error
    ? html`<small class="is-error">${t(error === 'auth' ? 'connections.needsKey' : 'connections.failed')}</small>` : html`<small>${tools ? html`<span class="dot"></span>${t('connections.count', { count: tools.length })}` : '…'}${kept?.length
      ? html` · <bdi>${products(kept)}</bdi>` : nothing}</small>`}</span>`
  if (error || !tools) {
    return html`<li class="connection"><span class="item">${head}</span>${error === 'auth' ? html`<button class="button" @click=${() => { place = 'top'; signIn(connection, challenge) }}>${t('brain.connect')}</button>`
      : error ? html`<button class="icon-button subtle" aria-label=${t('action.retry')} @click=${() => list([connection])}>${icons.retry}</button>` : nothing}
      ${own ? html`<button class="icon-button subtle" aria-label=${t('action.remove')} @click=${() => remove(connection)}>${icons.trash}</button>` : nothing}</li>`
  }
  return html`<li class="connection"><details><summary>${head}${icons.chevron}</summary><div class="item-body">
    <ul class="chips">${tools.map((tool) => html`<li>${labelOf(tool)}</li>`)}</ul>
    ${own ? yours(connection) : nothing}
    <div class="row"><small class="muted" dir="ltr">${new URL(connection.url).host}</small>${own
      ? html`<button class="button subtle danger" @click=${() => remove(connection)}>${t('connections.disconnect')}</button>` : html`<small class="muted">${t('policy.locked')}</small>`}</div>
  </div></details></li>`
}

/**
 * What the user sets on their own connection: its name, two alike told apart by account, and, once
 * there are projects, where it is used: every project, or only those ticked (at least one).
 * @param {Connection} connection
 */
function yours(connection) {
  return html`<label class="connection-name">${t('projects.name')}<input dir="auto" maxlength="40" autocomplete="off" .value=${live(connection.name)}
      @change=${(/** @type {Event} */ e) => {
        const name = /** @type {HTMLInputElement} */ (e.target).value.trim()
        if (name && name !== connection.name) change(connection, { name })
      }}></label>
    ${placeable(connection) ? where(connection, (projects) => change(connection, { projects })) : nothing}`
}

/**
 * A service Jean knows: a click connects it, and once connected, another account. One not reached
 * yet is there too, disabled. A name like an address may wrap before its dot ("monday" ".com"),
 * one in two words where its capital starts the second ("Service" "Now").
 * @param {Listed} entry
 */
function tile(entry) {
  return html`<li><button class="service ${entry.via ? '' : 'is-soon'}" ?disabled=${!entry.via || message.value?.kind === 'busy'}
    @click=${() => { place = 'top'; connectTo(/** @type {string} */ (entry.url), entry.name, { gateway: entry.via === 'gateway' }) }}>
    ${monogram(entry)}<span><strong><bdi>${entry.name.split(/(?=\.)|(?<=[a-z])(?=[A-Z])/).map((part, i) => (i ? html`<wbr>${part}` : part))}</bdi></strong>${entry.includes
      ? html`<small class="includes">${products(entry.includes)}</small>` : nothing}</span>${entry.via ? icons.plus : nothing}
  </button></li>`
}

/** The form for any other service, by its address, opened by the panel's +. @param {unknown} said */
const other = (said) => html`<form id="connection-add" class="stack adding" @submit=${(/** @type {SubmitEvent} */ e) => { place = 'other'; add(e) }}>
  <h3>${t('connections.other')}</h3>
  <label>${t('connections.address')}<input name="url" type="url" required dir="ltr" placeholder="https://…/mcp" autocomplete="off"></label>
  <label>${t('projects.name')}<input name="name" maxlength="40" dir="auto" autocomplete="off"></label>
  <label>${t('brain.key.label')}<input name="key" type="password" autocomplete="off" spellcheck="false" dir="ltr"></label>
  <p class="hint">${t('connections.keyHint')}</p>
  <div class="row"><button class="button primary" ?disabled=${message.value?.kind === 'busy'}>${t('brain.connect')}</button></div>
  ${place === 'other' ? said : nothing}
</form>`

/** The gateway's address, unless the organisation set it (D191). Empty: back to the default. */
function gateway() {
  const set = app.policy.urls?.gateway !== undefined
  return html`<details class="other">
    <summary>${t('gateway.title')}</summary>
    <div class="stack">
      <p class="muted">${set ? t('policy.locked') : t('gateway.text', { name: BRAND.name })}</p>
      <input dir="ltr" type="url" spellcheck="false" autocomplete="off" placeholder="https://…" aria-label=${t('gateway.title')} .value=${live(gatewayAt.value)} ?disabled=${set}
        @change=${(/** @type {Event} */ e) => {
          const { gateway: _, ...urls } = app.settings.value.urls ?? {}
          const address = /** @type {HTMLInputElement} */ (e.target).value.trim()
          updateSettings({ urls: address ? { ...urls, gateway: address } : urls })
        }}>
    </div>
  </details>`
}

/**
 * Settings' Connections: the services connected, then every service Jean knows, a tile each to
 * connect in one click, those not reached yet disabled; any other by its address, behind the +
 * at the top; and the gateway.
 */
function panel() {
  const shown = message.value
  const said = shown ? html`<p class="status is-${shown.kind}" role="status">${shown.text}</p>` : nothing
  const services = known(app.policy, served.value)
  const open = adding.value ?? !services.some((entry) => entry.via)
  return html`<header class="panel-head">
      <p class="lede">${t('cap.connections.text', { name: BRAND.name })}</p>
      <button class="icon-button" aria-expanded=${String(open)} aria-controls="connection-add" aria-label=${t('connections.other')}
        @click=${() => {
          adding.value = !open
          if (!open) requestAnimationFrame(() => /** @type {HTMLInputElement | null} */ (document.querySelector('#connection-add input'))?.focus())
        }}>${icons.plus}</button>
    </header>
    ${open ? other(said) : nothing}
    ${all().length ? html`<section><h3>${t('connections.yours')}</h3><ul class="list connections">${all().map(row)}</ul></section>` : nothing}
    ${place === 'top' ? said : nothing}
    ${services.length ? html`<section>
      <h3>${t('cap.connections.yes')}</h3>
      <ul class="services">${services.map(tile)}</ul>
    </section>` : nothing}
    ${gateway()}`
}
