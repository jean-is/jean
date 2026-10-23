// Apps (D296, D535): read before they are added, run in a sandbox of their own, drawing with Jean's
// elements and hooking Jean's events, but only within the rights the user granted and hasn't taken back.
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { start, connectFakeBrain, ask, turnOn, openSettings, closeSettings, withPolicy } from './helpers.js'

const FIXTURE = new URL('./fixtures/apps/word-count/', import.meta.url)

/**
 * Serves the test app at https://apps.test/word-count/, its manifest changed as given, and its code if given.
 * @param {import('@playwright/test').Page} page @param {Record<string, unknown>} [change] @param {string} [main]
 */
async function serve(page, change = {}, main) {
  const manifest = { ...JSON.parse(await readFile(new URL('app.json', FIXTURE), 'utf8')), ...change }
  const code = main ?? await readFile(new URL('main.js', FIXTURE), 'utf8')
  await page.route('https://apps.test/word-count/**', (route) => route.fulfill({
    headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' },
    body: route.request().url().endsWith('app.json') ? JSON.stringify(manifest) : code,
  }))
}

/** Settings › Apps, its list once its module is read. @param {import('@playwright/test').Page} page */
async function apps(page) {
  const settings = await openSettings(page, 'Apps')
  await expect(settings.getByRole('heading', { name: 'Apps', exact: true })).toBeVisible()
  return settings
}

/** Reads the app at its address, then adds it from the page that shows it, which leaves on the app's own. @param {import('@playwright/test').Page} page */
async function add(page, address = 'https://apps.test/word-count') {
  const settings = await apps(page)
  const more = settings.getByRole('button', { name: 'Add an app' })
  if (await more.isVisible()) await more.click()
  await settings.getByLabel('The address of an app').fill(address)
  await settings.getByRole('button', { name: 'Look at it' }).click()
  await expect(settings.getByRole('button', { name: 'Add it' })).toBeVisible()
  return settings
}

/** An app's page, from the list. @param {import('@playwright/test').Locator} settings @param {string} name */
async function pageOf(settings, name) {
  await settings.locator(`[data-app="${name}"]`).click()
  await expect(settings.locator('.data-head h2')).toBeFocused()
  return settings
}

/** What the app keeps, in its data.json. @param {import('@playwright/test').Page} page */
const kept = (page) => page.evaluate(async () => JSON.parse(await (await import('/ui/state.js')).app.fs.read('apps/word-count/data.json') ?? '{}'))

test('an app read from its address is added, runs apart, draws under each answer and above the box, keeps its data, follows the records and what going back removes, refuses only with the right, which its page counts and takes back, then a new version and Remove', async ({ page }) => {
  await serve(page)
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Apps')
  await closeSettings(page)
  let settings = await add(page)
  // Who made it and where from, its maker's words apart from what Jean will let it do, and what it can't.
  const head = settings.locator('.data-head')
  await expect(head.getByRole('heading', { name: 'Word count' })).toBeVisible()
  await expect(head).toContainText('Version 1.0.0 · By Ada · From apps.test')
  await expect(settings.getByRole('heading', { name: 'In its maker’s words' })).toBeVisible()
  await expect(settings.getByRole('heading', { name: 'What Jean will let it do' })).toBeVisible()
  await expect(settings).toContainText('Show you short messages')
  await expect(settings.locator('.apps-cant')).toContainText('Reach the internet')
  await settings.getByRole('button', { name: 'Add it' }).click()
  await expect(page.locator('.toast')).toContainText('Word count is added.')
  await expect(head.getByRole('heading', { name: 'Word count' })).toBeFocused()
  await expect(settings.getByRole('switch', { name: 'Word count' })).toBeChecked()
  await expect(settings.getByRole('switch', { name: 'Stop an action, or ask you first' })).toBeChecked()
  // Its row says the most it may do: see the conversations.
  await settings.locator('.back').click()
  await expect(settings.locator('[data-app="word-count"]')).toBeFocused()
  await expect(settings.locator('.list.apps > li')).toContainText('Sees conversations')
  await closeSettings(page)

  // Its code runs in an opaque frame of its own, never Jean's origin.
  await expect(page.locator('iframe[sandbox="allow-scripts"][src$="sandbox.html"]')).toHaveCount(1)

  await ask(page, 'Hello there')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(1)
  // It counts the answer's own words, as written: under it, and above the box, where it keeps the last count.
  await expect(page.locator('.msg-jean .apps-answer')).toHaveText(/^\d+ words$/)
  const band = page.locator('.apps-above')
  await expect(band).toContainText(/Last answer: [1-9]\d* words/)
  const words = Number(/Last answer: (\d+) words/.exec(await band.innerText())?.[1])
  expect(await kept(page)).toEqual({ last: words })
  await band.getByRole('button', { name: 'Reset' }).click()
  await expect(band).toContainText('Last answer: 0 words')
  await expect(page.locator('.toast')).toContainText('Word count: Reset.')

  // With the right to refuse, it keeps files as they are.
  await ask(page, 'Make me a web page for the bakery')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(2)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Word count keeps files as they are.')
  // It follows the records kept, each refusal saying whose it was, and so does the activity.
  await expect.poll(async () => (await kept(page)).stopped?.by).toBe('word-count')
  const activity = page.locator('.msg-jean').last().locator('.activity')
  await activity.locator('summary').first().click()
  const refused = activity.locator('.activity-list li[data-status="failed"]')
  await refused.locator('summary').click()
  await expect(refused.locator('.step-facts')).toContainText('Refused by Word count')
  // Going back to the request, it hears what was removed, once (D188).
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.msg-actions.is-request').last().getByRole('button', { name: 'Try again' }).click()
  await expect.poll(async () => (await kept(page)).removed).toBeGreaterThan(1)
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(2)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Word count keeps files as they are.')

  // Its page says what it stopped this week, and takes the right back: its refusal then counts for nothing.
  settings = await pageOf(await apps(page), 'word-count')
  await expect(settings.locator('.hint', { hasText: 'This week it stopped' })).toBeVisible()
  await settings.getByRole('switch', { name: 'Stop an action, or ask you first' }).uncheck()
  await expect(settings.getByRole('switch', { name: 'Stop an action, or ask you first' })).not.toBeChecked()
  await expect(page.locator('iframe[sandbox="allow-scripts"][src$="sandbox.html"]')).toHaveCount(1)
  await closeSettings(page)
  await ask(page, 'Make me a web page for the bakery')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(3)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Done: Bakery.html')

  // A new version shows before it takes this one's place, with every right it asks again.
  await page.unroute('https://apps.test/word-count/**')
  await serve(page, { version: '1.1.0' })
  settings = await pageOf(await apps(page), 'word-count')
  await settings.getByRole('button', { name: 'Look for a new version' }).click()
  await expect(settings.locator('.data-head')).toContainText('Version 1.1.0')
  await expect(settings.getByRole('button', { name: 'Word count' })).toBeVisible()
  await settings.getByRole('button', { name: 'Add it' }).click()
  await expect(settings.locator('.data-head')).toContainText('Version 1.1.0 · By Ada · From apps.test')
  await expect(settings.getByRole('switch', { name: 'Stop an action, or ask you first' })).toBeChecked()
  // The same again, it says so.
  await settings.getByRole('button', { name: 'Look for a new version' }).click()
  await expect(page.locator('.toast').last()).toContainText('Word count is up to date.')

  // Turned off from its row, it stops, and draws nothing more.
  await settings.locator('.back').click()
  await settings.getByRole('switch', { name: 'Word count' }).uncheck()
  await expect(page.locator('iframe[sandbox="allow-scripts"][src$="sandbox.html"]')).toHaveCount(0)
  // Removed, asked in its page, it goes with what it kept.
  await pageOf(settings, 'word-count')
  await settings.getByRole('button', { name: 'Remove' }).click()
  await expect(settings.getByRole('alert')).toContainText('Remove Word count? What it kept goes with it.')
  await settings.getByRole('alert').getByRole('button', { name: 'Remove' }).click()
  await expect(settings.getByLabel('The address of an app')).toBeVisible()
  await expect(settings.locator('.list.apps')).toHaveCount(0)
  expect(await page.evaluate(async () => (await (await import('/ui/state.js')).app.fs.list('apps')).length)).toBe(0)
  await closeSettings(page)
  await expect(page.locator('.apps-above')).toHaveCount(0)
})

test('with ?safe no app runs until the user leaves safe mode, one that keeps failing is turned off and says so, and Settings opens Jean with no app (D309)', async ({ page }) => {
  // It fails on each record Jean keeps, a request and its answer make three, and draws 2,500 words on its page.
  await serve(page, {}, "export function register(on, $) { on('record', () => { throw new Error('Broken') }); $.slot('settings', () => Array(50).fill(Array(50).fill('word'))) }")
  await start(page)
  await page.goto('./?safe')
  await expect(page.locator('.hero-question')).toBeVisible()
  await connectFakeBrain(page)
  await turnOn(page, 'Apps')
  await closeSettings(page)
  const settings = await add(page)
  await settings.getByRole('button', { name: 'Add it' }).click()
  const frames = page.locator('iframe[sandbox="allow-scripts"][src$="sandbox.html"]')
  await settings.locator('.back').click()
  await expect(settings.locator('.apps-wait')).toContainText('Safe mode: no app runs during this visit.')
  await expect(settings.locator('.list.apps > li')).toContainText('Paused')
  await expect(settings.getByRole('switch', { name: 'Word count' })).toHaveCount(0)
  await expect(settings.getByRole('button', { name: 'Open Jean once with no app' })).toHaveCount(0)
  await expect(frames).toHaveCount(0)

  // Out of safe mode, without a reload, it runs.
  await settings.getByRole('button', { name: 'Leave safe mode' }).click()
  await expect(settings).not.toContainText('Safe mode')
  expect(new URL(page.url()).searchParams.has('safe')).toBe(false)
  await expect(frames).toHaveCount(1)
  // What it draws on its page stops at 500 of Jean's elements, shown as its own.
  await pageOf(settings, 'word-count')
  const own = settings.getByRole('region', { name: 'Shown by Word count' })
  await expect(own.getByText('word', { exact: true }).first()).toBeVisible()
  expect(await own.getByText('word', { exact: true }).count()).toBeLessThan(500)
  await closeSettings(page)

  await ask(page, 'Hello there')
  await expect(page.locator('.toast')).toContainText('Word count kept failing, so it is turned off.')
  await expect(frames).toHaveCount(0)
  await apps(page)
  const row = settings.locator('.list.apps > li')
  await expect(row).toContainText('It kept failing, so it was turned off.')
  await expect(row.getByRole('switch', { name: 'Word count' })).not.toBeChecked()
  // Turned on again from the line that says so, it runs, and the line goes.
  await expect(settings.locator('.apps-wait')).toContainText('Word count kept failing, so it is turned off.')
  await settings.getByRole('button', { name: 'Turn it on again' }).click()
  await expect(frames).toHaveCount(1)
  await expect(row).not.toContainText('It kept failing')
  await expect(settings.locator('.apps-wait')).toHaveCount(0)

  // The way back, once something gets in the way: Jean opens again with ?safe.
  await settings.getByRole('button', { name: 'Open Jean once with no app' }).click()
  await page.waitForURL(/[?&]safe/)
})

test('the example apps (examples/apps/) are ready-made where policy names them, and work together: a log of the records, quiet hours that ask first, and a site trusted that opens without asking, which Approvals takes back', async ({ page }) => {
  const names = ['activity-log', 'quiet-hours', 'trusted-sites']
  // npm run dev serves them, as the tests' server does.
  await withPolicy(page, { apps: { ready: names.map((name) => `http://127.0.0.1:4180/examples/apps/${name}/`) } })
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Apps')
  await closeSettings(page)
  await turnOn(page, 'Browser')
  await closeSettings(page)
  // A first visit offers them before an address; each is read before it is added, then marked Added.
  let settings = await apps(page)
  const ready = settings.locator('.ready-made')
  await expect(ready.locator('.service')).toHaveCount(3)
  for (const title of ['Activity log', 'Quiet hours', 'Trusted sites']) {
    await ready.locator('.service', { hasText: title }).click()
    await expect(settings.getByRole('heading', { name: 'In its maker’s words' })).toBeVisible()
    await settings.getByRole('button', { name: 'Add it' }).click()
    await expect(page.locator('.toast').last()).toContainText(`${title} is added.`)
    await settings.locator('.back').click()
    await settings.getByRole('button', { name: 'Add an app' }).click()
  }
  await expect(ready.locator('.service', { hasText: 'Trusted sites' })).toContainText('Added')
  await settings.locator('.back').click()
  await expect(settings.locator('.list.apps > li', { hasText: 'Trusted sites' })).toContainText('May skip asking')
  await closeSettings(page)
  /** The facts of the last answer's first action. */
  const facts = async () => {
    const last = page.locator('.msg-jean').last()
    await last.locator('.activity summary').first().click()
    await last.locator('.activity-list li[data-depth] summary').first().click()
    return last.locator('li[data-depth] .step-facts').first()
  }

  // Activity log says under an answer what was done for it.
  await ask(page, 'Hello there')
  await expect(page.locator('.msg-jean .apps-answer').first()).toHaveText('Answered without doing anything else')
  // Trusted sites has nothing to offer yet, so its band takes no room.
  await expect(page.locator('.apps-above[aria-label="Trusted sites"]')).toBeHidden()

  // Quiet hours, all the time: Jean asks before writing a page, and the activity says why.
  settings = await pageOf(await apps(page), 'quiet-hours')
  await settings.getByRole('button', { name: 'All the time' }).click()
  await closeSettings(page)
  await expect(page.locator('.apps-above[aria-label="Quiet hours"]')).toContainText("Quiet hours: I'll ask you first")
  await ask(page, 'Make me a web page for the bakery')
  await page.locator('.approval').getByRole('button', { name: 'Allow once' }).click()
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(2)
  await expect(page.locator('.msg-jean .apps-answer').last()).toHaveText('1 action · decided by quiet-hours')
  await expect(await facts()).toContainText('Asked first by Quiet hours')
  settings = await pageOf(await apps(page), 'quiet-hours')
  await expect(settings.locator('.hint', { hasText: 'This week it had Jean ask you first once' })).toBeVisible()
  await settings.getByRole('button', { name: 'Never' }).click()
  await closeSettings(page)
  await expect(page.locator('.apps-above[aria-label="Quiet hours"]')).toBeHidden()

  // Trusted sites: the bakery's site asks once, is trusted from the band, then opens without asking.
  await ask(page, 'Open the bakery site')
  const band = page.locator('.apps-above[aria-label="Trusted sites"]')
  await expect(band).toContainText('Open pages from 127.0.0.1:4181 without asking')
  await band.getByRole('button', { name: 'Trust it' }).click()
  await page.locator('.approval').getByRole('button', { name: 'Allow once' }).click()
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(3)
  await ask(page, 'Open the bakery site again')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(4)
  await expect(page.locator('.approval')).toHaveCount(0)
  await expect(await facts()).toContainText('Allowed by Trusted sites')

  // The log has it all, what going back removed too.
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.msg-actions.is-request').last().getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(4)
  settings = await pageOf(await apps(page), 'activity-log')
  await expect(settings).toContainText('You went back to a request')
  await expect(settings).toContainText('allowed by trusted-sites')

  // Approvals' Exceptions names the app that may skip asking; Stop takes back that right alone.
  await settings.locator('.settings-nav button', { hasText: 'Approvals' }).click()
  await settings.locator('[data-page="exceptions"]').first().click()
  const allowed = settings.locator('.rules li', { hasText: 'Trusted sites' })
  await expect(allowed).toContainText('May let actions go ahead without asking you')
  await allowed.getByRole('button', { name: 'Stop' }).click()
  await expect(settings.locator('.rules li', { hasText: 'Trusted sites' })).toHaveCount(0)
  await settings.locator('.settings-nav button', { hasText: 'Apps' }).click()
  await pageOf(settings, 'trusted-sites')
  await expect(settings.getByRole('switch', { name: 'Let actions go ahead without asking you first' })).not.toBeChecked()
  await expect(settings.getByRole('switch', { name: 'Trusted sites' })).toBeChecked()
  await settings.locator('.back').click()
  await expect(settings.locator('.list.apps > li', { hasText: 'Trusted sites' })).toContainText('Sees conversations')
})

test('At a glance (examples/apps/glance/) draws under a long answer how long it takes to read and a map of its parts, each said in words too', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Apps')
  await closeSettings(page)
  let settings = await add(page, 'http://127.0.0.1:4180/examples/apps/glance/')
  await settings.getByRole('button', { name: 'Add it' }).click()
  await expect(page.locator('.toast')).toContainText('At a glance is added.')
  await closeSettings(page)

  await ask(page, 'Compare the phone plans')
  const glance = page.locator('.msg-jean .apps-answer').last()
  await expect(glance.getByRole('img', { name: '1 minute to read' })).toContainText('◷')
  await expect(glance.getByRole('img', { name: 'Its parts: 2 paragraphs, 2 tables, 1 list, and 2 quotes' })).toHaveText('‎▅▦█☰❝❝▦')

  // A short answer has nothing under it, until its page asks for every answer.
  await ask(page, 'Hello there')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(2)
  const short = page.locator('.msg-jean').last().locator('.apps-answer [role="img"]')
  await expect(short).toHaveCount(0)
  settings = await pageOf(await apps(page), 'glance')
  const own = settings.getByRole('region', { name: 'Shown by At a glance' })
  await expect(own).toContainText('How long the answer takes to read')
  await own.getByRole('button', { name: 'Every answer' }).click()
  await expect(own).toContainText('It draws under every answer.')
  await closeSettings(page)
  await expect(short).toHaveCount(2)
})
