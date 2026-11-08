// Feedback (D712): offered once an answer was asked again twice; then Good and Not right in the last answer's More options. Not right
// asks what missed, and answers again a level up with those words; Keep it in mind turns memory on for the brain to note it.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask } from './helpers.js'

test('asked again twice, Feedback is offered; Not right says why and answers again, Good stays pressed', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  await page.evaluate(async () => (await import('/ui/state.js')).updateSettings({ retried: 2 }))
  const offer = page.locator('aside.offer')
  await expect(offer).toContainText('Mark an answer as not right')
  await offer.getByRole('button', { name: 'Mark answers' }).click()
  const actions = page.locator('.msg-jean .msg-actions').last()
  await actions.getByRole('button', { name: 'More options' }).click()
  await actions.getByRole('button', { name: 'Not right' }).click()
  // The menu closes on it, and the keyboard is in its few words.
  await expect(actions.locator('.answer-menu')).toBeHidden()
  await expect(page.getByLabel('What wasn’t right?')).toBeFocused()
  // Escape puts them away, the keyboard back on More options, which opens them again.
  await page.keyboard.press('Escape')
  await expect(page.locator('.feedback')).toHaveCount(0)
  await expect(actions.getByRole('button', { name: 'More options' })).toBeFocused()
  await actions.getByRole('button', { name: 'More options' }).click()
  await actions.getByRole('button', { name: 'Not right' }).click()
  await page.getByLabel('What wasn’t right?').fill('Too long, say it in one line')
  await page.locator('.feedback').getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.locator('.msg-user').last()).toHaveText('Too long, say it in one line')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  // The brain read why, and the mark is kept in the task.
  const records = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value.records)
  expect(records.some((record) => record.update?.data?.kind === 'feedback')).toBe(true)
  expect(records.some((record) => record.meta?.feedback?.value === 'bad')).toBe(true)
  // Good, on the new last answer, is ticked when its menu opens again.
  const now = page.locator('.msg-jean .msg-actions').last()
  await now.getByRole('button', { name: 'More options' }).click()
  await now.getByRole('button', { name: 'Good answer' }).click()
  await expect(now.locator('.answer-menu')).toBeHidden()
  await now.getByRole('button', { name: 'More options' }).click()
  await expect(now.getByRole('button', { name: 'Good answer' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  // Earlier answers' menus have neither.
  const before = page.locator('.msg-jean .msg-actions').first()
  await before.getByRole('button', { name: 'More options' }).click()
  await expect(before.locator('.answer-menu')).toBeVisible()
  await expect(before.getByRole('button', { name: 'Good answer' })).toHaveCount(0)
})

test('Try again and keep it in mind turns memory on for the brain to note what will matter', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('feedback'))
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const actions = page.locator('.msg-jean .msg-actions').last()
  await actions.getByRole('button', { name: 'More options' }).click()
  await actions.getByRole('button', { name: 'Not right' }).click()
  await page.locator('.feedback').getByRole('button', { name: 'Try again and keep it in mind' }).click()
  await expect(page.locator('.msg-user').last()).toHaveText('That wasn’t right.')
  await expect.poll(() => page.evaluate(async () => (await import('/ui/caps.js')).loaded.value.has('memory'))).toBe(true)
})
