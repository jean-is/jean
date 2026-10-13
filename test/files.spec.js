// Files (D24): a file shared in one task of a project is found by search_files from another, without
// being shared again; the passage comes with its page, and the answer cites it.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask } from './helpers.js'

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
})
