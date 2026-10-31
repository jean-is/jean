// An organisation on Microsoft's side, Jean set up by its policy alone (D191, D382, D385): the person
// signs in with Entra ID at the first visit, the AI gateway answers with that sign-in's token, and
// Microsoft 365 connects through the organisation's gateway, which holds the web app Entra registered
// for it. Microsoft is test/fixtures/fake-microsoft.js, at its own addresses.
import { test, expect } from '@playwright/test'
import { start, ask, answered, callTool, openSettings, closeSettings, withPolicy, connectTile } from './helpers.js'
import { POLICY, TENANT, ISSUER, SPA, WEB, SECRET, MAILBOX, fakeMicrosoft } from './fixtures/fake-microsoft.js'

const AT = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`
const NOT_KEPT = 'WebKit runs here like a private window: nothing is kept for the next visit, so the organisation’s sign-in comes first again on the way back'

/** Connects Microsoft 365 from its tile's page, in Settings › Connections. @param {import('@playwright/test').Page} page */
async function connectMicrosoft(page) {
  await openSettings(page, 'Connections')
  await connectTile(page, 'Microsoft 365')
  await expect(page.locator('.toast')).toContainText('Microsoft 365 is connected')
  await expect(page.locator('app-settings dialog[open] .data-head')).toContainText('12 actions')
}

test('Entra ID signs the person in with the tenant’s single-page app, the AI gateway answers with its token, and Microsoft 365 is reached through the organisation’s gateway', async ({ page, baseURL }) => {
  const microsoft = await fakeMicrosoft(page, { jean: String(baseURL) })
  await withPolicy(page, POLICY)
  await start(page)
  // Jean left for the tenant's sign-in with its own app, for the AI gateway's scope, and redeemed the
  // code from the page, which says its origin, with no secret, as Entra wants of a single-page app.
  expect(microsoft.authorized).toHaveLength(1)
  const [signIn] = microsoft.authorized
  expect(signIn.origin + signIn.pathname).toBe(AT)
  expect(signIn.searchParams.get('client_id')).toBe(SPA)
  expect(signIn.searchParams.get('scope')?.split(' ')).toEqual(['api://acme-ai-gateway/chat', 'profile', 'openid', 'email', 'offline_access'])
  expect(signIn.searchParams.get('code_challenge_method')).toBe('S256')
  expect(microsoft.redeemed.map(({ form, origin, from }) => ({ grant: form.get('grant_type'), client: form.get('client_id'), secret: form.has('client_secret'), origin, from })))
    .toEqual([{ grant: 'authorization_code', client: SPA, secret: false, origin: new URL(String(baseURL)).origin, from: 'page' }])
  // The AI gateway answers with that token alone.
  await ask(page, 'Hello')
  await answered(page)
  expect(new Set(microsoft.ai)).toEqual(new Set(['Bearer ai-2']))
  // Connections is there from the start, its gateway the organisation's, and through it Microsoft 365 is reached.
  const settings = await openSettings(page, 'Connections')
  await settings.locator('[data-page="later"]').click()
  await expect(settings.getByLabel('Gateway')).toBeDisabled()
  await expect(settings.locator('.settings-panel')).toContainText('Set by your organization')
  await settings.locator('.back').click()
  await expect(settings.locator('.service', { hasText: 'Microsoft 365' })).toBeEnabled()
  expect(microsoft.graph).toEqual([])
})

test('Microsoft 365 connects through the organisation’s gateway, which adds its web app’s secret where Entra trades and renews tokens; Outlook is read with Graph’s own token, which the AI gateway never sees', async ({ page, baseURL, browserName }) => {
  test.skip(browserName === 'webkit', NOT_KEPT)
  // Graph's tokens end within the minute, so each request to Graph renews one first.
  const microsoft = await fakeMicrosoft(page, { jean: String(baseURL), graphLifetime: 30 })
  await withPolicy(page, POLICY)
  await start(page)
  await connectMicrosoft(page)
  // Its sign-in is the tenant's, as policy has it, with the gateway's app, Graph's scopes and PKCE; Entra's document came through the gateway.
  expect(microsoft.authorized).toHaveLength(2)
  const connecting = microsoft.authorized[1]
  expect(connecting.origin + connecting.pathname).toBe(AT)
  expect(connecting.searchParams.get('client_id')).toBe(WEB)
  expect(connecting.searchParams.get('scope')?.split(' ')).toEqual(['User.Read', 'Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite', 'Files.ReadWrite', 'Files.Read.All', 'openid', 'email', 'offline_access'])
  expect(connecting.searchParams.get('code_challenge_method')).toBe('S256')
  expect(microsoft.relayed).toContain(`${ISSUER}/.well-known/openid-configuration`)
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.connections?.map(({ name, account, gateway }) => ({ name, account, gateway }))))
    .toEqual([{ name: 'Microsoft 365', account: 'ana@acme.example', gateway: true }])
  await closeSettings(page)

  // Outlook's latest emails, through Graph, cited.
  await ask(page, 'Summarise my latest emails')
  const approval = page.locator('.approval')
  await expect(approval).toContainText('Microsoft 365: Search emails')
  await approval.locator('.button.primary').click()
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText(`Your ${MAILBOX.length} latest emails`)
  for (const { subject } of MAILBOX) await expect(answer).toContainText(subject)
  await expect(answer.locator('.cite')).toHaveCount(MAILBOX.length)

  // The web app's code was traded, then its tokens renewed, by the gateway alone: with the secret,
  // which never reaches the page, and without the page's origin, as Entra wants of a web app.
  const web = microsoft.redeemed.filter(({ form }) => form.get('client_id') === WEB)
  expect(web.length).toBeGreaterThan(1)
  expect(web.map(({ form }) => form.get('grant_type'))).toEqual(['authorization_code', ...web.slice(1).map(() => 'refresh_token')])
  for (const { form, origin, from } of web) expect({ secret: form.get('client_secret'), origin, from }).toEqual({ secret: SECRET, origin: null, from: 'gateway' })
  expect(microsoft.redeemed.filter(({ from }) => from === 'page').every(({ form }) => !form.has('client_secret'))).toBe(true)
  // Each token went to what it was for: Graph's to Graph, the latest each time, and the sign-in's to the AI gateway, never crossed.
  expect(microsoft.graph.every((authorization) => authorization.startsWith('Bearer graph-'))).toBe(true)
  expect(microsoft.graph.at(-1)).toBe(`Bearer graph-${Math.max(...microsoft.graph.map((authorization) => Number(authorization.split('-')[1])))}`)
  expect(new Set(microsoft.ai)).toEqual(new Set(['Bearer ai-2']))
  // Graph is called from the browser, never through the gateway.
  expect(microsoft.relayed.every((address) => address.startsWith('https://login.microsoftonline.com/'))).toBe(true)
})

test('Microsoft 365’s calendar and files work as its mail does: an event added and found again, a Word document made in OneDrive, found by Microsoft Search and read from its signed address, which gets no token', async ({ page, baseURL, browserName }) => {
  test.skip(browserName === 'webkit', NOT_KEPT)
  const microsoft = await fakeMicrosoft(page, { jean: String(baseURL) })
  await withPolicy(page, POLICY)
  await start(page)
  await connectMicrosoft(page)
  await closeSettings(page)

  // The calendar: an event added at a time with its offset, kept in UTC, its guest invited; then found in its day.
  await expect(await callTool(page, 'microsoft_365_create_event', { title: 'Budget review', start: '2026-10-22T10:00:00+02:00', end: '2026-10-22T11:00:00+02:00', attendees: ['sam@acme.example'] }, 'Microsoft 365: Add an event'))
    .toContainText('Budget review')
  expect(microsoft.events).toMatchObject([{ subject: 'Budget review', start: { dateTime: '2026-10-22T08:00:00.000', timeZone: 'UTC' }, attendees: [{ emailAddress: { address: 'sam@acme.example' }, type: 'required' }] }])
  const events = await callTool(page, 'microsoft_365_list_events', { from: '2026-10-22', to: '2026-10-23' }, 'Microsoft 365: List events')
  await expect(events).toContainText('Budget review')
  await expect(events.locator('.cite')).toHaveCount(1)

  // OneDrive: a Word document made from Markdown, found, then read from where Graph signed it, with no token.
  await callTool(page, 'microsoft_365_create_document', { name: 'Board minutes.docx', content: 'The budget for 2027 was approved on 20 October.\n\n## Next steps\n\n- Sam sends the figures.' }, 'Microsoft 365: Make a document')
  const [made] = microsoft.files.values()
  expect(made.name).toBe('Board minutes.docx')
  expect(made.bytes.subarray(0, 2).toString()).toBe('PK')
  const found = await callTool(page, 'microsoft_365_search_files', { query: 'Board minutes' }, 'Microsoft 365: Search files')
  await expect(found).toContainText('Board minutes.docx')
  await expect(found).toContainText(`id: b!Acme-ana-drive/${made.id}`)
  const read = await callTool(page, 'microsoft_365_read_file', { id: `b!Acme-ana-drive/${made.id}` }, 'Microsoft 365: Read a file')
  await expect(read).toContainText('The budget for 2027 was approved on 20 October.')
  expect(microsoft.downloads).toEqual([undefined])
  // Every request to Graph had Graph's token, from the one sign-in, with every scope it asked for.
  expect(new Set(microsoft.graph)).toEqual(new Set([microsoft.graph[0]]))
  expect(microsoft.graph[0]).toMatch(/^Bearer graph-\d+$/)
})
