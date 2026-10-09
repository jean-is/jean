// Runs the gateway (gateway.js, D191) on Node 22 or later, with nothing to install:
//   GATEWAY_CONFIG='{"origins":["https://jean.example"]}' node gateway/serve.js
// PORT (8787 by default) and HOST (127.0.0.1; 0.0.0.0 to answer other machines) say where it listens.
// `npm run dev:gateway` mounts it in Jean's own development server instead (scripts/serve.js).
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import { gateway } from './gateway.js'

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
  const response = await handle(request).catch(() => Response.json({ error: 'The service could not be reached.' }, { status: 502 }))
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (response.body) await pipeline(Readable.fromWeb(/** @type {any} */ (response.body)), res).catch(() => res.destroy())
  else res.end()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT) || 8787
  const HOST = process.env.HOST ?? '127.0.0.1'
  createServer(listener(gateway(JSON.parse(process.env.GATEWAY_CONFIG ?? '{}')))).listen(PORT, HOST, () => console.log(`Gateway on http://${HOST}:${PORT}/`))
}
