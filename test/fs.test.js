import { test } from 'node:test'
import assert from 'node:assert/strict'
import { basename, dirname, join, memoryFS, normalizeDir, normalizePath, readJSON, writeJSON } from '../core/fs.js'

test('normalizePath accepts relative POSIX paths and strips one trailing slash', () => {
  assert.equal(normalizePath('a'), 'a')
  assert.equal(normalizePath('a/b.txt'), 'a/b.txt')
  assert.equal(normalizePath('a/b/'), 'a/b')
  assert.equal(normalizePath('.cache/index.json'), '.cache/index.json')
  assert.equal(normalizePath('projects/01J-home/conversations'), 'projects/01J-home/conversations')
})

test('normalizePath rejects invalid paths', () => {
  const bad = ['', '/', '/a', 'a//b', 'a//', '.', '..', './a', 'a/./b', 'a/..', '../a', 'a\\b', '\\a']
  for (const path of bad) assert.throws(() => normalizePath(path), TypeError, JSON.stringify(path))
  for (const path of [42, null, undefined, {}]) {
    assert.throws(() => normalizePath(/** @type {any} */ (path)), TypeError)
  }
})

test('normalizeDir allows the root', () => {
  assert.equal(normalizeDir(''), '')
  assert.equal(normalizeDir('a/'), 'a')
  assert.throws(() => normalizeDir('/'), TypeError)
})

test('join, dirname and basename', () => {
  assert.equal(join('a', 'b/c', 'd.txt'), 'a/b/c/d.txt')
  assert.equal(join('', 'a', '', 'b'), 'a/b')
  assert.equal(join('a/', 'b'), 'a/b')
  assert.equal(join(), '')
  assert.throws(() => join('a', '..'), TypeError)
  assert.throws(() => join('a', '/b'), TypeError)
  assert.equal(dirname('a/b/c.txt'), 'a/b')
  assert.equal(dirname('a'), '')
  assert.equal(dirname('a/b/'), 'a')
  assert.equal(basename('a/b/c.txt'), 'c.txt')
  assert.equal(basename('a'), 'a')
})

test('memoryFS write, read, append', async () => {
  const fs = memoryFS()
  assert.equal(await fs.read('a.txt'), null)
  await fs.write('a.txt', 'one')
  assert.equal(await fs.read('a.txt'), 'one')
  await fs.write('a.txt', 'two')
  assert.equal(await fs.read('a.txt'), 'two')
  await fs.append('a.txt', '+three')
  assert.equal(await fs.read('a.txt'), 'two+three')
  await fs.append('new/deep/b.txt', 'x')
  assert.equal(await fs.read('new/deep/b.txt'), 'x')
  await fs.write('empty.txt', '')
  assert.equal(await fs.read('empty.txt'), '')
  await assert.rejects(fs.write('c.txt', /** @type {any} */ (42)), TypeError)
  await assert.rejects(fs.read('/abs'), TypeError)
})

test('memoryFS lists direct children, files and implicit directories, sorted', async () => {
  const fs = memoryFS({ 'b.md': '', 'a/x.txt': '', 'a/y/z.txt': '', 'c/d/e.txt': '', '.cache/i': '' })
  assert.deepEqual(await fs.list(''), [
    { name: '.cache', kind: 'directory' },
    { name: 'a', kind: 'directory' },
    { name: 'b.md', kind: 'file' },
    { name: 'c', kind: 'directory' },
  ])
  assert.deepEqual(await fs.list('a'), [
    { name: 'x.txt', kind: 'file' },
    { name: 'y', kind: 'directory' },
  ])
  assert.deepEqual(await fs.list('a/'), await fs.list('a'))
  assert.deepEqual(await fs.list('missing'), [])
  assert.deepEqual(await fs.list('b.md'), [])
})

test('memoryFS remove deletes a file or a whole subtree, and is a no-op when missing', async () => {
  const fs = memoryFS({ 'a/x': '1', 'a/y/z': '2', 'ab': '3', 'a.txt': '4' })
  await fs.remove('a/x')
  assert.equal(await fs.read('a/x'), null)
  assert.equal(await fs.read('a/y/z'), '2')
  await fs.remove('a')
  assert.deepEqual(await fs.list(''), [
    { name: 'a.txt', kind: 'file' },
    { name: 'ab', kind: 'file' },
  ])
  await fs.remove('nothing/here')
})

test('memoryFS exists for files and directories', async () => {
  const fs = memoryFS({ 'a/b/c.txt': '' })
  assert.equal(await fs.exists('a/b/c.txt'), true)
  assert.equal(await fs.exists('a/b'), true)
  assert.equal(await fs.exists('a'), true)
  assert.equal(await fs.exists('a/b/c'), false)
  assert.equal(await fs.exists('b'), false)
})

test('memoryFS rejects writing a file over a directory or under a file', async () => {
  const fs = memoryFS({ 'a/b.txt': '' })
  await assert.rejects(fs.write('a', 'x'), { name: 'TypeMismatchError' })
  await assert.rejects(fs.append('a/b.txt/c', 'x'), { name: 'TypeMismatchError' })
})

test('memoryFS watch and estimate', async () => {
  const fs = memoryFS({ 'a.txt': 'abc', 'b/c.txt': 'de' })
  const unsubscribe = /** @type {NonNullable<typeof fs.watch>} */ (fs.watch)(() => assert.fail('no other tabs'))
  assert.equal(typeof unsubscribe, 'function')
  unsubscribe()
  assert.deepEqual(await /** @type {NonNullable<typeof fs.estimate>} */ (fs.estimate)(), { usage: 5 })
})

test('readJSON returns the fallback when the file is missing or invalid', async () => {
  const fs = memoryFS({ 'bad.json': '{ nope', 'good.json': '{"a":1}' })
  assert.equal(await readJSON(fs, 'missing.json'), null)
  assert.deepEqual(await readJSON(fs, 'missing.json', { x: 1 }), { x: 1 })
  assert.deepEqual(await readJSON(fs, 'bad.json', []), [])
  assert.deepEqual(await readJSON(fs, 'good.json'), { a: 1 })
})

test('writeJSON writes indented JSON with a trailing newline', async () => {
  const fs = memoryFS()
  await writeJSON(fs, 'dir/settings.json', { a: 1, b: [true] })
  assert.equal(await fs.read('dir/settings.json'), '{\n  "a": 1,\n  "b": [\n    true\n  ]\n}\n')
  assert.deepEqual(await readJSON(fs, 'dir/settings.json'), { a: 1, b: [true] })
})
