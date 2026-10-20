// Microsoft's side of an organisation that runs Jean (D382, D385), at Microsoft's own addresses: Entra
// ID, holding each app to the rules Entra holds it to; Microsoft Graph, with a mailbox, a calendar and a
// drive, each opened by the scope Graph wants for it; SharePoint's signed download addresses; the AI
// gateway, which takes Entra's tokens for its own app alone; and the organisation's gateway (D191),
// holding the web app Entra registered for Microsoft 365 (relay.js). All are the page's routes: Jean
// reaches them over HTTPS, as it would at work.
import { createHash } from 'node:crypto'
import { BRAIN_URL } from '../helpers.js'
import { received, answer, organisationGateway } from './relay.js'

const LOGIN = 'https://login.microsoftonline.com'
const GRAPH = 'https://graph.microsoft.com'
const SHAREPOINT = 'https://acme-my.sharepoint.com'
const AI_APP = 'api://acme-ai-gateway'
const OIDC = ['openid', 'profile', 'email', 'offline_access']
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, prefer', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE' }
const ME = 'b1e2c3d4-0000-4000-8000-0000000000a1'
const DRIVE = 'b!Acme-ana-drive'

export const TENANT = '3c9a6b1e-5d2f-4e8a-9b7c-0a1d2e3f4a5b'
export const ISSUER = `${LOGIN}/${TENANT}/v2.0`
export const AI_GATEWAY = 'https://ai.acme.example/v1'
export const GATEWAY = 'https://gateway.acme.example/'
/** Jean's app in the tenant, a single-page app; and the web app the organisation's gateway holds, with its secret. */
export const SPA = '9f2d4c1a-7b3e-4f60-8a5d-2c1e0b9f8a7d'
export const WEB = '5e8b3a2f-1c4d-4e7a-9f6b-3d2c1a0e9b8f'
export const SECRET = 'Q8~acme-gateway-secret'

/**
 * The organisation's policy: the person signs in with the tenant's single-page app for the AI
 * gateway's scope, whose brain takes that token; its gateway is set; Connections is there from the
 * start; and Microsoft 365 signs in at the tenant, whose app (single-tenant, as Entra registers one by
 * default) the gateway holds, since Entra refuses `common` to such an app.
 */
export const POLICY = {
  signIn: { issuer: ISSUER, clientId: SPA, scopes: [`${AI_APP}/chat`] },
  brains: [{ id: 'corp', provider: 'custom', api: 'openai', baseURL: AI_GATEWAY, model: 'fake-brain-1', label: 'Acme AI', auth: 'oidc' }],
  urls: { gateway: GATEWAY },
  capabilities: { preUnlock: ['connections'] },
  directory: [{ id: 'microsoft-365', app: ISSUER }],
}

/** @param {string} id @param {string} subject @param {string} name @param {string} received @param {string} preview */
const mail = (id, subject, name, received, preview) => ({ id, subject, receivedDateTime: received, bodyPreview: preview,
  from: { emailAddress: { name, address: `${name.split(' ')[0].toLowerCase()}@acme.example` } }, toRecipients: [{ emailAddress: { name: 'Ana Martín', address: 'ana@acme.example' } }], ccRecipients: [],
  webLink: `https://outlook.office365.com/owa/?ItemID=${id}&exvsurl=1&viewmodel=ReadMessageItem` })
export const MAILBOX = [
  mail('AAMkAD1', 'Quarterly figures for the board', 'Sam Ortiz', '2026-10-20T16:02:00Z', 'Here are the figures before Thursday.'),
  mail('AAMkAD2', 'Room booked for Thursday', 'Lea Brun', '2026-10-20T09:30:00Z', 'Room 4B, from 10 to 12.'),
  mail('AAMkAD3', 'Your expense report was approved', 'Expenses', '2026-10-19T14:11:00Z', 'Report 1187 will be paid on Friday.'),
]

/** The resource a scope is for: an app's ID URI, or Graph for a bare name. @param {string} scope */
const resourceOf = (scope) => (scope.includes('/') ? scope.slice(0, scope.lastIndexOf('/')) : GRAPH)

/** The least scope Graph wants for a request, as its permissions reference names it. @param {string} method @param {string} path */
const wanted = (method, path) => (path === '/v1.0/me' ? 'User.Read' : /^\/v1\.0\/me\/(sendMail|messages\/[^/]+\/reply)$/.test(path) ? 'Mail.Send' : path.startsWith('/v1.0/me/messages') ? 'Mail.ReadWrite'
  : /^\/v1\.0\/me\/(calendar|calendars|events)\b/.test(path) ? 'Calendars.ReadWrite' : path === '/v1.0/search/query' ? 'Files.Read.All'
    : /^\/v1\.0\/(me\/drive|drives)\//.test(path) ? (method === 'GET' ? 'Files.Read.All' : 'Files.ReadWrite') : '')

/**
 * Microsoft, for one page. Entra answers the tenant's discovery and any account's (`common`, whose
 * issuer says {tenantid}), and signs in at once, refusing a single-tenant app at `common` and scopes for
 * more than one resource. Its token endpoint holds each app to its kind: a single-page app's code is
 * redeemed from a page, which says its origin, with no secret; a web app's from a server, with its secret
 * and no origin. Each token opens the resource its scopes were for, with those scopes, Graph's ending after
 * `graphLifetime` seconds. Graph and the AI gateway take only their own, the AI gateway passing what it is
 * asked to the fake brain. A file put in the drive is found by Microsoft Search and downloaded from its
 * signed address, which takes no token. The organisation's gateway serves Jean's origin, relays to the
 * hosts it relays to by default, holds the tenant's web app, and reaches Entra alone.
 * @param {import('@playwright/test').Page} page @param {{ jean: string, graphLifetime?: number }} options
 */
export async function fakeMicrosoft(page, { jean, graphLifetime = 3599 }) {
  const state = {
    /** Each sign-in's address. @type {URL[]} */ authorized: [],
    /** Each request to a token endpoint: its form, the origin it said, and who sent it. @type {{ form: URLSearchParams, origin: string | null, from: 'page' | 'gateway' }[]} */ redeemed: [],
    /** Each address the organisation's gateway relayed to. @type {string[]} */ relayed: [],
    /** The Authorization header of each request to Graph, to the AI gateway, and to a download address. @type {string[]} */ graph: [],
    /** @type {string[]} */ ai: [],
    /** @type {(string | undefined)[]} */ downloads: [],
    /** The calendar's events, and the drive's files, as Graph keeps them. @type {any[]} */ events: [],
    /** @type {Map<string, any>} */ files: new Map(),
  }
  const apps = /** @type {Record<string, { spa?: boolean, secret?: string }>} */ ({ [SPA]: { spa: true }, [WEB]: { secret: SECRET } })
  /** @typedef {{ client: string, tenant: string, scopes: string[], resource: string, redirect?: string, challenge?: string }} Grant */
  const [codes, refreshes, issued] = [/** @type {Map<string, Grant>} */ (new Map()), /** @type {Map<string, Grant>} */ (new Map()), /** @type {Map<string, Grant>} */ (new Map())]
  let count = 0
  const json = (/** @type {unknown} */ body, status = 200) => Response.json(body, { status, headers: CORS })
  const refused = (/** @type {number} */ status, /** @type {string} */ error, /** @type {string} */ description) => json({ error, error_description: description }, status)

  /** @param {Request} request @param {'page' | 'gateway'} from @returns {Promise<Response>} */
  const entra = async (request, from) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const url = new URL(request.url)
    const [, tenant, ...rest] = url.pathname.split('/')
    if (![TENANT, 'common'].includes(tenant)) return new Response('Not found', { status: 404, headers: CORS })
    const at = `${LOGIN}/${tenant}/oauth2/v2.0`
    const path = rest.join('/')
    if (path === 'v2.0/.well-known/openid-configuration') {
      return json({ issuer: `${LOGIN}/${tenant === 'common' ? '{tenantid}' : TENANT}/v2.0`, authorization_endpoint: `${at}/authorize`, token_endpoint: `${at}/token`, end_session_endpoint: `${at}/logout`, scopes_supported: OIDC, response_types_supported: ['code', 'id_token', 'code id_token'] })
    }
    if (path === 'oauth2/v2.0/authorize') {
      state.authorized.push(url)
      const asked = url.searchParams
      const back = new URL(asked.get('redirect_uri') ?? '')
      const client = asked.get('client_id') ?? ''
      const scopes = (asked.get('scope') ?? '').split(' ').filter(Boolean)
      const resources = [...new Set(scopes.filter((scope) => !OIDC.includes(scope)).map(resourceOf))]
      // Entra shows its own page for an app or an address it doesn't know.
      if (!apps[client] || back.href !== jean) return new Response('AADSTS50011: The redirect URI does not match.', { status: 400 })
      const error = tenant === 'common' ? `AADSTS50194: Application '${client}' is not configured as a multi-tenant application.`
        : resources.length !== 1 ? 'AADSTS28000: Provided value for the input parameter scope is not valid because it contains more than one resource.'
          : asked.get('code_challenge_method') !== 'S256' ? 'AADSTS9002325: Proof Key for Code Exchange is required for cross-origin authorization code redemption.' : ''
      const code = `code-${++count}`
      if (!error) codes.set(code, { client, tenant, scopes, resource: resources[0], redirect: back.href, challenge: asked.get('code_challenge') ?? '' })
      back.search = new URLSearchParams({ ...(error ? { error: 'invalid_request', error_description: error } : { code, session_state: 'x' }), state: asked.get('state') ?? '' }).toString()
      return new Response(null, { status: 302, headers: { location: back.href } })
    }
    if (path !== 'oauth2/v2.0/token' || request.method !== 'POST') return new Response('Not found', { status: 404, headers: CORS })
    const form = new URLSearchParams(await request.text())
    const origin = request.headers.get('origin')
    state.redeemed.push({ form, origin, from })
    const client = form.get('client_id') ?? ''
    const app = apps[client]
    if (!app) return refused(400, 'unauthorized_client', `AADSTS700016: Application with identifier '${client}' was not found in the directory.`)
    if (app.spa && !origin) return refused(400, 'invalid_request', 'AADSTS9002327: Tokens issued for the \'Single-Page Application\' client-type may only be redeemed via cross-origin requests.')
    if (app.spa && form.has('client_secret')) return refused(401, 'invalid_client', 'AADSTS700025: Client is public so neither \'client_assertion\' nor \'client_secret\' should be presented.')
    if (!app.spa && origin) return refused(400, 'invalid_request', 'AADSTS9002326: Cross-origin token redemption is permitted only for the \'Single-Page Application\' client-type.')
    if (!app.spa && form.get('client_secret') !== app.secret) return refused(401, 'invalid_client', 'AADSTS7000215: Invalid client secret provided.')
    const asked = form.get('grant_type') === 'authorization_code' ? codes.get(form.get('code') ?? '') : refreshes.get(form.get('refresh_token') ?? '')
    codes.delete(form.get('code') ?? '')
    const verified = asked?.client === client && asked.tenant === tenant && (form.get('grant_type') === 'refresh_token'
      || (asked.redirect === form.get('redirect_uri') && createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') === asked.challenge))
    if (!asked || !verified) return refused(400, 'invalid_grant', 'AADSTS70000: The provided value for the code or refresh token is not valid.')
    const n = ++count
    const access = `${asked.resource === GRAPH ? 'graph' : 'ai'}-${n}`
    issued.set(access, asked)
    refreshes.set(`refresh-${n}`, asked)
    const idToken = asked.scopes.includes('openid') && `e30.${Buffer.from(JSON.stringify({ aud: client, iss: ISSUER, tid: TENANT, oid: ME, preferred_username: 'ana@acme.example', name: 'Ana Martín' })).toString('base64url')}.`
    return json({ token_type: 'Bearer', scope: asked.scopes.join(' '), expires_in: asked.resource === GRAPH ? graphLifetime : 3599, access_token: access, refresh_token: `refresh-${n}`, ...(idToken && { id_token: idToken }) })
  }

  /** A file in the drive, as Graph gives one. @param {any} file */
  const driveItem = ({ id, name, modified }) => ({ id, name, webUrl: `${SHAREPOINT}/personal/ana_acme_example/Documents/${encodeURIComponent(name)}`, lastModifiedDateTime: modified, parentReference: { driveId: DRIVE }, file: {} })
  /** Graph's answer to a request its token's scopes allow. @param {string} method @param {URL} url @param {any} body @returns {{ status?: number, json?: unknown }} */
  const graph = (method, { pathname, searchParams }, body) => {
    const put = /^\/v1\.0\/me\/drive\/root:\/(.+):\/content$/.exec(pathname)
    const item = /^\/v1\.0\/drives\/([^/]+)\/items\/([^/]+)$/.exec(pathname)
    if (pathname === '/v1.0/me') return { json: { id: ME } }
    if (pathname === '/v1.0/me/messages') return { json: { value: MAILBOX } }
    if (pathname === '/v1.0/me/calendar/events' && method === 'POST') {
      const event = { ...body, id: `AAMkEV${state.events.length + 1}`, webLink: `https://outlook.office365.com/calendar/item/AAMkEV${state.events.length + 1}`, bodyPreview: body.body?.content ?? '' }
      state.events.push(event)
      return { status: 201, json: event }
    }
    if (pathname === '/v1.0/me/calendar/calendarView') {
      const [from, to] = ['startDateTime', 'endDateTime'].map((name) => Date.parse(searchParams.get(name) ?? ''))
      const at = (/** @type {any} */ { start }) => Date.parse(start.timeZone === 'UTC' ? `${start.dateTime}Z` : start.dateTime)
      return { json: { value: state.events.filter((event) => at(event) >= from && at(event) < to) } }
    }
    if (put && method === 'PUT') {
      const file = { id: `01ACME${state.files.size + 1}`, name: decodeURIComponent(put[1]), modified: '2026-10-21T08:00:00Z', bytes: body }
      state.files.set(file.id, file)
      return { status: 201, json: driveItem(file) }
    }
    if (pathname === '/v1.0/search/query' && method === 'POST') {
      const words = String(body.requests[0].query.queryString).toLowerCase()
      return { json: { value: [{ hitsContainers: [{ hits: [...state.files.values()].filter((file) => file.name.toLowerCase().includes(words)).map((file) => ({ hitId: file.id, resource: driveItem(file) })) }] }] } }
    }
    if (item && item[1] === DRIVE && state.files.has(item[2])) return { json: { ...driveItem(state.files.get(item[2])), '@microsoft.graph.downloadUrl': `${SHAREPOINT}/_layouts/15/download.aspx?UniqueId=${item[2]}&tempauth=signed-${item[2]}` } }
    return { status: 404, json: { error: { code: 'itemNotFound', message: 'The resource could not be found.' } } }
  }

  /**
   * A service that takes Entra's tokens for itself alone, their Authorization in `seen`: each request
   * answered by `serve` once its token is one of its own, with the scopes `scopeFor` wants.
   * @param {(url: URL) => boolean} where @param {string} resource @param {string[]} seen @param {(method: string, path: string) => string} scopeFor
   * @param {(route: import('@playwright/test').Route, url: URL) => Promise<void>} serve
   */
  const resourceServer = (where, resource, seen, scopeFor, serve) => page.route(where, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const authorization = (await request.allHeaders()).authorization ?? ''
    seen.push(authorization)
    const grant = issued.get(authorization.replace(/^Bearer /, ''))
    const url = new URL(request.url())
    if (grant?.resource !== resource) return route.fulfill({ status: 401, headers: CORS, json: { error: { code: 'InvalidAuthenticationToken', message: 'Access token validation failure. Invalid audience.' } } })
    const scope = scopeFor(request.method(), url.pathname)
    if (scope && !grant.scopes.includes(scope)) return route.fulfill({ status: 403, headers: CORS, json: { error: { code: 'ErrorAccessDenied', message: 'Access is denied. Check credentials and try again.' } } })
    return serve(route, url)
  })

  await page.route((url) => url.origin === LOGIN, async (route) => answer(route, await entra(await received(route.request()), 'page')))
  await resourceServer((url) => url.origin === GRAPH, GRAPH, state.graph, wanted, async (route, url) => {
    const request = route.request()
    const body = /json/.test(request.headers()['content-type'] ?? '') ? request.postDataJSON() : request.postDataBuffer()
    const { status = 200, json } = graph(request.method(), url, body)
    return route.fulfill({ status, headers: CORS, json })
  })
  await resourceServer((url) => url.href.startsWith(`${AI_GATEWAY}/`), AI_APP, state.ai, () => '', async (route, url) => {
    const response = await route.fetch({ url: url.href.replace(AI_GATEWAY, BRAIN_URL) })
    return route.fulfill({ response, headers: { ...response.headers(), ...CORS } })
  })
  // An address Graph signed for one file: it takes no token, and answers no other.
  await page.route((url) => url.origin === SHAREPOINT, async (route) => {
    const url = new URL(route.request().url())
    state.downloads.push((await route.request().allHeaders()).authorization)
    const file = state.files.get(url.searchParams.get('UniqueId') ?? '')
    if (!file || url.searchParams.get('tempauth') !== `signed-${file.id}`) return route.fulfill({ status: 401, headers: CORS })
    return route.fulfill({ headers: { ...CORS, 'content-type': 'application/octet-stream' }, body: file.bytes })
  })
  state.relayed = await organisationGateway(page, GATEWAY, { origins: [new URL(jean).origin], clients: [{ issuer: ISSUER, tokenEndpoint: `${LOGIN}/${TENANT}/oauth2/v2.0/token`, clientId: WEB, clientSecret: SECRET }] },
    (request) => (new URL(request.url).origin === LOGIN ? entra(request, 'gateway') : undefined))
  return state
}
