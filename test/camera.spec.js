// The camera (D645): what it shows goes with each message, as a picture the task keeps, and Look closely sends a larger
// one; it stops when it is closed, and pauses when the page is hidden. On a phone it is a viewfinder over the room, which
// shrinks to a tile. While Jean watches, a look with nothing to say leaves nothing, and one that speaks is kept and shown
// as one. The camera is a painted canvas, whose scene the test changes; live conversation is denied, so nothing listens.
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, withPolicy, turnOn, closeSettings, openSettings } from './helpers.js'

/** The room's strings and the camera's own, in a language. @param {string} lang */
const stringsOf = (lang) => ({
  ...JSON.parse(readFileSync(new URL(`../app/locales/${lang}.json`, import.meta.url), 'utf8')),
  ...JSON.parse(readFileSync(new URL(`../app/locales/camera/${lang}.json`, import.meta.url), 'utf8')),
})

/** The page's camera: a canvas of stripes, as `window.scene` has it, lying (1600 × 1200) or standing (1200 × 1600). */
function camera() {
  const original = MediaDevices.prototype.getUserMedia
  MediaDevices.prototype.getUserMedia = async function (constraints) {
    if (!constraints?.video) return original.call(this, constraints)
    const canvas = Object.assign(document.createElement('canvas'), { width: 1600, height: 1200 })
    const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
    const paint = () => {
      const scene = /** @type {any} */ (window).scene ?? 'lying'
      const [width, height] = scene === 'standing' ? [1200, 1600] : [1600, 1200]
      if (canvas.width !== width) Object.assign(canvas, { width, height })
      context.fillStyle = scene === 'moved' ? '#e8e0d0' : '#204060'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#f0c040'
      for (let x = 0; x < width; x += 100) context.fillRect(x, 200, 50, 400)
    }
    paint()
    setInterval(paint, 50)
    const stream = canvas.captureStream(20)
    Object.assign(window, { cameras: [.../** @type {any} */ (window).cameras ?? [], stream] })
    return stream
  }
}

/** Found, the camera opens from its row in +. @param {import('@playwright/test').Page} page @param {Record<string, string>} strings */
async function openFromPlus(page, strings) {
  await page.evaluate(() => import('/ui/caps.js').then((caps) => caps.unlock('camera')))
  await page.locator('.composer .add').click()
  await page.locator('#add-menu').getByRole('button', { name: strings['cap.camera.name'] }).click()
}

/**
 * Jean on a phone, in a language: the box doesn't take the keyboard there, so Settings opens by its key.
 * @param {import('@playwright/test').Page} page @param {string} lang
 */
async function startPhone(page, lang) {
  await page.goto('./')
  await expect(page.locator('.hero-question')).toBeVisible()
  if (lang === 'en') return
  await page.keyboard.press('ControlOrMeta+Comma')
  await page.locator('app-settings dialog[open] .settings-panel select').first().selectOption(lang)
  await expect(page.locator('html')).toHaveAttribute('lang', lang)
  await closeSettings(page)
}

/** Whether every stream the camera opened has stopped. @param {import('@playwright/test').Page} page */
const stopped = (page) => page.evaluate(() => /** @type {MediaStream[]} */ (/** @type {any} */ (window).cameras).every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')))

for (const lang of ['en', 'ar', 'ja']) {
  test(`what the camera shows goes with each message, Look closely a larger picture, and closing it stops it (${lang})`, async ({ page }) => {
    const strings = stringsOf(lang)
    await withPolicy(page, { capabilities: { deny: ['live'] } })
    await page.addInitScript(camera)
    await start(page, lang)
    await connectFakeBrain(page)
    // Turned on from its trophy, it opens at once, a tile on a wide window, its chip in the box; found, + opens it too.
    if (lang === 'en') {
      await turnOn(page, strings['cap.camera.name'])
      await closeSettings(page)
    } else await openFromPlus(page, strings)
    const tile = page.locator('app-camera dialog.is-tile')
    await expect(tile).toBeVisible()
    expect(await tile.evaluate((dialog) => dialog.matches(':modal'))).toBe(false)
    await expect(tile.locator('.camera-state')).toHaveText(strings['cap.camera.name'])
    await expect(page.locator('.composer .mode-chip')).toContainText(strings['cap.camera.name'])

    // A message shares the camera's picture of the moment, 1,024 pixels long, kept in the task.
    await ask(page, 'What do you see?')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('I can see your picture: 1024 × 768 pixels.', { timeout: 30_000 })
    await expect(page.locator('.msg-files .is-picture')).toHaveCount(1)
    await expect(page.locator('.msg-files .is-picture')).toHaveAccessibleName(new RegExp(strings['camera.picture'].replace(/\s*\{time\}\s*/, '')))

    // Look closely keeps a picture as large as brains take for the next message, which it goes with, then goes.
    await tile.getByRole('button', { name: strings['camera.closely'] }).click()
    await expect(tile.locator('.camera-kept img')).toHaveAccessibleName(strings['camera.kept'])
    await ask(page, 'And closer?')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('I can see your picture: 1568 × 1176 pixels.', { timeout: 30_000 })
    await expect(tile.locator('.camera-kept')).toHaveCount(0)

    // Moved by its button, it goes round the window's corners.
    await expect(tile).toHaveAttribute('data-corner', 'top-end')
    await tile.getByRole('button', { name: strings['camera.move'] }).click()
    await expect(tile).toHaveAttribute('data-corner', 'bottom-end')

    // Closed, every track stops, its chip goes, and a message shares nothing.
    await tile.getByRole('button', { name: strings['camera.close'] }).click()
    await expect(page.locator('app-camera dialog')).toHaveCount(0)
    expect(await stopped(page)).toBe(true)
    await expect(page.locator('.composer .mode-chip')).toHaveCount(0)
    await ask(page, 'Thanks')
    await answered(page, 3)
    await expect(page.locator('.msg-files .is-picture')).toHaveCount(2)
  })
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  for (const lang of ['en', 'ar', 'ja']) {
    test(`the viewfinder fills the screen, with Jean's words at its foot, shrinks to a tile, and pauses out of sight (${lang})`, async ({ page }) => {
      const strings = stringsOf(lang)
      await withPolicy(page, { capabilities: { deny: ['live'] } })
      await page.addInitScript(camera)
      await startPhone(page, lang)
      await connectFakeBrain(page)
      await page.evaluate(() => import('/ui/caps.js').then((caps) => caps.unlock('camera')))
      // On a touch screen, its button sits beside the microphone.
      await page.locator('.composer').getByRole('button', { name: strings['camera.open'] }).click()
      const finder = page.locator('app-camera dialog.is-full')
      await expect(finder).toBeVisible()
      expect(await finder.evaluate((dialog) => dialog.matches(':modal'))).toBe(true)
      const box = await finder.boundingBox()
      expect(box?.width).toBe(390)
      expect(box?.height).toBe(844)

      // The task shows from its first button, the box with it; a message goes, and the tile brings the viewfinder back,
      // the end of Jean's answer at its foot.
      await finder.getByRole('button', { name: strings['camera.task'] }).click()
      const tile = page.locator('app-camera dialog.is-tile')
      await expect(tile).toBeVisible()
      await ask(page, 'What do you see?')
      await expect(page.locator('.msg-jean .prose').last()).toContainText('I can see your picture: 1024 × 768 pixels.', { timeout: 30_000 })
      await tile.locator('.camera-view').click()
      await expect(finder).toBeVisible()
      await expect(finder.locator('.camera-captions')).toContainText('1024 × 768')
      // Escape makes it a tile too.
      await page.keyboard.press('Escape')
      await expect(tile).toBeVisible()

      // Hidden, it stops its tracks and waits for a tap, which opens a new one.
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await expect(tile.getByRole('button', { name: strings['camera.paused'] })).toBeVisible()
      expect(await stopped(page)).toBe(true)
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }) })
      await tile.getByRole('button', { name: strings['camera.paused'] }).click()
      await expect(tile.getByRole('button', { name: strings['camera.paused'] })).toHaveCount(0)
      expect(await stopped(page)).toBe(false)
    })
  }
})

test('while Jean watches, a look with nothing to say leaves nothing, and one that speaks is kept and shown as one', async ({ page }) => {
  test.setTimeout(150_000)
  const strings = stringsOf('en')
  await withPolicy(page, { capabilities: { deny: ['live'] } })
  await page.addInitScript(camera)
  await start(page, 'en')
  await connectFakeBrain(page)
  await turnOn(page, strings['cap.camera.name'])
  await closeSettings(page)
  await expect(page.locator('app-camera dialog.is-tile')).toBeVisible()
  await ask(page, 'Call watch with {"what":"the box standing up"}')
  await answered(page)
  const state = page.locator('app-camera .camera-state')
  await expect(state).toHaveText(strings['camera.watching'])
  const kept = () => page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    // Its messages and steps, not what is kept about it (its title), which may come later.
    return { records: app.current.value?.records.filter((record) => record.update).length, files: (await app.fs.list(`${app.projectDir}/files`)).length, busy: app.busy.value }
  })
  await expect.poll(async () => (await kept()).busy).toBe(false)
  const before = await kept()

  // The scene moves and settles, still lying: Jean looks, says nothing, and nothing is kept.
  const quiet = page.waitForRequest((request) => request.url().endsWith('/chat/completions') && Boolean(request.postData()?.includes('A look you took on your own')), { timeout: 40_000 })
  await page.evaluate(() => { Object.assign(window, { scene: 'moved' }) })
  await quiet
  // Settled once the room is free again and the camera's picture is gone with the look.
  await expect.poll(async () => await kept(), { timeout: 20_000 }).toEqual(before)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(1)

  // It stands: Jean looks, 768 pixels long, and speaks; the look is kept with its picture, under its line.
  await page.evaluate(() => { Object.assign(window, { scene: 'standing' }) })
  await expect(page.locator('.msg-jean .prose').last()).toContainText('It stands now: that step is done (576 × 768).', { timeout: 40_000 })
  await expect(page.locator('.turn').last().locator('.since')).toContainText(strings['cap.camera.name'])
  await expect(page.locator('.turn').last().locator('.msg-user')).toHaveCount(0)
  await expect.poll(async () => (await kept()).files).toBe(before.files + 3)

  // Asked to stop, it stops watching.
  await ask(page, 'Call watch with {}')
  await expect(state).toHaveText(strings['cap.camera.name'])
})

test('an organisation that denies the camera never has it', async ({ page }) => {
  const strings = stringsOf('en')
  await withPolicy(page, { capabilities: { deny: ['camera', 'live'] } })
  await page.addInitScript(camera)
  await start(page, 'en')
  await connectFakeBrain(page)
  expect(await page.evaluate(() => import('/ui/caps.js').then((caps) => caps.unlock('camera')))).toBe(false)
  const settings = await openSettings(page, 'Capabilities')
  await expect(settings.locator('.case > li', { hasText: strings['cap.camera.name'] })).toHaveCount(0)
  await closeSettings(page)
  await page.locator('.composer .add').click()
  await expect(page.locator('#add-menu').getByRole('button', { name: strings['cap.camera.name'] })).toHaveCount(0)
})

test('a brain that can\'t see sends the user to pick one that can', async ({ page }) => {
  const strings = stringsOf('en')
  await withPolicy(page, { capabilities: { deny: ['live'] } })
  await page.addInitScript(camera)
  await start(page, 'en')
  await connectFakeBrain(page)
  // Its provider lists it as reading text only.
  await page.evaluate(async () => {
    const { app, activeBrain } = await import('/ui/state.js')
    const brain = /** @type {any} */ (activeBrain.value)
    app.models.value = { ...app.models.value, [brain.id]: [{ id: brain.model, input: ['text'] }] }
  })
  await page.evaluate(() => import('/ui/caps.js').then((caps) => caps.unlock('camera')))
  await page.locator('.composer .add').click()
  await page.locator('#add-menu').getByRole('button', { name: strings['cap.camera.name'] }).click()
  await expect(page.locator('app-toasts')).toContainText(strings['camera.blind'])
  await expect(page.locator('app-camera dialog')).toHaveCount(0)
  expect(await page.evaluate(() => /** @type {any} */ (window).cameras)).toBeUndefined()
})
