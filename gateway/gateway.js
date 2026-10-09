// The gateway (D191): what lets Jean reach the services a browser can't, without a Jean server.
// Whoever serves Jean, an organisation or a person runs it, and names it in settings or policy
// (`urls.gateway`). It relays a request to a host it allows, without the browser's origin or
// cookies, and answers Jean's origins with CORS. For a sign-in server that only accepts apps it
// registered, it holds that app: Jean signs in with its client id, and the gateway adds the secret
// where the code is traded for tokens, so the secret never reaches a browser. It keeps nothing.
//
//   GET <gateway>                  what it serves: { format: 1, hosts, clients: { <issuer>: <client id> } }
//   any <gateway>?url=<address>    the request, relayed to that address
//
// Its configuration, a JSON object in GATEWAY_CONFIG (never a file beside it: Jean's folder is served as it is):
//   origins  the addresses Jean is served from, e.g. ["https://jean.example"]
//   hosts    the hosts it relays to; a name covers its subdomains ("googleapis.com"). Left out: those
//            of every service Jean knows that a browser can't reach, their sign-ins included (D214)
//   clients  apps registered with sign-in servers, e.g. Google's:
//            [{ "issuer": "https://accounts.google.com", "tokenEndpoint": "https://oauth2.googleapis.com/token",
//               "clientId": "…", "clientSecret": "…", "auth": "post" }]   auth: "post" (the default) or "basic"
//
// Web-standard (fetch, Request, Response), with nothing to install: `node gateway/serve.js` runs it
// on Node; Cloudflare Workers, `deno serve` and Bun take this module as it is. Requests carry at
// most 10 MB; answers stream through.

const LIMIT = 10_000_000
// What a request keeps on its way: what it is and who it is for, never where it comes from.
const KEPT = /^(accept|content-type|authorization|last-event-id|mcp-[\w-]+)$/i
const ANSWERED = ['content-type', 'cache-control', 'mcp-session-id', 'mcp-protocol-version', 'www-authenticate', 'retry-after']
// The servers and sign-ins of the services Jean knows that a browser can't reach
// (caps/connections/directory.js): those that register Jean need nothing more, the others an app in `clients`.
export const SERVICES = Object.freeze(['googleapis.com', 'accounts.google.com', 'microsoft365.mcp.claude.com', 'login.microsoftonline.com', 'slack.com', 'dropbox.com', 'dropboxapi.com',
  'figma.com', 'asana.com', 'zoom.us', 'hubspot.com', 'box.com', 'monday.com', 'airtable.com', 'calendly.com', 'otter.ai', 'gamma.app', 'zapier.com', 'todoist.com', 'todoist.net'])

/**
 * @typedef {{ issuer: string, tokenEndpoint: string, clientId: string, clientSecret: string, auth?: 'post' | 'basic' }} Client
 * @typedef {{ origins?: string[], hosts?: string[], clients?: Client[] }} Config
 */

/** HTTPS, or HTTP on this computer, to a host the list covers. @param {string[]} hosts @param {URL} url */
export const covers = (hosts, url) => (url.protocol === 'https:' || (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)))
  && hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))

/** @param {string} text */
const parse = (text) => { try { return new URL(text) } catch { return null } }

/** @param {Config} config @returns {(request: Request) => Promise<Response>} */
export function gateway({ origins = [], hosts = [...SERVICES], clients = [] }) {
  return async (request) => {
    const origin = request.headers.get('origin') ?? ''
    const cors = new Headers({ vary: 'origin' })
    if (origins.includes(origin)) cors.set('access-control-allow-origin', origin)
    const target = new URL(request.url).searchParams.get('url')
    if (!target) return Response.json({ format: 1, hosts, clients: Object.fromEntries(clients.map((client) => [client.issuer, client.clientId])) }, { headers: cors })
    const refuse = (/** @type {number} */ status, /** @type {string} */ error) => Response.json({ error }, { status, headers: cors })
    // Only Jean, from where it is served: a browser always says where a cross-origin request comes from.
    if (!cors.has('access-control-allow-origin')) return refuse(403, 'This gateway does not serve this origin.')
    if (request.method === 'OPTIONS') {
      for (const [name, value] of [['methods', 'GET, POST, DELETE'], ['headers', request.headers.get('access-control-request-headers') ?? ''], ['max-age', '86400']]) cors.set(`access-control-allow-${name}`, value)
      return new Response(null, { status: 204, headers: cors })
    }
    let url = parse(target)
    if (!url || !covers(hosts, url)) return refuse(403, 'This gateway does not reach this address.')
    const headers = new Headers([...request.headers].filter(([name]) => KEPT.test(name)))
    let method = request.method
    /** @type {ArrayBuffer | string | undefined} */
    let body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer()
    if (body && body.byteLength > LIMIT) return refuse(413, 'This request is too large.')
    const client = method === 'POST' && body ? clients.find((one) => one.tokenEndpoint === url?.href) : undefined
    if (client && body) body = withSecret(client, new TextDecoder().decode(body), headers)
    // Redirects are followed here, and only to hosts it covers.
    let response
    for (let hops = 0; ; hops++) {
      response = await fetch(url, { method, headers, body, redirect: 'manual' })
      const location = response.status >= 300 && response.status < 400 && response.headers.get('location')
      if (!location) break
      url = new URL(location, url)
      if (hops === 4 || !covers(hosts, url)) return refuse(502, 'The service sent the request elsewhere.')
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
