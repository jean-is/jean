// SPDX-License-Identifier: MIT
// Prototypes (D742): found by its skill, a prototype shows beside the task while the brain still writes the call that makes it, its pages
// coming one after the other; made, it is pressed through from its first page and checked, the brain hearing what does nothing. It opens on
// All pages, a board without edges that fills its pane, its zoom in a bottom corner, whose pages run where they lie, each under its name on
// the board's ground, moved, zoomed and walked with the keys along its flow, its level setting it at 100%; a page pressed shows in Try it, the one frame a person presses in, in the shape it was made for,
// a tablet's on offer too, its pages in a strip; its bar goes back and starts over, a form sends its choice to the next page in the address, and
// Build it asks for the app it shows. In Arabic and Japanese.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, SHARE_URL } from './helpers.js'

test.setTimeout(120_000)

/** A page as the skill asks for one. @param {string} lang @param {string} title @param {string} body */
const page = (lang, title, body) => /* html */ `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="look.css"><link rel="stylesheet" href="style.css"></head><body><main>${body}</main><script src="prototype.js" defer></script></body></html>`
/** A salon's booking: a service, a time sent by a form, the booking; a button that does nothing; its style sheet first, as the skill asks. @param {string} [lang] @param {string} [pad] what makes its script long to write */
const salon = (lang = 'en', pad = '') => ({ name: 'Salon', look: { accent: '#7a2e4a' }, files: [
  { path: 'style.css', text: 'body { margin: 0; font: 1rem/1.5 var(--font); color: var(--ink); background: var(--paper); } main { padding: 1rem; } a, button { color: var(--accent); }' },
  { path: 'index.html', text: page(lang, 'Salon · Services', '<h1>Services</h1><p>Prototype, sample data</p><a href="time.html?service=cut">Cut · €35</a> <button type="button">Favourite</button>') },
  { path: 'prototype.js', text: `const given = new URLSearchParams(location.search)\nfor (const element of document.querySelectorAll('[data-given]')) element.textContent = given.get(element.dataset.given) || element.textContent${pad}` },
  { path: 'time.html', text: page(lang, 'Salon · Time', '<h1>Pick a time</h1><form action="confirm.html"><label for="time">Time</label><select id="time" name="time"><option>10:30</option><option>11:00</option></select><button>Continue</button></form>') },
  { path: 'confirm.html', text: page(lang, 'Salon · Booked', '<h1>Booked</h1><p>Your time: <span data-given="time">?</span></p><a href="index.html">Home</a>') }] })

/** Its skill read, then a prototype made: the answer that says what its check found. @param {import('@playwright/test').Page} page @param {string} [lang] */
async function make(page, lang) {
  await ask(page, 'Call skill with {"name":"prototype"}')
  await answered(page, 1)
  await ask(page, `Call prototype with ${JSON.stringify(salon(lang))}`)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(2, { timeout: 90_000 })
  await answered(page, 2)
  return page.locator('.msg-jean .prose').last()
}

test('a prototype shows while it is written, its pages coming; made, it is pressed through and checked and lies on a board of running pages walked by keys; Try it has its strip, Back and Start over, and a form carries its choice (D742)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Call skill with {"name":"prototype"}')
  await answered(page, 1)
  // Written slowly, as a brain writes a long call: the pane is there before the call ends, on All pages, with the page that came, running; nothing can be tried yet.
  await ask(page, `Slowly call prototype with ${JSON.stringify(salon('en', `\n// ${'what is to come '.repeat(1500)}`))}`)
  const view = page.locator('app-preview app-prototype'), cards = view.locator('.proto-board .proto-card'), frame = view.locator('.site-view').frameLocator('iframe')
  await expect(cards).toHaveCount(1)
  await expect(cards.frameLocator('iframe').getByRole('heading', { name: 'Services' })).toBeVisible()
  await expect(view.locator('.proto-page')).toHaveAttribute('aria-disabled', 'true')
  await expect(view.locator('.proto-says .visually-hidden')).toHaveText('Page 1 of 1')
  await expect(page.locator('.msg-jean .prose')).toHaveCount(1)
  // Made: the call keeps it at the place it was shown at, in the same pane.
  await expect(page.locator('.msg-jean .prose')).toHaveCount(2, { timeout: 90_000 })
  await answered(page, 2)
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Made. Prototype "Salon" is at prototypes/')
  await expect(answer).toContainText('3 pages in en.')
  await expect(answer).toContainText('3 of 3 pages reached')
  await expect(page.locator('.site-test')).toHaveCount(0)
  await expect(page.locator('app-preview app-prototype')).toHaveCount(1)
  // Its record keeps the check whole, the fake brain saying only its start: the button that does nothing, and the flow, each page with what first led to it.
  const place = /prototypes\/[^:]+/.exec(await answer.innerText())?.[0] ?? ''
  const check = await page.evaluate(async (place) => { const { app } = await import('/ui/state.js'); return JSON.parse((await app.fs.read(`${app.projectDir}/${place}/prototype.json`)) ?? '{}').check }, place)
  expect(check.problems).toContain('index.html: “Favourite” (button) does nothing a person sees; make it lead to a page or change this one')
  expect(check.flow).toMatchObject({ reached: ['index.html', 'time.html', 'confirm.html'], at: { 'time.html': '?service=cut' }, by: { 'time.html': ['index.html', 'Cut · €35'], 'confirm.html': ['time.html', 'Continue'] } })

  // All pages, as it opens: the board, from edge to edge of its pane, no frame to press in and no bar, its zoom in its bottom corner; its pages in steps, each under
  // the control that leads to it, its name on the board's ground over its card, the page itself, which runs at a phone's size, as no shape was given, brought down
  // to its card, out of the pointer's reach.
  await expect(view.locator('app-site, .segmented, .proto-bar')).toHaveCount(0)
  expect(await view.evaluate((one) => { const board = /** @type {Element} */ (one.querySelector('.proto-board')).getBoundingClientRect(), pane = /** @type {Element} */ (one.closest('.view')).getBoundingClientRect(), zoom = /** @type {Element} */ (one.querySelector('.proto-board > .proto-zoom')).getBoundingClientRect()
    return [board.left - pane.left, pane.right - board.right, board.top - pane.top, pane.bottom - board.bottom].every((gap) => Math.abs(gap) < 1) && board.bottom - zoom.bottom < 24 && zoom.top > board.top + board.height / 2 })).toBe(true)
  await expect(cards).toHaveCount(3)
  await expect(view.locator('.proto-board .proto-title')).toHaveText(['Services', 'Time', 'Booked'])
  await expect(cards.nth(2).frameLocator('iframe').getByRole('heading', { name: 'Booked' })).toBeVisible()
  expect(await cards.first().evaluate((card) => { const frame = /** @type {HTMLElement} */ (card.querySelector('iframe')), title = /** @type {Element} */ (card.parentElement?.querySelector('.proto-title')); return [frame.offsetWidth, Math.abs(Math.round(frame.getBoundingClientRect().width - card.clientWidth)),
    !card.contains(title) && title.getBoundingClientRect().bottom <= card.getBoundingClientRect().top, getComputedStyle(card).pointerEvents] })).toEqual([390, 0, true, 'none'])
  // Where it leads on is said under it; its place among the pages, to screen readers alone.
  await expect(view.locator('.proto-says').first().locator(':scope > :not(.visually-hidden)')).toHaveText('Leads to Time')
  await expect(view.locator('.proto-says .visually-hidden').first()).toHaveText('Page 1 of 3')
  await expect(view.locator('.proto-by').nth(1)).toHaveText('Press “Cut · €35”')
  // Its words are the board's, never picked up: clicked thrice, nothing is selected.
  await view.locator('.proto-says').first().click({ clickCount: 3 })
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('')
  // Its level is its value alone; it and Fit are as small as the zoom buttons, in smaller words than theirs; pressed, the level sets the board at 100% at once, and said.
  const shown = view.locator('.proto-level')
  await view.getByRole('button', { name: 'Zoom in' }).click()
  await expect(shown).toHaveText(/^\d+%$/)
  await expect(view.getByRole('status')).toHaveText(await shown.innerText())
  expect(await view.locator('.proto-zoom').evaluate((zoom) => { const size = (/** @type {Element} */ one) => [Math.round(one.getBoundingClientRect().height), parseFloat(getComputedStyle(one).fontSize)], [tall, words] = size(/** @type {Element} */ (zoom.querySelector('.icon-button')))
    return [...zoom.querySelectorAll('.button')].map((one) => { const [height, letters] = size(one); return height <= tall && letters < words }) })).toEqual([true, true])
  await expect(shown).toHaveAttribute('title', 'Zoom to 100%')
  await shown.click()
  await expect(shown).toHaveText('100%')
  await expect(view.getByRole('status')).toHaveText('100%')
  expect(await view.evaluate((one) => getComputedStyle(one).getPropertyValue('--zoom'))).toBe('1')
  // The wheel with Ctrl, as a pinch sends, zooms little by little: a notch is a tenth, not a step.
  const level = async () => Number((await shown.innerText()).replace(/\D/g, '')), before = await level()
  await view.locator('.proto-board').dispatchEvent('wheel', { deltaY: -100, ctrlKey: true })
  await expect.poll(level).toBeGreaterThan(before)
  expect(await level()).toBeLessThan(before * 1.15)
  // The board has no edges: the wheel moves it, as far as one likes, and a page given the keys comes back into view.
  const first = cards.first(), top = async () => Math.round((await first.boundingBox())?.y ?? 0), was = await top()
  await view.locator('.proto-board').dispatchEvent('wheel', { deltaY: 120 })
  await expect.poll(top).toBe(was - 120)
  await view.locator('.proto-board').dispatchEvent('wheel', { deltaY: 3000, deltaX: 2000 })
  await expect(first).not.toBeInViewport()
  // The keys walk the flow; Enter shows the page in Try it, the one frame a person presses in, at a phone's width.
  await view.locator('.proto-board .proto-page').first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(view.locator('.proto-page:focus')).toHaveAttribute('data-page', 'time.html')
  await expect(cards.nth(1)).toBeInViewport({ ratio: 0.5 })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(view.locator('app-site')).toHaveAttribute('data-width', 'phone')
  await expect(frame.getByRole('heading', { name: 'Booked' })).toBeVisible()
  // Beside it, its pages in a strip, each running small, the one on show marked.
  await expect(view.locator('.proto-strip app-site-page iframe')).toHaveCount(3)
  await expect(view.locator('.proto-strip .proto-title')).toHaveText(['Services', 'Time', 'Booked'])
  await expect(view.locator('.proto-strip [aria-current="page"]')).toHaveAttribute('data-page', 'confirm.html')
  // Its bar: Start over, then nowhere to go back to, the page on show and its place; a link followed and a form sent, the strip follows; then Back.
  await view.getByRole('button', { name: 'Start over' }).click()
  await expect(frame.getByRole('heading', { name: 'Services' })).toBeVisible()
  await expect(view.getByRole('button', { name: 'Back' })).toBeDisabled()
  await expect(view.locator('.proto-place')).toHaveText('Services')
  await frame.getByRole('link', { name: 'Cut · €35' }).click()
  await expect(frame.getByRole('heading', { name: 'Pick a time' })).toBeVisible()
  await expect(view.locator('.proto-strip [aria-current="page"]')).toHaveAttribute('data-page', 'time.html')
  await frame.getByRole('button', { name: 'Continue' }).click()
  await expect(frame.getByRole('heading', { name: 'Booked' })).toBeVisible()
  await expect(frame.locator('[data-given]')).toHaveText('10:30')
  await view.getByRole('button', { name: 'Back' }).click()
  await expect(frame.getByRole('heading', { name: 'Pick a time' })).toBeVisible()
  await view.getByRole('button', { name: 'Start over' }).click()
  await expect(frame.getByRole('heading', { name: 'Services' })).toBeVisible()
  // Its looks are behind one button, its own named a prototype's; its widths are drawings, a tablet's among them, at its own width, then a phone's again.
  await view.getByRole('button', { name: 'Colours and type' }).click()
  await expect(view.getByRole('radio', { name: 'For this prototype' })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(view.locator('.site-widths label svg')).toHaveCount(3)
  await view.locator('.site-widths label[title="Tablet"]').click()
  await expect(view.locator('app-site')).toHaveAttribute('data-width', 'tablet')
  await expect.poll(async () => (await view.locator('app-site iframe').boundingBox())?.width ?? 0).toBeGreaterThan(390)
  expect((await view.locator('app-site iframe').boundingBox())?.width).toBeLessThanOrEqual(768)
  await view.locator('.site-widths label[title="Phone"]').click()
  await expect(view.locator('app-site')).toHaveAttribute('data-width', 'phone')
  // With them in one group, each a drawing named by its tip: by night, whatever the device prefers, then by day again; Edit words and Point at a part.
  await expect(view.locator('.site-hand.icon-group > button')).toHaveCount(4)
  await expect(view.locator('.site-hand button span')).toHaveCount(0)
  const paper = () => frame.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor), day = await paper()
  await view.getByRole('button', { name: 'Dark' }).click()
  await expect(view.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(paper).not.toBe(day)
  await view.getByRole('button', { name: 'Dark' }).click()
  await expect.poll(paper).toBe(day)
  // Any pane fills the window from its head, and gives it back.
  await page.locator('app-preview .pane-head').getByRole('button', { name: 'Full screen' }).click()
  await expect(page.locator('app-preview[data-full]')).toHaveCount(1)
  await page.locator('app-preview .pane-head').getByRole('button', { name: 'Full screen' }).click()
  await expect(page.locator('app-preview[data-full]')).toHaveCount(0)
  // Build it, last in its bar, asks for the app the prototype shows, the brain given every file of it.
  await view.getByRole('button', { name: 'Build it' }).click()
  await expect(page.locator('.msg-user').last()).toContainText('Build “Salon” for real, as an app that works.')
  await answered(page, 3)
  const given = await page.evaluate(async () => { const { app } = await import('/ui/state.js'); return (await app.fs.read(String(app.current.value?.path))) ?? '' })
  for (const words of ['Read the skills prototype and app', 'part “Build it for real”', 'Every file of the prototype', 'confirm.html', 'prototype.js']) expect(given).toContain(words)
  // The strip is one Tab stop: its arrows go down it, Enter shows the page.
  await view.locator('.proto-strip .proto-page').first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(view.locator('.proto-page:focus')).toHaveAttribute('data-page', 'time.html')
  await page.keyboard.press('Enter')
  await expect(frame.getByRole('heading', { name: 'Pick a time' })).toBeVisible()

  // All pages again, from the page's name, the page that was on show picked. With motion on, its frame comes down to its page on the board:
  // a view transition, the two marked only while it lasts.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await view.evaluate((one) => new MutationObserver(() => Object.assign(window, { turned: true })).observe(one, { attributes: true, attributeFilter: ['data-turning'] }))
  await view.locator('.proto-place').click()
  await expect(view.locator('.proto-board')).toBeVisible()
  await expect(view).not.toHaveAttribute('data-turning')
  expect(await page.evaluate(() => /** @type {any} */ (window).turned)).toBe(true)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(view.locator('app-site')).toHaveCount(0)
  await expect(view.locator('.proto-page[tabindex="0"]')).toHaveAttribute('data-page', 'time.html')
})

test('the brain’s later change waits as its version, marked on the board and accepted in Try it; on a phone there is no strip and the board is one column, nothing cut (D742, D505)', async ({ page, browserName }) => {
  await start(page)
  await connectFakeBrain(page)
  const answer = await make(page)
  const place = /prototypes\/[^:]+/.exec(await answer.innerText())?.[0] ?? ''
  await ask(page, `Call prototype_change with ${JSON.stringify({ prototype: place, changes: [{ path: 'confirm.html', old: '<h1>Booked</h1>', new: '<h1>All booked</h1>' }] })}`)
  await answered(page, 3)
  const view = page.locator('app-preview app-prototype')
  await expect(view.locator('.proto-board li:has(.proto-page[data-page="confirm.html"]) .proto-says strong')).toHaveText(/Changed by/)
  await view.locator('.proto-board .proto-page[data-page="confirm.html"]').click()
  await expect(view.locator('.site-view').frameLocator('iframe').getByRole('heading', { name: 'All booked' })).toBeVisible()
  await view.getByRole('button', { name: 'Accept' }).click()
  await expect(view.locator('.site-jean')).toHaveCount(0)
  // Accepted, it is still in Try it, on the page it was on.
  await expect(view.locator('.site-view').frameLocator('iframe').getByRole('heading', { name: 'All booked' })).toBeVisible()
  if (browserName !== 'chromium') return
  // On a phone, Try it has no strip, and All pages is one column; nothing cut.
  await page.setViewportSize({ width: 320, height: 700 })
  await expect(view.locator('.proto-strip')).toBeHidden()
  expect(await view.locator('.site-bar').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await view.locator('.proto-place').click()
  await expect(view.locator('.proto-steps')).toHaveCSS('flex-direction', 'column')
  expect(await view.locator('.proto-board').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await expect(view.getByRole('button', { name: 'Fit' })).toBeInViewport()
})

test('a prototype’s pane takes it out as any creation’s does: shared by a link as one page that plays, its links and forms leading on in place, their choices kept; or as a zip (D683)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await make(page)
  await page.evaluate(async (host) => {
    const [{ app, updateSettings }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
    await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
    await unlock('share')
  }, SHARE_URL)
  const pane = page.locator('app-preview:has(app-prototype)'), menu = pane.locator('.out-menu')
  await pane.locator('.pane-head .icon-group > [popovertarget^="out-"]').click()
  await expect(menu.getByRole('button', { name: 'Prototype as a zip' })).toBeVisible()
  await menu.getByRole('button', { name: /^Share/ }).click()
  await expect(page.locator('app-share-dialog dialog')).toBeVisible()
  // What the link holds: the prototype as one page, a file of the project.
  const item = await page.evaluate(async () => /** @type {any} */ ((await import('/caps/share/share.js')).sharing.value?.item))
  expect(item).toMatchObject({ text: 'Salon · Services', files: [{ name: 'Salon.html', mimeType: 'text/html', uri: expect.stringMatching(/^files\/sha256-[0-9a-f]+\.html$/) }] })
  await page.keyboard.press('Escape')
  await expect(page.locator('app-share-dialog dialog[open]')).toHaveCount(0)
  // As whoever has the link sees it, a file in a frame with nothing to serve its other pages: it plays.
  await page.evaluate(async (file) => (await import('/ui/preview.js')).preview({ ...file, title: file.name }, true), item.files[0])
  const one = page.locator('app-preview iframe.view-frame').contentFrame()
  await expect(one.getByRole('heading', { name: 'Services' })).toBeVisible()
  await one.getByRole('link', { name: 'Cut · €35' }).click()
  await expect(one.getByRole('heading', { name: 'Pick a time' })).toBeVisible()
  await one.getByRole('button', { name: 'Continue' }).click()
  await expect(one.getByRole('heading', { name: 'Booked' })).toBeVisible()
  await expect(one.locator('[data-given]')).toHaveText('10:30')
  await one.getByRole('link', { name: 'Home' }).click()
  await expect(one.getByRole('heading', { name: 'Services' })).toBeVisible()
})

for (const [lang, board, back] of [['ar', 'كل الصفحات', 'رجوع'], ['ja', 'すべてのページ', '戻る']]) {
  test(`a prototype’s board and its Try it in ${lang === 'ar' ? 'Arabic, right to left' : 'Japanese'} (D742)`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'a language changes words and layout, not the engine')
    await start(page, lang)
    await connectFakeBrain(page)
    await make(page, lang)
    const view = page.locator('app-preview app-prototype')
    await expect(view.locator('.proto-board .proto-card')).toHaveCount(3)
    await view.locator('.proto-page').nth(1).click()
    await expect(view.locator('.site-view').frameLocator('iframe').getByRole('heading', { name: 'Pick a time' })).toBeVisible()
    await expect(view.locator('.proto-strip .proto-page')).toHaveCount(3)
    await expect(view.getByRole('button', { name: back })).toBeEnabled()
    await expect(view.locator('.proto-strip > .button')).toHaveText(board)
    await view.locator('.proto-strip > .button').click()
    await expect(view.locator('.proto-board')).toBeVisible()
  })
}
