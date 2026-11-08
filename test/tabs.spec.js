// Settings in several tabs (D700): a tab reads settings.json again when another changes it (ui/app.js's watch calls changeSettings()
// in ui/state.js), and writes a change over the file as it is, one tab at a time, so a tab open all along never writes back what it
// held before: a person's devices would spread that revert.
import { test, expect } from '@playwright/test'
import { start, openSettings, openTasks, chooseLanguage, closeSettings } from './helpers.js'

/** @param {import('@playwright/test').Page} page */
const ephemeral = (page) => page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)
/** settings.json as the tab holds it, and as the file is. @param {import('@playwright/test').Page} page */
const settingsOf = (page) => page.evaluate(async () => {
  const { app } = await import('/ui/state.js')
  return { held: app.settings.value, saved: JSON.parse(await app.fs.read('settings.json') ?? '{}') }
})

test('a setting changed in one tab shows in the other, and a change there later keeps it', async ({ page, context }) => {
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit, where each tab is a Jean of its own')
  const other = await context.newPage()
  await other.goto('./')
  await expect(other.locator('.hero-question')).toBeVisible()
  const name = (await openTasks(other)).locator('.profile-name')
  await expect(name).toHaveText('You')

  // The person's name, from About you in the first tab, shows in the other at once.
  const settings = await openSettings(page, 'About you')
  await settings.locator('.you-name').fill('Mia')
  await settings.locator('.you-name').press('Tab')
  await expect(name).toHaveText('Mia')
  await closeSettings(page)

  // The language, chosen later in the other tab, which held the name it read: written over the file as it is, the name kept.
  await other.keyboard.press('ControlOrMeta+Comma')
  await chooseLanguage(other.locator('app-settings dialog[open]'), 'fr')
  await expect(other.locator('html')).toHaveAttribute('lang', 'fr')
  await expect.poll(async () => (await settingsOf(page)).held.locale).toBe('fr')
  for (const tab of [page, other]) {
    const { held, saved } = await settingsOf(tab)
    expect([held.name, held.locale, saved.name, saved.locale]).toEqual(['Mia', 'fr', 'Mia', 'fr'])
  }
  await expect((await openTasks(page)).locator('.profile-name')).toHaveText('Mia')
})
