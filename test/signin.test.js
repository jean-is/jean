// SPDX-License-Identifier: MIT
// Signing in with the organisation's account (D385), Entra ID's way: the issuer policy names, by
// its tenant, and Jean's app registered there; the scopes for the gateway, and the token it gives.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discover, authorization, finish, refresh, whoOf, scopesFor } from '../app/caps/connections/auth.js'

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
const idToken = `e30.${Buffer.from(JSON.stringify({ preferred_username: 'ana@acme.example', tid: TENANT, groups: ['5a8e2c41-0b7d-4c1e-9f3a-6d2b8e4f1a07'], roles: ['Jean.Legal'] })).toString('base64url')}.`

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
  // Its own discovery, under its path, before any address it doesn't serve, each a refusal in the console.
  assert.deepEqual(asked.map(({ url }) => url), [`${ISSUER}/.well-known/openid-configuration`])
  const { url, pending } = await authorization(found, { clientId: CLIENT, redirectURI: JEAN, scopes: scopesFor(found, ['openid', 'profile', 'email', 'offline_access', SCOPE]), only: true })
  const sent = new URL(url)
  assert.equal(sent.origin + sent.pathname, metadata.authorization_endpoint)
  assert.equal(sent.searchParams.get('client_id'), CLIENT)
  assert.equal(sent.searchParams.get('redirect_uri'), JEAN)
  assert.equal(sent.searchParams.get('code_challenge_method'), 'S256')
  // What policy names, as enterprise.md has it for Entra: who signs in, their name and email, renewals, and the
  // gateway's scope, one resource's scopes, as Entra wants.
  assert.deepEqual(sent.searchParams.get('scope')?.split(' '), ['openid', 'profile', 'email', 'offline_access', SCOPE])
  assert.equal(sent.searchParams.get('resource'), null)
  assert.equal(sent.searchParams.get('prompt'), null)
  assert.equal(pending.tokenEndpoint, metadata.token_endpoint)
})

test('policy’s scopes are all the sign-in asks for, `openid` always; without them, the person’s name and email and renewals where the provider lists them (D696)', async () => {
  /** @param {any} found @param {string[]} [scopes] */
  const asked = async (found, scopes) => new URL((await authorization(found, { clientId: CLIENT, redirectURI: JEAN, scopes: scopesFor(found, scopes), only: true })).url).searchParams.get('scope')
  // An identity provider that refuses a scope it never granted Jean's app gets what IT wrote, and no more.
  assert.equal(await asked(metadata, [SCOPE]), `openid ${SCOPE}`)
  assert.equal(await asked(metadata, ['openid']), 'openid')
  assert.equal(await asked(metadata, ['openid profile', 'groups']), 'openid profile groups')
  // What IT wrote goes as written, listed or not: a provider may give renewals for `offline_access` without listing it.
  assert.equal(await asked({ ...metadata, scopes_supported: ['openid', 'profile', 'email'] }, ['openid', 'offline_access', SCOPE]), `openid offline_access ${SCOPE}`)
  assert.equal(await asked({ ...metadata, scopes_supported: undefined }, ['openid', 'offline_access']), 'openid offline_access')
  assert.equal(await asked(metadata), 'openid profile email offline_access')
  // ADFS offers no offline_access; a provider that lists nothing gets `openid` alone.
  assert.equal(await asked({ ...metadata, scopes_supported: ['openid', 'profile', 'email', 'allatclaims'] }), 'openid profile email')
  assert.equal(await asked({ ...metadata, scopes_supported: undefined }), 'openid')
  // A connection's sign-in still adds who signs in and renewals to its own scopes.
  assert.equal(new URL((await authorization(metadata, { clientId: CLIENT, redirectURI: JEAN, scopes: [SCOPE] })).url).searchParams.get('scope'), `${SCOPE} openid email offline_access`)
})

test('back from Entra, the code becomes tokens and who signed in; they renew with the refresh token', async () => {
  const { fetch, asked } = entra()
  const found = await discover(ISSUER, { issuer: ISSUER, fetch })
  const { pending } = await authorization(found, { clientId: CLIENT, redirectURI: JEAN, scopes: [SCOPE] })
  const tokens = await finish(new URLSearchParams({ code: 'the-code', state: pending.state, session_state: 'x' }), pending, fetch)
  assert.equal(tokens.account, 'ana@acme.example')
  assert.equal(tokens.idToken, idToken, 'kept whole, for the organisation’s relay (D731)')
  assert.deepEqual(tokens.groups, ['5a8e2c41-0b7d-4c1e-9f3a-6d2b8e4f1a07', 'Jean.Legal'])
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

test('the ID token’s groups and app roles are kept as the directory names them; more than it holds, as null (D429)', async () => {
  const groupsOf = async (/** @type {Record<string, unknown>} */ claims) => (await whoOf(`e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`)).groups
  // Entra: security groups by object id, app roles by value; Okta and Keycloak: groups by name.
  assert.deepEqual(await groupsOf({ groups: ['5a8e2c41-0b7d-4c1e-9f3a-6d2b8e4f1a07'], roles: ['Jean.Legal'] }), ['5a8e2c41-0b7d-4c1e-9f3a-6d2b8e4f1a07', 'Jean.Legal'])
  assert.deepEqual(await groupsOf({ groups: ['Everyone', '/legal', 42, null, { id: 'x' }] }), ['Everyone', '/legal'])
  assert.deepEqual(await groupsOf({ groups: 'Everyone' }), ['Everyone'])
  assert.deepEqual(await groupsOf({ preferred_username: 'ana@acme.example' }), [], 'none said is none')
  // Past 200 groups, Entra names where to read them in place of the claim, and only Graph could say them.
  assert.equal(await groupsOf({ roles: ['Jean.Legal'], _claim_names: { groups: 'src1' }, _claim_sources: { src1: { endpoint: 'https://graph.windows.net/…/getMemberObjects' } } }), null)
  assert.equal(await groupsOf({ hasgroups: true }), null)
})

test('a sign-in started elsewhere, or refused, gives no tokens', async () => {
  const { fetch } = entra()
  const { pending } = await authorization(await discover(ISSUER, { issuer: ISSUER, fetch }), { clientId: CLIENT, redirectURI: JEAN, scopes: [SCOPE] })
  await assert.rejects(finish(new URLSearchParams({ code: 'c', state: 'another' }), pending, fetch), /not started here/)
  await assert.rejects(finish(new URLSearchParams({ state: pending.state, error: 'access_denied', error_description: 'AADSTS50105: not assigned' }), pending, fetch), /AADSTS50105/)
})
