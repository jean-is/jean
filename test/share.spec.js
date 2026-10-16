// Sharing by link (D361): a task shared from its menu, once a copy of one was saved, sealed here and
// kept by the host, which can't read it; opened by its link in the host's viewer, drawn as Jean draws
// it in an opaque frame, reaching nothing but the host and the render package, with its password when
// it has one; continued in a Jean, after a note that it is someone else's; no longer shared once stopped.
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { start, openTasks, openSettings, SHARE_URL } from './helpers.js'

const PACKAGE = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@codename\/jean-render@[^/]+\/(.+)$/
const TYPES = /** @type {Record<string, string>} */ ({ js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', woff2: 'font/woff2', html: 'text/plain' })

/** A context that reads shares, the render package served from Jean's own files, and the origins it reached. @param {import('@playwright/test').Browser} browser */
async function reading(browser) {
  // As anyone would open it: without the tests' block on service workers, whose script fails in an opaque frame.
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const reached = /** @type {Set<string>} */ (new Set())
  context.on('request', (request) => { if (/^https?:/.test(request.url())) reached.add(new URL(request.url()).origin) })
  await context.route(PACKAGE, async (route) => {
    const path = /** @type {string} */ (PACKAGE.exec(route.request().url())?.[1])
    const body = await readFile(new URL(`../app/${path}`, import.meta.url)).catch(() => null)
    await route.fulfill(body ? { body, headers: { 'content-type': TYPES[path.split('.').at(-1) ?? ''] ?? 'application/octet-stream', 'access-control-allow-origin': '*' } } : { status: 404 })
  })
  return { context, reached }
}

test('a task shared by link opens in the host’s viewer, with its password, and continues in Jean', async ({ page, browser }) => {
  await start(page)
  await page.evaluate(async (host) => {
    const [{ app, refreshConversations, updateSettings }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope, noteRecord }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [noteRecord('The <memory> section is now: Ana lives in Lyon.', { kind: 'section', name: 'memory', version: 'a' }),
      metaRecord(app.deviceId, { title: 'Plan the week' }), userRecord('Plan my week', app.deviceId),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is **the plan**.' } }, 0)])
    // Its answer's certificate, saved as About this answer saves one (D274), its brain reached at an address of the organisation's.
    const [{ certificate, seal, makeSeal, thumbprint, factsOf, compact, ISSUER }, { foldTurns }] = await Promise.all([import('/caps/receipt/certificate.js'), import('/core/events.js')])
    const turn = foldTurns(((await app.fs.read(path)) ?? '').split('\n').slice(1).filter(Boolean).map((line) => JSON.parse(line)))[0]
    const own = await makeSeal()
    const made = await certificate({ facts: factsOf(turn, [{ from: turn.at, to: turn.end ?? turn.at, hosts: { 'gateway.corp.example': 2 } }]), turn, text: 'Here is **the plan**.',
      conversation: 'X', issuer: ISSUER + await thumbprint(own.keys.publicKey), origin: 'https://jean.corp.example', version: 'abcdefabcdef' })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { certificate: { id: made.credential.id, jws: compact(await seal(made.credential, own)), salts: made.salts, places: made.places } })])
    await refreshConversations()
  }, SHARE_URL)
  const row = (await openTasks(page)).locator('.history-list li', { hasText: 'Plan the week' })
  const menu = async () => {
    await row.hover()
    await row.getByRole('button', { name: 'More options' }).click()
  }
  // Found once a copy of a task is saved.
  await menu()
  await expect(row.getByRole('button', { name: 'Share…' })).toHaveCount(0)
  await Promise.all([page.waitForEvent('download'), row.getByRole('button', { name: 'Save a copy' }).click()])
  await menu()
  await row.getByRole('button', { name: 'Share…' }).click()
  const dialog = page.locator('app-share-dialog dialog[open]')
  await expect(dialog).toContainText('Its answers’ certificates go with it.')
  await dialog.getByRole('button', { name: 'Create link' }).click()
  const link = await dialog.locator('input.share-link').inputValue()
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4185\/[\w-]{22}#[\w-]{43}$/)
  await dialog.getByRole('button', { name: 'Done' }).click()

  const { context, reached } = await reading(browser)
  const viewer = await context.newPage()
  const errors = /** @type {string[]} */ ([])
  viewer.on('pageerror', (error) => errors.push(error.message))
  await viewer.goto(link)
  const frame = viewer.frameLocator('iframe[src="/frame"]')
  await expect(frame.locator('h1.conversation-title')).toHaveText('Plan the week')
  await expect(frame.locator('main .msg-user')).toHaveText('Plan my week')
  await expect(frame.locator('main .msg-jean strong')).toHaveText('the plan')
  await expect(frame.locator('body')).not.toContainText('Lyon')
  await expect(viewer.getByText('Shared via Jean')).toBeVisible()
  // Its answer's certificate, checked against what is shown, naming no address of the organisation's.
  await expect(viewer.locator('header')).toContainText('1 answer is sealed by the device that wrote it, unchanged since.')
  expect(await viewer.content()).not.toMatch(/corp\.example/)
  // Nothing but the host and the render package; the frame an opaque origin, which the viewer can't read.
  expect([...reached].sort()).toEqual(['http://127.0.0.1:4185', 'https://cdn.jsdelivr.net'])
  expect(await viewer.evaluate(() => { try { return document.querySelector('iframe')?.contentWindow?.document ? 'readable' : 'opaque' } catch { return 'opaque' } })).toBe('opaque')
  const onward = String(await viewer.getByRole('link', { name: 'Continue in Jean' }).getAttribute('href'))
  expect(onward).toMatch(/^http:\/\/127\.0\.0\.1:4180\/#\/shared\/[\w-]{22}\/[\w-]{43}$/)
  expect(errors).toEqual([])

  // With a password, which the host asks a proof of before it hands the copy out.
  await menu()
  await row.getByRole('button', { name: 'Share…' }).click()
  await dialog.getByLabel('Anyone with the link and the password').check()
  const password = await dialog.getByLabel('Password', { exact: true }).inputValue()
  await dialog.getByRole('button', { name: 'Create link' }).click()
  const closed = await dialog.locator('input.share-link').inputValue()
  await expect(dialog.locator('.share-password')).toHaveText(password)
  await dialog.getByRole('button', { name: 'Done' }).click()
  const locked = await context.newPage()
  await locked.goto(closed)
  await locked.getByLabel('Password', { exact: true }).fill('not it at all')
  await locked.getByRole('button', { name: 'Open' }).click()
  await expect(locked.getByText('That isn’t the password.')).toBeVisible()
  await locked.getByLabel('Password', { exact: true }).fill(password)
  await locked.getByRole('button', { name: 'Open' }).click()
  await expect(locked.frameLocator('iframe[src="/frame"]').locator('main .msg-user')).toHaveText('Plan my week')

  // Continued in Jean: brought in once the user says yes, after a note that it is someone else's.
  page.once('dialog', (asked) => asked.accept())
  await page.evaluate((hash) => { location.hash = hash }, new URL(onward).hash)
  await expect(page.locator('app-conversation .msg-user')).toHaveText('Plan my week')
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.update?.sessionUpdate === '_system_note')?.update))
    .toMatchObject({ data: { kind: 'shared', from: '127.0.0.1:4185' } })

  // Stopped from Settings › Your data: the first link no longer opens.
  const settings = await openSettings(page, 'Your data')
  await expect(settings.locator('.share-list li')).toHaveCount(2)
  page.once('dialog', (asked) => asked.accept())
  await settings.locator('.share-list li').last().getByRole('button', { name: 'Stop sharing' }).click()
  await expect(settings.locator('.share-list li')).toHaveCount(1)
  const after = await context.newPage()
  await after.goto(link)
  await expect(after.getByText('This is no longer shared.')).toBeVisible()

  // Without its write token here, the other is never said to be stopped: it stays listed, as it still opens.
  await page.evaluate(async () => {
    const [{ app }, { deleteSecret }, { shares }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js'), import('/caps/share/share.js')])
    await deleteSecret(app.fs, `share:${shares.peek()[0].id}`)
  })
  page.once('dialog', (asked) => asked.accept())
  await settings.locator('.share-list li').getByRole('button', { name: 'Stop sharing' }).click()
  await expect(page.getByText('This link was made on another device: only that one can change it.')).toBeVisible()
  await expect(settings.locator('.share-list li')).toHaveCount(1)
  await context.close()
})

test('a link that can’t be made or updated says why, in sharing’s own words', async ({ page }) => {
  await start(page)
  await page.evaluate(async (host) => {
    const [{ app, updateSettings }, { createConversation, appendRecords }, { metaRecord, userRecord }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Plan the week' }), userRecord('Plan my week', app.deviceId)])
    await (await import('/caps/share/share.js')).openShare({ path, title: 'Plan the week' })
  }, SHARE_URL)
  const dialog = page.locator('app-share-dialog dialog[open]')
  const host = `${SHARE_URL}v1/*`
  // Refused by the host as too big, then not reached at all.
  await page.route(host, async (route) => (route.request().method() === 'PUT' ? route.fulfill({ response: await route.fetch(), status: 413 }) : route.continue()))
  await dialog.getByRole('button', { name: 'Create link' }).click()
  await expect(page.getByText('This is too big to share: a link holds 10 MB at most.')).toBeVisible()
  await page.unroute(host)
  await page.route(host, (route) => (route.request().method() === 'PUT' ? route.abort() : route.continue()))
  await dialog.getByRole('button', { name: 'Create link' }).click()
  await expect(page.getByText('This couldn’t be reached. Check your connection and try again.')).toBeVisible()
  await page.unroute(host)
  await dialog.getByRole('button', { name: 'Create link' }).click()
  await expect(dialog.locator('input.share-link')).toHaveValue(/#/)
  await dialog.getByRole('button', { name: 'Done' }).click()
  // Updated from a device without its write token.
  await page.evaluate(async () => {
    const [{ app }, { deleteSecret }, { shares }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js'), import('/caps/share/share.js')])
    await deleteSecret(app.fs, `share:${shares.peek()[0].id}`)
  })
  const settings = await openSettings(page, 'Your data')
  await settings.locator('.share-list li').getByRole('button', { name: 'Update' }).click()
  await expect(page.getByText('This link was made on another device: only that one can change it.')).toBeVisible()
})
