// SPDX-License-Identifier: MIT
// Service worker: offline shell and per-capability caches (classic script).
// VERSION is the one capabilities.json names, stamped where this file is served and never in git (D74).
const VERSION = 'dev'
const SHELL = `app-shell-${VERSION}`
// Capability caches carry the version too: an update re-caches every unlocked capability,
// copying unchanged files over, so old code is never served next to a new shell.
const CAPABILITY = 'app-cap-'
/** @param {string} id */
const capabilityCache = (id) => `${CAPABILITY}${VERSION}-${id}`
const LOCAL = ['localhost', '127.0.0.1'].includes(self.location.hostname)

/** Resolves an app-relative path against the scope, so sub-path deploys work. @param {string} path */
const url = (path) => new URL(path, self.registration.scope).href

// ─── Lifecycle ───────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(recacheCapabilities))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()))
})

async function precacheShell () {
  const response = await fetch(url('capabilities.json'), { cache: 'no-store' })
  if (!response.ok) throw new Error(`capabilities.json: HTTP ${response.status}`)
  const cache = await caches.open(SHELL)
  await cache.put(url('capabilities.json'), response.clone())
  const { shell = [], locales = [], integrity = {} } = await response.json()
  const root = await fetch(url('./'), { cache: 'no-cache' })
  if (!root.ok) throw new Error(`./: HTTP ${root.status}`)
  const before = await earlier()
  const files = await Promise.all([...shell, ...locales].map(async (path) => (await unchanged(before, path, integrity[path])) ?? fetchVerified(path, integrity[path])))
  await cache.put(url('./'), root)
  await Promise.all(files.map(([path, file]) => cache.put(url(path), file)))
}

/**
 * What earlier versions keep, one version at a time: the hashes its listing names, and its caches, its shell's first.
 * @returns {Promise<{ listed: Record<string, string>, kept: Cache[] }[]>}
 */
async function earlier () {
  const names = await caches.keys()
  return Promise.all(names.filter((name) => name.startsWith('app-shell-') && name !== SHELL).map(async (shell) => {
    const listing = await (await caches.open(shell)).match(url('capabilities.json')), ofIt = `${CAPABILITY}${shell.slice('app-shell-'.length)}-`
    return { listed: (await listing?.json().catch(() => null))?.integrity ?? {}, kept: await Promise.all([shell, ...names.filter((name) => name.startsWith(ofIt))].map((name) => caches.open(name))) }
  }))
}

/**
 * A file an earlier version keeps that hasn't changed since: its listing names the same hash as this one's, so its copy
 * is taken as it is, without asking the network or hashing it again. An update then fetches only what changed, where
 * asking about each of the shell's thousand files kept Settings' Check for a new version waiting for seconds.
 * @param {Awaited<ReturnType<typeof earlier>>} before @param {string} path @param {string} [integrity]
 * @returns {Promise<[string, Response] | undefined>}
 */
async function unchanged (before, path, integrity) {
  for (const { listed, kept } of before) for (const cache of integrity && listed[path] === integrity ? kept : []) {
    const hit = await cache.match(url(path))
    if (hit) return [path, hit]
  }
}

/**
 * Fetches through the HTTP cache, which the page has usually just filled, so
 * precaching costs no extra download. The integrity check catches a stale
 * cached copy; the file is then fetched again from the network.
 * @param {string} path @param {string} [integrity]
 * @returns {Promise<[string, Response]>}
 */
async function fetchVerified (path, integrity) {
  if (integrity) {
    const cached = await fetch(url(path), { integrity }).catch(() => null)
    if (cached?.ok) return [path, cached]
  }
  const fresh = await fetch(url(path), { cache: 'reload' })
  if (!fresh.ok) throw new Error(`${path}: HTTP ${fresh.status}`)
  return [path, fresh]
}

async function deleteOldCaches () {
  const names = await caches.keys()
  /** @param {string} name */
  const current = (name) => name === SHELL || name.startsWith(`${CAPABILITY}${VERSION}-`)
  const old = names.filter((name) => (name.startsWith('app-shell-') || name.startsWith(CAPABILITY)) && !current(name))
  await Promise.all(old.map((name) => caches.delete(name)))
}

/** Capabilities unlocked under any earlier version, read from their cache names. */
async function unlockedCapabilities () {
  const ids = new Set()
  for (const name of await caches.keys()) {
    if (!name.startsWith(CAPABILITY)) continue
    // app-cap-<version>-<id>
    ids.add(name.slice(CAPABILITY.length).replace(/^[^-]*-/, ''))
  }
  return [...ids]
}

async function recacheCapabilities () {
  for (const id of await unlockedCapabilities()) await cacheCapability(id)
}

// ─── Messages from the page ──────────────────────────────────────────────────

// SKIP_WAITING asked `alone`, by a page not used yet (ui/update.js), waits while another tab of Jean is open, which would
// run this version's code over the next one's files until it could follow: there the toast's button lets it in.
self.addEventListener('message', (event) => {
  const { type, id, alone } = event.data || {}
  if (type === 'SKIP_WAITING') event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => alone && tabs.filter((tab) => tab.frameType !== 'nested').length > 1 ? event.source?.postMessage({ type: 'WAITING' }) : self.skipWaiting()))
  if (type === 'SHARED') {
    event.ports[0]?.postMessage(shared.get(id) ?? null)
    shared.delete(id)
  }
  if (type === 'CACHE_CAPABILITY') {
    /** @param {boolean} ok */
    const reply = (ok) => event.source?.postMessage({ type: 'CAPABILITY_CACHED', id, ok })
    event.waitUntil(cacheCapability(id).then(reply))
  }
})

// A nudge from the relay (D736): something came for the person while no Jean was on screen, which would read its mailbox itself. It
// holds nothing; its words are those the page left, in the person's language (caps/people). A tap opens Jean.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    if ((await self.clients.matchAll({ type: 'window' })).some((client) => client.visibilityState === 'visible')) return
    const words = await (await (await caches.open('app-push')).match(url('push.json')))?.json().catch(() => null)
    await self.registration.showNotification(words?.title ?? new URL(self.registration.scope).host, { body: words?.body ?? '', lang: words?.lang, dir: words?.dir, tag: 'app-nudge', icon: url('icons/icon-192.png'), data: { hash: '' } })
  })())
})

// A notification the page couldn't show itself (Android's browsers): a tap brings Jean back, on its task.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const at = url(event.notification.data?.hash ?? '')
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(([client]) => (client ? client.focus().then(() => client.navigate(at)) : self.clients.openWindow(at))))
})

/** An update takes what hasn't changed from the caches before it, so big runtimes never come again. @param {unknown} id what a page asked for */
async function cacheCapability (id) {
  try {
    const listing = await (await caches.open(SHELL)).match(url('capabilities.json'))
    const { capabilities = {}, integrity = {} } = listing ? await listing.json() : {}
    if (typeof id !== 'string' || !Object.hasOwn(capabilities, id)) return false
    const cache = await caches.open(capabilityCache(id))
    const kept = await earlier(), missing = /** @type {string[]} */ ([])
    await Promise.all(capabilities[id].files.map(async (/** @type {string} */ path) => {
      if (await cache.match(url(path))) return
      const hit = await unchanged(kept, path, integrity[path])
      if (hit) await cache.put(url(path), hit[1]); else missing.push(path)
    }))
    // What comes from the network, one file at a time: runtimes include a 27 MB wasm.
    for (const path of missing) await cache.put(url(path), (await fetchVerified(path, integrity[path]))[1])
    return true
  } catch {
    return false
  }
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

// What another app shared with Jean (Web Share Target, D714): its words and files, held in this worker's memory, never in
// storage, until the page it opens asks for them by their id, a minute at most; then they go into the box as any shared.
const shared = new Map()
/** @param {Request} request */
async function received (request) {
  const form = await request.formData(), id = crypto.randomUUID()
  shared.set(id, { title: String(form.get('title') ?? ''), text: String(form.get('text') ?? ''), url: String(form.get('url') ?? ''), files: form.getAll('files').filter((/** @type {FormDataEntryValue} */ file) => file instanceof File) })
  setTimeout(() => shared.delete(id), 60_000)
  return Response.redirect(url(`?shared=${id}`), 303)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/share-target')) return event.respondWith(received(request))
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return
  event.respondWith(LOCAL ? networkFirst(request) : cacheFirst(request))
})

/** @param {Request} request */
async function cacheFirst (request) {
  return (await fromCache(request)) || fetch(request)
}

/** @param {Request} request */
async function networkFirst (request) {
  try {
    return await fetch(request)
  } catch (error) {
    const cached = await fromCache(request)
    if (cached) return cached
    throw error
  }
}

/** Looks in the current shell cache, then in unlocked capability caches. @param {Request} request */
async function fromCache (request) {
  const navigation = request.mode === 'navigate'
  const keys = navigation && isAppRoot(request.url) ? [url('index.html'), url('./')] : [request]
  const names = (await caches.keys()).filter((n) => n === SHELL || n.startsWith(`${CAPABILITY}${VERSION}-`))
  for (const key of keys) {
    for (const name of names) {
      const hit = await (await caches.open(name)).match(key, { ignoreSearch: navigation })
      if (hit) return navigation ? unredirect(hit) : hit
    }
  }
}

/** True for `./`, `./index.html`, and either with a query (OAuth returns to `./?code=…`). @param {string} href */
function isAppRoot (href) {
  const path = new URL(href).pathname
  return path === new URL(url('./')).pathname || path === new URL(url('index.html')).pathname
}

/** Browsers reject redirected responses for navigations; some hosts redirect index.html. @param {Response} response */
function unredirect (response) {
  if (!response.redirected) return response
  const { status, statusText, headers } = response
  return new Response(response.body, { status, statusText, headers })
}
