// Signing in to a connection (MCP authorization, D87). The service names its authorization
// server (protected resource metadata, RFC 9728), or one of the 2025-03-26 revision names none and
// has it at its own origin; that server's metadata says how to sign in (RFC 8414, or OpenID Connect
// discovery). Jean registers as a public client (RFC 7591), sends the user there with PKCE and a
// resource indicator (RFC 8707) to a service that named its server, checks who answered (RFC 9207),
// and trades the code for tokens, all from the browser. Host-agnostic: fetch and Web Crypto.
import { createVerifier, challengeS256 } from '../../core/oauth.js'

/**
 * @typedef {Record<string, any> & { issuer: string, authorization_endpoint: string, token_endpoint: string, resource?: string, scope?: string }} Metadata
 * @typedef {{ state: string, verifier: string, clientId: string, redirectURI: string, issuer: string, issRequired: boolean, tokenEndpoint: string, resource?: string }} Pending
 * @typedef {{ access: string, refresh?: string, expiresAt?: number, tokenEndpoint: string, clientId: string, resource?: string }} Tokens
 */

/** `Bearer resource_metadata="…", scope="…"` → its parameters. @param {string | null | undefined} header @returns {Record<string, string>} */
export const parseChallenge = (header) => Object.fromEntries([...String(header ?? '').matchAll(/(\w+)="([^"]*)"/g)].map((match) => [match[1], match[2]]))

/** An address the browser may be sent to or post to: HTTPS, or HTTP on this computer. @param {unknown} url */
const safe = (url) => typeof url === 'string' && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/])/i.test(url)

/** An address as the browser writes it, or null. @param {unknown} url */
const href = (url) => { try { return new URL(String(url)).href } catch { return null } }

/** @param {typeof globalThis.fetch} fetch @param {string} url */
const getJSON = (fetch, url) => fetch(url, { headers: { accept: 'application/json' } }).then((res) => (res.ok ? res.json() : null)).catch(() => null)

/**
 * Where and how to sign in to a service, from its 401's challenge when the browser could read it.
 * @param {string} server the service's address @param {{ challenge?: string | null, fetch?: typeof globalThis.fetch }} [options]
 * @returns {Promise<Metadata>}
 */
export async function discover(server, { challenge, fetch = globalThis.fetch } = {}) {
  const asked = parseChallenge(challenge)
  const at = new URL(server)
  const path = at.pathname.replace(/\/$/, '')
  let resource = null
  for (const url of [asked.resource_metadata, path && `${at.origin}/.well-known/oauth-protected-resource${path}`, `${at.origin}/.well-known/oauth-protected-resource`]) {
    if (url && (resource = await getJSON(fetch, url))?.authorization_servers?.length) break
  }
  // One that names none (Atlassian's /v1) has it at its own origin, and takes no resource indicator (D195).
  const named = Boolean(resource?.authorization_servers?.length)
  const issuer = named ? resource.authorization_servers[0] : at.origin
  // One that names itself (ServiceNow) may have it at its origin, whose metadata it serves (D283).
  const issuers = named && href(issuer) === href(server) ? [issuer, at.origin] : [issuer]
  for (const each of issuers) {
    const { origin, pathname } = new URL(each)
    const tenant = pathname.replace(/\/$/, '')
    const candidates = [`${origin}/.well-known/oauth-authorization-server${tenant}`, `${origin}/.well-known/openid-configuration${tenant}`, ...(tenant ? [`${origin}${tenant}/.well-known/openid-configuration`] : [])]
    for (const url of candidates) {
      const metadata = await getJSON(fetch, url)
      // A document only counts for the issuer it was asked about (RFC 8414, section 3.3), as an
      // address: "https://otter.ai/" is "https://otter.ai", but "…/tenant/" isn't "…/tenant".
      if (metadata && href(metadata.issuer) === href(each) && safe(metadata.authorization_endpoint) && safe(metadata.token_endpoint) && (!metadata.registration_endpoint || safe(metadata.registration_endpoint))) {
        return { ...metadata, resource: named ? resource.resource ?? server.replace(/#.*$/, '') : undefined, scope: asked.scope ?? resource?.scopes_supported?.join(' ') }
      }
    }
  }
  throw new Error(named ? 'The sign-in service could not be found.' : 'This service does not say where to sign in.')
}

/**
 * Registers Jean as a public client, with no secret: PKCE instead (Dynamic Client Registration).
 * @param {Metadata} metadata @param {{ redirectURI: string, name: string, fetch?: typeof globalThis.fetch }} options
 * @returns {Promise<string>} the client id
 */
export async function registerClient(metadata, { redirectURI, name, fetch = globalThis.fetch }) {
  if (!metadata.registration_endpoint) throw new Error('This service only accepts apps it registered itself.')
  const res = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: name, redirect_uris: [redirectURI], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
      application_type: /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(redirectURI) ? 'native' : 'web',
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.client_id) throw new Error(json?.error_description ?? `Registration failed (HTTP ${res.status})`)
  return json.client_id
}

/**
 * Where to send the user, and what to keep until they come back. Signing in to another account of
 * a service asks which one (`prompt=select_account`, which a server that doesn't know it ignores).
 * A service Jean knows may say what to ask for (`scopes`) and what more its sign-in wants (`params`, D344).
 * @param {Metadata} metadata @param {{ clientId: string, redirectURI: string, another?: boolean, scopes?: string[], params?: Record<string, string> }} options
 * @returns {Promise<{ url: string, pending: Pending }>}
 */
export async function authorization(metadata, { clientId, redirectURI, another = false, scopes, params: more = {} }) {
  const [verifier, state] = [createVerifier(), createVerifier().slice(0, 32)]
  const scope = [scopes?.join(' ') ?? metadata.scope, metadata.scopes_supported?.includes('offline_access') && 'offline_access'].filter(Boolean).join(' ')
  const url = new URL(metadata.authorization_endpoint)
  const prompt = [more.prompt, another && 'select_account'].filter(Boolean).join(' ')
  const params = { ...more, response_type: 'code', client_id: clientId, redirect_uri: redirectURI, code_challenge: await challengeS256(verifier), code_challenge_method: 'S256', state, ...(metadata.resource && { resource: metadata.resource }), ...(scope && { scope }), ...(prompt && { prompt }) }
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  const issRequired = metadata.authorization_response_iss_parameter_supported === true
  return { url: url.href, pending: { state, verifier, clientId, redirectURI, issuer: metadata.issuer, issRequired, tokenEndpoint: metadata.token_endpoint, resource: metadata.resource } }
}

/**
 * The user came back: check who answered, then trade the code for tokens.
 * @param {URLSearchParams} params the address's query @param {Pending} pending @param {typeof globalThis.fetch} [fetch]
 * @returns {Promise<Tokens>}
 */
export async function finish(params, pending, fetch = globalThis.fetch) {
  if (params.get('state') !== pending.state) throw new Error('This sign-in was not started here.')
  const iss = params.get('iss')
  if (iss ? iss !== pending.issuer : pending.issRequired) throw new Error('The sign-in came back from another server.')
  const code = params.get('code')
  if (!code) throw new Error(params.get('error_description') ?? params.get('error') ?? 'The sign-in was cancelled.')
  return token(pending, { grant_type: 'authorization_code', code, redirect_uri: pending.redirectURI, code_verifier: pending.verifier }, fetch)
}

/** New tokens before the access token runs out; the refresh token stays when no new one comes. @param {Tokens} tokens @param {typeof globalThis.fetch} [fetch] */
export async function refresh(tokens, fetch = globalThis.fetch) {
  if (!tokens.refresh) throw new Error('Sign in again.')
  return { refresh: tokens.refresh, ...await token(tokens, { grant_type: 'refresh_token', refresh_token: tokens.refresh }, fetch) }
}

/** @param {{ tokenEndpoint: string, clientId: string, resource?: string }} client @param {Record<string, string>} form @param {typeof globalThis.fetch} fetch @returns {Promise<Tokens>} */
async function token({ tokenEndpoint, clientId, resource }, form, fetch) {
  const body = new URLSearchParams({ ...form, client_id: clientId, ...(resource && { resource }) })
  const res = await fetch(tokenEndpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.access_token) throw new Error(json?.error_description ?? json?.error ?? `HTTP ${res.status}`)
  const expiresAt = json.expires_in ? Date.now() + json.expires_in * 1000 : undefined
  return { access: json.access_token, ...(json.refresh_token && { refresh: json.refresh_token }), ...(expiresAt && { expiresAt }), tokenEndpoint, clientId, resource }
}
