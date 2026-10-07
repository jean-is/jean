// Charts (D196): a skill from Jean's own directory, read in Settings and added, declares ```echarts
// blocks; from then on they are widgets in the conversation, drawn by ECharts, saved as a picture,
// their source a click away. Until a skill of the room declares them, they stay code.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings } from './helpers.js'

test('a chart is code until a skill declares it, then drawn in the answer and saved as a picture', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Chart the croissants sold this week')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer.locator('pre code')).toContainText('"type":"bar"')
  await expect(answer.locator('app-chart')).toHaveCount(0)

  // The directory, in Settings › Skills: a tile for each skill not added yet, read before it is.
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  const knows = await openSettings(page, 'Skills')
  const tiles = knows.locator('.ready-made .service')
  await expect(tiles).toHaveCount(2)
  await tiles.filter({ hasText: 'Charts' }).click()
  const ready = page.locator('app-skill-ready dialog[open]')
  await expect(ready).toContainText('Bars, lines, pies and more, drawn in answers')
  await expect(ready).not.toContainText('From ')
  await expect(ready.locator('.skill-steps')).toContainText('fenced code block tagged')
  await ready.locator('.button.primary').click()
  await expect(page.locator('.toast')).toContainText('Added the skill “Charts”.')
  await expect(knows.locator('.list summary', { hasText: 'Charts' })).toContainText('Bars, lines, pies and more')
  await expect(tiles).toHaveCount(1)
  const steps = await page.evaluate(async () => (await import('/ui/state.js')).app.fs.read('skills/charts/SKILL.md'))
  expect(steps).toContain('  blocks: echarts\n')
  expect(steps).not.toContain('source:')
  await page.keyboard.press('Escape')

  // The answer already given is drawn now.
  const chart = answer.locator('app-chart')
  await expect(chart.locator('.chart canvas').first()).toBeVisible()
  await expect(chart.locator('.chart')).toHaveAttribute('aria-label', 'Croissants sold')
  const download = page.waitForEvent('download')
  await chart.getByRole('button', { name: 'Save as picture' }).click()
  expect((await download).suggestedFilename()).toBe('Croissants sold.png')
  await expect(chart.locator('details pre')).toBeHidden()
  await chart.locator('summary', { hasText: 'echarts' }).click()
  await expect(chart.locator('details pre')).toContainText('"Croissants sold"')

  // Deleting the skill takes the widget away: the block is code again.
  const knowsAgain = await openSettings(page, 'Skills')
  page.once('dialog', (dialog) => dialog.accept())
  await knowsAgain.locator('.list summary', { hasText: 'Charts' }).click()
  await knowsAgain.getByRole('button', { name: 'Delete' }).click()
  await expect(knowsAgain.locator('.ready-made .service')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(answer.locator('app-chart')).toHaveCount(0)
  await expect(answer.locator('pre code')).toContainText('"type":"bar"')
})
