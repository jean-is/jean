// The user at the foot of the conversations (D150): "You" until their name is known, opening a
// menu above them with Settings, the language, the theme, dark mode and what Jean can do,
// the themes as thumbnails. A language or a theme picked there applies and the menu stays on its page,
// the drawer open beside the conversation staying so (D153, D165). Jean notes the name the user
// gives for themselves in a conversation, while they have never set one, and says so with an
// Undo; they change it in About you. A long title stays inside the list. A toast shows over Settings.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openProfile, openSettings, openTasks, withPolicy } from './helpers.js'
import { LOOKS } from '../app/ui/looks.js'

/** What settings.json holds for the name. @param {import('@playwright/test').Page} page */
const savedName = (page) => page.evaluate(async () => JSON.parse(await (await import('/ui/state.js')).app.fs.read('settings.json') ?? '{}').name)

test('the user’s menu changes the theme, the language and light or dark, staying open, and opens Settings', async ({ page }) => {
  await start(page)
  await openTasks(page)
  await expect(page.locator('app-inbox .profile-name')).toHaveText('You')
  // A theme picked there shows at once; the drawer stays open beside the conversation, the menu on its page.
  const menu = await openProfile(page)
  await menu.locator('[data-page="looks"]').click()
  await expect(menu.locator('[aria-current="true"]')).toBeFocused()
  // Each theme a small thumbnail and its name (D154), drawn once the dialogs' style sheet is in.
  await expect(menu.locator('.look-tile')).toHaveCount(Object.keys(LOOKS).length)
  await expect(menu.locator('.look-tile .look-preview').first()).toHaveCSS('aspect-ratio', '16 / 10')
  await menu.locator('button', { hasText: /^Mail$/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-look', 'mail')
  await expect(menu.locator('[aria-current="true"]')).toHaveText('Mail')
  await menu.locator('button', { hasText: /^Room$/ }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-look', 'mail')
  await expect(page.locator('#profile-list:popover-open [aria-current="true"]')).toHaveText('Room')
  await expect(page.locator('app-history dialog[open]')).toHaveCount(0)
  await menu.locator('.back').click()

  // The languages, the current one first among the browser's, with the keyboard on it; one picked
  // shows at once, and the page stays.
  const languages = menu
  await languages.locator('[data-page="languages"]').click()
  await expect(languages.locator('button[lang="en"]')).toBeFocused()
  await languages.locator('button[lang="fr"]').click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(languages.locator('.back')).toHaveText('Langue')
  await expect(languages.locator('button[lang="fr"]')).toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('Escape')
  await expect(languages).toBeHidden()
  await expect(page.locator('app-inbox .profile-name')).toHaveText('Vous')

  const again = await openProfile(page)
  const before = await page.locator('html').getAttribute('data-theme')
  const after = before === 'dark' ? 'light' : 'dark'
  // Light or dark, as Settings call it, says how it stands (D523).
  const mode = again.getByRole('button', { name: /^Clair ou sombre/ })
  await expect(mode.locator('.menu-value')).toHaveText('Auto')
  await mode.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', after)
  await expect(mode.locator('.menu-value')).toHaveText(after === 'dark' ? 'Sombre' : 'Clair')
  await again.locator('[aria-keyshortcuts$="+,"]').click()
  await expect(page.locator('app-settings dialog[open]')).toBeVisible()
})

test('an organisation’s policy keeps to its languages and themes, its own theme first, and sets each it offers alone (D500)', async ({ page }) => {
  const look = { name: 'Acme', on: 'swiss', accent: '#e30613', css: '.hero-question { outline: 3px solid rgb(0, 128, 0) !important; }' }
  await withPolicy(page, { locales: ['fr', 'ja'], look, looks: ['mail'] })
  await page.goto('./')
  // The browser's English isn't offered: French, the first, is; the organisation's theme, drawn with Swiss under its CSS.
  const root = page.locator('html')
  await expect(root).toHaveAttribute('lang', 'fr')
  await expect(root).toHaveAttribute('data-look', 'swiss')
  await expect(page.locator('.hero-question')).toHaveCSS('outline-color', 'rgb(0, 128, 0)')
  const menu = await openProfile(page)
  await menu.locator('[data-page="languages"]').click()
  await expect(menu.locator('button[lang]')).toHaveText(['Français', '日本語'])
  await menu.locator('.back').click()
  await menu.locator('[data-page="looks"]').click()
  await expect(menu.locator('.look-tile')).toHaveText(['Acme', 'Courrier'])
  await expect(menu.locator('.look-tile .look-preview').first()).toHaveAttribute('data-look-preview', 'swiss')
  await menu.locator('.look-tile', { hasText: 'Courrier' }).click()
  await expect(root).toHaveAttribute('data-look', 'mail')
  await expect(page.locator('.hero-question')).toHaveCSS('outline-style', 'none')
  // ⌘⇧E goes round the two.
  await page.keyboard.press('ControlOrMeta+Shift+E')
  await expect(root).toHaveAttribute('data-look', 'swiss')
  await expect(page.locator('.hero-question')).toHaveCSS('outline-color', 'rgb(0, 128, 0)')

  // One of each offered: both set by the organisation, in the menu, in Settings and by the keyboard.
  await page.route((url) => url.pathname === '/policy.json', (route) => route.fulfill({ json: { locales: ['fr'], look, looks: [] } }))
  await page.reload()
  await expect(root).toHaveAttribute('lang', 'fr')
  const again = await openProfile(page)
  await expect(again.locator('[data-page="languages"]')).toBeDisabled()
  await expect(again.locator('[data-page="looks"]')).toBeDisabled()
  await expect(again.locator('[data-page="looks"] .menu-value')).toHaveText('Acme')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+Shift+E')
  await expect(root).toHaveAttribute('data-look', 'swiss')
  const settings = await openSettings(page, 'Apparence')
  const looks = settings.locator('fieldset.looks')
  await expect(looks.locator('.look')).toHaveText(['Acme'])
  await expect(looks.getByRole('radio')).toBeDisabled()
  await expect(settings.locator('section', { has: page.locator('fieldset.looks') })).toContainText('Défini par votre organisation')
  await settings.locator('.settings-nav button', { hasText: 'Général' }).click()
  await expect(settings.locator('.settings-panel select').first()).toBeDisabled()
  await expect(settings.locator('.list.general > li').first()).toContainText('Défini par votre organisation')
})

test('a toast shows over Settings, inside it, where its button can still be pressed', async ({ page }) => {
  await start(page)
  const settings = await openSettings(page)
  await page.evaluate(async () => (await import('/ui/state.js')).notify('Saved', { label: 'Undo', run: () => { document.documentElement.dataset.undone = '' } }))
  // Outside the modal dialog, the button would be inert, under its backdrop: the click would never land.
  await settings.locator('.toast button', { hasText: 'Undo' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-undone', '')
  await expect(settings).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('app-shell > app-toasts')).toHaveCount(1)
})

test('Jean notes the name the user gives, once, and the user changes it in About you', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, "I'm Marie, can you help me plan my week?")
  await expect(page.locator('.toast')).toContainText('Hello, Marie! Your name is saved.')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Nice to meet you, Marie.')
  await expect(page.locator('app-inbox .profile-name')).toHaveText('Marie')
  await expect(page.locator('app-inbox .avatar')).toHaveText('M')
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
  await expect(page.locator('app-inbox .profile-name')).toHaveText('Mia')

  // A title longer than the list ends in an ellipsis, inside it.
  await page.evaluate(async () => {
    const [{ app, refreshConversations }, { appendRecords }, { metaRecord }] = await Promise.all([import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    await appendRecords(app.fs, app.conversations.value[0].path, [metaRecord(app.deviceId, { title: 'A plan for the week, day by day, with every meeting and every errand' })])
    await refreshConversations()
  })
  const row = (await openTasks(page)).locator('.history-list li').first()
  await expect(row).toContainText('A plan for the week')
  const [listWidth, rowWidth] = await row.evaluate((li) => [/** @type {HTMLElement} */ (li.parentElement).getBoundingClientRect().width, li.getBoundingClientRect().width])
  expect(rowWidth).toBeLessThanOrEqual(listWidth)
})
