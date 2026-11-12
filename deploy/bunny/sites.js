// SPDX-License-Identifier: MIT
// A Bunny Edge Script, of the middleware kind, linked to the pull zone that serves published sites (D720, README.md beside
// this file): `<name>.hst.ing/<path>` is `<name>/<path>` in the sites' storage zone, `/` and a folder its index.html, a path
// with no ending its .html, as the share host finds them when it serves a site itself (host/sites.js); an address with .html,
// .htm or a folder's index goes to the one without, so none shows an ending. Every answer gets the
// sites' header set, whose sandbox makes each page an opaque origin; test/publish.test.js holds it to host/sites.js's HEADERS.
// It runs only when the edge has no copy, and the headers are kept with the copy.
import * as BunnySDK from '@bunny.net/edgescript-sdk@0.13.0'

const HEADERS = {
  "content-security-policy": "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self'; manifest-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
  "access-control-allow-origin": "*",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=31536000"
}

/** A site's name: the address's first label, as the host allows it. */
const NAME = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
/** Where an address with a page's .html or .htm, or a folder's index, goes instead, or null: host/sites.js's cleanAt, which a test holds it to. */
const cleanAt = (pathname) => ((match) => (match ? `${match[1]}${match[2] ?? ''}` : null))(/^(.*?)(?:(\/)index(?:\.html?)?|\.html?)$/i.exec(pathname))

BunnySDK.net.http.servePullZone({ url: 'http://localhost:4173' })
  .onOriginRequest((context) => {
    // The request's address is already the storage zone's; the one the visitor typed is in its Host.
    const url = new URL(context.request.url)
    // No address shows a page's ending: one with it goes to the one without, as the host wrote the site's links.
    const clean = cleanAt(url.pathname)
    if (clean !== null) return Promise.resolve(new Response(null, { status: 301, headers: { ...HEADERS, location: clean } }))
    const name = (context.request.headers.get('host') ?? '').split('.')[0]
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const file = !path || path.endsWith('/') ? `${path}index.html` : /\.[^/]+$/.test(path) ? path : `${path}.html`
    // A name no site can have asks the zone for a file that is never there.
    url.pathname = NAME.test(name) && !name.includes('--') ? `/${name}/${file.split('/').map(encodeURIComponent).join('/')}` : '/-/none'
    return Promise.resolve(new Request(url, context.request))
  })
  .onOriginResponse((context) => {
    const response = new Response(context.response.body, context.response)
    for (const [name, value] of Object.entries(HEADERS)) response.headers.set(name, value)
    return Promise.resolve(response)
  })
