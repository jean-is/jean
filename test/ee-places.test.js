// Data residency (D434, ee/): policy's `jurisdictions` keeps requests to brains within its places. Brains on this
// device or this computer stay; policy's own stay when the `jurisdiction` it declares is within one; the others
// are left out, and policy.html says which, since policy's brains are the only ones.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { within, outside, kept, check, EU } from '../app/ee/places.js'

const BRAINS = [
  { id: 'paris', provider: 'custom', api: 'openai', baseURL: 'https://ai.acme.example/v1', model: 'mistral-large', jurisdiction: 'FR' },
  { id: 'frankfurt', provider: 'custom', api: 'openai', baseURL: 'https://ai.acme.example/de/v1', model: 'gpt-5', jurisdiction: 'DE-HE' },
  { id: 'virginia', provider: 'openai', api: 'openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-5', jurisdiction: 'US' },
  { id: 'unsaid', provider: 'custom', api: 'openai', baseURL: 'https://ai.example/v1', model: 'llama' },
  { id: 'here', provider: 'ollama', api: 'openai', baseURL: 'http://localhost:11434/v1', model: 'gemma4' },
  { id: 'device', provider: 'device', api: 'device', baseURL: '', model: 'onnx-community/gemma-4-E2B-it-ONNX' },
]

test('a place is within one allowed: itself, its country, or the EU of its member states', () => {
  assert.equal(EU.length, 27)
  assert.equal(within('FR', ['FR']), true)
  assert.equal(within('DE-HE', ['DE']), true)
  assert.equal(within('DE-HE', ['EU']), true)
  assert.equal(within('EU', ['EU']), true)
  // The EU may be any of its states; a brain in one state isn't in another.
  assert.equal(within('EU', ['FR']), false)
  assert.equal(within('US', ['EU']), false)
  assert.equal(within('CH', ['EU']), false)
  assert.equal(within('FRA', ['FR']), false)
  assert.equal(within(undefined, ['FR']), false)
})

test('brains here, and policy’s within its places, stay; the others are left out', () => {
  const policy = { brains: BRAINS, jurisdictions: ['EU'] }
  assert.deepEqual(outside(policy).map((brain) => brain.id), ['virginia', 'unsaid'])
  assert.deepEqual(kept(policy).brains.map((brain) => brain.id), ['paris', 'frankfurt', 'here', 'device'])
  assert.deepEqual(kept({ brains: BRAINS, jurisdictions: ['FR', 'US'] }).brains.map((brain) => brain.id), ['paris', 'virginia', 'here', 'device'])
  assert.deepEqual(kept(policy).jurisdictions, ['EU'])
  // Naming none, policy is left as it is, and the start stops Jean, as check() says why.
  assert.equal(kept({ jurisdictions: ['EU'] }).brains, undefined)
})

test('policy.html says what is wrong: codes it can’t read, no brains of policy’s own, or a brain they would leave out', () => {
  assert.deepEqual(check({ brains: BRAINS.slice(0, 2), jurisdictions: ['EU'] }), ['EU'])
  assert.throws(() => check({ brains: BRAINS, jurisdictions: 'FR' }), /a list of ISO 3166 codes/)
  assert.throws(() => check({ brains: BRAINS, jurisdictions: [] }), /a list of ISO 3166 codes/)
  assert.throws(() => check({ brains: BRAINS, jurisdictions: ['France'] }), /"France", which isn’t an ISO 3166 code/)
  assert.throws(() => check({ jurisdictions: ['FR'] }), /list them in brains/)
  assert.throws(() => check({ brains: BRAINS, jurisdictions: ['EU'] }), /brains virginia \(US\), unsaid \(none\) declare no jurisdiction within EU/)
})
