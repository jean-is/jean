// Files (D24): a file shared in one task of a project is found by search_files from another, without
// being shared again; the passage comes with its page, and the answer cites it. Its index is kept (D306).
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, inkOf } from './helpers.js'

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
  // Its number, quoting it, opens the file it found there, though it wasn't shared in this task (D481).
  await answer(page).locator('button.cite').click()
  await expect(page.locator('app-preview .view-text')).toContainText('Revenue grew')
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get('cite') ?? [])].map((range) => range.toString()))).toEqual(['Revenue grew 12% in Q3, led by the North region'])
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

/**
 * Shares a file, unless it is shared already, and asks the fake brain to cite it at some words or an area (D481); the chip it cites by, once
 * its answer is written. @param {import('@playwright/test').Page} page @param {{ name: string, mimeType: string, buffer: Buffer } | null} file
 * @param {string} request @param {number} [count] the task's answers then
 */
async function cited(page, file, request, count = 1) {
  if (file) await page.locator('.composer input[type="file"]').setInputFiles(file)
  if (file) await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, request)
  await answered(page, count)
  return answer(page).locator('button.cite')
}

for (const lang of ['en', 'ar', 'ja']) {
  test(`a citation that quotes a text opens it at the words, lit, and one whose words aren’t there says so, in ${lang} (D481)`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    const chip = await cited(page, { name: 'Lease.txt', mimeType: 'text/plain', buffer: Buffer.from('The rent is payable on the 5th of each month.\nThe deposit is €800.') }, 'Quote “payable on the 5th”')
    await expect(chip).toHaveAttribute('title', '"payable on the 5th"')
    await chip.click()
    await expect(page.locator('app-preview .view-text')).toBeVisible()
    await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get('cite') ?? [])].map((range) => range.toString()))).toEqual(['payable on the 5th'])

    await (await cited(page, null, 'Quote “payable on the 6th”', 2)).click()
    await expect(page.locator('.toast')).toContainText({ en: 'Not in its source', ar: 'ليست في مصدرها', ja: '出典に記載なし' }[lang])
  })
}

test('a citation that quotes a PDF opens it at its page, the words outlined and the rest dimmed (D481)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const chip = await cited(page, { name: 'Compendium.pdf', mimeType: 'application/pdf', buffer: readFileSync(new URL('./fixtures/documents-xs.pdf', import.meta.url)) }, 'Quote “Termination requires prior written notice of 90 days”')
  await chip.click()
  // Page 3 of 14, the line it is on outlined, in view.
  const marked = page.locator('app-preview .view-pages > .view-marked')
  await expect(marked.locator('rect')).toHaveCount(1)
  expect(await marked.evaluate((box) => [...box.parentElement?.children ?? []].indexOf(box))).toBe(2)
  await expect(marked.locator('rect')).toBeInViewport()
  const [rect, page3] = await Promise.all([marked.locator('rect').boundingBox(), marked.boundingBox()])
  expect(rect && page3 && rect.width > page3.width / 4 && rect.width < page3.width && rect.height < page3.height / 20).toBe(true)
})

test('a citation that quotes a Word document opens it at the words, found by its viewer (D481)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const { makeFile } = await import('../app/caps/made/formats.js')
  const { bytes } = await makeFile('Lease.docx', `# Lease\n\n${'The parties agree to the terms below.\n\n'.repeat(60)}The rent is payable on the 5th of each month.`)
  const chip = await cited(page, { name: 'Lease.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(bytes) }, 'Quote “payable on the 5th of each month”')
  await chip.click()
  // The viewer's own find lights the words, the match it is on in its active colour.
  const lit = () => page.frameLocator('app-preview iframe').locator('main *').evaluateAll((all) => all.filter((element) => getComputedStyle(element).backgroundColor === 'rgba(255, 140, 0, 0.55)').length)
  await expect.poll(lit, { timeout: 20_000 }).toBeGreaterThan(0)
})

test('a citation that points at an area of a picture outlines it over the picture (D481)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const png = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(400, 300)
    const context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'))
    context.fillStyle = '#2a6'
    context.fillRect(0, 0, 400, 300)
    return [...new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())]
  })
  const chip = await cited(page, { name: 'Receipt.png', mimeType: 'image/png', buffer: Buffer.from(png) }, 'Point at 10,20,30,40')
  await expect(chip).toHaveAttribute('title', 'Receipt.png')
  await chip.click()
  const area = page.locator('app-preview .view-marked rect')
  await expect(area).toHaveAttribute('x', '10')
  await expect(area).toHaveAttribute('height', '40')
  const [box, picture] = await Promise.all([area.boundingBox(), page.locator('app-preview .view-marked img').boundingBox()])
  expect(box && picture && Math.round((100 * (box.x - picture.x)) / picture.width)).toBe(10)
})
