import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nodeFS } from '../cli/fs.js'
import { carried } from '../caps/sync/mirror.js'

/** A folder of its own for each test, removed after it. @param {import('node:test').TestContext} t */
async function folder(t) {
  const root = await mkdtemp(join(tmpdir(), 'cli-fs-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('nodeFS writes, reads and appends, as memoryFS does', async (t) => {
  const fs = nodeFS(await folder(t))
  assert.equal(await fs.read('a.txt'), null)
  await fs.write('a.txt', 'one')
  assert.equal(await fs.read('a.txt'), 'one')
  await fs.write('a.txt', 'two')
  await fs.append('a.txt', '+three')
  assert.equal(await fs.read('a.txt'), 'two+three')
  await fs.append('new/deep/b.txt', 'x')
  assert.equal(await fs.read('new/deep/b.txt'), 'x')
  await fs.writeBytes('bytes/c.bin', new Uint8Array([1, 2, 3]))
  assert.deepEqual(await fs.readBytes('bytes/c.bin'), new Uint8Array([1, 2, 3]))
  assert.equal(await fs.readBytes('missing'), null)
  await assert.rejects(fs.write('d.txt', /** @type {any} */ (42)), TypeError)
  await assert.rejects(fs.read('/abs'), TypeError)
  await assert.rejects(fs.read('../out'), TypeError)
})

test('nodeFS lists direct children sorted, and nothing for a file or what is missing', async (t) => {
  const fs = nodeFS(await folder(t))
  for (const path of ['b.md', 'a/x.txt', 'a/y/z.txt', '.cache/i']) await fs.write(path, '')
  assert.deepEqual(await fs.list(''), [
    { name: '.cache', kind: 'directory' },
    { name: 'a', kind: 'directory' },
    { name: 'b.md', kind: 'file' },
  ])
  assert.deepEqual(await fs.list('a/'), [{ name: 'x.txt', kind: 'file' }, { name: 'y', kind: 'directory' }])
  assert.deepEqual(await fs.list('missing'), [])
  assert.deepEqual(await fs.list('b.md'), [])
  assert.equal(await fs.read('a'), null)
})

test('nodeFS removes a file or a subtree, says what exists, and stats files only', async (t) => {
  const fs = nodeFS(await folder(t))
  await fs.write('a/b/c.txt', 'four')
  assert.equal(await fs.exists('a/b'), true)
  assert.equal(await fs.exists('a/b/c.txt'), true)
  assert.equal(await fs.exists('b'), false)
  const stat = await fs.stat?.('a/b/c.txt')
  assert.equal(stat?.size, 4)
  assert.ok(Number.isInteger(stat?.lastModified))
  assert.equal(await fs.stat?.('a'), null)
  assert.equal(await fs.stat?.('nothing'), null)
  await fs.remove('a')
  assert.equal(await fs.exists('a'), false)
  await fs.remove('nothing/here')
})

test('a whole file goes to a .tmp beside it first, which a mirror never carries, and none is left', async (t) => {
  const root = await folder(t)
  const fs = nodeFS(root)
  await Promise.all(Array.from({ length: 8 }, (_, i) => fs.write('projects/p/memory.md', `line ${i}`)))
  assert.match(String(await fs.read('projects/p/memory.md')), /^line \d$/)
  assert.deepEqual(await readdir(join(root, 'projects/p')), ['memory.md'])
  assert.equal(carried('projects/p/memory.md.1a2b3c4d.tmp'), false)
})

test('a file written by someone else is read as it is now', async (t) => {
  const root = await folder(t)
  const fs = nodeFS(root)
  await writeFile(join(root, 'theirs.txt'), 'from the browser')
  assert.equal(await fs.read('theirs.txt'), 'from the browser')
})
