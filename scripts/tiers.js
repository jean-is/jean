// SPDX-License-Identifier: MIT
// Auto's Fast, Smart and Best for each provider (TIERS in app/ui/auto.js) are versions written in Jean's code, which age as
// providers release and retire theirs. This holds each against models.dev's catalogue, the one Jean reads its prices from
// (DEFAULT_URLS.prices): a version the catalogue says is retired, or one with a newer version of its line at no more cost
// ("gpt-6-sol" and "gpt-6.2-sol", the same name but for its numbers), is one to move. A plan's versions are its program's
// own list, which the catalogue only mirrors: what it says of them is a note, to check in the program itself.
//   npm run tiers            exits 1 when a provider's tier is retired, or has a newer version at no more cost
// CI runs it on every push to main and each Monday (.github/workflows/tiers.yml), so that a new version shows within a week.
import { pathToFileURL } from 'node:url'
import { TIERS } from '../app/ui/auto.js'
import { DEFAULT_URLS } from '../app/core/settings.js'

/** models.dev's name for each provider whose tiers Jean has, a plan's by whose versions its program offers. */
export const CATALOGUES = /** @type {Record<string, string>} */ ({
  anthropic: 'anthropic', openrouter: 'openrouter', openai: 'openai', gemini: 'google', vertex: 'google-vertex', mistral: 'mistral', vercel: 'vercel',
  claudecode: 'anthropic', copilot: 'github-copilot', antigravity: 'google', chatgpt: 'openai',
})
/** The providers that answer from a plan, whose lists are their programs' (D235, D262, D756). */
const PLANS = new Set(['claudecode', 'copilot', 'antigravity', 'chatgpt'])
const LEVELS = ['Fast', 'Smart', 'Best']

/** A version's line: its name with its numbers left out, or null for a name with none, which follows its line itself ("-latest"). @param {string} id */
export const lineOf = (id) => (/\d/.test(id) ? id.replace(/\d+(?:[.-]\d+)*/g, '#') : null)

/**
 * @typedef {{ status?: string, release_date?: string, cost?: { input?: number, output?: number } }} Entry a catalogue's model
 * @typedef {{ provider: string, level: string, model: string, kind: 'retired' | 'newer' | 'dearer' | 'unlisted', plan: boolean, newer?: string, entry?: Entry }} Finding
 */

/**
 * What the catalogue says of each tier: retired, a newer version of its line at no more cost, or at more, or not in it at all.
 * @param {Record<string, string[]>} tiers @param {Record<string, { models?: Record<string, Entry> } | undefined>} catalogue @returns {Finding[]}
 */
export function review(tiers, catalogue) {
  return Object.entries(tiers).flatMap(([provider, ids]) => {
    const models = catalogue[CATALOGUES[provider]]?.models ?? {}
    return ids.flatMap((model, i) => {
      const base = { provider, level: LEVELS[i], model, plan: PLANS.has(provider) }
      const key = model in models ? model : model.slice(model.lastIndexOf('/') + 1)
      const own = models[key]
      if (!own) return [{ ...base, kind: /** @type {const} */ ('unlisted') }]
      if (own.status === 'deprecated') return [{ ...base, kind: /** @type {const} */ ('retired') }]
      const line = lineOf(key)
      const [newer] = Object.entries(models).filter(([id, entry]) => line && lineOf(id) === line && entry.status !== 'deprecated' && (entry.release_date ?? '') > (own.release_date ?? ''))
        .sort(([, a], [, b]) => (b.release_date ?? '').localeCompare(a.release_date ?? ''))
      if (!newer) return []
      const [id, entry] = newer
      const cheaper = ['input', 'output'].every((side) => typeof entry.cost?.[side] === 'number' && typeof own.cost?.[side] === 'number' && entry.cost[side] <= own.cost[side])
      return [{ ...base, kind: cheaper ? /** @type {const} */ ('newer') : /** @type {const} */ ('dearer'), newer: id, entry }]
    })
  })
}

/** Whether a finding asks for a change: a provider's tier retired, or with a newer version at no more cost. @param {Finding} finding */
export const moves = (finding) => !finding.plan && (finding.kind === 'retired' || finding.kind === 'newer')

/** A finding as a line. @param {Finding} finding */
export function said({ provider, level, model, kind, plan, newer, entry }) {
  const price = entry?.cost ? ` ($${entry.cost.input} and $${entry.cost.output} a million tokens read and written, from ${entry.release_date})` : ''
  const what = kind === 'unlisted' ? `isn't in models.dev's ${CATALOGUES[provider]} list` : kind === 'retired' ? 'is retired' : kind === 'newer' ? `has a newer version at no more cost: ${newer}${price}` : `has a newer version that costs more: ${newer}${price}`
  return `${provider}'s ${level}, ${model}, ${what}${plan ? ` (a plan: check its program's own list)` : ''}`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const response = await fetch(DEFAULT_URLS.prices)
  if (!response.ok) throw new Error(`${new URL(DEFAULT_URLS.prices).host} answered ${response.status}`)
  const findings = review(TIERS, await response.json())
  for (const finding of findings) console.log(said(finding))
  if (!findings.some(moves)) console.log(findings.length ? 'Nothing above asks for a change.' : "Auto's tiers are current")
  process.exitCode = findings.some(moves) ? 1 : 0
}
