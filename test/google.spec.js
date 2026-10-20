// An organisation on Google Workspace, Jean set up by its policy alone (D191, D344, D349, D440): its
// gateway holds the web app Google registered for it, so Gmail, Google Calendar, Google Drive and
// Google Workspace connect through it, and its AI gateway, whose contract rules out training on what it
// is sent, reads what they bring in. Google is test/fixtures/fake-google.js, at its own addresses.
import { test, expect } from '@playwright/test'
import { start, ask, callTool, openSettings, closeSettings, withPolicy } from './helpers.js'
import { CLIENT, SECRET, INBOX, SERVERS, policy, fakeGoogle } from './fixtures/fake-google.js'

const AUTH = 'https://www.googleapis.com/auth/'

/** Connects a service from its tile, in Settings › Connections. @param {import('@playwright/test').Page} page @param {string} name @param {number} actions */
async function connectTile(page, name, actions) {
  await (await openSettings(page, 'Connections')).getByRole('button', { name: tile(name) }).click()
  await expect(page.locator('.toast')).toContainText(`${name} is connected`)
  await expect(page.locator('app-settings dialog[open] .connection')).toContainText(`${actions} actions`)
}

/** A tile, by the name it starts with: Google Workspace's says what it includes, Gmail and Calendar among them. @param {string} name */
const tile = (name) => new RegExp(`^${name}\\b`)

/** The scopes a sign-in asked for. @param {URL} url */
const scopes = (url) => url.searchParams.get('scope')?.split(' ')

test('Gmail, Google Calendar, Google Drive and Google Workspace are reached through the organisation’s gateway, which holds Google’s app; Gmail signs in with it, offline, its tokens traded and renewed there, and the AI gateway the policy says never trains sums up the latest emails', async ({ page, baseURL }) => {
  // Google's tokens end within the minute, so each request to Gmail renews one first.
  const google = await fakeGoogle(page, { jean: String(baseURL), lifetime: 30 })
  await withPolicy(page, policy())
  await start(page)
  const settings = await openSettings(page, 'Connections')
  for (const name of ['Gmail', 'Google Calendar', 'Google Drive', 'Google Workspace']) await expect(settings.getByRole('button', { name: tile(name) })).toBeEnabled()
  await closeSettings(page)
  await connectTile(page, 'Gmail', 4)
  // Google's sign-in, with the gateway's app, for Gmail's scope alone, offline and with consent so that it renews, with PKCE and no resource indicator.
  expect(google.authorized).toHaveLength(1)
  const [asked] = google.authorized
  expect(asked.searchParams.get('client_id')).toBe(CLIENT)
  expect(scopes(asked)).toEqual([`${AUTH}gmail.modify`, 'openid', 'email'])
  expect(['access_type', 'prompt', 'code_challenge_method', 'resource'].map((name) => asked.searchParams.get(name))).toEqual(['offline', 'consent', 'S256', null])
  await closeSettings(page)

  await ask(page, 'Summarise my latest emails')
  const approval = page.locator('.approval')
  await expect(approval).toContainText('Gmail: Search emails')
  await approval.locator('.button.primary').click()
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText(`Your ${INBOX.length} latest emails`)
  for (const { subject } of INBOX) await expect(answer).toContainText(subject)
  await expect(answer.locator('.cite')).toHaveCount(INBOX.length)

  // The code was traded, then the tokens renewed, by the gateway alone, with the secret the page never
  // holds; renewed with the refresh token the offline sign-in gave, since Google gives no other.
  expect(google.redeemed.length).toBeGreaterThan(1)
  expect(google.redeemed.map(({ form }) => form.get('grant_type'))).toEqual(['authorization_code', ...google.redeemed.slice(1).map(() => 'refresh_token')])
  for (const { form, from } of google.redeemed) expect({ secret: form.get('client_secret'), from }).toEqual({ secret: SECRET, from: 'gateway' })
  expect(new Set(google.redeemed.slice(1).map(({ form }) => form.get('refresh_token')))).toEqual(new Set(['1//refresh-2']))
  // Gmail is called from the browser, with Google's token; the gateway relays the sign-in alone.
  expect(google.api.every(({ url, authorization }) => url.hostname === 'gmail.googleapis.com' && /^Bearer ya29\.\d+$/.test(authorization))).toBe(true)
  expect(google.relayed.every((address) => /^https:\/\/(accounts\.google\.com|oauth2\.googleapis\.com)\//.test(address))).toBe(true)
  // The AI gateway read the emails: the policy says it never trains on them.
  expect(google.ai.some((body) => body.includes(INBOX[0].subject))).toBe(true)
})

test('Google Calendar connects through the gateway with its own scopes: an event added at a time in a zone, its guest invited, then found in its day', async ({ page, baseURL }) => {
  const google = await fakeGoogle(page, { jean: String(baseURL) })
  await withPolicy(page, policy())
  await start(page)
  await connectTile(page, 'Google Calendar', 5)
  expect(scopes(google.authorized[0])).toEqual([`${AUTH}calendar.events`, `${AUTH}calendar.calendarlist.readonly`, 'openid', 'email'])
  await closeSettings(page)
  const added = await callTool(page, 'google_calendar_create_event', { title: 'Budget review', start: '2026-10-22T10:00:00+02:00', end: '2026-10-22T11:00:00+02:00', time_zone: 'Europe/Paris', attendees: ['sam@acme.example'] }, 'Google Calendar: Add an event')
  await expect(added).toContainText('Budget review')
  expect(google.events).toMatchObject([{ summary: 'Budget review', start: { dateTime: '2026-10-22T10:00:00+02:00', timeZone: 'Europe/Paris' }, attendees: [{ email: 'sam@acme.example' }], sendUpdates: 'all' }])
  const events = await callTool(page, 'google_calendar_list_events', { from: '2026-10-22', to: '2026-10-23' }, 'Google Calendar: List events')
  await expect(events).toContainText('Budget review')
  await expect(events.locator('.cite')).toHaveCount(1)
  expect(google.api.every(({ url }) => url.pathname.startsWith('/calendar/v3/'))).toBe(true)
})

test('Google Drive connects through the gateway with its own scopes: a document made from Markdown, found by its words, then read back in Markdown', async ({ page, baseURL }) => {
  const google = await fakeGoogle(page, { jean: String(baseURL) })
  await withPolicy(page, policy())
  await start(page)
  await connectTile(page, 'Google Drive', 3)
  expect(scopes(google.authorized[0])).toEqual([`${AUTH}drive.readonly`, `${AUTH}drive.file`, 'openid', 'email'])
  await closeSettings(page)
  const content = 'Two days in Lyon, from 12 November.\n\n## Who comes\n\n- The board.'
  await expect(await callTool(page, 'google_drive_create_document', { name: 'Offsite plan', content }, 'Google Drive: Make a document')).toContainText('Offsite plan')
  expect(google.files).toMatchObject([{ name: 'Offsite plan', mimeType: 'application/vnd.google-apps.document', content }])
  await expect(await callTool(page, 'google_drive_search_files', { query: 'Lyon' }, 'Google Drive: Search files')).toContainText('Offsite plan')
  await expect(await callTool(page, 'google_drive_read_file', { id: google.files[0].id }, 'Google Drive: Read a file')).toContainText('Two days in Lyon, from 12 November.')
  expect(google.api.find(({ url }) => url.pathname.endsWith('/export'))?.url.searchParams.get('mimeType')).toBe('text/markdown')
})

test('Google Workspace signs in once for its eight servers, through the gateway, which carries each server’s session; their tools run there, never from the page', async ({ page, baseURL }) => {
  const google = await fakeGoogle(page, { jean: String(baseURL) })
  await withPolicy(page, policy())
  await start(page)
  await connectTile(page, 'Google Workspace', Object.keys(SERVERS).length)
  // One sign-in, for what every server's tools need, its resource the first server's.
  expect(google.authorized).toHaveLength(1)
  const [asked] = google.authorized
  expect(asked.searchParams.get('client_id')).toBe(CLIENT)
  expect(scopes(asked)).toEqual(expect.arrayContaining([...Object.values(SERVERS).map(({ scope }) => `${AUTH}${scope}`), 'openid', 'email']))
  expect(asked.searchParams.get('resource')).toBe('https://gmailmcp.googleapis.com/mcp/v1')
  // Each server listed its tools to that one token, in a session it started, through the gateway alone.
  expect(new Set(google.servers.map(({ host }) => host))).toEqual(new Set(Object.keys(SERVERS)))
  expect(google.redeemed).toHaveLength(1)
  expect(new Set(google.servers.map(({ authorization }) => authorization))).toEqual(new Set(['Bearer ya29.2']))
  for (const host of Object.keys(SERVERS)) expect(google.servers.some((each) => each.host === host && each.session?.startsWith(host))).toBe(true)
  await closeSettings(page)
  // Two of them called, each at its own server.
  for (const host of ['gmailmcp.googleapis.com', 'people.googleapis.com']) {
    const { tool, title, says } = SERVERS[host]
    await expect(await callTool(page, `google_workspace_${tool}`, { query: 'offsite' }, `Google Workspace: ${title}`)).toContainText(says)
  }
  expect(google.redeemed.every(({ from, form }) => from === 'gateway' && form.get('client_secret') === SECRET)).toBe(true)
  expect(google.direct).toEqual([])
})

test('an AI gateway the policy doesn’t say never trains is given nothing Google’s services bring in, whoever asks (D440)', async ({ page, baseURL }) => {
  const google = await fakeGoogle(page, { jean: String(baseURL) })
  await withPolicy(page, policy({ trains: true }))
  await start(page)
  await connectTile(page, 'Gmail', 4)
  await closeSettings(page)
  await ask(page, 'Summarise my latest emails')
  await page.locator('.approval .button.primary').click()
  await expect(page.locator('.toast')).toContainText('This task used Google services')
  // Gmail said who is signed in, to list its tools, and no more: no email left it, and the AI gateway read none.
  expect(google.api.map(({ url }) => url.pathname)).toEqual(['/gmail/v1/users/me/profile'])
  expect(google.ai.some((body) => INBOX.some(({ subject }) => body.includes(subject)))).toBe(false)
})
