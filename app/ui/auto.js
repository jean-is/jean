// Auto: the cheapest brain that can do the job, chosen from reflex answers (docs/product.md,
// "Brains: picker and Auto"). Within a conversation it steps up, never down, so the
// provider's cache stays warm; a new conversation starts again from the bottom.
import { isLocal } from '../core/settings.js'

/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */
/** @typedef {'only' | 'private' | 'offline' | 'personal' | 'demand' | 'unhappy' | 'default'} Reason */
/**
 * What the reflexes made of a message, when they're on (ui/discovery.js), and whether it shares a picture.
 * @typedef {{ demand?: number, personal?: boolean, unhappy?: boolean, pictures?: boolean }} Signals  demand: 0 (chat) to 3 (expert)
 */

/**
 * Fast, smart and best, per provider: provider identities (D33), replaceable by policy, and
 * used only when the provider's own list has them.
 */
export const TIERS = /** @type {Record<string, string[]>} */ ({
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  openrouter: ['google/gemini-3.8-flash', 'anthropic/claude-sonnet-5.5', 'anthropic/claude-opus-5.5'],
  openai: ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra'],
  gemini: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'],
  vertex: ['google/gemini-3.5-flash-lite', 'google/gemini-3.8-flash', 'google/gemini-3.1-pro-preview'],
  mistral: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'],
  vercel: ['anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-5.5', 'anthropic/claude-opus-5.5'],
  claudecode: ['haiku', 'sonnet', 'opus'],
  // Copilot's free one first: its plan counts the others' requests.
  copilot: ['gpt-5-mini', 'claude-sonnet-5.5', 'claude-opus-5.5'],
  chatgpt: ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra'],
})

// Whether a brain never leaves this computer is a setting's matter, known before Auto loads (D140).
export { isLocal }

/** Demand (0 chat → 3 expert) to a tier: fast, smart, smart, best. @param {number} demand */
export const tierFor = (demand) => [0, 1, 1, 2][Math.min(3, Math.max(0, Math.round(demand)))]

/**
 * @param {{ brains: BrainConfig[], preferred?: string | null, cloud?: boolean, online?: boolean, signals?: Signals,
 *   floor?: number, has?: (brain: BrainConfig, model: string) => boolean, sees?: (brain: BrainConfig) => boolean,
 *   tiers?: Record<string, string[]> }} input
 *   floor: the level already used in this conversation; cloud false: "never send to the cloud";
 *   online false: the browser is offline, so a brain on this device answers when there is one (D269);
 *   sees: whether a brain is shown pictures
 * @returns {{ brain: BrainConfig, level: number, reason: Reason } | null}
 */
export function chooseBrain({ brains, preferred, cloud = true, online = true, signals = {}, floor = 0, has = () => true, sees = () => true, tiers = TIERS }) {
  // The device's brain first, unless a picture needs a private brain that can see it.
  const local = (signals.pictures && brains.find((brain) => isLocal(brain) && sees(brain))) || brains.find((brain) => brain.api === 'device') || brains.find(isLocal)
  const remote = cloud && (online || !local) ? [brains.find((brain) => brain.id === preferred), ...brains].find((brain) => brain && !isLocal(brain)) : undefined
  if (!remote) return local ? { brain: local, level: floor, reason: !cloud ? 'private' : brains.every(isLocal) ? 'only' : 'offline' } : null
  if (local && signals.personal && (!signals.pictures || sees(local))) return { brain: local, level: floor, reason: 'personal' }
  const level = Math.min(2, Math.max(floor, (signals.demand === undefined ? 1 : tierFor(signals.demand)) + (signals.unhappy ? 1 : 0)))
  const model = tiers[remote.provider]?.[level]
  const reason = signals.unhappy ? 'unhappy' : signals.demand !== undefined ? 'demand' : 'default'
  return { brain: model && has(remote, model) ? { ...remote, model } : remote, level, reason }
}
