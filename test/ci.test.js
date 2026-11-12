// SPDX-License-Identifier: MIT
// GitHub's CI on this machine (scripts/ci.js, D724): every workflow reads, every job plans, and what a job here would run
// never reaches out. A change to a workflow that the runner can't replay (an action, an input, a condition) fails here.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ACTIONS, OUTWARD, TRIVY, adjust, combinations, outputs, parse, plan, rehearse, schedule, substitute, when, workflows } from '../scripts/ci.js'

const CI = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
/** @type {import('../scripts/ci.js').GitHub} */
const GITHUB = { ref: 'refs/heads/main', ref_name: 'main', sha: 'a'.repeat(40), actor: 'local', repository: 'jean-is/jean', repository_owner: 'jean-is', event_name: 'push' }

describe('the workflows’ YAML', () => {
  it('reads what GitHub’s workflows write', () => {
    const read = parse([
      '# a comment',
      'name: CI # after a value',
      'on:',
      '  push:',
      "    branches: [main, 'v*']",
      'jobs:',
      '  one:',
      '    steps:',
      '      - uses: a/b@c # v1',
      '        with:',
      '          path: x',
      '      # between items',
      '      - run: |',
      '          echo "a: b" # kept',
      '',
      '          echo c',
      '      - name: "quoted: yes"',
      "        run: echo 'it''s'",
      '    needs:',
      '    - two',
    ].join('\n'))
    assert.deepEqual(read, {
      name: 'CI', on: { push: { branches: ['main', 'v*'] } },
      jobs: { one: { steps: [{ uses: 'a/b@c', with: { path: 'x' } }, { run: 'echo "a: b" # kept\n\necho c\n' }, { name: 'quoted: yes', run: "echo 'it''s'" }], needs: ['two'] } },
    })
  })

  it('refuses what it would read wrong', () => {
    for (const text of ['a: &anchor 1', 'a: >\n  folded', 'a: {b: 1}', 'a: [[1]]', 'a: 1\na: 2']) assert.throws(() => parse(text), undefined, text)
  })

  it('reads every workflow, every job planned', () => {
    const runs = workflows()
    const jobs = Object.keys(parse(CI).jobs)
    assert.deepEqual([...new Set(runs.filter((run) => run.workflow === 'ci.yml').map((run) => run.job))].sort(), jobs.sort())
    assert.ok(runs.some((run) => run.workflow === 'codeql.yml') && runs.some((run) => run.workflow === 'lts.yml'))
  })
})

describe('the jobs, as replayed here', () => {
  const runs = workflows()

  it('runs each part of the browser tests in the image CI names, with the workers CI’s runner has', () => {
    const parts = runs.filter((run) => run.job === 'e2e')
    assert.deepEqual(parts.map((run) => run.key), ['e2e:chromium:1', 'e2e:chromium:2', 'e2e:chromium:3', 'e2e:webkit:1', 'e2e:webkit:2', 'e2e:webkit:3'])
    for (const run of parts) {
      assert.equal(run.image, /container: (\S+)/.exec(CI)?.[1])
      assert.match(run.steps.map((step) => step.script ?? '').join('\n'), /^npm run e2e -- .* --workers=2$/m)
    }
  })

  it('gives the version the release job tags to what publishes it, a tag pushed only on GitHub (D735)', () => {
    const release = /** @type {import('../scripts/ci.js').Run} */ (runs.find((run) => run.job === 'release'))
    assert.equal(release.when, 'push')
    assert.deepEqual(release.outputs, { version: '${{ steps.version.outputs.version }}', release: '${{ steps.version.outputs.release }}' })
    assert.deepEqual(release.steps[0].inputs, { 'fetch-depth': '0' })
    assert.ok(release.steps.some((step) => step.id === 'version' && step.script === 'node scripts/version.js --tag >> "$GITHUB_OUTPUT"'))
    assert.ok(release.steps.some((step) => step.skipped.some((line) => /git push origin/.test(line))), 'the tag goes to GitHub from GitHub alone')
    for (const job of ['images', 'chart', 'deploy']) assert.ok(runs.filter((run) => run.job === job).every((run) => run.needs.includes('release')), job)
    assert.deepEqual(runs.filter((run) => run.job === 'e2e').map((run) => run.steps[0].inputs?.['fetch-depth']), ['0', '0', '0', '0', '0', '0'], 'the build names the version Settings shows')
  })

  it('drives Docker, kind and helm here, and the rest in a container', () => {
    const where = Object.fromEntries(runs.map((run) => [run.key, run.host]))
    assert.equal(where.containers, true)
    assert.equal(where['images:jean'], true)
    assert.equal(where.check, false)
    assert.equal(where.deploy, false)
    assert.deepEqual(runs.find((run) => run.key === 'containers')?.tools, ['helm', 'kind', 'kubectl', 'docker'])
  })

  it('rehearses what publishes, and runs nothing that reaches out', () => {
    for (const run of runs) {
      for (const step of run.steps) {
        for (const line of (step.script ?? '').split('\n')) {
          if (/^\s*(?::|#)/.test(line)) continue
          for (const [pattern, instead] of OUTWARD) if (!instead) assert.doesNotMatch(line, pattern, `${run.key}: ${line}`)
          assert.doesNotMatch(line, /\bnpm run deploy\b|\$\{\{\s*(?:secrets|vars)\.|\$\{?(?:SERVER|SERVER_KEY|SERVER_HOST_KEYS|TOKEN|BUNNY_\w+)\b/, `${run.key}: ${line}`)
        }
      }
    }
    const deploy = /** @type {import('../scripts/ci.js').Run} */ (runs.find((run) => run.job === 'deploy'))
    assert.equal(deploy.when, 'push')
    assert.ok(deploy.steps.some((step) => step.script === 'npm run build:web'))
    assert.ok(deploy.steps.every((step) => !('BUNNY_API_KEY' in step.env)), 'a secret is unset here, not empty')
    assert.equal(runs.find((run) => run.job === 'chart')?.when, 'push')
    assert.ok(runs.filter((run) => run.job === 'images').every((run) => run.steps.some((step) => step.action === 'docker/login-action' && step.skipped.length)))
  })

  it('asks Trivy only what each scan knows', async () => {
    /** @type {string[]} */
    const asked = []
    const job = /** @type {import('../scripts/ci.js').Job} */ ({ sh: async (script) => { asked.push(script); return 0 }, log: () => {} })
    const trivy = /** @type {NonNullable<import('../scripts/ci.js').Action['run']>} */ (ACTIONS['aquasecurity/trivy-action'].run)
    const context = { matrix: {}, github: GITHUB, steps: {} }
    await trivy(job, { 'image-ref': 'jean-ci:jean', scanners: 'vuln', severity: 'HIGH,CRITICAL', 'ignore-unfixed': 'true', 'exit-code': '1' }, context, {})
    await trivy(job, { 'scan-type': 'config', 'scan-ref': 'rendered', severity: 'HIGH,CRITICAL', 'exit-code': '1' }, context, {})
    assert.match(asked[0], / image --no-progress --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 jean-ci:jean$/)
    assert.match(asked[1], / config --severity HIGH,CRITICAL --exit-code 1 rendered$/)
  })

  it('runs the Trivy that the pinned trivy-action runs', () => {
    assert.deepEqual([...new Set([...CI.matchAll(/aquasecurity\/trivy-action@([0-9a-f]{40})/g)].map((match) => match[1]))], [TRIVY.action], 'a new trivy-action: TRIVY in scripts/ci.js takes the version its action.yaml defaults to')
    assert.match(TRIVY.image, /@sha256:[0-9a-f]{64}$/)
  })
})

describe('what the runner can’t replay', () => {
  const job = (/** @type {object} */ extra, /** @type {object[]} */ steps = [{ run: 'echo' }]) => ({ jobs: { one: { 'runs-on': 'ubuntu-24.04', steps, ...extra } } })

  it('stops it before anything runs', () => {
    assert.throws(() => plan('x.yml', job({}, [{ uses: 'someone/else@v1' }])), /an action this runner doesn't replay/)
    assert.throws(() => plan('x.yml', job({}, [{ uses: 'actions/checkout@v5', with: { ref: 'other' } }])), /with ref/)
    assert.throws(() => plan('x.yml', job({}, [{ run: 'echo ${{ needs.release.outputs.version }}' }])), /needs\.release, a job it doesn't need/)
    assert.throws(() => plan('x.yml', job({}, [{ run: 'echo', if: "github.actor == 'me'" }])), /if: github.actor/)
    assert.throws(() => plan('x.yml', job({}, [{ run: 'echo ${{ github.event.pull_request.title }}' }])), /is nothing here/)
    assert.throws(() => plan('x.yml', job({}, [{ run: 'echo ${{ toJSON(github) }}' }])), /can't read/)
    assert.throws(() => plan('x.yml', job({ services: {} })), /services/)
    assert.throws(() => plan('x.yml', job({ 'runs-on': 'macos-15' })), /runs on macos-15/)
    assert.throws(() => plan('x.yml', job({ if: "github.event_name == 'schedule'" })), /can't tell when it runs/)
    assert.throws(() => combinations({ os: ['a'], exclude: [] }), /exclude/)
  })

  it('knows when a job runs only to publish', () => {
    assert.equal(when(undefined), 'always')
    assert.equal(when("github.event_name == 'push'"), 'push')
    assert.equal(when("github.event_name == 'push' && github.ref == 'refs/heads/main'"), 'push')
    assert.throws(() => when("github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')"), /can't tell when it runs/, 'CI alone makes a version, on main')
  })
})

describe('a step’s shell', () => {
  it('skips a line naming a secret, a continued one whole, and what reaches out', () => {
    const { script, skipped } = rehearse('echo a\nprintf x "$KEY" \\\n  > file\nmkdir -p ~/.ssh\ntar -cf - . | ssh host\nnpm run deploy\nhelm push x', ['KEY'])
    assert.equal(script, 'echo a\n: # skipped here: it needs a secret or a variable of GitHub\'s\nmkdir -p ~/.ssh\n: # skipped here: reaches a server\nnpm run build:web\n: # skipped here: pushes to a registry')
    assert.equal(skipped.length, 4)
    assert.match(rehearse('echo ${{ secrets.X }}', []).script, /skipped here/)
  })

  it('gives Playwright the workers CI’s runner has, once', () => {
    assert.equal(adjust('npm run build\nnpm run e2e -- --project=webkit'), 'npm run build\nnpm run e2e -- --project=webkit --workers=2')
    assert.equal(adjust('npm run e2e'), 'npm run e2e -- --workers=2')
    assert.equal(adjust('npm run e2e -- --workers=1'), 'npm run e2e -- --workers=1')
  })

  it('reads a path in its context, a secret as nothing, and nothing more', () => {
    const context = { matrix: { shard: '2' }, github: GITHUB, steps: { meta: { outputs: { tags: 't' } } } }
    assert.equal(substitute('${{ matrix.shard }}/3 ${{ github.ref }} ${{ steps.meta.outputs.tags }} [${{ secrets.X }}]', context), '2/3 refs/heads/main t []')
    assert.equal(substitute('${{ steps.meta.outputs.tags }}', { ...context, steps: null }), '${{ steps.meta.outputs.tags }}')
    assert.equal(substitute('[${{ steps.build.outputs.digest }}]', context), '[]')
    assert.throws(() => substitute("${{ matrix.shard == '2' }}", context))
    const needs = { release: { outputs: { version: '0.10.0', release: '' } } }
    assert.equal(substitute('${{ needs.release.outputs.version }}/[${{ needs.release.outputs.release }}]', { ...context, needs }), '0.10.0/[]')
    assert.equal(substitute('${{ needs.release.outputs.version }}', { ...context, needs: null }), '${{ needs.release.outputs.version }}')
  })

  it('reads what a step wrote to $GITHUB_OUTPUT, as GitHub does', () => {
    assert.deepEqual(outputs('version=0.10.0\nrelease=\nnotes<<END\na=b\nc\nEND\n'), { version: '0.10.0', release: '', notes: 'a=b\nc' })
    assert.throws(() => outputs('notes<<END\na'), /never ends/)
  })
})

describe('the runs side by side', () => {
  /** @param {string} job @param {string[]} [needs] @param {number} [cpus] */
  const run = (job, needs = [], cpus = 2) => /** @type {import('../scripts/ci.js').Run} */ ({ key: job, name: job, slug: job, job, needs, cpus, memory: 1, steps: [] })

  it('keeps within the machine, starts a job after what it needs, and skips it when that failed', async () => {
    const runs = [run('a', [], 4), run('b', [], 4), run('c', ['a']), run('d', ['b'])]
    /** @type {string[]} */
    const order = []
    let peak = 0
    let now = 0
    const log = console.log
    console.log = () => {}
    try {
      const done = await schedule(runs, { cpus: 4, memory: 8 }, async (one) => {
        order.push(one.job); now += one.cpus; peak = Math.max(peak, now)
        await new Promise((resolve) => setTimeout(resolve, 5))
        now -= one.cpus
        return { failed: one.job === 'b' ? 'a step' : null, skipped: [] }
      })
      assert.equal(peak, 4)
      assert.deepEqual(order, ['a', 'b', 'c'])
      assert.deepEqual([...done].map(([one, result]) => [one.job, result.state]).sort(), [['a', 'passed'], ['b', 'failed'], ['c', 'passed'], ['d', 'skipped']])
    } finally { console.log = log }
  })
})
