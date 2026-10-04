// The brain on this device (0.2): offered only where it can run, downloaded once with consent,
// then answering with no account, no key and no request leaving the page. The device is made
// capable (WebGPU with shader-f16, memory, space) and the worker that would run Gemma 4 E2B is
// replaced by one that streams in Gemma's own format, so no 3 GB download is needed.
import { test, expect } from '@playwright/test'
import { start, ask } from './helpers.js'

const WORKER = `
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
self.onmessage = async ({ data }) => {
  const { id, type } = data
  if (type === 'load') {
    self.postMessage({ id, type: 'progress', loaded: 1.2e9, total: 3.11e9 })
    await wait(800)
    self.postMessage({ id, type: 'progress', loaded: 3.11e9, total: 3.11e9 })
    self.postMessage({ id, type: 'ready' })
  } else if (type === 'generate') {
    const last = data.messages.at(-1)
    const question = typeof last.content === 'string' ? last.content : last.content.map((part) => part.text ?? '').join('')
    // A thought, then the answer; a marker split across chunks, and the end of the turn.
    for (const text of ['<|channel>thought\\nA greeting.<chan', 'nel|>On this device, ', 'I read: ' + question, '<turn|>']) {
      self.postMessage({ id, type: 'chunk', text })
      await wait(20)
    }
    self.postMessage({ id, type: 'done', usage: { inputTokens: 100, outputTokens: 12 } })
  }
}`

test('offered where it can run, downloaded with consent, then answering on the device', async ({ page }) => {
  await page.addInitScript(() => {
    const adapter = { features: new Set(['shader-f16']) }
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: async () => adapter }) })
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => 8 })
    Object.defineProperty(StorageManager.prototype, 'estimate', { configurable: true, value: async () => ({ quota: 50e9, usage: 0 }) })
  })
  await page.route('**/caps/brain-local/brain-worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: WORKER }))
  /** @type {string[]} */
  const sent = []
  page.on('request', (request) => request.method() === 'POST' && sent.push(request.url()))

  await start(page)
  await page.locator('.brain-chip').click()
  const dialog = page.locator('app-settings dialog[open]')
  const device = dialog.locator('.choice.is-device')
  await expect(device).toContainText('On this device')
  await device.locator('.button.primary').click()
  await expect(device.locator('progress')).toBeVisible()
  await expect(device.locator('.hint')).toContainText('You can keep using this page.')
  await expect(page.locator('.toast')).toContainText('The brain on this device is ready')
  await expect(dialog).toBeHidden()

  await ask(page, 'Hello there')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('On this device, I read:')
  await expect(answer).toContainText('Hello there')
  await expect(answer).not.toContainText('A greeting.')
  await expect(answer).not.toContainText('<turn|>')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  expect(sent).toEqual([])
})

test('not offered where it can’t run', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: async () => ({ features: new Set() }) }) })
  })
  await start(page)
  await page.locator('.brain-chip').click()
  const dialog = page.locator('app-settings dialog[open]')
  await expect(dialog.locator('input[name="baseURL"]')).toBeVisible()
  // The check has run once the module is in; without shader-f16 there is nothing to offer.
  await expect.poll(() => page.evaluate(async () => (await import('/caps/brain-local/brain-local.js')).checkDevice())).toEqual({ ok: false, reason: 'f16' })
  await expect(dialog.locator('.choice.is-device')).toHaveCount(0)
})
