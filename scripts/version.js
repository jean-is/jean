// SPDX-License-Identifier: MIT
// Jean's version, by semver (D735), read from git and written in no file git holds: the newest version's tag a
// commit reaches, raised once by the most that the commits since ask, as gitmoji grades the code each first line
// opens with: :boom: a major change, :sparkles: a minor one, a fix or a change people see a patch, the rest nothing.
// Before 1.0.0, whose tag is the public launch's (D173), :boom: raises the minor, as npm's ^0.y already reads it.
// CI tags each push to main that asks for a version once what gates the deploy passes; every build reads it here,
// or in VERSION where there is no history (a container's build), or in package.json where a build wrote it (deploy.js).
// Usage: npm run version             the version HEAD has, or will have once CI tags it
//        npm run version -- --tag    tags HEAD with it when it is new, then prints version= and release= for $GITHUB_OUTPUT
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** @typedef {'major' | 'minor' | 'patch'} Level */

/** What each gitmoji asks of the version, as gitmoji's own list grades it (gitmojis.json's `semver`); the others ask nothing. */
export const GRADES = /** @type {Record<string, Level>} */ ({
  boom: 'major',
  sparkles: 'minor',
  ...Object.fromEntries(('zap bug ambulance lipstick lock arrow_down arrow_up pushpin chart_with_upwards_trend heavy_plus_sign heavy_minus_sign wrench ' +
    'globe_with_meridians pencil2 rewind package alien bento wheelchair speech_balloon card_file_box children_crossing iphone egg alembic mag label ' +
    'triangular_flag_on_post goal_net dizzy wastebasket passport_control adhesive_bandage necktie').split(' ').map((code) => [code, 'patch'])),
})

/** @type {Level[]} */
const LEVELS = ['patch', 'minor', 'major']
const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** A version's tag as its three numbers; null for any other tag (v0.7, v1.0.0-rc.1). @param {string} tag @returns {[number, number, number] | null} */
export function parse (tag) {
  const match = TAG.exec(tag)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** What a commit's first line asks of the version, by the gitmoji it opens with. @param {string} subject @returns {Level | null} */
export function grade (subject) {
  const code = /^:([\w+-]+):/.exec(subject)?.[1]
  return code && Object.hasOwn(GRADES, code) ? GRADES[code] : null
}

/** The newest version's tag among tags, by semver's order. @param {string[]} tags */
export function newest (tags) {
  const found = /** @type {[string, [number, number, number]][]} */ (tags.map((tag) => [tag, parse(tag)]).filter(([, numbers]) => numbers))
  return found.sort(([, a], [, b]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).at(-1)?.[0] ?? null
}

/**
 * The version a commit gets: the newest version's tag it reaches, raised once by the most any commit since asks
 * (0.9.0, a :sparkles: and two :bug: make 0.10.0), or that tag's own when none asks anything; from 0.0.0 before any tag.
 * @param {string[]} tags  the tags it reaches @param {string[]} subjects  the first lines of the commits since the newest
 * @returns {{ version: string, base: string | null, level: Level | null }}
 */
export function next (tags, subjects) {
  const base = newest(tags)
  const [major, minor, patch] = (base && parse(base)) || [0, 0, 0]
  const asked = subjects.map(grade).reduce((/** @type {Level | null} */ most, one) => (one && LEVELS.indexOf(one) > (most ? LEVELS.indexOf(most) : -1) ? one : most), null)
  const level = asked === 'major' && major === 0 ? 'minor' : asked
  const version = level === 'major' ? `${major + 1}.0.0` : level === 'minor' ? `${major}.${minor + 1}.0` : level === 'patch' ? `${major}.${minor}.${patch + 1}` : `${major}.${minor}.${patch}`
  return { version, base, level }
}

/** @param {string} root @param {string[]} args */
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/**
 * What git says of a commit's version, with how many commits since its base; null where it can't tell: no repository,
 * or a shallow clone that reaches no version's tag (GitHub's checkout, unless asked for fetch-depth 0).
 * @param {string} root @param {string} [commit]
 */
export function history (root, commit = 'HEAD') {
  try {
    const tags = git(root, 'tag', '--merged', commit, '--list', 'v*').split('\n').filter(Boolean)
    const base = newest(tags)
    if (!base && git(root, 'rev-parse', '--is-shallow-repository') === 'true') return null
    const subjects = git(root, 'log', '--format=%s', base ? `${base}..${commit}` : commit).split('\n').filter(Boolean)
    return { ...next(tags, subjects), commits: subjects.length }
  } catch {
    return null
  }
}

/**
 * The version a commit of Jean has, or will have once CI tags it: VERSION's when set, else git's, else the one a
 * build wrote into its copy's package.json, git holding none; null when nothing can tell.
 * @param {{ root?: string, commit?: string, env?: Record<string, string | undefined> }} [options]
 * @returns {string | null}
 */
export function versionOf ({ root = ROOT, commit = 'HEAD', env = process.env } = {}) {
  if (env.VERSION) {
    if (!parse(`v${env.VERSION}`)) throw new Error(`VERSION=${env.VERSION} isn't a version: MAJOR.MINOR.PATCH, as semver writes it`)
    return env.VERSION
  }
  const found = history(root, commit)?.version
  if (found) return found
  try {
    const written = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
    return typeof written === 'string' && parse(`v${written}`) ? written : null
  } catch {
    return null
  }
}

/**
 * Tags HEAD with its version when it asks for a new one, as CI does once a push to main passes: an annotated tag, its
 * tagger git's committer (GIT_COMMITTER_NAME and GIT_COMMITTER_EMAIL in CI). `release` is the version HEAD releases,
 * HEAD's tag already included, or null with why: no commit since the last asked for one, or a later commit holding
 * this one took the version first (an older run finishing late).
 * @param {string} [root] @returns {{ version: string, release: string | null, why: string }}
 */
export function tag (root = ROOT) {
  const found = history(root)
  if (!found) throw new Error("git can't tell HEAD's version here: it needs the whole history and its tags (actions/checkout's fetch-depth: 0)")
  const { version, base, commits } = found
  const name = `v${version}`
  if (!base) throw new Error(`no version's tag yet: the first is tagged by hand (git tag --annotate --message ${version} v${version}), CI raising it from there`)
  if (base === name && commits === 0) return { version, release: version, why: `HEAD is ${name} already` }
  if (base === name) return { version, release: null, why: `none of the ${commits} commit(s) since ${base} asks for a new version` }
  if (git(root, 'tag', '--list', name)) return { version, release: null, why: `${name} is a later commit's, which holds this one` }
  git(root, 'tag', '--annotate', '--message', version, name, 'HEAD')
  return { version, release: version, why: `tagged ${name}: ${base ? `${base} and ${commits} commit(s) since` : `${commits} commit(s)`}, the most a ${found.level} change` }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes('--tag')) {
      const { version, release, why } = tag()
      console.error(`version: ${why}`)
      console.log(`version=${version}\nrelease=${release ?? ''}`)
    } else {
      const version = versionOf()
      if (!version) throw new Error("nothing here tells the version: git's history and tags, VERSION or a build's package.json")
      const found = process.env.VERSION ? null : history(ROOT)
      console.log(version)
      if (found) console.error(found.base === `v${version}` ? (found.commits ? `${found.base}, none of the ${found.commits} commit(s) since asking for more` : `${found.base}, at HEAD`) : `${found.base ?? 'no version yet'} and ${found.commits} commit(s) since, the most a ${found.level} change: CI tags it once a push to main passes`)
    }
  } catch (error) {
    console.error(`version: ${/** @type {Error} */ (error).message}`)
    process.exit(1)
  }
}
