// Serves the bench page, Jean's own ONNX Runtime (app/vendor/transformers) and the scratch graphs, cross-origin isolated.
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const ROOTS = {
  '/ort/': new URL('../../../app/vendor/transformers/', import.meta.url).pathname,
  '/graphs/': new URL('../graphs/', import.meta.url).pathname,
  '/': new URL('./', import.meta.url).pathname,
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm' }
const port = Number(process.argv[2] ?? 4391)

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html')
  const prefix = Object.keys(ROOTS).find((p) => path.startsWith(p))
  const file = normalize(join(ROOTS[prefix], path.slice(prefix.length)))
  let size
  try { size = statSync(file).size } catch { res.writeHead(404).end(); return }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Content-Length': size,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cache-Control': 'no-store',
  })
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`))
