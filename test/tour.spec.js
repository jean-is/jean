// A guided tour over a demo (D460): its stops show at the moments the tour names, each pointing at what
// shows then, and go on after a while, with Next or a clicker's Page Down, holding the replay meanwhile, or
// once the viewer clicks what they point at, a follow-up that plays the next request. Its words are the
// page's language's where it has them, and Next is Jean's own, in English, Arabic and Japanese.
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

const TASK = await readFile(new URL('./fixtures/demo.jsonl', import.meta.url), 'utf8')
const TOUR = await readFile(new URL('./fixtures/demo.tour.json', import.meta.url), 'utf8')

for (const [lang, first, next, last] of [['en', 'A real task', 'Next', 'That is all'], ['ar', 'مهمة حقيقية', 'التالي', 'هذا كل'], ['ja', '本物のタスク', '次へ', 'これだけ']]) {
  test(`a tour stops where it says, on its own, with Next or the viewer's click (${lang})`, async ({ page }) => {
    /** @type {string[]} */
    const wrong = []
    page.on('console', (message) => { if (message.type() === 'error') wrong.push(message.text()) })
    page.on('pageerror', (error) => wrong.push(error.message))
    await page.route('**/demos/sales.jsonl', (route) => route.fulfill({ body: TASK }))
    await page.route('**/demos/sales.tour.json', (route) => route.fulfill({ body: TOUR, contentType: 'application/json' }))
    await page.goto(`demo.html#src=demos/sales.jsonl&tour=demos/sales.tour.json&lang=${lang}`)
    const bubble = page.locator('#app-tour')
    // Before anything, alone, in the page's language; then on the request once it shows, each going on by itself.
    await expect(bubble).toContainText(first)
    await expect(bubble).toHaveClass(/is-alone/)
    await expect(page.locator('.msg-user')).toHaveCount(0)
    await expect(bubble).toContainText('in your own words')
    await expect(page.locator('.msg-user.is-toured')).toBeVisible()
    await expect(bubble.getByRole('button')).toHaveCount(0)
    // As the call starts: its step shows, opened, and stays under way until Next.
    const call = page.locator('[data-call="call-1"]')
    await expect(bubble).toContainText('step by step')
    await expect(call).toHaveClass(/is-toured/)
    await expect(call).toBeVisible()
    await page.waitForTimeout(1500)
    await expect(call).toHaveAttribute('data-status', 'in_progress')
    await bubble.getByRole('button', { name: next }).click()
    await expect(call).toHaveAttribute('data-status', 'completed')
    // The list it opened closes again, as the room shows it.
    await expect(call).toBeHidden()
    // Once the answer is written: its chart, then a clicker's Page Down goes on.
    await expect(bubble).toContainText('a chart')
    await expect(page.locator('app-chart.is-toured')).toBeVisible()
    await page.keyboard.press('PageDown')
    // The follow-up, which only the viewer's click goes on from, and plays the next request.
    await expect(bubble).toContainText('Press a follow-up')
    await expect(bubble.getByRole('button')).toHaveCount(0)
    await page.waitForTimeout(500)
    await expect(page.locator('.msg-user')).toHaveCount(1)
    await page.locator('.follow-up.is-toured').click()
    await expect(page.locator('.msg-user')).toHaveCount(2)
    await expect(page.locator('.msg-jean').nth(1).locator('.prose')).toContainText('South')
    await expect(bubble).toContainText(last)
    await expect(bubble).toBeHidden()
    await expect(page.locator('.is-toured')).toHaveCount(0)
    expect(wrong).toEqual([])
  })
}
