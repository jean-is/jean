// SPDX-License-Identifier: MIT
// jean.is's page under the first screen (D397), served as jean.is's deploy has it (scripts/serve.js --home):
// the app's root first, the document scrolling on to the page, each Try putting its request in the box, Your turn
// going back up to it, its top risen into the first screen, which is as it is without it (D653); hidden with a
// task's first request, and under the next new task again, which starts at its top: the name in the bar and the Vous
// menu's Homepage lead there, and Help center ↗ opens in a tab. In Jean installed no task has it by itself, and
// Homepage shows it in place until a request. It speaks the app's one language: a language's address sets
// it, the page's menu sets it as Settings does, and the page shown is that language's, at its address, or English's
// where it has none, read from there without leaving. Once hidden, the address is the site's own, the language kept.
// On a phone the box stays docked at the foot. Jean as written (app/, any other site) has no page at all.
// Playwright's WebKit keeps nothing over a reload or a new address (no OPFS), so what a reload keeps is checked in Chromium.
import { test, expect } from '@playwright/test'
import { connectFakeBrain, ask, answered, openProfile } from './helpers.js'

const JEAN_IS = 'http://127.0.0.1:4186/'
/**
 * The page as the app shows it, in a language: once the room is ready and ui/home.js has unhidden it (the DOM
 * can be read before the style sheets apply, so a page just opened looks visible too soon).
 * @param {import('@playwright/test').Page} page @param {string} [lang]
 */
const shown = (page, lang) => page.locator(`html.is-ready body > .home:not([hidden])${lang ? `[lang="${lang}"]` : ''}`)

test('on jean.is, the page is under the first screen, its tries fill the box, a request hides it, and a new task has it again, at its top', async ({ page, browserName }) => {
  await page.goto(JEAN_IS)
  const home = page.locator('body > .home')
  await expect(shown(page, 'en')).toBeVisible()
  // The app's root first, its box under the question as ever, and the document scrolls on to the page.
  expect(await page.evaluate(() => document.body.firstElementChild?.localName)).toBe('app-shell')
  await expect(page.locator('html')).toHaveAttribute('data-centred', '')
  expect(await page.evaluate(() => document.documentElement.scrollHeight > 3 * innerHeight)).toBe(true)
  // While it shows, it is the main content, the skip link's #main: the first screen above it holds no <main> of its own.
  await expect(page.locator('main:visible')).toHaveCount(1)
  await expect(page.locator('body > .home > main#main')).toBeVisible()

  // A try puts its request in the box, back up at the top; the sample's comes with its file.
  await home.locator('.home-tile [data-try="music"]').click()
  await expect(page.locator('#prompt')).toHaveValue('A lullaby in D major for Léa’s bedtime.')
  await expect(page.locator('#prompt')).toBeFocused()
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await home.locator('.home-tile [data-try="sample"]').click()
  await expect(page.locator('.attachment-name')).toHaveText('sales.csv')
  await expect(page.locator('#prompt')).toHaveValue('Which product grew the most over the year? Show it as a chart.')
  // Each Try starts from an empty box: the sample's file goes with the next one.
  await home.locator('.home-tile [data-try="quiz"]').click()
  await expect(page.locator('.attachment-name')).toHaveCount(0)
  await expect(page.locator('#prompt')).toHaveValue('A quiz on the planets for my son, ten questions.')
  await home.locator('.home-tile [data-try="sample"]').click()
  await expect(page.locator('.attachment-name')).toHaveCount(1)

  // Each promise says its own catch under it, and Your turn, at the page's end, goes back up to the box.
  await expect(home.locator('.home-act .home-catch')).toHaveCount(3)
  await expect(home.locator('#home-keep .home-catch span')).toHaveText('Your work lives in this browser. Clear the browser’s data and it’s gone, unless you made a backup.')
  await home.locator('[data-turn]').click()
  await expect(page.locator('#prompt')).toBeFocused()
  expect(await page.evaluate(() => scrollY)).toBe(0)

  // The first request hides it (the first brain's step sends the one the box kept, D366).
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await expect(home).toBeHidden()
  await expect(page.locator('main:visible')).toHaveCount(1)
  await expect(page.locator('app-shell main#main')).toBeVisible()
  if (browserName !== 'webkit') {
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/is-ready/)
    await expect(home).toBeHidden()
  }
  // A new task has it again, whoever has tasks already: the main content, the site's foot in place of the box's line.
  await page.keyboard.press('ControlOrMeta+Shift+KeyO')
  await expect(shown(page, 'en')).toBeVisible()
  await expect(page.locator('main:visible')).toHaveCount(1)
  await expect(page.locator('body > .home > main#main')).toBeVisible()
  await expect(page.locator('app-composer > footer')).toBeHidden()
  await expect(page.locator('.home-act-title').first()).toBeInViewport()
  // Read far down, the name in the bar, which opens a new task, leads back up to the box.
  await page.locator('.site-foot').scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(1000)
  await page.locator('.bar .wordmark').click()
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  await expect(shown(page, 'en')).toBeVisible()
  // A try from there, a request, and the next new task has the page once more.
  await home.locator('.home-tile [data-try="quiz"]').click()
  await expect(page.locator('#prompt')).toHaveValue('A quiz on the planets for my son, ten questions.')
  await ask(page, 'Hello again')
  await expect(home).toBeHidden()
  await page.keyboard.press('ControlOrMeta+Shift+KeyO')
  await expect(shown(page, 'en')).toBeVisible()
  expect(await page.evaluate(() => scrollY)).toBe(0)
})

test('at a language’s own address, the page and the app speak it; once hidden, the address is the site’s own, and Homepage opens that language’s page', async ({ page, browserName, context }) => {
  await page.goto(`${JEAN_IS}ja`)
  await expect(shown(page, 'ja')).toBeVisible()
  // The browser asks for English: the address wins, until the person picks a language.
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(page).toHaveTitle('Jean · 好きな AI でつくって、ぜんぶ手元に')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${JEAN_IS}ja`)
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', JEAN_IS)
  expect(new URL(page.url()).pathname).toBe('/ja')
  await page.locator('.home-tile [data-try="quiz"]').click()
  await expect(page.locator('#prompt')).toHaveValue('息子向けに、惑星クイズを10⁠問。')

  await connectFakeBrain(page)
  await ask(page, 'こんにちは')
  await expect(page.locator('.home')).toBeHidden()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/')
  if (browserName !== 'webkit') {
    // Kept once written: the language the address chose, in settings.json before the reload reads it again.
    await expect.poll(() => page.evaluate(async () => JSON.parse(await (await import('/ui/state.js')).app.fs.read('settings.json') ?? '{}').locale)).toBe('ja')
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/is-ready/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  }
  // Homepage shows the app's language's own page in place, read from its address once the document has English's.
  await page.evaluate(() => { /** @type {any} */ (window).stayed = true })
  await (await openProfile(page)).getByRole('button', { name: 'トップページ' }).click()
  await expect(shown(page, 'ja')).toBeVisible()
  await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe('/ja')
  expect(await page.evaluate(() => /** @type {any} */ (window).stayed)).toBe(true)
  expect(context.pages()).toHaveLength(1)
})

test('the Vous menu’s Homepage leads to the page in place, on a new task at its top, and Help center opens in a new tab; the site’s foot links the page at its own address', async ({ page, context }) => {
  await page.goto(JEAN_IS)
  await expect(shown(page, 'en')).toBeVisible()
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await answered(page)
  // Homepage and Help center on the menu's first page, Help center marked as opening a tab; no Learn more, no About.
  const menu = await openProfile(page)
  await expect(menu.locator('.outside')).toHaveText(['Help center'])
  await expect(menu.locator('.outside svg')).toHaveCount(2)
  await expect(menu.getByRole('button', { name: 'Homepage', exact: true }).locator('svg')).toHaveCount(1)
  await expect(menu.getByRole('button', { name: /^(Learn more|About)$/ })).toHaveCount(0)
  const [help] = await Promise.all([context.waitForEvent('page'), menu.getByRole('button', { name: 'Help center', exact: true }).click()])
  await expect(help).toHaveURL(`${JEAN_IS}help`)
  await expect(menu).toBeHidden()
  await help.close()
  // The homepage, from a task: in place, without leaving, under a new task, at its top, the keyboard in the box.
  await expect(page.locator('body > .home')).toBeHidden()
  await page.evaluate(() => { /** @type {any} */ (window).stayed = true })
  await (await openProfile(page)).getByRole('button', { name: 'Homepage', exact: true }).click()
  await expect(shown(page, 'en')).toBeVisible()
  await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe('/')
  expect(await page.evaluate(() => /** @type {any} */ (window).stayed)).toBe(true)
  expect(context.pages()).toHaveLength(1)
  await expect(page.locator('.msg-jean')).toHaveCount(0)
  await expect(page.locator('#prompt')).toBeFocused()
  expect(await page.evaluate(() => scrollY)).toBe(0)
  // The site's foot links it at its own address, in its language, which shows it to whoever has tasks too.
  await page.goto(`${JEAN_IS}fr`)
  await expect(shown(page, 'fr')).toBeVisible()
  await expect(page.locator('.site-foot nav a[href="fr"]')).toHaveText('Page d’accueil')
})

test('in Jean installed, no task has the page by itself: the Vous menu’s Homepage shows it in place, the box where it is without it, until the first request there (D653)', async ({ page, context }) => {
  // Installed, Jean is in a window of its own, no browser's tab.
  await page.addInitScript(() => { const media = matchMedia.bind(window); window.matchMedia = (query) => media(query === '(display-mode: browser)' ? 'not all' : query) })
  await page.goto(JEAN_IS)
  await expect(page.locator('html')).toHaveClass(/is-ready/)
  await expect(page.locator('body > .home')).toBeHidden()
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await answered(page)
  // A new task there: the box and its ideas alone, its line with the legal pages.
  await page.keyboard.press('ControlOrMeta+Shift+KeyO')
  await expect(page.locator('app-composer .legal a')).toHaveText(['Privacy', 'Terms'])
  await expect(page.locator('body > .home')).toBeHidden()
  const where = () => page.evaluate(() => [...document.querySelectorAll('app-composer > form, .starters')].map((part) => Math.round(part.getBoundingClientRect().top)))
  await expect(page.locator('html')).toHaveAttribute('data-centred', '')
  await expect.poll(async () => JSON.stringify(await where()) === JSON.stringify(await (page.waitForTimeout(300).then(where)))).toBe(true)
  const alone = await where()
  // Homepage: the page in place, without leaving, the box and its ideas where a new task has them without it, its
  // top in the first screen, its Try filling the box there.
  await page.evaluate(() => { /** @type {any} */ (window).stayed = true })
  await (await openProfile(page)).getByRole('button', { name: 'Homepage', exact: true }).click()
  await expect(shown(page, 'en')).toBeVisible()
  expect(await page.evaluate(() => /** @type {any} */ (window).stayed)).toBe(true)
  expect(context.pages()).toHaveLength(1)
  await expect(page.locator('html')).toHaveAttribute('data-centred', '')
  await expect.poll(where).toEqual(alone)
  await expect(page.locator('.home-act-title').first()).toBeInViewport()
  await expect(page.locator('app-composer > footer')).toBeHidden()
  await page.locator('.home-tile [data-try="quiz"]').click()
  await expect(page.locator('#prompt')).toHaveValue('A quiz on the planets for my son, ten questions.')
  // The first request there hides it, and a new task doesn't bring it back.
  await ask(page, 'Hello again')
  await expect(page.locator('body > .home')).toBeHidden()
  await page.keyboard.press('ControlOrMeta+Shift+KeyO')
  await expect(page.locator('app-composer .legal a')).toHaveText(['Privacy', 'Terms'])
  await expect(page.locator('body > .home')).toBeHidden()
})

test('on a wide window the box is mid-window, the first act’s title shows whole under it with the top of its row, the tries are one row turned a view at a time, and one question opens at a time without moving the other column', async ({ page }) => {
  // A desktop's window, tall enough for the question and its lines above a box at its middle.
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(JEAN_IS)
  await expect(shown(page, 'en')).toBeVisible()
  await expect.poll(() => page.locator('app-composer > form').evaluate((box) => { const { top, bottom } = box.getBoundingClientRect(); return Math.abs(top + bottom - innerHeight) / 2 })).toBeLessThanOrEqual(32)
  // A laptop's, shorter: still room for the title whole and the top 40px of its row, no more (under it, Safari's
  // first screen, 40px lower, leaves the row out first, then the title's foot).
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const [address, lang] of [[JEAN_IS, 'en'], [`${JEAN_IS}ar`, 'ar']]) {
    await page.goto(address)
    await expect(shown(page, lang)).toBeVisible()
    const home = shown(page, lang)
    await expect(home.locator('.home-act-title').first()).toBeInViewport({ ratio: 1 })
    const row = () => home.locator('.home-act').first().locator('.home-row').evaluate((next) => innerHeight - next.getBoundingClientRect().top)
    await expect.poll(row).toBeGreaterThanOrEqual(35)
    await expect.poll(row).toBeLessThanOrEqual(45)
    // Every Try says the same, the sample's too, the first one's the primary one; a tile's Try puts its request in the box.
    expect(new Set(await home.locator('[data-try]').allTextContents()).size).toBe(1)
    const tiles = home.locator('.home-tile')
    await expect(tiles).toHaveCount(12)
    // Dealt anew each visit (ui/tiles.js): the twelve the page is written with, in another order (as written once in 12!).
    const written = [...(await (await page.request.get(address)).text()).matchAll(/data-try="([a-z]+)"/g)].map(([, key]) => key)
    const dealt = await home.locator('[data-try]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-try')))
    expect([...dealt].sort()).toEqual([...written].sort())
    expect(dealt).not.toEqual(written)
    await expect(home.locator('.home-tile [data-try].primary')).toHaveCount(1)
    await expect(tiles.first().locator('[data-try]')).toHaveClass(/primary/)
    await tiles.nth(2).locator('[data-try]').click()
    await expect(page.locator('#prompt')).toHaveValue(await tiles.nth(2).locator('.home-request').textContent() ?? '')
    await expect(page.locator('#prompt')).not.toHaveValue('')
    // One row: four in view, the next four a turn away, whichever way the page reads; Back once turned.
    const [back, next] = [home.locator('.home-turn.is-back'), home.locator('.home-turn.is-next')]
    await expect(back).toBeHidden()
    await expect(tiles.nth(4)).not.toBeInViewport({ ratio: 0.9 })
    await next.click()
    await expect(tiles.nth(4)).toBeInViewport({ ratio: 0.9 })
    await expect(tiles.first()).not.toBeInViewport({ ratio: 0.5 })
    await expect(back).toBeVisible()
    await back.click()
    await expect(tiles.first()).toBeInViewport({ ratio: 0.9 })
    await expect(back).toBeHidden()
    // The promise is the page's heading, heard and searched; its three acts' titles are what shows of it.
    await expect(home.locator('h1')).toHaveCount(1)
    await expect(home.locator('.home-act .home-act-title')).toHaveCount(3)

    // One question open at a time; opening one in a column leaves the other column where it was.
    const [first, second] = [home.locator('.home-questions > div').first(), home.locator('.home-questions > div').last()]
    await expect(first.locator('details').first()).toHaveAttribute('open', '')
    const top = () => second.locator('summary').first().evaluate((summary) => summary.getBoundingClientRect().top - (summary.closest('.home-questions')?.getBoundingClientRect().top ?? 0))
    const before = await top()
    await first.locator('summary').nth(1).click()
    await expect(home.locator('.home-questions details[open]')).toHaveCount(1)
    await expect(first.locator('details').nth(1)).toHaveAttribute('open', '')
    expect(await top()).toBe(before)
    await second.locator('summary').first().click()
    await expect(home.locator('.home-questions details[open]')).toHaveCount(1)
  }
})

test('translated by the browser into a language Jean has, the app speaks it itself, on a new page, and into one it lacks, it stays translated (D723)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright’s WebKit keeps no setting over a reload, so Jean leaves the page translated there')
  // As Chrome marks a page it translates: the language it translates into, and its direction.
  const translate = (/** @type {string} */ lang, /** @type {string} */ dir) => page.evaluate(([lang, dir]) => { document.documentElement.classList.add(`translated-${dir}`); document.documentElement.lang = lang }, [lang, dir])
  await page.goto(`${JEAN_IS}ja`)
  await expect(shown(page, 'ja')).toBeVisible()
  await page.evaluate(() => { /** @type {any} */ (window).stayed = true })
  // Punjabi, which Jean lacks: the browser's words, on the same page.
  await translate('pa', 'ltr')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pa')
  await translate('ar', 'rtl')
  await expect(shown(page, 'ar')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).not.toHaveClass(/translated/)
  await expect.poll(() => new URL(page.url()).pathname).toBe('/ar')
  expect(await page.evaluate(() => /** @type {any} */ (window).stayed)).toBeUndefined()
  // Kept, as the person's own pick would be.
  expect(await page.evaluate(async () => JSON.parse(await (await import('/ui/state.js')).app.fs.read('settings.json') ?? '{}').locale)).toBe('ar')
})

test.describe('in a Japanese browser', () => {
  test.use({ locale: 'ja-JP' })

  test('one language: jean.is opens on its Japanese page, the page’s menu sets the app’s language as Settings does, and the place read stays', async ({ page }) => {
    await page.goto(JEAN_IS)
    await expect.poll(() => new URL(page.url()).pathname).toBe('/ja')
    await expect(shown(page, 'ja')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
    // French has a page: the app speaks it, and the page is French, at its address, read from the same place,
    // changed mid-page as Settings or ⌘⇧L would.
    // The act on any AI is the first in Japanese and the second in French, each as its promise says them: its catch is the place read.
    const door = () => page.locator('#home-any .home-catch').evaluate((element) => element.getBoundingClientRect().top)
    const dealt = () => page.locator('.home [data-try]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-try')))
    const order = await dealt()
    await page.evaluate(() => scrollBy({ top: (document.querySelector('#home-any .home-catch')?.getBoundingClientRect().top ?? 0) - 200, behavior: 'instant' }))
    await page.evaluate(async () => (await import('/ui/state.js')).setLocale('fr'))
    await expect.poll(() => new URL(page.url()).pathname).toBe('/fr')
    await expect(shown(page, 'fr')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    // The tiles are as this visit dealt them, in every language's page.
    expect(await dealt()).toEqual(order)
    const menu = page.locator('.home .site-languages'), button = menu.locator('button')
    await expect(button).toContainText('Français')
    await expect.poll(async () => Math.abs(await door() - 200)).toBeLessThan(40)
    // From the page's own menu at its foot, by real links, the reader's language first, as the person's menu has it:
    // walking them changes nothing, and one pressed brings the page in that language, back at the foot, the closed
    // menu's button with the keyboard (D680).
    await button.focus()
    await page.keyboard.press('Enter')
    const japanese = menu.getByRole('link', { name: '日本語' })
    await expect(menu.locator('ul').first().getByRole('link')).toHaveText(['日本語'])
    await expect(japanese).toHaveAttribute('hreflang', 'ja')
    await expect(menu.locator('[aria-current="true"]')).toHaveText('Français')
    await japanese.focus()
    await page.keyboard.press('Tab')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    await japanese.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => new URL(page.url()).pathname).toBe('/ja')
    await expect(shown(page, 'ja')).toBeVisible()
    await expect(button).toBeInViewport()
    await expect(button).toBeFocused()
    await expect(menu.locator('.menu')).toBeHidden()
    await expect(button).toContainText('日本語')
    // Swedish has none: the app speaks it, and the page is English's, at the site's own address.
    await page.keyboard.press('Enter')
    await menu.getByRole('link', { name: 'Svenska' }).click()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await expect(shown(page, 'en')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'sv')
    await expect(button).toContainText('Svenska')
    await expect(button).toBeFocused()
  })
})

test('on a phone, the box stays docked at the foot while the page scrolls under it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(JEAN_IS)
  await expect(shown(page)).toBeVisible()
  await page.locator('.site-foot').scrollIntoViewIfNeeded()
  await expect(page.locator('.site-foot')).toBeInViewport()
  await expect(page.locator('.starters')).not.toBeInViewport()
  const box = await page.locator('form.composer').boundingBox()
  expect(box && box.y + box.height).toBeGreaterThan(844 - 48)
  expect(box && box.y + box.height).toBeLessThanOrEqual(844)
})

test('Jean as written, which any other site serves, has no page', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('html')).toHaveClass(/is-ready/)
  await expect(page.locator('.home, link[href="home.css"], meta[name="app-language"]')).toHaveCount(0)
  await expect((await openProfile(page)).locator('.outside')).toHaveCount(0)
  expect((await page.request.get('ja')).status()).toBe(404)
  expect((await page.request.get('jean')).status()).toBe(404)
})
