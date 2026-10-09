// settings.json, organisation policy, and the default project.
import { readJSON, writeJSON } from './fs.js'
import { ulid } from './ulid.js'

/** @import { FS, BrainConfig, RuleValue } from './types.js' */

/**
 * @typedef {Object} Settings
 * @property {1} format
 * @property {string | null} locale
 * @property {BrainConfig[]} brains
 * @property {string | null} activeBrain
 * @property {Record<string, RuleValue>} rules
 * @property {string | null} voice
 * @property {string} [name]                  what the user is called, set by them or once by Jean from a conversation; '' when they cleared it (D150)
 * @property {string[]} unlocked              capabilities discovered so far
 * @property {boolean} auto                   Auto picks the brain for each message
 * @property {boolean} cloud                  false: never send to the cloud
 * @property {Record<string, string>} offers  offer id → when the user answered it (ISO)
 * @property {boolean} [memory]               false: Jean neither notes nor reads what it noticed
 * @property {Connection[]} [connections]      services connected through MCP (their keys and tokens are secrets)
 * @property {number} [dictated]               how many times the user dictated (live conversation is offered)
 * @property {number} [cited]                  how many answers cited their sources (Double-check is offered)
 * @property {number} [browsed]                how many links from answers the user opened (the browser is offered)
 * @property {number} [stepped]                how many requests took several calls (Flows is offered, D218)
 * @property {string[]} [windowed]             sites that open in a tab of their own, not in the browser (D140)
 * @property {boolean} [terminal]             the user opened the terminal: the bar has a button for it (D166)
 * @property {{ width?: number, sizes?: Record<string, number> }} [dock]  how wide the dock is (a share of the window) and each pane's share of it, as the user set them (D144)
 * @property {{ scripts?: boolean, web?: boolean, network?: boolean, sites?: string[] }} [pages]  what a web page in the preview may do, and which sites it may reach (D143)
 * @property {Partial<Record<keyof typeof DEFAULT_URLS, string>>} [urls]  overrides of the default addresses
 * @property {import('../caps/computer/net.js').ComputerSettings} [computer]  what the Computer may reach, and where its packages come from (D162)
 * @property {string} [relay]                  the address the web is reached through, with {url} in it, when there is one (D162)
 * @property {Look} [look]                     how Jean looks, and the user's own touches (D111)
 * @property {string[]} [sources]              addresses of skills indexes, when the user changed the default list (D121)
 * @property {string[]} [meet]                 projects whose assistants meet without asking first (D224)
 */

/**
 * A look by its id (Human when absent, D174), and what the user changed over it: colours as
 * `#rrggbb`, a text size as a share of the browser's, a typeface, and their own CSS.
 * @typedef {{ id?: string, accent?: string, background?: string, size?: number, font?: string, css?: string }} Look
 */

/**
 * A service connected (D21, D87): the projects it is used in, when not every one, and whether it
 * is reached through the gateway (D191).
 * @typedef {{ id: string, name: string, url: string, auth: 'none' | 'key' | 'oauth', projects?: string[], gateway?: boolean }} Connection
 */

/**
 * Addresses of services Jean can use, each replaceable in settings and by policy
 * (`urls` in policy.json). Model weights are a provider identity, like a brain's URL (D33, D53);
 * so is Wikipedia, which web search reads in the user's language ({lang}), and where the browser looks words up.
 */
export const DEFAULT_URLS = Object.freeze({
  modelWeights: 'https://huggingface.co/', wikipedia: 'https://{lang}.wikipedia.org/w/api.php', searchPage: 'https://{lang}.wikipedia.org/w/index.php?search={query}',
  // The Computer's packages (D162): Pyodide's own builds, Python's index, JavaScript's.
  pyodide: 'https://cdn.jsdelivr.net/pyodide/v{version}/full/', pypi: 'https://pypi.org/pypi/{package_name}/json', npm: 'https://registry.npmjs.org/',
  // The gateway to the services a browser can't reach (D191): none until one is named.
  gateway: '',
  // A web source's site icon, shown with its domain on its chip (D210): none when ''.
  siteIcon: 'https://icons.duckduckgo.com/ip3/{domain}.ico',
})

/**
 * @param {keyof typeof DEFAULT_URLS} name
 * @param {Settings} settings @param {{ urls?: Record<string, string> }} [policy]
 */
export function serviceURL(name, settings, policy = {}) {
  return policy.urls?.[name] ?? settings.urls?.[name] ?? DEFAULT_URLS[name]
}

/**
 * Whether a brain or a connection is used in a project: in those it is kept to, or, kept to none,
 * in every one (D191, D194). @param {{ projects?: string[] }} item @param {string} project its id
 */
export const usedIn = (item, project) => !item.projects || item.projects.includes(project)

/** A brain that never leaves this computer (Claude Code's does, D235). @param {BrainConfig} brain */
export const isLocal = (brain) => brain.api === 'device' || brain.provider !== 'claudecode' && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(brain.baseURL)

/** @type {Settings} */
export const DEFAULT_SETTINGS = { format: 1, locale: null, brains: [], activeBrain: null, rules: {}, voice: null, unlocked: [], offers: {}, auto: true, cloud: true }

/** @param {FS} fs @returns {Promise<Settings>} */
export async function loadSettings(fs) {
  return { ...DEFAULT_SETTINGS, ...await readJSON(fs, 'settings.json', {}) }
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
 * Minimal front matter: `key: value` scalars between --- lines, `>` and `|` blocks, and maps one
 * level deep (`key:` then indented `key: value` lines).
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
  const head = match[1].replace(/^( *)([^:\n]+): *([>|])[+-]? *\n((?:\1 +\S.*\n?|\s*\n)*)/gm, (_, indent, key, style, lines) =>
    `${indent}${key}: ${JSON.stringify(lines.trim().split(/\s*\n\s*/).join(style === '>' ? ' ' : '\n'))}\n`)
  for (const line of head.split('\n')) {
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
