// Pictures and films (D251): the brain offers them when asked to draw, makes a picture kept in the
// project and shown in the answer, ready to save; a film is asked first, then shown and played there.
// A conversation that ends on a picture opens at its end once the picture is drawn. The fake brain is
// on this computer, so its pictures go through the check (D275, D280), which a worker stands in for,
// and say a trained model made them (D279), in Content Credentials too (D324).
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { credentialsOf } from '../app/caps/receipt/c2pa.js'
import { start, connectFakeBrain, ask, turnOn, openSettings, closeSettings, openTasks } from './helpers.js'

/**
 * SD-Turbo's worker, where the check runs, giving each picture in turn its levels of nudity (neutral, low, medium,
 * high) and the other areas it shows, the last for every one after; and the watermark (D324), the picture as it came.
 * @param {number[]} logits @param {...string[]} areas
 */
const checking = (logits, ...areas) => `let n = 0; const areas = ${JSON.stringify(areas.length ? areas : [[]])}
self.onmessage = ({ data }) => self.postMessage(data.type === 'watermark' ? { id: data.id, type: 'done', bytes: data.bytes }
  : { id: data.id, type: 'done', logits: ${JSON.stringify(logits)}, areas: areas[Math.min(n++, areas.length - 1)] })`
test.beforeEach(({ page }) => page.route('**/caps/pictures/device-worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: checking([5, 0, 0, 0]) })))
/** What else the check refuses, folded under the cards (D331): opened, unless it is. @param {import('@playwright/test').Locator} settings */
async function refused(settings) {
  const fold = settings.locator('.pictures-device details')
  if (!(await fold.evaluate((details) => /** @type {HTMLDetailsElement} */ (details).open))) await fold.getByText('What else is refused').click()
  return settings
}
/** As if this device could make pictures, so Settings › Brains shows them. @param {import('@playwright/test').Page} page */
const capable = (page) => page.addInitScript(() => {
  const adapter = { features: new Set(['shader-f16']) }
  Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: async () => adapter }) })
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => 8 })
})

test('the brain offers pictures when asked to draw, then makes one, kept in the project', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Draw a lighthouse at dusk')
  await page.locator('.msg-jean .approval').getByRole('button', { name: 'Turn it on' }).click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is your picture.')
  const picture = page.locator('app-picture img')
  await expect(picture).toHaveJSProperty('naturalWidth', 96)
  await expect(picture).toHaveAttribute('alt', 'Draw a lighthouse at dusk')
  await expect(page.locator('app-picture a[download]')).toHaveAttribute('download', 'draw-a-lighthouse-at-dusk.png')
  await expect(page.locator('.activity-list')).toContainText('A picture · Draw a lighthouse at dusk')
  // About this answer names who made it (D264).
  await page.locator('.msg-jean .msg-actions').last().getByRole('button', { name: 'About this answer' }).click()
  await expect(page.locator('.receipt .receipt-list').filter({ hasText: 'Made by' })).toContainText('fake-image-1')
  await page.keyboard.press('Escape')
  // Kept like a shared file, its description as its text.
  const kept = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const uri = document.querySelector('app-picture')?.getAttribute('uri')
    return app.fs.read(`${app.projectDir}/${uri?.replace(/\.png$/, '.md')}`)
  })
  expect(kept).toContain('Draw a lighthouse at dusk')
  // Made on this computer, it says a trained model made it, and which (D279).
  const bytes = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    return new TextDecoder().decode(await app.fs.readBytes(`${app.projectDir}/${document.querySelector('app-picture')?.getAttribute('uri')}`))
  })
  expect(bytes).toContain('Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" Iptc4xmpExt:AISystemUsed="fake-image-1"')
  // And Content Credentials that say so, signed by this device's seal (D324).
  expect(await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const { credentialsOf } = await import('/caps/receipt/c2pa.js')
    const read = await credentialsOf(await app.fs.readBytes(`${app.projectDir}/${document.querySelector('app-picture')?.getAttribute('uri')}`) ?? new Uint8Array())
    return read && { intact: read.intact, bound: read.bound, generated: read.generated, maker: read.maker, selfIssued: read.selfIssued }
  })).toEqual({ intact: true, bound: true, generated: true, maker: 'fake-image-1', selfIssued: true })
  // Which name the watermark its worker put in its pixels.
  expect(bytes).toMatch(/c2pa\.soft-binding.*com\.adobe\.trustmark\.Q.*1\*[01]{61}/s)
})

test('a picture takes its place at once, shows glimpses of it as it forms, then develops there (D265)', async ({ page }) => {
  // Its brain's picture model is a GPT image model, which streams them.
  await page.route('**/v1/models', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace('fake-image-1', 'gpt-image-1.5') })
  })
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('pictures'))
  await ask(page, 'Draw a lighthouse at dusk')
  const place = page.locator('app-picture figure')
  await expect(place).toHaveAttribute('role', 'progressbar')
  await expect(place).toHaveAccessibleName('Making the picture')
  await expect(place.locator('.sign')).toBeVisible()
  // As large as it will be: square, until it is here.
  expect(await place.evaluate((figure) => figure.clientWidth / figure.clientHeight)).toBeCloseTo(1, 1)
  await expect(place.locator('img.glimpse')).toHaveCount(1)
  await expect(place).toHaveAttribute('aria-valuenow', '33')
  await expect(place.locator('.sign')).toHaveCount(0)
  await expect(place.locator('img.glimpse')).toHaveCount(2)
  await expect(place).toHaveAttribute('aria-valuenow', '67')
  // Then it develops over them, which go.
  await expect(place.locator('img.develops')).toHaveJSProperty('naturalWidth', 96)
  await expect(place).not.toHaveAttribute('role', /./)
  await expect(place.locator('img.glimpse')).toHaveCount(0)
  await expect(place.locator('img')).toHaveAttribute('alt', 'Draw a lighthouse at dusk')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is your picture.')
  // Its size is the picture's own.
  expect(await place.evaluate((figure) => figure.clientWidth / figure.clientHeight)).toBeCloseTo(1.5, 1)
})

test('a picture from this computer showing nudity or sex never shows: its glimpses hide, nothing is kept, and the brain hears why (D275)', async ({ page }) => {
  await page.route('**/v1/models', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace('fake-image-1', 'gpt-image-1.5') })
  })
  await page.route('**/caps/pictures/device-worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: checking([0, 0, 1, 5]) }))
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('pictures'))
  await ask(page, 'Draw a lighthouse at dusk')
  // How far along it is still shows, and its sign stays where its glimpses would be.
  const place = page.locator('app-picture figure')
  await expect(place).toHaveAttribute('aria-valuenow', '67')
  await expect(place.locator('img.glimpse')).toHaveCount(0)
  await expect(place.locator('.sign')).toBeVisible()
  // The next who could make it isn't asked: the brain is told, and tells the user.
  await expect(page.locator('.msg-jean .prose').last()).toContainText(/^No picture: .*Not made: it showed nudity or sex/)
  await expect(page.locator('app-picture')).toHaveCount(0)
  expect(await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    return (await app.fs.list(`${app.projectDir}/files`)).filter((entry) => /\.png$/.test(entry.name))
  })).toEqual([])
})

test('a suggestive picture shows, unless the user refuses those too, or the organisation does, which locks it (D275)', async ({ page }) => {
  await capable(page)
  await page.route('**/caps/pictures/device-worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: checking([0, 5, 0, 0]) }))
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('pictures'))
  await ask(page, 'Draw a lighthouse at dusk')
  await expect(page.locator('app-picture img')).toHaveJSProperty('naturalWidth', 96)
  // Strict, the next one isn't made.
  let settings = await refused(await openSettings(page, 'Brains'))
  const strict = settings.getByRole('switch', { name: 'Refuse suggestive pictures too' })
  await expect(strict).not.toBeChecked()
  await expect(settings).toContainText('Nudity and sex are always refused.')
  await strict.check()
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.pictureCheck)).toEqual({ suggestive: true })
  await closeSettings(page)
  await ask(page, 'Draw a lighthouse at dawn')
  await expect(page.locator('.msg-jean .prose').last()).toContainText(/^No picture: .*Not made/)
  // The organisation's level wins over the user's, and can't be changed.
  await page.evaluate(async () => { (await import('/ui/state.js')).app.policy.pictureCheck = { suggestive: false } })
  settings = await refused(await openSettings(page, 'Brains'))
  await expect(strict).not.toBeChecked()
  await expect(strict).toBeDisabled()
  await expect(settings).toContainText('Set by your organization')
})

test('a film is asked first, then shown in the answer, ready to play and save', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Pictures and films')
  await page.keyboard.press('Escape')
  await ask(page, 'A film of waves at dawn')
  const approval = page.locator('.approval')
  await expect(approval).toContainText('A film · 4 seconds · A film of waves at dawn')
  await approval.getByRole('button', { name: 'Allow once' }).click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is your film.')
  await expect(page.locator('app-picture video')).toHaveAttribute('src', /^blob:/)
  await expect(page.locator('app-picture a[download]')).toHaveAttribute('download', 'a-film-of-waves-at-dawn.mp4')
  await expect(page.locator('app-picture a[download]')).toHaveAttribute('aria-label', 'Save the film')
})

test('Never on a film declines it, not every change; Always allow holds for films, until Settings asks first again', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('pictures'))
  const answer = page.locator('.msg-jean .prose').last()
  // The next request once the answer is whole: until then the box is busy.
  const next = async (/** @type {string} */ text) => {
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
    await ask(page, text)
  }
  await ask(page, 'A film of waves at dawn')
  await page.locator('.approval').getByRole('button', { name: 'Never' }).click()
  await expect(answer).toContainText('The user declined this action.')
  // Files are still written without asking.
  await next('Write a Word document')
  await expect(answer).toContainText('Done: Bakery plan.docx is under this answer.')
  await next('A film of the sea')
  await page.locator('.approval').getByRole('button', { name: 'Always allow' }).click()
  await expect(answer).toContainText('Here is your film.')
  await next('A film of a forest')
  await expect(page.locator('app-picture video')).toHaveCount(2)
  await expect(page.locator('.approval')).toHaveCount(0)
  const settings = await openSettings(page, 'Brains')
  await expect(settings).toContainText('Films are made without asking first.')
  await settings.getByRole('button', { name: 'Ask first again' }).click()
  await expect(settings).not.toContainText('Films are made without asking first.')
})

test('a conversation that ends on a picture opens at its end, once the picture is drawn', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('pictures'))
  for (const [index, text] of ['Explain photosynthesis in simple words', 'Write the bakery plan as a Word document', 'Explain photosynthesis again', 'Draw a lighthouse at dusk'].entries()) {
    await ask(page, text)
    await expect(page.locator('.msg-jean .msg-actions')).toHaveCount(index + 1)
  }
  await page.locator('.wordmark').click()
  await ask(page, 'Explain the water cycle in simple words')
  await expect(page.locator('.msg-jean .msg-actions')).toHaveCount(1)
  // A large picture takes a while to read: here a second.
  await page.evaluate(async () => {
    const { fs } = (await import('/ui/state.js')).app
    const read = fs.readBytes.bind(fs)
    fs.readBytes = async (path) => { await new Promise((resolve) => setTimeout(resolve, 1000)); return read(path) }
  })
  await (await openTasks(page)).locator('.history-item', { hasText: 'Explain photosynthesis simple' }).click()
  await expect(page.locator('app-picture img')).toHaveJSProperty('naturalWidth', 96)
  await expect.poll(() => page.evaluate(() => Math.round(document.documentElement.scrollHeight - innerHeight - scrollY))).toBe(0)
})

for (const [lang, save, labelled] of [['en', 'Save the picture', 'Save the picture labelled as made with AI'], ['ar', 'حفظ الصورة', 'حفظ الصورة مع وسم «صُنع بالذكاء الاصطناعي»'], ['ja', '画像を保存', '「AIで作成」の表示を付けて画像を保存']]) {
  test(`a picture in the answer, in ${lang}, saved as it is or labelled as made with AI (D324)`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    await page.evaluate(async () => (await import('/ui/caps.js')).unlock('pictures'))
    await ask(page, 'Draw a lighthouse at dusk')
    await expect(page.locator('app-picture img')).toHaveJSProperty('naturalWidth', 96)
    await expect(page.locator('app-picture a[download]')).toHaveAttribute('aria-label', save)
    // Labelled: the same picture, its corner labelled, a PNG under its name, its marks made again.
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('app-picture').getByRole('button', { name: labelled }).click()])
    expect(download.suggestedFilename()).toBe('draw-a-lighthouse-at-dusk.png')
    const bytes = new Uint8Array(await readFile(await download.path()))
    expect(new DataView(bytes.buffer).getUint32(16)).toBe(96)
    const read = await credentialsOf(bytes)
    expect([read?.intact, read?.generated, read?.maker]).toEqual([true, true, 'fake-image-1'])
    expect(new TextDecoder().decode(bytes)).toContain('Iptc4xmpExt:AISystemUsed="fake-image-1"')
  })
}

// Its workers stand in for SD-Turbo's and FLUX.2 [klein]'s (D263): their files come, and nothing runs.
const LOADING = `self.onmessage = ({ data }) => {
  self.postMessage({ id: data.id, type: 'progress', loaded: 1e9, total: 6.5e9 })
  setTimeout(() => self.postMessage({ id: data.id, type: data.type === 'load' ? 'ready' : 'done' }), 600)
}`

test('graphic violence is refused unless the user allows it, self-harm whatever the user says; symbols of hate as the organisation sets them (D280)', async ({ page }) => {
  await capable(page)
  await page.route('**/caps/pictures/device-worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: checking([5, 0, 0, 0], ['violence'], ['violence'], ['selfHarm']) }))
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('pictures'))
  await ask(page, 'Draw a lighthouse at dusk')
  await expect(page.locator('.msg-jean .prose').last()).toContainText(/^No picture: .*Not made: it showed graphic violence or injuries, .* unless allowed in Settings › Brains/)
  // Allowed, the next one shows.
  let settings = await refused(await openSettings(page, 'Brains'))
  const violence = settings.getByRole('switch', { name: 'Refuse graphic violence' })
  await expect(violence).toBeChecked()
  await expect(settings).toContainText('Battles and fights without them are allowed.')
  await expect(settings).toContainText('pictures showing nudity, sex or self-harm are refused')
  await violence.uncheck()
  await closeSettings(page)
  await ask(page, 'Draw a battle at dusk')
  await expect(page.locator('app-picture img')).toHaveJSProperty('naturalWidth', 96)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is your picture.')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  // Self-harm has no switch: refused.
  await ask(page, 'Draw a lighthouse at dawn')
  await expect(page.locator('.msg-jean .prose').last()).toContainText(/Not made: it showed self-harm, which pictures made on this device or this computer don't show\. /)
  // The organisation allows symbols of hate, for its history teachers: no one changes it.
  await page.evaluate(async () => { (await import('/ui/state.js')).app.policy.pictureCheck = { hate: false } })
  settings = await refused(await openSettings(page, 'Brains'))
  const hate = settings.getByRole('switch', { name: 'Refuse symbols of hate' })
  await expect(hate).not.toBeChecked()
  await expect(hate).toBeDisabled()
  await expect(settings.getByRole('switch', { name: 'Refuse graphic violence' })).toBeEnabled()
})

test('pictures on this device: three to choose from as cards, each downloaded once, the one downloaded used, another used instead or removed', async ({ page }) => {
  await capable(page)
  for (const worker of ['device-worker', 'stage-worker']) await page.route(`**/caps/pictures/${worker}.js`, (route) => route.fulfill({ contentType: 'text/javascript', body: LOADING }))
  await start(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('pictures'))
  const settings = await openSettings(page, 'Brains')
  const [quick, detailed, finest] = ['Quick', 'Detailed', 'Finest'].map((name) => settings.getByRole('tab', { name: new RegExp(name) }))
  const shown = settings.getByRole('tabpanel')
  // The finest one shown first, nothing downloaded yet.
  await expect(finest).toHaveAttribute('aria-selected', 'true')
  // Each comes with the check its pictures go through (D275).
  await expect(quick).toContainText('2.7 GB')
  await expect(shown).toContainText('Z-Image-Turbo')
  await expect(settings).toContainText('Each is checked here first: pictures showing nudity, sex or self-harm are refused.')
  await shown.getByRole('button', { name: /^Download/ }).click()
  await expect(finest).toContainText('Downloading')
  await expect(finest).toContainText('In use')
  // The arrows go round the cards, as the language reads.
  await finest.press('ArrowRight')
  await expect(quick).toBeFocused()
  await quick.press('ArrowLeft')
  await finest.press('ArrowLeft')
  await expect(detailed).toBeFocused()
  await expect(shown).toContainText('FLUX.2 [klein]')
  // Another, downloaded too, is used from then on; the first can be used again, or removed.
  await shown.getByRole('button', { name: 'Download (6.7 GB)' }).click()
  await expect(detailed).toContainText('In use')
  await expect(finest).toContainText('Downloaded')
  await finest.click()
  await shown.getByRole('button', { name: 'Use this one' }).click()
  await expect(finest).toContainText('In use')
  await expect(detailed).toContainText('Downloaded')
  await detailed.click()
  await shown.getByRole('button', { name: 'Remove' }).click()
  await expect(detailed).toContainText('6.7 GB')
  await expect(quick).toContainText('2.7 GB')
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.pictures)).toBe('z-image-turbo')
})
