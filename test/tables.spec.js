// Tables you keep (D491), in Chromium and WebKit: offered by a brain that makes them right, then made from a
// request and filled by the brain, beside the conversation; Jean's changes marked, accepted or rejected (D505); a cell changed
// by hand; a row the brain changes from what the user tells it; the board, a card moved by its own step; the
// table downloaded as a workbook; and found again from another task with @. A brain on this computer, which
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
  await expect.poll(() => page.locator('.table-grid thead input').evaluateAll((heads) => heads.map((head) => /** @type {HTMLInputElement} */ (head).value))).toEqual(['Company', 'Role', 'Status', 'Applied on'])
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
  /** The project's collections: each one's name, whether it is pinned, and its rows' first cells. */
  const kept = () => page.evaluate(async () => {
    const tables = await import('/caps/tables/tables.js')
    return Promise.all((await tables.kept()).map(async ({ path }) => ((one) => one && { name: one.table.name, pinned: one.table.pinned ?? false, rows: one.rows.map((row) => row.cells[one.table.properties[0].id] ?? '') })(await tables.load(path))))
  })
  const tasks = await openTasks(page)
  await tasks.getByRole('button', { name: 'Creations', exact: true }).click()
  const creations = page.locator('app-creations'), names = creations.locator('.creation-open')
  // One kind here: no kinds to pick, and its own New.
  await expect(creations.locator('.creations-kinds')).toHaveCount(0)
  await expect(creations.locator('.creations-bar').getByRole('button', { name: 'New collection' })).toBeVisible()
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
