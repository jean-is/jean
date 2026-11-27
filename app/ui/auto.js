// SPDX-License-Identifier: MIT
// Auto: the cheapest brain that can do the job, chosen from reflex answers (docs/product.md,
// "Brains: picker and Auto"). Within a conversation it steps up, never down, so the
// provider's cache stays warm; a new conversation starts again from the bottom. Its three
// steps may each be any brain in the cloud, and a mix says how it climbs them (D773).
import { isLocal } from '../core/settings.js'

/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */
/** @typedef {import('../core/types.js').Effort} Effort */
/** @typedef {import('../core/types.js').Step} Step */
/** @typedef {'less' | 'balanced' | 'best'} Mix */
/** @typedef {'only' | 'private' | 'offline' | 'personal' | 'demand' | 'unhappy' | 'default'} Reason */
/**
 * What the reflexes made of a message, when they're on (ui/discovery.js), and whether it shares a picture; in a child's profile, a danger (D228).
 * @typedef {{ demand?: number, personal?: boolean, unhappy?: boolean, pictures?: boolean, danger?: string }} Signals  demand: 0 (chat) to 3 (expert)
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
  antigravity: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-pro'],
  chatgpt: ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra'],
})

// Whether a brain never leaves this computer is a setting's matter, known before Auto loads (D140).
export { isLocal }

/**
 * How each mix climbs the three steps (D773): the step each demand starts on, 0 chat → 3 expert, and without Intuition as
 * for an everyday request; and how much a step thinks when neither it nor its brain says.
 * @type {Record<Mix, { levels: number[], efforts: (Effort | undefined)[] }>}
 */
export const MIXES = {
  less: { levels: [0, 0, 0, 0], efforts: ['low'] },
  balanced: { levels: [0, 1, 1, 2], efforts: [] },
  best: { levels: [0, 2, 2, 2], efforts: [undefined, undefined, 'high'] },
}

/** Demand (0 chat → 3 expert) to a step, as a mix climbs them: fast, smart, smart, best. @param {number} demand */
export const tierFor = (demand, levels = MIXES.balanced.levels) => levels[Math.min(3, Math.max(0, Math.round(demand)))]

/**
 * Auto's three steps, quick, everyday and demanding (D773): each the brain and version the user set, while that brain is
 * among these; else the version for that level of the brain Auto leans on, when its provider's list has one; else none.
 * @param {{ brains: BrainConfig[], preferred?: string | null, steps?: (Step | null)[], tiers?: Record<string, string[]>,
 *   has?: (brain: BrainConfig, model: string) => boolean }} input brains: those in the cloud it may choose
 * @returns {(BrainConfig | null)[]}
 */
export function stepsOf({ brains, preferred, steps = [], tiers = TIERS, has = () => true }) {
  const lean = brains.find((brain) => brain.id === preferred) ?? brains[0]
  return [0, 1, 2].map((level) => {
    const set = steps[level]?.model && brains.find((brain) => brain.id === steps[level]?.brain)
    const model = lean && tiers[lean.provider]?.[level]
    return set ? { ...set, model: /** @type {string} */ (steps[level]?.model) } : model && has(lean, model) ? { ...lean, model } : null
  })
}

/** How much a brain thinks, from least to most (D414). @type {readonly Effort[]} */
export const EFFORTS = ['low', 'medium', 'high']

/**
 * How much the brain thinks for a message (D414): the brain's own setting, or as much as the request demands, read as
 * Auto's tiers are, a step more when the user seems unhappy, never less than before in the conversation; without
 * Intuition and before anything was asked, the brain's own default.
 * @param {{ setting?: Effort, signals?: Signals, floor?: number }} input floor: the most asked so far, by EFFORTS' index
 * @returns {Effort | undefined}
 */
export function chooseEffort({ setting, signals = {}, floor = -1 }) {
  const asked = signals.demand === undefined ? -1 : tierFor(signals.demand) + (signals.unhappy ? 1 : 0)
  return setting ?? EFFORTS[Math.min(2, Math.max(floor, asked))]
}

/**
 * @param {{ brains: BrainConfig[], preferred?: string | null, cloud?: boolean, online?: boolean, signals?: Signals,
 *   floor?: number, has?: (brain: BrainConfig, model: string) => boolean, sees?: (brain: BrainConfig) => boolean,
 *   tiers?: Record<string, string[]>, mix?: Mix, steps?: (Step | null)[] }} input
 *   floor: the level already used in this conversation; cloud false: "Keep on this device";
 *   online false: the browser is offline, so a brain on this device answers when there is one (D269);
 *   sees: whether a brain is shown pictures; mix and steps: the user's, which Auto climbs (D773)
 * @returns {{ brain: BrainConfig, level: number, reason: Reason, effort?: Effort } | null} effort: how much the step thinks, if anything says
 */
export function chooseBrain({ brains, preferred, cloud = true, online = true, signals = {}, floor = 0, has = () => true, sees = () => true, tiers = TIERS, mix = 'balanced', steps = [] }) {
  // The device's brain first, unless a picture needs a private brain that can see it.
  const local = (signals.pictures && brains.find((brain) => isLocal(brain) && sees(brain))) || brains.find((brain) => brain.api === 'device') || brains.find(isLocal)
  // In the cloud, the ones that can see when there is a picture, if any can (D645), leaning on the one preferred, or the first.
  const remotes = cloud && (online || !local) ? brains.filter((brain) => !isLocal(brain)) : []
  const seeing = remotes.filter((brain) => signals.pictures && sees(brain))
  const pool = seeing.length ? seeing : remotes
  const lean = pool.find((brain) => brain.id === preferred) ?? pool[0]
  if (!lean) return local ? { brain: local, level: floor, reason: !cloud ? 'private' : brains.every(isLocal) ? 'only' : 'offline' } : null
  if (local && signals.personal && (!signals.pictures || sees(local))) return { brain: local, level: floor, reason: 'personal' }
  const { levels, efforts } = MIXES[mix] ?? MIXES.balanced
  const level = Math.min(2, Math.max(floor, tierFor(signals.demand ?? 1, levels) + (signals.unhappy ? 1 : 0)))
  const brain = stepsOf({ brains: pool, preferred, steps, tiers, has })[level] ?? lean
  const reason = signals.unhappy ? 'unhappy' : signals.demand !== undefined ? 'demand' : 'default'
  return { brain, level, reason, effort: steps[level]?.effort ?? brain.effort ?? efforts[level] }
}
