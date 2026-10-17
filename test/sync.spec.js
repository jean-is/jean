// Sync (D157): two computers keep each other's conversations through a folder their cloud drive
// syncs. Each computer is a browser context of its own, the system's picker is played by a folder of
// its private file system (as in folders.spec.js), and the drive by the test, which copies one
// computer's folder over the other's. Chromium only: elsewhere a page can't open a folder in place.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings, openTasks } from './helpers.js'

/** The system's folder picker, played by `.picked/<e2e.pick>` in the private file system, where Jean’s own files (sealed, D371) never are. @param {import('@playwright/test').Page} page */
const picker = (page) => page.addInitScript(() => {
  Object.assign(window, {
    showDirectoryPicker: async () => (await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked', { create: true }))
      .getDirectoryHandle(localStorage.getItem('e2e.pick') ?? 'Jean', { create: true }),
  })
})

/** Every file of a picked folder, by path. @param {import('@playwright/test').Page} page @param {string} name @returns {Promise<Record<string, string>>} */
const folder = (page, name) => page.evaluate(async (name) => {
  /** @type {Record<string, string>} */
  const files = {}
  /** @param {FileSystemDirectoryHandle} dir @param {string} at */
  const walk = async (dir, at) => {
    for await (const [entry, handle] of /** @type {any} */ (dir).entries()) {
      if (handle.kind === 'directory') await walk(handle, `${at}${entry}/`)
      else files[`${at}${entry}`] = await (await handle.getFile()).text()
    }
  }
  await walk(await (await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked', { create: true })).getDirectoryHandle(name, { create: true }), '')
  return files
}, name)

/** The drive: the folder becomes exactly these files. @param {import('@playwright/test').Page} page @param {string} name @param {Record<string, string>} files */
const drive = (page, name, files) => page.evaluate(async ({ name, files }) => {
  const picked = await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked', { create: true })
  await picked.removeEntry(name, { recursive: true }).catch(() => {})
  const top = await picked.getDirectoryHandle(name, { create: true })
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split('/')
    let dir = top
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true })
    const writable = await (await dir.getFileHandle(String(parts.at(-1)), { create: true })).createWritable()
    await writable.write(text)
    await writable.close()
  }
}, { name, files })

/** @param {import('@playwright/test').Page} page @param {string} text */
async function answered(page, text) {
  await ask(page, text)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  // Its run is over too: a round leaves a conversation being answered for the next.
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
}

test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium opens a folder in place')

test('two computers keep each other’s conversations through a folder their drive syncs', async ({ page, browser }) => {
  await picker(page)
  await start(page)
  await connectFakeBrain(page)
  await answered(page, 'Explain photosynthesis in simple words')
  await page.evaluate(async () => (await import('/ui/state.js')).app.fs.write('.secrets/keys.json', '{"format":1}\n'))

  // The first computer: an empty folder, which gets the mark and everything but keys and settings.
  await turnOn(page, 'Sync')
  // Its row, still open, leads to its part of Your data.
  await page.locator('app-settings .case .item-body').getByRole('button', { name: 'Open' }).click()
  const panel = page.locator('app-settings section.sync')
  await expect(panel).toContainText('Synced with Jean')
  const first = await folder(page, 'Jean')
  expect(Object.keys(first)).toContain('mirror.json')
  expect(Object.keys(first).filter((path) => path.endsWith('.jsonl'))).toHaveLength(1)
  expect(Object.keys(first).filter((path) => /^(\.secrets|\.cache)\/|^settings\.json$/.test(path))).toEqual([])
  await page.keyboard.press('Escape')

  // The second computer, where the drive brought the folder: the first one's conversation comes in.
  const context = await browser.newContext()
  const other = await context.newPage()
  await picker(other)
  await start(other)
  await drive(other, 'Jean', first)
  await turnOn(other, 'Sync')
  await other.keyboard.press('Escape')
  const list = await openTasks(other)
  await list.locator('.history-item', { hasText: 'photosynthesis' }).click()
  await expect(other.locator('.msg-user').first()).toContainText('Explain photosynthesis')
  // One home: the second computer's, still empty, gave way to the first one's.
  const homes = await other.evaluate(async () => (await import('/ui/state.js')).app.projects.value.filter((project) => project.data.default).map((project) => project.dir))
  expect(homes).toEqual([Object.keys(first).find((path) => path.endsWith('/project.md'))?.replace('/project.md', '')])

  // A conversation there goes back, after its answer, and comes in on the first computer.
  await connectFakeBrain(other)
  await (await openTasks(other)).locator('.place', { hasText: 'New task' }).click()
  await expect(other.locator('.hero-question')).toBeVisible()
  await answered(other, 'What is a leap year?')
  await expect.poll(async () => Object.values(await folder(other, 'Jean')).some((text) => text.includes('What is a leap year?')), { timeout: 15_000 }).toBe(true)
  await drive(page, 'Jean', await folder(other, 'Jean'))
  const back = (await openSettings(page, 'Your data')).locator('section.sync')
  await back.getByRole('button', { name: 'Sync now' }).click()
  await page.keyboard.press('Escape')
  await expect((await openTasks(page)).locator('.history-item', { hasText: 'leap year' })).toBeVisible()
  await context.close()
})

test('a folder of other files is refused, and nothing of it comes in', async ({ page }) => {
  await picker(page)
  await start(page)
  await page.evaluate(() => localStorage.setItem('e2e.pick', 'Documents'))
  await drive(page, 'Documents', { 'Taxes 2025.txt': 'Mine', 'projects/notes.md': 'Mine too' })
  await turnOn(page, 'Sync')
  await expect(page.locator('.toast')).toContainText('Documents holds other files.')
  await page.keyboard.press('Escape')
  const panel = (await openSettings(page, 'Your data')).locator('section.sync')
  await expect(panel.getByRole('button', { name: 'Choose a folder…' })).toBeVisible()
  expect(await folder(page, 'Documents')).toEqual({ 'Taxes 2025.txt': 'Mine', 'projects/notes.md': 'Mine too' })
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.fs.exists('projects/notes.md'))).toBe(false)
})
