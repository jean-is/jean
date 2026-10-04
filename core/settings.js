// settings.json, organisation policy, and the default project.
import { readJSON, writeJSON } from './fs.js'
import { ulid } from './ulid.js'

/** @import { FS, BrainConfig, RuleValue } from './types.js' */

/**
 * @typedef {Object} Settings
 * @property {2} format                      2 since D122: capability ids are today's
 * @property {string | null} locale
 * @property {BrainConfig[]} brains
 * @property {string | null} activeBrain
 * @property {Record<string, RuleValue>} rules
 * @property {string | null} voice
 * @property {string[]} unlocked              capabilities discovered so far
 * @property {boolean} auto                   Auto picks the brain for each message
 * @property {boolean} cloud                  false: never send to the cloud
 * @property {Record<string, string>} offers  offer id → when the user answered it (ISO)
 * @property {boolean} [memory]               false: Jean neither notes nor reads what it noticed
 * @property {Connection[]} [connections]      services connected through MCP (their keys and tokens are secrets)
 * @property {number} [dictated]               how many times the user dictated (live conversation is offered)
 * @property {number} [cited]                  how many answers cited their sources (Double-check is offered)
 * @property {number} [browsed]                how many links from answers the user opened (the browser is offered)
 * @property {string[]} [windowed]             sites that open in a tab of their own, not in the browser (D140)
 * @property {{ width?: number, sizes?: Record<string, number> }} [dock]  how wide the dock is (a share of the window) and each pane's share of it, as the user set them (D144)
 * @property {import('./csp.js').PageSettings} [pages]  what a web page in the preview may do, and which sites it may reach (D143)
 * @property {Partial<typeof DEFAULT_URLS>} [urls]  overrides of the default addresses
 * @property {Look} [look]                     how Jean looks, and the user's own touches (D111)
 * @property {string[]} [sources]              addresses of skills indexes, when the user changed the default list (D121)
 */

/**
 * A look by its id (the room when absent), and what the user changed over it: colours as
 * `#rrggbb`, a text size as a share of the browser's, a typeface, and their own CSS.
 * @typedef {{ id?: string, accent?: string, background?: string, size?: number, font?: string, css?: string }} Look
 */

/** @typedef {{ id: string, name: string, url: string, auth: 'none' | 'key' | 'oauth' }} Connection */

/**
 * Addresses of services Jean can use, each replaceable in settings and by policy
 * (`urls` in policy.json). Model weights are a provider identity, like a brain's URL (D33, D53);
 * so is Wikipedia, which web search reads in the user's language ({lang}), and where the browser looks words up.
 */
export const DEFAULT_URLS = Object.freeze({ modelWeights: 'https://huggingface.co/', wikipedia: 'https://{lang}.wikipedia.org/w/api.php', searchPage: 'https://{lang}.wikipedia.org/w/index.php?search={query}' })

/**
 * @param {keyof typeof DEFAULT_URLS} name
 * @param {Settings} settings @param {{ urls?: Record<string, string> }} [policy]
 */
export function serviceURL(name, settings, policy = {}) {
  return policy.urls?.[name] ?? settings.urls?.[name] ?? DEFAULT_URLS[name]
}

/** A brain that never leaves this computer. @param {BrainConfig} brain */
export const isLocal = (brain) => brain.api === 'device' || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(brain.baseURL)

/** @type {Settings} */
export const DEFAULT_SETTINGS = { format: 2, locale: null, brains: [], activeBrain: null, rules: {}, voice: null, unlocked: [], offers: {}, auto: true, cloud: true }

/**
 * Names that changed (D115): the Skills capability and its tools were Routines. Earlier
 * conversations still name the tools they were given so.
 */
const RENAMED = /** @type {Readonly<Record<string, string>>} */ (Object.freeze({ routine: 'skill', save_routine: 'save_skill' }))

/** A tool's name as it is now. @param {string} name */
export const renamed = (name) => (Object.hasOwn(RENAMED, name) ? RENAMED[name] : name)

/**
 * Settings, upgraded when read: in a file of format 1, `routines` is the capability now called
 * skills (D115); since format 2 it is the tasks Jean does on a schedule (D122).
 * @param {FS} fs @returns {Promise<Settings>}
 */
export async function loadSettings(fs) {
  const saved = await readJSON(fs, 'settings.json', null)
  const settings = { ...DEFAULT_SETTINGS, ...saved ?? {}, format: /** @type {2} */ (2) }
  if ((saved?.format ?? 2) > 1) return settings
  const now = (/** @type {string} */ id) => (id === 'routines' ? 'skills' : id)
  return { ...settings, unlocked: settings.unlocked.map(now), offers: Object.fromEntries(Object.entries(settings.offers).map(([id, when]) => [now(id), when])) }
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
 * A project folder, `projects/<ulid>-<slug>`, and its project.md: front matter (format, name,
 * colour, default for the home project, cloud: false to keep it on this device) and a body.
 * @typedef {{ dir: string, id: string, data: FrontMatter, body: string }} Project
 */

/** Every project, oldest first (folders start with a ULID). @param {FS} fs @returns {Promise<Project[]>} */
export async function listProjects(fs) {
  /** @type {Project[]} */
  const projects = []
  for (const entry of await fs.list('projects')) {
    const text = entry.kind === 'directory' ? await fs.read(`projects/${entry.name}/project.md`) : null
    if (text) projects.push({ dir: `projects/${entry.name}`, id: entry.name.slice(0, 26), ...parseFrontMatter(text) })
  }
  return projects
}

/**
 * @param {FS} fs @param {{ name: string, by: string, colour?: string, home?: boolean, now?: Date }} options
 * @returns {Promise<string>} its folder
 */
export async function createProject(fs, { name, by, colour, home = false, now = new Date() }) {
  const dir = `projects/${ulid(now.getTime())}-${home ? 'home' : slug(name) || 'project'}`
  const data = { format: 1, ...(home && { default: true }), name, ...(colour && { colour }), createdAt: now.toISOString(), by }
  await fs.write(`${dir}/project.md`, stringifyFrontMatter(data, ''))
  return dir
}

/**
 * The default project, created on first run. Invisible until projects are discovered.
 * @param {FS} fs @param {{ by: string, name?: string }} options
 */
export async function ensureHome(fs, { by, name = 'Home' }) {
  return (await listProjects(fs)).find((project) => project.data.default === true)?.dir ?? createProject(fs, { name, by, home: true })
}

/** Lower-case Latin letters, digits and single hyphens, for folder names: "Été à Paris!" → "ete-a-paris". @param {string} text */
export const slug = (text) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64).replace(/-$/, '')

/**
 * @typedef {string | number | boolean | null} Scalar
 * @typedef {Record<string, any>} FrontMatter  scalars, and maps of scalars one level deep
 */

/**
 * Minimal front matter: `key: value` scalars between --- lines, and maps one level deep
 * (`key:` then indented `key: value` lines).
 * @param {string} text
 * @returns {{ data: FrontMatter, body: string }}
 */
export function parseFrontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'))
  if (!match) return { data: {}, body: text }
  /** @type {FrontMatter} */
  const data = {}
  /** @type {Record<string, Scalar> | null} */
  let map = null
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':')
    if (at < 1) continue
    const key = line.slice(0, at).trim()
    const raw = line.slice(at + 1).trim()
    if (map && /^\s/.test(line)) map[key] = scalar(raw)
    else if (raw) [data[key], map] = [scalar(raw), null]
    else data[key] = map = {}
  }
  return { data, body: match[2] }
}

/** @param {string} raw @returns {Scalar} */
function scalar(raw) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null' || raw === '') return null
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  if (/^".*"$/.test(raw)) return JSON.parse(raw)
  return raw
}

/** Quoted when it would read as something else. @param {Scalar} value */
const yaml = (value) => (typeof value === 'string' && /[:#"'\n]|^\s|\s$|^$|^(true|false|null|-?\d+(\.\d+)?)$/.test(value) ? JSON.stringify(value) : value)

/** @param {FrontMatter} data @param {string} body */
export function stringifyFrontMatter(data, body) {
  const lines = Object.entries(data).map(([key, value]) => (value && typeof value === 'object'
    ? [`${key}:`, ...Object.entries(value).map(([name, item]) => `  ${name}: ${yaml(item)}`)].join('\n')
    : `${key}: ${yaml(value)}`))
  return `---\n${lines.join('\n')}\n---\n${body}`
}
