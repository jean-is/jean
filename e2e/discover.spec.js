// Discovery (0.3): the collection page lights up, "turn on everything" works, and the brain
// picker offers Auto, the connected brains and "never send to the cloud".
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain } from './helpers.js'

test('the house lights up as capabilities are turned on', async ({ page }) => {
  await start(page)
  await page.locator('.bar-actions button').first().click()
  const house = page.locator('app-collection dialog[open]')
  await expect(house).toBeVisible()
  const lit = house.locator('.room-card.is-lit')
  const before = await lit.count()
  await house.locator('.room-card:not(.is-lit) .button').first().click()
  await expect(lit).toHaveCount(before + 1)
  const warmth = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--warmth'))
  expect(Number(warmth)).toBeGreaterThan(0)
  await house.locator(':scope > .button.wide').click()
  await expect(house.locator('.room-card:not(.is-lit)')).toHaveCount(0)
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
