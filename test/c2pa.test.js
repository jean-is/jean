// Content Credentials (C2PA 2.2, D324): the manifest a picture made on this device or this computer
// carries, signed by the seal and dated by a witness, read back as C2PA's own tool reads it; manifests
// C2PA's tool made (c2patool 0.27.22, its test signer, no thumbnail), read and checked here; and a
// provider's picture or film, whose marks pass through untouched.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cbor, uncbor, Tagged, credentialed, credentialsOf, storeIn, marksOf } from '../app/caps/receipt/c2pa.js'
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
    assert.deepEqual([read?.intact, read?.bound, read?.generated, read?.maker, read?.generator, read?.selfIssued, read?.at, read?.watermark], [true, true, true, 'Z-Image-Turbo', 'Jean', true, null, null])
    // The watermark its manifest names, as TrustMark's example writes it.
    const named = await credentialed(png, { ...made, seal, assertions: [['c2pa.soft-binding', { alg: 'com.adobe.trustmark.Q', blocks: [{ scope: {}, value: '1*0110' }] }]] })
    assert.deepEqual([(await credentialsOf(named))?.intact, (await credentialsOf(named))?.watermark], [true, '0110'])
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

  test('anything but a PNG or an MP4 stays as it came; a file without a manifest has none', async () => {
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)
    assert.equal(await credentialed(jpeg, { ...made, seal: await makeSeal() }), jpeg)
    assert.deepEqual([storeIn(png), await credentialsOf(png), await credentialsOf(jpeg), await credentialsOf(fixture('film.mp4'))], [null, null, null, null])
  })
})

describe('the Content Credentials of a film made here (D585)', () => {
  // As FastWan's worker writes one: ftyp, moov, whose one chunk offset (at 715) points into mdat (at 747), then its XMP at the end.
  const film = marked(fixture('film.mp4'), 'FastWan2.2-TI2V-5B', 'jean-is/FastWan2.2-TI2V-5B-ONNX@7a1c0de')
  const maker = { ...made, maker: 'FastWan2.2-TI2V-5B', revision: 'jean-is/FastWan2.2-TI2V-5B-ONNX@7a1c0de' }

  test('a manifest in C2PA’s uuid box after the ftyp, the chunk offsets moved past it, a BMFF hash binding every other box where it now is', async () => {
    const seal = await makeSeal()
    const out = await credentialed(film, { ...maker, seal, assertions: [['c2pa.soft-binding', { alg: 'com.adobe.trustmark.Q', blocks: [{ scope: {}, value: '1*0110' }] }]] })
    const view = new DataView(out.buffer)
    const size = view.getUint32(28)
    assert.equal(Buffer.from(out.subarray(32, 52)).toString('hex'), Buffer.from('uuid').toString('hex') + 'd8fec3d61b0e483c92975828877ec481')
    assert.equal(new TextDecoder().decode(out.subarray(56, 65)), 'manifest\0')
    // Nothing else changed but the chunk's offset, which still points at the same frames.
    const moved = film.slice()
    new DataView(moved.buffer).setUint32(715, 747 + size)
    assert.deepEqual([...out.subarray(0, 28), ...out.subarray(28 + size)], [...moved])
    assert.deepEqual(out.subarray(view.getUint32(715 + size), view.getUint32(715 + size) + 8), film.subarray(747, 755))
    const read = await credentialsOf(out)
    assert.deepEqual([read?.intact, read?.bound, read?.generated, read?.maker, read?.generator, read?.watermark], [true, true, true, 'FastWan2.2-TI2V-5B', 'Jean', '0110'])
    assert.match(Buffer.from(out).toString('latin1'), /c2pa\.hash\.bmff\.v3/)
    // A frame changed, its XMP, or a box moved, and it no longer holds.
    for (const at of [747 + size + 4, out.length - 40]) {
      const changed = out.slice()
      changed[at] ^= 1
      assert.deepEqual([(await credentialsOf(changed))?.intact, (await credentialsOf(changed))?.bound], [false, false], String(at))
    }
    const reordered = new Uint8Array([...out.subarray(0, 28 + size), ...out.subarray(28 + size + 711), ...out.subarray(28 + size, 28 + size + 711)])
    assert.equal((await credentialsOf(reordered))?.bound, false)
  })

  test('dated by a witness in the room its signature kept, so the chunk offsets and the hash still hold', async () => {
    const out = await credentialed(film, { ...maker, seal: await makeSeal(), date: (imprint) => tokenFor(imprint, reply) })
    const read = await credentialsOf(out)
    assert.deepEqual([read?.intact, read?.bound, read?.witness?.['2.5.4.3']], [true, true, 'Test TSA'])
    assert.equal(new DataView(out.buffer).getUint32(715 + new DataView(out.buffer).getUint32(28)), 747 + new DataView(out.buffer).getUint32(28))
  })

  test('its XMP says so too, read where it carries no credentials', async () => {
    assert.deepEqual([(await marksOf('waves.mp4', film))?.generated, (await marksOf('waves.mp4', film))?.maker], [true, 'FastWan2.2-TI2V-5B'])
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

  test('C2PA’s tool’s, in an MP4: its BMFF hash checked over the boxes it doesn’t exclude, each at its place', async () => {
    const read = await credentialsOf(fixture('c2pa.mp4'))
    assert.deepEqual([read?.intact, read?.bound, read?.generated, read?.maker, read?.generator, read?.selfIssued], [true, true, true, 'Test Maker', 'c2patool test', false])
    const changed = fixture('c2pa.mp4')
    changed[changed.length - 3] ^= 1
    assert.deepEqual([(await credentialsOf(changed))?.intact, (await credentialsOf(changed))?.bound], [false, false])
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
