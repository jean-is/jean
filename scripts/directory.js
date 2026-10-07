// Checks the services Jean knows (caps/connections/directory.js, D95) the way a browser would
// meet them, from an origin none of them knows: can a page reach the service with a sign-in
// (CORS that names Authorization), find where to sign in, register itself there, and trade a
// code for tokens? One whose tools a browser can list needs none. Read-only: it asks for
// metadata and preflights, and registers nothing.
// An entry marked ready that fails, or one that passes and isn't marked, is reported, and the
// command fails. Passing is not enough to mark one ready: sign in once with a real account.
// Then the default sources of skills (caps/skills/sources.js, D121): each index, and every skill
// it lists, must answer a browser, match its digest, and at least one must be made of instructions.
// Usage: npm run directory
import { DIRECTORY } from '../caps/connections/directory.js'
import { discover } from '../caps/connections/auth.js'
import { mcpClient, MCPError } from '../caps/connections/mcp.js'
import { DEFAULT_SOURCES, indexURL, parseIndex, unpack } from '../caps/skills/sources.js'

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
  // A wildcard never covers Authorization.
  return headers.every((name) => allowed.includes(name) || (allowed.includes('*') && name !== 'authorization'))
}

/** @param {import('../caps/connections/directory.js').Known} entry @returns {Promise<string[]>} what stands in the way */
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

let mismatches = 0
for (const entry of DIRECTORY) {
  const problems = await check(entry)
  const works = !problems.length
  const mismatch = works !== Boolean(entry.ready)
  mismatches += Number(mismatch)
  console.log(`${mismatch ? '✗' : ' '} ${entry.name.padEnd(16)} ${(entry.ready ? 'ready' : 'not yet').padEnd(8)} ${works ? 'reachable from a browser' : problems.join('; ')}`)
}

console.log('\nSources of skills')
for (const address of DEFAULT_SOURCES) {
  const url = indexURL(address)
  const res = await browserGet(url)
  const entries = typeof res === 'string' ? res : await res.json().then((json) => parseIndex(json, url)).catch((/** @type {Error} */ error) => error.message)
  if (typeof entries === 'string') {
    mismatches++
    console.log(`✗ ${address.padEnd(28)} ${entries}`)
    continue
  }
  /** @type {Record<string, string[]>} */
  const verdicts = {}
  for (const entry of entries) {
    const download = await browserGet(entry.url)
    const verdict = typeof download === 'string' ? download
      : await unpack(entry, new Uint8Array(await download.arrayBuffer())).then(() => 'can be added', (/** @type {any} */ error) => error.code ?? error.message)
    ;(verdicts[verdict] ??= []).push(entry.name)
  }
  const added = verdicts['can be added']?.length ?? 0
  mismatches += Number(!added)
  console.log(`${added ? ' ' : '✗'} ${address.padEnd(28)} ${entries.length} skills: ${Object.entries(verdicts).map(([verdict, names]) => `${names.length} ${verdict}`).join(', ')}`)
}
console.log(mismatches ? `\n${mismatches} entries disagree with their checks.` : '\nEvery entry agrees with its checks. Sign in once to each ready service before shipping.')
process.exitCode = mismatches ? 1 : 0
