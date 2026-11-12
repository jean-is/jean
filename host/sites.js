// SPDX-License-Identifier: MIT
// Sites published at names of their own (D720), beside the shares: `<name>.hst.ing` for jean.is's host. Whoever runs the
// host turns it on with `sites` in its configuration; without it, none of this answers. A site is plain files anyone reads, so
// every one of them is served with the same strict header set (HEADERS), whose sandbox makes each page an opaque origin, as
// Jean's preview runs it: no cookie, no storage, no service worker, nothing that reaches another site or the shares.
//
//   GET    /v1/sites/<name>          free, taken, or refused and why; with its token (Authorization: Bearer), yours: its end and its files
//   POST   /v1/sites/<name>          the whole site's list, { files: { path: sha256 } }, with its token. A free name is claimed for that
//                                    token. It answers { need } while it lacks files, then puts the site live: files no longer listed go,
//                                    the edge is purged, the year starts again
//   PUT    /v1/sites/<name>/<path>   one file, its bytes
//   DELETE /v1/sites/<name>          takes it offline; its name then waits a year for its token alone
//   POST   /v1/sites/<name>/token    a new token in place of the one sent, { token }: a secret a device removed may keep stops there
//   POST   /v1/sites/<name>/report   a report: { words, page? }
//
// `sites` in the configuration:
//   address  a site's address, '{name}' in it: "https://{name}.hst.ing/"
//   names    words refused besides NAMES' own
//   limits   SITE's numbers, changed
//   bunny    { storage, api }: the storage zone's address, ending in /, where files go, and Bunny's API, where purges go;
//            their keys come from the environment (serve.js). Without it, files go to the host's folder, which serves them
//            itself, as in development and the tests.
//   sources  origins the header lets every site's pages take style sheets, pictures or fonts from, under the policy's own
//            names: { "style-src": ["https://fonts.googleapis.com"], "font-src": ["https://fonts.gstatic.com"], "img-src": […] },
//            each an https origin, `*.` for its subdomains, anything else refused as the host starts. Jean's preview takes
//            the same from policy.json (`sites.sources`); Bunny's edge script keeps the set it holds, so change it there too.
//
// What the host keeps of each name, beside the files, is in its store (serve.js): the hash of the token that holds it, its
// state, until when, and each file's hash and size. Web-standard, as host.js.
import { base64url, hashOf, within } from './host.js'

/** A site's limits: its bytes, a file's, its files; names a network claims a day, files it sends an hour; days a site stays up. */
export const SITE = { site: 50_000_000, file: 10_000_000, files: 500, claims: 5, puts: 2000, days: 365 }
const DAY = 86_400_000

/** What a site holds, by ending, and what it is served as: the same as Jean's own list (app/caps/sites/file.js), which a test holds it to. */
export const TYPES = /** @type {Record<string, string>} */ ({ html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', ico: 'image/x-icon', txt: 'text/plain', xml: 'application/xml', webmanifest: 'application/manifest+json' })

/**
 * Every file of every site carries these, whatever the site holds; Bunny's edge script (deploy/bunny/sites.js) adds the same,
 * which a test holds it to. `sandbox` without allow-same-origin: an opaque origin, which loads its own fonts and modules only
 * with Access-Control-Allow-Origin.
 */
export const HEADERS = Object.freeze({
  'content-security-policy': "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self'; manifest-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
  'access-control-allow-origin': '*',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'strict-transport-security': 'max-age=31536000',
})

/** The directives `sources` may add origins to, and an origin it may add: https, a host or `*.` and a domain, a port. */
export const SOURCED = ['style-src', 'img-src', 'font-src'], ORIGIN = /^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/

/**
 * The header set with the origins `sources` names added to its style-src, img-src and font-src; an error for any other
 * directive or anything that isn't an origin, which could loosen more than these. @param {Config['sources']} [sources]
 */
export function headersFor(sources) {
  if (!sources) return HEADERS
  for (const [name, origins] of Object.entries(sources)) {
    if (!SOURCED.includes(name) || !Array.isArray(origins)) throw new Error(`sites.sources names ${name}: only ${SOURCED.join(', ')}, each a list of origins`)
    const wrong = origins.find((origin) => typeof origin !== 'string' || !ORIGIN.test(origin))
    if (wrong !== undefined) throw new Error(`sites.sources["${name}"] holds ${JSON.stringify(wrong)}, which isn't an https origin such as https://fonts.gstatic.com`)
  }
  const policy = HEADERS['content-security-policy'].split('; ').map((part) => [part, ...(sources[/** @type {keyof typeof sources} */ (part.split(' ')[0])] ?? [])].join(' ')).join('; ')
  return Object.freeze({ ...HEADERS, 'content-security-policy': policy })
}

// ─── Names ───────────────────────────────────────────────────────────────────

/** Names that are the host's, Jean's, or the web's and mail's own, refused whole, as they are or written with look-alike marks. */
export const RESERVED = new Set(['jean', 'jeanis', 'jean-is', 'hst', 'hsting', 'hst-ing', 'warehouse', 's', 'share', 'shares', 'site', 'sites', 'relay', 'gateway', 'keys', 'www', 'api', 'app', 'admin',
  'abuse', 'report', 'status', 'help', 'support', 'security', 'legal', 'privacy', 'terms', 'about', 'mail', 'email', 'webmail', 'mx', 'smtp', 'imap', 'pop', 'ftp', 'ns1', 'ns2', 'dns', 'autoconfig',
  'autodiscover', 'cdn', 'static', 'assets', 'dev', 'test', 'staging', 'root', 'localhost', 'postmaster', 'hostmaster', 'webmaster', 'noreply', 'no-reply', '_psl'])
/** Brands people are deceived in the name of, refused as a word of the name. */
const BRANDS = new Set(['apple', 'icloud', 'google', 'gmail', 'youtube', 'microsoft', 'outlook', 'office', 'office365', 'hotmail', 'msn', 'amazon', 'aws', 'paypal', 'facebook', 'instagram', 'whatsapp',
  'netflix', 'spotify', 'linkedin', 'twitter', 'tiktok', 'snapchat', 'telegram', 'discord', 'ebay', 'alibaba', 'aliexpress', 'binance', 'coinbase', 'metamask', 'revolut', 'n26', 'docusign', 'dropbox',
  'adobe', 'chase', 'hsbc', 'barclays', 'santander', 'bnp', 'bnpparibas', 'creditagricole', 'societegenerale', 'lcl', 'labanquepostale', 'boursorama', 'sparkasse', 'deutschebank', 'commerzbank',
  'unicredit', 'ameli', 'impots', 'caf', 'urssaf', 'laposte', 'franceconnect', 'francetravail', 'antai', 'gouv', 'gov', 'irs', 'hmrc', 'dhl', 'fedex', 'ups', 'usps', 'chronopost', 'colissimo'])
/** Those long enough to refuse anywhere in a name, its hyphens taken out: "mypaypal", "secure-pay-pal". */
const LONG = [...BRANDS].filter((brand) => brand.length >= 6)
/** Words a deceiving page's name tends to carry, refused as a word of the name. */
const LURES = new Set(['login', 'logon', 'signin', 'connexion', 'verify', 'verification', 'password', 'passwd', 'motdepasse', 'wallet', 'recovery', 'unlock', '2fa', 'mfa', 'otp', 'banking'])

/** A name with look-alike marks read as the letters they imitate. @param {string} text */
const fold = (text) => text.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/[013457]/g, (digit) => /** @type {Record<string, string>} */ ({ 0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't' })[digit])

/**
 * Why a name can't be a site's, or '': its shape (3 to 40 of a–z, 0–9 and single hyphens inside, so no xn-- name, where
 * look-alikes in other scripts hide), a reserved name, a brand, or a lure. @param {string} name @param {string[]} [more]
 * @returns {'' | 'shape' | 'reserved' | 'brand' | 'lure'}
 */
export function refused(name, more = []) {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(name) || name.includes('--')) return 'shape'
  if (RESERVED.has(name) || RESERVED.has(fold(name)) || more.includes(name)) return 'reserved'
  const words = name.split('-'), folded = words.map(fold), whole = fold(words.join(''))
  if ([...words, ...folded].some((word) => BRANDS.has(word)) || LONG.some((brand) => whole.includes(brand))) return 'brand'
  if ([...words, ...folded].some((word) => LURES.has(word))) return 'lure'
  return ''
}

// ─── Files and pages ─────────────────────────────────────────────────────────

/** A file's path in a site as given, or null: no folder above, no hidden file, an ending a site holds. @param {string} path */
export const pathOf = (path) => (path && path.length <= 300 && !path.split('/').some((part) => !part || part === '..' || part.startsWith('.')) && TYPES[path.toLowerCase().split('.').pop() ?? ''] ? path : null)
/** The file an address of a site reaches: a folder's index.html, a page without its .html. @param {string} pathname */
export const fileAt = (pathname) => ((path) => (!path || path.endsWith('/') ? `${path}index.html` : /\.[^/]+$/.test(path) ? path : `${path}.html`))(decodeURIComponent(pathname).replace(/^\/+/, ''))
/**
 * Where an address with a page's .html or .htm, or a folder's index, goes instead, or null: `/about.html` to `/about`, `/fr/index.html`
 * to `/fr/`, as the site's links say them (tidy), so no address shows an ending. Bunny's edge script has the same, which a test holds it to.
 * @param {string} pathname
 */
export const cleanAt = (pathname) => ((match) => (match ? `${match[1]}${match[2] ?? ''}` : null))(/^(.*?)(?:(\/)index(?:\.html?)?|\.html?)$/i.exec(pathname))
/**
 * A page with its links to the site's own pages as cleanAt answers them: `about.html` as `about`, `fr/index.html` as `fr/`,
 * `index.html` as `./`, what follows `?` or `#` kept. Links elsewhere, and words that only show a link, stay as they are. @param {string} text
 */
export const tidy = (text) => text.replace(/(<[a-z][^<>]*?\shref\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+))/gi, (whole, before, double, single, bare) => {
  const link = double ?? single ?? bare, [, path = '', rest = ''] = /^([^?#]*)(.*)$/s.exec(link) ?? []
  if (/^([a-z][\w+.-]*:|\/\/)/i.test(link) || !/\.html?$|(^|\/)index$/i.test(path)) return whole
  const quote = double !== undefined ? '"' : single !== undefined ? "'" : ''
  return `${before}${quote}${path.replace(/(^|\/)index(\.html?)?$|\.html?$/i, '$1') || './'}${rest}${quote}`
})
/** A site's address. @param {string} address @param {string} name */
export const addressOf = (address, name) => address.replace('{name}', name)

/**
 * What a page asks for that a site may not, or '': a password, a card, or a form sent somewhere of its own. The policy stops
 * every other way out. @param {string} text @returns {'' | 'password' | 'card' | 'action'}
 */
export function unfit(text) {
  if (/<input\b[^>]*\btype\s*=\s*["']?password\b/i.test(text)) return 'password'
  if (/\bautocomplete\s*=\s*["']?cc-/i.test(text) || /<input\b[^>]*\bname\s*=\s*["']?(card|cc-?num|cvv|cvc)/i.test(text)) return 'card'
  if (/<form\b[^>]*\saction\s*=/i.test(text)) return 'action'
  return ''
}

/** The page a site taken down shows in its place. */
export const GONE = /* html */ `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Taken down</title>
<p>This site was taken down.</p><p lang="fr">Ce site a été retiré.</p>`

/**
 * What the host keeps of a name: the hash of its token, its state, until when, its files.
 * @typedef {{ format: 1, token: string, state: 'claimed' | 'live' | 'ended' | 'removed', expires: string, files: Record<string, { hash: string, size: number }>, published?: string, removed?: string }} Held
 * Where the host keeps names (serve.js's folder).
 * @typedef {{ held(name: string): Promise<Held | null>, hold(name: string, held: Held): Promise<void>, forget(name: string): Promise<void>, names(): Promise<string[]>,
 *   report(text: string): Promise<void>, record(text: string): Promise<void> }} Names
 * Where a site's files go, and how the edge forgets them; `read` where the host serves them itself.
 * @typedef {{ put(name: string, path: string, bytes: Uint8Array, type: string): Promise<void>, drop(name: string, path: string): Promise<void>, purge(name: string): Promise<void>,
 *   read?(name: string, path: string): Promise<Uint8Array | null> }} Files
 * @typedef {{ address: string, names?: string[], limits?: Partial<typeof SITE>, bunny?: { storage: string, api: string }, sources?: Partial<Record<'style-src' | 'img-src' | 'font-src', string[]>> }} Config
 */

/** A file's SHA-256, as the host and Jean name it. @param {Uint8Array} bytes */
export const digest = async (bytes) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes))))

/**
 * Files in a Bunny storage zone, each name a folder, purged through Bunny's API: the edge serves them, never the host.
 * @param {{ storage: string, api: string }} where @param {{ storageKey: string, apiKey: string }} keys @param {string} address
 * @returns {Files}
 */
export function bunny({ storage, api }, { storageKey, apiKey }, address) {
  const at = (/** @type {string} */ name, /** @type {string} */ path) => `${storage}${name}/${path.split('/').map(encodeURIComponent).join('/')}`
  const call = async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
    const response = await fetch(url, init)
    if (!response.ok && response.status !== 404) throw new Error(`Bunny answered ${response.status} to ${init.method} ${new URL(url).pathname}`)
  }
  return {
    // The Storage API keeps a file's type only from Override-Content-Type, and checks its SHA-256.
    put: async (name, path, bytes, type) => call(at(name, path), { method: 'PUT', body: /** @type {BodyInit} */ (bytes), headers: { AccessKey: storageKey, 'override-content-type': type,
      checksum: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes))), (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase() } }),
    drop: (name, path) => call(at(name, path), { method: 'DELETE', headers: { AccessKey: storageKey } }),
    purge: (name) => call(`${api}purge?${new URLSearchParams({ url: `${addressOf(address, name)}*`, async: 'false' })}`, { method: 'POST', headers: { AccessKey: apiKey } }),
  }
}

/**
 * Sites that have ended: a claim never published goes after its day, a site after its year, its name then held a year for its
 * token, then free. Taken down stays taken down. @param {Names} names @param {Files} files @param {number} [now]
 */
export async function sweepSites(names, files, now = Date.now()) {
  for (const name of await names.names()) {
    const held = await names.held(name)
    if (!held || held.state === 'removed' || Date.parse(held.expires) > now) continue
    for (const path of Object.keys(held.files)) await files.drop(name, path)
    if (held.state === 'live') {
      await names.hold(name, { ...held, state: 'ended', files: {}, expires: new Date(now + SITE.days * DAY).toISOString() })
      await files.purge(name)
    } else await names.forget(name)
  }
}

/** A site taken down: its files gone, a page saying so in their place, its name never free again. @param {string} name @param {Names} names @param {Files} files */
export async function takeDown(name, names, files) {
  const held = await names.held(name)
  for (const path of Object.keys(held?.files ?? {})) await files.drop(name, path)
  await files.put(name, 'index.html', new TextEncoder().encode(GONE), TYPES.html)
  await names.hold(name, { format: 1, token: held?.token ?? '', state: 'removed', expires: '', removed: new Date().toISOString(), files: {} })
  await files.purge(name)
  await names.record(JSON.stringify({ at: new Date().toISOString(), site: name, operation: 'take-down' }))
}

/**
 * A site's file as the host serves it itself, where its files are in its folder: under the header set, or 404.
 * @param {Files} files @param {string} name @param {URL} url @param {Readonly<Record<string, string>>} [set] the header set, its sources added
 */
export async function serveSite(files, name, url, set = HEADERS) {
  const headers = { ...set, 'cache-control': 'no-cache' }, clean = cleanAt(url.pathname)
  if (clean !== null) return new Response(null, { status: 301, headers: { ...headers, location: clean } })
  const path = fileAt(url.pathname)
  const bytes = pathOf(path) && await files.read?.(name, path)
  if (!bytes) return new Response('Nothing is here.', { status: 404, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } })
  const type = TYPES[path.toLowerCase().split('.').pop() ?? '']
  return new Response(/** @type {BodyInit} */ (bytes), { headers: { ...headers, 'content-type': /^text\/|xml|javascript|svg|manifest/.test(type) ? `${type}; charset=utf-8` : type } })
}

/** The name of the site an address is on, as the configuration's address writes it, or null. @param {URL} url @param {string} address */
export function siteAt(url, address) {
  const model = new URL(addressOf(address, 'x'))
  const [label, ...rest] = url.hostname.split('.')
  return url.port === model.port && rest.join('.') === model.hostname.slice(2) && !refused(label) ? label : null
}

/**
 * The host's routes for sites.
 * @param {Config} config @param {Names} names @param {Files} files
 * @returns {(request: Request, url: URL, at: { ours: boolean, now: number, network: string, spend: (kind: 'writes' | 'reports' | 'puts') => boolean, inTurn: <T>(id: string, task: () => Promise<T>) => Promise<T>,
 *   answer: (status: number, body?: object) => Response, client: { address: string, port: number, protocol?: string } }) => Promise<Response>}
 */
export function publishing(config, names, files) {
  const limits = { ...SITE, ...config.limits }
  /** New names each network claimed today. @type {Map<string, { from: number, count: number }>} */
  const claims = new Map()
  return async (request, url, { ours, now, network, spend, inTurn, answer, client }) => {
    const [, name = '', rest = ''] = /^\/v1\/sites\/([^/]+)(?:\/(.+))?$/.exec(url.pathname) ?? []
    const why = refused(name, config.names)
    /** What the host holds of the name, unless it has ended. @param {Held | null} held */
    const live = (held) => (held && (held.state === 'removed' || Date.parse(held.expires) > now) ? held : null)
    const token = /^Bearer ([\w-]{43})$/.exec(request.headers.get('authorization') ?? '')?.[1]
    const tokenHash = token ? await hashOf(token) : ''
    const record = (/** @type {string} */ operation) => names.record(JSON.stringify({ at: new Date(now).toISOString(), address: client.address, port: client.port, protocol: client.protocol ?? '', site: name, operation }))
    const address = addressOf(config.address, name)

    if (rest === 'report') {
      if (request.method !== 'POST') return answer(405, { error: 'Send a report.' })
      if (spend('reports')) return answer(429, { error: 'Too many reports. Try again later.' })
      const bytes = await within(request, 20_000)
      if (!bytes) return answer(413, { error: 'This report is too long.' })
      /** @type {{ words?: unknown, page?: unknown }} */
      let said = {}
      try { said = JSON.parse(new TextDecoder().decode(bytes)) } catch {}
      await names.report(JSON.stringify({ at: new Date(now).toISOString(), site: name, words: String(said.words ?? '').slice(0, 5000), ...(typeof said.page === 'string' && { page: said.page.slice(0, 300) }) }))
      return answer(202, {})
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && !rest) {
      if (why) return answer(200, { state: 'refused', why })
      const held = live(await names.held(name))
      if (!held) return answer(200, { state: 'free', address })
      if (held.state !== 'removed' && held.token === tokenHash) return answer(200, { state: 'yours', live: held.state === 'live', address, expires: held.expires, files: Object.fromEntries(Object.entries(held.files).map(([path, file]) => [path, file.hash])) })
      return answer(200, { state: 'taken' })
    }

    // A change: from the Jeans the host serves, with the name's token.
    if (!ours) return answer(403, { error: 'This host does not serve this origin.' })
    if (!token) return answer(401, { error: 'A write token is needed.' })
    if (why) return answer(403, { error: 'This name can’t be a site’s.', why })
    /** The name's token holds it now: what it holds, or an answer saying it doesn't. @param {Held | null} held */
    const mine = (held) => (!held ? answer(404, { error: 'Nothing is published at this name.' }) : held.state === 'removed' ? answer(410, { error: 'This site was taken down.' })
      : held.token !== tokenHash ? answer(403, { error: 'This name is someone else’s.' }) : held)

    if (request.method === 'POST' && !rest) {
      if (spend('writes')) return answer(429, { error: 'Too many changes. Try again later.' })
      const bytes = await within(request, 200_000)
      /** @type {Record<string, unknown>} */
      let list = {}
      try { list = JSON.parse(new TextDecoder().decode(bytes ?? new Uint8Array())).files ?? {} } catch {}
      const paths = Object.keys(list)
      if (!paths.includes('index.html') || paths.length > limits.files || paths.some((path) => !pathOf(path) || !/^[\w-]{43}$/.test(String(list[path])))) return answer(400, { error: `A site's list names index.html and at most ${limits.files} files, each with its SHA-256.` })
      return inTurn(`site:${name}`, async () => {
        const held = live(await names.held(name))
        let next = held && mine(held)
        if (next instanceof Response) return next
        if (!next) {
          const today = claims.get(network)
          const count = today && now - today.from < DAY ? today : { from: now, count: 0 }
          if (++count.count > limits.claims) return answer(429, { error: 'Too many new names today. Try again tomorrow.', why: 'names' })
          claims.set(network, count)
          next = { format: 1, token: tokenHash, state: 'claimed', expires: new Date(now + DAY).toISOString(), files: {} }
        }
        const need = paths.filter((path) => next.files[path]?.hash !== list[path])
        if (need.length) {
          await names.hold(name, next)
          return answer(200, { need })
        }
        for (const path of Object.keys(next.files)) if (!paths.includes(path)) await files.drop(name, path)
        const first = next.state !== 'live'
        const expires = new Date(now + limits.days * DAY).toISOString()
        await names.hold(name, { ...next, state: 'live', published: new Date(now).toISOString(), expires, files: Object.fromEntries(paths.map((path) => [path, next.files[path]])) })
        await files.purge(name)
        await record(first ? 'create' : 'change')
        return answer(first ? 201 : 200, { address, expires })
      })
    }

    if (request.method === 'PUT' && rest) {
      if (spend('puts')) return answer(429, { error: 'Too many files. Try again later.' })
      let path = null
      try { path = pathOf(decodeURIComponent(rest)) } catch {}
      if (!path) return answer(400, { error: 'A site holds pages, style sheets, scripts, drawings and pictures, at paths of their own.' })
      const bytes = await within(request, limits.file)
      if (!bytes) return answer(413, { error: `A file holds ${limits.file / 1_000_000} MB at most.` })
      const page = path.toLowerCase().endsWith('.html'), text = page ? new TextDecoder().decode(bytes) : ''
      const unfitting = page ? unfit(text) : ''
      if (unfitting) return answer(422, { error: 'A site’s page asks for no password or card, and sends its forms nowhere of its own.', why: unfitting })
      // A page goes with its links tidied, unless it isn't UTF-8; its hash stays that of what Jean sent, which Publish again compares.
      const kept = page && !text.includes('�') ? new TextEncoder().encode(tidy(text)) : bytes
      const hash = await digest(bytes)
      return inTurn(`site:${name}`, async () => {
        const held = mine(live(await names.held(name)))
        if (held instanceof Response) return held
        const others = Object.entries(held.files).filter(([one]) => one !== path)
        if (others.length + 1 > limits.files || others.reduce((sum, [, file]) => sum + file.size, bytes.length) > limits.site) return answer(413, { error: `A site holds ${limits.site / 1_000_000} MB and ${limits.files} files at most.` })
        await files.put(name, path, kept, TYPES[path.toLowerCase().split('.').pop() ?? ''])
        await names.hold(name, { ...held, files: { ...held.files, [path]: { hash, size: bytes.length } } })
        return answer(200, { hash })
      })
    }

    // A new token for the name, from the holder of the one it replaces; sent again once taken, it is taken already, its answer lost.
    if (request.method === 'POST' && rest === 'token') {
      if (spend('writes')) return answer(429, { error: 'Too many changes. Try again later.' })
      const next = /^[\w-]{43}$/.exec(String(await within(request, 1000).then((bytes) => JSON.parse(new TextDecoder().decode(bytes ?? new Uint8Array())).token).catch(() => '')))?.[0]
      if (!next) return answer(400, { error: 'A new token is needed.' })
      return inTurn(`site:${name}`, async () => {
        const was = live(await names.held(name)), hash = await hashOf(next)
        if (was && was.state !== 'removed' && was.token === hash) return answer(200, {})
        const held = mine(was)
        if (held instanceof Response) return held
        await names.hold(name, { ...held, token: hash })
        await record('token')
        return answer(200, {})
      })
    }

    if (request.method === 'DELETE' && !rest) {
      if (spend('writes')) return answer(429, { error: 'Too many changes. Try again later.' })
      return inTurn(`site:${name}`, async () => {
        const held = mine(live(await names.held(name)))
        if (held instanceof Response) return held
        for (const path of Object.keys(held.files)) await files.drop(name, path)
        await names.hold(name, { ...held, state: 'ended', files: {}, expires: new Date(now + limits.days * DAY).toISOString() })
        await files.purge(name)
        await record('delete')
        return answer(200, {})
      })
    }
    return answer(405, { error: 'Not here.' })
  }
}

/**
 * The host's own page, on its bare name: what it keeps, its legal notice, and a form to report a site or a link, in English
 * and French, with no script. @param {{ name?: string, legal?: string, host: string, sent?: boolean }} about
 */
export function aboutPage({ name = 'Jean', legal, host, sent }) {
  const escape = (/** @type {string} */ text) => text.replace(/[&<>"]/g, (mark) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[mark]};`)
  return /* html */ `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(host)}</title>
<style>body{font:1rem/1.5 system-ui,sans-serif;max-inline-size:40rem;margin-block:2rem;margin-inline:auto;padding-inline:1rem}label,input,textarea,button{display:block;font:inherit}input,textarea{inline-size:100%;box-sizing:border-box;margin-block:0.25rem 1rem}textarea{min-block-size:6rem}</style>
<main>
<h1>${escape(host)}</h1>
<p>This host keeps the sites and the links people make with ${escape(name)}. It can’t read the links; the sites are public.</p>
<p lang="fr">Cet hébergeur garde les sites et les liens que l’on fait avec ${escape(name)}. Il ne peut pas lire les liens ; les sites sont publics.</p>
<h2>Report a site or a link <span lang="fr">· Signaler un site ou un lien</span></h2>
${sent ? '<p role="status">Thank you. Your report was sent. <span lang="fr">Merci, votre signalement est envoyé.</span></p>' : `<form method="post" action="/report">
<label for="where">Its address <span lang="fr">· Son adresse</span></label><input id="where" name="where" type="url" required maxlength="500">
<label for="words">What is wrong <span lang="fr">· Ce qui ne va pas</span></label><textarea id="words" name="words" required maxlength="5000"></textarea>
<button>Send <span lang="fr">· Envoyer</span></button>
</form>`}
${legal ? `<p><a href="${escape(legal)}">Legal notice <span lang="fr">· Mentions légales</span></a></p>` : ''}
</main>
`
}
