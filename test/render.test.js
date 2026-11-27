// SPDX-License-Identifier: MIT
// The render package (D305): what a task saved as a web page loads to draw itself as Jean does, its
// files as Jean's preview shows them, Jean's own modules with a stand-in for the room's state, each
// listed with its hash, by a version of its own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderModules, renderFiles, renderStrings, STAND_INS, ENTRY, VIEWS, ASSETS } from '../scripts/render.js'
import { LOCALES } from '../app/core/i18n.js'
import { plan } from '../scripts/manifest.js'

const app = new URL('../app/', import.meta.url)
const read = (/** @type {string} */ path) => readFile(new URL(path, app), 'utf8').catch(() => null)

test('a saved copy loads Jean’s renderers and its stand-in, never the room', async () => {
  const files = await renderModules(read)
  for (const path of [ENTRY, 'ui/reader-state.js', 'ui/markdown.js', 'caps/layouts/layouts.js', 'caps/interactive/interactive.js', 'vendor/echarts/echarts.mjs']) assert.ok(files.includes(path), path)
  for (const path of ['ui/state.js', 'ui/app.js', 'ui/chat.js', 'ui/send.js', 'caps/files/files.js', 'caps/folders/site.js']) assert.ok(!files.includes(path), path)
})

test('its files open as Jean’s preview shows them, with what draws each kind, which the walk can’t see', async () => {
  const files = await renderModules(read)
  for (const path of ['ui/view.js', ...VIEWS]) assert.ok(files.includes(path), path)
  for (const path of ['ui/view.css', 'vendor/pdfjs', 'vendor/ooxml']) assert.ok(ASSETS.includes(path), path)
})

test('its words are the room’s catalog and the parts its files load, in every language, never another capability’s', async () => {
  const root = fileURLToPath(new URL('../app', import.meta.url))
  const files = await renderFiles(root, await renderModules(read))
  const parts = new Set(files.filter((path) => /^locales\/[^/]+\//.test(path)).map((path) => path.split('/')[1]))
  assert.deepEqual([...parts].sort(), ['charts', 'games', 'interactive', 'layouts', 'made', 'scores', 'share', 'slides'])
  for (const lang of LOCALES) {
    assert.ok(files.includes(`locales/${lang}.json`), lang)
    for (const part of parts) assert.ok(files.includes(`locales/${part}/${lang}.json`), `${part}/${lang}`)
  }
  for (const part of ['dialogs', 'tour', 'whiteboards']) assert.ok(!parts.has(part), part)
  // A part it can't name stops the build rather than leave its words out.
  const dir = await mkdtemp(join(tmpdir(), 'jean-render-'))
  try {
    await mkdir(join(dir, 'locales'))
    await writeFile(join(dir, 'view.js'), "const part = 'charts'\nawait useStrings(part)\n")
    await assert.rejects(renderStrings(dir, ['view.js']), /view\.js loads a part of the catalog not named as written/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the stand-in has every name the copy’s modules take from the room’s state', async () => {
  const exported = new Set([...(await read('ui/reader-state.js') ?? '').matchAll(/^export (?:const|async function|function) (\w+)/gm)].map((match) => match[1]))
  for (const path of await renderModules(read)) {
    for (const [, names, from] of (await read(path) ?? '').matchAll(/^import \{([^}]*)\} from '([^']+)'/gm)) {
      if (new URL(from, new URL(path, app)).href !== new URL('ui/state.js', app).href) continue
      for (const name of names.split(',').map((part) => part.trim()).filter(Boolean)) assert.ok(exported.has(name), `${path} takes ${name}`)
    }
  }
})

test('capabilities.json lists the package by a version of its own, each of its modules with its hash', async () => {
  const { render, integrity } = JSON.parse((await plan()).outputs['capabilities.json'])
  assert.match(render.version, /^\d+\.\d+\.\d+-r[0-9a-f]{12}$/)
  assert.equal(render.entry, ENTRY)
  assert.deepEqual(render.map, STAND_INS)
  // Its own, which a minified deploy's no longer match (D318); from app/, the same.
  for (const path of render.files) assert.match(render.integrity[path] ?? '', /^sha256-/, path)
  for (const path of render.files) assert.equal(render.integrity[path], integrity[path], path)
})
