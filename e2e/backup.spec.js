// Backup (0.2): everything Jean keeps in one zip, keys left out, restored on another device
// (here, a fresh browser context) without deleting anything that was already there.
import { test, expect } from '@playwright/test'
import { readZip } from '../core/zip.js'
import { start, connectFakeBrain, ask, openSettings } from './helpers.js'

test('a backup holds the conversations but no key, and restores on a fresh device', async ({ page, browser }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  // A key, as the brain dialog would keep it: never part of a backup.
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
    await other.locator('.bar button[aria-label="Conversations"]').click()
    await other.locator('app-history .history-item').first().click()
    await expect(other.locator('.msg-user').first()).toContainText('Explain photosynthesis')
  }
  await context.close()
})

test('a file that isn’t a backup is refused, and nothing changes', async ({ page }) => {
  await start(page)
  page.on('dialog', (dialog) => dialog.accept())
  await (await openSettings(page, 'Your data')).locator('input[type="file"]').setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') })
  await expect(page.locator('.toast')).toContainText('This file isn’t a backup.')
})
