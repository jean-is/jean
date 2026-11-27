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
import { test, expect, start, connectFakeBrain, ask, answered, turnOn, openSettings, closeSettings, openTasks, BRAIN_URL, chooseLanguage, nameOf } from './helpers.js'
import { readZip } from '../app/core/zip.js'

/** A plan's brain, Claude Code through the bridge, which the fake brain answers for: not on this computer, so it passes. @param {import('@playwright/test').Page} page */
const planBrain = (page) => page.evaluate((baseURL) => import('/ui/brains.js').then(({ addBrain }) => addBrain({ id: 'claude', provider: 'claudecode', api: 'openai', baseURL, model: 'haiku' })), BRAIN_URL)

/** The table on show: its place, and its changes, as the file holds them. @param {import('@playwright/test').Page} page */
const changes = (page) => page.evaluate(async () => {
  const [{ shown }, { app }] = await Promise.all([import('/caps/tables/tables.js'), import('/ui/state.js')])
  const one = shown.value
  return one ? (await app.fs.read(`${one.dir}/${one.folder}/changes.jsonl`) ?? '').trim().split('\n').map((line) => JSON.parse(line)) : []
})

/** The layout on show, as Show as in the bar's pill ticks it, its menu opened then closed. @param {import('@playwright/test').Page} page */
const onShow = async (page) => {
  await page.locator('.table-kept').click()
  const name = await page.locator('.table-menu:popover-open ul:first-of-type [aria-current="true"]').textContent()
  await page.keyboard.press('Escape')
  return name?.trim()
}
/** Shown another way, from Show as in the bar's pill, whose glyph leads the view's name, and whose menu offers the others. @param {import('@playwright/test').Page} page @param {string} name */
const showAs = async (page, name) => {
  await page.locator('.table-kept').click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name, exact: true }).click()
  await expect.poll(() => onShow(page)).toBe(name)
}
/** The layouts Show as offers, by their names, the pill's menu opened then closed: its first group, the views after. @param {import('@playwright/test').Page} page */
const layouts = async (page) => {
  await page.locator('.table-kept').click()
  const names = await page.locator('.table-menu:popover-open ul:first-of-type button').allTextContents()
  await page.keyboard.press('Escape')
  return names.map((name) => name.trim())
}
/** Every layout, which Show as lists whatever the collection holds, in the languages a flow's words run in. */
const LAYOUTS = { en: ['Table', 'List', 'Board', 'Gallery', 'Calendar', 'Timeline'], ar: ['جدول', 'قائمة', 'لوحة', 'معرض', 'تقويم', 'خط زمني'], ja: ['表', 'リスト', 'ボード', 'ギャラリー', 'カレンダー', 'タイムライン'] }
/** The assistant's name, as the page says it. @param {import('@playwright/test').Page} page */
const jean = (page) => page.evaluate(() => import('/ui/state.js').then(({ assistantName }) => assistantName()))

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

  // The board, from Show as at the bar's start, which names the layout on show: a lane for each step, in order, each card moved to another from its menu.
  await showAs(page, 'Board')
  const lanes = page.locator('.table-lane')
  await expect(lanes.locator('h3 > span[dir]')).toHaveText(['To apply', 'Applied', 'Interview', 'Offer'])
  await expect(lanes.nth(1).locator('.table-card')).toHaveCount(2)
  await lanes.nth(0).locator('.table-card').getByRole('button', { name: 'More options' }).click()
  await expect(page.locator('.table-menu:popover-open [aria-current="true"]')).toHaveText('To apply')
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Applied' }).click()
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

test('Jean’s changes to three rows are each accepted or rejected, on the table and on the board, and Reject all leaves what was decided (D505)', { tag: '@chromium' }, async ({ page }) => {
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
  await showAs(page, 'Board')
  const card = page.locator('.table-card.is-jean').filter({ hasText: 'Brightwater' })
  await card.getByRole('button', { name: 'Reject' }).click()
  await expect(page.locator('.table-lane').nth(1).locator('.table-card').filter({ hasText: 'Brightwater' })).toHaveCount(1)
  await expect(review).toContainText('2 changes to review')
})

test('a collection Jean made and filled is one decision, a cell the person changes meanwhile changing nothing of it; Rejected, its rows go, leaving it empty; a row Jean made then changed goes whole, never left empty (D752)', { tag: '@chromium' }, async ({ page }) => {
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

test('a brain on this computer gets neither table_create nor table_change, nor offers Tables: it says it can’t keep tables yet', { tag: '@chromium' }, async ({ page }) => {
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

test('a brain on this computer reads a collection all the same, opening nothing, and finds what collections and documents hold with search_files, whose sources open them', { tag: '@chromium' }, async ({ page }) => {
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

for (const [lang, table, board, review, list] of [['ar', 'جدول', 'لوحة', 'تغيير واحد للمراجعة', 'قائمة'], ['ja', '表', 'ボード', '確認する変更：1 件', 'リスト']]) {
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
    expect(await layouts(page)).toEqual(LAYOUTS[lang])
    await expect.poll(() => onShow(page)).toBe(table)
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
    const [shows, tools] = await Promise.all(['.table-kept', '.table-tools'].map((selector) => page.locator(selector).boundingBox()))
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
    await expect(page.locator('.table-menu:popover-open button')).toHaveText(lang === 'ar' ? ['فتح', 'إدراج أسفل', 'تكرار', 'نقل إلى الأعلى', 'نقل إلى الأسفل', `اسأل ${await jean(page)}`, 'حذف'] : ['開く', '下に挿入', '複製', '上へ移動', '下へ移動', `${await jean(page)} に頼む`, '削除'])
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
    await expect(page.locator('.table-tools > .icon-button[popovertarget]')).toHaveAttribute('aria-label', arrange)
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

test('at 320 px a collection loses nothing: a list of its rows’ cards in its table’s place, under its groups’ heads, which fold, its bar on one line, its chips wrapping, nothing past the page; the table is a press away, its first column staying as the rest scroll (D752, D757)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await start(page)
  await budget(page)
  // A card a row, its name and what tells it apart, picked by kind, under its group's head: its name, how many rows and its subtotal.
  const cards = page.locator('.table-list .table-card'), heads = page.locator('.table-listed .table-fold')
  await expect(cards.locator('h4')).toHaveText(['Venue hire', 'Raffle prizes', 'Cakes and tea', 'Posters'])
  await expect(page.locator('.table-grid')).toHaveCount(0)
  await expect.poll(() => onShow(page)).toBe('List')
  expect(await layouts(page)).toEqual(LAYOUTS.en)
  await expect(page.locator('.table-kept')).toHaveText('All rows4')
  await expect(heads).toHaveText([/To pay\s*2\s*Subtotal€600\.00/, /Paid\s*2\s*Subtotal€97\.50/])
  await expect(cards.first().locator('.table-facts .table-field')).toHaveText([/Due\s*Sat, Sep 12/, /Notes\s*A note long enough to need room/])
  await expect(cards.first().locator('.table-sum')).toHaveText('€480.00')
  await expect(cards.first().locator('dt').first()).toHaveClass('visually-hidden')
  // Folded, a group still says its totals; the whole card opens its row.
  await heads.first().click()
  await expect(heads.first()).toHaveAttribute('aria-expanded', 'false')
  await expect(cards).toHaveCount(2)
  await heads.first().click()
  await expect(cards).toHaveCount(4)
  await cards.first().click({ position: { x: 12, y: 40 } })
  await expect(page.getByRole('dialog', { name: 'Venue hire' })).toBeVisible()
  await page.keyboard.press('Escape')
  // A card's menu gives its row another group's value, which moves it there with no drag.
  await cards.first().getByRole('button', { name: 'More options' }).click()
  await expect(page.locator('.table-menu:popover-open button')).toHaveText(['Open', 'To pay', 'Paid', 'Ask Jean', 'Delete'])
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Paid' }).click()
  await expect(heads).toHaveText([/To pay\s*1\s*Subtotal€120\.00/, /Paid\s*3\s*Subtotal€577\.50/])
  const [bar, shows, tools, over] = await Promise.all(['.table-bar', '.table-kept', '.table-tools', '.table-over'].map((one) => page.locator(one).boundingBox()))
  // One line of tools, whatever shows over the rows under it (caps/over).
  expect((bar?.height ?? 99) - (over?.height ?? 0)).toBeLessThan(64)
  expect(Math.abs((shows?.y ?? 0) - (tools?.y ?? 0))).toBeLessThan(8)
  for (const box of [bar, shows, tools, await cards.first().boundingBox()]) expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 320).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  const chip = await page.locator('.table-chips').boundingBox()
  expect((chip?.x ?? 0) + (chip?.width ?? 0)).toBeLessThanOrEqual(320)
  // The table, picked from Show as, which then names it: every row, the first column passing as the rest do, no wider than its share.
  await showAs(page, 'Table')
  await expect(page.locator('.table-grid tbody tr[data-row]')).toHaveCount(4)
  await expect(page.locator('.table-grid tbody tr[data-row] > :nth-child(2)').first()).not.toHaveCSS('position', 'sticky')
  expect((await page.locator('.table-grid tbody tr[data-row] > :nth-child(2)').first().boundingBox())?.width ?? 999).toBeLessThanOrEqual(153)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  // Each reading stays inside its cell.
  for (const reading of await page.locator('.table-read').all()) {
    const [inner, outer] = await Promise.all([reading.boundingBox(), reading.locator('..').boundingBox()])
    expect((inner?.x ?? 0) >= (outer?.x ?? 0) - 1 && (inner?.x ?? 0) + (inner?.width ?? 0) <= (outer?.x ?? 0) + (outer?.width ?? 0) + 1).toBe(true)
  }
})

test('a list is a layout at every width (D757): picked where the view is wide, it is in the address and stays as the view narrows; where the view is narrow it is the table\'s place, the table a press away, and the bar says its layout first, New row its one filled button', async ({ page }) => {
  await start(page)
  await budget(page)
  const grid = page.locator('.table-grid'), cards = page.locator('.table-list .table-card')
  await expect(grid).toHaveCount(1)
  // The bar: one pill, the layout's glyph, then the view on show, and New row by its name.
  const [laid, kept] = await Promise.all([page.locator('.table-kept > .icon').first().boundingBox(), page.locator('.table-kept > span').first().boundingBox()])
  expect((laid?.x ?? 0) < (kept?.x ?? 0)).toBe(true)
  await expect(page.locator('.table-new')).toHaveText('New row')
  await showAs(page, 'List')
  await expect(grid).toHaveCount(0)
  await expect(cards.locator('h4')).toHaveText(['Venue hire', 'Raffle prizes', 'Cakes and tea', 'Posters'])
  await expect(page).toHaveURL(/show=[^&]*(:|%3A)list/)
  // Narrow, it is still the list; the table is a press away there, and the list again, which is then the table's place: wide again, the table.
  await page.setViewportSize({ width: 380, height: 800 })
  await expect.poll(() => onShow(page)).toBe('List')
  await expect(page.locator('.table-new')).toHaveAccessibleName('New row')
  await showAs(page, 'Table')
  await expect(grid).toHaveCount(1)
  await showAs(page, 'List')
  await expect(cards).toHaveCount(4)
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(grid).toHaveCount(1)
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

test('in each of the 12 looks, by day and by night, a collection\'s readings read at AA (D752)', { tag: '@chromium' }, async ({ page }) => {
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
        const reading = /** @type {HTMLElement} */ (document.querySelector('.table-read.is-amount')), head = getComputedStyle(/** @type {HTMLElement} */ (document.querySelector('.table-grid thead th')))
        return { ratio: contrast(rgb(getComputedStyle(reading).color), rgb(head.backgroundColor)) }
      })
      if (said.ratio < 4.5) failures.push(`${look} ${scheme}: ${JSON.stringify(said)}`)
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
  // One kind here: no kinds to pick, and Create names it, making another at once.
  await expect(creations.locator('.creations-kinds, .creations-chips')).toHaveCount(0)
  await expect(creations.locator('.creations-bar .primary')).toHaveText('Collection')
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

  // Its rows scroll under its heads, which stay at the top of the table, the bar, in the same box, scrolled away with them.
  await scroll.evaluate((box) => { box.scrollTop = box.scrollHeight })
  await expect.poll(async () => Math.abs(((await page.locator('.table-grid thead th').first().boundingBox())?.y ?? 0) - ((await scroll.boundingBox())?.y ?? 99))).toBeLessThan(3)
  await expect(page.locator('.table-scroll > .table-top > .table-bar')).not.toBeInViewport()
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

  // Sorted from Z to A, then from A to Z: the view keeps it, a chip saying so, the rows' own order as it was.
  await (await menu('Nights booked')).getByRole('button', { name: 'Sort Z → A' }).click()
  await expect(rows.first().getByTitle('Nights booked')).toHaveValue('24')
  await expect(rows.last().getByTitle('Nights booked')).toHaveValue('1')
  await (await menu('Nights booked')).getByRole('button', { name: 'Sort A → Z' }).click()
  await expect(rows.first().getByTitle('Nights booked')).toHaveValue('1')
  await expect(page.locator('.table-chips > li')).toHaveText(['Nights booked'])
  await expect.poll(async () => JSON.parse((await file())?.text ?? '{}').views[0].sort).toEqual([{ property: 'nights', direction: 'ascending' }])
  expect((await file())?.nights.slice(0, 4)).toEqual([1, 8, 15, 22])

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
  // The menu the deletes were made from, where it is still open, closed first: it would cover the heads.
  if (await page.locator('.table-menu:popover-open').count()) await page.keyboard.press('Escape')
  await expect(page.locator('.table-menu:popover-open')).toHaveCount(0)
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
  await expect(chip).toHaveText(['1 column hidden', 'Nights booked'])
  await chip.locator('button').first().click()
  await expect(page.locator('.table-panel:popover-open').getByRole('checkbox', { name: 'Text' })).toBeFocused()
  await expect(page.locator('.table-panel:popover-open').getByRole('checkbox', { name: 'Text' })).not.toBeChecked()
  await page.locator('.table-panel:popover-open').getByRole('checkbox', { name: 'Text' }).check()
  await expect(heads).toHaveText(['Name', 'Nights booked', 'Text', 'Stage'])
  await expect(chip).toHaveCount(1)
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
  // Sorted, the rows take the order shown as one is moved by hand, and are sorted no more.
  await handle(2).dragTo(rows.nth(0), { targetPosition: { x: 60, y: 4 } })
  await expect(rows.first().getByTitle('Nights booked')).toHaveValue('3')
  await expect.poll(async () => (await file())?.nights.slice(0, 4)).toEqual([3, 1, 2, 4])
  await expect(chip).toHaveCount(0)
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
  await expect(menu.getByRole('listitem')).toHaveText(['Open', 'Insert below', 'Duplicate', 'Move up', 'Move down', 'Ask Jean', 'Delete'])
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

test('a Formula column’s cells are worked out from each row’s others, and a click or Enter on one opens a dialog to write the column’s formula, with Math’s functions by their names alone', { tag: '@chromium' }, async ({ page }) => {
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
  // As it is written, what the word may become is offered, ↑ ↓ and Enter or Tab taking one; what is wrong is said where it is, with the name most likely
  // meant, which a press writes in; then what it works out for the first rows, beside their names.
  await words.fill('')
  await page.keyboard.type('rou')
  const offers = dialog.getByRole('listbox', { name: 'Columns and functions' }), said = dialog.locator('.formula-said[role="status"]')
  await expect(offers.getByRole('option')).toHaveText(['round()Numbers'])
  await expect(words).toHaveAttribute('aria-activedescendant', 'formula-offer-0')
  await page.keyboard.press('Enter')
  await expect(words).toHaveValue('round()')
  await page.keyboard.type('pri')
  await expect(offers.getByRole('option')).toHaveText(['PriceColumn'])
  await page.keyboard.press('Tab')
  await page.keyboard.type(' * Nigths')
  await expect(offers).toHaveCount(0)
  await expect(said).toContainText('“Nigths” is neither a column nor a function. Did you mean Nights?')
  await expect(dialog.locator('.formula-said mark')).toHaveText('Nigths')
  await said.getByRole('button', { name: 'Nights' }).click()
  await expect(words).toHaveValue('round(Price * Nights)')
  await expect(said).toBeEmpty()
  await expect(dialog.locator('.formula-results dt')).toHaveText(['Lyon', 'Porto'])
  await expect(dialog.locator('.formula-results dd')).toHaveText(['248', '120'])
  await words.fill('upper(Name, 2)')
  await expect(said).toContainText('Write upper like this: upper(Name)')
  // The columns and the functions by group, each on this collection's own columns beside what it works out for the first row, a press writing it at the caret.
  await dialog.locator('summary').click()
  await expect(dialog.locator('.formula-help h3')).toHaveText(['Columns', 'Logic', 'Numbers', 'Words', 'Dates', 'Lists'])
  await words.fill('')
  await dialog.getByRole('button', { name: /^round\(Price \/ 3, 2\)\s?27\.5$/ }).click()
  await expect(words).toHaveValue('round(Price / 3, 2)')
  await expect(words).toBeFocused()
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
  await expect(panel.locator('h3')).toHaveText(['Group by', 'Colour', 'Filter', 'Columns shown', 'Sort'])
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

  // Sort: Amount from Z to A, kept by the view, its button pressed, a chip saying so.
  await panel.getByRole('group', { name: 'Amount' }).getByRole('button', { name: 'Sort Z → A' }).click()
  await expect.poll(values).toEqual(['Conférence', 'Hotel', 'Train to Lyon'])
  await expect(panel.getByRole('group', { name: 'Amount' }).getByRole('button', { name: 'Sort Z → A' })).toHaveAttribute('aria-pressed', 'true')
  await expect(chips).toHaveText(['Amount', 'Amount'])

  // Columns shown: Receipt hidden, the name column always shown, a chip saying so; grouped by Stage, a chip naming it; then Show as's board,
  // of the rows the filter keeps, in the stage's lanes, and the table again.
  await expect(panel.getByRole('checkbox', { name: 'Item' })).toBeDisabled()
  await panel.getByRole('checkbox', { name: 'Receipt' }).uncheck()
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Item', 'Amount', 'Stage'])
  await panel.getByRole('combobox', { name: 'Group by' }).selectOption('Stage')
  await expect(chips).toHaveText(['Stage', 'Amount', '1 column hidden', 'Amount'])
  await page.keyboard.press('Escape')
  await showAs(page, 'Board')
  await expect(page.locator('.table-lane .table-card')).toHaveCount(3)
  await showAs(page, 'Table')
  await chips.getByRole('button', { name: 'Remove Stage' }).click()
  await expect(chips).toHaveText(['Amount', '1 column hidden', 'Amount'])

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
  const [last, add, sums] = await Promise.all([rows.last(), page.locator('.table-grid').getByRole('button', { name: 'New row' }), page.locator('.table-grid tfoot tr:last-child')].map((one) => one.boundingBox()))
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

test('a relation is to this collection or another, picked from the last head’s list or from Type, each of its cells a row there by its name, named again as that row is; the brain names rows by name too', { tag: '@chromium' }, async ({ page }) => {
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

test('a brain makes a relation too, to a collection the project keeps or to the one it makes, by its name as the brain’s <tables> tells it, then fills it by a row’s name', { tag: '@chromium' }, async ({ page }) => {
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
      properties: [{ id: 'item', name: 'Item', type: 'text' }, { id: 'amount', name: 'Amount', type: 'number' }, { id: 'secret', name: 'Hidden one', type: 'text' }], views: [{ id: 'table', type: 'table', hidden: ['secret'] }] }))
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
    await app.fs.write(`${app.projectDir}/${uri}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000W', name: 'Ideas', author: 'user', created: at, changed: at, views: [{ id: 'table', type: 'table' }],
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

/** A collection of homes to visit, with a choice, several choices and a person, beside the task. @param {import('@playwright/test').Page} page */
const visits = (page) => page.evaluate(async () => {
  const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
  await unlock('tables')
  const tables = await import('/caps/tables/tables.js')
  const folder = await tables.makeTable({ name: 'Visits', columns: [{ name: 'Home', type: 'text' }, { name: 'Room', type: 'select', options: ['Living room', 'Kitchen'] }, { name: 'Tags', type: 'multi-select', options: ['Garden', 'Lift', 'Parking'] }, { name: 'Agent', type: 'person' }] }, app.projectDir)
  await tables.change(/** @type {any} */ (await tables.load(folder)), [{ set: { Home: 'Villa Aurore', Room: 'Living room', Tags: ['Garden'], Agent: 'Léa Martin' } }, { set: { Home: 'Quai 12', Room: 'Kitchen', Agent: 'Tom Roy' } }], 'user')
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Visits.xlsx', title: 'Visits' }, true)
})

test('a choice reads as its pill, in a colour picked from its column’s menu; several choices are ticked in their menu; a person has a face and the names known are offered; a row opens as a sheet from its menu and from a board’s card, which a new card opens to be named', { tag: '@chromium' }, async ({ page }) => {
  await start(page)
  await visits(page)
  const rows = page.locator('.table-grid tbody tr'), menu = page.locator('.table-menu:popover-open')
  await expect(rows).toHaveCount(2)
  // A choice is its pill, in the colour of its place among its column's choices; a person, their face before their name, and the names the column holds offered.
  await expect(rows.nth(0).locator('.table-pill')).toHaveText(['Living room', 'Garden'])
  await expect(rows.nth(1).locator('.table-pill').first()).toHaveAttribute('data-hue', '1')
  await expect(rows.nth(0).locator('.table-face')).toHaveText('L')
  await expect(page.locator('.table-view datalist[id$="-agent"] option')).toHaveCount(2)

  // Its colour is picked from its column's menu, and kept with the choice; pressed again, it is its place's again.
  await page.locator('.table-head', { hasText: 'Room' }).click()
  await menu.getByRole('button', { name: 'Colour' }).click()
  const rose = menu.getByRole('group', { name: 'Kitchen' }).getByRole('button', { name: 'Rose' })
  await rose.click()
  await expect(rose).toHaveAttribute('aria-pressed', 'true')
  await expect(rows.nth(1).locator('.table-pill').first()).toHaveAttribute('data-hue', '5')
  await rose.click()
  await expect(rows.nth(1).locator('.table-pill').first()).toHaveAttribute('data-hue', '1')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  // Several choices are ticked in their menu, which a button at the cell's end opens, and one more is added there.
  const tags = rows.nth(1).getByTitle('Tags')
  await tags.hover()
  await rows.nth(1).getByRole('button', { name: 'Choices' }).click()
  await menu.getByLabel('Lift').check()
  await expect(tags).toHaveValue('Lift')
  await menu.getByTitle('Add a choice').fill('Balcony')
  await menu.getByTitle('Add a choice').press('Enter')
  await expect(tags).toHaveValue('Lift, Balcony')
  await expect(menu.getByRole('checkbox')).toHaveCount(4)
  await expect(rows.nth(1).locator('.table-pill')).toHaveText(['Kitchen', 'Lift', 'Balcony'])
  await page.keyboard.press('Escape')

  // A row opens as a sheet from its handle's menu: every column by its name, changed there as in the table; Escape closes it alone.
  await rows.nth(0).hover()
  await rows.nth(0).getByRole('button', { name: 'Move row' }).click()
  await menu.getByRole('button', { name: 'Open' }).click()
  const sheet = page.getByRole('dialog', { name: 'Villa Aurore' })
  await expect(sheet.locator('.table-fields dt')).toHaveText(['Home', 'Room', 'Tags', 'Agent'])
  await expect(sheet.getByTitle('Home')).toBeFocused()
  await sheet.getByTitle('Agent').fill('Tom Roy')
  await sheet.getByTitle('Agent').press('Tab')
  await expect(rows.nth(0).getByTitle('Agent')).toHaveValue('Tom Roy')
  await sheet.getByRole('button', { name: 'Choices' }).click()
  await sheet.getByLabel('Parking').check()
  await expect(rows.nth(0).getByTitle('Tags')).toHaveValue('Garden, Parking')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('app-preview .pane-name')).toHaveValue('Visits')

  // On the board, a lane wears its choice's colour, a card's name opens its row, and a card made at a lane's foot opens to be named.
  await showAs(page, 'Board')
  const lane = page.locator('.table-lane').first()
  await expect(lane.locator('h3 .table-pill')).toHaveAttribute('data-hue', '0')
  await lane.getByRole('button', { name: 'Villa Aurore' }).click()
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await lane.getByRole('button', { name: 'New row' }).click()
  const fresh = page.getByRole('dialog', { name: 'Untitled' })
  await expect(fresh.getByTitle('Home')).toBeFocused()
  await expect(fresh.getByTitle('Room')).toHaveValue('Living room')
  await fresh.getByTitle('Home').fill('Les Tilleuls')
  await fresh.getByTitle('Home').press('Tab')
  await expect(page.getByRole('dialog', { name: 'Les Tilleuls' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(lane.locator('.table-card h4')).toHaveText(['Villa Aurore', 'Les Tilleuls'])
})

for (const [lang, open, colour, green, choices, place, fill, asked, list] of [['ar', 'فتح', 'اللون', 'أخضر', 'الاختيارات', '1 من 2', 'اطلب من {name} تعبئته', 'في «Visits»، املأ العمود «Tags» حيثما كان فارغًا.', 'قائمة'],
  ['ja', '開く', '色', '緑', '選択肢', '1 / 2', '{name} に入力を頼む', '「Visits」で、列「Tags」の空いているところを入力してください。', 'リスト']]) {
  test(`a row's sheet, a choice's colours, what asks Jean and the list in ${lang}: their words the language's`, async ({ page }) => {
    await start(page, lang)
    await visits(page)
    const rows = page.locator('.table-grid tbody tr'), menu = page.locator('.table-menu:popover-open')
    await rows.nth(0).hover()
    await rows.nth(0).locator('.table-grip button').click()
    await menu.getByRole('button', { name: open, exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Villa Aurore' })
    await expect(sheet.locator('.table-fields dt')).toHaveCount(4)
    await expect(sheet.getByRole('button', { name: choices })).toHaveCount(1)
    await expect(sheet.locator('.dialog-head [role="status"]')).toHaveText(place)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await page.locator('.table-head', { hasText: 'Room' }).click()
    await menu.getByRole('button', { name: colour, exact: true }).click()
    await expect(menu.getByRole('group', { name: 'Living room' }).getByRole('button', { name: green, exact: true })).toHaveAttribute('aria-pressed', 'true')
    // A column with an empty cell asks Jean to fill it from its menu, and the request it writes in the box is the language's too; where the view is narrow, the list, by its name.
    await page.keyboard.press('Escape')
    await page.locator('.table-head', { hasText: 'Tags' }).click()
    await menu.getByRole('button', { name: fill.replace('{name}', await jean(page)) }).click()
    await expect(page.locator('#prompt')).toHaveValue(asked)
    await page.setViewportSize({ width: 390, height: 800 })
    await expect.poll(() => onShow(page)).toBe(list)
    await expect(page.locator('.table-list .table-card h4')).toHaveText(['Villa Aurore', 'Quai 12'])
    // The card's menu is at its end, the left in Arabic.
    const [card, more] = await Promise.all([page.locator('.table-card').first().boundingBox(), page.locator('.table-more').first().boundingBox()])
    expect(lang === 'ar' ? (more?.x ?? 0) - (card?.x ?? 0) < 40 : (card?.x ?? 0) + (card?.width ?? 0) - (more?.x ?? 0) - (more?.width ?? 0) < 40).toBe(true)
  })
}

test('a link, an email and a phone open from their cells’ ends, a link read without its https and long words on three lines; a row’s sheet goes to the row before and the one after and says its last changes, with what Jean’s came from; Jean is asked to fill a column, about a row and to show what Find doesn’t find, each a request written in the box, never sent, its pane making way where it covers the box (D757)', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const tables = await import('/caps/tables/tables.js')
    const folder = await tables.makeTable({ name: 'Homes', columns: [{ name: 'Home', type: 'text' }, { name: 'Listing', type: 'link' }, { name: 'Mail', type: 'email' }, { name: 'Phone', type: 'phone' }, { name: 'Notes', type: 'text' }, { name: 'Stage', type: 'status', options: ['To visit', 'Visited'] }] }, app.projectDir)
    await tables.change(/** @type {any} */ (await tables.load(folder)), [
      { set: { Home: 'Villa Aurore', Listing: 'https://www.homes.example/villa-aurore', Mail: 'lea@homes.example', Phone: '+33 6 39 98 01 02', Stage: 'To visit', Notes: 'Bright living room over the garden, the kitchen was redone last year, the cellar is dry and the street is quiet at night, with a baker at the corner and the tram two minutes away.' } },
      { set: { Home: 'Quai 12', Stage: 'Visited', Notes: 'On the water.' } }, { set: { Home: 'Gare 27', Stage: 'To visit' } }, { set: { Home: 'Les Tilleuls' } }, { set: { Home: 'Atelier du Port' } }], 'user')
    const one = /** @type {any} */ (await tables.load(folder))
    await tables.change(one, [{ row: one.rows[1].id, set: { Notes: 'On the water. Offer sent.' } }], 'jean', 'the email of 6 November')
    await tables.accept(/** @type {any} */ (await tables.load(folder)))
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Homes.xlsx', title: 'Homes' }, true)
  })
  const rows = page.locator('.table-grid tbody tr'), cell = (/** @type {number} */ row, /** @type {number} */ n) => rows.nth(row).locator('td').nth(n), menu = page.locator('.table-menu:popover-open'), box = page.locator('#prompt')
  await expect(rows).toHaveCount(5)
  // A link reads without its https and opens in a tab of its own; an email writes, a phone calls; a cell that holds none has nothing to open.
  await expect(cell(0, 1).locator('.table-read')).toHaveText('homes.example/villa-aurore')
  await expect(cell(0, 1).getByRole('link', { name: 'Open' })).toHaveAttribute('href', 'https://www.homes.example/villa-aurore')
  await expect(cell(0, 1).getByRole('link')).toHaveAttribute('target', '_blank')
  await expect(cell(0, 1).getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(cell(0, 2).getByRole('link', { name: 'Open' })).toHaveAttribute('href', 'mailto:lea@homes.example')
  await expect(cell(0, 3).getByRole('link', { name: 'Open' })).toHaveAttribute('href', 'tel:+33639980102')
  await expect(rows.nth(1).getByRole('link')).toHaveCount(0)
  // The link is still a field: with the keys on it, its address shows whole, and its link keeps its own Enter.
  await cell(0, 1).getByTitle('Listing').focus()
  await expect(cell(0, 1).getByTitle('Listing')).toHaveValue('https://www.homes.example/villa-aurore')
  await expect(cell(0, 1).locator('.table-read')).toHaveCSS('visibility', 'hidden')
  // Long words read on three lines at most, which give their row its height; short ones stay a field alone.
  const notes = cell(0, 4).locator('.table-read.is-text')
  await expect(notes).toContainText('Bright living room')
  expect(await notes.evaluate((read) => Math.round(read.getBoundingClientRect().height / parseFloat(getComputedStyle(read).lineHeight)))).toBe(3)
  expect((await rows.nth(0).boundingBox())?.height ?? 0).toBeGreaterThan(((await rows.nth(2).boundingBox())?.height ?? 0) * 1.5)
  await expect(cell(2, 4).locator('.table-read')).toHaveCount(0)
  // A step's pill says its group by a shape before its name.
  expect(await cell(0, 5).locator('.table-pill').evaluate((pill) => getComputedStyle(pill, '::before').borderTopLeftRadius)).toBe('50%')

  // A row's sheet: its place among the rows, the rows before and after it by their names, and its last changes, Jean's with what it came from.
  await rows.nth(1).getByRole('button', { name: 'Move row' }).click()
  await menu.getByRole('button', { name: 'Open' }).click()
  const sheet = page.locator('dialog.table-row')
  await expect(sheet).toHaveAccessibleName('Quai 12')
  await expect(sheet.locator('.dialog-head [role="status"]')).toHaveText('2 of 5')
  await expect(sheet.locator('.table-last li').first().locator('p')).toContainText('Jean')
  await expect(sheet.locator('.table-last li').first().locator('dt')).toHaveText(['Notes'])
  await expect(sheet.locator('.table-last q').first()).toHaveText('the email of 6 November')
  await expect(sheet.locator('.table-last li').last()).toContainText('Me')
  // A change says what it set, the value before it struck through; the row's name is its first cell, large.
  await expect(sheet.locator('.table-last li').first().locator('s')).toHaveText('On the water.')
  await expect(sheet.locator('.table-last li').first().locator('b')).toHaveText('On the water. Offer sent.')
  await expect(sheet.locator('.table-fields > div').first()).toHaveClass('table-title')
  await expect(sheet.getByTitle('Home')).toHaveValue('Quai 12')
  await sheet.getByRole('button', { name: 'Gare 27' }).click()
  await expect(sheet).toHaveAccessibleName('Gare 27')
  await expect(sheet.locator('.dialog-head [role="status"]')).toHaveText('3 of 5')
  await sheet.getByRole('button', { name: 'Quai 12' }).click()
  await sheet.getByRole('button', { name: 'Villa Aurore' }).click()
  await expect(sheet.locator('.dialog-head [role="status"]')).toHaveText('1 of 5')
  await expect(sheet.locator('.dialog-head .icon-button').first()).toBeDisabled()
  await expect(sheet.locator('.table-cover')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Quai 12' }).click()
  await expect(sheet).toHaveAccessibleName('Quai 12')
  // A swipe across it goes to the row after, and back.
  const swipe = (/** @type {number} */ from, /** @type {number} */ to) => sheet.evaluate((box, [from, to]) => {
    for (const [type, x] of /** @type {[string, number][]} */ ([['touchstart', from], ['touchend', to]])) box.dispatchEvent(Object.defineProperty(new Event(type, { bubbles: true }), 'changedTouches', { value: [{ clientX: x, clientY: 300 }] }))
  }, [from, to])
  await swipe(300, 100)
  await expect(sheet).toHaveAccessibleName('Gare 27')
  await swipe(100, 300)
  await expect(sheet).toHaveAccessibleName('Quai 12')
  // A press that began inside it and ends outside leaves it open, as words selected past its edge do; a press outside closes it.
  const inside = await sheet.locator('.dialog-head [role="status"]').boundingBox()
  await page.mouse.move((inside?.x ?? 0) + 4, (inside?.y ?? 0) + 4)
  await page.mouse.down()
  await page.mouse.move(5, 5)
  await page.mouse.up()
  await expect(sheet).toHaveAccessibleName('Quai 12')
  await page.mouse.click(5, 5)
  await expect(sheet).toHaveCount(0)
  await rows.nth(1).getByRole('button', { name: 'Move row' }).click()
  await menu.getByRole('button', { name: 'Open' }).click()
  await expect(sheet).toHaveAccessibleName('Quai 12')
  // Asked about from its menu: the sheet closes, and the request is in the box, to finish; nothing is sent.
  await sheet.getByRole('button', { name: 'More options' }).click()
  await expect(menu.getByRole('button')).toHaveText(['Ask Jean', 'Delete'])
  await menu.getByRole('button', { name: 'Ask Jean' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(box).toHaveValue('In “Homes”, about “Quai 12”: ')
  await expect(box).toBeFocused()
  await expect(page.locator('.msg')).toHaveCount(0)
  // A column's menu asks Jean to fill it, saying how many of its cells are empty; one with none empty has no such row.
  await page.locator('.table-grid .table-head').nth(0).click()
  await expect(menu.getByRole('button', { name: 'Sort A → Z' })).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Ask Jean to fill it' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.locator('.table-grid .table-head').nth(4).click()
  await expect(menu.getByRole('button', { name: 'Ask Jean to fill it' }).locator('.menu-value')).toHaveText('3')
  await menu.getByRole('button', { name: 'Ask Jean to fill it' }).click()
  await expect(box).toHaveValue('In “Homes”, fill in “Notes” wherever it is empty.')
  // Find's words that match no row are Jean's to show, asked in the box; the collection stays as it is.
  await page.locator('.creations-find').click()
  await page.keyboard.type('near the water')
  await expect(page.locator('.table-kept')).toHaveText('All rows0 of 5')
  await page.locator('.table-none').getByRole('button', { name: 'Ask Jean' }).click()
  await expect(box).toHaveValue('In “Homes”, show only: near the water')
  await expect(page.locator('app-preview')).toHaveCount(1)
  await expect(page.locator('.msg')).toHaveCount(0)
  // Where the pane is narrow, Find takes the place of the view on show and Show as while it has the keys, so that nothing moves under the finger as it opens or closes.
  await page.locator('.table-none').getByRole('button', { name: 'Clear' }).click()
  await page.setViewportSize({ width: 390, height: 800 })
  const third = page.locator('.table-list .table-card').nth(2), top = (await third.boundingBox())?.y
  await expect(page.locator('.creations-find input')).toBeFocused()
  await expect(page.locator('.table-kept')).toBeHidden()
  expect(((await page.locator('.table-bar').boundingBox())?.height ?? 99) - ((await page.locator('.table-over').boundingBox())?.height ?? 0)).toBeLessThan(64)
  // And where the pane covers the conversation, it makes way for the box once Jean is asked.
  await third.getByRole('button', { name: 'More options' }).click()
  expect((await third.boundingBox())?.y).toBe(top)
  await expect(page.locator('.table-kept')).toBeVisible()
  await menu.getByRole('button', { name: 'Ask Jean' }).click()
  await expect(page.locator('app-preview')).toHaveCount(0)
  await expect(box).toHaveValue('In “Homes”, about “Gare 27”: ')
  await expect(box).toBeVisible()
})

/** A picture of one pixel, as a browser opens one. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
/** A collection of homes with a picture and files, beside the task. @param {import('@playwright/test').Page} page */
const homes = (page) => page.evaluate(async () => {
  const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
  await unlock('tables')
  const tables = await import('/caps/tables/tables.js')
  const folder = await tables.makeTable({ name: 'Homes', columns: [{ name: 'Home', type: 'text' }, { name: 'Photo', type: 'picture' }, { name: 'Papers', type: 'files' }, { name: 'Rent', type: 'number' }] }, app.projectDir)
  await tables.change(/** @type {any} */ (await tables.load(folder)), [{ set: { Home: 'Villa Aurore', Rent: 1450 } }, { set: { Home: 'Quai 12', Rent: 980 } }], 'user')
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Homes.xlsx', title: 'Homes' }, true)
  return folder
})
/** The files a collection keeps for its cells, by their names in its folder. @param {import('@playwright/test').Page} page @param {string} folder */
const filesIn = (page, folder) => page.evaluate(async (folder) => (await (await import('/ui/state.js')).app.fs.list(`${(await import('/ui/state.js')).app.projectDir}/${folder}/files`).catch(() => [])).map(({ name }) => name).sort(), folder)

test('a picture is added to its cell from the cell’s menu, kept in the collection’s folder by its content, shown small in the table, larger in the row’s sheet and over its card in the gallery, opened beside the task and taken away; a file goes by its name; what is no picture is refused; a copy takes its files', async ({ page }) => {
  await start(page)
  const folder = await homes(page)
  const rows = page.locator('.table-grid tbody tr'), menu = page.locator('.table-menu:popover-open'), photo = (/** @type {number} */ n) => rows.nth(n).locator('td').nth(1), papers = (/** @type {number} */ n) => rows.nth(n).locator('td').nth(2)
  await expect(rows).toHaveCount(2)
  // Show as lists every layout, the gallery among them; a picture is a kind the last head adds, files too.
  expect(await layouts(page)).toEqual(LAYOUTS.en)
  await page.locator('.table-add-column').click()
  await expect(menu.getByRole('button', { name: 'Picture', exact: true })).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Files', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  // A press on the cell opens its menu, whose Add a picture takes one from the device: kept by its content's hash, named in the cell, shown small.
  await photo(0).click()
  await menu.getByLabel('Add a picture').setInputFiles({ name: 'villa.png', mimeType: 'image/png', buffer: PNG })
  await expect(photo(0).locator('img')).toHaveCount(1)
  await expect(menu.getByRole('group', { name: 'villa.png' })).toHaveCount(1)
  expect(await filesIn(page, folder)).toEqual([expect.stringMatching(/^[0-9a-f]{64}\.png$/)])
  await expect(photo(0).getByRole('button', { name: 'Picture' })).toHaveAttribute('title', 'villa.png')
  // The same picture given to another row is kept once; what is no picture is refused, and said.
  await page.keyboard.press('Escape')
  await photo(1).click()
  await menu.getByLabel('Add a picture').setInputFiles([{ name: 'again.png', mimeType: 'image/png', buffer: PNG }, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('no picture') }])
  await expect(photo(1).locator('img')).toHaveCount(1)
  await expect(page.getByRole('alert').filter({ hasText: 'That doesn’t fit this column.' })).toHaveCount(1)
  expect(await filesIn(page, folder)).toHaveLength(1)
  // Taken away from its cell, there, as the user's change.
  await menu.getByRole('group', { name: 'again.png' }).getByRole('button', { name: 'Remove' }).click()
  await expect(photo(1).locator('img')).toHaveCount(0)
  await expect(menu.getByRole('group')).toHaveCount(0)
  await page.keyboard.press('Escape')
  // Dropped on its cell, or pasted while the cell has the keys, a picture is the cell's own, never the task's box's.
  const carried = await page.evaluateHandle((bytes) => { const data = new DataTransfer(); data.items.add(new File([Uint8Array.from(atob(bytes), (char) => char.charCodeAt(0))], 'dropped.png', { type: 'image/png' })); return data }, PNG.toString('base64'))
  await photo(1).dispatchEvent('dragover', { dataTransfer: carried })
  await photo(1).dispatchEvent('drop', { dataTransfer: carried })
  await expect(photo(1).locator('img')).toHaveCount(1)
  await photo(1).evaluate((cell, data) => { cell.focus(); cell.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })) }, carried)
  await expect(photo(1).locator('img')).toHaveCount(2)
  await expect(page.locator('.attachment')).toHaveCount(0)

  // A file goes by its name, any kind of file; its name opens it beside the task, as any file.
  await papers(0).click()
  await menu.getByLabel('Add files').setInputFiles({ name: 'lease.txt', mimeType: 'text/plain', buffer: Buffer.from('The lease, in plain words.') })
  await expect(papers(0).locator('.table-file')).toHaveText('lease.txt')
  expect(await filesIn(page, folder)).toHaveLength(2)
  await page.keyboard.press('Escape')
  await photo(0).click()
  await menu.getByRole('button', { name: 'villa.png' }).click()
  await expect(page.locator('app-preview .view > img')).toHaveCount(1)
  await expect(page.locator('app-preview')).toHaveCount(2)

  // In the gallery, a card a row, its picture over its name and its cells but pictures and files; the card opens the row's sheet, its picture at its head and larger in its cell; the bar's New row opens one to fill.
  await showAs(page, 'Gallery')
  const cards = page.locator('.table-gallery .table-card')
  await expect(cards.locator('h4')).toHaveText(['Villa Aurore', 'Quai 12'])
  await expect(cards.nth(0).locator('.table-cover img')).toHaveCount(1)
  await expect(cards.nth(1).locator('.table-cover img')).toHaveCount(1)
  await expect(cards.nth(0).locator('.table-field')).toHaveText(['Rent1,450'])
  await cards.nth(0).click()
  const sheet = page.getByRole('dialog', { name: 'Villa Aurore' })
  await expect(sheet.locator('dd').nth(1).locator('img')).toHaveCount(1)
  await expect(sheet.locator('.table-cover img')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.locator('.table-tools').getByRole('button', { name: 'New row' }).click()
  await expect(page.getByRole('dialog', { name: 'Untitled' }).getByTitle('Home')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(2).locator('.table-cover img')).toHaveCount(0)

  // A copy takes the files its cells name; a search of the project reads a file by its name.
  const copied = await page.evaluate(async (folder) => { const tables = await import('/caps/tables/tables.js'), copy = await tables.copy({ path: folder }, 'Homes (copy)'); return { copy, text: (await tables.kept()).find((one) => one.path === copy)?.text } }, folder)
  expect(await filesIn(page, copied.copy)).toEqual(await filesIn(page, folder))
  expect(copied.text).toContain('Photo: villa.png; Papers: lease.txt')
})

test('a file that comes from someone a collection is worked on with is kept only where a cell’s file goes, and only if its content is what its name says', { tag: '@chromium' }, async ({ page }) => {
  await start(page)
  const folder = await homes(page)
  const taken = await page.evaluate(async (folder) => {
    const [{ app }, together] = await Promise.all([import('/ui/state.js'), import('/caps/together/collection.js')])
    const place = { dir: app.projectDir, folder }, held = /** @type {{ lines: Set<string>, table: string, files?: Set<string> }} */ ({ lines: new Set(), table: '' })
    const bytes = new TextEncoder().encode('a note from someone'), hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join(''), sent = btoa(String.fromCharCode(...bytes))
    await together.take(place, { files: { [`files/${hex}.txt`]: sent, [`files/${'0'.repeat(64)}.txt`]: sent, [`files/${'f'.repeat(64)}.png`]: '%%%', '../settings.json': sent, 'collection.json': sent, [`files/${hex}.txt/../../collection.json`]: sent, [`files/${hex}`]: 3 } }, held)
    const dir = `${app.projectDir}/${folder}`
    return { hex, files: (await app.fs.list(`${dir}/files`)).map(({ name }) => name), held: [...held.files ?? []], table: JSON.parse((await app.fs.read(`${dir}/collection.json`)) ?? '{}').name, text: new TextDecoder().decode(/** @type {Uint8Array} */ (await app.fs.readBytes(`${dir}/files/${hex}.txt`))) }
  }, folder)
  expect(taken.files).toEqual([`${taken.hex}.txt`])
  expect(taken.held).toEqual([`files/${taken.hex}.txt`])
  expect(taken.table).toBe('Homes')
  expect(taken.text).toBe('a note from someone')
})

for (const [lang, shows, add] of /** @type {const} */ ([['ar', ['جدول', 'قائمة', 'معرض'], 'أضف صورة'], ['ja', ['表', 'リスト', 'ギャラリー'], '画像を追加']])) {
  test(`pictures and the gallery in ${lang}: their words the language's`, async ({ page }) => {
    await start(page, lang)
    await homes(page)
    expect(await layouts(page)).toEqual(LAYOUTS[lang])
    await page.locator('.table-grid tbody tr').first().locator('td').nth(1).click()
    await page.locator('.table-menu:popover-open').getByLabel(add).setInputFiles({ name: 'villa.png', mimeType: 'image/png', buffer: PNG })
    await page.keyboard.press('Escape')
    await showAs(page, shows[2])
    await expect(page.locator('.table-gallery .table-cover img')).toHaveCount(1)
  })
}

/** A collection of stays, each with the day it arrives on and the one it leaves on, beside the task. @param {import('@playwright/test').Page} page */
const stays = (page) => page.evaluate(async () => {
  const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
  await unlock('tables')
  const tables = await import('/caps/tables/tables.js')
  const folder = await tables.makeTable({ name: 'Stays', columns: [{ name: 'Guest', type: 'text' }, { name: 'Arrives', type: 'date' }, { name: 'Leaves', type: 'date' }] }, app.projectDir)
  await tables.change(/** @type {any} */ (await tables.load(folder)), [{ set: { Guest: 'Ana', Arrives: '2026-11-20', Leaves: '2026-11-23' } }, { set: { Guest: 'Bo', Arrives: '2026-11-20T14:30' } }, { set: { Guest: 'Cy' } }, { set: { Guest: 'Di', Arrives: '2026-12-02' } }], 'user')
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Stays.xlsx', title: 'Stays' }, true)
})
/** A day's cell of the calendar on show. @param {import('@playwright/test').Page} page @param {string} date */
const dayOf = (page, date) => page.locator('.cal-grid td', { has: page.locator(`time[datetime="${date}"]`) })

test('a collection with a date shows as a calendar, fetched as one is first shown: a month from the language’s first day, each row on its day by its time, lasting until another date once picked; a row opens, is dragged to another day with its end, and is made on a day; the months pass; narrow, the days are a list', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T10:00:00'))
  await start(page)
  const fetched = /** @type {string[]} */ ([])
  page.on('request', (request) => { if (request.url().includes('/caps/calendar/')) fetched.push(request.url()) })
  await stays(page)
  expect(await layouts(page)).toEqual(LAYOUTS.en)
  expect(fetched).toEqual([])
  await showAs(page, 'Calendar')
  // This month, since a row is in it; its weeks from Sunday, as English counts them; today's day marked; each row on its day, one with a time after it.
  await expect(page.locator('.cal-bar h3')).toHaveText('November 2026')
  expect(fetched.some((url) => url.endsWith('/caps/calendar/calendar.js'))).toBe(true)
  await expect(page.locator('.cal-grid th')).toHaveText(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  await expect(page.locator('.cal-grid td[aria-current="date"] time')).toHaveAttribute('datetime', '2026-11-17')
  await expect(dayOf(page, '2026-11-20').locator('.cal-row')).toHaveText(['Ana', '2:30 PM Bo'])
  await expect(dayOf(page, '2026-11-21').locator('.cal-row')).toHaveCount(0)
  // One with no day waits under the month.
  await expect(page.getByRole('region', { name: 'No Arrives' }).locator('.cal-row')).toHaveText(['Cy'])

  // With two date columns, the one its rows last until is picked, and kept with the collection: a row is on each of its days.
  await page.locator('.cal-bar').getByLabel('End', { exact: true }).selectOption({ label: 'Leaves' })
  await expect(dayOf(page, '2026-11-23').locator('.cal-row')).toHaveText(['Ana'])
  await expect(dayOf(page, '2026-11-24').locator('.cal-row')).toHaveCount(0)
  expect(await page.evaluate(async () => (await import('/caps/tables/tables.js')).shown.value?.table.views.find((view) => view.type === 'calendar'))).toEqual({ id: 'calendar', type: 'calendar', date: 'arrives', until: 'leaves' })
  // A row's name opens it as a sheet.
  await dayOf(page, '2026-11-22').getByRole('button', { name: 'Ana' }).click()
  await expect(page.getByRole('dialog', { name: 'Ana' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Dragged to another day, it is on that day, its end as many days later.
  const carried = await page.evaluateHandle(() => new DataTransfer())
  await dayOf(page, '2026-11-20').getByRole('button', { name: 'Ana' }).dispatchEvent('dragstart', { dataTransfer: carried })
  await dayOf(page, '2026-11-26').dispatchEvent('dragover', { dataTransfer: carried })
  await dayOf(page, '2026-11-26').dispatchEvent('drop', { dataTransfer: carried })
  await expect(dayOf(page, '2026-11-29').locator('.cal-row')).toHaveText(['Ana'])
  await expect(dayOf(page, '2026-11-20').locator('.cal-row')).toHaveText(['2:30 PM Bo'])
  await expect.poll(async () => (await changes(page)).at(-1)).toMatchObject({ by: 'user', set: { arrives: '2026-11-26', leaves: '2026-11-29' } })
  // One with a time keeps it; one with no day takes the day it is dropped on.
  await dayOf(page, '2026-11-20').getByRole('button', { name: 'Bo' }).dispatchEvent('dragstart', { dataTransfer: carried })
  await dayOf(page, '2026-11-18').dispatchEvent('drop', { dataTransfer: carried })
  await expect(dayOf(page, '2026-11-18').locator('.cal-row')).toHaveText(['2:30 PM Bo'])
  await expect.poll(async () => (await changes(page)).at(-1)).toMatchObject({ set: { arrives: '2026-11-18T14:30' } })

  // A day's + makes a row on it, which opens to be named.
  await dayOf(page, '2026-11-05').hover()
  await dayOf(page, '2026-11-05').getByRole('button', { name: 'New row' }).click()
  const fresh = page.getByRole('dialog', { name: 'Untitled' })
  await expect(fresh.getByTitle('Arrives')).toHaveValue('2026-11-05')
  await fresh.getByTitle('Guest').fill('Eve')
  await fresh.getByTitle('Guest').press('Tab')
  await page.keyboard.press('Escape')
  await expect(dayOf(page, '2026-11-05').locator('.cal-row')).toHaveText(['Eve'])

  // The months pass, in the language's own words, and come back to this one.
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page.locator('.cal-bar h3')).toHaveText('December 2026')
  await expect(dayOf(page, '2026-12-02').locator('.cal-row')).toHaveText(['Di'])
  await page.getByRole('button', { name: 'This month' }).click()
  await expect(page.locator('.cal-bar h3')).toHaveText('November 2026')
  await page.getByRole('button', { name: 'Last month' }).click()
  await expect(page.locator('.cal-bar h3')).toHaveText('October 2026')
  await expect(page.locator('.cal-row')).toHaveText(['Cy'])
  await page.getByRole('button', { name: 'This month' }).click()

  // Where the pane is narrow, the days are a list (D757): those a row starts on, and today, each under its date, its rows their cards.
  await page.setViewportSize({ width: 380, height: 800 })
  const days = page.locator('.cal-on')
  await expect(days.locator('h4 time')).toHaveText(['Tue, Nov 17', 'Wed, Nov 18', 'Thu, Nov 26'])
  await expect(page.locator('.cal-grid')).toHaveCount(0)
  await expect(days.first()).toHaveAttribute('aria-current', 'date')
  await expect(days.locator('> h4 .muted')).toHaveText(['Today', 'Tomorrow'])
  // Today, with no row, offers one; a row with a time says it, and one that lasts is listed on its first day alone, saying its days.
  await expect(days.first().getByRole('button', { name: 'New row' })).toBeVisible()
  await expect(days.nth(1).locator('.table-card h4')).toHaveText('Bo')
  await expect(days.nth(1).locator('.table-field dd')).toHaveText(['2:30 PM'])
  await expect(days.nth(2).locator('.table-field dd')).toHaveText([/^Nov 26\s–\s29$/])
  // This month's days gone by are folded over them, by their dates and how many rows they hold, and unfold.
  const past = page.locator('.cal > .table-fold')
  await expect(past).toHaveText(/Nov 5\s*1/)
  await expect(past).toHaveAttribute('aria-expanded', 'false')
  await past.click()
  await expect(days.locator('h4 time')).toHaveText(['Thu, Nov 5', 'Tue, Nov 17', 'Wed, Nov 18', 'Thu, Nov 26'])
  // A card there opens its row, and nothing goes past the window's edge.
  await days.first().getByRole('button', { name: 'Eve' }).click()
  await expect(page.getByRole('dialog', { name: 'Eve' })).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

/** A plan with a step, a person and two dates, beside the task. @param {import('@playwright/test').Page} page */
const plan = (page) => page.evaluate(async () => {
  const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
  await unlock('tables')
  const tables = await import('/caps/tables/tables.js')
  const folder = await tables.makeTable({ name: 'Move', columns: [{ name: 'Step', type: 'text' }, { name: 'Stage', type: 'status', options: ['To do', 'Doing', 'Done'] }, { name: 'Who', type: 'person' }, { name: 'Starts', type: 'date' }, { name: 'Ends', type: 'date' }] }, app.projectDir)
  await tables.change(/** @type {any} */ (await tables.load(folder)), [{ set: { Step: 'Give notice', Stage: 'Done', Who: 'Lea', Starts: '2026-10-26', Ends: '2026-10-30' } },
    { set: { Step: 'Find a flat near the canal, with a room for the piano', Stage: 'Doing', Who: 'Lea', Starts: '2026-11-02', Ends: '2026-11-27' } }, { set: { Step: 'Sign the lease', Stage: 'To do', Who: 'Tom', Starts: '2026-12-01T10:00' } }, { set: { Step: 'Housewarming', Who: 'Tom' } }], 'user')
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Move.xlsx', title: 'Move' }, true)
})
/** Where a bar is along the timeline, a share of its width from its start, and how much of it the bar takes. @param {import('@playwright/test').Locator} bar */
const lies = (bar) => bar.evaluate((button) => {
  const track = /** @type {Element} */ (button.closest('.line-track')).getBoundingClientRect(), box = button.getBoundingClientRect(), days = Number(getComputedStyle(button).getPropertyValue('--days'))
  return [Math.round((getComputedStyle(button).direction === 'rtl' ? track.right - box.right : box.left - track.left) / track.width * days), Math.round(box.width / track.width * days)]
})

test('a collection with a date shows as a timeline, fetched as one is first shown: its months side by side, each row a bar from its day to the one it lasts until, by the calendar\'s columns, in its step\'s look; a bar opens its row, and is dragged to other days with its end; grouped, its rows are under their heads; narrow, it scrolls in its place, a bar\'s name in sight; and a long name stays in its day on the calendar', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T10:00:00'))
  await start(page)
  const fetched = /** @type {string[]} */ ([])
  page.on('request', (request) => { if (request.url().includes('/caps/timeline/')) fetched.push(request.url()) })
  await plan(page)
  expect(await layouts(page)).toEqual(LAYOUTS.en)
  expect(fetched).toEqual([])
  await showAs(page, 'Timeline')
  // Whole months, from the first row's to the one after the last row's, the first and each January saying their year; today a line among them.
  const bars = page.locator('.line-bar'), bar = (/** @type {string} */ name) => page.locator('.line-bar', { hasText: name })
  await expect(page.locator('.line h3')).toHaveText(/^Oct 2026\s–\sJan 2027$/)
  expect(fetched.some((url) => url.endsWith('/caps/timeline/timeline.js'))).toBe(true)
  await expect(page.locator('.line-months b')).toHaveText(['Oct 2026', 'Nov', 'Dec', 'Jan 2027'])
  await expect(page.locator('.line-now')).toBeVisible()
  // Each row a bar on a line of its own, on its day; one with no day waits under the timeline.
  await expect(bars.locator('bdi')).toHaveText(['Give notice', 'Find a flat near the canal, with a room for the piano', 'Sign the lease'])
  // Its step, whose look it has, is said too, unseen: a colour is never alone to say it.
  await expect(bars.locator('.visually-hidden')).toHaveText(['Done', 'Doing', 'To do'])
  expect([await lies(bars.nth(0)), await lies(bars.nth(1)), await lies(bars.nth(2))]).toEqual([[25, 1], [32, 1], [61, 1]])
  await expect(page.getByRole('region', { name: 'No Starts' }).locator('.cal-row')).toHaveText(['Housewarming'])

  // The column its rows last until is the calendar's, picked here or there and kept with the collection: a bar runs from its day to that one.
  await page.locator('.cal-bar').getByLabel('End', { exact: true }).selectOption({ label: 'Ends' })
  await expect.poll(() => lies(bars.nth(1))).toEqual([32, 26])
  expect([await lies(bars.nth(0)), await lies(bars.nth(2))]).toEqual([[25, 5], [61, 1]])
  expect(await page.evaluate(async () => (await import('/caps/tables/tables.js')).shown.value?.table.views)).toContainEqual({ id: 'calendar', type: 'calendar', date: 'starts', until: 'ends' })
  // A bar says its days, and takes its step's look, as its pill has it.
  await expect(bars.nth(1)).toHaveAttribute('title', /^Nov 2\s–\s27, 2026$/)
  await expect(bars.nth(2)).toHaveAttribute('title', 'Dec 1, 2026')
  await expect(bars.nth(1)).toHaveAttribute('data-group', 'doing')
  // Pressed, it opens its row as a sheet.
  await bar('Give notice').click()
  await expect(page.getByRole('dialog', { name: 'Give notice' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Dragged along, held two days from its start, it starts two days before the day it is let go on, its end as many days later.
  const track = page.locator('.line-track'), carried = await page.evaluateHandle(() => new DataTransfer())
  const at = async (/** @type {import('@playwright/test').Locator} */ box, /** @type {number} */ day, /** @type {number} */ days) => ((size) => ({ clientX: (size?.x ?? 0) + (day + 0.5) / days * (size?.width ?? 0), clientY: (size?.y ?? 0) + 4 }))(await box.boundingBox())
  await bar('Give notice').dispatchEvent('dragstart', { dataTransfer: carried, ...await at(bar('Give notice'), 2, 5) })
  await track.dispatchEvent('dragover', { dataTransfer: carried, ...await at(track, 40, 123) })
  await track.dispatchEvent('drop', { dataTransfer: carried, ...await at(track, 40, 123) })
  await expect.poll(async () => (await changes(page)).at(-1)).toMatchObject({ by: 'user', set: { starts: '2026-11-08', ends: '2026-11-12' } })
  await expect(page.locator('.line-months b')).toHaveText(['Nov 2026', 'Dec', 'Jan 2027'])
  // One with a time keeps it; one with no day takes the day it is let go on.
  await bar('Sign the lease').dispatchEvent('dragstart', { dataTransfer: carried, ...await at(bar('Sign the lease'), 0, 1) })
  await track.dispatchEvent('drop', { dataTransfer: carried, ...await at(track, 33, 92) })
  await expect.poll(async () => (await changes(page)).at(-1)).toMatchObject({ set: { starts: '2026-12-04T10:00' } })
  await page.getByRole('region', { name: 'No Starts' }).getByRole('button', { name: 'Housewarming' }).dispatchEvent('dragstart', { dataTransfer: carried })
  await track.dispatchEvent('drop', { dataTransfer: carried, ...await at(track, 50, 92) })
  await expect.poll(async () => (await changes(page)).at(-1)).toMatchObject({ set: { starts: '2026-12-21' } })
  await expect(bars).toHaveCount(4)

  // Grouped, as Arrange asks, each group's rows are under its head, which says how many it has.
  await page.locator('.table-tools').getByRole('button', { name: 'Arrange', exact: true }).click()
  await page.locator('.table-panel').getByRole('combobox', { name: 'Group by' }).selectOption('Who')
  await page.keyboard.press('Escape')
  await expect(page.locator('.line section h4')).toHaveText([/^\s*Lea\s*2\s*$/, /^\s*Tom\s*2\s*$/])
  await expect(page.getByRole('region', { name: 'Tom' }).locator('.line-bar bdi')).toHaveText(['Sign the lease', 'Housewarming'])
  // Today is brought back in sight by its button, which Intl names.
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.locator('.line-now')).toBeInViewport()

  // Narrow, the months scroll in their place, nothing goes past the window's edge, and a bar's name stays in sight while its bar is.
  await page.setViewportSize({ width: 380, height: 800 })
  await expect(page.locator('.table-kept')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const scroll = page.locator('.line-scroll')
  expect(await scroll.evaluate((box) => box.scrollWidth > box.clientWidth)).toBe(true)
  await page.evaluate(async () => { const tables = await import('/caps/tables/tables.js'), one = /** @type {any} */ (tables.shown.value); await tables.change(await tables.load(one.folder, one.dir), [{ row: one.rows[1].id, set: { Ends: '2027-01-20' } }], 'user') })
  await expect.poll(() => lies(bar('piano'))).toEqual([1, 80])
  // Scrolled until its bar starts a hundred pixels before what shows, again if the pane is still settling, its name is at the edge of what shows.
  await expect.poll(() => scroll.evaluate((box) => {
    const bar = /** @type {Element} */ ([...box.querySelectorAll('.line-bar')].find((one) => one.textContent?.includes('piano'))), edge = box.getBoundingClientRect().left
    box.scrollLeft += bar.getBoundingClientRect().left - edge + 100
    return [bar.getBoundingClientRect().left - edge < -90, /** @type {Element} */ (bar.querySelector('bdi')).getBoundingClientRect().left - edge >= -1]
  })).toEqual([true, true])

  // On the calendar, wide again, a name longer than a day stays in its day.
  await page.setViewportSize({ width: 1280, height: 800 })
  await showAs(page, 'Calendar')
  const chip = dayOf(page, '2026-11-03').locator('.cal-row')
  await expect(chip).toHaveText('Find a flat near the canal, with a room for the piano')
  expect(await chip.evaluate((button) => button.getBoundingClientRect().right <= /** @type {Element} */ (button.closest('td')).getBoundingClientRect().right)).toBe(true)
})

test('a date takes a time of day from its head’s Type, its cell keeping the time a date already has; a calendar opens on the month of the next row to come when none is in this one', { tag: '@chromium' }, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-03T10:00:00'))
  await start(page)
  await stays(page)
  const rows = page.locator('.table-grid tbody tr'), menu = page.locator('.table-menu:popover-open')
  // A date written with a time shows it, and keeps it as its day changes.
  await expect(rows.nth(1).getByTitle('Arrives')).toHaveAttribute('type', 'datetime-local')
  await expect(rows.nth(1).getByTitle('Arrives')).toHaveValue('2026-11-20T14:30')
  await expect(rows.nth(0).getByTitle('Arrives')).toHaveAttribute('type', 'date')
  await rows.nth(1).getByTitle('Arrives').fill('2026-11-21T14:30')
  await rows.nth(1).getByTitle('Arrives').press('Tab')
  await expect.poll(async () => (await changes(page)).at(-1)).toMatchObject({ by: 'user', set: { arrives: '2026-11-21T14:30' } })
  // Time, on a date's Type page, gives every cell of its column a time to set, a day alone at midnight until then; pressed again, days alone.
  await page.locator('.table-head', { hasText: 'Leaves' }).click()
  await menu.getByRole('button', { name: 'Type' }).click()
  await menu.getByRole('button', { name: 'Time', exact: true }).click()
  await expect(rows.nth(0).getByTitle('Leaves')).toHaveAttribute('type', 'datetime-local')
  await expect(rows.nth(0).getByTitle('Leaves')).toHaveValue('2026-11-23T00:00')
  await rows.nth(0).getByTitle('Leaves').fill('2026-11-23T11:00')
  await rows.nth(0).getByTitle('Leaves').press('Tab')
  await expect.poll(async () => (await changes(page)).at(-1)).toMatchObject({ set: { leaves: '2026-11-23T11:00' } })
  await page.locator('.table-head', { hasText: 'Leaves' }).click()
  await menu.getByRole('button', { name: 'Type' }).click()
  await expect(menu.getByRole('button', { name: 'Time', exact: true })).toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('Escape')
  // In August, with no row then, the calendar opens on November, where the next one is.
  await showAs(page, 'Calendar')
  await expect(page.locator('.cal-bar h3')).toHaveText('November 2026')
  await expect(page.getByRole('button', { name: 'This month' })).toBeEnabled()
})

for (const [lang, shows, title, first, next, today] of /** @type {const} */ ([['ar', ['جدول', 'قائمة', 'تقويم', 'خط زمني'], 'نوفمبر 2026', 'السبت', 'الشهر القادم', 'اليوم'], ['ja', ['表', 'リスト', 'カレンダー', 'タイムライン'], '2026年11月', '日曜日', '来月', '今日']])) {
  test(`a calendar and a timeline in ${lang}: its week from the language's first day, its month, its days and its moves in the language's words; the timeline's months from the line's start`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-17T10:00:00'))
    await start(page, lang)
    await stays(page)
    expect(await layouts(page)).toEqual(LAYOUTS[lang])
    await showAs(page, shows[2])
    await expect(page.locator('.cal-bar h3')).toHaveText(title)
    await expect(page.locator('.cal-grid th').first()).toHaveAttribute('abbr', first)
    await expect(dayOf(page, '2026-11-20').locator('.cal-row')).toHaveCount(2)
    await page.getByRole('button', { name: next }).click()
    await expect(dayOf(page, '2026-12-02').locator('.cal-row')).toHaveCount(1)
    // Its first day's column is at the line's start, the right in Arabic.
    const [head, last] = await Promise.all([page.locator('.cal-grid th').first().boundingBox(), page.locator('.cal-grid th').last().boundingBox()])
    expect(lang === 'ar' ? (head?.x ?? 0) > (last?.x ?? 0) : (head?.x ?? 0) < (last?.x ?? 0)).toBe(true)
    // As a timeline, named in the language, its months run from the line's start, the right in Arabic, and a bar lies on its day from there.
    await showAs(page, shows[3])
    await expect(page.locator('.line-months b')).toHaveCount(3)
    const [early, late] = await Promise.all([page.locator('.line-months b').first().boundingBox(), page.locator('.line-months b').last().boundingBox()])
    expect(lang === 'ar' ? (early?.x ?? 0) > (late?.x ?? 0) : (early?.x ?? 0) < (late?.x ?? 0)).toBe(true)
    expect(await lies(page.locator('.line-bar').first())).toEqual([19, 1])
    await expect(page.getByRole('button', { name: today, exact: true })).toBeEnabled()
  })
}

/** A collection of visits with a choice, a number and a person, beside the task. @param {import('@playwright/test').Page} page */
const viewing = (page) => page.evaluate(async () => {
  const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
  await unlock('tables')
  const folder = 'collections/01K85Z1T00000000000000000V-visits', at = '2026-11-17T09:00:00.000Z'
  await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000V', name: 'Visits', author: 'user', created: at, changed: at,
    properties: [{ id: 'place', name: 'Place', type: 'text' }, { id: 'stage', name: 'Stage', type: 'select', options: [{ name: 'Open' }, { name: 'Done' }] }, { id: 'price', name: 'Price', type: 'number' }, { id: 'who', name: 'Who', type: 'person' }],
    views: [{ id: 'table', type: 'table' }, { id: 'board', type: 'board', group: 'stage' }] }))
  const rows = [['Villa Aurore', 'Open', 420, 'Léa'], ['Loft Canal', 'Done', 310, 'Tom'], ['Maison Pins', 'Open', 560, 'Tom'], ['Studio Port', 'Open', 190, 'Léa']]
  await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, rows.map(([place, stage, price, who], i) => `${JSON.stringify({ row: `01K8000000000000000000000${i}`, set: { place, stage, price, who }, at: `2026-11-17T09:0${i + 1}:00.000Z`, by: 'user' })}\n`).join(''))
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Visits.xlsx', title: 'Visits' })
  return folder
})
/** The collection on show as its files hold it: its views, and what this person arranged of it alone. @param {import('@playwright/test').Page} page */
const viewsOf = (page) => page.evaluate(async () => {
  const [{ shown }, { app }] = await Promise.all([import('/caps/tables/tables.js'), import('/ui/state.js')]), at = `${shown.value?.dir}/${shown.value?.folder}`
  return { views: JSON.parse(await app.fs.read(`${at}/collection.json`) ?? '{}').views, yours: JSON.parse(await app.fs.read(`${at}/yours.json`) ?? 'null')?.views ?? null }
})
/** Others work on every collection, as Together says where they do, this person going by Léa among them. @param {import('@playwright/test').Page} page */
const together = (page) => page.evaluate(() => import('/ui/caps.js').then(({ register }) => register(/** @type {any} */ ({ id: 'others-here',
  slots: { others: { at: 0, draw: () => null, holds: () => true }, names: { at: 0, draw: () => null, of: () => ['Léa', 'Tom'], me: () => 'Léa' } } }))))

test('what is arranged is kept as a view from Arrange, under a name the person writes: picked from the bar by its name, shown its own way, arranged on its own, renamed and deleted; the collection’s own is whole again, and a sort stays with its view until a row is moved by hand', { tag: '@chromium' }, async ({ page }) => {
  await start(page)
  await viewing(page)
  const places = () => page.locator('.table-grid tbody tr').getByTitle('Place').evaluateAll((fields) => fields.map((field) => /** @type {HTMLInputElement} */ (field).value))
  const arrange = page.locator('.table-tools').getByRole('button', { name: 'Arrange', exact: true }), panel = page.locator('.table-panel:popover-open'), chips = page.locator('.table-chips > li')
  const button = page.locator('.table-kept'), named = button.locator('span[dir]'), menu = page.locator('.table-menu:popover-open'), field = page.getByTitle('View name')
  await expect.poll(places).toEqual(['Villa Aurore', 'Loft Canal', 'Maison Pins', 'Studio Port'])
  // No view kept: the bar starts with All rows and how many, and its menu keeps what shows as one.
  await expect(button).toHaveText('All rows4')
  await button.click()
  await expect(menu.locator('ul:not(:first-of-type)').getByRole('button')).toHaveText(['All rows', 'Keep as a view'])
  await page.keyboard.press('Escape')
  await expect(page.locator('.table-yours')).toHaveText('')
  // Arranged: the open ones, the dearest first; alone, the collection keeps it as it always has.
  await arrange.click()
  await panel.getByRole('button', { name: 'Add a filter' }).click()
  await panel.getByRole('combobox', { name: 'Column' }).selectOption('Stage')
  await panel.locator('.table-rule select').last().selectOption('Open')
  await panel.getByRole('group', { name: 'Price' }).getByRole('button', { name: 'Sort Z → A' }).click()
  await expect.poll(places).toEqual(['Maison Pins', 'Villa Aurore', 'Studio Port'])
  await expect(chips).toHaveText(['StageOpen', 'Price'])
  await expect.poll(async () => (await viewsOf(page)).views[0]).toEqual({ id: 'table', type: 'table', filter: { and: [{ property: 'stage', op: 'is', value: 'Open' }] }, sort: [{ property: 'price', direction: 'descending' }] })
  expect((await viewsOf(page)).yours).toBe(null)
  // Kept as a view: named from its rule, the name selected to write another; the collection's own is whole again.
  await panel.getByRole('button', { name: 'Keep as a view' }).click()
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('Open')
  await page.keyboard.type('Open visits')
  await page.keyboard.press('Enter')
  await expect(button).toBeFocused()
  await expect(button).toHaveText('Open visits3 of 4')
  await expect.poll(places).toEqual(['Maison Pins', 'Villa Aurore', 'Studio Port'])
  const { views } = await viewsOf(page), id = views[2].id
  expect(views).toEqual([{ id: 'table', type: 'table' }, { id: 'board', type: 'board', group: 'stage' }, { id, type: 'table', name: 'Open visits', filter: { and: [{ property: 'stage', op: 'is', value: 'Open' }] }, sort: [{ property: 'price', direction: 'descending' }] }])
  await expect(page).toHaveURL(new RegExp(`show=01K85Z1T00000000000000000V(:|%3A)${id}`))
  // The bar's button lists, after Show as, All rows and the views kept, the one on show marked; All rows shows every row, with nothing arranged.
  await button.click()
  await expect(menu.locator('ul:not(:first-of-type)').getByRole('button')).toHaveText(['All rows', 'Open visits', 'Keep as a view', 'Rename', 'Delete'])
  await expect(menu.getByRole('button', { name: 'Open visits' })).toHaveAttribute('aria-current', 'true')
  await menu.getByRole('button', { name: 'All rows' }).click()
  await expect(named).toHaveText('All rows')
  await expect.poll(places).toEqual(['Villa Aurore', 'Loft Canal', 'Maison Pins', 'Studio Port'])
  await expect(chips).toHaveCount(0)
  // A view shows its own way: as a board, which All rows doesn't follow; and arranged on its own.
  await button.click()
  await menu.getByRole('button', { name: 'Open visits' }).click()
  await showAs(page, 'Board')
  await expect(page.locator('.table-lane .table-card')).toHaveCount(3)
  await expect.poll(async () => (await viewsOf(page)).views[2].type).toBe('board')
  await button.click()
  await menu.getByRole('button', { name: 'All rows' }).click()
  await expect(page.locator('.table-grid')).toBeVisible()
  await button.click()
  await menu.getByRole('button', { name: 'Open visits' }).click()
  await expect(page.locator('.table-lane .table-card')).toHaveCount(3)
  await showAs(page, 'Table')
  await arrange.click()
  await panel.getByRole('checkbox', { name: 'Who' }).uncheck()
  await page.keyboard.press('Escape')
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Place', 'Stage', 'Price'])
  await expect.poll(async () => (await viewsOf(page)).views).toMatchObject([{ id: 'table', type: 'table' }, {}, { name: 'Open visits', type: 'table', hidden: ['who'] }])
  // Sorted, a row moved by hand takes the order shown, which is the rows' from then on, the view sorted no more.
  await page.locator('.table-grid tbody tr').nth(2).getByRole('button', { name: 'Move row' }).focus()
  await page.keyboard.press('ArrowUp')
  await expect.poll(places).toEqual(['Maison Pins', 'Studio Port', 'Villa Aurore'])
  await expect(chips).toHaveText(['StageOpen', '1 column hidden'])
  await expect.poll(async () => (await viewsOf(page)).views[2].sort).toBe(undefined)
  // At 320 px its name has a line of its own, nothing past the page.
  await page.setViewportSize({ width: 320, height: 640 })
  await expect(button).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await button.evaluate((one) => one.scrollWidth <= one.clientWidth + 1)).toBe(true)
  await page.setViewportSize({ width: 1280, height: 720 })
  // Renamed from its menu: Escape leaves it as it was, Enter keeps what is written.
  await button.click()
  await menu.getByRole('button', { name: 'Rename' }).click()
  await expect(field).toBeFocused()
  await page.keyboard.type('Nothing')
  await page.keyboard.press('Escape')
  await expect(named).toHaveText('Open visits')
  await expect(page.locator('.table-view')).toBeVisible()
  await button.click()
  await menu.getByRole('button', { name: 'Rename' }).click()
  await expect(field).toBeFocused()
  await page.keyboard.type('To see')
  await page.keyboard.press('Enter')
  await expect(named).toHaveText('To see')
  // Deleted: All rows shows, no view is listed, and the file keeps that it went, so that no copy brings it back.
  await button.click()
  await menu.getByRole('button', { name: 'Delete' }).click()
  await expect(named).toHaveText('All rows')
  await expect.poll(places).toEqual(['Maison Pins', 'Studio Port', 'Villa Aurore', 'Loft Canal'])
  await expect.poll(async () => (await viewsOf(page)).views[2]).toMatchObject({ id, name: 'To see', deleted: expect.any(String) })
})

test('where others work on a collection too, what a person arranges is theirs alone until they keep it: said under the bar, kept in a file of their own, there again once reloaded, reset, kept as a view of its own, or kept into the view picked; a rule on Me keeps each person’s own rows', { tag: '@chromium' }, async ({ page, browserName }) => {
  await start(page)
  await viewing(page)
  await together(page)
  const places = () => page.locator('.table-grid tbody tr').getByTitle('Place').evaluateAll((fields) => fields.map((field) => /** @type {HTMLInputElement} */ (field).value))
  const arrange = page.locator('.table-tools').getByRole('button', { name: 'Arrange', exact: true }), panel = page.locator('.table-panel:popover-open'), chips = page.locator('.table-chips > li')
  const yours = page.locator('.table-yours'), button = page.locator('.table-kept'), named = button.locator('span[dir]'), field = page.getByTitle('View name')
  await expect.poll(places).toHaveLength(4)
  // A rule on Me, offered before the names known: this person's rows, by the name they go by among the others.
  await arrange.click()
  await panel.getByRole('button', { name: 'Add a filter' }).click()
  await panel.getByRole('combobox', { name: 'Column' }).selectOption('Who')
  await panel.locator('.table-rule select').last().selectOption('is')
  expect(await page.locator('datalist[id$="-me"] option').evaluateAll((all) => all.map((one) => /** @type {HTMLOptionElement} */ (one).value))).toEqual(['Me', 'Léa', 'Tom'])
  await panel.locator('.table-rule').getByTitle('Who').fill('Me')
  await panel.locator('.table-rule').getByTitle('Who').press('Enter')
  await page.keyboard.press('Escape')
  await expect.poll(places).toEqual(['Villa Aurore', 'Studio Port'])
  await expect(chips).toHaveText(['WhoMe'])
  // Theirs alone: said, in a status; the collection's own file as it was, theirs beside it.
  await expect(yours.getByRole('status')).toHaveText('Only you see this')
  await expect(yours.getByRole('button')).toHaveText(['Keep', 'Reset'])
  await expect.poll(async () => (await viewsOf(page)).yours).toEqual({ table: { filter: { and: [{ property: 'who', op: 'is', value: { me: true } }] } } })
  expect((await viewsOf(page)).views).toEqual([{ id: 'table', type: 'table' }, { id: 'board', type: 'board', group: 'stage' }])
  // There again once the page is loaded again; WebKit runs here like a private window, where nothing is kept for the next visit.
  if (browserName !== 'webkit') {
    await page.reload()
    await page.evaluate(() => import('/ui/caps.js').then(({ unlock }) => unlock('tables')))
    await together(page)
    await page.evaluate(() => import('/ui/preview.js').then(({ preview }) => preview({ uri: 'collections/01K85Z1T00000000000000000V-visits', name: 'Visits.xlsx', title: 'Visits' })))
    await expect.poll(places).toEqual(['Villa Aurore', 'Studio Port'])
    await expect(yours.getByRole('status')).toHaveText('Only you see this')
  }
  // Reset: as it is for everyone again, their file gone.
  await yours.getByRole('button', { name: 'Reset' }).click()
  await expect.poll(places).toHaveLength(4)
  await expect(yours).toHaveText('')
  await expect.poll(async () => (await viewsOf(page)).yours).toBe(null)
  // Grouped, then kept: a view of its own for everyone, named from its group, the collection's own as it was, nothing theirs alone left.
  await arrange.click()
  await panel.getByRole('combobox', { name: 'Group by' }).selectOption('Stage')
  await page.keyboard.press('Escape')
  await expect(page.locator('.table-grid tr.table-group')).toHaveCount(2)
  await yours.getByRole('button', { name: 'Keep' }).click()
  await expect(field).toHaveValue('Stage')
  await expect(field).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(named).toHaveText('Stage')
  await expect(yours).toHaveText('')
  await expect.poll(async () => (await viewsOf(page)).views).toMatchObject([{ id: 'table', type: 'table' }, { id: 'board' }, { name: 'Stage', type: 'table', group: 'stage' }])
  expect((await viewsOf(page)).views[0]).toEqual({ id: 'table', type: 'table' })
  expect((await viewsOf(page)).yours).toBe(null)
  // The view picked, shown as a board by this person alone until kept: then for everyone.
  await showAs(page, 'Board')
  await expect(page.locator('.table-lane')).toHaveCount(2)
  await expect(yours.getByRole('status')).toHaveText('Only you see this')
  expect((await viewsOf(page)).views[2].type).toBe('table')
  await yours.getByRole('button', { name: 'Keep' }).click()
  await expect(yours).toHaveText('')
  await expect(page.locator('.table-lane')).toHaveCount(2)
  await expect.poll(async () => (await viewsOf(page)).views[2].type).toBe('board')
  expect((await viewsOf(page)).yours).toBe(null)
})

for (const [lang, all, keepView, only, keep, reset, me] of /** @type {const} */ ([['ar', 'كل الصفوف', 'احتفظ به كعرض', 'هذا ظاهر لك وحدك', 'احتفظ', 'أعد الضبط', 'أنا'], ['ja', 'すべての行', 'ビューとして保存', 'あなただけに表示されています', '保存', 'リセット', '自分']])) {
  test(`kept views in ${lang}: their words the language's, the view's name at the bar's start`, async ({ page }) => {
    await start(page, lang)
    await viewing(page)
    await expect(page.locator('.table-grid tbody tr')).toHaveCount(4)
    // Kept from Arrange, the last of its panel; its name, then All rows in its menu.
    await page.locator('.table-tools > button[popovertarget]').click()
    await expect(page.locator('.table-panel:popover-open > button').last()).toHaveText(keepView)
    await page.locator('.table-panel:popover-open > button').last().click()
    await expect(page.locator('.table-titled')).toBeFocused()
    await page.keyboard.press('Enter')
    const button = page.locator('.table-kept')
    await expect(button).toBeFocused()
    await button.click()
    await expect(page.locator('.table-menu:popover-open ul:nth-of-type(2) button').first()).toHaveText(all)
    await page.keyboard.press('Escape')
    // At the bar's start: the right in Arabic.
    const [name, tools] = await Promise.all([button.boundingBox(), page.locator('.table-tools').boundingBox()])
    expect(lang === 'ar' ? (name?.x ?? 0) > (tools?.x ?? 0) : (name?.x ?? 0) < (tools?.x ?? 0)).toBe(true)
    // With others, what is arranged is this person's alone, said in the language, with what keeps it and what resets it; a rule takes Me.
    await together(page)
    await page.locator('.table-tools > button[popovertarget]').click()
    const panel = page.locator('.table-panel:popover-open')
    await panel.locator('select').first().selectOption('stage')
    await expect(page.locator('.table-yours [role="status"]')).toHaveText(only)
    await expect(page.locator('.table-yours button')).toHaveText([keep, reset])
    expect(await page.locator('datalist[id$="-me"] option').first().evaluate((one) => /** @type {HTMLOptionElement} */ (one).value)).toBe(me)
  })
}

test('asked to show only some rows, the brain proposes a view: on show at once, the person’s alone, said under the bar, the collection as it was; kept, it is a view of the collection under its name; one Jean can’t make is refused in words, and No thanks takes one away (D755)', { tag: '@chromium' }, async ({ page }) => {
  await start(page)
  await planBrain(page)
  await viewing(page)
  const places = () => page.locator('.table-grid tbody tr').getByTitle('Place').evaluateAll((fields) => fields.map((field) => /** @type {HTMLInputElement} */ (field).value))
  const yours = page.locator('.table-yours'), button = page.locator('.table-kept'), named = button.locator('span[dir]'), menu = page.locator('.table-menu:popover-open')
  await expect.poll(places).toHaveLength(4)
  const before = (await viewsOf(page)).views
  await ask(page, 'Show only the open visits, the dearest first')
  await answered(page)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Done: the view is over the collection')
  // On show: its rows, sorted, a column hidden, its name at the bar's start; said as suggested, in a status, with what keeps it and what doesn't.
  await expect(named).toHaveText('Open, dearest first')
  await expect.poll(places).toEqual(['Maison Pins', 'Villa Aurore', 'Studio Port'])
  await expect(page.locator('.table-grid .table-head')).toHaveText(['Place', 'Stage', 'Price'])
  await expect(page.locator('.table-chips > li')).toHaveText(['StageOpen', '1 column hidden', 'Price'])
  await expect(yours.getByRole('status')).toHaveText('Suggested: Open, dearest first')
  await expect(yours.getByRole('button')).toHaveText(['Keep', 'No thanks'])
  // Nothing of the collection changed: the view is among this person's own.
  const made = await viewsOf(page), [id] = Object.keys(made.yours)
  expect(made.views).toEqual(before)
  expect(made.yours[id]).toEqual({ name: 'Open, dearest first', type: 'table', filter: { and: [{ property: 'stage', op: 'is', value: 'Open' }] }, sort: [{ property: 'price', direction: 'descending' }], hidden: ['who'] })
  // Its menu lists it after All rows, by whom, with nothing to rename or delete; All rows shows every row, the view still there to pick.
  await button.click()
  await expect(menu.locator('ul:not(:first-of-type)').getByRole('button')).toHaveText(['All rows', /^Open, dearest first\s*Jean$/, 'Keep as a view'])
  await menu.getByRole('button', { name: 'All rows' }).click()
  await expect.poll(places).toHaveLength(4)
  await expect(yours).toHaveText('')
  await button.click()
  await menu.getByRole('button', { name: /Open, dearest first/ }).click()
  await expect.poll(places).toHaveLength(3)
  // Kept: a view of the collection under the name it has, the collection's own arrangement as it was, nothing theirs alone left.
  await yours.getByRole('button', { name: 'Keep' }).click()
  await expect(yours).toHaveText('')
  await expect(named).toHaveText('Open, dearest first')
  await expect(page.locator('.table-titled')).toHaveCount(0)
  await expect.poll(async () => (await viewsOf(page)).views).toMatchObject([{ id: 'table', type: 'table' }, { id: 'board' }, { name: 'Open, dearest first', type: 'table', filter: { and: [{ property: 'stage', op: 'is', value: 'Open' }] }, sort: [{ property: 'price', direction: 'descending' }], hidden: ['who'] }])
  expect((await viewsOf(page)).views[0]).toEqual({ id: 'table', type: 'table' })
  expect((await viewsOf(page)).yours).toBe(null)
  await expect.poll(places).toEqual(['Maison Pins', 'Villa Aurore', 'Studio Port'])
  // A view Jean can't make, a gallery with no pictures, is refused in words the brain reads; nothing is proposed.
  await ask(page, 'Show the visits as a gallery')
  await answered(page, 2)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('That didn’t work: Error: A gallery shows pictures: this table has no picture column.')
  expect((await viewsOf(page)).yours).toBe(null)
  // Proposed again, then No thanks: All rows, and the view gone.
  await ask(page, 'Show only the open visits again')
  await answered(page, 3)
  await expect(yours.getByRole('status')).toHaveText('Suggested: Open, dearest first')
  // Proposed once more under the same name, it takes the place of the one before.
  await ask(page, 'Show only the open visits once more')
  await answered(page, 4)
  expect(Object.keys((await viewsOf(page)).yours)).toHaveLength(1)
  await yours.getByRole('button', { name: 'No thanks' }).click()
  await expect(named).toHaveText('All rows')
  await expect.poll(places).toHaveLength(4)
  await expect.poll(async () => (await viewsOf(page)).yours).toBe(null)
  await button.click()
  await expect(menu.locator('ul:not(:first-of-type)').getByRole('button')).toHaveText(['All rows', 'Open, dearest first', 'Keep as a view'])
})

for (const [lang, suggested, no] of /** @type {const} */ ([['ar', 'اقتراح: مفتوحة', 'لا، شكرًا'], ['ja', '提案：未完了', 'いいえ、結構です']])) {
  test(`a proposed view in ${lang}: said and refused in the language's words`, async ({ page }) => {
    await start(page, lang)
    await viewing(page)
    await expect(page.locator('.table-grid tbody tr')).toHaveCount(4)
    await page.evaluate((name) => import('/caps/tables/tables.js').then(({ shown, alone }) => shown.value && alone(shown.value, 'p1', { name, type: 'table', filter: { and: [{ property: 'stage', op: 'is', value: 'Open' }] } })), suggested.split(/[:：]\s*/)[1])
    await page.locator('.table-kept').click()
    await page.locator('.table-menu:popover-open ul:nth-of-type(2) button').nth(1).click()
    await expect(page.locator('.table-grid tbody tr')).toHaveCount(3)
    await expect(page.locator('.table-yours [role="status"]')).toHaveText(suggested)
    await expect(page.locator('.table-yours button').last()).toHaveText(no)
    await page.locator('.table-yours button').last().click()
    await expect(page.locator('.table-grid tbody tr')).toHaveCount(4)
    await expect(page.locator('.table-kept [aria-current], .table-yours button')).toHaveCount(0)
  })
}

/** A collection with a column of each kind whose width goes by it, to colour by a choice and to paste on. @param {import('@playwright/test').Page} page */
const stock = (page) => page.evaluate(async () => {
  const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
  await unlock('tables')
  const tables = await import('/caps/tables/tables.js')
  const folder = await tables.makeTable({ name: 'Homes', columns: [{ name: 'Home', type: 'text' }, { name: 'Visit', type: 'date' }, { name: 'Rent', type: 'number' }, { name: 'OK', type: 'checkbox' }, { name: 'Stage', type: 'status', options: ['To visit', 'Visited', 'Signed'] },
    { name: 'Area', type: 'select', options: ['Canal', 'Hillside'] }, { name: 'Photo', type: 'picture' }, { name: 'Call', type: 'date' }] }, app.projectDir)
  const made = /** @type {any} */ (await tables.load(folder))
  await tables.reshapeTable(made, { time: { id: made.table.properties.find((/** @type {any} */ property) => property.name === 'Call').id, on: true } })
  await tables.change(/** @type {any} */ (await tables.load(folder)), [{ set: { Home: 'Villa Aurore', Visit: '2026-11-04', Rent: 1450, OK: true, Stage: 'Visited', Area: 'Hillside', Call: '2026-11-20T14:30' } },
    { set: { Home: 'Quai 12', Visit: '2026-11-06', Rent: 980, Stage: 'To visit', Area: 'Canal' } }, { set: { Home: 'Gare 27', Stage: 'Signed', Area: 'Canal' } }], 'user')
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Homes.xlsx', title: 'Homes' }, true)
})
/** The rows of the collection on show, each cell under its column's name, and its columns' choices. @param {import('@playwright/test').Page} page */
const held = (page) => page.evaluate(async () => {
  const one = /** @type {any} */ ((await import('/caps/tables/tables.js')).shown.value)
  return { rows: one.rows.map((/** @type {any} */ row) => Object.fromEntries(one.table.properties.map((/** @type {any} */ property) => [property.name, row.cells[property.id] ?? null]))),
    choices: Object.fromEntries(one.table.properties.filter((/** @type {any} */ property) => property.options).map((/** @type {any} */ property) => [property.name, property.options.map((/** @type {any} */ option) => option.name)])), view: one.table.views.find((/** @type {any} */ view) => view.id === 'table') }
})
/** A cell of the table on show: a row's, counted from its name's. @param {import('@playwright/test').Page} page @param {number} row @param {number} column */
const cellAt = (page, row, column) => page.locator('.table-grid tbody tr[data-row]').nth(row).locator('> :is(td, th)').nth(column + 1)
/**
 * Text pasted on a cell or in what has the keys in it, as a spreadsheet's copy comes, with its picture when asked; whether the page left it to the browser.
 * @param {import('@playwright/test').Locator} at @param {string} text @param {{ html?: string, picture?: boolean }} [more]
 */
const pasteOn = (at, text, { html = '', picture = false } = {}) => at.evaluate((element, [text, html, picture]) => {
  const data = new DataTransfer()
  data.setData('text/plain', String(text))
  if (html) data.setData('text/html', String(html))
  if (picture) data.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'cells.png', { type: 'image/png' }))
  if (!element.contains(document.activeElement)) /** @type {HTMLElement} */ (element).focus()
  return (document.activeElement ?? element).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
}, [text, html, picture])

test('a row’s sheet goes to the row after and the one before with ⌘ and an arrow, Ctrl outside Apple’s systems: its buttons say the keys, what is being written is kept, and the keyboard stays in the cell it is in', async ({ page }) => {
  await start(page)
  await stock(page)
  const rows = page.locator('.table-grid tbody tr[data-row]'), menu = page.locator('.table-menu:popover-open'), sheet = page.locator('dialog.table-row'), rent = sheet.getByRole('spinbutton', { name: 'Rent' }), walk = sheet.locator('.dialog-head > .icon-button')
  await rows.nth(0).getByRole('button', { name: 'Move row' }).click()
  await menu.getByRole('button', { name: 'Open' }).click()
  await expect(sheet).toHaveAccessibleName('Villa Aurore')
  await expect(walk.nth(0)).toHaveAttribute('aria-keyshortcuts', /^(Meta|Control)\+ArrowUp$/)
  await expect(walk.nth(1)).toHaveAttribute('aria-keyshortcuts', /^(Meta|Control)\+ArrowDown$/)
  // What is being written in a cell is kept as the sheet goes on, and the keyboard is in that cell, the next row's.
  await rent.click()
  await rent.press('ControlOrMeta+a')
  await page.keyboard.type('1500')
  await page.keyboard.press('ControlOrMeta+ArrowDown')
  await expect(sheet).toHaveAccessibleName('Quai 12')
  await expect(sheet.getByRole('status')).toHaveText('2 of 3')
  await expect(rent).toBeFocused()
  await expect(rent).toHaveValue('980')
  await expect.poll(async () => (await held(page)).rows[0].Rent).toBe(1500)
  // Past the last row it stays where it is; an arrow alone is the cell's own.
  await page.keyboard.press('ControlOrMeta+ArrowDown')
  await expect(sheet).toHaveAccessibleName('Gare 27')
  await page.keyboard.press('ControlOrMeta+ArrowDown')
  await expect(sheet).toHaveAccessibleName('Gare 27')
  await sheet.getByRole('textbox', { name: 'Home' }).focus()
  await page.keyboard.press('ArrowUp')
  await expect(sheet).toHaveAccessibleName('Gare 27')
  await page.keyboard.press('ControlOrMeta+ArrowUp')
  await page.keyboard.press('ControlOrMeta+ArrowUp')
  await expect(sheet).toHaveAccessibleName('Villa Aurore')
  await expect(sheet.getByRole('textbox', { name: 'Home' })).toBeFocused()
  await expect(rent).toHaveValue('1500')
  // Escape closes the sheet alone, the pane staying.
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('app-preview')).toHaveCount(1)
})

test('a column is as wide as its kind needs (D752): a day’s as its words, its field over them once it has the keys; a number’s as its figures, an empty cell changing nothing; a box’s as its head', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await start(page)
  await stock(page)
  const head = (/** @type {string} */ name) => page.locator('.table-grid thead th[data-column]').filter({ has: page.locator('.table-head', { hasText: new RegExp(`^${name}$`) }) })
  const wide = async (/** @type {string} */ name) => Math.round((await head(name).boundingBox())?.width ?? 999)
  await expect(page.locator('.table-grid tbody tr[data-row]')).toHaveCount(3)
  // In rem of 16 px: a day 7.75, a day with its time 12.75, a number and a box their head's, 5 at least, and never the 11.75 a field takes by itself.
  expect(await wide('Visit')).toBeLessThanOrEqual(128)
  expect(await wide('Call')).toBeLessThanOrEqual(208)
  expect(await wide('Rent')).toBeLessThanOrEqual(96)
  expect(await wide('OK')).toBeLessThanOrEqual(96)
  expect(await wide('Home')).toBeGreaterThan(150)
  // A day reads whole; its field, once it has the keys, is over its words, as wide as its cell, with room for what it shows.
  for (const [row, column] of [[0, 1], [0, 7], [1, 1]]) {
    const cell = cellAt(page, row, column), reading = cell.locator('.table-read.is-date'), field = cell.locator('input')
    expect(await reading.evaluate((words) => words.scrollWidth <= words.clientWidth)).toBe(true)
    await cell.evaluate((td) => /** @type {HTMLElement} */ (td).focus())
    await page.keyboard.press('Enter')
    await expect(field).toBeFocused()
    await expect(reading).toBeHidden()
    const [box, over] = [await cell.boundingBox(), await field.boundingBox()]
    expect(Math.abs((box?.width ?? 0) - (over?.width ?? 99))).toBeLessThanOrEqual(2)
    expect(await field.evaluate((input) => input.scrollWidth <= input.clientWidth)).toBe(true)
    await page.keyboard.press('Escape')
  }
  // An empty day's field is as wide as a day's; an empty number's leaves its column as it is.
  expect(Math.round((await cellAt(page, 2, 1).boundingBox())?.width ?? 999)).toBeLessThanOrEqual(128)
  expect(Math.round((await cellAt(page, 2, 2).boundingBox())?.width ?? 999)).toBeLessThanOrEqual(96)
})

test('rows take the colour of a choice picked in Arrange, said by a chip: along a card’s start in a list and on a board, on a calendar’s rows and a timeline’s bars, the choice said too; a step with none takes its group’s look; taken away from its chip', { tag: '@chromium' }, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-03T10:00:00'))
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  await stock(page)
  const colour = page.getByLabel('Colour', { exact: true }), chips = page.locator('.table-chips .table-chip'), cards = page.locator('.table-card'), stripe = (/** @type {import('@playwright/test').Locator} */ card) => card.evaluate((article) => getComputedStyle(article, '::before').backgroundColor)
  // None at first: a card has no line along its start, and the timeline's bars take their step's look, as ever.
  await showAs(page, 'List')
  await expect(cards).toHaveCount(3)
  expect(await cards.nth(0).evaluate((article) => getComputedStyle(article, '::before').content)).toBe('none')
  await showAs(page, 'Timeline')
  await expect(page.locator('.line-bar').first()).toHaveAttribute('data-group', 'doing')
  // Arrange offers the collection's choices and steps; one picked is said by a chip.
  await page.getByRole('button', { name: 'Arrange' }).click()
  await expect(colour.locator('option')).toHaveText(['—', 'Stage', 'Area'])
  await colour.selectOption({ label: 'Area' })
  await page.keyboard.press('Escape')
  await expect(chips).toHaveText(['Area'])
  expect((await held(page)).view.colour).toBe('area')
  // A timeline's bars and a calendar's rows are in the choice's colour, its pill's: a bar says the choice after its name, unseen, its tip being its days; a calendar's row in its tip.
  await expect(page.locator('.line-bar')).toHaveCount(2)
  await expect(page.locator('.line-bar').first()).toHaveAttribute('data-hue', '1')
  await expect(page.locator('.line-bar').first().locator('.visually-hidden')).toHaveText('Hillside')
  await showAs(page, 'Calendar')
  const villa = dayOf(page, '2026-11-04').locator('.cal-row'), quai = dayOf(page, '2026-11-06').locator('.cal-row')
  await expect(villa).toHaveAttribute('data-hue', '1')
  await expect(villa).toHaveAttribute('title', 'Hillside')
  await expect(villa).toHaveAccessibleName('Villa Aurore')
  await expect(villa).toHaveAccessibleDescription('Hillside')
  await expect(quai).toHaveAttribute('data-hue', '0')
  expect(await villa.evaluate((row) => getComputedStyle(row).backgroundColor)).not.toBe(await quai.evaluate((row) => getComputedStyle(row).backgroundColor))
  // A card has it along its start, in a list and on a board, and says the choice first.
  await showAs(page, 'List')
  await expect(cards.nth(0)).toHaveAttribute('data-hue', '1')
  await expect(cards.nth(0).locator('.table-facts .table-pill')).toHaveText(['Hillside'])
  expect(await stripe(cards.nth(0))).not.toBe(await stripe(cards.nth(1)))
  expect(await stripe(cards.nth(1))).toBe(await stripe(cards.nth(2)))
  expect(await cards.nth(0).evaluate((article) => getComputedStyle(article, '::before').width)).toBe('4px')
  await showAs(page, 'Board')
  await expect(page.locator('.table-lane .table-card', { hasText: 'Villa Aurore' })).toHaveAttribute('data-hue', '1')
  // By a step with no colour of its own: its group's look.
  await page.getByRole('button', { name: 'Arrange' }).click()
  await colour.selectOption({ label: 'Stage' })
  await page.keyboard.press('Escape')
  await expect(chips).toHaveText(['Stage'])
  await showAs(page, 'List')
  await expect(cards.nth(0)).toHaveAttribute('data-group', 'doing')
  await expect(cards.nth(0)).not.toHaveAttribute('data-hue')
  await expect(cards.nth(2)).toHaveAttribute('data-group', 'done')
  expect(new Set([await stripe(cards.nth(0)), await stripe(cards.nth(1)), await stripe(cards.nth(2))]).size).toBe(3)
  await showAs(page, 'Calendar')
  expect(await villa.evaluate((row) => getComputedStyle(row).backgroundColor)).not.toBe(await quai.evaluate((row) => getComputedStyle(row).backgroundColor))
  // Its chip's × takes it away.
  await chips.getByRole('button', { name: 'Remove Stage' }).click()
  await expect(chips).toHaveCount(0)
  await expect(villa).not.toHaveAttribute('data-group')
  expect((await held(page)).view.colour).toBeUndefined()
})

test('in each of the 12 looks, by day and by night, a calendar’s row and a timeline’s bar read at AA in each of a choice’s seven colours and a status’s three tones, a row’s time too (D760)', { tag: '@chromium' }, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-03T10:00:00'))
  await page.setViewportSize({ width: 1280, height: 800 })
  await start(page)
  await stock(page)
  await expect(page.locator('.table-grid tbody tr[data-row]')).toHaveCount(3)
  await page.evaluate(async () => { const tables = await import('/caps/tables/tables.js'), one = /** @type {any} */ (tables.shown.value); await tables.change(one, [{ row: one.rows[0].id, set: { Visit: '2026-11-04T09:30' } }], 'user') })
  const looks = await page.evaluate(async () => Object.keys((await import('/ui/looks.js')).LOOKS))
  /** Each tone's contrast under 4.5, for the words of what `selector` finds and the quiet ones in it, over its ground as it shows. @param {string} selector */
  const low = (selector) => page.evaluate((selector) => {
    const rgb = (/** @type {string} */ css) => { const c = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d')); c.fillStyle = css; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data] }
    const over = (/** @type {number[]} */ top, /** @type {number[]} */ under) => [0, 1, 2].map((i) => top[i] * top[3] / 255 + under[i] * (1 - top[3] / 255)).concat(255)
    const lum = (/** @type {number[]} */ [r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const contrast = (/** @type {number[]} */ a, /** @type {number[]} */ b) => ((x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05))(lum(a), lum(b))
    const row = /** @type {HTMLElement} */ (document.querySelector(selector)), quiet = row.querySelector('.muted'), grounds = []
    for (let at = row.parentElement; at; at = at.parentElement) { const ground = rgb(getComputedStyle(at).backgroundColor); grounds.push(ground); if (ground[3] === 255) break }
    const under = grounds.reduceRight((below, ground) => over(ground, below), [255, 255, 255, 255]), failed = []
    for (const [name, value] of [...Array.from({ length: 7 }, (_, hue) => ['data-hue', String(hue)]), ['data-group', 'todo'], ['data-group', 'doing'], ['data-group', 'done']]) {
      row.removeAttribute('data-hue'); row.removeAttribute('data-group'); row.setAttribute(name, value)
      const ground = over(rgb(getComputedStyle(row).backgroundColor), under)
      for (const words of [row, ...(quiet ? [quiet] : [])]) { const ratio = contrast(over(rgb(getComputedStyle(words).color), ground), ground); if (ratio < 4.5) failed.push(`${name}=${value}${words === quiet ? ' quiet' : ''} ${ratio.toFixed(2)}`) }
    }
    return failed
  }, selector)
  const failures = []
  for (const [layout, selector] of [['Calendar', '.cal-row:has(.muted)'], ['Timeline', '.line-bar']]) {
    await showAs(page, layout)
    await expect(page.locator(selector).first()).toBeVisible()
    for (const look of looks) {
      for (const scheme of /** @type {const} */ (['light', 'dark'])) {
        await page.emulateMedia({ colorScheme: scheme })
        await page.evaluate(async (id) => (await import('/ui/state.js')).setLook({ id }), look)
        await expect(page.locator('html')).toHaveAttribute('data-look', look)
        failures.push(...(await low(selector)).map((said) => `${layout} ${look} ${scheme}: ${said}`))
      }
    }
  }
  expect(failures).toEqual([])
})

test('cells copied from a spreadsheet, pasted on a cell, fill from it, a line a row, and make rows past the last, each value as its column takes it, said with an Undo that takes it back whole, as ⌘Z does; in a field, one value is the field’s own (D759)', async ({ page }) => {
  await start(page)
  const fetched = /** @type {string[]} */ ([])
  page.on('request', (request) => { if (request.url().includes('/caps/paste/')) fetched.push(request.url()) })
  await stock(page)
  const rows = page.locator('.table-grid tbody tr[data-row]'), toast = page.locator('.toast')
  await expect(rows).toHaveCount(3)
  expect(fetched).toEqual([])
  // Three lines on the second row's name: two rows changed, one made. A number, a day and a box as people write them, a step by its name, a new choice.
  const block = 'Quai 12 bis\t11/7/2026\t"1,020.50"\tyes\tvisited\tMarsh\r\nGare 27\tNov 21, 2026\t$890\tno\tSold\tCanal\r\nÉcluse 5\t\t940\tx\tTo visit\t\r\n'
  expect(await pasteOn(cellAt(page, 1, 0), block)).toBe(false)
  await expect(rows).toHaveCount(4)
  await expect(toast).toContainText('3 rows pasted')
  expect(fetched.some((url) => url.endsWith('/caps/paste/paste.js'))).toBe(true)
  const { rows: [first, second, third, fourth], choices } = await held(page)
  expect(first).toMatchObject({ Home: 'Villa Aurore', Rent: 1450 })
  expect(second).toMatchObject({ Home: 'Quai 12 bis', Visit: '2026-11-07', Rent: 1020.5, OK: true, Stage: 'Visited', Area: 'Marsh' })
  // A step the column hasn't leaves the cell as it was.
  expect(third).toMatchObject({ Home: 'Gare 27', Visit: '2026-11-21', Rent: 890, OK: false, Stage: 'Signed', Area: 'Canal' })
  expect(fourth).toMatchObject({ Home: 'Écluse 5', Visit: null, Rent: 940, OK: true, Stage: 'To visit', Area: null })
  expect(choices.Area).toEqual(['Canal', 'Hillside', 'Marsh'])
  await expect(cellAt(page, 1, 1).locator('.table-read')).toHaveText('Nov 7, 2026')
  // Its Undo takes it back whole; ⇧⌘Z pastes it again, ⌘Z takes it back.
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(rows).toHaveCount(3)
  expect((await held(page)).rows[1]).toMatchObject({ Home: 'Quai 12', Visit: '2026-11-06', Rent: 980, OK: null, Stage: 'To visit', Area: 'Canal' })
  await cellAt(page, 0, 0).evaluate((cell) => /** @type {HTMLElement} */ (cell).focus())
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(rows).toHaveCount(4)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(rows).toHaveCount(3)
  // In a field, one value is the field's own, the browser's to paste; cells with a tab between them, or a spreadsheet's table, fill from that cell.
  await cellAt(page, 0, 2).click()
  await expect(cellAt(page, 0, 2).locator('input')).toBeFocused()
  expect(await pasteOn(cellAt(page, 0, 2), '1500\n')).toBe(true)
  expect((await held(page)).rows[0].Rent).toBe(1450)
  expect(await pasteOn(cellAt(page, 0, 2), '1500\tno')).toBe(false)
  await expect.poll(async () => (await held(page)).rows[0]).toMatchObject({ Home: 'Villa Aurore', Rent: 1500, OK: false })
  await expect(toast).toContainText('1 row pasted')
  expect(await pasteOn(cellAt(page, 0, 2), '1600\n1700\n', { html: '<table><tr><td>1600</td></tr><tr><td>1700</td></tr></table>' })).toBe(false)
  await expect.poll(async () => (await held(page)).rows.map((row) => row.Rent)).toEqual([1600, 1700, null])
  // What no column takes is said, nothing changing: a word for a day.
  await page.keyboard.press('Escape')
  expect(await pasteOn(cellAt(page, 0, 1), 'soon')).toBe(false)
  await expect(page.getByRole('alert').filter({ hasText: 'That doesn’t fit this column.' })).toHaveCount(1)
  expect((await held(page)).rows[0].Visit).toBe('2026-11-04')
  // A spreadsheet's copy comes with its picture: on a picture's cell too, its cells are the table's, the picture no one's.
  expect(await pasteOn(cellAt(page, 0, 6), 'x\t12/1/2026 9:15 AM', { picture: true })).toBe(false)
  await expect.poll(async () => (await held(page)).rows[0].Call).toBe('2026-12-01T09:15')
  expect((await held(page)).rows[0].Photo).toBe(null)
})

for (const [lang, said, day, sum] of /** @type {const} */ ([['ar', 'لُصق صفّان', '٢٠/١١/٢٠٢٦', '١٬٢٣٤٫٥'], ['ja', '2 行を貼り付けました', '2026年11月20日', '１２３４．５']])) {
  test(`cells pasted in ${lang}: said in the language's words, a day and a number read as it writes them`, async ({ page }) => {
    await start(page, lang)
    await stock(page)
    await expect(page.locator('.table-grid tbody tr[data-row]')).toHaveCount(3)
    expect(await pasteOn(cellAt(page, 0, 1), `${day}\t${sum}\n${day}\t\n`)).toBe(false)
    await expect(page.locator('.toast')).toContainText(said)
    expect((await held(page)).rows.slice(0, 2).map((row) => [row.Visit, row.Rent])).toEqual([['2026-11-20', 1234.5], ['2026-11-20', null]])
  })
}

/** A collection of homes with no choice, no picture and no date, its second row's rent changed four times. @param {import('@playwright/test').Page} page @param {string[]} [names] its rows' */
const rents = (page, names = ['Villa Aurore', 'Quai 12', 'Gare 27']) => page.evaluate(async (names) => {
  const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
  await unlock('tables')
  const tables = await import('/caps/tables/tables.js')
  const folder = await tables.makeTable({ name: 'Homes', columns: [{ name: 'Home', type: 'text' }, { name: 'Rent', type: 'number' }, { name: 'Rooms', type: 'number' }, { name: 'Listing', type: 'link' }, { name: 'Notes', type: 'text' }] }, app.projectDir)
  await tables.change(/** @type {any} */ (await tables.load(folder)), names.map((Home, i) => ({ set: { Home, Rent: 900 + i * 100, Rooms: 2 + i, Listing: `https://homes.example/${i}`, Notes: 'Bright.' } })), 'user')
  for (const Rent of [1020, 1010, 990, 980]) { const one = /** @type {any} */ (await tables.load(folder)); await tables.change(one, [{ row: one.rows[1].id, set: { Rent } }], 'user') }
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Homes.xlsx', title: 'Homes' }, true)
}, names)
/** Whether a row's name leaves the button that opens it room: the button lies in the room its field, and its reading where its words are long, keep at their words' end. @param {import('@playwright/test').Locator} row */
const apart = (row) => row.locator('th').evaluate((cell) => {
  const button = /** @type {Element} */ (cell.querySelector('button')).getBoundingClientRect()
  return [...cell.querySelectorAll('.table-read, input')].every((words) => {
    const box = words.getBoundingClientRect(), style = getComputedStyle(words)
    return style.direction === 'rtl' ? button.right <= box.left + parseFloat(style.paddingLeft) + 1 : button.left >= box.right - parseFloat(style.paddingRight) - 1
  })
})

test('a row opens from a button at the end of its name, shown with the pointer or the keys on its row; its sheet says every change, the last first, with all it set; Show as lists every layout, one whose column the collection lacks saying which and adding it', { tag: '@chromium' }, async ({ page }) => {
  await start(page)
  await rents(page)
  const rows = page.locator('.table-grid tbody tr[data-row]'), sheet = page.locator('dialog.table-row'), none = page.locator('.table-none'), opens = rows.nth(1).getByRole('button', { name: 'Open' })
  await expect(rows).toHaveCount(3)
  // The button is seen through until the pointer is on its row or the keys are in it; the name leaves it room.
  await page.locator('.table-bar').hover()
  await expect(opens).toHaveCSS('opacity', '0')
  await rows.nth(1).locator('td').last().hover()
  await expect(opens).toHaveCSS('opacity', '1')
  await page.locator('.table-bar').hover()
  await rows.nth(1).getByTitle('Rent').focus()
  await expect(opens).toHaveCSS('opacity', '1')
  expect(await apart(rows.nth(1))).toBe(true)
  // It follows the name's field, and opens the row's sheet with the keys too; closed, the keys are on it again.
  expect(await rows.nth(1).locator('th').evaluate((cell) => cell.querySelector('input')?.nextElementSibling?.getAttribute('aria-label'))).toBe('Open')
  await opens.focus()
  await page.keyboard.press('Enter')
  await expect(sheet).toHaveAccessibleName('Quai 12')
  // Every change, the last first: four of the rent, each with the value before it, then the row as it was made, with every cell it set.
  await expect(sheet.getByRole('heading', { name: 'Last changes' })).toBeVisible()
  const last = sheet.locator('.table-last > li')
  await expect(last).toHaveCount(5)
  await expect(last.locator('b')).toHaveText(['980', '990', '1,010', '1,020', 'Quai 12', '1,000', '3', 'https://homes.example/1', 'Bright.'])
  await expect(last.first().locator('s')).toHaveText('990')
  await expect(last.last().locator('dt')).toHaveText(['Home', 'Rent', 'Rooms', 'Listing', 'Notes'])
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(opens).toBeFocused()

  // Every layout is listed. One whose column the collection lacks says which in the rows' place, in a status, and shows nothing else.
  expect(await layouts(page)).toEqual(LAYOUTS.en)
  for (const [layout, kind] of [['Board', 'Status'], ['Gallery', 'Picture'], ['Timeline', 'Date'], ['Calendar', 'Date']]) {
    await showAs(page, layout)
    await expect(none.getByRole('status')).toHaveText(`Add a “${kind}” column to show the rows this way.`)
    await expect(page.locator('.table-grid, .table-board, .table-gallery, .table-list, .cal')).toHaveCount(0)
  }
  // Its button adds the column, named as its kind, and the layout shows; the keys go to the pill, whose menu has Show as.
  await none.getByRole('button', { name: 'Add a column' }).click()
  await expect(page.locator('.cal-grid')).toBeVisible()
  await expect(page.locator('.table-kept')).toBeFocused()
  await expect(none.getByRole('status')).toHaveText('')
  await expect(none.getByRole('button')).toHaveCount(0)
  // The timeline is by the same date; a board gets a Status with its three steps, a gallery a Picture.
  await showAs(page, 'Timeline')
  await expect(page.locator('.line-scroll')).toBeVisible()
  await showAs(page, 'Board')
  await none.getByRole('button', { name: 'Add a column' }).click()
  await expect(page.locator('.table-lane h3')).toContainText(['To do', 'In progress', 'Done'])
  await expect(page.locator('.table-card')).toHaveCount(3)
  await showAs(page, 'Gallery')
  await none.getByRole('button', { name: 'Add a column' }).click()
  await expect(page.locator('.table-gallery .table-card')).toHaveCount(3)
  await showAs(page, 'Table')
  await expect(page.locator('.table-head')).toHaveText(['Home', 'Rent', 'Rooms', 'Listing', 'Notes', 'Date', 'Status', 'Picture'])
})

for (const [lang, opens, last, needs, add] of /** @type {const} */ ([['ar', 'فتح', 'آخر التعديلات', 'أضف عمود «تاريخ» لعرض الصفوف بهذا الشكل.', 'إضافة عمود'], ['ja', '開く', '最近の変更', '「日付」の列を追加すると、行をこの形で表示できます。', '列を追加']])) {
  test(`a row opened from its name, its changes and a layout that lacks its column in ${lang}: their words the language's, the button at the end of the name's words, whichever way they are written`, async ({ page }) => {
    await start(page, lang)
    await rents(page, ['Villa Aurore', 'بيت البحر', 'Gare 27'])
    const rows = page.locator('.table-grid tbody tr[data-row]'), sheet = page.locator('dialog.table-row'), none = page.locator('.table-none')
    await expect(rows).toHaveCount(3)
    // A name written from the left and one written from the right each leave the button room at their end.
    for (const row of [0, 1]) { await rows.nth(row).hover(); expect(await apart(rows.nth(row))).toBe(true) }
    await rows.nth(1).getByRole('button', { name: opens }).click()
    await expect(sheet.getByRole('heading', { name: last })).toBeVisible()
    await expect(sheet.locator('.table-last > li')).toHaveCount(5)
    await page.keyboard.press('Escape')
    await showAs(page, LAYOUTS[lang][4])
    await expect(none.getByRole('status')).toHaveText(needs)
    await none.getByRole('button', { name: add }).click()
    await expect(page.locator('.cal-grid')).toBeVisible()
  })
}
