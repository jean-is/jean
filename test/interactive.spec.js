// Pages in answers (D289): a ```html block is a page that runs in the answer, in every room, in a
// frame of the preview's kind (scripts and forms, nothing to or from the internet), shown as it is
// written, in the room's colours and the user's language, as tall as it is. Its form, sent with
// Enter, sends the user's next message; it can chart with the ECharts Jean lends it; Copy gives
// its source; with Run its code off, it is code. Components (D291): a ```mermaid block is a diagram
// drawn by Pele (D592), of any kind, in a page too; a ```geojson block a map, shown once the user allows maps, every address it needs
// fetched by Jean; a page holds a map beside its form, in step both ways. A diagram saved as a
// .mmd file, or in a Markdown file, is drawn as in an answer, in the browser and the preview (D432).
// The pages answers hold are apps among the creations once the project holds one (D553).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, openSettings, openApprovals, closeSettings, openTasks, nextCopy } from './helpers.js'

/** The language, picked in Settings as start() picks it. @param {import('@playwright/test').Page} page @param {string} lang */
async function speak(page, lang) {
  const settings = await openSettings(page)
  await settings.locator('.settings-panel select').first().selectOption(lang)
  await expect(page.locator('html')).toHaveAttribute('lang', lang)
  await closeSettings(page)
}

test('a page runs in the answer as it is written, sends what it works out with Enter, and follows the language', async ({ page }) => {
  const leaks = /** @type {string[]} */ ([])
  page.on('response', (response) => { if (response.url().includes('/leak')) leaks.push(response.url()) })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Make me a bill splitter')

  // Its frame begins while the answer writes it, its fence still open, a doctype its first line, and is the one that holds the whole page.
  const writing = page.locator('.msg-jean.is-streaming app-page[open] iframe')
  await expect(writing).toHaveCount(1)
  await writing.evaluate((element) => { element.dataset.begun = '' })
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const answer = page.locator('.msg-jean .prose').last()
  const frame = answer.locator('app-page iframe')
  await expect(frame).toHaveAttribute('data-begun', '')

  // In an opaque frame, scripts and forms, named for those who can't see it, as tall as the page.
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-forms')
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

  // Typed, worked out in the page; sent with Enter, its form's submit, as the user's next message.
  await inside.locator('#people').fill('3')
  await expect(inside.locator('#each')).toHaveText('40')
  await inside.locator('#people').press('Enter')
  await expect(page.locator('.msg-user').last()).toHaveText('Each of us pays 40. How should we round it?')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)

  // Copy: its source.
  const first = page.locator('.msg-jean .prose app-page').first()
  await page.evaluate(() => { /** @type {any} */ (window).copied = new Promise((resolve) => { navigator.clipboard.writeText = async (text) => resolve(text) }) })
  await first.hover()
  await first.getByRole('button', { name: 'Copy' }).click()
  expect(await page.evaluate(() => /** @type {any} */ (window).copied)).toBe(await first.getAttribute('source'))
  expect(leaks).toEqual([])

  // Right to left in Arabic, and in Japanese, then dark: the room is put on the page as it is, which
  // keeps its frame and what was typed in it.
  const kept = first.locator('iframe').contentFrame()
  await first.locator('iframe').evaluate((element) => { element.dataset.kept = '' })
  await speak(page, 'ar')
  await expect(kept.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(first.locator('iframe')).toHaveAttribute('title', 'صفحة تفاعلية')
  await speak(page, 'ja')
  await expect(kept.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(kept.locator('html')).toHaveAttribute('dir', 'ltr')
  const light = await kept.locator('label').first().evaluate((element) => getComputedStyle(element).color)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(kept.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await kept.locator('label').first().evaluate((element) => getComputedStyle(element).color)).not.toBe(light)
  expect(await kept.locator('label').first().evaluate((element) => getComputedStyle(element).color)).toBe(await room('--ink'))
  expect(await kept.locator('html').evaluate((element) => getComputedStyle(element).colorScheme)).toBe('dark')
  await expect(first.locator('iframe')).toHaveAttribute('data-kept', '')
  await expect(kept.locator('#people')).toHaveValue('3')
  await expect(kept.locator('#each')).toHaveText('40')

  // Web pages' code off: it is code again.
  await speak(page, 'en')
  const settings = await openApprovals(page, 'pages')
  await settings.getByRole('switch', { name: 'Run its code' }).click()
  await closeSettings(page)
  await expect(first.locator('iframe')).toHaveCount(0)
  await expect(first.locator('pre code')).toContainText('sendPrompt(')
})

test('a page charts with the ECharts Jean lends it, with nothing from the internet, and made to fill a screen, is as tall as a page may be', async ({ page }) => {
  const outside = /** @type {string[]} */ ([])
  page.on('request', (request) => { if (!/^(data|blob):|^http:\/\/(127\.0\.0\.1|localhost):418/.test(request.url())) outside.push(request.url()) })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Make me a sales explorer')
  const frame = page.locator('.msg-jean app-page iframe').last()
  const inside = frame.contentFrame()
  await expect(inside.locator('#chart canvas')).toBeVisible()
  // Its root and body as tall as its frame, whatever it holds: a page may be 85% of the window.
  const most = await page.evaluate(() => Math.round(innerHeight * 0.85))
  await expect.poll(() => frame.evaluate((element) => element.clientHeight)).toBe(most)
  expect(await inside.locator('#chart canvas').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(most / 2)
  await inside.locator('#region').selectOption('South')
  await expect(inside.locator('#chart canvas')).toBeVisible()
  // Dark: the chart takes it as it is, keeping what the page set on it last.
  const shown = () => inside.locator('#chart').evaluate(async (element) => {
    const chart = /** @type {any} */ (await import('echarts')).getInstanceByDom(element)
    return { data: chart.getOption().series[0].data, label: chart.getModel().getComponent('yAxis').get(['axisLabel', 'color']) }
  })
  const light = await shown()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(async () => (await shown()).label).not.toBe(light.label)
  expect((await shown()).data).toEqual([950, 1010])
  expect(outside).toEqual([])
})

/** Maps from the test's own map service, as policy or Settings would name one. @param {import('@playwright/test').Page} page */
const localMaps = (page) => page.evaluate(async () => {
  const { updateSettings } = await import('/ui/state.js')
  await updateSettings({ mapStyles: { light: 'http://127.0.0.1:4182/map/light.json', dark: 'http://127.0.0.1:4182/map/dark.json' } })
})

test('a flowchart and a mind map in Mermaid are drawn in the answer by Pele, and copied as a picture (D291, D592)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'When should I take an umbrella?')
  await expect(page.locator('.msg-jean .prose', { hasText: 'Here is how to decide' })).toBeVisible()
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const figure = page.locator('.msg-jean .prose', { hasText: 'Here is how to decide' }).locator('figure.diagram')
  await expect(figure).toHaveAttribute('aria-label', 'Diagram')
  // Pele's picture, its boxes and the words on its arrows its words.
  const flow = figure.locator('app-diagram img')
  await expect(flow).toHaveAttribute('alt', /Leaving home/)
  expect(String(await flow.getAttribute('alt')).split(', ').sort()).toEqual(['Go out', 'Is it raining?', 'Leaving home', 'No', 'Take an umbrella', 'Wear sunglasses', 'Yes'])
  expect(await flow.evaluate((/** @type {HTMLImageElement} */ img) => img.decode().then(() => img.naturalWidth > 100 && img.src.includes('--pele-fg')))).toBe(true)
  const copy = await nextCopy(page)
  await page.locator('figure.diagram').hover()
  await page.locator('figure.diagram').getByRole('button', { name: 'Copy' }).click()
  const copied = await copy.read()
  expect(copied['text/plain']).toContain('flowchart TD')
  expect(copied['image/png']).toEqual([137, 80, 78, 71])
  await ask(page, 'A mind map of coffee')
  await expect(page.locator('.msg-jean .prose', { hasText: 'The world of coffee' })).toBeVisible()
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const mind = page.locator('.msg-jean .prose', { hasText: 'The world of coffee' }).locator('app-diagram img')
  await expect(mind).toHaveAttribute('alt', /Ethiopia/)
  expect(String(await mind.getAttribute('alt')).split(', ').sort()).toEqual(['Brewing', 'Coffee', 'Espresso', 'Ethiopia', 'Filter', 'Health', 'Origins', 'Yemen'])
})

test('a page holds a diagram that follows its form, drawn by Jean in the room\'s colours (D291, D592)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'A page with the steps diagram')
  const frame = page.frameLocator('.msg-jean app-page iframe')
  const picture = frame.locator('app-diagram img')
  await expect(picture).toHaveAttribute('alt', /Bike/)
  expect(await picture.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  await frame.locator('#by').selectOption('Train')
  await expect(picture).toHaveAttribute('alt', /Train/)
})

test('a diagram saved as a .mmd file, or in a Markdown file, is drawn in the browser as in an answer, once the diagrams’ module has come (D432)', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    await app.fs.write(`${app.projectDir}/workspace/notes.md`, '# Notes\n\n```mermaid\nflowchart LR\n  A[Milk] --> B[Butter]\n```')
    await app.fs.write(`${app.projectDir}/workspace/bread.mmd`, 'flowchart LR\n  A[Flour] --> B([Bread)]')
    await app.fs.write(`${app.projectDir}/workspace/talk.mmd`, 'sequenceDiagram\n  Ana->>Ben: Hello\n  Ben-->>Ana: Hi')
    await app.fs.write(`${app.projectDir}/workspace/torn.md`, '# Torn\n\n```mermaid\nflowchart TD\n  A --> B[Hel\n```')
    for (const id of ['computer', 'browser']) await (await import('/ui/caps.js')).unlock(id)
  })
  await page.keyboard.press('ControlOrMeta+Shift+KeyB')
  const address = page.locator('app-browser .browser .browser-bar input')
  const view = page.locator('app-browser .view')
  // Nothing of diagrams has come when the file first shows: its diagram is drawn once it has.
  await address.fill('/workspace/notes.md')
  await address.press('Enter')
  await expect(view.locator('.view-sheet').getByRole('heading', { name: 'Notes' })).toBeVisible()
  await expect(view.locator('.view-sheet app-diagram img')).toHaveCount(1)
  await expect(view.locator('.view-sheet app-diagram img')).toHaveAttribute('alt', 'Milk, Butter')
  // Its brackets closed swapped, as brains write them: mended for Pele.
  await address.fill('/workspace/bread.mmd')
  await address.press('Enter')
  await expect(view.locator('app-diagram img')).toHaveAttribute('alt', 'Flour, Bread')
  await expect(view.locator('.view-text')).toHaveCount(0)
  // Any kind Mermaid draws; and one Pele can't read stays code.
  await address.fill('/workspace/talk.mmd')
  await address.press('Enter')
  await expect(view.locator('app-diagram img')).toHaveAttribute('alt', /Hello/)
  await address.fill('/workspace/torn.md')
  await address.press('Enter')
  await expect(view.locator('.view-sheet pre')).toContainText('A --> B[Hel')
  await expect(view.locator('.view-sheet app-diagram')).toHaveCount(0)
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
  // Brought to the map's middle first: near its foot, the box over the conversation's end may cover it.
  const at = await map.evaluate((element) => { const { map } = /** @type {any} */ (element); map.jumpTo({ center: [5.37, 43.3] }); return map.project([5.37, 43.3]) })
  await map.locator('canvas').click({ position: { x: at.x, y: at.y } })
  await expect(planner.locator('#chosen')).toHaveText('Marseille')
  await expect(planner.locator('#stop')).toHaveValue('Marseille')

  // Dark: the map takes the service's dark style, its places drawn again on it, and the page keeps its stop.
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => asked).toContain('jean /map/dark.json')
  await expect.poll(() => map.evaluate((element) => /** @type {any} */ (element).map?.queryRenderedFeatures({ layers: ['places'] }).length ?? 0)).toBe(2)
  await expect(planner.locator('#stop')).toHaveValue('Marseille')
  expect(asked.filter((line) => line.startsWith('page'))).toEqual([])
})

test('a page of parts a brain left open, in a tag of its own making and its fence never closed, is still drawn in the answer, the words after it the answer’s own, in Arabic and Japanese too (D631)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  for (const [lang, asked, heads, said] of [['en', 'Make me a garden log, left open', ['Harvests', 'Kg by month', 'Log a harvest'], "It shows the season's harvests and what each month gave."],
    ['ar', 'اصنع لي سجل الحديقة مفتوحًا', ['المحاصيل', 'الكيلوغرامات شهريًا', 'سجّل محصولًا'], 'تُظهر محاصيل الموسم وما أعطاه كل شهر.'],
    ['ja', '菜園の記録を開いたままで', ['収穫', '月ごとのkg', '収穫を記録'], '今シーズンの収穫と、月ごとの量です。']]) {
    if (lang !== 'en') await speak(page, /** @type {string} */ (lang))
    await ask(page, /** @type {string} */ (asked))
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    const answer = page.locator('.msg-jean .prose').last(), parts = answer.locator('app-parts')
    await expect(answer.locator('app-page')).toHaveCount(0)
    await expect(parts.locator('.part-card > h4')).toHaveText(heads)
    await expect(parts.locator('app-chart .chart canvas').first()).toBeVisible()
    // Its words follow it as the answer's own, outside its box, and aren't in what Copy gives.
    await expect(answer.locator(':scope > p').last()).toHaveText(/** @type {string} */ (said))
    await expect(parts).not.toContainText(/** @type {string} */ (said))
    expect(await parts.getAttribute('source')).not.toContain(said)
  }
  expect(await page.locator('.msg-jean .prose').last().evaluate((element) => getComputedStyle(element).direction)).toBe('ltr')
  expect(await page.locator('.msg-jean .prose').nth(1).evaluate((element) => getComputedStyle(element.querySelector(':scope > p:last-of-type') ?? element).direction)).toBe('rtl')
})

test('Visual answers, a mode + turns on: shown pressed at the box’s foot, its skill’s steps told once in a task, then its name, until it is pressed off', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  /** Asks, then waits for the answer to end. @param {string} text */
  const asked = async (text) => {
    await ask(page, text)
    await expect(page.locator('.msg-user').last()).toHaveText(text)
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  }
  await asked('Hello')
  const told = () => page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    return (app.current.value?.records ?? []).flatMap(({ update }) => (update?.sessionUpdate === '_system_note' && update.data.kind === 'mode' ? [update.text] : []))
  })
  const chip = page.locator('.composer .mode-chip')
  await expect(chip).toHaveCount(0)
  // In +, by the skill's own name; picked, pressed at the box's foot, the keyboard in the box.
  await page.locator('.composer .add').click()
  await page.locator('#add-menu').getByRole('button', { name: 'Visual answers' }).click()
  await expect(chip).toHaveText('Visual answers')
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#prompt')).toBeFocused()
  await page.locator('.composer .add').click()
  await expect(page.locator('#add-menu').getByRole('button', { name: 'Visual answers' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')

  await asked('Plan my day in Lyon')
  await asked('And tomorrow')
  const [first, second] = await told()
  expect(first).toContain('The user turned on visual answers: for this message, follow the steps of the skill visual:')
  expect(first).toContain('```geojson')
  expect(second).toBe('The user turned on visual answers: for this message, follow the steps of the skill visual, given above.')

  // Pressed, it goes, and nothing more is told.
  await chip.click()
  await expect(chip).toHaveCount(0)
  await asked('Thanks')
  expect(await told()).toHaveLength(2)
})

test('the pages answers hold are apps among the creations once there is one, the newest of each name alone, still on its card, working beside the task, marked in its task, and Create asks for one (D553)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const tasks = await openTasks(page)
  const place = tasks.getByRole('button', { name: 'Creations', exact: true })
  // Nothing of them while the project holds no app, though the pages' capability comes with the first message.
  await ask(page, 'Hello there')
  await answered(page)
  expect(await page.evaluate(async () => (await import('/ui/caps.js')).loaded.value.has('interactive'))).toBe(true)
  await expect(place).toHaveCount(0)
  await ask(page, 'Make me a tip calculator')
  await answered(page, 2)
  await ask(page, 'Round the tip up')
  await answered(page, 3)
  await expect(page.locator('.msg-jean app-page')).toHaveCount(2)

  // One app, by its title: its newest version, on its card at half size and still.
  await place.click()
  const creations = page.locator('app-creations'), card = creations.locator('.creation')
  await expect(card.locator('.creation-open')).toHaveText(['Tip calculator'])
  await expect(card.locator('.creation-preview app-page iframe').contentFrame().locator('#tip')).toHaveText('13')
  expect(await card.locator('.creation-preview').evaluate((element) => /** @type {HTMLElement} */ (element).inert)).toBe(true)
  // Picked, it opens beside the task, where it works as in its answer.
  await card.locator('.creation-open').click()
  await expect(page.locator('app-preview app-page.beside iframe').contentFrame().locator('#tip')).toHaveText('13')
  await expect(page.locator('app-preview .pane-head h2')).toHaveText('Tip calculator')

  // Renamed and pinned by a record in its task; another like it asked for in the box; taken off the page, its answer keeping it.
  const menu = async () => { await card.click({ button: 'right' }); return creations.locator('.task-menu:popover-open') }
  await (await menu()).getByRole('button', { name: 'Rename' }).click()
  await page.keyboard.type('Tips')
  await page.keyboard.press('Enter')
  await (await menu()).getByRole('button', { name: 'Pin' }).click()
  await expect(card.locator('.creation-open')).toHaveText(['Tips'])
  const apps = () => page.evaluate(async () => (await (await import('/ui/creations.js')).creationsHere()).map((one) => `${one.name}${one.pinned ? ' (pinned)' : ''}`))
  await expect.poll(apps).toEqual(['Tips (pinned)'])
  await (await menu()).getByRole('button', { name: 'Another like this' }).click()
  await expect(page.locator('#prompt')).toHaveValue('Make an app like “Tips”, but ')
  await page.locator('#prompt').fill('')
  await (await menu()).getByRole('button', { name: 'Remove from Creations' }).click()
  await expect(card).toHaveCount(0)
  await expect.poll(apps, { timeout: 10_000 }).toEqual([])

  // Create, an app the only kind: a request in the box, its example selected for the user's own words.
  await expect(creations.locator('.creations-bar').getByRole('button', { name: 'Create', exact: true })).toHaveAttribute('title', 'App')
  await creations.locator('.creations-bar').getByRole('button', { name: 'Create', exact: true }).click()
  const box = page.locator('#prompt')
  await expect(box).toBeFocused()
  await expect(box).toHaveValue('Make a small app for splitting a bill between friends.')
  expect(await box.evaluate((/** @type {HTMLTextAreaElement} */ area) => area.value.slice(area.selectionStart, area.selectionEnd))).toBe('splitting a bill between friends')
  // Its task still holds both pages.
  await (await openTasks(page)).locator('.history-list li').first().click()
  await expect(page.locator('.msg-jean app-page')).toHaveCount(2)
})

test('a page of parts alone is drawn in the answer itself, with no frame: key figures, cards, a table its heads sort and its form adds to, a chart, a form that asks, mirrored in Arabic, in Japanese too (D631)', async ({ page }) => {
  // Not even as it begins: a frame made and let go, in which Playwright's block on service workers throws (playwright.config.js).
  const frames = /** @type {string[]} */ ([]), errors = /** @type {string[]} */ ([])
  page.on('frameattached', (frame) => frames.push(frame.url()))
  page.on('pageerror', (error) => errors.push(error.message))
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Make me a garden log')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const parts = page.locator('.msg-jean .prose app-parts').last()
  await expect(parts.locator('iframe')).toHaveCount(0)
  await expect(page.locator('.msg-jean app-page')).toHaveCount(0)

  // Key figures as the answers' own (D215), then cards, the first a whole row.
  await expect(parts.locator('ul.figures > li strong')).toHaveText(['12', '€84'])
  await expect(parts.locator('.part-card > h4')).toHaveText(['Harvests', 'Kg by month', 'Log a harvest'])
  await expect(parts.locator('.part-card').first()).toHaveClass(/wide/)
  // The table, its amounts at the end, sorted by a head, up then down.
  const harvests = parts.locator('.part-card').first(), rows = harvests.locator('tbody tr')
  await expect(rows.locator('td:first-child')).toHaveText(['2026-09-02', '2026-09-15', '2026-08-20'])
  await expect(rows.first().locator('td').last()).toHaveClass('align-right')
  await harvests.getByRole('button', { name: 'Kg', exact: true }).click()
  await expect(harvests.locator('th').last()).toHaveAttribute('aria-sort', 'ascending')
  await expect(rows.locator('td:last-child')).toHaveText(['1.2', '4.5', '12'])
  await harvests.getByRole('button', { name: 'Kg', exact: true }).click()
  await expect(harvests.locator('th').last()).toHaveAttribute('aria-sort', 'descending')
  await expect(rows.locator('td:last-child')).toHaveText(['12', '4.5', '1.2'])
  // The chart, drawn by Charts, which it brought.
  await expect(parts.locator('app-chart .chart canvas').first()).toBeVisible()

  // Its form adds a row to the table, for this visit, sorted among the others, and is empty again.
  const log = parts.locator('form').first()
  await log.locator('input[type="date"]').fill('2026-10-01')
  await log.locator('select').selectOption('Beans')
  await log.locator('input[type="number"]').fill('2')
  await log.getByRole('button', { name: 'Add harvest' }).click()
  await expect(rows.locator('td:last-child')).toHaveText(['12', '4.5', '2', '1.2'])
  await expect(rows.nth(2).locator('td')).toHaveText(['2026-10-01', 'Beans', '2'])
  await expect(log.locator('input[type="number"]')).toHaveValue('')
  // The other sends what it asks and its field as the user's next message, once the answer is over.
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.busy.value)).toBe(false)
  await parts.getByRole('button', { name: 'Show season' }).click()
  await expect(page.locator('.msg-user').last()).toContainText('Show season')
  await expect(page.locator('.msg-user').last()).toContainText('Season: 2026')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)

  // Copy: its source.
  const first = page.locator('.msg-jean .prose app-parts').first()
  await page.evaluate(() => { /** @type {any} */ (window).copied = new Promise((resolve) => { navigator.clipboard.writeText = async (text) => resolve(text) }) })
  await first.hover()
  await first.locator(':scope > .drawn-foot').getByRole('button', { name: 'Copy' }).click()
  expect(await page.evaluate(() => /** @type {any} */ (window).copied)).toBe(await first.getAttribute('source'))

  // A page in Arabic, right to left as its words are: its amounts at the line's end, which is its left, in Arabic digits, sorted by
  // their values; its chart. In Japanese, left to right.
  await speak(page, 'ar')
  await ask(page, 'اصنع لي سجل الحديقة')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const arabic = page.locator('.msg-jean .prose app-parts').last(), crops = arabic.locator('.part-card').first()
  await expect(arabic.locator('ul.figures > li strong')).toHaveText(['١٢', '٨٤ €'])
  expect(await crops.locator('tbody td').last().evaluate((element) => [getComputedStyle(element).direction, getComputedStyle(element).textAlign])).toEqual(['rtl', 'end'])
  await crops.getByRole('button', { name: 'كغ', exact: true }).click()
  await expect(crops.locator('tbody td:last-child')).toHaveText(['١٫٢', '٤٫٥', '١٢'])
  await expect(arabic.locator('app-chart .chart canvas').first()).toBeVisible()
  await speak(page, 'ja')
  await ask(page, '菜園の記録を作って')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const japanese = page.locator('.msg-jean .prose app-parts').last()
  await expect(japanese.locator('.part-card > h4')).toHaveText(['収穫', '月ごとのkg', '収穫を記録'])
  expect(await japanese.locator('tbody td').first().evaluate((element) => getComputedStyle(element).direction)).toBe('ltr')
  await expect(japanese.locator('app-chart .chart canvas').first()).toBeVisible()
  expect(frames).toEqual([])
  expect(errors).toEqual([])
})
