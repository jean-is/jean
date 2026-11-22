// SPDX-License-Identifier: MIT
// A creation's version certified (docs/composition.md, D763): a W3C VC 2.0 of type CreationVersion, sealed as an answer's certificate is
// (caps/receipt, D274), saying which creation and which version, by whom and when, salted digests of what it holds and of the recipe that
// made it, the brain that ran it, and its ingredients, in Content Credentials' spirit: each source at the version it read, by its own
// certificate's imprint. Certificates given together are checked as a chain, back to those that name none. Pure, so Node's tests run it.
import { check, disclose, imprint } from '../receipt/certificate.js'

/** @import { Sealed } from '../receipt/certificate.js' */
/** An ingredient: a source's kind and ULID, the version it was read at (`v2`, or its journal's head), and that version's certificate's imprint where it has one. @typedef {{ kind: 'collection', creation: string, read: string, certificate?: string }} Ingredient */
/** A step of a chain: an ingredient, how deep, whether its certificate was given, and whether that holds. @typedef {Ingredient & { depth: number, given: boolean, intact: boolean }} Step */

const base64 = (/** @type {Uint8Array} */ bytes) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
const salt = () => base64(crypto.getRandomValues(new Uint8Array(16))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** What text holds, as Subresource Integrity names it. @param {string} text */
export const sriOf = async (text) => `sha256-${base64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))}`

/**
 * A version's credential, before its seal names its issuer, and the salts its digests were made with, which its holder keeps.
 * @param {{ kind: 'collection' | 'document' | 'run', creation: string, n: number, at: string, by: string, content: string, recipe?: Record<string, string>, brain?: { provider: string, model: string, local: boolean }, ingredients?: Ingredient[] }} made
 */
export async function credentialOf({ kind, creation, n, at, by, content, recipe, brain, ingredients = [] }) {
  const salts = { content: salt(), ...(recipe && { recipe: salt() }) }, held = await disclose(salts.content, 'digestSRI', await sriOf(content)), how = recipe && salts.recipe ? await disclose(salts.recipe, 'recipe', recipe) : null
  return { salts, credential: { '@context': ['https://www.w3.org/ns/credentials/v2'], type: ['VerifiableCredential', 'CreationVersion'], id: `urn:uuid:${crypto.randomUUID()}`, validFrom: at, _sd_alg: 'sha-256',
    credentialSubject: { kind, creation, version: n, author: by, where: brain && !brain.local ? 'cloud' : 'device', content: { _sd: [held.digest] }, ...(how && { recipe: { _sd: [how.digest] } }), ...(brain && { brains: [brain] }), ingredients } } }
}

/**
 * Certificates given together, the first made from the others: the first checked, then each ingredient it names found among them by its
 * certificate's imprint and checked in turn, as deep as they go; an ingredient read at its journal's head names none. @param {Sealed[]} certificates
 * @param {Parameters<typeof check>[1]} [known] @returns {Promise<Awaited<ReturnType<typeof check>> & { chain: Step[] }>}
 */
export async function chainOf(certificates, known) {
  const read = await Promise.all(certificates.map(async (one) => ({ checked: await check({ certificate: one }, known), imprint: await imprint(one) }))), chain = /** @type {Step[]} */ ([]), seen = new Set()
  const walk = (/** @type {number} */ i, /** @type {number} */ depth) => {
    seen.add(i)
    for (const ingredient of /** @type {Ingredient[]} */ (read[i].checked.says?.credentialSubject?.ingredients ?? [])) {
      const j = read.findIndex((one) => one.imprint === ingredient.certificate)
      chain.push({ ...ingredient, depth, given: j >= 0, intact: j >= 0 && read[j].checked.intact })
      if (j >= 0 && !seen.has(j)) walk(j, depth + 1)
    }
  }
  walk(0, 0)
  return { ...read[0].checked, chain }
}
/** Whether a chain holds: its first certificate, and every ingredient's that names one. @param {{ intact: boolean, chain: Step[] }} checked */
export const holds = ({ intact, chain }) => intact && chain.every((step) => !step.certificate || (step.given && step.intact))
