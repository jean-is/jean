// Content Credentials (C2PA 2.2, D324): the manifest a picture made on this device or this computer
// carries, signed by the seal and dated by a witness, read back as C2PA's own tool reads it; manifests
// C2PA's tool made (c2patool 0.27.22, its test signer, no thumbnail), read and checked here; and a
// provider's picture or film, whose marks pass through untouched.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cbor, uncbor, Tagged, credentialed, credentialsOf, storeIn } from '../app/caps/receipt/c2pa.js'
import { makeSeal, tokenFor } from '../app/caps/receipt/certificate.js'
import { marked } from '../app/caps/pictures/mark.js'
import { picture, film } from '../app/caps/pictures/cloud.js'
import { PROVIDERS } from '../app/core/llm.js'
import { reply } from './fixtures/tsa.js'

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'))
const fixture = (/** @type {string} */ name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))
const made = { maker: 'Z-Image-Turbo', revision: 'webnn/Z-Image-Turbo@02e1d8c', generator: { name: 'Jean', version: '0.8.0' } }

describe('CBOR as C2PA writes it', () => {
  test('integers, text, bytes, arrays, maps and tags, back as they went', () => {
    const value = { a: [0, 23, 24, 255, 256, 65535, 65536, -1, -25, -7], b: 'é ✓', c: Uint8Array.of(1, 2), d: null, e: true, f: false }
    assert.deepEqual(uncbor(cbor(value)), value)
    assert.equal(Buffer.from(cbor(new Map([[1, -7], [33, Uint8Array.of(9)]]))).toString('hex'), 'a20126182141' + '09')
    assert.equal(Buffer.from(cbor(new Tagged(18, []))).toString('hex'), 'd280')
    // Half, single and double floats, which a provider's assertions may hold.
    assert.deepEqual(['f93e00', 'fa3fc00000', 'fb3ff8000000000000'].map((hex) => uncbor(Buffer.from(hex, 'hex'))), [1.5, 1.5, 1.5])
    assert.throws(() => uncbor(Uint8Array.of(0x9f)), /format/)
  })
})

describe('the Content Credentials of a picture made here (D324)', () => {
  test('a manifest after the header, its claim signed by the seal, its hash the rest of the file’s, saying which trained model made it', async () => {
    const seal = await makeSeal()
    const out = await credentialed(marked(png, made.maker, made.revision), { ...made, seal })
    const view = new DataView(out.buffer)
    assert.equal(new TextDecoder().decode(out.subarray(37, 41)), 'caBX')
    // Nothing else changed: the XMP's file, but for the chunk.
    const length = view.getUint32(33)
    assert.deepEqual([...out.subarray(0, 33), ...out.subarray(33 + 12 + length)], [...marked(png, made.maker, made.revision)])
    const read = await credentialsOf(out)
    assert.deepEqual([read?.intact, read?.bound, read?.generated, read?.maker, read?.generator, read?.selfIssued, read?.at], [true, true, true, 'Z-Image-Turbo', 'Jean', true, null])
    assert.deepEqual(read?.spki, new Uint8Array(await crypto.subtle.exportKey('spki', seal.keys.publicKey)))
    // A pixel changed, or the manifest's words, and it no longer holds.
    const changed = out.slice()
    changed[changed.length - 20] ^= 1
    assert.deepEqual([(await credentialsOf(changed))?.intact, (await credentialsOf(changed))?.bound], [false, false])
    const said = out.slice()
    said.set(new TextEncoder().encode('Q'), Buffer.from(out).indexOf('Z-Image-Turbo'))
    assert.equal((await credentialsOf(said))?.intact, false)
  })

  test('dated by a witness in the room its signature kept, so the hash still holds; undated when the witness fails', async () => {
    const seal = await makeSeal()
    const dated = await credentialed(png, { ...made, seal, date: (imprint) => tokenFor(imprint, reply) })
    const read = await credentialsOf(dated)
    assert.deepEqual([read?.intact, read?.bound, read?.witness?.['2.5.4.3']], [true, true, 'Test TSA'])
    assert.ok(read?.at instanceof Date)
    const failed = await credentialed(png, { ...made, seal, date: () => Promise.reject(new Error('unreachable')) })
    assert.deepEqual([(await credentialsOf(failed))?.intact, (await credentialsOf(failed))?.at], [true, null])
  })

  test('anything but a PNG stays as it came; a file without a manifest has none', async () => {
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)
    assert.equal(await credentialed(jpeg, { ...made, seal: await makeSeal() }), jpeg)
    assert.deepEqual([storeIn(png), await credentialsOf(png), await credentialsOf(jpeg)], [null, null, null])
  })
})

describe('Content Credentials made elsewhere', () => {
  test('C2PA’s tool’s, in a PNG and a JPEG: intact, bound, signed by its test signer, which an authority certified', async () => {
    for (const name of ['c2pa.png', 'c2pa.jpg']) {
      const read = await credentialsOf(fixture(name))
      assert.deepEqual([read?.intact, read?.bound, read?.generated, read?.maker, read?.generator, read?.selfIssued], [true, true, true, 'Test Maker', 'c2patool test', false], name)
      assert.deepEqual([read?.subject['2.5.4.10'], read?.issuer['2.5.4.3']], ['C2PA Test Signing Cert', 'Intermediate CA'])
      const changed = fixture(name)
      changed[changed.length - 3] ^= 1
      assert.equal((await credentialsOf(changed))?.intact, false, name)
    }
  })

  test('a provider’s picture and film pass through untouched, their marks with them', async () => {
    const signed = fixture('c2pa.png')
    const brain = (/** @type {'openai' | 'gemini'} */ provider) => ({ id: provider, provider, api: /** @type {const} */ ('openai'), baseURL: PROVIDERS[provider].baseURL, model: 'm' })
    const ask = { prompt: 'A lighthouse', from: [], shape: /** @type {const} */ ('square') }
    const openai = await picture({ ...ask, brain: brain('openai'), apiKey: 'k', model: 'gpt-image-1.5', fetch: async () => Response.json({ data: [{ b64_json: Buffer.from(signed).toString('base64') }] }) })
    assert.deepEqual(openai.bytes, signed)
    assert.equal((await credentialsOf(openai.bytes))?.intact, true)
    const jpeg = fixture('c2pa.jpg')
    const gemini = await picture({ ...ask, brain: brain('gemini'), apiKey: 'g', model: 'gemini-nano-banana-2.1',
      fetch: async () => Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/jpeg', data: Buffer.from(jpeg).toString('base64') }] }] }) })
    assert.deepEqual(gemini.bytes, jpeg)
    const sora = await film({ ...ask, brain: brain('openai'), apiKey: 'k', model: 'sora-2', seconds: 4, every: 0, fetch: async (/** @type {any} */ url) => (String(url).endsWith('/content')
      ? new Response(signed) : Response.json({ id: 'v', status: 'completed', progress: 100 })) })
    assert.deepEqual(sora.bytes, signed)
  })
})
