// The user at the foot of the conversations (D150): "You" until their name is known, opening a
// menu above them with Settings, About you, the language, dark mode, what Jean can do and the
// manifesto. Jean notes the name the user gives for themselves in a conversation, while they
// have never set one, and says so with an Undo; they change it in About you.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openProfile, openSettings } from './helpers.js'

/** What settings.json holds for the name. @param {import('@playwright/test').Page} page */
const savedName = (page) => page.evaluate(async () => JSON.parse(await (await import('/ui/state.js')).app.fs.read('settings.json') ?? '{}').name)

test('the user’s menu changes the language and the mode, and opens Settings', async ({ page }) => {
  await start(page)
  await expect(page.locator('app-history .profile-name')).toHaveText('You')
  const menu = await openProfile(page)
  await menu.locator('.submenu').click()
  // The languages, the current one first among the browser's, with the keyboard on it.
  await expect(menu.locator('button[lang="en"]')).toBeFocused()
  await menu.locator('button[lang="fr"]').click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(menu).toBeHidden()
  await expect(page.locator('app-history .profile-name')).toHaveText('Vous')

  const again = await openProfile(page)
  const before = await page.locator('html').getAttribute('data-theme')
  const after = before === 'dark' ? 'light' : 'dark'
  await again.locator('[role="switch"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', after)
  await expect(again.locator('[role="switch"]')).toHaveAttribute('aria-checked', String(after === 'dark'))
  await again.locator('[aria-keyshortcuts$="+,"]').click()
  await expect(page.locator('app-settings dialog[open]')).toBeVisible()
})

test('Jean notes the name the user gives, once, and the user changes it in About you', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, "I'm Marie, can you help me plan my week?")
  await expect(page.locator('.toast')).toContainText('Hello, Marie! Your name is saved.')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Nice to meet you, Marie.')
  await expect(page.locator('app-history .profile-name')).toHaveText('Marie')
  await expect(page.locator('app-history .avatar')).toHaveText('M')
  await expect.poll(() => savedName(page)).toBe('Marie')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()

  // Known, the name is no longer Jean's to note: a new conversation isn't given the tool.
  await page.locator('.bar .wordmark').click()
  await ask(page, "I'm Zoe")
  await expect(page.locator('.msg-jean .prose').last()).toContainText('You asked')
  expect(await savedName(page)).toBe('Marie')

  // The user's own, from About you.
  const settings = await openSettings(page, 'About you')
  const field = settings.locator('.you-name')
  await expect(field).toHaveValue('Marie')
  await field.fill('Mia')
  await field.press('Tab')
  await expect.poll(() => savedName(page)).toBe('Mia')
  await page.keyboard.press('Escape')
  await expect(page.locator('app-history .profile-name')).toHaveText('Mia')
})
