// Scores (D196): with the Music scores skill of Jean's own directory added, a ```abc block in an
// answer is a widget: drawn as a score by abcjs, played by Jean's own synthesizer, each note lit
// as it sounds, paused where it is.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings } from './helpers.js'

test('a tune is drawn as a score once its skill is added, and plays, each note lit as it sounds', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  const knows = await openSettings(page, 'Skills')
  await knows.locator('.ready-made .service', { hasText: 'Music scores' }).click()
  const ready = page.locator('app-skill-ready dialog[open]')
  await expect(ready.locator('.skill-steps')).toContainText('ABC notation')
  await ready.locator('.button.primary').click()
  await expect(page.locator('.toast')).toContainText('Added the skill “Music scores”.')
  await page.keyboard.press('Escape')

  await ask(page, 'Write me a jig')
  const score = page.locator('.msg-jean app-score').last()
  await expect(score.locator('.score-sheet svg')).toHaveCount(1)
  await expect(score.locator('.score-sheet')).toHaveAttribute('aria-label', 'The Legacy Jig')
  await expect(score.locator('.score-time')).toHaveText(/^0:00 \/ 0:1[67]$/)
  await score.getByRole('button', { name: 'Play' }).click()
  await expect(score.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(score.locator('.score-sheet .is-sounding').first()).toBeAttached()
  await expect.poll(async () => Number(await score.locator('input[type="range"]').inputValue())).toBeGreaterThan(0.5)
  await score.getByRole('button', { name: 'Pause' }).click()
  await expect(score.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(score.locator('.score-sheet .is-sounding')).toHaveCount(0)
  await score.locator('summary', { hasText: 'abc' }).click()
  await expect(score.locator('details pre')).toContainText('T:The Legacy Jig')
})
