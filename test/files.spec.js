// Files (D24): a file shared in one task of a project is found by search_files from another, without
// being shared again; the passage comes with its page, and the answer cites it. Its index is kept (D306).
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, inkOf, pdf } from './helpers.js'
import { numbersFile } from './fixtures/numbers.js'

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
  // Written to its end, so nothing moves its number under the click.
  await answered(page)
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

test('a Numbers spreadsheet is read, its rows found by search_files and its text shown beside the task', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'Plan.numbers', mimeType: 'application/x-iwork-numbers-sffnumbers', buffer: Buffer.from(await numbersFile()) })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'What do the files say about rent?')
  await expect(answer(page)).toContainText('Rent 1200.5 2026-01-15')
  await answer(page).locator('button.cite').click()
  await expect(page.locator('app-preview .view-text')).toContainText('Sheet: Budget 2026, table: Costs')
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

test('words selected in a PDF beside the task are highlighted, kept, noted and pointed at with Ask Jean, which the brain hears of with the next message (D690)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'menu.pdf', mimeType: 'application/pdf', buffer: pdf('Croissant 2 euros') })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Here is the menu')
  await answered(page)
  const open = async () => {
    await page.locator('.msg-files .file-chip').filter({ hasText: 'menu.pdf' }).click()
    await expect(page.locator('app-preview .view-words span').first()).toHaveText('Croissant 2 euros')
  }
  await open()
  const words = page.locator('app-preview .view-words span').first(), bar = page.getByRole('toolbar', { name: 'Selected words' })
  const lit = (/** @type {string} */ name) => page.evaluate((one) => [...(CSS.highlights.get(one) ?? [])].map((range) => range.toString()), name)

  // Its words, laid over the page, selected: a bar offers Highlight, Note and Ask Jean.
  await words.click({ clickCount: 3 })
  await expect(bar.getByRole('button')).toHaveText(['Highlight', 'Note', 'Ask Jean'])
  await bar.getByRole('button', { name: 'Highlight' }).click()
  await expect(bar).toBeHidden()
  await expect.poll(() => lit('mark')).toEqual(['Croissant 2 euros'])
  // A file of its own in the project, found again when the file opens again.
  const kept = () => page.evaluate(async () => { const { app } = await import('/ui/state.js'); const dirs = await app.fs.list(`${app.projectDir}/marks`).catch(() => []); return (await Promise.all(dirs.map(async ({ name }) => Promise.all((await app.fs.list(`${app.projectDir}/marks/${name}`)).map(async (file) => JSON.parse((await app.fs.read(`${app.projectDir}/marks/${name}/${file.name}`)) ?? '{}')))))).flat() })
  await expect.poll(async () => (await kept()).map(({ kind, page: n, words: said, author }) => [kind, n, said, author])).toEqual([['mark', 1, 'Croissant 2 euros', 'user']])
  await page.locator('app-preview').getByRole('button', { name: 'Close' }).first().click()
  await expect.poll(() => lit('mark')).toEqual([])
  await open()
  await expect.poll(() => lit('mark')).toEqual(['Croissant 2 euros'])

  // Pressed again, it offers its note and Remove; a note is kept with it, said on the bar, underlined.
  await words.click()
  await expect(bar.getByRole('button')).toHaveText(['Note', 'Remove', 'Ask Jean'])
  await bar.getByRole('button', { name: 'Note' }).click()
  await bar.getByLabel('Note').fill('Cheapest pastry')
  await bar.getByLabel('Note').press('Enter')
  await expect.poll(() => lit('noted')).toEqual(['Croissant 2 euros'])
  await expect.poll(async () => (await kept())[0]?.note).toBe('Cheapest pastry')
  await words.click()
  await expect(bar).toContainText('Cheapest pastry')

  // Ask Jean: the brain hears of the words and the note with the next message, and a toast says so.
  await bar.getByRole('button', { name: 'Ask Jean' }).click()
  await expect(page.locator('.toast')).toContainText('Pointing at “Croissant 2 euros”')
  await expect(page.locator('#prompt')).toBeFocused()
  await ask(page, 'Is it a good price?')
  await answered(page, 2)
  await expect(answer(page)).toContainText('You point at “Croissant 2 euros” in menu.pdf, noted “Cheapest pastry”.')

  // Removed, it is neither lit nor kept.
  await words.click()
  await bar.getByRole('button', { name: 'Remove' }).click()
  await expect.poll(() => lit('mark')).toEqual([])
  await expect.poll(kept).toEqual([])
})

for (const [lang, said, highlight] of /** @type {const} */ ([['ar', 'قائمة الحلويات: كرواسون بيورو', 'تمييز'], ['ja', 'お菓子の一覧: クロワッサンは二ユーロ', 'ハイライト']])) {
  test(`words selected in a text file are highlighted in its view, in ${lang}`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    await page.locator('.composer input[type="file"]').setInputFiles({ name: 'menu.txt', mimeType: 'text/plain', buffer: Buffer.from(said) })
    await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
    await ask(page, 'Here is the menu')
    await answered(page)
    await page.locator('.msg-files .file-chip').filter({ hasText: 'menu.txt' }).click()
    await page.locator('app-preview .view-text').click({ clickCount: 3 })
    const bar = page.locator('.marks-bar:popover-open')
    await expect(bar.locator('ul')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    await bar.getByRole('button', { name: highlight }).click()
    await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get('mark') ?? [])].map((range) => range.toString().trim()))).toEqual([said])
  })
}

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
  // Under its mark, the picture itself, small, the area boxed (D715).
  await expect(page.locator('.msg-jean app-pointed rect')).toHaveAttribute('x', '10')
  await chip.click()
  const area = page.locator('app-preview .view-marked rect')
  await expect(area).toHaveAttribute('x', '10')
  await expect(area).toHaveAttribute('height', '40')
  const [box, picture] = await Promise.all([area.boundingBox(), page.locator('app-preview .view-marked img').boundingBox()])
  expect(box && picture && Math.round((100 * (box.x - picture.x)) / picture.width)).toBe(10)
})

/** A WAV of quiet, 16-bit mono at 16 kHz. @param {number} seconds */
const wav = (seconds) => {
  const samples = seconds * 16_000, out = Buffer.alloc(44 + samples * 2)
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples * 2, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22)
  out.writeUInt32LE(16_000, 24); out.writeUInt32LE(32_000, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) out.writeInt16LE(Math.round(Math.sin(i / 7) * (i % 16_000 < 12_000 ? 2000 : 10)), 44 + i * 2)
  return out
}

test('a recording shared is heard on the device, its windows written with when each starts (D713)', async ({ page }) => {
  // Dictation's writer, faked: each window says the same sentence.
  await page.route('**/caps/voice/whisper-worker.js', (route) => route.fulfill({ contentType: 'text/javascript',
    body: "self.onmessage = ({ data: { id, type } }) => self.postMessage(type === 'transcribe' ? { id, type: 'result', text: 'Welcome to the quarterly review.' } : { id, type: 'ready' })" }))
  await start(page)
  await connectFakeBrain(page)
  // Its download is asked first.
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'Review.wav', mimeType: 'audio/wav', buffer: wav(45) })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  const pages = await page.evaluate(async () => (await import('/ui/state.js')).app.attachments.value[0].pages ?? [])
  expect(pages.join('\n')).toMatch(/^\[0:00\] Welcome to the quarterly review\.\n\[0:2\d\] Welcome to the quarterly review\.$/)
  await ask(page, 'Summarize this')
  await expect(answer(page)).toContainText('Review.wav')
})

test('drawn over a picture, or chosen with the keyboard in thirds, an area goes to the brain with the next message (D715)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const png = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(400, 300)
    const context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'))
    context.fillStyle = '#2a6'
    context.fillRect(0, 0, 400, 300)
    return [...new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())]
  })
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'Screen.png', mimeType: 'image/png', buffer: Buffer.from(png) })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Here is my screen')
  await answered(page)
  await page.locator('.msg-files').getByRole('button', { name: 'Screen.png' }).first().click()
  const box = page.getByRole('group', { name: 'Point at a part: drag over the picture, or use the arrow keys' })
  await box.locator('img').scrollIntoViewIfNeeded()
  const picture = await box.locator('img').boundingBox()
  if (!picture) throw new Error('no picture')
  await page.mouse.move(picture.x + picture.width * 0.1, picture.y + picture.height * 0.1)
  await page.mouse.down()
  // Pressed, the pane stays (D640), its head over it: the picture moves, and the drag goes on over it as it is now.
  const now = (await box.locator('img').boundingBox()) ?? picture
  await page.mouse.move(now.x + now.width * 0.5, now.y + now.height * 0.3, { steps: 4 })
  await page.mouse.up()
  await box.getByRole('button', { name: 'Ask Jean' }).click()
  await ask(page, 'What is this button?')
  await answered(page, 2)
  const said = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value.records.map((record) => record.update?.text ?? '').find((text) => text.includes('points at an area')))
  expect(said).toMatch(/40% wide and 20% high, 10% from its left and 10% from its top\. Cite it as \[n: 10,10,40,20\]/)
  // The keyboard: the middle third, a third to the right, then Enter.
  await page.locator('.msg-files').getByRole('button', { name: 'Screen.png' }).first().click()
  await box.focus()
  await box.press('ArrowRight')
  await box.press('ArrowRight')
  await expect(box.locator('rect')).toHaveAttribute('x', /^66\.6/)
  await box.press('Enter')
  await expect(page.locator('.toast')).toContainText('Screen.png')
})
