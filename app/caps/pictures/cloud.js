// Pictures and films from a connected brain's provider (D251), imported on first use: OpenAI's
// Images API, which Ollama and other servers share, OpenRouter's chat and Gemini's Interactions API;
// films from the /videos of OpenAI and OpenRouter, whose film models are listed apart, and Gemini's
// Omni. What they make comes back as bytes, fetched only from the brain's own address with its key,
// never shown from the provider's (D35). As it comes, what it will look like and how far along it
// is, where the provider says (D265).
import { LLMError, headersFor, post, endpoint, fetchOrThrow, sseEvents, parseData } from '../../core/llm.js'

/**
 * @typedef {{ name: string, mimeType: string, bytes: Uint8Array }} Picture
 * @typedef {{ done?: number, image?: import('../../core/types.js').ImageBlock }} Progress how far along it is, 0 to 1, and a glimpse of it
 * @typedef {import('../../core/types.js').Connection & { model: string, prompt: string, from: Picture[], shape: 'wide' | 'tall' | 'square', seconds?: number, lengths?: number[], every?: number,
 *   show?: (progress: Progress) => void }} Request
 *   lengths: the seconds a film can last on this model, where its list says; every: how long to wait between asking how a film is coming, in ms
 */

const RATIOS = { square: '1:1', wide: '16:9', tall: '9:16' }
/** Glimpses a GPT image model shows of a picture before it is done, each about a tenth of its price (D265). */
const GLIMPSES = 2

/**
 * Its width and height in pixels, as asked or about: OpenAI's Images API, and the servers that share
 * it, make pictures 3:2, Gemini and OpenRouter 16:9, and films are 720 high, never square.
 * @param {'picture' | 'film'} kind @param {'wide' | 'tall' | 'square'} shape @param {string} [provider] @returns {number[]}
 */
export function frame(kind, shape, provider) {
  const [long, short] = kind === 'film' ? [1280, 720] : ['gemini', 'openrouter'].includes(provider ?? '') ? [1344, 768] : [1536, 1024]
  return shape === 'tall' ? [short, long] : shape === 'wide' || kind === 'film' ? [long, short] : [1024, 1024]
}

/** A picture, made or changed from others. @param {Request} request @returns {Promise<{ bytes: Uint8Array, mimeType: string }>} */
export async function picture({ brain, apiKey, model, prompt, from, shape, show, signal, fetch = globalThis.fetch }) {
  if (brain.provider === 'gemini') return interaction({ brain, apiKey, model, prompt, from, shape, signal, fetch }, { type: 'image', aspect_ratio: RATIOS[shape] })
  if (brain.provider === 'openrouter') {
    const content = from.length ? [{ type: 'text', text: prompt }, ...from.map((file) => ({ type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${base64(file.bytes)}` } }))] : prompt
    const json = await answer(post(fetch, { url: endpoint(brain, '/chat/completions'), headers: headersFor(brain, apiKey),
      body: { model, messages: [{ role: 'user', content }], modalities: ['image', 'text'], ...(shape !== 'square' && { image_config: { aspect_ratio: RATIOS[shape] } }) } }, signal))
    return decoded(json?.choices?.[0]?.message?.images?.[0]?.image_url?.url)
  }
  // OpenAI's own answer in base64 anyway, and show it as it forms; others are asked to, rather than for an address.
  const gpt = /^gpt-image/.test(model)
  const asked = { model, prompt, ...(shape !== 'square' && { size: frame('picture', shape).join('x') }), ...(gpt ? show && { stream: true, partial_images: GLIMPSES } : { response_format: 'b64_json' }) }
  let made
  if (from.length) {
    const form = new FormData()
    for (const [name, value] of Object.entries(asked)) form.set(name, String(value))
    for (const file of from) form.append('image[]', new Blob([/** @type {BlobPart} */ (file.bytes)], { type: file.mimeType }), file.name)
    made = fetchOrThrow(fetch, endpoint(brain, '/images/edits'), { method: 'POST', headers: plain(brain, apiKey), body: form }, signal)
  } else made = post(fetch, { url: endpoint(brain, '/images/generations'), headers: headersFor(brain, apiKey), body: { ...asked, n: 1 } }, signal)
  const response = await made
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const json = await answer(made)
    return decoded(json?.data?.[0]?.b64_json && `data:image/png;base64,${json.data[0].b64_json}`)
  }
  // Streamed: its glimpses, then the picture (…partial_image, …completed).
  for await (const { data } of sseEvents(response, signal)) {
    const event = parseData(data)
    if (event?.error) throw new LLMError(String(event.error.message ?? event.error), { code: 'bad_request' })
    const mimeType = `image/${event?.output_format ?? 'png'}`
    if (/\.partial_image$/.test(event?.type) && event.b64_json) show?.({ done: (event.partial_image_index + 1) / (GLIMPSES + 1), image: { type: 'image', mimeType, data: event.b64_json } })
    else if (/\.completed$/.test(event?.type)) return decoded(event.b64_json && `data:${mimeType};base64,${event.b64_json}`)
  }
  throw new LLMError('No picture came back', { code: 'bad_response' })
}

/**
 * A film: OpenAI and OpenRouter make it as a job, which is asked how it is coming every few seconds
 * until it is done, then downloaded; Gemini in the one request. @param {Request} request @returns {Promise<{ bytes: Uint8Array, mimeType: string }>}
 */
export async function film({ brain, apiKey, model, prompt, from: [first], shape, seconds = 8, lengths, show, signal, every = 10_000, fetch = globalThis.fetch }) {
  const tall = shape === 'tall'
  // Omni makes 3 to 10 seconds.
  if (brain.provider === 'gemini') return interaction({ brain, apiKey, model, prompt, from: first ? [first] : [], shape, signal, fetch }, { type: 'video', aspect_ratio: tall ? '9:16' : '16:9', duration: `${Math.min(10, seconds)}s` })
  /** Only from where the brain is, with its key. @param {string} url @param {Record<string, string>} headers */
  const get = (url, headers) => {
    if (new URL(url).origin !== new URL(brain.baseURL).origin) throw new LLMError(`The film is at another address: ${new URL(url).host}`, { code: 'bad_response' })
    return fetchOrThrow(fetch, url, { headers }, signal)
  }
  const url = endpoint(brain, '/videos')
  /** @type {any} */
  let job
  if (brain.provider === 'openrouter') {
    // The length nearest the one asked among those the model takes (Veo: 4, 6 or 8), the longer of two as near.
    const duration = lengths?.length ? [...lengths].sort((a, b) => b - a).reduce((best, length) => (Math.abs(length - seconds) < Math.abs(best - seconds) ? length : best)) : seconds
    job = await answer(post(fetch, { url, headers: headersFor(brain, apiKey), body: { model, prompt, duration, aspect_ratio: tall ? '9:16' : '16:9',
      ...(first && { frame_images: [{ type: 'image_url', image_url: { url: `data:${first.mimeType};base64,${base64(first.bytes)}` }, frame_type: 'first_frame' }] }) } }, signal))
  } else {
    // OpenAI takes 4, 8 or 12 seconds, and a picture to start from as a file.
    const form = new FormData()
    for (const [name, value] of Object.entries({ model, prompt, seconds: String(Math.min(12, Math.max(4, Math.round(seconds / 4) * 4))), size: frame('film', shape).join('x') })) form.set(name, value)
    if (first) form.set('input_reference', new Blob([/** @type {BlobPart} */ (first.bytes)], { type: first.mimeType }), first.name)
    job = await answer(fetchOrThrow(fetch, url, { method: 'POST', headers: plain(brain, apiKey), body: form }, signal))
  }
  // OpenAI's job says how far along it is.
  while (job?.id && !/^(completed|succeeded|failed|cancelled|expired)$/.test(job.status)) {
    job = await pause(every, signal).then(() => answer(get(job.polling_url ?? `${url}/${job.id}`, plain(brain, apiKey))))
    if (typeof job?.progress === 'number') show?.({ done: job.progress / 100 })
  }
  if (!/^(completed|succeeded)$/.test(job?.status)) throw new LLMError(job?.error?.message ?? 'No film came back', { code: 'bad_response' })
  const response = await get(`${url}/${job.id}/content`, plain(brain, apiKey))
  return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: response.headers.get('content-type')?.split(';')[0] || 'video/mp4' }
}

/**
 * OpenRouter's film models, which its /models leaves out, with the seconds each takes. Those
 * without lengths change a film or animate a face: they make none from a description.
 * @param {import('../../core/types.js').Connection} connection @returns {Promise<{ id: string, output: string[], lengths: number[] }[]>}
 */
export async function filmModels({ brain, apiKey, signal, fetch = globalThis.fetch }) {
  const json = await answer(fetchOrThrow(fetch, endpoint(brain, '/videos/models'), { headers: plain(brain, apiKey) }, signal))
  return (json?.data ?? []).filter((/** @type {any} */ model) => model.supported_durations?.length)
    .map((/** @type {any} */ model) => ({ id: model.id, output: ['video'], lengths: model.supported_durations }))
}

/**
 * Gemini's Interactions API, beside its OpenAI-compatible one: a picture or a film comes back in
 * the answer, waited for in the one request as Google advises, and not kept by Google.
 * @param {Request} request @param {{ type: 'image' | 'video', aspect_ratio: string, duration?: string }} format
 */
async function interaction({ brain, apiKey, model, prompt, from, signal, fetch = globalThis.fetch }, format) {
  const input = [{ type: 'text', text: prompt }, ...from.map((file) => ({ type: 'image', mime_type: file.mimeType, data: base64(file.bytes) }))]
  const json = await answer(post(fetch, { url: `${google(brain)}/interactions`, headers: keyed(brain, apiKey), body: { model, input, response_format: format, background: false, store: false } }, signal))
  const made = json?.steps?.flatMap((/** @type {any} */ step) => (step.type === 'model_output' && step.content) || []).find((/** @type {any} */ part) => part.type === format.type && part.data)
  if (!made) throw new LLMError(json?.errors?.[0]?.message ?? `No ${format.type === 'video' ? 'film' : 'picture'} came back`, { code: 'bad_response' })
  return { mimeType: made.mime_type, bytes: bytesOf(made.data) }
}

/** @param {import('../../core/types.js').BrainConfig} brain */
const google = (brain) => brain.baseURL.replace(/\/openai\/?$/, '')
/** @param {import('../../core/types.js').BrainConfig} brain @param {string} [apiKey] */
const keyed = (brain, apiKey) => ({ ...plain(brain), 'content-type': 'application/json', ...(apiKey && { 'x-goog-api-key': apiKey }) })

/** The brain's headers without a type, for a form or a GET. @param {import('../../core/types.js').BrainConfig} brain @param {string} [apiKey] */
function plain(brain, apiKey) {
  const headers = headersFor(brain, apiKey)
  delete headers['content-type']
  return headers
}

/** What came back; an error, even with 200, as some servers answer an address they don't have (LM Studio). @param {Promise<Response>} response */
async function answer(response) {
  const json = await (await response).json().catch(() => null)
  if (json?.error) throw new LLMError(String(json.error.message ?? json.error), { code: 'bad_request' })
  return json
}

/** @param {number} ms @param {AbortSignal} [signal] */
const pause = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => {
    clearTimeout(timer)
    reject(new LLMError('Request aborted', { code: 'aborted' }))
  }, { once: true })
})

/** @param {Uint8Array} bytes */
export function base64(bytes) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

/** A picture in a data: address, as bytes; an address elsewhere is no picture (D35). @param {string | undefined} url */
function decoded(url) {
  const match = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(url ?? '')
  if (!match) throw new LLMError('No picture came back', { code: 'bad_response' })
  return { mimeType: match[1], bytes: bytesOf(match[2]) }
}

/** @param {string} data in base64 */
export const bytesOf = (data) => Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
