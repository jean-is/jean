// About this answer (D252): under an answer, a button shows on hover how long it took, what it cost
// and where it was done, a shield when that was on this device; a click keeps the card, which saves
// the answer's certificate, sealed with this device's key. An answer whose request reached an
// address outside this device says so, and where.
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, MAIL_URL, BRAIN_URL } from './helpers.js'

for (const [lang, about, local, free, save] of [
  ['en', 'About this answer', 'Done on this device', 'Free', 'Save the certificate'],
  ['ar', 'عن هذه الإجابة', 'أُنجزت على هذا الجهاز', 'مجانًا', 'حفظ الشهادة'],
  ['ja', 'この回答について', 'この端末で完結', '無料', '証明書を保存'],
]) {
  test(`an answer done on this device says so, and saves a sealed certificate (${lang})`, async ({ page }) => {
    await start(page, lang)
    // The fake brain is on this computer, as Ollama would be.
    await connectFakeBrain(page)
    await ask(page, 'Hello')
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    const button = page.locator('.msg-jean .msg-actions').last().getByRole('button', { name: about })
    // A shield, once the browser's record of what the page reached is kept, a moment after the answer.
    await expect(button).toHaveClass(/is-local/)
    const card = page.locator('.receipt')
    await expect(card).toBeHidden()
    // On hover, its card being its only tip (D233), then kept by a click.
    await button.hover()
    await expect(card).toBeVisible()
    await expect(page.locator('.tip')).toBeHidden()
    await button.click()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(500)
    await expect(card).toBeVisible()
    await expect(card.locator('.receipt-verdict')).toHaveText(local)
    await expect(card.locator('dd').nth(1)).toHaveText(free)
    // Within the window, beside its button.
    const [box, at] = await Promise.all([card.boundingBox(), button.boundingBox()])
    expect(box && at && box.x >= 0 && box.x + box.width <= (page.viewportSize()?.width ?? 0) && Math.abs(box.y + box.height - at.y) < 12).toBe(true)
    const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: save }).click()])
    const saved = JSON.parse(await readFile(await download.path(), 'utf8'))
    expect(saved).toMatchObject({ kind: 'certificate', local: true, recorded: true, brains: [{ provider: 'custom', local: true }] })
    expect(JSON.stringify(saved)).not.toContain('Hello')
    // Anyone can check its seal with the key it carries; a change breaks it.
    const checked = await page.evaluate(async (certificate) => {
      const { verify } = await import('/caps/receipt/certificate.js')
      return [await verify(certificate), await verify({ ...certificate, local: false })]
    }, saved)
    expect(checked).toEqual([true, false])
    await page.keyboard.press('Escape')
    await expect(card).toBeHidden()
    // From the keyboard, at once, as a tip comes (WebKit's Tab skips buttons, as Safari's does by default).
    await page.locator('#prompt').focus()
    await page.keyboard.press('Shift')
    await button.focus()
    await expect(card).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(card).toBeHidden()
  })
}

test('an answer whose request reached outside this device says where', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // Wikipedia's address comes from settings or policy; here, one outside this device, which the fake service answers.
  await page.route('https://wiki.example.com/**', async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace('https://wiki.example.com', MAIL_URL) }) }))
  await page.evaluate(async () => (await import('/ui/state.js')).updateSettings({ urls: { wikipedia: 'https://wiki.example.com/wiki/{lang}/w/api.php' } }))
  await turnOn(page, 'Web search')
  await page.keyboard.press('Escape')
  await ask(page, 'Search the web for lighthouse')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what the web says')
  const button = page.locator('.msg-jean .msg-actions').last().getByRole('button', { name: 'About this answer' })
  await expect(button).toHaveClass(/is-out/)
  await button.click()
  const card = page.locator('.receipt')
  await expect(card.locator('.receipt-verdict')).toHaveText('Sent outside this device')
  await expect(card.locator('dd').last()).toHaveText('wiki.example.com')
})

test('an answer in the cloud costs what its provider’s prices say, from models.dev when the provider lists none (D255)', async ({ page }) => {
  await start(page)
  // A brain in the cloud, which the fake brain answers for, and models.dev's catalogue, read once.
  await page.route('https://api.openai.example/v1/**', async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace('https://api.openai.example', BRAIN_URL.replace(/\/v1$/, '')) }) }))
  let read = 0
  await page.route('https://models.dev/api.json', (route) => {
    read++
    return route.fulfill({ json: { openai: { models: { 'gpt-6-sol': { cost: { input: 2, output: 8, cache_read: 0.2 } } } } } })
  })
  await page.evaluate(() => import('/ui/brains.js').then(({ addBrain }) => addBrain({ id: 'cloud', provider: 'openai', api: 'openai', baseURL: 'https://api.openai.example/v1', model: 'gpt-6-sol' })))
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  expect(read).toBe(0)
  const button = page.locator('.msg-jean .msg-actions').last().getByRole('button', { name: 'About this answer' })
  await button.click()
  const card = page.locator('.receipt')
  await expect(card.locator('.receipt-verdict')).toHaveText('Sent outside this device')
  await expect(card.locator('dd').nth(1)).toHaveText(/^about \$0\.0\d+$/)
  await expect(card.locator('dd').last()).toHaveText('api.openai.example')
  expect(read).toBe(1)
  // Open again, from what was kept.
  await page.keyboard.press('Escape')
  await button.click()
  await expect(card.locator('dd').nth(1)).toHaveText(/^about \$/)
  expect(read).toBe(1)
})
