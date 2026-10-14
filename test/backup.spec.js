// Backup (0.2): everything Jean keeps in one zip, keys left out, restored on another device
// (here, a fresh browser context) without deleting anything that was already there.
import { test, expect } from '@playwright/test'
import { readZip, writeZip } from '../app/core/zip.js'
import { start, connectFakeBrain, ask, openSettings, openTasks } from './helpers.js'

test('a backup holds the conversations but no key, and restores on a fresh device', async ({ page, browser }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  // A key, as Settings' Brains would keep it: never part of a backup.
  await page.evaluate(async () => (await import('/ui/state.js')).app.fs.write('.secrets/keys.json', '{"format":1}\n'))

  const settings = await openSettings(page, 'Your data')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    settings.getByRole('button', { name: 'Download a backup' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^Backup \d{4}-\d{2}-\d{2}\.zip$/)
  await expect(page.locator('.toast')).toContainText('Backup ready')
  const path = await download.path()
  const { readFile } = await import('node:fs/promises')
  const names = readZip(new Uint8Array(await readFile(path))).map((entry) => entry.name)
  expect(names).toContain('backup.json')
  expect(names.some((name) => name.endsWith('.jsonl'))).toBe(true)
  expect(names.filter((name) => /^\.(secrets|cache)\//.test(name))).toEqual([])

  // Another device: nothing yet, then everything from the backup.
  const context = await browser.newContext()
  const other = await context.newPage()
  await start(other)
  other.on('dialog', (dialog) => dialog.accept())
  await (await openSettings(other, 'Your data')).locator('input[type="file"]').setInputFiles(path)
  await expect(other.locator('.toast')).toContainText(/Restored \d+ files/)
  const ephemeral = await other.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)
  // Playwright's WebKit has no lasting storage (like a private window): the reload starts empty.
  if (!ephemeral) {
    await other.waitForEvent('load')
    await (await openTasks(other)).locator('.history-item').first().click()
    await expect(other.locator('.msg-user').first()).toContainText('Explain photosynthesis')
  }
  await context.close()
})

test('what takes up space: the tasks among the rest, each with its share', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  const settings = await openSettings(page, 'Your data')
  // Nothing is kept in a private window (Playwright's WebKit), so there is nothing to break down.
  if (await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)) {
    await expect(settings.getByText('What takes up space')).toHaveCount(0)
    return
  }
  await settings.getByText('What takes up space').click()
  const tasks = settings.locator('.parts li').filter({ hasText: 'Tasks' })
  await expect(tasks).toContainText(/\d (kB|MB)/)
  await expect(tasks.getByRole('meter', { name: 'Tasks' })).toHaveAttribute('value', /^0\.\d+/)
  await expect(settings.locator('.parts li').last()).toContainText('Everything else')
})

test('a file that isn’t a backup is refused, and nothing changes', async ({ page }) => {
  await start(page)
  page.on('dialog', (dialog) => dialog.accept())
  await (await openSettings(page, 'Your data')).locator('input[type="file"]').setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') })
  await expect(page.locator('.toast')).toContainText('This file isn’t a backup.')
})

test('an export of Gemini’s from Google Takeout comes in once, shared in the box or restored in Settings (D340)', async ({ page }) => {
  const dir = 'Takeout/My Activity/Gemini Apps/'
  const activity = (/** @type {Record<string, any>} */ fields) => ({ header: 'Gemini Apps', products: ['Gemini Apps'], activityControls: ['Gemini Apps Activity'], ...fields })
  const activities = [
    activity({ title: 'Prompted Summarise my notes', time: '2026-01-03T09:00:00Z', titleUrl: 'https://gemini.google.com/app/c2c2c2', attachedFiles: ['notes.txt'], safeHtmlItem: [{ html: '<p>Buy <strong>milk</strong>.</p>' }] }),
    activity({ title: 'Prompted Its name?', time: '2026-01-02T10:01:00Z', titleUrl: 'https://gemini.google.com/app/c1c1c1', safeHtmlItem: [{ html: '<p>Felix.</p>' }] }),
    activity({ title: 'Prompted Name a cat', time: '2026-01-02T10:00:00Z', titleUrl: 'https://gemini.google.com/app/c1c1c1', safeHtmlItem: [{ html: '<ul><li>Felix</li><li>Tom</li></ul>' }] }),
  ]
  const encoder = new TextEncoder()
  const zip = await writeZip([
    { name: `${dir}MyActivity.json`, bytes: encoder.encode(JSON.stringify(activities)) },
    { name: `${dir}notes.txt`, bytes: encoder.encode('Buy milk') },
    { name: 'Takeout/Gemini/gemini_gems_data.html', bytes: encoder.encode('<div><b>Name:</b>Chef<br><b>Custom instructions:</b>Cook with what I have.<br><br></div>') },
  ])
  const file = { name: 'takeout-20260103T000000Z-001.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) }
  await start(page)
  page.on('dialog', (dialog) => dialog.accept())
  await page.locator('.composer input[type="file"]').setInputFiles(file)
  await expect(page.locator('.toast')).toContainText('2 conversations brought in.')
  // Not shared with the next message.
  await expect(page.locator('.composer .attachment')).toHaveCount(0)
  const tasks = await openTasks(page)
  await tasks.locator('.history-item', { hasText: 'Summarise my notes' }).click()
  await expect(page.locator('.msg-user').first()).toContainText('Summarise my notes')
  await expect(page.locator('.msg-files').first()).toContainText('notes.txt')
  await expect(page.locator('.msg-jean .prose strong')).toHaveText('milk')
  // Its Gem is a project now, with its instructions.
  const chef = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const project = app.projects.value.find((candidate) => candidate.data.name === 'Chef')
    return project && app.fs.read(`${project.dir}/instructions.md`)
  })
  expect(chef).toContain('Cook with what I have.')

  // Again, from Settings: nothing new.
  await (await openSettings(page, 'Your data')).locator('input[type="file"]').setInputFiles(file)
  await expect(page.locator('.toast').last()).toContainText('0 conversations brought in.')
})
