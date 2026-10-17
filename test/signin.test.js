// Signing in with the organisation's account (D385), Entra ID's way: the issuer policy names, by
// its tenant, and Jean's app registered there; the scopes for the gateway, and the token it gives.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discover, authorization, finish, refresh } from '../app/caps/connections/auth.js'

const TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47'
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`
const CLIENT = '4f1c0000-0000-0000-0000-000000000000'
const SCOPE = 'api://ai-gateway/chat'
const JEAN = 'https://jean.acme.example/'

/** What Entra's OpenID Connect discovery says of a tenant (abridged). */
const metadata = {
  issuer: ISSUER,
  authorization_endpoint: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`,
  token_endpoint: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
  end_session_endpoint: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/logout`,
  scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
  response_types_supported: ['code', 'id_token', 'code id_token', 'id_token token'],
}
const idToken = `e30.${Buffer.from(JSON.stringify({ preferred_username: 'ana@acme.example', tid: TENANT })).toString('base64url')}.`

/** Entra, as far as a sign-in reaches it: discovery under the tenant's path, and its token endpoint. */
function entra() {
  /** @type {{ url: string, body?: URLSearchParams }[]} */
  const asked = []
  const fetch = /** @type {typeof globalThis.fetch} */ (/** @type {unknown} */ (async (/** @type {string} */ url, /** @type {any} */ init = {}) => {
    asked.push({ url, ...(init.body && { body: new URLSearchParams(String(init.body)) }) })
    if (url === `https://login.microsoftonline.com/${TENANT}/v2.0/.well-known/openid-configuration`) return Response.json(metadata)
    if (url === metadata.token_endpoint) {
      const grant = new URLSearchParams(String(init.body)).get('grant_type')
      return Response.json({ token_type: 'Bearer', access_token: `access-${asked.length}`, refresh_token: `refresh-${asked.length}`, expires_in: 3599, ...(grant === 'authorization_code' && { id_token: idToken }) })
    }
    return new Response(null, { status: 404 })
  }))
  return { fetch, asked }
}

test('the issuer policy names is where Jean signs in, with no app to register and no resource indicator', async () => {
  const { fetch, asked } = entra()
  const found = await discover(ISSUER, { issuer: ISSUER, fetch })
  assert.equal(found.token_endpoint, metadata.token_endpoint)
  assert.equal(found.resource, undefined)
  assert.ok(!asked.some(({ url }) => url.includes('oauth-protected-resource')), 'no protected resource metadata asked for')
  const { url, pending } = await authorization(found, { clientId: CLIENT, redirectURI: JEAN, scopes: [SCOPE] })
  const sent = new URL(url)
  assert.equal(sent.origin + sent.pathname, metadata.authorization_endpoint)
  assert.equal(sent.searchParams.get('client_id'), CLIENT)
  assert.equal(sent.searchParams.get('redirect_uri'), JEAN)
  assert.equal(sent.searchParams.get('code_challenge_method'), 'S256')
  // The gateway's scope, then who signs in and renewals: one resource's scopes, as Entra wants.
  assert.deepEqual(sent.searchParams.get('scope')?.split(' '), [SCOPE, 'openid', 'email', 'offline_access'])
  assert.equal(sent.searchParams.get('resource'), null)
  assert.equal(sent.searchParams.get('prompt'), null)
  assert.equal(pending.tokenEndpoint, metadata.token_endpoint)
})

test('back from Entra, the code becomes tokens and who signed in; they renew with the refresh token', async () => {
  const { fetch, asked } = entra()
  const found = await discover(ISSUER, { issuer: ISSUER, fetch })
  const { pending } = await authorization(found, { clientId: CLIENT, redirectURI: JEAN, scopes: [SCOPE] })
  const tokens = await finish(new URLSearchParams({ code: 'the-code', state: pending.state, session_state: 'x' }), pending, fetch)
  assert.equal(tokens.account, 'ana@acme.example')
  assert.equal(tokens.clientId, CLIENT)
  assert.ok(tokens.expiresAt && tokens.expiresAt > Date.now() + 3500_000)
  const exchange = asked.at(-1)?.body
  assert.equal(exchange?.get('grant_type'), 'authorization_code')
  assert.equal(exchange?.get('code_verifier'), pending.verifier)
  assert.equal(exchange?.get('client_id'), CLIENT)
  const fresh = await refresh(tokens, fetch)
  assert.equal(asked.at(-1)?.body?.get('grant_type'), 'refresh_token')
  assert.equal(asked.at(-1)?.body?.get('refresh_token'), tokens.refresh)
  assert.notEqual(fresh.access, tokens.access)
  // Entra hands a new refresh token each time, which takes the old one's place.
  assert.notEqual(fresh.refresh, tokens.refresh)
})

test('a sign-in started elsewhere, or refused, gives no tokens', async () => {
  const { fetch } = entra()
  const { pending } = await authorization(await discover(ISSUER, { issuer: ISSUER, fetch }), { clientId: CLIENT, redirectURI: JEAN, scopes: [SCOPE] })
  await assert.rejects(finish(new URLSearchParams({ code: 'c', state: 'another' }), pending, fetch), /not started here/)
  await assert.rejects(finish(new URLSearchParams({ state: pending.state, error: 'access_denied', error_description: 'AADSTS50105: not assigned' }), pending, fetch), /AADSTS50105/)
})
