// A fake mail service for local end-to-end checks of Connections (0.5), and a Wikipedia stand-in.
// Usage: node test/fixtures/fake-mail.js   (PORT=4182 by default)
//   /mcp           MCP 2026-07-28 (stateless), behind an OAuth sign-in: protected resource metadata,
//                  authorization server metadata, dynamic client registration, an authorize page
//                  that approves at once and sends the browser back, and a token endpoint (PKCE)
//   /open/mcp      the same tools, no sign-in
//   /legacy/mcp    MCP 2025-11-25: initialize, then a session (Mcp-Session-Id)
//   /wiki/{lang}/w/api.php   a few pages in the shape of Wikipedia's search API
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const EMAILS = [
  { id: '3', from: 'Margot <margot@bakery.example>', date: '2026-10-02', subject: 'Croissants for Saturday', body: 'Can you confirm the order of 120 croissants for Saturday morning? We deliver at 7.' },
  { id: '2', from: 'Billing <billing@flour.example>', date: '2026-10-01', subject: 'Invoice 2041 is due Friday', body: 'Invoice 2041 for 38 bags of flour, 912 euros, is due on Friday 4 October.' },
  { id: '1', from: 'Sam <sam@example.org>', date: '2026-09-30', subject: 'Lunch on Thursday?', body: 'Lunch on Thursday at the Italian place, 12:30?' },
]
const PAGES = [
  { title: 'Lighthouse', extract: 'A lighthouse is a tower, building, or other structure designed to emit light to serve as a navigational aid for maritime pilots at sea.' },
  { title: 'Phare du Créac’h', extract: 'The Phare du Créac’h is a lighthouse on the island of Ouessant, one of the most powerful in the world.' },
]

const TOOLS = [
  { name: 'search_emails', title: 'Search emails', description: 'The latest emails, newest first, optionally matching a query.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } } }, annotations: { readOnlyHint: true } },
  { name: 'read_email', title: 'Read an email', description: 'The whole text of one email.', inputSchema: { type: 'object', properties: { id: { type: 'string', 'x-mcp-header': 'Email' } }, required: ['id'] }, annotations: { readOnlyHint: true } },
  { name: 'send_email', title: 'Send an email', description: 'Send an email.', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'body'] } },
]

/** @param {string} name @param {any} args */
function call(name, args = {}) {
  if (name === 'search_emails') {
    const query = String(args.query ?? '').toLowerCase()
    const found = EMAILS.filter((email) => !query || `${email.subject} ${email.body} ${email.from}`.toLowerCase().includes(query)).slice(0, args.limit ?? 3)
    return { content: [{ type: 'text', text: `${found.length} emails, newest first.` }, ...found.map((email) => ({ type: 'resource_link', uri: `mail://inbox/${email.id}`, name: email.subject, description: `From ${email.from}, ${email.date}: ${email.body}` }))] }
  }
  if (name === 'read_email') {
    const email = EMAILS.find((candidate) => candidate.id === String(args.id))
    if (!email) return { content: [{ type: 'text', text: `No email ${args.id}.` }], isError: true }
    return { content: [{ type: 'resource', resource: { uri: `mail://inbox/${email.id}`, title: email.subject, mimeType: 'text/plain', text: `From: ${email.from}\nDate: ${email.date}\n\n${email.body}` } }] }
  }
  if (name === 'send_email') return { content: [{ type: 'text', text: `Sent to ${args.to}.` }] }
  return null
}

const b64url = (/** @type {Buffer} */ bytes) => bytes.toString('base64url')

export function createFakeMail() {
  /** @type {Map<string, { redirect: string }>} */
  const clients = new Map()
  /** @type {Map<string, { challenge: string, client: string, redirect: string, resource: string }>} */
  const codes = new Map()
  const tokens = new Set(['test-token'])
  /** @type {Set<string>} */
  const sessions = new Set()
  /** @type {string[]} what came in, for tests: method, path and headers that matter */
  const log = []

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const origin = url.origin
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE')
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate')
    if (req.method === 'OPTIONS') return res.end()
    let body = ''
    for await (const chunk of req) body += chunk
    const json = (/** @type {number} */ status, /** @type {any} */ value, headers = {}) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(value))
    log.push(`${req.method} ${url.pathname} ${req.headers['mcp-method'] ?? ''} ${req.headers['mcp-param-email'] ?? ''}`.trim())

    // ─── Signing in ───
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp') return json(200, { resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: ['mail.read'] })
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return json(200, { issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`, code_challenge_methods_supported: ['S256'], authorization_response_iss_parameter_supported: true, scopes_supported: ['mail.read', 'offline_access'] })
    }
    if (url.pathname === '/register') {
      const request = JSON.parse(body)
      const id = `client-${clients.size + 1}`
      clients.set(id, { redirect: request.redirect_uris[0] })
      return json(201, { ...request, client_id: id })
    }
    if (url.pathname === '/authorize') {
      const query = Object.fromEntries(url.searchParams)
      const client = clients.get(query.client_id)
      if (!client || client.redirect !== query.redirect_uri || query.code_challenge_method !== 'S256' || query.resource !== `${origin}/mcp`) return json(400, { error: 'invalid_request' })
      const code = randomUUID()
      codes.set(code, { challenge: query.code_challenge, client: query.client_id, redirect: query.redirect_uri, resource: query.resource })
      const back = new URL(query.redirect_uri)
      back.searchParams.set('code', code)
      back.searchParams.set('state', query.state)
      back.searchParams.set('iss', origin)
      return res.writeHead(302, { location: back.href }).end()
    }
    if (url.pathname === '/token') {
      const form = Object.fromEntries(new URLSearchParams(body))
      if (form.grant_type === 'refresh_token' && form.refresh_token === 'refresh-me') return json(200, { access_token: 'renewed', token_type: 'Bearer', expires_in: 3600 })
      const grant = codes.get(form.code)
      codes.delete(form.code)
      const verified = grant && b64url(createHash('sha256').update(form.code_verifier).digest()) === grant.challenge
      if (!verified || grant.client !== form.client_id || grant.redirect !== form.redirect_uri || grant.resource !== form.resource) return json(400, { error: 'invalid_grant' })
      const token = randomUUID()
      tokens.add(token)
      return json(200, { access_token: token, token_type: 'Bearer', expires_in: 3600, refresh_token: 'refresh-me' })
    }

    // ─── Wikipedia ───
    const wiki = /^\/wiki\/([a-z-]+)\/w\/api\.php$/.exec(url.pathname)
    if (wiki) {
      const query = String(url.searchParams.get('gsrsearch') ?? '').toLowerCase()
      const pages = PAGES.filter((page) => query.split(/\s+/).some((word) => `${page.title} ${page.extract}`.toLowerCase().includes(word)))
      return json(200, { query: { pages: pages.map((page, i) => ({ index: i + 1, title: page.title, fullurl: `https://${wiki[1]}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`, extract: page.extract })) } })
    }

    // ─── MCP ───
    if (!/^\/(open\/|legacy\/)?mcp$/.test(url.pathname)) return json(404, { error: 'not found' })
    if (req.method !== 'POST') return res.writeHead(405).end()
    const message = JSON.parse(body)
    const reply = (/** @type {any} */ result) => json(200, { jsonrpc: '2.0', id: message.id, result })
    const fail = (/** @type {number} */ status, /** @type {number} */ code, /** @type {string} */ text, /** @type {any} */ data) => json(status, { jsonrpc: '2.0', id: message.id ?? null, error: { code, message: text, ...(data && { data }) } })

    if (url.pathname === '/legacy/mcp') {
      if (message.method === 'initialize') {
        const session = randomUUID()
        sessions.add(session)
        res.setHeader('Mcp-Session-Id', session)
        return reply({ protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'fake-mail', version: '1' } })
      }
      // No session: a request from a newer client. An unknown one: it ended (404, as 2025-11-25 says).
      if (!req.headers['mcp-session-id']) return fail(400, -32000, 'Bad Request: No valid session ID provided')
      if (!sessions.has(String(req.headers['mcp-session-id']))) return fail(404, -32001, 'Session not found')
      if (message.method === 'notifications/initialized') return res.writeHead(202).end()
    } else {
      if (url.pathname === '/mcp' && !tokens.has(String(req.headers.authorization ?? '').replace(/^Bearer /, ''))) {
        return json(401, { error: 'unauthorized' }, { 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="mail.read"` })
      }
      const version = message.params?._meta?.['io.modelcontextprotocol/protocolVersion']
      if (version !== '2026-07-28') return fail(400, -32022, 'Unsupported protocol version', { supported: ['2026-07-28'], requested: version })
      if (req.headers['mcp-protocol-version'] !== version || req.headers['mcp-method'] !== message.method) return fail(400, -32020, 'Header mismatch')
      if (message.method === 'tools/call' && req.headers['mcp-name'] !== message.params.name) return fail(400, -32020, 'Header mismatch')
    }
    if (message.method === 'tools/list') return reply({ tools: TOOLS })
    if (message.method !== 'tools/call') return fail(404, -32601, 'Method not found')
    const result = call(message.params.name, message.params.arguments)
    if (!result) return fail(400, -32602, `Unknown tool ${message.params.name}`)
    // Calls answer as a stream: a progress note, then the result.
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } })}\n\n`)
    res.end(`data: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`)
  })
  return Object.assign(server, { log, sessions })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 4182
  createFakeMail().listen(port, '127.0.0.1', () => console.log(`Fake mail on http://127.0.0.1:${port}/mcp`))
}
