// SPDX-License-Identifier: MIT
// Shapes Connections reads: MCP's messages and tools, and the answers of the APIs apis.js calls,
// each with the fields the code reads, a field the service may leave out optional.

/** A JSON Schema, as a tool's input is described: the keywords read here, any other kept as it is. */
export type JsonSchema = {
  type?: string | string[]
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  minimum?: number
  maximum?: number
  $schema?: string
  /** An argument a tool asks to see in a header too (2026-07-28). */
  'x-mcp-header'?: string
  [keyword: string]: unknown
}

/** What a tool says of itself, as hints. */
export type ToolAnnotations = { title?: string, readOnlyHint?: boolean, destructiveHint?: boolean, idempotentHint?: boolean, openWorldHint?: boolean }

/** A resource a result embeds. */
export type EmbeddedResource = { uri: string, name?: string, title?: string, description?: string, mimeType?: string, text?: string }

/** An item of a tool's result: text, a picture or a sound, a link to a resource, or a resource embedded. */
export type Content = {
  type: string
  text?: string
  uri?: string
  name?: string
  title?: string
  description?: string
  mimeType?: string
  resource?: EmbeddedResource
}

/** A JSON-RPC answer: its result, whose shape is the method's, or its error. */
export type RpcMessage = {
  jsonrpc?: string
  id?: number | string
  result?: any
  error?: { code?: number, message?: string, data?: { supported?: string[] } }
}

/** What a request's params may name in a header. */
export type RpcParams = { name?: string, [key: string]: unknown }

// ─── Gmail ───────────────────────────────────────────────────────────────────

export type GmailHeader = { name: string, value: string }
/** A message's payload, or a part inside it. */
export type GmailPart = { mimeType?: string, filename?: string, headers?: GmailHeader[], body?: { data?: string, size?: number, attachmentId?: string }, parts?: GmailPart[] }

// ─── Google Calendar ─────────────────────────────────────────────────────────

export type CalendarEntry = { id: string, summary?: string, summaryOverride?: string, primary?: boolean, accessRole: string }
type EventTime = { date?: string, dateTime?: string, timeZone?: string }
export type CalendarEvent = { id: string, htmlLink: string, summary?: string, start?: EventTime, end?: EventTime, location?: string, description?: string, attendees?: { email?: string }[] }

// ─── Google Drive and Docs ───────────────────────────────────────────────────

/** A file, with the fields apis.js asks for. */
export type DriveFile = { id: string, name: string, mimeType: string, modifiedTime: string, webViewLink: string }
export type SharedDrive = { id: string, name: string }
/** A named style of a document. rgbColor: red, green and blue, each 0 to 1, a zero left out. */
export type DocsStyle = {
  namedStyleType: string
  textStyle?: {
    weightedFontFamily?: { fontFamily?: string }
    fontSize?: { magnitude: number, unit: string }
    foregroundColor?: { color?: { rgbColor?: Record<string, number> } }
    bold?: boolean
  }
}
/** A part of a document's body: a paragraph, a table, or another the outline leaves out. */
export type DocsElement = {
  startIndex?: number
  endIndex: number
  paragraph?: { paragraphStyle?: { namedStyleType?: string }, elements: { textRun?: { content?: string } }[] }
  table?: { rows: number, columns: number, tableRows: { tableCells: { content?: DocsElement[] }[] }[] }
}

// ─── Microsoft Graph ─────────────────────────────────────────────────────────

export type Recipient = { emailAddress?: { name?: string, address?: string } }
export type GraphMail = {
  id: string
  webLink: string
  subject?: string
  from?: Recipient
  toRecipients?: Recipient[]
  ccRecipients?: Recipient[]
  receivedDateTime?: string
  bodyPreview?: string
  body?: { content?: string }
}
export type GraphAttachment = { name: string, isInline?: boolean }
export type GraphCalendar = { id: string, name: string, isDefaultCalendar?: boolean, canEdit?: boolean }
type GraphTime = { dateTime: string, timeZone: string }
export type GraphEvent = { id: string, webLink: string, subject?: string, start?: GraphTime, end?: GraphTime, location?: { displayName?: string }, attendees?: Recipient[], bodyPreview?: string }
/** A file in OneDrive or SharePoint; one shared with the user points at the other's. */
export type DriveItem = {
  id: string
  name: string
  webUrl: string
  lastModifiedDateTime?: string
  folder?: object
  parentReference?: { driveId?: string }
  remoteItem?: { id: string, webUrl?: string, parentReference?: { driveId?: string } }
}
/** Microsoft Search's answer for one request. */
export type SearchHits = { hits?: { resource: DriveItem }[] }
