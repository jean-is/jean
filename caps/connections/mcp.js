// A minimal MCP client over Streamable HTTP, for Connections (D86): tools/list and tools/call.
// It speaks the stateless revision (2026-07-28: every request carries its version and client in
// `_meta`, mirrored in headers) and falls back to the handshake and session of the earlier ones
// (2025-03-26 to 2025-11-25) when a server answers like one. Host-agnostic: fetch and streams.
import { parseSSE } from '../../core/sse.js'

export const MODERN = '2026-07-28'
export const LEGACY = '2025-11-25'
// Errors only a modern server sends: headers that don't match the body, a version it doesn't speak.
const MISMATCH = -32020
const UNSUPPORTED = -32022

export class MCPError extends Error {
  /** @param {string} message @param {{ status?: number, challenge?: string | null }} [details] challenge: a 401's WWW-Authenticate, if the browser may read it */
  constructor(message, { status, challenge = null } = {}) {
    super(message)
    this.name = 'MCPError'
    this.status = status
    this.challenge = challenge
    /** The service wants a key or a sign-in. */
    this.auth = status === 401 || status === 403
  }
}

/**
 * @typedef {{ name: string, title?: string, description?: string, inputSchema?: any, annotations?: Record<string, any> }} McpTool
 * @typedef {{ content?: any[], structuredContent?: any, isError?: boolean }} CallResult
 * @typedef {{ status: number, headers: Headers, message: any }} Reply
 */

/**
 * @param {{ url: string, client: { name: string, version: string }, authorization?: () => Promise<string | undefined>, fetch?: typeof globalThis.fetch }} options
 *   authorization: the Authorization header, when the service needs one
 */
export function mcpClient({ url, client, authorization = async () => undefined, fetch = globalThis.fetch }) {
  /** @type {'modern' | 'legacy' | null} which revisions the server speaks, learned from its first answer */
  let era = null
  let version = LEGACY
  let session = ''
  /** @type {Promise<void> | null} */
  let handshake = null
  let lastId = 0

  /** @param {string} method @param {Record<string, any>} params @param {Record<string, string>} [extra] @param {AbortSignal} [signal] @returns {Promise<Reply>} */
  async function send(method, params, extra = {}, signal) {
    const modern = era !== 'legacy'
    const id = method.startsWith('notifications/') ? undefined : ++lastId
    const meta = { 'io.modelcontextprotocol/protocolVersion': MODERN, 'io.modelcontextprotocol/clientInfo': client, 'io.modelcontextprotocol/clientCapabilities': {} }
    const auth = await authorization()
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': modern ? MODERN : version,
        ...(modern ? { 'mcp-method': method, ...(params.name && { 'mcp-name': headerValue(params.name) }), ...extra } : session && { 'mcp-session-id': session }),
        ...(auth && { authorization: auth }),
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...(id && { id }), method, params: modern ? { ...params, _meta: meta } : params }),
      signal,
    })
    if (res.status === 401 || res.status === 403) throw new MCPError(`HTTP ${res.status}`, { status: res.status, challenge: res.headers.get('www-authenticate') })
    return { status: res.status, headers: res.headers, message: id ? await read(res, id) : null }
  }

  /** The session of the earlier revisions: initialize, then say so. */
  async function initialize() {
    const reply = await send('initialize', { protocolVersion: version, capabilities: {}, clientInfo: client })
    session = reply.headers.get('mcp-session-id') ?? ''
    version = unwrap(reply).protocolVersion ?? version
    await send('notifications/initialized', {})
  }

  /** @param {string} method @param {Record<string, any>} params @param {Record<string, string>} [extra] @param {AbortSignal} [signal] */
  async function request(method, params, extra, signal) {
    if (era !== 'legacy') {
      // A modern request first. An earlier server answers it with an error no modern server
      // sends, or its browser policy refuses the new headers, which fetch reports as a TypeError.
      const reply = await send(method, params, extra, signal).catch((error) => {
        if (era || !(error instanceof TypeError)) throw error
        return null
      })
      const error = reply?.message?.error
      if (era || (reply?.message && 'result' in reply.message) || error?.code === MISMATCH || (error?.code === -32601 && reply?.status === 404)) {
        era = 'modern'
        return unwrap(reply)
      }
      era = 'legacy'
      if (error?.code === UNSUPPORTED) version = error.data?.supported?.find((/** @type {string} */ other) => other <= LEGACY) ?? LEGACY
    }
    for (let retry = false; ; retry = true) {
      await (handshake ??= initialize().catch((error) => {
        handshake = null
        // Unreachable either way: try the modern revision again next time.
        if (error instanceof TypeError) era = null
        throw error
      }))
      const reply = await send(method, params, {}, signal)
      // A session the server forgot: start a new one, once.
      if (reply.status !== 404 || !session || retry) return unwrap(reply)
      ;[session, handshake] = ['', null]
    }
  }

  return {
    /** @param {AbortSignal} [signal] @returns {Promise<McpTool[]>} */
    async listTools(signal) {
      /** @type {McpTool[]} */
      const tools = []
      for (let cursor; ; ) {
        const result = await request('tools/list', cursor ? { cursor } : {}, {}, signal)
        tools.push(...(result.tools ?? []))
        if (!(cursor = result.nextCursor) || tools.length >= 1000) return tools
      }
    },
    /** @param {McpTool} tool @param {Record<string, any>} args @param {AbortSignal} [signal] @returns {Promise<CallResult>} */
    callTool: (tool, args, signal) => request('tools/call', { name: tool.name, arguments: args }, paramHeaders(tool.inputSchema, args), signal),
  }
}

/** The JSON-RPC answer to request `id`: the body, or the message of the stream that answers it. @param {Response} res @param {number} id */
async function read(res, id) {
  if (!/text\/event-stream/.test(res.headers.get('content-type') ?? '')) return res.json().catch(() => null)
  for await (const { data } of res.body ? parseSSE(res.body) : []) {
    const message = (() => { try { return JSON.parse(data) } catch { return null } })()
    if (message?.id === id && ('result' in message || 'error' in message)) return message
  }
  return null
}

/** @param {Reply | null} reply */
function unwrap(reply) {
  if (reply?.message && 'result' in reply.message) return reply.message.result
  throw new MCPError(reply?.message?.error?.message ?? (reply ? `HTTP ${reply.status}` : 'No answer'), { status: reply?.status })
}

/**
 * Arguments a tool asks to see in headers too (`x-mcp-header` in its schema, 2026-07-28).
 * @param {any} schema @param {any} args @param {Record<string, string>} [headers] @returns {Record<string, string>}
 */
export function paramHeaders(schema, args, headers = {}) {
  for (const [key, property] of Object.entries(schema?.properties ?? {})) {
    const value = args?.[key]
    const name = /** @type {any} */ (property)?.['x-mcp-header']
    if (name && value != null && typeof value !== 'object') headers[`mcp-param-${String(name).toLowerCase()}`] = headerValue(String(value))
    else if (value && typeof value === 'object') paramHeaders(property, value, headers)
  }
  return headers
}

/** Printable ASCII as it is; anything else in the Base64 form the protocol defines. @param {string} value */
export function headerValue(value) {
  if (/^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/.test(value) && !/^=\?base64\?.*\?=$/.test(value)) return value
  return `=?base64?${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}?=`
}
