// Things Jean made (0.2): an answer copied as rich text, and its table downloaded as CSV the way
// this locale's spreadsheets read it.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask } from './helpers.js'

test.beforeEach(async ({ page }) => {
  // The clipboard is the browser's: record what reaches it.
  await page.addInitScript(() => {
    const seen = /** @type {any} */ (window)
    seen.copied = null
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
  await expect(made.locator('button')).toHaveCount(2)

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
})

test('in French, a table downloads with semicolons, as Excel reads it there', async ({ page }) => {
  await start(page, 'fr')
  const csv = await page.evaluate(async () => {
    const { toCSV } = await import('/caps/made/made.js')
    return toCSV([['Région', 'Total'], ['Nord', '2540,5']], 'fr')
  })
  expect(csv).toBe('﻿Région;Total\r\nNord;"2540,5"\r\n')
})

/** @param {import('@playwright/test').Download} download */
async function streamText(download) {
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}
