// A fake mail service for local end-to-end checks of Connections (0.5), and Wikipedia's and Kiwix's stand-ins.
// Usage: node test/fixtures/fake-mail.js   (PORT=4182 by default)
//   /mcp           MCP 2026-07-28 (stateless), behind an OAuth sign-in: protected resource metadata,
//                  authorization server metadata, dynamic client registration, an authorize page
//                  that approves at once and sends the browser back, and a token endpoint (PKCE)
//   /open/mcp      the same tools, no sign-in
//   /fixed/mcp     the same tools, behind a sign-in server that can't register apps: it only
//                  knows the client `jean-test`, registered for any address (D95)
//   /closed/mcp    the same again, answering no browser (no CORS), behind a sign-in server that only
//                  knows the app `gateway-app`, whose secret a gateway holds (D191)
//   /listed/mcp    the same tools, listed to anyone but run only for someone signed in, with the
//                  first one's sign-in server, as Google's are (D193)
//   /legacy/mcp    MCP 2025-11-25: initialize, then a session (Mcp-Session-Id)
//   /search/mcp    a search service, no sign-in, with Exa's two tools: one searches the web, one reads a page (D271)
//   /wiki/{lang}/w/api.php   a few pages in the shape of Wikipedia's search API
//   /kiwix/        a Kiwix server, as test/fixtures/kiwix.js answers
//   /.well-known/agent-skills/index.json   a skills discovery index (D121): a SKILL.md, an archive
//                  with a file beside its steps, one whose digest is wrong, and one holding a script
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import { kiwix } from './kiwix.js'

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
// As Exa's: both open to the world and read-only, but only one searches.
const SEARCH_TOOLS = [
  { name: 'web_search_exa', description: 'Search the web for any topic.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'web_fetch_exa', description: 'Read a webpage in full. Use after web_search_exa.', inputSchema: { type: 'object', properties: { urls: { type: 'array' } } }, annotations: { readOnlyHint: true, openWorldHint: true } },
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

// ─── Skills from elsewhere ───

/** A tar.gz of these files. @param {Record<string, string>} files */
function targz(files) {
  const blocks = Object.entries(files).flatMap(([path, text]) => {
    const head = Buffer.alloc(512)
    head.write(path, 0)
    head.write(`${Buffer.byteLength(text).toString(8).padStart(11, '0')}\0`, 124)
    head.write('0', 156)
    head.write('ustar\x0000', 257)
    const body = Buffer.alloc(Math.ceil(Buffer.byteLength(text) / 512) * 512)
    body.write(text)
    return [head, body]
  })
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}

const skillFile = (/** @type {string} */ name, /** @type {string} */ description, /** @type {string} */ steps) => `---\nname: ${name}\ndescription: ${description}\n---\n${steps}\n`
const SKILLS = {
  'weekly-sales-report': { type: 'skill-md', description: 'Summarize the weekly sales by region from a spreadsheet, with totals.', bytes: Buffer.from(skillFile('weekly-sales-report', 'Summarize the weekly sales by region.', '# Weekly sales report\n\n1. Read the spreadsheet.\n2. Total the sales by region.\n3. Say which region grew most.')) },
  'meeting-notes': { type: 'archive', description: 'Turn meeting notes into decisions and action items, each with an owner.', bytes: targz({ 'SKILL.md': skillFile('meeting-notes', 'Meeting notes.', '# Meeting notes\n\n1. List the decisions.\n2. List the action items, each with an owner.\n3. Use references/template.md.'), 'references/template.md': '## Decisions\n\n## Action items\n' }) },
  'invoice-check': { type: 'skill-md', description: 'Check an invoice against the purchase order.', bytes: Buffer.from(skillFile('invoice-check', 'Invoices.', '# Invoice check')), wrong: true },
  'pdf-forms': { type: 'archive', description: 'Fill in PDF forms.', bytes: targz({ 'SKILL.md': skillFile('pdf-forms', 'PDF forms.', '# PDF forms\n\nRun scripts/fill.py.'), 'scripts/fill.py': 'print("filled")\n' }) },
}
const sha = (/** @type {Buffer} */ bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const INDEX = { $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json', skills: Object.entries(SKILLS).map(([name, skill]) => ({
  name, type: skill.type, description: skill.description,
  url: skill.type === 'archive' ? `/.well-known/agent-skills/${name}.tar.gz` : `/.well-known/agent-skills/${name}/SKILL.md`,
  digest: skill.wrong ? sha(Buffer.from('something else')) : sha(skill.bytes),
})) }

export function createFakeMail() {
  /** @type {Map<string, { redirect: string | null, secret?: string }>} null: any address */
  const clients = new Map([['jean-test', { redirect: null }], ['gateway-app', { redirect: null, secret: 'gateway-secret' }]])
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
    // The closed service, its sign-in included, answers no browser: only a gateway reaches it.
    const closed = url.pathname.includes('/closed')
    if (!closed) {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE')
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate')
    }
    if (req.method === 'OPTIONS') return res.end()
    // …and refuses any request that says it comes from a page, as some services do.
    if (closed && req.headers.origin) return res.writeHead(403).end()
    let body = ''
    for await (const chunk of req) body += chunk
    const json = (/** @type {number} */ status, /** @type {any} */ value, headers = {}) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(value))
    log.push(`${req.method} ${url.pathname} ${req.headers['mcp-method'] ?? ''} ${req.headers['mcp-param-email'] ?? ''}${req.headers.origin ? ` from ${req.headers.origin}` : ''}`.trim())

    // ─── Skills from elsewhere ───
    if (url.pathname === '/.well-known/agent-skills/index.json') return json(200, INDEX)
    const skill = /^\/\.well-known\/agent-skills\/([a-z-]+)(?:\/SKILL\.md|\.tar\.gz)$/.exec(url.pathname)
    if (skill && Object.hasOwn(SKILLS, skill[1])) return res.writeHead(200, { 'content-type': url.pathname.endsWith('.gz') ? 'application/gzip' : 'text/markdown' }).end(SKILLS[/** @type {keyof typeof SKILLS} */ (skill[1])].bytes)

    // ─── Signing in ───
    const fixed = /\/(fixed|closed)(\/mcp)?$/.exec(url.pathname)?.[1]
    const at = fixed ? `/${fixed}` : ''
    if (url.pathname === '/.well-known/oauth-protected-resource/listed/mcp') return json(200, { resource: `${origin}/listed/mcp`, authorization_servers: [origin], scopes_supported: ['mail.read'] })
    if (/^\/\.well-known\/oauth-protected-resource(\/fixed|\/closed)?\/mcp$/.test(url.pathname)) {
      return json(200, { resource: `${origin}${at}/mcp`, authorization_servers: [`${origin}${at}`], scopes_supported: ['mail.read'] })
    }
    if (/^\/\.well-known\/oauth-authorization-server(\/fixed|\/closed)?$/.test(url.pathname)) {
      return json(200, {
        issuer: `${origin}${at}`, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, ...(!fixed && { registration_endpoint: `${origin}/register` }),
        code_challenge_methods_supported: ['S256'], authorization_response_iss_parameter_supported: true, scopes_supported: ['mail.read', 'offline_access'],
      })
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
      const resource = [`${origin}/mcp`, `${origin}/fixed/mcp`, `${origin}/closed/mcp`, `${origin}/listed/mcp`].find((one) => one === query.resource)
      if (!client || (client.redirect ?? query.redirect_uri) !== query.redirect_uri || query.code_challenge_method !== 'S256' || !resource) return json(400, { error: 'invalid_request' })
      const code = randomUUID()
      codes.set(code, { challenge: query.code_challenge, client: query.client_id, redirect: query.redirect_uri, resource: query.resource })
      const back = new URL(query.redirect_uri)
      back.searchParams.set('code', code)
      back.searchParams.set('state', query.state)
      back.searchParams.set('iss', resource.replace(/(\/listed)?\/mcp$/, ''))
      return res.writeHead(302, { location: back.href }).end()
    }
    if (url.pathname === '/token') {
      const form = Object.fromEntries(new URLSearchParams(body))
      // An app with a secret proves it, in the form or as Basic authentication.
      const basic = /^Basic (.+)$/.exec(req.headers.authorization ?? '')?.[1]
      if (basic) [form.client_id, form.client_secret] = Buffer.from(basic, 'base64').toString().split(':').map(decodeURIComponent)
      const secret = clients.get(form.client_id)?.secret
      if (secret && form.client_secret !== secret) return json(401, { error: 'invalid_client' })
      if (form.grant_type === 'refresh_token' && form.refresh_token === 'refresh-me') return json(200, { access_token: 'renewed', token_type: 'Bearer', expires_in: 3600 })
      const grant = codes.get(form.code)
      codes.delete(form.code)
      const verified = grant && b64url(createHash('sha256').update(form.code_verifier).digest()) === grant.challenge
      if (!verified || grant.client !== form.client_id || grant.redirect !== form.redirect_uri || grant.resource !== form.resource) return json(400, { error: 'invalid_grant' })
      const token = randomUUID()
      tokens.add(token)
      return json(200, { access_token: token, token_type: 'Bearer', expires_in: 3600, refresh_token: 'refresh-me' })
    }

    // ─── A map service (D291): a style with a background and no tiles, and fonts that hold nothing ───
    if (/^\/map\/(light|dark)\.json$/.test(url.pathname)) return json(200, { version: 8, sources: {}, glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`, layers: [{ id: 'land', type: 'background', paint: { 'background-color': url.pathname.includes('dark') ? '#20262c' : '#e6edf2' } }] })
    if (url.pathname.startsWith('/map/fonts/')) return res.writeHead(200, { 'content-type': 'application/x-protobuf' }).end()

    // ─── Kiwix ───
    if (url.pathname.startsWith('/kiwix/')) {
      const answer = kiwix(url)
      return res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? '' }).end(await answer.text())
    }

    // ─── Wikipedia ───
    const wiki = /^\/wiki\/([a-z-]+)\/w\/api\.php$/.exec(url.pathname)
    if (wiki) {
      const query = String(url.searchParams.get('gsrsearch') ?? '').toLowerCase()
      const pages = PAGES.filter((page) => query.split(/\s+/).some((word) => `${page.title} ${page.extract}`.toLowerCase().includes(word)))
      return json(200, { query: { pages: pages.map((page, i) => ({ index: i + 1, title: page.title, fullurl: `https://${wiki[1]}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`, extract: page.extract })) } })
    }

    // ─── MCP ───
    if (!/^\/(open\/|legacy\/|fixed\/|closed\/|listed\/|search\/)?mcp$/.test(url.pathname)) return json(404, { error: 'not found' })
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
      const open = ['/open/mcp', '/search/mcp'].includes(url.pathname) || (url.pathname === '/listed/mcp' && message.method === 'tools/list')
      if (!open && !tokens.has(String(req.headers.authorization ?? '').replace(/^Bearer /, ''))) {
        return json(401, { error: 'unauthorized' }, { 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource${url.pathname}", scope="mail.read"` })
      }
      const version = message.params?._meta?.['io.modelcontextprotocol/protocolVersion']
      if (version !== '2026-07-28') return fail(400, -32022, 'Unsupported protocol version', { supported: ['2026-07-28'], requested: version })
      if (req.headers['mcp-protocol-version'] !== version || req.headers['mcp-method'] !== message.method) return fail(400, -32020, 'Header mismatch')
      if (message.method === 'tools/call' && req.headers['mcp-name'] !== message.params.name) return fail(400, -32020, 'Header mismatch')
    }
    if (message.method === 'tools/list') return reply({ tools: url.pathname === '/search/mcp' ? SEARCH_TOOLS : TOOLS })
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
