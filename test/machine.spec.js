// This computer (D198): a server the sandbox refuses brings the offer; Settings › Computer opens on its
// page, a row under the sandbox's (D248, D534), with the line, which the user pastes in a terminal in their folder
// (here, run by the test); the brain's commands then run on this machine, asked first, and a server they
// start keeps running and shows in the browser; the user's own commands in the terminal run there too;
// "always" for the folder is listed on its page, to take back; Ctrl+C ends it all.
import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { start, connectFakeBrain, ask, turnOn, openSettings, closeSettings, giveFolder } from './helpers.js'

test.skip(process.platform === 'win32', 'The bridge needs bash')

/** Ctrl+C for the bridge and what it started, unless it has already ended: a failure before shows as it is. @param {import('node:child_process').ChildProcess} bridge */
const stop = (bridge) => { if (bridge.pid && bridge.exitCode === null) process.kill(-bridge.pid, 'SIGINT') }

/** The line This computer's page shows, its key hidden there (D534), put back as Copy takes it. @param {import('@playwright/test').Page} page */
async function pasted(page) {
  const shown = String(await page.locator('.machine-line code').textContent())
  expect(shown).toMatch(/ --key=•+$/)
  const key = await page.evaluate(async () => JSON.parse(String(await (await import('/ui/secrets.js')).getSecret((await import('/ui/state.js')).app.fs, 'computer-bridge'))).key)
  return shown.replace(/--key=•+$/, `--key=${key}`)
}

test('a server refused in the sandbox runs on this computer instead, and shows in the browser', async ({ page, browserName }) => {
  test.setTimeout(120_000)
  // The user's folder on this machine, and the one the browser opens of the same name.
  const disk = join(mkdtempSync(join(tmpdir(), 'jean-e2e-')), 'shop')
  mkdirSync(disk)
  writeFileSync(join(disk, 'marker.txt'), 'only on the disk\n')
  writeFileSync(join(disk, 'serve.mjs'), "import { createServer } from 'node:http'\nconst server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>Served from this computer</h1>')).listen(0, '127.0.0.1', () => console.log(`ready at http://127.0.0.1:${server.address().port}/`))\n")
  // Chromium opens a folder in place, played here by one of the private file system; elsewhere it is a copy.
  if (browserName === 'chromium') {
    await page.addInitScript(() => {
      Object.assign(window, { showDirectoryPicker: async () => (await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked', { create: true })).getDirectoryHandle('shop', { create: true }) })
    })
  }
  await start(page)
  await connectFakeBrain(page)
  const chooser = browserName === 'chromium' ? null : page.waitForEvent('filechooser')
  await turnOn(page, 'Folders')
  if (chooser) await giveFolder(await chooser, disk)
  await page.keyboard.press('Escape')
  await expect(page.locator('.folder-name')).toHaveText('shop')
  await turnOn(page, 'Computer')
  await page.keyboard.press('Escape')
  await turnOn(page, 'Browser')
  await page.keyboard.press('Escape')

  // In the sandbox, nothing listens on a port: the refusal brings the offer.
  await ask(page, '$ npx vite')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('nothing can listen on a port here')
  const offer = page.locator('aside.offer')
  await expect(offer).toContainText('Run a site’s dev server, or your own programs, on this computer?')
  await offer.getByRole('button', { name: 'Use this computer' }).click()

  // Settings › Computer opens on This computer's page, its picture at its head (D250), with three steps: a terminal
  // in the folder, the line to paste there, its key hidden, and a light that waits for it.
  const settings = page.locator('app-settings dialog[open]')
  const panel = settings.locator('.settings-panel')
  await expect(panel.locator('.data-head h2')).toHaveText('This computer')
  await expect(panel.locator('.data-head .item-icon svg.art')).toHaveCount(1)
  const part = settings.locator('.machine')
  await expect(part.locator('.machine-steps > li')).toHaveText(['Open a terminal in one of your folders.', /^Paste this line there, then press Enter\./, 'Waiting for the line to run: this page notices by itself.'])
  const line = await pasted(page)
  expect(line).toMatch(/^curl -fsSL http:\/\/127\.0\.0\.1:\d+\/bridge\/bridge\.js \| node --input-type=module - --port \d+ --origin http:\/\/127\.0\.0\.1:\d+ --key=[\w-]+$/)
  const bridge = spawn('bash', ['-c', line], { cwd: disk, stdio: 'ignore', detached: true })
  try {
    await expect(panel).toContainText('Tasks with the folder shop run their commands on this computer', { timeout: 15_000 })
    // Back on the list, its row under the sandbox's, ready, the folder it runs in said.
    await panel.getByRole('button', { name: 'Computer', exact: true }).click()
    const mine = panel.locator('[data-page="machine"]')
    await expect(mine).toContainText('Ready')
    await expect(mine).toContainText('The folder shop, each command asked first')
    await expect(mine).toBeFocused()
    // Its picture shows it too: its screen lit, its link filled.
    await expect(mine.locator('.item-icon')).toHaveAttribute('data-state', 'ready')
    // The sandbox's row above it, which tasks use otherwise, with its own picture.
    await expect(panel.locator('[data-page="sandbox"] svg.art')).toHaveCount(1)
    await expect(panel.locator('.lede')).toHaveText('Tasks use the sandbox, except those in the folder you connect on this computer.')
    await page.keyboard.press('Escape')

    // The brain's command is asked first, then runs on the disk; a server it starts goes on, and the browser shows it.
    await expect(page.locator('.follow-ups')).toBeVisible()
    await ask(page, '$ cat marker.txt && node serve.mjs')
    const card = page.locator('app-machine-approval .approval')
    await expect(card).toContainText('Run this on your computer, in shop?')
    await expect(card.locator('pre')).toHaveText('cat marker.txt && node serve.mjs')
    await card.getByRole('button', { name: 'Always allow in shop' }).click()
    const answer = page.locator('.msg-jean .prose').last()
    await expect(answer).toContainText('only on the disk', { timeout: 20_000 })
    await expect(answer).toContainText(/Still running in the background, serving http:\/\/127\.0\.0\.1:\d+\//)
    await expect(answer).toContainText('Ran on the user\'s own computer')
    await expect(page.frameLocator('.browser-host').frameLocator('iframe').locator('h1')).toHaveText('Served from this computer')

    // What the user types in the terminal runs there too, unasked.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+j' : 'Control+j')
    const terminal = page.locator('app-terminal .terminal')
    await terminal.locator('textarea').fill('pwd && ls')
    await terminal.locator('textarea').press('Enter')
    await expect(terminal.locator('.terminal-entry').last()).toContainText('/workspace')
    await expect(terminal.locator('.terminal-entry').last()).toContainText('serve.mjs')

    // "Always" shows on its page, and × takes it back: the folder's commands are asked first again.
    await openSettings(page, 'Computer')
    await settings.locator('[data-page="machine"]').click()
    const trusted = part.locator('.sites li')
    await expect(trusted).toHaveText(['shop'])
    await part.getByRole('button', { name: 'Ask first again in shop' }).click()
    await expect(trusted).toHaveCount(0)
    expect(await page.evaluate(async () => JSON.parse(String(await (await import('/ui/secrets.js')).getSecret((await import('/ui/state.js')).app.fs, 'computer-bridge'))).always)).toEqual([])
  } finally {
    // Ctrl+C in the user's terminal: the bridge ends, and what it started.
    stop(bridge)
  }
})

// Claude Code (D235): the user's own, signed in with their Claude plan, answers through the bridge; played
// here by test/fixtures/claude.js, first on the PATH of the terminal the line is pasted in, never the real one.
test('the user’s Claude plan answers, through Claude Code on this computer', async ({ page }) => {
  test.setTimeout(120_000)
  const disk = mkdtempSync(join(tmpdir(), 'jean-e2e-'))
  const bin = join(disk, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'claude'), `#!/bin/sh\nexec '${process.execPath}' '${fileURLToPath(new URL('./fixtures/claude.js', import.meta.url))}' "$@"\n`, { mode: 0o755 })
  await start(page)
  const settings = await openSettings(page, 'Brains')
  // Each way is a page of its own (D514).
  await settings.locator('[data-brain="claude"]').click()
  const way = settings.locator('.brain-way')
  await expect(way).toContainText('Claude Pro or Max')
  // This computer is off: Connect opens its page in Settings › Computer, with the line.
  await way.getByRole('button', { name: 'Connect' }).click()
  const part = settings.locator('.machine')
  await expect(part.locator('.machine-steps')).toContainText('Paste this line there')
  const line = await pasted(page)
  const bridge = spawn('bash', ['-c', line], { cwd: disk, stdio: 'ignore', detached: true, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
  try {
    await expect(settings.locator('.settings-panel')).toContainText('run their commands on this computer', { timeout: 15_000 })
    await settings.locator('.settings-nav button', { hasText: 'Brains' }).click()
    await settings.locator('[data-brain="claude"]').click()
    await way.getByRole('button', { name: 'Connect' }).click()
    await expect(settings).toBeHidden()
    // Claude Code runs here, but answers from Anthropic's: a brain in the cloud, never a private one.
    await expect((await openSettings(page, 'Brains')).locator('.brain-rows button', { hasText: 'Claude Code' })).toContainText('In the cloud')
    await closeSettings(page)
    await ask(page, 'hello there')
    await expect(page.locator('.msg-jean .prose').last()).toContainText(/Heard \((haiku|sonnet|opus), .*hello there/, { timeout: 20_000 })
    // What it thought shows in the activity, under its line.
    await ask(page, 'think it over')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Thought it over', { timeout: 20_000 })
    const activity = page.locator('.activity').last()
    await activity.locator(':scope > summary').click()
    await activity.locator('.step > summary').last().click()
    await expect(activity.locator('.thought').last()).toContainText('Weighing it.')
  } finally {
    stop(bridge)
  }
})

// Copilot (D262): the user's own Copilot CLI, signed in with their plan, answers through the bridge, over ACP;
// played here by test/fixtures/copilot.js, first on the PATH of the terminal the line is pasted in.
test('the user’s Copilot plan answers, through Copilot on this computer', async ({ page }) => {
  test.setTimeout(120_000)
  const disk = mkdtempSync(join(tmpdir(), 'jean-e2e-'))
  const bin = join(disk, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'copilot'), `#!/bin/sh\nexec '${process.execPath}' '${fileURLToPath(new URL('./fixtures/copilot.js', import.meta.url))}' "$@"\n`, { mode: 0o755 })
  await start(page)
  const settings = await openSettings(page, 'Brains')
  await settings.locator('[data-brain="copilot"]').click()
  const way = settings.locator('.brain-way')
  await expect(way).toContainText('GitHub Copilot plan')
  await way.getByRole('button', { name: 'Connect' }).click()
  const line = await pasted(page)
  const bridge = spawn('bash', ['-c', line], { cwd: disk, stdio: 'ignore', detached: true, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
  try {
    await expect(settings.locator('.settings-panel')).toContainText('run their commands on this computer', { timeout: 15_000 })
    await settings.locator('.settings-nav button', { hasText: 'Brains' }).click()
    await settings.locator('[data-brain="copilot"]').click()
    await way.getByRole('button', { name: 'Connect' }).click()
    await expect(settings).toBeHidden()
    await expect((await openSettings(page, 'Brains')).locator('.brain-rows button', { hasText: 'GitHub Copilot' })).toContainText('In the cloud')
    await closeSettings(page)
    await ask(page, 'hello there')
    await expect(page.locator('.msg-jean .prose').last()).toContainText(/Heard \([\w.-]+, [\s\S]*hello there/, { timeout: 20_000 })
  } finally {
    stop(bridge)
  }
})

// ChatGPT (D262): back from its sign-in without the plan's use, Settings › Brains says so, on its way's page (D514).
test('back from ChatGPT’s sign-in, declined, Settings › Brains says why', async ({ page }) => {
  await start(page)
  await page.evaluate(() => sessionStorage.setItem('app.draft', 'kept while away'))
  await page.goto('/?chatgpt=declined')
  const way = page.locator('app-settings dialog[open] .brain-way')
  await expect(page).toHaveURL(/#\/settings\/brains\/chatgpt$/)
  await expect(way.locator('.status')).toHaveText('ChatGPT didn’t allow the use of your plan. To allow it, continue with ChatGPT again.')
  await expect(way.getByRole('button', { name: 'Continue with ChatGPT' })).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
})
