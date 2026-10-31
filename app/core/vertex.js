// Vertex AI: the key a request carries, and its list of models. Imported the first time a Vertex AI brain is used.

import { LLMError, fetchOrThrow } from './llm.js'
import { base64url } from './oauth.js'

const SIGNING = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }

/**
 * An access token goes as it is. A service account's key file signs a token here for each request, good for this API alone
 * and for the hour Google allows, so the file works until it is deleted at Google, and is never sent anywhere.
 * https://google.aip.dev/auth/4111
 * @param {string | undefined} key @param {string} baseURL @returns {Promise<string | undefined>}
 */
export async function vertexToken(key, baseURL) {
  if (!key?.startsWith('{')) return key
  try {
    const { client_email: email, private_key: pem, private_key_id: kid } = JSON.parse(key)
    const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0))
    const signer = await crypto.subtle.importKey('pkcs8', der, SIGNING, false, ['sign'])
    const iat = Math.floor(Date.now() / 1000)
    const claims = { iss: email, sub: email, aud: `${new URL(baseURL).origin}/`, iat, exp: iat + 3600 }
    const signed = [{ alg: 'RS256', typ: 'JWT', kid }, claims].map((part) => base64url(new TextEncoder().encode(JSON.stringify(part)))).join('.')
    return `${signed}.${base64url(new Uint8Array(await crypto.subtle.sign(SIGNING, signer, new TextEncoder().encode(signed))))}`
  } catch {
    // Without the cause: JSON.parse's message quotes what it read.
    throw new LLMError('Not a service account’s key file', { code: 'auth' })
  }
}

/** Its Chat Completions has no model list: Google's catalogue of its own Gemini stands in. @param {import('./types.js').Connection} options */
export async function vertexModels({ brain, apiKey, signal, fetch = globalThis.fetch }) {
  const headers = { authorization: `Bearer ${await vertexToken(apiKey, brain.baseURL)}` }
  const res = await fetchOrThrow(fetch, `${new URL(brain.baseURL).origin}/v1beta1/publishers/google/models`, { headers }, signal)
  const list = (await res.json().catch(() => null))?.publisherModels
  if (!Array.isArray(list)) throw new LLMError('Unexpected model list', { code: 'bad_response' })
  return list.map((/** @type {any} */ m) => ({ id: `google/${String(m.name).split('/').at(-1)}` })).filter((m) => m.id.includes('gemini'))
}
