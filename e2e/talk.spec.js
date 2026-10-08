// Talk (0.1) and reply suggestions (0.3): an answer streams in, titled meanwhile, its follow-ups become
// buttons, the room flips to right-to-left in Arabic, and from dark to light. Settings opens over
// the conversation, in the address (D137), and a reload comes back to the line being read.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings } from './helpers.js'

test('an answer, then its follow-ups as buttons', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  // Its title comes from a second request, while the answer is still being written.
  await expect(page.locator('.conversation-title')).toHaveText('Explain photosynthesis simple')
  await expect(page.locator('.send.is-stop')).toBeVisible()
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Here is what I found')
  await expect(answer).not.toContainText('suggestions')
  const followUps = page.locator('.follow-ups .follow-up')
  await expect(followUps).toHaveCount(3)
  await followUps.first().click()
  await expect(page.locator('.msg-user')).toHaveCount(2)
  await expect(page.locator('.msg-user').last()).toHaveText('Show it as a chart')
})

test('under a request, when it was asked, Copy and Try again; under an answer, when it came (D188)', async ({ page }) => {
  // The clipboard is the browser's: record what reaches it.
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', { value: async (/** @type {string} */ text) => { /** @type {any} */ (window).copied = text } })
  })
  await page.clock.install()
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  const requests = page.locator('.msg-actions.is-request')
  const answered = page.locator('.msg-jean .msg-actions time')
  await expect(requests.first().locator('time')).toHaveText('now')
  await expect(answered).toHaveText('now')
  // The times move on by themselves.
  await page.clock.fastForward('03:00')
  await expect(requests.first().locator('time')).toHaveText('3 minutes ago')
  await expect(answered).toHaveText('3 minutes ago')

  await requests.first().getByRole('button', { name: 'Copy' }).click()
  await expect(page.locator('.toast')).toContainText('Copied')
  expect(await page.evaluate(() => /** @type {any} */ (window).copied)).toBe('Explain photosynthesis in simple words')

  // While a request is being answered, it can't be tried again; one before it can.
  await ask(page, 'Write a letter to my bank')
  await expect(page.locator('.inbox app-ask form.approval')).toBeVisible()
  await expect(requests.last().getByRole('button', { name: 'Try again' })).toBeDisabled()
  const again = requests.first().getByRole('button', { name: 'Try again' })
  await expect(again).toBeEnabled()
  // Only once the user agrees.
  page.once('dialog', (dialog) => dialog.dismiss())
  await again.click()
  await expect(page.locator('.msg-user')).toHaveCount(2)
  await expect(page.locator('.inbox app-ask form.approval')).toBeVisible()
  // Then the answer being written stops, everything after the request goes, and it is answered again.
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('Everything after it in this task will be removed')
    dialog.accept()
  })
  await again.click()
  await expect(page.locator('.msg-user')).toHaveCount(1)
  await expect(page.locator('.inbox app-ask form.approval')).toHaveCount(0)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(1)
  await expect(page.locator('.msg-jean .prose')).toContainText('Anything else?')
  await expect(page.locator('.send:not(.is-stop)')).toBeVisible()
  // The conversation's file says the same, its title kept.
  const kept = await page.evaluate(async () => {
    const [{ app }, { loadConversation }, { foldTurns }] = await Promise.all([import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    const conversation = await loadConversation(app.fs, /** @type {any} */ (app.current.value).path)
    return { requests: foldTurns(conversation?.records ?? []).map((turn) => turn.user?.text), title: conversation?.title }
  })
  expect(kept).toEqual({ requests: ['Explain photosynthesis in simple words'], title: 'Explain photosynthesis simple' })
})

test('Arabic: right to left, and the answer in Arabic', async ({ page }) => {
  await start(page, 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await connectFakeBrain(page)
  await ask(page, 'ما هي عاصمة فرنسا؟')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('إليك ما وجدته')
  await expect(page.locator('.conversation-title')).toHaveText('عاصمة فرنسا')
  await expect(page.locator('.follow-ups .follow-up').first()).toHaveText('اعرضه كرسم بياني')
})

test('Settings opens over the conversation, in the address: Back closes it, a reload keeps it', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  const place = new URL(page.url()).hash
  expect(place).toMatch(/^#\/c\/[0-9A-Z]{26}$/)
  const settings = await openSettings(page, 'Appearance')
  await expect(page).toHaveURL(`./${place}/settings/appearance`)
  // Back closes it over the same conversation, and Forward opens it again on the same section.
  await page.goBack()
  await expect(settings).toBeHidden()
  await expect(page).toHaveURL(`./${place}`)
  await expect(page.locator('.msg-user')).toHaveText('Explain photosynthesis in simple words')
  await page.goForward()
  await expect(settings.locator('[aria-current="page"]')).toHaveText('Appearance')
  // Closed, it leaves no entry behind: Back goes to where the conversation started.
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(`./${place}`)
  await page.goBack()
  await expect(page.locator('.hero-question')).toBeVisible()
  await expect(settings).toBeHidden()
  await page.goForward()
  await expect(page.locator('.msg-user')).toHaveText('Explain photosynthesis in simple words')
  // A reload shows it again, on the same section, over the same conversation.
  await openSettings(page, 'Brains')
  await expect(page).toHaveURL(`./${place}/settings/brains`)
  // Playwright's WebKit has no lasting storage (like a private window): the reload starts empty.
  const ephemeral = await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)
  await page.reload()
  await expect(settings.locator('[aria-current="page"]')).toHaveText('Brains')
  if (ephemeral) return expect(page).toHaveURL('./#/settings/brains')
  await expect(page.locator('.msg-user')).toHaveText('Explain photosynthesis in simple words')
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(`./${place}`)
})

test('a reload comes back to the same line of a long conversation, or to its end', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // Answers with a file's card (D119), above the line and in the last answer.
  const asked = ['Explain photosynthesis in simple words', 'Write the bakery plan as a Word document', 'Explain photosynthesis again', 'Write the cafe plan as a Word document']
  for (const [index, text] of asked.entries()) {
    await ask(page, text)
    await expect(page.locator('.msg-jean .msg-actions')).toHaveCount(index + 1)
  }
  await expect(page.locator('app-file .file-card')).toHaveCount(2)
  // Playwright's WebKit has no lasting storage (like a private window): the reload starts empty.
  test.skip(await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value), 'no lasting storage')
  // The cards come with their capability, after the conversation: here a second late.
  await page.route('**/caps/made/made.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await route.continue()
  })
  // Reading the last answer, near the end; then at the end, below the box's and the last card's height.
  for (const up of [300, 0]) {
    const line = await page.evaluate((up) => {
      scrollTo({ top: document.documentElement.scrollHeight - innerHeight - up, behavior: 'instant' })
      return Math.round(scrollY)
    }, up)
    await page.reload()
    await expect(page.locator('app-file .file-card')).toHaveCount(2)
    await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(line)
    expect(await page.evaluate(() => Math.round(document.documentElement.scrollHeight - innerHeight - scrollY))).toBe(up)
  }
})

test('light or dark: Auto follows the device, Light and Dark stay put', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await start(page)
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect((await openSettings(page, 'Appearance')).getByRole('radio', { name: 'Auto', exact: true })).toBeChecked()
  await page.keyboard.press('Escape')
  await pickTheme(page, 'Light')
  await expect(root).toHaveAttribute('data-theme', 'light')
  // Remembered on this device, and applied before any module runs: no flash of the night.
  await page.route('**/ui/app.js', (route) => route.abort())
  await page.reload()
  await expect(root).toHaveAttribute('data-theme', 'light')
  await page.unroute('**/ui/app.js')
  await page.reload()
  // Dark is kept even when the device shows it, and when the device changes.
  await pickTheme(page, 'Dark')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(root).toHaveAttribute('data-theme', 'dark')
  // Auto follows the device again.
  await pickTheme(page, 'Auto')
  await expect(root).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(root).toHaveAttribute('data-theme', 'dark')
})

/** Light or dark is picked in Settings' Appearance. @param {import('@playwright/test').Page} page @param {string} name */
async function pickTheme(page, name) {
  await (await openSettings(page, 'Appearance')).getByRole('radio', { name, exact: true }).check()
  await closeSettings(page)
}
