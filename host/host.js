// The share host (D361, docs/sharing.md): it keeps the sealed copies people share from Jean, which it
// can't read, under ids, for whoever has the link, and shows them with Jean's viewer. Whoever serves
// Jean runs it, or none, and Jean names it in settings or policy (`urls.share`). It keeps each change's
// address, as French law asks of hosts, sealed by the store, and nothing about who reads.
//
//   GET    /                 what it keeps: { format: 1, limit, days }
//   GET    /<id>             the viewer, the same page for every share
//   GET    /frame            where a share is drawn: a page whose own policy makes it an opaque origin, which writes the page it is sent
//   GET    /v1/<id>          the sealed copy. A password's asks for its proof (Authorization: Share <proof>), and answers 401 { salt } without it
//   PUT    /v1/<id>          keeps it, a new one or a change: Authorization: Bearer <write token>, Share-Days: 30 or 365, Share-Proof: the proof's hash for a password's
//   DELETE /v1/<id>          stops sharing it, with its write token
//   POST   /v1/<id>/report   a report for whoever runs the host: { words, link? }, the link only when the reporter gives it
//
// Its configuration, a JSON object in HOST_CONFIG:
//   origins  the Jeans that share through it, e.g. ["https://jean.is"]
//   viewer   how its viewer loads, from the render package: { base, entry, imports, integrity } (npm run host writes it)
//   render   where a share's render package is, '{version}' in it; sounds the same for a score's instruments; maps a map service's styles
//   app      where Open in my Jean opens, e.g. "https://jean.is/"; legal the address of its legal notice; name the name it shows
//
// Web-standard (fetch, Request, Response, Web Crypto): what it keeps goes through a store, a folder
// on Node (serve.js). Copies are 10 MB at most.

export const LIMIT = 10_000_000
/** How long a share lasts, in days: 30 unless the person said a year. */
export const DAYS = [30, 365]
/** Proofs tried in an hour before a password's share pauses. */
const TRIES = 10
/** Changes an address may make in an hour, and reports. */
const WRITES = 60
const REPORTS = 10
const HOUR = 3_600_000
const ID = /^\/(?:v1\/)?([\w-]{22})(\/report)?$/

/**
 * What the store keeps of a share beside its sealed copy: its salt, the hashes of its write token
 * and its proof, until when, and the proofs tried this hour; or that it was taken down.
 * @typedef {{ format: 1, salt: string, token: string, proof?: string, expires: string, size: number, tries?: { from: number, count: number }, removed?: string }} Meta
 * @typedef {{ meta(id: string): Promise<Meta | null>, body(id: string): Promise<Uint8Array | null>, put(id: string, meta: Meta, body?: Uint8Array): Promise<void>,
 *   remove(id: string): Promise<void>, report(text: string): Promise<void>, record(text: string): Promise<void> }} Store
 * @typedef {{ origins?: string[], viewer?: { base: string, entry: string, imports: Record<string, string>, integrity: Record<string, string> }, render?: string, sounds?: string,
 *   maps?: Record<string, string>, app?: string, legal?: string, name?: string }} Config
 * Where a request came from, as the server saw it.
 * @typedef {{ address: string, port: number, protocol?: string }} Client
 */

/** @param {Uint8Array} bytes */
const base64url = (bytes) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** @param {string} text */
const hashOf = async (text) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
/** @param {string} text */
const escape = (text) => text.replace(/[&<>"]/g, (mark) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[mark]};`)
/** JSON in a script block, which nothing in it can end. @param {unknown} value */
const block = (value) => JSON.stringify(value).replaceAll('<', '\\u003c')
/** @param {string} text */
const sha256 = async (text) => `'sha256-${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))))}'`
/** The origin of an address, or nothing. @param {string | undefined} address */
const originOf = (address) => { try { return address ? [new URL(address.replace('{version}', '0')).origin] : [] } catch { return [] } }

/**
 * The frame's page: a relay that writes the page the viewer sends it, once, as preview.html does in
 * Jean (D126). Its own policy sandboxes it, so whoever opens it, it is an opaque origin.
 */
const RELAY = `<!doctype html><meta charset="utf-8"><script>let done=false;addEventListener('message',({source,data})=>{if(done||source!==parent||typeof data!=='string')return;done=true;document.open();document.write(data);document.close()});parent.postMessage('ready','*')</script>`

/** @param {Config & { store?: Store }} config @returns {(request: Request, client?: Client) => Promise<Response>} */
export function host(config) {
  const { origins = [], viewer, name = 'Jean' } = config
  const sources = [...new Set([...originOf(viewer?.base), ...originOf(config.render), ...originOf(config.sounds), ...Object.values(config.maps ?? {}).flatMap(originOf)])].join(' ')
  // What the viewer reads of the host: where shares' packages are, the map service, where Open in my Jean opens, the legal notice.
  const shown = block({ render: config.render, sounds: config.sounds, maps: config.maps, app: config.app, legal: config.legal, name })
  const importMap = viewer && block({ imports: viewer.imports, integrity: viewer.integrity })
  const page = viewer && `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escape(name)}</title>
<meta property="og:title" content="${escape(name)}">
<script type="application/json" id="host">${shown}</script>
<script type="importmap">${importMap}</script>
<script type="module" src="${escape(viewer.entry)}" integrity="${escape(viewer.integrity[viewer.entry] ?? '')}" crossorigin="anonymous"></script>
`
  const policy = (async () => [`default-src 'none'`, `script-src ${sources} ${importMap ? await sha256(importMap) : ''}`, `style-src 'unsafe-inline' ${sources}`, `img-src data: blob: ${sources}`,
    `font-src data: ${sources}`, `connect-src 'self' ${sources}`, `frame-src 'self'`, "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"].join('; '))()
  const framed = ['sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox', `default-src 'none'`, `script-src 'unsafe-inline' 'wasm-unsafe-eval' data: blob: ${sources}`,
    `style-src 'unsafe-inline' ${sources}`, `img-src data: blob: ${sources}`, `font-src data: ${sources}`, `connect-src ${sources}`, 'worker-src blob:', "base-uri 'none'", "form-action 'none'", "frame-ancestors 'self'"].join('; ')
  /** What each address did this hour. @type {Map<string, { from: number, writes: number, reports: number }>} */
  const seen = new Map()

  return async (request, client = { address: '', port: 0 }) => {
    const url = new URL(request.url)
    const origin = request.headers.get('origin') ?? ''
    const ours = origins.includes(origin)
    const cors = new Headers({ vary: 'origin', 'access-control-allow-origin': ours ? origin : '*', 'access-control-expose-headers': 'share-expires', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' })
    const answer = (/** @type {number} */ status, /** @type {object} */ body = {}) => Response.json(body, { status, headers: cors })
    if (request.method === 'OPTIONS') {
      cors.set('access-control-allow-methods', 'GET, PUT, DELETE, POST')
      cors.set('access-control-allow-headers', 'authorization, content-type, share-days, share-proof')
      return new Response(null, { status: 204, headers: cors })
    }
    // A HEAD is answered as a GET is, as link previews ask.
    const reading = request.method === 'GET' || request.method === 'HEAD'
    if (url.pathname === '/' && reading) return answer(200, { format: 1, limit: LIMIT, days: DAYS })
    if (url.pathname === '/frame' && reading) return new Response(RELAY, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': framed, 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=3600' } })
    const [, id, report] = ID.exec(url.pathname) ?? []
    if (!id) return answer(404, { error: 'Nothing is here.' })
    if (!url.pathname.startsWith('/v1/')) {
      if (!reading || !page) return answer(404, { error: 'Nothing is here.' })
      return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': await policy, 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer', 'cache-control': 'public, max-age=300' } })
    }

    const now = Date.now()
    const by = seen.get(client.address)
    const mine = by && now - by.from < HOUR ? by : { from: now, writes: 0, reports: 0 }
    seen.set(client.address, mine)
    if (seen.size > 100_000) seen.clear()
    const meta = await config.store?.meta(id) ?? null
    const live = meta && !meta.removed && Date.parse(meta.expires) > now ? meta : null
    if (meta && !meta.removed && !live) await config.store?.remove(id)
    /** A change, with where it came from, as French law asks of a host; never a read. @param {'create' | 'change' | 'delete'} operation */
    const record = (operation) => config.store?.record(JSON.stringify({ at: new Date(now).toISOString(), address: client.address, port: client.port, protocol: client.protocol ?? '', id, operation }))

    if (report) {
      if (request.method !== 'POST') return answer(405, { error: 'Send a report.' })
      if (++mine.reports > REPORTS) return answer(429, { error: 'Too many reports. Try again later.' })
      const text = await request.text()
      if (text.length > 20_000) return answer(413, { error: 'This report is too long.' })
      /** @type {{ words?: unknown, link?: unknown }} */
      let said = {}
      try { said = JSON.parse(text) } catch {}
      await config.store?.report(JSON.stringify({ at: new Date(now).toISOString(), id, words: String(said.words ?? '').slice(0, 5000), ...(typeof said.link === 'string' && { link: said.link.slice(0, 200) }) }))
      return answer(202, {})
    }

    if (reading) {
      if (meta?.removed) return answer(410, { error: 'This was taken down.' })
      if (!live) return answer(404, { error: 'This is no longer shared.' })
      if (live.proof) {
        const tries = live.tries && now - live.tries.from < HOUR ? live.tries : { from: now, count: 0 }
        if (tries.count >= TRIES) return answer(429, { error: 'Too many tries. Try again later.', salt: live.salt })
        const given = /^Share ([\w-]{43})$/.exec(request.headers.get('authorization') ?? '')?.[1]
        if (!given) return answer(401, { salt: live.salt })
        if ((await hashOf(given)) !== live.proof) {
          await config.store?.put(id, { ...live, tries: { from: tries.from, count: tries.count + 1 } })
          return answer(401, { salt: live.salt, wrong: true })
        }
      }
      const body = await config.store?.body(id)
      if (!body) return answer(404, { error: 'This is no longer shared.' })
      cors.set('content-type', 'application/octet-stream')
      cors.set('share-expires', live.expires)
      return new Response(/** @type {BodyInit} */ (body), { headers: cors })
    }

    // A change: only from the Jeans it serves, which a browser always names, with the share's write token.
    if (request.method !== 'PUT' && request.method !== 'DELETE') return answer(405, { error: 'Not here.' })
    if (!ours) return answer(403, { error: 'This host does not serve this origin.' })
    if (++mine.writes > WRITES) return answer(429, { error: 'Too many changes. Try again later.' })
    const token = /^Bearer ([\w-]{43})$/.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!token) return answer(401, { error: 'A write token is needed.' })
    const tokenHash = await hashOf(token)
    if (meta?.removed) return answer(410, { error: 'This was taken down.' })
    if (live && live.token !== tokenHash) return answer(403, { error: 'This share is someone else’s.' })
    if (request.method === 'DELETE') {
      if (live) await config.store?.remove(id), await record('delete')
      return answer(200, {})
    }
    if (Number(request.headers.get('content-length') ?? 0) > LIMIT) return answer(413, { error: 'A share holds 10 MB at most.' })
    const body = new Uint8Array(await request.arrayBuffer())
    if (body.length > LIMIT) return answer(413, { error: 'A share holds 10 MB at most.' })
    if (body.length < 29) return answer(400, { error: 'This is not a sealed copy.' })
    const days = DAYS.includes(Number(request.headers.get('share-days'))) ? Number(request.headers.get('share-days')) : DAYS[0]
    const proof = /^[\w-]{43}$/.exec(request.headers.get('share-proof') ?? '')?.[0]
    const expires = new Date(now + days * 86_400_000).toISOString()
    await config.store?.put(id, { format: 1, salt: base64url(body.slice(0, 16)), token: tokenHash, ...(proof && { proof }), expires, size: body.length }, body)
    await record(live ? 'change' : 'create')
    cors.set('share-expires', expires)
    return answer(live ? 200 : 201, { expires })
  }
}

