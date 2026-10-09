import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { packageFiles } from '../scripts/cli.js'

test('jean-cli holds every module it reaches, through import() too, its strings, and nothing of the browser’s', async () => {
  const files = await packageFiles(fileURLToPath(new URL('..', import.meta.url)))
  for (const path of ['cli/main.js', 'cli/acp.js', 'core/loop.js', 'core/anthropic.js', 'caps/folders/work.js', 'caps/made/formats.js', 'bridge/bridge.js', 'gateway/serve.js', 'locales/cli/en.json', 'locales/cli/zh-Hant.json', 'brand.js', 'LICENSE']) {
    assert.ok(files.includes(path), path)
  }
  assert.deepEqual(files.filter((path) => /^(ui|vendor|ee|test|e2e|docs)\//.test(path) || /^locales\/[^/]+\.json$/.test(path)), [])
})
