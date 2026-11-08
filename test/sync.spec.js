// Sync (D157): two computers keep each other's conversations through a folder their cloud drive
// syncs, or two Jeans through the very same folder. Each computer is a browser context of its own, the
// system's picker is played by a folder of its private file system (as in folders.spec.js), and the
// drive by the test: by hand, copying one computer's folder over the other's, or on its own, as Dropbox
// does; two Jeans on one folder are two profiles of one browser. Chromium only: elsewhere a page can't
// open a folder in place.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, noted, turnOn, openFromCase, openSettings, openTasks, openProfile, deleteOpenTask, withPolicy } from './helpers.js'

/** The system's folder picker, played by `.picked/<e2e.pick>` in the private file system, where Jean’s own files (sealed, D371) never are. @param {import('@playwright/test').Page} page */
const picker = (page) => page.addInitScript(() => {
  Object.assign(window, {
    showDirectoryPicker: async () => (await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked', { create: true }))
      .getDirectoryHandle(localStorage.getItem('e2e.pick') ?? 'Jean', { create: true }),
  })
})

/** Every file of a picked folder, by path. @param {import('@playwright/test').Page} page @param {string} name @returns {Promise<Record<string, string>>} */
const folder = (page, name) => page.evaluate(async (name) => {
  /** @type {Record<string, string>} */
  let files = {}
  /** @param {FileSystemDirectoryHandle} dir @param {string} at */
  const walk = async (dir, at) => {
    for await (const [entry, handle] of /** @type {any} */ (dir).entries()) {
      if (handle.kind === 'directory') await walk(handle, `${at}${entry}/`)
      else files[`${at}${entry}`] = await (await handle.getFile()).text()
    }
  }
  const top = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked', { create: true })).getDirectoryHandle(name, { create: true })
  // A round may take a file away as this reads it: read again, for the folder as it is.
  for (let tries = 5; tries; tries--) {
    files = {}
    try { await walk(top, ''); break } catch (error) { if (/** @type {Error} */ (error).name !== 'NotFoundError' || tries === 1) throw error }
  }
  return files
}, name)

/** The drive: the folder becomes exactly these files. @param {import('@playwright/test').Page} page @param {string} name @param {Record<string, string>} files */
const drive = (page, name, files) => page.evaluate(async ({ name, files }) => {
  const picked = await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked', { create: true })
  await picked.removeEntry(name, { recursive: true }).catch(() => {})
  const top = await picked.getDirectoryHandle(name, { create: true })
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split('/')
    let dir = top
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true })
    const writable = await (await dir.getFileHandle(String(parts.at(-1)), { create: true })).createWritable()
    await writable.write(text)
    await writable.close()
  }
}, { name, files })

/** @param {import('@playwright/test').Page} page @param {string} text */
async function answered(page, text) {
  await ask(page, text)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  // Its run is over too: a round leaves a conversation being answered for the next.
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  // And what it reached is noted: a change the next round would take for one of the user's, which a deletion from the folder gives way to.
  await noted(page)
}

test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium opens a folder in place')

/** Sync's page in Settings › Your data, from its row. @param {import('@playwright/test').Page} page */
async function syncPage(page) {
  const settings = await openSettings(page, 'Your data')
  await settings.locator('[data-part="sync"]').click()
  await expect(settings.getByRole('heading', { name: 'Synced folder', exact: true })).toBeFocused()
  return settings
}

test('two computers keep each other’s conversations through a folder their drive syncs', async ({ page, browser }) => {
  await picker(page)
  // A browser that may clear Jean's files to make room.
  await page.addInitScript(() => Object.defineProperty(StorageManager.prototype, 'persisted', { value: async () => false }))
  await start(page)
  await connectFakeBrain(page)
  await answered(page, 'Explain photosynthesis in simple words')
  await page.evaluate(async () => (await import('/ui/state.js')).app.fs.write('.secrets/keys.json', '{"format":1}\n'))

  // The first computer: an empty folder, which gets the mark and everything but keys and settings.
  await turnOn(page, 'Synced folder')
  // Its page leads to its page in Your data, which says how it stands.
  await openFromCase(page)
  await expect(page.locator('app-settings .data-head')).toContainText('Synced with Jean')
  await expect(page.locator('app-settings').getByRole('button', { name: 'Stop syncing' })).toBeVisible()
  const first = await folder(page, 'Jean')
  expect(Object.keys(first)).toContain('mirror.json')
  expect(Object.keys(first).filter((path) => path.endsWith('.jsonl'))).toHaveLength(1)
  expect(Object.keys(first).filter((path) => /^(\.secrets|\.cache)\/|^settings\.json$/.test(path))).toEqual([])
  // Your data says they are safe there, in place of nothing backed up yet or the browser that may clear them, and so does Space used.
  await page.locator('app-settings .back').click()
  await expect(page.locator('app-settings .lede')).toHaveText('Kept on this device, encrypted. Your tasks, files and memory are also in Jean, safe even if your browser clears them here.')
  await page.locator('app-settings [data-part="space"]').click()
  await expect(page.locator('app-settings .muted', { hasText: 'Your tasks, files and memory are also in Jean' })).toBeVisible()
  await expect(page.locator('app-settings')).not.toContainText('Your browser may clear it')
  await page.keyboard.press('Escape')

  // The second computer, where the drive brought the folder: the first one's conversation comes in.
  const context = await browser.newContext()
  const other = await context.newPage()
  await picker(other)
  await start(other)
  await drive(other, 'Jean', first)
  await turnOn(other, 'Synced folder')
  await other.keyboard.press('Escape')
  const list = await openTasks(other)
  await list.locator('.history-item', { hasText: 'photosynthesis' }).click()
  await expect(other.locator('.msg-user').first()).toContainText('Explain photosynthesis')
  // One home: the second computer's, still empty, gave way to the first one's.
  const homes = await other.evaluate(async () => (await import('/ui/state.js')).app.projects.value.filter((project) => project.data.default).map((project) => project.dir))
  expect(homes).toEqual([Object.keys(first).find((path) => path.endsWith('/project.md'))?.replace('/project.md', '')])

  // A conversation there goes back, after its answer, and comes in on the first computer.
  await connectFakeBrain(other)
  await (await openTasks(other)).locator('.place', { hasText: 'New task' }).click()
  await expect(other.locator('.hero-question')).toBeVisible()
  await answered(other, 'What is a leap year?')
  await expect.poll(async () => Object.values(await folder(other, 'Jean')).some((text) => text.includes('What is a leap year?')), { timeout: 15_000 }).toBe(true)
  await drive(page, 'Jean', await folder(other, 'Jean'))
  const back = await syncPage(page)
  await expect(back.locator('[data-part="sync"]')).toHaveCount(0)
  await back.getByRole('button', { name: 'Sync now' }).click()
  await page.keyboard.press('Escape')
  await expect((await openTasks(page)).locator('.history-item', { hasText: 'leap year' })).toBeVisible()
  await context.close()
})

/**
 * A drive as Dropbox keeps a folder on two computers, on its own: a moment after one computer's folder changes, the change goes to
 * the other's, a deletion too; changed on both, one version stays and the other is kept beside it as a conflicted copy. A file
 * that moved while it worked on it waits for its next pass. What Chrome writes beside a file meanwhile stays where it is.
 * @param {import('@playwright/test').Page} one @param {import('@playwright/test').Page} two
 */
function dropbox(one, two) {
  /** Writes a file of a computer's folder, or takes it away (null), unless it is no longer `was`. @param {import('@playwright/test').Page} page @param {string} path @param {string | null} text @param {string | null} was */
  const put = (page, path, text, was) => page.evaluate(async ({ path, text, was }) => {
    const parts = path.split('/'), name = String(parts.pop())
    let dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked', { create: true })).getDirectoryHandle('Jean', { create: true })
    try { for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: text !== null }) } catch { return was === null }
    if (await dir.getFileHandle(name).then(async (file) => (await file.getFile()).text(), () => null) !== was) return false
    if (text === null) return dir.removeEntry(name).then(() => true, () => true)
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable()
    await writable.write(text)
    await writable.close()
    return true
  }, { path, text, was })
  /** What each computer's folder held as the drive last left it. @type {Record<string, string>[]} */
  let left = [{}, {}]
  const pass = async () => {
    const now = await Promise.all([one, two].map(async (page) => Object.fromEntries(Object.entries(await folder(page, 'Jean')).filter(([path]) => !path.endsWith('.crswap')))))
    const next = now.map((files) => ({ ...files }))
    for (const path of new Set([...Object.keys(now[0]), ...Object.keys(now[1]), ...Object.keys(left[0])])) {
      const [a, b] = now.map((files) => files[path] ?? null)
      const [movedOne, movedTwo] = [a !== (left[0][path] ?? null), b !== (left[1][path] ?? null)]
      if (a === b || (!movedOne && !movedTwo)) continue
      // Changed on both: a change beats a deletion, else the first computer's stays, and the second's is a conflicted copy.
      const [kept, other] = movedOne && movedTwo ? (a === null ? [b, null] : [a, b]) : movedOne ? [a, null] : [b, null]
      const copy = path.replace(/(\.[^./]+)?$/, ' (Desk’s conflicted copy 2026-11-03)$1')
      const done = await Promise.all([a === kept || put(one, path, kept, a), b === kept || put(two, path, kept, b),
        ...(other === null ? [] : [put(one, copy, other, null), put(two, copy, other, null)])])
      // One that moved meanwhile is seen as moved on both sides at the next pass, so neither change is lost.
      if (done.every(Boolean)) for (const files of next) kept === null ? delete files[path] : (files[path] = kept)
      else for (const [i, files] of next.entries()) left[i][path] === undefined ? delete files[path] : (files[path] = left[i][path])
    }
    left = next
  }
  let on = true
  const going = (async () => {
    while (on) {
      await pass().catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  })()
  return { stop: () => ((on = false), going) }
}

/** Every toast a page shows from now on, not one on show already; `told` gives those that showed since it last did. @param {import('@playwright/test').Page} page */
const listen = (page) => page.evaluate(() => {
  const told = /** @type {string[]} */ (Object.assign(window, { told: [] }).told), seen = new WeakMap()
  /** @param {boolean} anew */
  const look = (anew) => document.querySelectorAll('.toast').forEach((toast) => {
    if (seen.get(toast) !== toast.textContent && seen.set(toast, toast.textContent) && anew) told.push(String(toast.textContent))
  })
  look(false)
  new MutationObserver(() => look(true)).observe(document.documentElement, { subtree: true, childList: true, characterData: true })
})
/** @param {import('@playwright/test').Page} page @returns {Promise<string[]>} */
const told = (page) => page.evaluate(() => /** @type {any} */ (window).told.splice(0))

/** Whether a Jean holds a task whose file has all these words. @param {import('@playwright/test').Page} page @param {string[]} words */
const holds = (page, ...words) => page.evaluate(async (words) => {
  const [{ app }, { walk }] = await Promise.all([import('/ui/state.js'), import('/core/fs.js')])
  for (const path of (await walk(app.fs)).filter((path) => path.endsWith('.jsonl'))) {
    const text = (await app.fs.read(path)) ?? ''
    if (words.every((each) => text.includes(each))) return true
  }
  return false
}, words)

/**
 * Two Jeans syncing with one folder, each with a brain, keep each other in step on their own, with nothing clicked or answered
 * for it and nothing said: a task made on one comes to the other's list, a request there shows on the first one's screen as it
 * is, and a task deleted on the first goes from the second, where it was on screen.
 * @param {import('@playwright/test').Page} one @param {import('@playwright/test').Page} two
 */
async function inStep(one, two) {
  await Promise.all([one, two].map(listen))
  await (await openTasks(one)).locator('.place', { hasText: 'New task' }).click()
  await expect(one.locator('.hero-question')).toBeVisible()
  await answered(one, 'What is a leap year?')
  const task = (await openTasks(two)).locator('.history-item', { hasText: 'leap year' })
  await expect(task).toBeVisible({ timeout: 20_000 })
  // As it was once its answer was noted, which comes a moment after it: what is asked there next goes on from there.
  await expect.poll(() => holds(two, 'What is a leap year?', '"reached"'), { timeout: 20_000 }).toBe(true)
  expect(await told(two)).toEqual([])

  await told(one)
  await task.click()
  await expect(two.locator('.msg-user').first()).toContainText('What is a leap year?')
  await answered(two, 'Is 2100 one?')
  await expect(one.locator('.msg-user')).toHaveCount(2, { timeout: 20_000 })
  await expect(one.locator('.msg-user').last()).toContainText('Is 2100 one?')
  await expect(one.locator('.msg-jean .prose')).toHaveCount(2)
  // One task each, the same on both: none went apart into a copy.
  for (const jean of [one, two]) await expect((await openTasks(jean)).locator('.history-item')).toHaveCount(2)
  expect(await told(one)).toEqual([])

  await told(two)
  one.once('dialog', (dialog) => dialog.accept())
  await deleteOpenTask(one)
  await expect(two.locator('.hero-question')).toBeVisible({ timeout: 20_000 })
  await expect((await openTasks(two)).locator('.history-item', { hasText: 'leap year' })).toHaveCount(0)
  expect(await holds(two, 'Is 2100 one?')).toBe(false)
  expect(await told(two)).toEqual([])
}

test('two computers stay in step through a drive like Dropbox on their own, both ways, silently', async ({ page, browser }) => {
  test.setTimeout(120_000)
  await picker(page)
  await start(page)
  await connectFakeBrain(page)
  await answered(page, 'Explain photosynthesis in simple words')
  await turnOn(page, 'Synced folder')
  await page.keyboard.press('Escape')

  // The second computer, where the drive brings the folder down before Sync is turned on there.
  const context = await browser.newContext()
  const other = await context.newPage()
  await picker(other)
  await start(other)
  await connectFakeBrain(other)
  const drive = dropbox(page, other)
  try {
    await expect.poll(async () => Object.keys(await folder(other, 'Jean')), { timeout: 20_000 }).toContain('mirror.json')
    await turnOn(other, 'Synced folder')
    await other.keyboard.press('Escape')
    await expect((await openTasks(other)).locator('.history-item', { hasText: 'photosynthesis' })).toBeVisible({ timeout: 20_000 })
    // From here on, nothing is clicked for Sync on either computer, and the drive goes on alone.
    await inStep(page, other)
  } finally {
    await drive.stop()
    await context.close()
  }
})

/**
 * Two Jeans on the very same folder: this tab's profile turns Sync on, then another profile, added in this tab, is given the same
 * folder, which brings in what the first had; the first opens again in a tab beside it.
 * @param {import('@playwright/test').Page} page @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<import('@playwright/test').Page>} the first one's tab, `page` being the second's
 */
async function sameFolder(page, context) {
  /** The profile a tab's page opened, once ready: a page going to another still has its own. @param {import('@playwright/test').Page} on */
  const here = (on) => on.evaluate(async () => (document.documentElement.classList.contains('is-ready') ? /** @type {any} */ ((await import('/ui/state.js')).app.fs)?.root ?? null : null)).catch(() => null)
  await turnOn(page, 'Synced folder')
  await page.keyboard.press('Escape')
  const laptop = await here(page)
  await (await openProfile(page)).getByRole('button', { name: 'Add a profile' }).click()
  const dialog = page.locator('.profile-dialog[open]')
  await dialog.getByLabel('This profile’s name').fill('Laptop')
  await dialog.getByLabel('The new profile’s name').fill('Desk')
  await dialog.getByRole('button', { name: 'Add it' }).click()
  await expect.poll(() => here(page)).toMatch(/-desk$/)
  await turnOn(page, 'Synced folder')
  await page.keyboard.press('Escape')
  const other = await context.newPage()
  await other.addInitScript((profile) => sessionStorage.setItem('app.profile', profile), String(laptop))
  await start(other)
  await expect.poll(() => here(other)).toBe(laptop)
  return other
}

test('two Jeans on the very same folder stay in step on their own, both ways, silently', async ({ page, context }) => {
  test.setTimeout(120_000)
  await picker(page)
  await start(page)
  await connectFakeBrain(page)
  await answered(page, 'Explain photosynthesis in simple words')
  const other = await sameFolder(page, context)
  await expect((await openTasks(page)).locator('.history-item', { hasText: 'photosynthesis' })).toBeVisible({ timeout: 20_000 })
  await connectFakeBrain(page)
  await inStep(other, page)
})

const DOC = 'documents/01K9AAAAAAAAAAAAAAAAAAAAAA-trip.md'
/** The trip, a document of this Jean's, its words these. @param {import('@playwright/test').Page} page @param {string} body */
const keep = (page, body) => page.evaluate(async ({ path, body }) => {
  const { app } = await import('/ui/state.js')
  await app.fs.write(`${app.projectDir}/${path}`, `---\nformat: 1\nname: Trip\nauthor: user\n---\n${body}`)
}, { path: DOC, body })
/** What a Jean's editor of the trip holds, and its file but for its front matter. @param {import('@playwright/test').Page} on */
const shown = (on) => on.evaluate(async (path) => {
  const [{ app }, { shown }] = await Promise.all([import('/ui/state.js'), import('/caps/documents/documents.js')])
  return { editor: shown?.editor.markdown(), file: (await app.fs.read(`${app.projectDir}/${path}`))?.replace(/^---\n[\s\S]*?\n---\n/, '') }
}, DOC)
/** The words on a Jean's editor selected, or the caret just after them. @param {import('@playwright/test').Page} on @param {string} words @param {boolean} [over] */
const select = (on, words, over = false) => on.evaluate(async ({ words, over }) => {
  const [{ TextSelection }, { shown }] = await Promise.all([import('#prosemirror'), import('/caps/documents/documents.js')])
  const { view } = /** @type {any} */ (shown).editor
  let at = -1
  view.state.doc.descendants((/** @type {any} */ node, /** @type {number} */ pos) => {
    if (node.isText && at < 0 && node.text.includes(words)) at = pos + node.text.indexOf(words)
    return at < 0
  })
  view.focus()
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, over ? at : at + words.length, at + words.length)))
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 20)))
}, { words, over })
/** Each Jean opens the trip beside its task, once it came in. @param {import('@playwright/test').Page[]} jeans @param {string} path */
async function openOn(jeans, path) {
  for (const on of jeans) {
    await expect.poll(async () => (await shown(on)).file, { timeout: 20_000 }).toBeTruthy()
    await on.evaluate(async (path) => {
      await (await import('/ui/caps.js')).unlock('documents')
      ;(await import('/ui/preview.js')).preview({ uri: path, name: 'Trip.md', title: 'Trip', mimeType: 'text/markdown' })
    }, path)
    await expect(on.locator('#doc')).toBeAttached()
    await expect.poll(async () => (await shown(on)).editor).toBe((await shown(on)).file)
  }
}

test('a document open on two Jeans takes in what the other typed, where it is, and neither writes over the other', async ({ page, context }) => {
  test.setTimeout(120_000)
  const both = '# Trip\n\nWe leave on Tuesday.\n\nCall Anna and Tom.\n'
  await picker(page)
  await start(page)
  await keep(page, '# Trip\n\nWe leave on Monday.\n\nCall Anna.\n')
  const other = await sameFolder(page, context)
  await openOn([page, other], DOC)
  await Promise.all([page, other].map(listen))

  // The second has a word selected when what the first typed comes in: it shows there, and the selection stays on that word.
  await select(page, 'Monday', true)
  await select(other, 'Call Anna')
  await other.keyboard.type(' and Tom')
  await expect.poll(async () => (await shown(page)).editor, { timeout: 20_000 }).toContain('Call Anna and Tom.')
  await page.keyboard.type('Tuesday')
  // What the second typed over it comes to the first, which kept its own: both have both, in the editor and in the file.
  for (const on of [page, other]) await expect.poll(() => shown(on), { timeout: 20_000 }).toEqual({ editor: both, file: both })
  // ⌘Z on the second takes back its own typing alone, never the first one's, and that goes to the first too.
  await page.keyboard.press('ControlOrMeta+z')
  for (const on of [page, other]) await expect.poll(() => shown(on), { timeout: 20_000 }).toEqual({ editor: both.replace('Tuesday', 'Monday'), file: both.replace('Tuesday', 'Monday') })
  for (const on of [page, other]) expect(await told(on)).toEqual([])
})

test('in Japanese and Arabic, a word being composed when the other’s typing comes in is kept whole, and so is theirs', async ({ page, context }) => {
  test.setTimeout(120_000)
  const was = '# 旅行\n\n月曜日に出発します。\n\nأتصل بآنا.\n'
  await picker(page)
  await start(page)
  await keep(page, was)
  const other = await sameFolder(page, context)
  await openOn([page, other], DOC)
  await select(page, '月曜日', true)
  const cdp = await context.newCDPSession(page)
  for (const text of ['か', 'かよ', 'かようび']) await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
  await select(other, 'بآنا')
  await other.keyboard.insertText(' وتوم')
  // It comes in while the word is still being composed, which goes on undisturbed.
  await expect.poll(async () => (await shown(page)).editor, { timeout: 20_000 }).toContain('وتوم')
  await cdp.send('Input.imeSetComposition', { text: '火曜日', selectionStart: 3, selectionEnd: 3 })
  await cdp.send('Input.insertText', { text: '火曜日' })
  const both = '# 旅行\n\n火曜日に出発します。\n\nأتصل بآنا وتوم.\n'
  for (const on of [page, other]) await expect.poll(() => shown(on), { timeout: 20_000 }).toEqual({ editor: both, file: both })
})

test('with retention, a task deleted from the folder is kept first, then goes from Jean too (D412)', async ({ page }) => {
  await picker(page)
  await withPolicy(page, { retention: 'P6M' })
  await start(page)
  await connectFakeBrain(page)
  await answered(page, 'Explain photosynthesis in simple words')
  await turnOn(page, 'Synced folder')
  await page.keyboard.press('Escape')
  const inFolder = () => folder(page, 'Jean')
  // The first round, which seals and writes everything there is, takes longest.
  await expect.poll(async () => Object.keys(await inFolder()).some((path) => path.endsWith('.jsonl')), { timeout: 30_000 }).toBe(true)
  // The round that took it there is over, having noted it as in step: gone from the folder before that, it looks new here and goes back.
  const now = (await syncPage(page)).getByRole('button', { name: 'Sync now' })
  await expect(now).toBeEnabled()
  // The drive takes that one file away, as a drive does: a round that comes while `drive` empties the folder takes it for a new one.
  await page.evaluate(async (path) => {
    let dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('.picked')).getDirectoryHandle('Jean')
    const parts = path.split('/')
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
    await dir.removeEntry(String(parts.at(-1)))
  }, String(Object.keys(await inFolder()).find((path) => path.endsWith('.jsonl'))))
  await now.click()
  const left = () => page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const { walk } = await import('/core/fs.js')
    return { kept: await Promise.all((await walk(app.fs, '.kept')).map((path) => app.fs.read(path))), tasks: (await walk(app.fs)).filter((path) => /\/conversations\/.+\.jsonl$/.test(path)) }
  })
  await expect.poll(async () => (await left()).tasks).toEqual([])
  const { kept: [copy] } = await left()
  expect(copy).toContain('Explain photosynthesis')
  expect(copy).toContain('"all":true')
  // It was on screen: it closes, as a task deleted here does.
  await page.keyboard.press('Escape')
  await expect(page.locator('.hero-question')).toBeVisible()
  // Sync's folder never carries the copy.
  expect(Object.keys(await inFolder()).filter((path) => path.startsWith('.kept') || path.endsWith('.jsonl'))).toEqual([])
})

test('two computers change a collection apart, and both keep every change, each cell its latest (D491)', async ({ page, browser }) => {
  const place = 'collections/01K85Z1T00000000000000000A-jobs'
  await picker(page)
  await start(page)
  await page.evaluate(async (place) => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await unlock('tables')
    const at = '2026-10-21T09:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${place}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000A', name: 'Jobs', author: 'user', created: at, changed: at,
      properties: [{ id: 'company', name: 'Company', type: 'text' }, { id: 'stage', name: 'Stage', type: 'text' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${place}/changes.jsonl`, [['1', 'Acme'], ['2', 'Globex']].map(([n, company]) => `${JSON.stringify({ row: `01K8000000000000000000000${n}`, set: { company, stage: 'Applied' }, at, by: 'user' })}\n`).join(''))
  }, place)
  await turnOn(page, 'Synced folder')
  await page.keyboard.press('Escape')
  await expect.poll(async () => Object.keys(await folder(page, 'Jean')).some((path) => path.endsWith('/changes.jsonl'))).toBe(true)

  // The second computer gets it from the drive.
  const context = await browser.newContext()
  const other = await context.newPage()
  await picker(other)
  await start(other)
  await drive(other, 'Jean', await folder(page, 'Jean'))
  await turnOn(other, 'Synced folder')
  await other.keyboard.press('Escape')
  // Its first round has brought the collection, which nothing can show until then.
  await expect.poll(() => other.evaluate(async (place) => {
    const { app } = await import('/ui/state.js')
    return Boolean(await app.fs.read(`${app.projectDir}/${place}/collection.json`))
  }, place)).toBe(true)

  /** A computer's user changes these rows of it, on show, by hand; a row with no id is a new one. @param {import('@playwright/test').Page} on @param {{ row?: string, set: object }[]} edits */
  const changed = (on, edits) => on.evaluate(async ({ place, edits }) => {
    const [{ unlock }, { preview }] = await Promise.all([import('/ui/caps.js'), import('/ui/preview.js')])
    await unlock('tables')
    preview({ uri: place, name: 'Jobs.xlsx', title: 'Jobs' })
    const { shown, change } = await import('/caps/tables/tables.js')
    while (!shown.value) await new Promise((done) => setTimeout(done, 20))
    await change(/** @type {any} */ (shown.value), edits, 'user')
  }, { place, edits })
  /** Rounds with the folder as the drive left it. @param {import('@playwright/test').Page} on */
  const round = async (on) => {
    await (await syncPage(on)).getByRole('button', { name: 'Sync now' }).click()
    await on.keyboard.press('Escape')
  }
  /** The rows on show, as "company stage". @param {import('@playwright/test').Page} on */
  const shown = (on) => on.evaluate(async () => (await import('/caps/tables/tables.js')).shown.value?.rows.map((/** @type {any} */ row) => `${row.cells.company} ${row.cells.stage}`).sort())
  const WITH = ['Acme Interview', 'Globex Offer', 'Initech Applied']

  // Offline, each changes its own row, and the same cell, the second one later; the second also adds a row.
  await changed(page, [{ row: '01K80000000000000000000001', set: { stage: 'Interview' } }, { row: '01K80000000000000000000002', set: { stage: 'Rejected' } }])
  await changed(other, [{ row: '01K80000000000000000000002', set: { stage: 'Offer' } }, { set: { company: 'Initech', stage: 'Applied' } }])
  await round(page)
  await expect.poll(async () => JSON.stringify(await folder(page, 'Jean'))).toContain('Interview')
  await round(other)
  await expect.poll(async () => JSON.stringify(await folder(other, 'Jean'))).toContain('Initech')
  // The drive keeps the first computer's file over the second's, as a drive does; each round then brings the two together.
  await drive(other, 'Jean', await folder(page, 'Jean'))
  await round(other)
  await expect.poll(() => shown(other)).toEqual(WITH)
  await expect.poll(async () => { const text = JSON.stringify(await folder(other, 'Jean')); return text.includes('Interview') && text.includes('Initech') }).toBe(true)
  await drive(page, 'Jean', await folder(other, 'Jean'))
  await round(page)
  await expect.poll(() => shown(page)).toEqual(WITH)
  await context.close()
})

test('a folder of other files is refused, and nothing of it comes in', async ({ page }) => {
  await picker(page)
  await start(page)
  await page.evaluate(() => localStorage.setItem('e2e.pick', 'Documents'))
  await drive(page, 'Documents', { 'Taxes 2025.txt': 'Mine', 'projects/notes.md': 'Mine too' })
  await turnOn(page, 'Synced folder')
  await expect(page.locator('.toast')).toContainText('Documents holds other files.')
  await page.keyboard.press('Escape')
  const panel = await syncPage(page)
  await expect(panel.locator('.data-head')).toContainText('Only on this computer')
  await expect(panel.getByRole('button', { name: 'Choose a folder…' })).toBeVisible()
  expect(await folder(page, 'Documents')).toEqual({ 'Taxes 2025.txt': 'Mine', 'projects/notes.md': 'Mine too' })
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.fs.exists('projects/notes.md'))).toBe(false)
})
