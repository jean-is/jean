// Skills from elsewhere (D121, D122), against a fake publisher (test/fixtures/fake-skills.js): a
// place to look added by its address, skills read before they are added and added only as listed,
// the third request of a kind pointed to a ready-made skill, and the brain finding, adding and
// following a skill for know-how it lacks. The known places are set aside: tests stay offline.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn } from './helpers.js'

const PLACE = 'http://127.0.0.1:4183'

/** Opens "Find a skill" from "What Jean knows about you", with Skills on. @param {import('@playwright/test').Page} page */
async function openFinder(page) {
  await places(page, [])
  await turnOn(page, 'Skills')
  await page.locator('app-settings .room-card', { hasText: 'Skills' }).locator('.button').click()
  await page.locator('app-knows dialog[open] .button', { hasText: 'Find a skill' }).click()
  const finder = page.locator('app-skill-finder dialog[open]')
  await expect(finder).toBeVisible()
  return finder
}

/** Where to look, instead of the known places. @param {import('@playwright/test').Page} page @param {string[]} list */
async function places(page, list) {
  await page.evaluate(async (skillIndexes) => (await import('/ui/state.js')).updateSettings({ skillIndexes }), list)
}

/** @param {import('@playwright/test').Locator} finder */
async function addPlace(finder) {
  await expect(finder).toContainText('There’s nowhere to look yet')
  await finder.locator('input[name="address"]').fill(PLACE)
  await finder.locator('form .button').click()
  await expect(finder.locator('.connection')).toContainText('127.0.0.1:4183')
  await expect(finder.locator('.connection')).toContainText('Skills listed: 4')
}

test('a skill from a place to look: read first, and added only as its publisher listed it', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const finder = await openFinder(page)
  await addPlace(finder)
  // The archive needs more than Jean has: it is counted, not listed.
  await expect(finder.locator('.service')).toHaveCount(3)
  await expect(finder).toContainText('Some skills listed here need tools Jean doesn’t have yet.')

  // Searched on the device.
  await finder.locator('input[type="search"]').fill('invoices')
  await expect(finder.locator('.service')).toHaveCount(1)
  await expect(finder.locator('.service')).toContainText('Invoice chase')
  await finder.locator('input[type="search"]').fill('')

  // A file that changed since it was listed is refused.
  await finder.locator('.service', { hasText: 'meeting notes' }).click()
  await expect(finder.locator('.status.is-error')).toHaveText('This skill isn’t the one its publisher listed, so Jean won’t use it.')

  // Read, then added, with where it came from.
  await finder.locator('.service', { hasText: 'weekly sales summary' }).click()
  await expect(finder.locator('.reader h3')).toHaveText('Weekly sales summary')
  await expect(finder.locator('.reader')).toContainText('From 127.0.0.1:4183 · MIT')
  await expect(finder.locator('.reader-steps')).toContainText('Lead with the region that grew most.')
  await finder.locator('.reader .button.primary').click()
  await expect(page.locator('.toast')).toContainText('Added the skill “Weekly sales summary”.')
  await expect(finder.locator('.service', { hasText: 'weekly sales summary' })).toContainText('Added')
  const file = await page.evaluate(async () => (await import('/ui/state.js')).app.fs.read('skills/weekly-sales-summary/SKILL.md'))
  expect(file).toContain('source: "http://127.0.0.1:4183/.well-known/agent-skills/weekly-sales-summary/SKILL.md"')
  expect(file).toMatch(/digest: "sha256:[0-9a-f]{64}"/)
  await page.keyboard.press('Escape')

  // The next conversation is told about it.
  await page.locator('.wordmark').click()
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const system = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system)
  expect(system).toContain('<skills>\n- weekly-sales-summary: Summarize the weekly sales by region from a spreadsheet: totals per region and month.\n</skills>')
})

test('the third request of a kind points to a ready-made skill', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await addPlace(await openFinder(page))
  await page.keyboard.press('Escape')
  for (let i = 0; i < 3; i++) {
    await page.locator('.wordmark').click()
    await ask(page, i === 1 ? 'Please summarize the weekly sales by region' : 'Summarize the weekly sales by region')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
    await expect(page.locator('.follow-ups')).toBeVisible()
  }
  await expect(page.locator('.follow-up', { hasText: 'Save this as a skill' })).toBeVisible()
  await page.locator('.follow-up', { hasText: 'Use a ready-made skill' }).click()
  const finder = page.locator('app-skill-finder dialog[open]')
  await expect(finder.locator('input[type="search"]')).toHaveValue('Summarize the weekly sales by region')
  await expect(finder.locator('.service').first()).toContainText('Weekly sales summary')
})

test('know-how Jean lacks: the brain finds a published skill, adds it once allowed, and follows it', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await places(page, [PLACE])
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  await ask(page, 'Write a reminder for the unpaid invoice from ACME')
  // Searching what places publish needs no approval; adding a skill uses the internet: it asks first.
  const card = page.locator('.approval')
  await expect(card).toContainText('Allow this? Add a skill · invoice-chase')
  await card.locator('.button.primary').click()
  await expect(page.locator('.toast')).toContainText('Saved the skill “Invoice reminders”.')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Following the skill, step one: Find the invoice and how late it is.')
  const file = await page.evaluate(async () => (await import('/ui/state.js')).app.fs.read('skills/invoice-chase/SKILL.md'))
  expect(file).toContain('source: "http://127.0.0.1:4183/.well-known/agent-skills/invoice-chase/SKILL.md"')
  // The activity view says what was searched and what was added.
  const activity = page.locator('details.activity').last()
  await activity.locator('summary').first().click()
  await expect(activity).toContainText('Looked for skills · reminders for unpaid invoices')
  await expect(activity).toContainText('Add a skill · invoice-chase')
})
