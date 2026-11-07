// Sites (D720): found by its skill, a site made with `site` is checked from its files and as its pages show out of sight, the
// brain hearing what to fix (a line too pale, a placeholder left); it opens beside the task, at a phone's width once picked, its link
// to its other page followed there; it is among the creations, changed by `site_change` until nothing is left to fix, and leaves as
// a zip of its files. Its widths in Arabic and Japanese.
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered } from './helpers.js'

test.setTimeout(120_000)

const STYLE = 'body { margin: 0; min-block-size: 100dvh; display: flex; flex-direction: column; font: 1.0625rem/1.6 system-ui, sans-serif; color: #1f1d1b; background: #fffdf9; }\nmain { flex: 1; padding-inline: 1rem; }\n.pale { color: #bbbbbb; }'
/** A page as the skill asks for one. @param {string} title @param {string} here @param {string} body */
const page = (title, here, body) => /* html */ `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="${title}: bike repairs and servicing while you wait, with spare parts for every kind of bike.">
<meta property="og:title" content="${title}"><meta property="og:description" content="Bike repairs while you wait."><meta property="og:type" content="website"><link rel="stylesheet" href="style.css"></head>
<body><header><a href="index.html">Atelier Nord</a><nav aria-label="Main"><a href="index.html"${here === 'home' ? ' aria-current="page"' : ''}>Home</a> <a href="prices.html"${here === 'prices' ? ' aria-current="page"' : ''}>Prices</a></nav></header>
<main>${body}</main><footer><p>Atelier Nord · [your address]</p></footer></body></html>`
const SITE = { name: 'Atelier Nord', files: [
  { path: 'index.html', text: page('Atelier Nord · Bike repairs', 'home', '<h1>Your bike, fixed while you wait</h1><p>Bring it in before noon.</p>') },
  { path: 'prices.html', text: page('Prices · Atelier Nord', 'prices', '<h1>Prices</h1><p class="pale">Prices change in spring.</p>') },
  { path: 'style.css', text: STYLE }] }

/** Its skill read, then a site made: the answer that says what its check found. @param {import('@playwright/test').Page} page */
async function make(page) {
  await ask(page, 'Call skill with {"name":"site"}')
  await answered(page, 1)
  await ask(page, `Call site with ${JSON.stringify(SITE)}`)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(2, { timeout: 60_000 })
  await answered(page, 2)
  return page.locator('.msg-jean .prose').last()
}

test('a site made with its skill is checked from its files and as its pages show, opens beside the task at a phone’s width, follows its links, is a creation, is changed until clean and leaves as a zip (D720)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const answer = await make(page)
  await expect(answer).toContainText('Made. Site "Atelier Nord" is at sites/')
  await expect(answer).toContainText('2 pages in en.')
  // What only a page shows: the pale line, its contrast read in its frame out of sight; and what is left to fill in.
  // #bbbbbb on the page's #fffdf9, not on white.
  await expect(answer).toContainText('prices.html: “Prices change in spring.” has a contrast of 1.89:1, not 4.5:1')
  await expect(answer).toContainText('Left to fill in: [your address]')
  await expect(page.locator('.site-test')).toHaveCount(0)
  const place = /sites\/[^:]+/.exec(await answer.innerText())?.[0] ?? ''
  // Its record keeps the check whole, the fake brain saying only its start.
  expect(await page.evaluate(async (place) => { const { app } = await import('/ui/state.js'); return JSON.parse((await app.fs.read(`${app.projectDir}/${place}/site.json`)) ?? '{}').check }, place))
    .toMatchObject({ problems: ['prices.html: “Prices change in spring.” has a contrast of 1.89:1, not 4.5:1'], fill: ['[your address] (index.html, prices.html)'] })

  // Beside the task, at a computer's width, then a phone's; its link to its other page shown there.
  const pane = page.locator('app-preview:has(app-site)'), site = page.frameLocator('app-preview app-site iframe')
  await expect(pane).toBeVisible()
  await expect(site.locator('h1')).toHaveText('Your bike, fixed while you wait')
  await pane.getByRole('radiogroup', { name: 'Width' }).getByText('Phone').click()
  await expect(pane.locator('app-site')).toHaveAttribute('data-width', 'phone')
  await expect.poll(async () => (await pane.locator('app-site iframe').boundingBox())?.width ?? 0).toBeLessThanOrEqual(390)
  await site.getByRole('link', { name: 'Prices' }).click()
  await expect(site.locator('h1')).toHaveText('Prices')

  // Among the creations, by its name.
  expect(await page.evaluate(async () => (await (await import('/ui/creations.js')).creationsHere()).map((one) => one.name))).toContain('Atelier Nord')

  // Changed by an exact passage, until nothing is left to fix.
  await ask(page, `Call site_change with ${JSON.stringify({ site: place, changes: [{ path: 'style.css', old: '#bbbbbb', new: '#4a4540' }] })}`)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(3, { timeout: 60_000 })
  await answered(page, 3)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('nothing to fix')

  // It leaves as a zip of its files, from the button just before Close, its one way out.
  const download = page.waitForEvent('download')
  await pane.getByRole('button', { name: 'Download Atelier Nord' }).click()
  expect((await download).suggestedFilename()).toBe('Atelier Nord.zip')
  // A zip names its files in the clear, each in its local header and its central directory.
  const zip = await readFile(await (await download).path())
  for (const name of ['index.html', 'prices.html', 'style.css']) expect(zip.includes(name)).toBe(true)
  expect(zip.includes('site.json')).toBe(false)
})

for (const [lang, width, phone] of [['ar', 'العرض', 'هاتف'], ['ja', '幅', 'スマートフォン']]) {
  test(`a site beside the task in ${lang}: its widths in the user's words (D720)`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    await make(page)
    const pane = page.locator('app-preview:has(app-site)')
    await pane.getByRole('radiogroup', { name: width }).getByText(phone).click()
    await expect(pane.locator('app-site')).toHaveAttribute('data-width', 'phone')
  })
}
