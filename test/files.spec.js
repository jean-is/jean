// Files (D24): a file shared in one task of a project is found by search_files from another, without
// being shared again; the passage comes with its page, and the answer cites it. Its index is kept (D306).
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, inkOf } from './helpers.js'

/** The answer on screen, once it has ended. @param {import('@playwright/test').Page} page */
const answer = (page) => page.locator('.msg-jean .prose').last()

test('search_files finds what a file shared in another task of the project says', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'Quarterly notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Opening remarks.\n\nRevenue grew 12% in Q3, led by the North region.') })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Summarize this')
  await expect(answer(page)).toContainText('Quarterly notes.txt')

  // A new task of the same project, with no file shared in it.
  await page.locator('.wordmark').click()
  await expect(page.locator('.hero-question')).toBeVisible()
  await ask(page, 'What do the files say about revenue?')
  await expect(answer(page)).toContainText('Revenue grew 12% in Q3')
  await expect(answer(page).locator('.cite')).toHaveCount(1)
  // The file's index is kept for the next visit (D306).
  const kept = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    return app.fs.list('.cache/words')
  })
  expect(kept.map((entry) => entry.name)).toEqual([expect.stringMatching(/^sha256-[0-9a-f]{64}\.idx$/)])
})

test('a scanned PDF, with no text, is shown to the brain as pictures of its pages (D479)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // One page in CCITT fax, as an office scanner writes it: pdf.js decodes it with its WebAssembly.
  const scan = readFileSync(new URL('./fixtures/scan.pdf', import.meta.url))
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'Invoice.pdf', mimeType: 'application/pdf', buffer: scan })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'What is the total?')
  // The page, as brains that can see take pictures: 1568 pixels on its long side.
  await expect(answer(page)).toContainText('I can see your picture: 1112 × 1568 pixels.', { timeout: 30_000 })
  // Drawn, in the preview as for the brain: some of the page is ink.
  await page.locator('.msg-files .file-chip').filter({ hasText: 'Invoice.pdf' }).click()
  await expect.poll(() => inkOf(page.locator('app-preview .view-pages canvas').first()), { timeout: 15_000 }).toBeGreaterThan(1000)
  const ink = await page.evaluate(async (bytes) => {
    const [picture] = await (await import('/caps/files/pictures.js')).pagesSeen(new Uint8Array(bytes), 1)
    const bitmap = await createImageBitmap(new Blob([picture.bytes]))
    const context = /** @type {OffscreenCanvasRenderingContext2D} */ (new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d'))
    context.drawImage(bitmap, 0, 0)
    return context.getImageData(0, 0, bitmap.width, bitmap.height).data.filter((value, i) => i % 4 === 0 && value < 128).length
  }, [...scan])
  expect(ink).toBeGreaterThan(10_000)
})
