// jean.is's page under the first screen (D397), served as jean.is's deploy has it (scripts/serve.js --home):
// the app's root first, the document scrolling on to the page, each Try putting its request in the box, the
// doors unfolding in place; hidden with the first request, and asked for again by About Jean under a new
// task's box. It speaks the app's one language: a language's address sets it, the page's menu sets it as
// Settings does, and the page shown is that language's, at its address, or English's where it has none.
// Once hidden, the address is the site's own, the language kept. On a phone the box stays docked at the
// foot. Jean as written (app/, any other site) has no page at all. Playwright's WebKit keeps nothing over a
// reload or a new address (no OPFS), so what a reload keeps is checked in Chromium.
import { test, expect } from '@playwright/test'
import { connectFakeBrain, ask } from './helpers.js'

const JEAN_IS = 'http://127.0.0.1:4186/'
/**
 * The page as the app shows it, in a language: once the room is ready and ui/home.js has unhidden it (the DOM
 * can be read before the style sheets apply, so a page just opened looks visible too soon).
 * @param {import('@playwright/test').Page} page @param {string} [lang]
 */
const shown = (page, lang) => page.locator(`html.is-ready body > .home:not([hidden])${lang ? `[lang="${lang}"]` : ''}`)

test('on jean.is, the page is under the first screen, its tries fill the box, and About Jean brings it back after the first request', async ({ page, browserName }) => {
  await page.goto(JEAN_IS)
  const home = page.locator('body > .home')
  await expect(shown(page, 'en')).toBeVisible()
  // The app's root first, its box under the question as ever, and the document scrolls on to the page.
  expect(await page.evaluate(() => document.body.firstElementChild?.localName)).toBe('app-shell')
  await expect(page.locator('html')).toHaveAttribute('data-centred', '')
  expect(await page.evaluate(() => document.documentElement.scrollHeight > 3 * innerHeight)).toBe(true)
  const about = page.locator('app-composer .legal a', { hasText: 'About Jean' })
  await expect(about).toHaveCount(0)

  // A try puts its request in the box, back up at the top; the sample's comes with its file.
  await home.locator('[data-try="music"]').click()
  await expect(page.locator('#prompt')).toHaveValue('A lullaby in D major for Léa’s bedtime.')
  await expect(page.locator('#prompt')).toBeFocused()
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await home.locator('label[for="home-for-family"]').click()
  await expect(home.locator('.home-tile[data-for="work"]:visible')).toHaveCount(0)
  await expect(home.locator('.home-tile[data-for="family"]:visible')).toHaveCount(4)
  await expect(home.locator('.home-tile:visible')).toHaveCount(4)
  await home.locator('label[for="home-for-all"]').click()
  await home.locator('.home-replay [data-try="sample"]').click()
  await expect(page.locator('.attachment-name')).toHaveText('sales.csv')
  await expect(page.locator('#prompt')).toHaveValue('Which product grew the most over the year? Show it as a chart.')
  // Each Try starts from an empty box: the sample's file goes with the next one.
  await home.locator('[data-try="quiz"]').click()
  await expect(page.locator('.attachment-name')).toHaveCount(0)
  await expect(page.locator('#prompt')).toHaveValue('A quiz on the planets for my son, ten questions.')
  await home.locator('.home-replay [data-try="sample"]').click()
  await expect(page.locator('.attachment-name')).toHaveCount(1)

  // A door unfolds in place, its words in the page all along.
  const more = home.locator('#home-shareable details')
  await expect(more.locator('li').first()).toHaveText('Sealed in your browser. Its key travels in the link, never to the host.', { useInnerText: false })
  await more.locator('summary').click()
  await expect(more.locator('li').first()).toBeVisible()

  // The first request hides it (the first brain's step sends the one the box kept, D366).
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await expect(home).toBeHidden()
  if (browserName !== 'webkit') {
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/is-ready/)
    await expect(home).toBeHidden()
  }
  // A new task's box has About Jean, which shows the page again, scrolled to; the next request hides it again.
  await page.keyboard.press('ControlOrMeta+Shift+KeyO')
  await about.click()
  await expect(home).toBeVisible()
  await expect(home.locator('.home-strip')).toBeInViewport()
  await expect(about).toHaveCount(0)
  // Beside the drawer, which came in with the first request (D369), never under it.
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', '')
  const drawer = await page.locator('app-inbox').boundingBox()
  expect((await home.boundingBox())?.x).toBeGreaterThanOrEqual((drawer?.x ?? 0) + (drawer?.width ?? 0) - 1)
  await ask(page, 'Hello again')
  await expect(home).toBeHidden()
})

test('at a language’s own address, the page and the app speak it; once hidden, the address is the site’s own, and About Jean goes back there', async ({ page, browserName }) => {
  await page.goto(`${JEAN_IS}ja`)
  await expect(shown(page, 'ja')).toBeVisible()
  // The browser asks for English: the address wins, until the person picks a language.
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(page).toHaveTitle('Jean · みんなのAIを、ブラウザのタブで')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${JEAN_IS}ja`)
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', JEAN_IS)
  expect(new URL(page.url()).pathname).toBe('/ja')
  await page.locator('.home [data-try="quiz"]').click()
  await expect(page.locator('#prompt')).toHaveValue('息子向けに、惑星クイズを10⁠問。')

  await connectFakeBrain(page)
  await ask(page, 'こんにちは')
  await expect(page.locator('.home')).toBeHidden()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/')
  if (browserName !== 'webkit') {
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/is-ready/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  }
  // Asked for again, the page is the app's language's, at its address.
  await page.keyboard.press('ControlOrMeta+Shift+KeyO')
  await page.locator('app-composer .legal a[href="#home-range"]').click()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/ja')
  await expect(shown(page, 'ja')).toBeVisible()
})

test('one tile is active at all times, the filter’s mark slides to its choice, and one question opens at a time without moving the other column', async ({ page }) => {
  for (const [address, lang] of [[JEAN_IS, 'en'], [`${JEAN_IS}ar`, 'ar']]) {
    await page.goto(address)
    await expect(shown(page, lang)).toBeVisible()
    const home = shown(page, lang)
    // Every Try says the same, the sample's too.
    expect(new Set(await home.locator('[data-try]').allTextContents()).size).toBe(1)
    const tiles = home.locator('.home-tile')
    const current = home.locator('.home-tile[aria-current="true"]')
    await expect(current).toHaveCount(1)
    await expect(tiles.first()).toHaveAttribute('aria-current', 'true')
    // The pointer picks one, and so does the keyboard; one stays active when the pointer leaves.
    await tiles.nth(2).hover()
    await expect(tiles.nth(2)).toHaveAttribute('aria-current', 'true')
    // Only the active tile's Try is the primary one.
    await expect(tiles.nth(2).locator('[data-try]')).toHaveClass(/primary/)
    await expect(tiles.first().locator('[data-try]')).not.toHaveClass(/primary/)
    await expect(home.locator('.home-tile [data-try].primary')).toHaveCount(1)
    await page.mouse.move(0, 0)
    await expect(current).toHaveCount(1)
    await tiles.nth(3).locator('[data-try]').focus()
    await expect(tiles.nth(3)).toHaveAttribute('aria-current', 'true')
    await expect(tiles.nth(3)).toHaveClass(/is-active/)
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
    // A filter that hides the active one moves it to the first one shown.
    await home.locator('label[for="home-for-family"]').click()
    await expect(tiles.nth(1)).toHaveAttribute('aria-current', 'true')
    await expect(current).toHaveCount(1)
    // The mark lies under the choice, whichever way the page reads.
    const under = async () => {
      const [mark, label] = await Promise.all([home.locator('.home-filter-mark').boundingBox(), home.locator('label[for="home-for-family"]').boundingBox()])
      return Math.abs((mark?.x ?? 0) - (label?.x ?? 0)) + Math.abs((mark?.width ?? 0) - (label?.width ?? 0))
    }
    await expect(home.locator('.home-filter')).toHaveClass(/is-sliding/)
    await expect.poll(under).toBeLessThan(2)
    // Its four fit: the row has nothing to turn to.
    await expect(next).toBeHidden()
    await home.locator('label[for="home-for-all"]').click()

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
    await expect(home.locator('.home-link')).toContainText('https://hst.ing/s/3f9a…#k=Qm7…')
  }
})

test.describe('in a Japanese browser', () => {
  test.use({ locale: 'ja-JP' })

  test('one language: jean.is opens on its Japanese page, the page’s menu sets the app’s language as Settings does, and the place read stays', async ({ page, browserName }) => {
    await page.goto(JEAN_IS)
    await expect.poll(() => new URL(page.url()).pathname).toBe('/ja')
    await expect(shown(page, 'ja')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
    // French has a page: the app speaks it, and the page is French, at its address, read from the same place,
    // changed mid-page as Settings or ⌘⇧L would.
    const door = () => page.locator('#home-shareable').evaluate((element) => element.getBoundingClientRect().top)
    await page.evaluate(() => scrollBy({ top: (document.getElementById('home-shareable')?.getBoundingClientRect().top ?? 0) - 200, behavior: 'instant' }))
    await page.locator('.home-languages select').evaluate((select) => {
      if (select instanceof HTMLSelectElement) select.value = 'fr'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect.poll(() => new URL(page.url()).pathname).toBe('/fr')
    await expect(shown(page, 'fr')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    await expect(page.locator('.home-languages select')).toHaveValue('fr')
    await expect.poll(async () => Math.abs(await door() - 200)).toBeLessThan(40)
    // From the page's own menu at its foot: back at the foot, the menu with the keyboard.
    await page.locator('.home-languages select').focus()
    await page.locator('.home-languages select').selectOption('ja')
    await expect.poll(() => new URL(page.url()).pathname).toBe('/ja')
    await expect(shown(page, 'ja')).toBeVisible()
    await expect(page.locator('.home-languages select')).toBeInViewport()
    await expect(page.locator('.home-languages select')).toBeFocused()
    // German has none: the app speaks it, and the page is English's, at the site's own address. (WebKit
    // forgets the choice at the new address, and goes back to the browser's Japanese.)
    if (browserName === 'webkit') return
    await page.locator('.home-languages select').selectOption('de')
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await expect(shown(page, 'en')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await expect(page.locator('.home-languages select')).toHaveValue('de')
  })
})

test('on a phone, the box stays docked at the foot while the page scrolls under it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(JEAN_IS)
  await expect(shown(page)).toBeVisible()
  await page.locator('.home-foot').scrollIntoViewIfNeeded()
  await expect(page.locator('.home-foot')).toBeInViewport()
  await expect(page.locator('.starters')).not.toBeInViewport()
  const box = await page.locator('form.composer').boundingBox()
  expect(box && box.y + box.height).toBeGreaterThan(844 - 48)
  expect(box && box.y + box.height).toBeLessThanOrEqual(844)
})

test('Jean as written, which any other site serves, has no page', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('html')).toHaveClass(/is-ready/)
  await expect(page.locator('.home, link[href="home.css"], meta[name="app-language"]')).toHaveCount(0)
  await expect(page.locator('app-composer .legal a[href="#home-range"]')).toHaveCount(0)
  expect((await page.request.get('ja')).status()).toBe(404)
})
