// SPDX-License-Identifier: MIT
// Finding where you are: the window's title says the page, what Jean is doing is said to a screen reader as it changes and not
// word by word, and the skip links reach the main content and the box, leaving the task and its address where they are.
import { readFileSync } from 'node:fs'
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
  expect(heard.filter((/** @type {string} */ line, /** @type {number} */ i) => line === heard[i - 1]), 'each line said once').toEqual([])
  // Nothing goes on on a new task.
  await page.keyboard.press('ControlOrMeta+Shift+KeyO')
  await expect(page.locator('.hero-question')).toBeVisible()
  await expect(page.locator('body > [role="status"].visually-hidden')).toHaveText('')
})

for (const lang of ['en', 'ar', 'ja']) {
  test(`a screen reader hears that a decision waits on the person, and so does the line above it, not that Jean is thinking (${lang})`, async ({ page }) => {
    const strings = JSON.parse(readFileSync(new URL(`../app/locales/${lang}.json`, import.meta.url), 'utf8'))
    const waiting = (strings['inbox.waiting'].one ?? strings['inbox.waiting'].other).replace('{count}', new Intl.NumberFormat(lang).format(1))
    await start(page, lang)
    await connectFakeBrain(page)
    await page.evaluate(async () => {
      await (await import('/ui/caps.js')).unlock('browser')
      await (await import('/ui/state.js')).updateSettings({ rules: { fetch: 'ask' } })
    })
    await ask(page, 'Read the wikipedia article')
    const said = page.locator('body > [role="status"].visually-hidden'), card = page.locator('.approval')
    await expect(card).toBeVisible()
    await expect(said).toHaveText(waiting)
    await expect(page.locator('.activity > summary').last()).toContainText(waiting)
    // Answered, Jean goes on, and it says so.
    await card.locator('button').nth(2).click()
    await expect(said).not.toHaveText(waiting)
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  })

  test(`what went wrong is an alert, what went well a status, each said by the toast's own words (${lang})`, async ({ page }) => {
    const strings = JSON.parse(readFileSync(new URL(`../app/locales/${lang}.json`, import.meta.url), 'utf8'))
    await start(page, lang)
    await connectFakeBrain(page)
    await expect(page.locator('app-toasts [role="status"]')).toHaveCount(1)
    await ask(page, 'Compare the phone plans')
    await answered(page)
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('refused')) } }))
    const copy = page.locator('.msg-actions.is-request button').first()
    await copy.click()
    await expect(page.locator('app-toasts [role="alert"]')).toHaveText(strings['made.copyFailed'])
    await expect(page.locator('app-toasts [role="status"]')).toHaveText('')
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }))
    await copy.click()
    await expect(page.locator('app-toasts [role="status"]')).toHaveText(strings['toast.copied'])
    await expect(page.locator('app-toasts [role="alert"]')).toHaveCount(0)
  })
}

test('a screen reader hears that an offer in the answer waits on the person too', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Show me the bakery site')
  await expect(page.locator('.msg-jean .approval')).toBeVisible()
  await expect(page.locator('body > [role="status"].visually-hidden')).toHaveText('1 decision is waiting for you')
  await page.locator('.msg-jean .approval button').last().click()
  await expect(page.locator('body > [role="status"].visually-hidden')).not.toHaveText('1 decision is waiting for you')
})

test('a request that failed and is asked again is said, in the status line and the line above the answer', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  let failed = false
  await page.route('**/v1/chat/completions', (route) => {
    // The request itself, not the title asked for beside it.
    if (failed || !route.request().postData()?.includes('You are ')) return route.fallback()
    failed = true
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"message":"Busy"}}' })
  })
  await page.evaluate(() => {
    const said = /** @type {Element} */ (document.querySelector('body > [role="status"].visually-hidden'))
    const heard = /** @type {any} */ (window).heard = /** @type {string[]} */ ([])
    new MutationObserver(() => heard.push(said.textContent ?? '')).observe(said, { childList: true, characterData: true, subtree: true })
  })
  await ask(page, 'Compare the phone plans')
  await expect(page.locator('body > [role="status"].visually-hidden')).toHaveText('Trying again…')
  await expect(page.locator('.activity > summary').last()).toContainText('Trying again…')
  await answered(page)
  await expect(page.locator('body > [role="status"].visually-hidden')).toContainText('Answered with')
  const heard = await page.evaluate(() => /** @type {any} */ (window).heard.filter(Boolean))
  expect(heard).toContain('Trying again…')
  expect(heard.filter((/** @type {string} */ line, /** @type {number} */ i) => line === heard[i - 1]), 'each line said once').toEqual([])
})

for (const [lang, other] of [['en', 'fr'], ['ar', 'ja'], ['ja', 'ar']]) {
  test(`in Settings, a language picked changes nothing until its button is pressed, which leaves the keyboard on the menu (${lang})`, async ({ page }) => {
    await start(page, lang)
    const settings = await openSettings(page, JSON.parse(readFileSync(new URL(`../app/locales/dialogs/${lang}.json`, import.meta.url), 'utf8'))['settings.general'])
    const select = settings.locator('.settings-panel select').first(), change = settings.locator('.language-change')
    await expect(change).toHaveCount(0)
    await select.selectOption(other)
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await expect(change).toBeVisible()
    await expect(select).toHaveValue(other)
    // Picked again, the one on show needs no button.
    await select.selectOption(lang)
    await expect(change).toHaveCount(0)
    await select.selectOption(other)
    await change.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('html')).toHaveAttribute('lang', other)
    await expect(change).toHaveCount(0)
    await expect(select).toBeFocused()
    await expect(select).toHaveValue(other)
  })
}

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
