// SPDX-License-Identifier: MIT
// How long each browser test spec takes in each engine, which test/parts.js packs CI's parts by (D724). As Playwright's
// reporter (test/playwright.config.js), it writes each run's to test-results/durations.json: each engine's seconds by spec,
// each test's last try. Run, it writes test/durations.json from runs': CI's parts keep theirs as artifacts.
// Usage: node scripts/durations.js [<durations.json>…]   with none, test-results/ and npm run ci's dist/ci/artifacts/
//   gh run download <run> -p 'durations-*' -D dist/durations && node scripts/durations.js dist/durations/*/durations.json
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const KEPT = join(ROOT, 'test/durations.json')

/** @implements {import('@playwright/test/reporter').Reporter} */
export default class Durations {
  /** @type {Map<string, { engine: string, spec: string, ms: number }>} */
  tests = new Map()
  out = join(ROOT, 'test-results')

  /** @param {import('@playwright/test/reporter').FullConfig} config */
  onBegin(config) { this.out = config.projects[0]?.outputDir ?? this.out }

  /** @param {import('@playwright/test/reporter').TestCase} test @param {import('@playwright/test/reporter').TestResult} result */
  onTestEnd(test, result) {
    const engine = test.parent.project()?.name
    if (engine) this.tests.set(test.id, { engine, spec: basename(test.location.file, '.spec.js'), ms: result.duration })
  }

  onEnd() {
    /** @type {Record<string, Record<string, number>>} */
    const seconds = {}
    for (const { engine, spec, ms } of this.tests.values()) (seconds[engine] ??= {})[spec] = (seconds[engine][spec] ?? 0) + ms / 1000
    mkdirSync(this.out, { recursive: true })
    writeFileSync(join(this.out, 'durations.json'), `${JSON.stringify(seconds)}\n`)
  }

  printsToStdio() { return false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const artifacts = join(ROOT, 'dist/ci/artifacts')
  const given = process.argv.slice(2)
  const files = given.length ? given : [join(ROOT, 'test-results/durations.json'), ...(existsSync(artifacts) ? readdirSync(artifacts).filter((name) => name.startsWith('durations')).map((name) => join(artifacts, name, 'durations.json')) : [])].filter((file) => existsSync(file))
  if (!files.length) { console.error('No durations: run npm run e2e, or npm run ci, first'); process.exit(1) }
  /** @type {Record<string, Record<string, number>>} */
  const kept = existsSync(KEPT) ? JSON.parse(readFileSync(KEPT, 'utf8')) : {}
  const specs = new Set(readdirSync(join(ROOT, 'test')).filter((name) => name.endsWith('.spec.js')).map((name) => name.slice(0, -'.spec.js'.length)))
  let changed = 0
  for (const file of files) {
    for (const [engine, bySpec] of Object.entries(/** @type {Record<string, Record<string, number>>} */ (JSON.parse(readFileSync(file, 'utf8'))))) {
      for (const [spec, seconds] of Object.entries(bySpec)) { (kept[engine] ??= {})[spec] = Math.max(1, Math.round(seconds)); changed++ }
    }
  }
  // Each engine's specs by name, those gone dropped.
  const sorted = Object.fromEntries(Object.entries(kept).sort(([a], [b]) => (a < b ? -1 : 1)).map(([engine, bySpec]) => [engine, Object.fromEntries(Object.entries(bySpec).filter(([spec]) => specs.has(spec)).sort(([a], [b]) => (a < b ? -1 : 1)))]))
  writeFileSync(KEPT, `${JSON.stringify(sorted, null, 1)}\n`)
  console.log(`test/durations.json: ${changed} spec(s) from ${files.length} run(s)`)
}
