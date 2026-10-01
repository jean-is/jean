// Copies the three upfront runtime dependencies from node_modules into vendor/,
// which is gitignored (D51): npm run dev, start, build and check all run this first.
// From lit-html, only the files Jean's code can reach are copied.
// Usage: npm run vendor
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { moduleGraph, parseImportMap, resolveSpecifier } from './graph.js'
import { walk } from './manifest.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MODULES = join(ROOT, 'node_modules')
const VENDOR = join(ROOT, 'vendor')

/**
 * Removes `//# sourceMappingURL=` comments, whether on their own line or
 * trailing the last line of minified code.
 * @param {string} text
 */
export function stripSourceMaps (text) {
  return text
    .replace(/^\/\/[#@] sourceMappingURL=.*$\n?/gm, '')
    .replace(/\/\/[#@] sourceMappingURL=\S*\s*$/, '\n')
}

/** @param {string} name  npm package name, e.g. '@preact/signals-core' */
export function licenseName (name) {
  return `${name.replace(/^@/, '').replace(/\//g, '-')}.txt`
}

/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

/**
 * @param {string} from  absolute source path
 * @param {string} to    absolute destination path
 */
async function copyJs (from, to) {
  const text = stripSourceMaps(await readFile(from, 'utf8'))
  await mkdir(dirname(to), { recursive: true })
  await writeFile(to, text)
  const raw = Buffer.byteLength(text)
  const gzip = gzipSync(text, { level: 9 }).length
  console.log(`${relative(ROOT, to).padEnd(48)} ${kb(raw).padStart(9)} ${kb(gzip).padStart(9)} gz`)
  return { raw, gzip }
}

const LIT_HTML = 'vendor/lit-html/'
const LIT_SPECIFIER = /['"](lit-html(?:\/[^'"\s]+)?)['"]/g

/**
 * The lit-html files Jean's code can reach: every `lit-html` specifier in its
 * sources (static, dynamic or in JSDoc), plus what those files import in turn.
 * @returns {Promise<string[]>}  root-relative paths under vendor/lit-html/
 */
async function litHtmlFiles () {
  const importMap = parseImportMap(await readFile(join(ROOT, 'index.html'), 'utf8'))
  const sources = (await Promise.all(['core', 'ui', 'caps'].map((dir) => walk(ROOT, dir)))).flat()
  const entries = new Set()
  for (const path of sources.filter((p) => /\.m?js$/.test(p))) {
    for (const [, specifier] of (await readFile(join(ROOT, path), 'utf8')).matchAll(LIT_SPECIFIER)) {
      const target = resolveSpecifier(specifier, path, importMap)
      if (target?.startsWith(LIT_HTML)) entries.add(target)
    }
  }
  /** @param {string} path */
  const read = (path) => readFile(join(MODULES, 'lit-html', path.slice(LIT_HTML.length)), 'utf8').catch(() => null)
  const { found, problems } = await moduleGraph([...entries], importMap, read)
  if (problems.length) throw new Error(`lit-html: ${problems.join('; ')}`)
  return found.sort()
}

async function copyLitHtml () {
  await rm(join(VENDOR, 'lit-html'), { recursive: true, force: true })
  const results = []
  for (const path of await litHtmlFiles()) {
    results.push(await copyJs(join(MODULES, 'lit-html', path.slice(LIT_HTML.length)), join(ROOT, path)))
  }
  return results
}

/** @param {string} pkg */
async function copyLicense (pkg) {
  const to = join(VENDOR, 'LICENSES', licenseName(pkg))
  await mkdir(dirname(to), { recursive: true })
  await writeFile(to, await readFile(join(MODULES, pkg, 'LICENSE')))
}

async function main () {
  const results = [
    await copyJs(join(MODULES, '@preact/signals-core/dist/signals-core.mjs'), join(VENDOR, 'signals-core.mjs')),
    await copyJs(join(MODULES, 'marked/lib/marked.esm.js'), join(VENDOR, 'marked.esm.js')),
    ...await copyLitHtml(),
  ]
  for (const pkg of ['@preact/signals-core', 'lit-html', 'marked']) await copyLicense(pkg)
  const raw = results.reduce((sum, r) => sum + r.raw, 0)
  const gzip = results.reduce((sum, r) => sum + r.gzip, 0)
  console.log(`${`${results.length} files`.padEnd(48)} ${kb(raw).padStart(9)} ${kb(gzip).padStart(9)} gz`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`vendor: ${error.message}`)
    process.exit(1)
  })
}
