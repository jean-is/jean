// Compaction (D359): a conversation past 3/4 of its brain's window is summed up by that brain before it answers,
// and read on from the summary; the room shows the conversation whole, a line where it happened, and the summary to read.
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { start, connectFakeBrain, ask } from './helpers.js'

/** @param {string} lang */
const strings = async (lang) => JSON.parse(await readFile(new URL(`../app/locales/compact/${lang}.json`, import.meta.url), 'utf8'))

for (const lang of ['en', 'ar', 'ja']) {
  test(`a conversation near its window is summed up and read on from, the room showing it whole (${lang})`, async ({ page }) => {
    const said = await strings(lang)
    await start(page, lang)
    await connectFakeBrain(page)
    const answers = page.locator('.msg-jean .prose')
    const idle = page.locator('.composer .send:not(.is-stop)')

    // The fake brain says it read most of its window: Compaction comes in, and nothing is summed up yet.
    await ask(page, 'Start a very long task')
    await expect(answers.last()).toContainText('Start a very long task')
    await expect(idle).toBeVisible()
    await expect(page.locator('app-compaction')).toHaveCount(0)

    // The next request is past 3/4 of it: the same brain sums up, then answers from the summary.
    await ask(page, 'Keep going')
    await expect(answers.last()).toContainText('I read on from the summary of the earlier work.')
    await expect(idle).toBeVisible()
    const line = page.locator('.turn').last().locator('.compaction')
    await expect(line.locator('summary')).toContainText(said['compact.divider'])
    await expect(line.locator('.prose')).toBeHidden()
    await line.locator('summary').click()
    await expect(line.locator('.prose')).toHaveText('Summary: the user wants the work carried on, step by step.')
    await expect(line.locator('.prose')).toHaveAttribute('dir', 'auto')
    // The request that wrote it is a line of the activity; the conversation stays whole on screen.
    await page.locator('.turn').last().locator('.activity > summary').click()
    await expect(page.locator('.turn').last().locator('.activity-list')).toContainText(said['compact.done'])
    await expect(page.locator('.msg-user')).toHaveCount(2)
    await expect(answers.first()).toContainText('Start a very long task')

    // The next turn reads on from the summary too, and isn't summed up again.
    await ask(page, 'And then?')
    await expect(answers.last()).toContainText('I read on from the summary of the earlier work.')
    await expect(idle).toBeVisible()
    await expect(page.locator('.turn').last().locator('.compaction')).toHaveCount(0)
    await expect(page.locator('.compaction')).toHaveCount(1)
  })
}
