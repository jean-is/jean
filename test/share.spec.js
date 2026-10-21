// Sharing by link (D361): a task shared from its menu, once a copy of one was saved, sealed here and
// kept by the host, which can't read it; opened by its link in the host's viewer, drawn as Jean draws
// it in an opaque frame, reaching nothing but the host and the render package, with its password when
// it has one; shared again from the dialog, which opens on the link made, to change or stop it (D379);
// continued in a Jean, after a note that it is someone else's; no longer shared once stopped.
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { start, openTasks, openSettings, closeSettings, SHARE_URL } from './helpers.js'

const PACKAGE = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@jean-is\/render@[^/]+\/(.+)$/
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
  const path = await page.evaluate(async (host) => {
    const [{ app, refreshConversations, updateSettings }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope, noteRecord }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [noteRecord('The <memory> section is now: Ana lives in Lyon.', { kind: 'section', name: 'memory', version: 'a' }),
      metaRecord(app.deviceId, { title: 'Plan the week' }), userRecord('Plan my week', app.deviceId),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is **the plan**.' } }, 0)])
    // Its answer's certificate, saved as About this answer saves one (D274), its brain reached at an address of the organisation's.
    const [{ certificate, seal, makeSeal, factsOf, compact }, { foldTurns }] = await Promise.all([import('/caps/receipt/certificate.js'), import('/core/events.js')])
    const turn = foldTurns(((await app.fs.read(path)) ?? '').split('\n').slice(1).filter(Boolean).map((line) => JSON.parse(line)))[0]
    const own = await makeSeal()
    const made = await certificate({ facts: factsOf(turn, [{ from: turn.at, to: turn.end ?? turn.at, hosts: { 'gateway.corp.example': 2 } }]), turn, text: 'Here is **the plan**.',
      conversation: 'X', origin: 'https://jean.corp.example', version: 'abcdefabcdef' })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { certificate: { id: made.credential.id, jws: compact(await seal(made.credential, own)), salts: made.salts, places: made.places } })])
    await refreshConversations()
    return path
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
  await expect(dialog).toContainText('Anyone with this link can open it until')
  const close = () => dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await close()

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
  expect(await viewer.getByRole('link', { name: 'Continue in Jean' }).getAttribute('href')).toMatch(/^http:\/\/127\.0\.0\.1:4180\/#\/shared\/[\w-]{22}\/[\w-]{43}$/)
  expect(errors).toEqual([])

  // Shared again from the keys the open task's menu shows (D377), the dialog opens on the link made
  // (D379): a password added under the same link, which the host then asks a proof of, for a year.
  // The open task's top shows it is shared by a light, as the terminal's, its name until when, and opens the dialog too.
  await row.locator('.history-item').click()
  // Its answer is shared by link too, first in its More options, in place of the system's sheet (D409).
  await page.locator('.msg-jean .msg-actions').getByRole('button', { name: 'More options' }).click()
  const under = page.locator('.msg-jean .answer-menu')
  await expect(under.getByRole('button').first()).toHaveText('Share…')
  await expect(under.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  const state = page.locator('.views').getByRole('button', { name: /^Shared until / })
  await expect(state).toHaveText('')
  await expect(state.locator('.ember')).toBeVisible()
  await menu()
  const share = row.getByRole('button', { name: 'Share…' })
  await expect(share).toHaveAttribute('aria-keyshortcuts', /^(Meta|Control)\+Shift\+U$/)
  await expect(share.locator('kbd')).toHaveText(/^(⌘⇧U|Ctrl\+Shift\+U)$/)
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+Shift+KeyU')
  await expect(dialog.locator('input.share-link')).toHaveValue(link)
  await expect(dialog.getByLabel('Anyone with the link', { exact: true })).toBeChecked()
  await dialog.getByLabel('Anyone with the link and the password').check()
  const password = await dialog.getByLabel('Password', { exact: true }).inputValue()
  await dialog.getByLabel('For how long').selectOption('365')
  await dialog.getByRole('button', { name: 'Update' }).click()
  await expect(dialog.locator('.share-password')).toHaveText(password)
  await expect(dialog).toContainText('Anyone with this link and the password can open it until')
  await expect(dialog.locator('input.share-link')).toHaveValue(link)
  await close()
  // Opened again, it shows the choices made, the password kept unless changed, and never shown again.
  await state.click()
  await expect(dialog.getByLabel('Anyone with the link and the password')).toBeChecked()
  await expect(dialog.getByLabel('For how long')).toHaveValue('365')
  await expect(dialog.getByRole('button', { name: 'Change the password' })).toBeVisible()
  await expect(dialog.locator('.share-password')).toHaveCount(0)
  await close()
  const locked = await context.newPage()
  await locked.goto(link)
  await locked.getByLabel('Password', { exact: true }).fill('not it at all')
  await locked.getByRole('button', { name: 'Open' }).click()
  await expect(locked.getByText('That isn’t the password.')).toBeVisible()
  await locked.getByLabel('Password', { exact: true }).fill(password)
  await locked.getByRole('button', { name: 'Open' }).click()
  await expect(locked.frameLocator('iframe[src="/frame"]').locator('main .msg-user')).toHaveText('Plan my week')
  const onward = String(await locked.getByRole('link', { name: 'Continue in Jean' }).getAttribute('href'))
  expect(onward).toMatch(/^http:\/\/127\.0\.0\.1:4180\/#\/shared\/[\w-]{22}\/[\w-]{86}$/)

  // Continued in Jean: brought in once the user says yes, after a note that it is someone else's, in place of the task open.
  page.once('dialog', (asked) => asked.accept())
  await page.evaluate((hash) => { location.hash = hash }, new URL(onward).hash)
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.update?.sessionUpdate === '_system_note')?.update))
    .toMatchObject({ data: { kind: 'shared', from: '127.0.0.1:4185' } })
  await expect(page.locator('app-conversation .msg-user')).toHaveText('Plan my week')
  await expect(page.locator('.views').getByRole('button', { name: 'Share…' })).toBeVisible()

  // Settings › Keyboard shortcuts lists it, now it is found, and Your data the one link made.
  const settings = await openSettings(page, 'Keyboard shortcuts')
  await expect(settings.locator('.keyboard > div', { hasText: 'Sharing' }).locator('kbd')).toHaveText(/^(⌘⇧U|Ctrl\+Shift\+U)$/)
  await settings.locator('.settings-nav button', { hasText: 'Your data' }).click()
  await expect(settings.locator('.share-list li')).toHaveCount(1)
  await closeSettings(page)

  // Stopped from the dialog of the task it shares: the link no longer opens, and the dialog offers a new one.
  await page.evaluate(async (path) => (await import('/caps/share/share.js')).openShare({ path, title: 'Plan the week' }), path)
  page.once('dialog', (asked) => asked.accept())
  await dialog.getByRole('button', { name: 'Stop sharing' }).click()
  await expect(dialog.getByRole('button', { name: 'Create link' })).toBeVisible()
  await expect(dialog.locator('input.share-link')).toHaveCount(0)
  const after = await context.newPage()
  await after.goto(link)
  await expect(after.getByText('This is no longer shared.')).toBeVisible()
  await context.close()
})

test('a link that can’t be made or updated says why, in sharing’s own words', async ({ page }) => {
  await start(page)
  const path = await page.evaluate(async (host) => {
    const [{ app, updateSettings }, { createConversation, appendRecords }, { metaRecord, userRecord }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Plan the week' }), userRecord('Plan my week', app.deviceId)])
    await (await import('/caps/share/share.js')).openShare({ path, title: 'Plan the week' })
    return path
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
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  // On a device without its write token, the dialog shows the link and says why it can't be changed there.
  await page.evaluate(async () => {
    const [{ app }, { deleteSecret }, { shares }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js'), import('/caps/share/share.js')])
    await deleteSecret(app.fs, `share:${shares.peek()[0].id}`)
  })
  await page.evaluate(async (path) => (await import('/caps/share/share.js')).openShare({ path, title: 'Plan the week' }), path)
  await expect(dialog).toContainText('This link was made on another device: only that one can change it.')
  await expect(dialog.locator('input.share-link')).toHaveValue(/#/)
  await expect(dialog.getByRole('button', { name: 'Update' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  // Nor does Your data: neither updated nor said to be stopped, it stays listed, as it still opens.
  const settings = await openSettings(page, 'Your data')
  await settings.locator('.share-list li').getByRole('button', { name: 'Update' }).click()
  await expect(settings.getByText('This link was made on another device: only that one can change it.')).toBeVisible()
  page.once('dialog', (asked) => asked.accept())
  await settings.locator('.share-list li').getByRole('button', { name: 'Stop sharing' }).click()
  await expect(settings.locator('.share-list li')).toHaveCount(1)
})

test('a task brought in draws what its answers hold: a page on sight, a chart and a score with Jean’s own skills that declare them (D378)', async ({ page }) => {
  await start(page)
  const hash = await page.evaluate(async (host) => {
    const [{ app, updateSettings }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }, { unlock }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js'), import('/ui/caps.js')])
    await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    const fence = (/** @type {string} */ kind, /** @type {string} */ text) => `\`\`\`${kind}\n${text}\n\`\`\``
    const text = ['Here they are.', fence('echarts', JSON.stringify({ xAxis: { type: 'category', data: ['Mon', 'Tue'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [3, 5] }] })),
      fence('abc', 'X:1\nT:Scale\nM:4/4\nK:C\nCDEF|GABc|'), fence('html', '<p>A small page</p>')].join('\n\n')
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Drawn' }), userRecord('Draw it', app.deviceId),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }, 0)])
    await unlock('share')
    const { create, shares } = await import('/caps/share/share.js')
    await create({ path, title: 'Drawn' }, {})
    const [share] = shares.peek()
    return `#/shared/${share.remote}/${share.secret}`
  }, SHARE_URL)
  // None of what draws them is here yet: no skill, and no message sent, which loads pages.
  const loaded = () => page.evaluate(async () => [...(await import('/ui/caps.js')).loaded.peek().keys()].filter((id) => ['skills', 'interactive'].includes(id)).sort())
  expect(await loaded()).toEqual([])

  page.once('dialog', (asked) => asked.accept())
  await page.evaluate((to) => { location.hash = to }, hash)
  await expect(page.locator('.toast')).toContainText('The shared task is here. Added to your skills, to show all of it: Chart and Music score.')
  const answer = page.locator('app-conversation .msg-jean .prose')
  await expect(answer.locator('app-chart .chart canvas').first()).toBeVisible()
  await expect(answer.locator('app-score .score-sheet svg')).toHaveCount(1)
  await expect(answer.locator('app-page iframe')).toHaveCount(1)
  await expect(answer.locator('pre code')).toHaveCount(0)
  expect(await loaded()).toEqual(['interactive', 'skills'])
  expect(await page.evaluate(async () => (await (await import('/caps/skills/skills.js')).skills()).map((skill) => skill.name).sort())).toEqual(['chart', 'music-score'])
})
