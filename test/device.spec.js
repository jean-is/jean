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

/** Downloads the brain from Settings › Brains, its first way. @param {import('@playwright/test').Page} page */
async function download(page) {
  await page.locator('.brain-chip').click()
  const dialog = page.locator('app-settings dialog[open]')
  const device = dialog.locator('.way.is-device')
  await device.locator('.button.primary').click()
  await expect(device.locator('progress')).toBeVisible()
  await expect(dialog).toBeHidden()
}

test('offered where it can run, downloaded with consent, then answering on the device', async ({ page }) => {
  await capable(page)
  /** @type {string[]} */
  const sent = []
  page.on('request', (request) => request.method() === 'POST' && sent.push(request.url()))

  await start(page)
  await page.locator('.brain-chip').click()
  const dialog = page.locator('app-settings dialog[open]')
  const device = dialog.locator('.way.is-device')
  await expect(device).toContainText('On this device')
  await device.locator('.button.primary').click()
  await expect(device.locator('progress')).toBeVisible()
  await expect(device.locator('.hint')).toContainText('You can keep using this page.')
  await expect(dialog).toBeHidden()

  // Private from now on (D270): the legend in the box opens its card, once by itself, in place of a toast.
  const card = page.locator('#private-card')
  await expect(card).toBeVisible()
  await expect(card.locator('h2')).toHaveText('Everything stays on this device')
  await expect(card).toContainText('Turn off Wi-Fi and see.')
  await expect(page.locator('.toast')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  const legend = page.locator('.private-seal')
  await expect(legend).toHaveText('Private · offline')
  // Nothing at the top says it twice.
  await expect(page.locator('.bar')).not.toContainText('Private')

  // While it answers, the page's loops pause, and they run again once it has answered (D285).
  const loops = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--loops'))
  await page.evaluate(() => {
    const seen = /** @type {any} */ (window).loopsSeen = /** @type {string[]} */ ([])
    new MutationObserver(() => seen.push(document.documentElement.style.getPropertyValue('--loops'))).observe(document.documentElement, { attributeFilter: ['style'] })
  })
  await ask(page, 'Hello there')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('On this device, I read:')
  await expect(answer).toContainText('Hello there')
  await expect(answer).not.toContainText('A greeting.')
  await expect(answer).not.toContainText('<turn|>')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  expect(sent).toEqual([])
  expect(await page.evaluate(() => /** @type {any} */ (window).loopsSeen)).toContain('paused')
  expect(await loops()).toBe('')

  // Offline, it says it still answers, and does; its card says so too, and a click in it leaves it open.
  await page.context().setOffline(true)
  await expect(legend).toHaveText('Offline · still answering')
  await legend.click()
  await expect(card).toContainText('You’re offline, and the answers keep coming.')
  await card.locator('h2').click()
  await expect(card).toBeVisible()
  await page.keyboard.press('Escape')
  await ask(page, 'Still there?')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Still there?')
  await page.context().setOffline(false)
  await expect(legend).toHaveText('Private · offline')
  // On a narrow screen, the shield alone, still named.
  await page.setViewportSize({ width: 375, height: 700 })
  await expect(legend.locator('span')).toHaveCSS('clip-path', 'inset(50%)')
  await expect(legend).toHaveAccessibleName('Private · offline')
})

for (const [lang, name, away, title] of [
  ['ar', 'خاص · دون اتصال', 'دون اتصال · الإجابات مستمرة', 'كل شيء يبقى على هذا الجهاز'],
  ['ja', 'プライベート・オフライン', 'オフライン・回答を続けています', 'すべてこの端末の中で完結します'],
]) {
  test(`private and offline, said in its language, within the window (${lang})`, async ({ page }) => {
    await capable(page)
    await start(page, lang)
    await download(page)
    const card = page.locator('#private-card')
    await expect(card.locator('h2')).toHaveText(title)
    const legend = page.locator('.private-seal')
    const width = page.viewportSize()?.width ?? 0
    const box = await card.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true)
    await page.keyboard.press('Escape')
    await expect(legend).toHaveText(name)
    const at = await legend.boundingBox()
    expect(at && at.x >= 0 && at.x + at.width <= width).toBe(true)
    await page.context().setOffline(true)
    await expect(legend).toHaveText(away)
  })
}

test('not offered where it can’t run', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: async () => ({ features: new Set() }) }) })
  })
  await start(page)
  await page.locator('.brain-chip').click()
  const dialog = page.locator('app-settings dialog[open]')
  await expect(dialog.locator('.way.is-local')).toBeVisible()
  // The check has run once the module is in; without shader-f16 there is nothing to offer.
  await expect.poll(() => page.evaluate(async () => (await import('/caps/brain-local/brain-local.js')).checkDevice())).toEqual({ ok: false, reason: 'f16' })
  await expect(dialog.locator('.way.is-device')).toHaveCount(0)
})
