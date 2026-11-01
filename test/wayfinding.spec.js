// Finding where you are: the window's title says the page, what Jean is doing is said to a screen reader as it changes and not
// word by word, and the skip links reach the main content and the box, leaving the task and its address where they are.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, openSettings, closeSettings, openTasks } from './helpers.js'

test('the window’s title says the page: a task’s name, a Settings section, search, Creations, and the first screen again', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const first = await page.title()
  await ask(page, 'Compare the phone plans')
  await answered(page)
  await expect(page).toHaveTitle(/^Compare phone plans · /)
  await openSettings(page, 'Appearance')
  await expect(page).toHaveTitle(/^Appearance · /)
  await closeSettings(page)
  await expect(page).toHaveTitle(/^Compare phone plans · /)
  // Drawn while closed, Settings doesn't hold the title, in another language either.
  await page.evaluate(async () => (await import('/ui/state.js')).setLocale('fr'))
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(page).toHaveTitle(/^Compare phone plans · /)
  await page.evaluate(async () => (await import('/ui/state.js')).setLocale('en'))
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('find'); (await import('/ui/state.js')).app.dialog.value = 'find' })
  await expect(page).toHaveTitle(/^Search · /)
  await page.keyboard.press('Escape')
  await expect(page).toHaveTitle(/^Compare phone plans · /)
  await page.keyboard.press('ControlOrMeta+Shift+KeyO')
  await expect(page.locator('.hero-question')).toBeVisible()
  await expect(page).not.toHaveTitle(/^Compare phone plans/)
  expect(first).not.toBe('')
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('documents'))
  await (await openTasks(page)).getByRole('button', { name: 'Creations', exact: true }).click()
  await expect(page).toHaveTitle(/^Creations · /)
})

test('a screen reader hears that Jean is thinking, writing and has answered, not the stream of its words', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await expect(page.locator('body > [role="status"].visually-hidden')).toHaveCount(1)
  await page.evaluate(() => {
    const said = /** @type {Element} */ (document.querySelector('body > [role="status"].visually-hidden'))
    const heard = /** @type {any} */ (window).heard = /** @type {string[]} */ ([])
    new MutationObserver(() => heard.push(said.textContent ?? '')).observe(said, { childList: true, characterData: true, subtree: true })
  })
  await ask(page, 'Compare the phone plans')
  await answered(page)
  await expect(page.locator('body > [role="status"].visually-hidden')).toContainText('Answered with')
  const heard = await page.evaluate(() => /** @type {any} */ (window).heard.filter(Boolean))
  expect(heard.every((/** @type {string} */ line) => /^(Thinking|Writing|Answered with)/.test(line))).toBe(true)
  expect(heard.at(-1)).toMatch(/^Answered with/)
  // Nothing goes on on a new task.
  await page.keyboard.press('ControlOrMeta+Shift+KeyO')
  await expect(page.locator('.hero-question')).toBeVisible()
  await expect(page.locator('body > [role="status"].visually-hidden')).toHaveText('')
})

test('the skip links reach the main content and the box, the task and its address staying where they are', async ({ page, browserName }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Compare the phone plans')
  await answered(page)
  const address = await page.evaluate(() => location.hash)
  expect(address).toMatch(/^#\/c\//)
  for (const [target, then] of /** @type {const} */ ([['#main', 'main'], ['#prompt', '#prompt']])) {
    await page.locator(`a.skip[href="${target}"]`).focus()
    await expect(page.locator(`a.skip[href="${target}"]`)).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(address)
    await expect(page.locator('.conversation-title')).toHaveText('Compare phone plans')
    if (then === '#prompt') await expect(page.locator('#prompt')).toBeFocused()
    else {
      // From the link's target, the next stop by key is in the conversation.
      await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('main')))).toBe(true)
    }
  }
})
