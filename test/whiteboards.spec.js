// SPDX-License-Identifier: MIT
// Whiteboards (D747), in Chromium and WebKit: one made by a brain that makes tables right, beside the conversation, its sections and
// notes where Jean's code put them, Jean's changes accepted; a note dragged into another section and one from the shelf onto the open
// board, landing where they were dropped, for the file as for the screen; a note moved with its grip and the arrows; a section made
// with the bar, a line drawn and erased; notes selected and asked about by id; a note deleted and brought back with ⌘Z; Lanes and
// Table in the address; table_rows reading it. In Arabic, the board runs right to left and a drop still lands where it was put.
import { test, expect } from '@playwright/test'
import { start, ask, answered, BRAIN_URL } from './helpers.js'

/** A plan's brain, which the fake brain answers for: not on this computer, so it passes (D491). @param {import('@playwright/test').Page} page */
const planBrain = (page) => page.evaluate((baseURL) => import('/ui/brains.js').then(({ addBrain }) => addBrain({ id: 'claude', provider: 'claudecode', api: 'openai', baseURL, model: 'haiku' })), BRAIN_URL)
/** The whiteboard on show: its rows as Tables folds them, by their words. @param {import('@playwright/test').Page} page */
const rows = (page) => page.evaluate(() => /** @type {any} */ (document.querySelector('app-whiteboard'))?.where.peek().rows.map((/** @type {any} */ row) => ({ id: row.id, ...row.cells })) ?? [])
/** A section's notes on screen, by its name. @param {import('@playwright/test').Page} page @param {string} name */
const notesIn = (page, name) => page.locator('.wb-area', { has: page.locator(`.wb-area-head span[id]:text-is("${name}")`) }).locator('.wb-note .wb-words')
/** Drags from the middle of one thing to a point, as a hand does, in steps. @param {import('@playwright/test').Page} page @param {import('@playwright/test').Locator} from @param {{ x: number, y: number }} to */
async function drag(page, from, to) {
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await from.boundingBox())
  await page.mouse.move(box.x + box.width / 2, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
}

const RETRO = { name: 'Team retro', areas: ['Went well', 'To change', 'Ideas'], notes: [{ words: 'Shipped the beta', area: 'Went well' }, { words: 'Demo day', area: 'Went well' },
  { words: 'Flaky tests', area: 'To change' }, { words: 'Too many meetings', area: 'To change' }, { words: 'Pair programming', area: 'Ideas', owner: 'Sam', due: '2026-12-01' }] }

test('a whiteboard: made by the brain, its notes dragged, moved with the keys, a section and a drawing made with the bar, notes asked about, Lanes and Table in the address', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await start(page)
  await planBrain(page)
  await page.evaluate(() => import('/ui/caps.js').then(({ unlock }) => unlock('whiteboards')))
  await ask(page, `Call whiteboard with ${JSON.stringify(RETRO)}`)
  await answered(page)
  const board = page.locator('app-whiteboard')
  await expect(board.locator('.wb-area')).toHaveCount(3)
  await expect(notesIn(page, 'Went well')).toHaveText(['Shipped the beta', 'Demo day'])
  await expect(board.locator('.wb-foot')).toContainText('Sam')
  // Jean's eight rows marked, then kept.
  const review = board.getByRole('region', { name: 'Jean’s changes' })
  await expect(review).toContainText('8 changes by Jean')
  await review.getByRole('button', { name: 'Accept all' }).click()
  await expect(review).toHaveCount(0)
  await expect(board.locator('.is-jean')).toHaveCount(0)

  // A note dragged into another section lands there, at its place in it; one written on the shelf, dragged onto the open board, stays where it was dropped.
  const ideas = /** @type {{ x: number, y: number, width: number, height: number }} */ (await board.locator('.wb-area').nth(2).boundingBox())
  await drag(page, notesIn(page, 'To change').filter({ hasText: 'Too many meetings' }), { x: ideas.x + ideas.width - 60, y: ideas.y + ideas.height - 30 })
  await expect(notesIn(page, 'Ideas')).toHaveCount(2)
  await expect(notesIn(page, 'Ideas').filter({ hasText: 'Too many meetings' })).toBeVisible()
  const moved = (await rows(page)).find((row) => row.note === 'Too many meetings')
  expect(moved?.['@spot']).toMatchObject({ area: moved?.area })
  await board.getByTitle('New note').fill('Book the offsite')
  await board.getByTitle('New note').press('Enter')
  await expect(board.locator('.wb-shelf .wb-note .wb-words')).toHaveText(['Book the offsite'])
  const ground = /** @type {{ x: number, y: number, width: number, height: number }} */ (await board.locator('.wb-board').boundingBox())
  await drag(page, board.locator('.wb-shelf .wb-note'), { x: ground.x + 200, y: ground.y + ground.height - 160 })
  await expect(board.locator('.wb-ground .wb-note .wb-words')).toHaveText(['Book the offsite'])
  await expect(board.getByRole('status')).toHaveText('Book the offsite placed on the board.')
  expect((await rows(page)).find((row) => row.note === 'Book the offsite')?.['@spot']).toMatchObject({ area: null })

  // The arrows go from note to note; the grip's Move moves one with them, Enter dropping it.
  await notesIn(page, 'Went well').first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(notesIn(page, 'Went well').nth(1)).toBeFocused()
  await board.getByRole('button', { name: 'Move Demo day' }).click()
  await expect(board.getByRole('status')).toContainText('Moving')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await rows(page)).find((row) => row.note === 'Demo day')?.['@spot']?.y).toBeGreaterThan(100)

  // A section made with the bar where the board is pressed, its name taking the keys; a line drawn, then erased.
  await board.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Section' }).click()
  await page.mouse.click(ground.x + ground.width - 300, ground.y + 60)
  await page.keyboard.type('Actions')
  await page.keyboard.press('Enter')
  await expect(board.locator('.wb-area')).toHaveCount(4)
  await board.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Draw' }).click()
  await page.mouse.move(ground.x + 400, ground.y + ground.height - 220)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(ground.x + 400 + i * 15, ground.y + ground.height - 220 + (i % 4) * 10)
  await page.mouse.up()
  await expect(board.locator('.wb-line svg')).toHaveCount(1)
  await expect(board.locator('.wb-line svg')).toHaveAttribute('aria-label', 'Drawing')
  await board.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Eraser' }).click()
  const line = /** @type {{ x: number, y: number, width: number, height: number }} */ (await board.locator('.wb-line').boundingBox())
  await page.mouse.click(line.x + line.width / 2, line.y + line.height / 2)
  await expect(board.locator('.wb-line')).toHaveCount(0)
  await board.getByRole('button', { name: 'Select and move' }).click()

  // Two notes selected with Shift: the bar says how many and asks Jean about them, by id.
  await notesIn(page, 'Went well').first().click({ modifiers: ['Shift'] })
  await notesIn(page, 'To change').first().click({ modifiers: ['Shift'] })
  const chosen = board.getByRole('toolbar', { name: '2 selected' })
  await chosen.getByRole('button', { name: 'Ask Jean' }).click()
  await expect(page.locator('#prompt')).toBeFocused()
  expect(await page.evaluate(() => import('/caps/whiteboards/whiteboards.js').then(({ picked }) => picked.value?.rows.length))).toBe(2)

  // Deleted from its menu, a note comes back with ⌘Z.
  await board.getByRole('button', { name: 'More for Flaky tests' }).click()
  await page.locator('.wb-menu:popover-open').getByRole('button', { name: 'Delete' }).click()
  await expect(notesIn(page, 'To change')).toHaveCount(0)
  await notesIn(page, 'Ideas').first().focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(notesIn(page, 'To change')).toHaveText(['Flaky tests'])

  // Lanes and Table, in the address.
  await board.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Lanes' }).click()
  await expect(board.locator('.wb-lane')).toHaveCount(4)
  await expect(page).toHaveURL(/whiteboard=lanes/)
  await board.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Table' }).click()
  await expect(board.locator('app-table tbody tr')).toHaveCount(6)
  await expect(page).toHaveURL(/whiteboard=table/)

  // Any brain reads it with table_rows: its sections by id, then its notes.
  const folder = await page.evaluate(() => document.querySelector('app-whiteboard')?.getAttribute('folder'))
  await ask(page, `Call table_rows with ${JSON.stringify({ table: folder })}`)
  await answered(page, 2)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('a whiteboard: 4 areas, 6 notes')
})

test('in Arabic, a whiteboard runs right to left, and a note dropped lands where it was put (ar)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await start(page, 'ar')
  await planBrain(page)
  await page.evaluate(() => import('/ui/caps.js').then(({ unlock }) => unlock('whiteboards')))
  await ask(page, `Call whiteboard with ${JSON.stringify({ name: 'مراجعة', areas: ['ما نجح', 'ما نغيّره'], notes: [{ words: 'إطلاق النسخة', area: 'ما نجح' }, { words: 'اجتماعات كثيرة', area: 'ما نغيّره' }] })}`)
  await answered(page)
  const board = page.locator('app-whiteboard')
  await expect(board.locator('.wb-layer')).toHaveAttribute('dir', 'rtl')
  const first = /** @type {{ x: number, y: number, width: number, height: number }} */ (await board.locator('.wb-area').first().boundingBox())
  const second = /** @type {{ x: number, y: number, width: number, height: number }} */ (await board.locator('.wb-area').nth(1).boundingBox())
  // The first section is at the start of the board, its right.
  expect(first.x).toBeGreaterThan(second.x)
  await drag(page, board.locator('.wb-area').nth(1).locator('.wb-note'), { x: first.x + 60, y: first.y + first.height - 30 })
  await expect(board.locator('.wb-area').first().locator('.wb-note')).toHaveCount(2)
})
