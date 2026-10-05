// Copies the three upfront runtime dependencies from node_modules into vendor/,
// which is gitignored (D51): npm run dev, start, build and check all run this first.
// From lit-html, only the files Jean's code can reach are copied. The on-demand
// runtimes (D52) go into their own folders, which only their capabilities cache.
// Usage: npm run vendor
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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
  const text = await readFile(join(MODULES, pkg, 'LICENSE')).catch(async () => {
    // Some packages (onnxruntime-web) ship no LICENSE file: record what package.json declares.
    const { name, version, license, repository } = JSON.parse(await readFile(join(MODULES, pkg, 'package.json'), 'utf8'))
    return `${name} ${version} is distributed under the ${license} license.\nSource: ${repository?.url ?? repository ?? ''}\n`
  })
  await writeFile(to, text)
}

/**
 * On-demand runtimes (D52), each in its own folder. `rewrite` maps bare specifiers to
 * files in the same folder, because import maps don't reach into workers. A folder entry
 * may keep only the files matching a pattern.
 * @type {{ dir: string, packages: string[], files: Array<[string, string]>, folders?: Array<[string, string, RegExp?]>, rewrite?: Record<string, string>, wrap?: Record<string, string[]> }[]}
 */
export const RUNTIMES = [
  {
    dir: 'vendor/pdfjs',
    packages: ['pdfjs-dist'],
    // The legacy build runs on Safari 16.4 (D40). Character maps are needed to read CJK
    // text, and the standard fonts' metrics to space text set in them.
    files: [['pdfjs-dist/legacy/build/pdf.min.mjs', 'pdf.min.mjs'], ['pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs']],
    folders: [['pdfjs-dist/cmaps', 'cmaps'], ['pdfjs-dist/standard_fonts', 'standard_fonts']],
  },
  {
    dir: 'vendor/transformers',
    packages: ['@huggingface/transformers', 'onnxruntime-web'],
    files: [
      ['@huggingface/transformers/dist/transformers.web.min.js', 'transformers.web.min.js'],
      ['onnxruntime-web/dist/ort.webgpu.bundle.min.mjs', 'ort.webgpu.bundle.min.mjs'],
      ['onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.mjs'],
      ['onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.asyncify.wasm'],
    ],
    rewrite: { 'onnxruntime-web/webgpu': './ort.webgpu.bundle.min.mjs', 'onnxruntime-common': './ort.webgpu.bundle.min.mjs' },
  },
  {
    // QuickJS for Calculations (D13, D48): flat, so the sandbox can load it from blob URLs.
    dir: 'vendor/quickjs',
    packages: ['quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync', '@jitl/quickjs-ffi-types'],
    files: [
      ['@jitl/quickjs-ffi-types/dist/index.mjs', 'ffi-types.mjs'],
      ['@jitl/quickjs-wasmfile-release-sync/dist/ffi.mjs', 'ffi.mjs'],
      ['@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.browser.mjs', 'emscripten-module.mjs'],
      ['@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm', 'emscripten-module.wasm'],
    ],
    folders: [['quickjs-emscripten-core/dist', '.', /\.mjs$/]],
    rewrite: { '@jitl/quickjs-ffi-types': './ffi-types.mjs' },
  },
  {
    // Pyodide for the data toolkit (D43): the loader, the runtime, the standard library and the
    // lock file, which the Python sandbox receives from Jean instead of fetching them (D80).
    dir: 'vendor/pyodide',
    packages: ['pyodide'],
    files: ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'].map((name) => [`pyodide/${name}`, name]),
  },
  {
    // The Computer's shell (D162): just-bash's browser build and what it imports, flat. diff and
    // sprintf-js ship only as CommonJS or UMD, so each is wrapped as a module naming what it exports;
    // node:zlib is the worker's own few lines over fflate.
    dir: 'vendor/just-bash',
    packages: ['just-bash', 'diff', 'sprintf-js', 'turndown', 'fflate'],
    files: [
      ['just-bash/dist/bundle/browser.js', 'just-bash.mjs'],
      ['diff/dist/diff.js', 'diff.mjs'],
      ['sprintf-js/src/sprintf.js', 'sprintf.mjs'],
      ['turndown/lib/turndown.browser.es.js', 'turndown.mjs'],
      ['fflate/esm/browser.js', 'fflate.mjs'],
    ],
    rewrite: { diff: './diff.mjs', 'sprintf-js': './sprintf.mjs', turndown: './turndown.mjs', 'node:zlib': './node-zlib.mjs' },
    wrap: { 'diff.mjs': ['diffArrays', 'diffLines', 'createPatch'], 'sprintf.mjs': ['sprintf', 'vsprintf'] },
  },
]

/**
 * A CommonJS or UMD file as a module: it fills `module.exports`, whose names are then exported.
 * @param {string} text @param {string[]} names
 */
export function wrapCommonJS (text, names) {
  return `const module = { exports: {} }, exports = module.exports;\n${text}\n;export const { ${names.join(', ')} } = module.exports\nexport default module.exports\n`
}

/**
 * Points bare import specifiers at local files: `from"x"` and `from "x"`.
 * @param {string} text @param {Record<string, string>} map
 */
export function rewriteSpecifiers (text, map) {
  let out = text
  for (const [from, to] of Object.entries(map)) out = out.replace(new RegExp(`(\\bfrom\\s*)(["'])${from.replace(/[/.]/g, '\\$&')}\\2`, 'g'), `$1$2${to}$2`)
  return out
}

/** @param {(typeof RUNTIMES)[number]} runtime */
async function copyRuntime (runtime) {
  const target = join(ROOT, runtime.dir)
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  let raw = 0
  /** @param {string} from @param {string} to */
  const copy = async (from, to) => {
    if (/\.m?js$/.test(to)) {
      const source = rewriteSpecifiers(stripSourceMaps(await readFile(join(MODULES, from), 'utf8')), runtime.rewrite ?? {})
      const text = runtime.wrap?.[to] ? wrapCommonJS(source, runtime.wrap[to]) : source
      await writeFile(join(target, to), text)
      raw += Buffer.byteLength(text)
    } else {
      await copyFile(join(MODULES, from), join(target, to))
      raw += (await readFile(join(target, to))).length
    }
  }
  for (const [from, to] of runtime.files) await copy(from, to)
  for (const [from, to, only] of runtime.folders ?? []) {
    await mkdir(join(target, to), { recursive: true })
    for (const name of await readdir(join(MODULES, from))) if (!only || only.test(name)) await copy(join(from, name), join(to, name))
  }
  for (const pkg of runtime.packages) await copyLicense(pkg)
  console.log(`${`${runtime.dir}/ (on demand)`.padEnd(48)} ${kb(raw).padStart(9)}`)
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
  for (const runtime of RUNTIMES) {
    // Optional dependencies (D52): without them, their capability is simply unavailable.
    if (await readFile(join(MODULES, runtime.packages[0], 'package.json')).catch(() => null)) await copyRuntime(runtime)
    else console.log(`${runtime.dir}/: ${runtime.packages[0]} is not installed; skipped`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`vendor: ${error.message}`)
    process.exit(1)
  })
}
