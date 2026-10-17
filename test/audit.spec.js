// The audit export (D386, ee/): each turn goes to the organisation's OpenTelemetry collector as
// GenAI spans, metadata only unless policy asks for content; on localhost no key is needed, and
// elsewhere a policy that asks for it without one stops Jean with a message for IT (D139).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, withPolicy } from './helpers.js'
import { POLICY, COLLECTOR, fakeIssuer, fakeGateway, fakeCollector } from './fixtures/fake-issuer.js'

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
})

test('served from elsewhere, a policy that asks for the audit without a key stops Jean with a message for IT', async ({ page, baseURL }) => {
  // Jean served from an organisation's address, which needs a key.
  await page.route('https://jean.fake.example/**', async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace('https://jean.fake.example/', String(baseURL)) }) }))
  await withPolicy(page, { audit: { otlpEndpoint: COLLECTOR } })
  await page.goto('https://jean.fake.example/')
  await expect(page.locator('main.lock')).toContainText('This page can’t open: your organization’s settings ask for features that need a key, and none here unlocks them. Tell your IT team.')
  await expect(page.locator('#prompt')).toHaveCount(0)
})
