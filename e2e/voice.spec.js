// Dictation (0.2): the browser's own recognition on the device when it has one, never its
// cloud recognition, in the interface language; otherwise a small Whisper, downloaded only
// once the user agrees. The browser's recogniser is replaced by a fake that hears a sentence.
import { test, expect } from '@playwright/test'
import { start } from './helpers.js'

// While listening the button pulses, unless the user asked for less motion.
test.use({ locale: 'en-US', reducedMotion: 'reduce' })

/** @param {import('@playwright/test').Page} page @param {{ status: string, words?: string }} recogniser */
async function fakeRecognition(page, recogniser) {
  await page.addInitScript(({ status, words }) => {
    const seen = /** @type {any} */ (window)
    seen.recognitions = []
    class Recognition {
      static available = async (/** @type {any} */ options) => {
        seen.asked = options
        return status
      }
      static install = async () => false
      start() {
        seen.recognitions.push({ lang: this.lang, processLocally: this.processLocally })
        setTimeout(() => this.onresult?.({ results: [[{ transcript: words }]] }), 50)
      }
      stop() {
        setTimeout(() => this.onend?.(), 10)
      }
    }
    seen.SpeechRecognition = Recognition
    seen.webkitSpeechRecognition = Recognition
  }, recogniser)
}

// English becomes the full tag the user's browser has; Japanese, which it lacks, stays as it is.
for (const [lang, tag, words] of [['en', 'en-US', 'what are the total sales'], ['ja', 'ja', '売上の合計は']]) {
  test(`dictated words join what was typed, on the device (${lang})`, async ({ page }) => {
    await fakeRecognition(page, { status: 'available', words })
    await start(page, lang)
    await page.locator('#prompt').fill('Hello,')
    const mic = page.locator('.composer-tools button[aria-pressed]')
    await mic.click()
    await expect(mic).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#prompt')).toHaveValue(`Hello, ${words}`)
    await mic.click()
    await expect(mic).toHaveAttribute('aria-pressed', 'false')
    const seen = await page.evaluate(() => ({ asked: /** @type {any} */ (window).asked, recognitions: /** @type {any} */ (window).recognitions }))
    expect(seen.asked).toEqual({ langs: [tag], processLocally: true })
    expect(seen.recognitions).toEqual([{ lang: tag, processLocally: true }])
    // Counted, for the live conversation offer.
    expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.dictated)).toBe(1)
  })
}

test('without on-device recognition, nothing is downloaded until the user agrees', async ({ page }) => {
  await fakeRecognition(page, { status: 'unavailable' })
  await start(page)
  /** @type {string[]} */
  const asked = []
  page.on('dialog', (dialog) => {
    asked.push(dialog.message())
    dialog.dismiss()
  })
  const whisper = page.waitForRequest('**/whisper-worker.js', { timeout: 1000 }).catch(() => null)
  const mic = page.locator('.composer-tools button[aria-pressed]')
  await mic.click()
  await expect.poll(() => asked.length).toBe(1)
  expect(asked[0]).toContain('about 80 MB')
  expect(await whisper).toBeNull()
  await expect(mic).toHaveAttribute('aria-pressed', 'false')
  const recognitions = await page.evaluate(() => /** @type {any} */ (window).recognitions)
  expect(recognitions).toEqual([])
})
