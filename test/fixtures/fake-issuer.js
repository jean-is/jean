// SPDX-License-Identifier: MIT
// A fake identity provider shaped like Entra ID, an AI gateway that takes only its tokens, with its
// MCP servers, and an OpenTelemetry collector, for the specs of the organisation's sign-in (D385) and
// of the audit export. All are the page's routes: Jean reaches them over https, as it would at work.
// Its ID tokens are signed (ES256) by a key it publishes, as an organisation's relay checks them (D731).
import { createHash } from 'node:crypto'
import { BRAIN_URL } from '../helpers.js'

export const ISSUER = 'https://login.fake.example/tenant-1/v2.0'
export const GATEWAY = 'https://ai.fake.example/v1'
export const COLLECTOR = 'https://otel.fake.example/v1/traces'
export const TOOLS = 'https://ai.fake.example/mcp'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST' }
const ENDPOINTS = 'https://login.fake.example/tenant-1/oauth2/v2.0'
const KEYS = 'https://login.fake.example/tenant-1/discovery/v2.0/keys'
/** The provider's signing key, the same in every process that loads this file: made for these tests, it signs nothing else. */
const SIGNING = { kty: 'EC', crv: 'P-256', x: 'ogjh4qGOGa8E6p5JPDJWzsXuMkwk2IE5Es8ccrZpZ8w', y: 'aGhuwneGVHrZhePmtLiw2a_tfDUYwifycV0q4yUlr24', d: 'Ju65g1F9pWDOM-37JTMkS1taQouG3ua_vr4pNYL32eQ' }
/** Its public half, as its keys' address gives it and an organisation's relay may name it (`issuers[].jwks`). */
export const JWKS = { keys: [{ kty: 'EC', crv: 'P-256', x: SIGNING.x, y: SIGNING.y, kid: 'fake-1', use: 'sig', alg: 'ES256' }] }

/**
 * Sends the browser on to an address, with a page that does at once: WebKit's routes can't answer
 * with a redirect. @param {import('@playwright/test').Route} route @param {string} href
 */
export const redirect = (route, href) => route.fulfill({ contentType: 'text/html', body: /* html */ `<!doctype html><meta http-equiv="refresh" content="0;url=${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">` })

/** The organisation's policy: its sign-in, asking for what enterprise.md has Entra's ask for, and its gateway's brain, which the sign-in's token opens. */
export const POLICY = {
  signIn: { issuer: ISSUER, clientId: 'jean-at-acme', scopes: ['openid', 'profile', 'email', 'offline_access', 'api://ai-gateway/chat'] },
  brains: [{ id: 'corp', provider: 'custom', api: 'openai', baseURL: GATEWAY, model: 'fake-brain-1', label: 'Acme AI', auth: 'oidc' }],
}

/**
 * An ID token from the provider for Jean, an hour long, signed by its key: Ana's unless `claims` say otherwise.
 * @param {Record<string, unknown>} [claims]
 */
export async function idTokenOf(claims = {}) {
  const now = Math.floor(Date.now() / 1000)
  const encoded = (/** @type {object} */ value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const data = `${encoded({ alg: 'ES256', kid: 'fake-1', typ: 'JWT' })}.${encoded({ iss: ISSUER, aud: POLICY.signIn.clientId, sub: 'sub-ana', iat: now, nbf: now, exp: now + 3600,
    preferred_username: 'ana@acme.example', name: 'Ana Martín', ...claims })}`
  const key = await crypto.subtle.importKey('jwk', SIGNING, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  return `${data}.${Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(data))).toString('base64url')}`
}

/**
 * The identity provider: its discovery and keys, a sign-in that comes straight back with a code, a token
 * endpoint that checks PKCE and renews (or, `refusing`, refuses to), and signing out; `claims` go in its ID token too.
 * @param {import('@playwright/test').Page} page @param {{ expiresIn?: number, claims?: Record<string, unknown> }} [options]
 */
export async function fakeIssuer(page, { expiresIn = 3599, claims = {} } = {}) {
  const state = {
    /** Each sign-in's query. @type {URLSearchParams[]} */ authorized: [],
    /** Each request to the token endpoint. @type {URLSearchParams[]} */ asked: [],
    /** Each sign-out's query. @type {URLSearchParams[]} */ signedOut: [],
    /** The access token the gateway takes now. */ current: '',
    refusing: false,
  }
  let challenge = ''
  await page.route('https://login.fake.example/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname === '/tenant-1/v2.0/.well-known/openid-configuration') {
      return route.fulfill({ headers: CORS, json: { issuer: ISSUER, authorization_endpoint: `${ENDPOINTS}/authorize`, token_endpoint: `${ENDPOINTS}/token`, end_session_endpoint: `${ENDPOINTS}/logout`, jwks_uri: KEYS, scopes_supported: ['openid', 'profile', 'email', 'offline_access'] } })
    }
    if (url.href === KEYS) return route.fulfill({ headers: CORS, json: JWKS })
    if (url.pathname === '/tenant-1/oauth2/v2.0/authorize') {
      state.authorized.push(url.searchParams)
      challenge = url.searchParams.get('code_challenge') ?? ''
      const back = new URL(url.searchParams.get('redirect_uri') ?? '')
      back.search = new URLSearchParams({ code: `code-${state.authorized.length}`, state: url.searchParams.get('state') ?? '', session_state: 'x' }).toString()
      return redirect(route, back.href)
    }
    if (url.pathname === '/tenant-1/oauth2/v2.0/token') {
      const form = new URLSearchParams(request.postData() ?? '')
      state.asked.push(form)
      const verified = form.get('grant_type') === 'authorization_code' && createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') === challenge
      if (form.get('grant_type') === 'refresh_token' ? state.refusing : !verified) return route.fulfill({ status: 400, headers: CORS, json: { error: 'invalid_grant', error_description: 'AADSTS70000: The grant is not valid.' } })
      state.current = `access-${state.asked.length}`
      const idToken = await idTokenOf(claims)
      return route.fulfill({ headers: CORS, json: { token_type: 'Bearer', access_token: state.current, refresh_token: `refresh-${state.asked.length}`, expires_in: expiresIn, id_token: idToken } })
    }
    if (url.pathname === '/tenant-1/oauth2/v2.0/logout') {
      state.signedOut.push(url.searchParams)
      return redirect(route, url.searchParams.get('post_logout_redirect_uri') ?? '')
    }
    return route.fulfill({ status: 404, headers: CORS })
  })
  return state
}

/**
 * The gateway: the fake brain behind it, for the token the identity provider gave last only.
 * @param {import('@playwright/test').Page} page @param {{ current: string }} issuer
 */
export async function fakeGateway(page, issuer) {
  /** The Authorization header of each request. @type {(string | undefined)[]} */
  const seen = []
  await page.route(`${GATEWAY}/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const authorization = (await request.allHeaders()).authorization
    seen.push(authorization)
    if (!issuer.current || authorization !== `Bearer ${issuer.current}`) return route.fulfill({ status: 401, headers: CORS, json: { error: { message: 'Unauthorized' } } })
    // A reply can come after the test has moved on.
    const response = await route.fetch({ url: request.url().replace(GATEWAY, BRAIN_URL) }).catch(() => null)
    return response && route.fulfill({ response, headers: { ...response.headers(), ...CORS } }).catch(() => {})
  })
  return seen
}

/**
 * The gateway's MCP servers at one address, as LiteLLM's and Bifrost's are: MCP's stateless revision, its tools
 * prefixed by their server's name, for the token the identity provider gave last only.
 * @param {import('@playwright/test').Page} page @param {{ current: string }} issuer
 */
export async function fakeTools(page, issuer) {
  const headers = { ...CORS, 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-method, mcp-name' }
  /** The Authorization header of each request. @type {(string | undefined)[]} */
  const seen = []
  await page.route(TOOLS, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const authorization = (await request.allHeaders()).authorization
    seen.push(authorization)
    if (!issuer.current || authorization !== `Bearer ${issuer.current}`) return route.fulfill({ status: 401, headers, json: { error: 'invalid_token' } })
    const { id, method } = request.postDataJSON()
    const tools = [['crm-find_customer', 'Find a customer'], ['wiki-search_pages', 'Search the wiki']]
      .map(([name, title]) => ({ name, title, description: `${title}.`, inputSchema: { type: 'object', properties: { query: { type: 'string' } } }, annotations: { readOnlyHint: true } }))
    return route.fulfill({ headers, json: method === 'tools/list' ? { jsonrpc: '2.0', id, result: { tools } } : { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } } })
  })
  return seen
}

/**
 * The collector: each OTLP/HTTP JSON request it was sent, with its headers.
 * @param {import('@playwright/test').Page} page
 */
export async function fakeCollector(page) {
  // A batch goes every 5 s (ee/otlp.js): a test needn't sit through them.
  await page.addInitScript(() => {
    const later = window.setTimeout
    window.setTimeout = /** @type {any} */ ((run, ms, ...rest) => later(run, ms === 5000 ? 50 : ms, ...rest))
  })
  /** @type {{ headers: Record<string, string>, body: any }[]} */
  const sent = []
  await page.route(COLLECTOR, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    sent.push({ headers: await request.allHeaders(), body: request.postDataJSON() })
    return route.fulfill({ headers: CORS, json: {} })
  })
  /** Every span sent so far, with its attributes as an object. */
  const spans = () => sent.flatMap(({ body }) => body.resourceSpans.flatMap((/** @type {any} */ group) => group.scopeSpans.flatMap((/** @type {any} */ scope) => scope.spans)))
    .map((/** @type {any} */ span) => ({ ...span, attrs: Object.fromEntries(span.attributes.filter((/** @type {any} */ { key }) => !key.startsWith('jean.audit.')).map((/** @type {any} */ { key, value }) => [key, Object.values(value)[0]])) }))
  return { sent, spans }
}
