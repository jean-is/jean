// Helpers, the decision inbox, Double-check, "Since last time" and assistant names (0.6). The
// version's done-when: a large task is split, approved step by step, and the result is verified
// against its sources. The fake brain splits a briefing between two helpers, each reading one
// email from the fake mail service (test/fixtures/fake-mail.js).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, connect, MAIL_URL } from './helpers.js'

/** @param {import('@playwright/test').Page} page */
const system = (page) => page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system)

test('a large task is split among helpers, approved step by step, and checked against its sources', async ({ page }) => {
  await start(page)
  await connect(page, `${MAIL_URL}/mcp`)
  await connectFakeBrain(page)
  await turnOn(page, 'Helpers')
  await page.keyboard.press('Escape')
  await turnOn(page, 'Double-check')
  await page.keyboard.press('Escape')

  await ask(page, 'Prepare my Monday briefing from my emails')
  // Two helpers work at once, and each asks before reading: two cards wait in the inbox.
  const cards = page.locator('.inbox .approval')
  await expect(cards).toHaveCount(2)
  await expect(page.locator('.inbox-count')).toHaveText('2 decisions are waiting for you')
  // In the order the helpers asked, each saying which part it is for.
  await expect(cards.filter({ hasText: 'Bakery orders' })).toContainText('Mail: Search emails')
  await expect(cards.filter({ hasText: 'Bills to pay' })).toContainText('Mail: Search emails')
  // Answered one at a time.
  await cards.first().locator('.button.primary').click()
  await expect(cards).toHaveCount(1)
  await expect(page.locator('.inbox-count')).toHaveCount(0)
  await cards.first().locator('.button.primary').click()

  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Your Monday briefing')
  await expect(answer).toContainText('120 croissants')
  await expect(answer).toContainText('912 euros')
  await expect(answer.locator('.cite')).toHaveCount(3)
  // Verified against the sources: two claims are in their email, one isn't.
  const check = page.locator('app-check .check')
  await expect(check.locator('summary')).toHaveText('2 claims match their sources · 1 claim isn’t supported by its source')
  // Folded until opened, even with a claim that isn't supported.
  await expect(check).not.toHaveAttribute('open')
  await check.locator('summary').click()
  await expect(check.locator('.follow-up')).toBeVisible()
  await expect(check.locator('[data-verdict="supported"]')).toHaveCount(2)
  await expect(check.locator('[data-verdict="missing"]')).toContainText('The bakery is closed on Monday')
  await expect(check.locator('.follow-up')).toHaveText('Correct what the sources don’t support')

  // What each helper did, under its part, in the activity view.
  await page.locator('.activity > summary').last().click()
  await expect(page.locator('.activity-list li[data-depth="0"]')).toContainText(['Split the work among helpers'])
  await expect(page.locator('.activity-list li[data-depth="1"]')).toContainText(['Bakery orders', 'Bills to pay'])
  await expect(page.locator('.activity-list li[data-depth="2"]', { hasText: 'Mail: Search emails' })).toHaveCount(2)
  // The helpers' tools stay theirs: the conversation still finds mail tools with find_tools.
  expect(await page.evaluate(async () => {
    const { frozenPrompt } = await import('/core/prompt.js')
    return frozenPrompt((await import('/ui/state.js')).app.current.value?.records ?? [])?.state.tools
  })).not.toContain('mail_search_emails')
  expect(await system(page)).toContain('- delegate: hand independent parts of a large task to helpers')
})

test('a helper’s question waits in the box, its approval in the inbox', async ({ page }) => {
  await start(page)
  await connect(page, `${MAIL_URL}/mcp`)
  await connectFakeBrain(page)
  await turnOn(page, 'Helpers')
  await page.keyboard.press('Escape')
  await ask(page, 'Plan the staff party')
  const question = page.locator('.composer app-ask .ask')
  await expect(question).toContainText('How many people are coming?')
  await expect(question.locator('.approval-from')).toHaveText('Guests')
  await expect(page.locator('.inbox .approval', { hasText: 'Mail: Search emails' })).toBeVisible()
  // The question first, the approval after: in any order.
  await question.locator('input[name="answer"]').fill('12')
  await question.locator('input[name="answer"]').press('Enter')
  await page.locator('.inbox .approval .button.primary').click()
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('12 people are coming.')
  await expect(answer).toContainText('912 euros')
})

test('back after time away, Jean starts with a brief of what’s new, reading only', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit runs here like a private window: nothing is kept for the next visit')
  await start(page)
  await connect(page, `${MAIL_URL}/mcp`)
  await connectFakeBrain(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('since'))
  // Kept as found before the page comes again: settings are written a moment after.
  await expect.poll(() => page.evaluate(async () => JSON.parse(await (await import('/ui/state.js')).app.fs.read('settings.json') ?? '{}').unlocked ?? [])).toContain('since')
  // Last on screen two days ago.
  // Kept per profile (D228).
  await page.addInitScript(() => localStorage.setItem(`app.seen:${sessionStorage.getItem('app.profile') ?? ''}`, String(Date.now() - 2 * 86_400_000)))
  await page.reload()
  await expect(page.locator('.since')).toHaveText('Since last time · 2 days ago')
  await expect(page.locator('.since-note')).toHaveText('Work stops while this tab is closed, so this was read just now.')
  await expect(page.locator('.msg-user')).toHaveText('What’s new since last time?')
  // Reading asks first, as always; sending is refused without asking, whatever the rules say.
  await page.locator('.inbox .approval', { hasText: 'Mail: Search emails' }).locator('.button.primary').click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Your 3 latest emails')
  await expect(page.locator('.inbox')).toHaveCount(0)
  await page.locator('.activity > summary').last().click()
  await expect(page.locator('.activity-list li[data-status="failed"]')).toContainText('Mail: Send an email')
})

test('a project’s assistant gets a name and a way of being', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Projects')
  const dialog = page.locator('app-project-dialog dialog[open]')
  await dialog.locator('input[name="name"]').fill('Bakery')
  await dialog.locator('.button.primary').click()
  await expect(page.locator('app-projects .wordmark')).toHaveText('Bakery')
  // Turned on from the house, it opens this project's dialog.
  await turnOn(page, 'Assistant names')
  await expect(dialog.locator('input[name="assistant"]')).toHaveAttribute('placeholder', 'Jean')
  await dialog.locator('input[name="assistant"]').fill('Margot')
  await dialog.locator('textarea[name="persona"]').fill('Warm and brief.')
  await dialog.locator('.button.primary').click()
  await expect(dialog).toBeHidden()
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const prompt = await system(page)
  expect(prompt).toMatch(/^You are Margot, an assistant/)
  expect(prompt).toContain('<project>\nBakery\nThe user calls you Margot here.\nHow to be: Warm and brief.\n</project>')
})

for (const [lang, dir] of [['en', 'ltr'], ['ar', 'rtl'], ['ja', 'ltr']]) {
  test(`Double-check is offered once citations are in regular use (${lang})`, async ({ page }) => {
    await start(page, lang)
    await page.evaluate(async () => (await import('/ui/state.js')).updateSettings({ cited: 3 }))
    await expect(page.locator('aside.offer')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('dir', dir)
    await page.locator('aside.offer .button.primary').click()
    await expect(page.locator('aside.offer')).toBeHidden()
    expect(await page.evaluate(async () => (await import('/ui/caps.js')).loaded.value.has('check'))).toBe(true)
  })
}
