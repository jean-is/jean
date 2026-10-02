// settings.json, organisation policy, and the default project.
import { readJSON, writeJSON } from './fs.js'
import { ulid } from './ulid.js'

/** @typedef {import('./types.js').FS} FS */
/** @typedef {import('./types.js').BrainConfig} BrainConfig */
/** @typedef {import('./types.js').RuleValue} RuleValue */

/**
 * @typedef {Object} Settings
 * @property {1} format
 * @property {string | null} locale
 * @property {BrainConfig[]} brains
 * @property {string | null} activeBrain
 * @property {Record<string, RuleValue>} rules
 * @property {string | null} voice
 * @property {string[]} unlocked              capabilities discovered so far
 * @property {boolean} auto                   Auto picks the brain for each message
 * @property {boolean} cloud                  false: never send to the cloud
 * @property {Record<string, string>} offers  offer id → when the user answered it (ISO)
 * @property {Partial<typeof DEFAULT_URLS>} [urls]  overrides of the default addresses
 */

/**
 * Addresses of services Jean can use, each replaceable in settings and by policy
 * (`urls` in policy.json). Model weights are a provider identity, like a brain's URL (D33, D53).
 */
export const DEFAULT_URLS = Object.freeze({ modelWeights: 'https://huggingface.co/' })

/**
 * @param {keyof typeof DEFAULT_URLS} name
 * @param {Settings} settings @param {{ urls?: Record<string, string> }} [policy]
 */
export function serviceURL(name, settings, policy = {}) {
  return policy.urls?.[name] ?? settings.urls?.[name] ?? DEFAULT_URLS[name]
}

/** @type {Settings} */
export const DEFAULT_SETTINGS = { format: 1, locale: null, brains: [], activeBrain: null, rules: {}, voice: null, unlocked: [], offers: {}, auto: true, cloud: true }

/** @param {FS} fs @returns {Promise<Settings>} */
export async function loadSettings(fs) {
  const saved = await readJSON(fs, 'settings.json', null)
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
}

/** @param {FS} fs @param {Settings} settings */
export async function saveSettings(fs, settings) {
  await writeJSON(fs, 'settings.json', settings)
}

/**
 * Settings resolve as defaults ← user ← policy. Returns the effective settings
 * and the keys an organisation locked ("rules.fetch", "brains", "locale"…).
 * @param {Settings} settings
 * @param {{ locale?: string, brains?: BrainConfig[], rules?: Record<string, RuleValue> }} [policy]
 */
export function applyPolicy(settings, policy = {}) {
  /** @type {Set<string>} */
  const locked = new Set()
  const effective = { ...settings, rules: { ...settings.rules } }
  if (policy.locale) {
    effective.locale = policy.locale
    locked.add('locale')
  }
  if (policy.brains?.length) {
    effective.brains = policy.brains
    if (!policy.brains.some((brain) => brain.id === effective.activeBrain)) effective.activeBrain = policy.brains[0].id
    locked.add('brains')
  }
  for (const [kind, value] of Object.entries(policy.rules ?? {})) {
    effective.rules[kind] = value
    locked.add(`rules.${kind}`)
  }
  return { settings: effective, locked }
}

/**
 * The default project, created on first run. Invisible until projects are discovered.
 * @param {FS} fs @param {{ by: string, name?: string }} options
 */
export async function ensureHome(fs, { by, name = 'Home' }) {
  for (const entry of await fs.list('projects')) {
    if (entry.kind !== 'directory') continue
    const text = await fs.read(`projects/${entry.name}/project.md`)
    if (text && parseFrontMatter(text).data.default === true) return `projects/${entry.name}`
  }
  const dir = `projects/${ulid()}-home`
  const data = { format: 1, default: true, name, createdAt: new Date().toISOString(), by }
  await fs.write(`${dir}/project.md`, stringifyFrontMatter(data, ''))
  return dir
}

/**
 * Minimal front matter: `key: value` scalars between --- lines.
 * @param {string} text
 * @returns {{ data: Record<string, string | number | boolean | null>, body: string }}
 */
export function parseFrontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'))
  if (!match) return { data: {}, body: text }
  /** @type {Record<string, string | number | boolean | null>} */
  const data = {}
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':')
    if (at < 1) continue
    data[line.slice(0, at).trim()] = scalar(line.slice(at + 1).trim())
  }
  return { data, body: match[2] }
}

/** @param {string} raw */
function scalar(raw) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null' || raw === '') return null
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  if (/^".*"$/.test(raw)) return JSON.parse(raw)
  return raw
}

/** @param {Record<string, string | number | boolean | null>} data @param {string} body */
export function stringifyFrontMatter(data, body) {
  const lines = Object.entries(data).map(([key, value]) =>
    `${key}: ${typeof value === 'string' && /[:#"'\n]|^\s|\s$/.test(value) ? JSON.stringify(value) : value}`,
  )
  return `---\n${lines.join('\n')}\n---\n${body}`
}
