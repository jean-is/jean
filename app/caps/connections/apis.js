// SPDX-License-Identifier: MIT
// Jean's own tools over a service's own API, where its MCP server can't serve everyone: Gmail, Google
// Calendar, Google Drive, Google Docs and Google Sheets for every Google account (D349), Google's MCP servers being a preview for
// Workspace accounts (D344); Outlook, its calendar and contacts, OneDrive, SharePoint, and for a work account
// Teams, its meetings' transcripts and shared mailboxes, through Microsoft Graph (D382). These APIs answer
// browsers, so their calls go straight to the service, never through a gateway. Each is a server as the MCP
// client is one (mcp.js): its tools listed once it says who is signed in, those alone that what the sign-in
// granted allows, so that a token refused shows, and called, a refusal an MCPError, what a call brings in
// resources cited by their address. Host-agnostic: fetch, Web Crypto and Intl.
import { MCPError } from './mcp.js'
import { encode as base64 } from '../../ui/seal.js'
import { t, useStrings, locale } from '../../core/i18n.js'

/** @import { McpTool, CallResult } from './mcp.js' */
/** @import { JsonSchema, Content, GmailPart, CalendarEntry, CalendarEvent, DriveFile, SharedDrive, DocsStyle, DocsElement, Recipient, GraphMail, GraphAttachment, GraphCalendar, GraphEvent, DriveItem, SearchHits, TeamsMessage, TeamsChat, GraphPerson } from './types.js' */
/**
 * A request with the user's token: its text, its bytes, or its JSON, whose shape is the path's.
 * @typedef {{ (path: string, init: RequestInit & { as: 'text' }): Promise<string>, (path: string, init: RequestInit & { as: 'bytes' }): Promise<Uint8Array>, (path: string, init?: RequestInit & { as?: undefined }): Promise<any> }} Call
 * @typedef {McpTool & { run: (args: any, call: Call) => Promise<Content[]> }} Direct  args: the brain's, as it wrote them
 * @typedef {{ to?: unknown, cc?: unknown, bcc?: unknown, subject?: string, body?: string, reply_to?: string }} Mail  an email the brain asks for
 * @typedef {{ title?: string, start?: string, end?: string, time_zone?: string, location?: string, description?: string, attendees?: string | string[] }} Happening  an event the brain asks for
 */

const encoder = new TextEncoder()

/** @param {Record<string, JsonSchema>} properties @param {string[]} [required] */
const object = (properties, required = []) => ({ type: 'object', properties, required })
/** @param {string} description */
const string = (description) => ({ type: 'string', description })
const max = { type: 'integer', minimum: 1, maximum: 50, description: 'How many at most, 10 if left out' }
/** @param {string} name @param {string} description @param {JsonSchema} inputSchema @param {boolean} readOnlyHint @param {Direct['run']} run @returns {Direct} */
const tool = (name, description, inputSchema, readOnlyHint, run) => ({ name, description, inputSchema, annotations: { readOnlyHint }, run })
/** What a call brings in: the brain reads its text, the user sees its quote. @param {string} uri @param {string} title @param {string} text @param {string} [description] @returns {Content} */
const resource = (uri, title, text, description) => ({ type: 'resource', resource: { uri, title, text, mimeType: 'text/plain', ...(description && { description }) } })
/** What a call says when it brings nothing in. @param {string} text @returns {Content[]} */
const said = (text) => [{ type: 'text', text }]

/** @param {string} data */
const unbase64url = (data) => Uint8Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))

// ─── Gmail ───────────────────────────────────────────────────────────────────

/** A message's or a part's headers, by their names in lower case. @param {GmailPart | undefined} part @returns {Record<string, string>} */
const headersOf = (part) => Object.fromEntries((part?.headers ?? []).map(({ name, value }) => [name.toLowerCase(), value]))
/** A part and every part inside it. @param {GmailPart} part @returns {GmailPart[]} */
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

/** A message's text, its plain part or else its HTML's, and the names of the files it carries. @param {GmailPart} payload */
function bodyOf(payload) {
  const parts = partsOf(payload)
  const [plain, html] = ['text/plain', 'text/html'].map((type) => parts.find((part) => part.mimeType === type && part.body?.data && !part.filename))
  return { text: plain ? decoded(plain) : html ? textOf(decoded(html)) : '', files: parts.flatMap((part) => part.filename || []) }
}

/** A header on one line, so that none can add another. @param {unknown} value */
const oneLine = (value) => [value ?? ''].flat().join(', ').replace(/[\r\n]+/g, ' ').trim()

/**
 * An email as Gmail takes it, RFC 5322 in Base64url; a reply goes in its thread, with the headers
 * that keep it there. @param {Mail} args @param {Call} call
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
      /** @type {Content[]} */
      const emails = []
      // Five at a time: Gmail refuses a user's requests past a few at once ("Too many concurrent requests for user").
      for (let at = 0; at < messages.length; at += 5) emails.push(...await Promise.all(messages.slice(at, at + 5).map(async (/** @type {{ id: string }} */ { id }) => {
        const found = await call(`messages/${id}?format=metadata&${['From', 'To', 'Subject', 'Date'].map((name) => `metadataHeaders=${name}`).join('&')}`)
        const head = headersOf(found.payload)
        const start = textOf(found.snippet ?? '')
        return resource(inGmail(emailAddress, `all/${found.threadId}`), head.subject || '(no subject)', [`id: ${id}`, ...heads(head), '', start].join('\n'), start)
      })))
      return emails
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
  tool('send_email', 'Sends an email from Gmail; a reply stays in its thread.', composing, false, async (args, call) => call('messages/send', { method: 'POST', body: JSON.stringify(await message(args, call)) }).then((sent) => said(`Sent (id: ${sent.id}).`))),
]

// ─── Google Calendar ─────────────────────────────────────────────────────────

const DAY = /^\d{4}-\d{2}-\d{2}$/
/** The user's time zone, by its IANA name. */
const here = () => Intl.DateTimeFormat().resolvedOptions().timeZone
/** An instant, a day meaning its start where the user is. @param {string | number} at */
const instant = (at) => new Date(DAY.test(String(at)) ? `${at}T00:00` : at).toISOString()
/** A start or an end: a day, for a whole day, or a time, in a time zone. @param {string} at @param {string} [zone] */
const when = (at, zone = here()) => (DAY.test(at) ? { date: at } : { dateTime: at, timeZone: zone })
/** An event as Calendar takes it, from what was given. @param {Happening} args */
const event = ({ title, start, end, time_zone, location, description, attendees }) => ({ ...(title !== undefined && { summary: title }), ...(start && { start: when(start, time_zone) }), ...(end && { end: when(end, time_zone) }),
  ...(location !== undefined && { location }), ...(description !== undefined && { description }), ...(attendees && { attendees: [attendees].flat().map((email) => ({ email })) }) })
/** @param {CalendarEvent} item */
const described = (item) => [`id: ${item.id}`, `${item.start?.dateTime ?? item.start?.date} → ${item.end?.dateTime ?? item.end?.date}`, item.location && `Where: ${item.location}`,
  item.attendees?.length && `With: ${item.attendees.map((one) => one.email).join(', ')}`, item.description].filter(Boolean).join('\n')
/** @param {CalendarEvent} item */
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
    return items.map((/** @type {CalendarEntry} */ item) => ({ type: 'text', text: `${item.id}: ${item.summaryOverride ?? item.summary}${item.primary ? ' (their own)' : ''}, ${item.accessRole}` }))
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
  tool('delete_event', 'Removes an event; its guests are told it is cancelled.', object({ calendar: calendarId, id: eventId }, ['id']), false, ({ calendar, id }, call) => call(`${events(calendar, id)}?sendUpdates=all`, { method: 'DELETE' }).then(() => said('Removed.'))),
]

// ─── Google Drive, Docs and Sheets ───────────────────────────────────────────

// Drive's API, which Docs and Sheets find their files with, and say who is signed in.
const DRIVE = 'https://www.googleapis.com/drive/v3/'
const FIELDS = 'id,name,mimeType,modifiedTime,webViewLink'
// Google's own files as text: a document in Markdown, a spreadsheet's first sheet in CSV, a presentation's words.
const EXPORTS = /** @type {Record<string, string>} */ ({ 'application/vnd.google-apps.document': 'text/markdown', 'application/vnd.google-apps.spreadsheet': 'text/csv', 'application/vnd.google-apps.presentation': 'text/plain' })
/** @param {DriveFile} file */
const asFile = (file) => resource(file.webViewLink, file.name, `id: ${file.id}\n${file.mimeType}, changed ${file.modifiedTime}`)
/** A file's name and address in Drive, a shared drive's too. @param {string} id @param {Call} call @returns {Promise<DriveFile>} */
const fileAt = (id, call) => call(`${DRIVE}files/${encodeURIComponent(id)}?fields=${FIELDS}&supportsAllDrives=true`)

// Google Docs' own API, which places each part of a document by where it starts and ends, as its edits name them.
const DOCS = 'https://docs.googleapis.com/v1/documents/'
/** A named style's look: its font, size and colour, written as people do from Docs' fractions of red, green and blue. @param {DocsStyle} style */
const look = ({ namedStyleType, textStyle: { weightedFontFamily: font, fontSize: size, foregroundColor: { color: { rgbColor: rgb = undefined } = {} } = {}, bold } = {} }) => `${namedStyleType}: ${[font?.fontFamily, size && `${size.magnitude} ${size.unit}`,
  rgb && `#${['red', 'green', 'blue'].map((part) => Math.round((rgb[part] ?? 0) * 255).toString(16).padStart(2, '0')).join('')}`, bold && 'bold'].filter(Boolean).join(', ')}`
/** A document's paragraphs, each where it starts and ends, its named style and its words, and its tables', a cell's inside it. @param {DocsElement[]} [content] @param {string} [indent] @returns {string[]} */
const outline = (content = [], indent = '') => content.flatMap(({ startIndex = 0, endIndex, paragraph, table }) => (paragraph ? `${indent}[${startIndex}–${endIndex}] ${paragraph.paragraphStyle?.namedStyleType}: ${paragraph.elements.map((each) => each.textRun?.content ?? '').join('').trim()}`
  : table ? [`${indent}[${startIndex}–${endIndex}] A table, ${table.rows} × ${table.columns}`, ...table.tableRows.flatMap((row) => row.tableCells.flatMap((cell) => outline(cell.content, `${indent}  `)))] : []))

/** Where files are looked for: one shared drive the user has, by its name, or all of them and the user’s own. @param {unknown} name @param {Call} call @returns {Promise<Record<string, string>>} */
async function corpus(name, call) {
  if (!name) return { corpora: 'allDrives' }
  const { drives = [] } = await call(`${DRIVE}drives?pageSize=100&fields=drives(id,name)`)
  const found = drives.find((/** @type {SharedDrive} */ each) => each.name.toLowerCase().includes(String(name).toLowerCase()))
  if (!found) throw new Error(drives.length ? `No shared drive is called ${name}. The user’s are ${drives.map((/** @type {SharedDrive} */ each) => each.name).join(', ')}.` : 'The user has no shared drive.')
  return { corpora: 'drive', driveId: found.id }
}

/**
 * Drive's search, in shared drives too or in one by its name, with no words those the user had open last: by words in files or their names, or,
 * for Docs and Sheets, which see names alone (`drive.metadata.readonly`), Google's own files of a type by words in their names.
 * @param {string} name @param {string} what @param {string} [type] @returns {Direct}
 */
const finder = (name, what, type) => tool(name, `Finds ${what} in Google Drive, shared drives included, by words in ${type ? 'their names' : 'them or in their names'}; with none, those the user had open last.`,
  object({ query: string('Words to find'), drive: string('A shared drive’s name, to look there alone'), max }), true, async ({ query, drive, max = 10 }, call) => {
    const q = [query && `${type ? 'name' : 'fullText'} contains '${String(query).replace(/[\\']/g, '\\$&')}'`, type && `mimeType = 'application/vnd.google-apps.${type}'`, 'trashed = false'].filter(Boolean).join(' and ')
    // Google looks in the user's own Drive alone unless told shared drives are read too.
    const { files = [] } = await call(`${DRIVE}files?${new URLSearchParams({ q, pageSize: String(max), fields: `files(${FIELDS})`, ...await corpus(drive, call), includeItemsFromAllDrives: 'true', supportsAllDrives: 'true', ...(!query && { orderBy: 'recency desc' }) })}`)
    return files.map(asFile)
  })

/** @type {Direct[]} */
const drive = [
  finder('search_files', 'files'),
  tool('read_file', 'Reads a file’s text: a document in Markdown, a spreadsheet’s first sheet in CSV, a presentation’s words, or a text file.', object({ id: string('The file’s id, from search_files') }, ['id']), true, async ({ id }, call) => {
    const at = `files/${encodeURIComponent(id)}`
    const file = await fileAt(id, call)
    const as = EXPORTS[file.mimeType]
    if (!as && !/^text\/|\/(json|xml|csv)$/.test(file.mimeType)) throw new Error(`${file.name} is a file of type ${file.mimeType}, whose text can’t be read here.`)
    return [resource(file.webViewLink, file.name, await call(as ? `${at}/export?mimeType=${encodeURIComponent(as)}` : `${at}?alt=media&supportsAllDrives=true`, { as: 'text' }))]
  }),
]

const documentId = string('The document’s id, from search_documents')
/** @type {Direct[]} */
const docs = [
  finder('search_documents', 'Google Docs documents', 'document'),
  tool('read_document', 'Reads a Google Docs document as edit_document places its parts: each paragraph’s startIndex–endIndex, named style and words, its tables’ cells, and its named styles’ fonts, sizes and colours.', object({ id: documentId }, ['id']), true,
    ({ id }, call) => Promise.all([call(`${DOCS}${encodeURIComponent(id)}`), fileAt(id, call)]).then(([doc, file]) => [resource(file.webViewLink, file.name, [`id: ${file.id}`, 'Named styles:', ...(doc.namedStyles?.styles ?? []).map(look), '', ...outline(doc.body?.content)].join('\n'))])),
  // Drive makes it, from Markdown, as Docs' own API, which writes a document a request at a time, can't.
  tool('create_document', 'Makes a Google Docs document from Markdown, in the user’s Drive.', object({ name: string('Its name'), content: string('Its text, in Markdown') }, ['name', 'content']), false, async ({ name, content }, call) => {
    const boundary = crypto.randomUUID()
    const body = [`--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify({ name, mimeType: 'application/vnd.google-apps.document' }),
      `--${boundary}`, 'Content-Type: text/markdown; charset=UTF-8', '', content, `--${boundary}--`].join('\r\n')
    return [asFile(await call(`${new URL(DRIVE).origin}/upload/drive/v3/files?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body }))]
  }),
  tool('edit_document', 'Changes a Google Docs document, shared drives’ too, with the Docs API’s batchUpdate requests, applied in order: its words (replaceAllText, insertText, deleteContentRange), their look (updateTextStyle, updateParagraphStyle), every heading or paragraph of a named style at once (updateNamedStyle), its tables. Places come from read_document.',
    object({ id: documentId, requests: { type: 'array', items: { type: 'object' }, description: 'Requests as the Docs API takes them, e.g. {"updateNamedStyle": {"namedStyle": {"namedStyleType": "HEADING_1", "textStyle": {"weightedFontFamily": {"fontFamily": "Times New Roman"}, "fontSize": {"magnitude": 20, "unit": "PT"}, "foregroundColor": {"color": {"rgbColor": {"red": 0.1, "green": 0.2, "blue": 0.5}}}}}, "fields": "textStyle.weightedFontFamily,textStyle.fontSize,textStyle.foregroundColor"}}' } }, ['id', 'requests']), false,
    ({ id, requests }, call) => call(`${DOCS}${encodeURIComponent(id)}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) }).then(() => fileAt(id, call)).then((file) => [asFile(file)])),
]

// Google Sheets' own API: cells named as people name them (Budget!B2:D9), written as a person types them, so a formula is worked out.
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/'
const TYPED = 'valueInputOption=USER_ENTERED'
const sheetId = string('The spreadsheet’s id, from search_spreadsheets')
const rows = { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Rows, each a list of cells as a person types them: words, numbers, dates, or formulas such as =SUM(B2:B9)' }
/** A spreadsheet's values, at an address, as Sheets' API names them. @param {string} id @param {string} range */
const cells = (id, range) => `${SHEETS}${encodeURIComponent(id)}/values/${encodeURIComponent(range)}`

/** @type {Direct[]} */
const sheets = [
  finder('search_spreadsheets', 'Google Sheets spreadsheets', 'spreadsheet'),
  tool('read_spreadsheet', 'Reads a spreadsheet: its sheets’ names, then the cells asked for, or its first sheet’s, a row a line, a tab between cells.', object({ id: sheetId, range: string('Cells in A1 notation, e.g. Budget!A1:D20, or a sheet’s name') }, ['id']), true, async ({ id, range }, call) => {
    const book = await call(`${SHEETS}${encodeURIComponent(id)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`)
    const names = book.sheets.map((/** @type {{ properties: { title: string } }} */ sheet) => sheet.properties.title)
    // A sheet's name alone is all its cells, quoted since it may have spaces.
    const { range: at, values = [] } = await call(cells(id, range ?? `'${names[0].replace(/'/g, "''")}'`))
    return [resource(book.spreadsheetUrl, book.properties.title, [`id: ${book.spreadsheetId}`, `Sheets: ${names.join(', ')}`, '', at, ...values.map((/** @type {string[]} */ row) => row.join('\t'))].join('\n'))]
  }),
  tool('write_cells', 'Writes rows into a spreadsheet’s cells, over what they held.', object({ id: sheetId, range: string('Where the rows go, from their first cell, in A1 notation, e.g. Budget!B2'), values: rows }, ['id', 'range', 'values']), false,
    async ({ id, range, values }, call) => said(`Wrote ${(await call(`${cells(id, range)}?${TYPED}`, { method: 'PUT', body: JSON.stringify({ values }) })).updatedRange}.`)),
  tool('add_rows', 'Adds rows to a table in a spreadsheet, under its last.', object({ id: sheetId, range: string('The table: a sheet’s name, or its cells in A1 notation'), values: rows }, ['id', 'range', 'values']), false,
    async ({ id, range, values }, call) => said(`Added ${(await call(`${cells(id, range)}:append?${TYPED}&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values }) })).updates.updatedRange}.`)),
  tool('create_spreadsheet', 'Makes a Google Sheets spreadsheet in the user’s Drive, its first sheet holding the rows given.', object({ name: string('Its name'), values: rows }, ['name']), false, async ({ name, values }, call) => {
    const book = await call(SHEETS.slice(0, -1), { method: 'POST', body: JSON.stringify({ properties: { title: name } }) })
    // An address with no sheet's name is the first sheet's, whatever its name in the user's language.
    if (values?.length) await call(`${cells(book.spreadsheetId, 'A1')}?${TYPED}`, { method: 'PUT', body: JSON.stringify({ values }) })
    return [resource(book.spreadsheetUrl, name, `id: ${book.spreadsheetId}`)]
  }),
]

// ─── Microsoft Graph ─────────────────────────────────────────────────────────

/** Query options as Graph reads them, their `$` unescaped. @param {Record<string, string | number | undefined>} options */
const odata = (options) => Object.entries(options).flatMap(([name, value]) => (value === undefined ? [] : `${name}=${encodeURIComponent(value)}`)).join('&')
/** "Sam <sam@example.com>", or the address alone. @param {Recipient} who */
const person = ({ emailAddress: { name = '', address = '' } = {} }) => (name && name !== address ? `${name} <${address}>` : address)
/** Who wrote an email, to whom, when. @param {GraphMail} mail */
const mailHeads = (mail) => [...Object.entries({ From: mail.from && [mail.from], To: mail.toRecipients, Cc: mail.ccRecipients }).flatMap(([name, people]) => (people?.length ? `${name}: ${people.map(person).join(', ')}` : [])), ...(mail.receivedDateTime ? [`Date: ${mail.receivedDateTime}`] : [])]
/** Addresses as Graph takes them, from a list or between commas, each "Sam <sam@example.com>" or the address alone. @param {unknown} list */
const recipients = (list) => [list ?? []].flat().flatMap((each) => String(each).split(',')).map((one) => one.trim()).filter(Boolean).map((one) => ({ emailAddress: { address: /<([^>]*)>/.exec(one)?.[1] ?? one } }))
/** An email as Graph takes it, or a reply in its thread, its text above what it answers. @param {Mail} args */
const outgoing = ({ to, cc, bcc, subject, body = '', reply_to }) => {
  const message = { ...(subject !== undefined && { subject: oneLine(subject) }), toRecipients: recipients(to), ccRecipients: recipients(cc), bccRecipients: recipients(bcc) }
  return reply_to ? { message, comment: body } : { message: { ...message, body: { contentType: 'text', content: body } } }
}
const MAIL = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,webLink'
/** An email, cited by its address in Outlook. @param {GraphMail} mail @param {string} text */
const asMail = (mail, text) => resource(mail.webLink, mail.subject || '(no subject)', text, mail.bodyPreview)
/** The user's own mailbox, or one shared with them, by its address. @param {string} [address] */
const box = (address) => (address ? `users/${encodeURIComponent(address)}` : 'me')
const mailbox = string('A mailbox shared with the user, by its address, to use rather than their own')
const sharing = object({ ...composing.properties, mailbox }, composing.required)

/** @type {Direct[]} */
const outlook = [
  tool('search_emails', 'Finds emails as Outlook’s search box does (from:, to:, subject:, hasattachment:true, received>=2026-10-01…), or the latest, each with its id, who wrote it, when and how it starts.',
    object({ query: string('Outlook’s search, e.g. "from:sam subject:budget"'), max, mailbox }), true, async ({ query, max = 10, mailbox }, call) => {
      const { value = [] } = await call(`${box(mailbox)}/messages?${odata({ $select: MAIL, $top: max, ...(query ? { $search: `"${String(query).replace(/"/g, '')}"` } : { $orderby: 'receivedDateTime desc' }) })}`)
      return value.map((/** @type {GraphMail} */ mail) => asMail(mail, [`id: ${mail.id}`, ...mailHeads(mail), '', mail.bodyPreview].join('\n')))
    }),
  tool('read_email', 'Reads an email whole, by its id, with the names of the files it carries.', object({ id: string('The email’s id, from search_emails'), mailbox }, ['id']), true, async ({ id, mailbox }, call) => {
    const at = `${box(mailbox)}/messages/${encodeURIComponent(id)}`
    const [mail, { value: files = [] }] = await Promise.all([call(`${at}?${odata({ $select: `${MAIL},body` })}`, { headers: { prefer: 'outlook.body-content-type="text"' } }), call(`${at}/attachments?${odata({ $select: 'name,isInline' })}`)])
    const names = files.flatMap((/** @type {GraphAttachment} */ file) => (file.isInline ? [] : file.name))
    return [asMail(mail, [...mailHeads(mail), ...(names.length ? [`Files: ${names.join(', ')}`] : []), '', mail.body?.content ?? ''].join('\n'))]
  }),
  tool('create_draft', 'Writes a draft in Outlook, which the user sends themselves; a reply stays in its thread.', sharing, false, async (args, call) => {
    const draft = await call(`${box(args.mailbox)}/messages${args.reply_to ? `/${encodeURIComponent(args.reply_to)}/createReply` : ''}`, { method: 'POST', body: JSON.stringify(args.reply_to ? outgoing(args) : outgoing(args).message) })
    return [asMail(draft, `Draft saved (id: ${draft.id}).`)]
  }),
  tool('send_email', 'Sends an email from Outlook; a reply stays in its thread.', sharing, false,
    (args, call) => call(`${box(args.mailbox)}/${args.reply_to ? `messages/${encodeURIComponent(args.reply_to)}/reply` : 'sendMail'}`, { method: 'POST', body: JSON.stringify(outgoing(args)) }).then(() => said('Sent.'))),
]

// Times go in with their offset, kept in UTC, or in the zone given, and come back in the user's.
const EVENT = 'id,subject,start,end,location,attendees,bodyPreview,webLink,onlineMeeting'
const inZone = () => ({ headers: { prefer: `outlook.timezone="${here()}"` } })
/** A start or an end: a time with its offset, a whole day from its midnight, or a time in a zone. @param {string} at @param {string} [zone] */
const slot = (at, zone = here()) => (/([zZ]|[+-]\d\d:?\d\d)$/.test(at) ? { dateTime: new Date(at).toISOString().slice(0, -1), timeZone: 'UTC' } : { dateTime: DAY.test(at) ? `${at}T00:00:00` : at, timeZone: zone })
/** An event as Graph takes it, from what was given. @param {Happening} args */
const meeting = ({ title, start, end, time_zone, location, description, attendees }) => ({ ...(title !== undefined && { subject: title }), ...(start && { start: slot(start, time_zone), isAllDay: DAY.test(start) }), ...(end && { end: slot(end, time_zone) }), ...(location !== undefined && { location: { displayName: location } }),
  ...(description !== undefined && { body: { contentType: 'text', content: description } }), ...(attendees && { attendees: [attendees].flat().map((address) => ({ emailAddress: { address }, type: 'required' })) }) })
/** @param {GraphEvent} item */
const asMeeting = (item) => resource(item.webLink, item.subject || '(no title)', [`id: ${item.id}`, `${item.start?.dateTime} → ${item.end?.dateTime} (${item.start?.timeZone})`, item.location?.displayName && `Where: ${item.location.displayName}`,
  item.onlineMeeting?.joinUrl && `Join: ${item.onlineMeeting.joinUrl}`, item.attendees?.length && `With: ${item.attendees.map((one) => one.emailAddress?.address).join(', ')}`, item.bodyPreview].filter(Boolean).join('\n'))
/** A calendar of the user's, their own if none is named. @param {string} [id] */
const calendarAt = (id) => (id ? `me/calendars/${encodeURIComponent(id)}` : 'me/calendar')

/** @type {Direct[]} */
const outlookCalendar = [
  tool('list_calendars', 'Lists the user’s calendars, with their ids.', object({}), true, async (_, call) => {
    const { value = [] } = await call(`me/calendars?${odata({ $select: 'id,name,isDefaultCalendar,canEdit' })}`)
    return value.map((/** @type {GraphCalendar} */ item) => ({ type: 'text', text: `${item.id}: ${item.name}${item.isDefaultCalendar ? ' (their own)' : ''}, ${item.canEdit ? 'writer' : 'reader'}` }))
  }),
  tool('list_events', 'Lists a calendar’s events from a time on, earliest first, or those with given words, each online meeting with its join link.', object({ calendar: calendarId, from: string('An ISO 8601 time or a day; now if left out'), to: string('The same; a year on if left out'), query: string('Words to find'), max }), true,
    async ({ calendar, from = Date.now(), to, query = '', max = 10 }, call) => {
      const start = instant(from)
      const { value = [] } = await call(`${calendarAt(calendar)}/calendarView?${odata({ startDateTime: start, endDateTime: to ? instant(to) : new Date(Date.parse(start) + 366 * 86_400_000).toISOString(), $orderby: 'start/dateTime', $top: query ? 200 : max, $select: EVENT })}`, inZone())
      return value.filter((/** @type {GraphEvent} */ item) => [item.subject, item.location?.displayName, item.bodyPreview].join(' ').toLowerCase().includes(String(query).toLowerCase())).slice(0, max).map(asMeeting)
    }),
  tool('create_event', 'Adds an event to a calendar; its guests are sent an invitation.', object({ calendar: calendarId, ...fields }, ['title', 'start', 'end']), false,
    async ({ calendar, ...args }, call) => [asMeeting(await call(`${calendarAt(calendar)}/events`, { method: 'POST', body: JSON.stringify(meeting(args)), ...inZone() }))]),
  tool('update_event', 'Changes what is given of an event; its guests are told.', object({ id: eventId, ...fields }, ['id']), false,
    async ({ id, ...args }, call) => [asMeeting(await call(`me/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(meeting(args)), ...inZone() }))]),
  tool('delete_event', 'Removes an event; its guests are told it is cancelled.', object({ id: eventId }, ['id']), false, ({ id }, call) => call(`me/events/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => said('Removed.'))),
]

/** A file, where it is: one shared with the user is in another's drive, which its id names. @param {DriveItem} found */
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
      .then(({ value }) => value?.[0]?.hitsContainers?.flatMap((/** @type {SearchHits} */ found) => found.hits ?? []).map((/** @type {{ resource: DriveItem }} */ hit) => hit.resource) ?? [], () => [])
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

/** A Teams message on one line: when, who, its words out of their HTML. @param {TeamsMessage} one */
const post = (one) => `${one.createdDateTime} ${one.from?.user?.displayName ?? ''}: ${textOf(one.body?.content ?? '')}`
/** Teams messages, people's alone, the earliest first. @param {TeamsMessage[]} [messages] @returns {Content[]} */
const posts = (messages = []) => messages.filter((one) => one.messageType === 'message').reverse().map((one) => ({ type: 'text', text: post(one) }))
/** A meeting's transcript, Teams' WebVTT, as lines of who said what. @param {string} vtt */
const spoken = (vtt) => vtt.replace(/<v ([^>]*)>/g, '$1: ').replace(/<\/v>/g, '').split(/\r?\n/).filter((line) => line.trim() && !/^WEBVTT|-->|^[\w-]+\/[\w-]+$/.test(line)).join('\n')
/** Someone on one line: their name, what they do, where, how to reach them. @param {...unknown} parts @returns {Content} */
const card = (...parts) => ({ type: 'text', text: parts.flat().filter(Boolean).join(', ') })

/** @type {Direct[]} */
const teamsAndPeople = [
  tool('list_chats', 'Lists the user’s Teams chats, the latest first, each with its id, who is in it and its last message.', object({ max }), true, async ({ max = 10 }, call) => ((await call(`me/chats?${odata({ $expand: 'members,lastMessagePreview', $orderby: 'lastMessagePreview/createdDateTime desc', $top: max })}`)).value ?? [])
    .map((/** @type {TeamsChat} */ chat) => resource(chat.webUrl, chat.topic || chat.members?.map((one) => one.displayName).join(', ') || chat.id, [`id: ${chat.id}`, chat.lastMessagePreview && post(chat.lastMessagePreview)].filter(Boolean).join('\n')))),
  tool('read_chat', 'Reads a Teams chat’s latest messages, the earliest first.', object({ id: string('The chat’s id, from list_chats'), max }, ['id']), true,
    async ({ id, max = 10 }, call) => posts((await call(`me/chats/${encodeURIComponent(id)}/messages?${odata({ $top: max, $orderby: 'createdDateTime desc' })}`)).value)),
  tool('list_channels', 'Lists the teams the user is in and their channels, each with its id.', object({}), true, async (_, call) => (await Promise.all(((await call('me/joinedTeams?$select=id,displayName')).value ?? [])
    .map(async (/** @type {{ id: string, displayName: string }} */ team) => ((await call(`teams/${team.id}/channels?$select=id,displayName`)).value ?? [])
      .map((/** @type {{ id: string, displayName: string }} */ one) => card(`${team.displayName} › ${one.displayName}`, `id: ${team.id}/${one.id}`))))).flat()),
  tool('read_channel', 'Reads a Teams channel’s latest messages, the earliest first.', object({ id: string('The channel’s id, from list_channels'), max }, ['id']), true,
    async ({ id, max = 10 }, call) => posts((await call(`teams/${String(id).split('/').map(encodeURIComponent).join('/channels/')}/messages?${odata({ $top: max })}`)).value)),
  tool('read_transcript', 'Reads what was said in a Teams meeting, from the transcript Teams kept.', object({ join_url: string('The meeting’s join link, from list_events') }, ['join_url']), true, async ({ join_url }, call) => {
    const { value: [meeting] = [] } = await call(`me/onlineMeetings?${odata({ $filter: `JoinWebUrl eq '${String(join_url).replace(/'/g, "''")}'` })}`)
    if (!meeting) throw new Error('No Teams meeting of the user’s has this join link.')
    const at = `me/onlineMeetings/${encodeURIComponent(meeting.id)}/transcripts`
    const latest = (await call(at)).value?.at(-1)
    return latest ? [resource(join_url, meeting.subject ?? '', spoken(await call(`${at}/${encodeURIComponent(latest.id)}/content?$format=text/vtt`, { as: 'text' })))] : []
  }),
  tool('search_contacts', 'Finds people in the user’s Outlook contacts by words in their name, address or company, with their addresses and phones.', object({ query: string('Words to find'), max }), true, async ({ query = '', max = 10 }, call) => ((await call(`me/contacts?${odata({ $select: 'displayName,jobTitle,companyName,emailAddresses,businessPhones,mobilePhone', $orderby: 'displayName', $top: 500 })}`)).value ?? [])
    .map((/** @type {GraphPerson} */ one) => card(one.displayName, one.jobTitle, one.companyName, one.emailAddresses?.map((each) => each.address), one.businessPhones, one.mobilePhone))
    .filter((/** @type {Content} */ one) => one.text?.toLowerCase().includes(String(query).toLowerCase())).slice(0, max)),
  tool('find_people', 'Finds the people the user works and writes with by name, as Outlook suggests them, colleagues and contacts, with their addresses.', object({ query: string('A name, or part of one'), max }, ['query']), true, async ({ query, max = 10 }, call) => ((await call(`me/people?${odata({ $search: `"${String(query).replace(/"/g, '')}"`, $top: max, $select: 'displayName,jobTitle,department,companyName,scoredEmailAddresses' })}`)).value ?? [])
    .map((/** @type {GraphPerson} */ one) => card(one.displayName, one.jobTitle, one.department, one.companyName, one.scoredEmailAddresses?.map((each) => each.address)))),
]

// What each Graph tool, or argument, needs of the sign-in, as Graph's permissions reference names it: any of these scopes, or of
// these sets joined by `+`. A `.Shared` scope reaches what others share with the user too, the mailbox `mailbox` names.
const [READ_MAIL, READ_FILES, CALENDAR, CHAT] = ['Mail.Read Mail.ReadWrite Mail.Read.Shared Mail.ReadWrite.Shared', 'Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All Sites.ReadWrite.All', 'Calendars.ReadWrite', 'Chat.Read Chat.ReadWrite']
const GRAPH = { search_emails: READ_MAIL, read_email: READ_MAIL, create_draft: 'Mail.ReadWrite Mail.ReadWrite.Shared', send_email: 'Mail.Send Mail.Send.Shared', mailbox: 'Mail.Read.Shared Mail.ReadWrite.Shared Mail.Send.Shared',
  list_calendars: `Calendars.Read ${CALENDAR}`, list_events: `Calendars.Read ${CALENDAR}`, create_event: CALENDAR, update_event: CALENDAR, delete_event: CALENDAR,
  search_files: READ_FILES, read_file: READ_FILES, create_document: 'Files.ReadWrite Files.ReadWrite.All Sites.ReadWrite.All', search_contacts: 'Contacts.Read Contacts.ReadWrite', find_people: 'People.Read People.Read.All',
  list_chats: CHAT, read_chat: CHAT, list_channels: 'Team.ReadBasic.All+Channel.ReadBasic.All', read_channel: 'ChannelMessage.Read.All', read_transcript: 'OnlineMeetings.Read+OnlineMeetingTranscript.Read.All' }

/**
 * Whether what a sign-in granted lets a tool, or an argument, work: all the scopes of one of the ways it needs, written as the
 * service names them or under its address, in any case. Anything works when nothing says what was granted, or what is needed.
 * @param {Record<string, string>} [needs] @param {string} [granted] the scopes, as a token's `scope` lists them @returns {(name: string) => boolean}
 */
export const allows = (needs = {}, granted = '') => (name) => !granted || !needs[name] || needs[name].toLowerCase().split(' ')
  .some((way) => way.split('+').every((scope) => granted.toLowerCase().split(' ').some((one) => one.replace(/^.*\//, '') === scope)))

/** Each API by its address (caps/connections/directory.js), with what says who is signed in, the other origins its tools call, and what its tools need. @type {Record<string, { who: string, tools: Direct[], also?: string[], needs?: Record<string, string> }>} */
export const APIS = {
  'https://gmail.googleapis.com/gmail/v1/users/me/': { who: 'profile', tools: gmail },
  'https://www.googleapis.com/calendar/v3/': { who: 'users/me/calendarList?maxResults=1', tools: calendar },
  [DRIVE]: { who: 'about?fields=user', tools: drive },
  [DOCS]: { who: `${DRIVE}about?fields=user`, tools: docs, also: [new URL(DRIVE).origin] },
  [SHEETS]: { who: `${DRIVE}about?fields=user`, tools: sheets, also: [new URL(DRIVE).origin] },
  'https://graph.microsoft.com/v1.0/': { who: 'me?$select=id', tools: [...outlook, ...outlookCalendar, ...onedrive, ...teamsAndPeople], needs: GRAPH },
}

/**
 * The server at an address, when it is one of these APIs, or null.
 * @param {{ url: string, authorization: () => Promise<string | undefined>, granted?: () => Promise<string | undefined>, fetch?: typeof globalThis.fetch }} options
 *   granted: the scopes its sign-in granted, where the service said, which its tools and their arguments are offered by
 */
export function apiClient({ url, authorization, granted = async () => undefined, fetch = globalThis.fetch }) {
  const api = APIS[url]
  if (!api) return null
  /** @param {AbortSignal} [signal] @returns {Call} */
  const caller = (signal) => async function call(path, { as, ...init } = {}, tries = 0) {
    const at = new URL(path, url)
    // The API's own origins alone get the token: a file's download address is signed already (Graph's).
    const auth = [new URL(url).origin, ...api.also ?? []].includes(at.origin) ? await authorization() : undefined
    const res = await fetch(at, { ...init, signal, headers: { ...(auth && { authorization: auth }), ...(typeof init.body === 'string' && { 'content-type': 'application/json' }), ...init.headers } })
    if (res.ok) return as === 'bytes' ? new Uint8Array(await res.arrayBuffer()) : as ? res.text() : res.status === 202 || res.status === 204 ? null : res.json()
    const { error } = await res.json().catch(() => ({}))
    // Too many at once or this minute, which every app of the user's shares: again, three times at most,
    // later each time (Google's backoff) or when the service says (Microsoft's Retry-After).
    if ((res.status === 429 || /rateLimitExceeded/.test(JSON.stringify(error ?? ''))) && tries < 3) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(res.headers.has('retry-after') ? Number(res.headers.get('retry-after')) * 1000 : 2 ** tries * 500 + Math.random() * 500, 10_000)))
      return call(path, { as, ...init }, tries + 1)
    }
    // A token refused, or a sign-in that doesn't allow this, as an MCP server refuses them (D344).
    if (res.status === 401 || /SCOPE_INSUFFICIENT|insufficientPermissions|ErrorAccessDenied|Authorization_RequestDenied/.test(JSON.stringify(error ?? ''))) throw new MCPError(error?.message ?? `HTTP ${res.status}`, { status: res.status })
    throw new Error(error?.message ?? `HTTP ${res.status}`)
  }
  return {
    /** @param {AbortSignal} [signal] @returns {Promise<McpTool[]>} */
    listTools: async (signal) => {
      await Promise.all([caller(signal)(api.who), useStrings('connections')])
      const may = allows(api.needs, await granted())
      return api.tools.filter((each) => may(each.name)).map(({ run, inputSchema, ...each }) => ({ ...each, title: t(`api.${each.name}`),
        inputSchema: { ...inputSchema, properties: Object.fromEntries(Object.entries(inputSchema?.properties ?? {}).filter(([name]) => may(name))) } }))
    },
    /** @param {McpTool} tool @param {Record<string, any>} args @param {AbortSignal} [signal] @returns {Promise<CallResult>} */
    callTool: async (tool, args, signal) => {
      const run = api.tools.find((each) => each.name === tool.name)?.run
      if (!run) throw new Error(`No tool is called ${tool.name}.`)
      // Never more than a tool takes, though a brain asks Gmail for 500 emails.
      const content = await run({ ...args, ...(args.max > max.maximum && { max: max.maximum }) }, caller(signal))
      return { content: content.length ? content : said('Nothing found.') }
    },
  }
}
