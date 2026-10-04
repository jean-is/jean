// Memory, projects and skills (0.4), the version's done-when: two projects keep separate
// memories, and a skill is created from repeated requests. Plus "What Jean knows about you".
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings } from './helpers.js'

/** @param {import('@playwright/test').Page} page @param {string} name */
async function createProject(page, name) {
  const dialog = page.locator('app-project-dialog dialog[open]')
  await expect(dialog).toBeVisible()
  await dialog.locator('input[name="name"]').fill(name)
  await dialog.locator('.swatch').nth(4).click()
  await dialog.locator('.button.primary').click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('app-projects .wordmark')).toHaveText(name)
}

/** @param {import('@playwright/test').Page} page */
async function openKnows(page) {
  await (await openSettings(page)).locator('.button', { hasText: 'Open' }).first().click()
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
  await page.locator('app-projects .wordmark').click()
  await page.locator('#project-menu button', { hasText: 'New project' }).click()
  await createProject(page, 'Garden')
  await ask(page, 'What do you know?')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Nothing yet.')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  const garden = await openKnows(page)
  await expect(garden).not.toContainText('opens at 7')
  await page.keyboard.press('Escape')

  // Back in the bakery, it is there, on the page and in the brain's context.
  await page.locator('app-projects .wordmark').click()
  await page.locator('#project-menu .project', { hasText: 'Bakery' }).click()
  await expect(page.locator('app-projects .wordmark')).toHaveText('Bakery')
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
  await page.locator('app-projects .wordmark').click()
  await page.locator('#project-menu button', { hasText: 'New conversation' }).click()
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const system = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system)
  expect(system).toContain('<project>\nBakery\n</project>')
  expect(system).toContain('<instructions>\nAnswer in short sentences.\n</instructions>')
  expect(system).toContain('<memory>\n- the bakery opens at 7\n</memory>')
})

test('the third request of a kind becomes a skill', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  for (let i = 0; i < 3; i++) {
    await page.locator('.wordmark').click()
    await ask(page, i === 1 ? 'Please summarize the weekly sales by region' : 'Summarize the weekly sales by region')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
    await expect(page.locator('.follow-ups')).toBeVisible()
  }
  // Offered above the box; accepting turns skills on and asks for this one.
  const offer = page.locator('aside.offer')
  await expect(offer).toContainText('third time')
  await expect(offer.locator('.button.primary')).toHaveText('Save it as a skill')
  await offer.locator('.button.primary').click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('it is a skill now')
  await expect(page.locator('.toast')).toContainText('Saved the skill “Weekly sales summary”')

  const knows = await openKnows(page)
  await expect(knows.locator('.skills summary')).toContainText('Weekly sales summary')
  await page.keyboard.press('Escape')

  // The next conversation lists it, and a fourth request of the kind suggests nothing new.
  await page.locator('.wordmark').click()
  await ask(page, 'Summarize the weekly sales by region')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const system = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system)
  expect(system).toContain('<skills>\n- weekly-sales-summary: When the user asks for a summary of the weekly sales by region.\n</skills>')
  await expect(page.locator('.follow-up', { hasText: 'Save this as a skill' })).toHaveCount(0)
})
