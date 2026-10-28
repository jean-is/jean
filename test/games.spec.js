// Games (D648): found by its skill, a game made with `game` is played out of sight and its report heard, opens beside the task to
// play from its cover, keeps the pane it was played in, saves beside it, and is among the creations; a broken one is reported at
// its line; Phaser is lent; with pages' scripts off, its card; its words in Arabic and Japanese. Saved, it is a page of its own that
// plays from a file, offline, and a task saved as a page plays it where its file opens.
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, openTasks } from './helpers.js'

test.setTimeout(120_000)

const STAR = `const W = 640, H = 360, canvas = document.createElement('canvas'), g = canvas.getContext('2d')
canvas.width = W; canvas.height = H; host.stage.append(canvas)
const game = { phase: 'title', x: W / 2, best: host.load()?.best ?? 0 }
host.state('title')
requestAnimationFrame(function frame () {
  if (game.phase === 'title' && host.input.pressed('a')) { game.phase = 'play'; host.state('play'); host.save({ best: game.best + 1 }) }
  if (game.phase === 'play') game.x += ((host.input.down('right') ? 1 : 0) - (host.input.down('left') ? 1 : 0)) * 4
  g.fillStyle = '#14141f'; g.fillRect(0, 0, W, H); g.fillStyle = '#f7c531'; g.fillRect(game.x - 12, H - 40, 24, 24)
  requestAnimationFrame(frame)
})`
const BROKEN = "let n = 0\nrequestAnimationFrame(function f () {\n  if (++n === 30) null.player.x = 1\n  requestAnimationFrame(f)\n})"

/**
 * Its skill read, then a game made: the answer that says what the tool brought. @param {import('@playwright/test').Page} page @param {Record<string, unknown>} args
 * @param {number} answers before @param {number} timeout for its play-test
 */
async function make(page, args, answers = 0, timeout = 60_000) {
  await ask(page, 'Call skill with {"name":"game"}')
  await answered(page, answers + 1)
  await ask(page, `Call game with ${JSON.stringify({ card: 'You are a catcher of stars.', engine: 'none', actions: ['left', 'right', 'a'], ...args })}`)
  // Its play-test runs the game once more for each action: a Phaser game boots each time.
  await expect(page.locator('.msg-jean .prose')).toHaveCount(answers + 2, { timeout })
  await answered(page, answers + 2)
  return page.locator('.msg-jean .prose').last()
}
/** The game's frame beside the task, for Node to look into: Playwright's own scripts don't run in its opaque frames. @param {import('@playwright/test').Page} page */
const frameOf = async (page) => (await page.locator('app-preview app-game iframe').elementHandle())?.contentFrame()

test('a game made with its skill is played out of sight and reported, opens beside the task, plays from its cover, keeps its pane, pauses, saves beside it and is a creation (D648)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const answer = await make(page, { name: 'Star Catcher', code: STAR })
  await expect(answer).toContainText('Made Star Catcher, at games/')
  await expect(answer).toContainText('Moments: title → play.')
  // a starts it, which the tester did first: held later, it changes nothing.
  await expect(answer).toContainText('left, right changed the picture; a changed nothing.')
  await expect(page.locator('.game-test')).toHaveCount(0)
  // Beside the task, its cover first, then the game.
  const pane = page.locator('app-preview:has(app-game)'), game = page.frameLocator('app-preview app-game iframe')
  await expect(pane).toBeVisible()
  await expect(game.locator('.cover h1')).toHaveText('Star Catcher')
  await game.getByRole('button', { name: 'Play' }).click()
  await expect(game.locator('.cover')).toHaveCount(0)
  await expect(game.getByRole('button', { name: 'Mute' })).toBeVisible()
  await expect(pane).not.toHaveAttribute('data-look')
  // What it saves is kept beside it, and given back.
  await page.keyboard.press('Space')
  await expect.poll(() => page.evaluate(async () => {
    const { app } = await import('/ui/state.js'), [file] = await app.fs.list(`${app.projectDir}/games/.saves`)
    return file ? JSON.parse((await app.fs.read(`${app.projectDir}/games/.saves/${file.name}`)) ?? '{}').save : null
  })).toBe('{"best":1}')
  await expect.poll(async () => (await frameOf(page))?.evaluate(() => /** @type {any} */ (window).host?.load())).toEqual({ best: 1 })
  // Paused when it loses the focus, and started again from its cover.
  await page.locator('#prompt').click()
  await expect(game.locator('.cover h1')).toHaveText('Paused')
  await game.getByRole('button', { name: 'Resume' }).click()
  await expect(game.locator('.cover')).toHaveCount(0)
  await expect.poll(() => page.evaluate(async () => (await (await import('/ui/creations.js')).creationsHere()).map((one) => `${one.kind.id} ${one.name}`))).toContain('games Star Catcher')
})

test('what a game saved comes back after a reload, the game beside the task again (D648)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit runs here like a private window: nothing is kept for the next visit')
  await start(page)
  await connectFakeBrain(page)
  await make(page, { name: 'Star Catcher', code: STAR })
  await page.frameLocator('app-preview app-game iframe').getByRole('button', { name: 'Play' }).click()
  await page.keyboard.press('Space')
  await expect.poll(async () => (await frameOf(page))?.evaluate(() => /** @type {any} */ (window).host?.load())).toEqual({ best: 1 })
  await page.reload()
  await expect(page.locator('app-preview app-game iframe')).toBeVisible()
  await expect.poll(async () => (await frameOf(page))?.evaluate(() => /** @type {any} */ (window).host?.load())).toEqual({ best: 1 })
})

test("a broken game's report names its line and frame, and a loop that never ends throws at its line (D648)", async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await expect(await make(page, { name: 'Broken', code: BROKEN })).toContainText('Error at line 3 (frame 29): TypeError')
  await ask(page, `Call game with ${JSON.stringify({ name: 'Loop', card: 'A loop.', engine: 'none', actions: ['a'], code: "host.state('play')\nlet n = 0\nrequestAnimationFrame(function f () { if (++n === 20) while (true) {} requestAnimationFrame(f) })" })}`)
  await answered(page, 3)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Error at line 3 (frame 19): Error: A loop ran for a second without ending')
})

test('a Phaser game is lent its engine, the skill’s own skeleton played clean (D648)', async ({ page }) => {
  const sheet = await readFile(new URL('../app/caps/skills/directory/game/phaser.md', import.meta.url), 'utf8')
  const code = /```js\n([\s\S]*?)```/.exec(sheet)?.[1] ?? ''
  await start(page)
  await connectFakeBrain(page)
  const answer = await make(page, { name: 'Lantern Leap', engine: 'phaser', actions: ['left', 'right', 'a', 'b'], code })
  await expect(answer).toContainText('Moments: play.')
  await expect(answer).toContainText('left, right, a changed the picture')
})

test('a 3D game is lent Babylon.js, the skill’s own skeleton played clean, its words drawn in HTML over the canvas (D648)', async ({ page }) => {
  // Headless Chromium draws WebGL in software, at about 13 ms a frame for this scene.
  test.setTimeout(240_000)
  const sheet = await readFile(new URL('../app/caps/skills/directory/game/babylon.md', import.meta.url), 'utf8')
  const code = /```js\n([\s\S]*?)```/.exec(sheet)?.[1] ?? ''
  await start(page)
  await connectFakeBrain(page)
  const answer = await make(page, { name: 'Harbour Hop', engine: 'babylon', actions: ['left', 'up', 'a'], code }, 0, 180_000)
  await expect(answer).toContainText('Moments: title → play.')
  await expect(answer).toContainText('left, up changed the picture')
  await expect(answer).toContainText('Words seen: Buoys 0')
  await expect(answer).not.toContainText(/Error|Blocked|Too slow|froze/)
  await expect(page.frameLocator('app-preview app-game iframe').locator('canvas')).toBeVisible()
})

test('a game saved is a page of its own: it plays from a file, its engine inside it, asking for nothing, keeps what it saves, and shows its card where scripts don’t run (D648)', async ({ page, browser, browserName }) => {
  const sheet = await readFile(new URL('../app/caps/skills/directory/game/phaser.md', import.meta.url), 'utf8')
  const code = /```js\n([\s\S]*?)```/.exec(sheet)?.[1] ?? ''
  await start(page)
  await connectFakeBrain(page)
  await make(page, { name: 'Lantern Leap', engine: 'phaser', actions: ['left', 'right', 'a', 'b'], code })
  const pane = page.locator('app-preview:has(app-game)')
  const [download] = await Promise.all([page.waitForEvent('download'), pane.getByRole('button', { name: 'Save Lantern Leap.game.html' }).click()])
  const file = test.info().outputPath('lantern-leap.html')
  await download.saveAs(file)
  const saved = await readFile(file, 'utf8')
  expect(saved).toContain('<script type="text/x-engine" data-name="phaser">')
  expect(saved).not.toContain('data-name="babylon"')
  const playing = await browser.newContext()
  const asked = /** @type {string[]} */ ([]), errors = /** @type {string[]} */ ([])
  playing.on('request', (request) => { if (!/^(file|blob|data):/.test(request.url())) asked.push(request.url()) })
  const alone = await playing.newPage()
  alone.on('pageerror', (error) => errors.push(error.message))
  await alone.goto(pathToFileURL(file).href)
  await expect(alone.locator('.cover h1')).toHaveText('Lantern Leap')
  await alone.getByRole('button', { name: 'Play' }).click()
  await expect(alone.locator('#stage canvas')).toBeVisible()
  await alone.evaluate(() => /** @type {any} */ (window).host.save({ best: 3 }))
  // Kept in the browser's storage of the file; WebKit here keeps nothing across a reload, as a private window.
  if (browserName === 'chromium') {
    await alone.reload()
    await expect.poll(() => alone.evaluate(() => /** @type {any} */ (window).host?.load())).toEqual({ best: 3 })
  }
  expect(errors).toEqual([])
  expect(asked).toEqual([])
  await playing.close()
  const still = await browser.newContext({ javaScriptEnabled: false })
  const off = await still.newPage()
  await off.goto(pathToFileURL(file).href)
  await expect(off.locator('article')).toContainText(['Lantern Leap', 'You are a catcher of stars.'].join(''))
  await still.close()
})

test('a task saved as a page plays its game where its file opens, its engine from the render package (D648)', async ({ page, browser }) => {
  await start(page)
  await connectFakeBrain(page)
  await make(page, { name: 'Star Catcher', code: STAR })
  const row = (await openTasks(page)).locator('.history-list li').first()
  await row.hover()
  await row.getByRole('button', { name: 'More options' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', { name: 'Save a copy' }).click()])
  const file = test.info().outputPath('task.html')
  await download.saveAs(file)
  const reading = await browser.newContext({ serviceWorkers: 'allow' })
  const PACKAGE = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@jean-is\/render@[^/]+\/(.+)$/
  const TYPES = /** @type {Record<string, string>} */ ({ js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', woff2: 'font/woff2', html: 'text/plain' })
  await reading.route(PACKAGE, async (route) => {
    const path = /** @type {string} */ (PACKAGE.exec(route.request().url())?.[1])
    const body = await readFile(new URL(`../app/${path}`, import.meta.url)).catch(() => null)
    await route.fulfill(body ? { body, headers: { 'content-type': TYPES[path.split('.').at(-1) ?? ''] ?? 'application/octet-stream', 'access-control-allow-origin': '*' } } : { status: 404 })
  })
  const copy = await reading.newPage()
  await copy.goto(pathToFileURL(file).href)
  const chip = copy.locator('main details.file-open', { hasText: 'Star Catcher.game.html' }).first()
  await chip.locator('summary').click()
  // Chromium scrolls no page from inside a frame of another origin: the frame first.
  await chip.locator('iframe.view-frame').scrollIntoViewIfNeeded()
  const game = chip.locator('iframe.view-frame').contentFrame()
  await expect(game.locator('.cover h1')).toHaveText('Star Catcher')
  await game.getByRole('button', { name: 'Play' }).click()
  await expect(game.locator('.cover')).toHaveCount(0)
  await expect(game.locator('#stage canvas')).toBeVisible()
  await reading.close()
})

test('with pages’ scripts off, a game shows its card and why it can’t run (D648)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await make(page, { name: 'Star Catcher', code: STAR })
  await page.evaluate(async () => { const { app, updateSettings } = await import('/ui/state.js'); await updateSettings({ pages: /** @type {any} */ ({ ...app.settings.peek().pages, scripts: false }) }) })
  const off = page.locator('app-preview app-game .game-off')
  await expect(off).toContainText('Star Catcher')
  await expect(off).toContainText('This game can’t run here')
  await expect(page.locator('app-preview app-game iframe')).toHaveCount(0)
})

for (const [lang, play, paused] of [['ar', 'العب', 'متوقفة مؤقتًا'], ['ja', 'プレイ', '一時停止中']]) {
  test(`a game's frame in ${lang}: its cover, its buttons and its direction (D648)`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    await make(page, { name: 'Star Catcher', code: STAR })
    const game = page.frameLocator('app-preview app-game iframe')
    await expect(game.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    await game.getByRole('button', { name: play }).click()
    await page.locator('#prompt').click()
    await expect(game.locator('.cover h1')).toHaveText(paused)
  })
}
