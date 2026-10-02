// Pictures from the brain's provider, for codemode's models.image (D48), imported on first use.
import { LLMError, headersFor, post, endpoint } from './llm.js'

/**
 * OpenAI's Images API, which compatible servers share, or an OpenRouter model that answers with images.
 * @param {import('./types.js').Connection & { model: string, prompt: string }} options
 * @returns {Promise<{ bytes: Uint8Array, mimeType: string }>}
 */
export async function generateImage({ brain, apiKey, model, prompt, signal, fetch = globalThis.fetch }) {
  const chat = brain.provider === 'openrouter'
  const body = chat ? { model, messages: [{ role: 'user', content: prompt }], modalities: ['image', 'text'] } : { model, prompt, n: 1, ...(/^dall-e/.test(model) && { response_format: 'b64_json' }) }
  const json = await (await post(fetch, { url: endpoint(brain, chat ? '/chat/completions' : '/images/generations'), headers: headersFor(brain, apiKey), body }, signal)).json().catch(() => null)
  const url = chat ? json?.choices?.[0]?.message?.images?.[0]?.image_url?.url : json?.data?.[0]?.b64_json && `data:image/png;base64,${json.data[0].b64_json}`
  const match = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(url ?? '')
  if (!match) throw new LLMError('No picture came back', { code: 'bad_response' })
  return { mimeType: match[1], bytes: Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)) }
}
