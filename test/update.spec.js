// SPDX-License-Identifier: MIT
// A new version (D138): a page not used yet takes it on its own once it is ready, where it was; a page in use shows the
// toast, and a plain reload brings it in, the draft kept; with two tabs the toast waits for its button, which brings
// both, a busy one once its work is done. On a server of its own over links to app/, all but sw.js, which a test
// deploys again: the browser's check for a new sw.js passes no route.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const strings = JSON.parse(readFileSync(join(ROOT, 'app', 'locales', 'en.json'), 'utf8'))
const dialogs = JSON.parse(readFileSync(join(ROOT, 'app', 'locales', 'dialogs', 'en.json'), 'utf8'))

// Each test deploys over the last one's version.
test.describe.configure({ mode: 'serial' })

let site = '', base = '', deploys = 0
/** @type {import('node:child_process').ChildProcess | undefined} */
let server
test.beforeAll(async ({}, testInfo) => {
  site = await mkdtemp(join(tmpdir(), 'app-update-'))
  for (const name of await readdir(join(ROOT, 'app'))) if (name !== 'sw.js') await symlink(join(ROOT, 'app', name), join(site, name))
  await deploy()
  // Ten past Jean's own, one for each engine and each repeat.
  const engine = testInfo.config.projects.findIndex((project) => project.name === testInfo.project.name)
  const port = Number(new URL(testInfo.project.use.baseURL ?? '').port) + 10 + testInfo.repeatEachIndex * testInfo.config.projects.length + engine
  base = `http://127.0.0.1:${port}/`
  server = spawn(process.execPath, ['scripts/serve.js'], { cwd: ROOT, env: { ...process.env, SITE: site, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] })
  await new Promise((resolve) => server?.stdout?.once('data', resolve))
})
test.afterAll(async () => {
  server?.kill()
  await rm(site, { recursive: true, force: true })
})

/** Puts another version of sw.js where the browser looks for one, named in twelve characters as manifest.js names them. */
async function deploy() {
  const version = `next${String(++deploys).padStart(8, '0')}`
  await writeFile(join(site, 'sw.js'), (await readFile(join(ROOT, 'app', 'sw.js'), 'utf8')).replace(/^const VERSION = '.*'$/m, `const VERSION = '${version}'`))
  return version
}

/**
 * The version serving the page: the one shell cache left, none waiting; null while a new one waits, or as the page
 * goes for it. @param {import('@playwright/test').Page} page
 */
const version = (page) => page.evaluate(async () => {
  const shells = (await caches.keys()).filter((name) => name.startsWith('app-shell-'))
  return shells.length === 1 && !(await navigator.serviceWorker.getRegistration())?.waiting ? shells[0].slice('app-shell-'.length) : null
}).catch(() => null)

/** @param {import('@playwright/test').Page} page */
const toast = (page) => page.locator('app-toasts .toast').filter({ hasText: strings['update.ready'].replace('{name}', 'Jean') })

/** A tab of Jean, its worker in control, and how many times it has loaded since. @param {import('@playwright/test').BrowserContext} context */
async function open(context, place = '#/') {
  const page = await context.newPage()
  await page.goto(base + place)
  await page.waitForFunction(() => navigator.serviceWorker.controller)
  await expect(page.locator('#prompt')).toBeVisible()
  const loads = { count: 0 }
  page.on('load', () => loads.count++)
  return { page, loads }
}

test('a page not used yet takes a new version once it is ready, where it was', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const { page, loads } = await open(context, '#/settings')
  const next = await deploy()
  // The browser finds it as the page loads, under the version before.
  await page.reload()
  await expect.poll(() => version(page)).toBe(next)
  // The reload, then the page coming back as the new version.
  await expect.poll(() => loads.count).toBe(2)
  expect(new URL(page.url()).hash).toBe('#/settings')
  await expect(toast(page)).toHaveCount(0)
  await context.close()
})

test('Settings looks for a new version when asked, says when there is none, and brings one in, said there alone', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const { page } = await open(context, '#/settings')
  const said = page.locator('.version-check [role="status"]'), look = page.getByRole('button', { name: dialogs['settings.checkVersion'] })
  await look.click()
  await expect(said).toHaveText(dialogs['settings.newest'])
  const next = await deploy()
  await look.click()
  await expect(said).toHaveText(strings['update.ready'].replace('{name}', 'Jean'))
  await expect(toast(page)).toHaveCount(0)
  await page.getByRole('button', { name: strings['update.reload'] }).click()
  await expect.poll(() => version(page)).toBe(next)
  expect(new URL(page.url()).hash).toBe('#/settings')
  await context.close()
})

test('a toast closed comes back once the page is back on screen a quarter of an hour later', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const { page } = await open(context)
  await page.locator('#prompt').click()
  await deploy()
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update() })
  await toast(page).getByRole('button', { name: strings['action.close'] }).click()
  await expect(toast(page)).toHaveCount(0)
  // An installed app on Android comes back without loading, and the browser finds nothing newer than the one waiting.
  await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 16 * 60e3; document.dispatchEvent(new Event('visibilitychange')) })
  await expect(toast(page)).toBeVisible()
  await context.close()
})

test('a page in use shows the toast, and a plain reload brings the new version in, its draft kept', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const { page } = await open(context)
  await page.locator('#prompt').click()
  const next = await deploy()
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update() })
  await expect(toast(page)).toBeVisible()
  expect(await version(page)).toBeNull()
  await page.locator('#prompt').fill('Half a request')
  await expect.poll(() => page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).toContain('Half a request')
  await page.reload()
  await expect.poll(() => version(page)).toBe(next)
  await expect(page.locator('#prompt')).toHaveValue('Half a request')
  await expect(toast(page)).toHaveCount(0)
  await context.close()
})

test('with two tabs the toast waits for its button, which brings both, a busy one once its work is done', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const one = await open(context), two = await open(context)
  await two.page.evaluate(async () => { (await import('/ui/state.js')).app.busy.value = true })
  const next = await deploy()
  // Not used yet, but not alone: the new worker says to wait.
  await one.page.reload()
  await expect(toast(one.page)).toBeVisible()
  expect(await version(one.page)).toBeNull()
  await toast(one.page).getByRole('button', { name: strings['update.reload'] }).click()
  await expect.poll(() => version(one.page)).toBe(next)
  await expect.poll(() => one.loads.count).toBe(2)
  // The other tab runs the version before over the new one's files until its answer is done, then follows.
  await two.page.waitForTimeout(1000)
  expect(two.loads.count).toBe(0)
  await two.page.evaluate(async () => { (await import('/ui/state.js')).app.busy.value = false })
  await expect.poll(() => two.loads.count).toBe(1)
  await context.close()
})
