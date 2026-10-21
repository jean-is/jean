// A demo (D457): a task Jean did, played again in the room's own conversation from its file, keeping
// and sending nothing: its request with its file, then its answer written as it came, the brain asked
// and a call under way, then done, with its chart; and with wait, the next request only once its
// follow-up is pressed. In English, Arabic and Japanese, the room's words and direction.
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

const TASK = await readFile(new URL('./fixtures/demo.jsonl', import.meta.url), 'utf8')

for (const [lang, dir, answered] of [['en', 'ltr', 'Answered with OpenRouter · claude-sonnet-5.5'], ['ar', 'rtl', 'OpenRouter'], ['ja', 'ltr', 'OpenRouter']]) {
  test(`a task plays again as Jean wrote it, its follow-up playing the next request (${lang})`, async ({ page }) => {
    /** What went wrong on the page, and what it asked for beyond Jean's own files. @type {string[]} */
    const wrong = []
    page.on('console', (message) => { if (message.type() === 'error') wrong.push(message.text()) })
    page.on('pageerror', (error) => wrong.push(error.message))
    await page.route('**/demos/sales.jsonl', (route) => route.fulfill({ body: TASK, contentType: 'application/x-ndjson' }))
    await page.goto(`demo.html#src=demos/sales.jsonl&wait&lang=${lang}`)
    await expect(page.locator('html')).toHaveAttribute('dir', dir)
    await expect(page.locator('.conversation-title')).toHaveText('Sales by region')
    await expect(page.locator('.msg-files .file-chip')).toHaveText('Sales.csv')
    await expect(page.locator('.msg-user')).toHaveText('Make a chart of the sales by region, month by month')
    const answer = page.locator('.msg-jean').first()
    // Written as it came: the brain asked, then the call, under way and then done.
    await expect(answer).toHaveClass(/is-streaming/)
    await expect(answer.locator('.activity-list [data-call="call-1"]')).toHaveAttribute('data-status', 'completed')
    await expect(answer).not.toHaveClass(/is-streaming/)
    await expect(answer.locator('.activity > summary')).toContainText(answered)
    await expect(answer.locator('.prose')).toContainText('East')
    await expect(answer.locator('app-chart .chart canvas')).toBeVisible()
    // With wait, the next request comes only once its follow-up is pressed.
    const next = page.locator('.follow-up', { hasText: 'Which region should we look at first?' })
    await expect(next).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.locator('.msg-user')).toHaveCount(1)
    await next.click()
    await expect(page.locator('.msg-user')).toHaveCount(2)
    await expect(page.locator('.msg-jean').nth(1).locator('.prose')).toContainText('South')
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    // Kept nowhere: the page's storage holds nothing of it.
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
    expect(wrong).toEqual([])
  })
}
