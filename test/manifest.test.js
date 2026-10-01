import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import {
  countLines, extractStaticImports, linkedStylesheets, moduleGraph, parseImportMap, resolveSpecifier,
} from '../scripts/budgets.js'
import {
  buildCapabilities, buildWebmanifest, collectFiles, computeVersion, isShipped, plan, stampVersion,
} from '../scripts/manifest.js'
import { resolveRequest } from '../scripts/serve.js'
import { stripSourceMaps } from '../scripts/vendor.js'

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
      'locales/README.md': '',
      'docs/x.js': '',
      'test/x.test.js': '',
      'scripts/x.js': '',
    })
    const { shell, locales } = await collectFiles(root)
    assert.deepEqual(shell, ['brand.js', 'core/a.js', 'core/b.js', 'index.html', 'manifest.webmanifest', 'ui/app.js'])
    assert.deepEqual(locales, ['locales/en.json', 'locales/fr.json'])
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
    const manifest = JSON.parse(buildWebmanifest({ name: 'Test' }))
    assert.equal(manifest.name, 'Test')
    assert.equal(manifest.short_name, 'Test')
    assert.equal(manifest.start_url, './')
    assert.equal(manifest.scope, './')
    assert.equal(manifest.icons[0].src, 'icons/icon.svg')
  })

  it('builds capabilities.json in format 1 with an empty capability map', () => {
    const data = JSON.parse(buildCapabilities('v1', ['a.js'], ['locales/en.json']))
    assert.deepEqual(data, { format: 1, version: 'v1', shell: ['a.js'], locales: ['locales/en.json'], capabilities: {} })
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
  const html = `<!doctype html>
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

describe('budgets: line counting', () => {
  it('counts lines with or without a trailing newline', () => {
    assert.equal(countLines(''), 0)
    assert.equal(countLines('a'), 1)
    assert.equal(countLines('a\n'), 1)
    assert.equal(countLines('a\nb'), 2)
    assert.equal(countLines('a\n\nb\n'), 3)
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
})
