// A conversation goes on out of sight (D147): going to another one leaves its answer under way,
// its name in the list has a small light, ringed while a decision waits there, and coming back
// shows the answer where it got to. The list shows no times. The fake brain asks three questions
// before writing a letter. A task follows another at once, a title shows whole until the pointer
// is on its task, which brings its menu's button, and the keyboard goes from task to task.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openTasks } from './helpers.js'

test('an answer goes on while the user is in another conversation', async ({ page, browserName }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Write a letter to my bank')
  const card = page.locator('.inbox app-ask form.approval')
  await expect(card.locator('.ask-progress')).toHaveText('Question 1 of 3')

  // Its name has the light, ringed: a decision waits there. No times in the list.
  const list = await openTasks(page)
  const letter = list.locator('.history-list li').first()
  await expect(letter.locator('.ember[data-waiting]')).toHaveAttribute('aria-label', '1 decision is waiting for you')
  await expect(list.locator('time')).toHaveCount(0)

  // Another conversation, answered while the first one waits.
  await list.locator('.place', { hasText: 'New task' }).click()
  await expect(card).toHaveCount(0)
  await ask(page, 'Hello from the second conversation')
  // Left before its answer is written: it is written all the same.
  await list.locator('.place', { hasText: 'New task' }).click()
  await expect(list.locator('.history-list li')).toHaveCount(2)
  await expect(list.locator('.ember:not([data-waiting])')).toHaveCount(0)
  await list.locator('.history-item', { hasText: 'Hello second conversation' }).click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('You asked: Hello from the second conversation')

  // Back to the first: its questions are where they were, and the letter comes once answered.
  await expect(list.locator('.ember[data-waiting]')).toHaveCount(1)
  await list.locator('.history-item', { hasText: 'Write letter' }).click()
  await expect(card.locator('.ask-progress')).toHaveText('Question 1 of 3')
  await card.locator('.button.primary').click()
  await card.locator('.button', { hasText: 'Skip' }).click()
  await card.locator('.button', { hasText: 'Skip' }).click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Which tone should the letter have? Formal')
  await expect(list.locator('.ember')).toHaveCount(0)

  // From task to task in a hurry, with motion: nothing covers the page, so a click right after
  // another lands, and the last one asked for shows (D120).
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await list.locator('.history-item', { hasText: 'Hello second conversation' }).click()
  await list.locator('.history-item', { hasText: 'Write letter' }).click({ force: true })
  await expect(list.locator('li.is-current')).toContainText('Write letter')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Which tone should the letter have? Formal')

  // A title takes its whole row until the pointer is on it, which brings the ⋮ button (D181).
  const row = list.locator('.history-list li').first()
  const titleWidth = async () => (await row.locator('.history-item').boundingBox())?.width ?? 0
  await page.mouse.move(1000, 400)
  const whole = await titleWidth()
  expect(whole).toBeCloseTo((await row.boundingBox())?.width ?? 0, 0)
  await row.hover()
  await expect(row.locator('.icon-button')).toBeVisible()
  expect(await titleWidth()).toBeLessThan(whole)

  // The keyboard: ↑ ↓, Home and End from task to task, Tab once per task (⌥Tab in Safari, unless
  // its settings say Tab), → to its ⋮ button and ← back, Enter to open it.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
  const items = list.locator('.history-item')
  await items.first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(items.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(items.first()).toBeFocused()
  await page.keyboard.press('End')
  await expect(items.last()).toBeFocused()
  await page.keyboard.press('Home')
  await expect(items.first()).toBeFocused()
  await page.keyboard.press(tab)
  await expect(items.nth(1)).toBeFocused()
  await page.keyboard.press(`Shift+${tab}`)
  await expect(items.first()).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(row.locator('.icon-button')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.task-menu:popover-open')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('ArrowLeft')
  await expect(items.first()).toBeFocused()
  await expect(list.locator('.history-list li').first()).toHaveClass(/is-current/)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(list.locator('.history-list li').nth(1)).toHaveClass(/is-current/)
})
