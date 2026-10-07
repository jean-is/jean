// Runs the gateway (gateway.js, D191) on Node 22 or later, with nothing to install:
//   GATEWAY_CONFIG='{"origins":["https://jean.example"],"hosts":["googleapis.com"]}' node gateway/serve.js
// PORT (8787 by default) and HOST (127.0.0.1; 0.0.0.0 to answer other machines) say where it listens.
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { gateway } from './gateway.js'

const handle = gateway(JSON.parse(process.env.GATEWAY_CONFIG ?? '{}'))
const PORT = Number(process.env.PORT) || 8787
const HOST = process.env.HOST ?? '127.0.0.1'

createServer(async (req, res) => {
  const headers = new Headers(Object.entries(req.headers).flatMap(([name, value]) => (typeof value === 'string' ? [[name, value]] : [])))
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : /** @type {ReadableStream} */ (Readable.toWeb(req))
  const request = new Request(new URL(req.url ?? '/', `http://${req.headers.host ?? HOST}`), { method: req.method, headers, body, duplex: 'half' })
  const response = await handle(request).catch(() => Response.json({ error: 'The service could not be reached.' }, { status: 502 }))
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (response.body) await pipeline(Readable.fromWeb(/** @type {any} */ (response.body)), res).catch(() => res.destroy())
  else res.end()
}).listen(PORT, HOST, () => console.log(`Gateway on http://${HOST}:${PORT}/`))
