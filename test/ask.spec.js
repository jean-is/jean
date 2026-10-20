// Questions for the user (D146, D343): the brain asks everything it needs at once, and the top of
// the box takes the questions one at a time, the answer Jean recommends picked already, with room
// for the user's own words, Skip and Back; then every answer goes back to the brain. The fake
// brain asks three questions before writing a letter.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask } from './helpers.js'

test('Jean asks its questions one at a time, and reads every answer back', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Write a letter to my bank')
  const card = page.locator('.composer app-ask .ask')
  await expect(card).toHaveAttribute('aria-label', '3 questions for you')
  await expect(card.locator('.ask-progress')).toHaveText('Question 1 of 3')
  await expect(card.locator('.ask-question')).toHaveText('Which tone should the letter have?')
  // What Jean recommends is picked already, and says so.
  const formal = card.locator('.choice-option', { hasText: 'Formal' })
  await expect(formal.locator('.ask-recommended')).toHaveText('Recommended')
  await expect(formal.locator('input')).toBeChecked()
  await expect(formal).toContainText('For a bank or an office')
  await card.locator('.button.primary').click()

  // Several answers can be picked here, and the user's own words go beside them.
  await expect(card.locator('.ask-progress')).toHaveText('Question 2 of 3')
  await expect(card.locator('.button.primary')).toBeDisabled()
  await card.locator('.choice-option', { hasText: 'A refund' }).click()
  await card.locator('.ask-own-text').fill('A new card')
  await expect(card.locator('.ask-own input[type="checkbox"]')).toBeChecked()
  // Back keeps what was answered, both ways.
  await card.locator('.button', { hasText: 'Back' }).click()
  await expect(card.locator('.ask-progress')).toHaveText('Question 1 of 3')
  await expect(formal.locator('input')).toBeChecked()
  await card.locator('.button.primary').click()
  await expect(card.locator('.choice-option', { hasText: 'A refund' }).locator('input')).toBeChecked()
  await expect(card.locator('.ask-own-text')).toHaveValue('A new card')
  await card.locator('.button.primary').click()

  // The last question sends: skipped, it goes back as skipped.
  await expect(card.locator('.ask-progress')).toHaveText('Question 3 of 3')
  await expect(card.locator('.button.primary')).toHaveText('Send')
  await card.locator('.button', { hasText: 'Skip' }).click()
  await expect(card).toHaveCount(0)
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Which tone should the letter have? Formal')
  await expect(answer).toContainText('What should it ask for? A refund, A new card')
  await expect(answer).toContainText('Who signs it? You skipped it.')

  // What was asked, and what came back, in the activity view; the tool in the prompt.
  await page.locator('.activity > summary').last().click()
  await expect(page.locator('.activity-list li', { hasText: '3 questions for you' })).toContainText('Which tone should the letter have?')
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system))
    .toContain('- ask_user: ask the user questions, with answers to pick from')
})

test('the user’s own words answer a question, and Enter goes on', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Write a letter to my landlord')
  const card = page.locator('.composer app-ask .ask')
  // Typing picks "something else" in place of what was recommended.
  await card.locator('.ask-own-text').fill('Firm but polite')
  await expect(card.locator('.ask-own input[type="radio"]')).toBeChecked()
  await expect(card.locator('.choice-option', { hasText: 'Formal' }).locator('input')).not.toBeChecked()
  await card.locator('.ask-own-text').press('Enter')
  await card.locator('.button', { hasText: 'Skip' }).click()
  // A question with nothing to pick is a field.
  await expect(card.locator('.ask-question')).toHaveText('Who signs it?')
  await card.locator('input[name="answer"]').fill('Sam')
  await card.locator('input[name="answer"]').press('Enter')
  // Enter went to the questions, never to the box they are in.
  await expect(page.locator('.msg-user')).toHaveCount(1)
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Which tone should the letter have? Firm but polite')
  await expect(answer).toContainText('What should it ask for? You skipped it.')
  await expect(answer).toContainText('Who signs it? Sam')
})

test('the box’s words answer the question on screen, and the keyboard stays in the box (D343)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Write a letter to my bank')
  const card = page.locator('.composer app-ask .ask')
  const box = page.locator('#prompt')
  await expect(box).toHaveAttribute('placeholder', 'Your answer')
  await box.fill('Firm but polite')
  // With words in it, the box's button answers rather than stops.
  await expect(page.locator('.send')).toHaveAccessibleName('Send')
  await box.press('Enter')
  await expect(card.locator('.ask-progress')).toHaveText('Question 2 of 3')
  await expect(box).toHaveValue('')
  await expect(box).toBeFocused()
  // Beside the answers picked, when several can be.
  await card.locator('.choice-option', { hasText: 'A refund' }).click()
  await box.fill('A new card')
  await page.locator('.send').click()
  await box.fill('Sam')
  await box.press('Enter')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Which tone should the letter have? Firm but polite')
  await expect(answer).toContainText('What should it ask for? A refund, A new card')
  await expect(answer).toContainText('Who signs it? Sam')
  await expect(page.locator('.msg-user')).toHaveCount(1)
  await expect(box).toHaveAttribute('placeholder', 'Ask anything, or describe a task…')
})

test('questions the page was closed on are asked again as the conversation opens, and the answer goes on from there (D212)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit runs here like a private window: nothing is kept for the next visit')
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Write a letter to my bank')
  const card = page.locator('.composer app-ask .ask')
  await expect(card.locator('.ask-progress')).toHaveText('Question 1 of 3')
  await page.reload()
  await expect(page.locator('.msg-user')).toHaveText('Write a letter to my bank')
  await expect(card.locator('.ask-progress')).toHaveText('Question 1 of 3')
  await card.locator('.button.primary').click()
  await card.locator('.choice-option', { hasText: 'A refund' }).click()
  await card.locator('.button.primary').click()
  await card.locator('.button', { hasText: 'Skip' }).click()
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Which tone should the letter have? Formal')
  await expect(answer).toContainText('What should it ask for? A refund')
  // One answer, where the questions show once.
  await expect(page.locator('.msg-jean')).toHaveCount(1)
  await page.locator('.activity > summary').last().click()
  await expect(page.locator('.activity-list li', { hasText: '3 questions for you' })).toHaveCount(1)
  // Opened again once it is written, it is done: nothing is asked.
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  await page.reload()
  await expect(answer).toContainText('What should it ask for? A refund')
  await expect(card).toHaveCount(0)
})

for (const [lang, dir, step, send] of [['ar', 'rtl', 'السؤال {n} من {count}', 'إرسال'], ['ja', 'ltr', '質問 {n} / {count}', '送信']]) {
  test(`the questions’ card speaks the user’s language (${lang})`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    await ask(page, 'Write a letter to my bank')
    const card = page.locator('.composer app-ask .ask')
    await expect(page.locator('html')).toHaveAttribute('dir', dir)
    // Its numbers as this browser writes them in the language: WebKit on Linux writes Arabic's in its own digits.
    const [n, count] = await page.evaluate(() => [1, 3].map((number) => new Intl.NumberFormat(document.documentElement.lang).format(number)))
    await expect(card.locator('.ask-progress')).toHaveText(step.replace('{n}', n).replace('{count}', count))
    await card.locator('.button.primary').click()
    await card.locator('.button:not(.primary, .subtle)').click()
    await expect(card.locator('.button.primary')).toHaveText(send)
  })
}
