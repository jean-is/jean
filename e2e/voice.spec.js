// Dictation (0.2): the browser's own recognition on the device when it has one, never its
// cloud recognition, in the interface language; otherwise Whistle or a small Whisper, by
// language, downloaded only once the user agrees. The browser's recogniser is replaced by a fake that hears a sentence.
// Read-aloud (D114): each answer in its own language, by the best voice on the device.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings } from './helpers.js'

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

// Whistle writes English, Whisper base Polish (D205): each asks for its own download.
for (const [lang, size] of [['en', 18], ['pl', 80]]) test(`without on-device recognition, nothing is downloaded until the user agrees (${lang})`, async ({ page }) => {
  await fakeRecognition(page, { status: 'unavailable' })
  await start(page, lang)
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
  expect(asked[0]).toContain(`${size} MB`)
  expect(await whisper).toBeNull()
  await expect(mic).toHaveAttribute('aria-pressed', 'false')
  const recognitions = await page.evaluate(() => /** @type {any} */ (window).recognitions)
  expect(recognitions).toEqual([])
})

/** The system's voices, as Chrome on a Mac lists them, and what was read aloud. @param {import('@playwright/test').Page} page */
async function fakeVoices(page) {
  await page.addInitScript(() => {
    const seen = /** @type {any} */ (window)
    const voice = (/** @type {string} */ name, /** @type {string} */ lang, localService = true) => ({ name, lang, localService, default: name === 'Samantha', voiceURI: name })
    const voices = [voice('Samantha', 'en-US'), voice('Albert', 'en-US'), voice('Eddy (French (France))', 'fr-FR'), voice('Thomas', 'fr-FR'), voice('Google 日本語', 'ja-JP', false)]
    seen.spoken = []
    const synthesis = Object.assign(new EventTarget(), {
      speaking: false,
      pending: false,
      getVoices: () => voices,
      cancel() {},
      speak(/** @type {any} */ utterance) {
        seen.spoken.push({ voice: utterance.voice?.name, lang: utterance.lang })
        setTimeout(() => utterance.onend?.(), 10)
      },
    })
    Object.defineProperty(window, 'speechSynthesis', { value: synthesis, configurable: true })
    seen.SpeechSynthesisUtterance = class {
      constructor(/** @type {string} */ text) {
        Object.assign(this, { text, lang: '', voice: null })
      }
    }
  })
}

test('an answer is read in its own language by a voice on the device, or Jean says there is none', async ({ page }) => {
  await fakeVoices(page)
  await start(page)
  await connectFakeBrain(page)
  const readAloud = () => page.locator('.msg-jean').last().getByRole('button', { name: 'Read aloud' }).click()
  // Asked in French with Jean in English: Thomas, not Eddy's retro voice, nor Samantha.
  await ask(page, 'Résume ce texte, s’il te plaît')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Autre chose ?')
  await readAloud()
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).spoken)).toEqual([{ voice: 'Thomas', lang: 'fr-FR' }])
  // Only an online voice reads Japanese here: nothing is read, and Jean says why.
  await ask(page, '光合成を説明して')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('他にありますか')
  await readAloud()
  await expect(page.locator('.toast')).toContainText('No voice on this device can read Japanese.')
  expect(await page.evaluate(() => /** @type {any} */ (window).spoken)).toHaveLength(1)
  // Settings offers the interface language's voices, the best first.
  const settings = await openSettings(page)
  await expect(settings.getByRole('combobox', { name: 'Reading voice' }).locator('option')).toHaveText(['Automatic', 'Samantha', 'Albert'])
})
