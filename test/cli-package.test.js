import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { packageFiles } from '../scripts/cli.js'

test('jean-cli holds every module it reaches, through import() too, its strings, and nothing of the browser’s', async () => {
  const files = await packageFiles(fileURLToPath(new URL('..', import.meta.url)))
  for (const path of ['cli/main.js', 'cli/acp.js', 'app/core/loop.js', 'app/core/anthropic.js', 'app/caps/folders/work.js', 'app/caps/made/formats.js', 'app/bridge/bridge.js', 'gateway/serve.js', 'cli/locales/en.json', 'cli/locales/zh-Hant.json', 'app/brand.js', 'LICENSE']) {
    assert.ok(files.includes(path), path)
  }
  assert.deepEqual(files.filter((path) => /^(app\/(ui|vendor|ee|locales)|test|e2e|docs)\//.test(path)), [])
})
