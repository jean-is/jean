// A conversation goes on out of sight (D147): going to another one leaves its answer under way,
// its name in the list has a small light, ringed while a decision waits there, and coming back
// shows the answer where it got to. The list shows no times. The fake brain asks three questions
// before writing a letter.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask } from './helpers.js'

/** @param {import('@playwright/test').Page} page */
async function drawer(page) {
  await page.locator('.bar > .icon-button').first().click()
  const open = page.locator('app-history dialog[open]')
  await expect(open).toBeVisible()
  return open
}

test('an answer goes on while the user is in another conversation', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Write a letter to my bank')
  const card = page.locator('.inbox app-ask form.approval')
  await expect(card.locator('.ask-progress')).toHaveText('Question 1 of 3')

  // Its name has the light, ringed: a decision waits there. No times in the list.
  let list = await drawer(page)
  const letter = list.locator('.history-list li').first()
  await expect(letter.locator('.ember[data-waiting]')).toHaveAttribute('aria-label', '1 decision is waiting for you')
  await expect(list.locator('time')).toHaveCount(0)

  // Another conversation, answered while the first one waits.
  await list.locator('.button.wide').click()
  await expect(card).toHaveCount(0)
  await ask(page, 'Hello from the second conversation')
  // Left before its answer is written: it is written all the same.
  list = await drawer(page)
  await list.locator('.button.wide').click()
  list = await drawer(page)
  await expect(list.locator('.history-list li')).toHaveCount(2)
  await expect(list.locator('.ember:not([data-waiting])')).toHaveCount(0)
  await list.locator('.history-item', { hasText: 'Hello second conversation' }).click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('You asked: Hello from the second conversation')

  // Back to the first: its questions are where they were, and the letter comes once answered.
  list = await drawer(page)
  await expect(list.locator('.ember[data-waiting]')).toHaveCount(1)
  await list.locator('.history-item', { hasText: 'Write letter' }).click()
  await expect(card.locator('.ask-progress')).toHaveText('Question 1 of 3')
  await card.locator('.button.primary').click()
  await card.locator('.button', { hasText: 'Skip' }).click()
  await card.locator('.button', { hasText: 'Skip' }).click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Which tone should the letter have? Formal')
  list = await drawer(page)
  await expect(list.locator('.ember')).toHaveCount(0)
})
