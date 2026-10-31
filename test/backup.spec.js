// Backup (0.2): everything Jean keeps in one zip, keys left out, restored on another device
// (here, a fresh browser context) without deleting anything that was already there.
import { test, expect } from '@playwright/test'
import { readZip, writeZip } from '../app/core/zip.js'
import { start, connectFakeBrain, ask, openSettings, closeSettings, openTasks } from './helpers.js'

test('a backup holds the conversations but no key, and restores on a fresh device', async ({ page, browser }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  // A key, as Settings' Brains would keep it: never part of a backup.
  await page.evaluate(async () => (await import('/ui/state.js')).app.fs.write('.secrets/keys.json', '{"format":1}\n'))

  const settings = await openSettings(page, 'Your data')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    settings.getByRole('button', { name: 'Download a backup' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^Backup \d{4}-\d{2}-\d{2}\.zip$/)
  await expect(page.locator('.toast')).toContainText('Backup ready')
  const path = await download.path()
  const { readFile } = await import('node:fs/promises')
  const names = readZip(new Uint8Array(await readFile(path))).map((entry) => entry.name)
  expect(names).toContain('backup.json')
  expect(names.some((name) => name.endsWith('.jsonl'))).toBe(true)
  expect(names.filter((name) => /^\.(secrets|cache)\//.test(name))).toEqual([])

  // Another device: nothing yet, then everything from the backup.
  const context = await browser.newContext()
  const other = await context.newPage()
  await start(other)
  other.on('dialog', (dialog) => dialog.accept())
  // Backup's page restores it.
  const restore = await openSettings(other, 'Your data')
  await restore.locator('[data-part="backup"]').click()
  await restore.locator('input[type="file"]').setInputFiles(path)
  await expect(other.locator('.toast')).toContainText(/Restored \d+ files/)
  const ephemeral = await other.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)
  // Playwright's WebKit has no lasting storage (like a private window): the reload starts empty.
  if (!ephemeral) {
    await other.waitForEvent('load')
    await (await openTasks(other)).locator('.history-item').first().click()
    await expect(other.locator('.msg-user').first()).toContainText('Explain photosynthesis')
  }
  await context.close()
})

test('Your data says what matters most, then where each copy is, and a backup changes Backup’s row', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  const settings = await openSettings(page, 'Your data')
  const ephemeral = await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)
  await expect(settings.locator('.data-head + .lede')).toContainText(ephemeral ? 'Private window: nothing will be saved after you close it.' : 'Kept on this device, encrypted. It is only here: nothing is backed up yet.')
  // Only what is found shows: Space used on this device, Backup among the copies, then Bring in.
  await expect(settings.locator('.settings-panel h3')).toHaveText(['On this device', 'Copies you keep'])
  const backup = settings.locator('[data-part="backup"]')
  await expect(backup.locator('.data-state')).toHaveText('None yet')
  await Promise.all([page.waitForEvent('download'), settings.locator('.data-head').getByRole('button', { name: 'Download a backup' }).click()])
  await expect(backup.locator('.data-state')).toHaveText('1 minute ago')
  await expect(backup).toContainText(/The last one is from \w+ \d+, \d{4}/)
  await expect(settings.locator('[data-part="import"]')).toContainText('Bring in from ChatGPT, Claude or Gemini')
  // Its page: what a backup is, that it can be read, and Restore; Back returns to its row.
  await backup.click()
  await expect(settings.getByRole('heading', { name: 'Backup', exact: true })).toBeFocused()
  await expect(settings).toContainText('A backup is a readable copy: keep it where only you can open it.')
  await expect(page).toHaveURL(/\/settings\/data\/backup$/)
  await settings.locator('.back').click()
  await expect(backup).toBeFocused()
})

test('what takes up space: the tasks among the rest, each with its share, on Space used’s page', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  const settings = await openSettings(page, 'Your data')
  await settings.locator('[data-part="space"]').click()
  await expect(settings.getByRole('heading', { name: 'Space used', exact: true })).toBeFocused()
  // Nothing is kept in a private window (Playwright's WebKit), so there is nothing to break down.
  if (await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)) return
  const tasks = settings.locator('.parts li').filter({ hasText: 'Tasks' })
  await expect(tasks).toContainText(/\d (kB|MB)/)
  await expect(tasks.getByRole('meter', { name: 'Tasks' })).toHaveAttribute('value', /^0\.\d+/)
  await expect(settings.locator('.parts li').last()).toContainText('Everything else')
})

test('a file that isn’t a backup is refused, and nothing changes', async ({ page }) => {
  await start(page)
  page.on('dialog', (dialog) => dialog.accept())
  const settings = await openSettings(page, 'Your data')
  await settings.locator('[data-part="backup"]').click()
  await settings.locator('input[type="file"]').setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') })
  await expect(page.locator('.toast')).toContainText('This file isn’t a backup.')
})

test('an export of Gemini’s from Google Takeout comes in once, shared in the box or restored in Settings (D340)', async ({ page }) => {
  const dir = 'Takeout/My Activity/Gemini Apps/'
  const activity = (/** @type {Record<string, any>} */ fields) => ({ header: 'Gemini Apps', products: ['Gemini Apps'], activityControls: ['Gemini Apps Activity'], ...fields })
  const activities = [
    activity({ title: 'Prompted Summarise my notes', time: '2026-01-03T09:00:00Z', titleUrl: 'https://gemini.google.com/app/c2c2c2', attachedFiles: ['notes.txt'], safeHtmlItem: [{ html: '<p>Buy <strong>milk</strong>.</p>' }] }),
    activity({ title: 'Prompted Its name?', time: '2026-01-02T10:01:00Z', titleUrl: 'https://gemini.google.com/app/c1c1c1', safeHtmlItem: [{ html: '<p>Felix.</p>' }] }),
    activity({ title: 'Prompted Name a cat', time: '2026-01-02T10:00:00Z', titleUrl: 'https://gemini.google.com/app/c1c1c1', safeHtmlItem: [{ html: '<ul><li>Felix</li><li>Tom</li></ul>' }] }),
  ]
  const encoder = new TextEncoder()
  const zip = await writeZip([
    { name: `${dir}MyActivity.json`, bytes: encoder.encode(JSON.stringify(activities)) },
    { name: `${dir}notes.txt`, bytes: encoder.encode('Buy milk') },
    { name: 'Takeout/Gemini/gemini_gems_data.html', bytes: encoder.encode('<div><b>Name:</b>Chef<br><b>Custom instructions:</b>Cook with what I have.<br><br></div>') },
  ])
  const file = { name: 'takeout-20260103T000000Z-001.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) }
  await start(page)
  page.on('dialog', (dialog) => dialog.accept())
  await page.locator('.composer input[type="file"]').setInputFiles(file)
  await expect(page.locator('.toast')).toContainText('2 conversations brought in.')
  // Not shared with the next message.
  await expect(page.locator('.composer .attachment')).toHaveCount(0)
  const tasks = await openTasks(page)
  await tasks.locator('.history-item', { hasText: 'Summarise my notes' }).click()
  await expect(page.locator('.msg-user').first()).toContainText('Summarise my notes')
  await expect(page.locator('.msg-files').first()).toContainText('notes.txt')
  await expect(page.locator('.msg-jean .prose strong')).toHaveText('milk')
  // Its Gem is a project now, with its instructions.
  const chef = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const project = app.projects.value.find((candidate) => candidate.data.name === 'Chef')
    return project && app.fs.read(`${project.dir}/instructions.md`)
  })
  expect(chef).toContain('Cook with what I have.')

  // Again, from Settings › Your data's Bring in, which says how to ask each assistant: nothing new.
  const settings = await openSettings(page, 'Your data')
  await settings.locator('[data-part="import"]').click()
  await expect(settings.getByRole('heading', { name: 'Bring in from ChatGPT, Claude or Gemini' })).toBeFocused()
  await expect(settings).toContainText('in Google Takeout, choose Gemini')
  await settings.locator('input[type="file"]').setInputFiles(file)
  await expect(page.locator('.toast').last()).toContainText('0 conversations brought in.')
})

test('ChatGPT’s export shared in the box and Claude’s restored in Settings, its parts together, come in by what they hold (D341)', async ({ page }) => {
  const json = (/** @type {unknown} */ value) => new TextEncoder().encode(JSON.stringify(value))
  /** A ChatGPT message. @param {string} role @param {string} text @param {number} time @param {Record<string, any>} [metadata] */
  const said = (role, text, time, metadata = {}) => ({ author: { role }, create_time: time, content: { content_type: 'text', parts: [text] }, metadata })
  const chatgpt = await writeZip([
    { name: 'conversations.json', bytes: json([{ title: 'Trip to Lisbon', conversation_id: 'c1', create_time: 1769936400, current_node: 'a', mapping: {
      u: { id: 'u', parent: null, message: said('user', 'Plan a day in Lisbon', 1769936400, { attachments: [{ id: 'file-N1', name: 'notes.txt' }] }) },
      a: { id: 'a', parent: 'u', message: said('assistant', 'Start at **Belém**.', 1769936460) },
    } }]) },
    { name: 'file-N1-notes.txt', bytes: new TextEncoder().encode('Bring sunscreen') },
  ])
  const claude = await Promise.all([
    writeZip([{ name: 'conversations.json', bytes: json([{ uuid: 'k1', name: 'Budget review', created_at: '2026-04-01T08:00:00.123456Z', chat_messages: [
      { uuid: 'm1', sender: 'human', text: 'Check this budget', created_at: '2026-04-01T08:00:00.123456Z', content: [{ type: 'text', text: 'Check this budget' }], attachments: [] },
      { uuid: 'm2', sender: 'assistant', text: 'Cut food.', created_at: '2026-04-01T08:00:09.5Z', content: [{ type: 'text', text: 'Cut *food*.' }], attachments: [] },
    ] }]) }]),
    writeZip([{ name: 'projects.json', bytes: json([{ uuid: 'p1', name: 'Tax help', prompt_template: 'Answer as a tax adviser.', docs: [{ filename: 'rules.md', content: '# Rules' }] }]) }]),
  ])
  await start(page)
  page.on('dialog', (dialog) => dialog.accept())
  await page.locator('.composer input[type="file"]').setInputFiles({ name: '0f9a3c-2026-10-14-10-00-00.zip', mimeType: 'application/zip', buffer: Buffer.from(chatgpt) })
  await expect(page.locator('.toast')).toContainText('1 conversation brought in.')
  await expect(page.locator('.composer .attachment')).toHaveCount(0)
  await (await openTasks(page)).locator('.history-item', { hasText: 'Trip to Lisbon' }).click()
  await expect(page.locator('.msg-files').first()).toContainText('notes.txt')
  await expect(page.locator('.msg-jean .prose strong')).toHaveText('Belém')
  // The first export's word gone, so that the one awaited next is the second's, said once its question is answered.
  await expect(page.locator('.toast')).toHaveCount(0)

  const settings = await openSettings(page, 'Your data')
  await settings.locator('[data-part="import"]').click()
  await settings.locator('input[type="file"]').setInputFiles(claude.map((bytes, i) => ({ name: `data-2026-10-14-batch-000${i}.zip`, mimeType: 'application/zip', buffer: Buffer.from(bytes) })))
  await expect(page.locator('.toast').last()).toContainText('1 conversation brought in.')
  await closeSettings(page)
  await (await openTasks(page)).locator('.history-item', { hasText: 'Budget review' }).click()
  await expect(page.locator('.msg-user').first()).toContainText('Check this budget')
  await expect(page.locator('.msg-jean .prose em')).toHaveText('food')
  // Its project is Jean's now, with its instructions.
  const tax = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const project = app.projects.value.find((candidate) => candidate.data.name === 'Tax help')
    return project && app.fs.read(`${project.dir}/instructions.md`)
  })
  expect(tax).toContain('Answer as a tax adviser.')
})
