// SPDX-License-Identifier: MIT
// The gateway (D191): what lets Jean reach the services a browser can't, without a Jean server.
// Whoever serves Jean, an organisation or a person runs it, and names it in settings or policy
// (`urls.gateway`). It relays a request to a host it allows, without the browser's origin or
// cookies, and answers Jean's origins with CORS. For a sign-in server that only accepts apps it
// registered, it holds that app: Jean signs in with its client id, and the gateway adds the secret
// where the code is traded for tokens, so the secret never reaches a browser. It keeps nothing.
//
//   GET <gateway>                  what it serves: { format: 1, hosts, clients: { <issuer>: <client id> }, timestamps?, logs? }
//   GET, HEAD, POST or DELETE <gateway>?url=<address>    the request, relayed to that address
//
// Its configuration, a JSON object in GATEWAY_CONFIG (never a file beside it: Jean's folder is served as it is),
// whose schema is app/schemas/gateway.schema.json:
//   origins  the addresses Jean is served from, e.g. ["https://jean.example"]
//   hosts    the hosts it relays to; a name covers its subdomains ("googleapis.com"). Left out: those
//            of every service Jean knows that a browser can't reach, their sign-ins included (D214).
//            An origin over plain HTTP, named whole ("http://ocsp.corp.example"), is relayed to as well: an
//            authority's OCSP responder or CRLs, whose answers are signed (D434)
//   clients  apps registered with sign-in servers, e.g. Google's:
//            [{ "issuer": "https://accounts.google.com", "tokenEndpoint": "https://oauth2.googleapis.com/token",
//               "clientId": "…", "clientSecret": "…", "auth": "post" }]   auth: "post" (the default) or "basic"
//   timestamps  RFC 3161 services that date Jean's certificates, which a browser can't reach, e.g. a qualified one (D276)
//   logs        public logs (Sigstore's Rekor) they may be recorded in; both are relayed to and announced
//
// Web-standard (fetch, Request, Response), with nothing to install: `node gateway/serve.js` runs it
// on Node; Cloudflare Workers, `deno serve` and Bun take this module as it is. Requests carry at
// most 10 MB; answers stream through. A redirect to another address takes no credentials with it, and
// never the app's secret: a token request goes nowhere but where it was sent.

const LIMIT = 10_000_000
// The methods it announces to browsers, and all it relays.
const METHODS = ['GET', 'HEAD', 'POST', 'DELETE']
// What a request keeps on its way: what it is and who it is for, never where it comes from.
const KEPT = /^(accept|content-type|authorization|x-subscription-token|last-event-id|mcp-[\w-]+)$/i
// What only the address it was meant for may read: a redirect to another drops it, as a browser's fetch drops Authorization.
const CREDENTIALS = /^(authorization|x-subscription-token|mcp-session-id)$/i
const ANSWERED = ['content-type', 'cache-control', 'mcp-session-id', 'mcp-protocol-version', 'www-authenticate', 'retry-after']
// The servers and sign-ins of the services Jean knows that a browser can't reach
// (caps/connections/directory.js): those that register Jean need nothing more, the others an app in `clients`.
// Microsoft's sign-in answers browsers, but only a web app held here renews for 90 days rather than one (D382).
// Then the search services a browser can't read, each on the user's key (caps/web-search/services.js, D671).
export const SERVICES = Object.freeze(['googleapis.com', 'accounts.google.com', 'login.microsoftonline.com', 'slack.com', 'githubcopilot.com', 'github.com', 'gitlab.com', 'dropbox.com',
  'dropboxapi.com', 'figma.com', 'asana.com', 'zoom.us', 'hubspot.com', 'instacart.com', 'box.com', 'monday.com', 'airtable.com', 'calendly.com', 'otter.ai', 'gamma.app', 'picsart.com', 'zapier.com', 'qonto.com', 'todoist.com',
  'todoist.net', 'ifttt.com', 'service-now.com', 'search.brave.com', 'kagi.com', 'api.tavily.com'])

/**
 * @typedef {{ issuer: string, tokenEndpoint: string, clientId: string, clientSecret: string, auth?: 'post' | 'basic' }} Client
 * @typedef {{ origins?: string[], hosts?: string[], clients?: Client[], timestamps?: string[], logs?: string[] }} Config
 */

/** HTTPS, or HTTP on this computer, to a host the list covers; or an origin it names whole. Never with a name and password in the address. @param {string[]} hosts @param {URL} url */
export const covers = (hosts, url) => !url.username && !url.password && (hosts.includes(url.origin) || (url.protocol === 'https:' || (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)))
  && hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)))

/** @param {string} text */
const parse = (text) => { try { return new URL(text) } catch { return null } }

/** A request's body, read only as far as the limit, whatever its length claims: null past it. @param {Request} request */
async function within(request) {
  if (Number(request.headers.get('content-length')) > LIMIT) return null
  const reader = request.body?.getReader()
  const parts = []
  let size = 0
  for (let part = await reader?.read(); part && !part.done; part = await reader?.read()) {
    if ((size += part.value.length) > LIMIT) return null
    parts.push(part.value)
  }
  return new Blob(parts).arrayBuffer()
}

/** @param {Config} config @returns {(request: Request) => Promise<Response>} */
export function gateway({ origins = [], hosts = [...SERVICES], clients = [], timestamps = [], logs = [] }) {
  hosts = [...hosts, ...[...timestamps, ...logs].flatMap((address) => parse(address)?.hostname ?? [])]
  return async (request) => {
    const origin = request.headers.get('origin') ?? ''
    // Whatever a service answers, it never runs as a page of this address.
    const cors = new Headers({ vary: 'origin', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'", 'referrer-policy': 'no-referrer' })
    if (origins.includes(origin)) cors.set('access-control-allow-origin', origin)
    // Jean, from its address, may reach a gateway on this computer, as it reaches the bridge (Private Network Access).
    if (origins.includes(origin) && request.headers.get('access-control-request-private-network') === 'true') cors.set('access-control-allow-private-network', 'true')
    const target = new URL(request.url).searchParams.get('url')
    if (!target) return Response.json({ format: 1, hosts, clients: Object.fromEntries(clients.map((client) => [client.issuer, client.clientId])), ...(timestamps.length && { timestamps }), ...(logs.length && { logs }) }, { headers: cors })
    const refuse = (/** @type {number} */ status, /** @type {string} */ error) => Response.json({ error }, { status, headers: cors })
    // Only Jean, from where it is served: a browser always says where a cross-origin request comes from.
    if (!cors.has('access-control-allow-origin')) return refuse(403, 'This gateway does not serve this origin.')
    if (request.method === 'OPTIONS') {
      for (const [name, value] of [['methods', 'GET, POST, DELETE'], ['headers', request.headers.get('access-control-request-headers') ?? ''], ['max-age', '86400']]) cors.set(`access-control-allow-${name}`, value)
      return new Response(null, { status: 204, headers: cors })
    }
    if (!METHODS.includes(request.method)) return refuse(405, 'This gateway does not relay this method.')
    let url = parse(target)
    if (!url || !covers(hosts, url)) return refuse(403, 'This gateway does not reach this address.')
    const headers = new Headers([...request.headers].filter(([name]) => KEPT.test(name)))
    let method = request.method
    /** @type {ArrayBuffer | string | null | undefined} */
    let body = method === 'GET' || method === 'HEAD' ? undefined : await within(request)
    if (body === null) return refuse(413, 'This request is too large.')
    const client = method === 'POST' && body ? clients.find((one) => one.tokenEndpoint === url?.href) : undefined
    if (client && body) body = withSecret(client, new TextDecoder().decode(/** @type {ArrayBuffer} */ (body)), headers)
    // Redirects are followed here, and only to hosts it covers.
    let response
    for (let hops = 0; ; hops++) {
      response = await fetch(url, { method, headers, body, redirect: 'manual' })
      const location = response.status >= 300 && response.status < 400 && response.headers.get('location')
      if (!location) break
      const next = new URL(location, url)
      if (hops === 4 || !covers(hosts, next) || (client && next.origin !== url.origin)) return refuse(502, 'The service sent the request elsewhere.')
      if (next.origin !== url.origin) for (const name of [...headers.keys()]) if (CREDENTIALS.test(name)) headers.delete(name)
      url = next
      if (response.status === 303 || (response.status < 307 && method === 'POST')) [method, body] = ['GET', undefined]
    }
    for (const name of ANSWERED) if (response.headers.has(name)) cors.set(name, /** @type {string} */ (response.headers.get(name)))
    cors.set('access-control-expose-headers', 'Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate')
    return new Response(response.body, { status: response.status, headers: cors })
  }
}

/**
 * The secret of the app the gateway holds, added to a token request that names it, as the sign-in
 * server wants it: in the form, or as Basic authentication. Any other request goes as it came.
 * @param {Client} client @param {string} text the form @param {Headers} headers
 */
function withSecret(client, text, headers) {
  const form = new URLSearchParams(text)
  if (form.get('client_id') !== client.clientId) return text
  if (client.auth === 'basic') {
    const encode = (/** @type {string} */ value) => encodeURIComponent(value).replace(/%20/g, '+')
    headers.set('authorization', `Basic ${btoa(`${encode(client.clientId)}:${encode(client.clientSecret)}`)}`)
    form.delete('client_id')
  } else form.set('client_secret', client.clientSecret)
  return form.toString()
}

/** The configuration where each host keeps it: a Worker's environment, then Deno's or Node's. @param {Record<string, any>} [env] */
const configFrom = (env) => {
  const host = /** @type {any} */ (globalThis)
  return JSON.parse(env?.GATEWAY_CONFIG ?? host.Deno?.env.get('GATEWAY_CONFIG') ?? host.process?.env.GATEWAY_CONFIG ?? '{}')
}

/** @type {((request: Request) => Promise<Response>) | null} */
let handler = null

export default {
  /** @param {Request} request @param {Record<string, any>} [env] */
  fetch: (request, env) => (handler ??= gateway(configFrom(env)))(request),
}
