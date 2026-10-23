// How much a brain thinks (D414): one that thinks at length, with nothing written yet, can be told to answer now, and answers
// at once, asked to think little; the first time, a toast leads to Settings › Brains, where the brain then has Thinking, which
// goes with its next requests. The fake brain thinks on when asked to think it over.
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { start, connectFakeBrain, ask, closeSettings } from './helpers.js'

/** @param {string} lang @param {string} [part] @returns {Promise<Record<string, string>>} */
const strings = async (lang, part = '') => JSON.parse(await readFile(new URL(`../app/locales/${part}${lang}.json`, import.meta.url), 'utf8'))

/** The next request the brain is asked, titles aside. @param {import('@playwright/test').Page} page */
const nextRequest = (page) => page.waitForRequest((request) => request.url().endsWith('/chat/completions') && !request.postData()?.includes('Write a title'))

for (const lang of /** @type {const} */ (['en', 'ar', 'ja'])) {
  test(`told to answer now, a brain thinking at length answers at once; then each brain’s thinking can be set (${lang})`, async ({ page }) => {
    const [room, brains] = await Promise.all([strings(lang), strings(lang, 'brains/')])
    await start(page, lang)
    await connectFakeBrain(page)
    const first = nextRequest(page)
    await ask(page, 'Think it over')
    // Without Intuition, the brain thinks as it would.
    expect((await first).postDataJSON().reasoning_effort).toBeUndefined()
    const now = page.getByRole('button', { name: room['activity.answerNow'] })
    await expect(now).toBeVisible()
    const hurried = nextRequest(page)
    await now.click()
    expect((await hurried).postDataJSON().reasoning_effort).toBe('low')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is my answer, thinking low.')
    await expect(now).toHaveCount(0)
    await expect(page.locator('.activity .step summary').last()).toContainText(room['activity.hurried'])

    // The first time, a toast leads to Settings › Brains, where the brain's page now has Thinking, left to Auto (D514).
    const toast = page.locator('.toast', { hasText: room['thinking.found'] })
    await expect(toast).toBeVisible()
    await toast.getByRole('button', { name: room['settings.title'] }).click()
    const settings = page.locator('app-settings dialog[open]')
    await settings.locator('.brain-rows button').first().click()
    const thinking = settings.locator('label', { hasText: brains['brain.thinking'] }).locator('select')
    await expect(thinking).toHaveValue('')
    await thinking.selectOption('low')
    await closeSettings(page)
    const quick = nextRequest(page)
    await ask(page, 'Hello there')
    expect((await quick).postDataJSON().reasoning_effort).toBe('low')
  })
}
