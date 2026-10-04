// Learn and repeat (0.7): skills from elsewhere, read from a discovery index on the device and
// added only by the user, after reading their steps (D121); routines, requests Jean sends itself
// on a schedule, while open or caught up at the next visit (D122).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings, MAIL_URL } from './helpers.js'


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
  const elsewhere = knows.locator('details.sources')
  await elsewhere.locator('summary').click()
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
  const found = page.locator('.follow-up', { hasText: 'See a ready-made skill for this' })
  await expect(found).toBeVisible()
  await expect(page.locator('.follow-up', { hasText: 'Save this as a skill' })).toHaveCount(0)
  await found.click()
  const ready = page.locator('app-skill-ready dialog[open]')
  await expect(ready).toContainText('weekly-sales-report')
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
  await expect(routine.locator('summary')).toContainText('Weekly sales')
  await expect(routine.locator('summary small')).toContainText('Next:')
  await routine.locator('summary').click()
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
  await page.keyboard.press('Escape')

  // Due since midnight: on the welcome screen, with Jean free, it runs in a conversation of its own.
  await changeRoutine(page, { every: 'day', on: undefined, at: '00:00' })
  await page.locator('.wordmark').click()
  await expect(page.locator('.since')).toHaveText('Routines · Weekly sales')
  await expect(page.locator('.msg-user')).toHaveText('Summarize the weekly sales by region')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const note = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.update?.sessionUpdate === '_system_note')?.update)
  expect(note.text).toMatch(/^The next message is the user's routine "Weekly sales", which you send yourself every day at 00:00; it fell due on \d{4}-\d\d-\d\d 00:00 \(\w+day\), local time\./)
  expect((await routines(page))[0].lastRun).toBeTruthy()
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
