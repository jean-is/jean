// Memory, projects and routines (0.4), the version's done-when: two projects keep separate
// memories, and a routine is created from repeated requests. Plus "What Jean knows about you".
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask } from './helpers.js'

/** Turns a capability on from the house. @param {import('@playwright/test').Page} page @param {string} name */
async function turnOn(page, name) {
  await page.locator('.bar-actions button').first().click()
  const house = page.locator('app-collection dialog[open]')
  await house.locator('.room-card', { hasText: name }).locator('.button').click()
}

/** @param {import('@playwright/test').Page} page @param {string} name */
async function createProject(page, name) {
  const dialog = page.locator('app-project-dialog dialog[open]')
  await expect(dialog).toBeVisible()
  await dialog.locator('input[name="name"]').fill(name)
  await dialog.locator('.swatch').nth(4).click()
  await dialog.locator('.button.primary').click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.wordmark-project')).toHaveText(name)
}

/** @param {import('@playwright/test').Page} page */
async function openKnows(page) {
  await page.locator('.bar-actions button').last().click()
  await page.locator('app-settings dialog[open] .button', { hasText: 'Open' }).first().click()
  const knows = page.locator('app-knows dialog[open]')
  await expect(knows).toBeVisible()
  return knows
}

test('two projects keep separate memories, each in its own light', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Memory')
  await page.keyboard.press('Escape')
  await turnOn(page, 'Projects')
  await createProject(page, 'Bakery')
  await expect(page).toHaveURL(/#\/p\/[0-9A-Z]{26}\/$/)
  const tint = await page.evaluate(() => document.documentElement.style.getPropertyValue('--tint'))
  expect(tint).toContain('255')

  await ask(page, 'Remember: the bakery opens at 7')
  await expect(page.locator('.toast')).toContainText('Remembered: the bakery opens at 7')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Noted.')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()

  // Another project knows nothing of it.
  await page.locator('.bar-actions button').nth(1).click()
  await page.locator('app-history .projects .button').click()
  await createProject(page, 'Garden')
  await ask(page, 'What do you know?')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Nothing yet.')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  const garden = await openKnows(page)
  await expect(garden).not.toContainText('opens at 7')
  await page.keyboard.press('Escape')

  // Back in the bakery, it is there, on the page and in the brain's context.
  await page.locator('.bar-actions button').nth(1).click()
  await page.locator('app-history .project', { hasText: 'Bakery' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.wordmark-project')).toHaveText('Bakery')
  await ask(page, 'What do you know?')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('the bakery opens at 7')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  const bakery = await openKnows(page)
  await expect(bakery.locator('.noticed-text')).toHaveValue('the bakery opens at 7')

  // An instruction, written by the user, goes into the next conversation's prompt.
  await bakery.locator('textarea').first().fill('Answer in short sentences.')
  await bakery.locator('textarea').first().blur()
  await expect(page.locator('.toast')).toContainText('Saved')
  await page.keyboard.press('Escape')
  await page.locator('.wordmark').click()
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const system = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system)
  expect(system).toContain('<project>\nBakery\n</project>')
  expect(system).toContain('<instructions>\nAnswer in short sentences.\n</instructions>')
  expect(system).toContain('<memory>\n- the bakery opens at 7\n</memory>')
})

test('the third request of a kind becomes a routine', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  for (let i = 0; i < 3; i++) {
    await page.locator('.wordmark').click()
    await ask(page, i === 1 ? 'Please summarize the weekly sales by region' : 'Summarize the weekly sales by region')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
    await expect(page.locator('.follow-ups')).toBeVisible()
  }
  // Offered above the box; accepting turns routines on and asks for this one.
  const offer = page.locator('aside.offer')
  await expect(offer).toContainText('third time')
  await offer.locator('.button.primary').click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('it is a routine now')
  await expect(page.locator('.toast')).toContainText('Saved the routine “Weekly sales summary”')

  const knows = await openKnows(page)
  await expect(knows.locator('.routines summary')).toContainText('Weekly sales summary')
  await page.keyboard.press('Escape')

  // The next conversation lists it, and a fourth request of the kind suggests nothing new.
  await page.locator('.wordmark').click()
  await ask(page, 'Summarize the weekly sales by region')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const system = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system)
  expect(system).toContain('<skills>\n- weekly-sales-summary: When the user asks for a summary of the weekly sales by region.\n</skills>')
  await expect(page.locator('.follow-up', { hasText: 'Make this a routine' })).toHaveCount(0)
})
