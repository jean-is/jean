// Data-loss checks (D674, ee/): what policy's `dlp` names, found on the device, reaches no brain it doesn't allow, and Settings
// › Your data says so. A brain on this computer keeps it here, so these answer from elsewhere. On localhost no key is needed.
import { test, expect } from '@playwright/test'
import { start, ask, withPolicy, openData } from './helpers.js'

const FAR = 'https://ai.corp.example/v1'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const BRAIN = { provider: 'custom', api: 'openai', baseURL: FAR, model: 'fake-brain-1' }

test('a task holding what is sensitive reaches only the brains the organisation allows', async ({ page }) => {
  const asked = /** @type {string[]} */ ([])
  await page.route(`${FAR}/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.url().endsWith('/chat/completions')) asked.push(String(request.postData()))
    const response = await route.fetch({ url: request.url().replace(FAR, 'http://127.0.0.1:4181/v1') })
    return route.fulfill({ response, headers: { ...response.headers(), ...CORS } })
  })
  await withPolicy(page, { dlp: { detect: ['card'], labels: ['Confidentiel'], brains: ['vault'] }, brains: [{ ...BRAIN, id: 'corp', label: 'Corp AI' }, { ...BRAIN, id: 'vault', label: 'Vault AI' }] })
  await start(page)
  await page.evaluate(async () => { await (await import('/ui/state.js')).updateSettings({ activeBrain: 'corp' }) })
  const settings = await openData(page, 'organization')
  await expect(settings).toContainText('it is checked here for bank or card details and something marked confidential')
  await page.keyboard.press('Escape')
  // Nothing sensitive: any brain.
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean .prose').last()).not.toBeEmpty()
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  expect(asked.length).toBeGreaterThan(0)
  // Now it holds a card: not to this brain, which the toast says, the picker open on the others.
  await ask(page, 'My card is 4111 1111 1111 1111')
  await expect(page.locator('.toast')).toContainText('This task holds bank or card details, which your organization lets only Vault AI read.')
  expect(asked.filter((body) => body.includes('4111'))).toEqual([])
  await page.keyboard.press('Escape')
  // To the one it allows, it goes.
  await page.evaluate(async () => { await (await import('/ui/state.js')).updateSettings({ activeBrain: 'vault' }) })
  await ask(page, 'Now read it back')
  await expect.poll(() => asked.filter((body) => body.includes('4111')).length).toBeGreaterThan(0)
})
