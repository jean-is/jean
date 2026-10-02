// Keyboard shortcuts (D118), as in the Claude apps: ⌘, opens Settings and ⌘N starts a new
// conversation, ready to type (Ctrl outside Apple's systems), whatever the keyboard's alphabet.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask } from './helpers.js'

test('⌘, opens Settings, and ⌘N starts a new conversation from anywhere', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  await page.keyboard.press('ControlOrMeta+Comma')
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings).toBeVisible()
  await expect(settings.locator('[aria-current="page"]')).toHaveText('General')
  await page.keyboard.press('Escape')
  // Closed once its close event has come, a moment after it is hidden.
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.dialog.value)).toBeNull()
  // On a Russian keyboard the same key types "б": where it sits is what counts.
  await page.evaluate(() => {
    const apple = /Mac|iPhone|iPad/.test(navigator.platform)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'б', code: 'Comma', metaKey: apple, ctrlKey: !apple, bubbles: true }))
  })
  await expect(settings).toBeVisible()
  // Even with Settings open: it closes, and the box waits for the first words.
  await page.keyboard.press('ControlOrMeta+KeyN')
  await expect(settings).toBeHidden()
  await expect(page.locator('.hero-question')).toBeVisible()
  await expect(page.locator('#prompt')).toBeFocused()
})
