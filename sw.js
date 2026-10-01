// Service worker: offline shell and per-capability caches (classic script).
// VERSION is rewritten by scripts/manifest.js whenever any shipped file changes.
const VERSION = '1bf8ab855f3e'
const SHELL = `app-shell-${VERSION}`
const CAPABILITY = 'app-cap-'
const LOCAL = ['localhost', '127.0.0.1'].includes(self.location.hostname)

/** Resolves an app-relative path against the scope, so sub-path deploys work. */
const url = (path) => new URL(path, self.registration.scope).href

// ─── Lifecycle ───────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOldShells().then(() => self.clients.claim()))
})

async function precacheShell () {
  const response = await fetch(url('capabilities.json'), { cache: 'no-store' })
  if (!response.ok) throw new Error(`capabilities.json: HTTP ${response.status}`)
  const cache = await caches.open(SHELL)
  await cache.put(url('capabilities.json'), response.clone())
  const { shell = [], locales = [] } = await response.json()
  const paths = ['./', ...shell, ...locales]
  await cache.addAll(paths.map((path) => new Request(url(path), { cache: 'no-cache' })))
}

async function deleteOldShells () {
  const names = await caches.keys()
  const old = names.filter((name) => name.startsWith('app-shell-') && name !== SHELL)
  await Promise.all(old.map((name) => caches.delete(name)))
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

async function cacheCapability (id) {
  try {
    const listing = await (await caches.open(SHELL)).match(url('capabilities.json'))
    const { capabilities = {} } = listing ? await listing.json() : {}
    if (typeof id !== 'string' || !Object.hasOwn(capabilities, id)) return false
    const cache = await caches.open(`${CAPABILITY}${id}`)
    await cache.addAll(capabilities[id].files.map((path) => new Request(url(path), { cache: 'no-cache' })))
    return true
  } catch {
    return false
  }
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
  const names = (await caches.keys()).filter((n) => n === SHELL || n.startsWith(CAPABILITY))
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
