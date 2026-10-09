// The desktop app (D155, D169): Sync's folder is picked with the system's dialog, its host works in it
// by its path, and the folder's name opens it in the system's file manager; Settings › Computer has the
// computer's memory from it (D176); This computer's bridge is started by it (D198). The host is played by the
// test, on a folder of its own: Neutralino's globals, whose key comes once, and its calls over a
// WebSocket. In WebKit too, the Mac app's engine, where a page alone can't open a folder.
import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { start, turnOn, openSettings } from './helpers.js'
import { NATIVE } from '../scripts/desktop.js'

const TOKEN = 'key.connect'

/**
 * Neutralino, as far as Jean uses it: the methods its configuration allows, on this computer's files.
 * @param {import('@playwright/test').Page} page @param {string} folder what its dialog picks
 * @returns {Promise<{ opened: string[], asked: string[], programs: Map<number, import('node:child_process').ChildProcess> }>}
 */
async function desktop(page, folder) {
  const seen = { opened: /** @type {string[]} */ ([]), asked: /** @type {string[]} */ ([]), programs: new Map() }
  let started = 0
  let given = false
  await page.route('**/__neutralino_globals.js', (route) => {
    route.fulfill({ contentType: 'application/javascript', body: `var NL_OS='Darwin';var NL_PORT=${new URL(route.request().url()).port};var NL_TOKEN='${given ? '' : TOKEN}';` })
    given = true
  })
  /** @type {Record<string, (data: any) => Promise<unknown>>} */
  const methods = {
    'computer.getMemoryInfo': async () => ({ physical: { total: 96 * 2 ** 30, available: 2 ** 30 } }),
    'os.showFolderDialog': async () => folder,
    'os.open': async ({ url }) => void seen.opened.push(url),
    'filesystem.getStats': async ({ path }) => {
      const found = await stat(path)
      return { size: found.size, isFile: found.isFile(), isDirectory: found.isDirectory(), modifiedAt: Math.floor(found.mtimeMs / 1000) * 1000 }
    },
    'filesystem.readDirectory': async ({ path }) => (await readdir(path, { withFileTypes: true })).map((entry) => ({ entry: entry.name, type: entry.isDirectory() ? 'DIRECTORY' : 'FILE' })),
    'filesystem.readBinaryFile': async ({ path }) => (await readFile(path)).toString('base64'),
    'filesystem.writeBinaryFile': async ({ path, data }) => void await writeFile(path, Buffer.from(data, 'base64')),
    'filesystem.createDirectory': async ({ path }) => void await mkdir(path, { recursive: true }),
    'filesystem.remove': async ({ path }) => void await rm(path, { recursive: true }),
    // A program, as Neutralino runs it: through /bin/sh, its input a pipe the app holds until it quits.
    'os.spawnProcess': async ({ command }) => {
      const child = spawn('/bin/sh', ['-c', command], { stdio: ['pipe', 'ignore', 'ignore'] })
      const id = started++
      seen.programs.set(id, child)
      child.on('exit', () => seen.programs.delete(id))
      return { id, pid: child.pid }
    },
    'os.getSpawnedProcesses': async () => [...seen.programs].map(([id, child]) => ({ id, pid: child.pid })),
    'os.updateSpawnedProcess': async ({ id, event }) => void (event === 'stdInEnd' && seen.programs.get(id)?.stdin?.end()),
  }
  await page.routeWebSocket(/connectToken=/, (ws) => {
    if (!ws.url().endsWith(`connectToken=${TOKEN.split('.')[1]}`)) return ws.close()
    ws.onMessage(async (message) => {
      const { id, method, accessToken, data } = JSON.parse(String(message))
      seen.asked.push(method)
      const answer = accessToken !== TOKEN || !methods[method] ? { error: { code: 'NE_RT_NATPRME', message: method } }
        : await methods[method](data).then((returnValue) => ({ returnValue, success: true }), (error) => ({ error: { code: error.code === 'ENOENT' ? 'NE_FS_NOPATHE' : 'NE_FS_UNKNOWN', message: String(error) } }))
      ws.send(JSON.stringify({ id, method, data: answer }))
    })
  })
  return seen
}

test('the desktop app syncs with a folder picked with the system’s dialog, and its name opens it there', async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'jean-desktop-'))
  const folder = join(root, 'Jean Sync')
  await mkdir(folder)
  try {
    const host = await desktop(page, folder)
    await start(page)
    await turnOn(page, 'Sync')
    await page.locator('app-settings .plaque').getByRole('button', { name: 'Open' }).click()
    const panel = page.locator('app-settings section.sync')
    await expect(panel).toContainText('Synced with Jean Sync')
    const files = await readdir(folder, { recursive: true })
    expect(files).toContain('mirror.json')
    expect(files.some((path) => path.endsWith('project.md'))).toBe(true)
    expect(files.filter((path) => /^(\.secrets|\.cache)|^settings\.json$/.test(path))).toEqual([])

    await panel.getByRole('button', { name: 'Jean Sync' }).click()
    await expect.poll(() => host.opened).toEqual([`file://${folder.split('/').map(encodeURIComponent).join('/')}`])

    // What is made next goes there at the next round, through the host's calls and no other.
    await page.evaluate(async () => (await import('/ui/state.js')).app.fs.write('projects/note.md', 'Made here\n'))
    await panel.getByRole('button', { name: 'Sync now' }).click()
    await expect.poll(() => readFile(join(folder, 'projects/note.md'), 'utf8').catch(() => '')).toBe('Made here\n')
    expect(host.asked.filter((method) => !NATIVE.includes(method))).toEqual([])

    // After a reload, the key, which came once, is still the tab's.
    await page.reload()
    expect(await page.evaluate(async (path) => (await (await import('/ui/host.js')).call('filesystem.getStats', { path })).isDirectory, folder)).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('in the desktop app, Settings › Computer has the computer’s whole memory, as the system tells it (D176, D249)', async ({ page }) => {
  const host = await desktop(page, tmpdir())
  await start(page)
  await turnOn(page, 'Computer')
  const settings = page.locator('app-settings dialog[open]')
  await settings.locator('.settings-nav button', { hasText: 'Computer' }).click()
  // Exactly, where the browser alone says at least a power of two, or nothing.
  await expect(settings.locator('.stats > div').nth(1)).toHaveText(/Memory\s*0 MB of 96 GB/)
  expect(host.asked).toContain('computer.getMemoryInfo')
})

test('in the desktop app, This computer starts its bridge itself in a folder the system’s dialog picks, and it ends when stopped or when the app quits (D198)', async ({ page }) => {
  test.skip(process.platform === 'win32', 'The bridge needs bash')
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'jean-desktop-'))
  const folder = join(root, 'shop')
  await mkdir(folder)
  const host = await desktop(page, folder)
  try {
    await start(page)
    await page.evaluate(async () => (await import('/ui/caps.js')).unlock('machine'))
    // Its card, beside the sandbox's (D248): no line to paste, a folder to choose, where the app starts the bridge through the user's shell.
    const settings = await openSettings(page, 'Computer')
    await settings.getByRole('tab', { name: /This computer/ }).click()
    const part = settings.locator('.machine')
    await expect(part).toContainText('in a folder you choose')
    await expect(page.locator('.machine-line')).toHaveCount(0)
    await part.getByRole('button', { name: 'Choose a folder…' }).click()
    await expect(part).toContainText('Tasks with the folder shop run their commands on this computer', { timeout: 60_000 })
    expect(host.asked).toContain('os.spawnProcess')
    expect(host.asked.filter((method) => !NATIVE.includes(method))).toEqual([])
    // Stopped, its input closes and it ends; chosen again, it ends when the app quits, as its input closes too.
    await part.getByRole('button', { name: 'Stop using it' }).click()
    await expect(part).toContainText('in a folder you choose')
    await expect.poll(() => host.programs.size).toBe(0)
    await part.getByRole('button', { name: 'Choose a folder…' }).click()
    await expect(part).toContainText('Tasks with the folder shop', { timeout: 60_000 })
    const [running] = host.programs.values()
    running.stdin?.end()
    await expect.poll(() => host.programs.size).toBe(0)
  } finally {
    for (const child of host.programs.values()) child.stdin?.end()
    await rm(root, { recursive: true, force: true })
  }
})
