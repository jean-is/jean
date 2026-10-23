// Reduced motion (D325, AGENTS.md): with prefers-reduced-motion, nothing on the page moves, in any look.
// Every animation and transition is noted, frame by frame, while Jean answers, while Settings opens
// over the room and closes, while the drawer opens and while day turns to night. And without it,
// nothing moves for more than five seconds while Jean is at rest (WCAG 2.2.2, D420): the wave and the
// light move only while Jean works. Settings' Motion asks for less or for all of it on this device, over what the device asks, from
// before the first paint (D523). Chromium only: what stops is the style sheets' (one rule for every element) and the same scripts',
// in every engine.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings, openTasks, closeTasks } from './helpers.js'
import { LOOKS } from '../app/ui/looks.js'

test.skip(({ browserName }) => browserName !== 'chromium', 'the same style sheets in every engine')
test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } })

for (const look of Object.keys(LOOKS)) {
  test(`nothing moves in ${look} with reduced motion`, async ({ page }) => {
    await start(page)
    await page.evaluate(async (id) => (await import('/ui/state.js')).setLook({ id }), look)
    await connectFakeBrain(page)
    await page.evaluate(() => {
      const seen = /** @type {any} */ (window).moved = new Set()
      const note = () => {
        for (const animation of document.getAnimations()) {
          const effect = /** @type {KeyframeEffect | null} */ (animation.effect)
          const target = effect?.target
          const name = /** @type {any} */ (animation).animationName ?? /** @type {any} */ (animation).transitionProperty ?? animation.constructor.name
          seen.add(`${target?.localName}${target instanceof Element && target.className ? `.${String(target.className).split(' ')[0]}` : ''}${effect?.pseudoElement ?? ''}: ${name}`)
        }
        requestAnimationFrame(note)
      }
      note()
    })
    await ask(page, 'Compare the phone plans')
    await expect(page.locator('.msg-jean:not(.is-streaming) .prose .table.is-compare')).toBeVisible()
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    await openSettings(page, 'Appearance')
    await closeSettings(page)
    await openTasks(page)
    await closeTasks(page).catch(() => {})
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expect(await page.evaluate(() => [.../** @type {any} */ (window).moved].sort())).toEqual([])
  })
}

/** What moves on for more than five seconds, in view and not driven by scrolling. In the page. */
function looping() {
  const found = []
  for (const animation of document.getAnimations()) {
    const effect = /** @type {KeyframeEffect | null} */ (animation.effect)
    const target = effect?.target
    if (animation.playState !== 'running' || animation.timeline !== document.timeline || !(target instanceof Element)) continue
    if (Number(effect?.getComputedTiming().endTime) <= 5000 || !target.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const name = /** @type {any} */ (animation).animationName ?? /** @type {any} */ (animation).transitionProperty
    found.push(`${target.localName}${target.className ? `.${String(/** @type {any} */ (target.className).baseVal ?? target.className).split(' ')[0]}` : ''}${effect?.pseudoElement ?? ''}: ${name}`)
  }
  return found.sort()
}

for (const look of Object.keys(LOOKS)) {
  test(`nothing moves at rest in ${look} without reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await start(page)
    await page.evaluate(async (id) => (await import('/ui/state.js')).setLook({ id }), look)
    await page.mouse.move(0, 0)
    expect(await page.evaluate(looping), 'the first screen').toEqual([])
    await connectFakeBrain(page)
    await ask(page, 'Compare the phone plans')
    await expect(page.locator('.msg-jean:not(.is-streaming) .prose .table.is-compare')).toBeVisible()
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    // Done, then at rest again (ui/send.js).
    await expect(page.locator('html')).not.toHaveAttribute('data-presence', /done|answering|thinking/)
    expect(await page.evaluate(looping), 'an answer').toEqual([])
    await openSettings(page, 'Appearance')
    expect(await page.evaluate(looping), 'Settings').toEqual([])
    await closeSettings(page)
    await openTasks(page)
    expect(await page.evaluate(looping), 'the tasks').toEqual([])
  })
}

test('Motion in Settings asks for less, or for all of it, over what the device asks, before the first paint too (D523)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await start(page)
  const root = page.locator('html')
  /** How the page scrolls to what it is taken to: smoothly, or at once when nothing is to move. */
  const glides = () => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior === 'smooth')
  const settings = await openSettings(page, 'Appearance')
  const motion = settings.getByRole('radiogroup', { name: 'Motion' })
  await expect(settings.getByText('Follows your device: full now')).toBeVisible()
  expect(await glides()).toBe(true)
  await motion.getByRole('radio', { name: 'Less' }).check()
  await expect(root).toHaveAttribute('data-motion', 'less')
  expect(await glides()).toBe(false)
  // Kept on this device, and applied before Jean's code runs.
  await closeSettings(page)
  if (!(await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value))) {
    await page.reload()
    expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('less')
  }
  // A device that asks for less: Full moves all the same; Auto, back to what it asks.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const again = await openSettings(page, 'Appearance')
  await again.getByRole('radiogroup', { name: 'Motion' }).getByRole('radio', { name: 'Full' }).check()
  await expect(root).toHaveAttribute('data-motion', 'full')
  expect(await glides()).toBe(true)
  await again.getByRole('radiogroup', { name: 'Motion' }).getByRole('radio', { name: 'Auto' }).check()
  await expect(root).toHaveAttribute('data-motion', '')
  await expect(again.getByText('Follows your device: less now')).toBeVisible()
  expect(await glides()).toBe(false)
})
