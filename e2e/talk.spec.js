// Talk (0.1) and reply suggestions (0.3): an answer streams in, its follow-ups become
// buttons, the room flips to right-to-left in Arabic, and from dark to light.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask } from './helpers.js'

test('an answer, then its follow-ups as buttons', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Here is what I found')
  await expect(answer).not.toContainText('suggestions')
  const followUps = page.locator('.follow-ups .follow-up')
  await expect(followUps).toHaveCount(3)
  await followUps.first().click()
  await expect(page.locator('.msg-user')).toHaveCount(2)
  await expect(page.locator('.msg-user').last()).toHaveText('Show it as a chart')
})

test('Arabic: right to left, and the answer in Arabic', async ({ page }) => {
  await start(page, 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await connectFakeBrain(page)
  await ask(page, 'ما هي عاصمة فرنسا؟')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('إليك ما وجدته')
  await expect(page.locator('.follow-ups .follow-up').first()).toHaveText('اعرضه كرسم بياني')
})

test('light or dark: the device’s, until the user picks the other', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await start(page)
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await pickTheme(page, 'Light')
  await expect(root).toHaveAttribute('data-theme', 'light')
  // Remembered on this device, and applied before any module runs: no flash of the night.
  await page.route('**/ui/app.js', (route) => route.abort())
  await page.reload()
  await expect(root).toHaveAttribute('data-theme', 'light')
  await page.unroute('**/ui/app.js')
  await page.reload()
  // Picking what the device shows follows the device again.
  await pickTheme(page, 'Dark')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(root).toHaveAttribute('data-theme', 'light')
})

/** Light or dark is picked in Settings. @param {import('@playwright/test').Page} page @param {string} name */
async function pickTheme(page, name) {
  await page.locator('.bar-actions button[aria-label="Settings"]').click()
  await page.locator('app-settings dialog[open]').getByRole('radio', { name, exact: true }).check()
  await page.keyboard.press('Escape')
}
