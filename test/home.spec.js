// jean.is's page under the first screen (D397), served as jean.is's deploy has it (scripts/serve.js --home):
// the app's root first, the document scrolling on to the page, each Try putting its request in the box, the
// doors unfolding in place, and the page gone with the first request, for good. At a language's own address
// the page and the app speak it, and once the page is gone the address is the site's own, the language kept.
// On a phone the box stays docked at the foot. Jean as written (app/, any other site) has no page at all.
import { test, expect } from '@playwright/test'
import { connectFakeBrain, ask } from './helpers.js'

const JEAN_IS = 'http://127.0.0.1:4186/'

test('on jean.is, the page is under the first screen, its tries fill the box, and it goes with the first request', async ({ page, browserName }) => {
  await page.goto(JEAN_IS)
  const home = page.locator('body > .home')
  await expect(home).toBeVisible()
  // The app's root first, its box under the question as ever, and the document scrolls on to the page.
  expect(await page.evaluate(() => document.body.firstElementChild?.localName)).toBe('app-shell')
  await expect(page.locator('html')).toHaveAttribute('data-centred', '')
  expect(await page.evaluate(() => document.documentElement.scrollHeight > 3 * innerHeight)).toBe(true)

  // A try puts its request in the box, back up at the top; the sample's comes with its file.
  await home.locator('[data-try="music"]').click()
  await expect(page.locator('#prompt')).toHaveValue('A lullaby in D major for Léa’s bedtime.')
  await expect(page.locator('#prompt')).toBeFocused()
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await home.locator('label[for="home-for-family"]').click()
  await expect(home.locator('.home-tile[data-for="work"]')).toBeHidden()
  await expect(home.locator('.home-tile[data-for="family"]')).toHaveCount(2)
  await home.locator('label[for="home-for-all"]').click()
  await home.locator('.home-replay [data-try="sample"]').click()
  await expect(page.locator('.attachment-name')).toHaveText('sales.csv')
  await expect(page.locator('#prompt')).toHaveValue('Which product grew the most over the year? Show it as a chart.')

  // A door unfolds in place, its words in the page all along.
  const more = home.locator('#home-shareable details')
  await expect(more.locator('li').first()).toHaveText('Sealed in your browser. Its key travels in the link, never to the host.', { useInnerText: false })
  await more.locator('summary').click()
  await expect(more.locator('li').first()).toBeVisible()

  // The first request takes it away (the first brain's step sends the one the box kept, D366), and a
  // reload doesn't bring it back. Playwright's WebKit keeps nothing over a reload (no OPFS).
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await expect(home).toHaveCount(0)
  if (browserName === 'webkit') return
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/is-ready/)
  await expect(page.locator('.home')).toHaveCount(0)
})

test('at a language’s own address, the page and the app speak it; once the page is gone, the address is the site’s own', async ({ page, browserName }) => {
  await page.goto(`${JEAN_IS}ja`)
  await expect(page.locator('body > .home')).toHaveAttribute('lang', 'ja')
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
  await expect(page.locator('.home')).toHaveCount(0)
  await expect.poll(() => new URL(page.url()).pathname).toBe('/')
  if (browserName === 'webkit') return
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/is-ready/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
})

test('on a phone, the box stays docked at the foot while the page scrolls under it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(JEAN_IS)
  await expect(page.locator('.home')).toBeVisible()
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
  expect((await page.request.get('ja')).status()).toBe(404)
})
