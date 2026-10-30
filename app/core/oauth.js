// OpenRouter sign-in with OAuth PKCE (RFC 7636), entirely in the browser: the user approves on
// openrouter.ai, comes back with ?code=…, and the code is exchanged for a key the user controls.
// https://openrouter.ai/docs/use-cases/oauth-pkce

import { LLMError, fetchOrThrow } from './llm.js'

const AUTH_URL = 'https://openrouter.ai/auth'
const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys'

/** 48 random bytes → 64 base64url characters (RFC 7636 allows 43 to 128). */
export const createVerifier = () => base64url(crypto.getRandomValues(new Uint8Array(48)))

/** @param {string} verifier */
export const challengeS256 = async (verifier) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))

/** @param {{ callbackURL: string, challenge: string }} options */
export const openRouterAuthURL = ({ callbackURL, challenge }) => `${AUTH_URL}?${new URLSearchParams({ callback_url: callbackURL, code_challenge: challenge, code_challenge_method: 'S256' })}`

/**
 * @param {{ code: string, verifier: string, fetch?: typeof globalThis.fetch }} options
 * @returns {Promise<string>} the API key
 */
export async function exchangeOpenRouterCode({ code, verifier, fetch = globalThis.fetch }) {
  const res = await fetchOrThrow(fetch, KEYS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }) })
  const json = await res.json().catch(() => null)
  if (typeof json?.key !== 'string') throw new LLMError('OpenRouter returned no key', { code: 'bad_response' })
  return json.key
}

/** @param {Uint8Array} bytes a few hundred at most */
export const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
