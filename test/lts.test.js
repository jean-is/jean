// Jean's own Node, named once in .nvmrc (scripts/lts.js, D701): every image of Node's named here, every CI job that runs
// Node and package.json's engines agree with it. Whether it is still the newest LTS needs Node's list of releases, which
// npm run lts reads in CI; here newest() reads a list of that shape, and write() moves a copy of the repository's pins.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { images, newest, pinned, write } from '../scripts/lts.js'

const ROOT = new URL('..', import.meta.url)
const read = (/** @type {string} */ path) => readFile(new URL(path, ROOT), 'utf8')
const image = (/** @type {number} */ major, variant = 'alpine') => `node:${major}-${variant}`

/** A workflow's jobs, each its name and its lines but comments, which may name npm for a job below. @param {string} text */
const jobs = (text) => text.slice(text.indexOf('\njobs:')).split(/\n(?= {2}[\w-]+:\s*$)/m).slice(1)
  .map((job) => [job.split(':')[0].trim(), job.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')])

describe("Jean's own Node", () => {
  it('is one even major in .nvmrc, as every LTS is', () => {
    assert.equal(pinned() % 2, 0)
  })

  it('is the major of every image of Node’s named here', () => {
    const found = images()
    assert.ok(found.some(({ path }) => path === 'deploy/docker/Dockerfile') && found.some(({ path }) => path === 'deploy/server/compose.yaml'))
    assert.deepEqual(found.filter(({ major }) => major !== pinned()), [])
  })

  it('is what every CI job that runs Node sets up, from .nvmrc, over its image’s own', async () => {
    const workflows = (await readdir(new URL('.github/workflows/', ROOT))).filter((name) => name.endsWith('.yml'))
    assert.ok(workflows.includes('lts.yml'))
    for (const name of workflows) {
      const text = await read(`.github/workflows/${name}`)
      assert.doesNotMatch(text, /node-version:/, name)
      for (const [job, lines] of jobs(text)) if (/\b(npm|npx|node) /.test(lines)) assert.match(lines, /node-version-file: \.nvmrc/, `${name}: ${job}`)
    }
    assert.match(await read('.gitlab-ci.yml'), /cat \.nvmrc/)
  })

  it('is no older than the oldest Node package.json allows', async () => {
    const { engines } = JSON.parse(await read('package.json'))
    assert.ok(Number(/^>=(\d+)$/.exec(engines.node)?.[1]) <= pinned())
  })

  it('is read from Node’s list of releases as its newest LTS, never a newer Current', () => {
    assert.equal(newest([{ version: 'v27.0.0', lts: false }, { version: 'v26.13.0', lts: 'Lithium' }, { version: 'v24.22.2', lts: 'Krypton' }, { version: 'v25.9.0', lts: false }]), 26)
  })

  it('moves to a new LTS in .nvmrc and every image at once, a pinned one to the new tag’s digest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lts-'))
    const old = `sha256:${'a'.repeat(64)}`
    /** @type {string[]} */
    const asked = []
    const digest = async (/** @type {string} */ tag) => { asked.push(tag); return `sha256:${tag.startsWith('28-alpine') ? 'b'.repeat(64) : 'c'.repeat(64)}` }
    try {
      await mkdir(join(root, 'deploy'))
      await writeFile(join(root, '.nvmrc'), '26\n')
      await writeFile(join(root, 'deploy/Dockerfile'), `FROM ${image(26)}@${old} AS build\nRUN node --test\nFROM ${image(26)}@${old}\nFROM ${image(26, 'slim')}@${old}\n`)
      await writeFile(join(root, 'deploy/compose.yaml'), `image: ${image(26)}\n`)
      await writeFile(join(root, 'notes.md'), 'import { test } from "node:test"\n')
      execFileSync('git', ['init', '-q'], { cwd: root })
      assert.deepEqual(await write(28, root, digest), ['.nvmrc', 'deploy/Dockerfile', 'deploy/compose.yaml'])
      assert.equal(pinned(root), 28)
      assert.equal(await readFile(join(root, 'deploy/Dockerfile'), 'utf8'), `FROM ${image(28)}@sha256:${'b'.repeat(64)} AS build\nRUN node --test\nFROM ${image(28)}@sha256:${'b'.repeat(64)}\nFROM ${image(28, 'slim')}@sha256:${'c'.repeat(64)}\n`)
      assert.equal(await readFile(join(root, 'deploy/compose.yaml'), 'utf8'), `image: ${image(28)}\n`)
      assert.deepEqual(asked, ['28-alpine', '28-slim'], 'each variant asked once')
      assert.deepEqual(images(root).map(({ major }) => major), [28, 28, 28, 28])
      assert.deepEqual(await write(28, root, digest), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
