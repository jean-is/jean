// The box's / and @ (D199): / names what Jean uses, the room's skills and what Jean can do, and
// finds what isn't there yet, a ready-made skill read before it is added; @ attaches a file shared
// before, points at an earlier task, and at a file of the conversation's folder. The message keeps
// the words picked, and the brain is told what each names just before it.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, turnOn } from './helpers.js'

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

test('/ finds a ready-made skill, read before it is added, and names it and what Jean can do', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const box = page.locator('#prompt')
  await box.pressSequentially('Plot sales by month /')
  await expect(menu(page).locator('.complete-heading')).toHaveText(['What Jean can do', 'Skills to add', 'Connect a service'])
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
  await expect(box).toHaveValue('Plot sales by month /chart ')
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
  await expect(box).toHaveValue('Plot sales by month /chart and /Documents and spreadsheets ')
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
  await expect(page.locator('.msg-user').last()).toHaveText('Plot sales by month /chart and /Documents and spreadsheets')
  const [note] = await told(page)
  expect(note).toContain('"/chart" is the skill chart: follow its steps for this message:')
  expect(note).toContain('```echarts')
  expect(note).toContain('"/Documents and spreadsheets" asks you to use these tools for this message: write, edit.')
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
    showDirectoryPicker: async () => (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked')).getDirectoryHandle('Clients'),
  }))
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => {
    const clients = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked', { create: true })).getDirectoryHandle('Clients', { create: true })
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
