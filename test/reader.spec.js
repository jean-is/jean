// The natural voice (D455): after three answers read aloud in one of its languages, it is offered above the
// box; once that language's voice is downloaded, it reads it, while another of its languages is read by the
// system's voices and offered by a notice until downloaded too. Settings › General turns it off and credits
// it. Its worker is replaced by a fake that makes a beep for each request and says what it was asked.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings } from './helpers.js'

test.use({ locale: 'en-US' })

/**
 * The fake voice: a language loaded at once, then for each request `pieces` tenths of a second of 440 Hz, one
 * every 50 ms until it is aborted, after telling the page what was asked. @param {number} [pieces]
 */
const worker = (pieces = 1) => `
const aborted = new Set()
self.onmessage = async ({ data }) => {
  if (data.type === 'abort') return void aborted.add(data.of)
  await fetch('/__voice?' + new URLSearchParams({ type: data.type, lang: data.lang }))
  if (data.type === 'load') self.postMessage({ id: data.id, type: 'progress', loaded: 1, total: 1 })
  for (let n = 0; data.type === 'speak' && n < ${pieces} && !aborted.has(data.id); n++) {
    const audio = Float32Array.from({ length: 2400 }, (_, i) => Math.sin(i / 9))
    self.postMessage({ id: data.id, type: 'chunk', audio, rate: 24000 }, [audio.buffer])
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  self.postMessage({ id: data.id, type: data.type === 'load' ? 'ready' : 'done' })
}
`

/**
 * The system's voices as Chrome on a Mac lists them, what each read, the natural voice's pieces played and
 * stopped, and what the fake voice was asked. @param {import('@playwright/test').Page} page @param {number} [pieces]
 */
async function fake(page, pieces) {
  /** @type {string[]} */
  const asked = []
  await page.route('**/caps/reader/reader-worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: worker(pieces) }))
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
    seen.stopped = 0
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
    const end = AudioBufferSourceNode.prototype.stop
    AudioBufferSourceNode.prototype.stop = function (...args) {
      seen.stopped++
      return end.apply(this, args)
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
  // The offer above the box goes just after, moving the page: read once it has gone.
  await expect(page.locator('aside.offer')).toHaveCount(0)
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
  // Settings › General: its row says which languages are here; its page, whose voice reads each, the user's first,
  // the others to download, the credit, and a switch back to the system's (D525).
  const settings = await openSettings(page)
  await expect(settings.locator('[data-part="natural"]')).toContainText('English and French, made on this device')
  await settings.locator('[data-part="natural"]').click()
  const languages = settings.locator('.list.general > li')
  await expect(languages).toHaveText([/^English\s*Alba MacKenna · On this device, 97 MB/, /^French\s*Stuart Bell · On this device/, /^German[^]*Download \(97 MB\)/, /^Italian/, /^Portuguese/, /^Spanish/])
  await expect(settings.getByText('Kyutai’s Pocket TTS, with Alba MacKenna’s voice (CC BY 4.0).')).toBeVisible()
  const toggle = settings.getByRole('switch', { name: 'Natural voice' })
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await page.keyboard.press('Escape')
  await readAloud(page)
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).spoken)).toEqual(['Samantha', 'Samantha', 'Samantha', 'Thomas', 'Thomas'])
  expect(asked.filter((line) => line.startsWith('speak'))).toHaveLength(2)
})

test('read aloud pressed again stops the natural voice at once, what it had made and what it was making', async ({ page }) => {
  await fake(page, 40)
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis')
  await page.evaluate(() => import('/ui/discovery.js').then((discovery) => discovery.offerOnce('reader', true)))
  await page.locator('aside.offer').getByRole('button', { name: 'Download (108 MB)' }).click()
  await expect(page.locator('.toast')).toContainText('Natural voice is on')
  // The offer above the box goes just after, moving the page: read once it has gone.
  await expect(page.locator('aside.offer')).toHaveCount(0)
  const answer = page.locator('.msg-jean').last()
  await answer.getByRole('button', { name: 'Read aloud' }).click()
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).played)).toBeGreaterThan(1)
  await answer.getByRole('button', { name: 'Stop reading' }).click()
  await expect(answer.getByRole('button', { name: 'Read aloud' })).toBeVisible()
  const { played, stopped } = await page.evaluate(() => ({ played: /** @type {any} */ (window).played, stopped: /** @type {any} */ (window).stopped }))
  expect(stopped).toBe(played)
  // Two seconds of pieces were still to come, every 50 ms: none plays once it is stopped.
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => /** @type {any} */ (window).played)).toBe(played)
  // And it reads again when asked.
  await answer.getByRole('button', { name: 'Read aloud' }).click()
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).played)).toBeGreaterThan(played + 1)
  await answer.getByRole('button', { name: 'Stop reading' }).click()
})

test('Live conversation reads its answers in the natural voice while it is on, in the system’s once it is off', async ({ page }) => {
  const asked = await fake(page)
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(() => import('/ui/discovery.js').then((discovery) => discovery.offerOnce('reader', true)))
  await page.locator('aside.offer').getByRole('button', { name: 'Download (108 MB)' }).click()
  await expect(page.locator('.toast')).toContainText('Natural voice is on')
  await expect(page.locator('aside.offer')).toHaveCount(0)
  // Live without its microphone: what it does with an answer once it listens.
  const state = () => page.evaluate(async () => (await import('/ui/dictation.js')).live.value)
  await page.evaluate(async () => {
    await (await import('/ui/caps.js')).unlock('live')
    ;(await import('/ui/dictation.js')).live.value = 'listening'
  })
  await ask(page, 'Explain photosynthesis')
  await expect.poll(() => asked.filter((line) => line === 'speak en').length).toBeGreaterThan(1)
  await expect.poll(state).toBe('listening')
  expect(await page.evaluate(() => /** @type {any} */ (window).played)).toBe(asked.filter((line) => line === 'speak en').length)
  expect(await page.evaluate(() => /** @type {any} */ (window).spoken)).toEqual([])
  // Turned off in Settings › General: the system's voice reads the next answer.
  const settings = await openSettings(page)
  await settings.locator('[data-part="natural"]').click()
  await settings.getByRole('switch', { name: 'Natural voice' }).uncheck()
  await page.keyboard.press('Escape')
  const spoken = asked.length
  await ask(page, 'Explain photosynthesis again')
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).spoken.length)).toBeGreaterThan(0)
  await expect.poll(state).toBe('listening')
  expect(await page.evaluate(() => /** @type {any} */ (window).spoken)).toContain('Samantha')
  expect(asked).toHaveLength(spoken)
})

// As on a visit after Jean pinned new weights: the voice's module, loaded, finds French kept at an older pin.
// The cache is filled before it loads, since WebKit here keeps nothing for a next visit.
test('a voice kept at an older pin of its weights is loaded again at the new one, nothing asked', async ({ page }) => {
  const asked = await fake(page)
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(() => caches.open('transformers-cache').then((cache) => cache.put('https://huggingface.co/jean-is/pocket-tts-q8-ONNX/resolve/0123abc/fr.bin', new Response('…'))))
  await page.evaluate(() => import('/ui/discovery.js').then((discovery) => discovery.offerOnce('reader', true)))
  await page.locator('aside.offer').getByRole('button', { name: 'Download (108 MB)' }).click()
  await expect(page.locator('.toast')).toContainText('Natural voice is on')
  await expect.poll(() => asked.toSorted()).toEqual(['load en', 'load fr'])
  await ask(page, 'Résume ce texte, s’il te plaît')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Autre chose ?')
  await readAloud(page)
  await expect.poll(() => asked.at(-1)).toBe('speak fr')
  expect(await page.evaluate(() => /** @type {any} */ (window).spoken)).toEqual([])
  await expect(page.locator('.toast').filter({ hasText: 'The natural voice can read French too.' })).toHaveCount(0)
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
    await settings.locator('[data-part="natural"]').click()
    await expect(settings.getByRole('switch')).toBeChecked()
    await expect(settings.locator('.hint').filter({ hasText: credit })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
  })
}

// Picked in Settings › General, a system voice reads its language ahead of the natural voice; the natural voice's page
// reads each language here with Listen; Your data › Space used counts its languages apart and removes one (D525).
test('a voice picked reads ahead of the natural voice, whose languages Listen plays and Space used removes', async ({ page }) => {
  const asked = await fake(page)
  await start(page)
  await connectFakeBrain(page)
  const pin = 'https://huggingface.co/jean-is/pocket-tts-q8-ONNX/resolve/b94b57dd6e20af2a8d79779fef5a8e60dbe9fc51/'
  await page.evaluate(async (pin) => {
    const cache = await caches.open('transformers-cache')
    for (const file of ['en.bin', 'fr.bin', 'decoder.bin']) await cache.put(pin + file, new Response('x'.repeat(file === 'decoder.bin' ? 11 : 97)))
    await (await import('/ui/caps.js')).unlock('reader')
  }, pin)
  const settings = await openSettings(page)
  const voice = settings.getByRole('combobox', { name: 'Voice' })
  await expect(voice.locator('option')).toHaveText(['Natural voice · Alba', 'Samantha'])
  // Its page: Listen reads French's sentence in French's voice.
  await settings.locator('[data-part="natural"]').click()
  await settings.locator('.list.general > li').filter({ hasText: 'French' }).getByRole('button', { name: 'Listen' }).click()
  await expect.poll(() => asked.at(-1)).toBe('speak fr')
  await settings.locator('.back').click()
  // Samantha picked: she reads English answers, the natural voice none.
  await voice.selectOption('Samantha')
  await page.keyboard.press('Escape')
  await ask(page, 'Explain photosynthesis')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  await readAloud(page)
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).spoken)).toEqual(['Samantha'])
  expect(asked.filter((line) => line === 'speak en')).toEqual([])
  // Space used: the natural voice apart from the brains, English removed, its file gone and French's kept.
  await openSettings(page)
  await settings.locator('[data-part="natural"]').click()
  await settings.getByRole('button', { name: 'Remove a language in Your data › Space used' }).click()
  const part = settings.locator('.parts .list > li').filter({ hasText: 'Natural voice' })
  await expect(part.locator('.voices li')).toHaveText([/English\s*0\.1 kB\s*Remove/, /French/])
  await part.locator('.voices li').filter({ hasText: 'English' }).getByRole('button', { name: 'Remove' }).click()
  await expect(part.locator('.voices li')).toHaveText([/French/])
  expect(await page.evaluate(() => caches.open('transformers-cache').then((cache) => cache.keys()).then((keys) => keys.map((key) => key.url.split('/').at(-1)).sort()))).toEqual(['decoder.bin', 'fr.bin'])
  await settings.locator('.settings-nav button', { hasText: 'General' }).click()
  await expect(settings.locator('[data-part="natural"]')).toContainText('French, made on this device')
})
