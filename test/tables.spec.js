// SPDX-License-Identifier: MIT
// Tables you keep (D491), in Chromium and WebKit: offered by a brain that makes them right, then made from a
// request and filled by the brain, beside the conversation; Jean's changes marked, accepted or rejected (D505); a cell changed
// by hand; a row the brain changes from what the user tells it; the board, a card moved by its own step; the
// table downloaded as a workbook; and found again from another task with @. Its heads stay on top, each opening its column's
// menu: renamed, made another kind, the rows sorted, a column inserted or deleted; a row moved by its handle. Its bar's Show as, Find and
// Arrange, with a chip for what is arranged, its name in the pane's head, its foot's sums, and lines only between its cells. A cell selected or changed by the keyboard, ⌘Z and ⇧⌘Z, and a row's
// handle's menu, to duplicate or delete it. A relation to this collection
// or another, each of its cells a row there picked by its name, which a brain makes too. A brain on this computer, which
// doesn't make tables right, makes and changes none, but reads them, and finds their rows and documents' words with search_files. In Arabic and Japanese, the view reads as its language does.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, turnOn, openSettings, closeSettings, openTasks, BRAIN_URL, chooseLanguage, nameOf } from './helpers.js'
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

  // Beside the conversation, by its name alone; made and filled by Jean, it is one decision: how many rows, no cell marked (D752).
  await expect(page.locator('app-preview .pane-name')).toHaveValue('Job applications')
  const rows = page.locator('.table-grid tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Company', 'Role', 'Status', 'Applied on'])
  await expect(rows.nth(0).getByTitle('Company')).toHaveValue('Atelier Lune')
  await expect(rows.nth(2).getByTitle('Status')).toHaveValue('To apply')
  await expect(rows.nth(0).getByTitle('Applied on')).toHaveValue('2026-10-18')
  const review = page.getByRole('region', { name: 'Suggested changes' })
  await expect(review).toContainText('3 new rows to review')
  await expect(page.locator('.table-grid .is-jean, .table-decide button')).toHaveCount(0)
  await expect(review.getByRole('button', { name: 'Next change' })).toHaveCount(0)
  await review.getByRole('button', { name: 'Accept all' }).click()
  await expect(review).toHaveCount(0)
  await expect(page.locator('.table-grid .is-jean')).toHaveCount(0)

  // A cell changed by hand is the user's change, after Jean's.
  await rows.nth(1).getByTitle('Role').fill('UX lead, remote')
  await rows.nth(1).getByTitle('Role').press('Tab')
  await expect.poll(async () => (await changes(page)).at(-1)).toMatchObject({ by: 'user', set: { role: 'UX lead, remote' } })

  // Told of an interview, the brain reads the rows and moves that one on: marked, then undone.
  await page.locator('#prompt').fill('Atelier Lune invited me to an interview')
  await page.locator('#prompt').press('Enter')
  await answered(page, 2)
  await expect(rows.nth(0).getByTitle('Status')).toHaveValue('Interview')
  await expect(review).toContainText('1 change to review')
  await expect(page.locator('.table-grid :is(td, th).is-jean')).toHaveCount(1)
  expect((await changes(page)).at(-1)).toMatchObject({ by: 'jean', set: { status: 'Interview' }, why: 'the email of 23 October' })
  await review.getByRole('button', { name: 'Reject all' }).click()
  await expect(rows.nth(0).getByTitle('Status')).toHaveValue('Applied')
  await expect(review).toHaveCount(0)

  // The board, from Show as at the bar's start: a lane for each step, in order, each card moved by its own step.
  await page.locator('.table-shows').getByRole('button', { name: 'Board' }).click()
  await expect(page.locator('.table-shows').getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true')
  const lanes = page.locator('.table-lane')
  await expect(lanes.locator('h3 > span[dir]')).toHaveText(['To apply', 'Applied', 'Interview', 'Offer'])
  await expect(lanes.nth(1).locator('.table-card')).toHaveCount(2)
  await lanes.nth(0).locator('.table-card').getByTitle('Status').selectOption('Applied')
  await expect(lanes.nth(1).locator('.table-card')).toHaveCount(3)
  await expect(lanes.nth(0).locator('.table-card')).toHaveCount(0)

  // The pane's Download gives the table as a workbook, named so.
  await page.locator('app-preview .pane-head .icon-group > [popovertarget^="out-"]').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('app-preview .out-menu').getByRole('button', { name: /^Excel/ }).click()])
  expect(nameOf(download)).toBe('Job applications.xlsx')

  // From another task, @ offers the project's tables by name, and one picked opens beside the conversation.
  await page.locator('.wordmark').click()
  await expect(page.locator('.hero-question')).toBeVisible()
  const box = page.locator('#prompt')
  await box.pressSequentially('Look at @job')
  await expect(page.locator('#complete .complete-heading').first()).toHaveText('Creations')
  await expect(page.locator('#complete [aria-selected="true"]')).toContainText('Job applications')
  await box.press('Enter')
  await expect(box).toHaveValue('Look at @Job applications ')
  await expect(page.locator('app-preview .pane-name')).toHaveValue('Job applications')
  await expect(page.locator('.table-grid tbody tr')).toHaveCount(3)
  // Its card among the creations shows its heads and first rows (D497).
  await (await openTasks(page)).getByRole('button', { name: 'Creations', exact: true }).click()
  const card = page.locator('app-creations .creation', { hasText: 'Job applications' })
  await expect(card.locator('.creation-preview th')).toHaveText(['Company', 'Role', 'Status', 'Applied on'])
  await expect(card.locator('.creation-preview tr').nth(1).locator('td').first()).toHaveText('Atelier Lune')
})

test('Jean’s changes to three rows are each accepted or rejected, on the table and on the board, and Reject all leaves what was decided (D505)', async ({ page }) => {
  await start(page)
  await planBrain(page)
  await ask(page, 'Keep track of my job applications: Atelier Lune, Brightwater and Kōsha Studio')
  await page.locator('.msg-jean .approval').getByRole('button', { name: 'Turn it on' }).click()
  await answered(page)
  const review = page.getByRole('region', { name: 'Suggested changes' }), said = page.locator('.table-view > [role="status"]'), tools = page.locator('.table-tools button').first()
  await expect(said).toHaveText('3 new rows to review')
  await review.getByRole('button', { name: 'Accept all' }).click()
  // Said, the bar gone with the button pressed, and the keyboard on the view's tools rather than lost.
  await expect(said).toHaveText('0 changes to review')
  await expect(tools).toBeFocused()
  const rows = page.locator('.table-grid tbody tr')
  await expect(rows.nth(1).getByTitle('Status')).toHaveValue('Applied')
  /** Jean moves each row on, from an email. @param {string[]} steps */
  const moved = (steps) => page.evaluate(async (status) => {
    const { shown, change } = await import('/caps/tables/tables.js')
    const one = /** @type {any} */ (shown.value)
    await change(one, one.rows.map((/** @type {{ id: string }} */ row, /** @type {number} */ i) => ({ row: row.id, set: { status: status[i] } })), 'jean', 'the email of 23 October')
  }, steps)
  await moved(['Interview', 'Offer', 'Applied'])
  await expect(review).toContainText('3 changes to review')
  await expect(page.locator('.table-grid :is(td, th).is-jean')).toHaveCount(3)

  // Accepted, a row is the user's own, and the keyboard goes on to the next row's.
  await rows.nth(0).getByRole('button', { name: 'Accept' }).click()
  await expect(review).toContainText('2 changes to review')
  await expect(said).toHaveText('2 changes to review')
  await expect(rows.nth(0).getByTitle('Status')).toHaveValue('Interview')
  await expect(rows.nth(0).locator(':is(td, th).is-jean')).toHaveCount(0)
  await expect(rows.nth(0).getByRole('button', { name: 'Accept' })).toHaveCount(0)
  await expect(rows.nth(1).getByRole('button', { name: 'Accept' })).toBeFocused()
  // Rejected, it is as it was.
  await rows.nth(1).getByRole('button', { name: 'Reject' }).click()
  await expect(review).toContainText('1 change to review')
  await expect(said).toHaveText('1 change to review')
  await expect(rows.nth(1).getByTitle('Status')).toHaveValue('Applied')
  await expect(rows.nth(1).locator(':is(td, th).is-jean')).toHaveCount(0)
  // Reject all takes back what is left, not what the user accepted.
  await review.getByRole('button', { name: 'Reject all' }).click()
  await expect(review).toHaveCount(0)
  await expect(said).toHaveText('0 changes to review')
  await expect(tools).toBeFocused()
  await expect(rows.nth(0).getByTitle('Status')).toHaveValue('Interview')
  await expect(rows.nth(1).getByTitle('Status')).toHaveValue('Applied')
  await expect(rows.nth(2).getByTitle('Status')).toHaveValue('To apply')
  expect((await changes(page)).slice(-3).map((line) => [line.by, line.set?.status])).toEqual([['user', 'Interview'], ['user', 'Applied'], ['user', 'To apply']])

  // On the board, a card Jean moved has its own too.
  await moved(['Offer', 'Interview', 'To apply'])
  await page.locator('.table-shows').getByRole('button', { name: 'Board' }).click()
  const card = page.locator('.table-card.is-jean').filter({ hasText: 'Brightwater' })
  await card.getByRole('button', { name: 'Reject' }).click()
  await expect(page.locator('.table-lane').nth(1).locator('.table-card').filter({ hasText: 'Brightwater' })).toHaveCount(1)
  await expect(review).toContainText('2 changes to review')
})

test('a collection Jean made and filled is one decision, a cell the person changes meanwhile changing nothing of it; Rejected, its rows go, leaving it empty; a row Jean made then changed goes whole, never left empty (D752)', async ({ page }) => {
  await start(page)
  /** A collection Jean made, its rows Jean's from one change, then each step given. @param {string} name @param {object[][]} more each a change's lines */
  const seed = (name, more = []) => page.evaluate(async ([name, more]) => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const id = name === 'Trips' ? '01K85Z1T00000000000000000T' : '01K85Z1T00000000000000000V', folder = `collections/${id}-${name.toLowerCase()}`, at = (/** @type {number} */ minute) => `2026-11-14T09:0${minute}:00.000Z`
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id, name, author: 'jean', created: at(0), changed: at(0),
      properties: [{ id: 'where', name: 'Where', type: 'text' }, { id: 'nights', name: 'Nights', type: 'number' }], views: [{ id: 'table', type: 'table' }] }))
    const lines = [['01K80000000000000000000001', 'Lyon', 2], ['01K80000000000000000000002', 'Nice', 3]].map(([row, where, nights]) => ({ row, set: { where, nights }, at: at(1), by: 'jean' }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, [...lines, ...more.flat()].map((line) => `${JSON.stringify(line)}\n`).join(''))
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: `${name}.xlsx`, title: name }, true)
    return folder
  }, /** @type {const} */ ([name, more]))
  const review = page.getByRole('region', { name: 'Suggested changes' }), rows = page.locator('.table-grid tbody tr')
  await seed('Trips', [[{ row: '01K80000000000000000000001', set: { nights: 4 }, at: '2026-11-14T09:02:00.000Z', by: 'user' }]])
  await expect(review).toContainText('2 new rows to review')
  await expect(page.locator('.table-grid .is-jean, .table-decide button')).toHaveCount(0)
  await review.getByRole('button', { name: 'Reject all' }).click()
  // The person's cell stays theirs; Jean's go, and the row Jean made that nobody else wrote in goes whole.
  await expect(review).toHaveCount(0)
  await expect(rows).toHaveCount(1)
  await expect(rows.first().getByTitle('Nights')).toHaveValue('4')
  await expect(rows.first().getByTitle('Where')).toHaveValue('')

  // Changed by Jean after it made them, its changes are marked as ever; Reject all takes each row whole, none left empty.
  await page.locator('app-preview .pane-head button').last().click()
  await seed('Visits', [[{ row: '01K80000000000000000000002', set: { nights: 5 }, at: '2026-11-14T09:03:00.000Z', by: 'jean' }]])
  await expect(review).toContainText('5 changes to review')
  await expect(page.locator('.table-grid :is(td, th).is-jean')).toHaveCount(4)
  await review.getByRole('button', { name: 'Reject all' }).click()
  await expect(review).toHaveCount(0)
  await expect(rows).toHaveCount(0)
  await expect(page.locator('.table-view .table-none [role="status"]')).toHaveText('No rows yet.')
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
  /** Its number pressed until its source shows: the end of an answer scrolls the task, which can move the number from under a press. @param {() => Promise<void>} shown */
  const opens = (shown) => expect(async () => {
    await page.locator('.msg-jean .prose').last().locator('.cite').click()
    await shown()
  }).toPass()
  await opens(() => expect(page.locator('.table-grid tbody tr')).toHaveCount(2, { timeout: 2000 }))
  await ask(page, 'What do the files say about Lisbon?')
  await answered(page, 3)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('The offsite is in Lisbon, with Robert Doisneau.')
  await opens(() => expect(page.locator('.document .ProseMirror')).toContainText('The offsite is in Lisbon', { timeout: 2000 }))
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
    await expect.poll(() => page.locator('.table-shows button').evaluateAll((all) => all.map((one) => one.getAttribute('aria-label')))).toEqual([table, board])
    await expect(page.locator('.table-total').first()).toHaveText(lang === 'ar' ? 'حساب' : '計算')
    await expect(page.locator('.table-view .review')).toContainText(review)
    await expect(page.locator('.table-view > [role="status"]')).toHaveText(review)
    await expect(page.locator('.table-grid tbody tr').first().getByTitle('الحالة')).toHaveValue('مقابلة')
    await expect(page.locator('.table-decide button').first()).toHaveAttribute('aria-label', lang === 'ar' ? 'قبول' : '承認')
    // The table starts at the pane's start edge, the right one in Arabic.
    const [view, grid] = await Promise.all(['.table-view', '.table-grid'].map((selector) => page.locator(selector).boundingBox()))
    if (lang === 'ar') expect(Math.abs((view?.x ?? 0) + (view?.width ?? 0) - (grid?.x ?? 0) - (grid?.width ?? 0))).toBeLessThan(4)
    else expect(Math.abs((view?.x ?? 0) - (grid?.x ?? 0))).toBeLessThan(4)
    // Show as at the bar's start and its tools at its end, on the left in Arabic; the name in the pane's head alone; a line between two cells on their start side.
    const [shows, tools] = await Promise.all(['.table-shows', '.table-tools'].map((selector) => page.locator(selector).boundingBox()))
    expect(lang === 'ar' ? (tools?.x ?? 0) < (shows?.x ?? 0) : (tools?.x ?? 0) > (shows?.x ?? 0)).toBe(true)
    await expect(page.locator('app-preview .pane-name')).toHaveValue('وظائف')
    await expect(page.locator('.table-view .table-name')).toHaveCount(0)
    expect(await page.locator('.table-grid tbody td:nth-child(3)').first().evaluate((td) => getComputedStyle(td)[document.dir === 'rtl' ? 'borderRightWidth' : 'borderLeftWidth'])).toBe('1px')
    // The arrows select the cell they point at, the next one on the left in Arabic, and a row's handle opens its menu in the language's words.
    const cells = page.locator('.table-grid tbody tr').first().locator(':is(td, th)[tabindex]')
    await cells.first().focus()
    await page.keyboard.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight')
    await expect(cells.nth(1)).toBeFocused()
    await page.locator('.table-grip button').first().click()
    await expect(page.locator('.table-menu:popover-open button')).toHaveText(lang === 'ar' ? ['إدراج أسفل', 'تكرار', 'نقل إلى الأعلى', 'نقل إلى الأسفل', 'حذف'] : ['下に挿入', '複製', '上へ移動', '下へ移動', '削除'])
    // A column's menu moves it to the language's start or end: right first in Arabic.
    await page.keyboard.press('Escape')
    await page.locator('.table-grid .table-head').first().click()
    await expect(page.locator('.table-menu:popover-open').getByRole('button', { name: lang === 'ar' ? 'نقل إلى اليمين' : '左へ移動' })).toBeDisabled()
  })
}

/**
 * A budget of four rows whose cost is money (in `currency`) and whose stage is a status, grouped by it, opened beside the task (D752).
 * @param {import('@playwright/test').Page} page @param {string} [currency] @param {string[]} [words] its columns' names, then its steps
 */
const budget = (page, currency = 'EUR', words = ['Item', 'Cost', 'Stage', 'Due', 'To pay', 'Paid']) => page.evaluate(async ([currency, words]) => {
  const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
  await unlock('tables')
  const folder = 'collections/01K85Z1T00000000000000000W-budget', at = '2026-11-14T09:00:00.000Z', [item, cost, stage, due, open, paid] = words
  await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000W', name: 'Budget', author: 'user', created: at, changed: at,
    properties: [{ id: 'item', name: item, type: 'text' }, { id: 'cost', name: cost, type: 'number', format: 'money', currency }, { id: 'stage', name: stage, type: 'status', options: [{ name: open, group: 'todo' }, { name: paid, group: 'done' }] },
      { id: 'due', name: due, type: 'date' }, ...['Venue', 'Notes', 'Owner', 'Email', 'Phone'].map((name) => ({ id: name.toLowerCase(), name, type: 'text' }))], views: [{ id: 'table', type: 'table', group: 'stage' }] }))
  const rows = [['Venue hire', 480, open, '2026-09-12'], ['Cakes and tea', 62.5, paid, null], ['Raffle prizes', 120, open, '2026-09-20'], ['Posters', 35, paid, '2026-08-30']]
  await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, rows.map(([item, cost, stage, due], i) => `${JSON.stringify({ row: `01K8000000000000000000000${i}`, set: { item, cost, stage, ...(due && { due }), notes: 'A note long enough to need room' }, at, by: 'user' })}\n`).join(''))
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Budget.xlsx', title: 'Budget' }, true)
}, /** @type {const} */ ([currency, words]))

for (const [lang, currency, words, money, sum, group, arrange] of /** @type {const} */ ([
  ['ar', 'SAR', ['البند', 'التكلفة', 'المرحلة', 'الموعد', 'للدفع', 'مدفوع'], '480.00 ر.س.', 'المجموع', 'المجموع الفرعي', 'تنظيم'],
  ['ja', 'JPY', ['項目', '費用', '段階', '期日', '未払い', '支払済み'], '￥480', '合計', '小計', '整理'],
])) {
  test(`in ${lang}, a collection's money, groups, chips and readings are the language's, its amounts at the cell's end, its fade at the end edge (D752)`, async ({ page }) => {
    await start(page, lang)
    await budget(page, currency, words)
    const grid = page.locator('.table-grid')
    await expect(page.locator('.table-tools > .icon-button')).toHaveAttribute('aria-label', arrange)
    // A chip names the group by its column; the groups' heads in the steps' words, each subtotal in the currency, said in the language.
    await expect(page.locator('.table-chips > li').first()).toHaveText(words[2])
    await expect(grid.locator('tr.table-group .table-fold')).toHaveText([new RegExp(words[4]), new RegExp(words[5])])
    await expect(grid.locator('tr.table-group .table-sub .visually-hidden').first()).toHaveText(group)
    // Each amount reads as money in the language, its field showing once its cell has the keys; the foot's Sum from the start.
    const first = grid.locator('tbody tr[data-row]').first(), reading = first.locator('.table-read.is-amount')
    await expect(reading).toContainText(money)
    await expect(first.getByTitle(words[1])).toHaveCSS('opacity', '0')
    await expect(grid.locator('tfoot .table-total').nth(1)).toContainText(sum)
    // At the cell's end: the left in Arabic, the right in Japanese.
    const [cell, said] = await reading.evaluate((bdi) => { const range = document.createRange(); range.selectNodeContents(bdi); return [/** @type {Element} */ (bdi.parentElement).getBoundingClientRect().toJSON(), range.getBoundingClientRect().toJSON()] })
    if (lang === 'ar') expect(said.left - cell.left).toBeLessThan(16)
    else expect(cell.right - said.right).toBeLessThan(16)
    await first.getByTitle(words[1]).focus()
    await expect(first.getByTitle(words[1])).toHaveCSS('opacity', '1')
    await expect(reading).toHaveCSS('visibility', 'hidden')
    // More past the end edge: the fade there, on the left in Arabic.
    const [fade, view] = await Promise.all([page.locator('.table-fade'), page.locator('.table-view')].map((one) => one.boundingBox()))
    await expect(page.locator('.table-fade')).toHaveClass(/is-more/)
    if (lang === 'ar') expect(Math.abs((fade?.x ?? 0) - (view?.x ?? 0))).toBeLessThan(24)
    else expect(Math.abs((fade?.x ?? 0) + (fade?.width ?? 0) - (view?.x ?? 0) - (view?.width ?? 0))).toBeLessThan(24)
  })
}

test('at 320 px a collection loses nothing: its bar on one line, its chips wrapping, nothing past the page, its first column scrolling with the rest (D752)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await start(page)
  await budget(page)
  await expect(page.locator('.table-grid tbody tr[data-row]')).toHaveCount(4)
  const [bar, shows, tools] = await Promise.all(['.table-bar', '.table-shows', '.table-tools'].map((one) => page.locator(one).boundingBox()))
  expect(bar?.height ?? 99).toBeLessThan(64)
  expect(Math.abs((shows?.y ?? 0) - (tools?.y ?? 0))).toBeLessThan(8)
  for (const box of [bar, shows, tools]) expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 320).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  const chip = await page.locator('.table-chips').boundingBox()
  expect((chip?.x ?? 0) + (chip?.width ?? 0)).toBeLessThanOrEqual(320)
  await expect(page.locator('.table-grid tbody tr[data-row] > :nth-child(2)').first()).not.toHaveCSS('position', 'sticky')
  // Each reading stays inside its cell.
  for (const reading of await page.locator('.table-read').all()) {
    const [inner, outer] = await Promise.all([reading.boundingBox(), reading.locator('..').boundingBox()])
    expect((inner?.x ?? 0) >= (outer?.x ?? 0) - 1 && (inner?.x ?? 0) + (inner?.width ?? 0) <= (outer?.x ?? 0) + (outer?.width ?? 0) + 1).toBe(true)
  }
})

test('under forced colours a collection\'s fields show and its readings go; with more contrast its fade is a line (D752)', async ({ page, browserName }) => {
  await start(page)
  await budget(page)
  const first = page.locator('.table-grid tbody tr[data-row]').first()
  await expect(first.getByTitle('Cost')).toHaveCSS('opacity', '0')
  await page.emulateMedia({ contrast: 'more' })
  await expect(page.locator('.table-fade')).toHaveCSS('background-image', 'none')
  await expect(page.locator('.table-fade')).toHaveCSS('border-inline-end-width', '2px')
  test.skip(browserName !== 'chromium', 'forced colours are emulated in Chromium alone')
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(first.locator('.table-read').first()).toBeHidden()
  await expect(first.getByTitle('Cost')).toHaveCSS('opacity', '1')
})

test('in each of the 12 looks, by day and by night, a collection\'s first column stays on a ground of its own and its readings read at AA (D752)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await start(page)
  await budget(page)
  await page.locator('.table-scroll').evaluate((box) => { box.scrollLeft = 300 })
  const looks = await page.evaluate(async () => Object.keys((await import('/ui/looks.js')).LOOKS))
  expect(looks).toHaveLength(12)
  const failures = []
  for (const look of looks) {
    for (const scheme of /** @type {const} */ (['light', 'dark'])) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.evaluate(async (id) => (await import('/ui/state.js')).setLook({ id }), look)
      await expect(page.locator('html')).toHaveAttribute('data-look', look)
      const said = await page.evaluate(() => {
        const rgb = (/** @type {string} */ css) => { const c = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d')); c.fillStyle = css; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data] }
        const lum = (/** @type {number[]} */ [r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
        const contrast = (/** @type {number[]} */ a, /** @type {number[]} */ b) => ((x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05))(lum(a), lum(b))
        const cell = /** @type {HTMLElement} */ (document.querySelector('.table-grid tbody tr[data-row] > :nth-child(2)')), reading = /** @type {HTMLElement} */ (document.querySelector('.table-read.is-amount'))
        const ground = getComputedStyle(cell), head = getComputedStyle(/** @type {HTMLElement} */ (document.querySelector('.table-grid thead th')))
        return { position: ground.position, alpha: rgb(ground.backgroundColor)[3], same: ground.backgroundColor === head.backgroundColor, ratio: contrast(rgb(getComputedStyle(reading).color), rgb(head.backgroundColor)) }
      })
      if (said.position !== 'sticky' || said.alpha !== 255 || !said.same || said.ratio < 4.5) failures.push(`${look} ${scheme}: ${JSON.stringify(said)}`)
    }
  }
  expect(failures).toEqual([])
})

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
  // A number's page says how it is written too, plain, money or a share, under its kinds.
  await (await menu('Nights booked')).getByRole('button', { name: /^Type/ }).click()
  await expect(page.locator('.table-menu:popover-open [aria-current="true"]').first()).toBeFocused()
  await expect(page.locator('.table-menu:popover-open [aria-current="true"]')).toHaveText(['Number', 'Plain number'])
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Text' }).click()
  await expect.poll(async () => (await file())?.nights.slice(0, 3)).toEqual(['1', '8', '15'])
  await (await menu('Nights booked')).getByRole('button', { name: /^Type/ }).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Number' }).click()
  await expect.poll(async () => (await file())?.nights.slice(0, 3)).toEqual([1, 8, 15])
  await (await menu('Stage')).getByRole('button', { name: /^Type/ }).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Text' }).click()
  await expect.poll(async () => (await file())?.board).toBe(false)
  await expect(page.locator('.table-panel button[aria-current]')).toHaveCount(0)

  // Sorted from Z to A, then from A to Z: the rows keep that order.
  await (await menu('Nights booked')).getByRole('button', { name: 'Sort Z → A' }).click()
  await expect(rows.first().getByTitle('Nights booked')).toHaveValue('24')
  await expect(rows.last().getByTitle('Nights booked')).toHaveValue('1')
  await (await menu('Nights booked')).getByRole('button', { name: 'Sort A → Z' }).click()
  await expect(rows.first().getByTitle('Nights booked')).toHaveValue('1')
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
  // Said, with an Undo that brings it back where it was, the keyboard on the head in its place.
  await expect(heads.nth(1)).toBeFocused()
  await page.locator('.toast', { hasText: 'Column “Country” deleted.' }).getByRole('button', { name: 'Undo' }).click()
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
  // Move left and Move right in its menu do it by a press, as far as the line goes, the keyboard staying on its head.
  await expect((await menu('Name')).getByRole('button', { name: 'Move left' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await (await menu('Text')).getByRole('button', { name: 'Move right' }).click()
  await expect(heads).toHaveText(['Name', 'Nights booked', 'Text', 'Stage'])
  await expect(heads.nth(2)).toBeFocused()
  await expect.poll(ids).toEqual(['name', 'nights', 'text-2', 'stage'])

  // Hide takes a column out of the table as Arrange's columns shown does, which then has it unticked, a chip under the bar saying how many; a press
  // on the chip opens Arrange on its column, and its × shows every column again; the name column has none.
  await expect((await menu('Name')).getByRole('button', { name: 'Hide' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await (await menu('Text')).getByRole('button', { name: 'Hide' }).click()
  await expect(heads).toHaveText(['Name', 'Nights booked', 'Stage'])
  const chip = page.locator('.table-chips > li')
  await expect(chip).toHaveCount(1)
  await expect(chip.locator('button').first()).toHaveText('1 column hidden')
  await chip.locator('button').first().click()
  await expect(page.locator('.table-panel:popover-open').getByRole('checkbox', { name: 'Text' })).toBeFocused()
  await expect(page.locator('.table-panel:popover-open').getByRole('checkbox', { name: 'Text' })).not.toBeChecked()
  await page.locator('.table-panel:popover-open').getByRole('checkbox', { name: 'Text' }).check()
  await expect(heads).toHaveText(['Name', 'Nights booked', 'Text', 'Stage'])
  await expect(chip).toHaveCount(0)
  await page.keyboard.press('Escape')
  await (await menu('Text')).getByRole('button', { name: 'Hide' }).click()
  await page.locator('.table-chips').getByRole('button', { name: 'Show every column' }).click()
  await expect(heads).toHaveText(['Name', 'Nights booked', 'Text', 'Stage'])

  // A row's handle shows with the pointer on its row, or the keyboard, which Tab brings to it from the row before; dragged over
  // another row's first half, the row goes before it.
  // Its dots are drawn by its style sheet (an svg's style changing would lay out the whole table).
  const handle = (/** @type {number} */ n) => rows.nth(n).getByRole('button', { name: 'Move row' })
  const dots = (/** @type {number} */ n) => handle(n).evaluate((button) => getComputedStyle(button, '::before').visibility)
  await page.mouse.move(0, 0)
  await expect.poll(() => dots(2)).toBe('hidden')
  await rows.nth(1).getByTitle('Stage', { exact: true }).focus()
  // WebKit, as Safari, tabs to buttons with Alt.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
  await expect(handle(2)).toBeFocused()
  await expect.poll(() => dots(2)).toBe('visible')
  await handle(2).blur()
  await rows.nth(2).hover()
  await expect.poll(() => dots(2)).toBe('visible')
  await handle(2).dragTo(rows.nth(0), { targetPosition: { x: 60, y: 4 } })
  await expect(rows.first().getByTitle('Nights booked')).toHaveValue('3')
  await expect.poll(async () => (await file())?.nights.slice(0, 4)).toEqual([3, 1, 2, 4])
  // The arrows move it by one, the keyboard staying on its handle.
  await handle(0).focus()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1).getByTitle('Nights booked')).toHaveValue('3')
  await expect(handle(1)).toBeFocused()
  await expect.poll(async () => (await file())?.nights.slice(0, 4)).toEqual([1, 3, 2, 4])
  // Or by Move up and Move down in its menu, the first row's Move up greyed.
  await handle(1).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Move up' }).click()
  await expect(rows.first().getByTitle('Nights booked')).toHaveValue('3')
  await expect(handle(0)).toBeFocused()
  await handle(0).click()
  await expect(page.locator('.table-menu:popover-open').getByRole('button', { name: 'Move up' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await file())?.nights.slice(0, 4)).toEqual([3, 1, 2, 4])
  expect(JSON.parse((await file())?.text ?? '{}').order).toHaveLength(24)

  // Made a status, the column of stages, text with no choices, takes three steps to start with, and its board comes back.
  await (await menu('Stage')).getByRole('button', { name: /^Type/ }).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Status' }).click()
  await expect.poll(async () => (await file())?.board).toBe(true)
  await expect(rows.first().getByTitle('Stage', { exact: true }).locator('option')).toHaveText(['—', 'To do', 'In progress', 'Done'])
  // The last head adds what Jean works out too: when each row was made, its name to type at once.
  await page.locator('.table-add-column').click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Date made' }).click()
  await expect(box).toHaveValue('Date made')
  await page.keyboard.press('Enter')
  await expect(rows.first().locator('time')).toHaveAttribute('datetime', /^2026-10-23T09:/)
  await expect.poll(async () => (await file())?.columns.slice(-2)).toEqual(['stage Stage (status)', 'date-made Date made (created-at)'])
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
  const rows = page.locator('.table-grid tbody tr'), names = rows.getByTitle('Name'), values = () => names.evaluateAll((all) => all.map((field) => /** @type {HTMLInputElement} */ (field).value))
  const cell = (/** @type {number} */ row, /** @type {number} */ column) => rows.nth(row).locator(':is(td, th)[tabindex]').nth(column)
  // The pane names it by its name alone, not as the workbook it downloads as.
  await expect(page.locator('app-preview .pane-name')).toHaveValue('Trips')
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
  await expect(menu.getByRole('listitem')).toHaveText(['Insert below', 'Duplicate', 'Move up', 'Move down', 'Delete'])
  await menu.getByRole('button', { name: 'Duplicate' }).click()
  await expect.poll(values).toEqual(['Lyon and Annecy', 'Porto', 'Porto', 'Kyoto'])
  await expect(rows.nth(2).getByTitle('Days')).toHaveValue('3')
  await rows.nth(0).hover()
  await handle(0).click({ button: 'right' })
  await menu.getByRole('button', { name: 'Delete' }).click()
  await expect.poll(values).toEqual(['Porto', 'Porto', 'Kyoto'])
  // Said, with an Undo, the keyboard on the handle of the row in its place.
  await expect(page.locator('.toast', { hasText: 'Row “Lyon and Annecy” deleted.' }).getByRole('button', { name: 'Undo' })).toBeVisible()
  await expect(handle(0)).toBeFocused()
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

test('a value its column refuses stays, marked, its form said beside it, the keyboard on it; a row deleted comes back by its Undo', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const folder = 'collections/01K85Z1T00000000000000000M-people', at = '2026-11-02T09:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000M', name: 'People', author: 'user', created: at, changed: at,
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'mail', name: 'Email', type: 'email' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, ['Ada', 'Grace'].map((name, i) => `${JSON.stringify({ row: `01K8000000000000000000000${i}`, set: { name }, at: `2026-11-02T09:0${i + 1}:00.000Z`, by: 'user' })}\n`).join(''))
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'People', title: 'People' })
  })
  const rows = page.locator('.table-grid tbody tr'), mail = rows.nth(0).getByTitle('Email')
  // Each row is headed by its name.
  await expect(page.getByRole('rowheader')).toHaveCount(2)
  await mail.fill('ada at home')
  await mail.press('Enter')
  await expect(mail).toBeFocused()
  await expect(mail).toHaveValue('ada at home')
  await expect(mail).toHaveAttribute('aria-invalid', 'true')
  await expect(mail).toHaveAccessibleDescription('Write an email address, such as name@example.com.')
  await expect(rows.nth(0).getByRole('alert')).toHaveText('Write an email address, such as name@example.com.')
  expect((await changes(page)).some((line) => line.set?.mail)).toBe(false)
  // Put right, it is kept, and Enter goes on to the cell under it.
  await mail.fill('ada@example.com')
  await mail.press('Enter')
  await expect(mail).not.toHaveAttribute('aria-invalid')
  await expect(rows.nth(1).locator('td[tabindex]')).toBeFocused()
  await expect.poll(async () => (await changes(page)).at(-1)).toMatchObject({ by: 'user', set: { mail: 'ada@example.com' } })
  // Escape leaves a wrong one as the cell was.
  await mail.fill('nope')
  await mail.press('Enter')
  await mail.press('Escape')
  await expect(mail).toHaveValue('ada@example.com')
  await expect(mail).not.toHaveAttribute('aria-invalid')

  await rows.nth(1).getByRole('button', { name: 'Move row' }).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Delete' }).click()
  await expect(rows).toHaveCount(1)
  await page.locator('.toast', { hasText: 'Row “Grace” deleted.' }).getByRole('button', { name: 'Undo' }).click()
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1).getByTitle('Name')).toHaveValue('Grace')
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
  await expect(rows.nth(0).locator(':is(td, th)[tabindex]').nth(3)).toBeFocused()
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
  await rows.nth(0).locator(':is(td, th)[tabindex]').first().focus()
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(totals).toHaveText(['247.5', '120'])
  // The foot sums it; the last head adds one.
  await page.locator('.table-total').nth(3).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Sum' }).click()
  await expect(page.locator('.table-total').nth(3)).toContainText('367.5')
  await page.locator('.table-add-column').click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Formula' }).click()
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
      ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Wide', title: 'Wide' }, true)
    })
    const heads = page.locator('.table-grid .table-head'), box = /** @type {{ x: number, width: number }} */ (await page.locator('.table-scroll').boundingBox())
    await expect(heads).toHaveCount(9)
    // A head the table's box cuts at the window's side, scrolled there, whatever the fonts make of the columns' widths; clicked where it shows.
    const edge = lang === 'ar' ? box.x + 6 : box.x + box.width - 6, head = heads.nth(6)
    const at = /** @type {{ x: number, width: number }} */ (await head.boundingBox())
    await page.locator('.table-scroll').evaluate((scroll, by) => { scroll.scrollLeft += by }, at.x - (lang === 'ar' ? edge + 20 - at.width : edge - 20))
    const cut = /** @type {{ x: number, y: number, width: number, height: number }} */ (await head.boundingBox())
    expect(cut.x < edge && cut.x + cut.width > edge && (cut.x < 0 || cut.x + cut.width > width)).toBe(true)
    await page.mouse.click(edge, cut.y + cut.height / 2)
    const menu = page.locator('.table-menu:popover-open')
    await expect(menu.getByRole('button').first()).toBeVisible()
    // Inside the window, whatever its height: no taller than the room under or over its head, scrolling.
    await expect.poll(async () => ((one) => one && one.x >= 0 && one.x + one.width <= width && one.y >= 0 && one.y + one.height <= height)(await menu.boundingBox())).toBe(true)
  })
}

test('a collection’s bar finds rows with Find, as Creations does, and Arrange keeps those its filter’s rules keep, sorts, hides columns and groups, each said by a chip; Show as shows the board; its foot sums a column; a line under its heads and rows and between its cells, the + plain, a head’s menu on a right click, and no words selected', async ({ page }) => {
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
  const rows = page.locator('.table-grid tbody tr'), items = rows.getByTitle('Item'), tools = page.locator('.table-tools'), panel = page.locator('.table-panel:popover-open')
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
  for (const selector of ['.table-grid thead th', '.table-grid tbody tr:first-child > :nth-child(2)', '.table-grid tbody tr:last-child > :nth-child(2)', '.table-grid tbody tr:nth-child(2) td:last-child']) expect(await borders(selector)).toEqual(['0px', '0px', '0px', '1px'])
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
  // Nothing found is said in a status that was there, empty, before.
  const said = page.locator('.table-view .table-none [role="status"]')
  await expect(said).toHaveText('')
  await search.fill('passport')
  await expect(said).toHaveText('No row matches “passport”.')
  await page.locator('.table-view').getByRole('button', { name: 'Clear' }).click()
  await expect(items).toHaveCount(5)
  await expect(search).toBeFocused()
  await search.fill('taxi')
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(items).toHaveCount(5)
  await expect(page.locator('app-preview .table-view')).toBeVisible()

  // Arrange, at the bar's end, one panel: Group by, Filter, Columns shown and Sort. A rule on Amount, more than 80, keeps three rows, is kept
  // in the table view and shows as a chip under the bar, naming its column.
  const arrange = tools.getByRole('button', { name: 'Arrange', exact: true }), chips = page.locator('.table-chips > li')
  await arrange.click()
  await expect(panel.locator('h3')).toHaveText(['Group by', 'Filter', 'Columns shown', 'Sort'])
  await panel.getByRole('button', { name: 'Add a filter' }).click()
  await panel.getByRole('combobox', { name: 'Column' }).selectOption('Amount')
  await expect(panel.getByRole('combobox', { name: 'Condition' })).toHaveValue('is')
  await panel.getByRole('combobox', { name: 'Condition' }).selectOption('is more than')
  await panel.getByRole('spinbutton', { name: 'Amount' }).fill('80')
  await panel.getByRole('spinbutton', { name: 'Amount' }).press('Enter')
  await expect.poll(values).toEqual(['Train to Lyon', 'Hotel', 'Conférence'])
  await expect(chips).toHaveText(['Amount'])
  await expect(chips.getByRole('button', { name: 'Remove Amount' })).toBeVisible()
  await expect.poll(async () => (await kept())?.filter).toEqual({ and: [{ property: 'amount', op: 'greater-than', value: 80 }] })
  // One that keeps no row says so.
  await panel.getByRole('spinbutton', { name: 'Amount' }).fill('9000')
  await panel.getByRole('spinbutton', { name: 'Amount' }).press('Enter')
  await expect(said).toHaveText('No row meets the filter.')
  await panel.getByRole('spinbutton', { name: 'Amount' }).fill('80')
  await panel.getByRole('spinbutton', { name: 'Amount' }).press('Enter')
  await expect(said).toHaveText('')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  // A press on the chip opens Arrange on its rule, the keyboard on its column.
  await chips.first().locator('button').first().click()
  await expect(panel.getByRole('combobox', { name: 'Column' })).toBeFocused()

  // Sort: Amount from Z to A, once, as the rows' order, with no chip.
  await panel.getByRole('group', { name: 'Amount' }).getByRole('button', { name: 'Sort Z → A' }).click()
  await expect.poll(values).toEqual(['Conférence', 'Hotel', 'Train to Lyon'])
  await expect(chips).toHaveCount(1)

  // Columns shown: Receipt hidden, the name column always shown, a chip saying so; grouped by Stage, a chip naming it; then Show as's board,
  // of the rows the filter keeps, in the stage's lanes, and the table again.
  await expect(panel.getByRole('checkbox', { name: 'Item' })).toBeDisabled()
  await panel.getByRole('checkbox', { name: 'Receipt' }).uncheck()
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Item', 'Amount', 'Stage'])
  await panel.getByRole('combobox', { name: 'Group by' }).selectOption('Stage')
  await expect(chips).toHaveText(['Stage', 'Amount', '1 column hidden'])
  await page.keyboard.press('Escape')
  await page.locator('.table-shows').getByRole('button', { name: 'Board' }).click()
  await expect(page.locator('.table-lane .table-card')).toHaveCount(3)
  await page.locator('.table-shows').getByRole('button', { name: 'Table' }).click()
  await chips.getByRole('button', { name: 'Remove Stage' }).click()
  await expect(chips).toHaveText(['Amount', '1 column hidden'])

  // The foot: Calculate, under Amount, sums the rows shown; Percent filled under Stage.
  const foot = page.locator('.table-grid tfoot .table-total')
  // Each Calculate shows alone, with the pointer on it, its neighbours staying out of sight.
  await foot.nth(1).hover()
  await expect(foot.nth(1)).toHaveCSS('opacity', '1')
  await expect(foot.nth(2)).toHaveCSS('opacity', '0')
  await foot.nth(1).click()
  await expect(page.locator('.table-menu:popover-open button')).toHaveText(['None', 'Sum', 'Average', 'Smallest', 'Largest', 'Count', 'Percent filled'])
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Largest' }).click()
  await expect(foot.nth(1)).toHaveText('Largest 450.00')
  await foot.nth(1).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Sum' }).click()
  await expect(foot.nth(1)).toHaveText('Sum 779.50')
  // New row is the table's own, right under its rows, above the foot.
  const [last, add, sums] = await Promise.all([rows.last(), page.getByRole('button', { name: 'New row' }), page.locator('.table-grid tfoot tr:last-child')].map((one) => one.boundingBox()))
  expect(Math.abs((add?.y ?? 0) - (last?.y ?? 0) - (last?.height ?? 0))).toBeLessThan(2)
  expect((sums?.y ?? 0) + 1).toBeGreaterThan((add?.y ?? 0) + (add?.height ?? 0))
  await foot.nth(2).click()
  await expect(page.locator('.table-menu:popover-open button')).toHaveText(['None', 'Count', 'Percent filled'])
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Percent filled' }).click()
  await expect(foot.nth(2)).toHaveText('Percent filled 100%')
  await expect.poll(async () => (await kept())?.calculate).toEqual({ amount: 'sum', stage: 'percent' })

  // Grouped by Stage: a body of rows under each group's head, its name, how many and its subtotal under Amount, said "Subtotal" to a screen
  // reader; folded, it still says them. A stage changed moves its row to its group, the keys with it, said; the arrows stop at a group's edge.
  await arrange.click()
  await panel.getByRole('combobox', { name: 'Group by' }).selectOption('Stage')
  await page.keyboard.press('Escape')
  const groups = page.locator('.table-grid tr.table-group')
  await expect(groups.locator('.table-fold')).toHaveText([/To pay\s*1/, /Paid\s*2/])
  await expect(groups.nth(1).locator('.table-sub').first()).toHaveText('Subtotal329.50')
  await expect(groups.nth(1).locator('.table-sub .visually-hidden').first()).toHaveText('Subtotal')
  await groups.first().getByRole('button', { expanded: true }).click()
  await expect(groups.first().getByRole('button', { expanded: false })).toBeVisible()
  await expect(page.locator('.table-grid tbody').first().locator('tr[data-row]')).toHaveCount(0)
  await expect(groups.first().locator('.table-sub').first()).toHaveText('Subtotal450.00')
  await groups.first().getByRole('button', { expanded: false }).click()
  const hotel = page.locator('.table-grid tbody').nth(1).locator('tr[data-row]').first()
  await expect(hotel.getByTitle('Item')).toHaveValue('Hotel')
  await hotel.getByTitle('Stage').fill('To pay')
  await hotel.getByTitle('Stage').press('Enter')
  await expect(groups.locator('.table-fold')).toHaveText([/To pay\s*2/, /Paid\s*1/])
  await expect(page.locator('.table-grid tbody').first().locator('tr[data-row]')).toHaveCount(2)
  await expect(page.locator('.table-grid tbody').first().getByTitle('Stage').last()).toBeFocused()
  await expect(page.locator('[role="status"] > .visually-hidden', { hasText: 'Moved to To pay' })).toHaveCount(1)
  await page.locator('.table-grid tbody').first().locator('tr[data-row] [tabindex]').last().focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.table-grid tbody').first().locator('tr[data-row] [tabindex]').last()).toBeFocused()
  await chips.getByRole('button', { name: 'Remove Stage' }).click()

  // All of it kept: closed and opened again, the same rows, columns and sums.
  await page.locator('app-preview .pane-head button').last().click()
  await expect(page.locator('.table-view')).toHaveCount(0)
  await page.evaluate(() => import('/ui/preview.js').then(({ preview }) => preview({ uri: 'collections/01K85Z1T00000000000000000G-expenses', name: 'Expenses.xlsx', title: 'Expenses' })))
  await expect.poll(values).toEqual(['Conférence', 'Hotel', 'Train to Lyon'])
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Item', 'Amount', 'Stage'])
  await expect(foot.nth(1)).toHaveText('Sum 779.50')
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
  const shows = (n, column) => rows.nth(n).getByTitle(column).evaluate((/** @type {HTMLSelectElement} */ select) => select.selectedOptions[0]?.text)
  await expect(heads).toHaveText(['Name', 'Employer'])

  // The last head's list has a relation to this collection and to each other one; Companies' is named after it, its name to change at once.
  await page.locator('.table-add-column').click()
  const adding = page.locator('.table-menu:popover-open')
  await expect(adding.getByRole('button', { name: /^Relation/ })).toHaveText(['Relation This collection', 'Relation Companies'])
  await adding.getByRole('button', { name: 'Relation Companies' }).click()
  await expect(page.locator('.table-grid thead input')).toBeFocused()
  await expect(page.locator('.table-grid thead input')).toHaveValue('Companies')
  await page.keyboard.type('Company')
  await page.keyboard.press('Enter')
  await expect(heads).toHaveText(['Name', 'Employer', 'Company'])
  await expect.poll(async () => (await file())?.columns.at(-1)).toBe(`companies relation ${companies}`)
  // Its head has the keyboard back, which it would take from the cell.
  await expect(heads.last()).toBeFocused()
  // Its cell lists nothing but the row it has, none yet, until the keyboard reaches it: then it picks a row of Companies by its name, and holds the row's id, and goes back to that row as the keyboard leaves.
  const company = rows.nth(0).getByTitle('Company')
  await expect(company.locator('option')).toHaveText(['—'])
  await company.focus()
  await expect(company.locator('option')).toHaveText(['—', 'Acme', 'Globex'])
  await company.selectOption({ label: 'Acme' })
  await expect.poll(async () => (await file())?.cells[0].companies).toBe(id('C', 1))
  await expect(company.locator('option')).toHaveText(['—', 'Acme', 'Globex'])
  await company.blur()
  await expect(company.locator('option')).toHaveText(['—', 'Acme'])
  await expect(company).toHaveValue(id('C', 1))

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
  await page.locator('.table-tools').getByRole('button', { name: 'Arrange', exact: true }).click()
  await page.locator('.table-panel:popover-open').getByRole('group', { name: 'Company' }).getByRole('button', { name: 'Sort Z → A' }).click()
  await expect.poll(() => shows(0, 'Company')).toBe('Zenith')
  await page.keyboard.press('Escape')

  // Made a relation to this collection itself, its cells pick among its own rows.
  await heads.filter({ hasText: 'Company' }).click()
  await menu.getByRole('button', { name: /^Type/ }).click()
  await menu.getByRole('button', { name: /^Relation/ }).click()
  await menu.getByRole('button', { name: 'This collection' }).click()
  await expect.poll(async () => (await file())?.columns.at(-1)).toBe(`companies relation ${contacts}`)
  await rows.nth(1).getByTitle('Company').focus()
  await expect(rows.nth(1).getByTitle('Company').locator('option')).toHaveText(['—', 'Ana', 'Bo'])
  await rows.nth(1).getByTitle('Company').selectOption({ label: 'Ana' })
  await expect.poll(async () => (await file())?.cells[1].companies).toBe(id('E', 1))
  // Duplicated, its copy's relation to itself is to the copy.
  expect(await page.evaluate(async (folder) => {
    const [{ slots }, tables] = await Promise.all([import('/ui/caps.js'), import('/caps/tables/tables.js')])
    const copy = await slots('creations').find((slot) => slot.id === 'tables')?.copy({ path: folder }, 'Contacts (copy)')
    return copy && copy !== folder && (await tables.load(copy))?.table.properties.at(-1)?.collection === copy
  }, contacts)).toBe(true)
})

test('a field in every row holds what it lists only in use: a select’s the list of its column, with the pointer or the keyboard on it, and a relation’s the rows of its collection, pressed or reached, its width kept', async ({ page }) => {
  await start(page)
  const folder = 'collections/01K85Z1T00000000000000000F-visits', far = 'A place with a name far wider than any field in a row of this table', ana = '01K8F000000000000000000001', other = '01K8F000000000000000000002'
  await page.evaluate(async ({ folder, far, ana, other }) => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const at = '2026-10-24T09:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: folder.slice(12, 38), name: 'Visits', author: 'user', created: at, changed: at, views: [{ id: 'table', type: 'table' }],
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'stage', name: 'Stage', type: 'select', options: [{ name: 'Idea' }, { name: 'Booked' }] }, { id: 'city', name: 'City', type: 'select', options: [{ name: 'Paris' }] }, { id: 'near', name: 'Near', type: 'relation', collection: folder }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, [[ana, { name: 'Ana', stage: 'Idea' }], [other, { name: far, near: ana }]].map(([row, set]) => `${JSON.stringify({ row, set, at, by: 'user' })}\n`).join(''))
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Visits', title: 'Visits' })
  }, { folder, far, ana, other })
  const rows = page.locator('.table-grid tbody tr'), stage = rows.nth(0).getByTitle('Stage'), listed = page.locator('.table-grid input[list]'), lists = page.locator('.table-view datalist')
  await expect(rows).toHaveCount(2)

  // One list a column, which no field holds at rest; one holds it with the pointer on it.
  await expect(lists).toHaveCount(2)
  await expect(listed).toHaveCount(0)
  await stage.hover()
  await expect(listed).toHaveCount(1)
  const list = lists.filter({ has: page.locator('option[value="Idea"]') })
  await expect(stage).toHaveAttribute('list', String(await list.getAttribute('id')))
  await page.mouse.move(0, 0)
  await expect(listed).toHaveCount(0)
  // With the keyboard on it, wherever the pointer goes; a new choice written in it joins the list, as the cell under it is selected.
  await stage.focus()
  await stage.hover()
  await page.mouse.move(0, 0)
  await expect(stage).toHaveAttribute('list', String(await list.getAttribute('id')))
  await stage.fill('Done')
  await page.keyboard.press('Enter')
  await expect(list.locator('option')).toHaveCount(3)
  await expect(listed).toHaveCount(0)

  // A relation's field lists the row it has; pressed, every row there as its menu opens, its width as it was.
  const near = rows.nth(0).getByTitle('Near')
  await expect(near.locator('option')).toHaveText(['—'])
  await expect(rows.nth(1).getByTitle('Near').locator('option')).toHaveText(['—', 'Ana'])
  await expect(rows.nth(1).getByTitle('Near')).toHaveValue(ana)
  const width = (await near.boundingBox())?.width
  await near.dispatchEvent('mousedown')
  await expect(near.locator('option')).toHaveText(['—', 'Ana', far])
  expect((await near.boundingBox())?.width).toBe(width)
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
  await expect(page.locator('.table-grid tbody tr').first().getByTitle('Company')).toHaveValue(globex)
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
  await expect(rows.first().locator(':is(th, td)')).toHaveText(['Oct 1, 2026', '40', 'Food'])
  await expect(rows).toHaveCount(2)
  await expect(parts.locator('app-chart .chart canvas').first()).toBeVisible()

  // A cell changed, as the collection's view changes one: the page follows.
  const change = (/** @type {Record<string, unknown>} */ set) => page.evaluate(async ([place, cells]) => {
    const { load, change } = await import('/caps/tables/tables.js'), one = /** @type {any} */ (await load(place))
    await change(one, [{ row: one.rows[0].id, set: cells }], 'user')
  }, /** @type {const} */ ([folder, set]))
  await change({ amount: 60 })
  await expect(figures).toHaveText(['2', '860'])
  await expect(rows.first().locator(':is(th, td)').nth(1)).toHaveText('60')

  // In Japanese, its dates as Japanese writes them.
  const settings = await openSettings(page)
  await chooseLanguage(settings, 'ja')
  await closeSettings(page)
  await expect(rows.first().locator(':is(th, td)').first()).toHaveText(new Intl.DateTimeFormat('ja', { dateStyle: 'medium' }).format(new Date('2026-10-01T00:00')))
  const english = await openSettings(page)
  await chooseLanguage(english, 'en')
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
    await chooseLanguage(settings, lang)
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
  await head.locator('.icon-group > [popovertarget^="out-"]').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('app-preview .out-menu').getByRole('button', { name: /^Excel/ }).click()])
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  const styles = new TextDecoder().decode(await readZip(new Uint8Array(Buffer.concat(chunks))).find((one) => one.name === 'xl/styles.xml')?.read())
  const onWhite = (await page.evaluate(async () => (await import('/ui/colour.js')).readable('#2dd4bf', '#ffffff'))).slice(1).toUpperCase()
  expect(styles).toContain(`<font><b/><sz val="11"/><color rgb="FF${onWhite}"/><name val="Georgia"/></font>`)
  expect(styles).toContain('<font><sz val="11"/><color rgb="FF223344"/><name val="Verdana"/></font>')
  expect(styles).toContain('<fgColor rgb="FFEEF5F4"/>')
  expect(styles).toContain(`<bottom style="medium"><color rgb="FF${onWhite}"/></bottom>`)
  // Printed: its name and its rows as the view keeps them, nothing to change them with.
  await head.locator('.icon-group > [popovertarget^="out-"]').click()
  await page.locator('app-preview .out-menu').getByRole('button', { name: /^Print or save as PDF/ }).click()
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
  await expect(sheet).not.toHaveClass(/is-across/)
  await page.evaluate(() => dispatchEvent(new Event('afterprint')))
  await expect(sheet).toHaveCount(0)
  // One too wide to read upright turns the page on its side, its words kept whole.
  await page.evaluate(async () => {
    const { app } = await import('/ui/state.js'), at = '2026-10-21T09:00:00.000Z', uri = 'collections/01K85Z1T00000000000000000W-ideas'
    await app.fs.write(`${app.projectDir}/${uri}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000W', name: 'Ideas', author: 'user', created: at, changed: at, views: [{ id: 'all', name: 'All', type: 'table' }],
      properties: ['Idea', 'Description', 'Useful to the user', 'Technically feasible', 'Works offline', 'Easy to build', 'Original', 'Total score', 'Person in charge'].map((name, n) => ({ id: `c${n}`, name, type: n > 1 && n < 8 ? 'number' : 'text' })) }))
    await app.fs.write(`${app.projectDir}/${uri}/changes.jsonl`, `${JSON.stringify({ row: '01K80000000000000000000002', set: { c0: 'Games', c1: 'Small playable games made from a description', c2: 4 }, at, by: 'user' })}\n`)
    await (await import('/caps/made/ways.js')).collectionWays({ uri, name: 'Ideas.xlsx', title: 'Ideas' }).print?.run()
  })
  await expect(sheet).toHaveClass(/is-across/)
  expect(await sheet.locator('table').evaluate((one) => [getComputedStyle(one).overflowWrap, one.classList.contains('paper-cut')])).toEqual(['break-word', false])
  await page.evaluate(() => dispatchEvent(new Event('afterprint')))
  await expect(sheet).toHaveCount(0)
  // Save's last line leads to the design system's page.
  await page.emulateMedia({ media: 'screen' })
  await head.locator('.icon-group > [popovertarget^="out-"]').click()
  await page.locator('app-preview .out-menu').getByRole('button', { name: 'Design system' }).click()
  await expect(page.locator('dialog.settings').getByRole('heading', { name: 'Design system' })).toBeVisible()
})

test('a collection’s table has its name, and its menus close as the keyboard leaves them, so what has focus is never under one', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const folder = 'collections/01K85Z1T00000000000000000B-jobs'
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000B', name: 'Jobs', author: 'jean', created: '2026-10-21T09:00:00.000Z', changed: '2026-10-21T09:00:00.000Z',
      properties: [{ id: 'company', name: 'Company', type: 'text' }, { id: 'role', name: 'Role', type: 'text' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, `${JSON.stringify({ row: '01K80000000000000000000001', set: { company: 'Atlas', role: 'Lead' }, at: '2026-10-21T09:01:00.000Z', by: 'user' })}\n`)
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Jobs.xlsx', title: 'Jobs' })
  })
  await expect(page.getByRole('table', { name: 'Jobs' })).toBeVisible()
  await page.locator('.table-grid .table-head').first().focus()
  await page.keyboard.press('Enter')
  const menu = page.locator('.table-menu:popover-open')
  await expect(menu).toHaveCount(1)
  await menu.locator('button').last().focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('.table-menu:popover-open')).toHaveCount(0)
})
