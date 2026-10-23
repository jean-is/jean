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
  // With no skill yet, Skills shows the ways to add one; From a site lists the sources (D517).
  const knows = await openSettings(page, 'Skills')
  await knows.getByRole('button', { name: /^From a site/ }).click()
  const elsewhere = knows.locator('section.sources')
  await elsewhere.getByRole('button', { name: 'Browse them' }).click()
  await elsewhere.locator('input[name="address"]').fill(MAIL_URL)
  await elsewhere.locator('form .button').click()
  const source = elsewhere.locator('.source')
  await expect(source.locator('h4')).toContainText('127.0.0.1:4182')
  await expect(source.locator('li')).toHaveCount(4)

  // A download that isn't what its index lists, or that holds a program, can't be added: each says why on its page.
  await source.getByRole('button', { name: 'invoice-check' }).click()
  await expect(knows.locator('.status')).toHaveText('This skill can’t be added: what was downloaded doesn’t match what its source lists.')
  await expect(knows.getByRole('button', { name: 'Add this skill' })).toHaveCount(0)
  await knows.locator('.back').click()
  await source.getByRole('button', { name: 'pdf-forms' }).click()
  await expect(knows.locator('.status')).toHaveText('This skill runs programs, which can’t run here, so it can’t be added.')
  await knows.locator('.back').click()

  // One made of instructions shows its steps, and the files beside them, first.
  await source.getByRole('button', { name: 'meeting-notes' }).click()
  await expect(knows.locator('.skill-head .lede')).toHaveText('From 127.0.0.1:4182')
  // Named by its steps' heading, which open at once (D261).
  await expect(knows.getByRole('heading', { name: 'Meeting notes' })).toBeVisible()
  await expect(knows.locator('.skill-steps')).toBeVisible()
  await expect(knows.locator('.skill-steps')).toContainText('List the action items, each with an owner.')
  await expect(knows).toContainText('With these files: references/template.md')
  await knows.getByRole('button', { name: 'Add this skill' }).click()
  await expect(page.locator('.toast')).toContainText('Added the skill “Meeting notes”.')
  // Its page says where it came from, and what came with it.
  await expect(knows.locator('.skill-head .lede')).toContainText('From 127.0.0.1:4182')
  await expect(knows).toContainText('With these files: references/template.md')
  await knows.locator('.back').click()
  await expect(knows.locator('.skills .item', { hasText: 'Meeting notes' }).locator('.skill-from')).toHaveText('127.0.0.1:4182')
  await knows.getByRole('button', { name: 'Add a skill' }).click()
  await knows.getByRole('button', { name: /^From a site/ }).click()
  await expect(source.getByRole('button', { name: 'meeting-notes' })).toHaveCount(0)
  const [steps, beside] = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    return Promise.all([app.fs.read('skills/meeting-notes/SKILL.md'), app.fs.read('skills/meeting-notes/references/template.md')])
  })
  expect(steps).toContain('source: "http://127.0.0.1:4182/.well-known/agent-skills/meeting-notes.tar.gz"')
  expect(steps).toMatch(/digest: "sha256:[0-9a-f]{64}"/)
  expect(beside).toBe('## Decisions\n\n## Action items\n')
})

test('Settings › Skills says the skill followed last; a skill opens its page, to try it, change its steps, turn it off or have Jean change it (D517)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  await useSources(page, [])
  // A skill made with Jean nine days ago, with its example, and a task that read its steps two days ago.
  await page.evaluate(async () => {
    const { app, refreshConversations } = await import('/ui/state.js')
    const { saveSkill } = await import('/core/skills.js')
    const { createConversation, appendRecords } = await import('/core/conversations.js')
    const { userRecords } = await import('/core/events.js')
    await saveSkill(app.fs, '', { name: 'reply-to-a-client', description: 'When the user asks to answer a client’s email.', by: 'jean', now: new Date(Date.now() - 9 * 86_400_000),
      body: '# Reply to a client\n\n1. Thank them by name.\n2. Answer in two sentences.', metadata: { example: 'Answer Mrs Martin’s email' } })
    const at = new Date(Date.now() - 2 * 86_400_000)
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: 'test', now: at })
    await appendRecords(app.fs, path, [...userRecords('Answer this client', [], 'test'),
      { at: at.toISOString(), by: 'jean', update: { sessionUpdate: 'tool_call', toolCallId: 'c1', name: 'skill', title: 'Skill reply-to-a-client', kind: 'read', status: 'pending', rawInput: { name: 'reply-to-a-client' } } }])
    await refreshConversations()
  })
  const knows = await openSettings(page, 'Skills')
  await expect(knows.locator('.lede').first()).toContainText(/Last followed: \u2068?Reply to a client\u2069?, 2 days ago\./)
  const row = knows.locator('.skills .item', { hasText: 'Reply to a client' })
  await expect(row.locator('.skill-from')).toHaveCount(0)
  await row.click()
  await expect(page).toHaveURL(/\/settings\/skills\/reply-to-a-client$/)
  await expect(knows.locator('.skill-head h2')).toBeFocused()
  await expect(knows.locator('.skill-head .lede')).toContainText(/^Made with Jean on .+ · followed once, 2 days ago$/)
  await expect(knows.locator('.skill-steps li')).toHaveText(['Thank them by name.', 'Answer in two sentences.'])

  // Its steps changed in its words and kept: who made it and when stay.
  await knows.getByRole('button', { name: 'Edit' }).click()
  await knows.getByRole('textbox', { name: 'Steps' }).fill('1. Thank them warmly, by name.\n2. Answer in two sentences.')
  await knows.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(knows.locator('.skill-steps li').first()).toHaveText('Thank them warmly, by name.')
  const kept = await page.evaluate(async () => (await import('/ui/state.js')).app.fs.read('skills/reply-to-a-client/SKILL.md'))
  expect(kept).toContain('  author: jean\n')
  expect(kept).toContain('\n# Reply to a client\n\n1. Thank them warmly, by name.\n')

  // Turned off, it is Off in the list and Jean no longer lists it; turned on, it is back.
  await knows.getByRole('switch', { name: 'Reply to a client' }).uncheck()
  await knows.locator('.back').click()
  await expect(row.locator('.skill-from')).toHaveText('Off')
  await closeSettings(page)
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const system = () => page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system)
  expect(await system()).not.toContain('reply-to-a-client')
  await openSettings(page, 'Skills')
  await row.click()
  await knows.getByRole('switch', { name: 'Reply to a client' }).check()

  // Try it: a new task, its box holding the skill's example, to send or finish.
  await knows.getByRole('button', { name: 'Try it' }).click()
  await expect(page.locator('app-settings dialog[open]')).toHaveCount(0)
  await expect(page.locator('#prompt')).toHaveValue('/reply-to-a-client Answer Mrs Martin’s email')
  await expect(page.locator('#prompt')).toBeFocused()

  // Change it with Jean: a new task that names the skill, for the user to say how.
  await openSettings(page, 'Skills')
  await row.click()
  await knows.getByRole('button', { name: 'Change it with Jean' }).click()
  await expect(page.locator('#prompt')).toHaveValue('Change the skill /reply-to-a-client: ')

  // Make one with Jean, from Add a skill: the box asks for one.
  await openSettings(page, 'Skills')
  await knows.getByRole('button', { name: 'Add a skill' }).click()
  await expect(knows.locator('.skill-head h2')).toHaveText('Add a skill')
  await knows.getByRole('button', { name: /^Make one with Jean/ }).click()
  await expect(page.locator('#prompt')).toHaveValue('Make me a skill for ')
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
  await knows.getByRole('button', { name: /^From a site/ }).click()
  const elsewhere = knows.locator('section.sources')
  await elsewhere.getByRole('button', { name: 'Browse them' }).click()
  const source = elsewhere.locator('.source')
  await expect(source.locator('h4')).toContainText('github.com/anthropics/knowledge-work-plugins/legal')
  await expect(source.locator('li')).toHaveCount(2)

  await source.getByRole('button', { name: 'stamp' }).click()
  await expect(knows.locator('.status')).toHaveText('This skill runs programs, which can’t run here, so it can’t be added.')
  await knows.locator('.back').click()
  await source.getByRole('button', { name: 'brief' }).click()
  await expect(knows).toContainText('From github.com/anthropics/knowledge-work-plugins')
  await expect(knows).toContainText('Write a short brief before a meeting.')
  await expect(knows).toContainText('With these files: reference/forms.md')
  await knows.getByRole('button', { name: 'Add this skill' }).click()
  await expect(knows.locator('.skill-head .lede')).toContainText('From github.com/anthropics/knowledge-work-plugins')
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
  expect(system).toContain('<skills>\n- weekly-sales-report: Summarize the weekly sales by region from a spreadsheet, with totals.\n- plain-words: ')
})

test('before Routines is found, the brain offers it in its answer, saying what routines do (D322)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Every day at 08:00, summarize the weekly sales by region')
  const card = page.locator('.msg-jean .approval')
  await expect(card).toContainText('Make this a routine, done on its own on a schedule?')
  await card.getByRole('button', { name: 'Turn it on' }).click()
  await expect(page.locator('.toast')).toContainText('Made the routine “Weekly sales”.')
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

  // Its row says when it runs, in words, and when next; it opens the routine's page at its own address, the keyboard on its title (D509).
  const knows = await openSettings(page, 'Routines')
  const routine = knows.locator('.routines li')
  await expect(routine.locator('button.item')).toContainText('Weekly sales')
  await expect(routine.locator('button.item small')).toContainText(/^Every day at 8:00\sAM · Next:/)
  await routine.locator('button.item').click()
  await expect(page).toHaveURL(/\/settings\/routines\/[0-9A-Z]{26}$/)
  await expect(knows.getByRole('heading', { name: 'Weekly sales' })).toBeFocused()
  const [often, day, time] = [knows.getByLabel('How often'), knows.getByLabel(/^Day/), knows.getByLabel(/^Time/)]
  await expect(often).toHaveValue('day')
  await expect(time).toHaveValue('08:00')
  await expect(knows.getByLabel('What to do')).toHaveValue('Summarize the weekly sales by region')
  // Every week, on a day named in the user's language, which its title's line says.
  await often.selectOption('week')
  await expect(day.locator('option')).toHaveCount(7)
  await day.selectOption({ label: 'Friday' })
  await time.fill('09:30')
  await time.blur()
  await expect.poll(async () => (await routines(page)).map(({ every, on, at }) => ({ every, on, at }))).toEqual([{ every: 'week', on: 5, at: '09:30' }])
  await expect(knows.locator('.routine-head .lede')).toContainText(/^Every Friday at 9:30\sAM · Next:/)
  // Every hour, at its minutes; then once, on the next day its time comes, which the user changes.
  await often.selectOption('hour')
  await expect(knows.locator('input[type="time"]')).toHaveCount(0)
  await time.selectOption({ label: 'At minute 45' })
  await expect.poll(async () => (await routines(page)).map(({ every, on, at }) => ({ every, on, at }))).toEqual([{ every: 'hour', on: undefined, at: '09:45' }])
  await often.selectOption('once')
  await expect(time).toHaveValue('09:45')
  await expect(day).toHaveValue(/^\d{4}-\d\d-\d\d$/)
  await day.fill('2099-01-15')
  await day.blur()
  await expect.poll(async () => (await routines(page)).map(({ every, on, at }) => ({ every, on, at }))).toEqual([{ every: 'once', on: '2099-01-15', at: '09:45' }])
  // Its own brain (D303): the one the user's messages have, until one the picker offers is picked, kept with its version.
  const brain = knows.getByRole('combobox', { name: 'Brain', exact: true })
  await expect(brain).toHaveValue('')
  await expect(brain.locator('option').first()).toHaveText('Same as your messages')
  await brain.selectOption({ label: 'fake-brain-1' })
  await expect.poll(async () => (await routines(page)).map(({ brain, model }) => ({ brain: brain?.length, model }))).toEqual([{ brain: 26, model: 'fake-brain-1' }])
  await brain.selectOption({ label: 'Auto' })
  await expect.poll(async () => (await routines(page)).map(({ brain, model }) => ({ brain, model }))).toEqual([{ brain: 'auto', model: undefined }])
  await brain.selectOption({ label: 'fake-brain-1' })
  // Kept before the routine is changed behind the page's back below, or each change would write over the other.
  await expect.poll(async () => (await routines(page)).map(({ brain, model }) => ({ brain: brain?.length, model }))).toEqual([{ brain: 26, model: 'fake-brain-1' }])
  // On when made; turned off, it says no next time and doesn't run when it falls due (D430).
  const on = knows.getByRole('switch', { name: 'Weekly sales' })
  await expect(on).toBeChecked()
  await on.uncheck()
  await expect(knows.locator('.routine-head .lede')).not.toContainText('Next:')
  await expect.poll(async () => (await routines(page)).map(({ active }) => active)).toEqual([false])
  await changeRoutine(page, { every: 'day', on: undefined, at: '00:00', model: 'fake-brain-2' })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(2500)
  expect((await routines(page))[0].lastRun).toBeUndefined()
  // Back on, from the list, where it said it was paused: it makes up none of the times it fell due while off, and says when it runs next.
  await openSettings(page, 'Routines')
  await expect(routine.locator('.run-state')).toHaveText('Paused')
  await routine.getByRole('switch', { name: 'Weekly sales' }).check()
  await expect(routine.locator('button.item small')).toContainText('Next:')
  await expect(routine.locator('.run-state')).toHaveCount(0)
  await expect.poll(async () => (await routines(page)).map(({ active, resumed }) => active && Boolean(resumed))).toEqual([true])
  await page.keyboard.press('Escape')
  await page.waitForTimeout(2500)
  expect((await routines(page))[0].lastRun).toBeUndefined()

  // Due since midnight: on the welcome screen, with Jean free, it runs in a conversation of its own, on its own brain's version.
  await changeRoutine(page, { resumed: undefined })
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

  // Run now, from its page: again, in a conversation of its own, the brain told the user asked.
  const current = () => page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.id)
  const before = await current()
  await (await openSettings(page, 'Routines')).locator('.routines button.item').click()
  await knows.getByRole('button', { name: 'Run now' }).click()
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
  // Listed on its page too, the newest first, each with how it began and went, which a run's line opens.
  await page.locator('button.since').click()
  const runs = page.locator('app-settings dialog[open] .routine-runs button')
  await expect(runs).toHaveCount(2)
  await expect(runs.first()).toContainText('Run by you')
  await expect(runs.locator('.run-state')).toHaveText(['Done', 'Done'])
  await runs.first().click()
  await expect(page.locator('app-settings dialog[open]')).toHaveCount(0)
  await expect.poll(current).not.toBe(before)
  await expect(tasks.locator('li.is-current .history-item')).toHaveText('Weekly sales')
})

test('a routine made in Settings, its name, request and time chosen there, opens on its page, and goes from it (D509)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Routines')
  await page.keyboard.press('Escape')
  const knows = await openSettings(page, 'Routines')
  await expect(knows.getByText('No routines yet.', { exact: false })).toBeVisible()
  await knows.getByRole('button', { name: 'New routine' }).click()
  await expect(page).toHaveURL(/\/settings\/routines\/new$/)
  await knows.getByLabel('Name').fill('Friday report')
  await knows.getByLabel('What to do').fill('Write the week’s report')
  await knows.getByLabel('How often').selectOption('week')
  await knows.getByLabel(/^Day/).selectOption({ label: 'Friday' })
  await knows.getByLabel(/^Time/).fill('16:30')
  await knows.getByLabel(/^Time/).blur()
  await knows.getByRole('button', { name: 'Make the routine' }).click()
  await expect(knows.getByRole('heading', { name: 'Friday report' })).toBeFocused()
  await expect(page).toHaveURL(/\/settings\/routines\/[0-9A-Z]{26}$/)
  expect((await routines(page)).map(({ title, request, every, on, at, active }) => ({ title, request, every, on, at, active })))
    .toEqual([{ title: 'Friday report', request: 'Write the week’s report', every: 'week', on: 5, at: '16:30', active: true }])
  // Back on the list, the keyboard on its row; deleted from its page, it is gone.
  await knows.locator('.back').click()
  await expect(knows.locator('.routines button.item')).toBeFocused()
  await knows.locator('.routines button.item').click()
  page.once('dialog', (dialog) => dialog.accept())
  await knows.getByRole('button', { name: 'Delete this routine' }).click()
  await expect(knows.locator('.routines li')).toHaveCount(0)
  await expect.poll(async () => (await routines(page)).length).toBe(0)
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

  // Settings shows what sets it off, in place of a time, and on its page the question a file must pass; nothing to run now.
  const knows = await openSettings(page, 'Routines')
  const routine = knows.locator('.routines li')
  await expect(routine.locator('button.item small')).toHaveText('Each time a file is shared')
  await routine.locator('button.item').click()
  await expect(knows.getByRole('button', { name: 'Run now' })).toHaveCount(0)
  await expect(knows.getByLabel('How often')).toHaveValue('file')
  await expect(knows.locator('input[type="time"]')).toHaveCount(0)
  await knows.getByLabel('Only if the answer is yes to').fill('Is it an invoice?')
  await knows.getByLabel('Only if the answer is yes to').blur()
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
