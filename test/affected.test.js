// SPDX-License-Identifier: MIT
// Only the browser tests a change affects (scripts/affected.js, D772): which files a request read, what a spec reads in Node,
// which specs a change picks, and how a run's record joins the one kept.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, it } from 'node:test'
import { SERVERS, closure, filesOf, merge, select } from '../scripts/affected.js'

/** A repository in memory: a file by its text, a folder by its trailing /. @param {Record<string, string>} files */
function repository (files) {
  const kind = (/** @type {string} */ path) => (Object.hasOwn(files, path) ? 'file' : Object.keys(files).some((one) => one.startsWith(`${path}/`)) ? 'folder' : null)
  return { kind, read: (/** @type {string} */ path) => files[path] }
}

describe('the files a request read', () => {
  const where = (/** @type {string} */ path) => (['app/index.html', 'app/core/fs.js', 'app/caps/charts/charts.js', 'examples/extensions/word-count/extension.json'].includes(path) ? 'tracked'
    : ['app/privacy.html', 'app/fr/terms.html', 'app/capabilities.json', 'app/vendor/lit-html/lit-html.js', 'app/manifests/fr.webmanifest'].includes(path) ? 'built' : null)

  it('is the file of app/ that Jean’s server serves, its page for a folder', () => {
    assert.deepEqual(filesOf('http://127.0.0.1:4180/core/fs.js', where), ['app/core/fs.js'])
    assert.deepEqual(filesOf('http://127.0.0.1:4180/', where), ['app/index.html'])
    assert.deepEqual(filesOf('http://localhost:4184/caps/charts/charts.js', where), ['app/caps/charts/charts.js'])
    assert.deepEqual(filesOf('http://127.0.0.1:4180/examples/extensions/word-count/extension.json', where), ['examples/extensions/word-count/extension.json'])
  })

  it('is site/ for a page a build writes from it, and nothing for what a build writes from the rest', () => {
    assert.deepEqual(filesOf('http://127.0.0.1:4180/privacy.html', where), ['site/'])
    assert.deepEqual(filesOf('http://127.0.0.1:4180/fr/terms.html', where), ['site/'])
    // capabilities.json holds every file's hash: any change would pick every spec.
    assert.deepEqual(filesOf('http://127.0.0.1:4180/capabilities.json', where), [])
    assert.deepEqual(filesOf('http://127.0.0.1:4180/vendor/lit-html/lit-html.js', where), [])
    assert.deepEqual(filesOf('http://127.0.0.1:4180/manifests/fr.webmanifest', where), [])
  })

  it('adds what the server there runs: the relay, the share host, jean.is’s pages', () => {
    assert.deepEqual(filesOf('http://127.0.0.1:4187/mailbox/abc', where), ['relay/serve.js'])
    assert.deepEqual(filesOf('http://name.localhost:4185/', where), ['scripts/host.js', 'host/serve.js', 'app/index.html'])
    assert.deepEqual(filesOf('http://127.0.0.1:4186/ja', where), ['site/'])
  })

  it('reads Jean’s files from a server a spec runs itself, and nothing from another address', () => {
    assert.deepEqual(filesOf('http://127.0.0.1:4190/core/fs.js', where), ['app/core/fs.js'])
    assert.deepEqual(filesOf('https://cdn.jsdelivr.net/npm/@jean-is/sounds@1/a.sf2', where), [])
    assert.deepEqual(filesOf('http://127.0.0.1:4180/missing.js', where), [])
    assert.deepEqual(filesOf('http://127.0.0.1:4180/%2e%2e/package.json', where), [])
    assert.deepEqual(filesOf('not an address', where), [])
  })
})

describe('what a spec reads in Node', () => {
  const { kind, read } = repository({
    'test/a.spec.js': [
      "import { test, start } from './helpers.js'",
      "import { readZip } from '../app/core/zip.js'",
      "const pdf = readFileSync(new URL('./fixtures/scan.pdf', import.meta.url))",
      "const photo = new URL('fixtures/photo.heic', import.meta.url)",
      "const word = './fixtures/extensions/word-count/'",
      "const ROOT = new URL('..', import.meta.url), APP = new URL('../app', import.meta.url)",
      "await page.goto('./')",
      "const lazy = await import('../app/caps/files/extract.js')",
    ].join('\n'),
    'test/helpers.js': "import { expect } from '@playwright/test'\nimport { crc32 } from '../app/core/zip.js'\n",
    'test/fixtures/scan.pdf': '%PDF',
    'test/fixtures/photo.heic': 'heic',
    'test/fixtures/extensions/word-count/extension.json': '{}',
    'app/core/zip.js': "import { a } from './bytes.js'\n",
    'app/core/bytes.js': '',
    'app/caps/files/extract.js': "export const lazy = () => import('../../core/later.js')\n",
    'app/core/later.js': '',
    'app/index.html': '',
    'scripts/serve.js': "import { stamp } from './manifest.js'\nconst site = () => import('../site/site.js')\n",
    'scripts/manifest.js': "import { LOCALES } from '../app/core/i18n.js'\n",
    'app/core/i18n.js': "import { all } from './every.js'\n",
    'app/core/every.js': '',
    'site/site.js': '',
  })

  it('follows its imports, static and import(), and the files it names, a folder whole', () => {
    assert.deepEqual([...closure(['test/a.spec.js'], kind, read)].sort(), [
      'app/caps/files/extract.js', 'app/core/bytes.js', 'app/core/later.js', 'app/core/zip.js',
      'test/a.spec.js', 'test/fixtures/extensions/word-count/', 'test/fixtures/photo.heic', 'test/fixtures/scan.pdf', 'test/helpers.js',
    ])
  })

  it('reads a server shallow: its static imports, and app/’s not followed', () => {
    assert.deepEqual([...closure(['scripts/serve.js'], kind, read, false)].sort(), ['app/core/i18n.js', 'scripts/manifest.js', 'scripts/serve.js'])
  })
})

describe('the specs a change affects', () => {
  /** @type {import('../scripts/affected.js').Kept} */
  const kept = { format: 1, specs: {
    charts: { chromium: { files: { 'app/index.html': 'i1', 'app/caps/charts/charts.js': 'c1', 'test/charts.spec.js': 's1' }, failed: [] },
      webkit: { files: { 'app/index.html': 'i1', 'app/caps/charts/charts.js': 'c1', 'app/caps/charts/worker.js': 'w1', 'test/charts.spec.js': 's1' }, failed: [] } },
    ask: { chromium: { files: { 'app/index.html': 'i1', 'app/caps/ask/ask.js': 'a1', 'test/ask.spec.js': 's2' }, failed: [] } },
    site: { chromium: { files: { 'app/index.html': 'i1', 'site/': 'd1', 'test/site.spec.js': 's3' }, failed: [] } },
    flaky: { chromium: { files: { 'app/index.html': 'i1' }, failed: ['opens twice'] } },
    picked: { chromium: { files: { 'app/index.html': 'i1' }, failed: [], whole: false, tests: ['one'] } },
  } }
  const now = { 'app/index.html': 'i1', 'app/caps/charts/charts.js': 'c1', 'app/caps/charts/worker.js': 'w1', 'app/caps/ask/ask.js': 'a1', 'site/': 'd1', 'test/charts.spec.js': 's1', 'test/ask.spec.js': 's2', 'test/site.spec.js': 's3' }
  const specs = ['ask', 'charts', 'site', 'flaky', 'picked', 'fresh']
  const pick = (/** @type {string[]} */ changed, /** @type {Record<string, string>} */ hashes = {}) =>
    Object.fromEntries(select({ specs, kept, changed: new Set(changed), hash: (path) => ({ ...now, ...hashes })[path] ?? '-' }))

  it('is those that read a file changed since the base, in either engine, and those never run whole, or that failed', () => {
    const always = { flaky: 'failed', picked: 'run in part', fresh: 'never run' }
    assert.deepEqual(pick([]), always)
    assert.deepEqual(pick(['app/caps/charts/worker.js']), { charts: 'app/caps/charts/worker.js', ...always })
    assert.deepEqual(pick(['app/index.html']), { ask: 'app/index.html', charts: 'app/index.html', site: 'app/index.html', ...always })
    assert.deepEqual(pick(['docs/architecture.md', 'scripts/ci.js']), always)
  })

  it('is those that read a file changed since their run, as its hash tells', () => {
    assert.deepEqual(pick([], { 'app/caps/ask/ask.js': 'a2' }), { ask: 'app/caps/ask/ask.js', flaky: 'failed', picked: 'run in part', fresh: 'never run' })
    // A file gone, or edited while its tests ran (~), is no file read.
    assert.deepEqual(pick([], { 'test/charts.spec.js': '-' }).charts, 'test/charts.spec.js')
  })

  it('takes a folder as every file in it', () => {
    assert.equal(pick(['site/help/en.json']).site, 'site/')
    assert.equal(pick([], { 'site/': 'd2' }).site, 'site/')
    assert.equal(pick(['site.css']).site, undefined)
  })

  it('is every spec when no run is kept', () => {
    assert.equal(select({ specs, kept: null, changed: new Set(), hash: () => '-' }).size, specs.length)
  })
})

describe('a run’s record over the one kept', () => {
  /** @type {import('../scripts/affected.js').Kept} */
  const kept = { format: 1, specs: { charts: { chromium: { files: { a: '1', b: '1' }, failed: ['draws a pie'] }, webkit: { files: { a: '1' }, failed: [] } } } }

  it('replaces a spec run whole in an engine, and keeps the others', () => {
    const run = { format: 1, specs: { charts: { chromium: { files: { a: '2' }, failed: [] } } } }
    assert.deepEqual(merge(kept, run).specs.charts, { chromium: { files: { a: '2' }, failed: [] }, webkit: { files: { a: '1' }, failed: [] } })
  })

  it('adds a spec run in part to what was kept, failures of tests that didn’t run kept', () => {
    /** @type {import('../scripts/affected.js').Kept} */
    const run = { format: 1, specs: { charts: { chromium: { files: { a: '2', c: '1' }, failed: [], whole: false, tests: ['draws a bar'] } } } }
    assert.deepEqual(merge(kept, run).specs.charts.chromium, { files: { a: '2', b: '1', c: '1' }, failed: ['draws a pie'] })
    run.specs.charts.chromium.tests = ['draws a pie']
    assert.deepEqual(merge(kept, run).specs.charts.chromium, { files: { a: '2', b: '1', c: '1' }, failed: [] })
  })

  it('keeps a spec only ever run in part as such, its tests together', () => {
    /** @type {import('../scripts/affected.js').Kept} */
    const one = { format: 1, specs: { ask: { chromium: { files: { a: '1' }, failed: [], whole: false, tests: ['one'] } } } }
    /** @type {import('../scripts/affected.js').Kept} */
    const two = { format: 1, specs: { ask: { chromium: { files: { b: '1' }, failed: ['two'], whole: false, tests: ['two'] } } } }
    assert.deepEqual(merge(merge(null, one), two).specs.ask.chromium, { files: { a: '1', b: '1' }, failed: ['two'], whole: false, tests: ['one', 'two'] })
  })

  it('starts again from a record of another format', () => {
    const run = { format: 1, specs: { ask: { chromium: { files: {}, failed: [] } } } }
    assert.deepEqual(Object.keys(merge(/** @type {any} */ ({ format: 0, specs: { charts: {} } }), run).specs), ['ask'])
  })
})

describe('what the browser tests keep', () => {
  it('runs every spec with the test that keeps what its pages ask for', () => {
    const specs = readdirSync(new URL('.', import.meta.url)).filter((name) => name.endsWith('.spec.js'))
    const without = specs.filter((name) => !/^import \{ test\b[^}]*\} from '\.\/helpers\.js'$/m.test(readFileSync(new URL(name, import.meta.url), 'utf8')))
    assert.deepEqual(without, [], 'import { test, expect } from \'./helpers.js\', not @playwright/test')
  })

  it('knows each of the config’s servers by its port', () => {
    const config = readFileSync(new URL('playwright.config.js', import.meta.url), 'utf8')
    const ports = Object.fromEntries([...config.matchAll(/^const (\w+) = (\d{4})$/gm)].map(([, name, port]) => [name, port]))
    const started = [...config.matchAll(/command: '[^']+',[^\n]*?port: (\w+)/g)].map(([, name]) => ports[name])
    assert.ok(started.length >= 8)
    assert.deepEqual(started.filter((port) => !Object.hasOwn(SERVERS, port)), [])
  })
})
