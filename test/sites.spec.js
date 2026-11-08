// Sites (D720): found by its skill, a site made with `site` is checked from its files and as its pages show out of sight, the
// brain hearing what to fix (a line too pale, a placeholder left); it opens beside the task, at a phone's width once picked, its link
// to its other page followed there; it is among the creations, changed by `site_change` until nothing is left to fix, and leaves as
// a zip of its files. Published at a name of its own on the share host, asked first, its recovery code shown once, its pages
// served under the host's policy; published again, only what changed goes; a new recovery code; taken offline. Its widths in
// Arabic and Japanese.
import { readFile } from 'node:fs/promises'
import { request } from 'node:http'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, SHARE_URL } from './helpers.js'

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
  test(`a site beside the task in ${lang}: its widths and its Publish dialog in the user's words (D720)`, async ({ page }) => {
    const words = { ...JSON.parse(await readFile(new URL(`../app/locales/sites/${lang}.json`, import.meta.url), 'utf8')), ...JSON.parse(await readFile(new URL(`../app/locales/out/${lang}.json`, import.meta.url), 'utf8')) }
    await start(page, lang)
    await connectFakeBrain(page)
    await page.evaluate(async (host) => { const { app, updateSettings } = await import('/ui/state.js'); await updateSettings({ urls: { ...app.settings.value.urls, share: host } }) }, SHARE_URL)
    await make(page)
    const pane = page.locator('app-preview:has(app-site)')
    await pane.getByRole('radiogroup', { name: width }).getByText(phone).click()
    await expect(pane.locator('app-site')).toHaveAttribute('data-width', 'phone')
    // The address reads left to right whatever the language, its name said free in the user's words.
    await pane.getByRole('button', { name: words['out.menuNoPrint'] }).click()
    await page.getByRole('button', { name: words['sites.publish'] }).click()
    const dialog = page.locator('dialog.site-publish')
    await expect(dialog.getByRole('heading')).toHaveText(words['sites.publishTitle'].replace('{name}', 'Atelier Nord'))
    await expect(dialog.locator('.site-name')).toHaveAttribute('dir', 'ltr')
    await expect(dialog.getByLabel(words['sites.address'])).toHaveValue('atelier-nord')
    await dialog.getByLabel(words['sites.address']).fill(`atelier-nord-${lang}`)
    await expect(dialog.locator('#publish-said')).toHaveText(words['sites.free'])
  })
}

/**
 * The tests' share host serves a site at <name>.localhost, which WebKit doesn't take to this computer as Chromium does: each
 * request for one is handed to the host, under that name, and its answer given back as it is, headers included.
 * @param {import('@playwright/test').BrowserContext} context
 */
async function throughHost(context) {
  const port = Number(new URL(SHARE_URL).port)
  await context.route((url) => url.hostname.endsWith('.localhost') && url.port === String(port), async (route) => {
    const url = new URL(route.request().url())
    /** @type {{ status: number, headers: Record<string, string>, body: Buffer }} */
    const answer = await new Promise((resolve, reject) => request({ host: '127.0.0.1', port, path: url.pathname, headers: { host: url.host } }, (response) => {
      const parts = /** @type {Buffer[]} */ ([])
      response.on('data', (part) => parts.push(part)).on('end', () => resolve({ status: response.statusCode ?? 0, headers: Object.fromEntries(Object.entries(response.headers).map(([name, value]) => [name, String(value)])), body: Buffer.concat(parts) }))
    }).on('error', reject).end())
    await route.fulfill(answer)
  })
}

test('a site goes online at a name of its own, asked first, its recovery code shown once and kept apart; published again, only what changed goes; a new code takes the old one back; taken offline (D720)', async ({ page, context, browserName }) => {
  // One host serves every browser's run, its retries and repeats, so each takes a name of its own.
  const name = `atelier-nord-${browserName}-${test.info().retry}-${test.info().repeatEachIndex}`, address = `http://${name}.localhost:4185/`
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async (host) => { const { app, updateSettings } = await import('/ui/state.js'); await updateSettings({ urls: { ...app.settings.value.urls, share: host } }) }, SHARE_URL)
  const place = /sites\/[^:]+/.exec(await (await make(page)).innerText())?.[0] ?? ''
  const pane = page.locator('app-preview:has(app-site)'), dialog = page.locator('dialog.site-publish')
  const sent = /** @type {string[]} */ ([])
  page.on('request', (one) => { if (one.method() === 'PUT' && one.url().includes('/v1/sites/')) sent.push(one.url()) })
  const publishing = async () => {
    await pane.getByRole('button', { name: 'Share or download' }).click()
    await page.getByRole('button', { name: 'Publish…' }).click()
    await expect(dialog).toBeVisible()
  }

  // Its name suggested from the site's, said free by the host; what publishing means, before anything goes.
  await publishing()
  await expect(dialog.getByRole('heading')).toHaveText('Publish Atelier Nord')
  await expect(dialog.getByLabel('Address')).toHaveValue('atelier-nord')
  await expect(dialog).toContainText('Anyone can open it, and search engines show it.')
  expect(sent).toEqual([])
  await dialog.getByLabel('Address').fill('paypal-help')
  await expect(dialog.locator('#publish-said')).toHaveText('This address is held back, so that nobody is mistaken about whose site it is.')
  await expect(dialog.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled()
  await dialog.getByLabel('Address').fill(name)
  await expect(dialog.locator('#publish-said')).toHaveText('This address is free.')
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click()

  // The recovery code, shown once, kept among the secrets and never in the site's record.
  const code = dialog.locator('.site-code')
  await expect(code).toHaveText(/^([0-9A-F]{4}-){7}[0-9A-F]{4}$/)
  const recovery = await code.textContent()
  expect(sent.map((url) => url.slice(url.lastIndexOf('/') + 1)).sort()).toEqual(['index.html', 'prices.html', 'style.css'])
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeDisabled()
  await dialog.getByLabel('I’ve kept it somewhere safe').check()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog.getByRole('link', { name: address })).toBeVisible()
  await expect(dialog).toContainText('Nothing changed since it was published.')
  await expect(dialog.getByRole('status').last()).toHaveText('The site is online.')
  const kept = await page.evaluate(async (place) => {
    const [{ app }, { getSecret }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js')])
    return { record: (await app.fs.read(`${app.projectDir}/${place}/site.json`)) ?? '', secret: await getSecret(app.fs, `site:${place.split('/')[1].split('-')[0]}`) }
  }, place)
  expect(kept.secret).toBe(recovery)
  expect(JSON.parse(kept.record).published).toMatchObject({ name, address })
  expect(kept.record).not.toContain(String(kept.secret))

  // Online, under the host's policy: its own style sheet loads, and the page is an opaque origin, with no storage of its own.
  await throughHost(context)
  const visit = await context.newPage()
  const shown = await visit.goto(`${address}prices`)
  expect(shown?.headers()['content-security-policy']).toMatch(/^sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox; default-src 'none'/)
  await expect(visit.locator('h1')).toHaveText('Prices')
  await expect.poll(() => visit.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 253, 249)')
  expect(await visit.evaluate(() => [self.origin, (() => { try { return typeof localStorage.length } catch { return 'none' } })()])).toEqual(['null', 'none'])
  await visit.close()

  // Changed, then published again: only the style sheet goes.
  await dialog.locator('.dialog-head').getByRole('button', { name: 'Close' }).click()
  await ask(page, `Call site_change with ${JSON.stringify({ site: place, changes: [{ path: 'style.css', old: '#bbbbbb', new: '#4a4540' }] })}`)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(3, { timeout: 60_000 })
  await answered(page, 3)
  await publishing()
  await expect(dialog).toContainText('1 file changed since it was published.')
  sent.length = 0
  await dialog.getByRole('button', { name: 'Publish again' }).click()
  await expect(dialog).toContainText('Nothing changed since it was published.')
  expect(sent).toEqual([`${SHARE_URL}v1/sites/${name}/style.css`])

  // On a device without its secret, its recovery code publishes it again: a wrong one is refused and kept nowhere.
  const secret = () => page.evaluate(async (place) => { const [{ app }, { getSecret }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js')]); return getSecret(app.fs, `site:${place.split('/')[1].split('-')[0]}`) }, place)
  await page.evaluate(async (place) => { const [{ app }, { deleteSecret }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js')]); await deleteSecret(app.fs, `site:${place.split('/')[1].split('-')[0]}`) }, place)
  await dialog.locator('.dialog-head').getByRole('button', { name: 'Close' }).click()
  await publishing()
  await expect(dialog).toContainText('This site was published from another device.')
  await dialog.getByLabel('Recovery code').fill('0000-0000-0000-0000-0000-0000-0000-0000')
  await dialog.getByRole('button', { name: 'Publish again' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('This code doesn’t publish this address.')
  expect(await secret()).toBeNull()
  await dialog.getByLabel('Recovery code').fill(String(recovery).toLowerCase().replaceAll('-', ' '))
  await dialog.getByRole('button', { name: 'Publish again' }).click()
  await expect(dialog).toContainText('Nothing changed since it was published.')
  expect(await secret()).toBe(recovery)

  // A new recovery code, once the person says so, shown once and kept here: the host takes the old one no more, nor a device that holds it.
  const state = (/** @type {string | null} */ held) => page.evaluate(async ([host, name, held]) => { const { tokenOf, secretOf } = await import('/caps/sites/file.js')
    return (await (await fetch(`${host}v1/sites/${name}`, { headers: { authorization: `Bearer ${await tokenOf(/** @type {Uint8Array} */ (secretOf(String(held))))}` } })).json()).state }, [SHARE_URL, name, held])
  page.once('dialog', (asked) => { expect(asked.message()).toContain('any device you removed'); asked.accept() })
  await dialog.getByRole('button', { name: 'Make a new recovery code' }).click()
  await expect(code).toHaveText(/^([0-9A-F]{4}-){7}[0-9A-F]{4}$/)
  const renewed = await code.textContent()
  expect(renewed).not.toBe(recovery)
  expect(await secret()).toBe(renewed)
  expect([await state(recovery), await state(renewed)]).toEqual(['taken', 'yours'])
  await expect(dialog.getByRole('status').last()).toHaveText('The old recovery code no longer works for this site.')
  await dialog.getByLabel('I’ve kept it somewhere safe').check()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toContainText('Nothing changed since it was published.')

  // Taken offline, once the person says so: its address answers nothing more.
  page.once('dialog', (asked) => asked.accept())
  await dialog.getByRole('button', { name: 'Take it offline' }).click()
  await expect(dialog).toContainText('Offline since')
  const gone = await context.newPage()
  expect((await gone.goto(address))?.status()).toBe(404)
})
