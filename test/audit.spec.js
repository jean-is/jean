// The audit export (D386, ee/): each turn goes to the organisation's OpenTelemetry collector as
// GenAI spans, metadata only unless policy asks for content, and so does each task deleted, once it
// is gone, never one a refusal kept (D412), and what is done outside the records (D421); on localhost
// no key is needed, and elsewhere a policy that asks for it without one stops Jean with a message for IT (D139).
// Settings › Your data says what goes, and who it names: the account, or a pseudonym (D427).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, withPolicy, openSettings, openProfile, closeSettings, openTasks, turnOn, connect, MAIL_URL, deleteOpenTask } from './helpers.js'
import { POLICY, COLLECTOR, fakeIssuer, fakeGateway, fakeCollector } from './fixtures/fake-issuer.js'
import { open, trusteePair } from './fixtures/trustee.js'

/** How many spans of a name reached it. @param {ReturnType<typeof fakeCollector> extends Promise<infer C> ? C : never} collector @param {string} name */
const count = (collector, name) => collector.spans().filter((span) => span.name === name).length
/** Spans come in batches, every few seconds. @param {ReturnType<typeof fakeCollector> extends Promise<infer C> ? C : never} collector @param {string} name */
const sent = (collector, name) => expect.poll(() => collector.spans().some((span) => span.name === name), { timeout: 20_000 }).toBe(true)

test('each turn goes to the collector as GenAI spans, metadata only', async ({ page }) => {
  const collector = await fakeCollector(page)
  await withPolicy(page, { audit: { otlpEndpoint: COLLECTOR } })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await sent(collector, 'invoke_agent')
  const spans = collector.spans()
  const root = spans.find((span) => span.name === 'invoke_agent')
  const chat = spans.find((span) => span.attrs['gen_ai.operation.name'] === 'chat')
  expect(chat.name).toBe('chat fake-brain-1')
  expect(chat.attrs).toMatchObject({ 'gen_ai.provider.name': 'custom', 'gen_ai.request.model': 'fake-brain-1' })
  expect(chat.parentSpanId).toBe(root.spanId)
  expect(chat.traceId).toBe(root.traceId)
  expect(root.attrs['gen_ai.conversation.id']).toMatch(/^[0-9A-Z]{26}$/)
  for (const span of spans) for (const key of ['gen_ai.input.messages', 'gen_ai.output.messages', 'gen_ai.tool.call.arguments']) expect(span.attrs[key], `${span.name} ${key}`).toBeUndefined()
  const [{ resource }] = collector.sent[0].body.resourceSpans
  const named = Object.fromEntries(resource.attributes.map((/** @type {any} */ { key, value }) => [key, Object.values(value)[0]]))
  expect(named['service.name']).toBe('jean')
  expect(named['device.id']).toMatch(/^[0-9A-Z]{26}$/)
})

test('with the organisation’s sign-in, the collector gets its token, who signed in, and, asked for, what was said', async ({ page }) => {
  const issuer = await fakeIssuer(page)
  await fakeGateway(page, issuer)
  const collector = await fakeCollector(page)
  await withPolicy(page, { ...POLICY, audit: { otlpEndpoint: COLLECTOR, auth: 'oidc', content: true } })
  await start(page)
  await ask(page, 'Hello')
  await sent(collector, 'invoke_agent')
  expect(collector.sent.at(-1)?.headers.authorization).toBe('Bearer access-1')
  const root = collector.spans().find((span) => span.name === 'invoke_agent')
  expect(JSON.parse(root.attrs['gen_ai.input.messages'])).toEqual([{ role: 'user', parts: [{ type: 'text', content: 'Hello' }] }])
  expect(JSON.parse(root.attrs['gen_ai.output.messages'])[0].role).toBe('assistant')
  const [{ resource }] = collector.sent.at(-1)?.body.resourceSpans
  expect(resource.attributes).toContainEqual({ key: 'user.email', value: { stringValue: 'ana@acme.example' } })
  await expect(await openSettings(page, 'Your data')).toContainText('It names you by ana@acme.example.')
})

test('as a pseudonym, the collector gets neither the email nor the device, only the account sealed for the trustee, and Settings says so (D427)', async ({ page }) => {
  const trustee = trusteePair()
  const issuer = await fakeIssuer(page)
  await fakeGateway(page, issuer)
  const collector = await fakeCollector(page)
  await withPolicy(page, { ...POLICY, audit: { otlpEndpoint: COLLECTOR, auth: 'oidc', person: 'pseudonym', trustee: trustee.public } })
  await start(page)
  await ask(page, 'Hello')
  await sent(collector, 'invoke_agent')
  const [{ resource }] = collector.sent.at(-1)?.body.resourceSpans
  const named = Object.fromEntries(resource.attributes.map((/** @type {any} */ { key, value }) => [key, Object.values(value)[0]]))
  for (const key of ['user.email', 'user.name', 'device.id']) expect(named[key], key).toBeUndefined()
  // This browser's Web Crypto sealed it as RFC 7516 says: the trustee's private key opens it.
  expect(JSON.parse(open(named['jean.user.sealed'], trustee.private).text)).toEqual({ 'user.email': 'ana@acme.example' })
  const settings = await openSettings(page, 'Your data')
  await expect(settings).toContainText('It names you by a random name made on this device. Only whoever holds a key your organization chose can tell from it that it’s you.')
  await expect(settings).not.toContainText('ana@acme.example')
})

test('a task deleted goes to the collector as a removal of its own, all of it, not as going back to a request', async ({ page }) => {
  const collector = await fakeCollector(page)
  await withPolicy(page, { audit: { otlpEndpoint: COLLECTOR } })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await sent(collector, 'invoke_agent')
  const task = collector.spans().find((span) => span.name === 'invoke_agent').attrs['gen_ai.conversation.id']
  page.on('dialog', (dialog) => dialog.accept())
  await deleteOpenTask(page)
  await expect(page.locator('.hero-question')).toBeVisible()
  await sent(collector, 'remove_records')
  const removed = collector.spans().filter((span) => span.name === 'remove_records')
  expect(removed).toHaveLength(1)
  expect(removed[0].attrs).toMatchObject({ 'gen_ai.conversation.id': task, 'jean.removed.all': true })
  expect(Number(removed[0].attrs['jean.records.removed'])).toBeGreaterThan(1)
  expect(removed[0].parentSpanId).toBeUndefined()
})

test('a project retention couldn’t keep all of stays, and none of its tasks goes to the collector as deleted', async ({ page }) => {
  const collector = await fakeCollector(page)
  await withPolicy(page, { audit: { otlpEndpoint: COLLECTOR }, retention: 'P6M' })
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Projects')
  const dialog = page.locator('app-project-dialog dialog[open]')
  await dialog.locator('input[name="name"]').fill('Bakery')
  await dialog.locator('.button.primary').click()
  await expect(page.locator('app-projects .wordmark')).toHaveText('Bakery')
  const turns = (/** @type {number} */ many) => expect.poll(() => count(collector, 'invoke_agent'), { timeout: 20_000 }).toBe(many)
  await ask(page, 'Hello')
  await turns(1)
  await (await openTasks(page)).locator('.place', { hasText: 'New task' }).click()
  await expect(page).toHaveURL(/#\/p\/[0-9A-Z]{26}\/$/)
  await ask(page, 'Hello again')
  await turns(2)
  // Retention keeps a copy of the first task it is asked about, and can't of the second, so nothing goes.
  await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const write = app.fs.write.bind(app.fs)
    let copies = 0
    app.fs.write = async (path, text) => {
      if (path.startsWith('.kept/') && copies++) throw new Error('The disk is full.')
      return write(path, text)
    }
  })
  page.on('dialog', (asked) => asked.accept())
  await page.locator('app-projects .wordmark').click()
  await page.locator('#project-menu button', { hasText: 'Project settings' }).click()
  await dialog.getByRole('button', { name: 'Delete this project' }).click()
  await expect(page.locator('.toast')).toContainText('Nothing was removed')
  await page.keyboard.press('Escape')
  await expect(page.locator('app-projects .wordmark')).toHaveText('Bakery')
  // What comes after it would follow it to the collector.
  await ask(page, 'Hello once more')
  await turns(3)
  expect(count(collector, 'remove_records')).toBe(0)
})

test('a removal refused goes nowhere: a profile retention keeps, its id on every span', async ({ page }) => {
  const collector = await fakeCollector(page)
  await withPolicy(page, { audit: { otlpEndpoint: COLLECTOR }, retention: 'P6M' })
  await start(page)
  test.skip(await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value), 'no profiles here: a private window, Playwright’s WebKit')
  const here = () => page.evaluate(() => (document.documentElement.classList.contains('is-ready') ? sessionStorage.getItem('app.profile') : null)).catch(() => null)
  await (await openProfile(page)).getByRole('button', { name: 'Add a profile' }).click()
  const dialog = page.locator('.profile-dialog[open]')
  await dialog.getByLabel('This profile’s name').fill('Ana')
  await dialog.getByLabel('The new profile’s name').fill('Work')
  await dialog.getByRole('button', { name: 'Add it' }).click()
  await expect.poll(here).toMatch(/-work$/)
  page.on('dialog', (asked) => asked.accept())
  await (await openSettings(page, 'Profiles')).getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('.toast')).toContainText('This profile stays')
  await closeSettings(page)
  // What comes after it would follow it to the collector.
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await sent(collector, 'invoke_agent')
  expect(collector.spans().map((span) => span.name)).not.toContain('remove_profile')
  const [{ resource }] = collector.sent.at(-1)?.body.resourceSpans
  expect(resource.attributes).toContainEqual({ key: 'jean.profile.id', value: { stringValue: String(await here()).slice(9, 35) } })
})

test('what is done outside the records goes as a span each: a skill added, used and deleted, a connection added, an answer copied, downloaded and printed (D421)', async ({ page }) => {
  const collector = await fakeCollector(page)
  await withPolicy(page, { audit: { otlpEndpoint: COLLECTOR } })
  // The clipboard and the printer are the browser's.
  await page.addInitScript(() => {
    window.print = () => {}
    Object.defineProperty(navigator.clipboard, 'write', { value: async () => {} })
  })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  const answer = page.locator('.msg-jean').last()
  await expect(answer.locator('.prose')).toContainText('Anything else?')
  const actions = answer.locator('.msg-actions')
  await actions.getByRole('button', { name: 'Copy' }).click()
  await expect(page.locator('.toast')).toContainText('Copied')
  for (const name of ['Download as a Word document', 'Print']) {
    await actions.getByRole('button', { name: 'More options' }).click()
    await answer.locator('.answer-menu').getByRole('button', { name }).click()
  }
  await sent(collector, 'print_answer')
  const task = collector.spans().find((span) => span.name === 'invoke_agent').attrs['gen_ai.conversation.id']
  const named = (/** @type {string} */ name) => collector.spans().filter((span) => span.name === name)
  expect(named('copy_answer').map((span) => span.attrs)).toEqual([{ 'gen_ai.conversation.id': task, 'gen_ai.agent.id': expect.stringMatching(/^[0-9A-Z]{26}$/) }])
  expect(named('save_answer').map((span) => span.attrs['jean.answer.format'])).toEqual(['docx'])
  expect(named('print_answer')[0].attrs['gen_ai.conversation.id']).toBe(task)

  // A skill from a file, named in the box, then deleted.
  await turnOn(page, 'Skills')
  await closeSettings(page)
  let knows = await openSettings(page, 'Skills')
  await knows.locator('input[type="file"]').setInputFiles({ name: 'SKILL.md', mimeType: 'text/markdown', buffer: Buffer.from('---\nname: weekly-report\ndescription: Write the weekly report.\n---\n# Weekly report\n\n1. List what was done.\n') })
  await expect(page.locator('.toast')).toContainText('Added the skill “Weekly report”.')
  await closeSettings(page)
  await ask(page, '/weekly-report for this week')
  await sent(collector, 'use_skill')
  const use = named('use_skill').find((span) => span.attrs['jean.skill.via'] === 'name')
  expect(use.attrs).toEqual({ 'gen_ai.conversation.id': task, 'jean.skill.name': 'weekly-report', 'jean.skill.via': 'name' })
  expect(named('invoke_agent').map((span) => span.spanId)).toContain(use.parentSpanId)
  page.on('dialog', (dialog) => dialog.accept())
  knows = await openSettings(page, 'Skills')
  await knows.locator('.skills .item', { hasText: 'Weekly report' }).click()
  await knows.getByRole('button', { name: 'Delete this skill' }).click()
  await expect(knows.locator('.skills .item', { hasText: 'Weekly report' })).toHaveCount(0)
  await closeSettings(page)
  // Before the connection's sign-in takes the page away.
  await sent(collector, 'remove_skill')
  expect(named('add_skill').map((span) => span.attrs)).toEqual([{ 'jean.skill.name': 'weekly-report', 'jean.skill.source': 'file' }])
  expect(named('remove_skill').map((span) => span.attrs)).toEqual([{ 'jean.skill.name': 'weekly-report' }])

  // A connection, by its host alone, its name only with content.
  await connect(page, `${MAIL_URL}/mcp`)
  await sent(collector, 'add_connection')
  expect(named('add_connection').map((span) => span.attrs)).toEqual([{ 'jean.connection.id': expect.stringMatching(/^[0-9A-Z]{26}$/), 'server.address': '127.0.0.1', 'jean.connection.auth': 'oauth' }])
  for (const name of ['add_skill', 'remove_skill', 'add_connection']) expect(named(name)[0].parentSpanId).toBeUndefined()
})

test('served from elsewhere, a policy that asks for the audit without a key stops Jean with a message for IT', async ({ page, baseURL }) => {
  // Jean served from an organisation's address, which needs a key.
  await page.route('https://jean.fake.example/**', async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace('https://jean.fake.example/', String(baseURL)) }) }))
  await withPolicy(page, { audit: { otlpEndpoint: COLLECTOR } })
  await page.goto('https://jean.fake.example/')
  await expect(page.locator('main.lock')).toContainText('This page can’t open: your organization’s settings ask for features that need a key, and none here unlocks them. Tell your IT team.')
  await expect(page.locator('#prompt')).toHaveCount(0)
})
