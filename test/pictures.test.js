// Pictures and films from a connected brain's provider (D251): what each API is asked, what comes
// back as bytes, and a film fetched only from where the brain is. Then what FLUX.2 [klein]'s and
// Z-Image-Turbo's graphs are given on this device (D263), the glimpses of a picture as it forms,
// what the check a picture made here goes through sees and says (D275, D280), and the mark that says a
// trained model made it (D279). Last, how often a worker tells the page how far its weights have come.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDERS } from '../app/core/llm.js'
import { picture, film, filmModels, frame } from '../app/caps/pictures/cloud.js'
import { SIZES, chat, sigmas, positions, fit, turn, glimpse } from '../app/caps/pictures/flux.js'
import * as zimage from '../app/caps/pictures/zimage.js'
import * as fastwan from '../app/caps/pictures/fastwan.js'
import { readFileSync } from 'node:fs'
import * as check from '../app/caps/pictures/check.js'
import { marked, GENERATED } from '../app/caps/pictures/mark.js'
import { payloadOf, dataOf, randomData, planes, watermarked, SIDE } from '../app/caps/pictures/watermark.js'
import { crc32 } from '../app/core/zip.js'
import { download, PACE } from '../app/ui/weights.js'
import { createHash } from 'node:crypto'

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

  test('a GPT image model shows the picture twice as it forms, in a stream, then the picture; a stream not asked for isn’t', async () => {
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

  test('the place a picture or a film takes, as each provider makes it: OpenAI’s Images API 3:2, the others 16:9', () => {
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
    assert.deepEqual(calls[0].body.provider, { data_collection: 'deny' }, 'only providers that keep nothing')
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
    // How far along it is, as the job says.
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

  test('the pictures a change starts from sit after it, each 10 further along t, by their own rows and columns (D263)', () => {
    // _prepare_image_ids in diffusers' Flux2KleinPipeline: t = 10 + 10 × i for the i-th picture.
    const { image } = positions(2, 3, [32, 16, 16, 32])
    assert.equal(image.length, (6 + 2 + 2) * 4)
    assert.deepEqual([...image.slice(5 * 4, 6 * 4)], [0n, 1n, 2n, 0n])
    assert.deepEqual([...image.slice(7 * 4, 8 * 4)], [10n, 0n, 1n, 0n])
    assert.deepEqual([...image.slice(9 * 4, 10 * 4)], [20n, 1n, 0n, 0n])
  })

  test('a picture to change is read in its own proportions, in sixteens, about a thousand tokens, which several share (D545)', () => {
    assert.deepEqual(fit(1024, 1024), [512, 512])
    assert.deepEqual(fit(1536, 1024), [624, 416])
    const [width, height] = fit(3024, 4032)
    assert.equal(width % 16 + height % 16, 0)
    assert.ok(Math.abs((width / 16) * (height / 16) - 1024) <= 40 && width < height)
    assert.deepEqual(fit(1024, 1024, 512), [368, 368])
  })

  test('a glimpse of the picture as it forms: each token’s 32 channels for each pixel of its 2×2, mixed into colours', () => {
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

  test('the decoder gets the tokens a channel at a time, and the encoder’s channels turn back into tokens', () => {
    const latent = Float32Array.from({ length: 3 * 128 }, (_, i) => i)
    const out = turn(latent, 3)
    // Channel 2 of the second token, then channel 0 of the third.
    assert.equal(out[2 * 3 + 1], 128 + 2)
    assert.equal(out[0 * 3 + 2], 2 * 128)
    assert.deepEqual(turn(out, 128), latent)
  })
})

describe('Z-Image-Turbo on this device', () => {
  test('its schedule is diffusers’ with a shift of 3, its timesteps 1 less each sigma and the last 1, as its export’s demo drives it', () => {
    const { sigmas: shifted, timesteps } = zimage.schedule(9)
    const near = (/** @type {number[]} */ got, /** @type {number[]} */ want) => got.forEach((value, i) => assert.ok(Math.abs(value - want[i]) < 1e-3, `${i}: ${value}`))
    near(shifted, [1, 0.9547, 0.9004, 0.834, 0.7511, 0.6447, 0.503, 0.305, 0.0089, 0])
    near(timesteps, [0, 0.0453, 0.0996, 0.166, 0.2489, 0.3553, 0.497, 0.695, 1])
  })

  test('a glimpse of the picture as it forms: its 16 channels at each point, mixed into colours as FLUX.1’s VAE has them', () => {
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

describe('FastWan’s films on this device (D585)', () => {
  test('its three steps’ sigmas are FastVideo’s: the nearest of its training table, shifted by 8', () => {
    assert.deepEqual(fastwan.STEPS, [1000, 757, 522])
    fastwan.SIGMAS.forEach((value, i) => assert.ok(Math.abs(value - [1, 0.7567567567567568, 0.5217391304347826][i]) < 1e-12, `${i}: ${value}`))
  })

  test('its latent is 48 channels for every 4 frames and 16 pixels square, about 8,000 tokens in each shape', () => {
    assert.deepEqual(fastwan.shape(...fastwan.SIZES.wide), [48, 21, 30, 52])
    assert.deepEqual(Object.values(fastwan.SIZES).map(([w, h]) => 21 * (w / 32) * (h / 32)), [8190, 8190, 8400])
  })

  test('its rotary angles are Wan’s, as diffusers’ WanRotaryPosEmbed gives them, the sines’ even numbers negated', () => {
    // A grid of 3 frames, 2 rows and 3 columns: token 7 is frame 1, row 0, column 1; token 17 frame 2, row 1, column 2.
    const { cos, sin } = fastwan.rope(3, 2, 3)
    const near = (/** @type {number} */ got, /** @type {number} */ want) => assert.ok(Math.abs(got - want) < 1e-6, `${got} ≠ ${want}`)
    const at = [0, 1, 2, 43, 44, 45, 86, 87, 127]
    ;[0.540302, 0.540302, 0.791258, 1, 1, 1, 0.540302, 0.540302, 1].forEach((want, i) => near(cos[7 * 128 + at[i]], want))
    ;[0.841471, 0.841471, 0.611483, 0.000152, 0, 0, 0.841471, 0.841471, 0.000155].forEach((want, i) => near(sin[7 * 128 + at[i]] * (at[i] % 2 ? 1 : -1), want))
    ;[-0.416147, -0.416147, 0.252178, 1, 0.540302, 0.540302, -0.416147, -0.416147, 1].forEach((want, i) => near(cos[17 * 128 + at[i]], want))
  })

  test('a latent goes to tokens of 2 × 2 points, the channels first, and comes back from the order the transformer gives', () => {
    const shape = [2, 1, 2, 4]
    const latent = Float32Array.from({ length: 16 }, (_, i) => i)
    // Token 1 is the second 2 × 2 block of row 0: channel 0's points 2, 3, 6, 7, then channel 1's.
    assert.deepEqual([...fastwan.patchify(latent, shape).subarray(8, 16)], [2, 3, 6, 7, 10, 11, 14, 15])
    // The transformer gives each token's numbers by point, then channel.
    const tokens = Float32Array.from({ length: 16 }, (_, i) => i)
    const back = fastwan.unpatchify(tokens, shape)
    assert.deepEqual([back[0], back[8], back[1], back[4]], [0, 1, 2, 4])
    assert.deepEqual(fastwan.unpatchify(fastwan.unpatchify(latent, shape), shape).length, 16)
  })

  test('TAEHV takes the latent frame by frame, or one frame of it for a glimpse', () => {
    const latent = Float32Array.from({ length: 2 * 3 * 1 * 1 }, (_, i) => i)
    assert.deepEqual([...fastwan.frames(latent, [2, 3, 1, 1])], [0, 3, 1, 4, 2, 5])
    assert.deepEqual([...fastwan.frames(latent, [2, 3, 1, 1], 1)], [1, 4])
  })
})

describe('the check a picture made here goes through (D275)', () => {
  test('its files are pinned by revision and SHA-256, as the makers’ are', () => {
    assert.deepEqual(check.FILES.map(([, , bytes]) => bytes), [59512872, 63262114])
    for (const [path, hash] of check.FILES) {
      assert.match(path, /\/resolve\/[0-9a-f]{40}\/onnx\/[\w]+_q4\.onnx$|\/resolve\/[0-9a-f]{40}\/onnx\/model_q4\.onnx$/)
      assert.match(hash, /^[0-9a-f]{64}$/)
    }
  })

  test('it sees a colour a plane at a time, normalized as CLIP’s', () => {
    // Two pixels, white then black, their alpha left out.
    const values = check.planes([255, 255, 255, 255, 0, 0, 0, 255])
    const near = (/** @type {number} */ got, /** @type {number} */ want) => assert.ok(Math.abs(got - want) < 1e-4, `${got} ≠ ${want}`)
    assert.equal(values.length, 6)
    ;[1.9303, -1.7923, 2.0749, -1.7521, 2.1459, -1.4802].forEach((want, i) => near(values[i], want))
    // SigLIP's: a half each way.
    assert.deepEqual([...check.planes([255, 255, 255, 255, 0, 0, 0, 255], check.SIGLIP)], [1, -1, 1, -1, 1, -1])
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

describe('what else the check looks for (D280)', () => {
  const concepts = JSON.parse(readFileSync(new URL('../app/caps/pictures/concepts.json', import.meta.url), 'utf8'))

  test('a few words for each area, read into vectors at unit length, with the limit measured for it', () => {
    assert.deepEqual(Object.keys(concepts.areas), ['hate', 'violence', 'selfHarm'])
    assert.match(concepts.model, /^Xenova\/siglip-base-patch16-224@[0-9a-f]{40}$/)
    assert.ok(check.FILES[1][0].startsWith(concepts.model.replace('@', '/resolve/')))
    for (const { limit, words, vectors } of Object.values(concepts.areas)) {
      assert.equal(words.length, vectors.length)
      assert.ok(limit > 0 && limit < 0.2)
      for (const vector of vectors) {
        const values = check.unpacked(vector)
        assert.equal(values.length, 768)
        assert.ok(Math.abs(Math.hypot(...values) - 1) < 0.01)
      }
    }
  })

  test('a picture as close to one of an area’s words as its limit shows that area, however long its view', () => {
    // Two areas whose one word each is an axis: a view 0.2 along the first and 0.05 along the second.
    const axis = (/** @type {number} */ i) => {
      const bytes = new Uint8Array(4 + 768)
      new DataView(bytes.buffer).setFloat32(0, 1 / 127, true)
      bytes[4 + i] = 127
      return Buffer.from(bytes).toString('base64')
    }
    const areas = { areas: { first: { limit: 0.1, vectors: [axis(0)] }, second: { limit: 0.1, vectors: [axis(1)] } } }
    const view = Array.from({ length: 768 }, (_, i) => [0.2, 0.05, Math.sqrt(1 - 0.2 ** 2 - 0.05 ** 2)][i] ?? 0)
    assert.deepEqual(check.shown(view, areas), ['first'])
    assert.deepEqual(check.shown(view.map((value) => value * 3), areas), ['first'])
    assert.deepEqual(check.shown(view.map((value) => -value), areas), [])
    // A word's own vector is as close as can be.
    assert.ok(check.shown(check.unpacked(concepts.areas.selfHarm.vectors[1]), concepts).includes('selfHarm'))
  })
})

describe('the watermark on a picture made here (D324)', () => {
  test('TrustMark’s 100 bits: the 61 given, BCH_5’s 35, then its schema, as TrustMark’s own decoder reads them', () => {
    // Read back, five of them flipped, by TrustMark's JavaScript data layer (Adobe's), when this was written.
    const data = '0100101001010010100101001010010100101001010010100101001010010'
    assert.equal(payloadOf([...data].map(Number)).join(''), `${data}11111100001001111101011000111000011` + '0001')
  })

  test('the 61 bits read back from a decoder’s 100, up to 5 of them flipped; past that, in another schema or all naught, none', () => {
    const data = [...'0100101001010010100101001010010100101001010010100101001010010'].map(Number)
    const bits = payloadOf(data)
    assert.equal(dataOf(bits), data.join(''))
    const flipped = bits.slice()
    for (const i of [0, 17, 40, 63, 90]) flipped[i] ^= 1
    assert.equal(dataOf(flipped), data.join(''))
    flipped[30] ^= 1
    assert.equal(dataOf(flipped), null)
    assert.equal(dataOf([...bits.slice(0, 96), 0, 0, 1, 0]), null)
    assert.equal(dataOf(new Array(100).fill(0)), null)
  })

  test('61 random bits, which the manifest’s soft binding names as TrustMark’s example does', () => {
    const { data, softBinding } = randomData()
    assert.equal(data.length, 61)
    assert.ok(data.every((bit) => bit === 0 || bit === 1))
    assert.deepEqual(softBinding, { alg: 'com.adobe.trustmark.Q', blocks: [{ scope: {}, value: `1*${data.join('')}` }] })
  })

  test('what the encoder changed, each colour’s mean taken away and held within ±0.2, is stretched over the picture', () => {
    const plane = SIDE * SIDE
    const cover = planes(new Uint8Array(plane * 4).fill(128))
    // A change of 0.5 everywhere is held to 0.2, whose mean is taken away: nothing changes.
    const flat = watermarked(new Uint8ClampedArray(plane * 4).fill(128), SIDE, SIDE, cover.map((value) => value + 0.5), cover)
    assert.ok(flat.every((value) => value === 128))
    // A checkerboard of ±0.1 in red only, at its own size, is ±12.75 there, rounded.
    const board = cover.map((value, i) => (i < plane ? value + ((i % SIDE) + Math.floor(i / SIDE)) % 2 * 0.2 - 0.1 : value))
    const out = watermarked(new Uint8ClampedArray(plane * 4).fill(128), SIDE, SIDE, board, cover)
    assert.deepEqual([out[0], out[4], out[1], out[2]], [128 - 13, 128 + 13, 128, 128])
    // At twice its size, between its squares.
    const wide = watermarked(new Uint8ClampedArray(4 * plane * 4).fill(128), 2 * SIDE, 2 * SIDE, board, cover)
    assert.ok(Math.abs(wide[4 * 4] - 128) < 13)
  })
})

describe('the mark that says a trained model made a picture (D279)', () => {
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'))

  test('IPTC’s Digital Source Type and the maker, in an XMP packet right after the header, its CRC right', () => {
    const out = marked(png, 'Z-Image-Turbo', 'webnn/Z-Image-Turbo@02e1d8c')
    assert.deepEqual([...out.subarray(0, 33)], [...png.subarray(0, 33)])
    assert.deepEqual([...out.subarray(out.length - (png.length - 33))], [...png.subarray(33)])
    const view = new DataView(out.buffer)
    const length = view.getUint32(33)
    const body = out.subarray(37, 41 + length)
    assert.equal(new TextDecoder().decode(body.subarray(0, 21)), 'iTXtXML:com.adobe.xmp')
    assert.equal(view.getUint32(41 + length), crc32(body))
    const xmp = new TextDecoder().decode(body)
    assert.ok(xmp.includes(`Iptc4xmpExt:DigitalSourceType="${GENERATED}"`))
    assert.ok(xmp.includes('Iptc4xmpExt:AISystemUsed="Z-Image-Turbo" Iptc4xmpExt:AISystemVersionUsed="webnn/Z-Image-Turbo@02e1d8c"'))
    assert.ok(marked(png, 'a "quoted" <name>').length > png.length)
    assert.ok(new TextDecoder().decode(marked(png, 'a "quoted" <name>')).includes('a &#34;quoted&#34; &#60;name&#62;'))
  })

  test('a film made here, an MP4, gets the same packet in a top-level uuid box at its end, XMP’s own (D585)', () => {
    const mp4 = Uint8Array.of(0, 0, 0, 16, ...new TextEncoder().encode('ftypisom'), 0, 0, 2, 0)
    const out = marked(mp4, 'FastWan2.2-TI2V-5B', 'jean-is/FastWan2.2-TI2V-5B-ONNX@0123456')
    assert.deepEqual([...out.subarray(0, 16)], [...mp4])
    const box = out.subarray(16)
    assert.equal(new DataView(box.buffer, box.byteOffset).getUint32(0), box.length)
    assert.equal(new TextDecoder().decode(box.subarray(4, 8)), 'uuid')
    assert.equal(Buffer.from(box.subarray(8, 24)).toString('hex'), 'be7acfcb97a942e89c71999491e3afac')
    assert.ok(new TextDecoder().decode(box.subarray(24)).includes(`Iptc4xmpExt:DigitalSourceType="${GENERATED}" Iptc4xmpExt:AISystemUsed="FastWan2.2-TI2V-5B"`))
  })

  test('anything but a PNG or an MP4 stays as it came', () => {
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 16)
    assert.equal(marked(jpeg, 'x'), jpeg)
  })
})

describe('weights', () => {
  test('a download tells how far it has come every PACE ms and once it all has, not with each chunk', async (t) => {
    const chunk = new Uint8Array(64 * 1024)
    const body = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < 400; i++) {
          if (i % 100 === 0) await new Promise((resolve) => setTimeout(resolve, PACE + 10))
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })
    const all = new Uint8Array(400 * chunk.length)
    const kept = new Map()
    Object.assign(globalThis, { caches: { open: async () => ({ match: async () => undefined, keys: async () => [], put: async (/** @type {string} */ url, /** @type {Response} */ response) => kept.set(url, response) }) } })
    t.after(() => delete (/** @type {any} */ (globalThis)).caches)
    t.mock.method(globalThis, 'fetch', async () => new Response(body))
    /** @type {number[]} */
    const told = []
    const data = await download('https://weights.test/a.onnx', createHash('sha256').update(all).digest('hex'), (bytes) => told.push(bytes))
    assert.equal(data.byteLength, all.length)
    assert.ok(told.length >= 3 && told.length <= 6, `${told.length} times`)
    assert.equal(told.at(-1), all.length)
    assert.ok(kept.has('https://weights.test/a.onnx'))
  })

  // A new pin (D455): the copies kept at the revision before, as the cache holds them by address.
  const pinned = (/** @type {string} */ revision, /** @type {string} */ name) => `https://weights.test/v/resolve/${revision}/${name}`
  /** A cache holding these bytes at these addresses, as CacheStorage answers. @param {import('node:test').TestContext} t @param {Record<string, Uint8Array>} files */
  const cached = (t, files) => {
    const kept = new Map(Object.entries(files))
    const url = (/** @type {string | Request} */ key) => (typeof key === 'string' ? key : key.url)
    const cache = {
      match: async (/** @type {string | Request} */ key) => (kept.has(url(key)) ? new Response(kept.get(url(key))) : undefined),
      keys: async () => [...kept.keys()].map((address) => new Request(address)),
      put: async (/** @type {string} */ address, /** @type {Response} */ response) => void kept.set(address, new Uint8Array(await response.arrayBuffer())),
      delete: async (/** @type {Request} */ key) => kept.delete(url(key)),
    }
    Object.assign(globalThis, { caches: { open: async () => cache } })
    t.after(() => delete (/** @type {any} */ (globalThis)).caches)
    return kept
  }
  const sha = (/** @type {Uint8Array} */ bytes) => createHash('sha256').update(bytes).digest('hex')

  test('a file kept at another revision is filed under the new one when it is the same, not downloaded, and goes', async (t) => {
    const voice = Uint8Array.of(1, 2, 3)
    const kept = cached(t, { [pinned('old', 'en.bin')]: voice, [pinned('old', 'fr.bin')]: Uint8Array.of(9) })
    const fetched = t.mock.method(globalThis, 'fetch', async () => { throw new Error('downloaded') })
    const data = await download(pinned('new', 'en.bin'), sha(voice), () => {})
    assert.deepEqual(new Uint8Array(data), voice)
    assert.equal(fetched.mock.callCount(), 0)
    assert.deepEqual([...kept.keys()].sort(), [pinned('new', 'en.bin'), pinned('old', 'fr.bin')])
  })

  test('one that changed is downloaded again, and the copy kept at the old revision goes', async (t) => {
    const voice = Uint8Array.of(4, 5, 6)
    const kept = cached(t, { [pinned('old', 'fr.bin')]: Uint8Array.of(9), [pinned('old', 'en.bin')]: Uint8Array.of(1) })
    const fetched = t.mock.method(globalThis, 'fetch', async () => new Response(voice))
    const data = await download(pinned('new', 'fr.bin'), sha(voice), () => {})
    assert.deepEqual(new Uint8Array(data), voice)
    assert.equal(fetched.mock.callCount(), 1)
    assert.deepEqual([...kept.keys()].sort(), [pinned('new', 'fr.bin'), pinned('old', 'en.bin')].sort())
    await assert.rejects(download(pinned('newer', 'fr.bin'), sha(Uint8Array.of(7)), () => {}), /not the expected file/)
    assert.ok(kept.has(pinned('new', 'fr.bin')), 'a download that fails its check leaves the kept copy')
  })
})
