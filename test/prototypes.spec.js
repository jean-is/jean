// SPDX-License-Identifier: MIT
// Prototypes (D742): found by its skill, a prototype made with `prototype` is pressed through from its first page and checked, the brain
// hearing what does nothing; it opens beside the task in Try it, the one live frame, in the shape it was made for, its pages in a strip, still
// pictures drawn one at a time; its bar goes back and starts over, a form sends its choice to the next page in the address, and a press on
// nothing outlines what can be pressed, and Build it asks for the app it shows; All pages lays them on a board without edges, moved, zoomed and
// walked with the keys along its flow. In Arabic and Japanese.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered } from './helpers.js'

test.setTimeout(120_000)

/** A page as the skill asks for one. @param {string} lang @param {string} title @param {string} body */
const page = (lang, title, body) => /* html */ `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="look.css"><link rel="stylesheet" href="style.css"></head><body><main>${body}</main><script src="prototype.js" defer></script></body></html>`
/** A salon's booking: a service, a time sent by a form, the booking; a button that does nothing. @param {string} [lang] */
const salon = (lang = 'en') => ({ name: 'Salon', files: [
  { path: 'index.html', text: page(lang, 'Salon · Services', '<h1>Services</h1><p>Prototype, sample data</p><a href="time.html?service=cut">Cut · €35</a> <button type="button">Favourite</button>') },
  { path: 'time.html', text: page(lang, 'Salon · Time', '<h1>Pick a time</h1><form action="confirm.html"><label for="time">Time</label><select id="time" name="time"><option>10:30</option><option>11:00</option></select><button>Continue</button></form>') },
  { path: 'confirm.html', text: page(lang, 'Salon · Booked', '<h1>Booked</h1><p>Your time: <span data-given="time">?</span></p><a href="index.html">Home</a>') },
  { path: 'style.css', text: 'body { margin: 0; font: 1rem/1.5 var(--font); color: var(--ink); background: var(--paper); } main { padding: 1rem; } a, button { color: var(--accent); }' },
  { path: 'prototype.js', text: "const given = new URLSearchParams(location.search)\nfor (const element of document.querySelectorAll('[data-given]')) element.textContent = given.get(element.dataset.given) || element.textContent" }],
look: { accent: '#7a2e4a' } })

/** Its skill read, then a prototype made: the answer that says what its check found. @param {import('@playwright/test').Page} page @param {string} [lang] */
async function make(page, lang) {
  await ask(page, 'Call skill with {"name":"prototype"}')
  await answered(page, 1)
  await ask(page, `Call prototype with ${JSON.stringify(salon(lang))}`)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(2, { timeout: 90_000 })
  await answered(page, 2)
  return page.locator('.msg-jean .prose').last()
}

test('a prototype made with its skill is pressed through and checked, runs in Try it with its pages in a strip, Back and Start over, a form carrying its choice, and lies on a board walked by keys (D742)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const answer = await make(page)
  await expect(answer).toContainText('Made. Prototype "Salon" is at prototypes/')
  await expect(answer).toContainText('3 pages in en.')
  await expect(answer).toContainText('3 of 3 pages reached')
  await expect(page.locator('.site-test')).toHaveCount(0)
  // Its record keeps the check whole, the fake brain saying only its start: the button that does nothing, and the flow, each page with what first led to it.
  const place = /prototypes\/[^:]+/.exec(await answer.innerText())?.[0] ?? ''
  const check = await page.evaluate(async (place) => { const { app } = await import('/ui/state.js'); return JSON.parse((await app.fs.read(`${app.projectDir}/${place}/prototype.json`)) ?? '{}').check }, place)
  expect(check.problems).toContain('index.html: “Favourite” (button) does nothing a person sees; make it lead to a page or change this one')
  expect(check.flow).toMatchObject({ reached: ['index.html', 'time.html', 'confirm.html'], at: { 'time.html': '?service=cut' }, by: { 'time.html': ['index.html', 'Cut · €35'], 'confirm.html': ['time.html', 'Continue'] } })

  // Try it, as it opens: the one live frame, at a phone's width as no shape was given; its pages in a strip, a picture each drawn out of sight, the one on show marked.
  const view = page.locator('app-preview app-prototype'), frame = view.frameLocator('iframe')
  await expect(view.locator('iframe')).toHaveCount(1)
  await expect(view.locator('app-site')).toHaveAttribute('data-width', 'phone')
  await expect(frame.getByRole('heading', { name: 'Services' })).toBeVisible()
  await expect(view.locator('.proto-strip .proto-page img')).toHaveCount(3, { timeout: 30_000 })
  expect(await view.locator('.proto-page img').first().getAttribute('src')).toMatch(/^data:image\/(webp|jpeg);/)
  await expect(view.locator('.proto-strip .proto-title')).toHaveText(['Services', 'Time', 'Booked'])
  await expect(view.locator('.proto-strip [aria-current="page"]')).toHaveAttribute('data-page', 'index.html')
  // Its bar: nowhere to go back to yet, the page on show and its place; a link followed and a form sent, the strip follows; then Back, and Start over.
  await expect(view.getByRole('button', { name: 'Back' })).toBeDisabled()
  await expect(view.locator('.proto-place')).toHaveText(/Services\s*Page 1 of 3/)
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
  await expect(view.getByRole('button', { name: 'Back' })).toBeDisabled()
  // A press that lands on nothing is said; its looks are behind one button, its own named a prototype's.
  await frame.getByRole('heading', { name: 'Services' }).click()
  await expect(page.locator('.toast')).toContainText('Nothing happens there')
  await view.getByRole('button', { name: 'Colours and type' }).click()
  await expect(view.getByRole('radio', { name: 'For this prototype' })).toBeChecked()
  await expect(view.locator('.site-fold .segmented')).toHaveCount(0)
  await page.keyboard.press('Escape')
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

  // All pages, from the page's name: the board, no frame of its own, its pages in steps, each under the control that leads to it, the page that was on show picked.
  // With motion on, its frame comes down to its picture: a view transition, the two marked only while it lasts.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await view.evaluate((one) => new MutationObserver(() => Object.assign(window, { turned: true })).observe(one, { attributes: true, attributeFilter: ['data-turning'] }))
  await view.locator('.proto-place').click()
  await expect(view.getByRole('radio', { name: 'All pages' })).toBeChecked()
  await expect(view).not.toHaveAttribute('data-turning')
  expect(await page.evaluate(() => /** @type {any} */ (window).turned)).toBe(true)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(view.locator('iframe')).toHaveCount(0)
  await expect(view.locator('.proto-board .proto-page')).toHaveCount(3)
  await expect(view.locator('.proto-page[tabindex="0"]')).toHaveAttribute('data-page', 'time.html')
  await expect(view.locator('.proto-says').first()).toHaveText(/Page 1 of 3\s*Leads to Time/)
  await expect(view.locator('.proto-by').nth(1)).toHaveText('Press “Cut · €35”')
  await view.getByRole('button', { name: 'Zoom in' }).click()
  await expect(view.getByRole('status')).toContainText('%')
  // The wheel with Ctrl, as a pinch sends, zooms little by little: a notch is a tenth, not a step.
  const level = async () => Number((await view.getByRole('status').innerText()).replace(/\D/g, '')), before = await level()
  await view.locator('.proto-board').dispatchEvent('wheel', { deltaY: -100, ctrlKey: true })
  await expect.poll(level).toBeGreaterThan(before)
  expect(await level()).toBeLessThan(before * 1.15)
  // The board has no edges: the wheel moves it, as far as one likes, and a page given the keys comes back into view.
  const first = view.locator('.proto-board .proto-page').first(), top = async () => Math.round((await first.boundingBox())?.y ?? 0), was = await top()
  await view.locator('.proto-board').dispatchEvent('wheel', { deltaY: 120 })
  await expect.poll(top).toBe(was - 120)
  await view.locator('.proto-board').dispatchEvent('wheel', { deltaY: 3000, deltaX: 2000 })
  await expect(first).not.toBeInViewport()
  // The keys walk the flow; Enter shows the page in Try it.
  await first.focus()
  await page.keyboard.press('ArrowRight')
  await expect(view.locator('.proto-page:focus')).toHaveAttribute('data-page', 'time.html')
  await expect(view.locator('.proto-page:focus')).toBeInViewport({ ratio: 0.5 })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(view.locator('iframe')).toHaveCount(1)
  await expect(frame.getByRole('heading', { name: 'Booked' })).toBeVisible()
})

test('the brain’s later change waits as its version, marked in the strip and accepted in Try it; on a phone there is no strip and the board is one column, nothing cut (D742, D505)', async ({ page, browserName }) => {
  await start(page)
  await connectFakeBrain(page)
  const answer = await make(page)
  const place = /prototypes\/[^:]+/.exec(await answer.innerText())?.[0] ?? ''
  await ask(page, `Call prototype_change with ${JSON.stringify({ prototype: place, changes: [{ path: 'confirm.html', old: '<h1>Booked</h1>', new: '<h1>All booked</h1>' }] })}`)
  await answered(page, 3)
  const view = page.locator('app-preview app-prototype')
  await expect(view.locator('.proto-strip li:has(.proto-page[data-page="confirm.html"]) .proto-says strong')).toHaveText(/Changed by/)
  await view.locator('.proto-strip .proto-page[data-page="confirm.html"]').click()
  await expect(view.frameLocator('iframe').getByRole('heading', { name: 'All booked' })).toBeVisible()
  await view.getByRole('button', { name: 'Accept' }).click()
  await expect(view.locator('.site-jean')).toHaveCount(0)
  if (browserName !== 'chromium') return
  await page.setViewportSize({ width: 320, height: 700 })
  await expect(view.locator('.proto-strip')).toBeHidden()
  expect(await view.locator('.site-bar').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await view.locator('.proto-place').click()
  await expect(view.locator('.proto-steps')).toHaveCSS('flex-direction', 'column')
  for (const part of ['.proto-bar', '.proto-board']) expect(await view.locator(part).evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await expect(view.getByRole('button', { name: 'Fit' })).toBeInViewport()
})

for (const [lang, board, back] of [['ar', 'كل الصفحات', 'رجوع'], ['ja', 'すべてのページ', '戻る']]) {
  test(`a prototype’s Try it and its board in ${lang === 'ar' ? 'Arabic, right to left' : 'Japanese'} (D742)`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'a language changes words and layout, not the engine')
    await start(page, lang)
    await connectFakeBrain(page)
    await make(page, lang)
    const view = page.locator('app-preview app-prototype')
    await expect(view.locator('.proto-strip .proto-page')).toHaveCount(3)
    await expect(view.getByRole('button', { name: back })).toBeDisabled()
    await expect(view.frameLocator('iframe').getByRole('heading', { name: 'Services' })).toBeVisible()
    await view.locator('.proto-strip > .button').click()
    await expect(view.getByRole('radio', { name: board })).toBeChecked()
    await view.locator('.proto-page').nth(1).click()
    await expect(view.frameLocator('iframe').getByRole('heading', { name: 'Pick a time' })).toBeVisible()
  })
}
