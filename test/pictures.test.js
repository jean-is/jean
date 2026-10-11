// Pictures and films from a connected brain's provider (D251): what each API is asked, what comes
// back as bytes, and a film fetched only from where the brain is. Then what FLUX.2 [klein]'s and
// Z-Image-Turbo's graphs are given on this device (D263), the glimpses of a picture as it forms (D265),
// and what the check a picture made here goes through sees and says (D275).
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDERS } from '../app/core/llm.js'
import { picture, film, filmModels, frame } from '../app/caps/pictures/cloud.js'
import { SIZES, chat, sigmas, positions, unpack, glimpse } from '../app/caps/pictures/flux.js'
import * as zimage from '../app/caps/pictures/zimage.js'
import * as check from '../app/caps/pictures/check.js'

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

  test('a GPT image model shows the picture twice as it forms, in a stream, then the picture; a stream not asked for isn’t (D265)', async () => {
    const event = (/** @type {any} */ data) => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`
    const stream = [0, 1].map((i) => event({ type: 'image_generation.partial_image', b64_json: `glimpse${i}`, partial_image_index: i, output_format: 'png' })).join('')
      + event({ type: 'image_generation.completed', b64_json: png, output_format: 'png' })
    const { fetch, calls } = mockFetch(() => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }))
    /** @type {any[]} */
    const shown = []
    const made = await picture({ ...ask, brain: brain('openai'), apiKey: 'k', model: 'gpt-image-1.5', show: (progress) => shown.push(progress), fetch })
    assert.deepEqual(calls[0].body, { model: 'gpt-image-1.5', prompt: 'A lighthouse', stream: true, partial_images: 2, n: 1 })
    assert.deepEqual(shown, [1, 2].map((n) => ({ done: n / 3, image: { type: 'image', mimeType: 'image/png', data: `glimpse${n - 1}` } })))
    assert.deepEqual([...made.bytes], [137, 80, 78, 71])
    // Changed, in its form; and a stream that fails says why.
    const failing = mockFetch(() => new Response(event({ type: 'error', error: { message: 'Your request was rejected' } }), { headers: { 'content-type': 'text/event-stream' } }))
    await assert.rejects(picture({ ...ask, from: [lighthouse], brain: brain('openai'), model: 'gpt-image-1.5', show: () => {}, fetch: failing.fetch }), /rejected/)
    assert.equal(/** @type {FormData} */ (failing.calls[0].body).get('partial_images'), '2')
    // A picture nobody watches comes whole.
    const whole = mockFetch(() => Response.json({ data: [{ b64_json: png }] }))
    await picture({ ...ask, brain: brain('openai'), model: 'gpt-image-1.5', fetch: whole.fetch })
    assert.equal(whole.calls[0].body.stream, undefined)
  })

  test('the place a picture or a film takes, as each provider makes it: OpenAI’s Images API 3:2, the others 16:9 (D265)', () => {
    assert.deepEqual(frame('picture', 'wide', 'openai'), [1536, 1024])
    assert.deepEqual(frame('picture', 'tall', 'ollama'), [1024, 1536])
    assert.deepEqual(frame('picture', 'wide', 'gemini'), [1344, 768])
    assert.deepEqual(frame('film', 'tall', 'openrouter'), [720, 1280])
    assert.deepEqual(frame('picture', 'square'), [1024, 1024])
    assert.deepEqual(frame('film', 'square', 'openai'), [1280, 720])
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
      : Response.json({ id: 'v1', status: url.endsWith('/videos') ? 'queued' : ++asked < 2 ? 'in_progress' : 'completed', progress: asked * 50 })))
    /** @type {any[]} */
    const shown = []
    const made = await film({ ...ask, from: [lighthouse], brain: brain('openai'), apiKey: 'k', model: 'sora-2', shape: 'tall', seconds: 7, every: 0, show: (progress) => shown.push(progress), fetch })
    // How far along it is, as the job says (D265).
    assert.deepEqual(shown, [{ done: 0.5 }, { done: 1 }])
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

describe('FLUX.2 [klein] on this device', () => {
  test('its schedule is shifted as Black Forest Labs’ sampler shifts it, by the picture’s tokens and the steps', () => {
    // get_schedule(4, 1024) in their flux2 repository.
    sigmas(4, 1024).forEach((sigma, i) => assert.ok(Math.abs(sigma - [1, 0.9581, 0.884, 0.7175, 0][i]) < 1e-3, `${sigma}`))
    // More tokens, more shift: the steps stay longer in the noise.
    assert.ok(sigmas(4, 4096)[2] > sigmas(4, 1024)[2])
  })

  test('each shape is in sixteens, about a thousand tokens', () => {
    for (const [width, height] of Object.values(SIZES)) {
      assert.equal(width % 16 + height % 16, 0)
      assert.ok(Math.abs((width / 16) * (height / 16) - 1024) <= 32)
    }
  })

  test('the description is asked in Qwen3’s chat template, without thinking', () => {
    assert.equal(chat('A lighthouse'), '<|im_start|>user\nA lighthouse<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n')
  })

  test('the picture’s tokens sit by row and column, the description’s one after another', () => {
    const { image, text } = positions(2, 3)
    assert.deepEqual([...image.slice(4 * 4, 5 * 4)], [0n, 1n, 1n, 0n])
    assert.deepEqual([...text.slice(5 * 4, 6 * 4)], [0n, 0n, 0n, 5n])
    assert.equal(text.length, 512 * 4)
  })

  test('a glimpse of the picture as it forms: each token’s 32 channels for each pixel of its 2×2, mixed into colours (D265)', () => {
    // One token: channel 3 lit on its first pixel, channel 8 on its last; ComfyUI's Flux2 colours for them.
    const latent = new Float32Array(128)
    latent[3 * 4] = 1
    latent[8 * 4 + 3] = 1
    const rgb = glimpse(latent, 1, 1)
    const near = (/** @type {number} */ got, /** @type {number} */ want) => assert.ok(Math.abs(got - want) < 1e-6, `${got} ≠ ${want}`)
    ;[0.2144 - 0.0329, 0.3009 - 0.0718, 0.3652 - 0.0851].forEach((value, c) => near(rgb[c * 4], value))
    ;[-0.3527 - 0.0329, -0.2712 - 0.0718, -0.1666 - 0.0851].forEach((value, c) => near(rgb[c * 4 + 3], value))
    near(rgb[1], -0.0329)
  })

  test('the decoder gets the tokens a channel at a time', () => {
    const latent = Float32Array.from({ length: 3 * 128 }, (_, i) => i)
    const out = unpack(latent)
    // Channel 2 of the second token, then channel 0 of the third.
    assert.equal(out[2 * 3 + 1], 128 + 2)
    assert.equal(out[0 * 3 + 2], 2 * 128)
  })
})

describe('Z-Image-Turbo on this device', () => {
  test('its schedule is diffusers’ with a shift of 3, its timesteps 1 less each sigma and the last 1, as its export’s demo drives it', () => {
    const { sigmas: shifted, timesteps } = zimage.schedule(9)
    const near = (/** @type {number[]} */ got, /** @type {number[]} */ want) => got.forEach((value, i) => assert.ok(Math.abs(value - want[i]) < 1e-3, `${i}: ${value}`))
    near(shifted, [1, 0.9547, 0.9004, 0.834, 0.7511, 0.6447, 0.503, 0.305, 0.0089, 0])
    near(timesteps, [0, 0.0453, 0.0996, 0.166, 0.2489, 0.3553, 0.497, 0.695, 1])
  })

  test('a glimpse of the picture as it forms: its 16 channels at each point, mixed into colours as FLUX.1’s VAE has them (D265)', () => {
    // 2 × 1 points: channel 4 lit on the first, channel 13 on the second.
    const latent = new Float32Array(16 * 2)
    latent[4 * 2] = 1
    latent[13 * 2 + 1] = 1
    const rgb = zimage.glimpse(latent, 1, 2)
    const near = (/** @type {number} */ got, /** @type {number} */ want) => assert.ok(Math.abs(got - want) < 1e-6, `${got} ≠ ${want}`)
    ;[0.0859 - 0.0329, 0.0721 - 0.0718, 0.0329 - 0.0851].forEach((value, c) => near(rgb[c * 2], value))
    ;[-0.1264 - 0.0329, -0.0522 - 0.0718, -0.1103 - 0.0851].forEach((value, c) => near(rgb[c * 2 + 1], value))
  })

  test('the description is asked in Qwen3’s chat template, as its pipeline asks it', () => {
    assert.equal(zimage.chat('A bakery'), '<|im_start|>user\nA bakery<|im_end|>\n<|im_start|>assistant\n')
  })
})

describe('the check a picture made here goes through (D275)', () => {
  test('its file is pinned by revision and SHA-256, as the makers’ are', () => {
    const [path, hash, bytes] = check.FILE
    assert.match(path, /\/resolve\/[0-9a-f]{40}\/onnx\/model_q4\.onnx$/)
    assert.match(hash, /^[0-9a-f]{64}$/)
    assert.equal(bytes, 59512872)
  })

  test('it sees a colour a plane at a time, normalized as CLIP’s', () => {
    // Two pixels, white then black, their alpha left out.
    const values = check.planes([255, 255, 255, 255, 0, 0, 0, 255])
    const near = (/** @type {number} */ got, /** @type {number} */ want) => assert.ok(Math.abs(got - want) < 1e-4, `${got} ≠ ${want}`)
    assert.equal(values.length, 6)
    ;[1.9303, -1.7923, 2.0749, -1.7521, 2.1459, -1.4802].forEach((want, i) => near(values[i], want))
  })

  test('medium and high together say nudity or sex; at half or more, a picture doesn’t show', () => {
    // Its levels: neutral, low, medium, high.
    assert.ok(check.explicit([4, 1, 0, 0]) < 0.1)
    assert.ok(check.explicit([0, 4, 0, 0]) < check.LIMIT)
    assert.ok(check.explicit([0, 0, 1, 1]) > 0.7)
    assert.equal(check.explicit([0, 0, 0, Math.log(2)]), 0.6)
    assert.equal(check.explicit([0, 0, 0, 0]), check.LIMIT)
  })

  test('strict, it counts from low on: a suggestive picture doesn’t show either', () => {
    assert.ok(check.explicit([0, 4, 0, 0], true) > 0.9)
    assert.ok(check.explicit([4, 1, 0, 0], true) < check.LIMIT)
    assert.equal(check.explicit([0, 0, 0, 0], true), 0.75)
  })
})
