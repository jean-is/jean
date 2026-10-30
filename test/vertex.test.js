import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vertexToken } from '../app/core/vertex.js'
import { LLMError } from '../app/core/llm.js'

const API = 'https://aiplatform.googleapis.com/v1/projects/acme/locations/global/endpoints/openapi'
const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const lines = Buffer.from(await crypto.subtle.exportKey('pkcs8', privateKey)).toString('base64').match(/.{1,64}/g).join('\n')
const account = (fields = {}) => JSON.stringify({ type: 'service_account', project_id: 'acme', private_key_id: 'k1', private_key: `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`, client_email: 'jean@acme.iam.gserviceaccount.com', ...fields })
const decoded = (part) => JSON.parse(Buffer.from(part, 'base64url').toString())

test('a service account’s file signs a token for this API alone, for the hour Google allows', async () => {
  const before = Math.floor(Date.now() / 1000)
  const [head, claims, signature] = (await vertexToken(account(), API)).split('.')
  assert.deepEqual(decoded(head), { alg: 'RS256', typ: 'JWT', kid: 'k1' })
  const { iat, exp, ...who } = decoded(claims)
  assert.deepEqual(who, { iss: 'jean@acme.iam.gserviceaccount.com', sub: 'jean@acme.iam.gserviceaccount.com', aud: 'https://aiplatform.googleapis.com/' })
  assert.ok(iat >= before)
  assert.equal(exp - iat, 3600)
  assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${head}.${claims}`)))
})

test('an access token goes as it is, and no key as none', async () => {
  assert.equal(await vertexToken('ya29.token', API), 'ya29.token')
  assert.equal(await vertexToken(undefined, API), undefined)
})

test('a file that can’t sign is a refused key, whose error quotes nothing of it', async () => {
  for (const file of ['{not json', '{}', account({ private_key: 'secret-looking-text' }), account({ private_key: undefined })]) {
    await assert.rejects(vertexToken(file, API), (error) => {
      assert.ok(error instanceof LLMError)
      assert.equal(error.code, 'auth')
      assert.equal(error.cause, undefined)
      assert.doesNotMatch(error.message, /secret|not json/)
      return true
    })
  }
})
