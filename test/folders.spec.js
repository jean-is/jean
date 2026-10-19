// Folders (0.8, D141, D149), the version's done-when: a synced "Clients" folder, where Jean finds the
// three contracts that mention a clause and corrects one after showing the change; a folder of code,
// where the file changes by exactly Jean's change; two conversations in two folders and a project on
// its own, each back on its own after a reload, even one during the read of the folders, or with
// another tab reading them. Chromium opens a folder in place: the system's picker
// is played by a folder of the private file system, the same kind of handle. WebKit works on a copy.
// Playwright's own contexts are private, where Chrome 153 closes the browser when a handle of the private
// file system is read back from IndexedDB: what lasts across visits is checked in a profile of its own.
import { test, expect, chromium, devices } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { start, connectFakeBrain, ask, turnOn, openTasks, giveFolder } from './helpers.js'
import { extractPages } from '../app/caps/files/extract.js'
import { makeFile } from '../app/caps/made/formats.js'
import { readZip } from '../app/core/zip.js'

const contract = (/** @type {string} */ name, /** @type {string} */ clause) => `# Contract with ${name}\n\nThe parties agree as follows.\n\n${clause}\n\nSigned in Lyon.`
const CLIENTS = {
  'Contracts/Acme.docx': contract('Acme', 'Late payment: invoices are paid within 60 days.'),
  'Contracts/Bolt.docx': contract('Bolt', 'A late payment fee of 2% applies.'),
  'Contracts/Cyan.docx': contract('Cyan', 'Interest is due on any late payment.'),
  'Contracts/Dune.docx': contract('Dune', 'Payment is due on receipt.'),
  'notes.txt': 'Call Dana on Monday.\n',
}
const MAIN = 'const greeting = "Hello"\r\nconsole.log(greeting)\r\n'
// A small site, as Jean or the user may have made it (D156): a style sheet, a picture, a script that
// fetches data, a module importing another, a second page and a folder without an index.
const BAKERY = {
  'index.html': /* html */ `<!doctype html><html><head><link rel="stylesheet" href="style.css"><script type="module" src="js/main.js"></script></head>
<body><h1>The bakery</h1><img src="img/bread.svg" alt="Bread"><p id="classic"></p><p id="module"></p><p id="data"></p><a href="menu.html">Menu</a>
<script src="js/classic.js"></script></body></html>`,
  'style.css': 'h1 { color: rgb(128, 0, 0) }',
  'img/bread.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="peru"/></svg>',
  'js/classic.js': "document.getElementById('classic').textContent = 'classic ran'\nfetch('data/sales.csv').then((r) => r.text()).then((text) => { document.getElementById('data').textContent = text.trim().split('\\n')[1].replace(',', ': ') })",
  'js/main.js': "import { two } from './two.js'\ndocument.getElementById('module').textContent = `module ran: ${two}`",
  'js/two.js': 'export const two = 2',
  'data/sales.csv': 'region,sales\nNorth,12\n',
  'menu.html': '<h1>Menu</h1><a href="notes/">Notes</a>',
  'notes/todo.txt': 'Order flour',
}
const APP = { 'main.js': MAIN, '.gitignore': 'dist/\n', 'dist/bundle.js': 'built', 'AGENTS.md': '# How to work here\n\nUse two spaces, never tabs.\n' }

/** Puts a folder where the picker finds it: Word documents and workbooks written from Markdown and CSV by Jean's own writer. @param {import('@playwright/test').Page} page @param {string} name @param {Record<string, string>} files */
async function folder(page, name, files) {
  await page.evaluate(async ({ name, files }) => {
    const { makeFile } = await import('/caps/made/formats.js')
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked', { create: true })
    const top = await root.getDirectoryHandle(name, { create: true })
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split('/')
      let dir = top
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true })
      const bytes = /\.(docx|xlsx)$/.test(path) ? (await makeFile(String(parts.at(-1)), content)).bytes : new TextEncoder().encode(content)
      const writable = await (await dir.getFileHandle(String(parts.at(-1)), { create: true })).createWritable()
      await writable.write(bytes)
      await writable.close()
    }
  }, { name, files })
}

/** A file of a picked folder written elsewhere: the user's own editor, a sync. @param {import('@playwright/test').Page} page @param {string} path @param {string} text */
async function write(page, path, text) {
  await page.evaluate(async ({ path, text }) => {
    const parts = path.split('/')
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked')
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
    const writable = await (await dir.getFileHandle(String(parts.at(-1)))).createWritable()
    await writable.write(text)
    await writable.close()
  }, { path, text })
}

/** Types an address in the browser's field. @param {import('@playwright/test').Page} page @param {string} address */
async function go(page, address) {
  await page.locator('.browser-bar input').fill(address)
  await page.locator('.browser-bar input').press('Enter')
}

/** The bakery's site in the browser: its style, picture, scripts, module and the data it fetches. @param {import('@playwright/test').FrameLocator} shown */
async function bakery(shown) {
  await expect(shown.locator('h1')).toHaveText('The bakery')
  await expect(shown.locator('#classic')).toHaveText('classic ran')
  await expect(shown.locator('#module')).toHaveText('module ran: 2')
  await expect(shown.locator('#data')).toHaveText('North: 12')
  expect(await shown.locator('h1').evaluate((h1) => getComputedStyle(h1).color)).toBe('rgb(128, 0, 0)')
  await expect.poll(() => shown.locator('img').evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBe(40)
}

/**
 * A file of a picked folder, as bytes; read again when Jean was writing it, since a file swapped in
 * while it is read fails the read. @param {import('@playwright/test').Page} page @param {string} path
 */
async function bytes(page, path) {
  return new Uint8Array(await page.evaluate(async (path) => {
    const parts = path.split('/')
    for (let tries = 1; ; tries++) {
      try {
        let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked')
        for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
        return [...new Uint8Array(await (await (await dir.getFileHandle(String(parts.at(-1)))).getFile()).arrayBuffer())]
      } catch (error) {
        if (/** @type {Error} */ (error).name !== 'NotFoundError' || tries === 20) throw error
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
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
  const item = (await openTasks(page)).locator('.history-item', { hasText: title })
  await item.click()
  await expect(item).toHaveAttribute('aria-current', 'true')
}

/** The system's folder picker, played by a folder of the private file system. @param {import('@playwright/test').Page | import('@playwright/test').BrowserContext} target */
const picker = (target) => target.addInitScript(() => {
  Object.assign(window, {
    showDirectoryPicker: async () => (await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked')).getDirectoryHandle(localStorage.getItem('e2e.pick') ?? 'Clients'),
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
      const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked')).getDirectoryHandle('Clients')
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
    // Jean's own files, read through its FS, since they are sealed on disk (D371).
    const prompt = await page.evaluate(async () => {
      const [{ app }, { walk }] = await Promise.all([import('/ui/state.js'), import('/core/fs.js')])
      const paths = (await walk(app.fs)).filter((path) => path.endsWith('.jsonl') && !path.startsWith('.'))
      return (await Promise.all(paths.map((path) => app.fs.read(path)))).join('\n')
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
    // Duplicated from its first request, a conversation keeps its own folder, though the room has none (D230).
    await page.locator('.msg-actions.is-request').first().getByRole('button', { name: 'Duplicate from here' }).click()
    await expect(page.locator('.msg-user')).toHaveCount(1)
    await expect(page.locator('.folder-name')).toHaveText('app')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('main.js')
    await answer(page)

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

  test('a reload while the folders are read back, or another tab reading them then, loses none; a read that took its page down forgets them for the visit', async ({ baseURL }, info) => {
    const context = await chromium.launchPersistentContext(info.outputPath('profile'), { viewport: devices['Desktop Chrome'].viewport, baseURL, serviceWorkers: 'block' })
    await picker(context)
    // Once asked, the next read of the folders' store never ends: a page caught as it reads them back.
    await context.addInitScript(() => {
      const caught = new WeakSet()
      const { getAll } = IDBObjectStore.prototype
      IDBObjectStore.prototype.getAll = function (...args) {
        if (this.name === 'folders' && localStorage.getItem('e2e.catch')) caught.add(this.transaction)
        return getAll.apply(this, args)
      }
      const complete = /** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete'))
      Object.defineProperty(IDBTransaction.prototype, 'oncomplete', { ...complete, set(/** @type {any} */ handler) {
        if (!caught.has(this)) return complete.set?.call(this, handler)
        localStorage.removeItem('e2e.catch')
        localStorage.setItem('e2e.caught', 'yes')
      } })
    })
    const catchRead = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => { localStorage.removeItem('e2e.caught'); localStorage.setItem('e2e.catch', 'yes') })
    const caught = (/** @type {import('@playwright/test').Page} */ page) => expect.poll(() => page.evaluate(() => localStorage.getItem('e2e.caught'))).toBe('yes')
    const page = context.pages()[0] ?? await context.newPage()
    await start(page)
    await folder(page, 'Clients', CLIENTS)
    await turnOn(page, 'Folders')
    await page.keyboard.press('Escape')
    const name = page.locator('.folder-name')
    await name.click()
    await page.locator('#folder-menu button', { hasText: 'Use it in every new task' }).click()
    // Kept once project.md names it, written after its handle.
    await expect.poll(() => page.evaluate(async () => {
      const [{ app }, { walk }] = await Promise.all([import('/ui/state.js'), import('/core/fs.js')])
      for (const path of await walk(app.fs)) if (path.endsWith('project.md') && !path.startsWith('.') && (await app.fs.read(path))?.includes('folder: Clients')) return true
      return false
    })).toBe(true)
    await expect(name).not.toHaveClass(/is-shut/)

    // Reloaded as it reads them back, as after a change to Jean: the next start has them.
    await catchRead(page)
    await page.reload()
    await caught(page)
    await page.reload()
    await expect(name).toHaveText('Clients')
    await expect(name).not.toHaveClass(/is-shut/)

    // Another tab reading them back as this one starts: both have them.
    await catchRead(page)
    const other = await context.newPage()
    await other.goto('./')
    await caught(other)
    await page.reload()
    await expect(name).toHaveText('Clients')
    await expect(name).not.toHaveClass(/is-shut/)
    await other.close()

    // A read that took its page down: the next start forgets them, and keeps one chosen again for the visit only.
    await catchRead(page)
    await page.reload()
    await caught(page)
    const crashed = page.waitForEvent('crash')
    ;(await context.newCDPSession(page)).send('Page.crash').catch(() => {})
    await crashed
    const after = await context.newPage()
    await after.goto('./')
    const again = after.locator('.folder-name')
    await expect(again).toHaveText('Clients')
    await expect(again).toHaveClass(/is-shut/)
    await again.click()
    await after.locator('#folder-menu button', { hasText: 'Reconnect' }).click()
    await expect(again).not.toHaveClass(/is-shut/)
    await after.reload()
    await expect(again).toHaveClass(/is-shut/)
    await context.close()
  })

  test('a workbook of the folder changes in the browser, where it is: its total worked out again, the brain told (D229)', async ({ page }) => {
    await start(page)
    await connectFakeBrain(page)
    await folder(page, 'Books', { 'Budget.xlsx': 'Item,Amount\nRent,1200\nFood,450\nTotal,=SUM(B2:B3)' })
    await willPick(page, 'Books')
    await turnOn(page, 'Folders')
    await page.keyboard.press('Escape')
    await expect(page.locator('.folder-name')).toHaveText('Books')
    await ask(page, 'Hello')
    await answer(page)
    await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('browser') })
    await page.keyboard.press('ControlOrMeta+Shift+KeyB')
    await go(page, 'Books/Budget.xlsx')
    // The cells are drawn, not written out: reached where the grid shows them, and read in the box.
    const view = page.frameLocator('app-browser .view iframe')
    const [grid, box, B3] = [view.locator('[data-xlsx-viewport-input]'), view.locator('body > input'), { x: 190, y: 70 }]
    await expect(view.locator('main')).toContainText('Budget', { timeout: 15_000 })
    const first = await page.locator('app-browser .view iframe').elementHandle()
    await grid.dblclick({ position: B3 })
    await expect(box).toHaveValue('450')
    await box.fill('500')
    await box.press('Enter')
    // Written in the folder itself, its total worked out again, and shown again with it.
    await expect.poll(async () => (await extractPages('Budget.xlsx', await bytes(page, 'Books/Budget.xlsx'))).join('\n'), { timeout: 15_000 })
      .toBe('Sheet: Budget\nItem\tAmount\nRent\t1200\nFood\t500\nTotal\t1700')
    await expect.poll(() => first?.evaluate((frame) => frame.isConnected), { timeout: 15_000 }).toBe(false)
    await expect(box).toBeAttached({ timeout: 15_000 })
    await grid.click({ position: B3 })
    await page.keyboard.press('F2')
    await expect(box).toHaveValue('500')
    const told = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records
      .flatMap((record) => (record.update?.sessionUpdate === '_system_note' && record.update.data.kind === 'cells' ? [record.update.text] : [])))
    expect(told).toEqual(['The user changed Budget.xlsx in the folder: B3 in Budget is now 500.'])
  })

  test('the folder’s site shows in the browser as from a server; a page Jean makes or changes opens by itself, and one changed elsewhere comes again', async ({ page }) => {
    await start(page)
    await connectFakeBrain(page)
    await folder(page, 'Site', BAKERY)
    await willPick(page, 'Site')
    await turnOn(page, 'Folders')
    await page.keyboard.press('Escape')
    await expect(page.locator('.folder-name')).toHaveText('Site')
    // A page Jean makes there: the browser is offered, and opens on it.
    await ask(page, 'Make news.html saying "Fresh bread today"')
    await page.locator('app-folder-approval').getByRole('button', { name: 'Change it' }).click()
    await expect(await answer(page)).toContainText('Done: Made news.html.')
    await page.locator('.offer', { hasText: 'Open web pages beside the conversation' }).getByRole('button', { name: 'Turn on the browser' }).click()
    const pane = page.locator('app-browser .browser')
    const shown = page.frameLocator('.browser-page')
    await expect(shown.locator('h1')).toHaveText('Fresh bread today')
    await expect(pane.locator('.browser-bar input')).toHaveValue('Site/news.html')
    await expect(pane.getByRole('button', { name: 'Open in a new tab' })).toBeDisabled()
    // The folder by its name: its index.html, with all it uses.
    await go(page, 'Site')
    await bakery(shown)
    // Its links lead to its other pages, and to a folder's list; Back comes back.
    await shown.getByRole('link', { name: 'Menu' }).click()
    await expect(shown.locator('h1')).toHaveText('Menu')
    await expect(pane.locator('.browser-bar input')).toHaveValue('Site/menu.html')
    await shown.getByRole('link', { name: 'Notes' }).click()
    // A folder's list is drawn by Jean, its entries leading on, ".." back up, to the index.html there (D190).
    await expect(pane.locator('.browser-bar input')).toHaveValue('Site/notes/')
    await pane.locator('.browser-list').getByRole('button', { name: '..' }).click()
    await expect(shown.locator('h1')).toHaveText('The bakery')
    await expect(pane.locator('.browser-bar input')).toHaveValue('Site/')
    await pane.getByRole('button', { name: 'Back' }).click()
    await pane.locator('.browser-list').getByRole('button', { name: 'todo.txt' }).click()
    // A file that isn't a page shows as the preview shows it (D190).
    await expect(pane.locator('.view-text')).toHaveText('Order flour')
    await go(page, 'Site/nothing.html')
    await expect(pane.locator('.browser-note')).toContainText('nothing.html isn’t in Site.')
    for (const _ of [1, 2, 3, 4]) await pane.getByRole('button', { name: 'Back' }).click()
    await bakery(shown)
    // The page on show changed by Jean comes again by itself; changed in the user's own editor too.
    await ask(page, 'In index.html, change "The bakery" to "The new bakery"')
    await page.locator('app-folder-approval').getByRole('button', { name: 'Change it' }).click()
    await expect(shown.locator('h1')).toHaveText('The new bakery')
    await expect(pane.locator('.browser-bar input')).toHaveValue('Site/index.html')
    await write(page, 'Site/style.css', 'h1 { color: rgb(0, 0, 128) }')
    await expect.poll(() => shown.locator('h1').evaluate((h1) => getComputedStyle(h1).color)).toBe('rgb(0, 0, 128)')
    // The brain knows what is on show.
    expect(await page.evaluate(async () => (await (await import('/ui/caps.js')).loaded.value.get('browser')?.sections?.())?.page)).toBe('The browser beside the conversation shows Site/index.html, from the user\'s folder.')
    // A page made for a build says so in its place, naming the file, and This computer is offered (D277).
    await folder(page, 'Site', { 'todo/package.json': '{}', 'todo/index.html': '<div id="root"></div><script type="module" src="/src/main.jsx"></script>' })
    await go(page, 'Site/todo/')
    await expect(pane.locator('.browser-note')).toHaveText('⁨todo/index.html⁩ can’t show as it is: ⁨main.jsx⁩ has to be built first, with tools that don’t run in a browser. Ask for a page that runs as it is.')
    await expect(page.locator('aside.offer')).toContainText('Run a site’s dev server, or your own programs, on this computer?')
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
  await giveFolder(await chooser, top)
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

test('where a folder is a copy, its site shows in the browser too, and a page Jean changes there comes again', async ({ page, browserName }, info) => {
  test.skip(browserName === 'chromium', 'Chromium opens a folder in place (above)')
  const top = info.outputPath('Site')
  for (const [path, content] of Object.entries(BAKERY)) {
    await mkdir(dirname(join(top, path)), { recursive: true })
    await writeFile(join(top, path), content)
  }
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Browser')
  await page.keyboard.press('Escape')
  const chooser = page.waitForEvent('filechooser')
  await turnOn(page, 'Folders')
  await giveFolder(await chooser, top)
  await page.keyboard.press('Escape')
  await expect(page.locator('.folder-name')).toHaveText('Site')
  // The browser, open since it was turned on, shows the conversation's folder.
  await page.locator('app-browser .browser-note').getByRole('button', { name: 'Show Site' }).click()
  const shown = page.frameLocator('.browser-page')
  await bakery(shown)
  await ask(page, 'In index.html, change "The bakery" to "The new bakery"')
  await expect(await answer(page)).toContainText('Done: Changed index.html.')
  await expect(shown.locator('h1')).toHaveText('The new bakery')
})

/** @param {import('@playwright/test').Download} download */
async function streamBytes(download) {
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  return Buffer.concat(chunks)
}
