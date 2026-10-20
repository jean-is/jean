// Google's side of an organisation on Google Workspace that runs Jean (D344, D349, D440), at Google's
// own addresses: its sign-in, which takes only the web app the organisation's gateway holds, with its
// secret, and gives a refresh token only to an offline sign-in; Gmail's, Calendar's and Drive's APIs,
// which answer browsers, each opened by its own scopes; Workspace's MCP servers, one sign-in for all
// eight, which answer no browser; the AI gateway, on the organisation's network; and the organisation's
// gateway (D191, relay.js). All are the page's routes: Jean reaches them over HTTPS, as it would at work.
// The servers' tools are made up: Google's own list theirs only to a Workspace account in its preview.
import { createHash } from 'node:crypto'
import { BRAIN_URL } from '../helpers.js'
import { received, answer, organisationGateway } from './relay.js'

const ACCOUNTS = 'https://accounts.google.com'
const TOKEN = 'https://oauth2.googleapis.com/token'
const AUTH = 'https://www.googleapis.com/auth/'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE' }

export const AI_GATEWAY = 'https://ai.acme.example/v1'
export const GATEWAY = 'https://gateway.acme.example/'
/** The web app the organisation registered with Google, which its gateway holds, with its secret. */
export const CLIENT = '481516234200-acme.apps.googleusercontent.com'
export const SECRET = 'GOCSPX-acme-gateway-secret'

/**
 * The organisation's policy: its AI gateway, which its contract says never trains on what it is sent,
 * so it may read what Google's services bring in (D440); its gateway; and Connections from the start.
 * @param {{ trains?: boolean }} [options]
 */
export const policy = ({ trains = false } = {}) => ({
  brains: [{ id: 'corp', provider: 'custom', api: 'openai', baseURL: AI_GATEWAY, model: 'fake-brain-1', label: 'Acme AI', ...(trains === false && { trains }) }],
  urls: { gateway: GATEWAY },
  capabilities: { preUnlock: ['connections'] },
})

export const INBOX = [
  { id: '18f3a1', subject: 'Offsite agenda for November', from: 'Sam Ortiz <sam@acme.example>', snippet: 'The agenda is attached.' },
  { id: '18f3a2', subject: 'Contract renewal with Bistro', from: 'Lea Brun <lea@acme.example>', snippet: 'They agreed to the new terms.' },
  { id: '18f3a3', subject: 'Payroll closes on Friday', from: 'Payroll <payroll@acme.example>', snippet: 'Send your hours by Thursday.' },
]

/** Workspace's servers, by host: the scope each wants, and its one tool. */
export const SERVERS = /** @type {Record<string, { scope: string, tool: string, title: string, says: string }>} */ ({
  'gmailmcp.googleapis.com': { scope: 'gmail.modify', tool: 'search_threads', title: 'Search Gmail threads', says: '3 threads: Offsite agenda for November, Contract renewal with Bistro, Payroll closes on Friday.' },
  'drivemcp.googleapis.com': { scope: 'drive.readonly', tool: 'search_drive_files', title: 'Search Drive files', says: '1 file: Offsite plan (Google Docs), changed yesterday.' },
  'docsmcp.googleapis.com': { scope: 'documents', tool: 'get_document_text', title: 'Read a document', says: 'Offsite plan: two days in Lyon.' },
  'sheetsmcp.googleapis.com': { scope: 'spreadsheets', tool: 'read_sheet_values', title: 'Read a sheet', says: 'A1:B2 = Budget, 12000.' },
  'slidesmcp.googleapis.com': { scope: 'presentations', tool: 'get_presentation', title: 'Read a presentation', says: '12 slides: Offsite 2026.' },
  'calendarmcp.googleapis.com': { scope: 'calendar.events', tool: 'list_calendar_events', title: 'List calendar events', says: '1 event: Offsite, 12 November.' },
  'chatmcp.googleapis.com': { scope: 'chat.spaces.readonly', tool: 'list_chat_spaces', title: 'List Chat spaces', says: '2 spaces: Offsite, Finance.' },
  'people.googleapis.com': { scope: 'contacts.readonly', tool: 'search_people', title: 'Search contacts', says: '1 contact: Sam Ortiz, sam@acme.example.' },
})

/** The scope Google wants for a request to one of its APIs, by its address: one of these will do. @param {string} method @param {URL} url @returns {string[]} */
const wanted = (method, { hostname, pathname }) => (hostname === 'gmail.googleapis.com' ? ['gmail.modify']
  : pathname.startsWith('/calendar/v3/users/me/calendarList') ? ['calendar.calendarlist.readonly'] : pathname.startsWith('/calendar/v3/') ? ['calendar.events']
    : method === 'GET' ? ['drive.readonly', 'drive.file'] : ['drive.file'])

/**
 * Google, for one page. Its sign-in signs in at once, a refresh token only for `access_type=offline`;
 * its token endpoint takes the organisation's web app with its secret, from wherever it is asked.
 * Each token opens what its scopes cover, ending after `lifetime` seconds. Gmail has an inbox;
 * Calendar keeps the events added, Drive the documents made, found and exported in Markdown again.
 * Each Workspace server says where to sign in, starts a session (2025-06-18) and lists its tool to
 * a token with its scope; one asked from the page is refused, as Google's refuse browsers.
 * @param {import('@playwright/test').Page} page @param {{ jean: string, lifetime?: number }} options
 */
export async function fakeGoogle(page, { jean, lifetime = 3599 }) {
  const state = {
    /** Each sign-in's address. @type {URL[]} */ authorized: [],
    /** Each request to the token endpoint: its form, and who sent it. @type {{ form: URLSearchParams, from: 'page' | 'gateway' }[]} */ redeemed: [],
    /** Each address the organisation's gateway relayed to. @type {string[]} */ relayed: [],
    /** Each request to an API, with its Authorization. @type {{ method: string, url: URL, authorization: string }[]} */ api: [],
    /** Each request to a Workspace server, through the gateway or from the page. @type {{ host: string, method: string, authorization: string | null, session: string | null }[]} */ servers: [],
    /** @type {string[]} */ direct: [],
    /** What the AI gateway was asked, each request's body. @type {string[]} */ ai: [],
    /** Calendar's events and Drive's files, as Google keeps them. @type {any[]} */ events: [],
    /** @type {any[]} */ files: [],
  }
  /** @typedef {{ scopes: string[], challenge?: string, redirect?: string, offline?: boolean }} Grant */
  const [codes, refreshes, issued] = [/** @type {Map<string, Grant>} */ (new Map()), /** @type {Map<string, Grant>} */ (new Map()), /** @type {Map<string, Grant>} */ (new Map())]
  const sessions = new Set()
  let count = 0
  const json = (/** @type {unknown} */ body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...CORS, ...headers } })
  /** The scopes a token holds, without Google's prefix; none for a token Google didn't give. @param {string | null} authorization */
  const scopesOf = (authorization) => issued.get(String(authorization).replace(/^Bearer /, ''))?.scopes.map((scope) => scope.replace(AUTH, '')) ?? null

  /** @param {Request} request @param {'page' | 'gateway'} from @returns {Promise<Response>} */
  const accounts = async (request, from) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const url = new URL(request.url)
    if (url.href === `${ACCOUNTS}/.well-known/openid-configuration`) {
      return json({ issuer: ACCOUNTS, authorization_endpoint: `${ACCOUNTS}/o/oauth2/v2/auth`, token_endpoint: TOKEN, revocation_endpoint: 'https://oauth2.googleapis.com/revoke', scopes_supported: ['openid', 'email', 'profile'], code_challenge_methods_supported: ['plain', 'S256'] })
    }
    if (url.origin + url.pathname === `${ACCOUNTS}/o/oauth2/v2/auth`) {
      state.authorized.push(url)
      const asked = url.searchParams
      const back = new URL(asked.get('redirect_uri') ?? '')
      // Google shows its own page for an app or an address it doesn't know.
      if (asked.get('client_id') !== CLIENT || back.href !== jean) return new Response('Error 400: redirect_uri_mismatch', { status: 400 })
      const code = `4/code-${++count}`
      codes.set(code, { scopes: (asked.get('scope') ?? '').split(' '), challenge: asked.get('code_challenge') ?? '', redirect: back.href, offline: asked.get('access_type') === 'offline' })
      back.search = new URLSearchParams({ code, scope: asked.get('scope') ?? '', state: asked.get('state') ?? '' }).toString()
      return new Response(null, { status: 302, headers: { location: back.href } })
    }
    if (url.href !== TOKEN || request.method !== 'POST') return new Response('Not found', { status: 404, headers: CORS })
    const form = new URLSearchParams(await request.text())
    state.redeemed.push({ form, from })
    if (form.get('client_id') !== CLIENT || form.get('client_secret') !== SECRET) return json({ error: 'invalid_client', error_description: 'Unauthorized' }, 401)
    const grant = form.get('grant_type') === 'authorization_code' ? codes.get(form.get('code') ?? '') : refreshes.get(form.get('refresh_token') ?? '')
    codes.delete(form.get('code') ?? '')
    if (!grant || (form.get('grant_type') === 'authorization_code' && (grant.redirect !== form.get('redirect_uri') || createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') !== grant.challenge))) {
      return json({ error: 'invalid_grant', error_description: 'Bad Request' }, 400)
    }
    const n = ++count
    issued.set(`ya29.${n}`, grant)
    const renewed = form.get('grant_type') === 'refresh_token'
    if (grant.offline && !renewed) refreshes.set(`1//refresh-${n}`, grant)
    const idToken = grant.scopes.includes('openid') && `e30.${Buffer.from(JSON.stringify({ iss: ACCOUNTS, aud: CLIENT, sub: '1084', email: 'ana@acme.example', email_verified: true, hd: 'acme.example', name: 'Ana Martín' })).toString('base64url')}.`
    // Google renews without a new refresh token: the one kept goes on.
    return json({ access_token: `ya29.${n}`, expires_in: lifetime, scope: grant.scopes.join(' '), token_type: 'Bearer', ...(grant.offline && !renewed && { refresh_token: `1//refresh-${n}` }), ...(idToken && { id_token: idToken }) })
  }

  /** An API's answer to a request its token's scopes allow. @param {string} method @param {URL} url @param {any} body @param {string} type @returns {{ status?: number, json?: unknown, text?: string }} */
  const api = (method, { hostname, pathname, searchParams }, body, type) => {
    const gmail = /^\/gmail\/v1\/users\/me\/messages\/(\w+)$/.exec(pathname)
    const file = /^\/drive\/v3\/files\/([\w-]+)(\/export)?$/.exec(pathname)
    if (hostname === 'gmail.googleapis.com') {
      if (pathname === '/gmail/v1/users/me/profile') return { json: { emailAddress: 'ana@acme.example', messagesTotal: INBOX.length } }
      if (pathname === '/gmail/v1/users/me/messages') return { json: { messages: INBOX.map(({ id }) => ({ id, threadId: `t${id}` })), resultSizeEstimate: INBOX.length } }
      const found = INBOX.find(({ id }) => id === gmail?.[1])
      if (found) return { json: { id: found.id, threadId: `t${found.id}`, snippet: found.snippet, payload: { headers: [{ name: 'Subject', value: found.subject }, { name: 'From', value: found.from }, { name: 'Date', value: 'Tue, 20 Oct 2026 09:30:00 +0200' }] } } }
    }
    if (pathname === '/calendar/v3/users/me/calendarList') return { json: { items: [{ id: 'ana@acme.example', summary: 'ana@acme.example', primary: true, accessRole: 'owner' }] } }
    if (pathname === '/calendar/v3/calendars/primary/events' && method === 'POST') {
      const event = { ...body, id: `ev${state.events.length + 1}`, status: 'confirmed', htmlLink: `https://www.google.com/calendar/event?eid=ev${state.events.length + 1}`, sendUpdates: searchParams.get('sendUpdates') }
      state.events.push(event)
      return { json: event }
    }
    if (pathname === '/calendar/v3/calendars/primary/events') {
      const [from, to] = [searchParams.get('timeMin'), searchParams.get('timeMax')].map((at, end) => (at ? Date.parse(at) : end ? Infinity : -Infinity))
      return { json: { items: state.events.filter(({ start }) => Date.parse(start.dateTime ?? start.date) >= from && Date.parse(start.dateTime ?? start.date) < to) } }
    }
    if (pathname === '/drive/v3/about') return { json: { user: { displayName: 'Ana Martín', emailAddress: 'ana@acme.example' } } }
    if (pathname === '/upload/drive/v3/files' && method === 'POST') {
      // multipart/related: its metadata in JSON, then its text in Markdown, which Drive turns into a document.
      const boundary = /boundary=([^;]+)/.exec(type)?.[1] ?? ''
      const [meta, content] = String(body).split(`--${boundary}`).slice(1, 3).map((part) => part.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''))
      const made = { ...JSON.parse(meta), id: `1Acme${state.files.length + 1}`, modifiedTime: '2026-10-21T08:00:00.000Z', content }
      state.files.push({ ...made, webViewLink: `https://docs.google.com/document/d/${made.id}/edit` })
      return { json: state.files.at(-1) }
    }
    if (pathname === '/drive/v3/files') {
      const words = /fullText contains '((?:[^'\\]|\\.)*)'/.exec(searchParams.get('q') ?? '')?.[1].toLowerCase() ?? ''
      return { json: { files: state.files.filter(({ name, content }) => `${name} ${content}`.toLowerCase().includes(words)) } }
    }
    const kept = state.files.find(({ id }) => id === file?.[1])
    if (kept && file?.[2]) return searchParams.get('mimeType') === 'text/markdown' ? { text: kept.content } : { status: 400, json: { error: { code: 400, message: 'Export only supports Docs Editors files.' } } }
    if (kept) return { json: kept }
    return { status: 404, json: { error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' } } }
  }

  /** A Workspace server, through the gateway: where to sign in, then MCP's earlier revision, sessions and all. @param {Request} request @returns {Promise<Response>} */
  const server = async (request) => {
    const url = new URL(request.url)
    const { scope, tool, title, says } = SERVERS[url.hostname]
    const at = `${url.origin}/mcp/v1`
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp/v1') return json({ resource: at, authorization_servers: [ACCOUNTS], scopes_supported: [`${AUTH}${scope}`], bearer_methods_supported: ['header'] })
    const authorization = request.headers.get('authorization')
    const session = request.headers.get('mcp-session-id')
    state.servers.push({ host: url.hostname, method: request.method, authorization, session })
    if (url.pathname !== '/mcp/v1' || request.method !== 'POST') return new Response(null, { status: 405 })
    if (!scopesOf(authorization)?.includes(scope)) return json({ error: 'invalid_token' }, 401, { 'www-authenticate': `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource/mcp/v1"` })
    const { id, method } = await request.json()
    if (method === 'initialize') {
      const opened = `${url.hostname}-${++count}`
      sessions.add(opened)
      return json({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: url.hostname, version: '1.0' } } }, 200, { 'mcp-session-id': opened })
    }
    if (!sessions.has(session)) return json({ jsonrpc: '2.0', id, error: { code: -32000, message: 'Bad Request: No valid session ID provided' } }, 400)
    if (method === 'notifications/initialized') return new Response(null, { status: 202 })
    if (method === 'tools/list') return json({ jsonrpc: '2.0', id, result: { tools: [{ name: tool, title, description: `${title}, in the user’s Google Workspace.`, inputSchema: { type: 'object', properties: { query: { type: 'string' } } }, annotations: { readOnlyHint: true } }] } })
    if (method === 'tools/call') return json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: says }] } })
    return json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } })
  }

  await page.route((url) => [ACCOUNTS, 'https://oauth2.googleapis.com'].includes(url.origin), async (route) => answer(route, await accounts(await received(route.request()), 'page')))
  await page.route((url) => ['gmail.googleapis.com', 'www.googleapis.com'].includes(url.hostname), async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(request.url())
    const authorization = (await request.allHeaders()).authorization ?? ''
    state.api.push({ method: request.method(), url, authorization })
    const scopes = scopesOf(authorization)
    if (!scopes) return route.fulfill({ status: 401, headers: CORS, json: { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } } })
    if (!wanted(request.method(), url).some((scope) => scopes.includes(scope))) {
      return route.fulfill({ status: 403, headers: CORS, json: { error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED', details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } } })
    }
    const type = request.headers()['content-type'] ?? ''
    const { status = 200, json, text } = api(request.method(), url, /json/.test(type) ? request.postDataJSON() : request.postData(), type)
    return route.fulfill({ status, headers: CORS, ...(text === undefined ? { json } : { body: text, contentType: 'text/markdown' }) })
  })
  // Asked from the page, a Workspace server refuses, with no CORS.
  await page.route((url) => url.hostname in SERVERS, (route) => (state.direct.push(route.request().url()), route.fulfill({ status: 403, body: 'Forbidden' })))
  await page.route((url) => url.href.startsWith(`${AI_GATEWAY}/`), async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    state.ai.push(request.postData() ?? '')
    const response = await route.fetch({ url: request.url().replace(AI_GATEWAY, BRAIN_URL) })
    return route.fulfill({ response, headers: { ...response.headers(), ...CORS } })
  })
  state.relayed = await organisationGateway(page, GATEWAY, { origins: [new URL(jean).origin], clients: [{ issuer: ACCOUNTS, tokenEndpoint: TOKEN, clientId: CLIENT, clientSecret: SECRET }] }, (request) => {
    const { origin, hostname } = new URL(request.url)
    return [ACCOUNTS, 'https://oauth2.googleapis.com'].includes(origin) ? accounts(request, 'gateway') : hostname in SERVERS ? server(request) : undefined
  })
  return state
}
