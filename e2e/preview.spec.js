// The preview (D126): a file Jean made or the user shared opens beside the conversation, as what
// it is. A web page shows with its style and runs its script, but nothing leaves, and with its
// code off in Settings the script never runs (D143); a Word document shows on a sheet and follows
// its new version; a spreadsheet is a grid, a PDF its drawn pages, a deck its slides. On a phone
// it covers the conversation; right to left, it sits on the left.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, SALES } from './helpers.js'
import { writeZip } from '../core/zip.js'

test('a web page Jean made shows in the preview and runs its script, which can send nothing away', async ({ page }) => {
  /** @type {string[]} */
  const leaks = []
  // What reached the leak address: Chromium also reports a picture's request that the policy then refuses.
  page.on('response', (response) => { if (response.url().includes('/leak')) leaks.push(response.url()) })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Make a web page for the bakery')
  const answer = page.locator('.msg-jean').last()
  await expect(answer.locator('.prose')).toContainText('Bakery.html is under this answer')
  await expect(answer.locator('app-file .file-meta')).toContainText('Web page')
  await answer.getByRole('button', { name: 'Open Bakery.html' }).click()
  const pane = page.locator('app-preview .preview')
  await expect(pane.locator('h2')).toHaveText('Bakery.html')
  const frame = page.frameLocator('.preview-frame')
  // Its style applies and its script runs, in standards mode; its fetch and its picture never leave.
  await expect(frame.locator('h1')).toHaveCSS('color', 'rgb(180, 70, 20)')
  await expect(frame.locator('#out')).toHaveText('Baked by a script CSS1Compat')
  // A link leads nowhere from here: the page stays. Nor can its script take it away.
  await frame.locator('#away').click()
  await page.waitForTimeout(800)
  await expect(frame.locator('h1')).toHaveText('Bakery')
  await frame.locator('#go').click()
  await page.waitForTimeout(800)
  expect(leaks).toEqual([])
  // Beside the conversation, the box still takes a message.
  await expect(page.locator('#prompt')).toBeEditable()
  // With its code off in Settings, the page shows again, and its script never runs (D143).
  const settings = await openSettings(page, 'Approvals')
  const code = settings.getByRole('switch', { name: 'Run its code' })
  await expect(code).toBeChecked()
  await expect(settings.getByRole('switch', { name: 'Send and receive over the internet' })).not.toBeChecked()
  await code.click()
  await expect(settings.getByRole('switch', { name: 'Send and receive over the internet' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(frame.locator('h1')).toHaveCSS('color', 'rgb(180, 70, 20)')
  await expect(frame.locator('#out')).toHaveText('Waiting')
  expect(leaks).toEqual([])
  await pane.getByRole('button', { name: 'Close' }).click()
  await expect(pane).toHaveCount(0)
})

test('the sites a page’s code may reach: any by default, each one added with Enter (D143)', async ({ page }) => {
  /** @type {string[]} */
  const reached = []
  page.on('response', (response) => { if (response.url().includes('/leak')) reached.push(response.url()) })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Make a web page for the bakery')
  await page.locator('.msg-jean').last().getByRole('button', { name: 'Open Bakery.html' }).click()
  const policy = page.frameLocator('.preview-frame').locator('meta[http-equiv="Content-Security-Policy"]').first()
  await expect(policy).toHaveAttribute('content', /connect-src 'none';/)
  const settings = await openSettings(page, 'Approvals')
  await settings.getByRole('switch', { name: 'Send and receive over the internet' }).click()
  const sites = settings.getByRole('list', { name: 'Sites its code may reach' })
  await expect(sites.getByRole('listitem')).toHaveText(['*'])
  await expect(sites.getByRole('button')).toHaveCount(0)
  // Only Enter adds, and only a site.
  const field = settings.getByRole('textbox', { name: 'Add a site' })
  await field.fill('not a site')
  await field.press('Enter')
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(sites.getByRole('listitem')).toHaveText(['*'])
  await field.fill('https://API.example.com/v1')
  await expect(field).not.toHaveAttribute('aria-invalid')
  await field.press('Tab')
  await expect(sites.getByRole('listitem')).toHaveText(['*'])
  await field.press('Shift+Tab')
  await field.press('Enter')
  await expect(field).toHaveValue('')
  // The first site named takes the place of any; the next ones join it, inline.
  await expect(sites.getByRole('listitem')).toHaveText(['api.example.com'])
  for (const typed of ['*.com', 'localhost:*']) {
    await field.fill(typed)
    await field.press('Enter')
  }
  await expect(sites.getByRole('listitem')).toHaveText(['api.example.com', '*.com', 'localhost:*'])
  await expect(policy).toHaveAttribute('content', /connect-src https:\/\/api\.example\.com https:\/\/\*\.com http:\/\/localhost:\*;/)
  await sites.getByRole('button', { name: 'Remove api.example.com' }).click()
  await expect(field).toBeFocused()
  await expect(sites.getByRole('listitem')).toHaveText(['*.com', 'localhost:*'])
  // A server on this computer, by its port: the page's own fetch reaches it now, and nothing else does.
  expect(reached).toEqual([])
  await field.fill('127.0.0.1:4182')
  await field.press('Enter')
  await expect(policy).toHaveAttribute('content', /connect-src https:\/\/\*\.com http:\/\/localhost:\* http:\/\/127\.0\.0\.1:4182;/)
  await expect.poll(() => reached).toEqual(['http://127.0.0.1:4182/leak?fetch'])
  for (const name of ['*.com', 'localhost:*', '127.0.0.1:4182']) await sites.getByRole('button', { name: `Remove ${name}` }).click()
  await expect(sites.getByRole('listitem')).toHaveText(['*'])
  await expect(policy).toHaveAttribute('content', /connect-src https:;/)
})

test('a Word document on a sheet, following its new version, saved from the preview', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Write the bakery plan as a Word document')
  const first = page.locator('.msg-jean').first()
  await expect(first.locator('app-file')).toHaveCount(1)
  // The card says what the file is, and opens it.
  await expect(first.locator('app-file .file-meta')).toContainText('Word document')
  await first.getByRole('button', { name: 'Open Bakery plan.docx' }).click()
  const sheet = page.locator('.preview .preview-sheet')
  // Its headings sit under the preview's own, the file's name.
  await expect(sheet.getByRole('heading', { name: 'Bakery plan' })).toBeVisible()
  await expect(sheet.locator('table')).toContainText('Saturday')
  // Beside the conversation, the box still takes the next message.
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  await ask(page, 'Add a step to it')
  await expect(sheet).toContainText('Sell the rest')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.preview').getByRole('button', { name: 'Save Bakery plan.docx' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('Bakery plan.docx')
})

test('shared files open in the preview: a table as a grid, a PDF drawn, a deck as slides', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.locator('.composer input[type="file"]').setInputFiles([
    { name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(SALES) },
    { name: 'menu.pdf', mimeType: 'application/pdf', buffer: pdf('Croissant 2 euros') },
    { name: 'pitch.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: await deck(['Our bakery', 'Fresh every morning']) },
  ])
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(3)
  await ask(page, 'Here are my files')
  const chips = page.locator('.msg-files .file-chip')
  const pane = page.locator('app-preview .preview')

  await chips.filter({ hasText: 'sales.csv' }).click()
  const grid = pane.locator('.preview-grid table')
  await expect(grid.locator('thead th')).toHaveText(['', 'A', 'B', 'C'])
  await expect(grid.locator('tbody tr').nth(1)).toContainText('North')
  await expect(grid.locator('td.number').first()).toHaveText('1200')

  await chips.filter({ hasText: 'menu.pdf' }).click()
  await expect(pane.locator('h2')).toHaveText('menu.pdf')
  // Drawn, not only laid out: some of the page is ink.
  await expect.poll(() => pane.locator('.preview-pages canvas').first().evaluate((canvas) => {
    const { width, height } = /** @type {HTMLCanvasElement} */ (canvas)
    if (!width) return 0
    const { data } = /** @type {CanvasRenderingContext2D} */ (/** @type {HTMLCanvasElement} */ (canvas).getContext('2d')).getImageData(0, 0, width, height)
    let ink = 0
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] && data[i] < 128) ink++
    return ink
  }), { timeout: 15_000 }).toBeGreaterThan(50)

  await chips.filter({ hasText: 'pitch.pptx' }).click()
  await expect(pane.locator('.preview-slides li')).toHaveCount(2)
  await expect(pane.locator('.preview-slides li h3').first()).toHaveText('Our bakery')
})

test('on a phone the preview covers the conversation; Escape gives it back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await start(page)
  await connectFakeBrain(page)
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(SALES) })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Here is my table')
  // From the keyboard, so focus has somewhere to come back to (Safari doesn't focus a clicked button).
  const chip = page.locator('.msg-files .file-chip')
  await chip.focus()
  await page.keyboard.press('Enter')
  const pane = page.locator('app-preview .preview')
  await expect(pane.locator('.preview-grid')).toBeVisible()
  expect((await pane.boundingBox())?.width).toBe(390)
  await expect(page.locator('app-shell')).toHaveJSProperty('inert', true)
  await page.keyboard.press('Escape')
  await expect(pane).toHaveCount(0)
  await expect(page.locator('app-shell')).toHaveJSProperty('inert', false)
  await expect(chip).toBeFocused()
})

test('right to left, the preview opens on the left of the conversation', async ({ page }) => {
  await start(page, 'ar')
  await connectFakeBrain(page)
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(SALES) })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Here is my table')
  await page.locator('.msg-files .file-chip').click()
  const box = await page.locator('app-preview .preview').boundingBox()
  expect(box?.x).toBe(0)
  expect((await page.locator('main').boundingBox())?.x).toBeGreaterThan(box?.width ?? 0)
})

/** A one-page PDF in Helvetica, one of the standard fonts. @param {string} text */
function pdf(text) {
  const stream = `BT /F1 24 Tf 20 90 Td (${text}) Tj ET`
  return Buffer.from(`%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>> endobj
4 0 obj <</Length ${stream.length}>> stream
${stream}
endstream endobj
5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
trailer <</Root 1 0 R>>
%%EOF`)
}

/** A deck of one-line slides, as PowerPoint keeps them. @param {string[]} titles */
async function deck(titles) {
  const slide = (/** @type {string} */ title) => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>Made with flour</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
  return Buffer.from(await writeZip(titles.map((title, i) => ({ name: `ppt/slides/slide${i + 1}.xml`, bytes: new TextEncoder().encode(slide(title)) }))))
}
