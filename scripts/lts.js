// SPDX-License-Identifier: MIT
// Jean's own Node, the one CI, the container images and Jean's server run, is the newest LTS, named once in .nvmrc (D701).
// What can't read that file names the same major in an image's tag, node:<major>-alpine, pinned to its digest where
// scripts/security.js asks for one, and test/lts.test.js holds every one to it. This asks Node's own list of releases
// whether a newer LTS has come out since.
//   npm run lts              exits 1 when .nvmrc isn't the newest LTS's major, or an image names another
//   npm run lts -- --write   moves .nvmrc and every image to the newest LTS, each pinned one to the new tag's digest
// CI runs it on every push to main, every pull request and each Monday (.github/workflows/lts.yml). The engines in
// package.json are something else: the oldest Node Jean's scripts run on, for Intl's features.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
/** Node's own list of releases, newest first, each with its LTS's name, or false. */
export const RELEASES = 'https://nodejs.org/dist/index.json'
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
  const lts = newest(await response.json())
  const ours = pinned()
  if (process.argv.includes('--write')) {
    const changed = await write(lts)
    console.log(changed.length ? `Node ${lts}, the newest LTS, in ${changed.join(', ')}: run npm run check on Node ${lts}, and give Jean's server its compose.yaml again (deploy/server/README.md)` : `Node ${lts}, the newest LTS, everywhere already`)
  } else {
    const off = images().filter((image) => image.major !== ours)
    for (const image of off) console.log(`${image.path}:${image.line} names Node ${image.major}, not .nvmrc's ${ours}`)
    if (lts !== ours) console.log(`Node ${lts} is the newest LTS, and .nvmrc names ${ours}: npm run lts -- --write`)
    if (lts === ours && !off.length) console.log(`Node ${ours}, the newest LTS`)
    process.exitCode = lts !== ours || off.length ? 1 : 0
  }
}
