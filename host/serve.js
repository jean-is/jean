// SPDX-License-Identifier: MIT
// Runs the share host (host.js, D361) on Node 22 or later, with nothing to install:
//   HOST_CONFIG='{"origins":["https://jean.example"]}' node host/serve.js
// PORT (8788 by default) and HOST (127.0.0.1; 0.0.0.0 to answer other machines) say where it listens,
// HOST_DIR (./shares by default) where it keeps shares, the records of changes and the reports.
// HOST_PROXIED=1 takes the address from the proxy in front (X-Client-Port, and X-Forwarded-For's last entry, the one the
// proxy itself saw: whoever connects can write anything before it).
// Its config may name `recordKey`, a public P-256 key (JWK): each record of a change is then sealed
// to it, and only its private half, kept elsewhere, opens them. Beside running it:
//   node host/serve.js keys               a key pair for the records: the public half for the config, the private one to keep offline
//   node host/serve.js open <key> <file>  the records of a day's file, opened with the private key (a JWK file)
//   node host/serve.js remove <id>        takes a share down; its address then says so
//   node host/serve.js take-down <name>   takes a site down (sites.js): a page saying so in its place, its name never free again
// With `sites` in its config, it publishes sites (sites.js): their names in HOST_DIR, their files there too, served by this
// host itself, unless `sites.bunny` names a Bunny storage zone, whose keys BUNNY_STORAGE_KEY and BUNNY_API_KEY give.
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { appendFile, mkdir, readdir, readFile, rm, writeFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { host } from './host.js'
import { bunny, sweepSites, takeDown } from './sites.js'

const DAY = 86_400_000
const ECDH = { name: 'ECDH', namedCurve: 'P-256' }
/** @param {Uint8Array} bytes */
const base64url = (bytes) => Buffer.from(bytes).toString('base64url')

/**
 * A record sealed to a public key: an ephemeral key's half, the nonce, then AES-256-GCM under the key
 * both halves agree on, read back with the private half alone. @param {string} text @param {CryptoKey} to
 */
export async function sealRecord(text, to) {
  const mine = await crypto.subtle.generateKey(ECDH, true, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'ECDH', public: to }, mine.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)))
  return base64url(new Uint8Array([...new Uint8Array(await crypto.subtle.exportKey('raw', mine.publicKey)), ...iv, ...sealed]))
}

/** A sealed record opened. @param {string} line @param {CryptoKey} key the private half */
export async function openRecord(line, key) {
  const bytes = Buffer.from(line, 'base64url')
  const theirs = await crypto.subtle.importKey('raw', bytes.subarray(0, 65), ECDH, false, [])
  const shared = await crypto.subtle.deriveKey({ name: 'ECDH', public: theirs }, key, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(65, 77) }, shared, bytes.subarray(77)))
}

/**
 * A folder as the host's store: each share's sealed copy and its metadata beside it, what it keeps of each site's name, a file
 * of records a day, sealed when there is a key, and the reports. Once a day, what has expired goes: a share past its end, a
 * record past a year, a taken-down share's notice past a year.
 * @param {string} dir @param {CryptoKey | null} recordKey @returns {import('./host.js').Store & import('./sites.js').Names & { sweep(): Promise<void> }}
 */
export function folder(dir, recordKey) {
  const shares = join(dir, 'shares')
  const names = join(dir, 'names')
  const records = join(dir, 'records')
  /** @param {string} id */
  const at = (id) => join(shares, id)
  /** @param {string} path */
  const json = (path) => readFile(path, 'utf8').then(JSON.parse, () => null)
  /** @param {string} path @param {string | Uint8Array} data */
  const write = async (path, data) => { await writeFile(`${path}.part`, data); await rename(`${path}.part`, path) }
  return {
    meta: (id) => json(`${at(id)}.json`),
    body: (id) => readFile(at(id)).then((bytes) => new Uint8Array(bytes), () => null),
    async put(id, meta, body) {
      await mkdir(shares, { recursive: true })
      if (body) await write(at(id), body)
      await write(`${at(id)}.json`, JSON.stringify(meta))
    },
    remove: async (id) => { await rm(at(id), { force: true }); await rm(`${at(id)}.json`, { force: true }) },
    held: (name) => json(join(names, `${name}.json`)),
    async hold(name, held) {
      await mkdir(names, { recursive: true })
      await write(join(names, `${name}.json`), JSON.stringify(held))
    },
    forget: (name) => rm(join(names, `${name}.json`), { force: true }),
    names: async () => (await readdir(names).catch(() => [])).flatMap((name) => (name.endsWith('.json') ? [name.slice(0, -5)] : [])),
    async report(text) {
      await mkdir(dir, { recursive: true })
      await appendFile(join(dir, 'reports.log'), `${text}\n`)
    },
    async record(text) {
      await mkdir(records, { recursive: true })
      await appendFile(join(records, `${new Date().toISOString().slice(0, 10)}.log`), `${recordKey ? await sealRecord(text, recordKey) : text}\n`)
    },
    async sweep() {
      const now = Date.now()
      for (const name of await readdir(shares).catch(() => [])) {
        if (!name.endsWith('.json')) continue
        const meta = await json(join(shares, name))
        const end = meta?.removed ? Date.parse(meta.removed) + 366 * DAY : Date.parse(meta?.expires ?? '')
        if (!(end > now)) await this.remove(name.slice(0, -5))
      }
      for (const name of await readdir(records).catch(() => [])) if (Date.parse(name.slice(0, 10)) + 366 * DAY < now) await rm(join(records, name), { force: true })
    },
  }
}

/**
 * Sites' files in a folder, `sites/<name>/<path>`, which the host serves itself; nothing to purge.
 * @param {string} dir @returns {import('./sites.js').Files}
 */
export function siteFiles(dir) {
  const at = (/** @type {string} */ name, /** @type {string} */ path) => join(dir, 'sites', name, ...path.split('/'))
  return {
    async put(name, path, bytes) {
      await mkdir(dirname(at(name, path)), { recursive: true })
      await writeFile(at(name, path), bytes)
    },
    drop: (name, path) => rm(at(name, path), { force: true }),
    purge: async () => {},
    read: (name, path) => readFile(at(name, path)).then((bytes) => new Uint8Array(bytes), () => null),
  }
}

/**
 * Where a host keeps its sites' files: Bunny's storage zone where its config names one, with the keys the environment
 * gives, or its folder. @param {import('./host.js').Config} config @param {string} dir
 */
export function filesOf(config, dir) {
  const where = config.sites?.bunny
  if (!config.sites) return undefined
  if (!where) return siteFiles(dir)
  const { BUNNY_STORAGE_KEY: storageKey = '', BUNNY_API_KEY: apiKey = '' } = process.env
  if (!storageKey || !apiKey) throw new Error('sites.bunny needs BUNNY_STORAGE_KEY and BUNNY_API_KEY')
  return bunny(where, { storageKey, apiKey }, config.sites.address)
}

/**
 * A Node listener for the host: the request made web-standard, with the address and port it came
 * from, the proxy's when it is behind one. @param {ReturnType<typeof host>} handle @param {boolean} proxied
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export const listener = (handle, proxied) => async (req, res) => {
  const headers = new Headers(Object.entries(req.headers).flatMap(([name, value]) => (typeof value === 'string' ? [[name, value]] : [])))
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : /** @type {ReadableStream} */ (Readable.toWeb(req))
  // Aborted once the client goes, so that a read waiting for it ends at once (relay/relay.js).
  const left = new AbortController()
  res.on('close', () => left.abort())
  const request = new Request(url, { method: req.method, headers, body, duplex: 'half', signal: left.signal })
  const forwarded = proxied ? headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() : ''
  const client = { address: forwarded || req.socket.remoteAddress || '', port: Number((proxied && headers.get('x-client-port')) || req.socket.remotePort || 0), protocol: `HTTP/${req.httpVersion}` }
  const response = await handle(request, client).catch((error) => { console.error(error); return Response.json({ error: 'Something went wrong.' }, { status: 500 }) })
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (response.body) await pipeline(Readable.fromWeb(/** @type {any} */ (response.body)), res).catch(() => res.destroy())
  else res.end()
  // What the answer left unread, a body refused by its length before it was read (host.js's within()), is read and dropped:
  // a client that reads the answer only once it has sent it all, as Linux WebKit does, would otherwise wait on a server
  // that no longer reads it.
  if (body && !req.complete) { req.removeAllListeners('data'); req.resume() }
}

/**
 * A server that stops when its container does. On SIGTERM or SIGINT it takes no new connection and closes the idle ones,
 * ends the rest after `grace` (a read waiting for a message, an upload, an answer streaming), then exits. Node as a
 * container's first process ignores SIGTERM otherwise, and waits to be killed when the orchestrator's patience ends.
 * The relay, the request service and this host share it; the gateway, whose image holds gateway/ alone, has its own.
 * @param {import('node:http').Server} server @param {number} [grace] milliseconds
 */
export function stopping(server, grace = 5_000) {
  const stop = () => {
    server.close(() => process.exit(0))
    server.closeIdleConnections()
    setTimeout(() => server.closeAllConnections(), grace).unref()
    setTimeout(() => process.exit(0), grace + 1_000).unref()
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  return server
}

/** @param {string[]} args */
export async function main([command, ...args]) {
  const config = JSON.parse(process.env.HOST_CONFIG ?? '{}')
  const dir = process.env.HOST_DIR ?? 'shares'
  if (command === 'keys') {
    const keys = await crypto.subtle.generateKey(ECDH, true, ['deriveKey'])
    return console.log(JSON.stringify({ recordKey: await crypto.subtle.exportKey('jwk', keys.publicKey), keep: await crypto.subtle.exportKey('jwk', keys.privateKey) }, null, 2))
  }
  if (command === 'open') {
    const key = await crypto.subtle.importKey('jwk', JSON.parse(await readFile(args[0], 'utf8')), ECDH, false, ['deriveKey'])
    for (const line of (await readFile(args[1], 'utf8')).split('\n').filter(Boolean)) console.log(line.startsWith('{') ? line : await openRecord(line, key))
    return
  }
  const recordKey = config.recordKey ? await crypto.subtle.importKey('jwk', config.recordKey, ECDH, false, []) : null
  const store = folder(dir, recordKey)
  if (command === 'remove') {
    const meta = await store.meta(args[0])
    await store.remove(args[0])
    await store.put(args[0], { ...(meta ?? { format: 1, salt: '', token: '', expires: '', size: 0 }), removed: new Date().toISOString() })
    return console.log(`Taken down: ${args[0]}`)
  }
  const files = filesOf(config, dir)
  if (command === 'take-down') {
    if (!files) throw new Error('This host publishes no sites.')
    await takeDown(args[0], store, files)
    return console.log(`Taken down: ${args[0]}`)
  }
  // The viewer as npm run host wrote it beside this file, unless the config says otherwise.
  const viewer = config.viewer ?? await readFile(new URL('viewer.json', import.meta.url), 'utf8').then(JSON.parse, () => undefined)
  const PORT = Number(process.env.PORT) || 8788
  const HOST = process.env.HOST ?? '127.0.0.1'
  const sweep = async () => { await store.sweep(); if (files) await sweepSites(store, files) }
  await sweep()
  setInterval(() => sweep().catch(console.error), DAY).unref()
  const handle = host({ ...config, render: config.render ?? viewer?.render, sounds: config.sounds ?? viewer?.sounds, viewer, store, files })
  stopping(createServer(listener(handle, process.env.HOST_PROXIED === '1'))).listen(PORT, HOST, () => console.log(`Share host on http://${HOST}:${PORT}/, keeping shares in ${dir}`))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2))
