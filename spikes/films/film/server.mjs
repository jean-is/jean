// Serves the film page, Jean's own runtimes (app/vendor), the exported graphs, the reference's files and the
// tokenizer, cross-origin isolated, with byte ranges; POST /out/<name> keeps what the page sends.
import { createServer } from 'node:http'
import { createReadStream, createWriteStream, mkdirSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const here = (path) => new URL(path, import.meta.url).pathname
const ROOTS = {
  '/vendor/': new URL('../../../app/vendor/', import.meta.url).pathname,
  '/real/': here('../real/'),
  '/ref/': here('../ref/'),
  '/tokenizer/': here('../downloads/fastwan/tokenizer/'),
  '/': here('./'),
}
const OUT = here('../browser-out/')
mkdirSync(OUT, { recursive: true })
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' }
const ISOLATED = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-store' }

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html')
  if (req.method === 'POST' && path.startsWith('/out/')) {
    req.pipe(createWriteStream(join(OUT, path.slice(5).replace(/[^\w.-]/g, '_')))).on('finish', () => res.writeHead(204).end())
    return
  }
  const prefix = Object.keys(ROOTS).find((p) => path.startsWith(p))
  const file = normalize(join(ROOTS[prefix], path.slice(prefix.length)))
  let size
  try { size = statSync(file).size } catch { res.writeHead(404).end(); return }
  const type = TYPES[extname(file)] ?? 'application/octet-stream'
  const range = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? '')
  if (range) {
    const [start, end] = [Number(range[1]), Math.min(Number(range[2]), size - 1)]
    res.writeHead(206, { ...ISOLATED, 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` })
    createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { ...ISOLATED, 'Content-Type': type, 'Content-Length': size })
  createReadStream(file).pipe(res)
}).listen(Number(process.argv[2] ?? 47394), '127.0.0.1', () => console.log('ready'))
