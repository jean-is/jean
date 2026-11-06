// Screen sharing (D699): a window the user shares goes with each message as a picture, its words readable, kept in the task;
// sharing ends from its tile, the box's chip or the browser's own bar. A first capture of the screen offers it. While Jean
// watches, a look with nothing to say leaves nothing, and one that speaks is kept and shown as one. The browser's picker is
// replaced by a painted canvas, whose window the test changes.
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, withPolicy, openSettings, closeSettings } from './helpers.js'

/** The room's strings and screen sharing's own, in a language. @param {string} lang */
const stringsOf = (lang) => ({
  ...JSON.parse(readFileSync(new URL(`../app/locales/${lang}.json`, import.meta.url), 'utf8')),
  ...JSON.parse(readFileSync(new URL(`../app/locales/screen/${lang}.json`, import.meta.url), 'utf8')),
})

/** The window shared: a canvas, wide (1920 × 1200), with a menu open, or tall (1000 × 1600), as `window.scene` has it. */
function screen() {
  MediaDevices.prototype.getDisplayMedia = async function () {
    const canvas = Object.assign(document.createElement('canvas'), { width: 1920, height: 1200 })
    const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
    const paint = () => {
      const scene = /** @type {any} */ (window).scene ?? 'wide'
      const [width, height] = scene === 'tall' ? [1000, 1600] : [1920, 1200]
      if (canvas.width !== width) Object.assign(canvas, { width, height })
      context.fillStyle = '#f4f4f0'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#20406a'
      context.fillRect(0, 0, width, 80)
      if (scene === 'menu') context.fillRect(40, 80, 640, 700)
    }
    paint()
    setInterval(paint, 50)
    const stream = canvas.captureStream(20)
    Object.assign(window, { screens: [.../** @type {any} */ (window).screens ?? [], stream] })
    return stream
  }
}

/** Found, sharing starts from its row in +. @param {import('@playwright/test').Page} page @param {Record<string, string>} strings */
async function shareFromPlus(page, strings) {
  await page.evaluate(() => import('/ui/caps.js').then((caps) => caps.unlock('screen')))
  await page.locator('.composer .add').click()
  await page.locator('#add-menu').getByRole('button', { name: strings['cap.screen.name'] }).click()
}

/** Whether every stream shared has stopped. @param {import('@playwright/test').Page} page */
const stopped = (page) => page.evaluate(() => /** @type {MediaStream[]} */ (/** @type {any} */ (window).screens).every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')))

/** How each language's test ends sharing: its tile, the box's chip, the browser's own bar. */
const ENDS = { en: 'tile', ar: 'chip', ja: 'bar' }

for (const [lang, end] of Object.entries(ENDS)) {
  test(`the window shared goes with each message, readable, and sharing ends from its ${end} (${lang})`, async ({ page }) => {
    const strings = stringsOf(lang)
    await page.addInitScript(screen)
    await start(page, lang)
    await connectFakeBrain(page)
    await shareFromPlus(page, strings)
    const tile = page.locator('app-screen .screen.is-tile')
    await expect(tile).toBeVisible()
    await expect(tile.locator('.camera-state')).toHaveText(strings['cap.screen.name'])
    // In +, its row is ticked while sharing is on, among what shows Jean something live, apart from the screenshot (D292).
    await page.locator('.composer .add').click()
    const row = page.locator('#add-menu').getByRole('button', { name: strings['cap.screen.name'] })
    await expect(row).toHaveAttribute('aria-pressed', 'true')
    await expect(row.locator('svg')).toHaveCount(2)
    await expect(page.locator('#add-menu ul').filter({ has: row }).getByRole('button', { name: strings['capture.start'] })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('#add-menu')).toBeHidden()
    await expect(page.locator('.composer .mode-chip')).toContainText(strings['cap.screen.name'])

    // A message shares the window as it is now, 1,568 pixels long, kept in the task under its name.
    await ask(page, 'How do I export this?')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('I can see your picture: 1568 × 980 pixels.', { timeout: 30_000 })
    await expect(page.locator('.msg-files .is-picture')).toHaveCount(1)
    await expect(page.locator('.msg-files .is-picture')).toHaveAccessibleName(new RegExp(strings['screen.picture'].replace(/\s*\{time\}\s*/, '')))

    // Moved by its button, it goes round the window's corners, starting away from the camera's.
    await expect(tile).toHaveAttribute('data-corner', 'bottom-end')
    await tile.getByRole('button', { name: strings['screen.move'] }).click()
    await expect(tile).toHaveAttribute('data-corner', 'bottom-start')

    // Ended, every track stops, its chip goes, and a message shares nothing.
    if (end === 'tile') await tile.getByRole('button', { name: strings['screen.close'] }).click()
    else if (end === 'chip') await page.locator('.composer .mode-chip').click()
    else await page.evaluate(() => /** @type {MediaStream[]} */ (/** @type {any} */ (window).screens)[0].getVideoTracks()[0].dispatchEvent(new Event('ended')))
    await expect(page.locator('app-screen .screen')).toHaveCount(0)
    expect(await stopped(page)).toBe(true)
    await expect(page.locator('.composer .mode-chip')).toHaveCount(0)
    await ask(page, 'Thanks')
    await answered(page, 2)
    await expect(page.locator('.msg-files .is-picture')).toHaveCount(1)
  })
}

test('a capture of the screen offers sharing it, which starts once accepted', async ({ page }) => {
  const strings = stringsOf('en')
  await page.addInitScript(screen)
  await start(page, 'en')
  await connectFakeBrain(page)
  await page.locator('.composer .add').click()
  await page.getByRole('button', { name: strings['capture.start'] }).click()
  const offer = page.locator('.offer')
  await expect(offer).toContainText(strings['cap.screen.offer'])
  await offer.getByRole('button', { name: strings['cap.screen.yes'] }).click()
  // The browser asks for a screen just after a click: when that has gone by, as on a busy computer, a button asks.
  const tile = page.locator('app-screen .screen.is-tile')
  const asks = page.locator('app-toasts').getByRole('button', { name: strings['cap.screen.yes'] })
  await expect(tile.or(asks)).toBeVisible()
  if (await asks.isVisible()) await asks.click()
  await expect(tile).toBeVisible()
  expect(await page.evaluate(async () => (await import('/ui/caps.js')).loaded.value.has('screen'))).toBe(true)
})

test('while Jean watches the screen, a look with nothing to say leaves nothing, and one that speaks is kept and shown as one', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'when Jean looks is timers, the sharing itself the tests above')
  test.setTimeout(150_000)
  const strings = stringsOf('en')
  await page.addInitScript(screen)
  await start(page, 'en')
  await connectFakeBrain(page)
  await shareFromPlus(page, strings)
  await expect(page.locator('app-screen .screen.is-tile')).toBeVisible()
  await ask(page, 'Call watch_screen with {"what":"each step of the export"}')
  await answered(page)
  const state = page.locator('app-screen .camera-state')
  await expect(state).toHaveText(strings['screen.watching'])
  const kept = () => page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    // Its messages and steps, not what is kept about it (its title), which may come later.
    return { records: app.current.value?.records.filter((record) => record.update).length, files: (await app.fs.list(`${app.projectDir}/files`)).length, busy: app.busy.value }
  })
  await expect.poll(async () => (await kept()).busy).toBe(false)
  const before = await kept()

  // A menu opens and stays: Jean looks, says nothing, and nothing is kept.
  const quiet = page.waitForRequest((request) => request.url().endsWith('/chat/completions') && Boolean(request.postData()?.includes('A look you took on your own at the user\'s screen')), { timeout: 40_000 })
  await page.evaluate(() => { Object.assign(window, { scene: 'menu' }) })
  await quiet
  await expect.poll(async () => await kept(), { timeout: 20_000 }).toEqual(before)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(1)

  // The window stands tall: Jean looks, 1,280 pixels long, and speaks; the look is kept with its picture, under its line.
  await page.evaluate(() => { Object.assign(window, { scene: 'tall' }) })
  await expect(page.locator('.msg-jean .prose').last()).toContainText('It stands now: that step is done (800 × 1280).', { timeout: 40_000 })
  await expect(page.locator('.turn').last().locator('.since')).toContainText(strings['cap.screen.name'])
  await expect(page.locator('.turn').last().locator('.msg-user')).toHaveCount(0)
  await expect.poll(async () => (await kept()).files).toBe(before.files + 3)

  // Asked to stop, it stops watching, and still shares.
  await ask(page, 'Call watch_screen with {}')
  await expect(state).toHaveText(strings['cap.screen.name'])
})

test('an organisation that denies screen sharing never has it', async ({ page }) => {
  const strings = stringsOf('en')
  await withPolicy(page, { capabilities: { deny: ['screen'] } })
  await page.addInitScript(screen)
  await start(page, 'en')
  await connectFakeBrain(page)
  expect(await page.evaluate(() => import('/ui/caps.js').then((caps) => caps.unlock('screen')))).toBe(false)
  const settings = await openSettings(page, 'Capabilities')
  await expect(settings.locator('.case > li', { hasText: strings['cap.screen.name'] })).toHaveCount(0)
  await closeSettings(page)
  await page.locator('.composer .add').click()
  await expect(page.locator('#add-menu').getByRole('button', { name: strings['cap.screen.name'] })).toHaveCount(0)
})

test('a brain that can\'t see sends the user to pick one that can, and nothing is shared', async ({ page }) => {
  const strings = stringsOf('en')
  await page.addInitScript(screen)
  await start(page, 'en')
  await connectFakeBrain(page)
  // Its provider lists it as reading text only.
  await page.evaluate(async () => {
    const { app, activeBrain } = await import('/ui/state.js')
    const brain = /** @type {any} */ (activeBrain.value)
    app.models.value = { ...app.models.value, [brain.id]: [{ id: brain.model, input: ['text'] }] }
  })
  await shareFromPlus(page, strings)
  await expect(page.locator('app-toasts')).toContainText(strings['screen.blind'])
  await expect(page.locator('app-screen .screen')).toHaveCount(0)
  expect(await page.evaluate(() => /** @type {any} */ (window).screens)).toBeUndefined()
})
