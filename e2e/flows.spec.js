// Flows (D218): a task's steps drawn on a canvas beside the conversation, which the user moves,
// wires and changes, runs again in a task of its own (no brain between the steps) and schedules as a
// routine; and any task drawn the same way, each step with what it is doing or became (D216), a card
// leading to its line in the conversation. In Japanese, its words are Japanese; right to left, it mirrors.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, closeSettings } from './helpers.js'

/** Where a card sits, as the canvas keeps it. @param {import('@playwright/test').Locator} card */
const at = (card) => card.evaluate((element) => [/** @type {HTMLElement} */ (element).style.getPropertyValue('--x'), /** @type {HTMLElement} */ (element).style.getPropertyValue('--y')])

test('Jean draws a flow; the user moves it, runs it in a task of its own, sees that task as a flow, and schedules it', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Flows')
  await closeSettings(page)
  // Turned on, the pane shows the task on screen, empty yet.
  const pane = page.locator('app-flows .flows')
  await expect(pane).toBeVisible()
  await expect(pane.locator('.flows-empty')).toHaveText('Nothing done in this task yet.')

  // Jean draws one: three steps, two wires, beside the conversation.
  await ask(page, 'Make a flow that totals the invoices per client')
  const cards = pane.locator('.flow-step')
  await expect(cards).toHaveCount(3)
  await expect(pane.locator('.flows-wires path')).toHaveCount(2)
  await expect(pane.locator('.flows-name')).toHaveValue('Weekly invoices')
  await expect(page.locator('.msg-jean').last()).toContainText('The flow is beside the conversation')
  await expect(cards.nth(1)).toHaveAttribute('aria-label', 'Ask · Totals · takes Invoices')

  // A card moves with the pointer, then with the arrow keys; a click opens its form.
  const first = cards.first()
  const box = /** @type {{ x: number, y: number }} */ (await first.boundingBox())
  await page.mouse.move(box.x + 60, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 140, box.y + 60, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => at(first)).toEqual(['80px', '40px'])
  await first.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => at(first)).toEqual(['88px', '40px'])
  await cards.nth(1).click()
  const form = pane.locator('.flows-form')
  await expect(form.getByLabel('Instructions')).toHaveValue('Total per client: {{Invoices}}')
  await expect(form.getByRole('checkbox', { name: 'Invoices' })).toBeChecked()
  // A wire that would go round in a circle can't be made.
  await expect(form.getByRole('checkbox', { name: 'Save' })).toBeDisabled()

  // Run: a task of its own, named after the flow; each step a line under the run, the file it made a card.
  await pane.getByRole('button', { name: 'Run', exact: true }).click()
  const answer = page.locator('.msg-jean').last()
  await expect(answer.locator('app-file')).toHaveAttribute('name', 'Totals.md')
  await expect(page.locator('.msg-user').last()).toHaveText('Weekly invoices')
  await expect(cards).toHaveCount(3)
  for (const card of await cards.all()) await expect(card).toHaveAttribute('data-state', 'done')
  await answer.locator('.activity > summary').click()
  await expect(answer.locator('.activity-list li[data-depth="1"]')).toHaveText(['Invoices', 'Totals', 'Save'].map((name) => new RegExp(name)))

  // The task as a flow: its request, the run, and the flow's steps as the flow lays them out, each done.
  await pane.locator('.flows-pick').selectOption('task')
  await expect(pane.locator('.flow-step[data-kind="request"]')).toHaveCount(1)
  await expect(pane.locator('.flow-step[data-kind="ask"]')).toHaveAttribute('data-state', 'done')
  await answer.locator('.activity > summary').click()
  await expect(answer.locator('.activity')).not.toHaveAttribute('open', '')
  // A card leads to its line in the conversation.
  await pane.locator('.flow-step[data-kind="ask"]').click()
  await expect(answer.locator('.activity')).toHaveAttribute('open', '')
  await expect(answer.locator('.activity-list li[data-depth="1"]').nth(1).locator('details.step')).toHaveAttribute('open', '')

  // Scheduled: a routine that runs it, set in Settings › Routines; the pane says when it runs next.
  await pane.locator('.flows-pick').selectOption({ label: 'Weekly invoices' })
  await pane.getByRole('button', { name: 'Schedule' }).click()
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings.locator('.routines li').first()).toContainText('Weekly invoices')
  await expect(settings.locator('.routines li .link-button')).toHaveText('Weekly invoices')
  await closeSettings(page)
  await expect(pane.getByRole('button', { name: /^Next:/ })).toBeVisible()
})

for (const lang of ['ar', 'ja']) {
  test(`the canvas speaks the user's language, and mirrors right to left (${lang})`, async ({ page }) => {
    await start(page, lang)
    await page.evaluate(async () => {
      const { unlock } = await import('/ui/caps.js')
      await unlock('flows')
      const flows = await import('/caps/flows/flows.js')
      const made = flows.newFlow('Factures', 'dev')
      await flows.saveFlow({ ...made, steps: [{ id: 's1', name: 'A', text: 'a', x: 0, y: 0 }, { id: 's2', name: 'B', ask: 'b', x: 240, y: 0 }], wires: [['s1', 's2']] })
      flows.show(made.id)
    })
    const pane = page.locator('app-flows .flows')
    await expect(pane.locator('.flows-pick option').first()).toHaveText(lang === 'ar' ? 'هذه المهمة' : 'このタスク')
    const [a, b] = await Promise.all(['s1', 's2'].map((id) => pane.locator(`.flow-step[data-id="${id}"]`).boundingBox()))
    // The second step comes after the first in the line's own direction.
    expect(lang === 'ar' ? (b?.x ?? 0) < (a?.x ?? 0) : (b?.x ?? 0) > (a?.x ?? 0)).toBe(true)
  })
}
