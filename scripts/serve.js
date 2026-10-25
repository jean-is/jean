// Tiny static file server for development. Serves app/, what a deploy serves (D243), on 127.0.0.1.
// Usage: npm run serve            (PORT=8080 npm run serve to change the port)
//        SITE=dist/web npm run serve   what a web deploy serves, after npm run build:web (D318)
// With --gateway (npm run dev:gateway), it is the gateway too (D191), at /gateway on Jean's own
// address, and makes up the policy that sets it for Jean, as an organisation's would
// (docs/enterprise.md); Connections is still found as anywhere else (D281). GATEWAY_CONFIG may add
// its apps, or name fewer hosts. It holds jean.is's GitHub app too (D468) once GITHUB_CLIENT_SECRET
// holds its secret, which GitHub asks for where a code is traded for tokens.
// With --share (npm run dev:share), a share host (host/, D361) runs beside it on SHARE_PORT (8788 by
// default), an origin of its own as hst.ing is beside jean.is, for Jean opened from here, keeping its
// shares in HOST_DIR (a folder of the system's temporary one by default); its viewer draws from this
// server's own files, which any page may then read, and the policy names it, as jean.is's names
// hst.ing. Sharing is still found as anywhere else (D281). HOST_CONFIG may add to its configuration.
// With --budgets (npm run dev, dev:gateway, dev:share and start), it checks the budgets as it starts and after
// each change to app/, cli/ or budgets.json, and says as soon as one is over, still serving (D244); after each
// change it writes again what a build writes in app/ and git never holds (capabilities.json, the manifests),
// so the hashes a share or a saved page carries are those of the files it serves.
// It serves examples/ too, at /examples/, to any page, so that Settings › Extensions reads the example
// extensions at http://127.0.0.1:<port>/examples/extensions/<name>/, and a folder there opened in a browser
// lists its files; a deploy never has them.
// With --home (npm run dev:home), every page of site/ is jean.is's, as build:web makes them for it (D438):
// index.html with the page under the app's first screen and its pages in other languages (/ja, /ar…, D397), the
// family page, the page for IT, the comparison, the privacy policy, the terms, where files go, and their style sheets,
// made again for this server's own address once a file of site/ or app/ changes, what site/checks.js finds said here,
// and Jean alone served while they can't be made (a page of site/ half written); with
// --gateway or --share too (npm run dev:gateway -- --home), index.html names their policy, as jean.is's does. The request
// service (requests/, D446) answers /keys as on jean.is, printing each request rather than mailing it.
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
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { gateway } from '../gateway/gateway.js'
import { listener } from '../gateway/serve.js'
import { UNCOMMITTED } from './manifest.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const APP = resolve(ROOT, process.env.SITE || 'app')
const EXAMPLES = join(ROOT, 'examples')
const HOST = '127.0.0.1'
const PORT = Number(process.env.PORT) || 4173
/** GitHub's app for Jean, jean.is's (D468), whose secret only GITHUB_CLIENT_SECRET gives. */
const GITHUB = { issuer: 'https://github.com/login/oauth', tokenEndpoint: 'https://github.com/login/oauth/access_token', clientId: 'Ov23li3L3xwazOmvVYJc' }
/**
 * The gateway's configuration, with GitHub's app once its secret is given, unless it holds one for GitHub already.
 * @param {import('../gateway/gateway.js').Config} config
 */
function withGitHub (config) {
  const secret = process.env.GITHUB_CLIENT_SECRET
  if (!secret || config.clients?.some((client) => client.issuer === GITHUB.issuer)) return config
  return { ...config, clients: [...config.clients ?? [], { ...GITHUB, clientSecret: secret }] }
}
/** @type {import('../gateway/gateway.js').Config | null} */
const GATEWAY = process.argv.includes('--gateway') ? withGitHub(JSON.parse(process.env.GATEWAY_CONFIG ?? '{}')) : null
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
/** With --home, the request service, each request printed. */
const desk = HOME && (async () => {
  const [{ requests }, { listener: hosted }] = await Promise.all([import('../requests/requests.js'), import('../host/serve.js')])
  return hosted(/** @type {any} */ (requests({ keep: async () => {}, mail: async (mail) => console.log(`${mail.subject}\n\n${mail.text}\n`) })), false)
})()
/** What the pages' policies refused, with --csp-reports, by whose they are. @type {{ from: string, report: unknown }[] | null} */
const reports = process.argv.includes('--csp-reports') ? [] : null

/** @type {Record<string, string>} */
export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
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
  if (desk && pathname === '/keys') return (await desk)(req, res)
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
    const links = names?.filter((name) => !name.startsWith('.')).map((name) => /* html */ `<li><a href="${encodeURIComponent(name)}">${name}</a></li>`).join('')
    if (names) return send(res, req, '.html', Buffer.from(/* html */ `<!doctype html><meta charset="utf-8"><title>${pathname}</title><h1>${pathname}</h1><ul>${links}</ul>`))
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

/** What the site last said: what site/checks.js found, or why it couldn't be made, said once until it changes. */
let found = ''

/** jean.is's site as last made, for an address, until a file of site/ or app/ changes: a page asks for its style sheets too. */
let made = /** @type {{ at: string, files: Promise<Record<string, string> | null> } | null} */ (null)
let watching = false

/**
 * jean.is's page that a path names, with --home: index.html with the homepage, a language's own, any other page of
 * site/, a style sheet, or a demo's task and tour; what the site's pages must be and aren't, said in the terminal.
 * @param {string} pathname @param {string} at  this server's host and port, the site's address
 * @returns {Promise<{ path: string, text: string } | null>}
 */
async function homePage (pathname, at) {
  const name = decodeURIComponent(pathname).replace(/^\//, '').replace(/\.html$/, '') || 'index'
  if (!/^[\w-]+(\/[\w.-]+)*(\.css|\.jsonl?)?$/.test(name)) return null
  const path = /\.(css|jsonl?)$/.test(name) ? name : `${name}.html`
  if (made?.at !== at) {
    if (!watching) for (const dir of [join(ROOT, 'site'), APP]) watch(dir, { recursive: true }, () => { made = null })
    watching = true
    made = { at, files: makeSite(at) }
  }
  const text = (await made.files)?.[path]
  return text === undefined ? null : { path, text }
}

/**
 * jean.is's site, made for an address in a worker of its own each time, since Node keeps a module it imported (a
 * page's page.js among them), and what site/checks.js finds said in the terminal. A site that can't be made (a page
 * of site/ half written, as a language added to its words before its addresses) is null until a file changes, said
 * once, and Jean's own files are served meanwhile. @param {string} at
 * @returns {Promise<Record<string, string> | null>}
 */
function makeSite (at) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { at, policy: Boolean(GATEWAY || SHARE_PORT) } })
    worker.once('message', (/** @type {{ files: Record<string, string>, problems: string }} */ { files, problems }) => {
      if (problems !== found) console.warn(problems ? `site: what its pages must be and aren't (site/checks.js):\n${problems}` : 'site: every page is as it must be')
      found = problems
      resolve(files)
    })
    worker.once('error', (error) => {
      const said = `site: not made, so Jean is served without its pages until a file of site/ or app/ changes: ${error.message}`
      if (said !== found) console.error(said)
      found = said
    })
    worker.once('exit', () => resolve(null))
  })
}

/**
 * jean.is's site for an address, with what site/checks.js finds, in makeSite()'s worker.
 * @param {string} at @param {boolean} policy  whether index.html names this server's policy
 */
async function siteFor (at, policy) {
  const [{ buildSite }, { checkSite }, { inLanguage }, { withSite }, { shippedFiles }] = await Promise.all([
    import('../site/site.js'), import('../site/checks.js'), import('../site/home/page.js'), import('./seo.js'), import('./desktop.js')])
  const BRAND = (await import(pathToFileURL(join(ROOT, 'app', 'brand.js')).href)).BRAND
  const index = await readFile(join(ROOT, 'app', 'index.html'), 'utf8')
  const description = /<meta name="description" content="([^"]*)">/.exec(index)?.[1] ?? ''
  const base = `http://${at}/`
  const named = policy ? index.replace('</head>', '<meta name="app-policy" content="policy.json">\n</head>') : index
  const site = await buildSite({ brand: BRAND, base, index: (said, address) => withSite(said ? inLanguage(named, said) : named, base, BRAND, said ?? description, [], address) })
  return { files: site.files, problems: checkSite(site, { base, served: await shippedFiles(join(ROOT, 'app')) }).join('\n') }
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
 * all are met again; and after each change, the listings written again in another (D244), one run
 * at a time so the last to write read the last change, what stops them said once until it changes.
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
  let listing = false
  let again = false
  let failed = ''
  const list = () => {
    if (listing) return void (again = true)
    listing = true
    execFile(process.execPath, [join(ROOT, 'scripts', 'manifest.js'), '--listings'], (error, _, stderr) => {
      const now = error ? stderr.trim() || error.message : ''
      if (now && now !== failed) console.error(now)
      failed = now
      listing = false
      if (again) {
        again = false
        list()
      }
    })
  }
  const later = (/** @type {string | null} */ file) => {
    if (file?.startsWith('vendor') || UNCOMMITTED.includes(file ?? '')) return
    clearTimeout(timer)
    timer = setTimeout(() => { check(); list() }, 300)
  }
  for (const dir of [APP, join(ROOT, 'cli')]) watch(dir, { recursive: true }, (_, file) => later(file))
  watch(join(ROOT, 'budgets.json'), () => later(null))
  check()
}

/**
 * The share host of --share: one store, and a host for Jean at each name it is opened from here
 * (localhost or 127.0.0.1), its viewer made again each time capabilities.json is written (D244).
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
    handle(req, res).catch((error) => {
      console.error(`serve: ${req.url}: ${error?.stack ?? error}`)
      fail(res, 500, 'Server error')
    })
  })
  server.on('error', (error) => {
    console.error(`serve: ${error.message}`)
    process.exit(1)
  })
  server.listen(PORT, HOST, () => {
    console.log(`Serving ${APP} at http://${HOST}:${PORT}/${GATEWAY ? `, with the gateway at http://${HOST}:${PORT}/gateway` : ''}`)
    if (GATEWAY && !GATEWAY.clients?.some((client) => client.issuer === GITHUB.issuer)) console.log('GitHub signs in through it once GITHUB_CLIENT_SECRET holds the secret of its app (D468).')
    if (process.argv.includes('--budgets')) watchBudgets()
  })
  if (SHARE_PORT) shareHost().catch((error) => {
    console.error(`serve: the share host: ${error.message}`)
    process.exit(1)
  })
}

// In makeSite()'s worker, whose process.argv names this file too.
if (!isMainThread) parentPort?.postMessage(await siteFor(workerData.at, workerData.policy))
else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
