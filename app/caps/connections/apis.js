// Jean's own tools over a service's own API, where its MCP server can't serve everyone: Gmail, Google
// Calendar and Google Drive for every Google account (D349), Google's MCP servers being a preview for
// Workspace accounts (D344); Outlook, its calendar, OneDrive and SharePoint for every Microsoft account,
// through Microsoft Graph (D382). These APIs answer browsers, so their calls go straight to the service,
// never through a gateway. Each is a server as the MCP client is one (mcp.js): its tools listed once
// it says who is signed in, so that a token refused shows, and called, a refusal an MCPError, what a
// call brings in resources cited by their address. Host-agnostic: fetch, Web Crypto and Intl.
import { MCPError } from './mcp.js'
import { t, useStrings, locale } from '../../core/i18n.js'

/** @import { McpTool, CallResult } from './mcp.js' */
/**
 * @typedef {(path: string, init?: RequestInit & { as?: 'text' | 'bytes' }) => Promise<any>} Call  a request with the user's token: its JSON, its text or its bytes
 * @typedef {McpTool & { run: (args: any, call: Call) => Promise<any[]> }} Direct
 */

const encoder = new TextEncoder()

/** @param {Record<string, any>} properties @param {string[]} [required] */
const object = (properties, required = []) => ({ type: 'object', properties, required })
/** @param {string} description */
const string = (description) => ({ type: 'string', description })
const max = { type: 'integer', minimum: 1, maximum: 50, description: 'How many at most, 10 if left out' }
/** @param {string} name @param {string} description @param {any} inputSchema @param {boolean} readOnlyHint @param {Direct['run']} run @returns {Direct} */
const tool = (name, description, inputSchema, readOnlyHint, run) => ({ name, description, inputSchema, annotations: { readOnlyHint }, run })
/** What a call brings in: the brain reads its text, the user sees its quote. @param {string} uri @param {string} title @param {string} text @param {string} [description] */
const resource = (uri, title, text, description) => ({ type: 'resource', resource: { uri, title, text, mimeType: 'text/plain', ...(description && { description }) } })

/** Base64 in pieces, which a long email's body would overflow the call stack without. @param {Uint8Array} bytes */
function base64(bytes) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
/** @param {string} data */
const unbase64url = (data) => Uint8Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))

// ─── Gmail ───────────────────────────────────────────────────────────────────

/** A message's or a part's headers, by their names in lower case. @param {any} part @returns {Record<string, string>} */
const headersOf = (part) => Object.fromEntries((part?.headers ?? []).map((/** @type {any} */ { name, value }) => [name.toLowerCase(), value]))
/** A part and every part inside it. @param {any} part @returns {any[]} */
const partsOf = (part) => [part, ...(part?.parts ?? []).flatMap(partsOf)]
/** Who wrote it, to whom, when. @param {Record<string, string>} head */
const heads = (head) => ['From', 'To', 'Cc', 'Date'].flatMap((name) => (head[name.toLowerCase()] ? `${name}: ${head[name.toLowerCase()]}` : []))
/** A thread or a draft in Gmail, in the account it belongs to. @param {string} address @param {string} at */
const inGmail = (address, at) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(address)}#${at}`

const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })
/** An HTML email's text, or a snippet's, for the brain: blocks on their own lines, tags and styles gone. @param {string} html */
const textOf = (html) => html.replace(/<(style|script|head)\b[^]*?<\/\1>/gi, '').replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '')
  .replace(/&(#x?)?(\w+);/gi, (all, number, name) => (number ? String.fromCodePoint(Math.min(parseInt(name, number.length > 1 ? 16 : 10) || 32, 0x10ffff)) : ENTITIES[name.toLowerCase()] ?? all))
  .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*\n\s*/g, '\n\n').trim()

/** A part's text, in its own charset. @param {any} part */
function decoded(part) {
  const charset = /charset="?([\w.:-]+)/i.exec(headersOf(part)['content-type'] ?? '')?.[1]
  try { return new TextDecoder(charset).decode(unbase64url(part.body.data)) } catch { return new TextDecoder().decode(unbase64url(part.body.data)) }
}

/** A message's text, its plain part or else its HTML's, and the names of the files it carries. @param {any} payload */
function bodyOf(payload) {
  const parts = partsOf(payload)
  const [plain, html] = ['text/plain', 'text/html'].map((type) => parts.find((part) => part.mimeType === type && part.body?.data && !part.filename))
  return { text: plain ? decoded(plain) : html ? textOf(decoded(html)) : '', files: parts.flatMap((part) => part.filename || []) }
}

/** A header on one line, so that none can add another. @param {unknown} value */
const oneLine = (value) => [value ?? ''].flat().join(', ').replace(/[\r\n]+/g, ' ').trim()

/**
 * An email as Gmail takes it, RFC 5322 in Base64url; a reply goes in its thread, with the headers
 * that keep it there. @param {any} args @param {Call} call
 */
async function message({ to, cc, bcc, subject, body, reply_to }, call) {
  const replied = reply_to && await call(`messages/${encodeURIComponent(reply_to)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject`)
  const head = headersOf(replied?.payload)
  const id = head['message-id']
  const topic = oneLine(subject ?? (head.subject && (/^re:/i.test(head.subject) ? head.subject : `Re: ${head.subject}`)))
  const lines = [['To', to], ['Cc', cc], ['Bcc', bcc], ['In-Reply-To', id], ['References', id && [head.references, id].filter(Boolean).join(' ')]].flatMap(([name, value]) => (value ? `${name}: ${oneLine(value)}` : []))
  const raw = [...lines, `Subject: ${/^[\x20-\x7e]*$/.test(topic) ? topic : `=?UTF-8?B?${base64(encoder.encode(topic))}?=`}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    base64(encoder.encode(body ?? '')).replace(/.{76}(?=.)/g, '$&\r\n')].join('\r\n')
  return { raw: base64(encoder.encode(raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), ...(replied && { threadId: replied.threadId }) }
}

const composing = object({ to: string('Addresses, separated by commas'), cc: string('Copies to'), bcc: string('Hidden copies to'), subject: string('Left out for a reply: "Re: " and the original’s'),
  body: string('Plain text'), reply_to: string('The id of the email it answers, from search_emails') }, ['to', 'body'])

/** @type {Direct[]} */
const gmail = [
  tool('search_emails', 'Finds emails as Gmail’s search box does (from:, to:, subject:, is:unread, newer_than:7d, has:attachment…), each with its id, who wrote it, when and how it starts.',
    object({ query: string('Gmail’s search, e.g. "is:unread newer_than:2d"'), max }), true, async ({ query = '', max = 10 }, call) => {
      const [{ emailAddress }, { messages = [] }] = await Promise.all([call('profile'), call(`messages?${new URLSearchParams({ q: query, maxResults: String(max) })}`)])
      return Promise.all(messages.map(async (/** @type {any} */ { id }) => {
        const found = await call(`messages/${id}?format=metadata&${['From', 'To', 'Subject', 'Date'].map((name) => `metadataHeaders=${name}`).join('&')}`)
        const head = headersOf(found.payload)
        const start = textOf(found.snippet ?? '')
        return resource(inGmail(emailAddress, `all/${found.threadId}`), head.subject || '(no subject)', [`id: ${id}`, ...heads(head), '', start].join('\n'), start)
      }))
    }),
  tool('read_email', 'Reads an email whole, by its id, with the names of the files it carries.', object({ id: string('The email’s id, from search_emails') }, ['id']), true, async ({ id }, call) => {
    const [{ emailAddress }, found] = await Promise.all([call('profile'), call(`messages/${encodeURIComponent(id)}?format=full`)])
    const head = headersOf(found.payload)
    const { text, files } = bodyOf(found.payload)
    return [resource(inGmail(emailAddress, `all/${found.threadId}`), head.subject || '(no subject)', [...heads(head), ...(files.length ? [`Files: ${files.join(', ')}`] : []), '', text].join('\n'), textOf(found.snippet ?? ''))]
  }),
  tool('create_draft', 'Writes a draft in Gmail, which the user sends themselves; a reply stays in its thread.', composing, false, async (args, call) => {
    const [{ emailAddress }, draft] = await Promise.all([call('profile'), call('drafts', { method: 'POST', body: JSON.stringify({ message: await message(args, call) }) })])
    return [resource(inGmail(emailAddress, `drafts?compose=${draft.message.id}`), args.subject ?? '', `Draft saved (id: ${draft.id}).`)]
  }),
  tool('send_email', 'Sends an email from Gmail; a reply stays in its thread.', composing, false, async (args, call) => {
    const sent = await call('messages/send', { method: 'POST', body: JSON.stringify(await message(args, call)) })
    return [{ type: 'text', text: `Sent (id: ${sent.id}).` }]
  }),
]

// ─── Google Calendar ─────────────────────────────────────────────────────────

const DAY = /^\d{4}-\d{2}-\d{2}$/
/** The user's time zone, by its IANA name. */
const here = () => Intl.DateTimeFormat().resolvedOptions().timeZone
/** An instant, a day meaning its start where the user is. @param {string | number} at */
const instant = (at) => new Date(DAY.test(String(at)) ? `${at}T00:00` : at).toISOString()
/** A start or an end: a day, for a whole day, or a time, in a time zone. @param {string} at @param {string} [zone] */
const when = (at, zone = here()) => (DAY.test(at) ? { date: at } : { dateTime: at, timeZone: zone })
/** An event as Calendar takes it, from what was given. @param {any} args */
const event = ({ title, start, end, time_zone, location, description, attendees }) => ({ ...(title !== undefined && { summary: title }), ...(start && { start: when(start, time_zone) }), ...(end && { end: when(end, time_zone) }),
  ...(location !== undefined && { location }), ...(description !== undefined && { description }), ...(attendees && { attendees: [attendees].flat().map((email) => ({ email })) }) })
/** @param {any} item */
const described = (item) => [`id: ${item.id}`, `${item.start?.dateTime ?? item.start?.date} → ${item.end?.dateTime ?? item.end?.date}`, item.location && `Where: ${item.location}`,
  item.attendees?.length && `With: ${item.attendees.map((/** @type {any} */ one) => one.email).join(', ')}`, item.description].filter(Boolean).join('\n')
/** @param {any} item */
const asEvent = (item) => resource(item.htmlLink, item.summary ?? '(no title)', described(item))
/** @param {string} [calendar] @param {string} [id] */
const events = (calendar = 'primary', id) => `calendars/${encodeURIComponent(calendar)}/events${id ? `/${encodeURIComponent(id)}` : ''}`

const calendarId = string('The calendar’s id, from list_calendars; the user’s own if left out')
const eventId = string('The event’s id, from list_events')
const fields = { title: string('What it is'), start: string('An ISO 8601 time, e.g. 2026-10-16T14:00:00+02:00, or a day (2026-10-16) for a whole day'), end: string('The same; for a whole day, the day after'),
  time_zone: string('An IANA time zone, e.g. Europe/Paris; the user’s if left out'), location: string('Where'), description: string('More about it'), attendees: { type: 'array', items: { type: 'string' }, description: 'Guests’ addresses, each sent an invitation' } }

/** @type {Direct[]} */
const calendar = [
  tool('list_calendars', 'Lists the user’s calendars, with their ids.', object({}), true, async (_, call) => {
    const { items = [] } = await call('users/me/calendarList')
    return items.map((/** @type {any} */ item) => ({ type: 'text', text: `${item.id}: ${item.summaryOverride ?? item.summary}${item.primary ? ' (their own)' : ''}, ${item.accessRole}` }))
  }),
  tool('list_events', 'Lists a calendar’s events from a time on, earliest first, or those with given words.', object({ calendar: calendarId, from: string('An ISO 8601 time or a day; now if left out'), to: string('The same'), query: string('Words to find'), max }), true,
    async ({ calendar, from = Date.now(), to, query, max = 10 }, call) => {
      const { items = [] } = await call(`${events(calendar)}?${new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: String(max), timeMin: instant(from), ...(to && { timeMax: instant(to) }), ...(query && { q: query }) })}`)
      return items.map(asEvent)
    }),
  tool('create_event', 'Adds an event to a calendar; its guests are sent an invitation.', object({ calendar: calendarId, ...fields }, ['title', 'start', 'end']), false,
    async ({ calendar, ...args }, call) => [asEvent(await call(`${events(calendar)}?sendUpdates=all`, { method: 'POST', body: JSON.stringify(event(args)) }))]),
  tool('update_event', 'Changes what is given of an event; its guests are told.', object({ calendar: calendarId, id: eventId, ...fields }, ['id']), false,
    async ({ calendar, id, ...args }, call) => [asEvent(await call(`${events(calendar, id)}?sendUpdates=all`, { method: 'PATCH', body: JSON.stringify(event(args)) }))]),
  tool('delete_event', 'Removes an event; its guests are told it is cancelled.', object({ calendar: calendarId, id: eventId }, ['id']), false, async ({ calendar, id }, call) => {
    await call(`${events(calendar, id)}?sendUpdates=all`, { method: 'DELETE' })
    return [{ type: 'text', text: 'Removed.' }]
  }),
]

// ─── Google Drive ────────────────────────────────────────────────────────────

const FIELDS = 'id,name,mimeType,modifiedTime,webViewLink'
// Google's own files as text: a document in Markdown, a spreadsheet's first sheet in CSV, a presentation's words.
const EXPORTS = /** @type {Record<string, string>} */ ({ 'application/vnd.google-apps.document': 'text/markdown', 'application/vnd.google-apps.spreadsheet': 'text/csv', 'application/vnd.google-apps.presentation': 'text/plain' })
/** @param {any} file */
const asFile = (file) => resource(file.webViewLink, file.name, `id: ${file.id}\n${file.mimeType}, changed ${file.modifiedTime}`)

/** @type {Direct[]} */
const drive = [
  tool('search_files', 'Finds files in Google Drive by words in them or in their names; with none, those the user had open last.', object({ query: string('Words to find'), max }), true, async ({ query, max = 10 }, call) => {
    const q = `${query ? `fullText contains '${String(query).replace(/[\\']/g, '\\$&')}' and ` : ''}trashed = false`
    const { files = [] } = await call(`files?${new URLSearchParams({ q, pageSize: String(max), fields: `files(${FIELDS})`, ...(!query && { orderBy: 'recency desc' }) })}`)
    return files.map(asFile)
  }),
  tool('read_file', 'Reads a file’s text: a document in Markdown, a spreadsheet’s first sheet in CSV, a presentation’s words, or a text file.', object({ id: string('The file’s id, from search_files') }, ['id']), true, async ({ id }, call) => {
    const at = `files/${encodeURIComponent(id)}`
    const file = await call(`${at}?fields=${FIELDS}&supportsAllDrives=true`)
    const as = EXPORTS[file.mimeType]
    if (!as && !/^text\/|\/(json|xml|csv)$/.test(file.mimeType)) throw new Error(`${file.name} is a file of type ${file.mimeType}, whose text can’t be read here.`)
    return [resource(file.webViewLink, file.name, await call(as ? `${at}/export?mimeType=${encodeURIComponent(as)}` : `${at}?alt=media&supportsAllDrives=true`, { as: 'text' }))]
  }),
  tool('create_document', 'Makes a Google Docs document from Markdown, in the user’s Drive.', object({ name: string('Its name'), content: string('Its text, in Markdown') }, ['name', 'content']), false, async ({ name, content }, call) => {
    const boundary = crypto.randomUUID()
    const body = [`--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify({ name, mimeType: 'application/vnd.google-apps.document' }),
      `--${boundary}`, 'Content-Type: text/markdown; charset=UTF-8', '', content, `--${boundary}--`].join('\r\n')
    return [asFile(await call(`/upload/drive/v3/files?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body }))]
  }),
]

// ─── Microsoft Graph ─────────────────────────────────────────────────────────

/** Query options as Graph reads them, their `$` unescaped. @param {Record<string, string | number | undefined>} options */
const odata = (options) => Object.entries(options).flatMap(([name, value]) => (value === undefined ? [] : `${name}=${encodeURIComponent(value)}`)).join('&')
/** "Sam <sam@example.com>", or the address alone. @param {any} who */
const person = ({ emailAddress: { name = '', address = '' } = {} }) => (name && name !== address ? `${name} <${address}>` : address)
/** Who wrote an email, to whom, when. @param {any} mail */
const mailHeads = (mail) => [...Object.entries({ From: mail.from && [mail.from], To: mail.toRecipients, Cc: mail.ccRecipients }).flatMap(([name, people]) => (people?.length ? `${name}: ${people.map(person).join(', ')}` : [])), ...(mail.receivedDateTime ? [`Date: ${mail.receivedDateTime}`] : [])]
/** Addresses as Graph takes them, from a list or between commas, each "Sam <sam@example.com>" or the address alone. @param {unknown} list */
const recipients = (list) => [list ?? []].flat().flatMap((each) => String(each).split(',')).map((one) => one.trim()).filter(Boolean).map((one) => ({ emailAddress: { address: /<([^>]*)>/.exec(one)?.[1] ?? one } }))
/** An email as Graph takes it, or a reply in its thread, its text above what it answers. @param {any} args */
const outgoing = ({ to, cc, bcc, subject, body = '', reply_to }) => {
  const message = { ...(subject !== undefined && { subject: oneLine(subject) }), toRecipients: recipients(to), ccRecipients: recipients(cc), bccRecipients: recipients(bcc) }
  return reply_to ? { message, comment: body } : { message: { ...message, body: { contentType: 'text', content: body } } }
}
const MAIL = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,webLink'
/** An email, cited by its address in Outlook. @param {any} mail @param {string} text */
const asMail = (mail, text) => resource(mail.webLink, mail.subject || '(no subject)', text, mail.bodyPreview)

/** @type {Direct[]} */
const outlook = [
  tool('search_emails', 'Finds emails as Outlook’s search box does (from:, to:, subject:, hasattachment:true, received>=2026-10-01…), or the latest, each with its id, who wrote it, when and how it starts.',
    object({ query: string('Outlook’s search, e.g. "from:sam subject:budget"'), max }), true, async ({ query, max = 10 }, call) => {
      const { value = [] } = await call(`me/messages?${odata({ $select: MAIL, $top: max, ...(query ? { $search: `"${String(query).replace(/"/g, '')}"` } : { $orderby: 'receivedDateTime desc' }) })}`)
      return value.map((/** @type {any} */ mail) => asMail(mail, [`id: ${mail.id}`, ...mailHeads(mail), '', mail.bodyPreview].join('\n')))
    }),
  tool('read_email', 'Reads an email whole, by its id, with the names of the files it carries.', object({ id: string('The email’s id, from search_emails') }, ['id']), true, async ({ id }, call) => {
    const at = `me/messages/${encodeURIComponent(id)}`
    const [mail, { value: files = [] }] = await Promise.all([call(`${at}?${odata({ $select: `${MAIL},body` })}`, { headers: { prefer: 'outlook.body-content-type="text"' } }), call(`${at}/attachments?${odata({ $select: 'name,isInline' })}`)])
    const names = files.flatMap((/** @type {any} */ file) => (file.isInline ? [] : file.name))
    return [asMail(mail, [...mailHeads(mail), ...(names.length ? [`Files: ${names.join(', ')}`] : []), '', mail.body?.content ?? ''].join('\n'))]
  }),
  tool('create_draft', 'Writes a draft in Outlook, which the user sends themselves; a reply stays in its thread.', composing, false, async (args, call) => {
    const draft = await call(args.reply_to ? `me/messages/${encodeURIComponent(args.reply_to)}/createReply` : 'me/messages', { method: 'POST', body: JSON.stringify(args.reply_to ? outgoing(args) : outgoing(args).message) })
    return [asMail(draft, `Draft saved (id: ${draft.id}).`)]
  }),
  tool('send_email', 'Sends an email from Outlook; a reply stays in its thread.', composing, false, async (args, call) => {
    await call(args.reply_to ? `me/messages/${encodeURIComponent(args.reply_to)}/reply` : 'me/sendMail', { method: 'POST', body: JSON.stringify(outgoing(args)) })
    return [{ type: 'text', text: 'Sent.' }]
  }),
]

// Times go in with their offset, kept in UTC, or in the zone given, and come back in the user's.
const EVENT = 'id,subject,start,end,location,attendees,bodyPreview,webLink'
const inZone = () => ({ headers: { prefer: `outlook.timezone="${here()}"` } })
/** A start or an end: a time with its offset, a whole day from its midnight, or a time in a zone. @param {string} at @param {string} [zone] */
const slot = (at, zone = here()) => (/([zZ]|[+-]\d\d:?\d\d)$/.test(at) ? { dateTime: new Date(at).toISOString().slice(0, -1), timeZone: 'UTC' } : { dateTime: DAY.test(at) ? `${at}T00:00:00` : at, timeZone: zone })
/** An event as Graph takes it, from what was given. @param {any} args */
const meeting = ({ title, start, end, time_zone, location, description, attendees }) => ({ ...(title !== undefined && { subject: title }), ...(start && { start: slot(start, time_zone), isAllDay: DAY.test(start) }), ...(end && { end: slot(end, time_zone) }), ...(location !== undefined && { location: { displayName: location } }),
  ...(description !== undefined && { body: { contentType: 'text', content: description } }), ...(attendees && { attendees: [attendees].flat().map((address) => ({ emailAddress: { address }, type: 'required' })) }) })
/** @param {any} item */
const asMeeting = (item) => resource(item.webLink, item.subject || '(no title)', [`id: ${item.id}`, `${item.start?.dateTime} → ${item.end?.dateTime} (${item.start?.timeZone})`, item.location?.displayName && `Where: ${item.location.displayName}`,
  item.attendees?.length && `With: ${item.attendees.map((/** @type {any} */ one) => one.emailAddress?.address).join(', ')}`, item.bodyPreview].filter(Boolean).join('\n'))
/** A calendar of the user's, their own if none is named. @param {string} [id] */
const calendarAt = (id) => (id ? `me/calendars/${encodeURIComponent(id)}` : 'me/calendar')

/** @type {Direct[]} */
const outlookCalendar = [
  tool('list_calendars', 'Lists the user’s calendars, with their ids.', object({}), true, async (_, call) => {
    const { value = [] } = await call(`me/calendars?${odata({ $select: 'id,name,isDefaultCalendar,canEdit' })}`)
    return value.map((/** @type {any} */ item) => ({ type: 'text', text: `${item.id}: ${item.name}${item.isDefaultCalendar ? ' (their own)' : ''}, ${item.canEdit ? 'writer' : 'reader'}` }))
  }),
  tool('list_events', 'Lists a calendar’s events from a time on, earliest first, or those with given words.', object({ calendar: calendarId, from: string('An ISO 8601 time or a day; now if left out'), to: string('The same; a year on if left out'), query: string('Words to find'), max }), true,
    async ({ calendar, from = Date.now(), to, query = '', max = 10 }, call) => {
      const start = instant(from)
      const { value = [] } = await call(`${calendarAt(calendar)}/calendarView?${odata({ startDateTime: start, endDateTime: to ? instant(to) : new Date(Date.parse(start) + 366 * 86_400_000).toISOString(), $orderby: 'start/dateTime', $top: query ? 200 : max, $select: EVENT })}`, inZone())
      return value.filter((/** @type {any} */ item) => [item.subject, item.location?.displayName, item.bodyPreview].join(' ').toLowerCase().includes(String(query).toLowerCase())).slice(0, max).map(asMeeting)
    }),
  tool('create_event', 'Adds an event to a calendar; its guests are sent an invitation.', object({ calendar: calendarId, ...fields }, ['title', 'start', 'end']), false,
    async ({ calendar, ...args }, call) => [asMeeting(await call(`${calendarAt(calendar)}/events`, { method: 'POST', body: JSON.stringify(meeting(args)), ...inZone() }))]),
  tool('update_event', 'Changes what is given of an event; its guests are told.', object({ id: eventId, ...fields }, ['id']), false,
    async ({ id, ...args }, call) => [asMeeting(await call(`me/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(meeting(args)), ...inZone() }))]),
  tool('delete_event', 'Removes an event; its guests are told it is cancelled.', object({ id: eventId }, ['id']), false, async ({ id }, call) => {
    await call(`me/events/${encodeURIComponent(id)}`, { method: 'DELETE' })
    return [{ type: 'text', text: 'Removed.' }]
  }),
]

/** A file, where it is: one shared with the user is in another's drive, which its id names. @param {any} found */
const asItem = (found) => {
  const item = found.remoteItem ?? found
  return resource(found.webUrl ?? item.webUrl, found.name, `id: ${item.parentReference?.driveId}/${item.id}\n${found.folder ? 'A folder, changed' : 'Changed'} ${found.lastModifiedDateTime}`)
}
/** A file's address, from its id as asItem gives it: its drive's, then its own. @param {string} id */
const itemAt = (id) => `drives/${String(id).split('/').map(encodeURIComponent).join('/items/')}`

/** @type {Direct[]} */
const onedrive = [
  tool('search_files', 'Finds files in OneDrive and SharePoint, the user’s own and those shared with them, by words in them or in their names.', object({ query: string('Words to find'), max }, ['query']), true, async ({ query, max = 10 }, call) => {
    // Microsoft Search reaches SharePoint, for a work or school account; a personal account's OneDrive is searched in itself.
    const hits = await call('search/query', { method: 'POST', body: JSON.stringify({ requests: [{ entityTypes: ['driveItem'], query: { queryString: query }, size: max }] }) })
      .then(({ value }) => value?.[0]?.hitsContainers?.flatMap((/** @type {any} */ found) => found.hits ?? []).map((/** @type {any} */ hit) => hit.resource) ?? [], () => [])
    return (hits.length ? hits : (await call(`me/drive/search(q='${encodeURIComponent(String(query).replace(/'/g, "''"))}')?${odata({ $top: max })}`)).value ?? []).map(asItem)
  }),
  tool('read_file', 'Reads a file’s text: a Word document, a presentation, a spreadsheet’s sheets, or a text file.', object({ id: string('The file’s id, from search_files') }, ['id']), true, async ({ id }, call) => {
    const { extractable, extractPages } = await import('../files/extract.js')
    const item = await call(`${itemAt(id)}?$select=name,webUrl,@microsoft.graph.downloadUrl`)
    if (!extractable(item.name)) throw new Error(`${item.name} is a file whose text can’t be read here.`)
    // Its content is at an address signed already, fetched with no token: /content redirects there, which a request with one can't follow.
    return [resource(item.webUrl, item.name, ((await extractPages(item.name, await call(item['@microsoft.graph.downloadUrl'], { as: 'bytes' }))) ?? []).join('\n\n'))]
  }),
  tool('create_document', 'Makes a file in the user’s OneDrive: a Word document from Markdown, a spreadsheet from CSV or Markdown tables, or a text file.',
    object({ name: string('Its name, with its kind: Report.docx, Budget.xlsx, Notes.md'), content: string('Markdown for a document, CSV or Markdown tables for a spreadsheet, else the text itself') }, ['name', 'content']), false, async ({ name, content }, call) => {
      const { makeFile, paperFor } = await import('../made/formats.js')
      const file = await makeFile(name, content, { paper: paperFor(locale.value) })
      return [asItem(await call(`me/drive/root:/${encodeURIComponent(file.name)}:/content?@microsoft.graph.conflictBehavior=rename`, { method: 'PUT', headers: { 'content-type': file.mimeType }, body: /** @type {BodyInit} */ (file.bytes) }))]
    }),
]

/** Each API by its address (caps/connections/directory.js), with what says who is signed in. @type {Record<string, { who: string, tools: Direct[] }>} */
export const APIS = {
  'https://gmail.googleapis.com/gmail/v1/users/me/': { who: 'profile', tools: gmail },
  'https://www.googleapis.com/calendar/v3/': { who: 'users/me/calendarList?maxResults=1', tools: calendar },
  'https://www.googleapis.com/drive/v3/': { who: 'about?fields=user', tools: drive },
  'https://graph.microsoft.com/v1.0/': { who: 'me?$select=id', tools: [...outlook, ...outlookCalendar, ...onedrive] },
}

/**
 * The server at an address, when it is one of these APIs, or null.
 * @param {{ url: string, authorization: () => Promise<string | undefined>, fetch?: typeof globalThis.fetch }} options
 */
export function apiClient({ url, authorization, fetch = globalThis.fetch }) {
  const api = APIS[url]
  if (!api) return null
  /** @param {AbortSignal} [signal] @returns {Call} */
  const caller = (signal) => async (path, { as, ...init } = {}) => {
    const at = new URL(path, url)
    // The API's own origin alone gets the token: a file's download address is signed already (Graph's).
    const auth = at.origin === new URL(url).origin ? await authorization() : undefined
    const res = await fetch(at, { ...init, signal, headers: { ...(auth && { authorization: auth }), ...(typeof init.body === 'string' && { 'content-type': 'application/json' }), ...init.headers } })
    if (res.ok) return as === 'bytes' ? new Uint8Array(await res.arrayBuffer()) : as ? res.text() : res.status === 202 || res.status === 204 ? null : res.json()
    const { error } = await res.json().catch(() => ({}))
    // A token refused, or a sign-in that doesn't allow this, as an MCP server refuses them (D344).
    if (res.status === 401 || /SCOPE_INSUFFICIENT|insufficientPermissions|ErrorAccessDenied|Authorization_RequestDenied/.test(JSON.stringify(error ?? ''))) throw new MCPError(error?.message ?? `HTTP ${res.status}`, { status: res.status })
    throw new Error(error?.message ?? `HTTP ${res.status}`)
  }
  return {
    /** @param {AbortSignal} [signal] @returns {Promise<McpTool[]>} */
    listTools: async (signal) => {
      await Promise.all([caller(signal)(api.who), useStrings('connections')])
      return api.tools.map(({ run, ...each }) => ({ ...each, title: t(`api.${each.name}`) }))
    },
    /** @param {McpTool} tool @param {Record<string, any>} args @param {AbortSignal} [signal] @returns {Promise<CallResult>} */
    callTool: async (tool, args, signal) => {
      const run = api.tools.find((each) => each.name === tool.name)?.run
      if (!run) throw new Error(`No tool is called ${tool.name}.`)
      const content = await run(args, caller(signal))
      return { content: content.length ? content : [{ type: 'text', text: 'Nothing found.' }] }
    },
  }
}
