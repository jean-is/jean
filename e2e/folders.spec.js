// Folders (0.8, D141, D149), the version's done-when: a synced "Clients" folder, where Jean finds the
// three contracts that mention a clause and corrects one after showing the change; a folder of code,
// where the file changes by exactly Jean's change; two conversations in two folders and a project on
// its own, each back on its own after a reload. Chromium opens a folder in place: the system's picker
// is played by a folder of the private file system, the same kind of handle. WebKit works on a copy.
// Playwright's own contexts are private, where Chrome 153 closes the browser when a handle of the private
// file system is read back from IndexedDB: what lasts across visits is checked in a profile of its own.
import { test, expect, chromium, devices } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { start, connectFakeBrain, ask, turnOn } from './helpers.js'
import { extractPages } from '../caps/files/extract.js'
import { makeFile } from '../caps/made/formats.js'
import { readZip } from '../core/zip.js'

const contract = (/** @type {string} */ name, /** @type {string} */ clause) => `# Contract with ${name}\n\nThe parties agree as follows.\n\n${clause}\n\nSigned in Lyon.`
const CLIENTS = {
  'Contracts/Acme.docx': contract('Acme', 'Late payment: invoices are paid within 60 days.'),
  'Contracts/Bolt.docx': contract('Bolt', 'A late payment fee of 2% applies.'),
  'Contracts/Cyan.docx': contract('Cyan', 'Interest is due on any late payment.'),
  'Contracts/Dune.docx': contract('Dune', 'Payment is due on receipt.'),
  'notes.txt': 'Call Dana on Monday.\n',
}
const MAIN = 'const greeting = "Hello"\r\nconsole.log(greeting)\r\n'
const APP = { 'main.js': MAIN, '.gitignore': 'dist/\n', 'dist/bundle.js': 'built', 'AGENTS.md': '# How to work here\n\nUse two spaces, never tabs.\n' }

/** Puts a folder where the picker finds it: Word documents written from Markdown by Jean's own writer. @param {import('@playwright/test').Page} page @param {string} name @param {Record<string, string>} files */
async function folder(page, name, files) {
  await page.evaluate(async ({ name, files }) => {
    const { makeFile } = await import('/caps/made/formats.js')
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('picked', { create: true })
    const top = await root.getDirectoryHandle(name, { create: true })
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split('/')
      let dir = top
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true })
      const bytes = path.endsWith('.docx') ? (await makeFile(String(parts.at(-1)), content)).bytes : new TextEncoder().encode(content)
      const writable = await (await dir.getFileHandle(String(parts.at(-1)), { create: true })).createWritable()
      await writable.write(bytes)
      await writable.close()
    }
  }, { name, files })
}

/** A file of a picked folder, as bytes. @param {import('@playwright/test').Page} page @param {string} path */
async function bytes(page, path) {
  return new Uint8Array(await page.evaluate(async (path) => {
    const parts = path.split('/')
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('picked')
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
    return [...new Uint8Array(await (await (await dir.getFileHandle(String(parts.at(-1)))).getFile()).arrayBuffer())]
  }, path))
}

/** @param {import('@playwright/test').Page} page @param {string} path */
const wordText = async (page, path) => (await extractPages(path, await bytes(page, path))).join('\n')

/** The folder the picker gives next. @param {import('@playwright/test').Page} page @param {string} name */
const willPick = (page, name) => page.evaluate((name) => localStorage.setItem('e2e.pick', name), name)

/** The answer so far, once it has ended: the box can send again. @param {import('@playwright/test').Page} page */
async function answer(page) {
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  return page.locator('.msg-jean .prose').last()
}

/** @param {import('@playwright/test').Page} page @param {string} title */
async function openConversation(page, title) {
  await page.locator('.bar > .icon-button').first().click()
  await page.locator('app-history dialog[open] .history-item', { hasText: title }).click()
  await expect(page.locator('app-history dialog[open]')).toBeHidden()
}

/** The system's folder picker, played by a folder of the private file system. @param {import('@playwright/test').Page | import('@playwright/test').BrowserContext} target */
const picker = (target) => target.addInitScript(() => {
  Object.assign(window, {
    showDirectoryPicker: async () => (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked')).getDirectoryHandle(localStorage.getItem('e2e.pick') ?? 'Clients'),
  })
})

test.describe('in place', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium opens a folder in place; elsewhere it is a copy')
  test.beforeEach(async ({ page }) => picker(page))

  test('a synced Clients folder: the three contracts that mention a clause, one corrected after showing the change, then undone', async ({ page }) => {
    await start(page)
    await connectFakeBrain(page)
    await folder(page, 'Clients', CLIENTS)
    await turnOn(page, 'Folders')
    await page.keyboard.press('Escape')
    // The new conversation starts in the folder chosen, and its header names it.
    await expect(page.locator('.folder-name')).toHaveText('Clients')

    await ask(page, 'Which contracts mention the late payment clause?')
    const found = page.locator('.msg-jean .prose').last()
    await expect(found).toContainText('These files mention it')
    await answer(page)
    for (const name of ['Acme', 'Bolt', 'Cyan']) await expect(found).toContainText(`Contracts/${name}.docx`)
    await expect(found).not.toContainText('Dune')

    await ask(page, 'In Contracts/Acme.docx, change "within 60 days" to "within 30 days"')
    // Asked first, with its diff, though Jean's own edits are done without asking.
    const card = page.locator('app-folder-approval .approval')
    await expect(card).toContainText('Change Contracts/Acme.docx?')
    await expect(card.locator('.diff .is-gone')).toContainText('Late payment: invoices are paid within 60 days.')
    await expect(card.locator('.diff .is-new')).toContainText('Late payment: invoices are paid within 30 days.')
    expect(await wordText(page, 'Clients/Contracts/Acme.docx')).toContain('within 60 days')
    await card.getByRole('button', { name: 'Change it' }).click()
    await expect(await answer(page)).toContainText('Done: Changed Contracts/Acme.docx.')
    expect(await wordText(page, 'Clients/Contracts/Acme.docx')).toContain('Late payment: invoices are paid within 30 days.')

    // Undone from the conversation: the document as it was, and the brain told.
    const change = page.locator('.folder-change').last()
    await expect(change).toContainText('Contracts/Acme.docx')
    await change.getByRole('button', { name: 'Undo' }).click()
    await expect(change).toHaveClass(/is-undone/)
    expect(await wordText(page, 'Clients/Contracts/Acme.docx')).toContain('within 60 days')

    // A file that changed since Jean read it (a sync, someone else) is refused until it is read again.
    await ask(page, 'In notes.txt, change "Monday" to "Tuesday"')
    await page.locator('app-folder-approval').getByRole('button', { name: 'Change it' }).click()
    await expect(await answer(page)).toContainText('Done: Changed notes.txt.')
    await page.evaluate(async () => {
      const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked')).getDirectoryHandle('Clients')
      const writable = await (await dir.getFileHandle('notes.txt')).createWritable()
      await writable.write('Call Dana on Wednesday.\n')
      await writable.close()
    })
    await ask(page, 'In notes.txt, change "Wednesday" to "Friday"')
    await page.locator('app-folder-approval').getByRole('button', { name: 'Change it' }).click()
    await expect(await answer(page)).toContainText('Done: Changed notes.txt.')
    await page.locator('.msg-jean .activity > summary').last().click()
    await expect(page.locator('.msg-jean').last().locator('.activity-list li[data-status="failed"]')).toHaveCount(1)
    expect(new TextDecoder().decode(await bytes(page, 'Clients/notes.txt'))).toBe('Call Dana on Friday.\n')
  })

  test('a folder of code changes by exactly Jean’s change; two conversations and two projects each keep their own folder after a reload', async ({ baseURL }, info) => {
    // A profile of its own, as people have, where handles last across visits.
    const context = await chromium.launchPersistentContext(info.outputPath('profile'), { viewport: devices['Desktop Chrome'].viewport, baseURL, serviceWorkers: 'block' })
    await picker(context)
    const page = context.pages()[0] ?? await context.newPage()
    await start(page)
    await connectFakeBrain(page)
    await folder(page, 'Clients', CLIENTS)
    await folder(page, 'app', APP)
    await willPick(page, 'app')
    await turnOn(page, 'Folders')
    await page.keyboard.press('Escape')
    // Its AGENTS.md is offered, never read in silently: here, for this conversation alone.
    const asked = page.locator('app-folder-ask .folder-ask')
    await expect(asked).toContainText('app has instructions for assistants')
    await expect(asked.locator('.folder-agents')).toContainText('Use two spaces, never tabs.')
    await asked.getByRole('button', { name: 'Use them' }).click()
    await expect(asked).toBeHidden()

    await ask(page, 'What is in the folder?')
    const listed = page.locator('.msg-jean .prose').last()
    await expect(listed).toContainText('main.js')
    await answer(page)
    await expect(listed).toContainText('AGENTS.md')
    await expect(listed).not.toContainText('dist')

    await ask(page, 'In main.js, change "Hello" to "Bonjour"')
    await expect(page.locator('app-folder-approval .diff .is-new')).toContainText('const greeting = "Bonjour"')
    await page.locator('app-folder-approval').getByRole('button', { name: 'Change it' }).click()
    await expect(await answer(page)).toContainText('Done: Changed main.js.')
    // What git diff would show: that line, and nothing else, its line endings kept.
    expect(new TextDecoder().decode(await bytes(page, 'app/main.js'))).toBe(MAIN.replace('Hello', 'Bonjour'))
    // The conversation's prompt has the folder, its top level and the AGENTS.md the user took.
    const prompt = await page.evaluate(async () => {
      /** @param {FileSystemDirectoryHandle} dir @returns {Promise<string[]>} */
      const texts = async (dir) => {
        const found = []
        for await (const entry of /** @type {any} */ (dir).values()) {
          if (entry.kind === 'directory' && entry.name !== 'picked') found.push(...await texts(entry))
          else if (entry.name.endsWith('.jsonl')) found.push(await (await entry.getFile()).text())
        }
        return found
      }
      return (await texts(await navigator.storage.getDirectory())).join('\n')
    })
    expect(prompt).toContain('The user\'s folder \\"app\\" is open in this conversation')
    expect(prompt).toContain('Use two spaces, never tabs.')
    expect(prompt).not.toContain('bundle.js')

    // A new conversation starts without a folder (the room has none); this one opens Clients.
    await page.locator('.wordmark').click()
    await expect(page.locator('.folder-name')).toHaveCount(0)
    await willPick(page, 'Clients')
    await page.locator('.composer .add').click()
    await page.locator('#add-menu button', { hasText: 'A folder…' }).click()
    await expect(page.locator('.folder-name')).toHaveText('Clients')
    await ask(page, 'Which contracts mention the late payment clause?')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Contracts/Bolt.docx')
    await answer(page)

    // After a reload, each conversation is back on its own folder.
    await page.reload()
    await openConversation(page, 'folder')
    await expect(page.locator('.folder-name')).toHaveText('app')
    await openConversation(page, 'Which contracts mention')
    await expect(page.locator('.folder-name')).toHaveText('Clients')

    // "Always allow" holds for that folder; a change asked for here, then left for the other
    // conversation, is made in this one's folder, out of sight (D147).
    await ask(page, 'In notes.txt, change "Monday" to "Sunday"')
    await page.locator('app-folder-approval').getByRole('button', { name: 'Always allow in Clients' }).click()
    await expect(await answer(page)).toContainText('Done: Changed notes.txt.')
    await ask(page, 'In notes.txt, change "Sunday" to "Saturday"')
    await openConversation(page, 'folder')
    await expect(page.locator('.folder-name')).toHaveText('app')
    await expect.poll(async () => new TextDecoder().decode(await bytes(page, 'Clients/notes.txt'))).toBe('Call Dana on Saturday.\n')
    expect(new TextDecoder().decode(await bytes(page, 'app/main.js'))).toBe(MAIN.replace('Hello', 'Bonjour'))

    // A project opened on a folder: its new conversations start there, after a reload too.
    await turnOn(page, 'Projects')
    const dialog = page.locator('app-project-dialog dialog[open]')
    await dialog.locator('input[name="name"]').fill('Acme work')
    await dialog.locator('.button.primary').click()
    await expect(page.locator('app-projects .wordmark')).toHaveText('Acme work')
    await expect(page.locator('.folder-name')).toHaveCount(0)
    await page.locator('app-projects .wordmark').click()
    await page.locator('#project-menu button', { hasText: 'Project settings' }).click()
    await dialog.locator('app-folder-field').getByRole('button', { name: 'Choose…' }).click()
    await expect(dialog.locator('app-folder-field')).toContainText('Clients')
    await page.keyboard.press('Escape')
    await expect(page.locator('.folder-name')).toHaveText('Clients')
    // A second project, on the code.
    await page.locator('app-projects .wordmark').click()
    await page.locator('#project-menu button', { hasText: 'New project' }).click()
    await dialog.locator('input[name="name"]').fill('Code work')
    await dialog.locator('.button.primary').click()
    await expect(page.locator('app-projects .wordmark')).toHaveText('Code work')
    await page.locator('app-projects .wordmark').click()
    await page.locator('#project-menu button', { hasText: 'Project settings' }).click()
    await willPick(page, 'app')
    await dialog.locator('app-folder-field').getByRole('button', { name: 'Choose…' }).click()
    await expect(dialog.locator('app-folder-field')).toContainText('app')
    await page.keyboard.press('Escape')
    await expect(page.locator('.folder-name')).toHaveText('app')
    // After a reload, each project's new conversations start on its own folder.
    await page.reload()
    await expect(page.locator('app-projects .wordmark')).toHaveText('Code work')
    await expect(page.locator('.folder-name')).toHaveText('app')
    await page.locator('app-projects .wordmark').click()
    await page.locator('#project-menu .project', { hasText: 'Acme work' }).click()
    await expect(page.locator('.folder-name')).toHaveText('Clients')
    await ask(page, 'What is in the folder?')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Contracts/')
    await answer(page)
    await context.close()
  })
})

test('where a folder can’t be opened in place, Jean works on a copy and the changed files are saved as one zip', async ({ page, browserName }, info) => {
  test.skip(browserName === 'chromium', 'Chromium opens a folder in place (above)')
  const top = info.outputPath('Clients')
  for (const [path, content] of Object.entries(CLIENTS)) {
    await mkdir(dirname(join(top, path)), { recursive: true })
    await writeFile(join(top, path), path.endsWith('.docx') ? (await makeFile(path.split('/').at(-1) ?? path, content)).bytes : content)
  }
  await start(page)
  await connectFakeBrain(page)
  const chooser = page.waitForEvent('filechooser')
  await turnOn(page, 'Folders')
  await (await chooser).setFiles(top)
  await page.keyboard.press('Escape')
  await expect(page.locator('.folder-name')).toHaveText('Clients')

  await ask(page, 'Which contracts mention the late payment clause?')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Contracts/Cyan.docx')
  await answer(page)
  // Nothing on the computer changes, so nothing is asked.
  await ask(page, 'In notes.txt, change "Monday" to "Friday"')
  await expect(await answer(page)).toContainText('Done: Changed notes.txt.')
  await page.locator('.folder-name').click()
  await expect(page.locator('#folder-menu')).toContainText('works on a copy')
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#folder-menu button', { hasText: 'Save the changed files' }).click()])
  expect(download.suggestedFilename()).toBe('Clients.zip')
  const zip = readZip(new Uint8Array(await streamBytes(download)))
  expect(zip.map((entry) => entry.name)).toEqual(['notes.txt'])
  expect(new TextDecoder().decode(await zip[0].read())).toBe('Call Dana on Friday.\n')
})

/** @param {import('@playwright/test').Download} download */
async function streamBytes(download) {
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  return Buffer.concat(chunks)
}
