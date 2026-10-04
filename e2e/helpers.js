// Shared steps: a fresh Jean in a given language, with the fake brain connected.
import { expect } from '@playwright/test'

export const BRAIN_URL = 'http://127.0.0.1:4181/v1'
export const MAIL_URL = 'http://127.0.0.1:4182'
export const SALES = 'region,month,sales\nNorth,Jan,1200\nSouth,Jan,950\nNorth,Feb,1340\nSouth,Feb,1010\nEast,Jan,700\nEast,Feb,815\n'

/** @param {import('@playwright/test').Page} page @param {string} [lang] */
export async function start(page, lang = 'en') {
  await page.goto('./')
  await expect(page.locator('.hero-question')).toBeVisible()
  // The box has the keyboard from the start.
  await expect(page.locator('#prompt')).toBeFocused()
  // The language is picked in Settings, its first choice.
  const settings = await openSettings(page)
  await settings.locator('.settings-panel select').first().selectOption(lang)
  await expect(page.locator('html')).toHaveAttribute('lang', lang)
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
}

/** Connects the fake brain through Settings' Brains, "On your computer" → Other. @param {import('@playwright/test').Page} page */
export async function connectFakeBrain(page) {
  await page.locator('.brain-chip').click()
  const dialog = page.locator('app-settings dialog[open]')
  // One way to add a brain is open at a time (D134).
  const local = dialog.locator('.way.is-local')
  await local.locator('summary').click()
  await local.locator('select').selectOption('custom')
  await local.locator('input[name="baseURL"]').fill(BRAIN_URL)
  await local.locator('.button.primary').click()
  await expect(dialog).toBeHidden()
}

/** @param {import('@playwright/test').Page} page @param {string} text */
export async function ask(page, text) {
  await page.locator('#prompt').fill(text)
  await page.locator('#prompt').press('Enter')
}

/**
 * Opens Settings from the foot of the conversations: Mail's list when it is in view, otherwise
 * the drawer (D115). On one of its sections when named as its menu says (D113).
 * @param {import('@playwright/test').Page} page @param {string} [section]
 */
export async function openSettings(page, section) {
  const list = page.locator('app-inbox .sidebar-settings')
  if (await list.isVisible()) await list.click()
  else {
    await page.locator('.bar > .icon-button').first().click()
    await page.locator('app-history dialog[open] .sidebar-settings').click()
  }
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings).toBeVisible()
  if (section) await settings.locator('.settings-nav button', { hasText: section }).click()
  return settings
}

/** Turns a capability on from the house ("What Jean can do", in Settings): its trophy, then its plaque. @param {import('@playwright/test').Page} page @param {string} name */
export async function turnOn(page, name) {
  const house = (await openSettings(page, 'Capabilities')).locator('.house')
  await house.locator('.trophy', { hasText: name }).click()
  await house.locator('.plaque .button').click()
  // Lit once its module has loaded, so a message sent next declares its tools; or, for one that
  // leads somewhere at once (Connections), Settings is on its section (D134).
  await expect(page.locator('app-settings .trophy.is-lit', { hasText: name })
    .or(page.locator('app-settings .settings-nav [aria-current="page"]', { hasText: name }))).toHaveCount(1)
}

/** Connects a service from the house by its address, in Settings' Connections, and waits until its tools are listed. @param {import('@playwright/test').Page} page @param {string} url */
export async function connect(page, url) {
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  // The services Jean knows come first; an address is one step down.
  await dialog.locator('details.other summary').click()
  await dialog.locator('input[name="url"]').fill(url)
  await dialog.locator('input[name="name"]').fill('Mail')
  await dialog.locator('.button.primary').click()
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  await expect(dialog.locator('.connection')).toContainText('Search emails · Read an email · Send an email')
  await page.keyboard.press('Escape')
}
