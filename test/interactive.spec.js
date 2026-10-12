// Pages in answers (D289): a ```html block is a page that runs in the answer, in every room, in a
// frame of the preview's kind (scripts only, nothing to or from the internet), shown as it is
// written, in the room's colours and the user's language, as tall as it is. A click on its button
// sends the user's next message; it can chart with the ECharts Jean lends it; Copy gives its source;
// with Run its code off, it is code. Components (D291): a ```mermaid block is a diagram drawn here,
// a ```geojson block a map, shown once the user allows maps, every address it needs fetched by Jean;
// a page holds a map beside its form, in step both ways.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings, nextCopy } from './helpers.js'

/** The language, picked in Settings as start() picks it. @param {import('@playwright/test').Page} page @param {string} lang */
async function speak(page, lang) {
  const settings = await openSettings(page)
  await settings.locator('.settings-panel select').first().selectOption(lang)
  await expect(page.locator('html')).toHaveAttribute('lang', lang)
  await closeSettings(page)
}

test('a page runs in the answer as it is written, sends what it works out on a click, and follows the language', async ({ page }) => {
  const leaks = /** @type {string[]} */ ([])
  page.on('response', (response) => { if (response.url().includes('/leak')) leaks.push(response.url()) })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Make me a bill splitter')

  // Its frame begins while the answer writes it, and is the one that holds the whole page.
  const writing = page.locator('.msg-jean.is-streaming app-page iframe')
  await expect(writing).toHaveCount(1)
  await writing.evaluate((element) => { element.dataset.begun = '' })
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const answer = page.locator('.msg-jean .prose').last()
  const frame = answer.locator('app-page iframe')
  await expect(frame).toHaveAttribute('data-begun', '')

  // In an opaque frame, scripts only, named for those who can't see it, as tall as the page.
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(frame).toHaveAttribute('title', 'Interactive page')
  const inside = frame.contentFrame()
  await expect(inside.locator('#each')).toHaveText('30')
  const tall = await inside.locator('html').evaluate((element) => /** @type {HTMLElement} */ (element).offsetHeight)
  await expect.poll(() => frame.evaluate((element) => element.clientHeight)).toBe(tall)
  await expect(inside.locator('html')).toHaveAttribute('dir', 'ltr')
  // The room's colours, under their own names and under those brains guess, light fallbacks and all.
  const room = (/** @type {string} */ token) => page.evaluate((name) => { const probe = document.createElement('p'); probe.style.color = `var(${name})`; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color }, token)
  expect(await inside.locator('p').first().evaluate((element) => getComputedStyle(element).color)).toBe(await room('--ink-soft'))
  expect(await inside.locator('label').first().evaluate((element) => getComputedStyle(element).color)).toBe(await room('--ink'))
  // Its rule came with the first message, and it comes back at the next visit, so pages written show again.
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.unlocked)).toContain('interactive')

  // Typed, worked out in the page; sent on a click as the user's next message.
  await inside.locator('#people').fill('3')
  await expect(inside.locator('#each')).toHaveText('40')
  await inside.getByRole('button', { name: 'Ask how to round it' }).click()
  await expect(page.locator('.msg-user').last()).toHaveText('Each of us pays 40. How should we round it?')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)

  // Copy: its source.
  const first = page.locator('.msg-jean .prose app-page').first()
  await page.evaluate(() => { /** @type {any} */ (window).copied = new Promise((resolve) => { navigator.clipboard.writeText = async (text) => resolve(text) }) })
  await first.hover()
  await first.getByRole('button', { name: 'Copy' }).click()
  expect(await page.evaluate(() => /** @type {any} */ (window).copied)).toBe(await first.getAttribute('source'))
  expect(leaks).toEqual([])

  // Right to left in Arabic, and in Japanese: the page is written again in the user's language.
  await speak(page, 'ar')
  await expect(first.locator('iframe').contentFrame().locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(first.locator('iframe')).toHaveAttribute('title', 'صفحة تفاعلية')
  await speak(page, 'ja')
  await expect(first.locator('iframe').contentFrame().locator('html')).toHaveAttribute('lang', 'ja')
  await expect(first.locator('iframe').contentFrame().locator('#each')).toHaveText('30')

  // Web pages' code off: it is code again.
  await speak(page, 'en')
  const settings = await openSettings(page, 'Approvals')
  await settings.getByRole('switch', { name: 'Run its code' }).click()
  await closeSettings(page)
  await expect(first.locator('iframe')).toHaveCount(0)
  await expect(first.locator('pre code')).toContainText('sendPrompt(')
})

test('a page charts with the ECharts Jean lends it, with nothing from the internet', async ({ page }) => {
  const outside = /** @type {string[]} */ ([])
  page.on('request', (request) => { if (!/^(data|blob):|^http:\/\/(127\.0\.0\.1|localhost):418/.test(request.url())) outside.push(request.url()) })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Make me a sales explorer')
  const inside = page.locator('.msg-jean app-page iframe').last().contentFrame()
  await expect(inside.locator('#chart canvas')).toBeVisible()
  await inside.locator('#region').selectOption('South')
  await expect(inside.locator('#chart canvas')).toBeVisible()
  expect(outside).toEqual([])
})

/** Maps from the test's own map service, as policy or Settings would name one. @param {import('@playwright/test').Page} page */
const localMaps = (page) => page.evaluate(async () => {
  const { updateSettings } = await import('/ui/state.js')
  await updateSettings({ mapStyles: { light: 'http://127.0.0.1:4182/map/light.json', dark: 'http://127.0.0.1:4182/map/dark.json' } })
})

test('a flowchart and a mind map in Mermaid are drawn in the answer, and copied as a picture (D291)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'When should I take an umbrella?')
  await expect(page.locator('.msg-jean .prose', { hasText: 'Here is how to decide' })).toBeVisible()
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const flow = page.locator('.msg-jean .prose', { hasText: 'Here is how to decide' }).locator('figure.diagram app-diagram')
  await expect(flow).toHaveAttribute('aria-label', 'Diagram')
  // Its boxes and the words on its arrows, in a picture of its own.
  await expect(flow.locator('svg text')).toHaveCount(7)
  expect((await flow.locator('svg text').allTextContents()).sort()).toEqual(['Go out', 'Is it raining?', 'Leaving home', 'No', 'Take an umbrella', 'Wear sunglasses', 'Yes'])
  await expect(flow.locator('svg path[marker-end]')).toHaveCount(5)
  const copy = await nextCopy(page)
  await page.locator('figure.diagram').hover()
  await page.locator('figure.diagram').getByRole('button', { name: 'Copy' }).click()
  const copied = await copy.read()
  expect(copied['text/plain']).toContain('flowchart TD')
  expect(copied['image/png']).toEqual([137, 80, 78, 71])
  await ask(page, 'A mind map of coffee')
  await expect(page.locator('.msg-jean .prose', { hasText: 'The world of coffee' })).toBeVisible()
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const mind = page.locator('.msg-jean .prose', { hasText: 'The world of coffee' }).locator('app-diagram')
  await expect(mind.locator('svg text')).toHaveCount(8)
  expect((await mind.locator('svg text').allTextContents()).sort()).toEqual(['Brewing', 'Coffee', 'Espresso', 'Ethiopia', 'Filter', 'Health', 'Origins', 'Yemen'])
})

test('a map shows once maps are allowed, its addresses fetched by Jean alone; a page keeps a form and a map beside it in step (D291)', async ({ page }) => {
  const asked = /** @type {string[]} */ ([])
  page.on('request', (request) => { if (request.url().includes('/map/')) asked.push(`${request.frame() === page.mainFrame() ? 'jean' : 'page'} ${new URL(request.url()).pathname}`) })
  await page.setViewportSize({ width: 1200, height: 900 })
  await start(page)
  await connectFakeBrain(page)
  await localMaps(page)
  await ask(page, 'Show my trip on a map')
  const frame = page.locator('.msg-jean .prose', { hasText: 'Your trip' }).locator('app-page[map] iframe')
  await expect(frame).toHaveAttribute('title', 'Map')
  const inside = frame.contentFrame()
  // Until maps are allowed, it says where they would come from, and nothing is fetched.
  await expect(inside.locator('app-map')).toContainText('Maps come from 127.0.0.1, which sees the places shown.')
  expect(asked).toEqual([])
  await inside.getByRole('button', { name: 'Show the map' }).click()
  await expect(inside.locator('app-map canvas')).toBeVisible()
  // Its two places and its route, drawn.
  await expect.poll(() => inside.locator('app-map').evaluate((element) => /** @type {any} */ (element).map?.queryRenderedFeatures({ layers: ['places', 'routes'] }).length ?? 0)).toBe(3)
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.pages?.maps)).toBe(true)
  await expect.poll(() => asked).toContain('jean /map/light.json')
  expect(asked.filter((line) => line.startsWith('page'))).toEqual([])

  // A page: its form in <main>, its map in an <aside> beside it, in step both ways.
  await ask(page, 'Open the stop planner')
  await expect(page.locator('.msg-jean .prose', { hasText: 'Pick a stop' })).toBeVisible()
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const planner = page.locator('.msg-jean .prose', { hasText: 'Pick a stop' }).locator('app-page iframe').contentFrame()
  const map = planner.locator('app-map')
  await expect(map.locator('canvas')).toBeVisible()
  const [main, aside] = await Promise.all([planner.locator('main').boundingBox(), planner.locator('aside').boundingBox()])
  expect(aside?.x).toBeGreaterThan((main?.x ?? 0) + (main?.width ?? 0) - 1)
  await planner.locator('#stop').selectOption('Aix')
  await expect(map).toContainText('Aix ★')
  // A stop clicked on the map is chosen in the form.
  await expect.poll(() => map.evaluate((element) => /** @type {any} */ (element).map?.queryRenderedFeatures({ layers: ['places'] }).length ?? 0)).toBe(2)
  const at = await map.evaluate((element) => /** @type {any} */ (element).map.project([5.37, 43.3]))
  const box = await map.boundingBox()
  await page.mouse.click((box?.x ?? 0) + at.x, (box?.y ?? 0) + at.y)
  await expect(planner.locator('#chosen')).toHaveText('Marseille')
  await expect(planner.locator('#stop')).toHaveValue('Marseille')
})

