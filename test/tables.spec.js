// Tables you keep (D491), in Chromium and WebKit: offered by a brain that makes them right, then made from a
// request and filled by the brain, beside the conversation; Jean's changes marked, accepted or rejected (D505); a cell changed
// by hand; a row the brain changes from what the user tells it; the board, a card moved by its own step; the
// table downloaded as a workbook; and found again from another task with @. Its heads stay on top, each opening its column's
// menu: renamed, made another kind, the rows sorted, a column inserted or deleted; a row moved by its handle. Its bar's Search, Filter,
// Sort and Settings, its foot's sums, and lines only between its cells. A cell selected or changed by the keyboard, ⌘Z and ⇧⌘Z, and a row's
// handle's menu, to duplicate or delete it. A relation to this collection
// or another, each of its cells a row there picked by its name, which a brain makes too. A brain on this computer, which
// doesn't make tables right, makes and changes none, but reads them, and finds their rows and documents' words with search_files. In Arabic and Japanese, the view reads as its language does.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, turnOn, openSettings, closeSettings, openTasks, BRAIN_URL } from './helpers.js'
import { readZip } from '../app/core/zip.js'

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

  // Beside the conversation, by its name alone; Jean's 11 cells marked, to keep or undo.
  await expect(page.locator('app-preview .pane-head h2')).toHaveText('Job applications')
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

  // The board, from Settings: a lane for each step, in order, each card moved by its own step.
  // By now the page itself has scrolled, and WebKit places a menu anchored to a button as if it hadn't: back to the top.
  await page.evaluate(() => scrollTo(0, 0))
  await page.locator('.table-tools').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('.table-panel:popover-open').getByRole('button', { name: 'Board' }).click()
  await page.keyboard.press('Escape')
  const lanes = page.locator('.table-lane')
  await expect(lanes.locator('h3 > span[dir]')).toHaveText(['To apply', 'Applied', 'Interview', 'Offer'])
  await expect(lanes.nth(1).locator('.table-card')).toHaveCount(2)
  await lanes.nth(0).locator('.table-card').getByLabel('Status').selectOption('Applied')
  await expect(lanes.nth(1).locator('.table-card')).toHaveCount(3)
  await expect(lanes.nth(0).locator('.table-card')).toHaveCount(0)

  // The pane's Save gives the table as a workbook, named so.
  await page.locator('app-preview .pane-head').getByRole('button', { name: 'Save Job applications' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('app-preview .answer-menu').getByRole('button', { name: 'Save Job applications.xlsx' }).click()])
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
  await expect(page.locator('app-preview .pane-head h2')).toHaveText('Job applications')
  await expect(page.locator('.table-grid tbody tr')).toHaveCount(3)
  // Its card among the creations shows its heads and first rows (D497).
  await (await openTasks(page)).getByRole('button', { name: 'Creations', exact: true }).click()
  const card = page.locator('app-creations .creation', { hasText: 'Job applications' })
  await expect(card.locator('.creation-preview th')).toHaveText(['Company', 'Role', 'Status', 'Applied on'])
  await expect(card.locator('.creation-preview tr').nth(1).locator('td').first()).toHaveText('Atelier Lune')
})

test('a brain on this computer gets neither table_create nor table_change, nor offers Tables: it says it can’t keep tables yet', async ({ page }) => {
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

test('a brain on this computer reads a collection all the same, opening nothing, and finds what collections and documents hold with search_files, whose sources open them', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await Promise.all([unlock('tables'), unlock('documents'), unlock('files')])
    const folder = 'collections/01K85Z1T00000000000000000B-robert', at = '2026-10-25T18:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000B', name: 'Les 5 Robert', author: 'user', created: at, changed: at,
      properties: [{ id: 'name', name: 'Nom', type: 'text' }, { id: 'team', name: 'Structure', type: 'select', options: [{ name: 'Enia' }, { name: 'Tandem' }] }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, [['1', 'Robert Badinter', 'Enia'], ['2', 'Robert Doisneau', 'Tandem']]
      .map(([n, name, team]) => `${JSON.stringify({ row: `01K8000000000000000000000${n}`, set: { name, team }, at, by: 'user' })}\n`).join(''))
    await app.fs.write(`${app.projectDir}/documents/01K85Z1T00000000000000000C-offsite.md`, '---\nformat: 1\nname: Offsite\nauthor: user\ncreated: 2026-10-25T18:00:00.000Z\nchanged: 2026-10-25T18:00:00.000Z\n---\n# Offsite\n\nThe offsite is in Lisbon, with Robert Doisneau.\n')
    await (await import('/ui/creations.js')).reread()
  })
  // table_rows, which a brain on this computer has, unlike table_create and table_change, and which opens nothing, the address as it was (D657).
  await ask(page, 'Atelier Lune invited me to an interview')
  await answered(page)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('"Nom":"Robert Badinter","Structure":"Enia"')
  await expect(page.locator('app-preview')).toHaveCount(0)
  expect(new URL(page.url()).searchParams.has('split')).toBe(false)
  const prompt = await page.evaluate(async () => JSON.stringify((await import('/ui/state.js')).app.current.value?.records[0]))
  expect(prompt).toContain('table_rows')
  expect(prompt).not.toContain('table_change')
  // search_files finds a collection's row and a document's words, each its own source, which opens it beside the task.
  await ask(page, 'What do the files say about Tandem?')
  await answered(page, 2)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Nom: Robert Doisneau; Structure: Tandem')
  await page.locator('.msg-jean .prose').last().locator('.cite').click()
  await expect(page.locator('.table-grid tbody tr')).toHaveCount(2)
  await ask(page, 'What do the files say about Lisbon?')
  await answered(page, 3)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('The offsite is in Lisbon, with Robert Doisneau.')
  await page.locator('.msg-jean .prose').last().locator('.cite').click()
  await expect(page.locator('.document .ProseMirror')).toContainText('The offsite is in Lisbon')
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
      ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'وظائف.xlsx', title: 'وظائف' })
    })
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    await page.locator('.table-tools > button').last().click()
    await expect(page.locator('.table-panel:popover-open > button[aria-current]')).toHaveText([table, board])
    await page.keyboard.press('Escape')
    await expect(page.locator('.table-total').first()).toHaveText(lang === 'ar' ? 'حساب' : '計算')
    await expect(page.locator('.table-view .review')).toContainText(review)
    await expect(page.locator('.table-grid tbody tr').first().getByLabel('الحالة')).toHaveValue('مقابلة')
    // The table starts at the pane's start edge, the right one in Arabic.
    const [view, grid] = await Promise.all(['.table-view', '.table-grid'].map((selector) => page.locator(selector).boundingBox()))
    if (lang === 'ar') expect(Math.abs((view?.x ?? 0) + (view?.width ?? 0) - (grid?.x ?? 0) - (grid?.width ?? 0))).toBeLessThan(4)
    else expect(Math.abs((view?.x ?? 0) - (grid?.x ?? 0))).toBeLessThan(4)
    // Its tools at the bar's end, on the left in Arabic, and a line between two cells on their start side.
    const [name, tools] = await Promise.all(['.table-name', '.table-tools'].map((selector) => page.locator(selector).boundingBox()))
    expect(lang === 'ar' ? (tools?.x ?? 0) < (name?.x ?? 0) : (tools?.x ?? 0) > (name?.x ?? 0)).toBe(true)
    expect(await page.locator('.table-grid tbody td:nth-child(3)').first().evaluate((td) => getComputedStyle(td)[document.dir === 'rtl' ? 'borderRightWidth' : 'borderLeftWidth'])).toBe('1px')
    // The arrows select the cell they point at, the next one on the left in Arabic, and a row's handle opens its menu in the language's words.
    const cells = page.locator('.table-grid tbody tr').first().locator('td[tabindex]')
    await cells.first().focus()
    await page.keyboard.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight')
    await expect(cells.nth(1)).toBeFocused()
    await page.locator('.table-grip button').first().click()
    await expect(page.locator('.table-menu:popover-open button')).toHaveText(lang === 'ar' ? ['إدراج أسفل', 'تكرار', 'حذف'] : ['下に挿入', '複製', '削除'])
  })
}

test('a collection is pinned, renamed, duplicated with its rows and deleted from the Creations page', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'the same menu as a document’s (documents.spec.js)')
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
  await expect(creations.locator('.creation-start b')).toHaveText(['Collection'])
  // Its + stays at its end on a phone too.
  const size = page.viewportSize()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(creations.locator('.creation-start > .icon')).toBeVisible()
  if (size) await page.setViewportSize(size)
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

test('a collection’s heads stay on top, show their kind and open a menu to rename, change the kind, sort, insert, hide and delete; a row moves by its handle', async ({ page, browserName }) => {
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
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Stays.xlsx', title: 'Stays' })
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
  // Its foot stays at the bottom of the table's box, over the rows.
  const bottom = async (/** @type {import('@playwright/test').Locator} */ one) => ((box) => (box ? box.y + box.height : 0))(await one.boundingBox())
  expect(await bottom(page.locator('.table-grid tfoot tr:last-child td').first())).toBeGreaterThan(await bottom(scroll) - 20)
  expect(await bottom(page.locator('.table-grid tfoot tr:last-child td').first())).toBeLessThan(await bottom(scroll) + 1)

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
  await expect(page.locator('.table-panel > button[aria-current]')).toHaveCount(0)

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

  // A head dragged over another's first half goes before it, a line showing where; the mouse moves in small steps, as a hand
  // does, nudged first so that the drag starts.
  const ids = async () => (await file())?.columns.map((column) => column.split(' ')[0])
  // Text, in view as the table runs past the pane's side, onto Nights booked.
  const [text, nights] = /** @type {{ x: number, y: number, width: number, height: number }[]} */ (await Promise.all([heads.nth(2).boundingBox(), heads.nth(1).boundingBox()]))
  await page.mouse.move(text.x + 10, text.y + text.height / 2)
  await page.mouse.down()
  await page.mouse.move(text.x + 20, text.y + text.height / 2, { steps: 2 })
  await page.mouse.move(nights.x + 6, nights.y + nights.height / 2, { steps: 12 })
  await expect(page.locator('.table-grid th[data-drop="before"]')).toHaveText(/Nights booked/)
  await page.mouse.up()
  await expect(heads).toHaveText(['Name', 'Text', 'Nights booked', 'Stage'])
  await expect(page.locator('.table-grid th[data-drop]')).toHaveCount(0)
  await expect.poll(ids).toEqual(['name', 'text-2', 'nights', 'stage'])
  await expect((await menu('Name')).getByRole('button', { name: 'Move left' })).toHaveCount(0)

  // Hide takes a column out of the table as Settings' columns shown does, which then has it unticked and is lit; the name column has none.
  await expect(page.locator('.table-menu:popover-open').getByRole('button', { name: 'Hide' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await (await menu('Text')).getByRole('button', { name: 'Hide' }).click()
  await expect(heads).toHaveText(['Name', 'Nights booked', 'Stage'])
  const settings = page.locator('.table-tools').getByRole('button', { name: 'Settings', exact: true })
  await expect(settings).toHaveAttribute('data-on')
  await settings.click()
  await expect(page.locator('.table-panel:popover-open').getByRole('checkbox', { name: 'Text' })).not.toBeChecked()
  await page.locator('.table-panel:popover-open').getByRole('checkbox', { name: 'Text' }).check()
  await expect(heads).toHaveText(['Name', 'Text', 'Nights booked', 'Stage'])
  await page.keyboard.press('Escape')

  // A row's handle shows with the pointer on its row, or the keyboard, which Tab brings to it from the row before; dragged over
  // another row's first half, the row goes before it.
  const handle = (/** @type {number} */ n) => rows.nth(n).getByRole('button', { name: 'Move row' })
  await page.mouse.move(0, 0)
  await expect(handle(2)).toHaveCSS('opacity', '0')
  await rows.nth(1).getByLabel('Stage', { exact: true }).focus()
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

test('a collection’s cell is changed by a click or Enter, kept by Enter, which selects the one under it, left as it was by Escape; the arrows select another; ⌘Z and ⇧⌘Z undo and redo; a row’s handle duplicates or deletes it', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const folder = 'collections/01K85Z1T00000000000000000H-trips', at = '2026-10-26T09:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000H', name: 'Trips', author: 'user', created: at, changed: at,
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'days', name: 'Days', type: 'number' }, { id: 'done', name: 'Done', type: 'checkbox' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, ['Lyon', 'Porto', 'Kyoto'].map((name, i) => `${JSON.stringify({ row: `01K8000000000000000000000${i}`, set: { name, days: i + 2 }, at: `2026-10-26T09:0${i + 1}:00.000Z`, by: 'user' })}\n`).join(''))
    ;(await import('/caps/tables/tables.js')).metaOf(folder).then((meta) => import('/ui/preview.js').then(({ preview }) => preview({ uri: folder, name: meta?.name ?? '', title: meta?.title ?? '' })))
  })
  const rows = page.locator('.table-grid tbody tr'), names = rows.getByLabel('Name'), values = () => names.evaluateAll((all) => all.map((field) => /** @type {HTMLInputElement} */ (field).value))
  const cell = (/** @type {number} */ row, /** @type {number} */ column) => rows.nth(row).locator('td[tabindex]').nth(column)
  // The pane names it by its name alone, not as the workbook it downloads as.
  await expect(page.locator('app-preview .pane-head h2')).toHaveText('Trips')
  await expect.poll(values).toEqual(['Lyon', 'Porto', 'Kyoto'])
  await expect(page.getByRole('button', { name: 'Delete row' })).toHaveCount(0)

  // A click changes a cell; Enter keeps the change and selects the cell under it.
  await names.nth(0).click()
  await expect(names.nth(0)).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.type(' and Annecy')
  await page.keyboard.press('Enter')
  await expect(cell(1, 0)).toBeFocused()
  await expect.poll(async () => (await changes(page)).at(-1)).toMatchObject({ by: 'user', set: { name: 'Lyon and Annecy' } })
  // Enter changes the cell selected, the caret at the end of its words; Escape leaves it as it was, selected.
  await page.keyboard.press('Enter')
  await expect(names.nth(1)).toBeFocused()
  expect(await names.nth(1).evaluate((/** @type {HTMLInputElement} */ field) => [field.selectionStart, field.selectionEnd])).toEqual([5, 5])
  await page.keyboard.type(' and Braga')
  await page.keyboard.press('Escape')
  await expect(cell(1, 0)).toBeFocused()
  await expect(names.nth(1)).toHaveValue('Porto')
  await expect(page.locator('app-preview')).toBeVisible()
  expect(await changes(page)).toHaveLength(4)
  // The arrows select another cell, the end of a row going on to the start of the next, and back.
  await page.keyboard.press('ArrowRight')
  await expect(cell(1, 1)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(cell(2, 0)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(cell(1, 2)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(cell(0, 2)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(cell(0, 2)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(cell(2, 2)).toBeFocused()

  // ⌘Z undoes the last change, ⇧⌘Z does it again, a cell selected; in a field being changed, it undoes its own words.
  await page.keyboard.press('ControlOrMeta+z')
  await expect(names.nth(0)).toHaveValue('Lyon')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(names.nth(0)).toHaveValue('Lyon and Annecy')
  await expect(cell(2, 2)).toBeFocused()

  // A row's handle, clicked or right clicked, opens its menu: Duplicate puts a copy under it, Delete takes it away, and ⌘Z brings each back.
  const handle = (/** @type {number} */ n) => rows.nth(n).getByRole('button', { name: 'Move row' }), menu = page.locator('.table-menu:popover-open')
  await rows.nth(1).hover()
  await handle(1).click()
  await expect(menu.getByRole('button')).toHaveText(['Insert below', 'Duplicate', 'Delete'])
  await menu.getByRole('button', { name: 'Duplicate' }).click()
  await expect.poll(values).toEqual(['Lyon and Annecy', 'Porto', 'Porto', 'Kyoto'])
  await expect(rows.nth(2).getByLabel('Days')).toHaveValue('3')
  await rows.nth(0).hover()
  await handle(0).click({ button: 'right' })
  await menu.getByRole('button', { name: 'Delete' }).click()
  await expect.poll(values).toEqual(['Porto', 'Porto', 'Kyoto'])
  await cell(0, 1).focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(values).toEqual(['Lyon and Annecy', 'Porto', 'Porto', 'Kyoto'])
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(values).toEqual(['Lyon and Annecy', 'Porto', 'Kyoto'])
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(values).toEqual(['Lyon and Annecy', 'Porto', 'Porto', 'Kyoto'])
  // Insert below puts an empty row under it, whose first field takes the keyboard; ⌘Z takes it away.
  await rows.nth(0).hover()
  await handle(0).click()
  await menu.getByRole('button', { name: 'Insert below' }).click()
  await expect.poll(values).toEqual(['Lyon and Annecy', '', 'Porto', 'Porto', 'Kyoto'])
  await expect(names.nth(1)).toBeFocused()
  await page.keyboard.type('Annecy')
  await page.keyboard.press('Enter')
  await expect.poll(values).toEqual(['Lyon and Annecy', 'Annecy', 'Porto', 'Porto', 'Kyoto'])
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(values).toEqual(['Lyon and Annecy', 'Porto', 'Porto', 'Kyoto'])

  // A column's change too: renamed, then undone and done again.
  await page.locator('.table-grid .table-head').filter({ hasText: 'Days' }).click()
  await menu.getByRole('button', { name: 'Rename' }).click()
  await expect(page.locator('.table-grid thead input')).toBeFocused()
  await page.keyboard.type('Nights')
  await page.keyboard.press('Enter')
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Name', 'Nights', 'Done'])
  await expect(page.locator('.table-grid .table-head').nth(1)).toBeFocused()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Name', 'Days', 'Done'])
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Name', 'Nights', 'Done'])
})

test('a Formula column’s cells are worked out from each row’s others, and a click or Enter on one opens a dialog to write the column’s formula, with Math’s functions by their names alone', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const folder = 'collections/01K85Z1T00000000000000000J-stays', at = '2026-10-26T09:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000J', name: 'Stays', author: 'user', created: at, changed: at,
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'price', name: 'Price', type: 'number' }, { id: 'nights', name: 'Nights', type: 'number' }, { id: 'total', name: 'Total', type: 'formula', formula: 'Price * Nights' }],
      views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, [['Lyon', 82.5, 3], ['Porto', 60, 2]].map(([name, price, nights], i) => `${JSON.stringify({ row: `01K8000000000000000000000${i}`, set: { name, price, nights }, at: `2026-10-26T09:0${i + 1}:00.000Z`, by: 'user' })}\n`).join(''))
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Stays', title: 'Stays' })
  })
  const rows = page.locator('.table-grid tbody tr'), totals = page.locator('.table-grid [data-formula]'), dialog = page.locator('dialog.table-formula'), words = dialog.locator('textarea')
  await expect(totals).toHaveText(['247.5', '120'])
  // A click opens the dialog, the formula there, its kind's glyph and the column's name above it.
  await totals.first().click()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('h2')).toHaveText('Total')
  await expect(words).toBeFocused()
  await expect(words).toHaveValue('Price * Nights')
  await expect(words).toHaveAttribute('placeholder', 'Your formula')
  // One that can't be read is said, the dialog staying open; one that can is kept, Math's functions by their names alone.
  await words.fill('round(Price * Nights')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('This formula can’t be worked out: check the columns’ names and the brackets.')
  await words.fill('round(Price * Nights) + max(1, sqrt(Nights)) * PI')
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(totals).toHaveText(['253.441', '124.443'])
  // Escape leaves the formula as it was and the pane open; Enter on the cell selected opens the dialog too.
  await expect(rows.nth(0).locator('td[tabindex]').nth(3)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(words).toBeFocused()
  await words.fill('1')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('app-preview')).toBeVisible()
  await expect(totals).toHaveText(['253.441', '124.443'])
  // Renamed, a column keeps the formula naming it; ⌘Z takes the formula back as it was.
  await page.locator('.table-grid .table-head').filter({ hasText: 'Nights' }).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Rename' }).click()
  await expect(page.locator('.table-grid thead input')).toBeFocused()
  await page.keyboard.type('Stays')
  await page.keyboard.press('Enter')
  await expect(totals).toHaveText(['253.441', '124.443'])
  await totals.first().click()
  await expect(words).toHaveValue('round(Price * Stays) + max(1, sqrt(Stays)) * PI')
  await expect(words).toBeFocused()
  await page.keyboard.press('Escape')
  await rows.nth(0).locator('td[tabindex]').first().focus()
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(totals).toHaveText(['247.5', '120'])
  // The foot sums it; the last head adds one.
  await page.locator('.table-total').nth(3).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Sum' }).click()
  await expect(page.locator('.table-total').nth(3)).toContainText('367.5')
  await page.locator('.table-add-column').selectOption('formula')
  await expect(page.locator('.table-grid thead input')).toHaveValue('Formula')
})

for (const [lang, width, height] of /** @type {const} */ ([['en', 1100, 700], ['ar', 1100, 700], ['fr', 900, 380], ['ar', 900, 380]])) {
  test(`in ${lang}, in a window ${width} by ${height}, a head half out of it opens its whole menu inside it`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await start(page, lang)
    await page.evaluate(async () => {
      const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
      await unlock('tables')
      const folder = 'collections/01K85Z1T00000000000000000K-wide', at = '2026-10-26T09:00:00.000Z'
      await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000K', name: 'Wide', author: 'user', created: at, changed: at,
        properties: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `Column ${i}`, type: i % 3 ? 'text' : 'date' })), views: [{ id: 'table', type: 'table' }] }))
      await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, [1, 2, 3, 4].map((i) => `${JSON.stringify({ row: `01K80000000000000000000${i}0`, set: { c1: `Row ${i}` }, at: `2026-10-26T09:0${i}:00.000Z`, by: 'user' })}\n`).join(''))
      ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Wide', title: 'Wide' })
    })
    const heads = page.locator('.table-grid .table-head'), box = /** @type {{ x: number, width: number }} */ (await page.locator('.table-scroll').boundingBox())
    await expect(heads).toHaveCount(9)
    // The head the table's box cuts, at the window's side, clicked where it shows.
    const edge = lang === 'ar' ? box.x + 6 : box.x + box.width - 6, boxes = await Promise.all(Array.from({ length: 9 }, (_, i) => heads.nth(i).boundingBox()))
    const cut = boxes.find((one) => one && one.x < edge && one.x + one.width > edge && (one.x < 0 || one.x + one.width > width))
    expect(cut).toBeTruthy()
    await page.mouse.click(edge, (cut?.y ?? 0) + (cut?.height ?? 0) / 2)
    const menu = page.locator('.table-menu:popover-open')
    await expect(menu.getByRole('button').first()).toBeVisible()
    // Inside the window, whatever its height: no taller than the room under or over its head, scrolling.
    await expect.poll(async () => ((one) => one && one.x >= 0 && one.x + one.width <= width && one.y >= 0 && one.y + one.height <= height)(await menu.boundingBox())).toBe(true)
  })
}

test('a collection’s bar finds rows with Search, as Creations does, keeps those Filter’s rules keep, sorts from Sort, hides columns and shows the board from Settings; its foot sums a column; a line under its heads and rows and between its cells, the + plain, a head’s menu on a right click, and no words selected', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const folder = 'collections/01K85Z1T00000000000000000G-expenses', at = '2026-10-24T09:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000G', name: 'Expenses', author: 'user', created: at, changed: at,
      properties: [{ id: 'item', name: 'Item', type: 'text' }, { id: 'amount', name: 'Amount', type: 'number' }, { id: 'stage', name: 'Stage', type: 'select', options: [{ name: 'To pay' }, { name: 'Paid' }] },
        { id: 'receipt', name: 'Receipt', type: 'checkbox' }], views: [{ id: 'table', type: 'table' }, { id: 'board', type: 'board', group: 'stage' }] }))
    const rows = [['Train to Lyon', 89.5, 'Paid', true], ['Hotel', 240, 'Paid', true], ['Dinner', 76.25, 'To pay', false], ['Conférence', 450, 'To pay', true], ['Taxi', 32, 'Paid', false]]
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, rows.map(([item, amount, stage, receipt], i) => `${JSON.stringify({ row: `01K8000000000000000000000${i}`, set: { item, amount, stage, receipt }, at: `2026-10-24T09:0${i + 1}:00.000Z`, by: 'user' })}\n`).join(''))
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Expenses.xlsx', title: 'Expenses' })
  })
  const rows = page.locator('.table-grid tbody tr'), items = rows.getByLabel('Item'), tools = page.locator('.table-tools'), panel = page.locator('.table-panel:popover-open')
  const values = () => items.evaluateAll((fields) => fields.map((field) => /** @type {HTMLInputElement} */ (field).value))
  await expect.poll(values).toEqual(['Train to Lyon', 'Hotel', 'Dinner', 'Conférence', 'Taxi'])
  /** The table view as its file holds it. */
  const kept = () => page.evaluate(async () => {
    const { shown, load } = await import('/caps/tables/tables.js')
    return (await load(String(shown.value?.folder)))?.table.views.find((view) => view.type === 'table')
  })
  // No line around the table or beside its handles; one under its heads and under each row, from the first column, and between two data cells.
  const borders = (/** @type {string} */ selector) => page.locator(selector).first().evaluate((cell) => ((style) => [style.borderTopWidth, style.borderLeftWidth, style.borderRightWidth, style.borderBottomWidth])(getComputedStyle(cell)))
  for (const selector of ['.table-scroll', '.table-grid thead td.table-grip', '.table-grid tbody tr:nth-child(2) td:first-child']) expect(await borders(selector)).toEqual(['0px', '0px', '0px', '0px'])
  for (const selector of ['.table-grid thead th', '.table-grid tbody tr:first-child td:nth-child(2)', '.table-grid tbody tr:last-child td:nth-child(2)', '.table-grid tbody tr:nth-child(2) td:last-child']) expect(await borders(selector)).toEqual(['0px', '0px', '0px', '1px'])
  expect(await borders('.table-grid tbody tr:nth-child(2) td:nth-child(3)')).toEqual(['0px', '1px', '0px', '1px'])
  // The last head's + is no field: no box, no fill.
  expect(await page.locator('.table-add-column').evaluate((add) => ((style) => [style.borderTopWidth, style.backgroundColor])(getComputedStyle(add)))).toEqual(['0px', 'rgba(0, 0, 0, 0)'])
  // A drag across the heads and the cells selects none of their words.
  const [from, to] = await Promise.all([page.locator('.table-grid .table-head').first().boundingBox(), page.locator('.table-grid tfoot').boundingBox()])
  await page.mouse.move((from?.x ?? 0) + 4, (from?.y ?? 0) + 4)
  await page.mouse.down()
  await page.mouse.move((to?.x ?? 0) + (to?.width ?? 0) - 4, (to?.y ?? 0) + 4, { steps: 4 })
  await page.mouse.up()
  expect(await page.evaluate(() => String(getSelection()))).toBe('')
  // A right click on a head opens its menu, as a click does; Escape closes it alone.
  await page.locator('.table-grid .table-head', { hasText: 'Amount' }).click({ button: 'right' })
  await expect(page.locator('.table-menu:popover-open')).toContainText('Number')
  await page.keyboard.press('Escape')
  await expect(page.locator('.table-menu:popover-open')).toHaveCount(0)
  await expect(page.locator('app-preview .table-view')).toBeVisible()

  // Search, from five rows, as on the Creations page: round until it has the keyboard, then a box keeping the rows with its words, case and
  // accents aside, a number too; nothing found says so and clears; Escape empties it, the pane staying open.
  const find = tools.locator('.creations-find'), search = tools.getByRole('searchbox', { name: 'Find a row' }), round = await find.boundingBox()
  expect(Math.abs((round?.width ?? 0) - (round?.height ?? 0))).toBeLessThan(2)
  await find.click()
  await expect(search).toBeFocused()
  await expect.poll(async () => (await find.boundingBox())?.width).toBeGreaterThan(150)
  await search.fill('LYON')
  await expect.poll(values).toEqual(['Train to Lyon'])
  await search.fill('conference')
  await expect.poll(values).toEqual(['Conférence'])
  await search.fill('240')
  await expect.poll(values).toEqual(['Hotel'])
  await search.fill('passport')
  await expect(page.locator('.table-view .creations-none')).toContainText('No row matches “passport”.')
  await page.locator('.table-view').getByRole('button', { name: 'Clear' }).click()
  await expect(items).toHaveCount(5)
  await expect(search).toBeFocused()
  await search.fill('taxi')
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(items).toHaveCount(5)
  await expect(page.locator('app-preview .table-view')).toBeVisible()

  // Filter: a rule on Amount, more than 80, keeps three rows, lights its button, and is kept in the table view.
  await tools.getByRole('button', { name: 'Filter', exact: true }).click()
  await panel.getByRole('button', { name: 'Add a filter' }).click()
  await panel.getByRole('combobox', { name: 'Column' }).selectOption('Amount')
  await expect(panel.getByRole('combobox', { name: 'Condition' })).toHaveValue('is')
  await panel.getByRole('combobox', { name: 'Condition' }).selectOption('is more than')
  await panel.getByRole('spinbutton', { name: 'Amount' }).fill('80')
  await panel.getByRole('spinbutton', { name: 'Amount' }).press('Enter')
  await expect.poll(values).toEqual(['Train to Lyon', 'Hotel', 'Conférence'])
  await expect(tools.getByRole('button', { name: 'Filter', exact: true })).toHaveAttribute('data-on')
  await expect.poll(async () => (await kept())?.filter).toEqual({ and: [{ property: 'amount', op: 'greater-than', value: 80 }] })
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  // Sort: Amount from Z to A, once, as the rows' order.
  await tools.getByRole('button', { name: 'Sort', exact: true }).click()
  await panel.getByRole('group', { name: 'Amount' }).getByRole('button', { name: 'Sort Z → A' }).click()
  await expect.poll(values).toEqual(['Conférence', 'Hotel', 'Train to Lyon'])
  await page.keyboard.press('Escape')

  // Settings: Receipt hidden, the name column always shown; then the board, of the rows the filter keeps, and the table again.
  await tools.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(panel.getByRole('checkbox', { name: 'Item' })).toBeDisabled()
  await panel.getByRole('checkbox', { name: 'Receipt' }).uncheck()
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Item', 'Amount', 'Stage'])
  await expect(tools.getByRole('button', { name: 'Settings', exact: true })).toHaveAttribute('data-on')
  await panel.getByRole('button', { name: 'Board' }).click()
  await expect(page.locator('.table-lane .table-card')).toHaveCount(3)
  await panel.getByRole('button', { name: 'Table' }).click()
  await page.keyboard.press('Escape')

  // The foot: Calculate, under Amount, sums the rows shown; Percent filled under Stage.
  const foot = page.locator('.table-grid tfoot .table-total')
  // Each Calculate shows alone, with the pointer on it, its neighbours staying out of sight.
  await foot.nth(1).hover()
  await expect(foot.nth(1)).toHaveCSS('opacity', '1')
  await expect(foot.nth(2)).toHaveCSS('opacity', '0')
  await foot.nth(1).click()
  await expect(page.locator('.table-menu:popover-open button')).toHaveText(['None', 'Sum', 'Percent filled'])
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Sum' }).click()
  await expect(foot.nth(1)).toHaveText('Sum 779.5')
  // New row is the table's own, right under its rows, above the foot.
  const [last, add, sums] = await Promise.all([rows.last(), page.getByRole('button', { name: 'New row' }), page.locator('.table-grid tfoot tr:last-child')].map((one) => one.boundingBox()))
  expect(Math.abs((add?.y ?? 0) - (last?.y ?? 0) - (last?.height ?? 0))).toBeLessThan(2)
  expect((sums?.y ?? 0) + 1).toBeGreaterThan((add?.y ?? 0) + (add?.height ?? 0))
  await foot.nth(2).click()
  await expect(page.locator('.table-menu:popover-open button')).toHaveText(['None', 'Percent filled'])
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Percent filled' }).click()
  await expect(foot.nth(2)).toHaveText('Percent filled 100%')
  await expect.poll(async () => (await kept())?.calculate).toEqual({ amount: 'sum', stage: 'percent' })

  // All of it kept: closed and opened again, the same rows, columns and sums.
  await page.locator('app-preview .pane-head button').last().click()
  await expect(page.locator('.table-view')).toHaveCount(0)
  await page.evaluate(() => import('/ui/preview.js').then(({ preview }) => preview({ uri: 'collections/01K85Z1T00000000000000000G-expenses', name: 'Expenses.xlsx', title: 'Expenses' })))
  await expect.poll(values).toEqual(['Conférence', 'Hotel', 'Train to Lyon'])
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Item', 'Amount', 'Stage'])
  await expect(foot.nth(1)).toHaveText('Sum 779.5')
})

test('in a document, a collection’s columns are as wide as their fields, a long name is cut short on one line and whole in its tip, and its heads stay in view as the document scrolls', async ({ page }) => {
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
    ;(await import('/ui/preview.js')).preview({ uri: path, name: 'Notes.md', title: 'Notes', mimeType: 'text/markdown' })
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

test('a relation is to this collection or another, picked from the last head’s list or from Type, each of its cells a row there by its name, named again as that row is; the brain names rows by name too', async ({ page }) => {
  await start(page)
  const companies = 'collections/01K85Z1T00000000000000000D-companies', contacts = 'collections/01K85Z1T00000000000000000E-contacts'
  /** A row's ULID, by a letter and a number. @param {string} letter @param {number} n */
  const id = (letter, n) => `01K8${letter}${String(n).padStart(21, '0')}`
  await page.evaluate(async ({ companies, contacts, rows }) => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const at = '2026-10-24T09:00:00.000Z', table = (/** @type {string} */ folder, /** @type {string} */ name, /** @type {object[]} */ properties) => app.fs.write(`${app.projectDir}/${folder}/collection.json`,
      JSON.stringify({ format: 1, id: folder.slice(12, 38), name, author: 'user', created: at, changed: at, properties, views: [{ id: 'table', type: 'table' }] }))
    await table(companies, 'Companies', [{ id: 'name', name: 'Name', type: 'text' }])
    await table(contacts, 'Contacts', [{ id: 'name', name: 'Name', type: 'text' }, { id: 'employer', name: 'Employer', type: 'text' }])
    for (const [folder, lines] of Object.entries(rows)) await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, lines.map(([row, set], i) => `${JSON.stringify({ row, set, at: `2026-10-24T09:0${i}:00.000Z`, by: 'user' })}\n`).join(''))
    ;(await import('/ui/preview.js')).preview({ uri: contacts, name: 'Contacts.xlsx', title: 'Contacts' })
  }, { companies, contacts, rows: {
    [companies]: [[id('C', 1), { name: 'Acme' }], [id('C', 2), { name: 'Globex' }]],
    [contacts]: [[id('E', 1), { name: 'Ana', employer: 'globex' }], [id('E', 2), { name: 'Bo', employer: 'Nobody' }]],
  } })
  /** Contacts as their files hold them: each column by id, kind and collection, and each row's cells. */
  const file = () => page.evaluate(async (folder) => {
    const one = await (await import('/caps/tables/tables.js')).load(folder)
    return one && { columns: one.table.properties.map((property) => [property.id, property.type, property.collection ?? null].join(' ')), cells: one.rows.map((row) => row.cells) }
  }, contacts)
  const heads = page.locator('.table-grid .table-head'), rows = page.locator('.table-grid tbody tr'), menu = page.locator('.table-menu:popover-open')
  /** The name of the row a cell shows. @param {number} n @param {string} column */
  const shows = (n, column) => rows.nth(n).getByLabel(column).evaluate((/** @type {HTMLSelectElement} */ select) => select.selectedOptions[0]?.text)
  await expect(heads).toHaveText(['Name', 'Employer'])

  // The last head's list has a relation to this collection and to each other one; Companies' is named after it, its name to change at once.
  const add = page.locator('.table-add-column')
  await expect(add.locator('optgroup[label="Relation"] option')).toHaveText(['This collection', 'Companies'])
  await add.selectOption(`relation ${companies}`)
  await expect(page.locator('.table-grid thead input')).toBeFocused()
  await expect(page.locator('.table-grid thead input')).toHaveValue('Companies')
  await page.keyboard.type('Company')
  await page.keyboard.press('Enter')
  await expect(heads).toHaveText(['Name', 'Employer', 'Company'])
  await expect.poll(async () => (await file())?.columns.at(-1)).toBe(`companies relation ${companies}`)
  // Its cell picks a row of Companies by its name, and holds the row's id.
  await expect(rows.nth(0).getByLabel('Company').locator('option')).toHaveText(['—', 'Acme', 'Globex'])
  await rows.nth(0).getByLabel('Company').selectOption({ label: 'Acme' })
  await expect.poll(async () => (await file())?.cells[0].companies).toBe(id('C', 1))

  // Made a relation from Type, a column of names holds the rows of those names, in any case; a name of no row stays as it was, unseen.
  await heads.filter({ hasText: 'Employer' }).click()
  await menu.getByRole('button', { name: /^Type/ }).click()
  await menu.getByRole('button', { name: /^Relation/ }).click()
  await expect(menu.getByRole('button')).toHaveText(['Relation', 'This collection', 'Companies'])
  await menu.getByRole('button', { name: 'Companies' }).click()
  await expect.poll(async () => (await file())?.cells.map((cells) => cells.employer)).toEqual([id('C', 2), 'Nobody'])
  expect(await shows(0, 'Employer')).toBe('Globex')
  expect(await shows(1, 'Employer')).toBe('—')
  // Its menu says which collection it is to, ticked.
  await heads.filter({ hasText: 'Employer' }).click()
  await expect(menu.getByRole('button', { name: /^Type/ })).toContainText('Relation')
  await menu.getByRole('button', { name: /^Type/ }).click()
  await expect(menu.getByRole('button', { name: /^Relation/ })).toContainText('Companies')
  await menu.getByRole('button', { name: /^Relation/ }).click()
  await expect(menu.locator('[aria-current="true"]')).toHaveText('Companies')
  await expect(menu.locator('[aria-current="true"]')).toBeFocused()
  // Escape closes the menu, and only the menu.
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(heads).toHaveCount(3)

  // A company renamed there is renamed here.
  await page.evaluate(async ([folder, row]) => {
    const tables = await import('/caps/tables/tables.js')
    const one = await tables.load(folder)
    if (one) await tables.change(one, [{ row, set: { name: 'Acme Corp' } }], 'user')
  }, [companies, id('C', 1)])
  await expect.poll(() => shows(0, 'Company')).toBe('Acme Corp')

  // The brain sets a relation's cell by a row's name or id, and is told when a name names no row.
  const told = await page.evaluate(async ([folder, row]) => {
    const tables = await import('/caps/tables/tables.js')
    const one = await tables.load(folder)
    if (!one) return ''
    await tables.change(one, [{ row, set: { Company: 'globex' } }], 'jean')
    return tables.change(one, [{ row, set: { Company: 'Hooli' } }], 'jean').then(() => '', (/** @type {Error} */ error) => error.message)
  }, [contacts, id('E', 2)])
  expect(told).toContain('Company takes a row of Companies, by its name or its id: "Hooli" names none')
  await expect.poll(async () => (await file())?.cells[1].companies).toBe(id('C', 2))
  await expect.poll(() => shows(1, 'Company')).toBe('Globex')

  // Sorted by a relation, the rows go by the names its cells show, not by those rows' ids: Acme Corp, made first, renamed Zenith, comes last.
  await page.evaluate(async ([folder, row]) => {
    const tables = await import('/caps/tables/tables.js')
    const one = await tables.load(folder)
    if (one) await tables.change(one, [{ row, set: { name: 'Zenith' } }], 'user')
  }, [companies, id('C', 1)])
  await expect.poll(() => shows(0, 'Company')).toBe('Zenith')
  await heads.filter({ hasText: /^Company$/ }).click()
  await menu.getByRole('button', { name: 'Sort A → Z' }).click()
  await expect.poll(() => shows(0, 'Company')).toBe('Globex')
  expect(await shows(1, 'Company')).toBe('Zenith')
  await page.locator('.table-tools').getByRole('button', { name: 'Sort', exact: true }).click()
  await page.locator('.table-panel:popover-open').getByRole('group', { name: 'Company' }).getByRole('button', { name: 'Sort Z → A' }).click()
  await expect.poll(() => shows(0, 'Company')).toBe('Zenith')
  await page.keyboard.press('Escape')

  // Made a relation to this collection itself, its cells pick among its own rows.
  await heads.filter({ hasText: 'Company' }).click()
  await menu.getByRole('button', { name: /^Type/ }).click()
  await menu.getByRole('button', { name: /^Relation/ }).click()
  await menu.getByRole('button', { name: 'This collection' }).click()
  await expect.poll(async () => (await file())?.columns.at(-1)).toBe(`companies relation ${contacts}`)
  await expect(rows.nth(0).getByLabel('Company').locator('option')).toHaveText(['—', 'Ana', 'Bo'])
  await rows.nth(1).getByLabel('Company').selectOption({ label: 'Ana' })
  await expect.poll(async () => (await file())?.cells[1].companies).toBe(id('E', 1))
  // Duplicated, its copy's relation to itself is to the copy.
  expect(await page.evaluate(async (folder) => {
    const [{ slots }, tables] = await Promise.all([import('/ui/caps.js'), import('/caps/tables/tables.js')])
    const copy = await slots('creations').find((slot) => slot.id === 'tables')?.copy({ path: folder }, 'Contacts (copy)')
    return copy && copy !== folder && (await tables.load(copy))?.table.properties.at(-1)?.collection === copy
  }, contacts)).toBe(true)
})

test('a brain makes a relation too, to a collection the project keeps or to the one it makes, by its name as the brain’s <tables> tells it, then fills it by a row’s name', async ({ page }) => {
  await start(page)
  await planBrain(page)
  const companies = 'collections/01K85Z1T00000000000000000D-companies', globex = '01K8C000000000000000000002'
  await page.evaluate(async ({ folder, rows }) => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const at = '2026-10-24T09:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: folder.slice(12, 38), name: 'Companies', author: 'user', created: at, changed: at,
      properties: [{ id: 'name', name: 'Name', type: 'text' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, rows.map(([row, name]) => `${JSON.stringify({ row, set: { name }, at, by: 'user' })}\n`).join(''))
  }, { folder: companies, rows: [['01K8C000000000000000000001', 'Acme'], [globex, 'Globex']] })
  await ask(page, 'Keep track of my contacts and the company each works at')
  await answered(page)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Done: the table is beside the conversation.')
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Name', 'Company', 'Manager'])
  // Companies by its name, in any case, and Contacts, the new one, by its own: each column holds its collection's place; the row, Globex's id.
  const made = await page.evaluate(async () => {
    const one = (await import('/caps/tables/tables.js')).shown.value
    return one && { folder: one.folder, collections: one.table.properties.map((property) => property.collection ?? null), cells: one.rows.map((row) => row.cells) }
  })
  expect(made?.collections).toEqual([null, companies, made?.folder])
  expect(made?.cells).toEqual([{ name: 'Ana', company: globex }])
  await expect(page.locator('.table-grid tbody tr').first().getByLabel('Company')).toHaveValue(globex)
})

test('a page shows a collection the project keeps as it is: its figures, chart and table follow a change, in the user’s language, and its form adds a row as the user’s own; a copy keeps what it showed, which a task brought in from a share shows in place of this project’s own (D633)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // Expenses, a collection of the project's: two rows the user made.
  const folder = await page.evaluate(async () => {
    const [{ app }, { createTable, folderOf }, { stamp, stringifyChanges }, { ulid }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/caps/tables/table.js'), import('/caps/tables/changes.js'), import('/core/ulid.js'), import('/ui/caps.js')])
    const table = createTable({ name: 'Expenses', columns: [{ name: 'Date', type: 'date' }, { name: 'Amount', type: 'number' }, { name: 'Category', type: 'select', options: ['Food', 'Rent'] }] }, { id: ulid(), author: 'user', at: new Date().toISOString() })
    const place = folderOf(table), [first, second] = [ulid(), ulid()].sort(), rows = [{ row: first, set: { date: '2026-10-01', amount: 40, category: 'Food' } }, { row: second, set: { date: '2026-10-03', amount: 800, category: 'Rent' } }]
    await app.fs.write(`${app.projectDir}/${place}/collection.json`, `${JSON.stringify(table, null, 2)}\n`)
    await app.fs.write(`${app.projectDir}/${place}/changes.jsonl`, stringifyChanges(stamp([], rows, { by: 'user' })))
    await unlock('tables')
    return place
  })
  // Named with @, it is told with its columns and a page that shows it in its own names, as phase 0 measured.
  const told = await page.evaluate((place) => import('/caps/tables/tables.js').then(({ mentioned }) => mentioned(place)), folder)
  expect(told?.columns).toBe('Date (date), Amount (number), Category (select: Food, Rent)')
  expect(told?.body).toContain('<app-figures from="Expenses">\ncount | Expenses\nsum Amount | Amount\n</app-figures>\n<app-chart kind="bar" from="Expenses" by="Category" sum="Amount"></app-chart>')
  await ask(page, 'Make me an expenses page')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const parts = page.locator('.msg-jean .prose app-parts').last(), figures = parts.locator('ul.figures > li strong'), rows = parts.locator('.part-card.wide tbody tr')
  await expect(figures).toHaveText(['2', '840'])
  await expect(rows.first().locator('td')).toHaveText(['Oct 1, 2026', '40', 'Food'])
  await expect(rows).toHaveCount(2)
  await expect(parts.locator('app-chart .chart canvas').first()).toBeVisible()

  // A cell changed, as the collection's view changes one: the page follows.
  const change = (/** @type {Record<string, unknown>} */ set) => page.evaluate(async ([place, cells]) => {
    const { load, change } = await import('/caps/tables/tables.js'), one = /** @type {any} */ (await load(place))
    await change(one, [{ row: one.rows[0].id, set: cells }], 'user')
  }, /** @type {const} */ ([folder, set]))
  await change({ amount: 60 })
  await expect(figures).toHaveText(['2', '860'])
  await expect(rows.first().locator('td').nth(1)).toHaveText('60')

  // In Japanese, its dates as Japanese writes them.
  const settings = await openSettings(page)
  await settings.locator('.settings-panel select').first().selectOption('ja')
  await closeSettings(page)
  await expect(rows.first().locator('td').first()).toHaveText(new Intl.DateTimeFormat('ja', { dateStyle: 'medium' }).format(new Date('2026-10-01T00:00')))
  const english = await openSettings(page)
  await english.locator('.settings-panel select').first().selectOption('en')
  await closeSettings(page)

  // Its form: a field for each column, the row it adds the user's own, which Jean doesn't ask to accept.
  const form = parts.locator('form')
  await expect(form.locator('label > span')).toHaveText(['Date', 'Amount', 'Category'])
  await form.locator('input[type="date"]').fill('2026-10-05')
  await form.locator('input[type="number"]').fill('12.5')
  await form.locator('select').selectOption('Food')
  await form.getByRole('button', { name: 'Add expense' }).click()
  await expect(rows).toHaveCount(3)
  await expect(figures).toHaveText(['3', '872.5'])
  expect(await page.evaluate(async (place) => {
    const { load, unkept } = await import('/caps/tables/tables.js'), one = /** @type {any} */ (await load(place))
    return { by: one.lines.at(-1).by, cells: one.rows.at(-1).cells, unkept: unkept(one).length }
  }, folder)).toMatchObject({ by: 'user', cells: { date: '2026-10-05', amount: 12.5, category: 'Food' }, unkept: 0 })

  // A copy, shared or saved, keeps what the page shows now in a record of its own, the answer's words as they were.
  const kept = await page.evaluate(async () => {
    const [{ app }, { keeping }] = await Promise.all([import('/ui/state.js'), import('/ui/export.js')])
    const file = (await app.fs.read(/** @type {any} */ (app.current.value).path)) ?? '', copy = await keeping(file)
    return { same: copy.startsWith(file), record: JSON.parse(copy.slice(file.length)) }
  })
  expect(kept.same).toBe(true)
  expect(Object.values(kept.record.meta.filled)).toContain('3 | Expenses\n872.5 | Spent')

  // That copy brought in from a share: its page shows what was kept, not this project's Expenses as they are now.
  await change({ amount: 1000 })
  await expect(figures).toHaveText(['3', '1,812.5'])
  const source = await parts.getAttribute('source')
  await page.evaluate(async ([page, record]) => {
    const [{ app, refreshConversations, openConversation }, { createConversation, appendRecords }, { noteRecord, userRecord, envelope }] = await Promise.all([import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [noteRecord("What follows was shared with the user from someone else's Jean.", { kind: 'shared', from: 'hst.ing' }), userRecord('Make me an expenses page', 'someone'),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `\`\`\`html\n${page}\n\`\`\`` } }, 0), record])
    await refreshConversations()
    await openConversation(path)
  }, /** @type {const} */ ([source, kept.record]))
  const brought = page.locator('.msg-jean .prose app-parts').last()
  await expect(brought.locator('ul.figures > li strong')).toHaveText(['3', '872.5'])
  await expect(brought.locator('.part-card.wide tbody tr')).toHaveCount(3)
})

test('a page’s part shows only the rows its where keeps, and follows them; one it can’t read says so, in Arabic and Japanese too; named with @, the collection is told with the filter its table keeps, which a page doesn’t follow', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const folder = await page.evaluate(async () => {
    const [{ app }, { createTable, folderOf }, { stamp, stringifyChanges }, { ulid }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/caps/tables/table.js'), import('/caps/tables/changes.js'), import('/core/ulid.js'), import('/ui/caps.js')])
    const table = createTable({ name: 'Expenses', columns: [{ name: 'Date', type: 'date' }, { name: 'Amount', type: 'number' }, { name: 'Category', type: 'select', options: ['Food', 'Rent'] }] }, { id: ulid(), author: 'user', at: new Date().toISOString() })
    const place = folderOf(table), [first, second] = [ulid(), ulid()].sort(), rows = [{ row: first, set: { date: '2026-10-01', amount: 40, category: 'Food' } }, { row: second, set: { date: '2026-10-03', amount: 800, category: 'Rent' } }]
    await app.fs.write(`${app.projectDir}/${place}/collection.json`, `${JSON.stringify(table, null, 2)}\n`)
    await app.fs.write(`${app.projectDir}/${place}/changes.jsonl`, stringifyChanges(stamp([], rows, { by: 'user' })))
    await unlock('tables')
    return place
  })
  const change = (/** @type {number} */ n, /** @type {Record<string, unknown>} */ set) => page.evaluate(async ([place, n, cells]) => {
    const { load, change } = await import('/caps/tables/tables.js'), one = /** @type {any} */ (await load(place))
    await change(one, [{ row: one.rows[n].id, set: cells }], 'user')
  }, /** @type {const} */ ([folder, n, set]))

  // Food alone, in its figure and its table, the rent left out; then the rent made food, the page follows.
  await ask(page, 'Make me a food page')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const parts = page.locator('.msg-jean .prose app-parts').last(), figures = parts.locator('ul.figures > li strong'), rows = parts.locator('tbody tr')
  await expect(figures).toHaveText(['40'])
  await expect(rows).toHaveCount(1)
  await change(1, { category: 'Food' })
  await expect(figures).toHaveText(['840'])
  await expect(rows).toHaveCount(2)
  // A row its form adds that isn't food doesn't show.
  const form = parts.locator('form')
  await form.locator('input[type="date"]').fill('2026-10-05')
  await form.locator('input[type="number"]').fill('9')
  await form.locator('select').selectOption('Rent')
  await form.getByRole('button', { name: 'Add expense' }).click()
  await expect.poll(() => page.evaluate((place) => import('/caps/tables/tables.js').then(async ({ load }) => (/** @type {any} */ (await load(place))).rows.length), folder)).toBe(3)
  await expect(figures).toHaveText(['840'])

  // The table's Filter keeping the rent: the note tells the brain, in where's words; the page still shows its own rows.
  await page.evaluate((place) => import('/caps/tables/tables.js').then(async ({ load, reshapeTable }) => reshapeTable(/** @type {any} */ (await load(place)), { view: () => ({ filter: { and: [{ property: 'category', op: 'is', value: 'Rent' }] } }) })), folder)
  const told = await page.evaluate((place) => import('/caps/tables/tables.js').then(({ mentioned }) => mentioned(place)), folder)
  expect(told?.body).toContain('A part\'s `where` keeps only some rows, when only some are asked for: `where="Date is this month"`')
  expect(told?.body).toContain('Its table shows only the rows where Category is Rent now: a page shows every row unless its where says so too.')
  await expect(figures).toHaveText(['840'])

  // A where that names no column: a few words saying so, as each language writes them.
  await ask(page, 'Make me a snacks page')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const unread = page.locator('.msg-jean .prose app-parts').last().locator('p.muted')
  await expect(unread).toHaveText('Expenses: can’t filter by “Kind is Snacks”.')
  await expect(unread).toHaveAttribute('dir', 'auto')
  for (const [lang, words] of [['ar', 'Expenses: تتعذّر التصفية حسب «Kind is Snacks».'], ['ja', 'Expenses：「Kind is Snacks」ではフィルターできません。']]) {
    const settings = await openSettings(page)
    await settings.locator('.settings-panel select').first().selectOption(lang)
    await closeSettings(page)
    await expect(unread).toHaveText(words)
    // Arabic mirrored: the words from the right, as the answer's own.
    if (lang === 'ar') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  }
})

test('in the design system: a collection\'s pane on its paper, its heads in its colour; its workbook\'s head row too; printed from Save, its rows alone, as its view keeps them (D664)', async ({ page }) => {
  await page.addInitScript(() => { /** @type {any} */ (window).print = () => { /** @type {any} */ (window).printed = true } })
  await start(page)
  const folder = 'collections/01K85Z1T00000000000000000P-costs'
  const colour = await page.evaluate(async ({ folder }) => {
    const { app } = await import('/ui/state.js'), at = '2026-10-21T09:00:00.000Z'
    await (await import('/ui/caps.js')).unlock('tables')
    await (await import('/ui/kit.js')).keepKit(null, { tokens: { primary: '#2dd4bf', ink: '#223344', paper: '#fdf6e3', soft: '#eef5f4', fonts: { heading: ['Georgia'], body: ['Verdana'] } } })
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000P', name: 'Costs', author: 'user', created: at, changed: at,
      properties: [{ id: 'item', name: 'Item', type: 'text' }, { id: 'amount', name: 'Amount', type: 'number' }, { id: 'secret', name: 'Hidden one', type: 'text' }], views: [{ id: 'all', name: 'All', type: 'table', hidden: ['secret'] }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, `${JSON.stringify({ row: '01K80000000000000000000001', set: { item: 'Rent', amount: 1200, secret: 'Unseen' }, at, by: 'user' })}\n`)
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Costs.xlsx', title: 'Costs' })
    return (await import('/ui/colour.js')).readable('#2dd4bf', '#fdf6e3')
  }, { folder })
  const pane = page.locator('.view:has(> app-table)')
  await expect(pane.locator('.table-grid')).toBeVisible()
  await expect.poll(() => pane.evaluate((one) => getComputedStyle(one).backgroundColor)).toBe('rgb(253, 246, 227)')
  const rgb = (/** @type {string} */ hex) => `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`
  expect(await pane.locator('.table-grid th').first().evaluate((one) => getComputedStyle(one).color)).toBe(rgb(colour))
  expect(await pane.locator('.table-grid td input').first().evaluate((one) => getComputedStyle(one).fontFamily)).toContain('Verdana')
  // Its workbook: the head row in the colour and the headings' face, on the pale fill, over a line; words in the ink and their face. On white, its own colour there.
  const head = page.locator('app-preview .pane-head')
  await head.getByRole('button', { name: 'Save Costs' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('app-preview .answer-menu').getByRole('button', { name: 'Save Costs.xlsx' }).click()])
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  const styles = new TextDecoder().decode(await readZip(new Uint8Array(Buffer.concat(chunks))).find((one) => one.name === 'xl/styles.xml')?.read())
  const onWhite = (await page.evaluate(async () => (await import('/ui/colour.js')).readable('#2dd4bf', '#ffffff'))).slice(1).toUpperCase()
  expect(styles).toContain(`<font><b/><sz val="11"/><color rgb="FF${onWhite}"/><name val="Georgia"/></font>`)
  expect(styles).toContain('<font><sz val="11"/><color rgb="FF223344"/><name val="Verdana"/></font>')
  expect(styles).toContain('<fgColor rgb="FFEEF5F4"/>')
  expect(styles).toContain(`<bottom style="medium"><color rgb="FF${onWhite}"/></bottom>`)
  // Printed: its name and its rows as the view keeps them, nothing to change them with.
  await head.getByRole('button', { name: 'Save Costs' }).click()
  await page.locator('app-preview .answer-menu').getByRole('button', { name: 'Print' }).click()
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).printed)).toBe(true)
  await page.emulateMedia({ media: 'print' })
  const sheet = page.locator('.paper-print')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('h3')).toHaveText('Costs')
  await expect(sheet.locator('th')).toHaveText(['Item', 'Amount'])
  await expect(sheet.locator('td')).toHaveText(['Rent', new Intl.NumberFormat('en').format(1200)])
  expect(await sheet.locator('td').last().evaluate((one) => getComputedStyle(one).textAlign)).toBe('end')
  await expect(sheet.locator('button, input, select, app-table')).toHaveCount(0)
  expect(await sheet.locator('h3').evaluate((one) => getComputedStyle(one).color)).toBe(rgb(`#${onWhite.toLowerCase()}`))
  await page.evaluate(() => dispatchEvent(new Event('afterprint')))
  await expect(sheet).toHaveCount(0)
  // Save's last line leads to the design system's page.
  await page.emulateMedia({ media: 'screen' })
  await head.getByRole('button', { name: 'Save Costs' }).click()
  await page.locator('app-preview .answer-menu').getByRole('button', { name: 'Design system' }).click()
  await expect(page.locator('dialog.settings').getByRole('heading', { name: 'Design system' })).toBeVisible()
})
