// Tiny static file server for development. Serves app/, what a deploy serves (D243), on 127.0.0.1.
// Usage: npm run serve            (PORT=8080 npm run serve to change the port)
//        SITE=dist/web npm run serve   what a web deploy serves, after npm run build:web (D318)
// With --gateway (npm run dev:gateway), it is the gateway too (D191), at /gateway on Jean's own
// address, and makes up the policy that sets it for Jean, as an organisation's would
// (docs/enterprise.md); Connections is still found as anywhere else (D281). GATEWAY_CONFIG may add
// its apps, or name fewer hosts.
// With --share (npm run dev:share), a share host (host/, D361) runs beside it on SHARE_PORT (8788 by
// default), an origin of its own as hst.ing is beside jean.is, for Jean opened from here, keeping its
// shares in HOST_DIR (a folder of the system's temporary one by default); its viewer draws from this
// server's own files, which any page may then read, and the policy names it, as jean.is's names
// hst.ing. Sharing is still found as anywhere else (D281). HOST_CONFIG may add to its configuration.
// With --budgets (npm run dev, dev:gateway, dev:share and start), it checks the budgets as it starts and after
// each change to app/, cli/ or budgets.json, and says as soon as one is over, still serving (D244).
// It serves examples/ too, at /examples/, to any page, so that Settings › Plugins reads the example
// plugins at http://127.0.0.1:<port>/examples/plugins/<name>/, and a folder there opened in a browser
// lists its files; a deploy never has them.
// With --home (npm run dev:home), index.html, its pages in other languages (/ja, /ar…) and home.css are
// jean.is's, its page under the app's first screen included (scripts/home.js, D397), and so are its family
// page at /family and /fr/famille and family.css (scripts/family.js, D424), and its page for IT at /enterprise and
// /fr/entreprise and enterprise.css (scripts/enterprise.js, D428), made again for each
// request from scripts/home/, at this server's own address; with --gateway or --share too (npm run
// dev:gateway -- --home), each page names their policy, as jean.is's does.
// With --csp-reports, each page's own policy (its <meta>) comes again as a report-only header that
// sends what it blocks to /csp-reports, where GET lists them: every browser says what the policy
// refused, without a hook into it (test/csp.spec.js). A `csp` cookie names whose they are.
import { execFile } from 'node:child_process'
import { createReadStream, watch } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
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
/** The share host's port, with --share; 0 without. */
const SHARE_PORT = process.argv.includes('--share') ? Number(process.env.SHARE_PORT) || 8788 : 0
/**
 * The addresses this server's policy names for Jean opened at `at` (its host and port): the gateway
 * there, the share host on the same name. @param {string} at
 */
const named = (at) => ({ ...(GATEWAY && { gateway: `http://${at}/gateway` }), ...(SHARE_PORT && { share: `http://${new URL(`http://${at}`).hostname}:${SHARE_PORT}/` }) })
/** With --home, jean.is's own pages, made as build:web makes them for it. */
const HOME = process.argv.includes('--home')
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
  '.webp': 'image/webp',
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
 * The file asked for, or the page it names without `.html`, as every server of a web deploy
 * answers (D356): /privacy is privacy.html, /caps/browser/browser that page; a file or a folder
 * of that name, as LICENSE, is itself.
 * @param {string} file  resolveRequest()'s
 */
export async function pageOf (file) {
  return extname(file) || await stat(file).catch(() => null) ? file : `${file}.html`
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
  if (HOME) {
    const made = await homePage(pathname, req.headers.host ?? `${HOST}:${PORT}`)
    if (made) return send(res, req, extname(made.path), Buffer.from(made.text))
  }
  if ((GATEWAY || SHARE_PORT) && pathname === '/policy.json') return send(res, req, '.json', Buffer.from(JSON.stringify({ urls: named(req.headers.host ?? `${HOST}:${PORT}`) })))
  const example = pathname.startsWith('/examples/')
  const asked = example ? resolveRequest(pathname.slice('/examples'.length), EXAMPLES) : resolveRequest(req.url ?? '/')
  if (!asked) return fail(res, 404, 'Not found')
  const file = example ? asked : await pageOf(asked)
  const info = await stat(file).catch(() => null)
  if (example && !info && pathname.endsWith('/')) {
    const names = await readdir(dirname(file)).catch(() => null)
    const links = names?.filter((name) => !name.startsWith('.')).map((name) => `<li><a href="${encodeURIComponent(name)}">${name}</a></li>`).join('')
    if (names) return send(res, req, '.html', Buffer.from(`<!doctype html><meta charset="utf-8"><title>${pathname}</title><h1>${pathname}</h1><ul>${links}</ul>`))
  }
  if (!info?.isFile()) return fail(res, 404, 'Not found')
  if ((GATEWAY || SHARE_PORT) && file === join(APP, 'index.html')) {
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
    ...((example || SHARE_PORT) && { 'Access-Control-Allow-Origin': '*' }),
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).on('error', () => res.destroy()).pipe(res)
}

/**
 * jean.is's page that a path names, with --home: index.html, a language's own page, the family page, the page for IT,
 * or a style sheet.
 * @param {string} pathname @param {string} at  this server's host and port, the site's address
 * @returns {Promise<{ path: string, text: string } | null>}
 */
async function homePage (pathname, at) {
  const name = pathname.replace(/^\//, '').replace(/\.html$/, '') || 'index'
  const path = name.endsWith('.css') ? name : `${name}.html`
  const brand = async () => (await import(pathToFileURL(join(ROOT, 'app', 'brand.js')).href)).BRAND
  // Its family page and its page for IT, English's at the root and other languages' under their own folder
  // (scripts/family.js, D424; scripts/enterprise.js, D428).
  const [{ familyFiles, ADDRESSES: FAMILY }, { enterpriseFiles, ADDRESSES: FOR_IT }] = await Promise.all([import('./family.js'), import('./enterprise.js')])
  if (name === 'family.css' || Object.values(FAMILY).includes(name)) return { path, text: (await familyFiles(`http://${at}/`, await brand()))[path] }
  if (name === 'enterprise.css' || Object.values(FOR_IT).includes(name)) return { path, text: (await enterpriseFiles(`http://${at}/`, await brand()))[path] }
  if (!/^[\w-]+(\.css)?$/.test(name)) return null
  const [{ homeFiles, homeLanguages, inLanguage }, { withSite }, BRAND] = await Promise.all([import('./home.js'), import('./seo.js'), brand()])
  if (name !== 'index' && name !== 'home.css' && !(await homeLanguages()).includes(name)) return null
  const index = await readFile(join(ROOT, 'app', 'index.html'), 'utf8')
  const description = /<meta name="description" content="([^"]*)">/.exec(index)?.[1] ?? ''
  const base = `http://${at}/`
  const named = GATEWAY || SHARE_PORT ? index.replace('</head>', '<meta name="app-policy" content="policy.json">\n</head>') : index
  const files = await homeFiles(base, BRAND, (said, address) => withSite(said ? inLanguage(named, said) : named, base, BRAND, said ?? description, [], address))
  return files[path] === undefined ? null : { path, text: files[path] }
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

/**
 * The share host of --share: one store, and a host for Jean at each name it is opened from here
 * (localhost or 127.0.0.1), its viewer made again once a build rewrites capabilities.json.
 */
async function shareHost () {
  const [{ host }, { folder, listener: hostListener }, { viewerOf }] = await Promise.all([import('../host/host.js'), import('../host/serve.js'), import('./host.js')])
  /** @type {import('../host/host.js').Config} */
  const config = JSON.parse(process.env.HOST_CONFIG ?? '{}')
  const dir = process.env.HOST_DIR || join(tmpdir(), 'jean-shares')
  const store = folder(dir, null)
  await store.sweep()
  /** @type {Map<string, Promise<ReturnType<typeof host>>>} */
  const made = new Map()
  /** @param {string} name */
  const make = async (name) => {
    const jean = `http://${name}:${PORT}/`
    const viewer = await viewerOf(jean, `${jean}vendor/sounds/`)
    return host({ app: jean, legal: `${jean}terms`, ...config, origins: [new URL(jean).origin, ...config.origins ?? []], viewer, render: jean, sounds: viewer.sounds, store })
  }
  /** @param {string} name */
  const hostFor = async (name) => {
    const key = `${name} ${(await stat(join(ROOT, 'app', 'capabilities.json'))).mtimeMs}`
    if (!made.has(key)) made.set(key, make(name))
    return /** @type {Promise<ReturnType<typeof host>>} */ (made.get(key))
  }
  const server = createServer(hostListener((request, client) => hostFor(new URL(request.url).hostname).then((handle) => handle(request, client)), false))
  server.on('error', (error) => {
    console.error(`serve: the share host: ${error.message}`)
    process.exit(1)
  })
  server.listen(SHARE_PORT, HOST, () => console.log(`Share host on http://${HOST}:${SHARE_PORT}/, keeping shares in ${dir}`))
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
  if (SHARE_PORT) shareHost().catch((error) => {
    console.error(`serve: the share host: ${error.message}`)
    process.exit(1)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
