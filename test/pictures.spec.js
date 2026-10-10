// Pictures and films (D251): the brain offers them when asked to draw, makes a picture kept in the
// project and shown in the answer, ready to save; a film is asked first, then shown and played there.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings } from './helpers.js'

test('the brain offers pictures when asked to draw, then makes one, kept in the project', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Draw a lighthouse at dusk')
  await page.locator('.msg-jean .approval').getByRole('button', { name: 'Turn it on' }).click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is your picture.')
  const picture = page.locator('app-picture img')
  await expect(picture).toHaveJSProperty('naturalWidth', 96)
  await expect(picture).toHaveAttribute('alt', 'Draw a lighthouse at dusk')
  await expect(page.locator('app-picture a[download]')).toHaveAttribute('download', 'draw-a-lighthouse-at-dusk.png')
  await expect(page.locator('.activity-list')).toContainText('A picture · Draw a lighthouse at dusk')
  // Kept like a shared file, its description as its text.
  const kept = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const uri = document.querySelector('app-picture')?.getAttribute('uri')
    return app.fs.read(`${app.projectDir}/${uri?.replace(/\.png$/, '.md')}`)
  })
  expect(kept).toContain('Draw a lighthouse at dusk')
})

test('a film is asked first, then shown in the answer, ready to play and save', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Pictures and films')
  await page.keyboard.press('Escape')
  await ask(page, 'A film of waves at dawn')
  const approval = page.locator('.approval')
  await expect(approval).toContainText('A film · 4 seconds · A film of waves at dawn')
  await approval.getByRole('button', { name: 'Allow once' }).click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is your film.')
  await expect(page.locator('app-picture video')).toHaveAttribute('src', /^blob:/)
  await expect(page.locator('app-picture a[download]')).toHaveAttribute('download', 'a-film-of-waves-at-dawn.mp4')
  await expect(page.locator('app-picture a[download]')).toHaveAttribute('aria-label', 'Save the film')
})

test('Never on a film declines it, not every change; Always allow holds for films, until Settings asks first again', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('pictures'))
  const answer = page.locator('.msg-jean .prose').last()
  // The next request once the answer is whole: until then the box is busy.
  const next = async (/** @type {string} */ text) => {
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
    await ask(page, text)
  }
  await ask(page, 'A film of waves at dawn')
  await page.locator('.approval').getByRole('button', { name: 'Never' }).click()
  await expect(answer).toContainText('The user declined this action.')
  // Files are still written without asking.
  await next('Write a Word document')
  await expect(answer).toContainText('Done: Bakery plan.docx is under this answer.')
  await next('A film of the sea')
  await page.locator('.approval').getByRole('button', { name: 'Always allow' }).click()
  await expect(answer).toContainText('Here is your film.')
  await next('A film of a forest')
  await expect(page.locator('app-picture video')).toHaveCount(2)
  await expect(page.locator('.approval')).toHaveCount(0)
  const settings = await openSettings(page, 'Brains')
  await expect(settings).toContainText('Films are made without asking first.')
  await settings.getByRole('button', { name: 'Ask first again' }).click()
  await expect(settings).not.toContainText('Films are made without asking first.')
})

for (const [lang, save] of [['ar', 'حفظ الصورة'], ['ja', '画像を保存']]) {
  test(`a picture in the answer, in ${lang}`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    await page.evaluate(async () => (await import('/ui/caps.js')).unlock('pictures'))
    await ask(page, 'Draw a lighthouse at dusk')
    await expect(page.locator('app-picture img')).toHaveJSProperty('naturalWidth', 96)
    await expect(page.locator('app-picture a[download]')).toHaveAttribute('aria-label', save)
  })
}
