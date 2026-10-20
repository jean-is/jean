// Search (D133): offered once there are ten conversations, then ⌘K (Ctrl+K outside Apple's
// systems), or Search at the top of the drawer (D165), finds a conversation by its words, a file by
// its text, and a section of Settings, as people type: part of a word, case and accents aside; once
// Connections is found, a connection and a service to connect too, named in the box as / names them.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openTasks, withPolicy, turnOn, closeSettings, MAIL_URL } from './helpers.js'

/**
 * Conversations and a file kept as Jean keeps them, so there is plenty to look back on.
 * @param {import('@playwright/test').Page} page @param {number} count @param {string} file its text
 */
async function seed(page, count, file) {
  await page.evaluate(async ({ count, file }) => {
    const { app, refreshConversations } = await import('/ui/state.js')
    const { createConversation, appendRecords } = await import('/core/conversations.js')
    const { userRecords, envelope } = await import('/core/events.js')
    const { addFile } = await import('/core/files.js')
    for (let i = 1; i <= count; i++) {
      const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: 'test' })
      await appendRecords(app.fs, path, [...userRecords(`Garden note ${i}`, [], 'test'), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `Water the roses, ${i}.` } }, 0)])
    }
    await addFile(app.fs, { projectDir: app.projectDir, name: 'Supplier notes.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode(file), pages: [file], by: 'test' })
    await refreshConversations()
  }, { count, file })
}

test('offered after ten conversations, it finds a conversation, a file and a setting as you type', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  // Not found yet: ⌘K is the browser's, and the drawer has no Search.
  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(page.locator('app-find dialog')).toHaveCount(0)

  await seed(page, 9, 'Invoice from Müller GmbH, paid in March.')
  // Offers due before it (Intuition, Backup) go first: once they are answered, Search is offered.
  const offer = page.locator('.offer')
  await expect(async () => {
    if (!(await offer.textContent())?.includes('look back on')) await offer.getByRole('button', { name: 'No thanks' }).click({ timeout: 1000 })
    await expect(offer).toContainText('a lot to look back on', { timeout: 1000 })
  }).toPass()
  await offer.getByRole('button', { name: 'Turn on search' }).click()
  const dialog = page.locator('app-find dialog[open]')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('input')).toBeFocused()

  // Part of a word, in capitals: the conversation, its words marked.
  await page.keyboard.type('PHOTOSYN')
  const option = dialog.getByRole('option').filter({ hasText: 'photosynthesis' }).first()
  await expect(option.locator('mark').first()).toHaveText(/photosyn/i)
  await expect(option).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.msg-user').first()).toContainText('Explain photosynthesis')

  // Again: the last search, ready to be typed over. Without its accent, a file's text.
  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(dialog.locator('input')).toHaveValue('PHOTOSYN')
  await page.keyboard.type('muller')
  const file = dialog.getByRole('group', { name: 'Files' }).getByRole('option')
  await expect(file).toContainText('Supplier notes.txt')
  await expect(file.locator('.find-snippet mark')).toHaveText('Müller')
  await page.keyboard.press('Enter')
  await expect(page.locator('app-preview .preview')).toContainText('paid in March')

  // A section of Settings, picked with the arrows.
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.keyboard.type('garden')
  await expect(dialog.getByRole('group', { name: 'Tasks' }).getByRole('option')).toHaveCount(9)
  await page.keyboard.press('ControlOrMeta+KeyA')
  await page.keyboard.type('appear')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings.locator('[aria-current="page"]')).toHaveText('Appearance')

  // ⌘K over Settings goes to search, says when nothing matches, and closes it.
  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(settings).toBeHidden()
  await page.keyboard.type('zzqx')
  await expect(dialog.locator('.find-none')).toContainText('Nothing found for')
  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(dialog).toBeHidden()

  // Search sits at the top of the drawer, beside the button that puts it away (D165).
  await openTasks(page)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(dialog).toBeVisible()
})

test('once Connections is found, it finds a service to connect by what it includes, and a connection, each named in the box as / names it (D199)', async ({ page }) => {
  await withPolicy(page, { directory: [{ id: 'mail', name: 'Mail', url: `${MAIL_URL}/open/mcp`, includes: ['Inbox', 'Contacts'] }] })
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('find'))
  const dialog = page.locator('app-find dialog[open]')
  // Nothing of Connections before it is found (D281).
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.keyboard.type('inbox')
  await expect(dialog.locator('.find-none')).toContainText('Nothing found for')
  await page.keyboard.press('Escape')
  await turnOn(page, 'Connections')
  await closeSettings(page)

  // A service, by a product it includes: picked, it is named where the caret was, and connected.
  const box = page.locator('#prompt')
  await box.click()
  await box.fill('Find the invoice in ')
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.keyboard.type('inbox')
  const service = dialog.getByRole('group', { name: 'Connect a service' }).getByRole('option')
  await expect(service.locator('.find-title')).toHaveText('Mail')
  await expect(service.locator('.find-snippet mark')).toHaveText('Inbox')
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  await expect(box).toHaveValue('Find the invoice in /Mail ')
  await expect(box).toBeFocused()

  // Connected, it is one of the room's, with what it can do, and no longer one to connect.
  await box.fill('Reply to the last email with ')
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.keyboard.type('mai')
  const connection = dialog.getByRole('group', { name: 'Connections' }).getByRole('option')
  await expect(connection).toContainText('3 actions')
  await expect(connection.locator('.complete-logo')).toHaveText('M')
  await expect(dialog.getByRole('group', { name: 'Connect a service' })).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  await expect(box).toHaveValue('Reply to the last email with /Mail ')
  await expect(box).toBeFocused()
})

test('in Japanese and Arabic, a word without spaces or with another hamza is found', async ({ page }) => {
  await start(page, 'ja')
  await connectFakeBrain(page)
  await ask(page, '週次の会議の議事録をまとめて')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('他にありますか')
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('find'))
  await page.keyboard.press('ControlOrMeta+KeyK')
  const dialog = page.locator('app-find dialog[open]')
  await page.keyboard.type('議事録')
  await expect(dialog.getByRole('option').first().locator('mark').first()).toHaveText('議事録')

  await page.keyboard.press('Escape')
  await page.evaluate(async () => (await import('/ui/state.js')).setLocale('ar'))
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.keyboard.press('ControlOrMeta+KeyN')
  await ask(page, 'أحمد يسأل عن الفاتورة')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('هل من شيء آخر')
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.keyboard.press('ControlOrMeta+KeyA')
  await page.keyboard.type('احمد')
  await expect(dialog.getByRole('option').first().locator('mark').first()).toHaveText('أحمد')
})
