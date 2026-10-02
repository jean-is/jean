// Files, Calculations and codemode (0.3), the launch demo: drop a CSV, ask in your language,
// accept the offer, and get exact totals worked out by a script in the sandbox, with the
// file it read cited as a source chip. In three languages.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, SALES } from './helpers.js'

const QUESTIONS = {
  en: ['What are the total sales by region?', 'Here are the exact totals'],
  fr: ['Quel est le total des ventes par région ?', 'Voici les totaux exacts'],
  ja: ['地域ごとの売上の合計は？', '正確な合計です'],
}

for (const [lang, [question, expected]] of Object.entries(QUESTIONS)) {
  test(`drop a CSV, get exact totals (${lang})`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    await page.locator('.composer input[type="file"]').setInputFiles({ name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(SALES) })
    await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
    // A table of data is an event: Calculations are offered above the box.
    await expect(page.locator('aside.offer')).toBeVisible()
    await ask(page, question)
    // The brain offers them too, in its answer; accepting turns them on mid-turn.
    await page.locator('.msg-jean .approval .button.primary').click()
    const answer = page.locator('.msg-jean .prose').last()
    await expect(answer).toContainText(expected, { timeout: 30_000 })
    for (const total of ['2540', '1960', '1515']) await expect(answer).toContainText(total)
    await expect(answer.locator('.cite')).toHaveText('1')
    await expect(page.locator('aside.offer')).toHaveCount(0)
    // Opened once the answer has settled (its follow-ups show): it is drawn anew then.
    await expect(page.locator('.follow-ups')).toBeVisible()
    // The script's own read shows under the calculation.
    await page.locator('.activity > summary').last().click()
    await expect(page.locator('.activity-list li.is-nested').last()).toContainText('sales.csv')
    // Each line opens on what it was given and what came back.
    const script = page.locator('.activity-list li[data-depth="0"]', { has: page.locator('code', { hasText: /^run$/ }) }).last()
    await script.locator('.step > summary').click()
    await expect(script.locator('.step-body pre').first()).toContainText('code:')
    await expect(script.locator('.step-body pre').last()).toContainText('2540')
  })
}

test('scripts have no network, end on their value, and their errors come back as text', async ({ page }) => {
  await start(page)
  const output = await page.evaluate(async () => {
    const { loaded } = await import('/ui/caps.js')
    await import('/caps/compute/compute.js')
    const run = loaded.value.get('compute')?.tools?.[0]
    const ctx = { declared: ['run'], declare() {}, call: async () => '' }
    const results = []
    const scripts = [
      'return 6 * 7',
      'return typeof fetch + typeof XMLHttpRequest + typeof importScripts',
      'throw new Error("nope")',
      // No return: the last expression is the result, as in a console, awaited if a promise.
      'Math.cos(9)',
      'const text = await tools.file({ file: "a.csv" })\ntext.length + 1',
      'Promise.resolve(6 * 7)',
      'const nothing = 1',
    ]
    for (const code of scripts) {
      results.push(await run?.run({ code }, ctx).catch((/** @type {Error} */ error) => `failed: ${error.message}`))
    }
    return results
  })
  expect(output).toEqual([
    'Result: 42',
    'Result: undefinedundefinedundefined',
    'failed: The script failed: Error: nope',
    'Result: -0.9111302618846769',
    'Result: 1',
    'Result: 42',
    'The script gave no result: end it with the value you need, or return it.',
  ])
})
