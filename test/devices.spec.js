// Your devices (D700): a person's devices paired through the relay (relay/, D45 · D226), each its own browser context, so its own
// storage. The one that has the Jean adds the other from Settings › Your devices (D726): a link, joined on the new one only once
// the person chooses Join, six digits the new one shows, typed there, and the new one, asked again, opens the same profile, with the
// brains and keys that cross and none of those that never do; settings then follow the person, a task goes from one to the other from
// its menu, and a device removed erases Jean there. Playwright's
// WebKit keeps nothing (a private window's storage), where a device is neither added nor joined: there, the exchange itself runs
// between two pages, from the modules, against the relay.
import { readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, openData, openSettings, openProfile, closeSettings, openTasks, ask, answered, RELAY_URL, BRAIN_URL } from './helpers.js'

const PASSWORD = 'a long and happy password'
/** A brain in the cloud with a key, which crosses, the fake brain answering for it; the fake brain itself, on this computer, stays (bundle.js). */
const CLOUD = { id: 'SKY00000000000000000000000', provider: 'openai', api: 'openai', baseURL: 'https://brain.example/v1', model: 'fake' }
/** Ids as Jean gives brains and connections, ULIDs: a connection with a key, one signed in to, a brain added later. */
const [NOTES, MAIL, OTHER] = ['NTES0000000000000000000000', 'PST00000000000000000000000', 'ANTHR000000000000000000000']
const TITLE = 'Plan the trip'

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */

/** @param {Page} page */
const ephemeral = (page) => page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)
/** This tab's profile, by its folder, once it has started there. @param {Page} page */
const here = (page) => page.evaluate(async () => ((await import('/ui/state.js')).app.fs && document.documentElement.classList.contains('is-ready') ? sessionStorage.getItem('app.profile') : null)).catch(() => null)
/** Every profile kept here, by its folder. @param {Page} page */
const profiles = (page) => page.evaluate(async () => (await (await import('/ui/state.js')).app.whole?.list('profiles'))?.map(({ name }) => `profiles/${name}`)).catch(() => null)
/** A file of the profile, through the storage worker, OPFS being sealed (D371). @param {Page} page @param {string} path */
const read = (page, path) => page.evaluate(async (path) => (await import('/ui/state.js')).app.fs.read(path), path)
/** settings.json as the page holds it. @param {Page} page */
const settingsOf = (page) => page.evaluate(async () => (await import('/ui/state.js')).app.settings.value).catch(() => null)
/** Settings changed, as Settings changes them. @param {Page} page @param {object} patch */
const change = (page, patch) => page.evaluate(async (patch) => (await import('/ui/state.js')).updateSettings(patch), patch)
/** A code that isn't this one. @param {string} code */
const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')
/** This device's name, as Your devices knows it. @param {Page} page */
const nameOf = (page) => page.evaluate(async () => {
  const { devices, own } = await import('/caps/devices/devices.js')
  return devices.value.find((one) => one.id === own.value)?.name ?? ''
})
/** @param {string} text */
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The relay named in this Jean's settings, as test/share.spec.js names a share host. @param {Page} page @param {string} [relay] */
const useRelay = (page, relay = RELAY_URL) => page.evaluate(async (relay) => {
  const { app, updateSettings } = await import('/ui/state.js')
  await updateSettings({ urls: { ...app.settings.value.urls, relay } })
}, relay)
/** An address outside this device for the relay, as relay.jean.is is, where the test's relay answers: the page's own record names it. */
const OUTSIDE = 'https://relay.outside.example/'
/** @param {import('@playwright/test').BrowserContext} context */
const outside = (context) => context.route(`${OUTSIDE}**`, async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace(OUTSIDE, RELAY_URL) }) }))

/**
 * Another device: a fresh Jean in a context of its own, in its language, the relay named, its voice its own.
 * @param {import('@playwright/test').Browser} browser @param {{ lang?: string, viewport?: { width: number, height: number }, relay?: string }} [options]
 */
async function device(browser, { lang = 'en', viewport, relay = RELAY_URL } = {}) {
  const context = await browser.newContext(viewport ? { viewport } : {})
  if (relay === OUTSIDE) await outside(context)
  const page = await context.newPage()
  await start(page, lang)
  await useRelay(page, relay)
  await change(page, { voice: 'Kyoko' })
  return page
}

/** Your devices found, as a capability found by the person is (ui/caps.js), and its section opened from Settings' menu (D726). @param {Page} page */
async function devicesPage(page) {
  await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('devices') })
  const settings = await openSettings(page, 'Your devices')
  await expect(settings.locator('.data-head h2')).toHaveText('Your devices')
  return settings
}

/**
 * A, the device that has the Jean: the fake brain connected, a brain in the cloud with its key, keys that never cross, its own voice; where
 * nothing is kept, the test is skipped. @param {Page} page
 */
async function deviceA(page) {
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  await connectFakeBrain(page)
  await useRelay(page)
  await page.evaluate(async ({ cloud, notes, mail }) => {
    const [{ app, updateSettings }, { setSecret }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js')])
    await updateSettings({ voice: 'Amélie', brains: [...app.settings.value.brains, cloud, { id: 'plan', provider: 'claudecode', api: 'anthropic', baseURL: 'http://127.0.0.1:23001/v1', model: 'm' }],
      connections: [{ id: notes, name: 'Notes', url: 'https://notes.example/mcp', auth: 'key' }, { id: mail, name: 'Mail', url: 'https://mail.example/mcp', auth: 'oauth' }] })
    for (const [id, value] of Object.entries({ [cloud.id]: 'key of the cloud', plan: 'key of the plan', 'computer-bridge': 'key of the bridge', [notes]: 'key of notes',
      [mail]: 'tokens of mail', signin: 'token of the sign-in', 'search:brave': 'key of brave' })) await setSecret(app.fs, id, value)
  }, { cloud: CLOUD, notes: NOTES, mail: MAIL })
}

/**
 * Adds a device as far as the six digits: Add a device on A, its link opened on B, which shows them. Gives A's Your devices, the link
 * and the code. @param {Page} a @param {Page} b
 */
async function exchange(a, b) {
  const settings = await devicesPage(a)
  await settings.getByRole('button', { name: 'Add a device' }).click()
  await expect(settings.locator('.devices-said')).toHaveText('Waiting for your other device…')
  await expect(settings.getByRole('heading', { name: 'Open this on your other device' })).toBeFocused()
  const link = await settings.getByRole('textbox', { name: 'The link to open on your other device' }).inputValue()
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4180\/#\/pair\/[\w-]{43}\.[\w-]{22}$/)
  // Its QR code holds the link, for a phone's camera, dark on light.
  const qr = settings.getByRole('img', { name: 'The link as a QR code, for your other device’s camera' })
  expect(await qr.evaluate(async (svg, link) => {
    const { size, get } = (await import('/vendor/lean-qr/lean-qr.mjs')).generate(link)
    const dark = Array.from({ length: size * size }, (_, i) => get(i % size, Math.floor(i / size))).filter(Boolean).length
    return [svg.getAttribute('viewBox') === `-4 -4 ${size + 8} ${size + 8}`, svg.querySelector('path')?.getAttribute('d')?.match(/M/g)?.length === dark, getComputedStyle(svg).backgroundColor]
  }, link)).toEqual([true, true, 'rgb(255, 255, 255)'])
  await b.goto(link)
  await joinThere(b)
  const digits = b.locator('app-settings .devices-digits')
  await expect(digits).toHaveText(/^\d{3} \d{3}$/)
  // The link leaves no trace in the address.
  await expect(b).toHaveURL(/#\/settings\/devices$/)
  return { settings, link, code: String(await digits.textContent()).replace(' ', '') }
}

/** On the new device, what joining does said, and Join chosen. @param {Page} b */
async function joinThere(b) {
  const flow = b.locator('app-settings .devices-flow')
  await expect(flow.locator('p').first()).toHaveText('Your Jean on your other device comes to this one, with its brains, settings and projects. You then type six digits there.')
  await flow.getByRole('button', { name: 'Join' }).click()
}

/** On the new device, the profile that came and the device it came from, opened with Join. @param {Page} b @param {Page} a */
async function trustThere(b, a) {
  const flow = b.locator('app-settings .devices-flow')
  const question = flow.getByRole('heading')
  await expect(question).toHaveText(new RegExp(`^Open “.+” from ${escaped(await nameOf(a))} on this device\\? Only if you just chose Add a device there yourself\\.$`))
  await expect(question).toBeFocused()
  await flow.getByRole('button', { name: 'Join' }).click()
}

/** The devices A has, by id, none removed. @param {Page} page */
const listed = (page) => page.evaluate(async () => (await (await import('/caps/devices/flow.js')).recordsOf((await import('/ui/state.js')).app.fs)).map((one) => one.id))
/** A, the digits right, sends the bundle and keeps nothing until B says it opened it. @param {Locator} settings @param {Page} a */
async function sent(settings, a) {
  await expect(settings.locator('.devices-said')).toHaveText(/^Sending your settings to .+…$/)
  expect((await listed(a)).length).toBe(1)
}

/** The six digits typed on A. @param {Locator} settings @param {string} code */
async function typeCode(settings, code) {
  const field = settings.getByLabel(/^The six digits .+ shows$/)
  await expect(field).toBeFocused()
  await field.fill(code)
  await settings.getByRole('button', { name: 'Add', exact: true }).click()
}

/** A and B paired, B in A's profile and listening, A's Your devices back at rest. Gives A's profile and its Your devices. @param {Page} a @param {Page} b */
async function pair(a, b) {
  const { settings, code } = await exchange(a, b)
  await typeCode(settings, code)
  await sent(settings, a)
  await trustThere(b, a)
  await expect(settings.locator('.devices-said')).toHaveText(/ is added\. It opens with your brains, settings and projects\.$/)
  const dir = await here(a)
  await expect.poll(() => here(b), { timeout: 20_000 }).toBe(dir)
  await settings.getByRole('button', { name: 'Done' }).click()
  await expect(settings.locator('.devices-flow > .list > li')).toHaveCount(2)
  return { dir, settings }
}

test('a device added: six digits typed on the one that has the Jean, and the other opens the same profile, with the keys that cross alone', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  // The brain in the cloud, answered by the fake brain, with the key it is asked with.
  const asked = /** @type {string[]} */ ([])
  await b.context().route('https://brain.example/v1/**', (route) => {
    asked.push(route.request().headers().authorization ?? '')
    return route.fetch({ url: route.request().url().replace('https://brain.example/v1', BRAIN_URL) }).then((response) => route.fulfill({ response }))
  })
  const first = await here(b)
  const { settings, code } = await exchange(page, b)
  await typeCode(settings, code)
  await sent(settings, page)
  await trustThere(b, page)
  await expect(settings.locator('.devices-said')).toHaveText(/ is added\. It opens with your brains, settings and projects\.$/)
  // B opens A's profile, under its folder's own name, its first-run profile gone.
  const dir = await here(page)
  await expect.poll(() => here(b), { timeout: 20_000 }).toBe(dir)
  expect(first).not.toBe(dir)
  expect(await profiles(b)).toEqual([dir])
  const settled = await settingsOf(b)
  expect(settled.brains.map((/** @type {{ id: string }} */ brain) => brain.id)).toEqual([CLOUD.id])
  expect(settled.activeBrain).toBe(CLOUD.id)
  expect(settled.connections.map((/** @type {{ id: string }} */ one) => one.id)).toEqual([NOTES, MAIL])
  expect(settled.voice).toBe('Kyoko')
  expect(settled.urls.relay).toBe(RELAY_URL)
  expect(settled.unlocked).toContain('devices')
  // Its keys: those that cross, never a plan's, the bridge's, a connection's tokens or a sign-in's; its own, and the store's.
  const keys = JSON.parse(String(await read(b, '.secrets/keys.json')))
  expect(Object.keys(keys).sort()).toEqual([NOTES, CLOUD.id, 'device', 'devices', 'search:brave', 'store'])
  expect(JSON.parse(keys.devices).map((/** @type {{ removedAt?: string }} */ one) => Boolean(one.removedAt))).toEqual([false, false])
  expect([keys[CLOUD.id], keys[NOTES], keys['search:brave']]).toEqual(['key of the cloud', 'key of notes', 'key of brave'])
  expect(JSON.stringify(keys)).not.toMatch(/key of the plan|key of the bridge|tokens of mail|token of the sign-in/)
  // Its projects are A's, one Home.
  const [homeA, homeB] = await Promise.all([page, b].map((one) => one.evaluate(async () => (await import('/ui/state.js')).app.projects.value.map((project) => project.dir))))
  expect(homeB).toEqual(homeA)
  // It answers with A's brain and its key, never asking for one.
  await expect(b.locator('.brain-chip')).toHaveAttribute('aria-label', /^Choose a brain: /)
  await ask(b, 'Explain photosynthesis in simple words')
  await answered(b)
  expect(asked.at(-1)).toBe('Bearer key of the cloud')

  // Both list two devices, this one first.
  await settings.getByRole('button', { name: 'Done' }).click()
  await expect(settings.locator('.devices-flow > .list > li')).toHaveCount(2)
  await expect(settings.locator('.devices-flow > .list > li').first()).toContainText('This device, added')
  // B's, from its button at the end of the person's row, the menu no longer holding it.
  await expect((await openProfile(b)).getByRole('button', { name: 'Your devices' })).toHaveCount(0)
  await b.keyboard.press('Escape')
  await (await openTasks(b)).locator('.profile').getByRole('button', { name: 'Your devices' }).click()
  const there = b.locator('app-settings dialog[open]')
  await expect(there.locator('.data-head h2')).toHaveText('Your devices')
  await expect(there.locator('.devices-flow > .list > li')).toHaveCount(2)
  await expect(there.locator('.devices-flow > .list > li').first()).toContainText('This device, added')
  await expect(there.locator('.devices-flow > .list > li').last()).toContainText('Added')
  await b.context().close()
})

test('three wrong codes end the adding, on both devices', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  const { settings, code } = await exchange(page, b)
  await typeCode(settings, wrong(code))
  await expect(settings.locator('.devices-wrong')).toHaveText('Those digits don’t match. 2 tries left.')
  // What was typed is selected, to type again.
  const field = settings.getByLabel(/^The six digits .+ shows$/)
  expect(await field.evaluate((box) => /** @type {HTMLInputElement} */ (box).selectionEnd - (/** @type {HTMLInputElement} */ (box).selectionStart ?? 0))).toBe(6)
  await field.fill(wrong(wrong(code)))
  await settings.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(settings.locator('.devices-wrong')).toHaveText('Those digits don’t match. 1 try left.')
  await field.fill(wrong(wrong(wrong(code))))
  await settings.getByRole('button', { name: 'Add', exact: true }).click()
  const said = 'Three wrong tries: adding stopped, to be safe. Start again.'
  await expect(settings.locator('.devices-wrong')).toHaveText(said)
  await expect(settings.getByLabel(/^The six digits .+ shows$/)).toHaveCount(0)
  // B hears it, rather than waiting for a profile that won't come.
  await expect(b.locator('app-settings .devices-wrong')).toHaveText(said)
  await expect(b.locator('app-settings .devices-digits')).toHaveCount(0)
  expect(await here(b)).not.toBe(await here(page))
  await settings.locator('.devices-actions').getByRole('button', { name: 'Close' }).click()
  await expect(settings.getByRole('button', { name: 'Add a device' })).toBeFocused()
  await b.context().close()
})

test('Cancel on the device that has the Jean, once the other shows its digits, ends the adding there too', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  const { settings } = await exchange(page, b)
  await settings.locator('.devices-actions').getByRole('button', { name: 'Cancel' }).click()
  await expect(settings.getByRole('button', { name: 'Add a device' })).toBeFocused()
  await expect(b.locator('app-settings .devices-wrong')).toHaveText('Your other device stopped adding this one. Start again there.')
  await expect(b.locator('app-settings .devices-digits')).toHaveCount(0)
  await b.context().close()
})

test('a second device opening the same link hears it was already used', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  const { link } = await exchange(page, b)
  // Pasted into a fresh device's box, as from a camera app that opened it elsewhere: never typed there, but where opening it leads (D726).
  const c = await device(browser)
  await c.locator('#prompt').evaluate((box, link) => {
    const data = new DataTransfer()
    data.setData('text/plain', ` ${link}\n`)
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, link)
  await expect(c.locator('#prompt')).toHaveValue('')
  await expect(c).toHaveURL(/#\/settings\/devices$/)
  const there = c.locator('app-settings dialog[open]')
  await there.getByRole('button', { name: 'Join' }).click()
  await expect(there.locator('.devices-wrong')).toHaveText('This link was already used. On your other device, choose Add a device again for a new one.')
  await expect(c.locator('app-settings .devices-digits')).toHaveCount(0)
  // B's adding goes on.
  await expect(b.locator('app-settings .devices-digits')).toHaveText(/^\d{3} \d{3}$/)
  await Promise.all([b, c].map((one) => one.context().close()))
})

test('settings follow the person from one device to the other, and each keeps its voice', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  await pair(page, b)
  await closeSettings(page)
  // The person's name and language, changed on A, reach B, which is open and speaks that language at once.
  await change(page, { name: 'Ada' })
  await page.evaluate(async () => (await import('/ui/state.js')).setLocale('fr'))
  await expect.poll(async () => (await settingsOf(b))?.locale, { timeout: 15_000 }).toBe('fr')
  expect((await settingsOf(b)).name).toBe('Ada')
  await expect(b.locator('html')).toHaveAttribute('lang', 'fr')
  await expect((await openTasks(b)).locator('.profile-name')).toHaveText('Ada')
  expect((await settingsOf(b)).voice).toBe('Kyoko')
  // A brain added on A after the pairing reaches B with its key, and goes from B once removed on A.
  await page.evaluate(async (other) => {
    const [{ app, updateSettings }, { setSecret }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js')])
    await setSecret(app.fs, other, 'key of the other')
    await updateSettings({ brains: [...app.settings.value.brains, { id: other, provider: 'mistral', api: 'openai', baseURL: 'https://api.mistral.ai/v1', model: 'small' }] })
  }, OTHER)
  await expect.poll(async () => (await settingsOf(b))?.brains.map((/** @type {{ id: string }} */ brain) => brain.id), { timeout: 15_000 }).toEqual([CLOUD.id, OTHER])
  expect(JSON.parse(String(await read(b, '.secrets/keys.json')))[OTHER]).toBe('key of the other')
  await page.evaluate(async (other) => {
    const { app, updateSettings } = await import('/ui/state.js')
    await updateSettings({ brains: app.settings.value.brains.filter((brain) => brain.id !== other) })
  }, OTHER)
  await expect.poll(async () => (await settingsOf(b))?.brains.map((/** @type {{ id: string }} */ brain) => brain.id), { timeout: 15_000 }).toEqual([CLOUD.id])
  // And back: changed on B, it reaches A, A's voice its own.
  await change(b, { name: 'Ada Lovelace' })
  await expect.poll(async () => (await settingsOf(page))?.name, { timeout: 15_000 }).toBe('Ada Lovelace')
  expect(await settingsOf(page)).toMatchObject({ locale: 'fr', voice: 'Amélie' })
  expect((await settingsOf(b)).voice).toBe('Kyoko')
  await b.context().close()
})

test('a task handed from one device to the other opens there under the same path', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  await pair(page, b)
  await closeSettings(page)
  const path = await page.evaluate(async (title) => {
    const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title }), userRecord('Plan my trip to Lyon', app.deviceId),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is **the plan**.' } }, 0)])
    await refreshConversations()
    return path
  }, TITLE)
  // Each device by the name A knows it by.
  const [mine, theirs] = await page.evaluate(async () => {
    const { devices, own } = await import('/caps/devices/devices.js')
    return [devices.value.find((one) => one.id === own.value)?.name, devices.value.find((one) => one.id !== own.value)?.name]
  })
  const row = (await openTasks(page)).locator('.history-list li:not([aria-hidden])', { hasText: TITLE })
  await row.hover()
  await row.getByRole('button', { name: 'More options' }).click()
  await row.getByRole('button', { name: `Send to ${theirs}` }).click()
  await expect(page.locator('.toast')).toContainText(`Sent to ${theirs}.`)
  // B says where it came from, and opens it.
  const toast = b.locator('.toast', { hasText: `From ${mine}: ${TITLE}` })
  await expect(toast).toBeVisible()
  await toast.getByRole('button', { name: 'Open' }).click()
  await expect(b.locator('.msg-user')).toHaveText('Plan my trip to Lyon')
  await expect(b.locator('.msg-jean strong')).toHaveText('the plan')
  expect(await b.evaluate(async () => (await import('/ui/state.js')).app.current.value?.path)).toBe(path)
  expect(await read(b, path)).toBe(await read(page, path))
  await b.context().close()
})

test('an answer on this device stays Kept private while the tab waits on its mailbox: the wait under way ends, and what another device sends meanwhile is read once it is written', async ({ page, browser }) => {
  // A with the fake brain alone, on this computer, as Ollama would be.
  await outside(page.context())
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  await connectFakeBrain(page)
  await useRelay(page, OUTSIDE)
  const b = await device(browser, { relay: OUTSIDE })
  await pair(page, b)
  await closeSettings(page)
  // A listens, waiting on its mailbox at that address.
  await expect.poll(() => page.evaluate((relay) => performance.getEntriesByType('resource').some(({ name }) => name.startsWith(relay)), OUTSIDE)).toBe(true)
  // An answer of five seconds, during which B changes a setting, which it sends A two seconds later: A's wait would end on it.
  await ask(page, 'Count slowly to five')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(1)
  await change(b, { name: 'Ada' })
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.msg-jean').last()).toContainText('I counted to five, slowly.')
  await expect(page.locator('.msg-jean .msg-actions').last().getByRole('button', { name: 'About this answer' })).toHaveClass(/is-local/)
  // A reads what B sent once the answer is written.
  await expect.poll(async () => (await settingsOf(page))?.name, { timeout: 20_000 }).toBe('Ada')
  // The waits on the relay still routed end with the test.
  await Promise.all([page.context(), b.context()].map((context) => context.unrouteAll({ behavior: 'ignoreErrors' })))
  await b.context().close()
})

test('a device removed with its box ticked erases Jean there the next time it reads its mailbox', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  const { dir, settings } = await pair(page, b)
  // B closed meanwhile, as a phone put away: its storage stays with its context.
  const context = b.context()
  await b.close()
  // A site published here, whose key crossed (D720).
  await page.evaluate(async () => {
    const [{ app }, { setSecret }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js')])
    await app.fs.write(`${app.projectDir}/sites/01JSITE0000000000000000000-bakery/site.json`, JSON.stringify({ format: 1, name: 'Bakery', files: [], published: { name: 'lyon-bakery' } }))
    await setSecret(app.fs, 'site:01JSITE0000000000000000000', '0123-4567-89AB-CDEF-0123-4567-89AB-CDEF')
  })
  await settings.locator('.devices-flow > .list > li').last().getByRole('button', { name: 'Remove' }).click()
  const dialog = page.locator('dialog.devices-remove[open]')
  await expect(dialog.getByRole('heading')).toHaveText(/^Remove .+\?$/)
  // The device's name set apart in Jean's sentence, which reads the page's way.
  await expect(dialog.getByRole('heading').locator('bdi')).toHaveCount(1)
  expect(await dialog.locator('[dir="auto"]').count()).toBe(0)
  await expect(dialog.getByLabel('Also erase Jean from it')).toBeChecked()
  // The relay unreachable: the removal stands here, the keys to revoke are said, and the device is named as not told yet, nothing said of
  // erasing it until it is; this device tells it on its own as soon as it can.
  await page.route(`${RELAY_URL}v1/m/**`, (route) => (route.request().method() === 'POST' ? route.abort() : route.fallback()))
  await dialog.getByRole('button', { name: 'Remove' }).click()
  await expect(dialog.getByRole('status')).toContainText(/ is removed\.\s*It may still hold/)
  await expect(dialog.getByRole('alert')).toHaveText(/^.+ hasn’t been told yet\. This device tells it on its own as soon as it can\.\s*$/)
  await expect(dialog.getByRole('alert').locator('bdi')).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeFocused()
  await page.unroute(`${RELAY_URL}v1/m/**`)
  // What it may still hold, by where each was made, never a key, and the service it signed in to itself; then the site, by its name online.
  await expect(dialog.locator('li')).toHaveText(['OpenAI · fake', 'Notes', 'Brave Search', 'Mail', 'lyon-bakery'])
  await expect(dialog.getByRole('status')).toContainText('It may still change these sites online. To stop it, open each one, choose Publish…, then Make a new recovery code:')
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(settings.locator('.devices-flow > .list > li')).toHaveCount(1)
  // Back online, what waits goes on its own.
  await page.evaluate(() => dispatchEvent(new Event('online')))
  // B opened again reads its mailbox: the profile is erased there, and it starts afresh.
  const again = await context.newPage()
  await again.goto('./')
  await expect.poll(() => profiles(again), { timeout: 20_000 }).not.toContain(dir)
  await expect.poll(() => here(again), { timeout: 20_000 }).toMatch(/^profiles\/[0-9A-HJKMNP-TV-Z]{26}-profile$/)
  expect(await here(again)).not.toBe(dir)
  await expect(again.locator('.hero-question')).toBeVisible()
  expect(await read(again, '.secrets/keys.json')).toBeNull()
  await context.close()
})

test('a device removed with its box unticked keeps Jean on its own, and added again, joins in place', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  const { dir, settings } = await pair(page, b)
  // A task of B's own, which stays through it all.
  const mine = await b.evaluate(async () => {
    const [{ app }, { createConversation }] = await Promise.all([import('/ui/state.js'), import('/core/conversations.js')])
    return (await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })).path
  })
  await settings.locator('.devices-flow > .list > li').last().getByRole('button', { name: 'Remove' }).click()
  const dialog = page.locator('dialog.devices-remove[open]')
  await dialog.getByLabel('Also erase Jean from it').uncheck()
  await dialog.getByRole('button', { name: 'Remove' }).click()
  await expect(dialog.getByRole('status')).toContainText(/ is removed\./)
  await expect(dialog.getByRole('status')).not.toContainText('erased')
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(b.locator('.toast')).toContainText('Another of your devices removed this one. Jean stays here, on its own.')
  expect(await here(b)).toBe(dir)
  // It forgets who it is, and keeps the devices it knew, listing none, only to be added again in place.
  await expect.poll(() => read(b, '.secrets/keys.json').then((text) => Object.keys(JSON.parse(String(text))).sort())).toEqual([NOTES, CLOUD.id, 'devices', 'search:brave'])
  expect(await b.evaluate(async () => (await import('/caps/devices/devices.js')).devices.value.length)).toBe(0)
  // Added again: the profile open there is A's, filled again, B's own task kept.
  await closeSettings(page)
  const { settings: again, code } = await exchange(page, b)
  const reloaded = b.waitForEvent('load', { timeout: 20_000 })
  await typeCode(again, code)
  await sent(again, page)
  await trustThere(b, page)
  await expect(again.locator('.devices-said')).toHaveText(/ is added\./)
  await expect(b.locator('app-settings .devices-said')).toHaveText('Done. Opening your Jean…')
  // Opened again where it was, on Your devices, which lists both.
  await reloaded
  await expect(b.locator('app-settings .devices-flow > .list > li')).toHaveCount(2)
  await expect.poll(() => here(b)).toBe(dir)
  expect(await profiles(b)).toEqual([dir])
  expect(await read(b, mine)).not.toBeNull()
  // Its keys again, the store's among them, A having let its new token in.
  expect(Object.keys(JSON.parse(String(await read(b, '.secrets/keys.json')))).sort()).toEqual([NOTES, CLOUD.id, 'device', 'devices', 'search:brave', 'store'])
  await again.getByRole('button', { name: 'Done' }).click()
  await expect(again.locator('.devices-flow > .list > li')).toHaveCount(2)
  // And it hears A again.
  await change(page, { name: 'Ada' })
  await expect.poll(async () => (await settingsOf(b))?.name, { timeout: 15_000 }).toBe('Ada')
  await b.context().close()
})

test('a locked profile asks for its lock before the six digits', async ({ page, browser }) => {
  await deviceA(page)
  await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('lock') })
  const lock = await openData(page, 'lock')
  const part = lock.locator('.lock-part')
  await part.getByRole('button', { name: 'Use a password' }).click()
  await part.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await part.getByLabel('The same password again').fill(PASSWORD)
  await part.getByRole('button', { name: 'Next' }).click()
  const recovery = String(await part.locator('.lock-code').textContent())
  await part.getByLabel('Type its last four characters').fill(recovery.replace(/-/g, '').slice(-4))
  await part.getByRole('button', { name: 'Set a lock' }).click()
  await expect(part).toContainText('Locked with your password.')
  await closeSettings(page)

  const b = await device(browser)
  const settings = await devicesPage(page)
  await settings.getByRole('button', { name: 'Add a device' }).click()
  const link = await settings.getByRole('textbox', { name: 'The link to open on your other device' }).inputValue()
  await b.goto(link)
  await joinThere(b)
  const digits = b.locator('app-settings .devices-digits')
  await expect(digits).toHaveText(/^\d{3} \d{3}$/)
  // The lock first, with no field for the digits yet.
  await expect(settings.getByRole('heading', { name: /^Unlock to add .+$/ })).toBeVisible()
  await expect(settings.getByLabel(/^The six digits .+ shows$/)).toHaveCount(0)
  await settings.getByLabel('Password', { exact: true }).fill('not the password at all')
  await settings.getByRole('button', { name: 'Unlock' }).click()
  await expect(settings.locator('.lock-said')).toHaveText('That doesn’t open it.')
  await expect(settings.getByLabel(/^The six digits .+ shows$/)).toHaveCount(0)
  await settings.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await settings.getByRole('button', { name: 'Unlock' }).click()
  await typeCode(settings, String(await digits.textContent()).replace(' ', ''))
  await sent(settings, page)
  await trustThere(b, page)
  await expect(settings.locator('.devices-said')).toHaveText(/ is added\./)
  await expect.poll(() => here(b), { timeout: 20_000 }).toBe(await here(page))
  await b.context().close()
})

test('a link opened does nothing until Join, and the profile that comes, from a device this one doesn’t know, opens only on Join again', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  const first = await here(b)
  const settings = await devicesPage(page)
  await settings.getByRole('button', { name: 'Add a device' }).click()
  const link = await settings.getByRole('textbox', { name: 'The link to open on your other device' }).inputValue()
  await b.goto(link)
  const flow = b.locator('app-settings .devices-flow')
  await expect(flow.getByRole('button', { name: 'Join' })).toBeVisible()
  await expect(b).toHaveURL(/#\/settings\/devices$/)
  // Nothing goes from B until Join: A still waits, B shows no digits.
  await b.waitForTimeout(1500)
  await expect(settings.locator('.devices-said')).toHaveText('Waiting for your other device…')
  await expect(flow.locator('.devices-digits')).toHaveCount(0)
  // Cancelled, nothing was sent: the same link, pasted later in the page for joining, which B, alone, leads to, and joined, still works.
  await flow.getByRole('button', { name: 'Cancel' }).click()
  await b.locator('app-settings').getByRole('button', { name: 'Bring Jean here from another device' }).click()
  await expect(b.locator('app-settings .data-head h2')).toBeFocused()
  await expect(b.locator('app-settings .data-head h2')).toHaveText('Bring your Jean here')
  await expect(b).toHaveURL(/#\/settings\/devices\/join$/)
  await flow.getByRole('textbox', { name: 'A link from your other device' }).fill(link)
  await flow.getByRole('button', { name: 'Join' }).click()
  const digits = flow.locator('.devices-digits')
  await expect(digits).toHaveText(/^\d{3} \d{3}$/)
  await typeCode(settings, String(await digits.textContent()).replace(' ', ''))
  await sent(settings, page)
  // B names the profile and the device it came from, and opens nothing until Join; A keeps nothing meanwhile.
  const question = flow.getByRole('heading')
  await expect(question).toHaveText(`Open “Jean” from ${await nameOf(page)} on this device? Only if you just chose Add a device there yourself.`)
  await expect(question.locator('bdi')).toHaveCount(2)
  await b.waitForTimeout(1000)
  expect([await here(b), await profiles(b)]).toEqual([first, [first]])
  // Cancel: B stays as it was, with none of A's keys, and A, told, keeps nothing and says so.
  await flow.getByRole('button', { name: 'Cancel' }).click()
  await expect(flow.getByRole('button', { name: 'Add a device' })).toBeFocused()
  expect([await here(b), await profiles(b)]).toEqual([first, [first]])
  expect(String(await read(b, '.secrets/keys.json'))).not.toMatch(/key of the cloud/)
  await expect(settings.locator('.devices-wrong')).toHaveText('Your other device stopped adding this one. Start again there.')
  expect(await listed(page)).toHaveLength(1)
  await settings.locator('.devices-actions').getByRole('button', { name: 'Close' }).click()
  await expect(settings.locator('.devices-flow > .list > li')).toHaveCount(1)
  await b.context().close()
})

test('Cancel on the device that has the Jean while the other asks: Join there then opens nothing', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  const first = await here(b)
  const { settings, code } = await exchange(page, b)
  await typeCode(settings, code)
  await sent(settings, page)
  await expect(b.locator('app-settings .devices-flow').getByRole('heading')).toHaveText(/^Open “/)
  await settings.locator('.devices-actions').getByRole('button', { name: 'Cancel' }).click()
  await expect(settings.getByRole('button', { name: 'Add a device' })).toBeFocused()
  await b.locator('app-settings .devices-flow').getByRole('button', { name: 'Join' }).click()
  await expect(b.locator('app-settings .devices-wrong')).toHaveText('Your other device stopped adding this one. Start again there.')
  expect([await here(b), await profiles(b), await listed(page)]).toEqual([first, [first], [await page.evaluate(async () => (await import('/caps/devices/devices.js')).own.value)]])
  await b.context().close()
})

for (const lang of ['ar', 'ja']) {
  test(`joining shows its steps and its code in the device’s language, at 320 px (${lang})`, async ({ page, browser }) => {
    await deviceA(page)
    const words = JSON.parse(await readFile(new URL(`../app/locales/devices/${lang}.json`, import.meta.url), 'utf8'))
    const b = await device(browser, { lang, viewport: { width: 320, height: 640 } })
    const settings = await devicesPage(page)
    await settings.getByRole('button', { name: 'Add a device' }).click()
    const link = await settings.getByRole('textbox', { name: 'The link to open on your other device' }).inputValue()
    await b.goto(link)
    const flow = b.locator('app-settings .devices-flow')
    /** Nothing wider than the screen, and nothing cut. */
    const fits = () => b.evaluate(() => [document.documentElement.scrollWidth <= innerWidth,
      [...document.querySelectorAll('app-settings .devices-flow *')].every((element) => element.scrollWidth <= element.clientWidth + 1 || getComputedStyle(element).display === 'inline')])
    // What joining does, then Join.
    await expect(flow.locator('p').first()).toHaveText(words['devices.coming'].replaceAll('{name}', 'Jean'))
    await expect(flow.getByRole('button')).toHaveText([words['devices.join'], words['devices.cancel']])
    expect(await fits()).toEqual([true, true])
    await flow.getByRole('button', { name: words['devices.join'] }).click()
    await expect(flow.locator('.devices-digits')).toHaveText(/^\d{3} \d{3}$/)
    await expect(b.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    await expect(flow.getByRole('heading')).toHaveText(words['devices.typeThere'])
    await expect(flow.getByRole('button')).toHaveText(words['devices.cancel'])
    // The digits read left to right, in Latin digits, whatever the language around them.
    await expect(flow.locator('.devices-digits')).toHaveAttribute('dir', 'ltr')
    expect(await fits()).toEqual([true, true])
    // What came and from where, each name set apart, in a sentence that reads the page's way (once devices.trust is in this language).
    await typeCode(settings, String(await flow.locator('.devices-digits').textContent()).replace(' ', ''))
    await expect(flow.getByRole('heading').locator('bdi')).toHaveCount(2)
    await expect(flow.getByRole('heading')).not.toHaveAttribute('dir', /./)
    await expect(flow.getByRole('button')).toHaveText([words['devices.join'], words['devices.cancel']])
    expect(await fits()).toEqual([true, true])
    await flow.getByRole('button', { name: words['devices.cancel'] }).click()
    await b.context().close()
  })
}

test('the exchange runs in this engine, between two pages and the relay, up to the same six digits, and a second hello is refused', async ({ page, browser }) => {
  // What differs between engines: Web Crypto (HKDF, ECDH, AES-GCM, P-256 keys as JWK), and the relay reached across origins,
  // with a bearer token and a read that waits. The steps themselves are node --test's (test/devices.test.js).
  await start(page)
  const b = await (await browser.newContext()).newPage()
  await start(b)
  const modules = ['/caps/devices/pair.js', '/ui/relay.js', '/ui/seal.js', '/caps/share/seal.js']
  // A: a link's secret and its key, the pairing mailbox opened once, and one for B's reveal.
  const a = await page.evaluateHandle(async ([modules, base]) => {
    const [pair, relay, seal, share] = await Promise.all(modules.map((one) => import(one)))
    const me = await seal.boxPair()
    const s = share.random(32)
    const [pairing, answers] = [await pair.pairingBox(s), await relay.mailbox()]
    await relay.open(base, pairing.token, { once: true })
    await relay.open(base, answers.token)
    const fpA = await seal.fingerprintOf(me.public)
    return { pair, relay, seal, me, s, pairing, answers, fpA, link: pair.linkOf('http://127.0.0.1:4180/', s, fpA) }
  }, /** @type {const} */ ([modules, RELAY_URL]))
  const link = await a.evaluate((a) => a.link)
  // B: its keys and mailbox, its hello sent to the pairing mailbox.
  const one = await b.evaluateHandle(async ([modules, base, link]) => {
    const [pair, relay, seal] = await Promise.all(modules.map((one) => import(one)))
    const got = /** @type {{ s: Uint8Array, fpA: string }} */ (pair.parseLink(link))
    const box = await relay.mailbox()
    const me = { ...await seal.boxPair(), token: box.token, mailbox: box.id }
    await relay.open(base, me.token)
    const hello = await pair.sealHello(got.s, { key: me.public, mailbox: me.mailbox, name: 'Mac · Safari' })
    await relay.send(base, (await pair.pairingBox(got.s)).id, hello.bytes)
    return { pair, relay, me, got, hello }
  }, /** @type {const} */ ([modules, RELAY_URL, link]))
  // A reads the hello, waiting on the relay, and answers with its nonce.
  const name = await a.evaluate(async (a, base) => {
    const { messages } = await a.relay.read(base, a.pairing.token, { wait: 25 })
    const hello = await a.pair.openHello(a.s, messages[0].bytes)
    const nonce = await a.pair.sealNonce(a.s, { key: a.me.public, mailbox: a.answers.id })
    await a.relay.send(base, hello.mailbox, nonce.bytes)
    Object.assign(a, { hello, nA: nonce.nA })
    return hello.name
  }, RELAY_URL)
  expect(name).toBe('Mac · Safari')
  // B takes the nonce only from the link's key, reveals its own, and draws the code.
  const codeB = await one.evaluate(async (b, base) => {
    const { messages } = await b.relay.read(base, b.me.token, { wait: 25 })
    const nonce = await b.pair.openNonce(b.got.s, b.got.fpA, messages[0].bytes)
    await b.relay.send(base, nonce.mailbox, await b.pair.sealReveal(b.got.s, b.hello.nB))
    return b.pair.codeOf({ s: b.got.s, fpA: b.got.fpA, keyB: b.me.public, mailboxB: b.me.mailbox, nA: nonce.nA, nB: b.hello.nB })
  }, RELAY_URL)
  // A checks the reveal against the commitment and draws the same code.
  const codeA = await a.evaluate(async (a, base) => {
    const { messages } = await a.relay.read(base, a.answers.token, { wait: 25 })
    const nB = await a.pair.openReveal(a.s, a.hello.commit, messages[0].bytes)
    return a.pair.codeOf({ s: a.s, fpA: a.fpA, keyB: a.hello.key, mailboxB: a.hello.mailbox, nA: a.nA, nB })
  }, RELAY_URL)
  expect(codeA).toMatch(/^\d{6}$/)
  expect(codeB).toBe(codeA)
  // An envelope from A's key to B's opens on B, from A's key alone.
  const sent = await a.evaluate(async (a, base) => a.relay.send(base, a.hello.mailbox, await a.pair.envelope(a.me, a.hello.key, { kind: 'bundle', profile: 'yes' })), RELAY_URL)
  expect(sent).toBeGreaterThan(0)
  const opened = await one.evaluate(async (b, [base, key]) => {
    const { messages } = await b.relay.read(base, b.me.token, { after: 1, wait: 25 })
    return (await b.pair.openEnvelope(b.me, [key], messages[0].bytes)).value
  }, /** @type {const} */ ([RELAY_URL, await a.evaluate((a) => a.me.public)]))
  expect(opened).toEqual({ kind: 'bundle', profile: 'yes' })
  // A second hello to the same link: the relay refuses it.
  const again = await b.evaluate(async ([modules, base, link]) => {
    const [pair, relay, seal] = await Promise.all(modules.map((one) => import(one)))
    const got = /** @type {{ s: Uint8Array, fpA: string }} */ (pair.parseLink(link))
    const hello = await pair.sealHello(got.s, { key: (await seal.boxPair()).public, mailbox: (await relay.mailbox()).id, name: 'Another' })
    return relay.send(base, (await pair.pairingBox(got.s)).id, hello.bytes).then(() => 0, (/** @type {any} */ error) => error.status)
  }, /** @type {const} */ ([modules, RELAY_URL, link]))
  expect(again).toBe(409)
  await a.evaluate(async (a, base) => { await a.relay.remove(base, a.pairing.token); await a.relay.remove(base, a.answers.token) }, RELAY_URL)
  await b.context().close()
})

/** A round with the store now, as one comes every minute in sight: the paths that came in. @param {Page} page */
const storeRound = (page) => page.evaluate(async () => (await import('/caps/sync/rounds.js')).round())
/** The paths the store's last round left the same on both sides. @param {Page} page */
const inStore = async (page) => Object.keys(JSON.parse(String(await read(page, '.cache/store.json') ?? '{}')).files ?? {})
/** The store's version of a path, as the last round left it. @param {Page} page @param {string} path */
const revOf = async (page, path) => JSON.parse(String(await read(page, '.cache/store.json') ?? '{}')).files?.[path]?.[3]
/** A task made on a device, as Jean writes one, with a request and an answer. @param {Page} page @param {string} title @param {string} words */
const taskOn = (page, title, words) => page.evaluate(async ({ title, words }) => {
  const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }] = await Promise.all([
    import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
  const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
  await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title }), userRecord(words, app.deviceId), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is **the plan**.' } }, 0)])
  await refreshConversations()
  return path
}, { title, words })
/** Every file the relay keeps for a store, as bytes read as text, wherever this run's relay keeps its folder. @param {string} sid */
async function relayHolds(sid) {
  const runs = (await readdir(tmpdir())).filter((name) => name.startsWith('jean-mailboxes-')).map((name) => join(tmpdir(), name, 'stores', sid))
  const texts = []
  for (const dir of runs) for (const entry of await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => [])) if (entry.isFile()) texts.push(await readFile(join(entry.parentPath, entry.name), 'latin1'))
  return texts
}

test('a task made on one device shows on the other through the store, and the relay keeps none of its words', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  const { settings } = await pair(page, b)
  // Both hold the store's keys, made by A as it added B, each with a token of its own.
  const [keysA, keysB] = await Promise.all([page, b].map(async (one) => JSON.parse(JSON.parse(String(await read(one, '.secrets/keys.json'))).store)))
  expect([keysB.sid, keysB.N, keysB.relay]).toEqual([keysA.sid, keysA.N, RELAY_URL])
  expect(keysB.token).not.toBe(keysA.token)
  await expect(settings.locator('.devices-flow > .hint:not(.devices-synced)')).toHaveText(/ in common$/)
  await closeSettings(page)
  const path = await taskOn(page, TITLE, 'Plan my trip to Lyon by the sea')
  await expect.poll(async () => { await storeRound(page); return inStore(page) }, { timeout: 20_000 }).toContain(path)
  await expect.poll(async () => { await storeRound(b); return read(b, path) }, { timeout: 20_000 }).toBe(await read(page, path))
  await expect((await openTasks(b)).locator('.history-list li:not([aria-hidden])', { hasText: TITLE })).toBeVisible()
  // Your data says where they are safe now, never that they are only here, and offers no device to add (D726).
  const data = await openSettings(page, 'Your data')
  await expect(data.locator('.lede strong')).toHaveText('Your tasks and files are also on your other devices, sealed so only they can read them.')
  await expect(data.locator('.data-fix')).toHaveCount(0)
  await closeSettings(page)
  const held = (await relayHolds(keysA.sid)).join('\n')
  expect(held.length).toBeGreaterThan(0)
  for (const word of [TITLE, 'Lyon', 'the plan', 'conversations', 'projects', 'key of the cloud']) expect(held).not.toContain(word)
  await b.context().close()
})

test('what one device sends reaches the other without waiting for its minute, told by its mailbox, whose Your devices breathes meanwhile, and says when it last synced', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  // B's round every minute never comes, from the page the pairing opens on: what A sends reaches it only by being told.
  await b.context().addInitScript(() => { const every = setInterval; Object.assign(window, { setInterval: (/** @type {() => void} */ run, /** @type {number} */ ms) => (ms === 60_000 ? 0 : every(run, ms)) }) })
  await pair(page, b)
  await closeSettings(page)
  const foot = (await openTasks(b)).locator('.profile').getByRole('button', { name: /^Your devices/ })
  await expect(foot).toHaveAccessibleName('Your devices')
  // B's rounds as it opened, and those the files they brought called for, over: from here, only being told brings it another.
  await expect.poll(() => b.evaluate(async () => Date.now() - ((await import('/caps/devices/store.js')).state.value.at ?? Date.now())), { timeout: 30_000 }).toBeGreaterThan(4_000)
  await b.evaluate(() => new MutationObserver(() => { if (document.querySelector('.profile .devices-syncing[aria-label="Your devices · syncing"]')) Object.assign(window, { breathed: true }) })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] }))
  const path = await taskOn(page, TITLE, 'Plan my trip to Lyon by the sea')
  await expect.poll(async () => { await storeRound(page); return inStore(page) }, { timeout: 20_000 }).toContain(path)
  // Told at once, or 30 seconds after A last told it, when A's own first round, which sent all it had, told it then.
  await expect.poll(() => read(b, path), { timeout: 40_000 }).toBe(await read(page, path))
  expect(await b.evaluate(() => /** @type {any} */ (window).breathed)).toBe(true)
  await expect(foot).toHaveAccessibleName('Your devices')
  await expect((await devicesPage(b)).locator('.devices-synced')).toHaveText(/^Last synced: /)
  await b.context().close()
})

test('a project kept on one device, asked first, leaves the other, and the first keeps it', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  await pair(page, b)
  await closeSettings(page)
  const dir = await page.evaluate(async () => {
    const [{ app, refreshProjects, enterProject }, { createProject }] = await Promise.all([import('/ui/state.js'), import('/core/settings.js')])
    const made = await createProject(app.fs, { name: 'Trip', colour: 'oklch(0.7 0.1 200)', by: app.deviceId })
    await refreshProjects()
    await enterProject(/** @type {any} */ (app.projects.value.find((one) => one.dir === made)))
    return made
  })
  const path = await taskOn(page, TITLE, 'Plan my trip to Lyon')
  await expect.poll(async () => { await storeRound(page); return inStore(page) }, { timeout: 20_000 }).toContain(path)
  await expect.poll(async () => { await storeRound(b); return read(b, path) }, { timeout: 20_000 }).not.toBeNull()
  // Kept on A from now on: A asks first, saying it leaves the other devices.
  await page.evaluate(async (dir) => (await import('/caps/projects/projects.js')).editProject((await import('/ui/state.js')).app.projects.value.find((one) => one.dir === dir)), dir)
  const dialog = page.locator('app-project-dialog dialog[open]')
  await dialog.getByRole('switch', { name: 'Keep this project on this device' }).check()
  const asked = new Promise((resolve) => page.once('dialog', (one) => { resolve(one.message()); one.accept() }))
  await dialog.getByRole('button', { name: 'Save' }).click()
  expect(await asked).toBe('Keep “Trip” on this device alone? Its tasks and files leave your other devices. One that changed it while offline brings them back.')
  await expect.poll(async () => { await storeRound(page); return (await inStore(page)).some((one) => one.startsWith(`${dir}/`)) }, { timeout: 20_000 }).toBe(false)
  await expect.poll(async () => { await storeRound(b); return read(b, `${dir}/project.md`) }, { timeout: 20_000 }).toBeNull()
  expect(await read(b, path)).toBeNull()
  expect(await read(page, path)).not.toBeNull()
  await b.context().close()
})

test('the last other device removed, the store goes from the relay: what is made after reaches it no more, even before it hears of its removal', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  const { dir, settings } = await pair(page, b)
  // B reads its mailbox no more, the read under way ended with a reload, so only the store can keep it out.
  await b.context().route('**/v1/m/**', (route) => route.abort())
  await b.reload()
  await expect.poll(() => here(b), { timeout: 20_000 }).toBe(dir)
  const before = await taskOn(page, 'Before', 'Plan the trip')
  await expect.poll(async () => { await storeRound(page); return inStore(page) }, { timeout: 20_000 }).toContain(before)
  await expect.poll(async () => { await storeRound(b); return read(b, before) }, { timeout: 20_000 }).not.toBeNull()
  // The store's deletion, refused at first: A says so, and goes on trying.
  const deleting = (/** @type {URL} */ url) => /\/v1\/s\/[\w-]{22}$/.test(url.pathname)
  await page.context().route(deleting, (route) => (route.request().method() === 'DELETE' ? route.abort() : route.fallback()))
  await settings.locator('.devices-flow > .list > li').last().getByRole('button', { name: 'Remove' }).click()
  const dialog = page.locator('dialog.devices-remove[open]')
  await dialog.getByRole('button', { name: 'Remove' }).click()
  await expect(dialog.getByRole('status')).toContainText(/ is removed\./)
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect.poll(async () => { await storeRound(page); return settings.locator('.devices-flow > .hint:not(.devices-synced)').textContent() }, { timeout: 20_000 }).toBe('Shutting out the device you removed…')
  await page.context().unroute(deleting)
  // B was the last other device: the store goes, its keys with it, and A keeps its files, alone.
  const held = async () => JSON.parse(String(await read(page, '.secrets/keys.json'))).store ?? null
  await expect.poll(async () => { await storeRound(page); return held() }, { timeout: 20_000 }).toBeNull()
  expect(await read(page, before)).not.toBeNull()
  await closeSettings(page)
  const after = await taskOn(page, 'After', 'Book the train')
  await storeRound(b)
  expect(await read(b, after)).toBeNull()
  // B says it no longer receives, with Start again; nothing of its own was erased.
  expect(await read(b, before)).not.toBeNull()
  await b.evaluate(async () => (await import('/ui/dialogs.js')).openSettings('devices'))
  await expect(b.locator('app-settings .devices-flow > .hint')).toHaveText('This device no longer gets what your other devices do.')
  await expect(b.locator('app-settings').getByRole('button', { name: 'Start again' })).toBeVisible()
  await b.context().unrouteAll({ behavior: 'ignoreErrors' })
  await b.context().close()
})

test('a document changed on both devices, one of them offline, keeps both changes', async ({ page, browser }) => {
  await deviceA(page)
  const b = await device(browser)
  await pair(page, b)
  await closeSettings(page)
  const path = await page.evaluate(async () => `${(await import('/ui/state.js')).app.projectDir}/documents/01K90000000000000000000000-trip.md`)
  const write = (/** @type {Page} */ one, /** @type {string} */ text) => one.evaluate(async ({ path, text }) => (await import('/ui/state.js')).app.fs.write(path, text), { path, text })
  await write(page, '# Trip\n\nThe train at nine.\n\nA room by the sea.\n\nDinner on the harbour.\n')
  await expect.poll(async () => { await storeRound(page); return inStore(page) }, { timeout: 20_000 }).toContain(path)
  await expect.poll(async () => { await storeRound(b); return inStore(b) }, { timeout: 20_000 }).toContain(path)
  // B offline changes the last paragraph, A the first.
  const rev = await revOf(page, path)
  await b.context().setOffline(true)
  await write(b, '# Trip\n\nThe train at nine.\n\nA room by the sea.\n\nDinner at the market.\n')
  await storeRound(b)
  await write(page, '# Trip\n\nThe train at ten.\n\nA room by the sea.\n\nDinner on the harbour.\n')
  await expect.poll(async () => { await storeRound(page); return revOf(page, path) }, { timeout: 20_000 }).not.toBe(rev)
  await b.context().setOffline(false)
  const both = '# Trip\n\nThe train at ten.\n\nA room by the sea.\n\nDinner at the market.\n'
  await expect.poll(async () => { await storeRound(b); return read(b, path) }, { timeout: 20_000 }).toBe(both)
  await expect.poll(async () => { await storeRound(page); return read(page, path) }, { timeout: 20_000 }).toBe(both)
  await b.context().close()
})

test('an answer written while new things wait in the store stays Kept private, and they come once it is written', async ({ page, browser }) => {
  // B answers with the fake brain alone, on this computer, as Ollama would be; the relay at an address outside, as relay.jean.is is.
  await outside(page.context())
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  await connectFakeBrain(page)
  await useRelay(page, OUTSIDE)
  const b = await device(browser, { relay: OUTSIDE })
  await pair(page, b)
  await closeSettings(page)
  const path = await taskOn(page, TITLE, 'Plan my trip to Lyon')
  await expect.poll(async () => { await storeRound(page); return inStore(page) }, { timeout: 20_000 }).toContain(path)
  // A round asked for on A meanwhile, while A answers, takes nothing: it starts after the answer.
  await ask(page, 'Count slowly to five')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(1)
  const other = await taskOn(b, 'From the phone', 'Pack the bags')
  await expect.poll(async () => { await storeRound(b); return inStore(b) }, { timeout: 20_000 }).toContain(other)
  await storeRound(page)
  expect(await read(page, other)).toBeNull()
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.msg-jean').last()).toContainText('I counted to five, slowly.')
  await expect(page.locator('.msg-jean .msg-actions').last().getByRole('button', { name: 'About this answer' })).toHaveClass(/is-local/)
  // Once it is written, what waited comes, without asking.
  await expect.poll(() => read(page, other), { timeout: 20_000 }).not.toBeNull()
  await Promise.all([page.context(), b.context()].map((context) => context.unrouteAll({ behavior: 'ignoreErrors' })))
  await b.context().close()
})

test('where nothing is kept, a device is neither added nor joined, and the page says why', async ({ page }) => {
  await start(page)
  await useRelay(page)
  test.skip(!await ephemeral(page), 'files are kept here: the other tests add and join devices')
  const settings = await devicesPage(page)
  await settings.getByRole('button', { name: 'Add a device' }).click()
  await expect(settings.locator('.devices-wrong')).toHaveText('This browser can’t keep Jean’s files here, in a private window for instance.')
  await settings.locator('.devices-actions').getByRole('button', { name: 'Close' }).click()
  await settings.getByRole('button', { name: 'Bring Jean here from another device' }).click()
  await settings.getByRole('textbox', { name: 'A link from your other device' }).fill(`http://127.0.0.1:4180/#/pair/${'A'.repeat(43)}.${'A'.repeat(22)}`)
  await settings.getByRole('button', { name: 'Join' }).click()
  await expect(settings.locator('.devices-wrong')).toHaveText('This browser can’t keep Jean’s files here, in a private window for instance.')
})

test('a fresh Jean offers, from its welcome, to bring Jean from another device, and Your data, while this device is alone, to add one', async ({ browser }) => {
  const b = await device(browser)
  test.skip(await ephemeral(b), 'nothing is kept here: a private window, Playwright’s WebKit')
  const line = b.locator('.welcome > p.muted')
  await expect(line).toHaveText('Already use Jean on another device? Bring it here')
  await line.getByRole('button', { name: 'Bring it here' }).click()
  const settings = b.locator('app-settings dialog[open]')
  await expect(settings.locator('.data-head h2')).toHaveText('Bring your Jean here')
  await expect(settings.locator('.data-head .lede')).toHaveText('On the device that has your Jean, open Settings › Your devices and choose Add a device. Not there yet? It’s in Settings › Capabilities. Then point this device’s camera at its code, or paste its link here.')
  await expect(b).toHaveURL(/#\/settings\/devices\/join$/)
  // Back on Your devices, the keyboard on what led to the page; no row of it left in Your data, whose line offers to add a device.
  await settings.locator('.back').click()
  await expect(settings.getByRole('button', { name: 'Bring Jean here from another device' })).toBeFocused()
  await taskOn(b, TITLE, 'Plan my trip to Lyon by the sea')
  await settings.locator('.settings-nav button', { hasText: 'Your data' }).click()
  await expect(settings.locator('.lede strong')).toHaveText('It is only here: nothing is backed up yet.')
  await expect(settings.locator('[data-part="devices"]')).toHaveCount(0)
  await settings.locator('.data-fix').getByRole('button', { name: 'Add a device' }).click()
  await expect(settings.getByRole('heading', { name: 'Open this on your other device' })).toBeVisible()
  await expect(b).toHaveURL(/#\/settings\/devices$/)
  await settings.locator('.devices-actions').getByRole('button', { name: 'Cancel' }).click()
  // Found now, and the room holding a task, the welcome no longer offers it.
  await closeSettings(b)
  await expect(line).toHaveCount(0)
  await b.context().close()
})
