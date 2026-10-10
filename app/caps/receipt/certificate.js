// What an answer's certificate says (D252), from the conversation's records alone: how long the
// answer took, each brain asked and whether it ran on this device, and what the page reached while
// the answer was written, as the browser recorded it. Sealed with a key of the device's, anyone can
// check it with verify(). No DOM, so it is tested with node --test.

/** @import { Turn } from '../../core/events.js' */
/** @import { ModelInfo } from '../../core/types.js' */

/**
 * A brain asked for the answer: when (ms), and whether it ran on this device.
 * @typedef {{ provider: string, model: string, local: boolean, started: number, ms?: number, input: number, output: number, cached: number }} Brain
 * What the page reached while a conversation was answered, by address and number of requests, as
 * its browser recorded them, kept in the conversation once the answer ends (`meta.reached`).
 * @typedef {{ from: string, to: string, hosts: Record<string, number> }} Reached
 * Recorded: the browser's record covers every request to a brain. The verdict: done on this device,
 * sent outside it, or not known.
 * @typedef {{ ms: number, brains: Brain[], reached: Reached[], outside: string[], recorded: boolean, verdict: 'local' | 'out' | 'unknown' }} Facts
 */

/** This device itself, by name or address. */
const HERE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

/** Every brain asked for the answer, its helpers' too. @param {Turn} turn @returns {Brain[]} */
export const brainsOf = (turn) => turn.steps.flatMap((step) => step.tools).flatMap(({ name, kind, toolCallId, rawInput, rawOutput, _meta }) => (!name && kind === 'think' && rawInput?.provider ? [{
  provider: rawInput.provider, model: rawInput.model, local: rawInput.local === true, started: parseInt(/brain-\d+-(\w+)$/.exec(toolCallId)?.[1] ?? '', 36),
  ms: _meta?.ms, input: rawOutput?.usage?.inputTokens ?? 0, output: rawOutput?.usage?.outputTokens ?? 0, cached: rawOutput?.usage?.cacheReadTokens ?? 0,
}] : []))

/** The host of a web address, if it is one. @param {unknown} url @returns {string[]} */
const hostOf = (url) => { try { const { protocol, host } = new URL(String(url)); return /^https?:$/.test(protocol) ? [host] : [] } catch { return [] } }

/**
 * What a turn's certificate says. A brain in the cloud, or an address outside this device, sends it
 * out: one the page reached, or one a call was asked to reach, which a frame may load where the
 * page's record can't see (the browser's `browse`). Otherwise it was done here only if the browser's record covers it.
 * @param {Turn} turn @param {Reached[]} all the conversation's @returns {Facts}
 */
export function factsOf(turn, all) {
  const end = turn.end ?? turn.at
  const brains = brainsOf(turn)
  const reached = all.filter(({ from }) => from >= turn.at && from <= end)
  const asked = turn.steps.flatMap((step) => step.tools).flatMap(({ name, rawInput }) => (name && rawInput?.url ? hostOf(rawInput.url) : []))
  const outside = [...new Set([...reached.flatMap(({ hosts }) => Object.keys(hosts)), ...asked])].filter((host) => !HERE.test(host))
  const recorded = reached.length > 0 && brains.every(({ started }) => reached.some(({ from, to }) => Date.parse(from) <= started && started <= Date.parse(to)))
  const verdict = outside.length || brains.some((brain) => !brain.local) ? 'out' : recorded ? 'local' : 'unknown'
  return { ms: Date.parse(end) - Date.parse(turn.at), brains, reached, outside, recorded, verdict }
}

/**
 * What the answer cost in dollars, from its brains' prices per token, what they read again from the
 * cache at its own price when it has one: nothing on this device, null when a price isn't known.
 * @param {Brain[]} brains @param {(brain: Brain) => ModelInfo['pricing']} priceOf
 */
export function costOf(brains, priceOf) {
  let cost = 0
  for (const brain of brains.filter((one) => !one.local)) {
    const { prompt = NaN, completion = NaN, cacheRead = prompt } = priceOf(brain) ?? {}
    cost += (brain.input - brain.cached) * prompt + brain.cached * cacheRead + brain.output * completion
  }
  return Number.isNaN(cost) ? null : cost
}

/** A text's fingerprint, SHA-256 in hexadecimal. @param {string} text */
const sha256 = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * The certificate as saved, before its seal: what it says, and the request's and the answer's
 * fingerprints, which show which they are without holding them.
 * @param {{ facts: Facts, turn: Turn, text: string, conversation: string, by: string, origin: string, now?: Date }} options
 */
export const certificate = async ({ facts, turn, text, conversation, by, origin, now = new Date() }) => ({
  format: 1, kind: 'certificate', issued: now.toISOString(), by, jean: origin, conversation,
  request: { at: turn.at, sha256: await sha256(turn.user?.text ?? '') }, answer: { at: turn.end ?? turn.at, sha256: await sha256(text) },
  local: facts.verdict === 'local', ms: facts.ms, recorded: facts.recorded,
  brains: facts.brains.map(({ provider, model, local, ms, input, output, cached }) => ({ provider, model, local, ms, input, output, cached })), reached: facts.reached,
})

const SIGNING = { name: 'ECDSA', hash: 'SHA-256' }

/**
 * Seals a certificate: the public half of a key pair and the signature (ECDSA P-256, SHA-256) of the
 * certificate without its seal, as compact JSON. @param {Record<string, unknown>} document @param {CryptoKeyPair} keys
 */
export async function seal(document, keys) {
  const signature = new Uint8Array(await crypto.subtle.sign(SIGNING, keys.privateKey, new TextEncoder().encode(JSON.stringify(document))))
  return { ...document, seal: { algorithm: 'ECDSA P-256 SHA-256', key: await crypto.subtle.exportKey('jwk', keys.publicKey), signature: btoa(String.fromCharCode(...signature)) } }
}

/** Whether a saved certificate is as its key sealed it. @param {Record<string, any>} saved */
export async function verify({ seal: { key, signature } = {}, ...document }) {
  if (!key || !signature) return false
  const publicKey = await crypto.subtle.importKey('jwk', key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  return crypto.subtle.verify(SIGNING, publicKey, Uint8Array.from(atob(signature), (char) => char.charCodeAt(0)), new TextEncoder().encode(JSON.stringify(document)))
}
