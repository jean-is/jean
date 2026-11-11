// Sites (D720): found by its skill, a site made with `site` is checked from its files and as its pages show out of sight, the
// brain hearing what to fix (a line too pale, a placeholder left); it opens beside the task, at a phone's width once picked, its link
// to its other page followed there; it is among the creations, changed by `site_change` until nothing is left to fix, and leaves as
// a zip of its files. Published at a name of its own on the share host, asked first, its recovery code shown once, its pages
// served under the host's policy; published again, only what changed goes; a new recovery code; taken offline. A picture Jean made
// in the task goes into it by its name, and @ names it from another task (D730). Its three looks (D739), picked by keyboard, its
// pages following, the pick kept, a colour written put as a property and words that fade by night said. Its widths and looks in
// Arabic and Japanese.
import { readFile } from 'node:fs/promises'
import { request } from 'node:http'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, nameOf, paint, SHARE_URL } from './helpers.js'

test.setTimeout(120_000)

const STYLE = 'body { margin: 0; min-block-size: 100dvh; display: flex; flex-direction: column; font: 1.0625rem/1.6 var(--font); color: var(--ink); background: var(--paper); }\nmain { flex: 1; padding-inline: 1rem; }\n.pale { color: var(--tint); }'
/** A page as the skill asks for one. @param {string} title @param {string} here @param {string} body */
const page = (title, here, body) => /* html */ `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="${title}: bike repairs and servicing while you wait, with spare parts for every kind of bike.">
<meta property="og:title" content="${title}"><meta property="og:description" content="Bike repairs while you wait."><meta property="og:type" content="website"><link rel="stylesheet" href="look.css"><link rel="stylesheet" href="style.css"></head>
<body><header><a href="index.html">Atelier Nord</a><nav aria-label="Main"><a href="index.html"${here === 'home' ? ' aria-current="page"' : ''}>Home</a> <a href="prices.html"${here === 'prices' ? ' aria-current="page"' : ''}>Prices</a></nav></header>
<main>${body}</main><footer><p>Atelier Nord · [your address]</p></footer></body></html>`
const SITE = { name: 'Atelier Nord', files: [
  { path: 'index.html', text: page('Atelier Nord · Bike repairs', 'home', '<h1>Your bike, fixed while you wait</h1><p>Bring it in before noon.</p>') },
  { path: 'prices.html', text: page('Prices · Atelier Nord', 'prices', '<h1>Prices</h1><p class="pale">Prices change in spring.</p>') },
  { path: 'style.css', text: STYLE }], look: { accent: '#9a3b14', paper: '#fffdf9', ink: '#1f1d1b' } }

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
  // The tint on the page's paper, #fffdf9, not on white.
  await expect(answer).toContainText('prices.html: “Prices change in spring.” has a contrast of 1.12:1, not 4.5:1')
  await expect(answer).toContainText('Left to fill in: [your address]')
  await expect(page.locator('.site-test')).toHaveCount(0)
  const place = /sites\/[^:]+/.exec(await answer.innerText())?.[0] ?? ''
  // Its record keeps the check whole, the fake brain saying only its start.
  expect(await page.evaluate(async (place) => { const { app } = await import('/ui/state.js'); return JSON.parse((await app.fs.read(`${app.projectDir}/${place}/site.json`)) ?? '{}').check }, place))
    .toMatchObject({ problems: ['prices.html: “Prices change in spring.” has a contrast of 1.12:1, not 4.5:1'], fill: ['[your address] (index.html, prices.html)'] })

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
  await ask(page, `Call site_change with ${JSON.stringify({ site: place, changes: [{ path: 'style.css', old: 'var(--tint)', new: 'var(--quiet)' }] })}`)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(3, { timeout: 60_000 })
  await answered(page, 3)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('nothing to fix')

  // It leaves as a zip of its files, from the button just before Close, its one way out.
  const download = page.waitForEvent('download')
  await pane.getByRole('button', { name: 'Download Atelier Nord' }).click()
  expect(nameOf(await download)).toBe('Atelier Nord.zip')
  // A zip names its files in the clear, each in its local header and its central directory.
  const zip = await readFile(await (await download).path())
  for (const name of ['index.html', 'prices.html', 'style.css', 'look.css']) expect(zip.includes(name)).toBe(true)
  expect(zip.includes('site.json')).toBe(false)
})

test('a picture Jean made in the task goes into its site by the name it was made under, its lists as JSON text read as lists (D730)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const answer = await make(page), place = /sites\/[^:]+/.exec(await answer.innerText())?.[0] ?? ''
  const uri = await paint(page, 'portrait-atelier', 'The workshop at dawn, bikes on the wall')
  // As a brain sent it through another's tools: its lists as JSON text, the picture by its name, in another case, without its extension.
  const files = JSON.stringify([{ path: 'photos/atelier.png', from: 'Portrait-Atelier' }]), changes = JSON.stringify([{ path: 'index.html', old: '<p>Bring it in before noon.</p>', new: '<p>Bring it in before noon.</p><img src="photos/atelier.png" alt="The workshop at dawn" width="96" height="64">' }])
  await ask(page, `Call site_change with ${JSON.stringify({ site: place, files, changes })}`)
  await answered(page, 4)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Changed.')
  const [made, kept, record] = await page.evaluate(async ([place, uri]) => {
    const { app } = await import('/ui/state.js'), length = async (/** @type {string} */ path) => (await app.fs.readBytes(`${app.projectDir}/${path}`))?.length ?? 0
    return [await length(uri), await length(`${place}/photos/atelier.png`), JSON.parse((await app.fs.read(`${app.projectDir}/${place}/site.json`)) ?? '{}')]
  }, [place, uri])
  expect(made).toBeGreaterThan(0)
  expect(kept).toBe(made)
  expect(record.files).toContain('photos/atelier.png')
  await expect(page.frameLocator('app-preview app-site iframe').locator('img[alt="The workshop at dawn"]')).toHaveJSProperty('naturalWidth', 96)
  // A name the task holds nothing by says what it does hold.
  await ask(page, `Call site_change with ${JSON.stringify({ site: place, files: [{ path: 'photos/other.png', from: 'bicorne.png' }] })}`)
  await answered(page, 5)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('There is no file named "bicorne.png" in this task. Its files: portrait-atelier.png.')
})

test('from another task, @ names a site by its place, opening it beside the task for the brain to change (D730)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const place = /sites\/[^:]+/.exec(await (await make(page)).innerText())?.[0] ?? ''
  await page.locator('.wordmark').click()
  await expect(page.locator('app-preview .pane')).toHaveCount(0)
  const box = page.locator('#prompt')
  await box.pressSequentially('Brighter @atel')
  await expect(page.locator('#complete .complete-heading').first()).toHaveText('Creations')
  await expect(page.locator('#complete [aria-selected="true"]')).toContainText('Atelier Nord')
  await box.press('Enter')
  await expect(box).toHaveValue('Brighter @Atelier Nord ')
  await expect(page.locator('app-preview:has(app-site)')).toBeVisible()
  await box.press('Enter')
  await answered(page)
  const records = await page.evaluate(async () => JSON.stringify((await import('/ui/state.js')).app.current.value?.records ?? []))
  expect(records).toContain(`\\"@Atelier Nord\\" is the site \\"Atelier Nord\\", ${place}.`)
  expect(records).toContain(`The site Atelier Nord (${place}) is open beside the conversation, on index.html. Change it with site_change.`)
})

test('a site is dealt three looks, its own first: one picked by keyboard dresses its pages and is kept; a colour written is put as a property, and words that fade by night are said (D739)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const place = /sites\/[^:]+/.exec(await (await make(page)).innerText())?.[0] ?? ''
  const pane = page.locator('app-preview:has(app-site)'), site = page.frameLocator('app-preview app-site iframe'), looks = pane.getByRole('radiogroup', { name: 'Colours and type' })
  const read = (/** @type {string} */ path) => page.evaluate(async (path) => { const { app } = await import('/ui/state.js'); return (await app.fs.read(`${app.projectDir}/${path}`)) ?? '' }, `${place}/${path}`)
  // In its own light look: a colour the brain wrote is put as the property nearest its role; words left a black seen through fade by night, which is said.
  await ask(page, `Call site_change with ${JSON.stringify({ site: place, changes: [{ path: 'style.css', old: '.pale { color: var(--tint); }', new: '.pale { color: #2a6f4e; }\n.dim { color: rgba(0, 0, 0, 0.85); }' },
    { path: 'index.html', old: '<p>Bring it in before noon.</p>', new: '<p class="dim">Bring it in before noon.</p>' }] })}`)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(3, { timeout: 60_000 })
  await answered(page, 3)
  const said = page.locator('.msg-jean .prose').last()
  await expect(said).toContainText('index.html: by night, “Bring it in before noon.” has a contrast of')
  expect(await page.evaluate(async () => JSON.stringify((await import('/ui/state.js')).app.current.value?.records ?? []))).toContain("look.css's properties were put in place of 1 colour written in the site (style.css: #2a6f4e → var(--accent")
  expect(await read('style.css')).toMatch(/\.pale \{ color: var\(--accent(-2)?\); \}/)
  await expect(looks.getByRole('radio')).toHaveCount(3)
  await expect(looks.getByRole('radio', { name: 'For this site' })).toBeChecked()
  await expect(site.locator('body')).toHaveCSS('background-color', 'rgb(255, 253, 249)')
  // By keyboard, as radios go: the next one picked, its page dressed in it, the focus still there.
  await looks.getByRole('radio', { name: 'For this site' }).focus()
  await page.keyboard.press('ArrowRight')
  const second = looks.getByRole('radio').nth(1)
  await expect(second).toBeChecked()
  await expect(second).toBeFocused()
  await expect(site.locator('body')).not.toHaveCSS('background-color', 'rgb(255, 253, 249)')
  await expect.poll(async () => JSON.parse(await read('site.json')).look?.id).not.toBe('own')
  const kept = JSON.parse(await read('site.json')).look
  expect(await read('look.css')).toContain(`--paper: ${await site.locator('body').evaluate((body) => `#${getComputedStyle(body).backgroundColor.match(/\d+/g)?.map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`)};`)
  expect(kept.own).toEqual({ accent: '#9a3b14', paper: '#fffdf9', ink: '#1f1d1b' })
  // At a phone's width, every look still shows, nothing cut.
  await page.setViewportSize({ width: 320, height: 720 })
  for (const radio of await looks.getByRole('radio').all()) await expect(radio.locator('xpath=..')).toBeInViewport()
  expect(await pane.locator('app-site').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.setViewportSize({ width: 1280, height: 720 })
  // Colours the brain is given wear at once.
  await ask(page, `Call site_change with ${JSON.stringify({ site: place, look: { accent: '#c2410c', type: 'friendly' } })}`)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(4, { timeout: 60_000 })
  await answered(page, 4)
  await expect(looks.getByRole('radio', { name: 'For this site' })).toBeChecked()
  expect(await read('look.css')).toMatch(/--accent: #b8\w{4};/)
})

for (const [lang, width, phone] of [['ar', 'العرض', 'هاتف'], ['ja', '幅', 'スマートフォン']]) {
  test(`a site beside the task in ${lang}: its widths, its looks and its Publish dialog in the user's words (D720, D739)`, async ({ page }) => {
    const words = { ...JSON.parse(await readFile(new URL(`../app/locales/sites/${lang}.json`, import.meta.url), 'utf8')), ...JSON.parse(await readFile(new URL(`../app/locales/out/${lang}.json`, import.meta.url), 'utf8')) }
    await start(page, lang)
    await connectFakeBrain(page)
    await page.evaluate(async (host) => { const { app, updateSettings } = await import('/ui/state.js'); await updateSettings({ urls: { ...app.settings.value.urls, share: host } }) }, SHARE_URL)
    await make(page)
    const pane = page.locator('app-preview:has(app-site)')
    await pane.getByRole('radiogroup', { name: width }).getByText(phone).click()
    await expect(pane.locator('app-site')).toHaveAttribute('data-width', 'phone')
    // Its looks in the user's words, the next one picked as the language reads.
    const looks = pane.getByRole('radiogroup', { name: words['sites.looks'] })
    await expect(looks.getByRole('radio', { name: words['sites.palette.own'] })).toBeChecked()
    await looks.locator('label').nth(1).click()
    await expect(looks.getByRole('radio').nth(1)).toBeChecked()
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
  expect(sent.map((url) => url.slice(url.lastIndexOf('/') + 1)).sort()).toEqual(['index.html', 'look.css', 'prices.html', 'style.css'])
  // Online first, its address over the code, which waits apart until the person says it is kept.
  await expect(dialog.locator('.site-state')).toHaveText('The site is online.')
  await expect(dialog.getByTitle('Address')).toHaveValue(address)
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeDisabled()
  await dialog.getByLabel('I’ve kept it somewhere safe').check()
  await dialog.getByRole('button', { name: 'Done' }).click()
  // Then how it stands, a dot while it is online, over its address to copy, or to open as visitors will.
  await expect(dialog.locator('.site-state.is-live')).toContainText('Online until')
  await expect(dialog.getByRole('link', { name: `Open ${address.replace(/^https?:\/\/|\/$/g, '')}` })).toHaveAttribute('href', address)
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
  // No address shows .html: the page's links lost theirs as the host kept it (an address typed with it: test/publish.test.js).
  expect(await visit.locator('nav a').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual(['./', 'prices'])
  await visit.locator('nav a').first().click()
  await expect(visit).toHaveURL(address)
  await visit.close()

  // Changed, then published again: only the style sheet goes.
  await dialog.locator('.dialog-head').getByRole('button', { name: 'Close' }).click()
  await ask(page, `Call site_change with ${JSON.stringify({ site: place, changes: [{ path: 'style.css', old: 'var(--tint)', new: 'var(--quiet)' }] })}`)
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

test('a page on its own goes online from its pane as a site of one page, its script and its on…="" in files of their own as the host runs them, made again from the page each time (D720)', async ({ page, context, browserName }) => {
  const name = `hours-${browserName}-${test.info().retry}-${test.info().repeatEachIndex}`, address = `http://${name}.localhost:4185/`
  // A page Jean wrote in a task, as a file: a script inside it, and a button's onclick.
  await start(page)
  await page.evaluate(async (host) => {
    const [{ app, updateSettings, refreshConversations, openConversation }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }, { addFile }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js'), import('/core/files.js')])
    await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    const bytes = new TextEncoder().encode('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Opening hours</title><script>const opens = 7</script></head><body><h1>Opening hours</h1><button onclick="document.querySelector(&quot;output&quot;).textContent = `From ${opens}`">When?</button><output></output></body></html>')
    const made = await addFile(app.fs, { projectDir: app.projectDir, name: 'Opening hours.html', mimeType: 'text/html', bytes, pages: [], by: 'jean' })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Our hours' }), userRecord('Make a page of our opening hours', app.deviceId),
      envelope('jean', { sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'Writing', kind: 'edit', status: 'completed', _meta: { file: { ...made, size: bytes.length } } }, 0),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is the page.' } }, 0)])
    await refreshConversations()
    await openConversation(path)
  }, SHARE_URL)
  await page.locator('.msg-jean').getByRole('button', { name: 'Open Opening hours.html' }).click()
  const pane = page.locator('app-preview'), dialog = page.locator('dialog.site-publish')
  const publishing = async () => {
    await pane.getByRole('button', { name: 'Share or download' }).click()
    await page.getByRole('button', { name: 'Publish…' }).click()
    await expect(dialog).toBeVisible()
  }

  // Publish… where the host publishes sites, its name from the page's, as a site's would be.
  await publishing()
  await expect(dialog.getByRole('heading')).toHaveText('Publish Opening hours')
  await expect(dialog.getByLabel('Address')).toHaveValue('opening-hours')
  await dialog.getByLabel('Address').fill(name)
  await expect(dialog.locator('#publish-said')).toHaveText('This address is free.')
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click()
  await dialog.getByLabel('I’ve kept it somewhere safe').check()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog.locator('.site-state.is-live')).toContainText('Online until')
  const record = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js'), [site] = (await app.fs.list(`${app.projectDir}/sites`)).map(({ name }) => name)
    return JSON.parse((await app.fs.read(`${app.projectDir}/sites/${site}/site.json`)) ?? '{}')
  })
  expect(record).toMatchObject({ name: 'Opening hours', files: ['script-1.js', 'on.js', 'index.html'], published: { name, address } })
  expect(record.page).toMatch(/^files\//)

  // Online, under the host's policy, which runs only the site's own files: its button works.
  await throughHost(context)
  const visit = await context.newPage()
  await visit.goto(address)
  await visit.getByRole('button', { name: 'When?' }).click()
  await expect(visit.locator('output')).toHaveText('From 7')
  await visit.close()

  // Pressed again, the site is made again from the page: nothing changed.
  await dialog.locator('.dialog-head').getByRole('button', { name: 'Close' }).click()
  await publishing()
  await expect(dialog).toContainText('Nothing changed since it was published.')
})
