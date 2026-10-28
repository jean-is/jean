import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
const root = new URL('.', import.meta.url).pathname
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' }
http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'parent.html'
  if (path.startsWith('..')) return res.writeHead(404).end()
  // Jean's own relay, as it is; the engines' files are built into vendor/ (see findings.md).
  // The engines from VENDOR when set, a folder outside the repository: they are third-party.
  const file = path === 'preview.html' ? join(root, '../../app/preview.html') : path.startsWith('vendor/') && process.env.VENDOR ? join(process.env.VENDOR, path.slice(7)) : join(root, path)
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body) } catch { res.writeHead(404).end() }
}).listen(Number(process.env.PORT ?? 4290), '127.0.0.1', () => console.log('listening'))
