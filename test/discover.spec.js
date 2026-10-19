// Discovery (0.3): the first idea shares a sample spreadsheet (D366), the house lights up (Settings'
// Capabilities), "turn on everything" works, a capability found turns off and on again (D433), and the
// brain picker offers Auto, the connected brains and "Keep on this device".
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, openSettings, ask, openTasks, turnOn } from './helpers.js'

test('the first idea shares a sample spreadsheet with a request about it, and Files is found (D366)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const first = page.locator('.starter').first()
  await expect(first).toHaveText('Try a spreadsheet')
  await first.click()
  await expect(page.locator('.attachment')).toContainText('sales.csv')
  await expect(page.locator('#prompt')).toHaveValue('Which product grew the most over the year? Show it as a chart.')
  await expect(page.locator('#prompt')).toBeFocused()
  await page.locator('#prompt').press('Enter')
  await expect(page.locator('.msg-files')).toContainText('sales.csv')
  // A spreadsheet to chart: the brain offers the computer in its answer, which goes on once it is turned down.
  await page.locator('.msg-jean').getByRole('button', { name: 'No thanks' }).click()
  await expect(page.locator('.msg-jean .prose').last()).not.toBeEmpty()
  expect(await page.evaluate(async () => (await import('/ui/caps.js')).loaded.value.has('files'))).toBe(true)
})

test('the ideas for a tune and a quiz add Jean’s own skill for each before their request (D400)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.locator('.starter', { hasText: 'Compose a tune' }).click()
  await expect(page.locator('#prompt')).toHaveValue('Compose a short lullaby, as sheet music I can play.')
  await expect(page.locator('#prompt')).toBeFocused()
  await page.locator('.starter', { hasText: 'Make a quiz' }).click()
  await expect(page.locator('#prompt')).toHaveValue('Make a quiz on the planets of the solar system, for a ten-year-old.')
  expect(await page.evaluate(async () => (await (await import('/caps/skills/skills.js')).skills()).map((skill) => skill.name).sort())).toEqual(['music-score', 'quiz'])
})

test('the house lights up as capabilities are turned on', async ({ page }) => {
  await start(page)
  const settings = await openSettings(page, 'Capabilities')
  const house = settings.locator('.house')
  await expect(house).toBeVisible()
  await expect(page.locator('app-settings [aria-current="page"]')).toHaveText('Capabilities')
  // A case of trophies in Settings' own rows (D127, D316): the next one to find is open, and says how.
  const next = settings.locator('.case > li:not(.is-lit)').first()
  await expect(next.locator('button.item')).toHaveAttribute('aria-expanded', 'true')
  await expect(next).toContainText('How to find it')
  const lit = settings.locator('.case > li.is-lit')
  const before = await lit.count()
  await next.locator('.item-body .button').click()
  await expect(lit).toHaveCount(before + 1)
  await expect(house.locator('meter')).toHaveAttribute('value', String(before + 1))
  const warmth = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--warmth'))
  expect(Number(warmth)).toBeGreaterThan(0)
  await settings.getByRole('button', { name: 'Turn on everything' }).click()
  await expect(settings.locator('.case > li:not(.is-lit)')).toHaveCount(0)
  await expect(house.locator('.house-rank')).toHaveText('Ocean')
})

test('a capability found turns off from its row, the page opening afresh without it, and on again (D433)', async ({ page }) => {
  await start(page)
  await turnOn(page, 'Web search')
  const settings = page.locator('app-settings dialog[open]')
  const nav = settings.locator('.settings-nav')
  const row = settings.locator('.case > li').filter({ has: page.locator('.item-text > strong').getByText('Web search', { exact: true }) })
  await expect(nav).toContainText('Web search')
  await expect(row.locator('.case-on')).toHaveText('On')
  // Things Jean made is always there, so nothing turns it off.
  const made = settings.locator('.case > li').filter({ has: page.locator('.item-text > strong').getByText('Documents and spreadsheets', { exact: true }) })
  await made.locator('button.item').click()
  await made.locator('.item-body .button').click()
  await expect(made.locator('.case-on')).toHaveText('On')
  await expect(made.getByRole('button', { name: 'Turn off' })).toHaveCount(0)
  // Playwright's WebKit keeps nothing, as a private window, where opening afresh would lose the visit: nothing turns off there.
  if (await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)) return expect(row.getByRole('button', { name: 'Turn off' })).toHaveCount(0)
  if (await row.locator('button.item').getAttribute('aria-expanded') !== 'true') await row.locator('button.item').click()
  // Said at once, but while an answer is being written, the page waits for it.
  await page.evaluate(async () => { (await import('/ui/state.js')).app.busy.value = true })
  await row.getByRole('button', { name: 'Turn off' }).click()
  await expect(row.locator('.case-on')).toHaveText('Off')
  await page.waitForTimeout(300)
  await expect(nav).toContainText('Web search')
  await page.evaluate(async () => { (await import('/ui/state.js')).app.busy.value = false })
  // Its code can't be unloaded: the page opens afresh where it was, on Settings › Capabilities, without it.
  await expect(nav).not.toContainText('Web search')
  await expect(page.locator('app-settings [aria-current="page"]')).toHaveText('Capabilities')
  await expect(row.locator('.case-on')).toHaveText('Off')
  await expect(row.locator('.item-icon')).toHaveCSS('border-style', 'solid')
  // Found, so never offered nor turned on by what the user does, until its row does it.
  expect(await page.evaluate(async () => {
    const { loaded, unlock } = await import('/ui/caps.js')
    return [loaded.value.has('search'), await unlock('search')]
  })).toEqual([false, false])
  if (await row.locator('button.item').getAttribute('aria-expanded') !== 'true') await row.locator('button.item').click()
  await row.locator('.item-body').getByRole('button', { name: 'Turn on' }).click()
  await expect(row.locator('.case-on')).toHaveText('On')
  await expect(nav).toContainText('Web search')
})

/** Tasks in another project, which offers count too (D281). @param {import('@playwright/test').Page} page @param {number} count */
async function tasksElsewhere(page, count) {
  await page.evaluate(async (count) => {
    const { app, refreshProjects } = await import('/ui/state.js')
    const { createProject } = await import('/core/settings.js')
    const { createConversation, appendRecords } = await import('/core/conversations.js')
    const { userRecords } = await import('/core/events.js')
    const projectDir = await createProject(app.fs, { name: 'Garden', by: 'test' })
    for (let i = 1; i <= count; i++) await appendRecords(app.fs, (await createConversation(app.fs, { projectDir, by: 'test' })).path, userRecords(`Garden note ${i}`, [], 'test'))
    await refreshProjects()
  }, count)
}

test('offers count the tasks of every project, wait their turn when due, and give way to what the user does now', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // Three tasks in another project: Backup and Intuition are about all of them, so they are due.
  await tasksElsewhere(page, 3)
  // Intuition is due, and Backup too outside a private window (WebKit's here): whichever count came first shows first.
  const offer = page.locator('aside.offer')
  const ephemeral = await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)
  let left = ['pick the right brain for each request', ...(ephemeral ? [] : ['Keep a copy of everything'])]
  await expect(offer).toContainText(new RegExp(left.join('|')))
  // A spreadsheet shared now takes its place.
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'Sales.csv', mimeType: 'text/csv', buffer: Buffer.from('month,total\nJan,10\n') })
  await expect(offer).toContainText('Want exact numbers')
  // Then what is due comes back, one after the other, none lost.
  while (left.length) {
    await offer.getByRole('button', { name: 'No thanks' }).click()
    await expect(offer).toContainText(new RegExp(left.join('|')))
    const shown = (await offer.textContent()) ?? ''
    left = left.filter((text) => !shown.includes(text))
  }
})

test('an offer on the first screen keeps above the ideas and the box, never under them, on a phone too', async ({ page }) => {
  await start(page, 'fr')
  await connectFakeBrain(page)
  await tasksElsewhere(page, 2)
  const offer = page.locator('aside.offer')
  await expect(offer).toContainText('Télécharger')
  // The page as it opens, not scrolled: what is at the centre of each of its buttons is that button, at every size.
  const uncovered = () => offer.locator('button').evaluateAll((buttons) => buttons.map((button) => {
    const { x, y, width, height } = button.getBoundingClientRect()
    return button.contains(document.elementFromPoint(x + width / 2, y + height / 2))
  }))
  for (const [width, height] of [[390, 844], [360, 640], [1280, 600], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await expect.poll(uncovered).toEqual([true, true])
    await expect(page.locator('.starter')).toHaveCount(4)
  }
})

// A plain 1×1 PNG.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

test('what brains rarely offer is offered on events with no language: a file from a service, a picture (D286)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const offer = page.locator('aside.offer')
  const input = page.locator('.composer input[type="file"]')
  // An invitation shared: the calendar it came from could be connected.
  await input.setInputFiles({ name: 'Lunch.ics', mimeType: 'text/calendar', buffer: Buffer.from('BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Lunch\nEND:VEVENT\nEND:VCALENDAR\n') })
  await expect(offer).toContainText('one of your services')
  // A picture shared now takes its place: it could be changed.
  await input.setInputFiles({ name: 'Garden.png', mimeType: 'image/png', buffer: PIXEL })
  await expect(offer).toContainText('change a picture you share')
})

test('something said again from an earlier task offers memory, and a task continued on three days a project (D286)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const offer = page.locator('aside.offer')
  await page.evaluate(async () => {
    const { app, refreshConversations } = await import('/ui/state.js')
    const { createConversation, appendRecords } = await import('/core/conversations.js')
    const { userRecords, envelope, metaRecord } = await import('/core/events.js')
    const said = await createConversation(app.fs, { projectDir: app.projectDir, by: 'test' })
    await appendRecords(app.fs, said.path, userRecords("I'm vegetarian and allergic to nuts, so keep that in mind for recipes. What could I cook tonight?", [], 'test'))
    // A task continued yesterday and the day before.
    const day = (/** @type {number} */ ago) => new Date(Date.now() - ago * 86_400_000).toISOString()
    const garden = await createConversation(app.fs, { projectDir: app.projectDir, by: 'test' })
    const answer = envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Noted.' } }, 0)
    await appendRecords(app.fs, garden.path, [metaRecord('test', { title: 'Garden plan' }), ...[2, 1].flatMap((ago) => [...userRecords(`Garden plan, day ${ago}`, [], 'test'), answer].map((record) => ({ ...record, at: day(ago) })))])
    await refreshConversations()
  })
  await ask(page, "As I said, I'm vegetarian and allergic to nuts. Plan a dinner for six.")
  await expect(page.locator('.msg-jean .prose').last()).not.toBeEmpty()
  await expect(offer).toContainText('remember things like this')
  await offer.getByRole('button', { name: 'No thanks' }).click()
  const item = (await openTasks(page)).locator('.history-item', { hasText: 'Garden plan' })
  await item.click()
  await expect(item).toHaveAttribute('aria-current', 'true')
  await ask(page, 'Now the vegetable beds.')
  await expect(offer).toContainText('make this a project')
})

test('the picker: a menu above the chip, Auto by default, a brain by hand, kept on this device', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const chip = page.locator('.brain-chip')
  await expect(chip).toContainText('Auto')
  await chip.click()
  const picker = page.locator('#brain-menu')
  await expect(picker.locator('[aria-current="true"]')).toContainText('Auto')
  const [menu, under] = await Promise.all([picker.boundingBox(), chip.boundingBox()])
  expect((menu?.y ?? 0) + (menu?.height ?? 0)).toBeLessThanOrEqual(under?.y ?? 0)
  // Keeping on this device is offered once a brain is in the cloud.
  await expect(picker.getByRole('switch')).toHaveCount(0)
  await picker.getByRole('button', { name: /fake-brain-1/ }).click()
  await expect(picker).toBeHidden()
  await expect(chip).toContainText('fake-brain-1')
  await page.evaluate(() => import('/ui/brains.js').then(({ addBrain }) => addBrain({ id: 'cloud', provider: 'openai', api: 'openai', baseURL: 'https://api.openai.invalid/v1', model: 'gpt-6-sol' })))
  await expect(chip).toContainText('gpt-6-sol')
  await chip.click()
  await expect(picker.getByRole('button', { name: /gpt-6-sol/ })).toBeVisible()
  // Kept on this device, the cloud's brains aren't offered, and the one picked by hand gives way to Auto.
  await picker.getByRole('switch', { name: 'Keep on this device' }).click()
  await expect(picker.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  await expect(picker.getByRole('button', { name: /gpt-6-sol/ })).toHaveCount(0)
  await expect(picker.getByRole('button', { name: /fake-brain-1/ })).toBeVisible()
  await expect(picker.locator('[aria-current="true"]')).toContainText('Auto')
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  const settings = await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value)
  expect(settings.auto).toBe(true)
  expect(settings.cloud).toBe(false)
  // A project kept on this device holds the switch on, and says why.
  await page.evaluate(() => import('/ui/state.js').then(({ app, updateSettings }) => {
    app.project.value = { ...app.project.value, data: { ...app.project.value.data, cloud: false } }
    return updateSettings({ cloud: true })
  }))
  await chip.click()
  const kept = picker.getByRole('switch', { name: 'Keep on this device' })
  await expect(kept).toHaveAttribute('aria-checked', 'true')
  await expect(kept).toBeDisabled()
  await expect(kept).toHaveAttribute('title', 'This project is kept on this device')
  await expect(picker.getByRole('button', { name: /gpt-6-sol/ })).toHaveCount(0)
  // Settings › Brains (D331): each brain says where it runs and its version, the rest under its button, the switch
  // at the group's foot, and the ways to add one only once asked for, the keyboard on the first.
  await page.keyboard.press('Escape')
  const brains = await openSettings(page, 'Brains')
  const cloud = brains.locator('.brains > div', { hasText: 'OpenAI' })
  await expect(cloud.locator('.item small')).toHaveText('In the cloud · gpt-6-sol')
  await expect(brains.getByLabel('Brain version')).toHaveCount(0)
  await cloud.getByRole('button', { name: 'More options' }).click()
  await expect(cloud.getByLabel('Brain version')).toHaveValue('gpt-6-sol')
  await expect(cloud.getByRole('button', { name: 'Remove' })).toBeVisible()
  await expect(brains.getByRole('switch', { name: 'Keep on this device' })).toBeDisabled()
  await expect(brains.locator('.way')).toHaveCount(0)
  await brains.getByRole('button', { name: 'Add a brain' }).click()
  await expect(brains.locator('.way summary').first()).toBeFocused()
  await expect(brains.getByRole('button', { name: 'Add a brain' })).toHaveCount(0)
})
