// OpenRouter sign-in with OAuth PKCE (RFC 7636), entirely in the browser: the user approves on
// openrouter.ai, comes back with ?code=…, and the code is exchanged for a key the user controls.
// https://openrouter.ai/docs/use-cases/oauth-pkce

import { LLMError, fetchOrThrow } from './llm.js'

const AUTH_URL = 'https://openrouter.ai/auth'
const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys'

/** 48 random bytes → 64 base64url characters (RFC 7636 allows 43 to 128). */
export function createVerifier() {
  return base64url(crypto.getRandomValues(new Uint8Array(48)))
}

/** @param {string} verifier */
export async function challengeS256(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

/** @param {{ callbackURL: string, challenge: string }} options */
export function openRouterAuthURL({ callbackURL, challenge }) {
  const url = new URL(AUTH_URL)
  url.searchParams.set('callback_url', callbackURL)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.href
}

/**
 * @param {{ code: string, verifier: string, fetch?: typeof globalThis.fetch }} options
 * @returns {Promise<string>} the API key
 */
export async function exchangeOpenRouterCode({ code, verifier, fetch = globalThis.fetch }) {
  const res = await fetchOrThrow(fetch, KEYS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  })
  const json = await res.json().catch(() => null)
  if (typeof json?.key !== 'string') throw new LLMError('OpenRouter returned no key', { code: 'bad_response' })
  return json.key
}

/** @param {Uint8Array} bytes */
function base64url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
