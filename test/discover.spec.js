// Discovery (0.3): the first idea shares a sample spreadsheet (D366), What Jean can do in Settings groups the
// capabilities, a page each, "turn on everything" says what still waits (D540), a capability found turns off and on
// again (D433), what the organisation turned on stays on, and the brain picker offers Auto, the connected brains and
// "Keep on this device".
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, openSettings, ask, openTasks, turnOn, withPolicy } from './helpers.js'

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

test('What Jean can do groups the capabilities by what each is for, a page each, and says what still waits (D540)', async ({ page }) => {
  await start(page)
  const settings = await openSettings(page, 'What Jean can do')
  await expect(page.locator('app-settings [aria-current="page"]')).toHaveText('What Jean can do')
  await expect(settings.locator('.data-head h2')).toHaveText('What Jean can do')
  const lede = settings.locator('.data-head + .lede')
  await expect(lede).toContainText(/^\d+ of \d+ discovered\. The rest come when a moment calls for them, and each says how\.$/)
  await expect(settings.locator('.case-group > h3')).toContainText(['Files and documents', 'Remembering and finding', 'Doing it again', 'The web and your services', 'Brains and bigger tasks', 'Voice and notifications', 'Keeping and sharing'])
  // Still to find, a row says how it comes; found, what it does.
  const row = (/** @type {string} */ name) => settings.locator('.case > li').filter({ has: page.locator('.item-text > strong').getByText(name, { exact: true }) })
  await expect(row('Collections')).toHaveClass('is-todo')
  await expect(row('Collections')).toContainText('Ask to keep track of something')
  await expect(row('Documents and spreadsheets')).toContainText('Send your first message.')
  const found = Number((await lede.textContent())?.match(/^\d+/)?.[0])
  await expect(settings.locator('.case-bar meter')).toHaveAttribute('value', String(found))
  // Its page: what it does, how it comes, Turn on; then back on the list, on its row, lit.
  await row('Collections').locator('button.item').click()
  await expect(settings.locator('.case-head .lede')).toHaveText('Not found yet · Files and documents')
  await expect(settings.locator('.settings-panel > section > h3')).toHaveText('How to find it')
  await settings.locator('.settings-panel > .row').getByRole('button', { name: 'Turn on' }).click()
  await expect(settings.locator('.case-head .lede')).toHaveText('On · Files and documents')
  await expect(settings.locator('.settings-panel > section > h3')).toHaveText('How it came')
  await settings.locator('.settings-panel > .back').click()
  await expect(row('Collections')).toHaveClass('is-on')
  await expect(row('Collections')).toContainText('Collections beside the conversation')
  await expect(row('Collections').locator('button.item')).toBeFocused()
  await expect(lede).toContainText(`${found + 1} of`)
  const warmth = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--warmth'))
  expect(Number(warmth)).toBeGreaterThan(0)
  // Turned on all at once, what still waits for the user says so, rather than On: a download, a lock to set.
  await settings.getByRole('button', { name: 'Turn on everything' }).click()
  await expect(settings.locator('.case > li.is-todo')).toHaveCount(0)
  await expect(row('Intuition').locator('.data-state')).toHaveText('345 MB to download')
  await expect(row('Lock').locator('.data-state')).toHaveText('Not set up')
  await expect(lede).toContainText(/^(\d+) of \1 discovered\. \d+ wait for something from you, marked below\.$/)
  await expect(settings.getByRole('button', { name: 'Turn on everything' })).toHaveCount(0)
  // Its page offers the download, its size said.
  await row('Intuition').locator('button.item').click()
  await expect(settings.locator('.case-wait')).toContainText('345 MB to download')
  await expect(settings.locator('.case-wait').getByRole('button', { name: 'Download (345 MB)' })).toBeVisible()
})

test('a capability found turns off from its page, asked first, still found, the page opening afresh without it, and on again (D433, D540)', async ({ page }) => {
  await start(page)
  await turnOn(page, 'Web search')
  const settings = page.locator('app-settings dialog[open]')
  const nav = settings.locator('.settings-nav')
  const lede = settings.locator('.case-head .lede')
  await expect(nav).toContainText('Web search')
  await expect(lede).toHaveText('On · The web and your services')
  await expect(settings.locator('.case-head').getByRole('button', { name: 'Open' })).toBeVisible()
  // Things Jean made is always there, so nothing turns it off.
  await settings.locator('.settings-panel > .back').click()
  const row = (/** @type {string} */ name) => settings.locator('.case > li').filter({ has: page.locator('.item-text > strong').getByText(name, { exact: true }) })
  const found = (await settings.locator('.data-head + .lede').textContent())?.match(/^\d+ of \d+/)?.[0] ?? ''
  await row('Documents and spreadsheets').locator('button.item').click()
  await expect(settings.getByRole('button', { name: 'Turn off' })).toHaveCount(0)
  await settings.locator('.settings-panel > .back').click()
  await row('Web search').locator('button.item').click()
  // Playwright's WebKit keeps nothing, as a private window, where opening afresh would lose the visit: nothing turns off there.
  if (await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)) return expect(settings.getByRole('button', { name: 'Turn off' })).toHaveCount(0)
  await settings.getByRole('button', { name: 'Turn off' }).click()
  await expect(settings.locator('.case-wait')).toHaveText(/Turn off Web search\? Jean opens again where you were, and what it made is kept\./)
  await settings.locator('.case-wait').getByRole('button', { name: 'Cancel' }).click()
  await expect(settings.locator('.case-wait')).toHaveCount(0)
  // Said at once, but while an answer is being written, the page waits for it.
  await page.evaluate(async () => { (await import('/ui/state.js')).app.busy.value = true })
  await settings.getByRole('button', { name: 'Turn off' }).click()
  await settings.locator('.case-wait').getByRole('button', { name: 'Turn off' }).click()
  await expect(lede).toHaveText('Off · The web and your services')
  await page.waitForTimeout(300)
  await expect(nav).toContainText('Web search')
  await page.evaluate(async () => { (await import('/ui/state.js')).app.busy.value = false })
  // Its code can't be unloaded: the page opens afresh where it was, on its page, without it.
  await expect(nav).not.toContainText('Web search')
  await expect(page.locator('app-settings [aria-current="page"]')).toHaveText('What Jean can do')
  await expect(lede).toHaveText('Off · The web and your services')
  // Found, so never offered nor turned on by what the user does, until its page does it; and still counted as found.
  expect(await page.evaluate(async () => {
    const { loaded, unlock } = await import('/ui/caps.js')
    return [loaded.value.has('search'), await unlock('search')]
  })).toEqual([false, false])
  await settings.locator('.settings-panel > .back').click()
  await expect(settings.locator('.data-head + .lede')).toContainText(found)
  await expect(row('Web search')).toHaveClass('is-off')
  await expect(row('Web search').locator('.data-state')).toHaveText('Off')
  await row('Web search').locator('button.item').click()
  await settings.locator('.settings-panel > .row').getByRole('button', { name: 'Turn on' }).click()
  await expect(lede).toHaveText('On · The web and your services')
  await expect(nav).toContainText('Web search')
})

test('what the organisation turned on says so, and only the organisation turns it off (D540)', async ({ page }) => {
  await withPolicy(page, { capabilities: { preUnlock: ['search'] } })
  await start(page)
  await expect.poll(() => page.evaluate(async () => (await import('/ui/caps.js')).loaded.value.has('search'))).toBe(true)
  const settings = await openSettings(page, 'What Jean can do')
  const row = settings.locator('.case > li').filter({ has: page.locator('.item-text > strong').getByText('Web search', { exact: true }) })
  await expect(row.locator('.data-state')).toHaveText('Set by your organization')
  await row.locator('button.item').click()
  await expect(settings.locator('.case-head .lede')).toHaveText('On · The web and your services')
  await expect(settings.locator('.settings-panel > .hint')).toHaveText('Set by your organization')
  await expect(settings.getByRole('button', { name: 'Turn off' })).toHaveCount(0)
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
  // Settings › Brains (D514): who answers, Keep on this device one of its ways, held in a project kept there; a brain that
  // can't be reached says so atop and on its row, which opens its page, its version there; the ways to add one, each a page.
  await page.keyboard.press('Escape')
  const brains = await openSettings(page, 'Brains')
  await expect(brains.getByRole('radio', { name: /^Keep on this device This project is kept on this device/ })).toBeChecked()
  await expect(brains.getByRole('radio', { name: /^Auto/ })).toBeDisabled()
  await expect(brains.locator('.brain-wait')).toContainText('Couldn’t reach OpenAI.')
  const cloud = brains.locator('.brain-rows button', { hasText: 'OpenAI' })
  await expect(cloud.locator('small')).toHaveText('In the cloud')
  await expect(cloud.locator('.brain-trouble')).toHaveText('Needs you')
  await cloud.click()
  await expect(page).toHaveURL(/#\/settings\/brains\/cloud$/)
  await expect(brains.getByRole('heading', { name: 'OpenAI' })).toBeFocused()
  await expect(brains.locator('.model-input')).toHaveValue('gpt-6-sol')
  await expect(brains.getByRole('button', { name: 'Remove' })).toBeVisible()
  await brains.locator('.back').click()
  await expect(cloud).toBeFocused()
  await brains.getByRole('button', { name: 'Add a brain' }).click()
  await expect(brains.getByRole('heading', { name: 'Add a brain' })).toBeFocused()
  await brains.locator('[data-brain="key"]').click()
  await expect(brains.getByLabel('Key', { exact: true })).toBeVisible()
  await brains.locator('.back').click()
  await expect(brains.locator('[data-brain="key"]')).toBeFocused()
})
