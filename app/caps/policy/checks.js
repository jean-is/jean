// What policy.html checks (D415): a policy.json against what this version of Jean reads, and whether a
// site's Content-Security-Policy lets Jean reach each address it names; and the header set every deploy
// sends (deploy/README.md), which test/recipes.test.js holds the recipes to. Web-standard only, tested in Node.
import { DEFAULT_URLS } from '../../core/settings.js'
import { DEFAULT_RULES } from '../../core/rules.js'
import { PROVIDERS } from '../../core/llm.js'
import { LOCALES } from '../../core/i18n.js'

/** The headers every file goes out with, a pattern each must match, and the value the recipes send. */
export const HEADERS = /** @type {const} */ ([
  ['cache-control', /\bno-cache\b/, 'no-cache'],
  ['x-content-type-options', /^nosniff$/i, 'nosniff'],
  ['content-security-policy', /(^|[;,]\s*)frame-ancestors\s+('self'|'none')/, "frame-ancestors 'self'"],
  ['strict-transport-security', /\bmax-age=[1-9]/, 'max-age=31536000'],
])
/** The types browsers insist on, by a file's ending, and every other ending a deploy holds (deploy/README.md). */
export const TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain',
  '.md': 'text/markdown', '.csv': 'text/csv', '.xml': 'application/xml', '.zip': 'application/zip',
  '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.sf3': 'application/octet-stream',
})
/** The pages Jean links to without .html (D356), each language's (site/, D438), the check page (D274) among them. */
export const PAGES = ['privacy', 'terms', 'files', 'check', 'fr/privacy', 'fr/terms', 'fr/files']

const RULE = new Set(['allow', 'ask', 'never'])
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/

/**
 * What this version reads in policy.json, and the shape of each part (docs/enterprise.md): an object's
 * fields, `name!` when it must be there, `*` for any name; a list's item; a set of values; or a kind.
 * @typedef {string | Set<unknown> | Shape[] | { [name: string]: Shape }} Shape
 * @type {Record<string, Shape>}
 */
export const SCHEMA = {
  locale: 'locale',
  brains: [{ 'id!': 'text', 'provider!': new Set(Object.keys(PROVIDERS)), api: new Set(['openai', 'anthropic', 'device']), baseURL: 'address', model: 'text', label: 'text', headers: { '*': 'text' }, projects: ['text'], jurisdiction: 'text', auth: new Set(['oidc']), effort: new Set(['low', 'medium', 'high']) }],
  tiers: { '*': ['text'] },
  rules: Object.fromEntries([...Object.keys(DEFAULT_RULES), 'share'].map((kind) => [kind, RULE])),
  guards: [{ 'id!': 'text', kind: 'text', service: 'text', if: 'text', 'then!': new Set(['ask', 'never']), reason: 'text' }],
  capabilities: { deny: ['capability'], preUnlock: ['capability'] },
  instructions: 'text',
  urls: Object.fromEntries([...Object.keys(DEFAULT_URLS), 'render', 'sounds'].map((name) => [name, 'link'])),
  signIn: { 'issuer!': 'address', 'clientId!': 'text', scopes: ['text'] },
  connections: [{ 'id!': 'text', 'name!': 'text', 'url!': 'address', auth: new Set(['none', 'key', 'oauth']), servers: ['address'], projects: ['text'], gateway: 'flag' }],
  directory: [{ 'id!': 'text', '*': 'any' }],
  skills: { sources: ['address'], only: 'flag' },
  searches: ['text'],
  pages: { scripts: 'flag', fullscreen: 'flag', downloads: 'flag', web: 'flag', network: 'flag', maps: 'flag', sites: ['text'] },
  mapStyles: { light: 'address', dark: 'address' },
  computer: { internet: new Set(['ask', 'any', 'off']), sites: ['text'], relay: 'text', timeMs: 'number', limitMB: 'number', workspaceMB: 'number', registries: { pyodide: 'address', pypi: 'address', npm: 'address' } },
  images: { '*': ['text'] },
  films: { '*': ['text'] },
  pictureCheck: { '*': 'flag' },
  lock: new Set(['required']),
  child: 'flag',
  key: 'text',
  audit: { 'otlpEndpoint!': 'address', auth: 'any', content: 'flag', headers: { '*': 'text' }, service: 'text', person: new Set(['email', 'pseudonym']),
    trustee: { 'kty!': new Set(['EC']), 'crv!': new Set(['P-256']), 'x!': 'text', 'y!': 'text', kid: 'text', '*': 'any' } },
  retention: 'text', jurisdictions: ['text'], seal: { est: 'address', csc: 'address', credential: 'text', auth: new Set(['oidc', 'tls']) }, trust: ['text'],
}
// A group's section goes over policy as RFC 7386 has it, null taking a part away, but signs no one in (D429).
SCHEMA.groups = [{ 'id!': 'text', name: 'text', 'policy!': Object.fromEntries(Object.entries(SCHEMA).filter(([name]) => !['signIn', 'key'].includes(name))) }]

/** @typedef {[path: string, problem: string, detail?: unknown]} Problem */

/** Of names, the one a typo most likely meant: one edit away, or two for a long one. @param {string} name @param {string[]} names */
function nearest(name, names) {
  /** @param {string} a @param {string} b */
  const distance = (a, b) => {
    let row = [...Array(b.length + 1).keys()]
    for (let i = 1; i <= a.length; i++) {
      const next = [i]
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      row = next
    }
    return row[b.length]
  }
  return names.map((other) => other.replace(/!$/, '')).find((other) => other !== '*' && distance(name.toLowerCase(), other.toLowerCase()) <= (name.length > 6 ? 2 : 1))
}

/** The type each kind of value has in JSON. */
const KINDS = { text: 'string', flag: 'boolean', number: 'number', address: 'string', link: 'string', capability: 'string', locale: 'string' }
/** An address, its {placeholders} filled, or null. @param {string} address */
const parse = (address) => { try { return new URL(address.replace(/\{\w+\}/g, 'x')) } catch { return null } }

/**
 * What a policy holds that this version doesn't read, or reads otherwise, and the addresses it names.
 * @param {unknown} policy @param {string[]} [capabilities]  capabilities.json's, when known
 * @returns {{ problems: Problem[], addresses: Array<[path: string, address: string]> }}
 */
export function checkPolicy(policy, capabilities) {
  /** @type {Problem[]} */
  const problems = []
  /** @type {Array<[string, string]>} */
  const addresses = []
  /** @param {string} path @param {string} name */
  const at = (path, name) => (/^[A-Za-z_]\w*$/.test(name) ? (path ? `${path}.${name}` : name) : `${path}[${JSON.stringify(name)}]`)
  /** @param {unknown} value @param {Shape} shape @param {string} path */
  const walk = (value, shape, path) => {
    if (shape === 'any' || (value === null && /^groups\[\d+\]\.policy\./.test(path))) return
    if (shape instanceof Set) return void (shape.has(value) || problems.push([path, 'oneOf', [...shape]]))
    if (Array.isArray(shape)) return void (Array.isArray(value) ? value.forEach((item, i) => walk(item, shape[0], `${path}[${i}]`)) : problems.push([path, 'list']))
    if (typeof shape === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return void problems.push([path, 'object'])
      for (const name of Object.keys(shape)) if (name.endsWith('!') && !Object.hasOwn(value, name.slice(0, -1))) problems.push([at(path, name.slice(0, -1)), 'missing'])
      for (const [name, item] of Object.entries(value)) {
        const own = shape[name] ?? shape[`${name}!`] ?? shape['*']
        own === undefined ? problems.push([at(path, name), 'unread', nearest(name, Object.keys(shape))]) : walk(item, own, at(path, name))
      }
      return
    }
    if (typeof value !== KINDS[/** @type {keyof typeof KINDS} */ (shape)]) return void problems.push([path, shape === 'flag' || shape === 'number' ? shape : 'text'])
    if (shape === 'locale' && !LOCALES.includes(/** @type {string} */ (value))) problems.push([path, 'oneOf', LOCALES])
    if (shape === 'capability' && capabilities && !capabilities.includes(/** @type {string} */ (value))) problems.push([path, 'capability'])
    if (shape === 'address' || (shape === 'link' && /^[a-z][a-z\d+.-]*:/i.test(/** @type {string} */ (value)))) {
      const url = parse(/** @type {string} */ (value))
      if (!url || !/^(https|wss|http|ws):$/.test(url.protocol)) problems.push([path, 'address'])
      else if (/^(http|ws):$/.test(url.protocol) && !LOCAL.test(url.hostname)) problems.push([path, 'https'])
      else addresses.push([path, /** @type {string} */ (value)])
    }
  }
  walk(policy, SCHEMA, '')
  return { problems, addresses }
}

/**
 * A Content-Security-Policy header's policies, each as its directives (a header may hold several,
 * comma-separated, and a site may send several headers, which fetch joins with commas).
 * @param {string | null} header @returns {Array<Map<string, string[]>>}
 */
export const policiesOf = (header) => (header ?? '').split(',').map((policy) => new Map(policy.split(';').map((directive) => directive.trim().split(/\s+/)).filter(([name]) => name).map(([name, ...sources]) => [name.toLowerCase(), sources])))

/**
 * Whether every policy lets a page at `self` reach an address with fetch, by CSP Level 3's source
 * lists: 'self', schemes, hosts with `*.`, ports and paths; a WebSocket's address counts as its http(s) one.
 * @param {Array<Map<string, string[]>>} policies @param {string} address @param {string} self the page's own address
 */
export function allows(policies, address, self) {
  const url = parse(address)
  const page = new URL(self)
  if (!url) return false
  const to = url.protocol.replace(/^ws(s?):$/, 'http$1:').slice(0, -1)
  /** @param {string} a a source's scheme, which reaches its secure form too */
  const scheme = (a) => a === to || (a === 'http' && to === 'https') || (a === 'ws' && /^https?$/.test(to)) || (a === 'wss' && to === 'https')
  /** @param {string} source */
  const matches = (source) => {
    if (source === "'self'") return url.host === page.host && (to === page.protocol.slice(0, -1) || to === 'https')
    if (/^[a-z][a-z\d+.-]*:$/i.test(source)) return scheme(source.slice(0, -1).toLowerCase())
    const host = /^(?:([a-z][a-z\d+.-]*):\/\/)?(\*|(?:\*\.)?[^/:*]+)(?::(\*|\d+))?(\/.*)?$/i.exec(source)
    if (!host) return false
    const [, own = page.protocol.slice(0, -1), name, port, path] = host
    const named = name.toLowerCase()
    const at = url.port || (to === 'https' ? '443' : '80')
    return scheme(own.toLowerCase()) && (named === '*' || (named.startsWith('*.') ? url.hostname.endsWith(named.slice(1)) : url.hostname === named))
      && (port === undefined ? !url.port : port === '*' || port === at || (port === '80' && at === '443'))
      && (!path || (path.endsWith('/') ? url.pathname.startsWith(path) : url.pathname === path))
  }
  return policies.every((policy) => {
    const sources = policy.get('connect-src') ?? policy.get('default-src')
    return !sources || sources.some(matches)
  })
}
