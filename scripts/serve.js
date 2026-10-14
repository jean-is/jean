// Tiny static file server for development. Serves app/, what a deploy serves (D243), on 127.0.0.1.
// Usage: npm run serve            (PORT=8080 npm run serve to change the port)
//        SITE=dist/web npm run serve   what a web deploy serves, after npm run build:web (D318)
// With --gateway (npm run dev:gateway), it is the gateway too (D191), at /gateway on Jean's own
// address, and makes up the policy that sets it for Jean, as an organisation's would
// (docs/enterprise.md); Connections is still found as anywhere else (D281). GATEWAY_CONFIG may add
// its apps, or name fewer hosts.
// With --budgets (npm run dev, dev:gateway and start), it checks the budgets as it starts and after
// each change to app/, cli/ or budgets.json, and says as soon as one is over, still serving (D244).
// It serves examples/ too, at /examples/, to any page, so that Settings › Plugins reads the example
// plugins at http://127.0.0.1:<port>/examples/plugins/<name>/, and a folder there opened in a browser
// lists its files; a deploy never has them.
// With --csp-reports, each page's own policy (its <meta>) comes again as a report-only header that
// sends what it blocks to /csp-reports, where GET lists them: every browser says what the policy
// refused, without a hook into it (test/csp.spec.js). A `csp` cookie names whose they are.
import { execFile } from 'node:child_process'
import { createReadStream, watch } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gateway } from '../gateway/gateway.js'
import { listener } from '../gateway/serve.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const APP = resolve(ROOT, process.env.SITE || 'app')
const EXAMPLES = join(ROOT, 'examples')
const HOST = '127.0.0.1'
const PORT = Number(process.env.PORT) || 4173
/** @type {import('../gateway/gateway.js').Config | null} */
const GATEWAY = process.argv.includes('--gateway') ? JSON.parse(process.env.GATEWAY_CONFIG ?? '{}') : null
// For Jean wherever it is opened from here: 127.0.0.1 or localhost, on this port.
const relay = GATEWAY && listener((request) => gateway({ ...GATEWAY, origins: [...GATEWAY.origins ?? [], new URL(request.url).origin] })(request))
/** What the pages' policies refused, with --csp-reports, by whose they are. @type {{ from: string, report: unknown }[] | null} */
const reports = process.argv.includes('--csp-reports') ? [] : null

/** @type {Record<string, string>} */
export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
}

/**
 * Maps a request URL to an absolute file path inside `root`, or null if the
 * path is malformed, hidden, or escapes the root.
 * @param {string} requestUrl
 * @param {string} root  absolute path without a trailing separator
 */
export function resolveRequest (requestUrl, root = APP) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0') || pathname.split('/').some((s) => s.startsWith('.'))) return null
  if (pathname.endsWith('/')) pathname += 'index.html'
  const file = normalize(join(root, pathname))
  return file.startsWith(root + sep) ? file : null
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} message
 */
function fail (res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' })
  res.end(`${message}\n`)
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handle (req, res) {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  if (relay && pathname === '/gateway') return relay(req, res)
  if (reports && pathname === '/csp-reports') return cspReports(req, res, reports)
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed')
  if (GATEWAY && pathname === '/policy.json') return send(res, req, '.json', Buffer.from(JSON.stringify({ urls: { gateway: `http://${req.headers.host}/gateway` } })))
  const example = pathname.startsWith('/examples/')
  const file = example ? resolveRequest(pathname.slice('/examples'.length), EXAMPLES) : resolveRequest(req.url ?? '/')
  if (!file) return fail(res, 404, 'Not found')
  const info = await stat(file).catch(() => null)
  if (example && !info && pathname.endsWith('/')) {
    const names = await readdir(dirname(file)).catch(() => null)
    const links = names?.filter((name) => !name.startsWith('.')).map((name) => `<li><a href="${encodeURIComponent(name)}">${name}</a></li>`).join('')
    if (names) return send(res, req, '.html', Buffer.from(`<!doctype html><meta charset="utf-8"><title>${pathname}</title><h1>${pathname}</h1><ul>${links}</ul>`))
  }
  if (!info?.isFile()) return fail(res, 404, 'Not found')
  if (GATEWAY && file === join(APP, 'index.html')) {
    return send(res, req, '.html', Buffer.from((await readFile(file, 'utf8')).replace('</head>', '<meta name="app-policy" content="policy.json">\n</head>')))
  }
  if (reports && extname(file) === '.html') {
    const page = await readFile(file)
    const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(page.toString('utf8'))?.[1]
    const from = /(?:^|; )csp=([\w-]+)/.exec(req.headers.cookie ?? '')?.[1] ?? ''
    if (policy) res.setHeader('Content-Security-Policy-Report-Only', `${policy.replaceAll('&quot;', '"')}; report-uri /csp-reports?from=${from}`)
    return send(res, req, '.html', page)
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
    ...(example && { 'Access-Control-Allow-Origin': '*' }),
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).on('error', () => res.destroy()).pipe(res)
}

/**
 * Keeps a report a page's policy sent (POST), or lists those of one `from` (GET).
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
 * @param {{ from: string, report: unknown }[]} reports
 */
async function cspReports (req, res, reports) {
  const from = new URL(req.url ?? '/', 'http://localhost').searchParams.get('from') ?? ''
  if (req.method === 'POST') {
    let body = ''
    for await (const chunk of req) body += chunk
    try { reports.push({ from, report: JSON.parse(body) }) } catch { reports.push({ from, report: body }) }
    res.writeHead(204)
    return res.end()
  }
  return send(res, req, '.json', Buffer.from(JSON.stringify(reports.filter((item) => item.from === from).map((item) => item.report))))
}

/**
 * What this server makes rather than reads: the policy, and the page that names it.
 * @param {import('node:http').ServerResponse} res @param {import('node:http').IncomingMessage} req
 * @param {string} type an extension of TYPES @param {Buffer} body
 */
function send (res, req, type, body) {
  res.writeHead(200, { 'Content-Type': TYPES[type], 'Content-Length': body.length, 'Cache-Control': 'no-cache' })
  res.end(req.method === 'HEAD' ? undefined : body)
}

/**
 * The budgets, checked in a process of their own each time (Node keeps a module it imported, the
 * prompt's included), said as Jean starts, then each time they change while one is over, and once
 * all are met again.
 */
function watchBudgets () {
  /** @type {{ text: string, over: boolean } | null} */
  let said = null
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const check = () => execFile(process.execPath, [join(ROOT, 'scripts', 'budgets.js'), '--short'], (error, stdout) => {
    const now = { text: stdout.trim(), over: Boolean(error) }
    if (!said || ((now.over || said.over) && now.text !== said.text)) (now.over ? console.error : console.log)(now.text)
    said = now
  })
  const later = (/** @type {string | null} */ file) => {
    if (file?.startsWith('vendor')) return
    clearTimeout(timer)
    timer = setTimeout(check, 300)
  }
  for (const dir of [APP, join(ROOT, 'cli')]) watch(dir, { recursive: true }, (_, file) => later(file))
  watch(join(ROOT, 'budgets.json'), () => later(null))
  check()
}

function main () {
  const server = createServer((req, res) => {
    handle(req, res).catch(() => fail(res, 500, 'Server error'))
  })
  server.on('error', (error) => {
    console.error(`serve: ${error.message}`)
    process.exit(1)
  })
  server.listen(PORT, HOST, () => {
    console.log(`Serving ${APP} at http://${HOST}:${PORT}/${GATEWAY ? `, with the gateway at http://${HOST}:${PORT}/gateway` : ''}`)
    if (process.argv.includes('--budgets')) watchBudgets()
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
