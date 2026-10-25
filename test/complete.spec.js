// The box's / and @ (D199): / names what Jean uses, the room's skills and what Jean can do, and
// once Skills is found, a ready-made skill, read before it is added; @ attaches a file shared
// before, points at an earlier task, and at a file of the conversation's folder. The message keeps
// the words picked, and the brain is told what each names just before it. + in the box opens a
// menu beside it of the room's skills, and of its connections, each picked named as / names it (D292). What / names
// is a chip in the box, by its name, a mode in the request, which says above it what it is, and a tag there looks for it (D610).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, turnOn, closeSettings, connect, MAIL_URL } from './helpers.js'

/** A name as the box holds it once picked: a chip, by its name (D610). @param {string} name */
const chip = (name) => `\u2068\u202F${name}\u202F\u2069`

/** The menu above the box. @param {import('@playwright/test').Page} page */
const menu = (page) => page.locator('#complete')

/** What the brain was told in the conversation on screen about the words its messages name. @param {import('@playwright/test').Page} page */
const told = (page) => page.evaluate(async () => {
  const { app } = await import('/ui/state.js')
  return (app.current.value?.records ?? []).flatMap(({ update }) => (update?.sessionUpdate === '_system_note' && update.data.kind === 'mentions' ? [update.text] : []))
})

/** The answer on screen, once it has ended and the box can send again. @param {import('@playwright/test').Page} page */
async function answered(page) {
  await expect(page.locator('.msg-jean .prose').last()).not.toBeEmpty()
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
}

test('/ names what Jean can do, and once Skills is found, a ready-made skill, read before it is added', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const box = page.locator('#prompt')
  // Before Skills and Connections are found, / names only what Jean can do now: no skills to add, no services.
  await box.pressSequentially('Plot sales by month /')
  await expect(menu(page).locator('.complete-heading')).toHaveText(['What Jean can do'])
  await box.press('Escape')
  await turnOn(page, 'Skills')
  await closeSettings(page)
  // (Clicked first: after a modal, headless Chromium types nowhere until the box is.)
  await box.click()
  await box.press('ControlOrMeta+End')
  await box.press('Backspace')
  await box.pressSequentially('/')
  await expect(menu(page).locator('.complete-heading')).toHaveText(['What Jean can do', 'Skills to add'])
  // Typing narrows it, and the box says which option Enter picks.
  await box.pressSequentially('cha')
  await expect(menu(page).locator('[aria-selected="true"]')).toContainText('Chart')
  await expect(box).toHaveAttribute('aria-activedescendant', 'complete-0')
  await box.press('Enter')
  const ready = page.locator('app-skill-ready dialog[open]')
  await expect(ready).toContainText('Bars, lines, pies and more')
  // Named as its tile is, its steps folded, since Jean's own are written for the brain (D261).
  await expect(ready.getByRole('heading', { name: 'Chart' })).toBeVisible()
  await expect(ready.locator('.skill-steps')).toBeHidden()
  await ready.getByText('Read its steps').click()
  await expect(ready.locator('.skill-steps')).toBeVisible()
  await ready.locator('.button.primary').click()
  await expect(page.locator('.toast')).toContainText('Added the skill “Chart”.')
  await expect(box).toHaveValue(`Plot sales by month ${chip('Chart')} `)
  await expect(box).toBeFocused()

  // Now one of the room's skills; what Jean can do is picked with Tab; Escape closes the menu.
  // (Clicked first: after a modal, headless Chromium types nowhere until the box is.)
  await box.click()
  await box.press('ControlOrMeta+End')
  await box.pressSequentially('and /')
  await expect(menu(page).locator('.complete-heading').first()).toHaveText('Skills')
  await box.pressSequentially('doc')
  await expect(menu(page).locator('[aria-selected="true"]')).toContainText('Documents and spreadsheets')
  await box.press('Tab')
  await expect(box).toHaveValue(`Plot sales by month ${chip('Chart')} and ${chip('Documents and spreadsheets')} `)
  await box.pressSequentially('/')
  await expect(menu(page)).toBeVisible()
  await box.press('Escape')
  await expect(menu(page)).toHaveCount(0)
  await box.pressSequentially('x')
  await expect(menu(page)).toHaveCount(0)
  await box.press('Backspace')
  await box.press('Backspace')
  await box.press('Enter')
  await answered(page)
  await expect(page.locator('.msg-user').last()).toHaveText('Plot sales by month Chart and Documents and spreadsheets')
  const [note] = await told(page)
  expect(note).toContain('"/chart" is the skill chart: follow its steps for this message:')
  expect(note).toContain('```echarts')
  expect(note).toContain('"/Documents and spreadsheets" asks you to use these tools for this message: write, edit.')
  // What every conversation has is loaded by now, but / names only what the case shows, by its name there (D127).
  await box.pressSequentially('/')
  await expect(menu(page).locator('.complete-label')).toContainText(['Documents and spreadsheets'])
  await expect(menu(page)).not.toContainText('cap.')
})

test('what / names is a chip in the box, by its name, removed whole and sent as its word; a mode in the request, which says what it is; a tag there looks for it', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const box = page.locator('#prompt')
  const tip = page.locator('.mark-tip')
  const CHIP = chip('Documents and spreadsheets')
  await box.pressSequentially('Sum it up with /doc')
  await expect(menu(page).locator('[aria-selected="true"]')).toContainText('Documents and spreadsheets')
  await box.press('Tab')
  await box.pressSequentially('for #sales')
  // Picked, a chip: its name, no slash, drawn as a mode behind the box's words; a tag stays words in the box.
  await expect(box).toHaveValue(`Sum it up with ${CHIP} for #sales`)
  const name = page.locator('.composer .marks .mark-name')
  await expect(name).toHaveText(CHIP)
  await expect(page.locator('.composer .marks .mark-tag')).toHaveCount(0)
  const [area, drawn] = await Promise.all([box.boundingBox(), name.boundingBox()])
  if (!drawn || !area) throw new Error('no chip drawn')
  expect(drawn.y >= area.y && drawn.y + drawn.height <= area.y + area.height + 1).toBe(true)
  // Pointed at, it says what it is, in the words the menu and Settings have for it; it goes as the pointer does.
  await page.mouse.move(drawn.x + drawn.width / 2, drawn.y + drawn.height / 2)
  await expect(tip.locator('strong')).toHaveText('Documents and spreadsheets')
  await expect(tip.locator('small')).toHaveText('What Jean can do')
  await expect(tip).toContainText('Ask for a Word document, a spreadsheet or another file')
  expect((await tip.boundingBox())?.y ?? Infinity).toBeLessThan(drawn.y)
  await page.mouse.move(0, 0)
  await expect(tip).toBeHidden()
  // Clicked, the caret goes to one of its ends, never in it, and the popover shows, not the menu; Escape puts it away.
  await page.mouse.click(drawn.x + drawn.width / 2, drawn.y + drawn.height / 2)
  await expect(tip).toBeVisible()
  await expect(menu(page)).toHaveCount(0)
  expect([15, 15 + CHIP.length]).toContain(await box.evaluate((/** @type {HTMLTextAreaElement} */ area) => area.selectionStart))
  await box.press('Escape')
  await expect(tip).toBeHidden()
  // The arrows go round it in one step, and show what it is.
  const caret = () => box.evaluate((/** @type {HTMLTextAreaElement} */ area) => area.selectionStart)
  const end = () => box.evaluate((/** @type {HTMLTextAreaElement} */ area) => area.setSelectionRange(area.value.length, area.value.length))
  await end()
  for (let i = 0; i < ' for #sales'.length; i++) await box.press('ArrowLeft')
  await expect.poll(caret).toBe(15 + CHIP.length)
  await expect(tip).toBeVisible()
  await box.press('ArrowLeft')
  await expect.poll(caret).toBe(15)
  // Typed whole by hand, once the caret goes on past it, a chip too.
  await end()
  await box.pressSequentially(' and /documents and spreadsheets')
  await expect(page.locator('.composer .marks .mark-name')).toHaveCount(1)
  await box.pressSequentially(' now')
  await expect(page.locator('.composer .marks .mark-name')).toHaveCount(2)
  await expect(tip).toBeHidden()
  // In another language, each chip says its name in it at once, and is sent as the same word.
  const before = await box.inputValue()
  await page.keyboard.press('ControlOrMeta+Comma')
  await page.locator('app-settings dialog[open] .settings-panel select').first().selectOption('fr')
  await closeSettings(page)
  await expect(box).toHaveValue(before.replaceAll(CHIP, chip('Documents et tableurs')))
  await page.keyboard.press('ControlOrMeta+Comma')
  await page.locator('app-settings dialog[open] .settings-panel select').first().selectOption('en')
  await closeSettings(page)
  await expect(box).toHaveValue(before)
  await box.focus()
  await box.press('Enter')
  await answered(page)
  // Sent as its word, so the brain is told what it names; shown as a mode, its icon and its name.
  const [note] = await told(page)
  expect(note).toContain('"/Documents and spreadsheets" asks you to use these tools for this message')
  const request = page.locator('.msg-user').last()
  await expect(request).toHaveText('Sum it up with Documents and spreadsheets for #sales and Documents and spreadsheets now')
  await expect(request.locator('.mark-name .icon')).toHaveCount(2)
  await request.locator('.mark-name').first().hover()
  await expect(tip.locator('strong')).toHaveText('Documents and spreadsheets')
  // Before Creations is found, a tag is words; once it is, a click looks for it there.
  await expect(request.locator('.mark-tag')).toHaveCount(0)
  // Edited where it is, its words are chips again, and Backspace after one takes it whole.
  await request.dblclick()
  const edited = page.locator('app-edit textarea')
  await expect(page.locator('app-edit .marks .mark-name')).toHaveCount(2)
  await edited.evaluate((/** @type {HTMLTextAreaElement} */ area, length) => area.setSelectionRange(15 + length, 15 + length), CHIP.length)
  await edited.press('Backspace')
  await expect(edited).toHaveValue(`Sum it up with  for #sales and ${CHIP} now`)
  await edited.press('Escape')
  await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('documents') })
  await request.locator('.mark-tag').click()
  await expect(page.locator('app-creations input[type="search"]')).toHaveValue('#sales')
})

test('+ opens a menu beside its Skills row, the room’s skills by name, and beside its Connections row; each picked is named in the box as / names it', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const box = page.locator('#prompt')
  const menu = page.locator('#add-menu')
  const beside = page.locator('#add-sub')
  const skills = menu.locator('[data-page="skills"]')
  // Nothing of Skills or Connections in + before they are found (D281).
  await page.locator('.composer .add').click()
  await expect(menu).toBeVisible()
  await expect(menu.locator('[data-page]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await turnOn(page, 'Skills')
  await closeSettings(page)
  // Two skills whose names sort the other way from the titles the user reads.
  await page.evaluate(async () => {
    const [{ app }, { saveSkill }] = await Promise.all([import('/ui/state.js'), import('/core/skills.js')])
    await saveSkill(app.fs, '', { name: 'a-report', description: 'When the weekly report is asked for', body: '# Weekly report\n\n1. List the week’s work.', by: 'test' })
    await saveSkill(app.fs, '', { name: 'z-mail', description: 'When emails need answers', body: '# Answer emails\n\n1. Answer each one.', by: 'test' })
  })
  await box.click()
  await box.pressSequentially('Plot sales')
  await page.locator('.composer .add').click()
  // Pointed at, the row opens its menu beside it, and + stays open.
  await skills.hover()
  await expect(beside.locator('.complete-label')).toHaveText(['Answer emails', 'Weekly report'])
  await expect(skills).toHaveAttribute('aria-expanded', 'true')
  await expect(menu).toBeVisible()
  const [row, side] = [await skills.boundingBox(), await beside.boundingBox()]
  expect(side?.x).toBeGreaterThanOrEqual((row?.x ?? 0) + (row?.width ?? 0))
  // Another row of + closes it.
  await menu.getByRole('button', { name: 'Add files' }).hover()
  await expect(beside).toHaveCount(0)
  await expect(skills).toHaveAttribute('aria-expanded', 'false')
  // Picked, a skill is named in the box, and + closes.
  await skills.hover()
  await beside.getByRole('button', { name: 'Weekly report' }).click()
  await expect(menu).toBeHidden()
  await expect(box).toHaveValue(`Plot sales ${chip('Weekly report')} `)
  await expect(box).toBeFocused()
  // From the keyboard, Enter opens it with the keyboard in it, and Escape closes it alone.
  await page.locator('.composer .add').click()
  await skills.focus()
  await page.keyboard.press('Enter')
  await expect(beside.getByRole('button').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(beside).toHaveCount(0)
  await expect(menu).toBeVisible()
  await expect(skills).toBeFocused()
  // Its last line opens Settings on Skills' Add a skill (D517).
  await skills.click()
  await beside.getByRole('button', { name: 'Add a skill' }).click()
  await expect(page.locator('app-settings .settings-nav [aria-current="page"]')).toHaveText('Skills')
  await expect(page.locator('app-settings .skill-head h2')).toHaveText('Add a skill')
  await closeSettings(page)
  // (Clicked first: after a modal, headless Chromium types nowhere until the box is. At its end, after the space, / stays closed.)
  await box.click()
  await box.press('ControlOrMeta+End')
  await box.press('Enter')
  await answered(page)
  await expect(page.locator('.msg-user').last()).toHaveText('Plot sales Weekly report')
  const [note] = await told(page)
  expect(note).toContain('"/a-report" is the skill a-report: follow its steps for this message:')

  // Connections: pointed at after Skills, its menu takes the place of Skills', the room's, then Connect a service.
  await connect(page, `${MAIL_URL}/open/mcp`)
  await box.click()
  await box.pressSequentially('Find the invoice in')
  await page.locator('.composer .add').click()
  await skills.hover()
  await expect(beside.locator('.complete-label')).toHaveText(['Answer emails', 'Weekly report'])
  await menu.locator('[data-page="connections"]').hover()
  await expect(beside.locator('.complete-label')).toHaveText(['Mail'])
  await expect(beside.getByRole('button', { name: 'Connect a service' })).toBeVisible()
  await beside.getByRole('button', { name: 'Mail' }).click()
  await expect(box).toHaveValue(`Find the invoice in ${chip('Mail')} `)
  // A chip says nothing of the words' direction: in Arabic after "Mail", the box and the request are right to left.
  await box.fill(`${chip('Mail')} ابحث عن الفاتورة الأخيرة`)
  await expect(box).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('.composer .marks')).toHaveCSS('direction', 'rtl')
  await box.press('Enter')
  await answered(page)
  // (Its icon is its first letter, as it has no logo.)
  await expect(page.locator('.msg-user').last()).toHaveText('MMail ابحث عن الفاتورة الأخيرة')
  await expect(page.locator('.msg-user').last()).toHaveCSS('direction', 'rtl')
  await expect(page.locator('.msg-user').last().locator('.mark-name')).toHaveAttribute('dir', 'rtl')
  await expect(box).toHaveAttribute('dir', 'auto')
})

test('@ attaches a file shared before and points at an earlier task', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'Quarterly notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Revenue grew 12% in Q3.') })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await page.locator('#prompt').fill('Summarize this')
  await page.locator('#prompt').press('Enter')
  await answered(page)
  // Titled alongside the answer (D112).
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.conversations.value[0]?.title)).toBeTruthy()
  const title = String(await page.evaluate(async () => (await import('/ui/state.js')).app.conversations.value[0]?.title))

  await page.locator('.wordmark').click()
  await expect(page.locator('.hero-question')).toBeVisible()
  const box = page.locator('#prompt')
  await box.pressSequentially('Compare @')
  await expect(menu(page).locator('.complete-heading')).toHaveText(['Files', 'Tasks'])
  await box.pressSequentially('quar')
  await box.press('Enter')
  await expect(page.locator('.attachment')).toContainText('Quarterly notes.txt')
  await box.pressSequentially('with @')
  await expect(menu(page).locator('.complete-heading')).toHaveText(['Files', 'Tasks'])
  // ↑ and ↓ move through the menu, not through what was asked before.
  await box.press('ArrowDown')
  await expect(menu(page).locator('[aria-selected="true"]')).toContainText(title)
  await box.press('Enter')
  await expect(box).toHaveValue(`Compare @Quarterly notes.txt with @${title} `)
  await box.press('Enter')
  await answered(page)
  await expect(page.locator('.msg-files').last()).toContainText('Quarterly notes.txt')
  const [note] = await told(page)
  expect(note).toContain(`"@${title}" is the earlier task "${title}", as it went:`)
  expect(note).toContain('User: [Quarterly notes.txt] Summarize this')
  expect(note).toContain('Assistant: ')
})

test('@ points at a file of the conversation’s folder', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium opens a folder in place; elsewhere it is a copy')
  // The system's folder picker, played by a folder of the private file system (as folders.spec.js does).
  await page.addInitScript(() => Object.assign(window, {
    showDirectoryPicker: async () => (await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked')).getDirectoryHandle('Clients'),
  }))
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => {
    const clients = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked', { create: true })).getDirectoryHandle('Clients', { create: true })
    const contracts = await clients.getDirectoryHandle('Contracts', { create: true })
    for (const [dir, name, text] of /** @type {const} */ ([[contracts, 'Acme.txt', 'Late payment: 60 days.'], [clients, 'notes.txt', 'Call Dana.']])) {
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable()
      await writable.write(text)
      await writable.close()
    }
  })
  await turnOn(page, 'Folders')
  await page.keyboard.press('Escape')
  await expect(page.locator('.folder-name')).toHaveText('Clients')
  const box = page.locator('#prompt')
  await box.pressSequentially('Read @con')
  await expect(menu(page).locator('.complete-heading')).toHaveText(['Clients'])
  await expect(menu(page).locator('.complete-label')).toHaveText(['Contracts/', 'Contracts/Acme.txt'])
  await box.press('ArrowDown')
  await box.press('Enter')
  await expect(box).toHaveValue('Read @Contracts/Acme.txt ')
  await box.press('Enter')
  await answered(page)
  const [note] = await told(page)
  expect(note).toContain('"@Contracts/Acme.txt" is the file "Contracts/Acme.txt" in the user\'s folder: read it with open.')
})
