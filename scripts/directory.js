// Checks the services Jean knows (caps/connections/directory.js, D95) the way a browser would
// meet them, from an origin none of them knows: can a page reach the service with a sign-in
// (CORS that lets Authorization through), find where to sign in, register itself there, and trade a
// code for tokens? One whose tools a browser can list needs none. Read-only: it asks for
// metadata and preflights, and registers nothing.
// An entry marked ready that fails, or one that passes and isn't marked, is reported, and the
// command fails. Passing is not enough to mark one ready: sign in once with a real account.
// One not ready is checked through a gateway that relays to its server and sign-in hosts alone,
// as known() trusts it to (D214): it has to answer there, and its sign-in to register Jean, or
// name the sign-in server whose app the gateway holds.
// Then the default sources of skills (caps/skills/sources.js, D121): each index or repository, and
// every skill it lists, must answer a browser, match its digest or git's hashes, and at least one
// must be made of instructions.
// Usage: npm run directory
import { DIRECTORY, covers } from '../app/caps/connections/directory.js'
import { discover } from '../app/caps/connections/auth.js'
import { mcpClient, MCPError } from '../app/caps/connections/mcp.js'
import { gateway } from '../gateway/gateway.js'
import { DEFAULT_SOURCES, fetchSkill, indexURL, readIndexes, siteOf } from '../app/caps/skills/sources.js'
import { memoryFS } from '../app/core/fs.js'

const ORIGIN = 'https://jean.example'
// What Jean sends: the 2026-07-28 revision's headers first, then the 2025 session's (D87).
const MODERN = ['content-type', 'authorization', 'mcp-protocol-version', 'mcp-method', 'mcp-name']
const LEGACY = ['content-type', 'authorization', 'mcp-protocol-version', 'mcp-session-id']

/** Whether a browser would send a request with these headers from ORIGIN. @param {string} url @param {string[]} headers */
async function preflight(url, headers) {
  const res = await fetch(url, { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': headers.join(',') } }).catch(() => null)
  const origin = res?.headers.get('access-control-allow-origin')
  if (!res?.ok || (origin !== '*' && origin !== ORIGIN)) return false
  const allowed = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase().split(',').map((name) => name.trim())
  // A wildcard covers Authorization in Chromium and WebKit, though the standard leaves it out (D195).
  return headers.every((name) => allowed.includes(name) || allowed.includes('*'))
}

/** @param {import('../app/caps/connections/directory.js').Known} entry @returns {Promise<string[]>} what stands in the way */
async function check({ url }) {
  if (!url) return ['no server']
  const problems = []
  // Jean's own client asks for the tools, as a connection does before any sign-in.
  /** @type {Response | null} */
  let last = null
  const asBrowser = /** @type {typeof fetch} */ ((input, init) => fetch(input, { ...init, headers: { ...init?.headers, origin: ORIGIN } }).then((res) => (last = res)))
  const listed = await mcpClient({ url, client: { name: 'Jean', version: '0' }, fetch: asBrowser }).listTools().then(() => null, (/** @type {Error} */ error) => error)
  // One whose tools a browser can list without a sign-in is connected without one, as Jean does.
  if (!listed) {
    const origin = /** @type {Response | null} */ (last)?.headers.get('access-control-allow-origin')
    const open = (/** @type {string[]} */ headers) => headers.filter((name) => name !== 'authorization')
    if ((origin === '*' || origin === ORIGIN) && (await preflight(url, open(MODERN)) || await preflight(url, open(LEGACY)))) return problems
  }
  if (!await preflight(url, MODERN) && !await preflight(url, LEGACY)) problems.push('a browser can’t send it a sign-in (CORS)')
  const status = listed instanceof MCPError ? listed.status : undefined
  if (listed && (!(listed instanceof MCPError) || status === 403)) problems.push(`it refuses this origin (${status ?? 'no answer'})`)
  const metadata = await discover(url, { challenge: listed instanceof MCPError ? listed.challenge : null }).catch((/** @type {Error} */ error) => error)
  if (metadata instanceof Error) return [...problems, metadata.message[0].toLowerCase() + metadata.message.slice(1, -1)]
  if (!metadata.registration_endpoint) problems.push(metadata.client_id_metadata_document_supported ? 'needs a client metadata document (waits for the domain)' : 'it can’t register Jean')
  else if (!await preflight(metadata.registration_endpoint, ['content-type'])) problems.push('its registration refuses browsers')
  if (!await preflight(metadata.token_endpoint, ['content-type'])) problems.push('its token endpoint refuses browsers')
  return problems
}

/** @param {import('../app/caps/connections/directory.js').Known} entry @returns {Promise<string[]>} what stands in the way through a gateway */
async function throughGateway({ url, signIn = [], app }) {
  if (!url) return ['no server']
  const hosts = [new URL(url).hostname, ...signIn]
  const handle = gateway({ origins: [ORIGIN], hosts })
  const relayed = /** @type {typeof fetch} */ ((input, init) => {
    const at = new URL('https://gateway.example/')
    at.searchParams.set('url', String(input))
    return handle(new Request(at, { ...init, headers: { ...init?.headers, origin: ORIGIN } }))
  })
  const listed = await mcpClient({ url, client: { name: 'Jean', version: '0' }, fetch: relayed }).listTools().then(() => null, (/** @type {Error} */ error) => error)
  if (listed && !(listed instanceof MCPError && listed.auth)) return [`it doesn’t answer (${listed instanceof MCPError ? listed.status : listed.message})`]
  const metadata = await discover(url, { challenge: listed instanceof MCPError ? listed.challenge : null, fetch: relayed }).catch((/** @type {Error} */ error) => error)
  if (metadata instanceof Error) return [metadata.message[0].toLowerCase() + metadata.message.slice(1, -1)]
  const problems = []
  if (app && app !== metadata.issuer) problems.push(`its sign-in server is ${metadata.issuer}, not ${app}`)
  if (!app && !metadata.registration_endpoint) problems.push(`it can’t register Jean: name the app its sign-in takes (${metadata.issuer})`)
  for (const endpoint of [metadata.token_endpoint, !app && metadata.registration_endpoint]) {
    if (endpoint && !covers(hosts, new URL(endpoint))) problems.push(`its sign-in is also at ${new URL(endpoint).hostname}`)
  }
  return problems
}

/**
 * A GET as a browser makes it from ORIGIN: every hop of a redirect has to allow the origin.
 * @param {string} url @returns {Promise<Response | string>} the response, or what stood in the way
 */
async function browserGet(url) {
  for (let hops = 0; hops < 5; hops++) {
    const res = await fetch(url, { headers: { origin: ORIGIN }, redirect: 'manual' }).catch(() => null)
    if (!res) return 'no answer'
    const origin = res.headers.get('access-control-allow-origin')
    if (origin !== '*' && origin !== ORIGIN) return `no CORS (${new URL(url).host})`
    if (res.status < 300 || res.status >= 400) return res.ok ? res : `answered ${res.status}`
    url = new URL(res.headers.get('location') ?? '', url).href
  }
  return 'too many redirects'
}

/** fetch as a browser makes it from ORIGIN, which fails where browserGet stops. @param {string | URL | Request} url */
const asBrowser = async (url) => {
  const res = await browserGet(String(url))
  if (typeof res === 'string') throw new Error(res)
  return res
}

/**
 * On a terminal, how far a check has got, on one line rewritten in place; empty clears it for the
 * result. Elsewhere (a pipe, CI), nothing. @param {string} text
 */
const progress = (text) => process.stdout.isTTY && process.stdout.write(`\r\x1b[2K${text.slice(0, process.stdout.columns - 1)}`)

let mismatches = 0
for (const entry of DIRECTORY) {
  const problems = await check(entry)
  const works = !problems.length
  const relayed = entry.ready || !entry.url ? null : await throughGateway(entry)
  const mismatch = works !== Boolean(entry.ready) || Boolean(relayed?.length)
  mismatches += Number(mismatch)
  const gateway = !relayed ? '' : ` · through a gateway: ${relayed.join('; ') || (entry.app ? `with the app of ${entry.app}` : 'reachable')}`
  console.log(`${mismatch ? '✗' : ' '} ${entry.name.padEnd(16)} ${(entry.ready ? 'ready' : 'not yet').padEnd(8)} ${works ? 'reachable from a browser' : problems.join('; ')}${gateway}`)
}

console.log('\nSources of skills')
for (const address of DEFAULT_SOURCES) {
  const url = indexURL(address)
  const name = siteOf(url).padEnd(48)
  progress(`  ${name} reading it…`)
  const [{ skills: entries, error }] = await readIndexes(memoryFS(), [url], { fetch: /** @type {typeof fetch} */ (asBrowser) })
  if (error) {
    mismatches++
    progress('')
    console.log(`✗ ${name} ${error}`)
    continue
  }
  /** @type {Record<string, string[]>} */
  const verdicts = {}
  for (const [i, entry] of entries.entries()) {
    progress(`  ${name} ${i + 1}/${entries.length} skills: ${entry.name}…`)
    const verdict = await fetchSkill(entry, /** @type {typeof fetch} */ (asBrowser)).then(() => 'can be added', (/** @type {any} */ error) => error.code ?? error.message)
    ;(verdicts[verdict] ??= []).push(entry.name)
  }
  const added = verdicts['can be added']?.length ?? 0
  mismatches += Number(!added)
  progress('')
  console.log(`${added ? ' ' : '✗'} ${name} ${entries.length} skills: ${Object.entries(verdicts).map(([verdict, names]) => `${names.length} ${verdict}`).join(', ')}`)
}
console.log(mismatches ? `\n${mismatches} entries disagree with their checks.` : '\nEvery entry agrees with its checks. Sign in once to each ready service before shipping.')
process.exitCode = mismatches ? 1 : 0
