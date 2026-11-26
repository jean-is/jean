// SPDX-License-Identifier: MIT
// npm run reproduce -- <report.json | page.md | link> [--release] [--brain fake] [--port 4197] (D771): a report someone sent, stood up for support
// in Chromium, headed: Jean served from this tree, or with --release from the release the report names (its v<version> tag, in a git
// worktree of dist/reproduce/ with this repository's node_modules), opened in the reporter's language, time zone and window, the stand-in
// restored into a fresh profile (caps/report/standin.js) and its settings written whole, a month's limit included, the report's policy
// served as policy.json. Brains keep their providers' addresses with no key: REPRODUCE_KEYS='{"mistral":"…"}' gives support's own,
// by provider, and --brain fake adds the e2e tests' fake brain and answers with it. What can't be stood up is printed. It never ships.
import { spawn, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, symlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { standIn } from '../app/caps/report/standin.js'
import { bytesOf, openValue } from '../app/caps/share/seal.js'
import { writeZip } from '../app/core/zip.js'
import { PROVIDERS } from '../app/core/llm.js'
import { DIRECTORY } from '../app/caps/connections/directory.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const { values: options, positionals: [given] } = parseArgs({ allowPositionals: true, options: { release: { type: 'boolean' }, brain: { type: 'string' }, port: { type: 'string', default: '4197' } } })
if (!given) throw new Error('reproduce: name a report, as a file or its link')

/** The report in a file or a pasted page, or behind a sealed link, which the share host keeps (caps/share). @param {string} where */
async function reportFrom(where) {
  let text = ''
  if (/^https?:\/\//.test(where)) {
    const link = new URL(where), id = link.pathname.split('/').pop() ?? '', secret = link.hash.slice(1)
    const sealed = await fetch(new URL(`v1/${id}`, new URL('./', link))).then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`reproduce: the link answered ${response.status}`))))
    const value = await openValue(new Uint8Array(sealed), bytesOf(secret)).catch(() => { throw new Error('reproduce: this link has a password, or isn\'t whole: open it, copy the report into a file and name that') })
    // The copy is a task's JSONL, the report the page its one answer is.
    text = String(value.file ?? '').split('\n').map((line) => { try { return JSON.parse(line) } catch { return null } }).find((record) => record?.update?.sessionUpdate === 'agent_message_chunk')?.update.content.text ?? ''
  } else text = await readFile(where, 'utf8')
  const json = /```json\n([\s\S]*?)\n```/.exec(text)?.[1] ?? text
  const report = JSON.parse(json)
  if (report?.format !== 1 || report.kind !== 'report') throw new Error('reproduce: this is not a report')
  return report
}

/** Where Jean is served from: this tree, or the release the report names, built once. @param {Record<string, any>} report */
async function rootFor(report) {
  if (!options.release) return ROOT
  const version = String(report.jean?.version ?? '')
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('reproduce: the report names no release')
  const dir = join(ROOT, 'dist/reproduce', version)
  if (!existsSync(dir)) {
    await mkdir(join(ROOT, 'dist/reproduce'), { recursive: true })
    execFileSync('git', ['worktree', 'add', '--detach', dir, `v${version}`], { cwd: ROOT, stdio: 'inherit' })
    await symlink(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir')
    execFileSync('npm', ['run', 'build'], { cwd: dir, stdio: 'inherit' })
  }
  return dir
}

/** Jean served from a tree, and the fake brain when asked for, until stopped. @param {string} root @param {number} port */
async function serve(root, port) {
  const servers = [spawn(process.execPath, [join(root, 'scripts/serve.js')], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' })]
  if (options.brain === 'fake') servers.push(spawn(process.execPath, [join(ROOT, 'test/fixtures/fake-brain.js')], { env: { ...process.env, PORT: String(port + 1) }, stdio: 'ignore' }))
  const base = `http://127.0.0.1:${port}/`
  for (let tries = 0; tries < 100; tries++) {
    if (await fetch(base).then((response) => response.ok, () => false)) return { base, stop: () => servers.forEach((server) => server.kill()) }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  servers.forEach((server) => server.kill())
  throw new Error('reproduce: Jean was not served')
}

const report = await reportFrom(given)
const root = await rootFor(report)
const port = Number(options.port)
const { base, stop } = await serve(root, port)
const { files, missing } = standIn(report, { providers: PROVIDERS, directory: Object.fromEntries(DIRECTORY.map((one) => [one.id, { name: one.name, url: one.url }])) })
const settings = JSON.parse(new TextDecoder().decode(files.find((file) => file.name === 'settings.json')?.bytes))
// What a restore leaves as the device has it, written back from the report.
for (const key of ['limit', 'cloud', 'forget', 'wasAuto']) if (typeof report.settings?.[key] !== 'object' && report.settings?.[key] !== undefined) settings[key] = report.settings[key]
if (options.brain === 'fake') settings.brains.push({ id: '01REPR0DVCE0000000000FAKE0', provider: 'custom', api: 'openai', baseURL: `http://127.0.0.1:${port + 1}/v1`, model: 'fake' }), (settings.activeBrain = '01REPR0DVCE0000000000FAKE0'), (settings.auto = false)
const keys = JSON.parse(process.env.REPRODUCE_KEYS || '{}')

// Headed, for support to use; HEADLESS=1 checks it runs.
const browser = await chromium.launch({ headless: Boolean(process.env.HEADLESS) })
const { browser: seen = {} } = report
const context = await browser.newContext({ baseURL: base, locale: seen.language ?? 'en', timezoneId: seen.timeZone, viewport: seen.viewport ? { width: seen.viewport.width, height: seen.viewport.height } : undefined,
  deviceScaleFactor: seen.viewport?.scale, colorScheme: seen.dark ? 'dark' : 'light', reducedMotion: seen.reducedMotion ? 'reduce' : 'no-preference' })
const page = await context.newPage()
if (report.policy) {
  await page.route((url) => url.pathname === '/policy.json', (route) => route.fulfill({ json: report.policy }))
  await page.addInitScript(() => document.addEventListener('readystatechange', () => {
    if (document.readyState === 'interactive') document.head.append(Object.assign(document.createElement('meta'), { name: 'app-policy', content: 'policy.json' }))
  }, { once: true }))
}
await page.goto('./')
await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 60_000 })
const zip = await writeZip(files)
await page.evaluate(async ({ bytes, settings, keys }) => {
  const [{ app }, { importBackup }, { setSecret }] = await Promise.all([import('/ui/state.js'), import('/caps/backup/archive.js'), import('/ui/secrets.js')])
  await importBackup(app.fs, new Uint8Array(bytes), [...settings.unlocked])
  await app.fs.write('settings.json', `${JSON.stringify(settings, null, 2)}\n`)
  for (const brain of settings.brains) if (keys[brain.provider]) await setSecret(app.fs, brain.id, keys[brain.provider])
}, { bytes: [...zip], settings, keys })
await page.reload()
console.log(`reproduce: Jean ${report.jean?.version ?? '?'} as reported${options.release ? '' : ', served from this tree'}, at ${base}`)
console.log(`reproduce: reported from ${[...(seen.brands ?? []).filter((/** @type {{ brand: string }} */ one) => !/Not.A.Brand/i.test(one.brand)).map((/** @type {{ brand: string, version: string }} */ one) => `${one.brand} ${one.version}`), seen.platform, seen.platformVersion].filter(Boolean).join(', ') || seen.userAgent}`)
console.log(`reproduce: not stood up: ${missing.join(', ')}`)
browser.on('disconnected', stop)
process.on('SIGINT', () => { stop(); process.exit(0) })
