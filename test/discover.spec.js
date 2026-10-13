// Discovery (0.3): the first starter asks what Jean can do, the house lights up (Settings'
// Capabilities), "turn on everything" works, and the brain picker offers Auto, the connected brains
// and "Keep on this device".
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, openSettings, ask, openTasks } from './helpers.js'

test('the first starter asks what Jean can do, in a few plain words', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const first = page.locator('.starter').first()
  await expect(first).toHaveText('What can you do?')
  await first.click()
  await expect(page.locator('#prompt')).toHaveValue('What can you do for me? Give me 3 examples I can try.')
  await expect(page.locator('#prompt')).toBeFocused()
  await page.locator('#prompt').press('Enter')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('What can you do for me?')
})

test('the house lights up as capabilities are turned on', async ({ page }) => {
  await start(page)
  const house = (await openSettings(page, 'Capabilities')).locator('.house')
  await expect(house).toBeVisible()
  await expect(page.locator('app-settings [aria-current="page"]')).toHaveText('Capabilities')
  // A case of trophies (D127): the plaque shows the next one to find, and how.
  await expect(house.locator('.trophy:not(.is-lit)').first()).toHaveAttribute('aria-pressed', 'true')
  await expect(house.locator('.plaque-how')).toContainText('How to find it')
  const lit = house.locator('.trophy.is-lit')
  const before = await lit.count()
  await house.locator('.plaque .button').click()
  await expect(lit).toHaveCount(before + 1)
  await expect(house.locator('.house-ring .is-lit')).toHaveCount(before + 1)
  const warmth = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--warmth'))
  expect(Number(warmth)).toBeGreaterThan(0)
  await house.locator(':scope > .button.wide').click()
  await expect(house.locator('.trophy:not(.is-lit)')).toHaveCount(0)
  await expect(house.locator('.house-rank')).toHaveText('Daylight')
})

test('offers count the tasks of every project, wait their turn when due, and give way to what the user does now', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // Three tasks in another project: Backup and Intuition are about all of them, so they are due.
  await page.evaluate(async () => {
    const { app, refreshProjects } = await import('/ui/state.js')
    const { createProject } = await import('/core/settings.js')
    const { createConversation, appendRecords } = await import('/core/conversations.js')
    const { userRecords } = await import('/core/events.js')
    const projectDir = await createProject(app.fs, { name: 'Garden', by: 'test' })
    for (let i = 1; i <= 3; i++) await appendRecords(app.fs, (await createConversation(app.fs, { projectDir, by: 'test' })).path, userRecords(`Garden note ${i}`, [], 'test'))
    await refreshProjects()
  })
  // Intuition is due, and Backup too outside a private window (WebKit's here): whichever count came first shows first.
  const offer = page.locator('aside.offer')
  const ephemeral = await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)
  let left = ['get a feel for what you need', ...(ephemeral ? [] : ['Keep a copy of everything'])]
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
})
