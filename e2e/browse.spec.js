// The browser (D140): web pages beside the conversation, with back, forward, reload and full
// screen. Links from answers open there once it's found, after three opened elsewhere; the brain
// opens a page there and reads it; the page on show reaches the brain's next note. A site that
// refuses to be framed opens in a tab of its own from then on, and Jean recommends installing it
// as an app. ⌘⇧B opens and closes it. It shares the side of the window with a file's preview, neither
// covering the other, and its edge and the divider between them resize them (D144). Right to left, the pane mirrors; in Japanese, its strings are Japanese.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings, closeTasks, BRAIN_URL, SALES } from './helpers.js'

const SITE = BRAIN_URL.replace(/\/v1$/, '/site')

/** The site's page, in the frame inside the browser's own document. @param {import('@playwright/test').Page} page */
const site = (page) => page.frameLocator('.browser-host').frameLocator('iframe')

/** @param {import('@playwright/test').Page} page @param {string} address */
async function go(page, address) {
  const field = page.locator('.browser-bar input')
  await field.fill(address)
  await field.press('Enter')
}

/** Drags a handle by so much, in steps, as a hand would. @param {import('@playwright/test').Page} page @param {import('@playwright/test').Locator} handle @param {number} dx @param {number} dy */
async function drag(page, handle, dx, dy) {
  const box = await handle.boundingBox()
  const [x, y] = [(box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2]
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 5 })
  await page.mouse.up()
}

test('the user browses beside the conversation: back, forward, reload, full screen', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('browser') })
  // Once on, ⌘⇧B opens and closes it, and from a dialog, closes the dialog (D142).
  const pane = page.locator('app-browser .browser')
  await page.keyboard.press('ControlOrMeta+Shift+KeyB')
  await expect(pane).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Shift+KeyB')
  await expect(pane).toHaveCount(0)
  const settings = await openSettings(page)
  await page.keyboard.press('ControlOrMeta+Shift+KeyB')
  await expect(settings).toBeHidden()
  await expect(pane).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Shift+KeyB')
  await expect(pane).toHaveCount(0)
  // The header's button opens it, empty, its address field ready.
  await page.locator('.bar .browser-toggle').click()
  await expect(pane.locator('.browser-note')).toContainText('Pages open here')
  await expect(pane.locator('.browser-bar input')).toHaveAttribute('placeholder', 'Type an address, or words to look up')
  await expect(pane.getByRole('button', { name: 'Back' })).toBeDisabled()
  await go(page, `${SITE}/bakery.html`)
  await expect(site(page).locator('h1')).toHaveText('The bakery')
  // A site not seen showing yet comes with a way out, until it shows it does.
  await expect(pane.locator('.browser-strip')).toContainText('Page not showing?')
  await site(page).getByRole('link', { name: 'Menu' }).click()
  await expect(site(page).locator('h1')).toHaveText('Menu')
  await expect(pane.locator('.browser-strip')).toHaveCount(0)
  // Where the page went can't be read from Jean: the address shows where it came from.
  await expect(pane.locator('.browser-bar input')).toHaveClass(/is-moved/)
  await pane.getByRole('button', { name: 'Back' }).click()
  await expect(site(page).locator('h1')).toHaveText('The bakery')
  await pane.getByRole('button', { name: 'Forward' }).click()
  await expect(site(page).locator('h1')).toHaveText('Menu')
  await pane.getByRole('button', { name: 'Reload' }).click()
  await expect(site(page).locator('h1')).toHaveText('The bakery')
  // Words are looked up; the search page is a setting (here, the bakery's menu).
  await page.evaluate(async (url) => (await import('/ui/state.js')).updateSettings({ urls: { searchPage: url } }), `${SITE}/menu.html?q={query}`)
  await go(page, 'fresh croissants')
  await expect(site(page).locator('h1')).toHaveText('Menu')
  await expect(pane.locator('.browser-bar input')).toHaveValue(`${SITE}/menu.html?q=fresh%20croissants`)
  // Settings closing walks Jean's own history back, which leaves an entry ahead. A link followed in
  // the page on show then takes its place without growing the history: it is never walked back to
  // (WebKit would reload Jean to get there), and Back stays in Jean, on the address before.
  await page.evaluate(() => { /** @type {any} */ (window).stayed = true })
  await go(page, `${SITE}/bakery.html`)
  await expect(site(page).locator('h1')).toHaveText('The bakery')
  await openSettings(page)
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
  await site(page).getByRole('link', { name: 'Menu' }).click()
  await expect(site(page).locator('h1')).toHaveText('Menu')
  await pane.getByRole('button', { name: 'Back' }).click()
  await expect(pane.locator('.browser-bar input')).toHaveValue(`${SITE}/menu.html?q=fresh%20croissants`)
  await expect(site(page).locator('h1')).toHaveText('Menu')
  // The next address opens after an entry that drops what was ahead: its pages count again.
  await go(page, `${SITE}/bakery.html`)
  await site(page).getByRole('link', { name: 'Menu' }).click()
  await expect(site(page).locator('h1')).toHaveText('Menu')
  await pane.getByRole('button', { name: 'Back' }).click()
  await expect(site(page).locator('h1')).toHaveText('The bakery')
  expect(await page.evaluate(() => /** @type {any} */ (window).stayed)).toBe(true)
  // Full screen, or the whole window where a page can't go full screen.
  await pane.getByRole('button', { name: 'Full screen' }).click()
  await expect(pane.getByRole('button', { name: 'Exit full screen' })).toBeVisible()
  await pane.getByRole('button', { name: 'Exit full screen' }).click()
  await expect(pane.getByRole('button', { name: 'Full screen' })).toBeVisible()
  // Beside the conversation, the box still takes a message.
  await expect(page.locator('#prompt')).toBeEditable()
  await pane.getByRole('button', { name: 'Close' }).click()
  await expect(pane).toHaveCount(0)
  // The header's button brings it back on the same page.
  await page.locator('.bar .browser-toggle').click()
  await expect(site(page).locator('h1')).toHaveText('The bakery')
})

test('a site that refuses to be framed opens in a tab of its own, and Jean recommends installing it', async ({ page }) => {
  await start(page)
  await turnOn(page, 'Browser')
  await page.keyboard.press('Escape')
  const pane = page.locator('app-browser .browser')
  await go(page, `${SITE}/refuses.html`)
  // Some browsers (Arc) put a refused page in Jean's place: while it opens, Jean's tab keeps to Jean.
  await page.evaluate((url) => {
    /** @type {any} */ (window).stayed = true
    location.assign(url)
  }, `${SITE}/refuses.html`)
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => /** @type {any} */ (window).stayed)).toBe(true)
  // The browser hides the refusal from Jean; the way out is there all the same.
  const strip = pane.locator('.browser-strip')
  await expect(strip).toContainText('Page not showing?')
  const [tab] = await Promise.all([page.waitForEvent('popup'), strip.getByRole('button', { name: 'Open in a new tab' }).click()])
  await expect(tab).toHaveURL(`${SITE}/refuses.html`)
  await tab.close()
  await expect(pane.locator('.browser-note h2')).toHaveText('127.0.0.1:4181 opens in a tab of its own')
  await expect(pane.locator('.browser-install')).toContainText('Install it as an app')
  // From then on, the site opens in a tab of its own straight away.
  const [again] = await Promise.all([page.waitForEvent('popup'), go(page, `${SITE}/menu.html`)])
  await again.close()
  await expect(pane.locator('.browser-host')).toBeHidden()
  // Unless the user tries it here again.
  await pane.getByRole('button', { name: 'Try here again' }).click()
  await expect(site(page).locator('h1')).toHaveText('Menu')
  // An address of any other kind never opens.
  await go(page, 'javascript:alert(1)')
  await expect(page.locator('.toast')).toContainText('That address can’t be opened.')
})

test('links from answers open beside the conversation once the browser is found', async ({ page, context }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Give me a link to the bakery')
  const link = page.locator('.msg-jean .prose a').last()
  await expect(link).toHaveAttribute('href', `${SITE}/bakery.html`)
  // Three links opened elsewhere: pages could open beside the conversation.
  for (let i = 0; i < 3; i++) {
    const [tab] = await Promise.all([context.waitForEvent('page'), link.click()])
    await tab.close()
  }
  const offer = page.locator('.offer')
  await expect(offer).toContainText('Open web pages beside the conversation')
  await offer.getByRole('button', { name: 'Turn on the browser' }).click()
  await expect(page.locator('app-browser .browser')).toBeVisible()
  await link.click()
  await expect(site(page).locator('h1')).toHaveText('The bakery')
})

test('the brain offers the browser, then opens a page there and reads it, asking first', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Show me the bakery site')
  await page.locator('.msg-jean .approval').getByRole('button', { name: 'Turn it on' }).click()
  await expect(page.locator('app-browser .browser')).toBeVisible()
  // An address the brain picks could carry something away: it asks first, showing it.
  const approval = page.locator('.approval')
  await expect(approval).toContainText(`${SITE}/bakery.html`)
  await approval.getByRole('button', { name: 'Allow once' }).click()
  await expect(site(page).locator('h1')).toHaveText('The bakery')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Fresh bread every morning, from 7 am.')
  await expect(answer.locator('a.cite')).toHaveAttribute('href', `${SITE}/bakery.html`)
  // The next message tells the brain which page is open.
  await expect(page.locator('.follow-ups')).toBeVisible()
  await ask(page, 'Thanks')
  await expect(page.locator('.msg-jean')).toHaveCount(2)
  const notes = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records
    .flatMap((record) => (record.update?.sessionUpdate === '_system_note' ? [record.update.text] : [])))
  expect(notes).toContain(`The <page> section is now:\nThe browser beside the conversation shows ${SITE}/bakery.html.`)
})

test('the browser and a file share the side of the window, neither covering the other', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await start(page)
  await connectFakeBrain(page)
  // The drawer put away, the window is the conversation's and the dock's (D165).
  await closeTasks(page)
  await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('browser') })
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(SALES) })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Here is my table')
  await page.locator('.msg-files .file-chip').click()
  const preview = page.locator('app-preview .preview')
  const pane = page.locator('app-browser .browser')
  await expect(preview.locator('.preview-grid')).toBeVisible()
  const alone = await preview.boundingBox()
  // The browser comes after the file: one above the other, as wide, and the file's still in view.
  await page.locator('.bar .browser-toggle').click()
  await go(page, `${SITE}/bakery.html`)
  await expect(site(page).locator('h1')).toHaveText('The bakery')
  let [first, second] = await Promise.all([preview.boundingBox(), pane.boundingBox()])
  expect(first?.width).toBe(second?.width)
  expect((first?.y ?? 0) + (first?.height ?? 0)).toBeLessThanOrEqual(second?.y ?? 0)
  await expect(preview.locator('.preview-grid')).toBeInViewport()
  // Beside the conversation, the box still takes a message.
  await expect(page.locator('#prompt')).toBeEditable()
  // The divider between them is dragged, over the page too, or moved with the keys.
  const divider = page.locator('.dock-divider')
  await expect(divider).toHaveAttribute('aria-orientation', 'horizontal')
  await drag(page, divider, 0, 100)
  expect((await preview.boundingBox())?.height).toBeCloseTo((first?.height ?? 0) + 100, 0)
  await divider.press('ArrowUp')
  expect((await preview.boundingBox())?.height).toBeCloseTo((first?.height ?? 0) + 100 - 32, 0)
  // The dock's edge sets how wide it is, wider than tall too, the panes still one above the other,
  // and what the user set is kept; a double click puts each back.
  const dock = page.locator('.dock')
  const width = (await dock.boundingBox())?.width ?? 0
  await drag(page, page.locator('.dock-edge'), -100, 0)
  expect((await dock.boundingBox())?.width).toBeCloseTo(width + 100, 0)
  expect((await pane.boundingBox())?.width).toBeCloseTo(width + 100 - 1, 0)
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.dock?.width)).toBeCloseTo((width + 100) / 1280, 2)
  await divider.dblclick()
  await page.locator('.dock-edge').dblclick()
  expect(await preview.boundingBox()).toEqual(first)
  // Over it, in a window wider than tall: side by side.
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.locator('app-shell')).toHaveJSProperty('inert', true)
  ;[first, second] = await Promise.all([preview.boundingBox(), pane.boundingBox()])
  expect((first?.x ?? 0) + (first?.width ?? 0)).toBeLessThanOrEqual(second?.x ?? 0)
  // Closing one gives the other the whole side; closing both gives the conversation back.
  await page.setViewportSize({ width: 1280, height: 720 })
  await pane.locator('.browser-bar').getByRole('button', { name: 'Close' }).click()
  await expect(pane).toHaveCount(0)
  expect(await preview.boundingBox()).toEqual(alone)
  await preview.getByRole('button', { name: 'Close' }).click()
  await expect(preview).toHaveCount(0)
  await expect(page.locator('app-shell')).toHaveJSProperty('inert', false)
})

for (const [lang, back, placeholder] of [['ar', 'رجوع', 'اكتب عنوانًا، أو كلمات للبحث عنها'], ['ja', '戻る', 'アドレスまたは調べたい言葉を入力']]) {
  test(`the browser in ${lang}`, async ({ page }) => {
    await start(page, lang)
    await page.evaluate(async () => {
      await (await import('/ui/caps.js')).unlock('browser')
      ;(await import('/caps/browser/browser.js')).visit(location.origin.replace(/:\d+$/, ':4181') + '/site/bakery.html')
    })
    const pane = page.locator('app-browser .browser')
    await expect(pane.locator('.browser-bar input')).toHaveAttribute('placeholder', placeholder)
    await expect(pane.getByRole('button', { name: back })).toBeVisible()
    await expect(site(page).locator('h1')).toHaveText('The bakery')
    // Right to left, Back sits at the inline start: on the right.
    const [first, last] = await Promise.all([pane.getByRole('button', { name: back }).boundingBox(), pane.locator('.browser-bar form').boundingBox()])
    expect((first?.x ?? 0) > (last?.x ?? 0)).toBe(lang === 'ar')
    await page.screenshot({ path: test.info().outputPath(`browser-${lang}.png`) })
  })
}
