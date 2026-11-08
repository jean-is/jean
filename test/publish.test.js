// Sites published at names of their own (D720): the host's names, its routes, what it keeps and serves, Bunny's store, and
// what Jean draws a site's token and recovery code from.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { host, base64url } from '../host/host.js'
import { folder, siteFiles } from '../host/serve.js'
import { refused, fileAt, siteAt, serveSite, sweepSites, takeDown, bunny, digest, unfit, HEADERS, TYPES, GONE } from '../host/sites.js'
import { TYPES as JEANS, tokenOf, codeOf, secretOf } from '../app/caps/sites/file.js'

const JEAN = 'https://jean.example'
const CLIENT = { address: '203.0.113.7', port: 51234, protocol: 'HTTP/1.1' }
const ADDRESS = 'https://{name}.hst.example/'
const DAY = 86_400_000

/** Names and files in memory, as the host keeps them. */
function memory() {
  const held = new Map(), files = new Map(), reports = /** @type {string[]} */ ([]), records = /** @type {string[]} */ ([]), purged = /** @type {string[]} */ ([])
  return {
    held, files, reports, records, purged,
    store: { meta: async () => null, body: async () => null, put: async () => {}, remove: async () => {}, report: async (/** @type {string} */ text) => { reports.push(text) }, record: async (/** @type {string} */ text) => { records.push(text) },
      held: async (/** @type {string} */ name) => held.get(name) ?? null, hold: async (/** @type {string} */ name, /** @type {any} */ one) => { held.set(name, structuredClone(one)) },
      forget: async (/** @type {string} */ name) => { held.delete(name) }, names: async () => [...held.keys()] },
    sites: { put: async (/** @type {string} */ name, /** @type {string} */ path, /** @type {Uint8Array} */ bytes) => { files.set(`${name}/${path}`, bytes) }, drop: async (/** @type {string} */ name, /** @type {string} */ path) => { files.delete(`${name}/${path}`) },
      purge: async (/** @type {string} */ name) => { purged.push(name) }, read: async (/** @type {string} */ name, /** @type {string} */ path) => files.get(`${name}/${path}`) ?? null },
  }
}

/** A host publishing sites, and a way to ask it, from Jean's origin unless said otherwise. */
function hostOn(config = {}) {
  const kept = memory()
  const handle = host({ origins: [JEAN], store: kept.store, files: kept.sites, sites: { address: ADDRESS }, ...config })
  /** @param {string} path @param {RequestInit & { origin?: string | null, token?: string, client?: object }} [init] */
  const ask = (path, { origin = JEAN, token, client = CLIENT, ...init } = {}) => handle(new Request(`https://hst.example${path}`, { ...init, headers: { ...(origin && { origin }), ...(token && { authorization: `Bearer ${token}` }), ...init.headers } }), /** @type {any} */ (client))
  return { ...kept, ask, handle }
}

const encode = (/** @type {string} */ text) => new TextEncoder().encode(text)
const PAGES = { 'index.html': '<!doctype html><title>Bakery</title><link rel="stylesheet" href="style.css">', 'style.css': 'body { color: #222 }', 'about.html': '<!doctype html><title>About</title>' }
/** A site's files as bytes, and their list as the host is given it. @param {Record<string, string>} pages */
const siteOf = async (pages) => {
  const files = new Map(Object.entries(pages).map(([path, text]) => [path, encode(text)]))
  return { files, list: Object.fromEntries(await Promise.all([...files].map(async ([path, bytes]) => [path, await digest(bytes)]))) }
}
/** Publishes as Jean does: the list, each file it lacks, the list again. @param {ReturnType<typeof hostOn>} on @param {string} name @param {string} token @param {Record<string, string>} pages */
async function publish(on, name, token, pages) {
  const { files, list } = await siteOf(pages)
  const post = () => on.ask(`/v1/sites/${name}`, { method: 'POST', token, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files: list }) })
  const first = await post()
  const { need = [] } = await first.clone().json()
  if (!first.ok) return { first, need, sent: [] }
  for (const path of need) assert.equal((await on.ask(`/v1/sites/${name}/${path}`, { method: 'PUT', token, body: /** @type {BodyInit} */ (files.get(path)) })).status, 200)
  return { first, need, done: await post() }
}
const token = () => base64url(crypto.getRandomValues(new Uint8Array(32)))

test('a name is 3 to 40 plain letters, digits and hyphens, never the host’s own, a brand or a lure, even written with look-alikes', () => {
  for (const name of ['lyon-bakery', 'marie-photo', 'jean-dupont', 'pineapple-shop', 'club-2027']) assert.equal(refused(name), '', name)
  for (const [name, why] of /** @type {const} */ ([['ab', 'shape'], ['Bakery', 'shape'], ['-bakery', 'shape'], ['xn--bkery-qra', 'shape'], ['my--site', 'shape'], ['a'.repeat(41), 'shape'],
    ['www', 'reserved'], ['jean', 'reserved'], ['j3an', 'reserved'], ['s', 'shape'], ['abuse', 'reserved'],
    ['paypal-help', 'brand'], ['paypa1-help', 'brand'], ['g00gle', 'brand'], ['mypaypal', 'brand'], ['secure-pay-pal', 'brand'], ['amazon-refund', 'brand'], ['ameli-remboursement', 'brand'],
    ['bank-login', 'lure'], ['my-wallet', 'lure'], ['verify-now', 'lure']])) assert.equal(refused(name), why, name)
  assert.equal(refused('mysite', ['mysite']), 'reserved')
})

test('a site goes live once the host holds every file of its list, and only its token changes it', async () => {
  const on = hostOn(), mine = token()
  assert.deepEqual(await (await on.ask('/v1/sites/lyon-bakery', { origin: null })).json(), { state: 'free', address: 'https://lyon-bakery.hst.example/' })
  const { need, done } = await publish(on, 'lyon-bakery', mine, PAGES)
  assert.deepEqual(need.sort(), ['about.html', 'index.html', 'style.css'])
  assert.equal(done?.status, 201)
  const { address, expires } = await done.json()
  assert.equal(address, 'https://lyon-bakery.hst.example/')
  assert.ok(Math.abs(Date.parse(expires) - Date.now() - 365 * DAY) < 60_000)
  assert.deepEqual(on.purged, ['lyon-bakery'])
  assert.equal(JSON.parse(on.records[0]).operation, 'create')
  assert.equal(JSON.parse(on.records[0]).address, CLIENT.address)
  // Its owner sees it as theirs, with its files; anyone else sees it taken, and can't change it.
  const yours = await (await on.ask('/v1/sites/lyon-bakery', { token: mine })).json()
  assert.equal(yours.state, 'yours')
  assert.deepEqual(Object.keys(yours.files).sort(), ['about.html', 'index.html', 'style.css'])
  assert.deepEqual(await (await on.ask('/v1/sites/lyon-bakery', { origin: null })).json(), { state: 'taken' })
  assert.equal((await publish(on, 'lyon-bakery', token(), PAGES)).first.status, 403)
  assert.equal((await on.ask('/v1/sites/lyon-bakery/index.html', { method: 'PUT', token: token(), body: 'x' })).status, 403)
  // Only Jean's origins change anything.
  assert.equal((await on.ask('/v1/sites/other-bakery', { method: 'POST', token: mine, origin: 'https://evil.example', body: '{}' })).status, 403)
})

test('publishing again sends only what changed, and what the site no longer holds goes', async () => {
  const on = hostOn(), mine = token()
  await publish(on, 'lyon-bakery', mine, PAGES)
  const { need, done } = await publish(on, 'lyon-bakery', mine, { 'index.html': PAGES['index.html'], 'style.css': 'body { color: #111 }' })
  assert.deepEqual(need, ['style.css'])
  assert.equal(done?.status, 200)
  assert.equal(on.files.has('lyon-bakery/about.html'), false)
  assert.equal(new TextDecoder().decode(on.files.get('lyon-bakery/style.css')), 'body { color: #111 }')
  assert.equal(JSON.parse(on.records.at(-1) ?? '').operation, 'change')
})

test('the host refuses a page that asks for a password or a card, a list without its first page, and too many new names', async () => {
  const on = hostOn(), mine = token()
  assert.equal((await publish(on, 'lyon-bakery', mine, { 'about.html': 'x' })).first.status, 400)
  await on.ask('/v1/sites/lyon-bakery', { method: 'POST', token: mine, body: JSON.stringify({ files: (await siteOf(PAGES)).list }) })
  const put = await on.ask('/v1/sites/lyon-bakery/index.html', { method: 'PUT', token: mine, body: '<form><input type="password" name="p"></form>' })
  assert.equal(put.status, 422)
  assert.equal((await put.json()).why, 'password')
  assert.equal(unfit('<input autocomplete="cc-number">'), 'card')
  assert.equal(unfit('<form action="https://evil.example/">'), 'action')
  assert.equal(unfit('<form data-form="waitlist" method="post">'), '')
  assert.equal((await on.ask('/v1/sites/lyon-bakery/.hidden.html', { method: 'PUT', token: mine, body: 'x' })).status, 400)
  assert.equal((await on.ask('/v1/sites/lyon-bakery/run.exe', { method: 'PUT', token: mine, body: 'x' })).status, 400)
  assert.equal((await publish(on, 'paypal-help', mine, PAGES)).first.status, 403)
  // Five new names a day from one network; the sixth waits.
  for (const n of [1, 2, 3, 4]) assert.equal((await publish(on, `bakery-${n}`, token(), PAGES)).first.status, 200)
  assert.equal((await publish(on, 'bakery-5', token(), PAGES)).first.status, 429)
})

test('taken offline, a name waits a year for its token alone, then anyone may have it; a claim never published lapses in a day', async () => {
  const on = hostOn(), mine = token()
  await publish(on, 'lyon-bakery', mine, PAGES)
  assert.equal((await on.ask('/v1/sites/lyon-bakery', { method: 'DELETE', token: mine })).status, 200)
  assert.equal(on.files.size, 0)
  assert.equal(JSON.parse(on.records.at(-1) ?? '').operation, 'delete')
  assert.deepEqual(await (await on.ask('/v1/sites/lyon-bakery', { origin: null })).json(), { state: 'taken' })
  assert.equal((await publish(on, 'lyon-bakery', token(), PAGES)).first.status, 403)
  assert.equal((await publish(on, 'lyon-bakery', mine, PAGES)).done?.status, 201)
  // A year after it ends, the sweep frees it.
  await on.ask('/v1/sites/lyon-bakery', { method: 'DELETE', token: mine })
  await sweepSites(/** @type {any} */ (on.store), on.sites, Date.now() + 366 * DAY)
  assert.equal(on.held.has('lyon-bakery'), false)
  // A claim whose files never all came lapses after a day, its files with it.
  await on.ask('/v1/sites/half-done', { method: 'POST', token: mine, body: JSON.stringify({ files: (await siteOf(PAGES)).list }) })
  await on.ask('/v1/sites/half-done/index.html', { method: 'PUT', token: mine, body: PAGES['index.html'] })
  await sweepSites(/** @type {any} */ (on.store), on.sites, Date.now() + 2 * DAY)
  assert.equal(on.held.has('half-done'), false)
  assert.equal(on.files.has('half-done/index.html'), false)
  // A live site past its year ends, and its name is held a year more.
  await publish(on, 'old-bakery', mine, PAGES)
  await sweepSites(/** @type {any} */ (on.store), on.sites, Date.now() + 366 * DAY)
  assert.equal(on.held.get('old-bakery')?.state, 'ended')
})

test('a site taken down shows a page saying so, and its name never comes back', async () => {
  const on = hostOn(), mine = token()
  await publish(on, 'lyon-bakery', mine, PAGES)
  await takeDown('lyon-bakery', /** @type {any} */ (on.store), on.sites)
  assert.deepEqual([...on.files.keys()], ['lyon-bakery/index.html'])
  assert.equal(new TextDecoder().decode(on.files.get('lyon-bakery/index.html')), GONE)
  assert.equal((await publish(on, 'lyon-bakery', mine, PAGES)).first.status, 410)
  await sweepSites(/** @type {any} */ (on.store), on.sites, Date.now() + 1000 * DAY)
  assert.equal(on.held.get('lyon-bakery')?.state, 'removed')
})

test('the holder of a name’s token gives it a new one, the old then refused, a lost answer asked again taken already', async () => {
  const on = hostOn(), old = token(), next = token()
  await publish(on, 'lyon-bakery', old, PAGES)
  const renew = (/** @type {string} */ bearer, /** @type {string} */ to, name = 'lyon-bakery') => on.ask(`/v1/sites/${name}/token`, { method: 'POST', token: bearer, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: to }) })
  // Only the token that holds it, with a new one written as a token is, from Jean's origins.
  assert.equal((await renew(token(), token())).status, 403)
  assert.equal((await renew(old, 'short')).status, 400)
  assert.equal((await on.ask('/v1/sites/lyon-bakery/token', { method: 'POST', token: old, origin: 'https://evil.example', body: JSON.stringify({ token: next }) })).status, 403)
  assert.equal((await renew(old, next)).status, 200)
  assert.equal(JSON.parse(on.records.at(-1) ?? '').operation, 'token')
  // Sent again, its answer lost, it is taken already; but the old token changes nothing more, and the new one does everything.
  assert.equal((await renew(old, next)).status, 200)
  assert.equal((await renew(old, token())).status, 403)
  assert.equal((await publish(on, 'lyon-bakery', old, PAGES)).first.status, 403)
  assert.equal((await on.ask('/v1/sites/lyon-bakery', { method: 'DELETE', token: old })).status, 403)
  assert.equal((await (await on.ask('/v1/sites/lyon-bakery', { token: old })).json()).state, 'taken')
  assert.equal((await (await on.ask('/v1/sites/lyon-bakery', { token: next })).json()).state, 'yours')
  assert.equal((await publish(on, 'lyon-bakery', next, { ...PAGES, 'style.css': 'body { color: #111 }' })).done?.status, 200)
  // Offline, its name held a year for its token, it changes too; never a name that is free or taken down.
  assert.equal((await on.ask('/v1/sites/lyon-bakery', { method: 'DELETE', token: next })).status, 200)
  const third = token()
  assert.equal((await renew(next, third)).status, 200)
  assert.equal((await publish(on, 'lyon-bakery', third, PAGES)).done?.status, 201)
  assert.equal((await renew(third, token(), 'free-bakery')).status, 404)
  await takeDown('lyon-bakery', /** @type {any} */ (on.store), on.sites)
  assert.equal((await renew(third, token())).status, 410)
  // Limited as every change is: sixty an hour from one address.
  const busy = hostOn(), said = []
  for (let n = 0; n <= 60; n++) said.push((await busy.ask('/v1/sites/lyon-bakery/token', { method: 'POST', token: old, body: JSON.stringify({ token: next }) })).status)
  assert.deepEqual([said[0], said.at(-1)], [404, 429])
})

test('every file of a site is served under the same strict header set, a page found without its .html', async () => {
  const on = hostOn({ sites: { address: 'http://{name}.localhost:8788/' } })
  await publish(on, 'lyon-bakery', token(), PAGES)
  assert.equal(siteAt(new URL('http://lyon-bakery.localhost:8788/about'), 'http://{name}.localhost:8788/'), 'lyon-bakery')
  assert.equal(siteAt(new URL('http://localhost:8788/about'), 'http://{name}.localhost:8788/'), null)
  assert.equal(siteAt(new URL('http://a.b.localhost:8788/'), 'http://{name}.localhost:8788/'), null)
  assert.deepEqual(['/', '/about', '/fr/', '/style.css', '/fr/contact'].map(fileAt), ['index.html', 'about.html', 'fr/index.html', 'style.css', 'fr/contact.html'])
  for (const [path, type] of [['/', 'text/html; charset=utf-8'], ['/about', 'text/html; charset=utf-8'], ['/style.css', 'text/css; charset=utf-8']]) {
    const response = await on.handle(new Request(`http://lyon-bakery.localhost:8788${path}`))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), type)
    for (const [name, value] of Object.entries(HEADERS)) assert.equal(response.headers.get(name), value)
  }
  const missing = await serveSite(on.sites, 'lyon-bakery', new URL('http://lyon-bakery.localhost:8788/nothing'))
  assert.equal(missing.status, 404)
  assert.match(missing.headers.get('content-security-policy') ?? '', /^sandbox allow-scripts/)
  // The sandbox gives each page an opaque origin: no cookie, no storage, no service worker of its own.
  assert.doesNotMatch(HEADERS['content-security-policy'], /allow-same-origin/)
  assert.equal((await on.handle(new Request('http://lyon-bakery.localhost:8788/', { method: 'POST' }))).status, 405)
})

test('the host says it publishes sites, and its own page has a form to report one', async () => {
  const on = hostOn({ legal: 'https://legal.example/', alert: 'https://alerts.example/topic' })
  const told = await (await on.ask('/', { origin: null })).json()
  assert.deepEqual(told.sites, { address: ADDRESS, limit: 50_000_000, file: 10_000_000, files: 500, days: 365 })
  assert.equal((await (await hostOn({ sites: undefined }).ask('/', { origin: null })).json()).sites, undefined)
  const page = await on.ask('/', { origin: null, headers: { accept: 'text/html' } })
  const text = await page.text()
  assert.match(text, /<form method="post" action="\/report">/)
  assert.match(text, /<label for="where">/)
  assert.match(text, /href="https:\/\/legal\.example\/"/)
  assert.match(page.headers.get('content-security-policy') ?? '', /form-action 'self'/)
  const sent = /** @type {{ url: string, body: string }[]} */ ([])
  const fetched = globalThis.fetch
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), body: String(init?.body) }); return new Response('ok') }
  try {
    const answer = await on.ask('/report', { method: 'POST', origin: null, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ where: 'https://bad.hst.example/', words: 'A fake bank' }).toString() })
    assert.match(await answer.text(), /role="status"/)
  } finally { globalThis.fetch = fetched }
  assert.equal(JSON.parse(on.reports[0]).where, 'https://bad.hst.example/')
  assert.equal(sent[0].url, 'https://alerts.example/topic')
  assert.match(sent[0].body, /A fake bank/)
})

test('shares open under a path of the host, where it answers as at its root; a link opened elsewhere goes on there', async () => {
  const on = hostOn({ shares: 'https://hst.example/s/', viewer: { base: 'https://cdn.example/', entry: 'https://cdn.example/view.js', imports: {}, integrity: {} } })
  const id = 'AAAAAAAAAAAAAAAAAAAAAA'
  // Links made at the bare name, or at a name of the shares' own before.
  for (const at of [`https://hst.example/${id}`, `https://s.hst.example/${id}`]) {
    const moved = await on.handle(new Request(at))
    assert.deepEqual([moved.status, moved.headers.get('location')], [301, `https://hst.example/s/${id}`], at)
  }
  const opened = await on.ask(`/s/${id}`, { origin: null })
  assert.equal(opened.status, 200)
  assert.match(await opened.text(), /cdn\.example\/view\.js/)
  // What Jean asks of it there: what it offers, a name's state; and a share's copy, which the viewer asks at the root.
  assert.deepEqual(Object.keys(await (await on.ask('/s/', { origin: null })).json()).sort(), ['days', 'format', 'limit', 'sites'])
  assert.equal((await (await on.ask('/s/v1/sites/lyon-bakery', { origin: null })).json()).state, 'free')
  assert.equal((await on.ask(`/v1/${id}`, { origin: null })).status, 404)
  assert.equal((await on.ask(`/s/v1/${id}`, { origin: null })).status, 404)
})

test('a folder keeps names and files; Bunny gets each file with its type and checksum, and a purge of the whole site', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jean-sites-'))
  const store = folder(dir, null), files = siteFiles(dir)
  await store.hold('lyon-bakery', { format: 1, token: 't', state: 'live', expires: new Date(Date.now() + DAY).toISOString(), files: {} })
  assert.deepEqual(await store.names(), ['lyon-bakery'])
  assert.equal((await store.held('lyon-bakery'))?.state, 'live')
  await files.put('lyon-bakery', 'fr/index.html', encode('<p>Bonjour</p>'), 'text/html')
  assert.equal(await readFile(join(dir, 'sites', 'lyon-bakery', 'fr', 'index.html'), 'utf8'), '<p>Bonjour</p>')
  assert.equal(new TextDecoder().decode(await files.read?.('lyon-bakery', 'fr/index.html') ?? undefined), '<p>Bonjour</p>')
  await store.forget('lyon-bakery')
  assert.deepEqual(await store.names(), [])

  const calls = /** @type {{ url: string, init: RequestInit }[]} */ ([])
  const fetched = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return new Response(null, { status: 201 }) }
  try {
    const zone = bunny({ storage: 'https://storage.example/hst-sites/', api: 'https://api.example/' }, { storageKey: 'S', apiKey: 'A' }, ADDRESS)
    await zone.put('lyon-bakery', 'photos/la boutique.jpg', encode('jpg'), 'image/jpeg')
    await zone.purge('lyon-bakery')
  } finally { globalThis.fetch = fetched }
  assert.equal(calls[0].url, 'https://storage.example/hst-sites/lyon-bakery/photos/la%20boutique.jpg')
  assert.deepEqual(Object.keys(/** @type {object} */ (calls[0].init.headers)).sort(), ['AccessKey', 'checksum', 'override-content-type'])
  assert.match(/** @type {any} */ (calls[0].init.headers).checksum, /^[0-9A-F]{64}$/)
  assert.equal(calls[1].url, `https://api.example/purge?url=${encodeURIComponent('https://lyon-bakery.hst.example/*')}&async=false`)
})

test('the host serves what Jean makes, and Bunny’s edge adds the same headers', async () => {
  assert.deepEqual(TYPES, JEANS)
  const edge = await readFile(new URL('../deploy/bunny/sites.js', import.meta.url), 'utf8')
  assert.deepEqual(JSON.parse(/** @type {string} */ (/const HEADERS = (\{[\s\S]*?\n\})/.exec(edge)?.[1])), { ...HEADERS })
})

test('a site’s token comes from its secret one way, and its recovery code reads back whatever its case, spaces and dashes', async () => {
  const secret = crypto.getRandomValues(new Uint8Array(16))
  const code = codeOf(secret)
  assert.match(code, /^([0-9A-F]{4}-){7}[0-9A-F]{4}$/)
  assert.deepEqual(secretOf(code.toLowerCase().replaceAll('-', ' ')), secret)
  assert.equal(secretOf('not a code'), null)
  const written = await tokenOf(secret)
  assert.match(written, /^[\w-]{43}$/)
  assert.equal(await tokenOf(secret), written)
  assert.notEqual(written, base64url(secret))
})
