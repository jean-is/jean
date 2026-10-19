// A release an organisation deploys without building it (D419): a commit built as `npm run deploy`
// builds one, from git and never from the working tree, with neither POLICY nor ADDRESS, so it is the
// same for every organisation. dist/release/ then holds dist/web/ as one zip, in a folder named as the
// release; the bill of materials of what ships, CycloneDX, as CI keeps it; SHA256SUMS naming both, as
// sha256sum writes it; and SHA256SUMS.sig, its SSH signature by RELEASE_KEY, which OpenSSH checks on
// every system against docs/trust/allowed_signers (docs/trust/releases.md). Before building, a line signed with
// the key is checked against that file, so a release signed with any other key never leaves.
// Usage: RELEASE_KEY=<the private key> npm run release [-- <commit>]     (HEAD by default)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeZip } from '../app/core/zip.js'
import { build, commitOf } from './deploy.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'dist', 'release')
/** Who signs releases, as docs/trust/allowed_signers names it. */
export const SIGNER = 'jean.is'
/** What an SSH signature of a release is for, so no signature made for anything else passes as one. */
export const NAMESPACE = 'file'
export const ALLOWED = join(ROOT, 'docs', 'trust', 'allowed_signers')

/** A release's name: the version, then the commit. @param {string} version @param {string} commit */
export const releaseName = (version, commit) => `jean-${version}-${commit}`

/**
 * SHA256SUMS as sha256sum writes it, which `sha256sum -c` and `shasum -a 256 -c` read.
 * @param {Array<[string, Uint8Array]>} files  name and bytes
 */
export const sums = (files) => files.map(([name, bytes]) => `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`).join('')

/**
 * Every file under a folder, by its path from there with forward slashes, in order, so the same files
 * make the same zip.
 * @param {string} folder
 * @returns {Promise<string[]>}
 */
export async function filesUnder (folder) {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/')).sort()
}

/**
 * A folder as a zip, inside a folder of the given name, each file dated as given.
 * @param {string} folder @param {string} name @param {Date} date
 */
export async function zipOf (folder, name, date) {
  const files = await Promise.all((await filesUnder(folder)).map(async (path) => ({ name: `${name}/${path}`, bytes: new Uint8Array(await readFile(join(folder, path))) })))
  return writeZip(files, date)
}

/**
 * Signs a file with an SSH key, as `<file>.sig`, over any signature there, which ssh-keygen would ask
 * about. A key with a passphrase asks for it.
 * @param {string} file @param {string} key  the private half
 */
export function sign (file, key) {
  rmSync(`${file}.sig`, { force: true })
  execFileSync('ssh-keygen', ['-q', '-Y', 'sign', '-f', key, '-n', NAMESPACE, file], { stdio: ['inherit', 'ignore', 'inherit'] })
  return `${file}.sig`
}

/**
 * Whether `<file>.sig` is the signer's signature of the file, by the keys a file of allowed signers holds.
 * @param {string} file @param {string} [allowed] @param {string} [signer]
 */
export function verify (file, allowed = ALLOWED, signer = SIGNER) {
  try {
    execFileSync('ssh-keygen', ['-Y', 'verify', '-f', allowed, '-I', signer, '-n', NAMESPACE, '-s', `${file}.sig`], { input: readFileSync(file), stdio: ['pipe', 'ignore', 'ignore'] })
    return true
  } catch {
    return false
  }
}

async function main () {
  const key = process.env.RELEASE_KEY
  if (!key) throw new Error('RELEASE_KEY names the private key that signs releases, whose public half docs/trust/allowed_signers holds')
  if (process.env.POLICY || process.env.ADDRESS) throw new Error("a release is every organisation's: unset POLICY and ADDRESS, which each adds to its own copy")
  const commit = commitOf(process.argv[2])
  const work = await mkdtemp(join(tmpdir(), 'jean-release-'))
  try {
    const probe = join(work, 'probe')
    await writeFile(probe, `${commit}\n`)
    sign(probe, key)
    if (!verify(probe)) throw new Error(`RELEASE_KEY isn't a key docs/trust/allowed_signers holds for ${SIGNER}`)
    console.log(`release: building ${commit} as git has it, without the working tree's changes`)
    const source = await build(commit, work)
    const { version } = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
    const name = releaseName(version, commit)
    const date = new Date(execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%cI', commit], { encoding: 'utf8' }).trim())
    const zip = await zipOf(join(source, 'dist', 'web'), name, date)
    const sbom = execFileSync('npm', ['sbom', '--omit=dev', '--sbom-format', 'cyclonedx'], { cwd: source, maxBuffer: 64 * 1024 * 1024 })
    /** @type {Array<[string, Uint8Array]>} */
    const files = [[`${name}.zip`, zip], [`${name}.cdx.json`, sbom]]
    await rm(OUT, { recursive: true, force: true })
    await mkdir(OUT, { recursive: true })
    for (const [file, bytes] of files) await writeFile(join(OUT, file), bytes)
    await writeFile(join(OUT, 'SHA256SUMS'), sums(files))
    sign(join(OUT, 'SHA256SUMS'), key)
    if (!verify(join(OUT, 'SHA256SUMS'))) throw new Error("the signature made doesn't check against docs/trust/allowed_signers")
    console.log(`release: ${name}, signed by ${SIGNER}, in dist/release: ${files.map(([file]) => file).join(', ')}, SHA256SUMS and SHA256SUMS.sig`)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`release: ${error.message}`)
    process.exit(1)
  })
}
