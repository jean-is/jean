// GitHub's CI on this machine (D724): every job of .github/workflows/*.yml, read from those files, so that a change there is
// replayed here as it is written. A job runs in the image it names, or with none in that image standing in for GitHub's
// Ubuntu 24.04 runner, Jean's own Node over it as setup-node puts it and `npm ci` done once per lockfile in the image's
// layer; a job that drives Docker, kind or helm runs here, in a clean copy of its own. Each starts from a clean copy of the
// commit, as GitHub's checkout does, and they run side by side as far as Docker's processors and memory go, after what they
// need. A job that runs only on a push, to publish, is rehearsed: built, never pushed, signed or deployed. A line that names
// a secret or a variable of the environment, or reaches out (npm publish, helm push, cosign, ssh…), is skipped and said, and
// `npm run deploy` becomes the build it starts with. An action, a condition or a key this file can't replay stops the run
// before anything starts, and test/ci.test.js holds every workflow to that in npm test.
// It needs Docker (OrbStack on a Mac); the containers job helm, kind and kubectl; CodeQL's job the codeql CLI, or it is
// skipped. Logs and artifacts go to dist/ci/, the last run's.
// Usage: npm run ci [-- <job>[:<matrix value>…] …] [--worktree] [--amd64] [--keep] [--list]
//   npm run ci -- e2e:webkit   WebKit's three parts of the browser tests (npm run ci -- check audit: those two jobs)
//   --worktree  the working tree, uncommitted changes and new files too, as if committed, rather than HEAD
//   --amd64     the image's jobs as linux/amd64, GitHub's runners' platform: under emulation on Apple silicon, slower
//   --keep      leave a failed job's container and kind cluster for a look
//   --list      the jobs, where each runs and how each step is replayed, without running any
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync, readdirSync } from 'node:fs'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { arch } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { RELEASES, pinned } from './lts.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'dist/ci')

/** The runner every job names: GitHub's for a public repository has four processors, and Playwright's '50%' two workers. */
const RUNNER = { label: 'ubuntu-24.04', workers: 2 }
/** The Trivy that trivy-action runs at the commit ci.yml pins (its input `version`'s default), as Aqua's image of it. */
export const TRIVY = { action: '38b337fff0a2f984d5be173c99e3f633438167ec', image: 'aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb' }
/** The buildx builder setup-buildx-action makes: BuildKit in a container of its own, which builds for several platforms. */
const BUILDER = 'jean-ci'
/** What a job takes of Docker's machine, processors and GB, by its id: the scheduler's measure, and a container's limits. */
const SIZES = /** @type {Record<string, [number, number]>} */ ({ e2e: [2, 2.5], check: [4, 4], containers: [4, 6], images: [4, 4], analyze: [4, 6] })
/** Which jobs go first: the longest. */
const FIRST = ['e2e', 'containers', 'check', 'analyze']

/**
 * Lines that reach out of this machine, never run here: what each becomes, and why. A line naming a secret or a variable
 * of the environment is skipped too.
 * @type {[RegExp, string, string][]}
 */
export const OUTWARD = [
  [/\bnpm run deploy\b/, 'npm run build:web', 'npm run deploy publishes the render package and uploads the site: here, the build it starts with'],
  [/\b(?:npm|pnpm|yarn) publish\b/, '', 'publishes to npm'],
  [/\bhelm (?:push|registry login)\b/, '', 'pushes to a registry'],
  [/\bcosign (?:sign|attest|login)\b/, '', 'signs in Sigstore’s public log'],
  [/\bdocker (?:push|login)\b/, '', 'pushes to a registry'],
  [/(?:^|[\s;&|(`])(?:ssh|scp|rsync)\s/, '', 'reaches a server'],
]

// The workflows' YAML

/**
 * A workflow's YAML, as far as GitHub's workflows here write it: block mappings and sequences, plain and quoted scalars,
 * flow sequences of scalars and literal blocks (|), every scalar a string, as GitHub's expressions read them. Anything
 * else throws rather than be read wrong.
 * @param {string} text
 * @returns {any}
 */
export function parse (text) {
  const lines = text.split('\n')
  let i = 0
  const indentOf = (/** @type {string} */ line) => line.length - line.trimStart().length
  const blank = (/** @type {string} */ line) => /^\s*(?:#.*)?$/.test(line)
  const item = (/** @type {string} */ line) => /^\s*-(?:\s|$)/.test(line)
  const fail = (/** @type {string} */ why) => { throw new Error(`line ${i + 1}: ${why}`) }
  const skip = () => { while (i < lines.length && blank(lines[i])) i++ }

  /** A scalar's text without what follows it: a comment, after a space. @param {string} value */
  const bare = (value) => {
    if (/^['"]/.test(value)) {
      const end = value[0] === "'" ? /^'(?:[^']|'')*'/.exec(value) : /^"(?:[^"\\]|\\.)*"/.exec(value)
      if (!end || !/^\s*(?:#.*)?$/.test(value.slice(end[0].length))) fail(`a quoted string I can't read: ${value}`)
      return /** @type {RegExpExecArray} */ (end)[0]
    }
    return value.replace(/\s+#.*$/, '').trim()
  }
  /** @param {string} value @returns {string | string[]} */
  const scalar = (value) => {
    if (value.startsWith("'")) return value.slice(1, -1).replaceAll("''", "'")
    if (value.startsWith('"')) return JSON.parse(value)
    if (value.startsWith('[')) {
      if (!value.endsWith(']') || /[[\]{}]/.test(value.slice(1, -1))) fail(`a flow sequence I can't read: ${value}`)
      const inner = value.slice(1, -1).trim()
      return inner ? (inner.match(/'(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|[^,]+/g) ?? []).map((one) => /** @type {string} */ (scalar(one.trim()))).filter((one) => one !== '') : []
    }
    if (/^[{&*!%@`]/.test(value) || /^[>]/.test(value)) fail(`YAML this reader doesn't know: ${value}`)
    return value
  }
  /** A literal block's text, its lines at their own indentation, under a key at `indent`. @param {number} indent @param {string} style */
  const literal = (indent, style) => {
    if (!/^\|-?$/.test(style)) fail(`a block scalar this reader doesn't know: ${style}`)
    const body = []
    let column = -1
    while (i < lines.length) {
      const line = lines[i]
      if (line.trim() === '') { body.push(''); i++; continue }
      if (column < 0) column = indentOf(line)
      if (indentOf(line) < column || column <= indent) break
      body.push(line.slice(column)); i++
    }
    while (body.length && body.at(-1) === '') body.pop()
    return body.join('\n') + (style === '|' && body.length ? '\n' : '')
  }
  /** The node under a key, a sequence item or the document: a mapping or a sequence. @returns {any} */
  const node = () => { skip(); return item(lines[i]) ? sequence(indentOf(lines[i])) : mapping(indentOf(lines[i])) }
  /** @param {number} indent @returns {any[]} */
  const sequence = (indent) => {
    const out = []
    for (skip(); i < lines.length && indentOf(lines[i]) >= indent; skip()) {
      const line = lines[i]
      if (indentOf(line) > indent || !item(line)) fail('an item out of line')
      const rest = line.slice(indent + 1).trimStart()
      const column = line.length - rest.length
      if (!rest) { i++; out.push(node()) } else if (/^[\w.-]+:(?:\s|$)/.test(rest)) {
        // "- key: value": a mapping whose first key is on this line, at the column of its others.
        lines[i] = ' '.repeat(column) + rest
        out.push(mapping(column))
      } else { i++; out.push(scalar(bare(rest))) }
    }
    return out
  }
  /** @param {number} indent */
  const mapping = (indent) => {
    /** @type {Record<string, any>} */
    const out = {}
    for (skip(); i < lines.length && indentOf(lines[i]) >= indent && !item(lines[i]); skip()) {
      const line = lines[i]
      if (indentOf(line) > indent) fail('a key out of line')
      const match = /^([\w.-]+|'[^']*'|"[^"]*"):(?:\s+(.*))?$/.exec(line.slice(indent))
      if (!match) fail(`not a key: ${line.trim()}`)
      const [, key, rest = ''] = /** @type {RegExpExecArray} */ (match)
      const name = /^['"]/.test(key) ? key.slice(1, -1) : key
      if (name in out) fail(`${name} twice`)
      const value = bare(rest)
      i++
      if (/^[|>]/.test(value)) out[name] = literal(indent, value)
      else if (value !== '') out[name] = scalar(value)
      else {
        skip()
        const next = lines[i] ?? ''
        out[name] = i < lines.length && (indentOf(next) > indent || (indentOf(next) === indent && item(next))) ? node() : null
      }
    }
    return out
  }
  const document = node()
  skip()
  if (i < lines.length) fail('more than one document')
  return document
}

// Expressions

/** What a job's `${{ github.… }}` reads here. @typedef {{ ref: string, ref_name: string, sha: string, actor: string, repository: string, repository_owner: string, event_name: string }} GitHub */
/** @typedef {{ matrix: Record<string, string>, github: GitHub, steps: Record<string, { outputs: Record<string, string> }> | null }} Context */

/**
 * `${{ … }}` in a value, read in a context: a path (matrix.shard, github.ref, steps.meta.outputs.tags), nothing more. A
 * secret or a variable of the environment is empty here. With no steps yet (planning), a step's output stays as written.
 * @param {string} text @param {Context} context
 */
export function substitute (text, context) {
  return text.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (whole, expression) => {
    if (!/^[\w-]+(?:\.[\w-]+)+$/.test(expression)) throw new Error(`can't read \${{ ${expression} }} here`)
    const [scope, ...path] = expression.split('.')
    if (scope === 'secrets' || scope === 'vars') return ''
    if (scope === 'steps' && !context.steps) return whole
    /** @type {any} */
    let value = /** @type {Record<string, any>} */ ({ matrix: context.matrix, github: context.github, steps: context.steps })[scope]
    for (const key of path) value = value?.[key]
    // A step's output it didn't set is empty, as on GitHub (a build that pushed nothing has no digest).
    if (value === undefined && scope === 'steps') return ''
    if (value === undefined) throw new Error(`\${{ ${expression} }} is nothing here`)
    return String(value)
  })
}

/** A step's `if:`, by whether a step before it failed. */
const STATUS = /** @type {Record<string, (failed: boolean) => boolean>} */ ({ 'success()': (failed) => !failed, 'failure()': (failed) => failed, 'always()': () => true, '!cancelled()': () => true })

/**
 * When a job runs, from its `if:`: always, or only on a push (to main, or of a version's tag), to publish.
 * @param {string | undefined} condition @returns {'always' | 'push' | 'tag'}
 */
export function when (condition) {
  if (!condition) return 'always'
  const match = /^github\.event_name == 'push'(?: && (github\.ref == 'refs\/heads\/main'|startsWith\(github\.ref, 'refs\/tags\/v'\)))?$/.exec(condition)
  if (!match) throw new Error(`can't tell when it runs: if: ${condition}`)
  return match[1]?.startsWith('startsWith') ? 'tag' : 'push'
}

/**
 * A step's shell, as this machine runs it: a line naming a secret or a variable of the environment, or reaching out, becomes
 * a no-op saying why, or what stands in for it; the rest as written.
 * @param {string} script @param {string[]} withheld  the environment's names whose values are secrets or variables
 * @returns {{ script: string, skipped: string[] }}
 */
export function rehearse (script, withheld) {
  /** @type {string[]} */
  const skipped = []
  const named = withheld.length ? new RegExp(`\\$\\{?(?:${withheld.join('|')})\\b`) : null
  // Logical lines: one continued with a backslash is one line.
  const lines = script.replace(/\\\n/g, '\u0000').split('\n').map((line) => {
    const indent = /^\s*/.exec(line)?.[0] ?? ''
    const text = line.trim()
    if (!text || text.startsWith('#')) return line
    if (/\$\{\{\s*(?:secrets|vars)\./.test(text) || named?.test(text)) {
      skipped.push(`${text.replaceAll('\u0000', ' ')}: it needs a secret or a variable of GitHub's`)
      return `${indent}: # skipped here: it needs a secret or a variable of GitHub's`
    }
    for (const [pattern, instead, why] of OUTWARD) {
      if (!pattern.test(text)) continue
      skipped.push(`${text.replaceAll('\u0000', ' ')}: ${why}`)
      return instead ? `${indent}${text.replace(pattern, instead)}` : `${indent}: # skipped here: ${why}`
    }
    return line
  })
  return { script: lines.join('\n').replaceAll('\u0000', '\\\n'), skipped }
}

/**
 * A step's shell with what this machine needs that GitHub's doesn't: Playwright's workers as CI's runner has them, since
 * inside a container os.cpus() counts the whole machine, and '50%' of it would be several times CI's.
 * @param {string} script
 */
export const adjust = (script) => script.replace(/^\s*npm run e2e\b.*$/gm, (line) => (/--workers\b/.test(line) ? line : line.includes(' -- ') ? `${line} --workers=${RUNNER.workers}` : `${line} -- --workers=${RUNNER.workers}`))

// Actions

/** @typedef {{ cwd: string, sh: (script: string, env?: Record<string, string>, minutes?: number) => Promise<number>, copyOut: (path: string, to: string) => Promise<number>, log: (text: string) => void, slug: string, host: boolean, state: Record<string, string> }} Job */
/** @typedef {{ inputs: string[], host?: boolean, skip?: string, run?: (job: Job, inputs: Record<string, string>, context: Context, step: { id?: string }) => Promise<number> }} Action */

/** Lines of an input, as actions read a list: one per line or comma, blanks dropped. @param {string | undefined} value */
const list = (value) => (value ?? '').split(/[\n,]/).map((one) => one.trim()).filter(Boolean)

/** Every action the workflows use, by name, as replayed here. @type {Record<string, Action>} */
export const ACTIONS = {
  'actions/checkout': { inputs: [], run: async (job) => { job.log('the run’s copy of the commit\n'); return 0 } },
  'actions/setup-node': {
    inputs: ['node-version-file'],
    run: async (job, inputs) => {
      if (inputs['node-version-file'] !== '.nvmrc') { job.log(`Node from ${inputs['node-version-file']}, which this runner doesn't read\n`); return 1 }
      if (!job.host) return job.sh(`test "$(node -p 'process.versions.node.split(".")[0]')" = ${pinned()} && node -v`)
      const major = Number(process.versions.node.split('.')[0])
      job.log(major === pinned() ? `Node ${process.version}, this machine's\n` : `Node ${process.version} here, not .nvmrc's ${pinned()}: what runs on it may differ from CI\n`)
      return 0
    },
  },
  'actions/upload-artifact': {
    inputs: ['name', 'path', 'retention-days'],
    run: async (job, inputs) => {
      const to = join(OUT, 'artifacts', inputs.name)
      await mkdir(to, { recursive: true })
      const code = await job.copyOut(inputs.path, to)
      if (!code) job.log(`kept in ${relative(ROOT, to)}\n`)
      return 0
    },
  },
  'docker/setup-buildx-action': {
    inputs: [], host: true,
    run: (job) => job.sh(`docker buildx inspect ${BUILDER} >/dev/null 2>&1 || docker buildx create --name ${BUILDER} --driver docker-container --bootstrap || docker buildx inspect ${BUILDER} >/dev/null`),
  },
  'docker/build-push-action': {
    inputs: ['context', 'file', 'target', 'platforms', 'load', 'push', 'tags', 'labels', 'annotations', 'provenance', 'sbom', 'cache-from', 'cache-to'],
    host: true,
    run: (job, inputs) => {
      const quote = (/** @type {string} */ text) => `'${text.replaceAll("'", "'\\''")}'`
      const args = ['docker buildx build', `--builder ${BUILDER}`, '--progress plain']
      if (inputs.file) args.push(`--file ${quote(inputs.file)}`)
      if (inputs.target) args.push(`--target ${quote(inputs.target)}`)
      if (inputs.platforms) args.push(`--platform ${quote(inputs.platforms)}`)
      if (inputs.load === 'true') args.push('--load')
      for (const tag of list(inputs.tags)) args.push(`--tag ${quote(tag)}`)
      for (const label of (inputs.labels ?? '').split('\n').filter(Boolean)) args.push(`--label ${quote(label)}`)
      if (inputs.provenance) args.push(`--provenance ${quote(inputs.provenance)}`)
      if (inputs.sbom) args.push(`--sbom ${quote(inputs.sbom)}`)
      if (inputs.push === 'true') job.log(inputs.load === 'true' ? 'built and loaded, not pushed\n' : 'built for every platform, kept in the builder’s cache, not pushed\n')
      // GitHub's cache (type=gha) is the builder's own here.
      return job.sh([...args, quote(inputs.context || '.')].join(' '))
    },
  },
  'docker/login-action': { inputs: ['registry', 'username', 'password'], skip: 'signs in to push' },
  'docker/metadata-action': {
    inputs: ['images', 'tags', 'labels', 'annotations'],
    run: async (job, inputs, context, step) => {
      // Tags name what is pushed; annotations go on it. A rehearsal keeps the labels alone.
      if (step.id && context.steps) context.steps[step.id] = { outputs: { tags: '', labels: inputs.labels ?? '', annotations: '' } }
      job.log('labels as CI writes them; no tags, since nothing is pushed\n')
      return 0
    },
  },
  'sigstore/cosign-installer': { inputs: [], skip: 'installs cosign, for signing what is pushed' },
  'aquasecurity/trivy-action': {
    inputs: ['image-ref', 'scan-type', 'scan-ref', 'scanners', 'severity', 'ignore-unfixed', 'exit-code'],
    host: true,
    run: (job, inputs) => {
      const type = inputs['scan-type'] || 'image'
      if (!['image', 'config', 'fs'].includes(type)) { job.log(`Trivy's ${type} scan isn't replayed here\n`); return Promise.resolve(1) }
      const args = ['docker run --rm', '-v /var/run/docker.sock:/var/run/docker.sock', '-v jean-ci-trivy:/root/.cache', `-v "$PWD":/scan:ro`, '-w /scan', TRIVY.image, type]
      // No progress bar in the log; `trivy config` knows no such flag and stops at it.
      if (type === 'image') args.push('--no-progress')
      if (inputs.scanners) args.push(`--scanners ${inputs.scanners}`)
      if (inputs.severity) args.push(`--severity ${inputs.severity}`)
      if (inputs['ignore-unfixed'] === 'true') args.push('--ignore-unfixed')
      if (inputs['exit-code']) args.push(`--exit-code ${inputs['exit-code']}`)
      args.push(type === 'image' ? inputs['image-ref'] : inputs['scan-ref'] || '.')
      return job.sh(args.join(' '))
    },
  },
  'github/codeql-action/init': {
    inputs: ['languages', 'queries', 'config'],
    host: true,
    run: async (job, inputs) => {
      if (!/^javascript(?:-typescript)?$/.test(inputs.languages)) { job.log(`CodeQL for ${inputs.languages} isn't replayed here\n`); return 1 }
      const config = join(OUT, 'work', `${job.slug}.codeql.yml`)
      await writeFile(config, inputs.config ?? '')
      job.state.suite = `codeql/javascript-queries:codeql-suites/javascript-${inputs.queries || 'code-scanning'}.qls`
      return job.sh(`codeql database create "$CODEQL_DB" --overwrite --language=javascript --source-root=. --codescanning-config='${config}'`)
    },
  },
  'github/codeql-action/analyze': {
    inputs: [],
    host: true,
    run: (job) => job.sh([
      `codeql database analyze "$CODEQL_DB" --download --format=sarif-latest --output="$CODEQL_SARIF" '${job.state.suite}'`,
      // CI sends what it finds to the Security tab and fails on none of it: listed here, a finding fails nothing either.
      `node -e 'const found = JSON.parse(require("fs").readFileSync(process.env.CODEQL_SARIF, "utf8")).runs.flatMap((run) => run.results); for (const one of found) { const at = one.locations?.[0]?.physicalLocation; console.log(one.ruleId, (at?.artifactLocation?.uri ?? "") + ":" + (at?.region?.startLine ?? ""), one.message.text) } console.log(found.length + " finding(s), which CI sends to the Security tab")'`,
    ].join('\n')),
  },
}

// Plans

/** @typedef {{ name: string, if: string, minutes?: number, env: Record<string, string>, id?: string, action?: string, inputs?: Record<string, string>, script?: string, skipped: string[], install?: boolean }} Step */
/** @typedef {{ key: string, name: string, slug: string, workflow: string, job: string, matrix: Record<string, string>, needs: string[], when: 'always' | 'push' | 'tag', host: boolean, image: string | null, steps: Step[], cpus: number, memory: number, minutes?: number, tools: string[] }} Run */

const JOB_KEYS = ['name', 'runs-on', 'container', 'steps', 'strategy', 'needs', 'if', 'permissions', 'environment', 'concurrency', 'timeout-minutes']
const STEP_KEYS = ['name', 'id', 'uses', 'run', 'with', 'env', 'if', 'timeout-minutes']
/** Commands a job on this machine calls, which must be here. */
const TOOLS = ['helm', 'kind', 'kubectl', 'docker', 'codeql']
/** A line that calls one of them. @param {string} tool */
const calls = (tool) => new RegExp(`(?:^|[\\s;&|(])${tool}\\s`, 'm')
const SECRET = /\$\{\{\s*(?:secrets|vars)\./

/** A matrix's combinations, as GitHub makes them: every value of every key, or each `include` alone. @param {any} matrix @returns {Record<string, string>[]} */
export function combinations (matrix) {
  if (!matrix) return [{}]
  const { include, ...keys } = matrix
  if ('exclude' in keys) throw new Error('a matrix with exclude, which this runner doesn\'t replay')
  if (include && Object.keys(keys).length) throw new Error('a matrix with keys and include both, which this runner doesn\'t replay')
  if (include) return include
  return Object.entries(keys).reduce((/** @type {Record<string, string>[]} */ all, [key, values]) => all.flatMap((one) => [values].flat().map((value) => ({ ...one, [key]: String(value) }))), [{}])
}

/**
 * What `${{ github.… }}` reads in a run: a job that publishes reads the push it publishes on, main or a version's tag.
 * @param {Run} run @param {GitHub} github @returns {GitHub}
 */
export function githubOf (run, github) {
  if (run.when === 'always') return github
  const ref = run.when === 'tag' ? `refs/tags/v${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version}` : 'refs/heads/main'
  return { ...github, ref, ref_name: ref.replace(/^refs\/(?:heads|tags)\//, ''), event_name: 'push' }
}

/**
 * Every run of a workflow's jobs, a matrix's combinations each its own, with how each step is replayed here. Throws for
 * what this runner can't replay, before anything runs: an action, an input, a key, a condition or an expression.
 * @param {string} workflow  its file's name @param {any} document  as parse() read it
 * @returns {Run[]}
 */
export function plan (workflow, document) {
  /** @type {GitHub} */
  const github = { ref: 'refs/heads/main', ref_name: 'main', sha: '0'.repeat(40), actor: 'local', repository: 'jean-is/jean', repository_owner: 'jean-is', event_name: 'push' }
  return Object.entries(document.jobs ?? {}).flatMap(([id, job]) => {
    const where = `${workflow}: ${id}`
    const unknown = Object.keys(job).filter((key) => !JOB_KEYS.includes(key))
    if (unknown.length) throw new Error(`${where}: ${unknown.join(', ')}, which this runner doesn't replay`)
    if (job['runs-on'] !== RUNNER.label) throw new Error(`${where}: runs on ${job['runs-on']}, not ${RUNNER.label}`)
    if (job.container && typeof job.container !== 'string') throw new Error(`${where}: a container with options, which this runner doesn't replay`)
    const image = job.container ?? null
    const runs = when(job.if)
    return combinations(job.strategy?.matrix).map((matrix) => {
      const values = Object.values(matrix)
      // A run's name: its matrix's short values, as GitHub's, or an `include`'s first, which names it.
      const short = (job.strategy?.matrix?.include ? values.slice(0, 1) : values).filter((value) => value && /^[\w.-]{1,24}$/.test(value))
      /** @type {Context} */
      const scope = { matrix, github, steps: null }
      // Read now, so that what this runner can't read stops it before anything runs; read again as the run goes.
      const check = (/** @type {string} */ text) => { substitute(text, scope); return text }
      /** @type {Step[]} */
      const steps = (job.steps ?? []).map((/** @type {any} */ step, /** @type {number} */ n) => {
        const label = `${where}, step ${n + 1}`
        const odd = Object.keys(step).filter((key) => !STEP_KEYS.includes(key))
        if (odd.length) throw new Error(`${label}: ${odd.join(', ')}, which this runner doesn't replay`)
        const condition = step.if ?? 'success()'
        if (!(condition in STATUS)) throw new Error(`${label}: if: ${condition}, which this runner doesn't replay`)
        const pairs = Object.entries(step.env ?? {}).map(([key, value]) => [key, check(String(value))])
        // A secret or a variable of GitHub's is unset here, rather than empty, and a line naming it doesn't run.
        const withheld = pairs.filter(([, value]) => SECRET.test(value)).map(([key]) => key)
        /** @type {Step} */
        const planned = { name: substitute(step.name ?? (step.run ? step.run.split('\n')[0] : step.uses.replace(/@.*$/, '')), scope), if: condition, minutes: step['timeout-minutes'] ? Number(step['timeout-minutes']) : undefined, env: Object.fromEntries(pairs.filter(([key]) => !withheld.includes(key))), id: step.id, skipped: [] }
        if (step.uses) {
          const name = step.uses.replace(/@.*$/, '')
          const action = ACTIONS[name]
          if (!action) throw new Error(`${label}: ${name}, an action this runner doesn't replay: add it to ACTIONS in scripts/ci.js`)
          const inputs = Object.fromEntries(Object.entries(step.with ?? {}).map(([key, value]) => [key, check(String(value))]))
          const extra = Object.keys(inputs).filter((key) => !action.inputs.includes(key))
          if (extra.length) throw new Error(`${label}: ${name} with ${extra.join(', ')}, which this runner doesn't replay`)
          Object.assign(planned, { action: name, inputs })
          if (action.skip) planned.skipped.push(`${name}: it ${action.skip}`)
        } else if (typeof step.run === 'string') {
          const { script, skipped } = rehearse(step.run, withheld)
          Object.assign(planned, { script: adjust(check(script)), skipped, install: /^npm ci(?: --[\w-]+)*\n?$/.test(step.run) })
        } else throw new Error(`${label}: neither uses nor run`)
        return planned
      })
      const text = steps.map((step) => step.script ?? step.action ?? '').join('\n')
      const host = !image && (steps.some((step) => step.action && ACTIONS[step.action].host) || TOOLS.some((tool) => calls(tool).test(text)))
      if (image && steps.some((step) => step.action && ACTIONS[step.action].host)) throw new Error(`${where}: an action that needs this machine, in a container`)
      const [cpus, memory] = SIZES[id] ?? [2, 2]
      return {
        key: [id, ...short].join(':'), name: short.length ? `${id} (${short.join(', ')})` : id,
        slug: [id, ...short].join('-').replace(/[^\w.-]/g, '-'), workflow, job: id, matrix, needs: [job.needs ?? []].flat(), when: runs, host, image,
        steps, cpus, memory, minutes: job['timeout-minutes'] ? Number(job['timeout-minutes']) : undefined,
        tools: host ? TOOLS.filter((tool) => calls(tool).test(text) || (tool === 'codeql' && text.includes('codeql-action')) || (tool === 'docker' && /docker\/|trivy/.test(text))) : [],
      }
    })
  })
}

/** Every workflow's runs. @param {string} [root] */
export function workflows (root = ROOT) {
  const dir = join(root, '.github/workflows')
  return readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)).sort().flatMap((name) => plan(name, parse(readFileSync(join(dir, name), 'utf8'))))
}

/** Whether a run is one a selection names: its key, or the start of it up to a colon. @param {Run} run @param {string[]} picked */
export const chosen = (run, picked) => !picked.length || picked.some((one) => run.key === one || run.key.startsWith(`${one}:`))

// Running

/** @param {string} command @param {string[]} args @param {import('node:child_process').ExecFileSyncOptions} [options] */
const quiet = (command, args, options = {}) => { try { return String(execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })).trim() } catch { return null } }
const git = (/** @type {string[]} */ ...args) => String(execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })).trim()

/** What a run started, to stop on Ctrl-C. */
const live = { children: new Set(), containers: new Set(), clusters: /** @type {Map<string, string>} */ (new Map()) }

/**
 * Runs a command, its output into a log, to its exit code; past `minutes`, it is stopped (124).
 * @param {string} command @param {string[]} args @param {(text: string) => void} log @param {{ cwd?: string, env?: NodeJS.ProcessEnv, minutes?: number, input?: string }} [options]
 * @returns {Promise<number>}
 */
function sh (command, args, log, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
    live.children.add(child)
    child.stdout?.on('data', (chunk) => log(String(chunk)))
    child.stderr?.on('data', (chunk) => log(String(chunk)))
    if (options.input !== undefined) child.stdin?.end(options.input)
    const timer = options.minutes ? setTimeout(() => { log(`\nstopped after ${options.minutes} minutes\n`); child.kill('SIGTERM') }, options.minutes * 60_000) : null
    child.on('error', (error) => { log(`${error.message}\n`) })
    child.on('close', (code, signal) => { if (timer) clearTimeout(timer); live.children.delete(child); resolve(timer && signal ? 124 : code ?? 1) })
  })
}

/** @typedef {{ src: string, image: Record<string, string>, platform: string, keep: boolean, github: GitHub, install: string }} Shared */

/**
 * A clean copy of the commit, as GitHub's checkout makes one (a shallow clone), with the working tree's changes committed
 * over it when asked, so that what reads git (git ls-files, git archive HEAD) reads them too.
 * @param {boolean} worktree @returns {Promise<string>}
 */
async function snapshot (worktree) {
  const src = join(OUT, 'src')
  execFileSync('git', ['clone', '--quiet', '--depth', '1', '--no-tags', pathToFileURL(ROOT).href, src], { stdio: 'inherit' })
  const head = git('rev-parse', 'HEAD')
  if (quiet('git', ['rev-parse', 'HEAD'], { cwd: src }) !== head) {
    // HEAD is no branch's tip: that commit alone, as GitHub's checkout fetches a pull request's.
    execFileSync('git', ['-c', 'uploadpack.allowAnySHA1InWant=true', 'fetch', '--quiet', '--depth', '1', 'origin', head], { cwd: src, stdio: 'inherit' })
    execFileSync('git', ['checkout', '--quiet', '--detach', head], { cwd: src })
  }
  if (!worktree) return src
  const changed = git('diff', '--name-only', '--no-renames', '-z', 'HEAD').split('\0').concat(git('ls-files', '--others', '--exclude-standard', '-z').split('\0')).filter(Boolean)
  for (const path of changed) {
    if (existsSync(join(ROOT, path))) await cp(join(ROOT, path), join(src, path), { force: true, verbatimSymlinks: true, recursive: true })
    else await rm(join(src, path), { force: true })
  }
  execFileSync('git', ['add', '-A'], { cwd: src })
  execFileSync('git', ['-c', 'user.name=npm run ci', '-c', 'user.email=ci@localhost', 'commit', '--quiet', '--allow-empty', '--no-verify', '-m', 'The working tree'], { cwd: src })
  return src
}

/** The newest release of a major of Node's, as setup-node installs from .nvmrc. @param {number} major */
async function newestNode (major) {
  const response = await fetch(RELEASES)
  if (!response.ok) throw new Error(`${RELEASES} answered ${response.status}`)
  const found = /** @type {{ version: string }[]} */ (await response.json()).find((release) => release.version.startsWith(`v${major}.`))
  if (!found) throw new Error(`no Node ${major} in ${RELEASES}`)
  return found.version
}

/**
 * The image a job runs in: the one it names, Jean's own Node over its own, the workflow's `npm ci` done in a layer kept
 * while the lockfile is the same, then the commit. On Apple silicon a native module without a build for Linux on arm64
 * (bufferutil) is built from source, as on GitHub's x64 runners it never needs to be.
 * @param {string} base @param {Shared} shared @param {(text: string) => void} log
 */
async function build (base, shared, log) {
  const node = await newestNode(pinned())
  const dist = new URL('./', RELEASES).href
  const tag = `jean-ci-run:${shared.platform.replace(/\W/g, '-')}-${Object.keys(shared.image).length + 1}`
  const dockerfile = [
    `FROM ${base}`,
    'ARG NODE',
    `RUN set -e; if [ "$(node -v 2>/dev/null)" != "$NODE" ]; then arch=$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/'); t="node-$NODE-linux-$arch.tar.gz"; cd /tmp; curl -fsSLO "${dist}$NODE/SHASUMS256.txt"; curl -fsSLO "${dist}$NODE/$t"; grep " $t\\$" SHASUMS256.txt | sha256sum -c -; tar -xzf "$t" -C /usr/local --strip-components=1 --exclude='*.md' --exclude=LICENSE; rm "$t" SHASUMS256.txt; fi; node -v`,
    'RUN if [ "$(uname -m)" != x86_64 ]; then apt-get update -q && apt-get install -y -q --no-install-recommends make g++ && rm -rf /var/lib/apt/lists/*; fi',
    'WORKDIR /work',
    'COPY package.json package-lock.json ./',
    `RUN --mount=type=cache,target=/root/.npm ${shared.install}`,
    'COPY . .',
  ].join('\n')
  log(`▶ ${base}, Node ${node}, ${shared.install}, the commit\n`)
  const code = await sh('docker', ['buildx', 'build', '--load', '--progress', 'plain', '--platform', shared.platform, '--build-arg', `NODE=${node}`, '--tag', tag, '--file', '-', shared.src], log, { input: dockerfile })
  if (code) throw new Error(`the image for ${base} didn't build: see dist/ci/image.log`)
  return tag
}

/**
 * A job's place to run: a container of its image, or a clean copy of the commit here.
 * @param {Run} run @param {Shared} shared @param {(text: string) => void} log @returns {Promise<Job & { close: (failed: boolean) => Promise<void> }>}
 */
async function place (run, shared, log) {
  const github = githubOf(run, shared.github)
  const env = { CI: 'true', GITHUB_REF: github.ref, GITHUB_REF_NAME: github.ref_name, GITHUB_SHA: github.sha, GITHUB_ACTOR: github.actor, GITHUB_REPOSITORY: github.repository, GITHUB_REPOSITORY_OWNER: github.repository_owner, GITHUB_EVENT_NAME: github.event_name }
  if (!run.host) {
    const name = `jean-ci-${run.slug}`
    quiet('docker', ['rm', '-f', name])
    const flags = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`])
    const image = shared.image[/** @type {string} */ (run.image)]
    if (await sh('docker', ['run', '-d', '--init', '--name', name, '--platform', shared.platform, '--cpus', String(run.cpus), '--memory', `${run.memory * 2}g`, ...flags, '-e', 'GITHUB_WORKSPACE=/work', image, 'sleep', 'infinity'], log)) throw new Error(`${name} didn't start`)
    live.containers.add(name)
    return {
      cwd: '/work', slug: run.slug, host: false, state: {}, log,
      sh: (script, extra = {}, minutes) => sh('docker', ['exec', '-w', '/work', ...Object.entries(extra).flatMap(([key, value]) => ['-e', `${key}=${value}`]), name, 'bash', '-e', '-c', script], log, { minutes }),
      copyOut: (path, to) => sh('docker', ['cp', `${name}:/work/${path}`, to], log),
      close: async (failed) => {
        if (failed && shared.keep) { log(`\nkept: docker exec -it ${name} bash, then docker rm -f ${name}\n`); return }
        quiet('docker', ['rm', '-f', name]); live.containers.delete(name)
      },
    }
  }
  const cwd = join(OUT, 'work', run.slug)
  execFileSync('git', ['clone', '--quiet', shared.src, cwd])
  const cluster = `jean-ci-${run.slug}`.slice(0, 40)
  const kubeconfig = join(OUT, 'work', `${run.slug}.kubeconfig`)
  const hostEnv = { ...process.env, ...env, GITHUB_WORKSPACE: cwd, KUBECONFIG: kubeconfig, KIND_CLUSTER_NAME: cluster, CODEQL_DB: join(OUT, 'work', `${run.slug}.codeql-db`), CODEQL_SARIF: join(OUT, 'codeql.sarif') }
  return {
    cwd, slug: run.slug, host: true, state: {}, log,
    sh: (script, extra = {}, minutes) => { if (/\bkind create\b/.test(script)) live.clusters.set(cluster, kubeconfig); return sh('bash', ['-e', '-c', script], log, { cwd, env: { ...hostEnv, ...extra }, minutes }) },
    copyOut: (path, to) => cp(join(cwd, path), join(to, path.replace(/\/$/, '').split('/').at(-1) ?? path), { recursive: true }).then(() => 0, (error) => { log(`${error.message}\n`); return 1 }),
    close: async (failed) => {
      if (!live.clusters.has(cluster)) return
      if (failed && shared.keep) { log(`\nkept: kubectl --kubeconfig ${relative(ROOT, kubeconfig)} get pods -A, then kind delete cluster --name ${cluster}\n`); return }
      quiet('kind', ['delete', 'cluster', '--name', cluster, '--kubeconfig', kubeconfig]); live.clusters.delete(cluster)
    },
  }
}

/**
 * A run, step by step, as GitHub's runner takes it: a step that fails fails the job, and the steps after it run only if
 * their `if:` asks for a failure.
 * @param {Run} run @param {Shared} shared @returns {Promise<{ failed: string | null, skipped: string[] }>}
 */
async function execute (run, shared) {
  const stream = createWriteStream(join(OUT, `${run.slug}.log`))
  const log = (/** @type {string} */ text) => { stream.write(text) }
  /** @type {string | null} */
  let failed = null
  const skipped = run.steps.flatMap((step) => step.skipped)
  let job
  try {
    job = await place(run, shared, log)
  } catch (error) {
    log(`${/** @type {Error} */ (error).message}\n`)
    stream.end()
    return { failed: 'its place to run', skipped }
  }
  /** @type {Context} */
  const context = { matrix: run.matrix, github: githubOf(run, shared.github), steps: {} }
  for (const step of run.steps) {
    if (!STATUS[step.if](Boolean(failed))) continue
    log(`\n▶ ${step.name}\n`)
    for (const line of step.skipped) log(`↷ skipped here: ${line}\n`)
    /** @type {number} */
    let code = 0
    try {
      if (step.action) {
        const action = ACTIONS[step.action]
        const inputs = Object.fromEntries(Object.entries(step.inputs ?? {}).map(([key, value]) => [key, substitute(value, context)]))
        code = action.run ? await action.run(job, inputs, context, step) : 0
      } else if (step.install && !run.host && step.script?.trim() === shared.install) log('done in the image’s layer, from the same lockfile\n')
      else code = await job.sh(substitute(/** @type {string} */ (step.script), context), Object.fromEntries(Object.entries(step.env).map(([key, value]) => [key, substitute(value, context)])), step.minutes ?? run.minutes)
    } catch (error) { log(`${/** @type {Error} */ (error).stack}\n`); code = 1 }
    if (code) { log(`✘ ${step.name}: exit ${code}\n`); failed ??= step.name }
  }
  await job.close(Boolean(failed))
  await new Promise((resolve) => stream.end(resolve))
  return { failed, skipped }
}

/** @param {number} ms */
const duration = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` }

/**
 * The runs side by side, as far as Docker's processors and memory go, each after the jobs it needs, the longest first.
 * @param {Run[]} runs @param {{ cpus: number, memory: number }} budget @param {(run: Run) => Promise<{ failed: string | null, skipped: string[] }>} start
 * @returns {Promise<Map<Run, { state: 'passed' | 'failed' | 'skipped', ms: number, why?: string, skipped: string[] }>>}
 */
export function schedule (runs, budget, start) {
  /** @type {Map<Run, { state: 'passed' | 'failed' | 'skipped', ms: number, why?: string, skipped: string[] }>} */
  const done = new Map()
  const running = new Set()
  const used = { cpus: 0, memory: 0 }
  return new Promise((resolve) => {
    const next = () => {
      for (let changed = true; changed;) {
        changed = false
        for (const run of runs) {
          if (done.has(run) || running.has(run)) continue
          const needed = runs.filter((other) => run.needs.includes(other.job))
          const blocked = needed.filter((other) => done.get(other)?.state && done.get(other)?.state !== 'passed')
          if (blocked.length) { done.set(run, { state: 'skipped', ms: 0, why: `needs ${[...new Set(blocked.map((other) => other.job))].join(', ')}`, skipped: [] }); changed = true; continue }
          if (needed.some((other) => !done.has(other))) continue
          if (running.size && (used.cpus + run.cpus > budget.cpus || used.memory + run.memory > budget.memory)) continue
          running.add(run); used.cpus += run.cpus; used.memory += run.memory
          const began = Date.now()
          console.log(`  … ${run.name}`)
          start(run).then(({ failed, skipped }) => {
            running.delete(run); used.cpus -= run.cpus; used.memory -= run.memory
            done.set(run, { state: failed ? 'failed' : 'passed', ms: Date.now() - began, why: failed ? `at ${failed}` : undefined, skipped })
            console.log(`  ${failed ? '✘' : '✔'} ${run.name}  ${duration(Date.now() - began)}${failed ? `  at ${failed}: dist/ci/${run.slug}.log` : ''}`)
            next()
          })
          changed = true
        }
      }
      if (done.size === runs.length) resolve(done)
    }
    next()
  })
}

/** How each run is replayed, for --list. @param {Run[]} runs */
function describe (runs) {
  for (const run of runs) {
    const where = run.host ? 'here' : run.image ? `in ${run.image}` : 'in the runner’s stand-in'
    console.log(`${run.key}  ${where}${run.when !== 'always' ? ', rehearsed: it publishes on a push' : ''}${run.needs.length ? `, after ${run.needs.join(', ')}` : ''}`)
    for (const step of run.steps) console.log(`  ${step.if !== 'success()' ? `[${step.if}] ` : ''}${step.name}${step.action && ACTIONS[step.action].skip ? ' — skipped here' : ''}${step.skipped.length && step.script ? ` — ${step.skipped.length} line(s) skipped here` : ''}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = process.argv.slice(2)
  const picked = flags.filter((flag) => !flag.startsWith('--'))
  const unknown = flags.filter((flag) => flag.startsWith('--') && !['--worktree', '--amd64', '--keep', '--list'].includes(flag))
  if (unknown.length) { console.error(`npm run ci doesn't know ${unknown.join(', ')}`); process.exit(2) }
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  const owner = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).repository?.url ?? '') ?? ['', 'local', 'jean']
  /** @type {GitHub} */
  const github = { ref: `refs/heads/${branch}`, ref_name: branch, sha: git('rev-parse', 'HEAD'), actor: 'local', repository: `${owner[1]}/${owner[2]}`, repository_owner: owner[1], event_name: branch === 'main' ? 'push' : 'pull_request' }
  const all = workflows()
  const runs = all.filter((run) => chosen(run, picked)).sort((a, b) => (FIRST.indexOf(a.job) + 1 || 99) - (FIRST.indexOf(b.job) + 1 || 99))
  if (!runs.length) { console.error(`No job is ${picked.join(' or ')}: ${[...new Set(all.map((run) => run.job))].join(', ')}`); process.exit(2) }
  if (flags.includes('--list')) { describe(runs); process.exit(0) }

  if (quiet('docker', ['info', '--format', '{{.NCPU}}']) === null) { console.error('Docker isn’t answering: start OrbStack (orb start) or Docker Desktop'); process.exit(1) }
  const lock = join(ROOT, 'dist/ci.lock')
  await mkdir(join(ROOT, 'dist'), { recursive: true })
  const holder = existsSync(lock) ? Number(readFileSync(lock, 'utf8')) : 0
  if (holder && quiet('kill', ['-0', String(holder)]) !== null) { console.error(`npm run ci is running already (pid ${holder}): its images, builder and clusters are shared`); process.exit(1) }
  await writeFile(lock, String(process.pid))
  await rm(OUT, { recursive: true, force: true })
  await mkdir(join(OUT, 'work'), { recursive: true })
  // A long run needs the Mac awake: on battery or asleep, a run proves nothing about the code.
  if (process.platform === 'darwin') spawn('caffeinate', ['-is', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref()

  const stop = async (/** @type {number} */ code) => {
    for (const child of live.children) /** @type {import('node:child_process').ChildProcess} */ (child).kill('SIGTERM')
    for (const name of live.containers) quiet('docker', ['rm', '-f', name])
    for (const [name, kubeconfig] of live.clusters) quiet('kind', ['delete', 'cluster', '--name', name, '--kubeconfig', kubeconfig])
    await rm(lock, { force: true })
    process.exit(code)
  }
  process.on('SIGINT', () => { console.log('\nstopping…'); void stop(130) })

  const worktree = flags.includes('--worktree')
  const platform = flags.includes('--amd64') ? 'linux/amd64' : `linux/${arch() === 'x64' ? 'amd64' : arch()}`
  const missing = [...new Set(runs.flatMap((run) => run.tools))].filter((tool) => quiet('which', [tool]) === null)
  const codeql = missing.includes('codeql')
  const blocked = runs.filter((run) => run.tools.some((tool) => missing.includes(tool) && tool !== 'codeql'))
  const runnable = runs.filter((run) => !(codeql && run.tools.includes('codeql')))
  const installs = [...new Set(all.flatMap((run) => run.steps.filter((step) => step.install).map((step) => /** @type {string} */ (step.script).trim())))]
  if (installs.length > 1) throw new Error(`jobs install with ${installs.join(' and ')}: one image can't hold both`)

  console.log(`GitHub's CI here, from ${github.sha.slice(0, 8)}${worktree ? ' with the working tree' : ''}, on ${platform}, logs in dist/ci/`)
  if (codeql) console.log('  ↷ CodeQL: skipped, the codeql CLI isn’t here (brew install --cask codeql)')
  const src = await snapshot(worktree)
  github.sha = git('-C', src, 'rev-parse', 'HEAD')
  /** @type {Shared} */
  const shared = { src, image: {}, platform, keep: flags.includes('--keep'), github, install: installs[0] ?? 'npm ci' }
  // A job on GitHub's runner itself runs in the image the workflows' container jobs name, Ubuntu 24.04 as that runner is.
  const standIn = all.find((run) => run.image)?.image
  for (const run of runnable.filter((one) => !one.host && !one.image)) {
    if (!standIn) throw new Error(`${run.name} runs on GitHub's runner, and no job names an image to stand in for it`)
    run.image = standIn
  }
  const stream = createWriteStream(join(OUT, 'image.log'))
  try {
    for (const image of new Set(runnable.filter((run) => !run.host).map((run) => /** @type {string} */ (run.image)))) {
      console.log(`  … the image, from ${image}`)
      const began = Date.now()
      shared.image[image] = await build(image, shared, (text) => { stream.write(text) })
      console.log(`  ✔ the image  ${duration(Date.now() - began)}`)
    }
  } catch (error) {
    console.error(`  ✘ ${/** @type {Error} */ (error).message}`)
    await stop(1)
  }
  stream.end()

  const info = /** @type {string} */ (quiet('docker', ['info', '--format', '{{.NCPU}} {{.MemTotal}}'])).split(' ').map(Number)
  const results = await schedule(runnable, { cpus: info[0], memory: info[1] / 2 ** 30 }, (run) => (blocked.includes(run) ? Promise.resolve({ failed: `needs ${run.tools.filter((tool) => missing.includes(tool)).join(', ')} here`, skipped: [] }) : execute(run, shared)))

  console.log('')
  let failures = 0
  for (const run of runs) {
    const result = results.get(run)
    if (!result) { console.log(`↷ ${run.name}  skipped: needs the codeql CLI`); continue }
    if (result.state === 'failed') failures++
    const mark = { passed: '✔', failed: '✘', skipped: '↷' }[result.state]
    console.log(`${mark} ${run.name}  ${result.state === 'skipped' ? `skipped: ${result.why}` : duration(result.ms)}${run.when !== 'always' ? `  rehearsed${result.skipped.length ? `, ${result.skipped.length} step(s) or line(s) left to GitHub` : ''}` : ''}`)
    if (result.state === 'failed') {
      // The end of the step that failed, not of what ran after it to tell why.
      const text = readFileSync(join(OUT, `${run.slug}.log`), 'utf8').trimEnd().split('\n')
      const end = text.findIndex((line) => line.startsWith('✘ '))
      console.log(text.slice(Math.max(0, (end < 0 ? text.length : end + 1) - 30), end < 0 ? undefined : end + 1).map((line) => `    ${line}`).join('\n'))
      console.log(`    the whole log: dist/ci/${run.slug}.log`)
    }
  }
  await rm(join(OUT, 'src'), { recursive: true, force: true })
  await rm(join(OUT, 'work'), { recursive: true, force: true })
  await rm(lock, { force: true })
  process.exit(failures ? 1 : 0)
}
