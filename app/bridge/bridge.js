// SPDX-License-Identifier: MIT
// The bridge (D198): this computer, for Jean. The user runs it in a terminal, in the folder a
// conversation has, with the line Settings › Computer gives; the Computer's commands then run here,
// on the user's own machine, in that folder, with its real programs and ports: `npm run dev` serves,
// and Jean's browser shows it. It speaks MCP (Streamable HTTP, answered as JSON) on 127.0.0.1 only,
// to Jean's origin only, with the key in the line. /workspace in a command is that folder, as on
// Jean's own computer, through a link in a temporary folder. Each command runs in a process group
// of its own; one still serving when it has printed a local address and gone quiet keeps running,
// its output going on in a log, until the user stops the bridge (Ctrl+C), which ends them all.
// Jean's desktop app starts it itself, `--attached`: it ends when the app does, its input closing.
// It also lets the user's plans answer as brains: their own Claude Code and Copilot CLI (D235, D262),
// and their ChatGPT plan, which Jean signs in to as itself and whose tokens stay here (D262).
//
//   curl -fsSL <jean>/bridge/bridge.js | JEAN_BRIDGE_KEY=<key> node --input-type=module -e '<runs it if its hash is the one given>' -- --port <port> --origin <jean>
//
// The key comes from the environment, which another user's `ps` can't read as it can an argument, and nothing the
// bridge starts inherits it.
//
// No dependencies; Node 20 or later; macOS or Linux, with bash.
import { createServer } from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify } from 'node:crypto'
import { appendFileSync, constants } from 'node:fs'
import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, platform, tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const VERSION = '4'
const LEGACY = '2025-11-25'
// What a command's output keeps, from its end; a request's body at most (a conversation, with its pictures).
const KEPT = 1_000_000
const BODY = 64_000_000
// Colours and the cursor's moves; an address on this computer a server prints once it serves.
const ESCAPES = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g
const ADDRESS = /\bhttps?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):\d+\/?[^\s'"<>]*/g
// Quiet that long after printing its address, a command serves: it goes on in the background.
const SERVING_MS = 1500
// What the shell runs: in the directory the conversation's shell was left in, the command, then where it ends.
const SHELL = 'cd -- "$1" 2>/dev/null || cd -- "$2"\neval "$3"\n__status=$?\npwd > "$4" 2>/dev/null\nexit $__status'

const TOOLS = [
  {
    name: 'bash',
    description: 'Runs a command with bash on this computer, in the folder the bridge runs in, which is /workspace. The directory the shell is left in is kept between commands of the same computer. A command still serving once it printed a local address keeps running in the background.',
    inputSchema: { type: 'object', properties: { command: { type: 'string' }, computer: { type: 'string', description: 'Whose shell: its directory is kept' }, timeMs: { type: 'number' } }, required: ['command'] },
  },
  {
    name: 'about',
    description: 'This computer: the folder the bridge runs in, the system, and what runs in the background; with claude or copilot, whether that CLI is here and signed in (null: not here); with chatgpt, whether the bridge is signed in to ChatGPT with the use of its plan.',
    inputSchema: { type: 'object', properties: { claude: { type: 'boolean' }, copilot: { type: 'boolean' }, chatgpt: { type: 'boolean' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'chatgpt',
    description: "Starts signing in to ChatGPT, for the use of the user's plan: the address to open, whose end comes back to back with ?chatgpt=signed-in, declined or failed. With out, signs out.",
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, issuer: { type: 'string' }, api: { type: 'string' }, back: { type: 'string' }, out: { type: 'boolean' } } },
  },
  {
    name: 'browser',
    description: "This computer's browser, with no window, in a profile of Jean's own (D746): what its tab shows; open an address; read the page as its parts, those it can act on numbered; click one, type in one (submit: then Enter), choose an option of one, press a key, scroll (at a part, up or down); back, forward, reload. A part's name, when given, must still be its name. The pane's own: pointer, wheel, press (a key as the pane heard it), text, size. Never types in a field for a password, a card or a one-time code.",
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['shown', 'open', 'read', 'click', 'type', 'choose', 'key', 'scroll', 'back', 'forward', 'reload', 'pointer', 'wheel', 'press', 'text', 'size'] },
        url: { type: 'string' }, ref: { type: 'number' }, name: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' }, key: { type: 'string' }, up: { type: 'boolean' },
        event: { type: 'string', enum: ['down', 'up', 'move'] }, x: { type: 'number' }, y: { type: 'number' }, dx: { type: 'number' }, dy: { type: 'number' }, button: { type: 'string' }, clicks: { type: 'number' },
        code: { type: 'string' }, keyCode: { type: 'number' }, modifiers: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, scale: { type: 'number' },
      },
      required: ['action'],
    },
  },
]

// ─── This computer's browser (D746) ──────────────────────────────────────────
// Where each system keeps the browsers the bridge drives, the first found taken: Chromium's, which speak the DevTools protocol.
const BROWSERS = /** @type {Record<string, string[]>} */ ({
  darwin: ['Google Chrome', 'Microsoft Edge', 'Chromium', 'Brave Browser'].map((app) => `/Applications/${app}.app/Contents/MacOS/${app}`),
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'],
})
/** The parts the brain can act on, numbered in what it reads. */
const ACTS = new Set(['link', 'button', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'tab', 'switch', 'slider', 'spinbutton', 'treeitem', 'PopUpButton', 'MenuListOption', 'DisclosureTriangle'])
/** What holds parts and says nothing of its own: left out, its parts kept. */
const SILENT = new Set(['generic', 'none', 'presentation', 'paragraph', 'LabelText', 'Section', 'group', 'LineBreak', 'strong', 'emphasis', 'Abbr', 'time', 'ListMarker', 'superscript', 'subscript', 'code', 'mark', 'insertion', 'deletion'])
/** The states a part's line says. */
const STATES = ['checked', 'pressed', 'expanded', 'selected', 'disabled', 'required', 'focused']
/** The keys the brain presses by name: their code for Windows' sake, and what they type. */
const KEYS = /** @type {Record<string, [number, string?]>} */ ({ Enter: [13, '\r'], Tab: [9], Escape: [27], Backspace: [8], Delete: [46], ArrowUp: [38], ArrowDown: [40],
  ArrowLeft: [37], ArrowRight: [39], Home: [36], End: [35], PageUp: [33], PageDown: [34], Space: [32, ' '] })
// Run on a field before typing in it: whether it is for a password, a card or a one-time code, which the person types themselves; then selected, so typing replaces it.
const RESERVED = "function () { const a = ' ' + String(this.autocomplete || '').toLowerCase(); return String(this.type).toLowerCase() === 'password' || / (cc-|one-time-code|current-password|new-password)/.test(a) }"
const SELECT = 'function () { this.focus(); if (typeof this.select === \'function\') this.select(); else if (this.isContentEditable) getSelection().selectAllChildren(this) }'
// Run on a list to choose one of its options by its words or value, as a person's choice would: false when it has none such.
const CHOOSE = "function (wanted) { const o = [...(this.options || [])].find((o) => o.text.trim() === wanted || o.value === wanted); if (!o) return false; this.value = o.value; for (const type of ['input', 'change']) this.dispatchEvent(new Event(type, { bubbles: true })); return true }"
/** How long a page may take to load after an action, at most; how soon one must start loading to be waited for. */
const LOAD_MS = 15_000
const STARTS_MS = 500

/**
 * A page as the brain reads it (D746), from its accessibility tree: a line for each part, indented under what holds it, those
 * it can act on numbered by their node (`[12] link "Pricing"`), text as it reads, a field's value and a part's states after it.
 * What says nothing of its own is left out with its parts kept, and text a part already says once. Cut at the limit. Pure.
 * @param {any[]} nodes Accessibility.getFullAXTree's, the page's root first @param {number} [limit] characters
 * @returns {{ text: string, parts: Record<number, string> }} parts: each number's name, which Jean's card shows and a click checks
 */
export function snapshot(nodes, limit = 20_000) {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]))
  const lines = /** @type {string[]} */ ([])
  const parts = /** @type {Record<number, string>} */ ({})
  let size = 0
  /** @param {any} node @param {number} depth @param {string} said the name of what holds it */
  const walk = (node, depth, said) => {
    if (!node || size > limit) return
    const role = String(node.role?.value ?? '')
    const name = String(node.name?.value ?? '').replace(/\s+/g, ' ').trim()
    if (role === 'InlineTextBox') return
    let line = ''
    if (role === 'StaticText') line = name !== said ? name : ''
    else if (!node.ignored && role !== 'RootWebArea' && !(SILENT.has(role) && !name)) {
      const ref = ACTS.has(role) ? Number(node.backendDOMNodeId) : 0
      if (ref) parts[ref] = name
      const value = String(node.value?.value ?? '')
      const states = (node.properties ?? []).filter((/** @type {any} */ p) => STATES.includes(p.name) && p.value?.value && p.value.value !== 'false').map((/** @type {any} */ p) => p.name)
      line = `${ref ? `[${ref}] ` : ''}${role}${name ? ` "${name}"` : ''}${value && value !== name ? ` = "${value}"` : ''}${states.length ? ` (${states.join(', ')})` : ''}`
    }
    if (line) {
      lines.push(`${'  '.repeat(depth)}${line}`)
      size += line.length + 2 * depth + 1
    }
    for (const child of node.childIds ?? []) walk(byId.get(child), line ? depth + 1 : depth, line && role !== 'StaticText' ? name : said)
  }
  walk(nodes[0], 0, '')
  return { text: `${lines.join('\n')}${size > limit ? '\n… (cut here)' : ''}`, parts }
}

/** The first of these programs on this computer: by its path, or by its name on PATH; '' when none is. @param {string[]} names */
async function firstOf(names) {
  for (const name of names) {
    for (const path of name.includes('/') ? [name] : (process.env.PATH ?? '').split(':').filter(Boolean).map((dir) => join(dir, name))) {
      if (await access(path, constants.X_OK).then(() => true, () => false)) return path
    }
  }
  return ''
}

// Claude Code's names for the latest of each, which it keeps current: Auto's tiers, in order.
const MODELS = ['haiku', 'sonnet', 'opus'].map((id) => ({ id, display_name: id[0].toUpperCase() + id.slice(1) }))
// A conversation's CLI ends after this long without a request, and the least recently used idle one beyond this many.
const IDLE_MS = 30 * 60_000
const KEPT_SESSIONS = 8
// Claude Code's settings that fetch the keys of a gateway or a cloud provider it reaches, each a command it runs itself.
const HELPERS = ['apiKeyHelper', 'awsAuthRefresh', 'awsCredentialExport', 'gcpAuthRefresh']
// Claude Code's errors, as Anthropic's: Jean words them the same (a 402 is out of credits).
const FAILURES = /** @type {Record<string, object>} */ ({
  authentication_failed: { type: 'authentication_error' }, billing_error: { type: 'billing_error', code: 402 },
  rate_limit: { type: 'rate_limit_error' }, invalid_request: { type: 'invalid_request_error' },
})
// What has Claude Code give the words of what it thinks, which otherwise come empty; older ones refuse it.
const THOUGHTS = ['--thinking-display', 'summarized']
// The brain's own web search, which a CLI can't lend: Jean's search runs in its place.
const SEARCH = { name: 'web_search', description: 'Search the web for facts the conversation does not hold. Results are numbered sources to cite.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }
// How long Copilot's model list holds; the calls it announced that a step waits for before it ends without them.
const MODELS_MS = 3_600_000
const ANNOUNCED_MS = 1000
// What a steer waits for Copilot to say the calls it runs are done, at most, before it is said anyway.
const SETTLED_MS = 5000
// What Copilot says before its first words, of the tools it was told to leave out or doesn't know.
const NOTICE = /^Info: /
// Before Jean's prompt in Copilot's AGENTS.md: its own prompt makes it a coding assistant, which Jean's replaces.
const FRAME = 'These instructions come from the app the user talks to. They take the place of any earlier ones on who you are, what you help with and which tools you have: you are not a coding assistant unless they say so.\n\n'
// ChatGPT's sign-in for open-source apps (D262): what it asks for, the plan's use included, and where it comes back.
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const PLAN_SCOPE = 'chatgpt.tokens.use.direct'
const CALLBACK = '/auth/callback'
// What a sign-in waits for, at most; a token's renewal comes this long before it ends.
const SIGN_IN_MS = 15 * 60_000
const RENEW_MS = 120_000

/**
 * @typedef {{ folder: string, origins: string[], key: string, port: number, claude?: string[], copilot?: string[], browser?: string[], home?: string }} Options
 *   claude, copilot: how Claude Code and Copilot run; browser: the browser the bridge drives, and its first arguments, else the first
 *   of BROWSERS found; home: the folder that keeps the ChatGPT sign-in and the browser's profile
 * @typedef {{ url: string, title: string, loading: boolean, back: boolean, forward: boolean }} Shown what the browser's tab shows, for the pane
 * @typedef {{ send: (method: string, params?: object, session?: string) => Promise<any>, until: (match: (message: any) => boolean, ms: number) => Promise<any>,
 *   child: import('node:child_process').ChildProcess, target: string, session: string, tabs: string[], loading: boolean, casting: boolean, page: Shown, said: string[], shown: number, read: number, parts: Set<number> }} Browser
 *   target and session: the tab on show; tabs: those it opened from, to go back to when it closes; said: what the page's dialogs said since the last action;
 *   shown: how many documents have shown, the page read last being the read-th, whose parts' numbers alone the brain may act on
 * @typedef {{ exit: number, stdout: string, stderr: string, cwd: string, serving?: { group: number, addresses: string[], log: string } }} Ran
 * @typedef {{ role: string, content: any[] }} Turn
 * @typedef {{ id: string, child: import('node:child_process').ChildProcessWithoutNullStreams, agent: 'claude' | 'copilot', tools: object[],
 *   count: number, seen: string, asked: { id: string, name: string, called?: boolean }[], given: Map<string, object>, waiting: Map<string, (result: object) => void>, stderr: string, idle?: NodeJS.Timeout,
 *   say: (content: any[]) => void, call: (params: any) => object | Promise<object>, step: (res: import('node:http').ServerResponse, signal: AbortSignal) => Promise<void> }} Session
 *   count and seen: the turns it has had, and their mark; asked: the tool calls of its last step; say: a message for it;
 *   call: one of its calls to Jean's tools, answered with Jean's result; step: what it does until a step ends, as Anthropic's events
 * @typedef {{ format: 1, host: string, issuer?: string, api?: string, client?: string, sub?: string, email?: string, idToken?: string,
 *   accessToken?: string, refreshToken?: string, expiresAt?: number, scopes?: string[] }} Signed
 *   The ChatGPT sign-in: host, this computer's own id there; client, the registration ChatGPT gave Jean for this account
 */

/** @param {string} text */
const digest = (text) => createHash('sha256').update(text).digest()
/** An event of Anthropic's stream. @param {string} type @param {object} data */
const sse = (type, data) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
/** A turn's blocks without Jean's cache marks, which Claude Code sets itself. @param {any[]} blocks */
const bare = (blocks) => blocks.map(({ cache_control, ...block }) => block)

/** Messages as turns of blocks, a system note (D46) joining the turn before it, tagged as Jean tags them elsewhere. @param {any[]} messages @returns {Turn[]} */
function turns(messages) {
  /** @type {Turn[]} */
  const out = []
  for (const { role, content } of messages) {
    const blocks = typeof content === 'string' ? [{ type: 'text', text: role === 'system' ? `<system-note>\n${content}\n</system-note>` : content }] : bare(content ?? [])
    if (role === 'system' && out.length) out[out.length - 1].content.push(...blocks)
    else out.push({ role: role === 'assistant' ? 'assistant' : 'user', content: blocks })
  }
  return out
}

/** A tool's result, or the text of a turn, as words: pictures named only. @param {unknown} content */
const words = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.map((block) => (block.type === 'text' ? block.text : block.type === 'image' ? '[a picture]' : '')).filter(Boolean).join('\n') : '')

/** Turns Claude Code didn't see (another brain's, or before the bridge started again), told in one. @param {Turn[]} history */
function told(history) {
  const lines = history.flatMap(({ role, content }) => content.flatMap((block) => {
    if (block.type === 'text' || block.type === 'image') return [`${role === 'user' ? 'User' : 'Assistant'}: ${words([block])}`]
    if (block.type === 'tool_use') return [`Assistant called ${block.name} ${JSON.stringify(block.input ?? {})}`]
    if (block.type === 'tool_result') return [`Result${block.is_error ? ' (an error)' : ''}: ${words(block.content)}`]
    return []
  }))
  return `<earlier-conversation>\n${lines.join('\n\n')}\n</earlier-conversation>`
}

/** A tool's result from Jean, as MCP's. @param {any} block */
function result(block) {
  const content = (typeof block.content === 'string' ? [{ type: 'text', text: block.content }] : block.content ?? [])
    .flatMap((part) => (part.type === 'text' ? [{ type: 'text', text: part.text }] : part.type === 'image' && part.source?.data ? [{ type: 'image', data: part.source.data, mimeType: part.source.media_type }] : []))
  return { content, ...(block.is_error && { isError: true }) }
}

/**
 * Anthropic's stream, written from what a CLI said, thought and called (D262): each part a block of
 * its own, a call's input whole. @param {import('node:http').ServerResponse} res @param {string} model
 */
function writer(res, model) {
  let index = -1
  let open = ''
  res.write(sse('message_start', { type: 'message_start', message: { id: `msg_${randomUUID()}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } }))
  const close = () => {
    if (open) res.write(sse('content_block_stop', { type: 'content_block_stop', index }))
    open = ''
  }
  const start = (/** @type {string} */ kind, /** @type {object} */ block) => {
    close()
    open = kind
    res.write(sse('content_block_start', { type: 'content_block_start', index: ++index, content_block: block }))
  }
  const delta = (/** @type {object} */ part) => res.write(sse('content_block_delta', { type: 'content_block_delta', index, delta: part }))
  return {
    /** @param {'text' | 'thinking'} kind @param {string} text */
    part(kind, text) {
      if (open !== kind) start(kind, kind === 'text' ? { type: 'text', text: '' } : { type: 'thinking', thinking: '', signature: '' })
      delta(kind === 'text' ? { type: 'text_delta', text } : { type: 'thinking_delta', thinking: text })
    },
    /** @param {{ id: string, name: string, input: object }} call */
    call({ id, name, input }) {
      start('tool', { type: 'tool_use', id, name, input: {} })
      delta({ type: 'input_json_delta', partial_json: JSON.stringify(input) })
    },
    /** @param {string} stop @param {object} [usage] */
    end(stop, usage = { input_tokens: 0, output_tokens: 0 }) {
      close()
      res.write(sse('message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage }))
      res.end(sse('message_stop', { type: 'message_stop' }))
    },
  }
}

/**
 * JSON-RPC over a child's lines, as ACP speaks it: what it asks or tells goes to incoming, whose answer
 * goes back; what we ask resolves with its whole response, an error one if the child ends first.
 * @param {import('node:child_process').ChildProcessWithoutNullStreams} child @param {(message: any) => object | undefined} incoming
 * @returns {(method: string, params: object) => Promise<any>}
 */
function acp(child, incoming) {
  let sent = 0
  /** @type {Map<number, (response: any) => void>} */
  const pending = new Map()
  const write = (/** @type {object} */ message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => {
    const message = (() => { try { return JSON.parse(line) } catch { return null } })()
    if (!message) return
    if (!message.method) {
      pending.get(message.id)?.(message)
      return void pending.delete(message.id)
    }
    const result = incoming(message)
    if (message.id !== undefined) write(result ? { id: message.id, result } : { id: message.id, error: { code: -32601, message: `Unknown: ${message.method}` } })
  })
  const ended = () => {
    for (const settle of pending.values()) settle({ error: { message: '' } })
    pending.clear()
  }
  child.on('close', ended).on('error', ended)
  child.stdin.on('error', () => {})
  return (method, params) => new Promise((settle) => {
    pending.set(++sent, settle)
    write({ id: sent, method, params })
  })
}

/** ACP's reasons a turn ends, as Anthropic's. */
const STOPS = /** @type {Record<string, string>} */ ({ max_tokens: 'max_tokens', refusal: 'refusal' })

/** A turn's usage, as ACP counts it, as Anthropic's, which counts what was read from the cache apart. @param {any} usage */
const usageOf = (usage) => ({ input_tokens: Math.max(0, (usage?.inputTokens ?? 0) - (usage?.cachedReadTokens ?? 0)), output_tokens: usage?.outputTokens ?? 0, cache_read_input_tokens: usage?.cachedReadTokens ?? 0 })

/** An error of Copilot's, as Anthropic's kind of it: Jean words a sign-in and a limit the same. @param {any} error */
const kindOf = (error) => (error?.code === -32000 || /auth|sign.?in|log.?in/i.test(error?.message) ? { type: 'authentication_error' }
  : /limit|quota|premium|credit|exceeded/i.test(error?.message) ? { type: 'rate_limit_error' } : {})

// ─── ChatGPT's Responses, as Chat Completions (D262) ─────────────────────────

/** The status Jean reads each of ChatGPT's plan errors by (a 429 is a limit reached), from their code. */
const PLAN_ERRORS = /** @type {Record<string, number>} */ ({
  subscription_sharing_usage_limit_exceeded: 429, subscription_sharing_usage_unavailable: 503, subscription_sharing_user_unavailable: 503,
  subscription_sharing_user_not_eligible: 403, subscription_sharing_invalid_user: 401, subscription_sharing_unsupported_capability: 400,
})

/** A part of a Chat Completions message, as Responses' input. @param {any} part */
const inputPart = (part) => (part.type === 'image_url' ? { type: 'input_image', image_url: part.image_url?.url } : { type: 'input_text', text: String(part.text ?? '') })

/**
 * A Chat Completions request as a Responses one, as a ChatGPT plan takes it: the first system message its
 * instructions, any later one a developer's, Jean's tools in a namespace of their own, streamed and stored
 * nowhere, without what it refuses (max_tokens, temperature), with how much it should think (D414) and a
 * summary of what it thinks, which comes only when asked for. @param {any} body
 */
export function responsesRequest(body) {
  const [first, ...rest] = body.messages ?? []
  const instructions = first?.role === 'system' ? String(first.content) : undefined
  const input = (instructions === undefined ? body.messages ?? [] : rest).flatMap((/** @type {any} */ message) => {
    const parts = typeof message.content === 'string' ? (message.content ? [{ type: 'input_text', text: message.content }] : []) : (message.content ?? []).map(inputPart)
    if (message.role === 'tool') return [{ type: 'function_call_output', call_id: message.tool_call_id, output: typeof message.content === 'string' ? message.content : parts }]
    if (message.role !== 'assistant') return [{ type: 'message', role: message.role === 'system' ? 'developer' : 'user', content: parts }]
    return [
      ...(parts.length ? [{ type: 'message', role: 'assistant', content: parts.map((part) => ({ type: 'output_text', text: part.text ?? '' })) }] : []),
      ...(message.tool_calls ?? []).map((/** @type {any} */ call) => ({ type: 'function_call', call_id: call.id, namespace: 'jean', name: call.function?.name, arguments: call.function?.arguments ?? '{}' })),
    ]
  })
  const tools = (body.tools ?? []).filter((/** @type {any} */ tool) => tool.type === 'function')
    .map((/** @type {any} */ { function: { name, description, parameters } }) => ({ type: 'function', name, description, parameters, strict: false }))
  return { model: body.model, ...(instructions !== undefined && { instructions }), input, ...(tools.length && { tools: [{ type: 'namespace', name: 'jean', description: 'Tools of the app the user talks to.', tools }] }), stream: true, store: false, reasoning: { summary: 'auto', ...(body.reasoning_effort && { effort: body.reasoning_effort }) } }
}

/**
 * One of Responses' events as a Chat Completions chunk, or null: text, reasoning, each call's name then
 * its arguments, the end with its usage, an error with the status Jean reads it by.
 * @param {any} event @param {Map<number, { index: number, streamed?: boolean }>} calls by output_index
 */
export function chunkOf(event, calls) {
  const chunk = (/** @type {object} */ delta, finish = null, usage = undefined) => ({ object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: finish }], ...(usage && { usage }) })
  const call = calls.get(event.output_index)
  switch (event.type) {
    case 'response.output_text.delta': return chunk({ content: event.delta })
    case 'response.reasoning_summary_text.delta': return chunk({ reasoning: event.delta })
    // A summary's parts come with nothing between them.
    case 'response.reasoning_summary_part.added': return event.summary_index ? chunk({ reasoning: '\n\n' }) : null
    case 'response.output_item.added':
      if (event.item?.type !== 'function_call') return null
      calls.set(event.output_index, { index: calls.size })
      return chunk({ tool_calls: [{ index: calls.size - 1, id: event.item.call_id, type: 'function', function: { name: event.item.name, arguments: '' } }] })
    case 'response.function_call_arguments.delta':
      if (!call) return null
      call.streamed = true
      return chunk({ tool_calls: [{ index: call.index, function: { arguments: event.delta } }] })
    // Arguments that came whole, never in pieces.
    case 'response.output_item.done':
      return call && !call.streamed && event.item?.arguments ? chunk({ tool_calls: [{ index: call.index, function: { arguments: event.item.arguments } }] }) : null
    case 'response.completed': case 'response.incomplete': {
      const usage = event.response?.usage
      return chunk({}, event.type === 'response.incomplete' ? 'length' : calls.size ? 'tool_calls' : 'stop',
        usage && { prompt_tokens: usage.input_tokens, completion_tokens: usage.output_tokens, prompt_tokens_details: { cached_tokens: usage.input_tokens_details?.cached_tokens ?? 0 } })
    }
    case 'response.failed': case 'error': {
      const error = event.response?.error ?? event.error ?? event
      return { error: { message: String(error?.message || error?.code || 'ChatGPT stopped.'), code: PLAN_ERRORS[error?.code] ?? 500 } }
    }
  }
  return null
}

/** The data of a server-sent events stream, event by event. @param {ReadableStream<Uint8Array>} body */
async function* dataOf(body) {
  let buffer = ''
  for await (const text of body.pipeThrough(new TextDecoderStream())) {
    buffer += text
    for (let end = buffer.search(/\r?\n\r?\n/); end >= 0; end = buffer.search(/\r?\n\r?\n/)) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '')
      const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, '')).join('\n')
      if (data) yield data
    }
  }
}

/** A JSON Web Token's parts. @param {string} token */
function jwt(token) {
  const [head = '', body = '', signature = ''] = String(token).split('.')
  const read = (/** @type {string} */ part) => JSON.parse(Buffer.from(part, 'base64url').toString())
  return { head: read(head), claims: read(body), signed: Buffer.from(`${head}.${body}`), signature: Buffer.from(signature, 'base64url') }
}

/**
 * The bridge's work, apart from its server: answers MCP's messages, runs commands, ends what runs.
 * @param {Options} options
 */
export async function bridge({ folder, origins, key, port, claude: [program, ...before] = ['claude'], copilot: [copilotProgram, ...copilotBefore] = ['copilot'],
  browser: [browserGiven, ...browserBefore] = [], home = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'jean') }) {
  const browserProgram = browserGiven ?? await firstOf(BROWSERS[platform()] ?? [])
  const real = await realpath(folder)
  const temp = await mkdtemp(join(tmpdir(), 'jean-'))
  const link = join(temp, 'workspace')
  await symlink(real, link)
  const expected = digest(`Bearer ${key}`)
  /** Where each computer's shell was left. @type {Map<string, string>} */
  const cwds = new Map()
  /** What runs in the background, by process group. @type {Map<number, { command: string, addresses: string[], log: string }>} */
  const serving = new Map()
  /** Every process group started, to end them with the bridge. @type {Set<number>} */
  const groups = new Set()

  // /workspace, in a command, is the folder; in what comes back, the folder is /workspace again.
  const inward = (/** @type {string} */ text) => text.replace(/(?<![\w./-])\/workspace(?![\w.-])/g, link)
  const outward = (/** @type {string} */ text) => text.split(link).join('/workspace').split(real).join('/workspace')

  /** @param {number} group */
  const end = (group) => {
    try { process.kill(-group, 'SIGTERM') } catch {}
  }

  /**
   * Runs a command, until it ends, serves, or its time is up; stopped with the signal.
   * @param {string} command @param {{ computer?: string, timeMs?: number, signal?: AbortSignal }} [options] @returns {Promise<Ran>}
   */
  function run(command, { computer = '', timeMs = 120_000, signal } = {}) {
    const ends = join(temp, `cwd-${digest(computer).toString('hex').slice(0, 12)}`)
    const child = spawn('bash', ['-c', SHELL, 'bridge', cwds.get(computer) ?? link, link, inward(command), ends], {
      cwd: link,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', BROWSER: 'none', PYTHONUNBUFFERED: '1', WORKSPACE: link },
    })
    const group = /** @type {number} */ (child.pid)
    groups.add(group)
    let [stdout, stderr] = ['', '']
    /** @type {string[]} */
    const addresses = []
    /** @type {string | null} the log its output goes on in, once it serves */
    let log = null
    return new Promise((done) => {
      /** @type {NodeJS.Timeout | undefined} */
      let quiet
      let finished = false
      const finish = (/** @type {Partial<Ran>} */ ran) => {
        if (finished) return
        finished = true
        clearTimeout(quiet)
        clearTimeout(limit)
        signal?.removeEventListener('abort', stop)
        done({ exit: 0, cwd: '/workspace', ...ran, stdout: outward(stdout.replace(ESCAPES, '')), stderr: outward((ran.stderr ?? stderr).replace(ESCAPES, '')) })
      }
      const serve = () => {
        log = join(temp, `${group}.log`)
        serving.set(group, { command, addresses, log })
        finish({ exit: 0, cwd: outward(cwds.get(computer) ?? link), serving: { group, addresses, log } })
      }
      const heard = (/** @type {'out' | 'err'} */ which) => (/** @type {Buffer} */ chunk) => {
        const text = chunk.toString()
        if (log) return appendFileSync(log, text)
        if (which === 'out') stdout = (stdout + text).slice(-KEPT)
        else stderr = (stderr + text).slice(-KEPT)
        for (const [found, host] of text.replace(ESCAPES, '').matchAll(ADDRESS)) {
          const address = found.replace(/[).,;:]+$/, '')
          // Where a browser on this computer reaches it, as printed; listening everywhere, at 127.0.0.1; over IPv6,
          // at localhost, since Jean's browser frames localhost and 127.0.0.1 only.
          const local = address.replace(host, host === '0.0.0.0' ? '127.0.0.1' : host.startsWith('[') ? 'localhost' : host)
          if (!addresses.includes(local)) addresses.push(local)
        }
        clearTimeout(quiet)
        if (addresses.length) quiet = setTimeout(serve, SERVING_MS)
      }
      child.stdout.on('data', heard('out'))
      child.stderr.on('data', heard('err'))
      const stop = () => end(group)
      signal?.addEventListener('abort', stop, { once: true })
      // Its time up: one that serves goes on, anything else ends.
      const limit = setTimeout(() => (addresses.length ? serve() : (end(group), finish({ exit: 124, stderr: `${stderr}\nStopped after ${Math.round(timeMs / 1000)} s.` }))), timeMs)
      child.on('error', (error) => finish({ exit: 127, stderr: error.message }))
      child.on('exit', async (code, killed) => {
        groups.delete(group)
        serving.delete(group)
        if (finished) return
        // What it printed last, unless something it left running holds the pipes open.
        await Promise.race([Promise.all([new Promise((r) => child.stdout.once('close', r)), new Promise((r) => child.stderr.once('close', r))]), new Promise((r) => setTimeout(r, 100))])
        const cwd = (await readFile(ends, 'utf8').catch(() => '')).trim()
        if (cwd) cwds.set(computer, cwd)
        finish({ exit: code ?? 128 + 15, cwd: outward(cwds.get(computer) ?? link), ...(killed && { stderr: `${stderr}${stderr.endsWith('\n') || !stderr ? '' : '\n'}^C` }) })
      })
    })
  }

  // ─── This computer's browser (D746) ────────────────────────────────────────
  // Chrome, Edge, Chromium or Brave of this computer, with no window, in a profile of Jean's own (<home>/browser, where its
  // sign-ins stay), driven over the DevTools protocol through a pipe only the bridge holds, never a port. Jean's pane draws its
  // tab as it draws (/browser/screen) and sends it the person's own clicks and keys; the brain reads a page as its
  // accessibility tree and acts on the parts it numbers. Started when first asked for; ended with the bridge.

  /** @type {Promise<Browser> | null} */
  let started = null
  /** The panes watching it draw. @type {Set<import('node:http').ServerResponse>} */
  const watchers = new Set()
  /** The pane's size, in its pixels, and how many of the screen's each holds: every tab takes it. */
  let screen = { width: 1280, height: 800, scale: 1 }

  /** The browser, started once. @returns {Promise<Browser>} */
  function browser() {
    return (started ??= (async () => {
      if (!browserProgram) throw new Error('No Chrome, Edge, Chromium or Brave was found on this computer.')
      const profile = join(home, 'browser')
      await mkdir(profile, { recursive: true })
      // In a process group of its own: Ctrl+C in the terminal reaches the bridge alone, which closes it so that it writes what it holds.
      const child = spawn(browserProgram, [...browserBefore, `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--headless', '--no-first-run', '--no-default-browser-check', 'about:blank'],
        { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], detached: true })
      const [, , , input, output] = /** @type {[any, any, any, import('node:stream').Writable, import('node:stream').Readable]} */ (/** @type {unknown} */ (child.stdio))
      /** @type {Map<number, (message: any) => void>} */
      const waiting = new Map()
      /** @type {Set<(message: any) => void>} */
      const heard = new Set()
      let [id, buffer] = [0, '']
      /** @type {Browser} */
      const b = {
        child, target: '', session: '', tabs: [], loading: false, casting: false, page: { url: '', title: '', loading: false, back: false, forward: false }, said: [], shown: 0, read: -1, parts: new Set(),
        send: (method, params = {}, session = '') => new Promise((ok, failed) => {
          waiting.set(++id, (message) => (message.error ? failed(new Error(message.error.message)) : ok(message.result)))
          input.write(`${JSON.stringify({ id, method, params, ...(session && { sessionId: session }) })}\0`)
        }),
        until: (match, ms) => new Promise((done) => {
          const finish = (/** @type {any} */ message) => { heard.delete(hear); clearTimeout(timer); done(message) }
          const hear = (/** @type {any} */ message) => { if (match(message)) finish(message) }
          const timer = setTimeout(finish, ms, null)
          heard.add(hear)
        }),
      }
      const gone = new Promise((_, failed) => {
        child.once('error', failed)
        child.once('exit', () => failed(new Error('The browser closed.')))
      })
      gone.catch(() => {
        started = null
        for (const answer of waiting.values()) answer({ error: { message: 'The browser closed.' } })
        for (const res of watchers) res.end()
        watchers.clear()
      })
      output.setEncoding('utf8')
      output.on('data', (/** @type {string} */ chunk) => {
        buffer += chunk
        for (let at = buffer.indexOf('\0'); at >= 0; at = buffer.indexOf('\0')) {
          const message = JSON.parse(buffer.slice(0, at))
          buffer = buffer.slice(at + 1)
          if (message.id) {
            waiting.get(message.id)?.(message)
            waiting.delete(message.id)
          } else {
            for (const hear of [...heard]) hear(message)
            heed(b, message)
          }
        }
      })
      const { targetInfos } = await Promise.race([b.send('Target.getTargets'), gone])
      await b.send('Target.setDiscoverTargets', { discover: true })
      await attach(b, targetInfos.find((/** @type {any} */ target) => target.type === 'page').targetId)
      return b
    })())
  }

  /** Shows a tab: attached, at the pane's size, drawn for it while it watches. @param {Browser} b @param {string} target */
  async function attach(b, target) {
    if (b.casting) await b.send('Page.stopScreencast', {}, b.session).catch(() => {})
    const { sessionId } = await b.send('Target.attachToTarget', { targetId: target, flatten: true })
    Object.assign(b, { target, session: sessionId, casting: false, loading: false, shown: b.shown + 1 })
    await Promise.all([b.send('Page.enable', {}, sessionId), b.send('DOM.enable', {}, sessionId), fit(b)])
    if (watchers.size) await cast(b)
    await tell(b)
  }

  /** @param {Browser} b */
  const fit = (b) => b.send('Emulation.setDeviceMetricsOverride', { width: screen.width, height: screen.height, deviceScaleFactor: screen.scale, mobile: false }, b.session)
  /** @param {Browser} b */
  const cast = async (b) => {
    await b.send('Page.startScreencast', { format: 'jpeg', quality: 75, maxWidth: Math.round(screen.width * screen.scale), maxHeight: Math.round(screen.height * screen.scale) }, b.session)
    b.casting = true
  }

  /** What the tab shows now, told to the panes watching. @param {Browser} b */
  async function tell(b) {
    const [info, history] = await Promise.all([b.send('Target.getTargetInfo', { targetId: b.target }), b.send('Page.getNavigationHistory', {}, b.session)]).catch(() => [])
    if (!info) return
    b.page = { url: info.targetInfo.url, title: info.targetInfo.title, loading: b.loading, back: history.currentIndex > 0, forward: history.currentIndex < history.entries.length - 1 }
    for (const res of watchers) res.write(sse('page', b.page))
  }

  /**
   * What the browser says by itself: a frame drawn, the tab's address, title or loading changed, a tab it opened, which shows
   * until it closes, and a dialog, which nobody sees there: an alert is taken, a question answered no, and the next result says it.
   * @param {Browser} b @param {any} message
   */
  function heed(b, { method, params = {}, sessionId }) {
    if (method === 'Page.screencastFrame') {
      b.send('Page.screencastFrameAck', { sessionId: params.sessionId }, sessionId).catch(() => {})
      if (sessionId === b.session) for (const res of watchers) if (!res.writableNeedDrain) res.write(sse('frame', { data: params.data, width: params.metadata.deviceWidth, height: params.metadata.deviceHeight }))
    } else if (method === 'Target.targetInfoChanged' && params.targetInfo.targetId === b.target) tell(b)
    else if (method === 'Page.frameNavigated' && sessionId === b.session && !params.frame.parentId) b.shown++
    else if (/^Page\.frameSt(arted|opped)Loading$/.test(method) && sessionId === b.session && params.frameId === b.target) {
      b.loading = method.includes('Started')
      tell(b)
    } else if (method === 'Target.targetCreated' && params.targetInfo.type === 'page' && params.targetInfo.openerId === b.target) {
      b.tabs.push(b.target)
      attach(b, params.targetInfo.targetId).catch(() => {})
    } else if (method === 'Target.targetDestroyed' && params.targetId === b.target) {
      const back = b.tabs.pop()
      ;(back ? attach(b, back) : b.send('Target.createTarget', { url: 'about:blank' }).then(({ targetId }) => attach(b, targetId))).catch(() => {})
    } else if (method === 'Page.javascriptDialogOpening' && sessionId === b.session) {
      const asks = /^(confirm|prompt)$/.test(params.type)
      b.said.push(`The page ${asks ? 'asked' : 'said'} "${params.message}"${asks ? ', and Jean answered no' : ''}.`)
      b.send('Page.handleJavaScriptDialog', { accept: !asks }, sessionId).catch(() => {})
    }
  }

  /**
   * Does something that may load a page, then waits for it to load, when it starts loading soon; one that surely loads, however late it starts.
   * @param {Browser} b @param {() => Promise<unknown>} act @param {boolean} [loads]
   */
  async function settle(b, act, loads = false) {
    const [session, target] = [b.session, b.target]
    const heard = (/** @type {string} */ method) => (/** @type {any} */ m) => m.method === method && m.sessionId === session && m.params.frameId === target
    const [starts, stops] = [b.until(heard('Page.frameStartedLoading'), loads ? LOAD_MS : STARTS_MS), b.until(heard('Page.frameStoppedLoading'), LOAD_MS)]
    await act()
    if (await starts) await stops
  }

  /**
   * Where to click a part the brain read: its middle, scrolled into view, while it still has the name read with it.
   * @param {Browser} b @param {unknown} ref @param {unknown} name
   */
  async function point(b, ref, name) {
    const backendNodeId = Number(ref)
    const lost = () => { throw new Error(`Part [${ref}] is no longer on the page: read it again.`) }
    if (typeof name === 'string') {
      const { nodes } = await b.send('Accessibility.getPartialAXTree', { backendNodeId, fetchRelatives: false }, b.session).catch(lost)
      const now = String(nodes?.[0]?.name?.value ?? '').replace(/\s+/g, ' ').trim()
      if (now !== name) throw new Error(`Part [${ref}] now says "${now}", not "${name}": read the page again.`)
    }
    await b.send('DOM.scrollIntoViewIfNeeded', { backendNodeId }, b.session).catch(lost)
    const { quads } = await b.send('DOM.getContentQuads', { backendNodeId }, b.session).catch(lost)
    if (!quads?.length) throw new Error(`Part [${ref}] isn't shown on the page.`)
    const [q] = quads
    return { x: (q[0] + q[2] + q[4] + q[6]) / 4, y: (q[1] + q[3] + q[5] + q[7]) / 4 }
  }

  /** A function run on a part, with what it returns. @param {Browser} b @param {unknown} ref @param {string} code @param {unknown[]} [args] */
  async function on(b, ref, code, args = []) {
    const { object } = await b.send('DOM.resolveNode', { backendNodeId: Number(ref) }, b.session).catch(() => { throw new Error(`Part [${ref}] is no longer on the page: read it again.`) })
    const { result } = await b.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: code, arguments: args.map((value) => ({ value })), returnByValue: true }, b.session)
    return result?.value
  }

  /** A click at a point, as a mouse makes it. @param {Browser} b @param {{ x: number, y: number }} at */
  const click = async (b, { x, y }) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }, b.session)
  }
  /** A key pressed and let go: a named one, or one as the pane heard it. @param {Browser} b @param {{ key: string, code?: string, keyCode?: number, text?: string, modifiers?: number }} key */
  const press = async (b, { key, code = key, keyCode, text = '', modifiers = 0 }) => {
    const event = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers }
    await b.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', text, unmodifiedText: text, ...event }, b.session)
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event }, b.session)
  }

  /**
   * One of the browser tool's actions: the brain's, through Jean's approval, or the pane's own, which are the person's.
   * @param {Record<string, any>} args @returns {Promise<Shown & { said: string[], text?: string, parts?: Record<number, string> }>}
   */
  async function drive(args) {
    const b = await browser()
    const { action, ref } = args
    const said = () => ({ ...b.page, said: b.said.splice(0) })
    // A number read off another page may name something else on this one.
    if (ref && (b.read !== b.shown || !b.parts.has(Number(ref)))) throw new Error(`The page changed since it was read, or has no part [${ref}]: read it again.`)
    if (action === 'shown') return { ...b.page, said: [] }
    if (action === 'open') {
      const url = String(args.url ?? '')
      if (!/^https?:\/\//i.test(url)) throw new Error('An http or https address is needed.')
      await settle(b, async () => {
        const { errorText } = await b.send('Page.navigate', { url }, b.session)
        if (errorText) throw new Error(`${url} didn't open: ${errorText}.`)
      }, true)
    } else if (action === 'read') {
      // A page still loading is read once it has.
      if (b.loading) await b.until((m) => m.method === 'Page.frameStoppedLoading' && m.sessionId === b.session && m.params.frameId === b.target, LOAD_MS)
      const { nodes } = await b.send('Accessibility.getFullAXTree', {}, b.session)
      const read = snapshot(nodes)
      Object.assign(b, { read: b.shown, parts: new Set(Object.keys(read.parts).map(Number)) })
      await tell(b)
      return { ...said(), ...read }
    } else if (action === 'click') {
      const at = await point(b, ref, args.name)
      await settle(b, () => click(b, at))
    } else if (action === 'type' || action === 'choose') {
      await point(b, ref, args.name)
      if (await on(b, ref, RESERVED)) throw new Error('That field is for a password, a card or a one-time code: the user types it themselves.')
      if (action === 'choose' && !(await on(b, ref, CHOOSE, [String(args.text ?? '')]))) throw new Error(`Part [${ref}] has no option "${args.text}".`)
      if (action === 'type') {
        await on(b, ref, SELECT)
        await b.send('Input.insertText', { text: String(args.text ?? '') }, b.session)
        if (args.submit) await settle(b, () => press(b, { key: 'Enter', keyCode: 13, text: '\r' }))
      }
    } else if (action === 'key') {
      const [keyCode, text] = KEYS[args.key] ?? []
      if (!keyCode) throw new Error(`The keys are ${Object.keys(KEYS).join(', ')}.`)
      await settle(b, () => press(b, { key: args.key === 'Space' ? ' ' : args.key, code: args.key, keyCode, text }))
    } else if (action === 'scroll') {
      const at = ref ? await point(b, ref, args.name) : { x: screen.width / 2, y: screen.height / 2 }
      await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...at, deltaX: 0, deltaY: args.up ? -screen.height * 0.8 : screen.height * 0.8 }, b.session)
    } else if (action === 'back' || action === 'forward') {
      const { currentIndex, entries } = await b.send('Page.getNavigationHistory', {}, b.session)
      const entry = entries[currentIndex + (action === 'back' ? -1 : 1)]
      if (entry) await settle(b, () => b.send('Page.navigateToHistoryEntry', { entryId: entry.id }, b.session))
    } else if (action === 'reload') await settle(b, () => b.send('Page.reload', {}, b.session))
    // The pane's: what the person does there, as they do it.
    else if (action === 'pointer') {
      const type = ({ down: 'mousePressed', up: 'mouseReleased', move: 'mouseMoved' })[String(args.event)]
      await b.send('Input.dispatchMouseEvent', { type, x: Number(args.x), y: Number(args.y), button: type === 'mouseMoved' ? 'none' : String(args.button || 'left'), clickCount: Number(args.clicks) || 1, modifiers: Number(args.modifiers) || 0 }, b.session)
    } else if (action === 'wheel') await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Number(args.x), y: Number(args.y), deltaX: Number(args.dx) || 0, deltaY: Number(args.dy) || 0 }, b.session)
    else if (action === 'press') await press(b, { key: String(args.key), code: String(args.code ?? args.key), keyCode: Number(args.keyCode) || undefined, text: String(args.text ?? ''), modifiers: Number(args.modifiers) || 0 })
    else if (action === 'text') await b.send('Input.insertText', { text: String(args.text ?? '') }, b.session)
    else if (action === 'size') {
      screen = { width: Math.max(200, Math.round(Number(args.width) || 1280)), height: Math.max(200, Math.round(Number(args.height) || 800)), scale: Math.min(3, Math.max(1, Number(args.scale) || 1)) }
      await fit(b)
      if (b.casting) await cast(b)
    } else throw new Error(`Unknown action: ${action}`)
    await tell(b)
    return said()
  }

  /** A pane watching the browser draw: its frames and what its tab shows, as events, until it goes. @param {import('node:http').ServerResponse} res */
  async function watch(res) {
    const b = await browser().catch((/** @type {Error} */ error) => void res.writeHead(503).end(error.message))
    if (!b) return
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
    watchers.add(res)
    res.on('close', () => {
      watchers.delete(res)
      if (!watchers.size && b.casting) b.send('Page.stopScreencast', {}, b.session).then(() => { b.casting = false }, () => {})
    })
    res.write(sse('page', b.page))
    if (!b.casting) await cast(b)
  }

  // ─── Plans: Claude Code (D235) and Copilot (D262) ──────────────────────────
  // The user's own Claude Code or Copilot CLI, signed in with their plan through its maker's own sign-in,
  // answers Jean's Messages requests as an Anthropic brain would: a conversation runs in one process with
  // no tools of its own, only Jean's, offered back to it over MCP at /session/<its id>. A step that calls
  // them ends the request; the calls wait for the results Jean's next request brings, and its next message
  // goes on in the same process. Any other history starts one afresh, its earlier turns told. Claude Code
  // speaks stream-json, with Jean's prompt as its own; Copilot speaks ACP, with Jean's prompt as the
  // AGENTS.md of a folder of its own. The sign-ins stay theirs: the bridge never reads them.

  /** @type {Map<string, Session>} */
  const sessions = new Map()

  /**
   * What connects Claude Code to the user's provider in its own settings, which a conversation's process
   * otherwise leaves out: their environment (a gateway's address and token, a cloud provider's switches),
   * under the bridge's own, which wins as it does in Claude Code, and the helpers that fetch its keys.
   * @returns {Promise<{ env: Record<string, string | undefined>, helpers: Record<string, string> }>}
   */
  async function reach() {
    const settings = await readFile(join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json'), 'utf8').then(JSON.parse).catch(() => null)
    return { env: { ...settings?.env, ...process.env }, helpers: Object.fromEntries(HELPERS.filter((name) => typeof settings?.[name] === 'string').map((name) => [name, settings[name]])) }
  }

  /** Whether Claude Code is on this computer and signed in, a gateway's token counting, which it sends as it is; null when it isn't here. @returns {Promise<boolean | null>} */
  const signedIn = async () => {
    const { env } = await reach()
    return new Promise((done) => execFile(program, [...before, 'auth', 'status', '--json'], { timeout: 15_000 }, (_, stdout) => {
      try { done(Boolean(JSON.parse(stdout).loggedIn || env.ANTHROPIC_AUTH_TOKEN)) } catch { done(null) }
    }))
  }

  /** Whether this Claude Code takes THOUGHTS: its sign-in check, quick and asking its brain nothing, refuses them as a conversation would. @returns {Promise<boolean>} */
  const thinksAloud = () => new Promise((done) => execFile(program, [...before, ...THOUGHTS, 'auth', 'status', '--json'], { timeout: 15_000 }, (_, __, stderr) => done(!stderr.includes(THOUGHTS[0]))))

  /** @param {Session} session */
  function shut(session) {
    clearTimeout(session.idle)
    session.child.kill()
    sessions.delete(session.id)
    rm(join(temp, session.id), { recursive: true, force: true }).catch(() => {})
  }

  /**
   * Beyond limit, the least recently used processes end, of those idle: their idle timer runs (none is in a step) and
   * no call of theirs waits for Jean's results. While every one is busy, there are more, until steps end. @param {number} limit
   */
  function trim(limit) {
    for (const each of sessions.values()) if (sessions.size > limit && each.idle && !each.asked.length && !each.waiting.size) shut(each)
  }

  /** A conversation's process, kept with the others. @param {Pick<Session, 'id' | 'child' | 'agent' | 'tools' | 'say' | 'call' | 'step'>} own */
  function keep(own) {
    trim(KEPT_SESSIONS - 1)
    /** @type {Session} */
    const session = { ...own, count: 0, seen: '', asked: [], given: new Map(), waiting: new Map(), stderr: '' }
    session.child.stderr.on('data', (chunk) => { session.stderr = (session.stderr + chunk).slice(-2000) })
    session.child.on('error', (error) => { session.stderr = error.message })
    session.child.stdin.on('error', () => {})
    sessions.set(session.id, session)
    return session
  }

  /** A step that failed: Anthropic's error event, and the conversation's process ends. @param {import('node:http').ServerResponse} res @param {Session} session @param {string} message @param {object} [kind] */
  function fail(res, session, message, kind) {
    res.end(sse('error', { type: 'error', error: { type: 'api_error', ...kind, message } }))
    shut(session)
  }

  /**
   * A conversation's Claude Code: Jean's prompt as its own, Jean's tools its only ones, nothing of the user's
   * settings or sessions but what connects it to their provider. @param {string} model @param {string} system @param {object[]} tools
   */
  async function claudeCode(model, system, tools) {
    const id = randomUUID()
    const mcp = { mcpServers: { jean: { type: 'http', url: `http://127.0.0.1:${port}/session/${id}`, headers: { authorization: `Bearer ${key}` } } } }
    const { env, helpers } = await reach()
    const thoughts = await thinksAloud() ? THOUGHTS : []
    const child = spawn(program, [...before, '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--model', model, '--system-prompt', system, '--tools', '', '--strict-mcp-config', '--mcp-config', JSON.stringify(mcp), '--allowedTools', 'mcp__jean',
      '--setting-sources', '', '--settings', JSON.stringify(helpers), '--disable-slash-commands', '--no-session-persistence', ...thoughts], { cwd: temp, env: { ...env, MCP_TOOL_TIMEOUT: String(24 * 3_600_000) } })
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]()
    const session = keep({
      id, child, agent: 'claude', tools,
      say: (content) => child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null })}\n`),
      // A call names its tool use, or else is the first of its step by that name; Jean's result may be here already.
      call: (params) => {
        const named = params?._meta?.['claudecode/toolUseId']
        const call = session.asked.find((each) => (named ? each.id === named : each.name === params?.name && !each.called))
        if (call) call.called = true
        const toolId = String(named ?? call?.id ?? '')
        const given = session.given.get(toolId)
        session.given.delete(toolId)
        return given ?? new Promise((answered) => session.waiting.set(toolId, answered))
      },
      // Its own stream's events, passed on, its tools' names as Jean's.
      step: async (res, signal) => {
        let failure = ''
        for (;;) {
          const { value, done } = await lines.next()
          if (signal.aborted) return
          const line = done ? null : (() => { try { return JSON.parse(value) } catch { return {} } })()
          if (line?.type === 'assistant' && line.error) failure = line.error
          if (!line || (line.type === 'result' && line.is_error)) return fail(res, session, line?.result || session.stderr.trim() || 'Claude Code stopped.', FAILURES[failure])
          if (line.type !== 'stream_event') continue
          const event = line.event
          if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            event.content_block.name = String(event.content_block.name).replace(/^mcp__jean__/, '')
            session.asked.push(event.content_block)
          }
          res.write(sse(event.type, event))
          if (event.type === 'message_stop') return void res.end()
        }
      },
    })
    return session
  }

  /**
   * A conversation's Copilot, over ACP: Jean's prompt as the AGENTS.md of a folder of its own, Jean's tools
   * its only ones (`jean-<name>` to it), none of its own servers. A step goes on until its turn ends, or until
   * it has called Jean's tools and the calls it announced have come. @param {string} model @param {string} system @param {object[]} tools
   */
  async function copilot(model, system, tools) {
    const id = randomUUID()
    const dir = join(temp, id)
    await mkdir(dir)
    await writeFile(join(dir, 'AGENTS.md'), `${FRAME}${system}`)
    const only = tools.map((/** @type {any} */ tool) => `jean-${tool.name}`).join(',') || 'jean-'
    const child = spawn(copilotProgram, [...copilotBefore, '--acp', '--model', model, `--available-tools=${only}`, '--allow-tool=jean', '--disable-builtin-mcps', '--no-ask-user'], { cwd: dir })
    /** What it said, thought, called and ended with, as they come. @type {any[]} */
    const queue = []
    /** @type {(() => void) | null} */
    let wake = null
    const push = (/** @type {any} */ event) => {
      queue.push(event)
      wake?.()
    }
    /** The next event, or null once ms have gone by without one. @param {number} ms @returns {Promise<any>} */
    const next = (ms) => new Promise((done) => {
      if (queue.length) return done(queue.shift())
      const timer = ms < Infinity ? setTimeout(() => { wake = null; done(null) }, ms) : undefined
      wake = () => {
        clearTimeout(timer)
        wake = null
        done(queue.shift())
      }
    })
    /** The calls it announced, whose ids its calls over MCP take. @type {{ id: string, title: string }[]} */
    const announced = []
    /** Whether it has said anything yet, after which nothing it says is a notice. */
    let spoken = false
    /** The calls it runs, until it says they are done, and what waits for none to run. @type {Set<string>} */
    const running = new Set()
    /** @type {(() => void) | null} */
    let settled = null
    /** The prompts it was given, and the one it answers: until a later one's turn comes, what that one says goes nowhere. */
    let [given, answering] = [0, 1]
    const request = acp(/** @type {any} */ (child), (message) => {
      const update = message.params?.update
      const text = update?.content?.type === 'text' ? String(update.content.text) : ''
      const heard = given <= answering
      if (update?.sessionUpdate === 'agent_message_chunk' && heard && text && (spoken || !NOTICE.test(text))) {
        spoken = true
        push({ type: 'text', text })
      }
      if (update?.sessionUpdate === 'agent_thought_chunk' && heard && text) push({ type: 'thinking', text })
      if (update?.sessionUpdate === 'tool_call') running.add(String(update.toolCallId))
      if (update?.sessionUpdate === 'tool_call' && heard) announced.push({ id: String(update.toolCallId), title: String(update.title) })
      if (update?.sessionUpdate === 'tool_call_update' && /^(completed|failed)$/.test(update.status) && running.delete(String(update.toolCallId)) && !running.size) settled?.()
      // Jean's tools are allowed: Jean asks the user, as with any brain.
      const allow = message.method === 'session/request_permission' && message.params?.options?.find((/** @type {any} */ option) => /^allow/.test(option.kind))
      return allow ? { outcome: { outcome: 'selected', optionId: allow.optionId } } : undefined
    })
    child.on('close', () => push({ type: 'error', error: { message: session.stderr.trim() || 'Copilot stopped.' } }))
    const opened = (async () => {
      await request('initialize', { protocolVersion: 1, clientCapabilities: {} })
      const created = await request('session/new', { cwd: dir, mcpServers: [{ type: 'http', name: 'jean', url: `http://127.0.0.1:${port}/session/${id}`, headers: [{ name: 'authorization', value: `Bearer ${key}` }] }] })
      if (created.error) throw created.error
      return String(created.result.sessionId)
    })()
    const session = keep({
      id, child: /** @type {any} */ (child), agent: 'copilot', tools,
      // A message that starts with / is the user's words, never one of Copilot's commands: a zero-width space goes before it.
      // One said while it answers (a steer, D365) goes once the calls it runs are done: Copilot ends that turn, cancelled,
      // keeping their results, and answers this one next.
      say: (content) => {
        const mine = ++given
        void opened.then(async (sessionId) => {
          const prompt = content.flatMap((block, i) => (block.type === 'text' ? [{ type: 'text', text: `${i || !block.text.startsWith('/') ? '' : '\u200b'}${block.text}` }]
            : block.type === 'image' && block.source?.data ? [{ type: 'image', data: block.source.data, mimeType: block.source.media_type }] : []))
          if (answering < mine) await new Promise((done) => {
            settled = () => done(undefined)
            if (!running.size) done(undefined)
            setTimeout(done, SETTLED_MS)
          })
          settled = null
          const answered = await request('session/prompt', { sessionId, prompt })
          answering = Math.max(answering, mine + 1)
          announced.length = 0
          running.clear()
          if (mine === given) push(answered.error ? { type: 'error', error: answered.error } : { type: 'end', ...answered.result })
        }, (error) => push({ type: 'error', error }))
      },
      call: (params) => {
        // A call of a turn a steer ends is not Jean's to run.
        if (given > answering) return { content: [{ type: 'text', text: 'Not run: the user said something new.' }], isError: true }
        const name = String(params?.name ?? '')
        const [known] = announced.splice(Math.max(0, announced.findIndex((each) => each.title === `jean-${name}`)), 1)
        const toolId = known?.id ?? `toolu_${randomUUID()}`
        push({ type: 'call', id: toolId, name, input: params?.arguments ?? {} })
        return new Promise((answered) => session.waiting.set(toolId, answered))
      },
      step: async (res, signal) => {
        const out = writer(res, model)
        for (let calls = 0; ;) {
          const event = await next(!calls ? Infinity : announced.length ? ANNOUNCED_MS : 0)
          if (signal.aborted) return
          if (!event) return out.end('tool_use')
          if (event.type === 'text' || event.type === 'thinking') out.part(event.type, event.text)
          else if (event.type === 'call') {
            calls++
            session.asked.push({ id: event.id, name: event.name })
            out.call(event)
          } else if (event.type === 'end') return out.end(STOPS[event.stopReason] ?? 'end_turn', usageOf(event.usage))
          else return fail(res, session, String(event.error?.message || 'Copilot stopped.'), kindOf(event.error))
        }
      },
    })
    return session
  }

  /** @type {{ at: number, models: object[] } | null} */
  let copilotSeen = null

  /**
   * Copilot's models, from a session it opens, which also says it is here and signed in: null when it
   * isn't here, false when it opens none. Kept an hour. @returns {Promise<object[] | false | null>}
   */
  async function copilotHere() {
    if (copilotSeen && Date.now() - copilotSeen.at < MODELS_MS) return copilotSeen.models
    const child = spawn(copilotProgram, [...copilotBefore, '--acp', '--disable-builtin-mcps'], { cwd: temp })
    const request = acp(/** @type {any} */ (child), () => undefined)
    const found = await Promise.race([new Promise((done) => setTimeout(() => done(null), 30_000)), (async () => {
      if ((await request('initialize', { protocolVersion: 1, clientCapabilities: {} })).error) return null
      const created = await request('session/new', { cwd: temp, mcpServers: [] })
      if (created.error) return false
      await request('session/close', { sessionId: created.result.sessionId })
      return (created.result.models?.availableModels ?? []).filter((/** @type {any} */ model) => model.modelId !== 'auto')
        .map((/** @type {any} */ model) => ({ id: String(model.modelId), display_name: String(model.name ?? model.modelId) }))
    })()])
    child.kill()
    if (found) copilotSeen = { at: Date.now(), models: found }
    return /** @type {object[] | false | null} */ (found)
  }

  /**
   * A Messages request to Claude Code or Copilot: the step that follows its history, streamed as Anthropic's
   * events. The conversation the last request left goes on in its process; any other starts one.
   * @param {'claude' | 'copilot'} agent @param {any} body @param {import('node:http').ServerResponse} res @param {AbortSignal} signal
   */
  async function converse(agent, body, res, signal) {
    // Warming the cache ahead (D49) is the CLI's own matter.
    if (!body.stream) return res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    const history = turns(body.messages ?? [])
    const last = history.at(-1)
    if (last?.role !== 'user') return res.writeHead(400).end()
    const system = [body.system ?? []].flat().map((part) => part?.text ?? String(part)).join('\n\n')
    const tools = (body.tools ?? []).map((/** @type {any} */ tool) => (tool.type?.startsWith('web_search') ? SEARCH : { name: tool.name, description: tool.description, inputSchema: tool.input_schema }))
    const mark = (/** @type {Turn[]} */ upTo) => digest(JSON.stringify([agent, body.model, system, tools, upTo.filter((turn) => turn.role === 'user')])).toString('hex')
    const results = last.content.filter((block) => block.type === 'tool_result')
    // Its process goes on when this request brings exactly what it waits for: the results of its calls, or the next message.
    const answers = (/** @type {Session} */ each) => (results.length ? results.every((block) => each.asked.some((call) => call.id === block.tool_use_id)) : !each.asked.length)
    let session = [...sessions.values()].find((each) => each.agent === agent && each.count === history.length - 2 && each.seen === mark(history.slice(0, each.count)) && answers(each))
    if (session && results.length) {
      // What the user sent meanwhile (D365) is their next message, said before the results reach the calls, which the CLI
      // reads once they are in: Claude Code within its turn, Copilot in the next.
      const more = last.content.filter((block) => block.type !== 'tool_result')
      if (more.length) session.say(more)
      results.forEach((block) => give(/** @type {Session} */ (session), block.tool_use_id, result(block)))
    } else {
      session ??= agent === 'claude' ? await claudeCode(String(body.model), system, tools) : await copilot(String(body.model), system, tools)
      const tail = results.length ? [{ type: 'text', text: 'Go on from there.' }] : last.content
      session.say(session.count || history.length === 1 ? tail : [{ type: 'text', text: told(results.length ? history : history.slice(0, -1)) }, ...tail])
    }
    const here = session
    clearTimeout(here.idle)
    here.idle = undefined
    here.count = history.length
    here.seen = mark(history)
    here.asked = []
    // Stopped in Jean: the step ends, and its process with it.
    const stop = () => shut(here)
    signal.addEventListener('abort', stop, { once: true })
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    await here.step(res, signal)
    signal.removeEventListener('abort', stop)
    // Idle again, and the one used last: last of the map, which holds them by their last use.
    if (!sessions.delete(here.id)) return
    sessions.set(here.id, here)
    here.idle = setTimeout(() => shut(here), IDLE_MS)
    trim(KEPT_SESSIONS)
  }

  /** Jean's result for a call a CLI made, now or once it comes. @param {Session} session @param {string} id @param {object} given */
  function give(session, id, given) {
    const waiting = session.waiting.get(id)
    if (waiting) waiting(given)
    else session.given.set(id, given)
    session.waiting.delete(id)
  }

  // ─── ChatGPT (D262) ─────────────────────────────────────────────────────────
  // The user's ChatGPT plan, through Sign in with ChatGPT for open-source apps: Jean registers as itself
  // the first time (its name the user can change), through the user's browser, which comes back here, at
  // 127.0.0.1, then to Jean. Its tokens never leave this computer, kept in a file of the user's own (home),
  // renewed here; Jean's Chat Completions requests go to the Responses API with them.

  const file = join(home, 'chatgpt.json')
  /** Sign-ins under way, by their state. @type {Map<string, { verifier: string, nonce: string, client: string, issuer: string, api: string, config: any, back: string, at: number }>} */
  const attempts = new Map()
  /** @type {Map<string, Promise<any>>} */
  const configs = new Map()
  /** @type {Promise<Signed> | null} */
  let renewing = null

  /** @returns {Promise<Signed>} */
  const load = () => readFile(file, 'utf8').then((text) => JSON.parse(text), () => null).then((saved) => (saved?.format === 1 ? saved : { format: 1, host: '' }))
  /** Written whole, then put in place; for the user's eyes only. @param {Signed} signed */
  async function save(signed) {
    await mkdir(home, { recursive: true, mode: 0o700 })
    const written = `${file}.${randomUUID()}`
    await writeFile(written, `${JSON.stringify(signed, null, 2)}\n`, { mode: 0o600 })
    await rename(written, file)
  }
  /** What a sign-out keeps: this computer's id, and the registration, for the next sign-in. @param {Signed} signed @returns {Signed} */
  const kept = ({ format, host, issuer, api, client, sub, email }) => ({ format, host, issuer, api, client, sub, email })
  /** An issuer's addresses, from its OpenID configuration. @param {string} issuer */
  const discover = (issuer) => {
    if (!configs.has(issuer)) configs.set(issuer, fetch(`${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`).then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))))
    const config = /** @type {Promise<any>} */ (configs.get(issuer))
    config.catch(() => configs.delete(issuer))
    return config
  }
  /** @param {string} url @param {Record<string, string>} fields */
  const form = (url, fields) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(fields) })

  /**
   * The address that signs in: a new registration the first time, named after Jean, else the one this
   * account has, asking again for the plan's use only after the user declined it. Back must be Jean's.
   * @param {{ name?: string, issuer?: string, api?: string, back?: string }} asked
   */
  async function signIn({ name = '', issuer = '', api = '', back = '' }) {
    if (!origins.includes(new URL(back).origin)) throw new Error('Signing in comes back to Jean only.')
    const config = await discover(issuer)
    const saved = await load()
    const host = saved.host || `urn:uuid:${randomUUID()}`
    if (!saved.host) await save({ ...saved, host })
    const client = saved.issuer === issuer && saved.client ? saved.client : ''
    const [verifier, state, nonce] = [32, 16, 16].map((size) => randomBytes(size).toString('base64url'))
    for (const [old, attempt] of attempts) if (Date.now() - attempt.at > SIGN_IN_MS) attempts.delete(old)
    attempts.set(state, { verifier, nonce, client, issuer, api, config, back, at: Date.now() })
    const query = new URLSearchParams({
      client_id: client || 'dynamic_agent_client',
      ...(client ? { ...(saved.idToken && { id_token_hint: saved.idToken }), ...(saved.email && { login_hint: saved.email }), ...(!saved.scopes?.includes(PLAN_SCOPE) && saved.scopes && { prompt: 'consent' }) } : { agent_name_hint: name }),
      ext_agent_host_id: host, response_type: 'code', redirect_uri: `http://127.0.0.1:${port}${CALLBACK}`, scope: SCOPES, resource: api,
      state, nonce, code_challenge_method: 'S256', code_challenge: digest(verifier).toString('base64url'),
    })
    return `${config.authorization_endpoint}?${query}`
  }

  /**
   * The browser back from signing in: the code exchanged, the ID token checked (signature, issuer,
   * audience, time, nonce, the same account as before), the tokens kept when the plan's use was given;
   * then back to Jean, saying how it went. @param {URL} url @param {import('node:http').ServerResponse} res
   */
  async function callback(url, res) {
    const params = url.searchParams
    const attempt = attempts.get(params.get('state') ?? '')
    if (!attempt) return res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('This sign-in has ended: start it again from Jean.')
    attempts.delete(params.get('state') ?? '')
    const outcome = await (async () => {
      if (params.get('error')) return params.get('error') === 'access_denied' ? 'declined' : 'failed'
      const given = params.get('client_id')
      const client = attempt.client || given || ''
      if (!client || (attempt.client && given && given !== attempt.client)) return 'failed'
      const res = await form(attempt.config.token_endpoint, { grant_type: 'authorization_code', client_id: client, code: params.get('code') ?? '', code_verifier: attempt.verifier, redirect_uri: `http://127.0.0.1:${port}${CALLBACK}`, resource: attempt.api })
      const tokens = res.ok ? await res.json() : null
      const claims = tokens && await checked(tokens.id_token, attempt, client)
      const saved = await load()
      if (!claims || (attempt.client && saved.sub && claims.sub !== saved.sub)) return 'failed'
      const scopes = String(tokens.scope ?? '').split(' ').filter(Boolean)
      const plan = scopes.includes(PLAN_SCOPE)
      await save({ ...kept(saved), host: saved.host, issuer: attempt.issuer, api: attempt.api, client, sub: claims.sub, email: claims.email, idToken: tokens.id_token, scopes,
        ...(plan && { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + Number(tokens.expires_in ?? 3600) * 1000 }) })
      return plan ? 'signed-in' : 'declined'
    })().catch(() => 'failed')
    const to = new URL(attempt.back)
    to.searchParams.set('chatgpt', outcome)
    res.writeHead(302, { location: to.href, 'cache-control': 'no-store' }).end()
  }

  /** An ID token's claims, when its issuer signed it for this registration and this attempt, and it holds. @param {string} token @param {{ config: any, nonce: string }} attempt @param {string} client */
  async function checked(token, { config, nonce }, client) {
    const { head, claims, signed, signature } = jwt(token)
    const { keys = [] } = await (await fetch(config.jwks_uri)).json()
    const jwk = keys.find((/** @type {any} */ each) => each.kid === head.kid)
    if (head.alg !== 'RS256' || !jwk || !verify('RSA-SHA256', signed, createPublicKey({ key: jwk, format: 'jwk' }), signature)) return null
    return claims.iss === config.issuer && [claims.aud].flat().includes(client) && claims.exp * 1000 > Date.now() && claims.nonce === nonce ? claims : null
  }

  /** The sign-in with fresh tokens, renewed shortly before they end, one renewal at a time; signed out when its renewal is refused. */
  async function fresh() {
    const saved = await load()
    if (!saved.refreshToken || (saved.expiresAt ?? 0) - Date.now() > RENEW_MS) return saved
    return (renewing ??= (async () => {
      const config = await discover(String(saved.issuer))
      const res = await form(config.token_endpoint, { grant_type: 'refresh_token', client_id: String(saved.client), refresh_token: String(saved.refreshToken), resource: String(saved.api) })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        const next = { ...saved, accessToken: json.access_token, refreshToken: json.refresh_token ?? saved.refreshToken, expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000, ...(json.scope && { scopes: json.scope.split(' ') }) }
        await save(next)
        return next
      }
      if (res.status !== 400 && res.status !== 401) return saved
      await save({ ...kept(saved), idToken: saved.idToken, scopes: saved.scopes })
      return load()
    })().finally(() => { renewing = null }))
  }

  /** Signs out: the renewable session revoked at ChatGPT, if it can be, and the tokens gone; the registration kept. */
  async function signOut() {
    const saved = await load()
    const config = saved.refreshToken && saved.issuer ? await discover(saved.issuer).catch(() => null) : null
    if (config?.revocation_endpoint) await form(config.revocation_endpoint, { token: String(saved.refreshToken), token_type_hint: 'refresh_token', client_id: String(saved.client) }).catch(() => {})
    if (saved.host) await save(kept(saved))
  }

  /**
   * Jean's request to a ChatGPT plan: models listed, or an answer streamed as Chat Completions chunks;
   * an error as ChatGPT gave it, with the status Jean reads it by.
   * @param {string} path @param {any} body @param {import('node:http').ServerResponse} res @param {AbortSignal} signal
   */
  async function chatgpt(path, body, res, signal) {
    const signed = await fresh().catch(() => null)
    const json = (/** @type {number} */ status, /** @type {object} */ data) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (!signed?.accessToken) return json(401, { error: { message: 'Not signed in to ChatGPT.' } })
    const models = path.endsWith('/models')
    const ask = (/** @type {object} */ asked) => fetch(`${signed.api}${models ? '/models' : '/responses'}`, {
      method: models ? 'GET' : 'POST', signal, headers: { authorization: `Bearer ${signed.accessToken}`, ...(!models && { 'content-type': 'application/json', accept: 'text/event-stream' }) },
      ...(!models && { body: JSON.stringify(asked) }),
    }).catch(() => null)
    const asked = models ? {} : responsesRequest(body)
    let upstream = await ask(asked)
    // A model or an account that refuses reasoning, or summaries of it, answers without them.
    if (!models && upstream?.status === 400 && /reason|summar/i.test(await upstream.clone().text())) upstream = await ask({ ...asked, reasoning: undefined })
    if (!upstream) return signal.aborted ? res.end() : json(502, { error: { message: 'ChatGPT could not be reached.' } })
    if (!upstream.ok) {
      const text = await upstream.text()
      const error = (() => { try { return JSON.parse(text) } catch { return {} } })()
      return json(PLAN_ERRORS[error.error?.code] ?? upstream.status, { error: { message: String(error.error?.message ?? error.detail ?? text.slice(0, 200)), code: error.error?.code } })
    }
    if (models) {
      const listed = await upstream.json()
      // Its catalogue for this account, in its order, as it is meant to be shown.
      return json(200, { data: listed.data ?? (listed.models ?? []).filter((/** @type {any} */ model) => model.visibility === 'list').map((/** @type {any} */ model) => ({ id: model.slug, name: model.display_name })) })
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const calls = new Map()
    try {
      for await (const data of dataOf(/** @type {ReadableStream<Uint8Array>} */ (upstream.body))) {
        const chunk = chunkOf((() => { try { return JSON.parse(data) } catch { return {} } })(), calls)
        if (chunk) res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
    } catch {}
    res.end('data: [DONE]\n\n')
  }

  /** Whether the bridge is signed in to ChatGPT with the use of its plan. */
  const planned = async () => Boolean((await load()).refreshToken && (await load()).scopes?.includes(PLAN_SCOPE))

  /** @param {Ran} ran */
  function report(ran) {
    const parts = [`Exit code: ${ran.exit}`, ran.stdout, ran.stderr && `stderr:\n${ran.stderr}`]
    if (ran.serving) parts.push(`Still running in the background, serving ${ran.serving.addresses.join(', ')} (process group ${ran.serving.group}; kill -- -${ran.serving.group} stops it). Its output goes on in ${ran.serving.log}.`)
    return parts.filter(Boolean).join('\n\n')
  }

  /**
   * The answer to a JSON-RPC request; undefined for a notification. To a conversation's Claude Code, its tools are Jean's.
   * @param {any} message @param {AbortSignal} signal @param {Session} [session]
   */
  async function answer(message, signal, session) {
    const { id, method, params } = message ?? {}
    if (id === undefined || id === null) return undefined
    const result = await (async () => {
      if (method === 'initialize') return { protocolVersion: params?.protocolVersion ?? LEGACY, capabilities: { tools: {} }, serverInfo: { name: 'jean-bridge', version: VERSION } }
      if (method === 'ping') return {}
      if (session) return method === 'tools/list' ? { tools: session.tools } : method === 'tools/call' ? session.call(params) : null
      if (method === 'tools/list') return { tools: TOOLS }
      if (method === 'tools/call' && params?.name === 'about') {
        const about = { version: VERSION, folder: basename(real), path: real, os: platform(), node: process.version, serving: [...serving].map(([group, job]) => ({ group, ...job })), browser: Boolean(browserProgram),
          ...(params.arguments?.claude && { claude: await signedIn() }),
          ...(params.arguments?.copilot && { copilot: await copilotHere().then((found) => (found ? true : found)) }),
          ...(params.arguments?.chatgpt && { chatgpt: await planned() }) }
        return { content: [{ type: 'text', text: JSON.stringify(about) }], structuredContent: about }
      }
      if (method === 'tools/call' && params?.name === 'chatgpt') {
        if (params.arguments?.out) return signOut().then(() => ({ content: [{ type: 'text', text: 'Signed out of ChatGPT.' }] }))
        return signIn(params.arguments ?? {}).then((url) => ({ content: [{ type: 'text', text: url }], structuredContent: { url } }),
          (error) => ({ content: [{ type: 'text', text: String(error?.message ?? error) }], isError: true }))
      }
      if (method === 'tools/call' && params?.name === 'bash') {
        const args = params.arguments ?? {}
        if (typeof args.command !== 'string') return { content: [{ type: 'text', text: 'A command is needed.' }], isError: true }
        const ran = await run(args.command, { computer: String(args.computer ?? ''), timeMs: Number(args.timeMs) || undefined, signal })
        return { content: [{ type: 'text', text: report(ran) }], structuredContent: ran }
      }
      if (method === 'tools/call' && params?.name === 'browser') {
        return drive(params.arguments ?? {}).then((shown) => ({ content: [{ type: 'text', text: [shown.title, shown.url, ...shown.said, shown.text].filter(Boolean).join('\n') }], structuredContent: shown }),
          (error) => ({ content: [{ type: 'text', text: String(error?.message ?? error) }], isError: true }))
      }
      return null
    })()
    return result ? { jsonrpc: '2.0', id, result } : { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown: ${method} ${params?.name ?? ''}`.trim() } }
  }

  /**
   * An HTTP request: from this computer, by its own name; from Jean's origin, or no browser's; with the key,
   * which a brain's request sends as Anthropic's (D235). MCP at /, a CLI's own at /session/<id>; Messages for Claude Code at /v1,
   * for Copilot at /copilot/v1; Chat Completions for ChatGPT at /chatgpt/v1, whose sign-in comes back at /auth/callback with no key.
   * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
   */
  async function handle(req, res) {
    const origin = req.headers.origin
    if (!new Set([`127.0.0.1:${port}`, `localhost:${port}`]).has(req.headers.host ?? '') || (origin && !origins.includes(origin))) return res.writeHead(403).end()
    if (origin) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('vary', 'origin')
    }
    if (req.method === 'OPTIONS') {
      return res.writeHead(204, {
        'access-control-allow-methods': 'GET, POST',
        'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '',
        'access-control-max-age': '600',
        ...(req.headers['access-control-request-private-network'] && { 'access-control-allow-private-network': 'true' }),
      }).end()
    }
    const url = new URL(req.url ?? '/', 'http://bridge')
    const path = url.pathname
    // The browser back from ChatGPT's sign-in, with no key: the state of a sign-in under way stands for it.
    if (req.method === 'GET' && path === CALLBACK) return callback(url, res)
    const apiKey = req.headers['x-api-key']
    const given = digest(apiKey ? `Bearer ${apiKey}` : String(req.headers.authorization ?? ''))
    if (!timingSafeEqual(given, expected)) return res.writeHead(401).end()
    // A request the client gave up on (Stop, Ctrl+C in Jean's terminal) ends what it started.
    const gone = new AbortController()
    res.on('close', () => { if (!res.writableFinished) gone.abort() })
    const json = (/** @type {number} */ status, /** @type {object} */ data) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (req.method === 'GET' && path === '/v1/models') return json(200, { data: MODELS })
    if (req.method === 'GET' && path === '/copilot/v1/models') {
      const found = await copilotHere()
      return found ? json(200, { data: found }) : json(401, { error: { message: 'Copilot is not installed or signed in on this computer.' } })
    }
    if (req.method === 'GET' && path === '/chatgpt/v1/models') return chatgpt(path, null, res, gone.signal)
    if (req.method === 'GET' && path === '/browser/screen') return watch(res)
    if (req.method !== 'POST') return res.writeHead(405, { allow: 'POST' }).end()
    const session = path.startsWith('/session/') ? sessions.get(path.slice('/session/'.length)) : undefined
    if (path.startsWith('/session/') && !session) return res.writeHead(404).end()
    let body = ''
    for await (const chunk of req) if ((body += chunk).length > BODY) return res.writeHead(413).end()
    const message = (() => { try { return JSON.parse(body) } catch { return null } })()
    if (!message) return res.writeHead(400).end()
    if (path === '/v1/messages' || path === '/copilot/v1/messages') return converse(path === '/v1/messages' ? 'claude' : 'copilot', message, res, gone.signal)
    if (path === '/chatgpt/v1/chat/completions') return chatgpt(path, message, res, gone.signal)
    const reply = await answer(message, gone.signal, session)
    if (!reply) return res.writeHead(202).end()
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(reply))
  }

  /** Ends what still runs, and the link. */
  async function close() {
    for (const group of groups) end(group)
    for (const session of sessions.values()) shut(session)
    // The browser closed as a person closes it, so it writes what it holds first, a sign-in's cookies among it; killed outright if it
    // hasn't within 5 s, since a signal only starts a shutdown it may never finish; and gone before its profile's folder may be.
    await started?.then((b) => b.child.exitCode === null && new Promise((done) => {
      b.child.once('exit', done)
      b.send('Browser.close').catch(() => b.child.kill('SIGKILL'))
      setTimeout(() => b.child.kill('SIGKILL'), 5000).unref()
    }), () => {})
    await rm(temp, { recursive: true, force: true })
  }

  return { handle, run, close, folder: real }
}

/** @param {string[]} argv */
export async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { port: { type: 'string' }, origin: { type: 'string', multiple: true }, folder: { type: 'string' }, attached: { type: 'boolean' } } })
  const port = Number(values.port)
  const key = process.env.JEAN_BRIDGE_KEY
  delete process.env.JEAN_BRIDGE_KEY
  if (!port || !key || !values.origin?.length) throw new Error('The line from Jean is needed: its key, --port and --origin.')
  if (platform() === 'win32') throw new Error('The bridge needs bash: on Windows, run it in WSL.')
  // The browser it drives, when it isn't one of those it looks for, or not where they usually are; empty, none (D746).
  const browser = process.env.JEAN_BROWSER === undefined ? undefined : [process.env.JEAN_BROWSER]
  const work = await bridge({ folder: resolve(values.folder ?? process.cwd()), origins: values.origin, key, port, browser })
  const server = createServer((req, res) => work.handle(req, res).catch((error) => { if (!res.headersSent) res.writeHead(500).end(String(error?.message ?? error)) }))
  await new Promise((ready, failed) => server.once('error', failed).listen(port, '127.0.0.1', () => ready(undefined)))
  console.log(`Jean runs commands in ${work.folder} on this computer, while this runs. Ctrl+C stops it, and what it started.`)
  const stop = async () => {
    server.close()
    await work.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  process.on('SIGHUP', stop)
  // Started by the desktop app: its input ends when the app quits, or stops it.
  if (values.attached) process.stdin.on('end', stop).on('error', stop).resume()
}

// Run as a program: by its path, from stdin, or from a data: address.
const program = !import.meta.url.startsWith('file:') || /\[\w+\]$/.test(import.meta.url) || import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (program) {
  main(process.argv.slice(process.argv[1] === '-' ? 2 : process.argv[1]?.startsWith('-') ? 1 : 2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
