// Tiny static file server for development. Serves app/, what a deploy serves (D243), on 127.0.0.1.
// Usage: npm run serve            (PORT=8080 npm run serve to change the port)
// With --gateway (npm run dev:gateway), it is the gateway too (D191), at /gateway on Jean's own
// address, and makes up the policy that sets it for Jean, as an organisation's would
// (docs/enterprise.md); Connections is still found as anywhere else (D281). GATEWAY_CONFIG may add
// its apps, or name fewer hosts.
// With --budgets (npm run dev, dev:gateway and start), it checks the budgets as it starts and after
// each change to app/, cli/ or budgets.json, and says as soon as one is over, still serving (D244).
import { execFile } from 'node:child_process'
import { createReadStream, watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gateway } from '../gateway/gateway.js'
import { listener } from '../gateway/serve.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const APP = join(ROOT, 'app')
const HOST = '127.0.0.1'
const PORT = Number(process.env.PORT) || 4173
/** @type {import('../gateway/gateway.js').Config | null} */
const GATEWAY = process.argv.includes('--gateway') ? JSON.parse(process.env.GATEWAY_CONFIG ?? '{}') : null
// For Jean wherever it is opened from here: 127.0.0.1 or localhost, on this port.
const relay = GATEWAY && listener((request) => gateway({ ...GATEWAY, origins: [...GATEWAY.origins ?? [], new URL(request.url).origin] })(request))

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
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed')
  if (GATEWAY && pathname === '/policy.json') return send(res, req, '.json', Buffer.from(JSON.stringify({ urls: { gateway: `http://${req.headers.host}/gateway` } })))
  const file = resolveRequest(req.url ?? '/')
  if (!file) return fail(res, 404, 'Not found')
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) return fail(res, 404, 'Not found')
  if (GATEWAY && file === join(APP, 'index.html')) {
    return send(res, req, '.html', Buffer.from((await readFile(file, 'utf8')).replace('</head>', '<meta name="app-policy" content="policy.json">\n</head>')))
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).on('error', () => res.destroy()).pipe(res)
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
