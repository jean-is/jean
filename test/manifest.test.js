import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { brief } from '../scripts/budgets.js'
import { countLoc } from '../scripts/loc.js'
import { describePng, PNGS, recordSource, sourceOf } from '../scripts/icons.js'
import { jpegSize, webpSize } from '../scripts/screenshots.js'
import { LOCALES } from '../app/core/i18n.js'
import {
  extractStaticImports, linkedStylesheets, moduleGraph, parseImportMap, resolveSpecifier,
} from '../scripts/graph.js'
import {
  buildCapabilities, buildWebmanifest, collectFiles, computeVersion, integrityOf, isShipped, manifestOf, PAGES, plan, SHARE, shotsOf,
  stampPreloads, stampVersion,
} from '../scripts/manifest.js'
import { pageOf, resolveRequest } from '../scripts/serve.js'
import { rewriteSpecifiers, stripSourceMaps, classicScript, classicWorkers, forImportMap, patchSource } from '../scripts/vendor.js'

const IMPORT_MAP = {
  imports: {
    '@preact/signals-core': './vendor/signals-core.mjs',
    'lit-html': './vendor/lit-html/lit-html.js',
    'lit-html/': './vendor/lit-html/',
    marked: './vendor/marked.esm.js',
  },
}

/**
 * Creates a throwaway app folder from a { path: content } map.
 * @param {Record<string, string>} files
 */
async function fixture (files) {
  const root = await mkdtemp(join(tmpdir(), 'app-manifest-'))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  after(() => rm(root, { recursive: true, force: true }))
  return root
}

describe('manifest: file filters', () => {
  it('keeps shipped files', () => {
    assert.equal(isShipped('core/llm.js'), true)
    assert.equal(isShipped('vendor/lit-html/directives/repeat.js'), true)
    assert.equal(isShipped('fonts/display.woff2'), true)
  })

  it('skips docs, source maps, type declarations and dotfiles', () => {
    assert.equal(isShipped('core/README.md'), false)
    assert.equal(isShipped('caps/skills/directory/chart/SKILL.md'), true, 'a skill Jean ships (D196)')
    assert.equal(isShipped('vendor/marked.esm.js.map'), false)
    assert.equal(isShipped('vendor/lit-html/lit-html.d.ts'), false)
    assert.equal(isShipped('ui/.DS_Store'), false)
    assert.equal(isShipped('ui/.hidden/x.js'), false)
  })

  it('collects the shell and locales, skipping missing dirs and non-shipped files', async () => {
    const root = await fixture({
      'index.html': '<!doctype html>',
      'brand.js': 'export const BRAND = { name: "X", domain: "x.test" }\n',
      'sw.js': "const VERSION = 'dev'\n",
      'capabilities.json': '{}',
      'budgets.json': '{}',
      'package.json': '{}',
      'core/b.js': '',
      'core/a.js': '',
      'core/notes.md': '',
      'ui/app.js': '',
      'vendor/x.js.map': '',
      'locales/fr.json': '{}',
      'locales/en.json': '{}',
      'locales/dialogs/en.json': '{}',
      'locales/README.md': '',
      'docs/x.js': '',
      'test/x.test.js': '',
      'scripts/x.js': '',
      'icons/icon.svg': '',
      'icons/icon-512.png': '',
    })
    const { shell, locales } = await collectFiles(root)
    assert.deepEqual(shell, ['brand.js', 'core/a.js', 'core/b.js', 'icons/icon.svg', 'index.html', 'manifest.webmanifest', 'ui/app.js'])
    assert.deepEqual(locales, ['locales/dialogs/en.json', 'locales/en.json', 'locales/fr.json'])
  })
})

describe('manifest: capabilities', () => {
  it('lists each capability with its runtimes and its own strings, and keeps them out of the shell', async () => {
    const root = await fixture({
      'brand.js': '',
      'vendor/signals-core.mjs': '',
      'vendor/pdfjs/pdf.min.mjs': '',
      'vendor/pdfjs/cmaps/UniJIS-UTF16-H.bcmap': '',
      'vendor/transformers/ort.wasm': '',
      'caps/files/files.js': '',
      'caps/files/notes.md': '',
      'caps/made/made.js': '',
      'caps/browser/browser.js': '',
      'locales/en.json': '{}',
      'locales/browser/en.json': '{}',
      'locales/brains/en.json': '{}',
    })
    const { shell, locales, capabilities } = await collectFiles(root)
    assert.deepEqual(shell, ['brand.js', 'manifest.webmanifest', 'vendor/signals-core.mjs'])
    assert.deepEqual(locales, ['locales/brains/en.json', 'locales/en.json'], 'a capability\'s own strings come with it (D140), a part of the shell\'s with it (D514)')
    assert.deepEqual(capabilities, {
      browser: { files: ['caps/browser/browser.js', 'locales/browser/en.json'] },
      files: { files: ['caps/files/files.js', 'vendor/pdfjs/cmaps/UniJIS-UTF16-H.bcmap', 'vendor/pdfjs/pdf.min.mjs'] },
      made: { files: ['caps/made/made.js'] },
    })
  })

  it("lists the modules of another capability that one imports, so it works offline without the other on", async () => {
    const root = await fixture({
      'caps/computer/computer.js': "import { html } from 'lit-html'\nimport { exactText } from '../folders/work.js'\nimport { t } from '../../core/i18n.js'\nconst later = () => import('../browser/browser.js')",
      'caps/folders/work.js': "import { extractPages } from '../files/extract.js'",
      'caps/folders/folders.js': '',
      'caps/files/extract.js': '',
      'caps/browser/browser.js': '',
    })
    const { capabilities } = await collectFiles(root)
    assert.deepEqual(capabilities.computer.files, ['caps/computer/computer.js', 'caps/files/extract.js', 'caps/folders/work.js'])
    assert.deepEqual(capabilities.folders.files, ['caps/files/extract.js', 'caps/folders/folders.js', 'caps/folders/work.js'])
  })

  it('points bare specifiers of a vendored runtime at local files', () => {
    const map = { 'onnxruntime-web/webgpu': './ort.mjs', 'onnxruntime-common': './ort.mjs' }
    assert.equal(rewriteSpecifiers('import*as a from"onnxruntime-web/webgpu";import{Tensor as b}from "onnxruntime-common";x("onnxruntime-common")', map),
      'import*as a from"./ort.mjs";import{Tensor as b}from "./ort.mjs";x("onnxruntime-common")')
  })

  it('makes CommonJS files one classic script, as Buffer for QuickJS is (D178)', () => {
    const script = classicScript("const half = require('half'); module.exports.twice = (n) => half.of(n) * 4", { half: 'exports.of = (n) => n / 2' }, 'globalThis.made = module.exports')
    const scope = /** @type {{ made?: { twice: (n: number) => number } }} */ ({})
    new Function('globalThis', script)(scope)
    assert.equal(scope.made?.twice(3), 6)
  })

  it('readies a package’s modules for an import map of data: addresses, its workers classic (D183)', () => {
    assert.equal(forImportMap('import{a as b}from"./x-1.js";export*from "./y.js";import"./z.js";const c=()=>import("./w.js");const u=new URL("p_bg.wasm", import.meta.url).href', 'ooxml/'),
      'import{a as b}from"ooxml/x-1.js";export*from "ooxml/y.js";import"ooxml/z.js";const c=()=>import("ooxml/w.js");const u=new URL("p_bg.wasm", "https://package.invalid/").href')
    assert.equal(forImportMap('import x from"lit-html";s="../up.js"', 'ooxml/'), 'import x from"lit-html";s="../up.js"', 'bare and upward specifiers stay')
    assert.equal(classicWorkers('b = new Blob(["URL.revokeObjectURL(import.meta.url);", src], { type: "text/javascript" }); w = new Worker(t, {\n\t\ttype: "module",\n\t\tname: e?.name\n\t})'),
      'b = new Blob([src], { type: "text/javascript" }); w = new Worker(t, {\n\t\tname: e?.name\n\t})')
  })

  it('patches a library exactly as often as expected, or stops (D196)', () => {
    const clearing = /\.innerHTML=(?:""|null)/g
    assert.equal(patchSource('a.innerHTML="",b&&(b.innerHTML=null);c.setAttribute("style","x")', [[clearing, '.replaceChildren()', 2], [/\.setAttribute\("style",/g, '.style.cssText=(', 1]]),
      'a.replaceChildren(),b&&(b.replaceChildren());c.style.cssText=("x")')
    assert.throws(() => patchSource('a.innerHTML=""', [[clearing, '.replaceChildren()', 2]]), /found it 1/, 'a new version is looked at again')
  })
})

describe('manifest: version', () => {
  const entries = /** @type {Array<[string, string]>} */ ([['b.js', 'bb'], ['a.js', 'aa']])

  it('is 12 lowercase hex chars', () => {
    assert.match(computeVersion(entries), /^[0-9a-f]{12}$/)
  })

  it('does not depend on input order', () => {
    assert.equal(computeVersion(entries), computeVersion([...entries].reverse()))
  })

  it('changes when any hash or path changes', () => {
    const base = computeVersion(entries)
    assert.notEqual(computeVersion([['b.js', 'bc'], ['a.js', 'aa']]), base)
    assert.notEqual(computeVersion([['c.js', 'bb'], ['a.js', 'aa']]), base)
  })
})

describe('manifest: outputs', () => {
  it('stamps only the VERSION line', () => {
    const source = "// comment\nconst VERSION = 'dev'\nconst OTHER = 'dev'\n"
    assert.equal(stampVersion(source, 'abc123'), "// comment\nconst VERSION = 'abc123'\nconst OTHER = 'dev'\n")
    assert.equal(stampVersion('const X = 1\n', 'abc'), null)
  })

  it('builds a web manifest that works under a sub-path', () => {
    const manifest = JSON.parse(buildWebmanifest({ name: 'Test' }, 'One sentence.'))
    assert.equal(manifest.name, 'Test')
    assert.equal(manifest.short_name, 'Test')
    assert.equal(manifest.description, 'One sentence.')
    assert.equal(manifest.id, './')
    assert.equal(manifest.start_url, './')
    assert.equal(manifest.scope, './')
    assert.equal(manifest.icons[0].src, 'icons/icon.svg')
    assert.equal(JSON.parse(buildWebmanifest({ name: 'Test' })).description, undefined)
  })

  it('names the same app in every language, from manifests/, its addresses climbing back to app/ (D396)', () => {
    assert.equal(manifestOf('en'), 'manifest.webmanifest')
    assert.equal(manifestOf('fr'), 'manifests/fr.webmanifest')
    const manifest = JSON.parse(buildWebmanifest({ name: 'Test' }, 'One sentence.', 'fr', { welcome: 'Accueil' }))
    assert.equal(manifest.id, './')
    assert.equal(manifest.start_url, '../')
    assert.equal(manifest.scope, '../')
    assert.equal(manifest.icons[0].src, '../icons/icon.svg')
    assert.deepEqual(manifest.screenshots[0], { src: '../screenshots/fr/welcome-wide.webp', sizes: '1440x900', type: 'image/webp', form_factor: 'wide', label: 'Accueil' })
    assert.deepEqual([manifest.lang, manifest.dir], ['fr', 'ltr'])
    assert.equal(JSON.parse(buildWebmanifest({ name: 'Test' }, undefined, 'ar', {})).dir, 'rtl')
  })

  it('lists PNG icons Android can install with, one of them maskable, and none "any maskable"', () => {
    const { icons } = JSON.parse(buildWebmanifest({ name: 'Test' }))
    const png = (/** @type {string} */ sizes) => icons.some((/** @type {any} */ icon) => icon.type === 'image/png' && icon.sizes === sizes && !icon.purpose)
    assert.ok(png('192x192') && png('512x512'))
    assert.ok(icons.some((/** @type {any} */ icon) => icon.type === 'image/png' && icon.purpose === 'maskable'))
    assert.ok(icons.every((/** @type {any} */ icon) => !icon.purpose || icon.purpose === 'maskable'))
  })

  it('builds capabilities.json in format 2 with integrity values and an empty capability map', () => {
    const data = JSON.parse(buildCapabilities('v1', ['a.js'], ['locales/en.json'], { 'a.js': 'sha256-x' }))
    assert.deepEqual(data, {
      format: 2, version: 'v1', shell: ['a.js'], locales: ['locales/en.json'], integrity: { 'a.js': 'sha256-x' }, capabilities: {},
    })
  })

  it('turns a hex SHA-256 into a Subresource Integrity value', () => {
    assert.equal(integrityOf(createHash('sha256').update('a').digest('hex')), `sha256-${createHash('sha256').update('a').digest('base64')}`)
  })

  it('replaces modulepreload links with one per path, just before the module script', () => {
    const html = '<head>\n<link rel="modulepreload" href="old.js">\n<script type="module" src="ui/app.js"></script>\n</head>\n'
    assert.equal(stampPreloads(html, ['ui/app.js', 'core/a.js']),
      '<head>\n<link rel="modulepreload" href="ui/app.js">\n<link rel="modulepreload" href="core/a.js">\n<script type="module" src="ui/app.js"></script>\n</head>\n')
    assert.equal(stampPreloads(stampPreloads(html, ['x.js']) ?? '', ['x.js']), stampPreloads(html, ['x.js']))
    assert.equal(stampPreloads('<head></head>', ['x.js']), null)
  })

  it('plans every output without writing, and the version tracks content', async () => {
    const files = {
      'brand.js': 'export const BRAND = { name: "Planned", domain: "x.test" }\n',
      'sw.js': "// sw\nconst VERSION = 'dev'\n",
      'core/a.js': 'export const a = 1\n',
    }
    const first = await plan(await fixture(files))
    const second = await plan(await fixture({ ...files, 'core/a.js': 'export const a = 2\n' }))
    assert.notEqual(first.version, second.version)
    assert.match(first.outputs['sw.js'], new RegExp(`^const VERSION = '${first.version}'$`, 'm'))
    assert.equal(JSON.parse(first.outputs['manifest.webmanifest']).name, 'Planned')
    assert.deepEqual(JSON.parse(first.outputs['capabilities.json']).shell, ['brand.js', 'core/a.js', 'manifest.webmanifest'])
    assert.equal(first.outputs['index.html'], undefined)
  })

  it('preloads the first-load graph and hashes index.html as written', async () => {
    const root = await fixture({
      'brand.js': 'export const BRAND = { name: "P", domain: "x.test" }\n',
      'sw.js': "const VERSION = 'dev'\n",
      'index.html': '<script type="importmap">{"imports":{}}</script>\n<script type="module" src="ui/app.js"></script>\n',
      'ui/app.js': "import '../core/a.js'\nconst lazy = () => import('./lazy.js')\n",
      'ui/lazy.js': '',
      'core/a.js': '',
    })
    const { outputs } = await plan(root)
    assert.match(outputs['index.html'], /href="ui\/app.js">\n<link rel="modulepreload" href="core\/a.js">\n<script type="module"/)
    assert.doesNotMatch(outputs['index.html'], /lazy/)
    const { integrity } = JSON.parse(outputs['capabilities.json'])
    assert.equal(integrity['index.html'], `sha256-${createHash('sha256').update(outputs['index.html']).digest('base64')}`)
  })
})

const read = (/** @type {string} */ path) => readFile(new URL(`../app/${path}`, import.meta.url))

describe('manifest: icons', () => {
  it('draws every PNG that the web manifest and index.html name, at its size, from today\'s icon.svg', async () => {
    const html = (await read('index.html')).toString('utf8')
    const touch = /<link rel="apple-touch-icon" href="([^"]+)">/.exec(html)?.[1]
    assert.equal(touch && PNGS[touch], 180, 'iOS wants a 180 pixel apple-touch-icon')
    const named = [touch, ...JSON.parse(buildWebmanifest({ name: 'Test' })).icons.map((/** @type {any} */ icon) => icon.src)]
    for (const path of named.filter((path) => path?.endsWith('.png'))) assert.ok(path && PNGS[path], `${path} is drawn by scripts/icons.js`)
    const source = sourceOf(await read('icons/icon.svg'))
    for (const [path, size] of Object.entries(PNGS)) {
      assert.deepEqual(describePng(await read(path)), { width: size, height: size, source }, `${path} is stale: run \`npm run icons\``)
    }
  })

  it('records the drawing in a chunk that keeps the PNG readable', () => {
    const header = Buffer.from('0000000d49484452000000100000000808020000000000000000', 'hex')
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), header, Buffer.from('0000000049454e44ae426082', 'hex')])
    assert.deepEqual(describePng(png), { width: 16, height: 8, source: null })
    assert.deepEqual(describePng(recordSource(png, 'x sha256:1')), { width: 16, height: 8, source: 'x sha256:1' })
  })
})

describe('manifest: screenshots', () => {
  it('describes Jean in every language’s own words, English’s being index.html’s (D396)', async () => {
    const english = /<meta name="description" content="([^"]*)">/.exec((await read('index.html')).toString('utf8'))?.[1]
    assert.ok(english)
    assert.equal((await shotsOf('en')).description, undefined, 'English’s is index.html’s')
    for (const lang of LOCALES.filter((code) => code !== 'en')) {
      const { description } = await shotsOf(lang)
      assert.ok(description && description !== english, `${lang}: no description of its own in scripts/screenshots/${lang}.json`)
    }
    const { outputs } = await plan(await fixture({ 'brand.js': 'export const BRAND = { name: "P" }\n', 'sw.js': "const VERSION = 'dev'\n" }))
    assert.equal(JSON.parse(outputs[manifestOf('ja')]).description, (await shotsOf('ja')).description)
  })

  it('takes each page wide and narrow in every language, at the size its manifest says, in a shape Chromium shows (D396)', async () => {
    for (const lang of LOCALES) {
      const shots = await shotsOf(lang)
      assert.equal(shots.chart.columns.length, 4, `${lang}: a column for the regions and one for each month`)
      assert.equal(shots.chart.regions.length, 3, lang)
      assert.equal(shots.sources.answer.match(/\[1\]/g)?.length, 2, `${lang}: the answer cites the lease`)
      const { screenshots } = JSON.parse(buildWebmanifest({ name: 'Test' }, undefined, lang, shots.labels))
      for (const form of ['wide', 'narrow']) {
        // Chromium shows a form's first 8, and only those of the first one's shape.
        const ones = screenshots.filter((/** @type {any} */ shot) => shot.form_factor === form)
        assert.equal(ones.length, PAGES.length, `${lang} ${form}`)
        assert.ok(ones.length <= 8 && new Set(ones.map((/** @type {any} */ shot) => shot.sizes)).size === 1, `${lang} ${form}`)
      }
      for (const { src, sizes, form_factor: form, label } of screenshots) {
        assert.ok(label, `${src} has no label`)
        const [width, height] = sizes.split('x').map(Number)
        assert.deepEqual(webpSize(await read(src.replace(/^\.\.\//, ''))), { width, height }, `${src} is not ${sizes}: run \`npm run screenshots -- ${lang}\``)
        const [short, long] = [Math.min(width, height), Math.max(width, height)]
        assert.ok(short >= 320 && long <= 3840 && long <= 2.3 * short, `${src}: Chromium skips a screenshot this shape`)
        assert.equal(width > height, form === 'wide', `${src}: wide is landscape, narrow portrait`)
      }
    }
  })

  it('takes the picture a shared link shows at Open Graph\'s size (D355)', async () => {
    assert.deepEqual(jpegSize(await read(SHARE.src)), { width: SHARE.width, height: SHARE.height }, `${SHARE.src} is not ${SHARE.width}x${SHARE.height}: run \`npm run screenshots\``)
  })

  it('reads a JPEG\'s size from its frame header, after the segments before it', () => {
    const jpeg = Buffer.from('ffd8' + 'ffe000040000' + 'ffc0000b08' + '0008' + '0010' + '0101' + '1100', 'hex')
    assert.deepEqual(jpegSize(jpeg), { width: 16, height: 8 })
    assert.equal(jpegSize(Buffer.from('89504e470d0a1a0a', 'hex')), null)
  })

  it('reads a WebP\'s size from its first chunk, lossy or lossless', () => {
    const riff = (/** @type {string} */ chunk, /** @type {string} */ body) => Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP', 'latin1'), Buffer.from(chunk, 'latin1'), Buffer.alloc(4), Buffer.from(body, 'hex'), Buffer.alloc(8)])
    assert.deepEqual(webpSize(riff('VP8 ', '0000009d012a' + '1000' + '0800')), { width: 16, height: 8 })
    // 14 bits each, less one: 15 and 7.
    assert.deepEqual(webpSize(riff('VP8L', '2f' + '0fc00100')), { width: 16, height: 8 })
    assert.deepEqual(webpSize(riff('VP8X', '00000000' + '0f0000' + '070000')), { width: 16, height: 8 })
    assert.equal(webpSize(Buffer.from('89504e470d0a1a0a', 'hex')), null)
  })
})

describe('budgets: static imports', () => {
  it('finds every static import and re-export form', () => {
    const source = [
      "import a from './a.js'",
      "import { b, c as d } from './b.js'",
      "import * as e from './e.js'",
      "import f, { g } from './f.js'",
      "import './side-effect.js'",
      "import {\n  multi,\n  line,\n} from './multi.js'",
      "export { x } from './x.js'",
      "export * from './star.js'",
      "export * as ns from './ns.js'",
      'import { html } from "lit-html"',
    ].join('\n')
    assert.deepEqual(extractStaticImports(source), [
      './a.js', './b.js', './e.js', './f.js', './side-effect.js', './multi.js',
      './x.js', './star.js', './ns.js', 'lit-html',
    ])
  })

  it('handles minified code', () => {
    const source = 'import{noChange as e}from"../lit-html.js";import{directive as s}from"../directive.js";const u=1;'
    assert.deepEqual(extractStaticImports(source), ['../lit-html.js', '../directive.js'])
  })

  it('ignores dynamic imports, import.meta, comments and plain exports', () => {
    const source = [
      "const m = await import('./lazy.js')",
      'const here = import.meta.url',
      "// import x from './commented.js'",
      "/** @type {import('./types.js').T} */",
      " * import { y } from './in-jsdoc.js'",
      "export const z = 'from'",
      'export { local }',
      "const importance = 'from'",
    ].join('\n')
    assert.deepEqual(extractStaticImports(source), [])
  })
})

describe('budgets: import map and resolution', () => {
  const html = /* html */ `<!doctype html>
<!-- <link rel="stylesheet" href="commented.css"> -->
<link rel="stylesheet" href="ui/style.css">
<link href='ui/print.css' rel='stylesheet'>
<link rel="manifest" href="manifest.webmanifest">
<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>
<script type="module" src="ui/app.js"></script>`

  it('parses the import map', () => {
    assert.deepEqual(parseImportMap(html), IMPORT_MAP)
    assert.deepEqual(parseImportMap('<html></html>'), { imports: {} })
  })

  it('lists linked stylesheets only', () => {
    assert.deepEqual(linkedStylesheets(html), ['ui/style.css', 'ui/print.css'])
  })

  it('resolves exact and prefix bare specifiers through the map', () => {
    assert.equal(resolveSpecifier('lit-html', 'ui/app.js', IMPORT_MAP), 'vendor/lit-html/lit-html.js')
    assert.equal(resolveSpecifier('lit-html/directives/repeat.js', 'ui/app.js', IMPORT_MAP), 'vendor/lit-html/directives/repeat.js')
    assert.equal(resolveSpecifier('@preact/signals-core', 'core/x.js', IMPORT_MAP), 'vendor/signals-core.mjs')
  })

  it('resolves relative specifiers against the importing file', () => {
    assert.equal(resolveSpecifier('./chat.js', 'ui/app.js', IMPORT_MAP), 'ui/chat.js')
    assert.equal(resolveSpecifier('../core/i18n.js', 'ui/app.js', IMPORT_MAP), 'core/i18n.js')
    assert.equal(resolveSpecifier('../directive.js', 'vendor/lit-html/directives/repeat.js', IMPORT_MAP), 'vendor/lit-html/directive.js')
  })

  it('returns null for unknown bare specifiers and other origins', () => {
    assert.equal(resolveSpecifier('left-pad', 'ui/app.js', IMPORT_MAP), null)
    assert.equal(resolveSpecifier('https://cdn.example/x.js', 'ui/app.js', IMPORT_MAP), null)
  })

  it('walks the static graph, reporting missing files and unresolved specifiers', async () => {
    /** @type {Record<string, string>} */
    const files = {
      'ui/app.js': "import { html } from 'lit-html'\nimport './chat.js'\nconst lazy = () => import('../caps/x/index.js')",
      'ui/chat.js': "import { t } from '../core/i18n.js'\nimport 'left-pad'",
      'vendor/lit-html/lit-html.js': 'export const html = 1',
    }
    const read = async (/** @type {string} */ path) => files[path] ?? null
    const { found, problems } = await moduleGraph('ui/app.js', IMPORT_MAP, read)
    assert.deepEqual(found, ['ui/app.js', 'vendor/lit-html/lit-html.js', 'ui/chat.js'])
    assert.deepEqual(problems, ["cannot resolve 'left-pad' from ui/chat.js", 'missing core/i18n.js'])
  })
})

describe('budgets: lines of code (D246)', () => {
  it('counts lines with code, with or without a trailing newline, but not blank ones', () => {
    assert.equal(countLoc('', 'a.js'), 0)
    assert.equal(countLoc('a', 'a.js'), 1)
    assert.equal(countLoc('a\n', 'a.js'), 1)
    assert.equal(countLoc('a\n\n  \nb\n', 'a.js'), 2)
  })

  it('leaves out lines that only hold comments, and keeps code with a comment after it', () => {
    const js = ['// a note', '/**', ' * @param {string} a', ' */', 'const a = 1 // one', '/* inline */ const b = 2', 'const c = /** @type {number} */ (a)', '/* a', 'b */'].join('\n')
    assert.equal(countLoc(js, 'a.js'), 3)
    assert.equal(countLoc('#!/usr/bin/env node\n// what it is\nmain()\n', 'main.js'), 2)
  })

  it("reads strings, templates and regular expressions as code, whatever they hold", () => {
    assert.equal(countLoc("const url = 'https://example.com' // a site\nconst glob = \"**/*.js\"\nnext()", 'a.js'), 3)
    assert.equal(countLoc('const page = `\n// not a comment\n${a /* one */ + `/* nor ${b} this */`}\n`\n// a comment', 'a.js'), 4)
    assert.equal(countLoc('const re = /\\/\\/[/*]/g // slashes\nconst half = a / 2 // b / c\nreturn /[//]/.test(s)', 'a.js'), 3)
  })

  it('reads style sheets and pages by their own comments, with the scripts and styles a page holds', () => {
    assert.equal(countLoc("/* the box */\n.a { content: '/*'; }\n/*\n.b {}\n*/\n.c {}", 'a.css'), 2)
    assert.equal(countLoc('<!doctype html>\n<!-- the page\n-->\n<script>// a note\nrun()</script>\n<style>/* x */\n.a {}</style>', 'a.html'), 5)
  })

  it('says in a line or two what the development server says: each budget over, else those nearly full (D244)', () => {
    const row = (/** @type {string} */ name, /** @type {number} */ actual, /** @type {string[]} */ notes = []) => ({ name, limit: '100', actual: String(actual), status: /** @type {const} */ (actual <= 100 && !notes.length ? 'ok' : 'FAIL'), notes, share: actual / 100 })
    assert.equal(brief([row('loc.core', 50), row('loc.cli', 60)]), 'budgets: all met')
    assert.equal(brief([row('loc.core', 50), row('loc.app', 99)]), 'budgets: all met; nearly full: loc.app 99 of 100')
    assert.equal(brief([row('loc.app', 101), row('gzipKB.css', 0, ['missing ui/style.css'])]),
      'budgets: FAILED loc.app: 101 of 100\nbudgets: FAILED gzipKB.css: 0 of 100; missing ui/style.css\nGoing over a limit means deleting something first (AGENTS.md).')
  })
})

describe('vendor and serve helpers', () => {
  it('strips source map comments on their own line or trailing code', () => {
    assert.equal(stripSourceMaps('a();\n//# sourceMappingURL=a.js.map\n'), 'a();\n')
    assert.equal(stripSourceMaps('a();//# sourceMappingURL=a.js.map'), 'a();\n')
    assert.equal(stripSourceMaps('a();\n'), 'a();\n')
  })

  it('maps request URLs into the root and rejects traversal', () => {
    const root = '/srv/app'
    assert.equal(resolveRequest('/', root), '/srv/app/index.html')
    assert.equal(resolveRequest('/?code=abc', root), '/srv/app/index.html')
    assert.equal(resolveRequest('/core/llm.js', root), '/srv/app/core/llm.js')
    assert.equal(resolveRequest('/../etc/passwd', root), '/srv/app/etc/passwd')
    assert.equal(resolveRequest('/%2e%2e/etc/passwd', root), '/srv/app/etc/passwd')
    assert.equal(resolveRequest('/..%2f..%2fetc/passwd', root), null)
    assert.equal(resolveRequest('/core/..%5c..%5cetc', root), null)
    assert.equal(resolveRequest('/.git/config', root), null)
    assert.equal(resolveRequest('/%E0%A4%A', root), null)
  })

  it('answers a page without its .html, and a file or folder of that name as itself (D356)', async () => {
    const app = fileURLToPath(new URL('../app/', import.meta.url))
    assert.equal(await pageOf(`${app}privacy`), `${app}privacy.html`)
    assert.equal(await pageOf(`${app}caps/browser/browser`), `${app}caps/browser/browser.html`)
    assert.equal(await pageOf(`${app}privacy.html`), `${app}privacy.html`)
    assert.equal(await pageOf(`${app}caps`), `${app}caps`)
    assert.equal(await pageOf(`${app}nowhere`), `${app}nowhere.html`)
  })
})
