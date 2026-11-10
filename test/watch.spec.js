// Jean's reels (D687, docs/reels.md), on jean.is's site as build:web makes it: a reel plays Jean's own conversation,
// demo.js asking the reel for every wait and moment its plan foresaw and no other; it pauses, seeks by chapter, plays
// faster, mutes and goes on in another language, each remembered or said; its captions reach a screen reader; and
// /watch frames each reel in its language, and scrolls under the wheel over one. In English, Arabic and Japanese.
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

const JEAN_IS = 'http://127.0.0.1:4186/'
/** The page's words in a language, as the reels say them, `{name}` the brand's. @param {string} lang */
const wordsOf = async (lang) => JSON.parse((await readFile(new URL(`../site/watch/${lang}.json`, import.meta.url), 'utf8')).replaceAll('{name}', 'Jean'))

/** The reel's own state, as reel.js tells it. @param {import('@playwright/test').Page} page */
const state = (page) => page.evaluate(() => /** @type {any} */ (window).reel.state())
/** The reel sent to a time, as the bar does. @param {import('@playwright/test').Page} page @param {number} ms */
const seek = (page, ms) => page.locator('.reel-seek').evaluate((bar, at) => { /** @type {HTMLInputElement} */ (bar).value = String(at); bar.dispatchEvent(new Event('input')) }, ms)

for (const [lang, dir] of [['en', 'ltr'], ['ar', 'rtl'], ['ja', 'ltr']]) {
  test(`a reel plays Jean’s own replay to its plan, pauses, seeks, plays faster and mutes (${lang})`, async ({ page }) => {
    /** @type {string[]} */
    const wrong = []
    page.on('pageerror', (error) => wrong.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') wrong.push(message.text()) })
    const words = await wordsOf(lang)
    await page.goto(`${JEAN_IS}reel.html#reel=jean&lang=${lang}`)
    await expect(page.locator('html')).toHaveAttribute('dir', dir)
    const reel = page.locator('main.reel')
    await expect(reel).toHaveAttribute('data-state', 'ready')
    // Before it plays: the first card, the name and the promise, Play under them in the reel's words.
    await expect(page.locator('.reel-big')).toHaveText(words['player.play'])
    await page.locator('.reel-big').click()
    await expect(reel).toHaveAttribute('data-state', 'playing')
    // Paused by the keyboard, so that what follows looks at the moments it seeks to.
    await page.keyboard.press('k')
    await expect(reel).toHaveAttribute('data-state', 'paused')
    const scenes = await page.evaluate(() => /** @type {any} */ (window).reel.scenes())
    // The first task's first stop: its caption, said to a screen reader too.
    await seek(page, scenes[1].start + 1200)
    await expect(page.locator('.reel-spoken')).toHaveText(words['jean.chart.say.ask'])
    await expect(page.locator('.reel-caption')).toContainText(words['jean.chart.say.ask'])
    // To that task's end: its replay has caught up, Jean's chart drawn, and demo.js asked for all the plan foresaw and nothing else.
    await seek(page, scenes[1].end - 200)
    const chart = page.frameLocator('.reel-frame >> nth=0').locator('app-chart .chart canvas')
    await expect(chart).toBeVisible()
    await expect.poll(async () => (await state(page)).frames.find((/** @type {any} */ frame) => frame.index === 1)).toMatchObject({ drift: 0 })
    const first = (await state(page)).frames.find((/** @type {any} */ frame) => frame.index === 1)
    expect(first.next).toBe(first.calls)
    // A chapter on with Page Down; played again with Space.
    await page.keyboard.press('PageDown')
    expect((await state(page)).time).toBe(scenes[2].start)
    await page.keyboard.press(' ')
    await expect(reel).toHaveAttribute('data-state', 'playing')
    await page.keyboard.press(' ')
    await expect(reel).toHaveAttribute('data-state', 'paused')
    // Faster, from its menu of speeds; and muted, both kept for the next reel.
    await page.locator('[popovertarget="reel-speeds"]').click()
    await page.locator('#reel-speeds [role="menuitemradio"]').nth(5).click()
    await expect(page.locator('#reel-speeds [aria-checked="true"]')).toHaveCount(1)
    await expect(page.locator('#reel-speeds [role="menuitemradio"]').nth(5)).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: words['player.mute'] }).click()
    await expect(page.getByRole('button', { name: words['player.unmute'] })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => [localStorage.getItem('reel.speed'), localStorage.getItem('reel.muted')])).toEqual(['2', 'true'])
    // The approval: the reel clicks Allow once, as the viewer would, and the replay goes on to its end.
    await seek(page, scenes[3].end - 200)
    await expect(page.frameLocator('.reel-frame >> nth=-1').locator('.msg-jean').last()).toContainText(words['minutes.answer'])
    await expect.poll(async () => (await state(page)).frames.every((/** @type {any} */ frame) => !frame.drift)).toBe(true)
    // Its end: Play again.
    await page.keyboard.press('End')
    await expect(reel).toHaveAttribute('data-state', 'ended')
    await expect(page.getByRole('button', { name: words['player.again'] })).toBeVisible()
    expect(wrong).toEqual([])
  })
}

test('a reel goes on in another language where it was, its frames Jean in that language (en)', async ({ page }) => {
  await page.goto(`${JEAN_IS}reel.html#reel=spreadsheet&lang=en`)
  const scenes = await page.evaluate(async () => { while (!(/** @type {any} */ (window).reel.length)) await new Promise((resolve) => setTimeout(resolve, 50)); return /** @type {any} */ (window).reel.scenes() })
  await seek(page, scenes[1].start + 3000)
  await page.locator('[popovertarget="reel-languages"]').click()
  await page.locator('#reel-languages [lang="fr"]').click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(page.locator('.reel-chapter')).toHaveText((await wordsOf('fr'))['spreadsheet.task.chapter'])
  await expect(page.locator('.reel-frame').first()).toHaveAttribute('src', /lang=fr/)
  expect(page.url()).toContain('lang=fr')
})

for (const [lang, size] of /** @type {const} */ ([['en', { width: 360, height: 200 }], ['ar', { width: 360, height: 200 }]])) {
  test(`a short player’s menus go on in columns beside, none of them cut (${lang})`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto(`${JEAN_IS}reel.html#reel=first-task&lang=${lang}`)
    await expect(page.locator('main.reel')).toHaveAttribute('data-state', 'ready')
    for (const menu of ['reel-speeds', 'reel-languages']) {
      await page.locator(`[popovertarget="${menu}"]`).evaluate((button) => /** @type {HTMLButtonElement} */ (button).click())
      const box = await page.locator(`#${menu}`).boundingBox()
      expect(box && box.y >= 0 && box.x >= 0 && box.x + box.width <= size.width).toBe(true)
      expect(await page.locator(`#${menu}`).evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
      await page.keyboard.press('Escape')
    }
  })
}

test('/watch frames each reel’s player in its language, full screen allowed (en)', async ({ page }) => {
  await page.goto(`${JEAN_IS}watch`)
  const frames = page.locator('.wch-player iframe')
  await expect(frames).toHaveCount(4)
  for (const frame of await frames.all()) await expect(frame).toHaveAttribute('allow', /fullscreen/)
  await expect(page.frameLocator('.wch-player iframe >> nth=0').locator('.reel-big')).toHaveText('Play')
})

test('the wheel over a reel scrolls the page that frames it, before it plays and while it does (en)', async ({ page }) => {
  await page.goto(`${JEAN_IS}watch`)
  const player = page.frameLocator('.wch-player iframe >> nth=0')
  await expect(player.locator('main.reel')).toHaveAttribute('data-state', 'ready')
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('.wch-player').first().boundingBox())
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5)
  await page.mouse.wheel(0, 150)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(150)
  await player.locator('.reel-big').click()
  await expect(player.locator('main.reel')).toHaveAttribute('data-state', 'playing')
  await page.mouse.wheel(0, 150)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(150)
})
