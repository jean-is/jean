// Service worker: offline shell and per-capability caches (classic script).
// VERSION is rewritten by scripts/manifest.js whenever any shipped file changes.
const VERSION = 'b154e7987301'
const SHELL = `app-shell-${VERSION}`
// Capability caches carry the version too: an update re-caches every unlocked capability,
// copying unchanged files over, so old code is never served next to a new shell.
const CAPABILITY = 'app-cap-'
const capabilityCache = (id) => `${CAPABILITY}${VERSION}-${id}`
const LOCAL = ['localhost', '127.0.0.1'].includes(self.location.hostname)

/** Resolves an app-relative path against the scope, so sub-path deploys work. */
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
  const files = await Promise.all([...shell, ...locales].map((path) => fetchVerified(path, integrity[path])))
  await cache.put(url('./'), root)
  await Promise.all(files.map(([path, file]) => cache.put(url(path), file)))
}

/**
 * Fetches through the HTTP cache, which the page has usually just filled, so
 * precaching costs no extra download. The integrity check catches a stale
 * cached copy; the file is then fetched again from the network.
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
    ids.add(name.slice(CAPABILITY.length + 13))
  }
  return [...ids]
}

async function recacheCapabilities () {
  for (const id of await unlockedCapabilities()) await cacheCapability(id)
}

// ─── Messages from the page ──────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const { type, id } = event.data || {}
  if (type === 'SKIP_WAITING') self.skipWaiting()
  if (type === 'CACHE_CAPABILITY') {
    const reply = (ok) => event.source?.postMessage({ type: 'CAPABILITY_CACHED', id, ok })
    event.waitUntil(cacheCapability(id).then(reply))
  }
})

// A notification the page couldn't show itself (Android's browsers, D334): a tap brings Jean back, on its task.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const at = url(event.notification.data?.hash ?? '')
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(([client]) => (client ? client.focus().then(() => client.navigate(at)) : self.clients.openWindow(at))))
})

async function cacheCapability (id) {
  try {
    const listing = await (await caches.open(SHELL)).match(url('capabilities.json'))
    const { capabilities = {}, integrity = {} } = listing ? await listing.json() : {}
    if (typeof id !== 'string' || !Object.hasOwn(capabilities, id)) return false
    const cache = await caches.open(capabilityCache(id))
    // One file at a time: runtimes include a 27 MB wasm.
    for (const path of capabilities[id].files) {
      if (await cache.match(url(path))) continue
      const [, file] = (await fromEarlierCache(path, integrity[path])) ?? await fetchVerified(path, integrity[path])
      await cache.put(url(path), file)
    }
    return true
  } catch {
    return false
  }
}

/**
 * An unchanged file from an earlier version's capability cache, so updates don't
 * download big runtimes again. Checked against the new integrity value.
 * @returns {Promise<[string, Response] | null>}
 */
async function fromEarlierCache (path, integrity) {
  if (!integrity) return null
  for (const name of await caches.keys()) {
    if (!name.startsWith(CAPABILITY) || name.startsWith(`${CAPABILITY}${VERSION}-`)) continue
    const hit = await (await caches.open(name)).match(url(path))
    if (!hit) continue
    const digest = await crypto.subtle.digest('SHA-256', await hit.clone().arrayBuffer())
    if (`sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}` === integrity) return [path, hit]
  }
  return null
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return
  event.respondWith(LOCAL ? networkFirst(request) : cacheFirst(request))
})

async function cacheFirst (request) {
  return (await fromCache(request)) || fetch(request)
}

async function networkFirst (request) {
  try {
    return await fetch(request)
  } catch (error) {
    const cached = await fromCache(request)
    if (cached) return cached
    throw error
  }
}

/** Looks in the current shell cache, then in unlocked capability caches. */
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

/** True for `./`, `./index.html`, and either with a query (OAuth returns to `./?code=…`). */
function isAppRoot (href) {
  const path = new URL(href).pathname
  return path === new URL(url('./')).pathname || path === new URL(url('index.html')).pathname
}

/** Browsers reject redirected responses for navigations; some hosts redirect index.html. */
function unredirect (response) {
  if (!response.redirected) return response
  const { status, statusText, headers } = response
  return new Response(response.body, { status, statusText, headers })
}
