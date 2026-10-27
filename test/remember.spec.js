// Memory, projects and skills (0.4), the version's done-when: two projects keep separate
// memories, and a skill is created from repeated requests. Plus "What Jean knows about you".
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings, closeSettings } from './helpers.js'

/** Makes a project in a light other than Jean's own (the first swatch), and says which.
 * @param {import('@playwright/test').Page} page @param {string} name */
async function createProject(page, name) {
  const dialog = page.locator('app-project-dialog dialog[open]')
  await expect(dialog).toBeVisible()
  await dialog.locator('input[name="name"]').fill(name)
  const swatch = dialog.locator('.swatch').nth(4)
  await swatch.click()
  const light = await swatch.locator('input').inputValue()
  await dialog.locator('.button.primary').click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('app-projects .wordmark')).toHaveText(name)
  return light
}

/** Settings' About you, once it has read what Jean knows (D134, D521). @param {import('@playwright/test').Page} page */
async function openKnows(page) {
  const knows = await openSettings(page, 'About you')
  await expect(knows.locator('.you-head h2')).toHaveText('About you')
  return knows
}

test('two projects keep separate memories, each in its own light', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Memory')
  await page.keyboard.press('Escape')
  await turnOn(page, 'Projects')
  const light = await createProject(page, 'Bakery')
  await expect(page).toHaveURL(/#\/p\/[0-9A-Z]{26}\/$/)
  const tint = await page.evaluate(() => document.documentElement.style.getPropertyValue('--tint'))
  expect(tint).toBe(light)

  await ask(page, 'Remember: the bakery opens at 7')
  await expect(page.locator('.toast')).toContainText('Remembered: the bakery opens at 7')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Noted.')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()

  // Another project knows nothing of it.
  await page.locator('app-projects .wordmark').click()
  await page.locator('#project-menu button', { hasText: 'New project' }).click()
  await createProject(page, 'Garden')
  await ask(page, 'What do you know?')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Nothing yet.')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  // Its section, not the toast that may still say what the bakery's remembered.
  const garden = await openKnows(page)
  await expect(garden.locator('.settings-panel')).not.toContainText('opens at 7')
  await closeSettings(page)
  const left = page.url()

  // Back in the bakery, it is there, on the page and in the brain's context. Walked into in one
  // step: Back returns to the garden's task, Forward to the bakery.
  await page.locator('app-projects .wordmark').click()
  await page.locator('#project-menu .project', { hasText: 'Bakery' }).click()
  await expect(page.locator('app-projects .wordmark')).toHaveText('Bakery')
  await page.goBack()
  await expect(page).toHaveURL(left)
  // Shown before going on: until Back is followed the name above is the bakery's still, and a key
  // pressed may come before Forward is.
  await expect(page.locator('app-projects .wordmark')).toHaveText('Garden')
  await page.goForward()
  await expect(page.locator('app-projects .wordmark')).toHaveText('Bakery')
  await ask(page, 'What do you know?')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('the bakery opens at 7')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  const bakery = await openKnows(page)
  // The bakery's line is its project's, on the page its row opens (D521).
  await bakery.locator('.you-rows button', { hasText: 'Bakery' }).click()
  await expect(bakery.locator('.you-head h2')).toHaveText('Bakery')
  await expect(bakery.locator('.noticed')).toContainText('the bakery opens at 7')
  await bakery.locator('.back').click()

  // An instruction, written by the user and saved, goes into the next conversation's prompt.
  await bakery.getByRole('button', { name: 'Edit' }).click()
  // The box takes the keyboard, its caret at the end, a frame later: filled before, WebKit would add to what it held.
  await expect(bakery.locator('.you-write textarea')).toBeFocused()
  await bakery.locator('.you-write textarea').fill('Answer in short sentences.')
  await bakery.getByRole('button', { name: 'Save' }).click()
  await expect(bakery.locator('.you-text')).toHaveText('Answer in short sentences.')
  await page.keyboard.press('Escape')
  await page.locator('app-projects .wordmark').click()
  await page.locator('#project-menu button', { hasText: 'New task' }).click()
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const system = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system)
  expect(system).toContain('<project>\nBakery\n</project>')
  expect(system).toContain('<instructions>\nAnswer in short sentences.\n</instructions>')
  expect(system).toContain('<memory>\n- the bakery opens at 7\n</memory>')
})

test('About you reads the instructions as text, changed with Save or Cancel, and the newest lines first, each with its menu, all of them on a page that says which a task no longer reads (D521)', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const day = (/** @type {number} */ n) => new Date(Date.now() - n * 86_400_000).toISOString()
    const old = Array.from({ length: 120 }, (_, i) => `- An old note, number ${i + 1}, long enough to take its room in what a task reads <!-- at=${day(400 - i)} by=jean -->\n`).join('')
    await app.fs.write('memory.md', `---\nformat: 1\nkind: memory\n---\n${old}- Uses Excel <!-- at=${day(3)} by=jean -->\n- Prefers tea <!-- at=${day(1)} by=jean -->\n`)
    await (await import('/ui/caps.js')).unlock('memory')
  })
  const knows = await openKnows(page)
  const panel = knows.locator('.settings-panel')
  // The oldest no longer fit what a task reads, which the line under the title says before anything else.
  await expect(panel.locator('.you-head + .lede')).toHaveText(/^The \d+ oldest lines are no longer read\. To keep one read, make it an instruction\.$/)
  // The newest three, then a row to all of them.
  await expect(panel.locator('.noticed li .item-text > span')).toHaveText(['Prefers tea', 'Uses Excel', /^An old note, number 120,/])

  // Nothing written yet: a starter opens the box with its words, and Cancel leaves it as it was.
  await expect(panel.locator('.you-text')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Your languages' }).click()
  await expect(panel.locator('.you-write textarea')).toHaveValue('Answer in ')
  await expect(panel.locator('.you-write textarea')).toBeFocused()
  await page.keyboard.type('French.')
  await panel.getByRole('button', { name: 'Cancel' }).click()
  await expect(panel.locator('.you-write')).toHaveCount(0)
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.fs.read('instructions.md'))).toBeNull()
  await panel.getByRole('button', { name: 'Edit' }).click()
  await expect(panel.locator('.you-write textarea')).toBeFocused()
  await panel.locator('.you-write textarea').fill('Keep it short.')
  await panel.getByRole('button', { name: 'Save' }).click()
  await expect(panel.locator('.you-text')).toHaveText('Keep it short.')

  // A line's menu: made an instruction, it goes from the list to the instructions.
  const more = (/** @type {string} */ text) => panel.locator('.noticed li', { hasText: text }).getByRole('button', { name: 'More for this line' })
  await more('Uses Excel').click()
  await panel.getByRole('button', { name: 'Make it an instruction' }).click()
  await expect(panel.locator('.you-text')).toHaveText(/^Keep it short\.\s+Uses Excel$/)
  await expect(panel.locator('.noticed')).not.toContainText('Uses Excel')
  // Edited in place: Escape takes it back, the dialog still open; Enter keeps it.
  await more('Prefers tea').click()
  await panel.getByRole('button', { name: 'Edit' }).last().click()
  await expect(panel.locator('.you-edit')).toBeFocused()
  await page.keyboard.type(' and coffee')
  await page.keyboard.press('Escape')
  await expect(knows).toBeVisible()
  await expect(panel.locator('.noticed li .item-text > span').first()).toHaveText('Prefers tea')
  await more('Prefers tea').click()
  await panel.getByRole('button', { name: 'Edit' }).last().click()
  // As the box: the line's field takes the keyboard a frame later, its caret at the end.
  await expect(panel.locator('.you-edit')).toBeFocused()
  await panel.locator('.you-edit').fill('Prefers green tea')
  await panel.locator('.you-edit').press('Enter')
  await expect(panel.locator('.noticed li .item-text > span').first()).toHaveText('Prefers green tea')
  await more('Prefers green tea').click()
  await panel.getByRole('button', { name: 'Delete' }).click()
  await expect(panel.locator('.noticed')).not.toContainText('green tea')

  // All of them on their page, those a task no longer reads under a line of their own, searched, then back on their row.
  await panel.locator('.you-rows, .noticed').getByRole('button', { name: /^See all 120 lines$/ }).click()
  await expect(panel.locator('.you-head h2')).toBeFocused()
  await expect(panel.locator('.you-wait')).toContainText('oldest lines are no longer read')
  await expect(panel.locator('.you-cut')).toHaveText('No longer read')
  await expect(panel.locator('.you-cut + li')).toHaveClass('is-old')
  await panel.getByRole('searchbox', { name: 'Search what Jean noticed' }).fill('number 7')
  await expect(panel.locator('.noticed li:not(.you-cut)')).toHaveCount(11)
  await panel.locator('.back').click()
  await expect(panel.locator('[data-row="noticed"]')).toBeFocused()
})

test('the projects’ assistants meet, each speaking for its project from what it knows (D224)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Memory')
  await page.keyboard.press('Escape')
  await turnOn(page, 'Projects')
  for (const [name, fact] of [['Bakery', 'flour runs out on Friday'], ['Garden', 'the roses need pruning']]) {
    if (name !== 'Bakery') {
      await page.locator('app-projects .wordmark').click()
      await page.locator('#project-menu button', { hasText: 'New project' }).click()
    }
    await createProject(page, name)
    await ask(page, `Remember: ${fact}`)
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Noted.')
    await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  }

  // Held from home: both projects are asked for, and their memories are theirs, so the user allows it first.
  await page.locator('app-projects .wordmark').click()
  await page.locator('#project-menu .project', { hasText: 'Jean' }).click()
  await expect(page.locator('app-projects .wordmark')).toHaveText('Jean')
  await ask(page, 'Hold a meeting about Saturday')
  const card = page.locator('.inbox .approval')
  await expect(card).toContainText('A meeting with Bakery and Garden')
  await card.getByRole('button', { name: 'Always allow' }).click()
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Bakery: For us: flour runs out on Friday.')
  await expect(answer).toContainText('Garden: For us: the roses need pruning.')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  // Each speaker under the meeting, twice, in the order they finish: the second time, having heard the other.
  await page.locator('.activity > summary').last().click()
  await expect(page.locator('.activity-list li[data-depth="0"]')).toContainText(['A meeting with Bakery and Garden'])
  const spoke = page.locator('.activity-list li[data-depth="1"]')
  await expect(spoke.filter({ hasText: 'title: Bakery' })).toHaveCount(2)
  await expect(spoke.filter({ hasText: 'title: Garden' })).toHaveCount(2)
  await expect(spoke.filter({ hasText: 'Round 1:' })).toHaveCount(2)
  // Always allowed for those projects, and for nothing else: the next meeting doesn't ask.
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.rules.think)).toBeUndefined()
  await ask(page, 'Another meeting, please')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('The meeting is over')
  await expect(page.locator('.inbox .approval')).toHaveCount(0)
})

test('a brain kept to one project answers there, and isn’t offered in the others (D194)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Projects')
  await createProject(page, 'Bakery')
  const brain = await openSettings(page, 'Brains')
  // Its version, where it is used and Remove are on its page (D514).
  await brain.locator('.brain-rows button').first().click()
  const where = brain.getByRole('group', { name: 'Used in' })
  await expect(where.getByLabel('Every project')).toBeChecked()
  await where.getByLabel('Every project').uncheck()
  // Kept to the project the user is in, which can't be unticked while it is the only one.
  await expect(where.getByLabel('Bakery')).toBeChecked()
  await expect(where.getByLabel('Bakery')).toBeDisabled()
  await expect(brain.locator('.brain-head .lede')).toHaveText('On your computer · Bakery')
  await page.keyboard.press('Escape')
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()

  // At home there is no brain to answer: the chip asks for one, and the bakery's can't be chosen.
  await page.locator('app-projects .wordmark').click()
  await page.locator('#project-menu .project', { hasText: 'Jean' }).click()
  await expect(page.locator('.brain-chip')).toContainText('Choose a brain')
  await page.locator('.brain-chip').click()
  const brains = page.locator('app-settings dialog[open]')
  await expect(brains.locator('.brain-rows small')).toHaveText('On your computer · Bakery')
  await expect(brains.locator('.brain-same')).toHaveCount(0)
})

test('the third request of a kind becomes a skill', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  for (let i = 0; i < 3; i++) {
    await page.locator('.wordmark').click()
    await ask(page, i === 1 ? 'Please summarize the weekly sales by region' : 'Summarize the weekly sales by region')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
    await expect(page.locator('.follow-ups')).toBeVisible()
  }
  // Offered above the box; accepting turns skills on and asks for this one.
  const offer = page.locator('aside.offer')
  await expect(offer).toContainText('third time')
  await expect(offer.locator('.button.primary')).toHaveText('Save it as a skill')
  await offer.locator('.button.primary').click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('it is a skill now')
  await expect(page.locator('.toast')).toContainText('Saved the skill “Weekly sales summary”')

  const skills = await openSettings(page, 'Skills')
  // Beside Visual answers, the room's from its first message (D644).
  await expect(skills.locator('.skills [data-skill]')).toHaveText([/Visual answers/, /Weekly sales summary/])
  await page.keyboard.press('Escape')

  // The next conversation lists it, and a fourth request of the kind suggests nothing new.
  await page.locator('.wordmark').click()
  await ask(page, 'Summarize the weekly sales by region')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  const system = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system)
  expect(system).toContain('<skills>\n- weekly-sales-summary: When the user asks for a summary of the weekly sales by region.\n- plain-words: ')
  await expect(page.locator('.follow-up', { hasText: 'Save this as a skill' })).toHaveCount(0)
})

test('asked for a skill, Jean asks what it needs, saves it, and its example tries it at once (D322)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // Not found yet: the brain offers Skills, saying what they do rather than "the third time".
  await ask(page, 'Make me a skill for my team update')
  const card = page.locator('.msg-jean .approval')
  await expect(card).toContainText('Keep how you want this done as a skill')
  await card.getByRole('button', { name: 'Turn it on' }).click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('What will you give me')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()

  await ask(page, 'From my notes, in three short bullet points')
  await expect(page.locator('.toast')).toContainText('Saved the skill “Team update”')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('it is a skill now')
  // Its steps as written, without the markup of a call its brain ended badly.
  const saved = await page.evaluate(async () => (await import('/ui/state.js')).app.fs.read('skills/team-update/SKILL.md'))
  expect(saved).toMatch(/2\. Write three short bullet points\.\n$/)
  // The answer's first suggestion is the example, by the skill's name, as the result asked.
  const example = page.locator('.follow-up').first()
  await expect(example).toHaveText('/team-update Write my team update: we shipped the new menu and hired Sam.')

  // Sent, it comes with the room's skills as they are now and the skill's steps.
  await example.click()
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(3)
  await expect(page.locator('.msg-user').last()).toContainText('Write my team update: we shipped the new menu and hired Sam.')
  const notes = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.flatMap((record) => (record.update?.sessionUpdate === '_system_note' ? [record.update.text] : [])).join('\n'))
  expect(notes).toContain('- team-update: When the user wants their weekly team update written from their notes.')
  expect(notes).toContain('2. Write three short bullet points.')
})
