// The first brain (D329): the first message, or the brain chip, with no brain yet, shows one free way, the device's
// brain beside it where it can run, and two doors, to the plans and keys the user already has and to
// a choice of what matters, in the page under the box that keeps the request (D366). OpenRouter's sign-in is
// stopped as it leaves, or answered by the fake brain; the device is made capable and its worker replaced, as
// in device.spec.js, so no 3 GB download is needed.
import { test, expect } from '@playwright/test'
import { start, ask, connectFakeBrain, BRAIN_URL } from './helpers.js'

const WORKER = `self.onmessage = ({ data }) => {
  if (data.type === 'load') {
    self.postMessage({ id: data.id, type: 'progress', loaded: 3.11e9, total: 3.11e9 })
    self.postMessage({ id: data.id, type: 'ready' })
  }
}`

/** A device that can run the brain, its worker replaced by the one above. @param {import('@playwright/test').Page} page */
async function capable(page) {
  await page.addInitScript(() => {
    const adapter = { features: new Set(['shader-f16']) }
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: async () => adapter }) })
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => 8 })
    Object.defineProperty(StorageManager.prototype, 'estimate', { configurable: true, value: async () => ({ quota: 50e9, usage: 0 }) })
  })
  await page.route('**/caps/brain-local/brain-worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: WORKER }))
}

test('the first message opens one free way and two doors; through the plans and keys, a brain connects and the request is answered', async ({ page }) => {
  await start(page)
  await ask(page, 'Explain photosynthesis in simple words')
  const dialog = page.locator('app-first .first')
  await expect(dialog.locator('h2')).toHaveText('One step before I answer')
  // In the page, beside the box, which keeps the request (under it where all fits, else above it at the foot); it has the
  // keyboard, and nothing opens over the page.
  await expect(dialog).toBeFocused()
  await expect(page.locator('#prompt')).toHaveValue('Explain photosynthesis in simple words')
  await expect(page.locator('app-composer > app-first')).toHaveCount(1)
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await expect(page.locator('.starters, .pitch')).toHaveCount(0)
  await expect(dialog.locator('.first-free')).toHaveText('Start for free')
  await expect(dialog).toContainText('Jean has no tie to OpenRouter')
  // This browser can't run the device's brain: it isn't offered.
  await expect(dialog.locator('.first-also')).toHaveCount(0)
  await expect(page.locator('app-settings dialog[open]')).toHaveCount(0)

  await dialog.getByRole('button', { name: /I already use ChatGPT, Claude or Copilot/ }).click()
  await expect(dialog.locator('h2')).toHaveText('Which one do you use?')
  await expect(dialog.locator('.way.is-quick, .way.is-device')).toHaveCount(0)
  await expect(dialog.locator('.way.is-key')).toBeVisible()
  const local = dialog.locator('.way.is-local')
  await local.locator('summary').click()
  await local.locator('select').selectOption('custom')
  await local.locator('input[name="baseURL"]').fill(BRAIN_URL)
  await local.locator('.button.primary').click()
  await expect(dialog).toBeHidden()
  // What was asked is answered.
  await expect(page.locator('.msg-user').first()).toContainText('Explain photosynthesis')
  await expect(page.locator('.msg-jean .prose').last()).not.toBeEmpty()
})

test('a search from the browser’s bar is sent as a new task, here the first, which asks for a brain, then answered; the address forgets it (D353)', async ({ page }) => {
  await page.goto(`./?q=${encodeURIComponent('光合成を簡単に説明して & more')}`)
  const dialog = page.locator('app-first .first')
  await expect(dialog.locator('h2')).toHaveText('One step before I answer')
  await expect(page).not.toHaveURL(/[?&]q=/)
  await dialog.getByRole('button', { name: /I already use ChatGPT, Claude or Copilot/ }).click()
  const local = dialog.locator('.way.is-local')
  await local.locator('summary').click()
  await local.locator('select').selectOption('custom')
  await local.locator('input[name="baseURL"]').fill(BRAIN_URL)
  await local.locator('.button.primary').click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.msg-user')).toHaveText(['光合成を簡単に説明して & more'])
  await expect(page.locator('.msg-jean .prose').last()).not.toBeEmpty()
  await expect(page.locator('#prompt')).toHaveValue('')
})

test('with a brain already, a search from the browser’s bar is answered at once, in a task of its own (D353)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit runs here like a private window: nothing is kept for the next visit')
  await start(page)
  await connectFakeBrain(page)
  await page.goto(`./?q=${encodeURIComponent('Explain photosynthesis in simple words')}`)
  await expect(page.locator('.msg-user')).toHaveText(['Explain photosynthesis in simple words'])
  await expect(page.locator('.msg-jean .prose').last()).not.toBeEmpty()
  await expect(page.locator('app-first .first')).toHaveCount(0)
  await expect(page).toHaveURL(/\/#\/c\/[0-9A-Z]{26}$/)
})

test('the chip opens it too; what matters: the private answer says why it can’t be had here, the button says what each answer does, and Back returns', async ({ page }) => {
  await start(page)
  await page.locator('.brain-chip').click()
  const dialog = page.locator('app-first .first')
  await dialog.getByRole('button', { name: /I’d rather choose/ }).click()
  await expect(dialog.locator('h2')).toHaveText('What matters most to you?')
  const [privately, now, best] = ['My words should stay on this computer', 'I’d like to start right away', 'I want the best answers I can get'].map((name) => dialog.getByRole('radio', { name }))
  await expect(privately).toBeDisabled()
  await expect(dialog).toContainText('This computer can’t run a private brain.')
  await expect(now).toBeChecked()
  await expect(dialog.locator('.row .button.primary')).toHaveText('Start for free')
  await best.check()
  await expect(dialog.locator('.row .button.primary')).toHaveText('Continue')
  await dialog.locator('.row .button.primary').click()
  await expect(dialog.locator('h2')).toHaveText('Which one do you use?')
  await dialog.locator('.first-back').click()
  await expect(dialog.locator('h2')).toHaveText('One step before I answer')
  // Escape puts it away, and the ideas are back under the box, which has the keyboard.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.starter')).toHaveCount(4)
  await expect(page.locator('#prompt')).toBeFocused()
})

test('back from OpenRouter’s sign-in, the request is answered with the file it shared, here the sample spreadsheet (D366)', async ({ page }) => {
  await start(page)
  await page.locator('.starter', { hasText: 'Try a spreadsheet' }).click()
  await expect(page.locator('.attachment')).toContainText('sales.csv')
  await expect(page.locator('#prompt')).toHaveValue('Which product grew the most over the year? Show it as a chart.')
  await page.locator('#prompt').press('Enter')
  const step = page.locator('app-first .first')
  await expect(step).toBeFocused()
  // While it shows, no capability is offered over it (a spreadsheet offers the computer).
  await expect(page.locator('.offer')).toHaveCount(0)
  // Start for free leaves for OpenRouter's sign-in, stopped here.
  await page.route('https://openrouter.ai/**', (route) => route.abort())
  const leaving = page.waitForRequest((request) => request.url().startsWith('https://openrouter.ai/auth'))
  await step.locator('.first-free').click()
  await leaving
  // It comes back with a code, which buys a key; the brain behind OpenRouter's address is the fake one.
  await page.unroute('https://openrouter.ai/**')
  await page.route('https://openrouter.ai/api/v1/**', async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace('https://openrouter.ai/api/v1', BRAIN_URL) }) }))
  await page.route('https://openrouter.ai/api/v1/key', (route) => route.fulfill({ json: { data: {} } }))
  await page.route('https://openrouter.ai/api/v1/auth/keys', (route) => route.fulfill({ json: { key: 'sk-or-test' } }))
  await page.goto('./?code=test')
  await expect(page.locator('.msg-user')).toContainText('Which product grew the most over the year?')
  await expect(page.locator('.msg-files')).toContainText('sales.csv')
  // A spreadsheet to chart: the brain offers the computer in its answer, which goes on once it is turned down.
  await page.locator('.msg-jean').getByRole('button', { name: 'No thanks' }).click()
  await expect(page.locator('.msg-jean .prose').last()).not.toBeEmpty()
  await expect(page.locator('#prompt')).toHaveValue('')
})

test('where it can run, the device’s brain comes too: asked for beside Start for free, it downloads on the way back while Auto has both', async ({ page }) => {
  await capable(page)
  await start(page)
  await ask(page, 'Hello')
  const dialog = page.locator('app-first .first')
  const also = dialog.locator('.first-also')
  await expect(also).toContainText('Also get a private brain for this computer')
  await expect(also).toContainText('3.1 GB')
  await also.locator('input').check()
  // Start for free leaves for OpenRouter's sign-in, stopped here, having asked for the device's brain.
  const leaving = page.waitForRequest((request) => request.url().startsWith('https://openrouter.ai/auth'))
  await page.route('https://openrouter.ai/**', (route) => route.abort())
  await dialog.locator('.first-free').click()
  await leaving
  // Back from it, the device's brain comes, without being picked by hand.
  await page.goto('./')
  expect(await page.evaluate(() => sessionStorage.getItem('app.private'))).toBe('1')
  await page.evaluate(async () => (await import('/caps/first/first.js')).alsoPrivate())
  await expect(page.locator('.toasts')).toContainText('The brain on this device is ready')
  const settings = await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value)
  expect(settings.brains.map((/** @type {{ provider: string }} */ brain) => brain.provider)).toEqual(['device'])
  expect(settings.activeBrain).toBeNull()
  expect(await page.evaluate(() => sessionStorage.getItem('app.private'))).toBeNull()
})
