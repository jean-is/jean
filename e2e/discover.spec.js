// Discovery (0.3): the house lights up (Settings' Capabilities), "turn on everything" works, and
// the brain picker offers Auto, the connected brains and "never send to the cloud".
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, openSettings } from './helpers.js'

test('the house lights up as capabilities are turned on', async ({ page }) => {
  await start(page)
  const house = (await openSettings(page, 'Capabilities')).locator('.house')
  await expect(house).toBeVisible()
  await expect(page.locator('app-settings [aria-current="page"]')).toHaveText('Capabilities')
  // A case of trophies (D127): the plaque shows the next one to find, and how.
  await expect(house.locator('.trophy:not(.is-lit)').first()).toHaveAttribute('aria-pressed', 'true')
  await expect(house.locator('.plaque-how')).toContainText('How to find it')
  const lit = house.locator('.trophy.is-lit')
  const before = await lit.count()
  await house.locator('.plaque .button').click()
  await expect(lit).toHaveCount(before + 1)
  await expect(house.locator('.house-ring .is-lit')).toHaveCount(before + 1)
  const warmth = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--warmth'))
  expect(Number(warmth)).toBeGreaterThan(0)
  await house.locator(':scope > .button.wide').click()
  await expect(house.locator('.trophy:not(.is-lit)')).toHaveCount(0)
  await expect(house.locator('.house-rank')).toHaveText('Daylight')
})

test('the picker: Auto by default, a brain by hand, never the cloud', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await expect(page.locator('.brain-chip')).toContainText('Auto')
  await page.locator('.brain-chip').click()
  const picker = page.locator('app-picker dialog[open]')
  await expect(picker.locator('.choice-option.is-selected')).toContainText('Auto')
  await picker.locator('.toggle input').check()
  await picker.locator('.choice-option').nth(1).click()
  await expect(picker).toBeHidden()
  await expect(page.locator('.brain-chip')).toContainText('fake-brain-1')
  const settings = await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value)
  expect(settings.auto).toBe(false)
  expect(settings.cloud).toBe(false)
})
