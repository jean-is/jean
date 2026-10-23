// Tables you keep (D491), in Chromium and WebKit: offered by a brain that makes them right, then made from a
// request and filled by the brain, beside the conversation; Jean's changes marked, accepted or rejected (D505); a cell changed
// by hand; a row the brain changes from what the user tells it; the board, a card moved by its own step; the
// table downloaded as a workbook; and found again from another task with @. Its heads stay on top, each opening its column's
// menu: renamed, made another kind, the rows sorted, a column inserted or deleted; a row moved by its handle (D547). A brain on this computer, which
// doesn't make tables right, has none of it. In Arabic and Japanese, the view reads as its language does.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, turnOn, closeSettings, openTasks, BRAIN_URL } from './helpers.js'

/** A plan's brain, Claude Code through the bridge, which the fake brain answers for: not on this computer, so it passes. @param {import('@playwright/test').Page} page */
const planBrain = (page) => page.evaluate((baseURL) => import('/ui/brains.js').then(({ addBrain }) => addBrain({ id: 'claude', provider: 'claudecode', api: 'openai', baseURL, model: 'haiku' })), BRAIN_URL)

/** The table on show: its place, and its changes, as the file holds them. @param {import('@playwright/test').Page} page */
const changes = (page) => page.evaluate(async () => {
  const [{ shown }, { app }] = await Promise.all([import('/caps/tables/tables.js'), import('/ui/state.js')])
  const one = shown.value
  return one ? (await app.fs.read(`${one.dir}/${one.folder}/changes.jsonl`) ?? '').trim().split('\n').map((line) => JSON.parse(line)) : []
})

test('a table Jean keeps: offered, made from a request and filled, its changes accepted or rejected, a cell changed by hand, a board, a workbook, and found again with @', async ({ page }) => {
  await start(page)
  await planBrain(page)
  await ask(page, 'Keep track of my job applications: Atelier Lune, Brightwater and Kōsha Studio')
  // Tables isn't found yet: the brain offers it in its answer, which waits for the user.
  const offer = page.locator('.msg-jean .approval')
  await expect(offer).toContainText('Keep track of this in a collection beside the conversation?')
  await offer.getByRole('button', { name: 'Turn it on' }).click()
  await answered(page)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Done: the table is beside the conversation.')

  // Beside the conversation, named as the workbook it downloads as; Jean's 11 cells marked, to keep or undo.
  await expect(page.locator('app-preview .pane-head h2')).toHaveText('Job applications.xlsx')
  const rows = page.locator('.table-grid tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Company', 'Role', 'Status', 'Applied on'])
  await expect(rows.nth(0).getByLabel('Company')).toHaveValue('Atelier Lune')
  await expect(rows.nth(2).getByLabel('Status')).toHaveValue('To apply')
  await expect(rows.nth(0).getByLabel('Applied on')).toHaveValue('2026-10-18')
  const review = page.getByRole('region', { name: 'Suggested changes' })
  await expect(review).toContainText('11 changes to review')
  await expect(page.locator('.table-grid td.is-jean')).toHaveCount(11)
  await review.getByRole('button', { name: 'Accept all' }).click()
  await expect(review).toHaveCount(0)
  await expect(page.locator('.table-grid .is-jean')).toHaveCount(0)

  // A cell changed by hand is the user's change, after Jean's.
  await rows.nth(1).getByLabel('Role').fill('UX lead, remote')
  await rows.nth(1).getByLabel('Role').press('Tab')
  await expect.poll(async () => (await changes(page)).at(-1)).toMatchObject({ by: 'user', set: { role: 'UX lead, remote' } })

  // Told of an interview, the brain reads the rows and moves that one on: marked, then undone.
  await page.locator('#prompt').fill('Atelier Lune invited me to an interview')
  await page.locator('#prompt').press('Enter')
  await answered(page, 2)
  await expect(rows.nth(0).getByLabel('Status')).toHaveValue('Interview')
  await expect(review).toContainText('1 change to review')
  await expect(page.locator('.table-grid td.is-jean')).toHaveCount(1)
  expect((await changes(page)).at(-1)).toMatchObject({ by: 'jean', set: { status: 'Interview' }, why: 'the email of 23 October' })
  await review.getByRole('button', { name: 'Reject all' }).click()
  await expect(rows.nth(0).getByLabel('Status')).toHaveValue('Applied')
  await expect(review).toHaveCount(0)

  // The board: a lane for each step, in order, each card moved by its own step.
  await page.locator('.table-modes').getByRole('button', { name: 'Board' }).click()
  const lanes = page.locator('.table-lane')
  await expect(lanes.locator('h3 > span[dir]')).toHaveText(['To apply', 'Applied', 'Interview', 'Offer'])
  await expect(lanes.nth(1).locator('.table-card')).toHaveCount(2)
  await lanes.nth(0).locator('.table-card').getByLabel('Status').selectOption('Applied')
  await expect(lanes.nth(1).locator('.table-card')).toHaveCount(3)
  await expect(lanes.nth(0).locator('.table-card')).toHaveCount(0)

  // The pane's Save gives the table as a workbook.
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('app-preview .pane-head').getByRole('button', { name: 'Save Job applications.xlsx' }).click()])
  expect(download.suggestedFilename()).toBe('Job applications.xlsx')

  // From another task, @ offers the project's tables by name, and one picked opens beside the conversation.
  await page.locator('.wordmark').click()
  await expect(page.locator('.hero-question')).toBeVisible()
  const box = page.locator('#prompt')
  await box.pressSequentially('Look at @job')
  await expect(page.locator('#complete .complete-heading').first()).toHaveText('Creations')
  await expect(page.locator('#complete [aria-selected="true"]')).toContainText('Job applications')
  await box.press('Enter')
  await expect(box).toHaveValue('Look at @Job applications ')
  await expect(page.locator('app-preview .pane-head h2')).toHaveText('Job applications.xlsx')
  await expect(page.locator('.table-grid tbody tr')).toHaveCount(3)
  // Its card among the creations shows its heads and first rows (D497).
  await (await openTasks(page)).getByRole('button', { name: 'Creations', exact: true }).click()
  const card = page.locator('app-creations .creation', { hasText: 'Job applications' })
  await expect(card.locator('.creation-preview th')).toHaveText(['Company', 'Role', 'Status', 'Applied on'])
  await expect(card.locator('.creation-preview tr').nth(1).locator('td').first()).toHaveText('Atelier Lune')
})

test('a brain on this computer neither gets the table tools nor offers Tables: it says it can’t keep tables yet', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Collections')
  await closeSettings(page)
  await ask(page, 'Keep track of my job applications: Atelier Lune')
  await answered(page)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('I can’t keep tables with this brain yet.')
  await expect(page.locator('.msg-jean .approval')).toHaveCount(0)
  await expect(page.locator('.table-grid')).toHaveCount(0)
  // Its prompt names none of them.
  const prompt = await page.evaluate(async () => JSON.stringify((await import('/ui/state.js')).app.current.value?.records[0]))
  expect(prompt).not.toContain('table_create')
})

for (const [lang, table, board, review] of [['ar', 'جدول', 'لوحة', 'تغيير واحد للمراجعة'], ['ja', '表', 'ボード', '確認する変更：1 件']]) {
  test(`a table in ${lang}: its view mirrored where the language writes right to left, its words the language's`, async ({ page }) => {
    await start(page, lang)
    await page.evaluate(async () => {
      const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
      await unlock('tables')
      const folder = 'collections/01K85Z1T00000000000000000A-jobs'
      const at = (/** @type {number} */ minute) => `2026-10-21T09:0${minute}:00.000Z`
      await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000A', name: 'وظائف', author: 'jean', created: at(0), changed: at(0), kept: at(1),
        properties: [{ id: 'company', name: 'الشركة', type: 'text' }, { id: 'status', name: 'الحالة', type: 'status', options: [{ name: 'قدّمت', group: 'todo' }, { name: 'مقابلة', group: 'doing' }, { name: 'عرض', group: 'done' }] }],
        views: [{ id: 'table', type: 'table' }, { id: 'board', type: 'board', group: 'status' }] }))
      await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, [
        { row: '01K80000000000000000000001', set: { company: 'أطلس', status: 'قدّمت' }, at: at(1), by: 'jean' },
        { row: '01K80000000000000000000001', set: { status: 'مقابلة' }, at: at(2), by: 'jean' },
      ].map((line) => `${JSON.stringify(line)}\n`).join(''))
      ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'وظائف.xlsx' })
    })
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    await expect(page.locator('.table-modes button')).toHaveText([table, board])
    await expect(page.locator('.table-view .review')).toContainText(review)
    await expect(page.locator('.table-grid tbody tr').first().getByLabel('الحالة')).toHaveValue('مقابلة')
    // The table starts at the pane's start edge, the right one in Arabic.
    const [view, grid] = await Promise.all(['.table-view', '.table-grid'].map((selector) => page.locator(selector).boundingBox()))
    if (lang === 'ar') expect(Math.abs((view?.x ?? 0) + (view?.width ?? 0) - (grid?.x ?? 0) - (grid?.width ?? 0))).toBeLessThan(4)
    else expect(Math.abs((view?.x ?? 0) - (grid?.x ?? 0))).toBeLessThan(4)
  })
}

test('a collection is pinned, renamed, duplicated with its rows and deleted from the Creations page (D544)', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const { unlock } = await import('/ui/caps.js')
    await unlock('tables')
    const tables = await import('/caps/tables/tables.js')
    const one = await tables.load(await tables.blank())
    if (one) await tables.change(one, [{ set: { [one.table.properties[0].id]: 'Lisbon' } }], 'user')
  })
  /** The project's collections: each one's name, whether it is pinned, and its rows' first cells, in any order (two rows made in one millisecond may swap in a copy). */
  const kept = () => page.evaluate(async () => {
    const tables = await import('/caps/tables/tables.js')
    return Promise.all((await tables.kept()).map(async ({ path }) => ((one) => one && { name: one.table.name, pinned: one.table.pinned ?? false, rows: one.rows.map((row) => String(row.cells[one.table.properties[0].id] ?? '')).sort() })(await tables.load(path))))
  })
  const tasks = await openTasks(page)
  await tasks.getByRole('button', { name: 'Creations', exact: true }).click()
  const creations = page.locator('app-creations'), names = creations.locator('.creation-open')
  // One kind here: no kinds to pick, and one card to start another.
  await expect(creations.locator('.creations-kinds')).toHaveCount(0)
  await expect(creations.locator('.creation-start b')).toHaveText(['New collection'])
  const menu = async (/** @type {string} */ name) => {
    const card = creations.locator('.creation').filter({ hasText: name })
    await card.hover()
    await card.getByRole('button', { name: 'More options' }).click()
    return creations.locator('.task-menu:popover-open')
  }
  await (await menu('New collection')).getByRole('button', { name: 'Rename' }).click()
  await page.keyboard.type('Trips')
  await page.keyboard.press('Enter')
  await expect(names).toHaveText(['Trips'])
  await (await menu('Trips')).getByRole('button', { name: 'Pin' }).click()
  await (await menu('Trips')).getByRole('button', { name: 'Duplicate' }).click()
  await expect(creations.locator('.creation-rename')).toHaveValue('Trips (copy)')
  await page.keyboard.press('Enter')
  await expect.poll(kept).toEqual([{ name: 'Trips (copy)', pinned: false, rows: ['', 'Lisbon'] }, { name: 'Trips', pinned: true, rows: ['', 'Lisbon'] }])
  await expect(names).toHaveText(['Trips', 'Trips (copy)'])
  await (await menu('Trips (copy)')).getByRole('button', { name: 'Delete' }).click()
  await expect(names).toHaveText(['Trips'])
  await expect.poll(async () => (await kept()).map((one) => one?.name), { timeout: 8000 }).toEqual(['Trips'])
})

test('a collection’s heads stay on top, show their kind and open a menu to rename, change the kind, sort, insert and delete; a row moves by its handle (D547)', async ({ page, browserName }) => {
  await start(page)
  // 24 stays, each a number of nights of its own, from 1 to 24, in no order.
  await page.evaluate(async () => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const folder = 'collections/01K85Z1T00000000000000000C-stays', at = '2026-10-23T09:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000C', name: 'Stays', author: 'user', created: at, changed: at,
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'nights', name: 'Nights', type: 'number' }, { id: 'stage', name: 'Stage', type: 'select', options: [{ name: 'Idea' }, { name: 'Booked' }] }],
      views: [{ id: 'table', type: 'table' }, { id: 'board', type: 'board', group: 'stage' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, Array.from({ length: 24 }, (_, i) => `${JSON.stringify({ row: `01K800000000000000000000${String(i).padStart(2, '0')}`, set: { name: `Stay ${i + 1}`, nights: ((i * 7) % 24) + 1, stage: 'Idea' }, at: `2026-10-23T09:${String(i + 10).padStart(2, '0')}:00.000Z`, by: 'user' })}\n`).join(''))
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Stays.xlsx' })
  })
  /** The collection as its file holds it: its columns, by id, name and kind, its rows' order, and each row's nights. */
  const file = () => page.evaluate(async () => {
    const [{ shown, load }, { app }] = await Promise.all([import('/caps/tables/tables.js'), import('/ui/state.js')])
    const one = shown.value && await load(shown.value.folder)
    return one && { columns: one.table.properties.filter((property) => !property.deleted).map((property) => `${property.id} ${property.name} (${property.type})`), order: one.table.order ?? [],
      nights: one.rows.map((row) => row.cells.nights), board: one.table.views.some((view) => view.type === 'board'), text: await app.fs.read(`${one.dir}/${one.folder}/collection.json`) }
  })
  const heads = page.locator('.table-grid .table-head'), rows = page.locator('.table-grid tbody tr'), scroll = page.locator('.table-scroll')
  await expect(heads).toHaveText(['Name', 'Nights', 'Stage'])
  // Each head shows its kind's glyph before its name.
  await expect(heads.locator('svg.icon')).toHaveCount(3)

  // Its rows scroll under its heads, which stay at the top of the table.
  await scroll.evaluate((box) => { box.scrollTop = box.scrollHeight })
  await expect.poll(async () => Math.abs(((await page.locator('.table-grid thead th').first().boundingBox())?.y ?? 0) - ((await scroll.boundingBox())?.y ?? 99))).toBeLessThan(3)
  await scroll.evaluate((box) => { box.scrollTop = 0 })

  // A head opens its column's menu; Rename puts its name in a box in its head, and Enter keeps it, its id as it was.
  const menu = async (/** @type {string} */ name) => {
    await heads.filter({ hasText: name }).click()
    return page.locator('.table-menu:popover-open')
  }
  await expect(await menu('Nights')).toContainText('Number')
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Rename' }).click()
  const box = page.locator('.table-grid thead input')
  await expect(box).toBeFocused()
  await expect(box).toHaveValue('Nights')
  await page.keyboard.type('Nights booked')
  await page.keyboard.press('Enter')
  await expect(heads).toHaveText(['Name', 'Nights booked', 'Stage'])
  await expect(heads.nth(1)).toBeFocused()
  await expect.poll(async () => (await file())?.columns).toEqual(['name Name (text)', 'nights Nights booked (number)', 'stage Stage (select)'])

  // Made text, its numbers become text; made a number again, they are numbers, as they were. A choice made text takes the board with it.
  await (await menu('Nights booked')).getByRole('button', { name: /^Type/ }).click()
  await expect(page.locator('.table-menu:popover-open [aria-current="true"]')).toBeFocused()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Text' }).click()
  await expect.poll(async () => (await file())?.nights.slice(0, 3)).toEqual(['1', '8', '15'])
  await (await menu('Nights booked')).getByRole('button', { name: /^Type/ }).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Number' }).click()
  await expect.poll(async () => (await file())?.nights.slice(0, 3)).toEqual([1, 8, 15])
  await (await menu('Stage')).getByRole('button', { name: /^Type/ }).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Text' }).click()
  await expect.poll(async () => (await file())?.board).toBe(false)
  await expect(page.locator('.table-modes')).toHaveCount(0)

  // Sorted from Z to A, then from A to Z: the rows keep that order.
  await (await menu('Nights booked')).getByRole('button', { name: 'Sort Z → A' }).click()
  await expect(rows.first().getByLabel('Nights booked')).toHaveValue('24')
  await expect(rows.last().getByLabel('Nights booked')).toHaveValue('1')
  await (await menu('Nights booked')).getByRole('button', { name: 'Sort A → Z' }).click()
  await expect(rows.first().getByLabel('Nights booked')).toHaveValue('1')
  await expect.poll(async () => (await file())?.nights.slice(0, 4)).toEqual([1, 2, 3, 4])

  // Insert left adds a text column before it, its name to type at once; Delete takes it away.
  await (await menu('Nights booked')).getByRole('button', { name: 'Insert left' }).click()
  await expect(box).toBeFocused()
  await page.keyboard.type('Country')
  await page.keyboard.press('Enter')
  await expect(heads).toHaveText(['Name', 'Country', 'Nights booked', 'Stage'])
  await (await menu('Nights booked')).getByRole('button', { name: 'Insert right' }).click()
  await expect(box).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(heads).toHaveText(['Name', 'Country', 'Nights booked', 'Text', 'Stage'])
  await (await menu('Country')).getByRole('button', { name: 'Delete' }).click()
  await expect(heads).toHaveText(['Name', 'Nights booked', 'Text', 'Stage'])

  // A row's handle shows with the pointer on its row, or the keyboard, which Tab brings to it from the row before; dragged over
  // another row's first half, the row goes before it.
  const handle = (/** @type {number} */ n) => rows.nth(n).getByRole('button', { name: 'Move row' })
  await page.mouse.move(0, 0)
  await expect(handle(2)).toHaveCSS('opacity', '0')
  await rows.nth(1).getByRole('button', { name: 'Delete row' }).focus()
  // WebKit, as Safari, tabs to buttons with Alt.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
  await expect(handle(2)).toBeFocused()
  await expect(handle(2)).toHaveCSS('opacity', '1')
  await handle(2).blur()
  await rows.nth(2).hover()
  await expect(handle(2)).toHaveCSS('opacity', '1')
  await handle(2).dragTo(rows.nth(0), { targetPosition: { x: 60, y: 4 } })
  await expect(rows.first().getByLabel('Nights booked')).toHaveValue('3')
  await expect.poll(async () => (await file())?.nights.slice(0, 4)).toEqual([3, 1, 2, 4])
  // The arrows move it by one, the keyboard staying on its handle.
  await handle(0).focus()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1).getByLabel('Nights booked')).toHaveValue('3')
  await expect(handle(1)).toBeFocused()
  await expect.poll(async () => (await file())?.nights.slice(0, 4)).toEqual([1, 3, 2, 4])
  expect(JSON.parse((await file())?.text ?? '{}').order).toHaveLength(24)
})

test('in a document, a collection’s columns are as wide as their fields, a long name is cut short on one line and whole in its tip, and its heads stay in view as the document scrolls (D547)', async ({ page }) => {
  await start(page)
  const long = 'Nights spent there, counting the days of travel'
  await page.evaluate(async (name) => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('documents')
    await unlock('tables')
    const folder = 'collections/01K85Z1T00000000000000000E-stays', at = '2026-10-23T09:00:00.000Z', path = 'documents/01K85Z1T00000000000000000F-notes.md'
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000E', name: 'Stays', author: 'user', created: at, changed: at,
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'nights', name, type: 'number' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, Array.from({ length: 30 }, (_, i) => `${JSON.stringify({ row: `01K800000000000000000000${String(i).padStart(2, '0')}`, set: { name: `Stay ${i + 1}`, nights: i + 1 }, at, by: 'user' })}\n`).join(''))
    const words = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}: where we go, and for how long, written out so that the document scrolls.`).join('\n\n')
    await app.fs.write(`${app.projectDir}/${path}`, `---\nformat: 1\nname: Notes\nauthor: user\n---\n${words}\n\n\`\`\`table\n${folder}\n\`\`\`\n\n${words}\n`)
    ;(await import('/ui/preview.js')).preview({ uri: path, name: 'Notes.md', mimeType: 'text/markdown' })
  }, long)
  const table = page.locator('app-table'), heads = table.locator('.table-head'), first = table.locator('thead th').first()
  await expect(heads).toHaveText(['Name', long])
  // The document's editor lays its own tables out in equal columns; a collection's are each as wide as its fields.
  expect((await first.boundingBox())?.width).toBeGreaterThan(120)
  await expect(heads.nth(1)).toHaveAttribute('title', long)
  expect(await heads.nth(1).locator('span').evaluate((span) => span.scrollWidth > span.clientWidth)).toBe(true)
  expect((await heads.nth(1).boundingBox())?.height).toBeLessThan(45)
  // Scrolled past the table's top, the document shows its heads at the top of its view, over the rows.
  await table.evaluate((element) => {
    const view = /** @type {HTMLElement} */ (element.closest('.view')), box = /** @type {HTMLElement} */ (element.querySelector('.table-scroll'))
    view.scrollTop += box.getBoundingClientRect().top - view.getBoundingClientRect().top + 150
  })
  const view = page.locator('app-preview .view')
  await expect.poll(async () => Math.abs(((await first.boundingBox())?.y ?? 0) - ((await view.boundingBox())?.y ?? 99))).toBeLessThan(3)
  await expect(first).toBeInViewport()
})
