// A fake identity provider shaped like Entra ID, an AI gateway that takes only its tokens, and an
// OpenTelemetry collector, for the specs of the organisation's sign-in (D385) and of the audit
// export. All three are the page's routes: Jean reaches them over https, as it would at work.
import { createHash } from 'node:crypto'
import { BRAIN_URL } from '../helpers.js'

export const ISSUER = 'https://login.fake.example/tenant-1/v2.0'
export const GATEWAY = 'https://ai.fake.example/v1'
export const COLLECTOR = 'https://otel.fake.example/v1/traces'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST' }
const ENDPOINTS = 'https://login.fake.example/tenant-1/oauth2/v2.0'

/**
 * Sends the browser on to an address, with a page that does at once: WebKit's routes can't answer
 * with a redirect. @param {import('@playwright/test').Route} route @param {string} href
 */
export const redirect = (route, href) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta http-equiv="refresh" content="0;url=${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">` })

/** The organisation's policy: its sign-in, and its gateway's brain, which the sign-in's token opens. */
export const POLICY = {
  signIn: { issuer: ISSUER, clientId: 'jean-at-acme', scopes: ['api://ai-gateway/chat'] },
  brains: [{ id: 'corp', provider: 'custom', api: 'openai', baseURL: GATEWAY, model: 'fake-brain-1', label: 'Acme AI', auth: 'oidc' }],
}

/**
 * The identity provider: its discovery, a sign-in that comes straight back with a code, a token
 * endpoint that checks PKCE and renews (or, `refusing`, refuses to), and signing out.
 * @param {import('@playwright/test').Page} page @param {{ expiresIn?: number }} [options]
 */
export async function fakeIssuer(page, { expiresIn = 3599 } = {}) {
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
      return route.fulfill({ headers: CORS, json: { issuer: ISSUER, authorization_endpoint: `${ENDPOINTS}/authorize`, token_endpoint: `${ENDPOINTS}/token`, end_session_endpoint: `${ENDPOINTS}/logout`, scopes_supported: ['openid', 'profile', 'email', 'offline_access'] } })
    }
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
      const idToken = `e30.${Buffer.from(JSON.stringify({ preferred_username: 'ana@acme.example', name: 'Ana Martín' })).toString('base64url')}.`
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
    const response = await route.fetch({ url: request.url().replace(GATEWAY, BRAIN_URL) })
    return route.fulfill({ response, headers: { ...response.headers(), ...CORS } })
  })
  return seen
}

/**
 * The collector: each OTLP/HTTP JSON request it was sent, with its headers.
 * @param {import('@playwright/test').Page} page
 */
export async function fakeCollector(page) {
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
    .map((/** @type {any} */ span) => ({ ...span, attrs: Object.fromEntries(span.attributes.map((/** @type {any} */ { key, value }) => [key, Object.values(value)[0]])) }))
  return { sent, spans }
}
