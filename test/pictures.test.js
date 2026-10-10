// Pictures and films from a connected brain's provider (D251): what each API is asked, what comes
// back as bytes, and a film fetched only from where the brain is.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDERS } from '../app/core/llm.js'
import { picture, film, filmModels } from '../app/caps/pictures/cloud.js'

/** @param {(url: string, init: any) => Response | Promise<Response>} respond */
function mockFetch(respond) {
  /** @type {{ url: string, init: any, body: any }[]} */
  const calls = []
  const fetch = /** @type {typeof globalThis.fetch} */ (/** @type {unknown} */ (async (/** @type {string} */ url, /** @type {any} */ init = {}) => {
    calls.push({ url: String(url), init, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body })
    return respond(String(url), init)
  }))
  return { fetch, calls }
}

const brain = (/** @type {any} */ provider, baseURL = PROVIDERS[provider]?.baseURL ?? 'http://127.0.0.1:9/v1') => ({ id: provider, provider, api: /** @type {const} */ ('openai'), baseURL, model: 'm' })
const png = Buffer.from([137, 80, 78, 71]).toString('base64')
const lighthouse = { name: 'Lighthouse.png', mimeType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) }
const ask = { prompt: 'A lighthouse', from: [], shape: /** @type {const} */ ('square') }

describe('pictures', () => {
  test('OpenAI’s Images API, and the servers that share it, asked for base64', async () => {
    const { fetch, calls } = mockFetch(() => Response.json({ data: [{ b64_json: png }] }))
    const made = await picture({ ...ask, brain: brain('openai'), apiKey: 'k', model: 'gpt-image-1.5', shape: 'wide', fetch })
    assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations')
    assert.deepEqual(calls[0].body, { model: 'gpt-image-1.5', prompt: 'A lighthouse', size: '1536x1024', n: 1 })
    assert.equal(calls[0].init.headers.authorization, 'Bearer k')
    assert.deepEqual([...made.bytes], [137, 80, 78, 71])
    assert.equal(made.mimeType, 'image/png')
    await picture({ ...ask, brain: brain('ollama'), model: 'x/z-image-turbo', fetch })
    assert.deepEqual(calls[1].body, { model: 'x/z-image-turbo', prompt: 'A lighthouse', response_format: 'b64_json', n: 1 })
  })

  test('changing pictures: OpenAI’s edits, as a form with each picture', async () => {
    const { fetch, calls } = mockFetch(() => Response.json({ data: [{ b64_json: png }] }))
    await picture({ ...ask, from: [lighthouse], brain: brain('openai'), apiKey: 'k', model: 'gpt-image-1.5', fetch })
    assert.equal(calls[0].url, 'https://api.openai.com/v1/images/edits')
    const form = /** @type {FormData} */ (calls[0].body)
    assert.equal(form.get('prompt'), 'A lighthouse')
    assert.equal(/** @type {File} */ (form.getAll('image[]')[0]).name, 'Lighthouse.png')
    assert.equal(calls[0].init.headers['content-type'], undefined, 'the browser sets the form’s own type')
  })

  test('OpenRouter: a chat completion that answers with a picture, from pictures given as parts', async () => {
    const { fetch, calls } = mockFetch(() => Response.json({ choices: [{ message: { content: '', images: [{ type: 'image_url', image_url: { url: `data:image/webp;base64,${png}` } }] } }] }))
    const made = await picture({ ...ask, from: [lighthouse], brain: brain('openrouter'), model: 'google/gemini-2.5-flash-image', fetch })
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.deepEqual(calls[0].body.modalities, ['image', 'text'])
    assert.deepEqual(calls[0].body.messages[0].content[1], { type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } })
    assert.equal(made.mimeType, 'image/webp')
  })

  test('Gemini: its Interactions API, beside the OpenAI-compatible one, with its key, not kept by Google', async () => {
    const { fetch, calls } = mockFetch(() => Response.json({ status: 'completed', steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'text', text: 'Here' }, { type: 'image', mime_type: 'image/jpeg', data: png }] }] }))
    const made = await picture({ ...ask, from: [lighthouse], brain: brain('gemini'), apiKey: 'g', model: 'gemini-nano-banana-2.1', shape: 'tall', fetch })
    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions')
    assert.equal(calls[0].init.headers['x-goog-api-key'], 'g')
    assert.equal(calls[0].init.headers.authorization, undefined)
    assert.deepEqual(calls[0].body, { model: 'gemini-nano-banana-2.1', input: [{ type: 'text', text: 'A lighthouse' }, { type: 'image', mime_type: 'image/png', data: png }],
      response_format: { type: 'image', aspect_ratio: '9:16' }, background: false, store: false })
    assert.deepEqual([...made.bytes], [137, 80, 78, 71])
    assert.equal(made.mimeType, 'image/jpeg')
  })

  test('Gemini: an interaction that made nothing says why', async () => {
    const { fetch } = mockFetch(() => Response.json({ status: 'failed', errors: [{ code: 'safety', message: 'Blocked by safety filters' }] }))
    await assert.rejects(picture({ ...ask, brain: brain('gemini'), model: 'gemini-nano-banana-2.1', fetch }), /Blocked by safety filters/)
  })

  test('a server that answers an address it doesn’t have with 200 says so (LM Studio)', async () => {
    const { fetch } = mockFetch(() => Response.json({ error: 'Unexpected endpoint or method. (POST /v1/images/generations)' }))
    await assert.rejects(picture({ ...ask, brain: brain('custom'), model: 'z-image-turbo', fetch }), /Unexpected endpoint or method/)
  })

  test('an address instead of a picture is no picture (D35)', async () => {
    const { fetch } = mockFetch(() => Response.json({ data: [{ url: 'https://example.com/a.png' }] }))
    await assert.rejects(picture({ ...ask, brain: brain('custom'), model: 'flux', fetch }), /No picture/)
  })
})

describe('films', () => {
  const mp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])

  test('OpenAI: a job, asked about until it is done, then its content', async () => {
    let asked = 0
    const { fetch, calls } = mockFetch((url) => (url.endsWith('/content') ? new Response(mp4, { headers: { 'content-type': 'video/mp4' } })
      : Response.json({ id: 'v1', status: url.endsWith('/videos') ? 'queued' : ++asked < 2 ? 'in_progress' : 'completed' })))
    const made = await film({ ...ask, from: [lighthouse], brain: brain('openai'), apiKey: 'k', model: 'sora-2', shape: 'tall', seconds: 7, every: 0, fetch })
    assert.deepEqual(calls.map((call) => call.url.replace('https://api.openai.com/v1', '')), ['/videos', '/videos/v1', '/videos/v1', '/videos/v1/content'])
    const form = /** @type {FormData} */ (calls[0].body)
    assert.deepEqual([form.get('seconds'), form.get('size'), /** @type {File} */ (form.get('input_reference')).name], ['8', '720x1280', 'Lighthouse.png'])
    assert.equal(calls[3].init.headers.authorization, 'Bearer k')
    assert.deepEqual([...made.bytes], [...mp4])
    assert.equal(made.mimeType, 'video/mp4')
  })

  test('OpenRouter: the same, in JSON, from where it says to ask, as long as the model takes', async () => {
    const { fetch, calls } = mockFetch((url) => (url.endsWith('/content') ? new Response(mp4)
      : Response.json(url.endsWith('/videos') ? { id: 'j', status: 'pending', polling_url: 'https://openrouter.ai/api/v1/videos/j' } : { id: 'j', status: 'completed' })))
    await film({ ...ask, brain: brain('openrouter'), model: 'google/veo-3.1', shape: 'wide', seconds: 7, lengths: [4, 6, 8], every: 0, fetch })
    assert.deepEqual(calls[0].body, { model: 'google/veo-3.1', prompt: 'A lighthouse', duration: 8, aspect_ratio: '16:9' }, 'the longer of two as near')
    assert.deepEqual(calls.slice(1).map((call) => call.url), ['https://openrouter.ai/api/v1/videos/j', 'https://openrouter.ai/api/v1/videos/j/content'])
    await film({ ...ask, brain: brain('openrouter'), model: 'kwaivgi/kling-video-o1', seconds: 12, lengths: [5, 10], every: 0, fetch })
    assert.equal(calls[3].body.duration, 10)
  })

  test('OpenRouter’s film models: listed apart from its /models, those that make one from a description', async () => {
    const { fetch, calls } = mockFetch(() => Response.json({ data: [
      { id: 'google/veo-3.1', supported_durations: [4, 6, 8], supported_aspect_ratios: ['16:9', '9:16'] },
      { id: 'black-forest-labs/flux-video-edit', supported_durations: null },
    ] }))
    assert.deepEqual(await filmModels({ brain: brain('openrouter'), apiKey: 'k', fetch }), [{ id: 'google/veo-3.1', output: ['video'], lengths: [4, 6, 8] }])
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/videos/models')
    assert.equal(calls[0].init.headers.authorization, 'Bearer k')
  })

  test('Gemini’s Omni: one interaction, the film in its answer, from a picture given as a part', async () => {
    const { fetch, calls } = mockFetch(() => Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: Buffer.from(mp4).toString('base64') }] }] }))
    const made = await film({ ...ask, from: [lighthouse], brain: brain('gemini'), apiKey: 'g', model: 'gemini-omni-1.1-flash', shape: 'tall', seconds: 12, every: 0, fetch })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions')
    assert.deepEqual(calls[0].body.input[1], { type: 'image', mime_type: 'image/png', data: png })
    assert.deepEqual(calls[0].body.response_format, { type: 'video', aspect_ratio: '9:16', duration: '10s' })
    assert.deepEqual([...made.bytes], [...mp4])
    assert.equal(made.mimeType, 'video/mp4')
  })

  test('a film somewhere other than where the brain is is never fetched, with its key or without', async () => {
    const { fetch, calls } = mockFetch(() => Response.json({ id: 'j', status: 'pending', polling_url: 'https://elsewhere.example/j' }))
    await assert.rejects(film({ ...ask, brain: brain('openrouter'), apiKey: 'k', model: 'm', every: 0, fetch }), /another address: elsewhere\.example/)
    assert.equal(calls.length, 1)
  })

  test('a job that expired is asked about no more', async () => {
    const { fetch, calls } = mockFetch(() => Response.json({ id: 'j', status: 'expired' }))
    await assert.rejects(film({ ...ask, brain: brain('openrouter'), model: 'google/veo-3.1', every: 0, fetch }), /No film came back/)
    assert.equal(calls.length, 1)
  })

  test('a failed job says why', async () => {
    const { fetch } = mockFetch(() => Response.json({ id: 'v', status: 'failed', error: { message: 'Blocked by moderation' } }))
    await assert.rejects(film({ ...ask, brain: brain('openai'), model: 'sora-2', every: 0, fetch }), /Blocked by moderation/)
  })
})
