import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createVerifier, challengeS256, openRouterAuthURL, exchangeOpenRouterCode } from '../core/oauth.js'
import { LLMError } from '../core/llm.js'

test('createVerifier: 64 base64url characters, different every time', () => {
  const a = createVerifier()
  const b = createVerifier()
  assert.match(a, /^[A-Za-z0-9_-]{64}$/)
  assert.match(b, /^[A-Za-z0-9_-]{64}$/)
  assert.notEqual(a, b)
})

test('challengeS256 matches the RFC 7636 test vector', async () => {
  assert.equal(await challengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
})

test('openRouterAuthURL', () => {
  const href = openRouterAuthURL({ callbackURL: 'https://app.example/callback?x=1&y=é', challenge: 'abc-_' })
  const url = new URL(href)
  assert.equal(url.origin + url.pathname, 'https://openrouter.ai/auth')
  assert.equal(url.searchParams.get('callback_url'), 'https://app.example/callback?x=1&y=é')
  assert.equal(url.searchParams.get('code_challenge'), 'abc-_')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
})

test('exchangeOpenRouterCode posts the code and verifier and returns the key', async () => {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, init })
    return Response.json({ key: 'sk-or-v1-abc', user_id: 'u1' })
  }
  assert.equal(await exchangeOpenRouterCode({ code: 'the-code', verifier: 'the-verifier', fetch }), 'sk-or-v1-abc')
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/auth/keys')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].init.body), { code: 'the-code', code_verifier: 'the-verifier', code_challenge_method: 'S256' })
})

test('exchangeOpenRouterCode failures are LLMErrors', async () => {
  const cases = [
    [async () => Response.json({ error: { message: 'Invalid code', code: 403 } }, { status: 403 }), 'auth', /Invalid code/],
    [async () => Response.json({ error: { message: 'Bad verifier' } }, { status: 400 }), 'bad_request', /Bad verifier/],
    [async () => Response.json({ nothing: true }), 'bad_response', /no key/],
    [async () => new Response('not json'), 'bad_response', /no key/],
    [async () => { throw new TypeError('Failed to fetch') }, 'cors_or_offline', /Failed to fetch/],
  ]
  for (const [fetch, code, message] of cases) {
    await assert.rejects(exchangeOpenRouterCode({ code: 'c', verifier: 'v', fetch }), (error) => {
      assert.ok(error instanceof LLMError)
      assert.equal(error.code, code)
      assert.match(error.message, message)
      return true
    })
  }
})
