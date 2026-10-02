// Looks (D111): Mail keeps the conversations in view, in one sidebar with the name at its top and
// Settings at its foot (D115), and is back before the first paint; the user's own CSS shows as it
// is typed; right to left, the sidebar changes sides.
import { test, expect } from '@playwright/test'
import { start, openSettings } from './helpers.js'

test.use({ viewport: { width: 1280, height: 800 } })

/** What settings.json holds for the look, once written. @param {import('@playwright/test').Page} page */
const savedLook = (page) => page.evaluate(async () => JSON.parse(await (await import('/ui/state.js')).app.fs.read('settings.json') ?? '{}').look)

test('Mail lists the conversations beside the open one, with the user’s touches, after a reload too', async ({ page }) => {
  await start(page)
  const settings = await openSettings(page, 'Appearance')
  await settings.locator('.look', { hasText: 'Mail' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-look', 'mail')
  await expect(page.locator('.inbox')).toBeVisible()
  await expect(page.locator('.inbox .sidebar-settings')).toBeVisible()
  await settings.locator('details.other summary').click()
  await settings.locator('.look-css').fill('.hero-question { outline: 3px solid rgb(255, 0, 0); }')
  await expect(page.locator('.hero-question')).toHaveCSS('outline-color', 'rgb(255, 0, 0)')
  await expect.poll(() => savedLook(page)).toMatchObject({ id: 'mail', css: expect.stringContaining('outline') })
  // Playwright's WebKit has no lasting storage (like a private window): the reload starts empty.
  if (await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)) return
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-look', 'mail')
  await expect(page.locator('.inbox')).toBeVisible()
  await expect(page.locator('.hero-question')).toHaveCSS('outline-color', 'rgb(255, 0, 0)')
})

test('right to left, Mail’s sidebar sits on the right, the name at its top', async ({ page }) => {
  await start(page, 'ar')
  await page.evaluate(async () => (await import('/ui/state.js')).setLook({ id: 'mail' }))
  await expect(page.locator('.inbox')).toBeVisible()
  const list = await page.locator('.inbox').boundingBox()
  const top = await page.locator('.bar').boundingBox()
  expect(list?.x).toBeGreaterThan(640)
  expect(top?.x).toBe(list?.x)
  expect(top?.y).toBeLessThan(list?.y ?? 0)
})
