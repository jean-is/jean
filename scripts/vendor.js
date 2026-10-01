// Copies the three upfront runtime dependencies from node_modules into vendor/.
// Usage: npm run vendor
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

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

/** @param {string} name */
export function isProductionJs (name) {
  return name.endsWith('.js') && !name.endsWith('.d.ts')
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

/** @param {string} dir */
async function jsFilesIn (dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter((e) => e.isFile() && isProductionJs(e.name)).map((e) => e.name).sort()
}

async function copyLitHtml () {
  const source = join(MODULES, 'lit-html')
  const target = join(VENDOR, 'lit-html')
  await rm(target, { recursive: true, force: true })
  const results = []
  for (const sub of ['', 'directives']) {
    for (const name of await jsFilesIn(join(source, sub))) {
      results.push(await copyJs(join(source, sub, name), join(target, sub, name)))
    }
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
