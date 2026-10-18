// Things Jean made (0.2): an answer copied as rich text, its table downloaded as CSV the way this
// locale's spreadsheets read it, printed alone and shared (D404). Files the brain writes (D119): a
// Word document from the first message on, changed in place, and a spreadsheet written from a script.
import { test, expect } from '@playwright/test'
import { readZip } from '../app/core/zip.js'
import { start, connectFakeBrain, ask, turnOn, SALES } from './helpers.js'
import { extractPages } from '../app/caps/files/extract.js'

test.beforeEach(async ({ page }) => {
  // The clipboard, the printer and the share sheet are the browser's: record what reaches them.
  await page.addInitScript(() => {
    const seen = /** @type {any} */ (window)
    seen.copied = null
    seen.printed = null
    seen.shared = null
    seen.print = () => { seen.printed = document.querySelectorAll('.no-print').length }
    Object.defineProperty(navigator, 'share', { value: async (/** @type {ShareData} */ data) => { seen.shared = data } })
    Object.defineProperty(navigator.clipboard, 'write', {
      value: async (/** @type {ClipboardItem[]} */ items) => {
        const item = items[0]
        seen.copied = Object.fromEntries(await Promise.all(item.types.map(async (type) => [type, await (await item.getType(type)).text()])))
      },
    })
  })
})

test('an answer copied with its formatting, and its table as CSV', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  const answer = page.locator('.msg-jean').last()
  await expect(answer.locator('.prose')).toContainText('Anything else?')
  const made = answer.locator('app-made')
  await expect(made.locator('button')).toHaveCount(4)

  await made.getByRole('button', { name: 'Copy' }).click()
  await expect(page.locator('.toast')).toContainText('Copied')
  const copied = await page.evaluate(() => /** @type {any} */ (window).copied)
  expect(copied['text/html']).toContain('<strong>carefully</strong>')
  expect(copied['text/html']).toContain('<table>')
  expect(copied['text/html']).not.toContain('<!--')
  expect(copied['text/plain']).toContain('| Read | done |')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    made.getByRole('button', { name: 'Download as a spreadsheet (CSV)' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('Table 1.csv')
  const csv = await streamText(download)
  expect(csv).toBe('﻿Step,Status\r\nRead,done\r\nAnswer,done\r\n')

  // Printed alone: on paper, the answer after the mark, without its request or the task's title, until the print dialog closes.
  // Printing says light, as Chromium's does, and a dark screen stays dark.
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.evaluate(() => {
    const seen = /** @type {any} */ (window)
    seen.themes = []
    new MutationObserver(() => seen.themes.push(document.documentElement.dataset.theme)).observe(document.documentElement, { attributeFilter: ['data-theme'] })
  })
  await made.getByRole('button', { name: 'Print' }).click()
  expect(await page.evaluate(() => /** @type {any} */ (window).printed)).toBeGreaterThan(0)
  await page.emulateMedia({ media: 'print', colorScheme: 'light' })
  await expect(answer).toBeVisible()
  await expect(page.locator('.msg-user')).toBeHidden()
  await expect(page.locator('.conversation-title')).toBeHidden()
  await expect(page.locator('.print-mark')).toBeVisible()
  await page.evaluate(() => dispatchEvent(new Event('afterprint')))
  await expect(page.locator('.no-print')).toHaveCount(0)
  await expect(page.locator('.msg-user')).toBeVisible()
  await page.emulateMedia({ media: 'screen', colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => /** @type {any} */ (window).themes)).not.toContain('light')

  // Shared through the system's sheet, as Copy's text, with the task's title.
  await made.getByRole('button', { name: 'Share', exact: true }).click()
  const shared = await page.evaluate(() => /** @type {any} */ (window).shared)
  expect(shared.text).toContain('| Read | done |')
  expect(shared.title).toBeTruthy()
})

test('in French, a table downloads with semicolons, as Excel reads it there', async ({ page }) => {
  await start(page, 'fr')
  const csv = await page.evaluate(async () => {
    const { toCSV } = await import('/caps/made/made.js')
    return toCSV([['Région', 'Total'], ['Nord', '2540,5']], 'fr')
  })
  expect(csv).toBe('﻿Région;Total\r\nNord;"2540,5"\r\n')
})

test('a Word document from the first message, saved, then changed', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Write the bakery plan as a Word document')
  const first = page.locator('.msg-jean').first()
  await expect(first.locator('.prose')).toContainText('Bakery plan.docx is under this answer')
  await expect(first.locator('app-file')).toHaveCount(1)
  await first.locator('.activity > summary').click()
  await expect(first.locator('.activity-list')).toContainText('Create Bakery plan.docx')
  const plan = await saved(page, first, 'Save Bakery plan.docx')
  expect(plan.name).toBe('Bakery plan.docx')
  expect(plan.text).toContain('# Bakery plan\nBake 120 croissants\nDeliver them\n| Day | Croissants |\n| Saturday | 120 |')
  // It says a trained model made it, in its document properties (D324).
  const custom = readZip(new Uint8Array(plan.bytes)).find((entry) => entry.name === 'docProps/custom.xml')
  expect(new TextDecoder().decode(await custom?.read())).toContain('name="DigitalSourceType"><vt:lpwstr>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</vt:lpwstr>')

  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  await ask(page, 'Add a step to it')
  const second = page.locator('.msg-jean').nth(1)
  await expect(second.locator('.prose')).toContainText('Bakery plan.docx is under this answer')
  expect((await saved(page, second, 'Save Bakery plan.docx')).text).toContain('Deliver them\nSell the rest')
  // The first answer keeps the version it made, and each card says which it is (D164).
  expect((await saved(page, first, 'Save Bakery plan.docx')).text).not.toContain('Sell the rest')
  await expect(first.locator('app-file .file-meta')).toContainText('Version 1')
  await expect(second.locator('app-file .file-meta')).toContainText('Version 2')
  await first.getByRole('button', { name: 'Open Bakery plan.docx' }).click()
  await expect(page.locator('app-preview').getByRole('combobox', { name: 'Versions' }).locator('option:checked')).toHaveText('Version 1')
  const drawn = page.frameLocator('app-preview iframe').locator('main')
  await expect(drawn).toContainText('Deliver them', { timeout: 15_000 })
  await expect(drawn).not.toContainText('Sell the rest')
})

test('a spreadsheet written by a script, with exact totals', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer')
  await page.keyboard.press('Escape')
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(SALES) })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Make the totals by region a spreadsheet')
  const answer = page.locator('.msg-jean').last()
  // The sandbox starts first: as in computer.spec.js, that can take a while on a busy machine.
  await expect(answer.locator('.prose')).toContainText('2540', { timeout: 30_000 })
  const totals = await saved(page, answer, 'Save Totals.xlsx')
  expect(totals.text).toBe('Sheet: Totals\nregion\tsales\nNorth\t2540\nSouth\t1960\nEast\t1515')
  // The script's write shows under the calculation.
  await answer.locator('.activity > summary').click()
  await expect(answer.locator('.activity-list li.is-nested')).toContainText(['Create Totals.xlsx'])
})

/**
 * Saves a file from under an answer, and reads it back as Jean reads a shared file.
 * @param {import('@playwright/test').Page} page @param {import('@playwright/test').Locator} answer @param {string} button
 */
async function saved(page, answer, button) {
  const [download] = await Promise.all([page.waitForEvent('download'), answer.getByRole('button', { name: button }).click()])
  const name = download.suggestedFilename()
  const bytes = await streamBytes(download)
  return { name, bytes, text: (await extractPages(name, new Uint8Array(bytes)) ?? []).join('\n') }
}

/** @param {import('@playwright/test').Download} download */
async function streamBytes(download) {
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/** @param {import('@playwright/test').Download} download */
async function streamText(download) {
  return (await streamBytes(download)).toString('utf8')
}
