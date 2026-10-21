// Copies of Jean that Warehouse SAS hosts, each at an organisation's own address (D456): one build, the one
// `npm run deploy` puts in the hosted folder with POLICY='{}', so its index.html names policy.json, served at every
// address a registry lists, a JSON file kept apart from this repository (TENANTS). Per address, only three things
// differ: its policy.json, its Content-Security-Policy, whose connect-src is narrowed to what that policy has Jean
// reach unless people bring their own brains there (--open), and the release it is pinned to, if any. Every change
// is checked as policy.html checks a site (D415): what this version doesn't read or reads otherwise, the addresses
// the address's own header would refuse, and what ee/ says of the key there. Then it writes what the server's
// tenants/ folder holds, in dist/tenants/: a Caddyfile that the server's own imports, each address's policy.json,
// and `pinned`, the releases `npm run deploy` keeps for them. Caddy gets an address's certificate on demand, at its
// first visitor's handshake, once that Caddyfile's own ask site says the address is listed: an address can be
// listed before its CNAME exists, and a name anyone else points at the server gets none.
// Usage: TENANTS=<registry.json> npm run tenant -- add <host> [--policy <file>] [--connect <source>]… [--open] [--release <name>]
//        TENANTS=<registry.json> npm run tenant -- remove <host> | list | write
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { allows, checkPolicy, policiesOf } from '../app/caps/policy/checks.js'
import { DEFAULT_URLS } from '../app/core/settings.js'
import { PROVIDERS } from '../app/core/llm.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'dist', 'tenants')

/** The hosted folder as Caddy's container sees it: `npm run deploy`'s releases and `current`, and `tenants/`, this script's. */
export const SERVED = '/srv/hosted'
/** Where Caddy asks whether an address is listed before getting it a certificate: a site of its own, on its loopback. */
export const ASK = '127.0.0.1:8790'
/** How Caddy gets a certificate on jean.is's server: from Let's Encrypt over TLS-ALPN on 443, since port 80 is Traefik's. */
export const ACME = 'issuer acme {\n\t\t\tdisable_http_challenge\n\t\t}'

const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/
/** A release's folder, as `npm run deploy` names it (releaseName() in deploy.js). */
const RELEASE = /^\d{8}-\d{6}-[0-9a-f]{7,40}$/
/** A source connect-src may list: an origin over HTTPS or WSS, `*.` for its subdomains, or this computer over plain HTTP. */
const SOURCE = /^(?:(?:https|wss):\/\/(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+|(?:http|ws):\/\/(?:localhost|127\.0\.0\.1|\[::1\]))(?::\d{1,5})?$/
/** The parts of policy only ee/ reads, which need a key (ui/app.js). */
const ENTERPRISE = ['key', 'audit', 'retention', 'groups', 'jurisdictions', 'seal', 'trust']
/** The addresses Jean links to or shows as a picture rather than fetches, which connect-src doesn't cover. */
const SHOWN = /(?:^|\.)urls\.(?:searchPage|siteIcon|privacy|terms|files)$/

/**
 * An address the registry lists, as Caddy and a key's origins write it.
 * @typedef {{ host: string, policy: Record<string, any>, connect?: string[], release?: string }} Tenant
 * `connect`: what connect-src lets Jean reach beside its own files, or none when absent (--open).
 * `release`: the release it is pinned to, `current` when absent.
 * @typedef {{ format: 1, target?: string, tenants: Tenant[] }} Registry  `target`: the name organisations' CNAMEs point at
 */

/** An address's host as the registry keeps it, in lower case; throws for anything else, an IP, a port, a path or a wildcard. @param {unknown} name */
export function hostOf (name) {
  const host = String(name ?? '').toLowerCase()
  if (!HOST.test(host)) throw new Error(`${JSON.stringify(name ?? '')} isn't a host name, such as ai.acme.com`)
  return host
}

/**
 * The connect-src source that lets Jean reach an address: its scheme and host, a placeholder starting the host
 * (`https://{lang}.wikipedia.org/…`) read as any subdomain; null when it can't be written as one.
 * @param {string} address
 */
export function sourceOf (address) {
  const [, scheme = '', host = ''] = /^([a-z][a-z\d+.-]*):\/\/([^/?#]+)/i.exec(address) ?? []
  const source = `${scheme}://${host.replace(/^\{\w+\}\./, '*.')}`.toLowerCase()
  return SOURCE.test(source) ? source : null
}

/**
 * What a policy has Jean fetch: the addresses it names, but links and pictures, and the address of each of its
 * brains' providers where it names none.
 * @param {unknown} policy @param {Array<[string, string]>} addresses  checkPolicy()'s
 * @returns {Array<[path: string, address: string]>}
 */
export function reached (policy, addresses) {
  const brains = Array.isArray(/** @type {any} */ (policy)?.brains) ? /** @type {any[]} */ (/** @type {any} */ (policy).brains) : []
  return [
    ...addresses.filter(([path]) => !SHOWN.test(path)),
    ...brains.flatMap((brain, i) => {
      const own = !brain?.baseURL && Object.hasOwn(PROVIDERS, brain?.provider) ? PROVIDERS[/** @type {keyof typeof PROVIDERS} */ (brain.provider)].baseURL : ''
      return own ? [/** @type {[string, string]} */ ([`brains[${i}].provider`, own])] : []
    }),
  ]
}

/** The Content-Security-Policy every file at an address goes out with: the header set's, and connect-src unless open. @param {Tenant} tenant */
export const cspOf = (tenant) => `frame-ancestors 'self'${tenant.connect ? `; connect-src ${["'self'", ...tenant.connect].join(' ')}` : ''}`

/**
 * A registry entry for an address and its policy: connect-src narrowed to what the policy has Jean reach and the
 * sources given, or left open.
 * @param {unknown} name @param {Record<string, any>} policy
 * @param {{ connect?: string[], open?: boolean, release?: string }} [how]
 * @returns {Tenant}
 */
export function tenantOf (name, policy, { connect = [], open = false, release } = {}) {
  if (open && connect.length) throw new Error('--open lets Jean reach any address, so it takes no --connect')
  const host = hostOf(name)
  const derived = reached(policy, checkPolicy(policy).addresses).flatMap(([, address]) => sourceOf(address) ?? [])
  return { host, policy, ...!open && { connect: [...new Set([...derived, ...connect])] }, ...release !== undefined && { release } }
}

/** A problem checkPolicy() found, in words. @param {import('../app/caps/policy/checks.js').Problem} problem */
function said ([path, problem, detail]) {
  const words = /** @type {Record<string, string>} */ ({
    unread: `isn't read by this version${detail ? ` (${detail}?)` : ''}`,
    oneOf: `should be one of ${Array.isArray(detail) ? detail.map((value) => JSON.stringify(value)).join(', ') : ''}`,
    missing: 'is missing',
    object: 'should be an object',
    list: 'should be a list',
    text: 'should be text',
    flag: 'should be true or false',
    number: 'should be a number',
    address: 'should be an address over https or wss',
    https: 'should be over https: plain http reaches only this computer',
    capability: 'names no capability of this version',
  })[problem] ?? problem
  return `${path || 'the policy'} ${words}`
}

/**
 * What ee/ says of a policy at an address, asked through its one door as policy.html asks it there (caps/enterprise/):
 * whom the key unlocks this version for; throws, saying why not, or that ee/ is gone. The door reads the page's own
 * address, so `location` is that address while it answers; ask one address at a time.
 * @param {Record<string, any>} policy @param {string} origin
 */
export async function enterprise (policy, origin) {
  const own = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', { value: new URL(`${origin}/`), configurable: true })
  try {
    return await (await import('../app/caps/enterprise/enterprise.js')).check(policy)
  } finally {
    if (own) Object.defineProperty(globalThis, 'location', own)
    else delete (/** @type {any} */ (globalThis)).location
  }
}

/**
 * What stops an address being served, and what only warns, as policy.html would say of it there: the policy's
 * problems, its addresses that the address's own header refuses, Jean's own defaults it refuses, and ee/'s verdict.
 * @param {Tenant} tenant @param {string[]} [capabilities]  capabilities.json's, when known
 * @returns {Promise<{ problems: string[], warnings: string[] }>}
 */
export async function checkTenant (tenant, capabilities) {
  /** @type {string[]} */
  const problems = []
  /** @type {string[]} */
  const warnings = []
  const origin = `https://${tenant.host}`
  const { policy } = tenant
  try { hostOf(tenant.host) } catch (error) { problems.push(/** @type {Error} */ (error).message) }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return { problems: [...problems, 'the policy should be an object, as policy.json is'], warnings }
  const checked = checkPolicy(policy, capabilities)
  for (const problem of checked.problems) (problem[1] === 'unread' ? warnings : problems).push(said(problem))
  if (tenant.release !== undefined && !RELEASE.test(String(tenant.release))) problems.push(`release ${JSON.stringify(tenant.release)} isn't a release's folder as npm run deploy names one, such as 20261021-093000-91f6a1c3`)
  if (tenant.connect) {
    for (const source of tenant.connect) if (!SOURCE.test(source)) problems.push(`connect ${JSON.stringify(source)} isn't an origin, such as https://gateway.acme.com`)
    const csp = policiesOf(cspOf(tenant))
    for (const [path, address] of reached(policy, checked.addresses)) {
      if (!allows(csp, address, origin)) problems.push(`${path}, ${address}, is refused by the address's Content-Security-Policy: add --connect ${sourceOf(address) ?? 'with its origin'}`)
    }
    if (!tenant.connect.length && !policy.brains?.length) problems.push("Jean would reach no brain: name the organisation's in the policy, add --connect, or let people bring their own with --open")
    const refused = Object.entries(DEFAULT_URLS).filter(([name, address]) => !SHOWN.test(`urls.${name}`) && policy.urls?.[name] === undefined && address && !allows(csp, address, origin))
    if (refused.length) warnings.push(`Jean's own defaults its Content-Security-Policy refuses, unless the policy's urls name mirrors: ${refused.map(([name]) => name).join(', ')}`)
  }
  if (ENTERPRISE.some((part) => part in policy)) {
    await enterprise(policy, origin).catch((/** @type {Error} */ error) => problems.push(`ee/: ${error.message}`))
  }
  return { problems, warnings }
}

/**
 * Every address's problems and warnings, each said with its host, one address at a time.
 * @param {Registry} registry @param {string[]} [capabilities]
 */
export async function checkRegistry (registry, capabilities) {
  /** @type {string[]} */
  const problems = []
  /** @type {string[]} */
  const warnings = []
  const hosts = registry.tenants.map((tenant) => tenant.host)
  for (const host of new Set(hosts.filter((host, i) => hosts.indexOf(host) !== i))) problems.push(`${host}: listed twice`)
  for (const tenant of registry.tenants) {
    const found = await checkTenant(tenant, capabilities)
    problems.push(...found.problems.map((problem) => `${tenant.host}: ${problem}`))
    warnings.push(...found.warnings.map((warning) => `${tenant.host}: ${warning}`))
  }
  return { problems, warnings }
}

/** The registry a file holds, or an empty one where there is none yet. @param {string} file @returns {Promise<Registry>} */
export async function readRegistry (file) {
  const text = await readFile(file, 'utf8').catch((/** @type {NodeJS.ErrnoException} */ error) => { if (error.code === 'ENOENT') return null; throw error })
  if (text === null) return { format: 1, tenants: [] }
  const registry = JSON.parse(text)
  if (registry?.format !== 1 || !Array.isArray(registry.tenants)) throw new Error(`${file} isn't a registry of hosted copies: { "format": 1, "tenants": [ … ] }`)
  return registry
}

/** @param {Tenant} a @param {Tenant} b */
const byHost = (a, b) => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0)

/** The registry with an address added, or its entry replaced. @param {Registry} registry @param {Tenant} tenant @returns {Registry} */
export const withTenant = (registry, tenant) => ({ ...registry, tenants: [...registry.tenants.filter((other) => other.host !== tenant.host), tenant].sort(byHost) })

/** The registry without an address; throws when it lists none of that name. @param {Registry} registry @param {string} host @returns {Registry} */
export function withoutTenant (registry, host) {
  if (!registry.tenants.some((tenant) => tenant.host === host)) throw new Error(`${host} isn't listed`)
  return { ...registry, tenants: registry.tenants.filter((tenant) => tenant.host !== host) }
}

/**
 * The Caddyfile the server's own imports: the ask site, which answers 200 only for an address listed, what every
 * hosted copy shares, and a site for each address, its release, its policy.json and its Content-Security-Policy.
 * @param {Registry} registry @param {{ issuer?: string }} [how]  `issuer`: the tls block's, Let's Encrypt's by default
 */
export function caddyfile (registry, { issuer = ACME } = {}) {
  const listed = registry.tenants.map((tenant) => `domain=${hostOf(tenant.host)}`)
  const sites = registry.tenants.map((tenant) => `
${tenant.host} {
	import hosted ${SERVED}/${tenant.release ? `releases/${tenant.release}` : 'current'} ${SERVED}/tenants/${tenant.host}
	header Content-Security-Policy "${cspOf(tenant)}"
}
`)
  return `# Written by npm run tenant from the registry of hosted copies (D456): run it again rather than edit this file.
# The server's Caddyfile imports it, and its global options have Caddy ask this file's first site before a certificate:
#	on_demand_tls {
#		ask http://${ASK}/
#	}

# Whether Caddy may get a certificate for an address: only for one listed here.
http://${ASK} {
	bind ${ASK.split(':')[0]}
${listed.length ? `	@listed query ${listed.join(' ')}\n	respond @listed 200\n` : ''}	respond 404
}

# What every hosted copy shares: its certificate on demand, the header set, Jean's files and its own policy.json.
(hosted) {
	tls {
		on_demand
		${issuer}
	}
	header {
		Cache-Control no-cache
		X-Content-Type-Options nosniff
		Strict-Transport-Security max-age=31536000
		X-Robots-Tag noindex
	}
	# The types Caddy's image gives otherwise, or none (deploy/README.md).
	@xml path *.xml
	header @xml >Content-Type application/xml
	@bytes path *.bcmap *.pfb *.sf3
	header @bytes >Content-Type application/octet-stream
	header /LICENSE >Content-Type text/plain
	encode zstd gzip
	root * {args[0]}
	handle /policy.json {
		root * {args[1]}
		file_server
	}
	handle {
		try_files {path} {path}.html
		file_server {
			precompressed br gzip
		}
	}
}
${sites.join('')}`
}

/**
 * What the server's tenants/ folder holds, by path: the Caddyfile, each address's policy.json, and `pinned`, the
 * releases addresses are pinned to, which `npm run deploy` keeps.
 * @param {Registry} registry @param {{ issuer?: string }} [how]
 * @returns {Record<string, string>}
 */
export const outputs = (registry, how) => ({
  Caddyfile: caddyfile(registry, how),
  pinned: [...new Set(registry.tenants.flatMap((tenant) => (tenant.release ? [`releases/${tenant.release}\n`] : [])))].sort().join(''),
  ...Object.fromEntries(registry.tenants.map((tenant) => [`${tenant.host}/policy.json`, `${JSON.stringify(tenant.policy, null, 2)}\n`])),
})

/**
 * The command: changes the registry when asked, checks every address, then writes it and the server's tenants/
 * folder, or nothing at all when an address has a problem.
 * @param {string[]} args
 * @param {{ file?: string, out?: string, say?: (line: string) => void }} [where]  the registry, the folder written, where lines go
 */
export async function main (args, { file = process.env.TENANTS, out = OUT, say = console.log } = {}) {
  if (!file) throw new Error('TENANTS names the registry of hosted copies, a JSON file kept apart from this repository (TENANTS=../hosting/tenants.json)')
  const { positionals: [command, name], values } = parseArgs({ args, allowPositionals: true, options: { policy: { type: 'string' }, connect: { type: 'string', multiple: true }, open: { type: 'boolean' }, release: { type: 'string' } } })
  const before = await readRegistry(file)
  if (command === 'list') {
    for (const tenant of before.tenants) say(`${tenant.host}  ${tenant.release ?? 'current'}  ${cspOf(tenant)}`)
    return
  }
  const registry = command === 'add' ? withTenant(before, tenantOf(name, values.policy ? JSON.parse(await readFile(values.policy, 'utf8')) : {}, values))
    : command === 'remove' ? withoutTenant(before, hostOf(name))
      : command === 'write' ? before : null
  if (!registry) throw new Error('add <host> [--policy <file>] [--connect <source>]… [--open] [--release <name>], remove <host>, list or write')
  const capabilities = await readFile(join(ROOT, 'app', 'capabilities.json'), 'utf8').then((text) => Object.keys(JSON.parse(text).capabilities ?? {}), () => undefined)
  const { problems, warnings } = await checkRegistry(registry, capabilities)
  for (const warning of warnings) say(`tenant: ${warning}`)
  if (problems.length) throw new Error(`nothing written:\n  ${problems.join('\n  ')}`)
  if (registry !== before) await writeFile(file, `${JSON.stringify(registry, null, 2)}\n`)
  await rm(out, { recursive: true, force: true })
  for (const [path, text] of Object.entries(outputs(registry))) {
    await mkdir(dirname(join(out, path)), { recursive: true })
    await writeFile(join(out, path), text)
  }
  const added = command === 'add' ? registry.tenants.find((tenant) => tenant.host === hostOf(name)) : null
  if (added) say(`tenant: ${added.host} goes out with Content-Security-Policy: ${cspOf(added)}`)
  if (added) say(`tenant: its DNS: ${added.host}. CNAME ${registry.target ? `${registry.target}.` : "the server's name"}`)
  say(`tenant: ${registry.tenants.length} addresses in ${out}; copy it to the server's tenants/ folder, then reload Caddy (deploy/README.md)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`tenant: ${error.message}`)
    process.exit(1)
  })
}
