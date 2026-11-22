// SPDX-License-Identifier: MIT
// /everywhere's map in a browser, as jean.is serves it (scripts/serve.js --home): the project's map in its pane's frame,
// drawn by the app's own <app-links-map> (caps/compose/map.js), each creation saying how it stands, a chain lit where one is
// pointed at, the arrows walking the links, a press saying what Jean would do; in Arabic its sources on the right, and at
// 320 px wide its columns stacked, no name cut. test/everywhere.test.js holds what the map holds.
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { PLACES } from '../site/everywhere/page.js'

const JEAN_IS = 'http://127.0.0.1:4186/'
const EN = JSON.parse(await readFile(new URL('../site/everywhere/en.json', import.meta.url), 'utf8'))
const AR = JSON.parse(await readFile(new URL('../app/locales/compose/ar.json', import.meta.url), 'utf8'))

test('the page’s pane plays the project’s map: each creation saying how it stands, a chain lit, the arrows walking the links, a press answered', async ({ page }) => {
  await page.goto(`${JEAN_IS}everywhere`)
  const frame = page.locator('iframe.site-creation.is-map')
  await frame.scrollIntoViewIfNeeded()
  const map = frame.contentFrame().locator('app-links-map')
  const named = (/** @type {keyof typeof PLACES} */ key) => map.locator(`button[data-place="${PLACES[key]}"]`)
  await expect(map.locator('button')).toHaveCount(7)
  // Six lines, each drawn between its two creations once they land; the orders' relation dashed.
  await expect(map.locator('.links-lines path[data-from][d]')).toHaveCount(6)
  await expect(map.locator('.links-lines path.is-dashed')).toHaveCount(1)
  await expect(named('slides')).toContainText('Version 2')
  await expect(named('slides')).toContainText('Version 3 is out')
  await expect(named('letter')).toContainText('As the collection changes')
  await expect(named('orders')).toContainText('Used by nothing')
  await expect(named('flyer').locator('small.is-alert')).toHaveText('This project has no such collection.')
  // The newsletter pointed at lights the prices it reads, and not the shop.
  await named('letter').hover()
  await expect(map).toHaveAttribute('data-chain', '')
  await expect(named('prices').locator('..')).toHaveClass(/is-chain/)
  await expect(named('shop').locator('..')).not.toHaveClass(/is-chain/)
  // From the prices, down their column to the orders, back up, then along a link to what uses them.
  await named('prices').focus()
  await page.keyboard.press('ArrowDown')
  await expect(named('orders')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowRight')
  await expect(map.locator('button:focus')).toHaveAttribute('data-place', /^(decks|documents|sites)\//)
  // Pressed, the shop says what Jean would do with it.
  await named('shop').click()
  await expect(frame.contentFrame().locator('#said')).toHaveText(EN['pane.asked'].replace('{name}', 'Jean'))
})

test('in Arabic the map’s sources are on the right, and at 320 px wide its columns stack with no name cut', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto(`${JEAN_IS}creation.html#src=creations/everywhere.en.json&lang=ar&bare`)
  const map = page.locator('app-links-map')
  await expect(map.locator('button')).toHaveCount(7)
  await expect(map.locator('small.is-alert')).toHaveText(AR['compose.missing'])
  const boxes = await map.locator('ul').evaluateAll((columns) => columns.map((column) => column.getBoundingClientRect()))
  expect(boxes.every((box, i) => !i || box.top >= boxes[i - 1].bottom), 'stacked').toBe(true)
  expect(await map.locator('button').evaluateAll((buttons) => buttons.every((button) => button.scrollWidth <= button.clientWidth + 1)), 'no name cut').toBe(true)
  await page.setViewportSize({ width: 1100, height: 700 })
  const [prices, shop] = await Promise.all(['collections/', 'sites/'].map((folder) => map.locator(`button[data-place^="${folder}"]`).first().boundingBox()))
  expect(prices && shop && prices.x > shop.x, 'the sources on the right').toBe(true)
})
