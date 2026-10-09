// This computer (D198): a server the sandbox refuses brings the offer; Settings › Computer gives the
// line, which the user pastes in a terminal in their folder (here, run by the test); the brain's
// commands then run on this machine, asked first, and a server they start keeps running and shows in
// the browser; the user's own commands in the terminal run there too; Ctrl+C ends it all.
import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { start, connectFakeBrain, ask, turnOn, openSettings, closeSettings } from './helpers.js'

test.skip(process.platform === 'win32', 'The bridge needs bash')

/** Ctrl+C for the bridge and what it started, unless it has already ended: a failure before shows as it is. @param {import('node:child_process').ChildProcess} bridge */
const stop = (bridge) => { if (bridge.pid && bridge.exitCode === null) process.kill(-bridge.pid, 'SIGINT') }

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
      Object.assign(window, { showDirectoryPicker: async () => (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked', { create: true })).getDirectoryHandle('shop', { create: true }) })
    })
  }
  await start(page)
  await connectFakeBrain(page)
  const chooser = browserName === 'chromium' ? null : page.waitForEvent('filechooser')
  await turnOn(page, 'Folders')
  if (chooser) await (await chooser).setFiles(disk)
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

  // Settings › Computer opens on the line to paste in a terminal, in the folder.
  const part = page.locator('app-settings dialog[open] .machine')
  await expect(part).toContainText('paste this line')
  const line = String(await page.locator('.machine-line code').textContent())
  expect(line).toMatch(/^curl -fsSL http:\/\/127\.0\.0\.1:\d+\/bridge\/bridge\.js \| node --input-type=module - --port \d+ --origin http:\/\/127\.0\.0\.1:\d+ --key=[\w-]+$/)
  const bridge = spawn('bash', ['-c', line], { cwd: disk, stdio: 'ignore', detached: true })
  try {
    await expect(part).toContainText('Tasks with the folder shop run their commands on this computer', { timeout: 15_000 })
    await page.keyboard.press('Escape')

    // The brain's command is asked first, then runs on the disk; a server it starts goes on, and the browser shows it.
    await expect(page.locator('.follow-ups')).toBeVisible()
    await ask(page, '$ cat marker.txt && node serve.mjs')
    const card = page.locator('app-machine-approval .approval')
    await expect(card).toContainText('Run this on your computer, in shop?')
    await expect(card.locator('pre')).toHaveText('cat marker.txt && node serve.mjs')
    await card.getByRole('button', { name: 'Allow once' }).click()
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
  writeFileSync(join(bin, 'claude'), `#!/bin/sh\nexec '${process.execPath}' '${fileURLToPath(new URL('../test/fixtures/claude.js', import.meta.url))}' "$@"\n`, { mode: 0o755 })
  await start(page)
  await page.locator('.brain-chip').click()
  const settings = page.locator('app-settings dialog[open]')
  const way = settings.locator('.way.is-claude')
  await way.locator('summary').click()
  await expect(way).toContainText('Claude Pro or Max')
  // This computer is off: Connect opens its part of Settings › Computer, with the line.
  await way.getByRole('button', { name: 'Connect' }).click()
  const part = settings.locator('.machine')
  await expect(part).toContainText('paste this line')
  const line = String(await page.locator('.machine-line code').textContent())
  const bridge = spawn('bash', ['-c', line], { cwd: disk, stdio: 'ignore', detached: true, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
  try {
    await expect(part).toContainText('run their commands on this computer', { timeout: 15_000 })
    await settings.locator('.settings-nav button', { hasText: 'Brains' }).click()
    await way.locator('summary').click()
    await way.getByRole('button', { name: 'Connect' }).click()
    await expect(settings).toBeHidden()
    // Claude Code runs here, but answers from Anthropic's: a brain in the cloud, never a private one.
    await expect((await openSettings(page, 'Brains')).locator('.item', { hasText: 'Claude Code' }).first()).toContainText('In the cloud')
    await closeSettings(page)
    await ask(page, 'hello there')
    await expect(page.locator('.msg-jean .prose').last()).toContainText(/Heard \((haiku|sonnet|opus), .*hello there/, { timeout: 20_000 })
  } finally {
    stop(bridge)
  }
})
