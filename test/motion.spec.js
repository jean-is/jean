// Reduced motion (D325, AGENTS.md): with prefers-reduced-motion, nothing on the page moves, in any look.
// Every animation and transition is noted, frame by frame, while Jean answers, while Settings opens
// over the room and closes, while the drawer opens and while day turns to night.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings, openTasks, closeTasks } from './helpers.js'
import { LOOKS } from '../app/ui/looks.js'

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
    await expect(page.locator('.msg-jean .prose .table.is-compare')).toBeVisible()
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
