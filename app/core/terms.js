// SPDX-License-Identifier: MIT
// Whether a brain whose provider's terms differ by plan is reached under terms that never train on what it is sent (D440):
// Claude Code through a cloud's Claude, an Anthropic API key or a plan for work; a Gemini key whose Google Cloud project is billed.
// Imported the first time a task that used Google's services needs to know.

/** The clouds whose Claude never trains on what it is sent, as Claude Code names them. */
const CLOUDS = new Set(['bedrock', 'vertex', 'foundry', 'anthropicAws', 'anthropicGoogleCloud', 'mantle'])

/**
 * Whether Claude Code reaches Claude under commercial terms, as `claude auth status` says: a cloud's own, or Anthropic's with an API
 * key or a Team or Enterprise plan. Never Pro or Max, whose training is the person's own setting, nor an address of their own (a
 * gateway), whose service nobody here knows.
 * @param {{ provider?: string, method?: string, plan?: string, gateway?: boolean } | null | undefined} terms
 */
export const commercial = (terms) => !!terms && !terms.gateway && (terms.provider === 'firstParty'
  ? ['api_key', 'api_key_helper'].includes(terms.method ?? '') || (terms.method === 'claude.ai' && ['team', 'enterprise'].includes(terms.plan ?? ''))
  : CLOUDS.has(terms.provider ?? ''))

/** Models of Gemini's API with no free tier, as Google's pricing lists them, asked in turn: one Google retired answers 404. */
export const PAID_ONLY = ['gemini-3.1-pro-preview', 'gemini-4-argon', 'gemini-4-carbon']

/**
 * Whether a Gemini key's Google Cloud project is billed, where Google never trains on what it is sent: only a billed project's key may
 * ask a model with no free tier, an unbilled one's being refused at its free tier's quota, whose limit is 0. Null where neither was
 * found: every model retired, the key refused, the service busy or out of reach, which a later check may tell.
 * @param {{ baseURL: string, apiKey: string, fetch?: typeof globalThis.fetch, signal?: AbortSignal }} options @returns {Promise<boolean | null>}
 */
export async function billed({ baseURL, apiKey, fetch = globalThis.fetch, signal }) {
  for (const model of PAID_ONLY) {
    const res = await fetch(`${baseURL}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 16 }), signal }).catch(() => null)
    if (res?.status !== 404) return res?.ok || (res?.status === 429 && /free_tier|FreeTier|limit: 0\b/.test(await res.text().catch(() => '')) ? false : null)
  }
  return null
}
