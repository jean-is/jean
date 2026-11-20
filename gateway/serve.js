// SPDX-License-Identifier: MIT
// Runs the gateway (gateway.js, D191) on Node 22 or later, with nothing to install:
//   GATEWAY_CONFIG='{"origins":["https://jean.example"]}' node gateway/serve.js
// PORT (8787 by default) and HOST (127.0.0.1; 0.0.0.0 to answer other machines) say where it listens.
// GATEWAY_CONFIG_FILE names a file to read the configuration from instead, read again whenever it changes: on a
// company's own server, the keeper writes it from the owner's signed changes (D762), in a folder nothing serves.
// `npm run dev:gateway` mounts it in Jean's own development server instead (scripts/serve.js).
import { readFileSync, watchFile } from 'node:fs'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import { gateway } from './gateway.js'

/**
 * The gateway's handler from a file, made again whenever the file changes; while it is missing or can't be read, the
 * last good configuration, or `fallback` until there is one. What went wrong is named, never quoted: it holds secrets.
 * @param {string} file @param {import('./gateway.js').Config} fallback @param {number} [interval] milliseconds between looks
 * @returns {(request: Request) => Promise<Response>}
 */
export function reloading(file, fallback, interval = 1_000) {
  const read = () => {
    try { return gateway(JSON.parse(readFileSync(file, 'utf8'))) } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') console.error(`gateway: ${file} could not be read (${/** @type {Error} */ (error).name}); the previous configuration stays`)
      return null
    }
  }
  let handle = read() ?? gateway(fallback)
  watchFile(file, { interval, persistent: false }, () => { handle = read() ?? handle })
  return (request) => handle(request)
}

/**
 * A Node listener for a fetch handler: the request made web-standard, the answer streamed back.
 * A browser names no origin for a GET to its own: that page is on this server's.
 * @param {(request: Request) => Promise<Response>} handle
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export const listener = (handle) => async (req, res) => {
  const headers = new Headers(Object.entries(req.headers).flatMap(([name, value]) => (typeof value === 'string' ? [[name, value]] : [])))
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  if (!headers.has('origin') && headers.get('sec-fetch-site') === 'same-origin') headers.set('origin', url.origin)
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : /** @type {ReadableStream} */ (Readable.toWeb(req))
  const request = new Request(url, { method: req.method, headers, body, duplex: 'half' })
  const response = await handle(request).catch((error) => (console.error('gateway:', error), Response.json({ error: 'The service could not be reached.' }, { status: 502 })))
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (response.body) await pipeline(Readable.fromWeb(/** @type {any} */ (response.body)), res).catch(() => res.destroy())
  else res.end()
}

/**
 * A server that stops when its container does: on SIGTERM or SIGINT, no new connection, the idle ones closed, the rest
 * (an answer streaming) ended after `grace`, then out. As host/serve.js's stopping(), which this image doesn't hold.
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT) || 8787
  const HOST = process.env.HOST ?? '127.0.0.1'
  const config = JSON.parse(process.env.GATEWAY_CONFIG ?? '{}')
  const file = process.env.GATEWAY_CONFIG_FILE
  stopping(createServer(listener(file ? reloading(file, config) : gateway(config)))).listen(PORT, HOST, () => console.log(`Gateway on http://${HOST}:${PORT}/`))
}
