// Connections (docs/product.md): the services the user already uses, their email, documents or
// calendar, reached through MCP (D21, D86). A connection is an address, plus a key or a sign-in
// when the service asks for one, kept encrypted in .secrets/ and never in a backup. Its tools are
// deferred (D47): <connections> names them, and the brain finds them with find_tools or calls
// them from a script. Reading through a connection is "Using the internet", anything else
// "Sending and sharing": both "Ask me first" by default. What they bring in is cited by number.
// They are a section of Settings, once on (D134).
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, effective, updateSettings, notify } from '../../ui/state.js'
import { getSecret, setSecret, deleteSecret } from '../../ui/secrets.js'
import { openSettings } from '../../ui/dialogs.js'
import { mcpClient, MCPError } from './mcp.js'
import { discover, registerClient, authorization, finish, refresh } from './auth.js'
import { known, knownFor } from './directory.js'
import { slug } from '../../core/settings.js'
import { identifier } from '../../core/deferred.js'
import { ulid } from '../../core/ulid.js'
import { BRAND } from '../../brand.js'
import { t, locale } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'

/** @import { Connection } from '../../core/settings.js' */
/** @import { McpTool, CallResult } from './mcp.js' */
/** @import { Known } from './directory.js' */

// Kept in this tab while the user signs in elsewhere.
const PENDING = 'app.connect'
// Longer results are cut, so one call can't flood a small brain's context.
const MAX_OUTPUT = 12_000

/** What each connection offers now: its tools, or why they couldn't be listed. */
const status = signal(/** @type {Record<string, { tools?: McpTool[], error?: 'auth' | 'failed' }>} */ ({}))
const message = signal(/** @type {{ kind: 'busy' | 'error', text: string } | null} */ (null))
/** Where what was clicked says how it went: under the services, or under the address typed. */
let place = /** @type {'top' | 'other'} */ ('top')

/** The organisation's connections (policy), then the user's. @returns {Connection[]} */
const all = () => [...(app.policy.connections ?? []), ...(effective.value.settings.connections ?? [])]

/** @type {Map<string, { url: string, mcp: ReturnType<typeof mcpClient> }>} */
const clients = new Map()

/** @param {Connection} connection */
function client(connection) {
  const found = clients.get(connection.id)
  if (found?.url === connection.url) return found.mcp
  const mcp = mcpClient({ url: connection.url, client: { name: BRAND.name, version: '0.6' }, authorization: () => credential(connection) })
  clients.set(connection.id, { url: connection.url, mcp })
  return mcp
}

/** The Authorization header: a key, or an access token renewed before it runs out. @param {Connection} connection @param {boolean} [renew] */
async function credential(connection, renew = false) {
  const secret = connection.auth === 'none' ? null : await getSecret(app.fs, connection.id)
  if (!secret || connection.auth === 'key') return secret ? `Bearer ${secret}` : undefined
  let tokens = JSON.parse(secret)
  if (renew || tokens.expiresAt < Date.now() + 60_000) await setSecret(app.fs, connection.id, JSON.stringify(tokens = await refresh(tokens)))
  return `Bearer ${tokens.access}`
}

/** Asks each connection what it offers. @param {Connection[]} [connections] */
const list = (connections = all()) => Promise.all(connections.map(async (connection) => {
  const now = await client(connection).listTools().then((tools) => ({ tools }), (error) => {
    console.warn(connection.name, error)
    return { error: /** @type {'auth' | 'failed'} */ (error instanceof MCPError && error.auth ? 'auth' : 'failed') }
  })
  status.value = { ...status.value, [connection.id]: now }
}))

/** The name the brain calls a tool by, in a script too: `mail_search_emails`. @param {Connection} connection @param {string} name */
const toolName = (connection, name) => identifier(`${slug(connection.name).slice(0, 16) || 'service'}_${name}`).slice(0, 64)

/** @param {Connection} connection @param {McpTool} tool @returns {import('../../core/loop.js').Tool} */
function asTool(connection, tool) {
  const { $schema, ...schema } = tool.inputSchema ?? {}
  const label = tool.title ?? tool.annotations?.title ?? tool.name
  const call = (/** @type {any} */ args, /** @type {AbortSignal | undefined} */ signal) => client(connection).callTool(tool, args ?? {}, signal)
  return {
    spec: { name: toolName(connection, tool.name), description: `${connection.name}: ${tool.description ?? label}`, parameters: { ...schema, type: 'object' } },
    kind: tool.annotations?.readOnlyHint ? 'fetch' : 'other',
    deferred: true,
    title: () => `${connection.name}: ${label}`,
    // An access token refused before it expired is renewed once.
    run: async (args, ctx) => answer(connection, label, await call(args, ctx.signal).catch(async (error) => {
      if (!(error instanceof MCPError && error.status === 401 && connection.auth === 'oauth')) throw error
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
    : [{ title: `${connection.name}: ${label}` }])
  let n = 0
  const out = [...(sources.length ? [] : [`Source [${numbers[0]}]: ${connection.name}`]), ...items.map((item) => {
    const source = linked(item)
    return source ? `Source [${numbers[n++]}]: ${source.title ?? source.name ?? source.uri} (${source.uri})\n${source.text ?? source.description ?? ''}`.trim() : item.text ?? `(${item.type})`
  }), ...(items.length ? [] : [JSON.stringify(result.structuredContent ?? null)])].join('\n\n')
  return out.length > MAX_OUTPUT ? `${out.slice(0, MAX_OUTPUT)}\n… (cut here)` : out
}

effect(() => register({
  id: 'connections',
  tools: all().flatMap((connection) => (status.value[connection.id]?.tools ?? []).map((tool) => asTool(connection, tool))),
  rules: ['Find the tools of the services in <connections> with find_tools.'],
  // Each service, and the names of its tools.
  sections: async () => {
    const lines = all().map((connection) => [connection.name, ...(status.value[connection.id]?.tools ?? []).map((tool) => toolName(connection, tool.name))])
    return lines.length ? { connections: lines.map(([name, ...tools]) => `- ${name}${tools.length ? `: ${tools.join(', ')}` : ''}`).join('\n') } : {}
  },
  panel,
}))
/** Every connection's tools, asked for once this module loads (a brief waits for them). */
export const listed = list()

// ─── Connecting ──────────────────────────────────────────────────────────────

/** "https://mcp.notion.com/mcp" → "Notion"; an address without a name keeps its host. @param {string} url */
function nameFor(url) {
  const { hostname, host } = new URL(url)
  const words = hostname.split('.').filter((word) => !/^(mcp|www|api)$/.test(word))
  const name = /^[\d.]+$|^localhost$/.test(hostname) ? host : words.at(-2) ?? words[0] ?? host
  return name[0].toUpperCase() + name.slice(1)
}

/** @param {Connection} connection @param {McpTool[]} tools */
async function save(connection, tools) {
  await updateSettings({ connections: [...(app.settings.value.connections ?? []).filter((other) => other.id !== connection.id), connection] })
  status.value = { ...status.value, [connection.id]: { tools } }
  message.value = null
  notify(t('connections.connected', { service: connection.name }))
}

/** Why it didn't connect: an address to check, or, for a service Jean knows, just that. @param {Connection} connection @param {string} key */
const failed = (connection, key) => (knownFor(connection.url, app.policy) ? t('connections.failedKnown', { service: connection.name }) : t(key))

/**
 * Connects a service; one that wants a sign-in sends the user there. True once it is connected.
 * @param {string} url @param {string} name @param {string} [key]
 */
async function connectTo(url, name, key = '') {
  // Tool names start with the service's: two services need two names.
  let unique = name
  for (let n = 2; all().some((other) => slug(other.name) === slug(unique)); n++) unique = `${name} ${n}`
  /** @type {Connection} */
  const connection = { id: ulid(), name: unique, url, auth: key ? 'key' : 'none' }
  message.value = { kind: 'busy', text: t('brain.connecting') }
  try {
    if (key) await setSecret(app.fs, connection.id, key)
    await save(connection, await client(connection).listTools())
    return true
  } catch (error) {
    clients.delete(connection.id)
    if (key) await deleteSecret(app.fs, connection.id)
    else if (error instanceof MCPError && error.auth) return signIn(connection, error.challenge).then(() => false)
    console.warn(url, error)
    message.value = { kind: 'error', text: failed(connection, 'connections.failed') }
    return false
  }
}

/** @param {SubmitEvent} event */
async function add(event) {
  event.preventDefault()
  const form = /** @type {HTMLFormElement} */ (event.target)
  const { url, key, name } = Object.fromEntries([...new FormData(form)].map(([field, value]) => [field, String(value).trim()]))
  if (await connectTo(url, name || nameFor(url), key)) form.reset()
}

/** Sends the user to the service's sign-in; they come back here with a code. @param {Connection} connection @param {string | null} [challenge] its 401's */
async function signIn(connection, challenge) {
  message.value = { kind: 'busy', text: t('brain.connecting') }
  try {
    const metadata = await discover(connection.url, { challenge })
    const redirectURI = location.origin + location.pathname
    // A service that can't register Jean takes the client the organisation registered there.
    const clientId = knownFor(connection.url, app.policy)?.clientId ?? await registerClient(metadata, { redirectURI, name: BRAND.name })
    const { url, pending } = await authorization(metadata, { clientId, redirectURI })
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
  history.replaceState(null, '', location.pathname + (saved.route ?? ''))
  dispatchEvent(new HashChangeEvent('hashchange'))
  app.draft.value = saved.draft ?? ''
  openSettings('connections')
  try {
    await setSecret(app.fs, saved.connection.id, JSON.stringify(await finish(params, saved)))
    await save(saved.connection, await client(saved.connection).listTools())
  } catch (error) {
    console.warn(error)
    message.value = { kind: 'error', text: failed(saved.connection, 'connections.failed') }
  }
  return true
}

/** @param {Connection} connection */
async function remove(connection) {
  if (!confirm(t('connections.confirmRemove', { service: connection.name }))) return
  await deleteSecret(app.fs, connection.id)
  clients.delete(connection.id)
  await updateSettings({ connections: (app.settings.value.connections ?? []).filter((other) => other.id !== connection.id) })
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

// Declared, not assigned, as the panel is: Settings may show it before this module has run to its end.
/** A service's logo (D159), or else its first letter. @param {Pick<Known, 'name' | 'logo'>} entry @param {string} [kind] */
function monogram({ name, logo }, kind = 'monogram') {
  return logo ? html`<img class="${kind} is-logo" src=${new URL(`logos/${logo}`, import.meta.url).href} alt="">` : html`<span class=${kind} aria-hidden="true">${[...name][0]}</span>`
}
/** "Outlook, OneDrive, Teams", in the user's language. @param {string[]} names */
function products(names) { return new Intl.ListFormat(locale.value, { type: 'unit', style: 'short' }).format(names) }

/** A service connected, opened to what it can do and to disconnect it; or why it can't be reached, and what fixes it. @param {Connection} connection */
function row(connection) {
  const { tools, error } = status.value[connection.id] ?? {}
  const own = (app.settings.value.connections ?? []).includes(connection)
  const head = html`${monogram({ name: connection.name, logo: knownFor(connection.url, app.policy)?.logo }, 'item-icon')}<span class="item-text"><strong><bdi>${connection.name}</bdi></strong>${error
    ? html`<small class="is-error">${t(error === 'auth' ? 'connections.needsKey' : 'connections.failed')}</small>` : html`<small>${tools ? html`<span class="dot"></span>${t('connections.count', { count: tools.length })}` : '…'}</small>`}</span>`
  if (error || !tools) {
    return html`<li class="connection"><span class="item">${head}</span>${error === 'auth' ? html`<button class="button" @click=${() => { place = 'top'; signIn(connection) }}>${t('brain.connect')}</button>`
      : error ? html`<button class="icon-button subtle" aria-label=${t('action.retry')} title=${t('action.retry')} @click=${() => list([connection])}>${icons.retry}</button>` : nothing}
      ${own ? html`<button class="icon-button subtle" aria-label=${t('action.remove')} title=${t('action.remove')} @click=${() => remove(connection)}>${icons.trash}</button>` : nothing}</li>`
  }
  return html`<li class="connection"><details><summary>${head}${icons.chevron}</summary><div class="item-body">
    <ul class="chips">${tools.map((tool) => html`<li>${tool.title ?? tool.annotations?.title ?? tool.name}</li>`)}</ul>
    <div class="row"><small class="muted" dir="ltr">${new URL(connection.url).host}</small>${own
      ? html`<button class="button subtle danger" @click=${() => remove(connection)}>${t('connections.disconnect')}</button>` : html`<small class="muted">${t('policy.locked')}</small>`}</div>
  </div></details></li>`
}

/** Settings' Connections: the services connected, then those Jean knows, a tile each to connect in one click, those not yet, and any other by its address. */
function panel() {
  const shown = message.value
  const said = shown ? html`<p class="status is-${shown.kind}" role="status">${shown.text}</p>` : nothing
  const { ready, later } = known(app.policy)
  // A service already connected leaves the tiles.
  const offered = ready.filter((entry) => !all().some((connection) => connection.url === entry.url))
  return html`<p class="lede">${t('cap.connections.text', { name: BRAND.name })}</p>
    ${all().length ? html`<section><h3>${t('connections.yours')}</h3><ul class="list connections">${all().map(row)}</ul></section>` : nothing}
    ${place === 'top' ? said : nothing}
    ${offered.length || later.length ? html`<section>
      <h3>${t('cap.connections.yes')}</h3>
      ${offered.length ? html`<ul class="services">${offered.map((entry) => html`<li>
        <button class="service" ?disabled=${shown?.kind === 'busy'} @click=${() => { place = 'top'; connectTo(/** @type {string} */ (entry.url), entry.name) }}>
          ${monogram(entry)}<span><strong><bdi>${entry.name}</bdi></strong>${entry.includes ? html`<small>${products(entry.includes)}</small>` : nothing}</span>${icons.plus}
        </button></li>`)}</ul>` : nothing}
      ${later.length ? html`<div class="later">
        <h4>${t('connections.notYet')}</h4>
        <ul class="services is-later">${later.map((entry) => html`<li>${monogram(entry)}<span dir="auto">${entry.name}</span></li>`)}</ul>
        <p class="hint">${t('connections.later')}</p>
      </div>` : nothing}
    </section>` : nothing}
    <details class="other" ?open=${!ready.length}>
      <summary>${t('connections.other')}</summary>
      <form class="stack" @submit=${(/** @type {SubmitEvent} */ e) => { place = 'other'; add(e) }}>
        <label>${t('connections.address')}<input name="url" type="url" required dir="ltr" placeholder="https://…/mcp" autocomplete="off"></label>
        <label>${t('projects.name')}<input name="name" maxlength="40" dir="auto" autocomplete="off"></label>
        <label>${t('brain.key.label')}<input name="key" type="password" autocomplete="off" spellcheck="false" dir="ltr"></label>
        <p class="hint">${t('connections.keyHint')}</p>
        <div class="row"><button class="button primary">${t('brain.connect')}</button></div>
        ${place === 'other' ? said : nothing}
      </form>
    </details>`
}
