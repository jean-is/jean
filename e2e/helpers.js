// Shared steps: a fresh Jean in a given language, with the fake brain connected.
import { expect } from '@playwright/test'

export const BRAIN_URL = 'http://127.0.0.1:4181/v1'
export const SALES = 'region,month,sales\nNorth,Jan,1200\nSouth,Jan,950\nNorth,Feb,1340\nSouth,Feb,1010\nEast,Jan,700\nEast,Feb,815\n'

/** @param {import('@playwright/test').Page} page @param {string} [lang] */
export async function start(page, lang = 'en') {
  await page.goto('./')
  await expect(page.locator('.hero-question')).toBeVisible()
  await page.locator('.bar .language select').selectOption(lang)
  await expect(page.locator('html')).toHaveAttribute('lang', lang)
}

/** Connects the fake brain through "On your computer" → Other. @param {import('@playwright/test').Page} page */
export async function connectFakeBrain(page) {
  await page.locator('.brain-chip').click()
  const dialog = page.locator('app-brain-dialog dialog[open]')
  const local = dialog.locator('.choice').filter({ has: page.locator('input[name="baseURL"]') })
  await local.locator('select').selectOption('custom')
  await local.locator('input[name="baseURL"]').fill(BRAIN_URL)
  await local.locator('button.button').click()
  await expect(dialog).toBeHidden()
}

/** @param {import('@playwright/test').Page} page @param {string} text */
export async function ask(page, text) {
  await page.locator('#prompt').fill(text)
  await page.locator('#prompt').press('Enter')
}
