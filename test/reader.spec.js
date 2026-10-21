// The natural voice (D455): after three answers read aloud in one of its languages, it is offered above the
// box; once that language's voice is downloaded, it reads it, while another of its languages is read by the
// system's voices and offered by a notice until downloaded too. Settings › General turns it off and credits
// it. Its worker is replaced by a fake that makes a beep for each request and says what it was asked.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings } from './helpers.js'

test.use({ locale: 'en-US' })

/** The fake voice: a language loaded at once, then a tenth of a second of 440 Hz for each request, after telling the page what was asked. */
const WORKER = `
self.onmessage = async ({ data }) => {
  if (data.type === 'abort') return
  await fetch('/__voice?' + new URLSearchParams({ type: data.type, lang: data.lang }))
  if (data.type === 'load') self.postMessage({ id: data.id, type: 'progress', loaded: 1, total: 1 })
  else {
    const audio = Float32Array.from({ length: 2400 }, (_, i) => Math.sin(i / 9))
    self.postMessage({ id: data.id, type: 'chunk', audio, rate: 24000 }, [audio.buffer])
  }
  self.postMessage({ id: data.id, type: data.type === 'load' ? 'ready' : 'done' })
}
`

/** The system's voices as Chrome on a Mac lists them, what each read, and what the fake voice was asked. @param {import('@playwright/test').Page} page */
async function fake(page) {
  /** @type {string[]} */
  const asked = []
  await page.route('**/caps/reader/reader-worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: WORKER }))
  await page.route('**/__voice?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    asked.push(`${params.get('type')} ${params.get('lang')}`)
    return route.fulfill({ body: '' })
  })
  await page.addInitScript(() => {
    const seen = /** @type {any} */ (window)
    const voice = (/** @type {string} */ name, /** @type {string} */ lang) => ({ name, lang, localService: true, default: name === 'Samantha', voiceURI: name })
    const voices = [voice('Samantha', 'en-US'), voice('Thomas', 'fr-FR')]
    seen.spoken = []
    seen.played = 0
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: Object.assign(new EventTarget(), {
      speaking: false, pending: false, getVoices: () => voices, cancel() {},
      speak(/** @type {any} */ utterance) {
        seen.spoken.push(utterance.voice?.name)
        setTimeout(() => utterance.onend?.(), 10)
      },
    }) })
    seen.SpeechSynthesisUtterance = class { constructor(/** @type {string} */ text) { Object.assign(this, { text, lang: '', voice: null }) } }
    const play = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...args) {
      seen.played++
      return play.apply(this, args)
    }
  })
  return asked
}

/** Reads the last answer aloud, and waits until it is done. @param {import('@playwright/test').Page} page */
async function readAloud(page) {
  await page.locator('.msg-jean').last().getByRole('button', { name: 'Read aloud' }).click()
  await expect(page.locator('.msg-jean').last().getByRole('button', { name: 'Read aloud' })).toBeVisible()
}

test('three answers read aloud bring the natural voice, a language at a time, the system’s voices the rest', async ({ page }) => {
  const asked = await fake(page)
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis')
  for (let i = 0; i < 3; i++) await readAloud(page)
  expect(await page.evaluate(() => /** @type {any} */ (window).spoken)).toEqual(['Samantha', 'Samantha', 'Samantha'])
  const offer = page.locator('aside.offer')
  await expect(offer).toContainText('Hear answers in a natural voice?')
  await offer.getByRole('button', { name: 'Download (108 MB)' }).click()
  await expect(page.locator('.toast')).toContainText('Natural voice is on')
  expect(asked).toEqual(['load en'])
  await readAloud(page)
  await expect.poll(() => asked).toEqual(['load en', 'speak en'])
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).played)).toBe(1)
  // French: its voice isn't here, so the system's reads it, and the natural voice offers French.
  await ask(page, 'Résume ce texte, s’il te plaît')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Autre chose ?')
  await readAloud(page)
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).spoken.at(-1))).toBe('Thomas')
  const notice = page.locator('.toast').filter({ hasText: 'The natural voice can read French too.' })
  await notice.getByRole('button', { name: 'Download (97 MB)' }).click()
  await expect.poll(() => asked.at(-1)).toBe('load fr')
  await readAloud(page)
  await expect.poll(() => asked.at(-1)).toBe('speak fr')
  // Settings › General: its languages, whose voice it is, and a switch back to the system's.
  const settings = await openSettings(page)
  await expect(settings.getByText('It reads German, English, Spanish, French, Italian, and Portuguese.')).toContainText('Kyutai’s Pocket TTS, with Alba MacKenna’s voice (CC BY 4.0).')
  const toggle = settings.getByRole('switch', { name: 'Natural voice' })
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await page.keyboard.press('Escape')
  await readAloud(page)
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).spoken)).toEqual(['Samantha', 'Samantha', 'Samantha', 'Thomas', 'Thomas'])
  expect(asked.filter((line) => line.startsWith('speak'))).toHaveLength(2)
})

// Right to left and Japanese (AGENTS.md): the offer, then its switch and credit in Settings, in each.
for (const [lang, offerText, credit] of [['ar', 'هل تريد سماع الإجابات بصوت طبيعي؟', 'بصوت Alba MacKenna'], ['ja', '回答を自然な声で聞きますか？', 'Alba MacKennaの声']]) {
  test(`the natural voice is offered and credited in ${lang}`, async ({ page }) => {
    await fake(page)
    await start(page, lang)
    await page.evaluate(() => import('/ui/discovery.js').then((discovery) => discovery.offerOnce('reader', true)))
    const offer = page.locator('aside.offer')
    await expect(offer).toContainText(offerText)
    await offer.locator('.button.primary').click()
    const settings = await openSettings(page)
    await expect(settings.locator('.setting').filter({ has: page.getByRole('switch') }).filter({ hasText: credit })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
  })
}
