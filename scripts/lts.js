// SPDX-License-Identifier: MIT
// Jean's own Node, the one CI, the container images and Jean's server run, is the newest LTS, named once in .nvmrc (D701).
// What can't read that file names the same major in an image's tag, node:<major>-alpine, pinned to its digest where
// scripts/security.js asks for one, and test/lts.test.js holds every one to it. This asks Node's own list of releases
// whether a newer LTS has come out since. The bridge's shell head (app/bridge/bridge.js) pins the Node it fetches where a
// computer has none (D766): the newest release of that major, with its archive's hash for each system, from Node's own
// SHASUMS256.txt.
//   npm run lts              exits 1 when .nvmrc isn't the newest LTS's major, or an image or the bridge names another, or
//                            the bridge's hashes aren't its release's
//   npm run lts -- --write   moves .nvmrc and every image to the newest LTS, each pinned one to the new tag's digest, and
//                            the bridge to that major's newest release
// CI runs it on every push to main, every pull request and each Monday (.github/workflows/lts.yml). The engines in
// package.json are something else: the oldest Node Jean's scripts run on, for Intl's features.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
/** Node's own list of releases, newest first, each with its LTS's name, or false. */
export const RELEASES = 'https://nodejs.org/dist/index.json'
/** Node's own builds, and the file whose shell head pins the one the bridge fetches. */
const BUILDS = 'https://nodejs.org/dist/'
const RUNTIME = 'app/bridge/bridge.js'
/** In that head: the version, and each system's build by Node's name for it, with its archive's hash. */
const VERSION = /^( {2}v=)(\S+)$/m
const BUILD = / p=([\w-]+) h=([0-9a-f]*);;/g
/** An image of Node's by its major, as Docker names one: node:<major>, node:<major>-alpine. */
const IMAGE = /\bnode:(\d+)\b/g
/** One pinned to its digest, which a new major's tag needs a new one of: node:<major><variant>@sha256:<hex>. */
const PINNED = /\bnode:(\d+)([\w.-]*)@sha256:[0-9a-f]{64}\b/g
/** Docker Hub, where Node's images are, and where a token to read them comes from. */
const REGISTRY = 'https://registry-1.docker.io/v2/library/node'
const AUTH = 'https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/node:pull'
/** What an image for every platform is, as registries name its index. */
const INDEX = ['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json']

/** The major .nvmrc names, alone on its line. @param {string} [root] @returns {number} */
export function pinned(root = ROOT) {
  const text = readFileSync(join(root, '.nvmrc'), 'utf8')
  if (!/^\d+\n?$/.test(text)) throw new Error(`.nvmrc holds ${JSON.stringify(text)}, not a major alone`)
  return Number(text)
}

/** The newest LTS's major in Node's list of releases. @param {{ version: string, lts: string | false }[]} releases */
export const newest = (releases) => Math.max(...releases.filter((release) => release.lts).map((release) => Number(/^v(\d+)\./.exec(release.version)?.[1])))

/** @typedef {{ version: string, sha256: Record<string, string> }} Runtime the Node the bridge fetches: its version, and its archive's hash by Node's name for each system */

/** The bridge's shell head, which ends at the first line that closes JavaScript's comment. @param {string} text */
const head = (text) => text.slice(0, text.indexOf('\n*/\n') + 1)

/** The Node a bridge's head pins. @param {string} text @returns {Runtime} */
export const runtimeOf = (text) => ({ version: VERSION.exec(head(text))?.[2] ?? '', sha256: Object.fromEntries([...head(text).matchAll(BUILD)].map(([, platform, hash]) => [platform, hash])) })

/** A bridge with its head pinning that Node instead. @param {string} text @param {Runtime} runtime */
export const pin = (text, { version, sha256 }) => head(text).replace(VERSION, (_, lead) => lead + version).replace(BUILD, (_, platform) => ` p=${platform} h=${sha256[platform] ?? ''};;`) + text.slice(head(text).length)

/** The Node the bridge fetches, as its head pins it. @param {string} [root] */
export const runtime = (root = ROOT) => runtimeOf(readFileSync(join(root, RUNTIME), 'utf8'))

/** The newest release of a major in Node's list of releases, newest first. @param {number} major @param {{ version: string }[]} releases */
export const newestOf = (major, releases) => releases.map((release) => release.version.slice(1)).find((version) => Number(version.split('.')[0]) === major)

/**
 * A release's archive for each system the bridge fetches for, by its hash in the release's SHASUMS256.txt.
 * @param {string} version @param {(version: string) => Promise<string>} [sums] @param {string[]} [systems] @returns {Promise<Runtime>}
 */
export async function pins(version, sums = async (at) => (await fetch(`${BUILDS}v${at}/SHASUMS256.txt`)).text(), systems = Object.keys(runtime().sha256)) {
  const text = await sums(version)
  const sha256 = Object.fromEntries(systems.map((platform) => [platform, new RegExp(`^([0-9a-f]{64})  node-v${version.replaceAll('.', '\\.')}-${platform}\\.tar\\.gz$`, 'm').exec(text)?.[1] ?? '']))
  const missing = Object.keys(sha256).filter((platform) => !sha256[platform])
  if (missing.length) throw new Error(`Node ${version} has no archive for ${missing.join(', ')} in its SHASUMS256.txt`)
  return { version, sha256 }
}

/** Text files git lists here, tracked or new, but third-party ones and built data, as scripts/security.js reads them. @param {string} root */
const listed = (root) => execFileSync('git', ['-c', `safe.directory=${resolve(root)}`, 'ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
  .split('\n')
  .filter((path) => path && !/^(app\/vendor|spikes|dist)\/|\.(png|jpe?g|webp|gif|svg|woff2?|ttf|wasm|xlsx|zip|ico|icns|onnx|bin|sf3|pdf|docx|pptx|mp3|mp4|wav)$|package-lock\.json$/i.test(path))

/** Every image of Node's a file here names, with its major. @param {string} [root] @returns {{ path: string, line: number, major: number }[]} */
export function images(root = ROOT) {
  return listed(root).flatMap((path) => {
    let text = ''
    try { text = readFileSync(join(root, path), 'utf8') } catch { return [] }
    return text.includes('node:') ? text.split('\n').flatMap((line, i) => [...line.matchAll(IMAGE)].map((match) => ({ path, line: i + 1, major: Number(match[1]) }))) : []
  })
}

/** The digest of a tag of Node's image, for every platform, as Docker Hub serves it. @param {string} tag e.g. 28-alpine */
export async function digestOf(tag) {
  const { token } = await (await fetch(AUTH)).json()
  const response = await fetch(`${REGISTRY}/manifests/${tag}`, { method: 'HEAD', headers: { authorization: `Bearer ${token}`, accept: INDEX.join(', ') } })
  const digest = response.headers.get('docker-content-digest')
  if (!response.ok || !digest?.startsWith('sha256:')) throw new Error(`node:${tag} has no digest on Docker Hub (${response.status})`)
  return digest
}

/**
 * Moves .nvmrc and every image of Node's to `major`, a pinned one to the new tag's digest.
 * @param {number} major @param {string} [root] @param {(tag: string) => Promise<string>} [digest]
 * @returns {Promise<string[]>} the files changed
 */
export async function write(major, root = ROOT, digest = digestOf) {
  const paths = [...new Set(images(root).filter((image) => image.major !== major).map((image) => image.path))]
  /** Each variant's new digest, asked once. @type {Map<string, string>} */
  const digests = new Map()
  for (const path of paths) {
    const text = readFileSync(join(root, path), 'utf8')
    for (const [, , variant] of text.matchAll(PINNED)) if (!digests.has(variant)) digests.set(variant, await digest(`${major}${variant}`))
    writeFileSync(join(root, path), text.replace(PINNED, (_, __, variant) => `node:${major}${variant}@${digests.get(variant)}`).replace(IMAGE, `node:${major}`))
  }
  if (pinned(root) === major) return paths
  writeFileSync(join(root, '.nvmrc'), `${major}\n`)
  return ['.nvmrc', ...paths]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const response = await fetch(RELEASES)
  if (!response.ok) throw new Error(`${RELEASES} answered ${response.status}`)
  const releases = await response.json()
  const lts = newest(releases)
  const ours = pinned()
  if (process.argv.includes('--write')) {
    const changed = await write(lts)
    const fetched = await pins(/** @type {string} */ (newestOf(lts, releases)))
    if (JSON.stringify(fetched) !== JSON.stringify(runtime())) {
      writeFileSync(join(ROOT, RUNTIME), pin(readFileSync(join(ROOT, RUNTIME), 'utf8'), fetched))
      changed.push(RUNTIME)
    }
    console.log(changed.length ? `Node ${lts}, the newest LTS, in ${changed.join(', ')}: run npm run check on Node ${lts}, and give Jean's server its compose.yaml again (deploy/server/README.md)` : `Node ${lts}, the newest LTS, everywhere already`)
  } else {
    const off = images().filter((image) => image.major !== ours)
    for (const image of off) console.log(`${image.path}:${image.line} names Node ${image.major}, not .nvmrc's ${ours}`)
    const line = runtime()
    const lineOff = Number(line.version.split('.')[0]) !== ours
    const forged = JSON.stringify(await pins(line.version)) !== JSON.stringify(line)
    if (lineOff) console.log(`${RUNTIME} pins Node ${line.version}, not .nvmrc's ${ours}: npm run lts -- --write`)
    if (forged) console.log(`${RUNTIME}'s hashes aren't Node ${line.version}'s own: npm run lts -- --write`)
    if (lts !== ours) console.log(`Node ${lts} is the newest LTS, and .nvmrc names ${ours}: npm run lts -- --write`)
    if (lts === ours && !off.length && !lineOff && !forged) console.log(`Node ${ours}, the newest LTS`)
    process.exitCode = lts !== ours || off.length || lineOff || forged ? 1 : 0
  }
}
