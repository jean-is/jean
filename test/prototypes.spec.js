// Prototypes (D742): found by its skill, a prototype made with `prototype` is pressed through from its first page and checked, the brain
// hearing what does nothing; it opens beside the task on a board of its pages, still pictures drawn one at a time, zoomed and walked with the
// keys along its flow; a page opened there runs in Try it, the one live frame, where a form sends its choice to the next page in the address.
// Among the creations, and in Arabic and Japanese.
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

test('a prototype made with its skill is pressed through and checked, lies on a board of its pages walked by keys, and runs in Try it, a form carrying its choice (D742)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const answer = await make(page)
  await expect(answer).toContainText('Made. Prototype "Salon" is at prototypes/')
  await expect(answer).toContainText('3 pages in en.')
  await expect(answer).toContainText('3 of 3 pages reached')
  await expect(page.locator('.site-test')).toHaveCount(0)
  // Its record keeps the check whole, the fake brain saying only its start: the button that does nothing, and the flow.
  const place = /prototypes\/[^:]+/.exec(await answer.innerText())?.[0] ?? ''
  const check = await page.evaluate(async (place) => { const { app } = await import('/ui/state.js'); return JSON.parse((await app.fs.read(`${app.projectDir}/${place}/prototype.json`)) ?? '{}').check }, place)
  expect(check.problems).toContain('index.html: “Favourite” (button) does nothing a person sees; make it lead to a page or change this one')
  expect(check.flow).toMatchObject({ reached: ['index.html', 'time.html', 'confirm.html'], at: { 'time.html': '?service=cut' } })

  // The board: its pages in steps, a picture each drawn out of sight, one Tab stop, no frame of its own.
  const board = page.locator('app-preview app-prototype')
  await expect(board.locator('.proto-page')).toHaveCount(3)
  await expect(board.locator('.proto-page img')).toHaveCount(3, { timeout: 30_000 })
  expect(await board.locator('.proto-page img').first().getAttribute('src')).toMatch(/^data:image\/(webp|jpeg);/)
  await expect(board.locator('.proto-page[tabindex="0"]')).toHaveCount(1)
  await expect(board.locator('iframe')).toHaveCount(0)
  await expect(board.locator('.proto-says').first()).toHaveText(/Page 1 of 3\s*Leads to Salon · Time/)
  await board.getByRole('button', { name: 'Zoom in' }).click()
  await expect(board.getByRole('status')).toContainText('%')

  // The keys walk the flow; Enter opens the page in Try it, the one live frame.
  await board.locator('.proto-page').first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(board.locator('.proto-page:focus')).toHaveAttribute('data-page', 'time.html')
  await page.keyboard.press('Enter')
  await expect(board.getByRole('radio', { name: 'Try it' })).toBeChecked()
  await expect(board.locator('iframe')).toHaveCount(1)
  const frame = board.frameLocator('iframe')
  await expect(frame.getByRole('heading', { name: 'Pick a time' })).toBeVisible()
  await frame.getByRole('button', { name: 'Continue' }).click()
  await expect(frame.getByRole('heading', { name: 'Booked' })).toBeVisible()
  await expect(frame.locator('[data-given]')).toHaveText('10:30')

  // Back on the board, the page it was on picked.
  await board.getByRole('radio', { name: 'All pages' }).check()
  await expect(board.locator('.proto-page[tabindex="0"]')).toHaveAttribute('data-page', 'confirm.html')
})

test('the brain’s later change waits as its version, marked on the board and accepted in Try it; on a phone the board is one column with nothing cut (D742, D505)', async ({ page, browserName }) => {
  await start(page)
  await connectFakeBrain(page)
  const answer = await make(page)
  const place = /prototypes\/[^:]+/.exec(await answer.innerText())?.[0] ?? ''
  await ask(page, `Call prototype_change with ${JSON.stringify({ prototype: place, changes: [{ path: 'confirm.html', old: '<h1>Booked</h1>', new: '<h1>All booked</h1>' }] })}`)
  await answered(page, 3)
  const board = page.locator('app-preview app-prototype')
  await expect(board.locator('li:has(.proto-page[data-page="confirm.html"]) .proto-says strong')).toHaveText(/Changed by/)
  await board.locator('.proto-page[data-page="confirm.html"]').click()
  await expect(board.frameLocator('iframe').getByRole('heading', { name: 'All booked' })).toBeVisible()
  await board.getByRole('button', { name: 'Accept' }).click()
  await expect(board.locator('.site-jean')).toHaveCount(0)
  if (browserName !== 'chromium') return
  await page.setViewportSize({ width: 320, height: 700 })
  await board.getByRole('radio', { name: 'All pages' }).check()
  await expect(board.locator('.proto-steps')).toHaveCSS('flex-direction', 'column')
  for (const part of ['.proto-bar', '.proto-board']) expect(await board.locator(part).evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await expect(board.getByRole('button', { name: 'Fit' })).toBeInViewport()
})

for (const [lang, board, play] of [['ar', 'كل الصفحات', 'جرّبه'], ['ja', 'すべてのページ', '試す']]) {
  test(`a prototype’s board and Try it in ${lang === 'ar' ? 'Arabic, right to left' : 'Japanese'} (D742)`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'a language changes words and layout, not the engine')
    await start(page, lang)
    await connectFakeBrain(page)
    await make(page, lang)
    const view = page.locator('app-preview app-prototype')
    await expect(view.locator('.proto-page')).toHaveCount(3)
    await expect(view.getByRole('radio', { name: board })).toBeChecked()
    await view.locator('.proto-page').first().click()
    await expect(view.getByRole('radio', { name: play })).toBeChecked()
    await expect(view.frameLocator('iframe').getByRole('heading', { name: 'Services' })).toBeVisible()
  })
}
