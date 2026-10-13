// Puts a commit of Jean on a server reached over SSH (D320): builds it from git, never from the working
// tree, with `npm run build:web`, uploads dist/web/ as a new release beside the earlier ones, then
// points `current` at it in one step, keeping the last five. DEPLOY_TO names the server and its
// folder, as rsync writes them, so no address is written here; the server serves <folder>/current.
// It needs ssh and rsync here, and rsync with GNU cp and mv (Linux) there.
// Usage: DEPLOY_TO=host:/path npm run deploy [-- <commit>]     (HEAD by default)
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** How many releases the server keeps, the current one among them. */
export const KEEP = 5

/**
 * DEPLOY_TO split into the SSH destination and the absolute folder on it. Neither may hold
 * whitespace or quotes, nor the host start with a dash, so both go into commands as they are.
 * @param {string | undefined} target  host:/path, as rsync and scp write it
 */
export function parseTarget (target) {
  const match = /^([^-:/\s'"][^:/\s'"]*):(\/[^\s'"]*?)\/?$/.exec(target ?? '')
  if (!match || match[2] === '/') throw new Error('DEPLOY_TO names the server and a folder on it, as host:/path (for example DEPLOY_TO=myserver:/srv/jean)')
  return { host: match[1], folder: match[2] }
}

/**
 * A release's folder: when, in UTC to the second, and which commit, so the names sort by time.
 * @param {Date} date @param {string} commit  its short hash
 */
export const releaseName = (date, commit) => `${date.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}-${commit}`

/**
 * What the server runs before and after the upload. The new release starts as hard links to the
 * current one, so rsync rewrites only what changed and an unchanged file keeps its time, and with it
 * the ETag browsers revalidate against; `mv -T` swaps `current` at once, so no visitor gets two
 * versions' files; the oldest releases go.
 * @param {string} folder @param {string} release
 */
export function remote (folder, release) {
  const dir = `${folder}/releases/${release}`
  return {
    prepare: `set -e; mkdir -p '${folder}/releases'; if [ -d '${folder}/current' ]; then cp -al '${folder}/current/' '${dir}'; else mkdir '${dir}'; fi`,
    publish: `set -e; cd '${folder}'; ln -sfn 'releases/${release}' current.new; mv -T current.new current; ls -1d releases/* | head -n -${KEEP} | xargs -r rm -rf`,
  }
}

/** @param {string} command @param {string[]} args @param {string} [cwd] */
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' })

async function main () {
  const { host, folder } = parseTarget(process.env.DEPLOY_TO)
  const commit = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', `${process.argv[2] ?? 'HEAD'}^{commit}`], { encoding: 'utf8' }).trim()
  const release = releaseName(new Date(), commit)
  const work = await mkdtemp(join(tmpdir(), 'jean-deploy-'))
  const source = join(work, 'jean')
  try {
    console.log(`deploy: building ${commit} as git has it, without the working tree's changes`)
    run('git', ['-C', ROOT, 'archive', '--format=tar', '-o', join(work, 'jean.tar'), commit])
    await mkdir(source)
    run('tar', ['-xf', join(work, 'jean.tar'), '-C', source])
    run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], source)
    run('npm', ['run', 'build:web'], source)
    const { prepare, publish } = remote(folder, release)
    run('ssh', [host, prepare])
    run('rsync', ['-rlp', '--checksum', '--delete', `${join(source, 'dist', 'web')}/`, `${host}:${folder}/releases/${release}/`])
    run('ssh', [host, publish])
    console.log(`deploy: ${host} serves ${release}`)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`deploy: ${error.message}`)
    process.exit(1)
  })
}
