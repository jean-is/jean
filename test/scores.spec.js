// Scores (D196): with the Music score skill of Jean's own directory added, a ```abc block in an
// answer is a widget: drawn as a score by abcjs, played on MS Basic's instruments (D338), each note
// lit as it sounds, paused where it is, and copied as its source and its picture at once.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings, nextCopy } from './helpers.js'

test('a tune is drawn as a score once its skill is added, and plays, each note lit as it sounds', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  const knows = await openSettings(page, 'Skills')
  await knows.locator('.ready-made .service', { hasText: 'Music score' }).click()
  const ready = page.locator('app-skill-ready dialog[open]')
  await expect(ready.locator('.skill-steps')).toContainText('ABC notation')
  await ready.locator('.button.primary').click()
  await expect(page.locator('.toast')).toContainText('Added the skill “Music score”.')
  await page.keyboard.press('Escape')

  await ask(page, 'Write me a jig')
  const score = page.locator('.msg-jean app-score').last()
  await expect(score.locator('.score-sheet svg')).toHaveCount(1)
  await expect(score.locator('.score-sheet')).toHaveAttribute('aria-label', 'The Legacy Jig')
  await expect(score.locator('.score-time')).toHaveText(/^0:00 \/ 0:1[67]$/)
  await score.getByRole('button', { name: 'Play' }).click()
  await expect(score.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(score.locator('.score-sheet .is-sounding').first()).toBeAttached()
  // On its instruments: the piano's file came once and is kept apart from app versions, and what it plays isn't silence.
  expect(await page.evaluate(async () => (await (await caches.open('app-sounds')).keys()).map((request) => request.url.split('/').pop()))).toEqual([expect.stringMatching(/^grand-piano\.[0-9a-f]{12}\.sf3$/)])
  expect(await score.evaluate((element) => (/** @type {any} */ (element)).parts.reduce((/** @type {number} */ peak, /** @type {any} */ part) => part.buffer.getChannelData(0).reduce((/** @type {number} */ most, /** @type {number} */ value) => Math.max(most, Math.abs(value)), peak), 0))).toBeGreaterThan(0.05)
  await expect.poll(async () => Number(await score.locator('input[type="range"]').inputValue())).toBeGreaterThan(0.5)
  await score.getByRole('button', { name: 'Pause' }).click()
  await expect(score.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(score.locator('.score-sheet .is-sounding')).toHaveCount(0)
  // Copy: the ABC as text and the score as a picture, at once.
  const copy = await nextCopy(page)
  await score.getByRole('button', { name: 'Copy' }).click()
  const copied = await copy.read()
  expect(copied['text/plain']).toMatch(/^X:1\nT:The Legacy Jig\n/)
  expect(copied['image/png']).toEqual([137, 80, 78, 71])
  // Printed, the score shows without its player.
  await page.emulateMedia({ media: 'print' })
  await expect(score.locator('.score-player')).toBeHidden()
  await expect(score.locator('.score-sheet svg')).toBeVisible()
  await page.emulateMedia({ media: 'screen' })
  // Copying the answer: the score as its picture in the rich text.
  const whole = await nextCopy(page)
  await page.locator('.msg-jean').last().locator('app-made').getByRole('button', { name: 'Copy' }).click()
  expect((await whole.read())['text/html']).toMatch(/<img [^>]*src="data:image\/png;base64,[^"]+"[^>]*alt="The Legacy Jig"/)
})

test('asked for sheet music, the brain reads Jean’s own Music score where <skills> lists it, which adds it, and the tune is drawn (D401)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  await ask(page, 'Compose a short lullaby, as sheet music I can play.')
  await expect(page.locator('.toast')).toContainText('Saved the skill “Music score”.')
  await expect(page.locator('.msg-jean app-score .score-sheet svg')).toHaveCount(1)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Play it lightly.')
  expect(await page.evaluate(async () => (await (await import('/caps/skills/skills.js')).skills()).map((skill) => skill.name))).toEqual(['music-score'])
  // Listed as before it came in: the next message tells the brain nothing new of <skills>.
  await ask(page, 'Thank you')
  await expect(page.locator('.msg-jean')).toHaveCount(2)
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.busy.value)).toBe(false)
  expect(JSON.stringify(await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records))).not.toContain('The <skills> section is now')
})
