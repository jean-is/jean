// SPDX-License-Identifier: MIT
// Whiteboards (D747), in Chromium and WebKit: one made by a brain that makes tables right, beside the conversation, its sections and
// notes where Jean's code put them, Jean's changes accepted; a note dragged into another section and one from the shelf onto the open
// board, landing where they were dropped, for the file as for the screen; a note moved with its grip and the arrows; a section made
// with the bar, a line drawn and erased, arrows drawn and deleted; notes selected and asked about by id; a note deleted and brought back with ⌘Z,
// its arrow with it, and given a colour; a Creations card dropped on it, shown and opened; pictures of it downloaded; Lanes and
// Table in the address; table_rows reading it. In Arabic, the board runs right to left and a drop still lands where it was put.
import { readFileSync } from 'node:fs'
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
  // Jean's eight rows marked; Before shows the whiteboard without them, After with them; then they are kept.
  const review = board.getByRole('region', { name: 'Jean’s changes' })
  await expect(review).toContainText('8 changes by Jean')
  const compare = board.getByRole('group', { name: 'Before or after Jean’s changes' })
  await compare.getByRole('button', { name: 'Before' }).click()
  await expect(board.locator('.wb-area')).toHaveCount(0)
  await compare.getByRole('button', { name: 'After' }).click()
  await expect(board.locator('.wb-area')).toHaveCount(3)
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
  // Drawn as it comes, before the pointer is let go, in a box as large as its points.
  await expect(board.locator('.wb-stroke path')).toHaveAttribute('d', /L/)
  expect((await board.locator('.wb-stroke').boundingBox())?.width).toBeGreaterThan(100)
  await page.mouse.up()
  await expect(board.locator('.wb-line svg')).toHaveCount(1)
  await expect(board.locator('.wb-line svg')).toHaveAttribute('aria-label', 'Drawing')
  await board.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Eraser' }).click()
  const line = /** @type {{ x: number, y: number, width: number, height: number }} */ (await board.locator('.wb-line').boundingBox())
  await page.mouse.click(line.x + line.width / 2, line.y + line.height / 2)
  await expect(board.locator('.wb-line')).toHaveCount(0)

  // An arrow drawn with the bar from one note to another, named for what it joins; pressed, it has the keys, and Delete takes it away.
  await board.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Arrow' }).click()
  const flaky = /** @type {{ x: number, y: number, width: number, height: number }} */ (await notesIn(page, 'To change').first().boundingBox())
  await drag(page, notesIn(page, 'Went well').first(), { x: flaky.x + flaky.width / 2, y: flaky.y + flaky.height / 2 })
  await expect(board.locator('.wb-arrow > svg')).toHaveAttribute('aria-label', 'Arrow from Shipped the beta to Flaky tests')
  const ids = Object.fromEntries((await rows(page)).map((row) => [row.note, row.id]))
  expect((await rows(page)).find((row) => row['@kind'] === 'arrow')?.['@ends']).toEqual([ids['Shipped the beta'], ids['Flaky tests']])
  await board.getByRole('button', { name: 'Select and move' }).click()
  const hit = /** @type {{ x: number, y: number, width: number, height: number }} */ (await board.locator('.wb-arrow .wb-hit').boundingBox())
  await page.mouse.click(hit.x + hit.width / 4, hit.y + hit.height / 2)
  await expect(board.locator('.wb-arrow .wb-words')).toBeFocused()
  await page.keyboard.press('Delete')
  await expect(board.locator('.wb-arrow')).toHaveCount(0)
  // Another from a note's menu, pointed with Enter on the note it goes to.
  await board.getByRole('button', { name: 'More for Demo day' }).click()
  await page.locator('.wb-menu:popover-open').getByRole('button', { name: 'Draw an arrow from here' }).click()
  await expect(board.getByRole('status')).toContainText('press what the arrow points to')
  await notesIn(page, 'To change').first().focus()
  await page.keyboard.press('Enter')
  await expect(board.locator('.wb-arrow > svg')).toHaveAttribute('aria-label', 'Arrow from Demo day to Flaky tests')
  await expect(board.getByRole('status')).toHaveText('Arrow drawn from Demo day to Flaky tests.')

  // Two notes selected with Shift: the bar says how many and asks Jean about them, by id.
  await notesIn(page, 'Went well').first().click({ modifiers: ['Shift'] })
  await notesIn(page, 'To change').first().click({ modifiers: ['Shift'] })
  const chosen = board.getByRole('toolbar', { name: '2 selected' })
  await chosen.getByRole('button', { name: 'Ask Jean' }).click()
  await expect(page.locator('#prompt')).toBeFocused()
  expect(await page.evaluate(() => import('/caps/whiteboards/whiteboards.js').then(({ picked }) => picked.value?.rows.length))).toBe(2)
  // In the box, one chip for them and three ideas, Jean's own words, which an idea puts in the box; the chip's ✕ leaves them out.
  const chip = page.locator('.composer .wb-chip')
  await expect(chip).toContainText('2 notes from Team retro')
  await page.locator('.composer .wb-ideas').getByRole('button', { name: 'Group these notes by theme' }).click()
  await expect(page.locator('#prompt')).toHaveValue('Group these notes by theme')
  await chip.getByRole('button', { name: 'Leave them out' }).click()
  await expect(chip).toHaveCount(0)
  await page.locator('#prompt').fill('')

  // Deleted from its menu, a note comes back with ⌘Z.
  await board.getByRole('button', { name: 'More for Flaky tests' }).click()
  await page.locator('.wb-menu:popover-open').getByRole('button', { name: 'Delete' }).click()
  await expect(notesIn(page, 'To change')).toHaveCount(0)
  await expect(board.locator('.wb-arrow')).toHaveCount(0)
  await notesIn(page, 'Ideas').first().focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(notesIn(page, 'To change')).toHaveText(['Flaky tests'])
  await expect(board.locator('.wb-arrow')).toHaveCount(1)

  // A note given a colour of its own from its menu, the one it has pressed there; then none again, its section's.
  await board.getByRole('button', { name: 'More for Pair programming' }).click()
  await page.locator('.wb-menu:popover-open').getByRole('button', { name: 'Violet' }).click()
  await expect(board.locator('.wb-note.wb-hue-3')).toContainText('Pair programming')
  expect((await rows(page)).find((row) => row.note === 'Pair programming')?.['@hue']).toBe(3)
  await board.getByRole('button', { name: 'More for Pair programming' }).click()
  await expect(page.locator('.wb-menu:popover-open').getByRole('button', { name: 'Violet' })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.wb-menu:popover-open').getByRole('button', { name: 'No colour of its own' }).click()
  await expect(board.locator('.wb-note.is-hued')).toHaveCount(0)

  // One section as a table, from its menu, in the address; All sections leads back to every note.
  await board.getByRole('button', { name: 'More for Ideas' }).click()
  await page.locator('.wb-menu:popover-open').getByRole('button', { name: 'Show as a table' }).click()
  await expect(board.locator('.wb-only')).toContainText('Only Ideas')
  await expect(board.locator('.table-view tbody tr')).toHaveCount(2)
  // Kept by the whiteboard's place, as a collection's way to show is (`show=<id>:<as>`).
  await expect(page).toHaveURL(/show=[0-9A-Z]{26}:table(\/|%2F)/)
  await board.getByRole('button', { name: 'All sections' }).click()
  await expect(board.locator('app-table tbody tr')).toHaveCount(6)
  await board.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Whiteboard' }).click()

  // Lanes and Table, in the address.
  await board.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Lanes' }).click()
  // A lane for the notes in no section, after the sections'.
  await expect(board.locator('.wb-lane')).toHaveCount(5)
  await expect(board.locator('.wb-lane.is-loose .wb-words')).toHaveText(['Book the offsite', 'Demo day'])
  await expect(page).toHaveURL(/show=[0-9A-Z]{26}:lanes/)
  await board.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Table' }).click()
  await expect(board.locator('app-table tbody tr')).toHaveCount(6)
  await expect(page).toHaveURL(/show=[0-9A-Z]{26}:table/)

  // Any brain reads it with table_rows: its sections by id, then its notes.
  const folder = await page.evaluate(() => document.querySelector('app-whiteboard')?.getAttribute('folder'))
  await ask(page, `Call table_rows with ${JSON.stringify({ table: folder })}`)
  await answered(page, 2)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('a whiteboard: 4 areas, 6 notes')
  // Its arrows by the ids they join, after its texts.
  const told = await page.evaluate((table) => import('/ui/caps.js').then(({ loaded }) => /** @type {any} */ (loaded.value.get('tables'))?.tools.find((/** @type {any} */ tool) => tool.spec.name === 'table_rows').run({ table }, { meta: {}, signal: new AbortController().signal })), folder)
  expect(String(told).split('\n').at(-1)).toMatch(/^\{"arrow":"\w+","from":"\w+","to":"\w+"\}$/)

  // A Creations card dropped on the board, as a table's gives its block, makes a note that shows that creation's card; a press opens it.
  await board.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Whiteboard' }).click()
  const budget = await page.evaluate(async () => {
    const brain = { id: 'cloud', provider: 'anthropic', api: 'anthropic', baseURL: 'https://api.anthropic.com', model: 'claude' }, { loaded } = await import('/ui/caps.js')
    const made = await /** @type {any} */ (loaded.value.get('tables'))?.tools.find((/** @type {any} */ tool) => tool.spec.name === 'table_create').run({ name: 'Budget', columns: [{ name: 'Item', type: 'text' }] }, { brain, signal: new AbortController().signal, meta: {} })
    await (await import('/ui/creations.js')).reread()
    return /at (collections\/\S+),/.exec(String(made))?.[1] ?? ''
  })
  const open = /** @type {{ x: number, y: number, width: number, height: number }} */ (await board.locator('.wb-board').boundingBox())
  await page.evaluate(({ place, x, y }) => {
    const data = new DataTransfer(), at = /** @type {Element} */ (document.querySelector('app-whiteboard .wb-board'))
    data.setData('text/x-creation-block', `\`\`\`table\n${place}\n\`\`\``)
    for (const type of ['dragenter', 'dragover', 'drop']) at.dispatchEvent(new DragEvent(type, { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }))
  }, { place: budget, x: open.x + open.width / 2, y: open.y + open.height - 200 })
  const card = board.getByRole('button', { name: 'Open Budget' })
  // Its picture drawn once near enough to read: none under the far mark.
  await expect(card.locator('.creation-preview > *')).toHaveCount(0)
  const near = /** @type {{ x: number, y: number, width: number, height: number }} */ (await card.boundingBox())
  await board.evaluate((element, at) => /** @type {any} */ (element).zoom(0, 1, at), { clientX: near.x + near.width / 2, clientY: near.y + near.height / 2 })
  await expect(card.locator('.creation-preview th')).toHaveText('Item')
  await expect(board.getByRole('status')).toContainText('Budget')
  expect((await rows(page)).some((row) => row.note === `[[${budget}|Budget]]`)).toBe(true)
  // A picture of it from the pane's way out, the whole whiteboard or what is in view: a PNG, named for it.
  for (const [way, wide] of /** @type {const} */ ([['Picture of the whole whiteboard', 600], ['Picture of what’s in view', 300]])) {
    await page.getByRole('complementary', { name: 'Team retro' }).getByRole('button', { name: /download/i }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.out-menu:popover-open').getByRole('button', { name: way }).click()])
    expect(download.suggestedFilename().replaceAll('_', ' '), 'WebKit on Linux writes a space as _').toBe('Team retro.png')
    const png = readFileSync(await download.path())
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBeGreaterThan(wide)
  }
  await card.click()
  await expect(page.getByRole('complementary', { name: 'Budget' }).locator('app-table')).toBeVisible()
})

test('the arrow keys walk notes, drawings and arrows; an arrow points elsewhere from its menu or by an end dragged, a step to undo; a card draws its picture once near the screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await start(page)
  await page.evaluate(async () => {
    const caps = await import('/ui/caps.js'), tables = await import('/caps/tables/tables.js')
    await caps.unlock('whiteboards')
    const ctx = /** @type {any} */ ({ brain: { id: 'cloud', provider: 'anthropic', api: 'anthropic', baseURL: 'https://api.anthropic.com', model: 'claude' }, signal: new AbortController().signal, meta: {} })
    const made = await /** @type {any} */ (caps.loaded.value.get('whiteboards'))?.tools[0].run({ name: 'Flow', areas: ['Later'], notes: [{ words: 'Someday', area: 'Later' }] }, ctx)
    const uri = /at (collections\/\S+),/.exec(String(made))?.[1] ?? '', load = async () => /** @type {any} */ (await tables.load(uri))
    await tables.accept(await load())
    const ids = await tables.change(await load(), [{ set: { note: 'Ask', '@spot': { area: null, x: 0, y: 600 } } }, { set: { note: 'Build', '@spot': { area: null, x: 400, y: 600 } } },
      { set: { note: 'Ship', '@spot': { area: null, x: 0, y: 900 } } }, { set: { '@kind': 'line', '@path': [0, 0, 60, 30, 120, 0], '@ink': 'ink', '@spot': { area: null, x: 800, y: 640 } } },
      { set: { note: `[[${uri}|Flow]]`, '@spot': { area: null, x: 3000, y: 600 } } }], 'user')
    await tables.change(await load(), [{ set: { '@kind': 'arrow', '@ends': [ids[0], ids[1]] } }], 'user')
    await (await import('/ui/creations.js')).reread()
    ;(await import('/ui/preview.js')).preview({ uri, name: 'Flow', title: 'Flow' }, true)
  })
  const board = page.locator('app-whiteboard'), words = (/** @type {string} */ name) => board.locator('.wb-note .wb-words', { hasText: name }), arrow = board.locator('.wb-arrow > svg')
  await expect(arrow).toHaveAttribute('aria-label', 'Arrow from Ask to Build')
  // One stop for the keys, though an arrow lies lowest of all.
  await expect(board.locator('.wb-board [tabindex="0"]')).not.toHaveCount(0)
  // Ask, then the arrow by its middle, then Build, then the drawing, named as before.
  await words('Ask').focus()
  for (const next of [board.locator('.wb-arrow .wb-words'), words('Build'), board.locator('.wb-line .wb-words')]) (await page.keyboard.press('ArrowRight'), await expect(next).toBeFocused())
  await expect(board.locator('.wb-line .wb-words')).toHaveAccessibleName('Drawing')
  await page.keyboard.press('ArrowLeft')
  await expect(words('Build')).toBeFocused()
  // Pointed elsewhere from its menu, then Enter on another note; ⌘Z puts it back.
  await board.getByRole('button', { name: 'More for Arrow from Ask to Build' }).click()
  await page.locator('.wb-menu:popover-open').getByRole('button', { name: 'Point it elsewhere' }).click()
  await expect(board.getByRole('status')).toContainText('press what the arrow points to')
  await words('Ship').focus()
  await page.keyboard.press('Enter')
  await expect(arrow).toHaveAttribute('aria-label', 'Arrow from Ask to Ship')
  await expect(board.getByRole('status')).toHaveText('The arrow now goes from Ask to Ship.')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(arrow).toHaveAttribute('aria-label', 'Arrow from Ask to Build')
  // At its own size, its tail dragged from Ask onto Ship: the arrow goes from Ship now, its head where it was.
  await board.evaluate((element) => /** @type {any} */ (element).zoom(0, 1))
  const box = async (/** @type {import('@playwright/test').Locator} */ one) => /** @type {{ x: number, y: number, width: number, height: number }} */ (await one.boundingBox())
  const [room, middle] = [await box(board.locator('.wb-board')), await box(board.locator('.wb-arrow .wb-hit'))]
  await board.evaluate((element, [x, y]) => /** @type {any} */ (element).pan(x, y), [room.x + room.width / 2 - middle.x - middle.width / 2, room.y + room.height / 2 - middle.y - middle.height / 2])
  const [line, ship] = [await box(board.locator('.wb-arrow > svg > path:not(.wb-hit)')), await box(words('Ship'))]
  await page.mouse.move(line.x + 4, line.y + line.height / 2)
  await page.mouse.down()
  // Its top, clear of the bar floating at the board's foot.
  await page.mouse.move(ship.x + ship.width / 2, ship.y + 12, { steps: 10 })
  await page.mouse.up()
  await expect(arrow).toHaveAttribute('aria-label', 'Arrow from Ship to Build')
  // The card far off draws nothing until it comes near the screen.
  await expect(board.locator('.wb-card .creation-preview > *')).toHaveCount(0)
  const card = await box(board.locator('.wb-card'))
  await board.evaluate((element, by) => /** @type {any} */ (element).pan(by, 0), room.x + room.width / 2 - card.x)
  await expect(board.locator('.wb-card .creation-preview svg')).toHaveCount(1)
})

test('a whiteboard fills as Jean writes the call, its sections first, and stays where it showed once made', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await start(page)
  await planBrain(page)
  await page.evaluate(() => import('/ui/caps.js').then(({ unlock }) => unlock('whiteboards')))
  await ask(page, `Slowly call whiteboard with ${JSON.stringify(RETRO)}`)
  const board = page.locator('app-whiteboard')
  await expect(board.locator('.wb-area').first()).toBeVisible()
  const drafted = await board.getAttribute('folder')
  await answered(page)
  await expect(board.locator('.wb-area')).toHaveCount(3)
  expect(await board.getAttribute('folder')).toBe(drafted)
  await expect(notesIn(page, 'Went well')).toHaveText(['Shipped the beta', 'Demo day'])
  expect(await page.evaluate(() => import('/caps/whiteboards/whiteboards.js').then(({ writing }) => writing.value))).toBe('')
})

test('on a phone, a whiteboard opens on its lanes, one section at a time under a strip of them, and a note written goes into the one on show', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await start(page)
  await planBrain(page)
  await page.evaluate(() => import('/ui/caps.js').then(({ unlock }) => unlock('whiteboards')))
  await ask(page, `Call whiteboard with ${JSON.stringify(RETRO)}`)
  await answered(page)
  await page.evaluate(() => import('/ui/preview.js').then(({ preview }) => preview({ uri: String(document.querySelector('app-whiteboard')?.getAttribute('folder') ?? ''), name: 'Team retro', title: 'Team retro' }, true)))
  const board = page.locator('app-whiteboard'), strip = board.getByRole('navigation', { name: 'Lanes' })
  await expect(board.locator('.wb')).toHaveAttribute('data-as', 'lanes')
  await expect(strip.getByRole('button')).toHaveText(['Went well', 'To change', 'Ideas'])
  await expect(strip.getByRole('button', { name: 'Went well' })).toHaveAttribute('aria-current', 'true')
  await strip.getByRole('button', { name: 'Ideas' }).click()
  await expect(strip.getByRole('button', { name: 'Ideas' })).toHaveAttribute('aria-current', 'true')
  await expect(board.locator('.wb-lane[data-area]').nth(2)).toBeInViewport({ ratio: 0.9 })
  await board.getByTitle('New note').fill('Mob reviews')
  await board.getByTitle('New note').press('Enter')
  await expect(board.locator('.wb-lane[data-area]').nth(2).locator('.wb-words')).toHaveText(['Pair programming', 'Mob reviews'])
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
  // An arrow between them lies between them, from the one it starts at, right to left as the board is.
  await board.locator('.wb-bar button').nth(4).click()
  await board.locator('.wb-area').first().locator('.wb-note .wb-words').first().click()
  await board.locator('.wb-area').first().locator('.wb-note .wb-words').nth(1).click()
  await expect(board.locator('.wb-arrow')).toHaveCount(1)
  const [a, b, arrow] = await Promise.all([...[0, 1].map((i) => board.locator('.wb-area').first().locator('.wb-note').nth(i).boundingBox()), board.locator('.wb-arrow > svg > path:not(.wb-hit)').boundingBox()])
  const middle = (/** @type {any} */ box) => box.x + box.width / 2
  expect(Math.min(middle(a), middle(b))).toBeLessThan(middle(arrow))
  expect(Math.max(middle(a), middle(b))).toBeGreaterThan(middle(arrow))
})
