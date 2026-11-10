// Jean's version by semver, from git (scripts/version.js, D735): the newest version's tag, raised by what the commits
// since say they are, and the tag CI makes of it.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { GRADES, grade, history, newest, next, parse, tag, versionOf } from '../scripts/version.js'

// Git as CI has it, whatever this machine's own settings say (a signed tag, a hook).
Object.assign(process.env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@localhost', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@localhost' })
const git = (/** @type {string} */ root, /** @type {string[]} */ ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
/** A repository with these commits' first lines, in order. @param {string[]} subjects */
async function repository (subjects) {
  const root = await mkdtemp(join(tmpdir(), 'jean-version-'))
  git(root, 'init', '--quiet', '--initial-branch', 'main')
  for (const subject of subjects) git(root, 'commit', '--quiet', '--allow-empty', '--message', subject)
  return root
}

describe('version: what a commit asks', () => {
  it('reads the gitmoji a first line opens with, as gitmoji grades it', () => {
    assert.equal(grade(':boom: Folders are kept apart'), 'major')
    assert.equal(grade(':sparkles: Tables'), 'minor')
    for (const code of ['bug', 'lipstick', 'wrench', 'speech_balloon', 'wheelchair', 'zap', 'lock', 'alembic']) assert.equal(grade(`:${code}: x`), 'patch', code)
    for (const subject of [':memo: Docs', ':white_check_mark: A test', ':recycle: x', ':construction_worker: CI', ':twisted_rightwards_arrows: Merge', 'Merge branch x', ':wrench; x', 'x :sparkles:', ':constructor: x', ':hasOwnProperty: x']) assert.equal(grade(subject), null, subject)
    assert.deepEqual([...new Set(Object.values(GRADES))].sort(), ['major', 'minor', 'patch'])
  })

  it('takes vMAJOR.MINOR.PATCH tags alone, newest by semver', () => {
    assert.deepEqual(parse('v0.10.2'), [0, 10, 2])
    for (const other of ['v0.7', 'v1.0.0-rc.1', 'v01.0.0', '0.9.0', 'archive/x']) assert.equal(parse(other), null, other)
    assert.equal(newest(['v0.7', 'v0.9.0', 'v0.10.0', 'v0.9.3']), 'v0.10.0')
    assert.equal(newest(['v0.7']), null)
  })

  it('raises the newest version once, by the most any commit since asks', () => {
    assert.deepEqual(next(['v0.9.0'], [':bug: a', ':sparkles: b', ':bug: c']), { version: '0.10.0', base: 'v0.9.0', level: 'minor' })
    assert.equal(next(['v0.9.0'], [':bug: a', ':speech_balloon: b']).version, '0.9.1')
    assert.deepEqual(next(['v0.9.0'], [':memo: a', ':white_check_mark: b']), { version: '0.9.0', base: 'v0.9.0', level: null })
    assert.equal(next(['v1.2.3'], [':boom: a', ':sparkles: b']).version, '2.0.0')
    assert.equal(next(['v1.2.3'], [':sparkles: a']).version, '1.3.0')
    assert.deepEqual(next([], [':sparkles: a']), { version: '0.1.0', base: null, level: 'minor' })
  })

  it('leaves 1.0.0 to the public launch’s tag: before it, :boom: raises the minor', () => {
    assert.deepEqual(next(['v0.9.4'], [':boom: a', ':bug: b']), { version: '0.10.0', base: 'v0.9.4', level: 'minor' })
  })
})

describe('version: from git', () => {
  it('counts the commits since the newest tag HEAD reaches, and nothing on another branch', async () => {
    const root = await repository([':sparkles: one', ':bug: two'])
    git(root, 'tag', '--annotate', '--message', '0.9.0', 'v0.9.0')
    git(root, 'tag', 'v0.7')
    git(root, 'commit', '--quiet', '--allow-empty', '--message', ':bug: three')
    git(root, 'switch', '--quiet', '--create', 'other')
    git(root, 'commit', '--quiet', '--allow-empty', '--message', ':sparkles: elsewhere')
    git(root, 'tag', 'v5.0.0')
    git(root, 'switch', '--quiet', 'main')
    assert.deepEqual(history(root), { version: '0.9.1', base: 'v0.9.0', level: 'patch', commits: 1 })
    assert.equal(versionOf({ root, env: {} }), '0.9.1')
    assert.equal(versionOf({ root, commit: 'v0.9.0', env: {} }), '0.9.0')
  })

  it('tags HEAD once it asks for a version, annotated, and says why it doesn’t otherwise', async () => {
    const root = await repository([':sparkles: one'])
    git(root, 'tag', '--annotate', '--message', '0.9.0', 'v0.9.0')
    assert.deepEqual(tag(root), { version: '0.9.0', release: '0.9.0', why: 'HEAD is v0.9.0 already' })
    git(root, 'commit', '--quiet', '--allow-empty', '--message', ':memo: docs')
    assert.equal(tag(root).release, null)
    git(root, 'commit', '--quiet', '--allow-empty', '--message', ':sparkles: two')
    git(root, 'commit', '--quiet', '--allow-empty', '--message', ':bug: three')
    const made = tag(root)
    assert.equal(made.release, '0.10.0')
    assert.match(made.why, /v0\.9\.0 and 3 commit\(s\) since, the most a minor change/)
    assert.equal(git(root, 'cat-file', '-t', 'v0.10.0'), 'tag', 'annotated, with who and when')
    assert.equal(git(root, 'rev-parse', 'v0.10.0^{commit}'), git(root, 'rev-parse', 'HEAD'))
    assert.equal(tag(root).release, '0.10.0', 'a run again releases the same')
    // An older push's run, finishing after a newer one tagged the version that holds it.
    git(root, 'switch', '--quiet', '--detach', 'HEAD~1')
    assert.deepEqual(tag(root), { version: '0.10.0', release: null, why: "v0.10.0 is a later commit's, which holds this one" })
  })

  it('can’t tell from a shallow clone that reaches no tag, and says so', async () => {
    const root = await repository([':sparkles: one', ':bug: two'])
    git(root, 'tag', '--annotate', '--message', '0.9.0', 'v0.9.0', 'HEAD~1')
    const shallow = await mkdtemp(join(tmpdir(), 'jean-version-shallow-'))
    execFileSync('git', ['clone', '--quiet', '--depth', '1', '--no-tags', `file://${root}`, shallow])
    assert.equal(history(shallow), null)
    assert.equal(versionOf({ root: shallow, env: {} }), null)
    assert.throws(() => tag(shallow), /fetch-depth: 0/)
  })

  it('takes VERSION first, and a build’s package.json where there is no history', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jean-version-copy-'))
    assert.equal(versionOf({ root, env: {} }), null)
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.12.1' }))
    assert.equal(versionOf({ root, env: {} }), '0.12.1')
    assert.equal(versionOf({ root, env: { VERSION: '1.0.0' } }), '1.0.0')
    assert.throws(() => versionOf({ root, env: { VERSION: 'dev' } }), /isn't a version/)
  })

  it('is in no file git holds: package.json and its lockfile name none', async () => {
    assert.equal(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version, undefined)
    const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
    assert.equal(lock.version, undefined)
    assert.equal(lock.packages[''].version, undefined)
  })
})
