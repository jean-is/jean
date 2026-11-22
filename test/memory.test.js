// SPDX-License-Identifier: MIT
// Jean in memory (ui/memory.js), where the browser keeps no files, as a private window of Firefox's: every change is this tab's,
// heard by a watch for all of them, as OPFS's is, so that Together sends what the person changes there.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inMemory } from '../app/ui/memory.js'

test('in memory, every change is this tab’s: a watch for all of them hears each once it is made, a watch for other tabs’ none, until each stops', async () => {
  const fs = inMemory()
  const watch = /** @type {NonNullable<typeof fs.watch>} */ (fs.watch)
  /** @type {string[]} */
  const heard = []
  const others = watch(() => assert.fail('no other tabs'))
  const all = watch(async (path) => { heard.push(`${path} ${await fs.read(path)}`) }, { all: true })
  await fs.write('a.txt', 'one')
  await fs.append('log.jsonl', '{}')
  await fs.writeBytes('d/e.txt', new TextEncoder().encode('two'))
  await fs.remove('a.txt')
  await new Promise((resolve) => setTimeout(resolve))
  assert.deepEqual(heard, ['a.txt one', 'log.jsonl {}', 'd/e.txt two', 'a.txt null'])
  all()
  others()
  await fs.write('b.txt', 'three')
  await new Promise((resolve) => setTimeout(resolve))
  assert.equal(heard.length, 4)
  // The rest is core/fs.js's FS in memory, as it is.
  assert.deepEqual(await fs.list(''), [{ name: 'b.txt', kind: 'file' }, { name: 'd', kind: 'directory' }, { name: 'log.jsonl', kind: 'file' }])
  await assert.rejects(fs.write('d', 'over a directory'))
})
