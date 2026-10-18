import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { readZip } from '../app/core/zip.js'
import { ALLOWED, NAMESPACE, SIGNER, filesUnder, releaseName, sign, sums, verify, zipOf } from '../scripts/release.js'

/** Whether OpenSSH's ssh-keygen is here to sign and check with. */
const sshKeygen = (() => {
  try {
    execFileSync('ssh-keygen', ['-Y', 'sign', '-?'], { stdio: 'ignore' })
  } catch (error) {
    return /** @type {{ code?: string }} */ (error).code !== 'ENOENT'
  }
  return true
})()

describe('release', () => {
  it('names a release by its version and commit', () => {
    assert.equal(releaseName('0.8.0', 'c10fc5a6'), 'jean-0.8.0-c10fc5a6')
  })

  it('writes SHA256SUMS as sha256sum does, one file a line', () => {
    const text = sums([['a.zip', new TextEncoder().encode('abc')], ['a.cdx.json', new Uint8Array()]])
    assert.equal(text, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  a.zip\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  a.cdx.json\n')
  })

  it('zips a folder in order, inside a folder named as the release, each file dated as given', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'jean-release-test-'))
    try {
      await mkdir(join(folder, 'ui'))
      await writeFile(join(folder, 'ui', 'app.js'), 'export {}\n')
      await writeFile(join(folder, 'index.html'), '<!doctype html>\n')
      assert.deepEqual(await filesUnder(folder), ['index.html', 'ui/app.js'])
      const date = new Date(2026, 9, 18, 22, 19, 30)
      const zip = await zipOf(folder, 'jean-0.8.0-c10fc5a6', date)
      const entries = readZip(zip)
      assert.deepEqual(entries.map((entry) => entry.name), ['jean-0.8.0-c10fc5a6/index.html', 'jean-0.8.0-c10fc5a6/ui/app.js'])
      assert.equal(new TextDecoder().decode(await entries[1].read()), 'export {}\n')
      assert.deepEqual(await zipOf(folder, 'jean-0.8.0-c10fc5a6', date), zip, 'the same files make the same zip')
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('names one signer, for files and git tags, with an Ed25519 key', async () => {
    const lines = (await readFile(ALLOWED, 'utf8')).split('\n').filter((line) => line && !line.startsWith('#'))
    assert.equal(lines.length, 1)
    const [principal, options, type, key] = lines[0].split(' ')
    assert.equal(principal, SIGNER)
    assert.equal(options, `namespaces="${NAMESPACE},git"`)
    assert.equal(type, 'ssh-ed25519')
    assert.match(key, /^AAAAC3NzaC1lZDI1NTE5[A-Za-z0-9+/]+=*$/)
  })

  it('checks a signature against the allowed signers, and refuses a changed file or another key', { skip: !sshKeygen && 'no ssh-keygen here' }, async () => {
    const folder = await mkdtemp(join(tmpdir(), 'jean-release-test-'))
    try {
      for (const name of ['ours', 'theirs']) execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', name, '-f', join(folder, name)])
      const allowed = join(folder, 'allowed_signers')
      await writeFile(allowed, `${SIGNER} namespaces="${NAMESPACE}" ${await readFile(join(folder, 'ours.pub'), 'utf8')}`)
      const file = join(folder, 'SHA256SUMS')
      await writeFile(file, sums([['a.zip', new TextEncoder().encode('abc')]]))
      assert.equal(sign(file, join(folder, 'ours')), `${file}.sig`)
      assert.equal(verify(file, allowed), true)
      assert.equal(verify(file, allowed, 'someone.else'), false, 'another signer')
      assert.equal(verify(file), false, "a key trust/allowed_signers doesn't hold")
      await writeFile(file, sums([['a.zip', new TextEncoder().encode('abd')]]))
      assert.equal(verify(file, allowed), false, 'a changed file')
      sign(file, join(folder, 'theirs'))
      assert.equal(verify(file, allowed), false, 'another key')
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})
