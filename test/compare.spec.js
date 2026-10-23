// The comparison pages (D445), served as jean.is's deploy has them (scripts/serve.js --home): the homepage's Your AI
// door leads to the hub, the hub to each product's page, and each page's buttons open the app where they say: a way to
// add a brain open in Settings › Brains (Ollama's, a Claude plan's), Settings › Your data's Bring in, which takes
// another assistant's export, or the sample spreadsheet in the box. Each address is the app's own once there.
import { test, expect } from '@playwright/test'

const JEAN_IS = 'http://127.0.0.1:4186/'

test('the Your AI door leads to the hub, which leads to each product’s page and back', async ({ page }) => {
  await page.goto(JEAN_IS)
  await page.locator('#home-ai a', { hasText: 'Jean beside the others' }).click()
  await expect(page).toHaveURL(`${JEAN_IS}compare`)
  await expect(page.locator('h1')).toHaveText('Jean beside the AI apps you know')
  const products = await page.locator('.cmp-products a').evaluateAll((links) => links.map((link) => /** @type {HTMLAnchorElement} */ (link).href))
  expect(products).toEqual(['chatgpt', 'claude-cowork', 'openclaw', 'open-webui'].map((name) => `${JEAN_IS}compare/${name}`))
  for (const address of products) {
    await page.goto(address)
    await expect(page.locator('.cmp-crumbs [aria-current="page"]')).toHaveText(await page.locator('.cmp-table thead th').nth(1).textContent() ?? '')
    expect(await page.locator('.cmp-crumbs a').evaluate((link) => /** @type {HTMLAnchorElement} */ (link).href)).toBe(`${JEAN_IS}compare`)
    // Every cell on the other product's side says where it was read, but where there is nothing to read.
    for (const cell of await page.locator('.cmp-table tbody td:not(.is-jean)').all()) {
      if (await cell.locator('p').textContent() !== 'No.') await expect(cell.locator('.cmp-source a').first()).toHaveAttribute('href', /^https:\/\//)
    }
  }
})

test('Point Jean at your Ollama opens Brains with Ollama’s way, the setting it needs said as the page says it', async ({ page }) => {
  await page.goto(`${JEAN_IS}compare/open-webui`)
  const line = await page.locator('.cmp-setting pre').textContent()
  expect(line).toBe('OLLAMA_ORIGINS=http://127.0.0.1:4186 ollama serve')
  await page.locator('.cmp-hero a.button.primary').click()
  await expect(page.locator('html.is-ready')).toBeVisible({ timeout: 15_000 })
  const dialog = page.locator('app-settings dialog[open]')
  await expect(dialog.locator('.brain-way .hint')).toContainText('OLLAMA_ORIGINS=http://127.0.0.1:4186')
  await expect(page).toHaveURL(`${JEAN_IS}#/settings/brains/local`)
})

test('the Claude Cowork page tries Jean on the sample spreadsheet, and opens the Claude plan’s way', async ({ page }) => {
  await page.goto(`${JEAN_IS}compare/claude-cowork`)
  await page.locator('.cmp-hero a', { hasText: 'Try Jean on a file' }).click()
  await expect(page.locator('html.is-ready')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.attachment-name')).toHaveText('sales.csv', { timeout: 15_000 })
  await expect(page.locator('#prompt')).toHaveValue('Which product grew the most over the year? Show it as a chart.')
  await expect(page).toHaveURL(`${JEAN_IS}#/`)
  await page.goto(`${JEAN_IS}compare/claude-cowork`)
  await page.locator('.cmp-end a', { hasText: 'Use your Claude plan' }).click()
  await expect(page.locator('html.is-ready')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('app-settings dialog[open] .brain-head h2')).toHaveText('Use your Claude plan')
  await expect(page).toHaveURL(`${JEAN_IS}#/settings/brains/claude`)
})

test('in French, Importer mon historique ChatGPT opens Vos données on Bring in, which says how to ask for the export (D519)', async ({ page }) => {
  await page.goto(`${JEAN_IS}fr/comparer/chatgpt`)
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await page.locator('.cmp-hero a', { hasText: 'Importer mon historique ChatGPT' }).click()
  await expect(page.locator('html.is-ready')).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(`${JEAN_IS}fr#/settings/data/import`)
  const dialog = page.locator('app-settings dialog[open]')
  await expect(dialog.locator('.settings-nav [aria-current="page"]')).toHaveText('Vos données')
  await expect(dialog.locator('.data-head h2')).toHaveText('Importer depuis ChatGPT, Claude ou Gemini')
  await expect(dialog.getByText('Choisir le fichier…')).toBeVisible()
})
