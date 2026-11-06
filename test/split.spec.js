// Panes of the dock (D635, D640, D684): a task or a pinned creation dragged from the drawer onto the screen takes a pane's place or half
// of a part, a box showing where, and the address keeps the layout; another task's pane shows it whole, its box still, and a click or
// the keyboard in it makes it the one the box is for, where it is, each read where it was, the edge between two moves with the keys, a reload and Back lay them out again, and a narrow window has them over the
// conversation. A pane's head moves it, a file's as a task's. A click opens a file for a look, in a pane the next click gives the next
// until it is kept, which goes and comes back with its task. A collection's or a document's pane is its editor, the brain hearing of
// each one on screen, and opening it again brings its pane forward; a design's is while it is the one on show, one at a time. Without
// dragging, a task's menu opens it beside, at the line's end: on the left in Arabic, on the right in Japanese. The pane that has the
// keyboard says so by its head's line alone, whatever it shows. A card of the Creations page drags onto the screen as a drawer's row
// does, but over a document's text, which takes it; its menu opens it beside too. Dragged, a card is its own picture, as large as it.
import { test, expect } from '@playwright/test'
import { start, openTasks, addProject, enterProject, BRAIN_URL } from './helpers.js'

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
    // A second apart: the same time would leave the drawer's two pinned rows free to swap as each kind comes in, under a drag.
    const at = new Date().toISOString(), later = new Date(Date.now() + 1000).toISOString(), doc = `documents/${ulid()}-plan.md`, folder = 'collections/01K85Z1T00000000000000000S-seeds'
    await app.fs.write(`${app.projectDir}/${doc}`, `---\nformat: 1\nname: Garden plan\nauthor: user\ncreated: ${at}\nchanged: ${at}\npinned: true\n---\n# Garden plan\n\nNorth bed: beans.\n`)
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000S', name: 'Seeds', author: 'user', created: at, changed: later, pinned: true,
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'packets', name: 'Packets', type: 'number' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, ['Beans', 'Tomatoes'].map((name, i) => `${JSON.stringify({ row: `01K8000000000000000000000${i}`, set: { name, packets: i + 2 }, at, by: 'user' })}\n`).join(''))
    await refreshConversations()
    await reread()
    await openConversation(tasks[0].path)
    return { ids: tasks.map((task) => task.id), doc, folder }
  })
  const drawer = await openTasks(page)
  // Found with a second task in the drawer of a wide window, whose rows then drag.
  await expect(drawer.locator('[data-tile]').first()).toHaveAttribute('draggable', 'true')
  return { ...made, drawer }
}

/**
 * A row of the drawer dragged to a point of the screen as a hand does: nudged so that the drag starts, then in small steps; pressed near
 * its start, halfway down, or where `at` says. @param {import('@playwright/test').Page} page @param {import('@playwright/test').Locator} row
 * @param {number} x @param {number} y @param {{ x: number, y: number }} [at]
 */
async function drag(page, row, x, y, at) {
  const from = /** @type {{ x: number, y: number, width: number, height: number }} */ (await row.boundingBox()), press = at ?? { x: 12, y: from.height / 2 }
  await page.mouse.move(from.x + press.x, from.y + press.y)
  await page.mouse.down()
  await page.mouse.move(from.x + press.x + 12, from.y + press.y, { steps: 2 })
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
  const tiles = page.locator('#dock > :is(app-tile, app-preview):not([hidden])'), tile = (/** @type {string} */ name) => page.getByRole('complementary', { name })
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
  // A pane as anything opened is: its head names it, has what its kind adds there, and closes it.
  await expect(tile('Garden plan').locator('.pane-head').getByRole('button', { name: 'Download or print' })).toBeVisible()

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

test('a pinned collection dropped beside the task is its editor there, and opened again, its pane comes forward', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  const { drawer } = await seed(page)
  const screen = await box(page.locator('.here main'))
  await drag(page, drawer.getByRole('button', { name: 'Seeds' }), 1270, screen.y + 300)
  const tile = page.locator('app-preview')
  // Its editor, never the workbook a file of it would be.
  await expect(tile.locator('.table-view')).toBeVisible()
  await expect(tile.locator('iframe')).toHaveCount(0)
  const name = tile.locator('.table-grid tbody tr').first().getByTitle('Name')
  await expect(name).toHaveValue('Beans')
  await name.fill('Runner beans')
  await name.press('Tab')
  await expect(name).toHaveValue('Runner beans')
  // Opened from the drawer, it is brought forward where it is, never a second time beside the task; the brain hears of it there.
  await drawer.getByRole('button', { name: 'Seeds' }).click()
  await expect(tile).toHaveAttribute('data-called', '')
  await expect(page.locator('app-preview')).toHaveCount(1)
  // Once its editor is drawn again, as a change of the user's has it.
  const notes = () => page.evaluate(async () => (await import('/ui/caps.js')).slots('modes').flatMap((mode) => mode.notes?.([], {}) ?? []).map((note) => note.update.text))
  await expect.poll(notes).toContainEqual(expect.stringContaining('The table Seeds'))
})

test('a document dropped beside the task is changed there, alone, and the brain hears of it; a design is, while it is the one on show', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await start(page)
  const { drawer, doc } = await seed(page)
  // Two designs, pinned, as Jean lays them out; the pane it opened them in closed.
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
  await expect(page.locator('app-preview[data-called]')).toHaveCount(1)
  await expect(page.locator('app-preview')).toHaveCount(1)
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

test('a pinned score dropped beside the task is its sheet and its player there, and asked for again, its pane comes forward', async ({ page }) => {
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
  // Its row in the drawer brings it forward where it is: never a second time.
  await drawer.getByRole('button', { name: 'Garden jig' }).click()
  await expect(page.locator('app-preview[data-called]')).toHaveCount(1)
  await expect(page.locator('app-preview')).toHaveCount(1)
})

test('a pane\'s head moves it, a document\'s as a task\'s: under the conversation, then in a task\'s place, the two changing places', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  const { ids: [a, b], doc, drawer } = await seed(page)
  const layout = async () => decodeURIComponent(new URL(page.url()).hash)
  // Opened as a file is, the document is beside the conversation, where opening puts it, its side as wide as opening makes it.
  await page.evaluate((uri) => import('/ui/preview.js').then(({ preview }) => preview({ uri, name: 'Garden plan.md', title: 'Garden plan', mimeType: 'text/markdown' })), doc)
  const preview = page.locator('app-preview')
  await expect(preview.locator('#doc')).toContainText('North bed: beans.')
  expect(await layout()).toBe(`#/c/${a}?split=row(here,${doc})`)
  // Its head, dragged under the conversation, puts it there.
  const here = await box(page.locator('.here'))
  await move(page, preview.locator('.pane-head h2'), here.x + here.width / 2, here.y + here.height - 20)
  await expect.poll(layout).toBe(`#/c/${a}?split=col(here,${doc})`)
  expect((await box(preview)).y).toBeGreaterThan(here.y + 100)
  // A task beside the conversation from its menu, then the document's pane dropped in the middle of it: the two change places.
  const row = drawer.locator(`li:has([data-tile="${b}"])`)
  await row.hover()
  await row.locator('button[popovertarget]').click()
  await row.getByRole('button', { name: 'Open side by side' }).click()
  await expect.poll(layout).toBe(`#/c/${a}?split=col(row(here,${b}),${doc})`)
  const tile = await box(page.locator('app-tile'))
  await move(page, preview.locator('.pane-head h2'), tile.x + tile.width / 2, tile.y + tile.height / 2)
  await expect.poll(layout).toBe(`#/c/${a}?split=col(row(here,${doc}),${b})`)
  // The conversation's middle takes no pane.
  const talk = await box(page.locator('.here'))
  await page.mouse.move(talk.x + talk.width / 2, talk.y + 8)
  expect(await page.evaluate(([x, y, uri]) => import('/ui/dock.js').then(({ aim }) => aim(Number(x), Number(y), String(uri))), [talk.x + talk.width / 2, talk.y + talk.height / 2, doc])).toBeNull()
})

test('the pane that has the keyboard says so by its head\'s line alone, a document\'s as the browser\'s, and none while the box has it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  const { doc } = await seed(page)
  await page.evaluate((uri) => import('/ui/preview.js').then(({ preview }) => preview({ uri, name: 'Garden plan.md', title: 'Garden plan', mimeType: 'text/markdown' })), doc)
  await page.evaluate(() => import('/ui/caps.js').then(({ unlock }) => unlock('browser')))
  await page.keyboard.press('ControlOrMeta+Shift+KeyB')
  const written = page.locator('app-preview .pane'), browser = page.locator('app-browser .browser'), words = written.getByRole('textbox')
  await expect(words).toContainText('North bed: beans.')
  await expect(browser).toBeVisible()
  /** Which panes' heads draw their line thicker, and how the document's text shows the keyboard: no ring, no line of its own. */
  const marks = () => page.evaluate(() => ({
    heads: [...document.querySelectorAll('.pane')].filter((pane) => getComputedStyle(/** @type {Element} */ (pane.querySelector(':scope > .pane-head'))).boxShadow !== 'none').map((pane) => pane.ariaLabel),
    text: ((style) => [style.outlineStyle, style.borderInlineStartStyle])(getComputedStyle(/** @type {Element} */ (document.querySelector('.doc')))),
  }))
  await words.getByText('North bed: beans.').click()
  await expect.poll(marks).toEqual({ heads: ['Garden plan'], text: ['none', 'none'] })
  // In the browser, its address, then the page it frames, which :focus-within never counts.
  const address = browser.locator('.browser-bar input')
  await address.fill(BRAIN_URL.replace(/\/v1$/, '/site/bakery.html'))
  await address.press('Enter')
  await expect(page.frameLocator('.browser-host').frameLocator('iframe').locator('h1')).toHaveText('The bakery')
  await address.focus()
  await expect.poll(marks).toEqual({ heads: ['Browser'], text: ['none', 'none'] })
  await words.getByText('North bed: beans.').click()
  await expect.poll(marks).toEqual({ heads: ['Garden plan'], text: ['none', 'none'] })
  const framed = await box(browser.locator('.browser-host'))
  await page.mouse.click(framed.x + framed.width / 2, framed.y + framed.height / 2)
  await expect.poll(marks).toEqual({ heads: ['Browser'], text: ['none', 'none'] })
  await page.locator('#prompt').focus()
  await expect.poll(marks).toEqual({ heads: [], text: ['none', 'none'] })
})

test('a click opens a pane for a look, which the next click gives the next, until it is kept; one already on screen comes forward', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  const { ids: [a], doc, drawer } = await seed(page)
  const layout = async () => decodeURIComponent(new URL(page.url()).hash)
  const budget = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js'), at = new Date().toISOString(), path = 'documents/01K85Z1T00000000000000000D-budget.md'
    await app.fs.write(`${app.projectDir}/${path}`, `---\nformat: 1\nname: Budget\nauthor: user\ncreated: ${at}\nchanged: ${at}\n---\n# Budget\n\nSeeds: 30.\n`)
    return path
  })
  /** As a click on a file does. @param {string} uri @param {string} title */
  const open = (uri, title) => page.evaluate(([one, name]) => import('/ui/preview.js').then(({ preview }) => preview({ uri: one, name: `${name}.md`, title: name, mimeType: 'text/markdown' })), [uri, title])
  const panes = page.locator('app-preview')
  await open(doc, 'Garden plan')
  await expect(panes).toHaveCount(1)
  await expect(panes).toHaveAttribute('data-look', '')
  // The next click gives the same pane the next, where it was.
  await open(budget, 'Budget')
  await expect(panes).toHaveCount(1)
  await expect(panes.locator('#doc')).toContainText('Seeds: 30.')
  expect(await layout()).toBe(`#/c/${a}?split=row(here,${budget})`)
  // Double-clicked on its head, it is kept: the next click opens a pane of its own, under it.
  await panes.locator('.pane-head h2').dblclick()
  await expect(panes).not.toHaveAttribute('data-look', '')
  await open(doc, 'Garden plan')
  await expect(panes).toHaveCount(2)
  expect(await layout()).toBe(`#/c/${a}?split=row(here,col(${budget},${doc}))`)
  // Written in, a look is kept too; one on screen, asked for again, comes forward where it is.
  await panes.nth(1).locator('.doc p').first().click()
  await page.keyboard.type(' Peas.')
  await expect(panes.nth(1)).not.toHaveAttribute('data-look', '')
  await open(budget, 'Budget')
  await expect(panes).toHaveCount(2)
  await expect(page.locator('app-preview[data-called]')).toHaveCount(1)
  // A look goes with its task and comes back with it, the kept staying on screen; another project closes every pane.
  const notes = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js'), at = new Date().toISOString(), path = 'documents/01K85Z1T00000000000000000N-notes.md'
    await app.fs.write(`${app.projectDir}/${path}`, `---\nformat: 1\nname: Notes\nauthor: user\ncreated: ${at}\nchanged: ${at}\n---\n# Notes\n\nSow in March.\n`)
    return path
  })
  await open(notes, 'Notes')
  await expect(panes).toHaveCount(3)
  await drawer.getByRole('button', { name: 'Seed suppliers' }).click()
  await expect(panes).toHaveCount(2)
  await drawer.getByRole('button', { name: 'Garden beds' }).click()
  await expect(page.locator('app-preview[data-look] .doc')).toContainText('Sow in March.')
  await addProject(page, 'Orchard')
  await enterProject(page, 'Orchard')
  await expect(panes).toHaveCount(0)
})

test('a card of the Creations page dragged onto the screen opens there, beside the page; let go over a document\'s text, it goes in it; its menu opens it beside', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  const { doc, folder, drawer } = await seed(page)
  await drawer.getByRole('button', { name: 'Creations', exact: true }).click()
  const card = (/** @type {string} */ path) => page.locator(`app-creations .creation[data-path="${path}"]`)
  const tiles = page.locator('#dock > app-preview:not([hidden])'), tile = (/** @type {string} */ name) => page.getByRole('complementary', { name })
  await expect(card(doc)).toHaveAttribute('data-tile', doc)

  // Dropped near the screen's end, the document takes half of it, beside the page, which stays; pressed near the card's top, which the
  // message box floating over the page's foot doesn't cover, and outside its button, from which WebKit starts no drag.
  const screen = await box(page.locator('.here main'))
  await drag(page, card(doc), 1270, screen.y + 300, { x: 40, y: 30 })
  await expect(tiles).toHaveCount(1)
  await expect(tile('Garden plan')).toContainText('North bed: beans.')
  await expect(page.locator('app-creations')).toBeVisible()
  expect((await box(tile('Garden plan'))).x).toBeGreaterThan((await box(page.locator('.here'))).x)
  await expect.poll(async () => decodeURIComponent(new URL(page.url()).hash)).toMatch(new RegExp(`[?&]split=row\\(here,${doc.replace(/[.]/g, '\\.')}\\)`))

  // Let go over the document's text, near its pane's end, the collection goes in the document where it is, as a drawn view: no pane of its
  // own. The card's own dragstart fills what the drop brings, as a second drag of Playwright's mouse, right after one, sometimes never starts.
  await page.evaluate((path) => {
    const data = new DataTransfer(), source = /** @type {Element} */ (document.querySelector(`app-creations .creation[data-path="${path}"]`))
    const line = /** @type {Element} */ (document.querySelector('app-preview [contenteditable="true"] p:last-of-type')).getBoundingClientRect()
    source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true }))
    const at = { dataTransfer: data, bubbles: true, cancelable: true, clientX: line.right - 4, clientY: line.top + line.height / 2 }
    for (const type of ['dragenter', 'dragover', 'drop']) document.elementFromPoint(at.clientX, at.clientY)?.dispatchEvent(new DragEvent(type, at))
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true }))
  }, folder)
  await expect(tile('Garden plan').locator('.drawn-form app-table').getByTitle('Collection name')).toHaveValue('Seeds')
  await expect(tiles).toHaveCount(1)
  await expect(page.locator('.dock-drop')).toBeHidden()

  // Without dragging, its menu opens it beside the task.
  await card(folder).locator('.creation-more').click()
  await page.locator('#creation-menu').getByRole('button', { name: 'Open side by side' }).click()
  await expect(tiles).toHaveCount(2)
  await expect(tile('Seeds')).toBeVisible()
})

test('a card dragged is its own picture, no wider or taller than itself whatever it holds, nothing behind its corners', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  // A collection wider than its card, and a document longer than its preview.
  await page.evaluate(async () => {
    const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')]), at = new Date().toISOString(), folder = 'collections/01K85Z1T00000000000000000W-wide'
    const columns = ['Name', 'Packets', 'Supplier', 'Sown on', 'Bed', 'Water'].map((name, i) => ({ id: `c${i}`, name, type: 'text' }))
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000W', name: 'Wide seeds', author: 'user', created: at, changed: at, properties: columns, views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, [0, 1, 2, 3, 4, 5].map((i) => `${JSON.stringify({ row: `01K8000000000000000000000${i}`, set: Object.fromEntries(columns.map((c) => [c.id, `${c.name} ${i}`])), at, by: 'user' })}\n`).join(''))
    await app.fs.write(`${app.projectDir}/documents/01JAQXDOC0000000000000000L-long.md`, `---\nformat: 1\nname: Long notes\nauthor: user\n---\n# Long notes\n\n${'Beans and tomatoes in the north bed, watered at dawn. '.repeat(12)}\n`)
    await Promise.all([unlock('tables'), unlock('documents')])
    await (await import('/ui/creations.js')).reread()
  })
  await (await openTasks(page)).getByRole('button', { name: 'Creations', exact: true }).click()
  await expect(page.locator('app-creations .creation table')).toBeVisible()
  await expect(page.locator('app-creations .creation')).toHaveCount(2)
  for (const card of await page.locator('app-creations .creation').all()) {
    // Under the pointer, as a drag starts there, its preview zooms, past the card. As the picture is taken, once its dragstart has run, all
    // that has a layer of its own (moved or placed), which the picture takes whole, clipped or not, is inside the card, a layer of its own.
    await card.hover({ position: { x: 40, y: 30 } })
    const lifted = await card.evaluate((element) => new Promise((resolve) => {
      document.addEventListener('dragstart', () => {
        const box = element.getBoundingClientRect(), past = (/** @type {DOMRect} */ at) => at.left < box.left - 0.5 || at.top < box.top - 0.5 || at.right > box.right + 0.5 || at.bottom > box.bottom + 0.5
        resolve({ past: [...element.querySelectorAll('*')].filter((one) => { const style = getComputedStyle(one); return (style.transform !== 'none' || style.position !== 'static') && past(one.getBoundingClientRect()) }).map((one) => one.localName),
          isolation: getComputedStyle(element).isolation })
      }, { once: true })
      element.dispatchEvent(new DragEvent('dragstart', { dataTransfer: new DataTransfer(), bubbles: true }))
    }))
    expect(lifted).toEqual({ past: [], isolation: 'isolate' })
    // Let go, it is as it was.
    await card.dispatchEvent('dragend')
    await expect(card).not.toHaveAttribute('data-lifted')
  }
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
    // Whole, in its words, its box still at its foot, as the one the box is for has it.
    await expect(tile.locator('.msg-actions.is-request')).toHaveCount(1)
    await expect(tile.locator('app-composer[for] textarea')).toHaveAttribute('placeholder', /** @type {string} */ (await page.locator('#prompt').getAttribute('placeholder')))
    await expect(tile.locator('app-composer[for] .ai-note')).toHaveText(await page.locator('#ai-note').innerText())
  })

  test(`a card's menu on the Creations page opens it beside the page, at the line's end, in ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await start(page, lang)
    const { doc, drawer } = await seed(page)
    // The drawer's place for them, by its glyph, whatever its words.
    await drawer.locator('button.place:has(.creations-shapes)').click()
    const card = page.locator(`app-creations .creation[data-path="${doc}"]`)
    await card.locator('.creation-more').click()
    await page.locator('#creation-menu').getByRole('button', { name: label }).click()
    const pane = page.locator('#dock > app-preview:not([hidden])')
    await expect(pane).toContainText('North bed: beans.')
    const [beside, here] = await Promise.all([box(pane), box(page.locator('.here'))])
    // Right to left, the line ends on the left.
    expect(lang === 'ar' ? beside.x < here.x : beside.x > here.x).toBe(true)
    await expect(page.locator('app-creations')).toBeVisible()
  })
}

test('another task\'s pane shows it whole, its box still; a click or the keyboard in it makes it the one the box is for, there, each read where it was', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  const { ids: [a, b] } = await seed(page)
  // The second task's answer, long enough to be read from its top.
  await page.evaluate(async (id) => {
    const [{ app, refreshConversations }, { appendRecords }, { userRecords, envelope }] = await Promise.all([import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    const text = Array.from({ length: 60 }, (_, i) => `Bed ${i + 1}: beans.`).join('\n\n')
    await appendRecords(app.fs, app.conversations.value.find((task) => task.id === id)?.path ?? '', [...userRecords('List every bed', [], 'test'), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }, 0)])
    await refreshConversations()
  }, b)
  await page.locator('#prompt').fill('A note on the beds')
  await page.evaluate((tree) => import('/ui/dock.js').then(({ layout }) => import('/ui/tree.js').then(({ parse }) => { layout.value = parse(tree) })), `row(here,${b})`)
  const tile = page.locator('app-tile'), here = page.locator('.here'), prompt = page.locator('#prompt'), still = tile.locator('app-composer[for] textarea')
  /** How far a part is from its end. @param {import('@playwright/test').Locator} part */
  const left = (part) => part.evaluate((box) => box.scrollHeight - box.clientHeight - box.scrollTop)

  // As the task the box is for shows: each request with what it can do, each answer, read from its end, and its box, still: one box has the keys.
  await expect(tile.locator('.msg-user')).toHaveText(['Compare two seed suppliers', 'List every bed'])
  await expect(tile.locator('.msg-actions.is-request')).toHaveCount(2)
  await expect(tile.locator('.prose').last()).toContainText('Bed 60: beans.')
  await expect.poll(() => left(tile.locator('.view'))).toBeLessThan(2)
  await expect(tile.locator('app-composer[for] form')).toHaveAttribute('inert', '')
  await expect(page.locator('textarea#prompt')).toHaveCount(1)

  // Read from its top, then clicked: the one the box is for, where it is, read where it was; the box, with its words, has the keys.
  await tile.locator('.view').hover()
  await page.mouse.wheel(0, -50_000)
  await expect.poll(() => tile.locator('.view').evaluate((view) => view.scrollTop)).toBe(0)
  const was = await box(tile)
  await tile.locator('.prose').first().click()
  await expect(page).toHaveURL(new RegExp(`#/c/${b}\\?split=row\\(${a},here\\)$`))
  await expect(here.locator('.msg-user')).toHaveText(['Compare two seed suppliers', 'List every bed'])
  expect((await box(here)).x).toBe(was.x)
  expect(await left(here)).toBeGreaterThan(400)
  await expect(prompt).toBeFocused()
  await expect(prompt).toHaveValue('')
  await expect(still).toHaveValue('A note on the beds')
  await page.keyboard.type('Which bed first?')
  await expect(prompt).toHaveValue('Which bed first?')
  await expect(still).toHaveValue('A note on the beds')

  // The keyboard coming into the other one does so too, and goes on from there; the one it leaves keeps where it was read.
  await tile.locator('.tile-name').focus()
  for (let i = 0; i < 4 && !(await page.evaluate(() => Boolean(document.activeElement?.closest('.here')))); i++) await page.keyboard.press('Tab')
  await expect(here.locator('.msg-user')).toBeFocused()
  await expect(page).toHaveURL(new RegExp(`#/c/${a}\\?split=row\\(here,${b}\\)$`))
  await expect(prompt).toHaveValue('A note on the beds')
  await expect(still).toHaveValue('Which bed first?')
  expect(await left(tile.locator('.view'))).toBeGreaterThan(400)
})
