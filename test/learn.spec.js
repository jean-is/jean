// Learn and repeat (0.7): skills from elsewhere, read from a discovery index or a repository on
// GitHub on the device and added only by the user, after reading their steps (D121, D207);
// routines, requests Jean sends itself on a schedule, while open or caught up at the next visit (D122).
import { createHash } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings, closeSettings, openTasks, MAIL_URL } from './helpers.js'


/** A new conversation, once the page has turned to it. @param {import('@playwright/test').Page} page */
async function newConversation(page) {
  await page.locator('.wordmark').click()
  await expect(page.locator('.hero-question')).toBeVisible()
}

/** The user's sources of skills: the fake index, or none (the defaults are on the web). @param {import('@playwright/test').Page} page @param {string[]} sources */
const useSources = (page, sources) => page.evaluate(async (list) => (await import('/ui/state.js')).updateSettings({ sources: list }), sources)

/** The routines of the home project, as kept. @param {import('@playwright/test').Page} page */
const routines = (page) => page.evaluate(async () => {
  const { app } = await import('/ui/state.js')
  return (await import('/caps/routines/schedule.js')).listRoutines(app.fs, '')
})

/** Changes the home project's first routine as it is kept. @param {import('@playwright/test').Page} page @param {Record<string, unknown>} change */
const changeRoutine = (page, change) => page.evaluate(async (patch) => {
  const { app } = await import('/ui/state.js')
  const { listRoutines, writeRoutine } = await import('/caps/routines/schedule.js')
  const [routine] = await listRoutines(app.fs, '')
  await writeRoutine(app.fs, { ...routine, ...patch, createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() })
}, change)

test('a skill from elsewhere is checked, shown, and added only by the user', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  await useSources(page, [])
  const knows = await openSettings(page, 'Skills')
  const elsewhere = knows.locator('section.sources')
  await elsewhere.getByRole('button', { name: 'Browse them' }).click()
  await elsewhere.locator('input[name="address"]').fill(MAIL_URL)
  await elsewhere.locator('form .button').click()
  const source = elsewhere.locator('.source')
  await expect(source.locator('h4')).toContainText('127.0.0.1:4182')
  await expect(source.locator('li')).toHaveCount(4)

  // A download that isn't what its index lists, or that holds a program, can't be added.
  const ready = page.locator('app-skill-ready dialog[open]')
  await source.getByRole('button', { name: 'invoice-check' }).click()
  await expect(ready.locator('.status')).toHaveText('This skill can’t be added: what was downloaded doesn’t match what its source lists.')
  await expect(ready.locator('.button.primary')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(knows).toBeVisible()
  await source.getByRole('button', { name: 'pdf-forms' }).click()
  await expect(ready.locator('.status')).toHaveText('This skill runs programs, which can’t run here, so it can’t be added.')
  await page.keyboard.press('Escape')

  // One made of instructions shows its steps, and the files beside them, first.
  await source.getByRole('button', { name: 'meeting-notes' }).click()
  await expect(ready).toContainText('From 127.0.0.1:4182')
  // Named by its steps' heading, which open at once (D261).
  await expect(ready.getByRole('heading', { name: 'Meeting notes' })).toBeVisible()
  await expect(ready.locator('.skill-steps')).toBeVisible()
  await expect(ready.locator('.skill-steps')).toContainText('List the action items, each with an owner.')
  await expect(ready).toContainText('With these files: references/template.md')
  await ready.locator('.button.primary').click()
  await expect(page.locator('.toast')).toContainText('Added the skill “Meeting notes”.')
  await expect(knows.locator('.list summary', { hasText: 'Meeting notes' })).toContainText('From 127.0.0.1:4182')
  await expect(source.getByRole('button', { name: 'meeting-notes' })).toHaveCount(0)
  const [steps, beside] = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    return Promise.all([app.fs.read('skills/meeting-notes/SKILL.md'), app.fs.read('skills/meeting-notes/references/template.md')])
  })
  expect(steps).toContain('source: "http://127.0.0.1:4182/.well-known/agent-skills/meeting-notes.tar.gz"')
  expect(steps).toMatch(/digest: "sha256:[0-9a-f]{64}"/)
  expect(beside).toBe('## Decisions\n\n## Action items\n')
})

test('a folder of a repository on GitHub is a source: its skills, each file checked against git’s hash (D207)', async ({ page }) => {
  /** @type {Record<string, string>} */
  const files = {
    'legal/skills/brief/SKILL.md': '---\nname: brief\ndescription: >\n  Write a short brief\n  before a meeting.\n---\n# Brief\n\n1. Read the matter.\n',
    'legal/skills/brief/reference/forms.md': '# Forms\n',
    'legal/skills/stamp/SKILL.md': '---\nname: stamp\ndescription: Stamp a contract with a seal.\n---\n# Stamp\n',
    'legal/skills/stamp/stamp.py': 'print(1)\n',
  }
  const blob = (/** @type {string} */ text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex')
  const tree = [{ path: 'legal/skills/brief', type: 'tree', sha: 'b'.repeat(40) },
    ...Object.entries(files).map(([path, text]) => ({ path, type: 'blob', sha: blob(text), size: Buffer.byteLength(text) }))]
  const headers = { 'access-control-allow-origin': '*' }
  await page.route('https://api.github.com/repos/anthropics/knowledge-work-plugins/git/trees/main?recursive=1', (route) => route.fulfill({ headers, json: { sha: 'a'.repeat(40), tree } }))
  await page.route('https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/**', (route) => {
    const text = files[new URL(route.request().url()).pathname.split('/main/')[1]]
    return route.fulfill({ headers, status: text === undefined ? 404 : 200, body: text ?? '' })
  })
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  await useSources(page, ['github.com/anthropics/knowledge-work-plugins/tree/main/legal'])
  const knows = await openSettings(page, 'Skills')
  const elsewhere = knows.locator('section.sources')
  await elsewhere.getByRole('button', { name: 'Browse them' }).click()
  const source = elsewhere.locator('.source')
  await expect(source.locator('h4')).toContainText('github.com/anthropics/knowledge-work-plugins/legal')
  await expect(source.locator('li')).toHaveCount(2)

  const ready = page.locator('app-skill-ready dialog[open]')
  await source.getByRole('button', { name: 'stamp' }).click()
  await expect(ready.locator('.status')).toHaveText('This skill runs programs, which can’t run here, so it can’t be added.')
  await page.keyboard.press('Escape')
  await source.getByRole('button', { name: 'brief' }).click()
  await expect(ready).toContainText('From github.com/anthropics/knowledge-work-plugins')
  await expect(ready).toContainText('Write a short brief before a meeting.')
  await expect(ready).toContainText('With these files: reference/forms.md')
  await ready.locator('.button.primary').click()
  await expect(knows.locator('.list summary', { hasText: 'Brief' })).toContainText('From github.com/anthropics/knowledge-work-plugins')
  const steps = await page.evaluate(async () => (await import('/ui/state.js')).app.fs.read('skills/brief/SKILL.md'))
  expect(steps).toContain('source: "https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/legal/skills/brief/SKILL.md"')
  expect(steps).toContain(`digest: "git:${'b'.repeat(40)}"`)
})

test('the third request of a kind finds a ready-made skill before offering to make one', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  await useSources(page, [MAIL_URL])
  for (let i = 0; i < 3; i++) {
    await newConversation(page)
    await ask(page, 'Summarize the weekly sales by region')
    await expect(page.locator('.follow-ups')).toBeVisible()
  }
  const found = page.locator('.follow-up', { hasText: 'See a skill that does this' })
  await expect(found).toBeVisible()
  await expect(page.locator('.follow-up', { hasText: 'Save this as a skill' })).toHaveCount(0)
  await found.click()
  const ready = page.locator('app-skill-ready dialog[open]')
  // Named by its steps' heading once they are read, as its toast names it (D261).
  await expect(ready.getByRole('heading', { name: 'Weekly sales report' })).toBeVisible()
  await expect(ready.locator('.skill-steps')).toContainText('Say which region grew most.')
  await ready.locator('.button.primary').click()
  await expect(page.locator('.toast')).toContainText('Added the skill “Weekly sales report”.')
  await expect(found).toHaveCount(0)

  // The next conversation lists it, like a skill of the user's own.
  await newConversation(page)
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const system = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system)
  expect(system).toContain('<skills>\n- weekly-sales-report: Summarize the weekly sales by region from a spreadsheet, with totals.\n</skills>')
})

test('a routine made by the brain is shown, changed, and run when it falls due while Jean is open', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Routines')
  await page.keyboard.press('Escape')
  await newConversation(page)
  await ask(page, 'Every day at 08:00, summarize the weekly sales by region')
  await expect(page.locator('.toast')).toContainText('Made the routine “Weekly sales”.')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('it is a routine now')

  const knows = await openSettings(page, 'Routines')
  const routine = knows.locator('.routines li')
  await expect(routine.locator('button.item')).toContainText('Weekly sales')
  await expect(routine.locator('button.item small')).toContainText('Next:')
  await routine.locator('button.item').click()
  await expect(routine.locator('select').first()).toHaveValue('day')
  await expect(routine.locator('input[type="time"]')).toHaveValue('08:00')
  await expect(routine.locator('textarea')).toHaveValue('Summarize the weekly sales by region')
  // Every week, on a day named in the user's language.
  await routine.locator('select').first().selectOption('week')
  await expect(routine.locator('select').nth(1).locator('option')).toHaveCount(7)
  await routine.locator('select').nth(1).selectOption({ label: 'Friday' })
  await routine.locator('input[type="time"]').fill('09:30')
  await routine.locator('input[type="time"]').blur()
  await expect.poll(async () => (await routines(page)).map(({ every, on, at }) => ({ every, on, at }))).toEqual([{ every: 'week', on: 5, at: '09:30' }])
  // Every hour, at its minutes; then once, on the next day its time comes, which the user changes.
  await routine.locator('select').first().selectOption('hour')
  await expect(routine.locator('input[type="time"]')).toHaveCount(0)
  await routine.locator('select').nth(1).selectOption({ label: 'At minute 45' })
  await expect.poll(async () => (await routines(page)).map(({ every, on, at }) => ({ every, on, at }))).toEqual([{ every: 'hour', on: undefined, at: '09:45' }])
  await routine.locator('select').first().selectOption('once')
  await expect(routine.locator('input[type="time"]')).toHaveValue('09:45')
  await expect(routine.locator('input[type="date"]')).toHaveValue(/^\d{4}-\d\d-\d\d$/)
  await routine.locator('input[type="date"]').fill('2099-01-15')
  await routine.locator('input[type="date"]').blur()
  await expect.poll(async () => (await routines(page)).map(({ every, on, at }) => ({ every, on, at }))).toEqual([{ every: 'once', on: '2099-01-15', at: '09:45' }])
  // Its own brain (D303): the one the user's messages have, until one the picker offers is picked, kept with its version.
  const brain = routine.getByRole('combobox', { name: 'Brain', exact: true })
  await expect(brain).toHaveValue('')
  await expect(brain.locator('option').first()).toHaveText('Same as your messages')
  await brain.selectOption({ label: 'fake-brain-1' })
  await expect.poll(async () => (await routines(page)).map(({ brain, model }) => ({ brain: brain?.length, model }))).toEqual([{ brain: 26, model: 'fake-brain-1' }])
  await brain.selectOption({ label: 'Auto' })
  await expect.poll(async () => (await routines(page)).map(({ brain, model }) => ({ brain, model }))).toEqual([{ brain: 'auto', model: undefined }])
  await brain.selectOption({ label: 'fake-brain-1' })
  await page.keyboard.press('Escape')

  // Due since midnight: on the welcome screen, with Jean free, it runs in a conversation of its own, on its own brain's version.
  await changeRoutine(page, { every: 'day', on: undefined, at: '00:00', model: 'fake-brain-2' })
  await page.locator('.wordmark').click()
  await expect(page.locator('.since')).toHaveText('Routines · Weekly sales')
  await expect(page.locator('.msg-user')).toHaveText('Summarize the weekly sales by region')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const note = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.update?.sessionUpdate === '_system_note')?.update)
  expect(note.text).toMatch(/^The next message is the user's routine "Weekly sales", which you send yourself every day at 00:00; it fell due on \d{4}-\d\d-\d\d 00:00 \(\w+day\), local time\./)
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.update?.toolCallId?.startsWith('brain-'))?.update.rawInput.model)).toBe('fake-brain-2')
  expect(await page.evaluate(async () => (await import('/ui/state.js')).activeBrain.value?.model)).toBe('fake-brain-1')
  const ran = (await routines(page))[0].lastRun
  expect(ran).toBeTruthy()

  // Run now, from Settings: again, in a conversation of its own, the brain told the user asked.
  const current = () => page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.id)
  const before = await current()
  await (await openSettings(page, 'Routines')).getByRole('button', { name: 'Run now' }).click()
  await expect(page.locator('app-settings dialog[open]')).toHaveCount(0)
  await expect.poll(current).not.toBe(before)
  await expect(page.locator('.since')).toHaveText('Routines · Weekly sales')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const asked = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.update?.sessionUpdate === '_system_note')?.update)
  // Told of the run before it, from its time, as it went.
  expect(asked.text).toMatch(/every day at 00:00; the user ran it now\. It ran once before, last on \d{4}-\d\d-\d\d \d\d:\d\d \(\w+day\); what is new is what came after that\. /)
  expect(asked.text).toContain('The last run, as it went, for reference:\n\nUser: Summarize the weekly sales by region\n\nAssistant: ## Here is what I found')
  expect((await routines(page))[0].lastRun > ran).toBe(true)

  // Its runs are its own (D122): one row in the drawer, named after it, which unfolds the earlier one under it.
  const tasks = await openTasks(page)
  await expect(tasks.locator('.history-item:has(> .icon)')).toHaveText(['Weekly sales'])
  const fold = tasks.locator('.runs-toggle')
  await expect(fold).toHaveAttribute('aria-label', 'Past runs: 1')
  await expect(tasks.locator('li.is-run')).toHaveCount(0)
  await fold.click()
  await expect(fold).toHaveAttribute('aria-expanded', 'true')
  await tasks.locator('li.is-run .history-item').click()
  await expect.poll(current).toBe(before)
  await expect(tasks.locator('li.is-run.is-current')).toHaveCount(1)
  // Listed under it in Settings too, which a run's line opens.
  await page.locator('button.since').click()
  const runs = page.locator('app-settings dialog[open] .routine-runs button')
  await expect(runs).toHaveCount(2)
  await runs.first().click()
  await expect(page.locator('app-settings dialog[open]')).toHaveCount(0)
  await expect.poll(current).not.toBe(before)
  await expect(tasks.locator('li.is-current .history-item')).toHaveText('Weekly sales')
})

test('a routine that fell due while Jean was closed runs at the next visit, once', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit runs here like a private window: nothing is kept for the next visit')
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Routines')
  await page.keyboard.press('Escape')
  await newConversation(page)
  await ask(page, 'Every day at 07:00, summarize the weekly sales by region')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('it is a routine now')
  await changeRoutine(page, { at: '00:00' })
  // Back with the earlier conversation open: nobody has touched this visit yet, so it runs.
  await page.reload()
  await expect(page.locator('.since')).toHaveText('Routines · Weekly sales')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  await expect(page.locator('.follow-ups')).toBeVisible()
  const ran = (await routines(page))[0].lastRun
  const count = await page.evaluate(async () => (await import('/ui/state.js')).app.conversations.value.length)
  await page.reload()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  await page.waitForTimeout(2500)
  expect((await routines(page))[0].lastRun).toBe(ran)
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.conversations.value.length)).toBe(count)
})

test('a routine that falls due while the user is busy runs at once, out of sight, the page and the box as they were (D122, D147)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Routines')
  await page.keyboard.press('Escape')
  await newConversation(page)
  await ask(page, 'Every day at 07:00, summarize the weekly sales by region')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('it is a routine now')
  // Due while the user writes their next message in the task that made it, after a look at Settings.
  await page.locator('#prompt').fill('And the monthly ones?')
  await changeRoutine(page, { at: '00:00' })
  await openSettings(page, 'Routines')
  await closeSettings(page)
  const tasks = await openTasks(page)
  const run = tasks.locator('.history-list li', { hasText: 'Weekly sales' })
  await expect(run.getByRole('img', { name: 'Unread' })).toBeVisible()
  await expect(page.locator('.msg-user')).toHaveText(['Every day at 07:00, summarize the weekly sales by region'])
  await expect(page.locator('#prompt')).toHaveValue('And the monthly ones?')
  await run.locator('.history-item').click()
  await expect(page.locator('.since')).toHaveText('Routines · Weekly sales')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
})

test('a routine\'s runs are not requests of the user\'s own: they make no kind (D122)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  await useSources(page, [])
  await page.evaluate(async () => {
    const { app, refreshConversations } = await import('/ui/state.js')
    const { createConversation, appendRecords } = await import('/core/conversations.js')
    const { userRecords, noteRecord } = await import('/core/events.js')
    for (let i = 0; i < 2; i++) {
      const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: 'test' })
      await appendRecords(app.fs, path, [noteRecord('This request is the routine Weekly sales.', { kind: 'routine', routine: 'routines/x.md', title: 'Weekly sales' }), ...userRecords('Summarize the weekly sales by region', [], 'test')])
    }
    await refreshConversations()
  })
  await newConversation(page)
  await ask(page, 'Summarize the weekly sales by region')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  await expect(page.locator('.follow-ups')).toBeVisible()
  await expect(page.locator('.follow-up', { hasText: 'Save this as a skill' })).toHaveCount(0)
})

test('requests of a kind on three different days offer a routine, at the time they were made', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  await useSources(page, [])
  // The same request, the day before yesterday and yesterday, at a quarter to eight.
  await page.evaluate(async () => {
    const { app, refreshConversations } = await import('/ui/state.js')
    const { createConversation, appendRecords } = await import('/core/conversations.js')
    const { userRecords } = await import('/core/events.js')
    for (const days of [2, 1]) {
      const when = new Date()
      when.setDate(when.getDate() - days)
      when.setHours(7, 45, 0, 0)
      const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: 'test', now: when })
      await appendRecords(app.fs, path, userRecords('Summarize the weekly sales by region', [], 'test'))
    }
    await refreshConversations()
  })
  await newConversation(page)
  await ask(page, 'Summarize the weekly sales by region')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  await expect(page.locator('.follow-up', { hasText: 'Save this as a skill' })).toBeVisible()
  const offer = page.locator('aside.offer')
  await expect(offer).toContainText('three different days')
  await offer.locator('.button.primary').click()
  await expect(page.locator('.toast')).toContainText('Made the routine “Weekly sales”.')
  expect((await routines(page)).map(({ every, at }) => ({ every, at }))).toEqual([{ every: 'day', at: '07:45' }])
})

test('a routine runs each time a file is shared that passes its question, with the file, and a run never sets one off (D294)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Routines')
  await page.keyboard.press('Escape')
  await newConversation(page)
  await ask(page, 'Each time I share a file, add it to the register')
  await expect(page.locator('.toast')).toContainText('Made the routine “File it”.')
  expect((await routines(page)).map((one) => [one.title, 'when' in one && one.when])).toEqual([['File it', 'file']])

  // Settings shows what sets it off, in place of a time, and the question a file must pass.
  const knows = await openSettings(page, 'Routines')
  const routine = knows.locator('.routines li')
  await expect(routine.getByRole('button', { name: 'Run now' })).toHaveCount(0)
  await routine.locator('button.item').click()
  await expect(routine.locator('select').first()).toHaveValue('file')
  await expect(routine.locator('input[type="time"]')).toHaveCount(0)
  await routine.getByLabel('Only if the answer is yes to').fill('Is it an invoice?')
  await routine.getByLabel('Only if the answer is yes to').blur()
  await expect.poll(async () => (await routines(page)).map((one) => 'if' in one && one.if)).toEqual(['Is it an invoice?'])
  await closeSettings(page)

  // A file that isn't one sets nothing off; an invoice does, once Jean is free, and its run has the file.
  await newConversation(page)
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Ideas for the garden.') })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Here are my notes')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(1)
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'invoice-42.txt', mimeType: 'text/plain', buffer: Buffer.from('Invoice 42: 3 chairs, 240 EUR.') })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'And this one')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(2)
  await newConversation(page)
  await expect(page.locator('.since')).toHaveText('Routines · File it')
  await expect(page.locator('.msg-user')).toContainText('Add the file to the register')
  await expect(page.locator('.msg-files')).toContainText('invoice-42.txt')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(1)
  const note = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.update?.sessionUpdate === '_system_note')?.update)
  expect(note.text).toContain('which you send yourself each time the user shares a file, when the answer to "Is it an invoice?" about it is yes; this time it is invoice-42.txt, which the user shared in another task')
  // Its run shared the file again, and set nothing off, nor did the notes: back on the welcome, Jean is free, and nothing more runs.
  await newConversation(page)
  await page.waitForTimeout(2500)
  await expect(page.locator('.hero-question')).toBeVisible()
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.conversations.value.filter((item) => item.routine).length)).toBe(1)
})
