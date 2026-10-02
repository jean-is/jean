// Connections (docs/product.md): the services the user already uses, their email, documents or
// calendar, reached through MCP (D21, D86). A connection is an address, plus a key or a sign-in
// when the service asks for one, kept encrypted in .secrets/ and never in a backup. Its tools are
// deferred (D47): <connections> names them, and the brain finds them with find_tools or calls
// them from a script. Reading through a connection is "Using the internet", anything else
// "Sending and sharing": both "Ask me first" by default. What they bring in is cited by number.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register } from '../../ui/caps.js'
import { app, effective, updateSettings, notify } from '../../ui/state.js'
import { getSecret, setSecret, deleteSecret } from '../../ui/secrets.js'
import { syncDialog, closed, backdrop, head } from '../../ui/dialogs.js'
import { mcpClient, MCPError } from './mcp.js'
import { discover, registerClient, authorization, finish, refresh } from './auth.js'
import { slug } from '../../core/settings.js'
import { ulid } from '../../core/ulid.js'
import { BRAND } from '../../brand.js'
import { t } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'

/** @import { Connection } from '../../core/settings.js' */
/** @import { McpTool, CallResult } from './mcp.js' */

// Kept in this tab while the user signs in elsewhere.
const PENDING = 'app.connect'
// Longer results are cut, so one call can't flood a small brain's context.
const MAX_OUTPUT = 12_000

/** What each connection offers now: its tools, or why they couldn't be listed. */
const status = signal(/** @type {Record<string, { tools?: McpTool[], error?: 'auth' | 'failed' }>} */ ({}))
const message = signal(/** @type {{ kind: 'busy' | 'error', text: string } | null} */ (null))

/** The organisation's connections (policy), then the user's. @returns {Connection[]} */
const all = () => [...(app.policy.connections ?? []), ...(effective.value.settings.connections ?? [])]

/** @type {Map<string, { url: string, mcp: ReturnType<typeof mcpClient> }>} */
const clients = new Map()

/** @param {Connection} connection */
function client(connection) {
  const found = clients.get(connection.id)
  if (found?.url === connection.url) return found.mcp
  const mcp = mcpClient({ url: connection.url, client: { name: BRAND.name, version: '0.5' }, authorization: () => credential(connection) })
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

/** The name the brain calls a tool by: `mail_search_emails`. @param {Connection} connection @param {string} name */
const toolName = (connection, name) => `${slug(connection.name).replace(/-/g, '_').slice(0, 16) || 'service'}_${name}`.replace(/[^\w-]/g, '_').slice(0, 64)

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
}))
list()

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

/** @param {SubmitEvent} event */
async function add(event) {
  event.preventDefault()
  const form = /** @type {HTMLFormElement} */ (event.target)
  const { url, key, name } = Object.fromEntries([...new FormData(form)].map(([field, value]) => [field, String(value).trim()]))
  // Tool names start with the service's: two services need two names.
  let unique = name || nameFor(url)
  for (let n = 2; all().some((other) => slug(other.name) === slug(unique)); n++) unique = `${name || nameFor(url)} ${n}`
  /** @type {Connection} */
  const connection = { id: ulid(), name: unique, url, auth: key ? 'key' : 'none' }
  message.value = { kind: 'busy', text: t('brain.connecting') }
  try {
    if (key) await setSecret(app.fs, connection.id, key)
    await save(connection, await client(connection).listTools())
    form.reset()
  } catch (error) {
    clients.delete(connection.id)
    if (key) await deleteSecret(app.fs, connection.id)
    else if (error instanceof MCPError && error.auth) return signIn(connection, error.challenge)
    console.warn(url, error)
    message.value = { kind: 'error', text: t('connections.failed') }
  }
}

/** Sends the user to the service's sign-in; they come back here with a code. @param {Connection} connection @param {string | null} [challenge] its 401's */
async function signIn(connection, challenge) {
  message.value = { kind: 'busy', text: t('brain.connecting') }
  try {
    const metadata = await discover(connection.url, { challenge })
    const redirectURI = location.origin + location.pathname
    const { url, pending } = await authorization(metadata, { clientId: await registerClient(metadata, { redirectURI, name: BRAND.name }), redirectURI })
    sessionStorage.setItem(PENDING, JSON.stringify({ ...pending, connection: { ...connection, auth: 'oauth' }, route: location.hash, draft: app.draft.value }))
    location.assign(url)
  } catch (error) {
    console.warn(connection.url, error)
    message.value = { kind: 'error', text: t('connections.needsKey') }
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
  app.dialog.value = 'connections'
  try {
    await setSecret(app.fs, saved.connection.id, JSON.stringify(await finish(params, saved)))
    await save(saved.connection, await client(saved.connection).listTools())
  } catch (error) {
    console.warn(error)
    message.value = { kind: 'error', text: t('connections.failed') }
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

/** Opens the connections; resolves when they close (the brain's offer waits for it). */
export const connect = () => new Promise((resolve) => {
  app.dialog.value = 'connections'
  const stop = effect(() => {
    if (app.dialog.value !== 'connections') queueMicrotask(() => resolve(stop()))
  })
})

class Connections extends Element {
  render() {
    const shown = message.value
    return html`<dialog class="sheet" @close=${closed('connections')} @click=${backdrop}>
      ${head(t('cap.connections.name'))}
      <p class="lede">${t('cap.connections.text', { name: BRAND.name })}</p>
      ${all().length ? html`<section class="connected"><ul>${all().map((connection) => {
        const { tools, error } = status.value[connection.id] ?? {}
        return html`<li class="connection">${icons.plug}
          <span class="connection-text"><strong dir="auto">${connection.name}</strong>
            <small dir="ltr">${error ? new URL(connection.url).host : tools?.map((tool) => tool.title ?? tool.name).join(' · ') ?? '…'}</small>
            ${error ? html`<small class="is-error">${t(error === 'auth' ? 'connections.needsKey' : 'connections.failed')}</small>` : nothing}</span>
          ${error === 'auth' ? html`<button class="button" @click=${() => signIn(connection)}>${t('brain.connect')}</button>`
            : (app.settings.value.connections ?? []).includes(connection) ? html`<button class="icon-button subtle" aria-label=${t('action.remove')}
              title=${t('action.remove')} @click=${() => remove(connection)}>${icons.trash}</button>` : nothing}
        </li>`
      })}</ul></section>` : nothing}
      <form class="stack" @submit=${add}>
        <label>${t('connections.address')}<input name="url" type="url" required dir="ltr" placeholder="https://…/mcp" autocomplete="off"></label>
        <label>${t('projects.name')}<input name="name" maxlength="40" dir="auto" autocomplete="off"></label>
        <label>${t('brain.key.label')}<input name="key" type="password" autocomplete="off" spellcheck="false" dir="ltr"></label>
        <p class="hint">${t('connections.keyHint')}</p>
        <button class="button primary">${t('brain.connect')}</button>
      </form>
      ${shown ? html`<p class="status is-${shown.kind}" role="status">${shown.text}</p>` : nothing}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'connections')
    if (app.dialog.value !== 'connections' && message.value?.kind === 'error') message.value = null
  }
}

define('app-connections', Connections)
