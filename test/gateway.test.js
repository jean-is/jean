// SPDX-License-Identifier: MIT
// The gateway's witnesses and logs (D276): those it is given, it relays to and says it serves, so
// Jean's certificates can be dated by authorities that don't answer browsers. And an authority's OCSP
// responders and CRLs over plain HTTP, when it names their origins whole (D434).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateway, covers } from '../gateway/gateway.js'

const JEAN = 'http://127.0.0.1:4180'
const AT = 'https://gateway.example/'

test('the gateway relays to the witnesses and logs it is given, and says which they are', async () => {
  const handle = gateway({ origins: [JEAN], hosts: [], timestamps: ['https://tsa.example/tsr'], logs: ['https://log.example'] })
  const served = await (await handle(new Request(AT, { headers: { origin: JEAN } }))).json()
  assert.deepEqual(served, { format: 1, hosts: ['tsa.example', 'log.example'], clients: {}, timestamps: ['https://tsa.example/tsr'], logs: ['https://log.example'] })
  assert.ok(covers(served.hosts, new URL('https://tsa.example/tsr')) && covers(served.hosts, new URL('https://log.example/api/v1/log/entries')))
  const elsewhere = await handle(new Request(`${AT}?url=${encodeURIComponent('https://other.example/tsr')}`, { method: 'POST', headers: { origin: JEAN } }))
  assert.equal(elsewhere.status, 403)
  // Given none, it says nothing of them.
  assert.deepEqual(Object.keys(await (await gateway({ origins: [JEAN], hosts: [] })(new Request(AT, { headers: { origin: JEAN } }))).json()), ['format', 'hosts', 'clients'])
})

test('an origin over plain HTTP is relayed to only when it is named whole, as an authority’s OCSP responder is', () => {
  const hosts = ['acme.example', 'http://ocsp.acme.example']
  assert.equal(covers(hosts, new URL('http://ocsp.acme.example/')), true)
  assert.equal(covers(hosts, new URL('http://ocsp.acme.example/issuing')), true)
  assert.equal(covers(hosts, new URL('https://ocsp.acme.example/')), true)
  assert.equal(covers(hosts, new URL('http://crl.acme.example/issuing.crl')), false)
  assert.equal(covers(hosts, new URL('http://ocsp.acme.example:8080/')), false)
})

/** A gateway whose relayed requests a fake answers, each kept to look at. @param {(url: string, init: RequestInit) => Response} answer @param {Parameters<typeof gateway>[0]} [config] */
function relaying(answer, config = {}) {
  const asked = /** @type {{ url: string, headers: Headers, body: unknown }[]} */ ([])
  const real = globalThis.fetch
  globalThis.fetch = /** @type {typeof fetch} */ (async (url, init) => {
    asked.push({ url: String(url), headers: new Headers(init?.headers), body: init?.body })
    return answer(String(url), init ?? {})
  })
  return { asked, handle: gateway({ origins: [JEAN], hosts: ['a.example', 'b.example'], ...config }), done: () => { globalThis.fetch = real } }
}
const moved = (/** @type {string} */ to, status = 302) => new Response(null, { status, headers: { location: to } })
const through = (/** @type {string} */ url, /** @type {RequestInit} */ init = {}) => new Request(`${AT}?url=${encodeURIComponent(url)}`, { ...init, headers: { origin: JEAN, ...init.headers } })

test('a redirect to another address takes no credentials with it', async () => {
  const { asked, handle, done } = relaying((url) => (url.includes('a.example') ? moved('https://b.example/next') : new Response('{}')))
  try {
    await handle(through('https://a.example/start', { headers: { authorization: 'Bearer secret', 'x-subscription-token': 'key', 'mcp-session-id': 'session', accept: 'text/plain' } }))
    assert.equal(asked[0].headers.get('authorization'), 'Bearer secret')
    assert.equal(asked[1].url, 'https://b.example/next')
    for (const name of ['authorization', 'x-subscription-token', 'mcp-session-id']) assert.equal(asked[1].headers.get(name), null, name)
    assert.equal(asked[1].headers.get('accept'), 'text/plain')
  } finally { done() }
})

test('a redirect within an address keeps them', async () => {
  const { asked, handle, done } = relaying((url) => (url.endsWith('/start') ? moved('/next') : new Response('{}')))
  try {
    await handle(through('https://a.example/start', { headers: { authorization: 'Bearer secret' } }))
    assert.equal(asked[1].headers.get('authorization'), 'Bearer secret')
  } finally { done() }
})

test('a token request, which holds the app’s secret, is never sent to another address', async () => {
  const clients = [{ issuer: 'https://a.example', tokenEndpoint: 'https://a.example/token', clientId: 'jean', clientSecret: 'shh' }]
  const { asked, handle, done } = relaying(() => moved('https://b.example/stolen', 307), { clients })
  try {
    const answer = await handle(through('https://a.example/token', { method: 'POST', body: 'client_id=jean&code=1' }))
    assert.equal(answer.status, 502)
    assert.equal(asked.length, 1)
    assert.match(String(asked[0].body), /client_secret=shh/)
  } finally { done() }
})

test('a request past the limit is refused unread, whatever its length claims', async () => {
  const { asked, handle, done } = relaying(() => new Response('{}'))
  try {
    assert.equal((await handle(through('https://a.example/', { method: 'POST', headers: { 'content-length': '10000001' }, body: 'x' }))).status, 413)
    const stream = new ReadableStream({ start(controller) { for (let i = 0; i < 11; i++) controller.enqueue(new Uint8Array(1_000_000)); controller.close() } })
    assert.equal((await handle(through('https://a.example/', { method: 'POST', body: stream, duplex: 'half' }))).status, 413)
    assert.equal(asked.length, 0)
    await handle(through('https://a.example/', { method: 'POST', body: 'small' }))
    assert.equal(new TextDecoder().decode(/** @type {ArrayBuffer} */ (asked[0].body)), 'small')
  } finally { done() }
})

test('an address with a name and password in it, or a method it doesn’t announce, goes nowhere', async () => {
  assert.equal(covers(['a.example'], new URL('https://me:pw@a.example/')), false)
  const { asked, handle, done } = relaying(() => new Response('{}'))
  try {
    assert.equal((await handle(through('https://me:pw@a.example/'))).status, 403)
    assert.equal((await handle(through('https://a.example/', { method: 'PUT', body: 'x' }))).status, 405)
    assert.equal(asked.length, 0)
  } finally { done() }
})

test('what it relays can’t run as a page of the gateway’s address', async () => {
  const { handle, done } = relaying(() => new Response('<script>alert(1)</script>', { headers: { 'content-type': 'text/html' } }))
  try {
    const answer = await handle(through('https://a.example/page'))
    assert.equal(answer.headers.get('x-content-type-options'), 'nosniff')
    assert.match(answer.headers.get('content-security-policy') ?? '', /^sandbox; default-src 'none'/)
  } finally { done() }
})
