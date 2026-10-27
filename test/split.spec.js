// Tiles (D635), panes of the dock as the preview is: a task or a pinned creation dragged from the drawer onto the screen takes a tile's
// place or half of a part, a box showing where, and the address keeps the layout; a click in another task's tile makes it the one the
// box is for, where it is, the edge between two moves with the keys, a reload and Back lay them out again, and a narrow window has
// them over the conversation, as any pane. A pane's head moves it, the preview's as a tile's. A collection's or a document's tile is its
// editor, as the preview's is, the brain hearing of each one on screen, and opening it again brings its tile forward; a design's is while
// it is the one on show, one at a time. Without dragging, a task's menu opens it beside, at the line's end: on the left in Arabic, on
// the right in Japanese.
import { test, expect } from '@playwright/test'
import { start, openTasks } from './helpers.js'

/** Tasks, each a request and its answer under its title, the first opened, a pinned document and a pinned collection, the drawer open. @param {import('@playwright/test').Page} page */
async function seed(page) {
  const made = await page.evaluate(async () => {
    const [{ app, refreshConversations, openConversation }, { createConversation, appendRecords }, { userRecords, envelope, metaRecord }, { unlock }, { ulid }, { reread }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js'), import('/ui/caps.js'), import('/core/ulid.js'), import('/ui/creations.js')])
    /** @type {{ id: string, path: string }[]} */
    const tasks = []
    for (const [title, ask, answer] of [['Garden beds', 'Plan the garden beds', 'Tomatoes in the sunny bed.'], ['Seed suppliers', 'Compare two seed suppliers', 'Supplier A is cheaper.'], ['Neighbours', 'Draft a note to the neighbours', 'We plant on Saturday.']]) {
      const { header, path } = await createConversation(app.fs, { projectDir: app.projectDir, by: 'test' })
      await appendRecords(app.fs, path, [...userRecords(ask, [], 'test'), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: answer } }, 0), metaRecord('test', { title })])
      tasks.push({ id: header.id, path })
    }
    await Promise.all([unlock('documents'), unlock('tables')])
    const at = new Date().toISOString(), doc = `documents/${ulid()}-plan.md`, folder = 'collections/01K85Z1T00000000000000000S-seeds'
    await app.fs.write(`${app.projectDir}/${doc}`, `---\nformat: 1\nname: Garden plan\nauthor: user\ncreated: ${at}\nchanged: ${at}\npinned: true\n---\n# Garden plan\n\nNorth bed: beans.\n`)
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000S', name: 'Seeds', author: 'user', created: at, changed: at, pinned: true,
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'packets', name: 'Packets', type: 'number' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, ['Beans', 'Tomatoes'].map((name, i) => `${JSON.stringify({ row: `01K8000000000000000000000${i}`, set: { name, packets: i + 2 }, at, by: 'user' })}\n`).join(''))
    await refreshConversations()
    await reread()
    await openConversation(tasks[0].path)
    return { ids: tasks.map((task) => task.id), doc }
  })
  const drawer = await openTasks(page)
  // Found with a second task in the drawer of a wide window, whose rows then drag.
  await expect(drawer.locator('[data-tile]').first()).toHaveAttribute('draggable', 'true')
  return { ...made, drawer }
}

/** A row of the drawer dragged to a point of the screen as a hand does: nudged so that the drag starts, then in small steps. @param {import('@playwright/test').Page} page @param {import('@playwright/test').Locator} row @param {number} x @param {number} y */
async function drag(page, row, x, y) {
  const from = /** @type {{ x: number, y: number, width: number, height: number }} */ (await row.boundingBox())
  await page.mouse.move(from.x + 12, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 24, from.y + from.height / 2, { steps: 2 })
  await page.mouse.move(x, y, { steps: 12 })
  await expect(page.locator('.dock-drop')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('.dock-drop')).toBeHidden()
}

/** A pane moved by its head, as a hand drags it, to a point of the screen. @param {import('@playwright/test').Page} page @param {import('@playwright/test').Locator} head @param {number} x @param {number} y */
async function move(page, head, x, y) {
  const from = /** @type {{ x: number, y: number, width: number, height: number }} */ (await head.boundingBox())
  await page.mouse.move(from.x + 8, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 30, from.y + from.height / 2 + 20, { steps: 3 })
  await page.mouse.move(x, y, { steps: 12 })
  await expect(page.locator('.dock-drop')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('.dock-drop')).toBeHidden()
}

/** Where an element is. @param {import('@playwright/test').Locator} locator */
const box = async (locator) => /** @type {{ x: number, y: number, width: number, height: number }} */ (await locator.boundingBox())

test('tasks and a pinned document dragged onto the screen split it, the address keeping where each one is', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  const { ids: [a, b], doc, drawer } = await seed(page)
  const here = page.locator('.here')
  const tiles = page.locator('app-tile'), tile = (/** @type {string} */ name) => page.getByRole('complementary', { name })
  const layout = async () => decodeURIComponent(new URL(page.url()).hash)

  // A task dropped near the screen's end takes half of it, beside the task.
  const screen = await box(here.locator('main'))
  await drag(page, drawer.getByRole('button', { name: 'Seed suppliers' }), 1270, screen.y + 300)
  await expect(tiles).toHaveCount(1)
  await expect(page.getByRole('complementary', { name: 'Seed suppliers' })).toBeVisible()
  await expect(tiles.locator('.msg-user')).toHaveText('Compare two seed suppliers')
  await expect(tiles.locator('.prose')).toHaveText('Supplier A is cheaper.')
  expect(await layout()).toBe(`#/c/${a}?split=row(here,${b})`)
  expect((await box(tiles)).x).toBeGreaterThan((await box(here)).x)

  // The document, dropped on that tile's lower edge, takes its lower half.
  const first = await box(tiles)
  await drag(page, drawer.getByRole('button', { name: 'Garden plan' }), first.x + first.width / 2, first.y + first.height - 20)
  await expect(tiles).toHaveCount(2)
  await expect(tile('Garden plan')).toContainText('North bed: beans.')
  expect(await layout()).toBe(`#/c/${a}?split=row(here,col(${b},${doc}))`)
  // A pane as the preview is: its head names it, has what the preview's has for it, and closes it.
  await expect(tile('Garden plan').locator('.pane-head').getByRole('button', { name: 'Save Garden plan.md' })).toBeVisible()

  // A click in the other task's tile makes it the one the box is for, there; the first takes its place.
  await tile('Seed suppliers').locator('.prose').click()
  await expect(page).toHaveURL(new RegExp(`#/c/${b}\\?`))
  expect(await layout()).toBe(`#/c/${b}?split=row(${a},col(here,${doc}))`)
  await expect(here.locator('.msg-user')).toHaveText('Compare two seed suppliers')
  await expect(here.locator('#prompt')).toBeVisible()
  await expect(tile('Garden beds').locator('.msg-user')).toHaveText('Plan the garden beds')

  // The edge between the two columns moves with the keys, its share in the address.
  await page.locator('[role="separator"][aria-orientation="vertical"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(layout).toMatch(new RegExp(`^#/c/${b}\\?split=row5[1-9]\\(${a},col\\(here,${doc.replace(/[.]/g, '\\.')}\\)\\)$`))

  // A reload lays them out again; Back goes to the first task as its screen was.
  if (!(await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value))) {
    await page.reload()
    await expect(tiles).toHaveCount(2)
    await expect(here.locator('.msg-user')).toHaveText('Compare two seed suppliers')
    await expect(tile('Garden plan')).toContainText('North bed: beans.')
  }
  await page.goBack()
  await expect.poll(layout).toBe(`#/c/${a}?split=row(here,col(${b},${doc}))`)
  await expect(here.locator('.msg-user')).toHaveText('Plan the garden beds')

  // Closed, a tile gives its room back; on a narrow window it covers the conversation as any pane does, and is beside it again on a wider one.
  await tile('Garden plan').getByRole('button', { name: 'Close' }).click()
  await expect.poll(layout).toBe(`#/c/${a}?split=row(here,${b})`)
  await page.setViewportSize({ width: 700, height: 800 })
  await expect(page.locator('html')).toHaveAttribute('data-dock', 'over')
  await expect(page.locator('app-shell')).toHaveJSProperty('inert', true)
  expect(await layout()).toBe(`#/c/${a}?split=row(here,${b})`)
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.locator('html')).toHaveAttribute('data-dock', 'beside')
  await expect(tiles).toHaveCount(1)

  // A task dropped in the middle of the box's tile opens there, the one before leaving the screen.
  const middle = await box(here)
  await drag(page, drawer.getByRole('button', { name: 'Neighbours' }), middle.x + middle.width / 2, middle.y + middle.height / 2)
  await expect(here.locator('.msg-user')).toHaveText('Draft a note to the neighbours')
  await expect(page).toHaveURL(new RegExp(`\\?split=row\\(here,${b}\\)$`))
})

test('a pinned collection dropped beside the task is its editor there, as in the preview, a change in it reaching the preview', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  const { drawer } = await seed(page)
  const screen = await box(page.locator('.here main'))
  await drag(page, drawer.getByRole('button', { name: 'Seeds' }), 1270, screen.y + 300)
  const tile = page.locator('app-tile')
  // Its editor, never the workbook the preview would draw for a file.
  await expect(tile.locator('.table-view')).toBeVisible()
  await expect(tile.locator('iframe')).toHaveCount(0)
  const name = tile.locator('.table-grid tbody tr').first().getByLabel('Name')
  await expect(name).toHaveValue('Beans')
  await name.fill('Runner beans')
  await name.press('Tab')
  await expect(name).toHaveValue('Runner beans')
  // Opened from the drawer, it is brought forward where it is, never a second time beside the task; the brain hears of it there.
  await drawer.getByRole('button', { name: 'Seeds' }).click()
  await expect(tile).toHaveAttribute('data-called', '')
  await expect(page.locator('app-preview .preview')).toHaveCount(0)
  const notes = await page.evaluate(async () => (await import('/ui/caps.js')).slots('modes').flatMap((mode) => mode.notes?.([], {}) ?? []).map((note) => note.update.text))
  expect(notes).toContainEqual(expect.stringContaining('The table Seeds'))
})

test('a document dropped beside the task is changed there, alone, and the brain hears of it; a design is, while it is the one on show', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await start(page)
  const { drawer, doc } = await seed(page)
  // Two designs, pinned, as Jean lays them out; the preview it opened them in closed.
  await page.evaluate(async () => {
    const [{ unlock, loaded }, { reread }] = await Promise.all([import('/ui/caps.js'), import('/ui/creations.js')])
    await unlock('designs')
    const designs = /** @type {any} */ (loaded.peek().get('designs')), tool = designs.tools.find((/** @type {any} */ one) => one.spec.name === 'design')
    for (const name of ['Garden party', 'Seed swap']) {
      const ctx = { signal: new AbortController().signal, meta: /** @type {any} */ ({}), progress: () => {} }
      await tool.run({ name, size: 'a5', occasion: 'a garden gathering', words: { title: name, when: 'Saturday 6 June 2026 · 3 pm', where: '12 rue des Lilas' } }, ctx)
      await designs.slots.creations.pin({ path: ctx.meta.files[0].uri }, true)
    }
    ;(await import('/ui/preview.js')).unshow(/** @type {any} */ (await import('/caps/designs/designs.js')).shown.peek().path)
    await reread()
  })
  const here = page.locator('.here'), screen = await box(here.locator('main'))

  // The document, at the screen's end: its editor, written in there.
  await drag(page, drawer.getByRole('button', { name: 'Garden plan' }), 1430, screen.y + 300)
  const written = page.getByRole('complementary', { name: 'Garden plan' })
  const words = written.getByRole('textbox')
  await expect(words).toContainText('North bed: beans.')
  await words.getByText('North bed: beans.').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Peas too.')
  await expect.poll(() => page.evaluate(async (path) => { const { app } = await import('/ui/state.js'); return app.fs.read(`${app.projectDir}/${path}`) }, doc)).toContain('North bed: beans. Peas too.')
  // Asked for from the drawer, it is brought forward where it is, never opened a second time beside the task.
  await drawer.getByRole('button', { name: 'Garden plan' }).click()
  await expect(page.locator('app-tile[data-called]')).toHaveCount(1)
  await expect(page.locator('app-preview .preview')).toHaveCount(0)
  // Each message tells the brain of each document on screen as it is.
  const notes = () => page.evaluate(async () => (await import('/ui/caps.js')).slots('modes').flatMap((mode) => mode.notes?.([], {}) ?? []).map((note) => note.update.text))
  await expect.poll(notes).toContainEqual(expect.stringContaining('North bed: beans. Peas too.'))

  // A design dropped under the document is the one on show there; another, under the task, takes that, the first showing its page.
  const document = await box(written)
  await drag(page, drawer.getByRole('button', { name: 'Garden party' }), document.x + document.width / 2, document.y + document.height - 20)
  const party = page.getByRole('complementary', { name: 'Garden party' }), swap = page.getByRole('complementary', { name: 'Seed swap' })
  await expect(party.locator('.design-stage')).toBeVisible()
  const task = await box(here)
  await drag(page, drawer.getByRole('button', { name: 'Seed swap' }), task.x + task.width / 2, task.y + task.height - 20)
  await expect(swap.locator('.design-stage')).toBeVisible()
  await expect(party.locator('.design-stage')).toHaveCount(0)
  await expect(party.locator('.design-tile-page')).toBeVisible()
  // Its page clicked, it is on show again, the other showing its own.
  await party.locator('.design-tile-page').click()
  await expect(party.locator('.design-stage')).toBeVisible()
  await expect(swap.locator('.design-stage')).toHaveCount(0)
  await expect(swap.locator('.design-tile-page')).toBeVisible()
  await expect.poll(notes).toContainEqual(expect.stringContaining('The design Garden party'))
})

test('a pinned score dropped beside the task is its sheet and its player there, as in the preview, and asked for again, its pane comes forward', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  const { drawer } = await seed(page)
  // A tune an answer holds, among the creations once Skills is on, pinned.
  await page.evaluate(async () => {
    const [{ app, refreshConversations }, { createConversation, appendRecords }, { userRecords, envelope, metaRecord }, { unlock }, creations] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js'), import('/ui/caps.js'), import('/ui/creations.js')])
    await unlock('skills')
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: 'test' })
    await appendRecords(app.fs, path, [...userRecords('A jig for the garden party', [], 'test'), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here it is.\n\n```abc\nX:1\nT:Garden jig\nM:6/8\nL:1/8\nK:D\ndfa agf|gfe fed|\n```' } }, 0), metaRecord('test', { title: 'A jig' })])
    await refreshConversations()
    await creations.reread()
    const tune = creations.all.peek().find((one) => one.kind.id === 'music')
    await tune?.kind.pin(tune, true)
    await creations.reread()
  })
  const screen = await box(page.locator('.here main'))
  await drag(page, drawer.getByRole('button', { name: 'Garden jig' }), 1270, screen.y + 300)
  const tune = page.getByRole('complementary', { name: 'Garden jig' })
  await expect(tune.locator('app-score .score-sheet svg')).toHaveCount(1)
  await expect(tune.locator('iframe')).toHaveCount(0)
  // Its name, and its row in the drawer, bring it forward where it is: never the preview.
  await tune.locator('.pane-head').getByRole('button', { name: 'Garden jig' }).click()
  await expect(page.locator('app-tile[data-called]')).toHaveCount(1)
  await expect(page.locator('app-tile[data-called]')).toHaveCount(0, { timeout: 3000 })
  await drawer.getByRole('button', { name: 'Garden jig' }).click()
  await expect(page.locator('app-tile[data-called]')).toHaveCount(1)
  await expect(page.locator('app-preview .preview')).toHaveCount(0)
})

test('a pane\'s head moves it, the preview\'s as a tile\'s: under the conversation, then in a tile\'s place, the two changing places', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  const { ids: [a, b], doc, drawer } = await seed(page)
  const layout = async () => decodeURIComponent(new URL(page.url()).hash)
  // Opened as a file is, the document is beside the conversation, where opening puts it: nothing more in the address.
  await page.evaluate((uri) => import('/ui/preview.js').then(({ preview }) => preview({ uri, name: 'Garden plan.md', title: 'Garden plan', mimeType: 'text/markdown' })), doc)
  const preview = page.locator('app-preview')
  await expect(preview.locator('#doc')).toContainText('North bed: beans.')
  expect(await layout()).toBe(`#/c/${a}?preview=${doc}`)
  // Its head, dragged under the conversation, puts it there.
  const here = await box(page.locator('.here'))
  await move(page, preview.locator('.pane-head h2'), here.x + here.width / 2, here.y + here.height - 20)
  await expect.poll(layout).toBe(`#/c/${a}?preview=${doc}&split=col(here,preview)`)
  expect((await box(preview)).y).toBeGreaterThan(here.y + 100)
  // A task beside the conversation from its menu, then the preview dropped in the middle of it: the two change places.
  const row = drawer.locator(`li:has([data-tile="${b}"])`)
  await row.hover()
  await row.locator('button[popovertarget]').click()
  await row.getByRole('button', { name: 'Open side by side' }).click()
  await expect.poll(layout).toBe(`#/c/${a}?preview=${doc}&split=col(row(here,${b}),preview)`)
  const tile = await box(page.locator('app-tile'))
  await move(page, preview.locator('.pane-head h2'), tile.x + tile.width / 2, tile.y + tile.height / 2)
  await expect.poll(layout).toBe(`#/c/${a}?preview=${doc}&split=col(row(here,preview),${b})`)
  // The conversation's middle takes no pane.
  const talk = await box(page.locator('.here'))
  await page.mouse.move(talk.x + talk.width / 2, talk.y + 8)
  expect(await page.evaluate(([x, y]) => import('/ui/dock.js').then(({ aim }) => aim(x, y, 'preview')), [talk.x + talk.width / 2, talk.y + talk.height / 2])).toBeNull()
})

for (const [lang, label] of [['ar', 'فتح جنبًا إلى جنب'], ['ja', '並べて開く']]) {
  test(`a task's menu opens it beside the task, at the line's end, in ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await start(page, lang)
    const { ids: [, b], drawer } = await seed(page)
    const row = drawer.locator(`li:has([data-tile="${b}"])`)
    await row.hover()
    await row.locator('button[popovertarget]').click()
    await row.getByRole('button', { name: label }).click()
    const tile = page.locator('app-tile')
    await expect(tile.locator('.msg-user')).toHaveText('Compare two seed suppliers')
    const [beside, here] = await Promise.all([box(tile), box(page.locator('.here'))])
    // Right to left, the line ends on the left.
    expect(lang === 'ar' ? beside.x < here.x : beside.x > here.x).toBe(true)
    await expect(tile.getByRole('button', { name: lang === 'ar' ? 'إغلاق' : '閉じる' })).toBeVisible()
  })
}
