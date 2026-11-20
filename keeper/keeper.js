// SPDX-License-Identifier: MIT
// The keeper (D762): on a company's own server, what applies the changes its owner's Jean signs, and nothing else.
// The owner's key, the public half of a P-256 pair made in their browser, is pinned when the server is installed
// (deploy/company/install.sh). A change it signs replaces the company's policy, the apps its gateway holds, or the
// owner's key itself. The key stays in the Jean that wrote the server's line, at whatever address that Jean is served
// from, so the keeper answers any origin: the signature is the proof, and no cookie or account is involved. It obeys
// no one else and keeps no log.
//
//   GET  <keeper>    { format: 1, owner: <the owner's key's fingerprint>, seq: <the last change applied, 0 for none> }
//   POST <keeper>    a change, as a JWS compact serialisation signed with ES256 by the owner's key, whose payload is
//                    { format: 1, seq, policy?, gateway?: { clients?, hosts?, timestamps?, logs? }, owner? }
//     seq      more than the last applied, so that a change can't be sent again
//     policy   the whole of policy.json
//     gateway  the gateway's configuration but its origins (gateway/gateway.js), which stay the company's address
//     owner    the next owner's key, the base64url of its raw point, which signs every change after this one
//
// Web-standard (fetch, Request, Response, Web Crypto); `node keeper/serve.js` runs it, writing to files.

const LIMIT = 512_000
const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'", 'referrer-policy': 'no-referrer', 'access-control-allow-origin': '*' }

/**
 * @typedef {{ seq: number, owner: string }} State
 * @typedef {{ owner: string, origins: string[] }} Config
 * @typedef {{ read(): Promise<State | null>, write(state: State): Promise<void>, policy(policy: object): Promise<void>, gateway(config: object): Promise<void> }} Files
 * @typedef {{ format: 1, seq: number, policy?: object, gateway?: Record<string, unknown>, owner?: string }} Change
 */

/** @param {string} text */
const decode = (text) => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0))
/** @param {Uint8Array} bytes */
const encode = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

/** A P-256 public key's raw point, uncompressed, in base64url: 65 bytes, the first 4. @param {unknown} key */
export const isKey = (key) => {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(key)) return false
  const point = decode(key)
  return point.length === 65 && point[0] === 4
}

/** What names an owner's key in answers: the base64url of its point's SHA-256. @param {string} key */
export const fingerprint = async (key) => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', decode(key))))

/** A plain object, not an array or null. @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
/** @param {unknown} value */
const isHttps = (value) => { try { return typeof value === 'string' && new URL(value).protocol === 'https:' } catch { return false } }
/** @param {unknown} value @param {(one: unknown) => boolean} each */
const isList = (value, each) => Array.isArray(value) && value.every(each)
/** An app a sign-in server registered, as gateway.js holds it. @param {unknown} client */
const isClient = (client) => isObject(client) && isHttps(client.issuer) && isHttps(client.tokenEndpoint)
  && typeof client.clientId === 'string' && typeof client.clientSecret === 'string' && (client.auth === undefined || client.auth === 'post' || client.auth === 'basic')
const GATEWAY = /** @type {Record<string, (value: unknown) => boolean>} */ ({
  clients: (value) => isList(value, isClient),
  hosts: (value) => isList(value, (host) => typeof host === 'string' && host.length > 0),
  timestamps: (value) => isList(value, isHttps),
  logs: (value) => isList(value, isHttps),
})

/** Why a change can't be applied, or nothing if it can. @param {unknown} change @param {number} last @returns {string | undefined} */
function wrong(change, last) {
  if (!isObject(change) || change.format !== 1) return 'This is not a change the keeper reads.'
  if (!Number.isSafeInteger(change.seq) || /** @type {number} */ (change.seq) <= last) return 'This change is older than the last one applied.'
  if (change.policy === undefined && change.gateway === undefined && change.owner === undefined) return 'This change changes nothing.'
  if (change.policy !== undefined && !isObject(change.policy)) return 'The policy is not an object.'
  if (change.gateway !== undefined && !(isObject(change.gateway) && Object.entries(change.gateway).every(([name, value]) => GATEWAY[name]?.(value)))) return 'The gateway’s configuration is not one the keeper writes.'
  if (change.owner !== undefined && !isKey(change.owner)) return 'The next owner’s key is not a P-256 public key.'
}

/**
 * A JWS's payload if the key signed it with ES256, null if the key didn't, undefined if it isn't one.
 * @param {string} jws @param {string} key @returns {Promise<unknown>}
 */
async function signed(jws, key) {
  const [head, body, signature, ...more] = jws.trim().split('.')
  if (more.length || !head || !body || !signature) return undefined
  let header, payload, bytes
  try {
    header = JSON.parse(new TextDecoder().decode(decode(head)))
    payload = JSON.parse(new TextDecoder().decode(decode(body)))
    bytes = decode(signature)
  } catch { return undefined }
  if (header?.alg !== 'ES256' || bytes.length !== 64) return undefined
  const verifier = await crypto.subtle.importKey('raw', decode(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifier, bytes, new TextEncoder().encode(`${head}.${body}`)) ? payload : null
}

/** @param {Config} config @param {Files} files @returns {(request: Request) => Promise<Response>} */
export function keeper({ owner, origins }, files) {
  if (!isKey(owner)) throw new Error('The keeper needs the owner’s key: the base64url of a P-256 public key’s raw point.')
  /** @returns {Promise<State>} */
  const state = async () => (await files.read()) ?? { seq: 0, owner }
  // One change at a time, in the order they arrive.
  let queue = Promise.resolve()
  /** @param {Change} change @param {State} now */
  const apply = async (change, now) => {
    if (change.policy) await files.policy(change.policy)
    if (change.gateway) await files.gateway({ ...change.gateway, origins })
    await files.write({ seq: change.seq, owner: change.owner ?? now.owner })
  }
  return async (request) => {
    const answer = (/** @type {object} */ body, status = 200) => Response.json(body, { status, headers: HEADERS })
    if (request.method === 'GET' || request.method === 'HEAD') {
      const now = await state()
      return answer({ format: 1, owner: await fingerprint(now.owner), seq: now.seq })
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...HEADERS, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } })
    if (request.method !== 'POST') return answer({ error: 'The keeper takes only signed changes.' }, 405)
    if (Number(request.headers.get('content-length')) > LIMIT) return answer({ error: 'This change is too large.' }, 413)
    const text = await request.text()
    if (text.length > LIMIT) return answer({ error: 'This change is too large.' }, 413)
    const done = queue.then(async () => {
      const now = await state()
      const change = await signed(text, now.owner)
      if (change === undefined) return answer({ error: 'This is not a change signed with ES256.' }, 400)
      if (change === null) return answer({ error: 'The owner’s key did not sign this change.' }, 401)
      const why = wrong(change, now.seq)
      if (why) return answer({ error: why }, why.startsWith('This change is older') ? 409 : 400)
      await apply(/** @type {Change} */ (change), now)
      return answer({ format: 1, seq: /** @type {Change} */ (change).seq })
    })
    queue = done.then(() => {}, () => {})
    return done
  }
}
