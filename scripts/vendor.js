// Copies the three upfront runtime dependencies from node_modules into app/vendor/,
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
const APP = join(ROOT, 'app')
const MODULES = join(ROOT, 'node_modules')
const VENDOR = join(APP, 'vendor')

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
  console.log(`${relative(APP, to).padEnd(48)} ${kb(raw).padStart(10)} ${kb(gzip).padStart(10)} gz`)
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
  const importMap = parseImportMap(await readFile(join(APP, 'index.html'), 'utf8'))
  const sources = (await Promise.all(['core', 'ui', 'caps'].map((dir) => walk(APP, dir)))).flat()
  const entries = new Set()
  for (const path of sources.filter((p) => /\.m?js$/.test(p))) {
    for (const [, specifier] of (await readFile(join(APP, path), 'utf8')).matchAll(LIT_SPECIFIER)) {
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
    results.push(await copyJs(join(MODULES, 'lit-html', path.slice(LIT_HTML.length)), join(APP, path)))
  }
  return results
}

/** @param {string} pkg */
async function copyLicense (pkg) {
  const to = join(VENDOR, 'LICENSES', licenseName(pkg))
  await mkdir(dirname(to), { recursive: true })
  const text = await readFile(join(MODULES, pkg, 'LICENSE')).catch(() => readFile(join(MODULES, pkg, 'LICENSE.md'))).catch(async () => {
    // Some packages (onnxruntime-web) ship no LICENSE file: record what package.json declares.
    const { name, version, license, repository } = JSON.parse(await readFile(join(MODULES, pkg, 'package.json'), 'utf8'))
    return `${name} ${version} is distributed under the ${license} license.\nSource: ${repository?.url ?? repository ?? ''}\n`
  })
  // Apache-2.0's NOTICE (ECharts') goes with the licence, and so do those of the WebAssembly a package ships (pdf.js's decoders).
  const notice = await readFile(join(MODULES, pkg, 'NOTICE'), 'utf8').catch(() => '')
  const wasm = (await readdir(join(MODULES, pkg, 'wasm')).catch(() => [])).filter((name) => /^LICENSE_(PDFJS_)?(JBIG2|OPENJPEG)$/.test(name)).sort()
  const bundled = await Promise.all(wasm.map((name) => readFile(join(MODULES, pkg, 'wasm', name), 'utf8')))
  await writeFile(to, [text, notice, ...bundled].filter(Boolean).join('\n\n'))
}

/**
 * On-demand runtimes (D52), each in its own folder. `rewrite` maps bare specifiers to
 * files in the same folder, because import maps don't reach into workers. A folder entry
 * may keep only the files matching a pattern. `scripts` are CommonJS files made one classic script
 * (`classicScript`); `graph` copies what entries import, for an import map (`forImportMap`).
 * `global` makes a script that declares one variable a module whose default export it is.
 * `patch` makes exact replacements in a file (`patchSource`), or in a package's file a bundle reads. `bundle` makes one
 * minified module of what the modules of a folder of Jean's import by the names `specifier` matches (`bundled`), or of `names` from `package`.
 * @type {{ dir: string, packages: string[], files: Array<[string, string]>, folders?: Array<[string, string, RegExp?]>, rewrite?: Record<string, string>, wrap?: Record<string, string[]>, global?: Record<string, string>,
 *   patch?: Record<string, Array<[RegExp, string, number]>>, bundle?: { to: string, from?: string, specifier?: RegExp, package?: string, names?: string[] },
 *   scripts?: Record<string, [string, Record<string, string>, string]>, graph?: { from: string, entries: string[], prefix: string, skip: RegExp } }[]}
 */
export const RUNTIMES = [
  {
    dir: 'vendor/pdfjs',
    packages: ['pdfjs-dist'],
    // The legacy build runs on Safari 16.4 (D40). Character maps are needed to read CJK
    // text, and the standard fonts' metrics to space text set in them. Scans are pictures in JBIG2,
    // CCITT fax or JPEG 2000, which its WebAssembly decodes (D479); their licences join its own.
    files: [['pdfjs-dist/legacy/build/pdf.min.mjs', 'pdf.min.mjs'], ['pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs']],
    folders: [['pdfjs-dist/cmaps', 'cmaps'], ['pdfjs-dist/standard_fonts', 'standard_fonts'], ['pdfjs-dist/wasm', 'wasm', /^(jbig2|openjpeg)\.wasm$/]],
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
    // QuickJS for Calculations (D13, D48): flat, so the sandbox can load it from blob URLs. Node's
    // Buffer for its scripts (D178) is feross's, with what it requires, as one classic script.
    dir: 'vendor/quickjs',
    packages: ['quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync', '@jitl/quickjs-ffi-types', 'buffer', 'base64-js', 'ieee754'],
    files: [
      ['@jitl/quickjs-ffi-types/dist/index.mjs', 'ffi-types.mjs'],
      ['@jitl/quickjs-wasmfile-release-sync/dist/ffi.mjs', 'ffi.mjs'],
      ['@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.browser.mjs', 'emscripten-module.mjs'],
      ['@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm', 'emscripten-module.wasm'],
    ],
    folders: [['quickjs-emscripten-core/dist', '.', /\.mjs$/]],
    rewrite: { '@jitl/quickjs-ffi-types': './ffi-types.mjs' },
    scripts: { 'buffer.js': ['buffer/index.js', { 'base64-js': 'base64-js/index.js', ieee754: 'ieee754/index.js' }, 'globalThis.__buffer = module.exports\nglobalThis.Buffer = module.exports.Buffer'] },
  },
  {
    // Word, Excel and PowerPoint files, drawn as Office draws them (D183): each kind's modules, what
    // they import, and its parser. A page holds them as data: addresses (caps/files/office.js), under
    // an import map, which graph.json lists by kind; the parser's address goes in as data too, and its
    // worker starts as a classic script. The modules of drawing in a worker of its own aren't needed.
    dir: 'vendor/ooxml',
    packages: ['@silurus/ooxml'],
    files: ['docx', 'xlsx', 'pptx'].map((kind) => [`@silurus/ooxml/dist/${kind}_parser_bg.wasm`, `${kind}_parser_bg.wasm`]),
    graph: { from: '@silurus/ooxml/dist', entries: ['docx.mjs', 'xlsx.mjs', 'pptx.mjs'], prefix: 'ooxml/', skip: /^render-worker-host-/ },
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
  {
    // Formulas (D185): Temml turns LaTeX into MathML, which the browser draws. Its minified build
    // declares `temml`; it comes with its style sheet for local math fonts and the one font that names.
    dir: 'vendor/temml',
    packages: ['temml'],
    files: [['temml/dist/temml.min.js', 'temml.mjs'], ['temml/dist/Temml-Local.css', 'temml.css'], ['temml/dist/Temml.woff2', 'Temml.woff2']],
    global: { 'temml.mjs': 'temml' },
  },
  {
    // Charts (D196): ECharts' module build, whole, with zrender inside. It empties an element with
    // innerHTML, which Trusted Types refuse; replaceChildren() does the same.
    dir: 'vendor/echarts',
    packages: ['echarts', 'zrender'],
    files: [['echarts/dist/echarts.esm.min.mjs', 'echarts.mjs']],
    patch: { 'echarts.mjs': [[/\.innerHTML=(?:""|null)/g, '.replaceChildren()', 6]] },
  },
  {
    // Maps (D291): MapLibre GL's module build, its worker and its style sheet, lent to a page that holds
    // a map. A page's opaque origin starts no module worker from a blob, and MapLibre takes a blob's
    // address there for another origin's, which it would wrap in a module: it starts its worker as a
    // classic one, from the address it is given, and the worker's one export, which a classic worker
    // can't read, is taken off.
    dir: 'vendor/maplibre',
    packages: ['maplibre-gl'],
    files: [['maplibre-gl/dist/maplibre-gl.mjs', 'maplibre-gl.mjs'], ['maplibre-gl/dist/maplibre-gl-worker.mjs', 'maplibre-gl-worker.js'], ['maplibre-gl/dist/maplibre-gl.css', 'maplibre-gl.css']],
    patch: { 'maplibre-gl.mjs': [[/if\(!\w+\(e\)\)return (\w+)\(e,t\);/g, 'return $1(e,!1);', 1]], 'maplibre-gl-worker.js': [[/;export\{\w+ as default\};/g, ';', 1]] },
  },
  {
    // Scores (D196): abcjs draws ABC notation as SVG, its minified build made a module. It empties
    // with innerHTML and styles with style attributes, which Trusted Types and the CSP refuse: the
    // same, done with replaceChildren(), textContent and the CSSOM.
    dir: 'vendor/abcjs',
    packages: ['abcjs'],
    files: [['abcjs/dist/abcjs-basic-min.js', 'abcjs.mjs']],
    wrap: { 'abcjs.mjs': ['renderAbc'] },
    patch: { 'abcjs.mjs': [[/\.innerHTML=""/g, '.replaceChildren()', 3], [/\.innerHTML="&nbsp;"/g, '.textContent="\\xa0"', 1], [/\.setAttribute\("style",/g, '.style.cssText=(', 7]] },
  },
  {
    // A score's sound (D338): spessasynth_core plays SoundFonts, in a worker; SoundFont 3's samples
    // are Vorbis, which stb_vorbis decodes, in WebAssembly inside its module.
    dir: 'vendor/spessasynth',
    packages: ['spessasynth_core', 'stb-vorbis'],
    files: [['spessasynth_core/dist/index.js', 'spessasynth.mjs'], ['stb-vorbis/dist/index.js', 'stb-vorbis.mjs']],
    rewrite: { 'stb-vorbis': './stb-vorbis.mjs' },
  },
  {
    // The instruments (D338): MS Basic, a file for each group that shares samples, their index, and the
    // package's version, which a saved copy gets them at.
    dir: 'vendor/sounds',
    packages: ['@jean-is/sounds'],
    files: [],
    folders: [['@jean-is/sounds', '.', /\.sf3$|^(sounds|package)\.json$/]],
  },
  {
    // A shared link's QR code (D467): lean-qr's smallest build, which only encodes, in bytes.
    dir: 'vendor/lean-qr',
    packages: ['lean-qr'],
    files: [['lean-qr/nano.mjs', 'lean-qr.mjs']],
  },
  {
    // Documents' editor (D485): ProseMirror's packages and the three they need, as one module minified by esbuild
    // (`bundle`) that exports what the editor's own modules import from them as `#prosemirror` (scripts/prosemirror.js),
    // the name index.html's import map gives it; prosemirror-markdown without markdown-it, as Jean reads Markdown with marked and keeps only
    // its writer. The style sheets of the view, of tables and of the gap cursor, as they are.
    dir: 'vendor/prosemirror',
    packages: [...['model', 'transform', 'state', 'view', 'keymap', 'commands', 'history', 'inputrules', 'schema-list', 'tables', 'dropcursor', 'gapcursor', 'markdown'].map((name) => `prosemirror-${name}`), 'orderedmap', 'rope-sequence', 'w3c-keyname'],
    files: [['prosemirror-view/style/prosemirror.css', 'prosemirror.css'], ['prosemirror-tables/style/tables.css', 'tables.css'], ['prosemirror-gapcursor/style/gapcursor.css', 'gapcursor.css']],
    bundle: { to: 'prosemirror.mjs', from: 'caps/documents', specifier: /^#prosemirror$/ },
    patch: { 'prosemirror-markdown/dist/index.js': [[/^import MarkdownIt from 'markdown-it';\n/m, '', 1], [/^const defaultMarkdownParser = new MarkdownParser\([\s\S]*?^\}\);\n/m, '', 1], [/defaultMarkdownParser, /, '', 1]] },
  },
  {
    // Decks (D595): deck's module, which imports Jean's own marked through the import map, and its style sheet, whose
    // page size is set only while a deck alone is printed (caps/slides/save.js), so that a task printed keeps its own; its
    // kit from a PowerPoint template, loaded only when one is brought in (D602); and its PowerPoint writer, only when one is saved.
    dir: 'vendor/deck',
    packages: ['@codename/deck'],
    files: [['@codename/deck/dist/deck.mjs', 'deck.mjs'], ['@codename/deck/dist/deck.css', 'deck.css'], ['@codename/deck/dist/template.mjs', 'template.mjs'], ['@codename/deck/dist/pptx.mjs', 'pptx.mjs']],
    patch: { 'deck.css': [[/^ {2}@page \{[^}]*\}\n/m, '', 1]] },
  },
  {
    // A deck's diagrams (D592): Pele draws Mermaid's language with no DOM, in a module worker, its lazy build loading each
    // kind of diagram as one first shows, from beside it.
    dir: 'vendor/pele',
    packages: ['pele'],
    files: [],
    folders: [['pele/dist/esm', '.', /^lazy\.js$/], ['pele/dist/esm/chunks', 'chunks', /\.js$/]],
  },
  {
    // A deck saved as PowerPoint (D593): PptxGenJS's bundle, JSZip inside it, loaded only then; JSZip it leaves on
    // globalThis, which deck's writer needs too. Its regenerator sets a global that a module can't make by assigning
    // it, then falls back to new Function, which the CSP refuses: it is set on globalThis instead.
    dir: 'vendor/pptxgenjs',
    packages: ['pptxgenjs', 'jszip'],
    files: [['pptxgenjs/dist/pptxgen.bundle.js', 'pptxgen.mjs']],
    global: { 'pptxgen.mjs': 'PptxGenJS' },
    patch: { 'pptxgen.mjs': [[/try\{regeneratorRuntime=t\}catch\(e\)\{Function\("r","regeneratorRuntime = r"\)\(t\)\}/g, 'globalThis.regeneratorRuntime=t', 1]] },
  },
  {
    // A film made on this device (D585): Mediabunny writes the MP4 that the browser's own encoder fills (WebCodecs), from
    // the frames FastWan's worker draws; only what it uses, as one module, since its worker imports it by address.
    dir: 'vendor/mediabunny',
    packages: ['mediabunny'],
    files: [],
    bundle: { to: 'mediabunny.mjs', package: 'mediabunny', names: ['BufferTarget', 'CanvasSource', 'Mp4OutputFormat', 'Output', 'QUALITY_HIGH'] },
  },
  {
    // Games (D648): Phaser's minified module build, whole, lent to a game's frame, which alone runs it.
    // EventEmitter3 is inside it.
    dir: 'vendor/phaser',
    packages: ['phaser', 'eventemitter3'],
    files: [['phaser/dist/phaser.esm.min.js', 'phaser.mjs']],
  },
  {
    // A game's sounds (D648): ZzFX, a sound from a list of numbers, made one module.
    dir: 'vendor/zzfx',
    packages: ['zzfx'],
    files: [],
    bundle: { to: 'zzfx.mjs', package: 'zzfx', names: ['ZZFX', 'zzfx'] },
  },
]

/**
 * Exact replacements in a third-party file, each found as many times as expected, or the copy
 * fails: a new version that changed those lines is looked at again, never shipped half patched.
 * @param {string} text @param {Array<[RegExp, string, number]>} patches
 */
export function patchSource (text, patches) {
  return patches.reduce((out, [pattern, replacement, count]) => {
    const found = out.match(pattern)?.length ?? 0
    if (found !== count) throw new Error(`expected ${pattern} ${count} times, found it ${found}`)
    return out.replace(pattern, replacement)
  }, text)
}

/**
 * A CommonJS or UMD file as a module: it fills `module.exports`, whose names are then exported.
 * @param {string} text @param {string[]} names
 */
export function wrapCommonJS (text, names) {
  return `const module = { exports: {} }, exports = module.exports;\n${text}\n;export const { ${names.join(', ')} } = module.exports\nexport default module.exports\n`
}

/**
 * CommonJS files as one classic script: the main one, given the files it requires, then `then`,
 * which finds its exports as `module.exports`.
 * @param {string} main @param {Record<string, string>} required its source, by the name it requires it by @param {string} then
 */
export function classicScript (main, required, then) {
  const wrapped = (/** @type {string} */ text) => `(() => { const module = { exports: {} }, exports = module.exports;\n${text}\nreturn module.exports })()`
  const modules = Object.entries(required).map(([name, text]) => `${JSON.stringify(name)}: ${wrapped(text)}`)
  return `(() => {\nconst required = { ${modules.join(',\n')} }\nconst require = (name) => required[name]\nconst module = { exports: {} }, exports = module.exports;\n${main}\n${then}\n})();\n`
}

/**
 * A module for an import map of data: addresses, under which nothing resolves against the module's
 * own: its relative imports, static or dynamic, named under `prefix`, and an address worked out from
 * import.meta.url made from a site that never resolves.
 * @param {string} text @param {string} prefix
 */
export function forImportMap (text, prefix) {
  return text
    .replace(/(\bimport\s*\(\s*|\bfrom\s*|\bimport\s*)(["'])\.\/([^"'\n]+)\2/g, `$1$2${prefix}$3$2`)
    .replace(/new URL\((["'][^"'\n]+["']),\s*import\.meta\.url\)/g, 'new URL($1, "https://package.invalid/")')
}

/**
 * A module's workers started as classic scripts, which an opaque origin can start from a blob, as
 * the preview's frame is (D183); browsers refuse module workers there. Their scripts then mustn't
 * use import.meta, which only revoked the blob's address.
 * @param {string} text
 */
export function classicWorkers (text) {
  return text.replace(/new Blob\(\["URL\.revokeObjectURL\(import\.meta\.url\);", /g, 'new Blob([').replace(/(new Worker\([^{]*\{\s*)type: "module",\s*/g, '$1')
}

/** The relative imports of a module, static or dynamic, by the file they name. */
const RELATIVE = /(?:\bimport\s*\(\s*|\bfrom\s*|\bimport\s*)["']\.\/([^"'\n]+)["']/g

/**
 * Points bare import specifiers at local files: `from"x"` and `from "x"`.
 * @param {string} text @param {Record<string, string>} map
 */
export function rewriteSpecifiers (text, map) {
  let out = text
  for (const [from, to] of Object.entries(map)) out = out.replace(new RegExp(`(\\bfrom\\s*)(["'])${from.replace(/[/.]/g, '\\$&')}\\2`, 'g'), `$1$2${to}$2`)
  return out
}

/**
 * One minified module of the names a folder of Jean's modules imports from packages, and of what those need, so the
 * rest of each package is left out; a package's file is patched as it is read. @param {(typeof RUNTIMES)[number]} runtime
 */
async function bundled (runtime) {
  const { from = '', specifier = /$^/, package: pkg, names: listed } = /** @type {NonNullable<typeof runtime.bundle>} */ (runtime.bundle)
  /** @type {Map<string, Set<string>>} */
  const names = new Map(pkg && listed ? [[pkg, new Set(listed)]] : [])
  for (const path of from ? (await walk(APP, from)).filter((p) => p.endsWith('.js')) : []) {
    for (const [, list, name] of (await readFile(join(APP, path), 'utf8')).matchAll(/^import \{([^}]+)\} from '([^']+)'/gm)) {
      if (specifier.test(name)) for (const one of list.split(',').filter((part) => part.trim())) names.set(name, (names.get(name) ?? new Set()).add(one.trim().split(/\s+as\s+/)[0]))
    }
  }
  const { build } = await import('esbuild')
  const patch = { name: 'patch', setup: (/** @type {any} */ b) => b.onLoad({ filter: /\.m?js$/ }, async (/** @type {{ path: string }} */ args) => {
    const at = Object.keys(runtime.patch ?? {}).find((path) => args.path.endsWith(`/node_modules/${path}`))
    return at ? { contents: patchSource(await readFile(args.path, 'utf8'), runtime.patch?.[at] ?? []), loader: 'js' } : undefined
  }) }
  const contents = [...names].map(([name, list]) => `export { ${[...list].sort().join(', ')} } from '${name}'`).join('\n')
  const result = await build({ stdin: { contents, resolveDir: ROOT }, bundle: true, minify: true, format: 'esm', target: 'es2022', legalComments: 'none', write: false, logLevel: 'error', plugins: [patch] })
  return result.outputFiles[0].text
}

/** @param {(typeof RUNTIMES)[number]} runtime */
async function copyRuntime (runtime) {
  const target = join(APP, runtime.dir)
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  let raw = 0
  /** @param {string} from @param {string} to */
  const copy = async (from, to) => {
    if (/\.m?js$/.test(to)) {
      const source = patchSource(rewriteSpecifiers(stripSourceMaps(await readFile(join(MODULES, from), 'utf8')), runtime.rewrite ?? {}), runtime.patch?.[to] ?? [])
      const text = runtime.wrap?.[to] ? wrapCommonJS(source, runtime.wrap[to]) : runtime.global?.[to] ? `${source}\nexport default ${runtime.global[to]}\n` : source
      await writeFile(join(target, to), text)
      raw += Buffer.byteLength(text)
    } else {
      await copyFile(join(MODULES, from), join(target, to))
      raw += (await readFile(join(target, to))).length
    }
  }
  for (const [from, to] of runtime.files) await copy(from, to)
  if (runtime.bundle) {
    const text = await bundled(runtime)
    await writeFile(join(target, runtime.bundle.to), text)
    raw += Buffer.byteLength(text)
  }
  for (const [from, to, only] of runtime.folders ?? []) {
    await mkdir(join(target, to), { recursive: true })
    for (const name of await readdir(join(MODULES, from))) if (!only || only.test(name)) await copy(join(from, name), join(to, name))
  }
  /** @param {string} path */
  const source = (path) => readFile(join(MODULES, path), 'utf8')
  for (const [to, [main, required, then]] of Object.entries(runtime.scripts ?? {})) {
    const sources = Object.fromEntries(await Promise.all(Object.entries(required).map(async ([name, path]) => [name, await source(path)])))
    await writeFile(join(target, to), classicScript(await source(main), sources, then))
  }
  if (runtime.graph) {
    const { from, entries, prefix, skip } = runtime.graph
    /** @type {Record<string, string[]>} */
    const graph = {}
    for (const entry of entries) {
      const found = (graph[entry.replace(/\.m?js$/, '')] = /** @type {string[]} */ ([]))
      /** @param {string} name */
      const visit = async (name) => {
        if (found.includes(name) || skip.test(name)) return
        found.push(name)
        for (const [, next] of (await source(join(from, name))).matchAll(RELATIVE)) await visit(next)
      }
      await visit(entry)
    }
    for (const name of new Set(Object.values(graph).flat())) {
      const text = forImportMap(classicWorkers(stripSourceMaps(await source(join(from, name)))), prefix)
      await writeFile(join(target, name), text)
      raw += Buffer.byteLength(text)
    }
    await writeFile(join(target, 'graph.json'), `${JSON.stringify(graph)}\n`)
  }
  for (const pkg of runtime.packages) await copyLicense(pkg)
  console.log(`${`${runtime.dir}/ (on demand)`.padEnd(48)} ${kb(raw).padStart(10)}`)
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
  console.log(`${`${results.length} files`.padEnd(48)} ${kb(raw).padStart(10)} ${kb(gzip).padStart(10)} gz`)
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
