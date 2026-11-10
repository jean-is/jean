// Colleagues (D731): at work, where the organisation's own relay lists the people its sign-in names, Ana and Bob, each signed in to the
// fake organisation in a browser context of their own, are listed there as Jean starts; Ana finds Bob in Settings › People and adds him,
// with no meeting, and sends him a task from Share; his Jean takes her first letter through the list and shows its card, from her as
// the list names her. Chromium only: Playwright's WebKit keeps nothing, where no one is kept (test/playwright.config.js).
import { test, expect } from '@playwright/test'
import { start, openSettings, closeSettings, openTasks, withPolicy, RELAY_URL } from './helpers.js'
import { POLICY, fakeIssuer, fakeGateway } from './fixtures/fake-issuer.js'
import { authority, issue, requested, certsOnly } from './fixtures/ca.js'

/** @typedef {import('@playwright/test').Page} Page */

/**
 * Signed in to the organisation, whose policy names its relay and has People ahead, as IT turns colleagues on, with `more` of it.
 * @param {import('@playwright/test').Browser} browser @param {Record<string, unknown>} [claims] @param {Record<string, unknown>} [more] @param {(page: Page) => Promise<void>} [routes]
 */
async function colleague(browser, claims = {}, lang = 'en', more = {}, routes = async () => {}) {
  const page = await (await browser.newContext()).newPage()
  const issuer = await fakeIssuer(page, { claims })
  await fakeGateway(page, issuer)
  await routes(page)
  await withPolicy(page, { ...POLICY, urls: { relay: RELAY_URL }, capabilities: { preUnlock: ['people'] }, ...more })
  await start(page, lang)
  // Listed on the relay, as each start lists the device.
  await expect.poll(() => page.evaluate(async () => (await import('/ui/opfs.js')).mine('app.listed')).then((key) => page.evaluate((one) => localStorage.getItem(one), key))).not.toBeNull()
  return page
}
/** Ana and Bob, as the organisation names them, their own in each run: the relay keeps who it listed for the whole run. */
const named = () => ((run) => ({ run, ana: { sub: `sub-ana-${run}`, preferred_username: `ana.${run}@acme.example` }, bob: { sub: `sub-bob-${run}`, name: 'Bob Dupont', preferred_username: `bob.${run}@acme.example` } }))(`${test.info().workerIndex}-${test.info().repeatEachIndex}-${Date.now()}`)
/** The people a Jean keeps, as People shows them, a colleague's devices as one. @param {Page} page */
const groupsOf = (page) => page.evaluate(async () => (await import('/caps/people/people.js')).groups.value.map(({ name, account, fps, asking }) => ({ name, account, devices: fps.length, asking })))

test('at work, a colleague found on the organisation’s list is added with no meeting, sent a task, and their Jean takes it from them as the list names them', async ({ browser }) => {
  const who = named()
  const [ana, bob] = await Promise.all([colleague(browser, who.ana), colleague(browser, who.bob)])
  // Ana finds Bob by a few words of his name, and adds him.
  const settings = await openSettings(ana, 'People')
  await settings.getByLabel('Find a colleague').fill('bo')
  await settings.getByRole('button', { name: 'Search' }).click()
  await expect(settings.getByRole('listitem').filter({ hasText: 'Bob Dupont' }), 'three letters at least').toHaveCount(0)
  await settings.getByLabel('Find a colleague').fill('nobody here')
  await settings.getByRole('button', { name: 'Search' }).click()
  await expect(settings.getByText('No one by that name at your organisation uses Jean yet.')).toBeVisible()
  await settings.getByLabel('Find a colleague').fill('dupont')
  await settings.getByRole('button', { name: 'Search' }).click()
  const found = settings.getByRole('listitem').filter({ hasText: who.bob.preferred_username })
  await expect(found).toContainText('Bob Dupont')
  await found.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(found.getByRole('button', { name: 'Added' })).toBeDisabled()
  await expect.poll(() => groupsOf(ana)).toEqual([{ name: 'Bob Dupont', account: who.bob.preferred_username, devices: 1, asking: false }])
  await closeSettings(ana)

  // A task, sent from Share to Bob, the only one she can send to.
  await ana.evaluate(async () => {
    const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Budget 2027' }), userRecord('Draft the budget', app.deviceId),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is **the budget**.' } }, 0)])
    await refreshConversations()
  })
  const row = (await openTasks(ana)).locator('.history-list li:not([aria-hidden])', { hasText: 'Budget 2027' })
  await row.hover()
  await row.getByRole('button', { name: 'More options' }).click()
  await row.getByRole('button', { name: 'Share…' }).click()
  const dialog = ana.locator('app-share-dialog dialog[open]')
  await dialog.getByRole('checkbox', { name: 'Bob Dupont' }).check()
  await dialog.getByRole('button', { name: 'Send a copy' }).click()
  await expect(dialog.locator('p[role="status"]')).toHaveText('Sent to Bob Dupont.')
  await dialog.locator('.dialog-head').getByRole('button', { name: 'Close' }).click()

  // Bob never added Ana: his Jean looked her up by the mailbox her letter gave, kept her as the list names her, and shows what she sent.
  const card = bob.locator('.people-card')
  await expect(card).toContainText('Ana Martín sent you “Budget 2027”')
  await expect.poll(() => groupsOf(bob)).toEqual([{ name: 'Ana Martín', account: who.ana.preferred_username, devices: 1, asking: false }])
  await card.getByRole('button', { name: 'Open' }).click()
  await expect(bob.locator('.msg-user')).toHaveText('Draft the budget')
})

test('at work, a colleague not on the list is invited from the person’s own mail; signed in from its link, each has the other', async ({ browser }) => {
  const who = named(), carol = { sub: `${who.bob.sub}-carol`, name: 'Carol Petit', preferred_username: who.bob.preferred_username.replace('bob', 'carol') }
  const ana = await colleague(browser, who.ana)
  const settings = await openSettings(ana, 'People')
  await settings.getByLabel('Find a colleague').fill(carol.preferred_username)
  await settings.getByRole('button', { name: 'Search' }).click()
  // An email from her own mail app, to the address she searched for, with a link that brings Carol in.
  const mail = new URL(String(await settings.getByRole('link', { name: 'Invite them by email' }).getAttribute('href')))
  expect([mail.protocol, decodeURIComponent(mail.pathname), mail.searchParams.get('subject')]).toEqual(['mailto:', carol.preferred_username, 'Let’s send each other tasks with Jean'])
  const link = String(/https?:\/\/\S+/.exec(mail.searchParams.get('body') ?? '')?.[0])
  expect(link).toMatch(/#\/meet\/[\w-]{22}$/)
  // Carol opens it at her first visit, signs in to the organisation, and comes back to it.
  const page = await (await browser.newContext()).newPage()
  await fakeGateway(page, await fakeIssuer(page, { claims: carol }))
  await withPolicy(page, { ...POLICY, urls: { relay: RELAY_URL }, capabilities: { preUnlock: ['people'] } })
  await page.goto(link)
  await expect(page.locator('app-settings dialog[open]')).toContainText('Ana Martín is in your people now. You can send each other tasks.')
  // Ana's Jean takes her first letter through the list, and says so.
  await expect(ana.getByText('Carol Petit uses Jean now. You can send each other tasks.')).toBeVisible()
  await expect.poll(() => groupsOf(ana)).toEqual([{ name: 'Carol Petit', account: carol.preferred_username, devices: 1, asking: false }])
  await expect.poll(() => groupsOf(page)).toEqual([{ name: 'Ana Martín', account: who.ana.preferred_username, devices: 1, asking: false }])
})

test('the colleague finder reads in Arabic and Japanese', async ({ browser }) => {
  for (const lang of ['ar', 'ja']) {
    const page = await colleague(browser, named().ana, lang)
    await page.evaluate(async () => (await import('/ui/dialogs.js')).openSettings('people'))
    const finder = page.locator('app-settings dialog[open] #people-find')
    await expect(finder).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dir)).toBe(lang === 'ar' ? 'rtl' : 'ltr')
    await finder.fill('nobody here')
    await finder.press('Enter')
    await expect(page.locator('app-settings dialog[open] .people-flow p.hint[role="status"]')).not.toBeEmpty()
    await page.context().close()
  }
})

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST' }
const root = await authority('Acme Root CA')
const issuing = await authority('Acme Issuing CA', { issuer: root })
/** @param {Uint8Array} der */
const base64 = (der) => Buffer.from(der).toString('base64')
/**
 * The organisation's EST service as the page's routes: each key it is asked for certified, for the account its request names, which a real
 * one takes from who asks; or, `refusing`, none. @param {boolean} [refusing] @returns {(page: Page) => Promise<void>}
 */
const authorityAt = (refusing = false) => (page) => page.route('https://ca.fake.example/**', async (route) => {
  const request = route.request()
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
  if (request.url().endsWith('/cacerts')) return route.fulfill({ headers: CORS, body: base64(certsOnly([issuing.certificate, root.certificate])) })
  if (refusing) return route.fulfill({ status: 401, headers: CORS })
  const { spki, email } = await requested(Buffer.from(request.postData() ?? '', 'base64'))
  return route.fulfill({ headers: { ...CORS, 'content-type': 'application/pkcs7-mime; smime-type=certs-only' }, body: base64(certsOnly([await issue({ spki, subject: 'Profile', issuer: issuing, email })])) })
})
/** The organisation's controls (ee/, D732): keys its authority certifies, and trading kept apart from research. */
const CONTROLS = { seal: { est: 'https://ca.fake.example/.well-known/est', auth: 'oidc' }, trust: [base64(root.certificate)], colleagues: { certify: true, apart: [['g-trading', 'g-research']] } }

test('with the organisation’s controls, a colleague is found only with a key its authority certified, groups kept apart neither find nor reach each other, and people come from the list alone', async ({ browser }) => {
  const who = named(), [carol, dan] = ['carol', 'dan'].map((one) => ({ sub: `${who.bob.sub}-${one}`, name: `${one[0].toUpperCase()}${one.slice(1)} Petit`, preferred_username: who.bob.preferred_username.replace('bob', one) }))
  const [ana, , carols] = await Promise.all([
    colleague(browser, { ...who.ana, groups: ['g-trading'] }, 'en', CONTROLS, authorityAt()),
    colleague(browser, { ...who.bob, groups: ['g-trading'] }, 'en', CONTROLS, authorityAt()),
    colleague(browser, { ...carol, groups: ['g-research'] }, 'en', CONTROLS, authorityAt()),
    // Dan's authority refuses him: listed with no certificate.
    colleague(browser, { ...dan, groups: ['g-trading'] }, 'en', CONTROLS, authorityAt(true)),
  ])
  const settings = await openSettings(ana, 'People')
  await expect(settings.getByRole('button', { name: 'Add a person' }), 'people from the list alone').toHaveCount(0)
  await settings.getByLabel('Find a colleague').fill(who.run)
  await settings.getByRole('button', { name: 'Search' }).click()
  const found = settings.getByRole('listitem').filter({ hasText: who.bob.preferred_username })
  await expect(found).toContainText('Bob Dupont')
  await expect(settings.getByRole('listitem').filter({ hasText: carol.preferred_username }), 'in a group kept apart').toHaveCount(0)
  await expect(settings.getByRole('listitem').filter({ hasText: dan.preferred_username }), 'his key uncertified').toHaveCount(0)
  await found.getByRole('button', { name: 'Add', exact: true }).click()
  await expect.poll(() => groupsOf(ana)).toEqual([{ name: 'Bob Dupont', account: who.bob.preferred_username, devices: 1, asking: false }])
  // Carol finds neither of them, from her side.
  const hers = await openSettings(carols, 'People')
  await hers.getByLabel('Find a colleague').fill(who.run)
  await hers.getByRole('button', { name: 'Search' }).click()
  await expect(hers.getByText('No one by that name at your organisation uses Jean yet.')).toBeVisible()
  await expect(hers.getByRole('listitem').filter({ hasText: who.ana.preferred_username })).toHaveCount(0)
})
