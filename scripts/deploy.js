// SPDX-License-Identifier: MIT
// Puts a commit of Jean on a server reached over SSH (D320): builds it from git, never from the working
// tree, with `npm run build:web`, uploads dist/web/ as a new release beside the earlier ones, then
// points `current` at it in one step, keeping the last five. Meanwhile it publishes the render package
// from the same build when npm doesn't list the version that build names (D321), under the npm login
// here, which may ask for its one-time code (`npm run render -- --publish`, which CI's render job ran
// minutes before, so npm usually holds it already), and waits until npm lists it, since npm holds a
// publish for minutes before anyone can download it; the switch waits for both, and if either fails,
// the upload goes and the server is left as it was.
// DEPLOY_TO names the server and its folder, as rsync writes them, so no address is written here; the
// server serves <folder>/current. It needs ssh and rsync here, and rsync with GNU cp and mv (Linux) there.
// DEPLOY_TO=bunny:<storage zone> puts the release on Bunny CDN instead, as jean.is is served (bunny.js).
// Usage: DEPLOY_TO=host:/path npm run deploy [-- <commit>]     (HEAD by default)
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { bunnyRelease, zoneOf } from './bunny.js'
import { NAME, publishedVersions } from './render.js'
import { versionOf } from './version.js'

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
 * versions' files; the oldest releases go, but those a hosted copy is pinned to, which
 * `tenants/pinned` lists in the folder of hosted copies (`npm run tenant`, D456). A release that won't
 * be served is removed, its hard links with it, which leaves `current` whole.
 * @param {string} folder @param {string} release
 */
export function remote (folder, release) {
  const dir = `${folder}/releases/${release}`
  return {
    prepare: `set -e; mkdir -p '${folder}/releases'; if [ -d '${folder}/current' ]; then cp -al '${folder}/current/' '${dir}'; else mkdir '${dir}'; fi`,
    publish: `set -e; cd '${folder}'; ln -sfn 'releases/${release}' current.new; mv -T current.new current; ls -1d releases/* | head -n -${KEEP} | { if [ -f tenants/pinned ]; then grep -vxF -f tenants/pinned; else cat; fi; } | xargs -r rm -rf`,
    discard: `rm -rf '${dir}'`,
  }
}

/**
 * The render package's version that npm lacks, which a deploy publishes before the site names it: a page
 * saved from the site draws itself with the version it names, from npm (D305). Null when npm has it,
 * or when the build lists no render package.
 * @param {{ render?: { version: string } }} listing  capabilities.json
 * @param {string[]} published  the versions npm has
 */
export const unpublished = (listing, published) => (listing.render && !published.includes(listing.render.version) ? listing.render.version : null)

/** How long a deploy waits for npm to list what it published, and how often it asks, in milliseconds. */
export const PUBLIC = { within: 20 * 60_000, every: 15_000 }

/**
 * Waits until npm lists the version: npm may hold a publish staged a while before anyone can download it,
 * and neither the site nor the share host may name it before then. Throws once `within` has passed, or
 * when `signal` is aborted.
 * @param {string} version @param {() => string[] | Promise<string[]>} versions  what npm lists now
 * @param {{ within?: number, every?: number, wait?: (ms: number) => Promise<unknown>, say?: (text: string) => void, signal?: AbortSignal }} [options]
 */
export async function whenPublic (version, versions, { signal, within = PUBLIC.within, every = PUBLIC.every, wait = (ms) => sleep(ms, undefined, { signal }), say = console.log } = {}) {
  for (let waited = 0; ; waited += every) {
    signal?.throwIfAborted()
    if ((await versions()).includes(version)) return
    if (waited >= within) throw new Error(`npm hasn't made ${NAME}@${version} public in ${Math.round(within / 60_000)} minutes, and nothing names it yet; a staged publish may wait for approval (npm stage list ${NAME}). Run the deploy again once npm lists it.`)
    if (waited % 60_000 === 0) say(`deploy: waiting for npm to make ${NAME}@${version} public`)
    await wait(every)
  }
}

/** @param {string} command @param {string[]} args @param {string} [cwd] @param {NodeJS.ProcessEnv} [env] */
const run = (command, args, cwd, env) => execFileSync(command, args, { cwd, env, stdio: 'inherit' })

/**
 * A command run as run() does, without holding up what runs beside it; stopped when `signal` is aborted.
 * @param {string} command @param {string[]} args @param {{ cwd?: string, signal?: AbortSignal }} [options] @returns {Promise<void>}
 */
const spawned = (command, args, { cwd, signal } = {}) => new Promise((resolve, reject) => {
  spawn(command, args, { cwd, signal, stdio: 'inherit' }).on('error', reject)
    .on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${basename(command)} ${args[0]} failed (exit ${code})`))))
})

/** The commit a name gives, short, as git has it. @param {string} [name]  HEAD by default */
export const commitOf = (name = 'HEAD') => execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', `${name}^{commit}`], { encoding: 'utf8' }).trim()

/**
 * A commit built as git has it, never with the working tree's changes, and only with the packages its
 * lockfile names: `npm run build:web` in `<work>/jean`, which it returns. Its compressed copies come
 * from this checkout's cache when one reads back as its file, so only the files that changed are compressed.
 * Settings › General dates it by the commit, and names its version, which git gives (VERSION in CI, D735) and the
 * copy's package.json carries, for everything built there and the bill of materials.
 * @param {string} commit @param {string} work
 */
export async function build (commit, work) {
  const source = join(work, 'jean')
  run('git', ['-C', ROOT, 'archive', '--format=tar', '-o', join(work, 'jean.tar'), commit])
  await mkdir(source)
  run('tar', ['-xf', join(work, 'jean.tar'), '-C', source])
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], source)
  const version = versionOf({ commit })
  if (!version) throw new Error(`nothing tells ${commit}'s version: git's history and tags, or VERSION (D735)`)
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  await writeFile(join(source, 'package.json'), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`)
  const epoch = execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%ct', commit], { encoding: 'utf8' }).trim()
  run('npm', ['run', 'build:web'], source, { ...process.env, SOURCE_DATE_EPOCH: epoch, WEB_CACHE: process.env.WEB_CACHE ?? join(ROOT, 'node_modules', '.cache', 'web') })
  return source
}

/**
 * Runs the jobs side by side. The first to fail stops the others through their signal; once all have
 * stopped, `undo` runs and that first failure is thrown.
 * @param {Array<(signal: AbortSignal) => unknown>} jobs @param {() => unknown} undo
 */
export async function together (jobs, undo) {
  const stop = new AbortController()
  await Promise.allSettled(jobs.map(async (job) => {
    try {
      await job(stop.signal)
    } catch (error) {
      if (!stop.signal.aborted) stop.abort(error)
    }
  }))
  if (!stop.signal.aborted) return
  await undo()
  throw stop.signal.reason
}

/**
 * The render package built from the same source, published, and waited for until npm lists it.
 * @param {string} version @param {string} source @param {AbortSignal} signal
 */
async function publishRender (version, source, signal) {
  console.log(`deploy: publishing ${NAME}@${version}, which pages saved from this release draw themselves with`)
  // Not stopped with the upload: a publish npm has begun is let finish.
  await spawned(process.execPath, [join('scripts', 'render.js'), '--publish'], { cwd: source })
  await whenPublic(version, () => publishedVersions(source), { signal })
}

/**
 * dist/web/ as a release on a server over SSH, in the steps bunnyRelease() takes: uploaded beside the
 * current one, served, or removed. @param {{ host: string, folder: string }} server @param {string} dist @param {string} release
 */
function serverRelease ({ host, folder }, dist, release) {
  const { prepare, publish, discard } = remote(folder, release)
  let uploading = false
  return {
    upload: async (/** @type {AbortSignal} */ signal) => {
      uploading = true
      await spawned('ssh', [host, prepare], { signal })
      await spawned('rsync', ['-rlp', '--checksum', '--delete', `${dist}/`, `${host}:${folder}/releases/${release}/`], { signal })
    },
    serve: () => spawned('ssh', [host, publish]),
    discard: async () => { if (uploading) await spawned('ssh', [host, discard]) },
  }
}

async function main () {
  const zone = zoneOf(process.env.DEPLOY_TO)
  const server = zone ? null : parseTarget(process.env.DEPLOY_TO)
  const commit = commitOf(process.argv[2])
  const release = releaseName(new Date(), commit)
  const work = await mkdtemp(join(tmpdir(), 'jean-deploy-'))
  try {
    console.log(`deploy: building ${commit} as git has it, without the working tree's changes`)
    const source = await build(commit, work)
    const dist = join(source, 'dist', 'web')
    const site = server ? serverRelease(server, dist, release) : bunnyRelease({ dist, zone: String(zone), release, keep: KEEP })
    const version = unpublished(JSON.parse(await readFile(join(source, 'app', 'capabilities.json'), 'utf8')), await publishedVersions(source))
    // npm takes minutes to make a publish public, which the upload fills; nothing names the release until both are done.
    await together([(signal) => site.upload(signal), (signal) => version && publishRender(version, source, signal)], async () => {
      await site.discard().catch((error) => console.error(`deploy: ${release} stays where it was uploaded, served by nothing: ${error.message}`))
    })
    await site.serve()
    console.log(server ? `deploy: ${server.host} serves ${release}` : `deploy: Bunny serves ${release} from ${zone}`)
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
