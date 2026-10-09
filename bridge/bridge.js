// The bridge (D198): this computer, for Jean. The user runs it in a terminal, in the folder a
// conversation has, with the line Settings › Computer gives; the Computer's commands then run here,
// on the user's own machine, in that folder, with its real programs and ports: `npm run dev` serves,
// and Jean's browser shows it. It speaks MCP (Streamable HTTP, answered as JSON) on 127.0.0.1 only,
// to Jean's origin only, with the key in the line. /workspace in a command is that folder, as on
// Jean's own computer, through a link in a temporary folder. Each command runs in a process group
// of its own; one still serving when it has printed a local address and gone quiet keeps running,
// its output going on in a log, until the user stops the bridge (Ctrl+C), which ends them all.
// Jean's desktop app starts it itself, `--attached`: it ends when the app does, its input closing.
// It also lets the user's own Claude Code answer as a brain, with their Claude plan (D235): see claude().
//
//   curl -fsSL <jean>/bridge/bridge.js | node --input-type=module - --port <port> --origin <jean> --key <key>
//
// No dependencies; Node 20 or later; macOS or Linux, with bash.
import { createServer } from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const VERSION = '2'
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
    description: 'This computer: the folder the bridge runs in, the system, and what runs in the background; with claude, whether Claude Code is here and signed in.',
    inputSchema: { type: 'object', properties: { claude: { type: 'boolean' } } },
    annotations: { readOnlyHint: true },
  },
]

// Claude Code's names for the latest of each, which it keeps current: Auto's tiers, in order.
const MODELS = ['haiku', 'sonnet', 'opus'].map((id) => ({ id, display_name: id[0].toUpperCase() + id.slice(1) }))
// A conversation's Claude Code ends after this long without a request, and the oldest beyond this many.
const IDLE_MS = 30 * 60_000
const KEPT_SESSIONS = 8
// Claude Code's errors, as Anthropic's: Jean words them the same (a 402 is out of credits).
const FAILURES = /** @type {Record<string, object>} */ ({
  authentication_failed: { type: 'authentication_error' }, billing_error: { type: 'billing_error', code: 402 },
  rate_limit: { type: 'rate_limit_error' }, invalid_request: { type: 'invalid_request_error' },
})
// The brain's own web search, which Claude Code can't lend: Jean's search runs in its place.
const SEARCH = { name: 'web_search', description: 'Search the web for facts the conversation does not hold. Results are numbered sources to cite.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }

/**
 * @typedef {{ folder: string, origins: string[], key: string, port: number, claude?: string[] }} Options claude: how Claude Code runs
 * @typedef {{ exit: number, stdout: string, stderr: string, cwd: string, serving?: { group: number, addresses: string[], log: string } }} Ran
 * @typedef {{ role: string, content: any[] }} Turn
 * @typedef {{ id: string, child: import('node:child_process').ChildProcessWithoutNullStreams, lines: AsyncIterator<string>, tools: object[],
 *   count: number, seen: string, asked: { id: string, name: string, called?: boolean }[], given: Map<string, object>, waiting: Map<string, (result: object) => void>, stderr: string, idle?: NodeJS.Timeout }} Session
 *   count and seen: the turns it has had, and their mark; asked: the tool calls of its last step
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

/** A tool's result from Jean, as MCP's, with whatever else its turn brought (system notes) after it. @param {any} block @param {any[]} more */
function result(block, more) {
  const content = [...(typeof block.content === 'string' ? [{ type: 'text', text: block.content }] : block.content ?? []), ...more]
    .flatMap((part) => (part.type === 'text' ? [{ type: 'text', text: part.text }] : part.type === 'image' && part.source?.data ? [{ type: 'image', data: part.source.data, mimeType: part.source.media_type }] : []))
  return { content, ...(block.is_error && { isError: true }) }
}

/**
 * The bridge's work, apart from its server: answers MCP's messages, runs commands, ends what runs.
 * @param {Options} options
 */
export async function bridge({ folder, origins, key, port, claude: [program, ...before] = ['claude'] }) {
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

  // ─── Claude Code (D235) ────────────────────────────────────────────────────
  // The user's own Claude Code, signed in with their Claude plan through Anthropic's own sign-in, answers
  // Jean's Messages requests as an Anthropic brain would: a conversation runs in one `claude -p` with no
  // tools of its own, only Jean's, offered back to it over MCP at /claude/<its id>. A step that calls them
  // ends the request; Claude Code's calls wait for the results Jean's next request brings, and its next
  // message goes on in the same process. Any other history starts one afresh, its earlier turns told.
  // The sign-in stays Claude Code's: the bridge never reads it.

  /** @type {Map<string, Session>} */
  const sessions = new Map()

  /** Whether Claude Code is on this computer and signed in; null when it isn't here. @returns {Promise<boolean | null>} */
  const signedIn = () => new Promise((done) => execFile(program, [...before, 'auth', 'status', '--json'], { timeout: 15_000 }, (_, stdout) => {
    try { done(Boolean(JSON.parse(stdout).loggedIn)) } catch { done(null) }
  }))

  /** @param {Session} session */
  function shut(session) {
    clearTimeout(session.idle)
    session.child.kill()
    sessions.delete(session.id)
  }

  /** A conversation's Claude Code: Jean's prompt as its own, Jean's tools its only ones, nothing of the user's settings or sessions. @param {string} model @param {string} system @param {object[]} tools */
  function open(model, system, tools) {
    if (sessions.size >= KEPT_SESSIONS) shut(/** @type {Session} */ (sessions.values().next().value))
    const id = randomUUID()
    const mcp = { mcpServers: { jean: { type: 'http', url: `http://127.0.0.1:${port}/claude/${id}`, headers: { authorization: `Bearer ${key}` } } } }
    const child = spawn(program, [...before, '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--model', model, '--system-prompt', system, '--tools', '', '--strict-mcp-config', '--mcp-config', JSON.stringify(mcp), '--allowedTools', 'mcp__jean',
      '--setting-sources', '', '--disable-slash-commands', '--no-session-persistence'], { cwd: temp, env: { ...process.env, MCP_TOOL_TIMEOUT: String(24 * 3_600_000) } })
    /** @type {Session} */
    const session = { id, child, lines: createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator](), tools, count: 0, seen: '', asked: [], given: new Map(), waiting: new Map(), stderr: '' }
    child.stderr.on('data', (chunk) => { session.stderr = (session.stderr + chunk).slice(-2000) })
    child.on('error', (error) => { session.stderr = error.message })
    child.stdin.on('error', () => {})
    sessions.set(id, session)
    return session
  }

  /** Jean's result for a call Claude Code made, now or once it comes. @param {Session} session @param {string} id @param {object} given */
  function give(session, id, given) {
    const waiting = session.waiting.get(id)
    if (waiting) waiting(given)
    else session.given.set(id, given)
    session.waiting.delete(id)
  }

  /**
   * A call of Claude Code's to one of Jean's tools: answered with Jean's result for it. It names its tool
   * use, or else is the first of its step by that name. @param {Session} session @param {any} params
   */
  function called(session, params) {
    const named = params?._meta?.['claudecode/toolUseId']
    const call = session.asked.find((each) => (named ? each.id === named : each.name === params?.name && !each.called))
    if (call) call.called = true
    const id = String(named ?? call?.id ?? '')
    const given = session.given.get(id)
    session.given.delete(id)
    return given ?? new Promise((answered) => session.waiting.set(id, answered))
  }

  /**
   * A Messages request: the step that follows its history, streamed as Anthropic's events. The
   * conversation the last request left goes on in its process; any other starts one.
   * @param {any} body @param {import('node:http').ServerResponse} res @param {AbortSignal} signal
   */
  async function converse(body, res, signal) {
    // Warming the cache ahead (D49) is Claude Code's own matter.
    if (!body.stream) return res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    const history = turns(body.messages ?? [])
    const last = history.at(-1)
    if (last?.role !== 'user') return res.writeHead(400).end()
    const system = [body.system ?? []].flat().map((part) => part?.text ?? String(part)).join('\n\n')
    const tools = (body.tools ?? []).map((/** @type {any} */ tool) => (tool.type?.startsWith('web_search') ? SEARCH : { name: tool.name, description: tool.description, inputSchema: tool.input_schema }))
    const mark = (/** @type {Turn[]} */ upTo) => digest(JSON.stringify([body.model, system, tools, upTo.filter((turn) => turn.role === 'user')])).toString('hex')
    const results = last.content.filter((block) => block.type === 'tool_result')
    // Its process goes on when this request brings exactly what it waits for: the results of its calls, or the next message.
    const answers = (/** @type {Session} */ each) => (results.length ? results.every((block) => each.asked.some((call) => call.id === block.tool_use_id)) : !each.asked.length)
    let session = [...sessions.values()].find((each) => each.count === history.length - 2 && each.seen === mark(history.slice(0, each.count)) && answers(each))
    if (session && results.length) {
      const more = last.content.filter((block) => block.type !== 'tool_result')
      results.forEach((block, i) => give(/** @type {Session} */ (session), block.tool_use_id, result(block, i === results.length - 1 ? more : [])))
    } else {
      if (!session) session = open(String(body.model), system, tools)
      const tail = results.length ? [{ type: 'text', text: 'Go on from there.' }] : last.content
      const content = session.count || history.length === 1 ? tail : [{ type: 'text', text: told(results.length ? history : history.slice(0, -1)) }, ...tail]
      session.child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null })}\n`)
    }
    const here = session
    clearTimeout(here.idle)
    here.count = history.length
    here.seen = mark(history)
    here.asked = []
    // Stopped in Jean: the step ends, and its process with it.
    const stop = () => shut(here)
    signal.addEventListener('abort', stop, { once: true })
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    let failure = ''
    for (;;) {
      const { value, done } = await here.lines.next()
      if (signal.aborted) break
      const line = done ? null : (() => { try { return JSON.parse(value) } catch { return {} } })()
      if (line?.type === 'assistant' && line.error) failure = line.error
      if (!line || (line.type === 'result' && line.is_error)) {
        const message = line?.result || here.stderr.trim() || 'Claude Code stopped.'
        res.end(sse('error', { type: 'error', error: { type: 'api_error', ...FAILURES[failure], message } }))
        shut(here)
        break
      }
      if (line.type !== 'stream_event') continue
      const event = line.event
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        event.content_block.name = String(event.content_block.name).replace(/^mcp__jean__/, '')
        here.asked.push(event.content_block)
      }
      res.write(sse(event.type, event))
      if (event.type === 'message_stop') {
        res.end()
        here.idle = setTimeout(() => shut(here), IDLE_MS)
        break
      }
    }
    signal.removeEventListener('abort', stop)
  }

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
      if (session) return method === 'tools/list' ? { tools: session.tools } : method === 'tools/call' ? called(session, params) : null
      if (method === 'tools/list') return { tools: TOOLS }
      if (method === 'tools/call' && params?.name === 'about') {
        const about = { version: VERSION, folder: basename(real), path: real, os: platform(), node: process.version, serving: [...serving].map(([group, job]) => ({ group, ...job })),
          ...(params.arguments?.claude && { claude: await signedIn() }) }
        return { content: [{ type: 'text', text: JSON.stringify(about) }], structuredContent: about }
      }
      if (method === 'tools/call' && params?.name === 'bash') {
        const args = params.arguments ?? {}
        if (typeof args.command !== 'string') return { content: [{ type: 'text', text: 'A command is needed.' }], isError: true }
        const ran = await run(args.command, { computer: String(args.computer ?? ''), timeMs: Number(args.timeMs) || undefined, signal })
        return { content: [{ type: 'text', text: report(ran) }], structuredContent: ran }
      }
      return null
    })()
    return result ? { jsonrpc: '2.0', id, result } : { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown: ${method} ${params?.name ?? ''}`.trim() } }
  }

  /**
   * An HTTP request: from this computer, by its own name; from Jean's origin, or no browser's; with the key,
   * which a brain's request sends as Anthropic's (D235). MCP at /, Claude Code's own at /claude/<id>, Messages at /v1.
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
    const apiKey = req.headers['x-api-key']
    const given = digest(apiKey ? `Bearer ${apiKey}` : String(req.headers.authorization ?? ''))
    if (!timingSafeEqual(given, expected)) return res.writeHead(401).end()
    const path = new URL(req.url ?? '/', 'http://bridge').pathname
    if (req.method === 'GET' && path === '/v1/models') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: MODELS }))
    if (req.method !== 'POST') return res.writeHead(405, { allow: 'POST' }).end()
    const session = path.startsWith('/claude/') ? sessions.get(path.slice('/claude/'.length)) : undefined
    if (path.startsWith('/claude/') && !session) return res.writeHead(404).end()
    let body = ''
    for await (const chunk of req) if ((body += chunk).length > BODY) return res.writeHead(413).end()
    // A request the client gave up on (Stop, Ctrl+C in Jean's terminal) ends its command.
    const gone = new AbortController()
    res.on('close', () => { if (!res.writableFinished) gone.abort() })
    const message = (() => { try { return JSON.parse(body) } catch { return null } })()
    if (!message) return res.writeHead(400).end()
    if (path === '/v1/messages') return converse(message, res, gone.signal)
    const reply = await answer(message, gone.signal, session)
    if (!reply) return res.writeHead(202).end()
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(reply))
  }

  /** Ends what still runs, and the link. */
  async function close() {
    for (const group of groups) end(group)
    for (const session of sessions.values()) shut(session)
    await rm(temp, { recursive: true, force: true })
  }

  return { handle, run, close, folder: real }
}

/** @param {string[]} argv */
export async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { port: { type: 'string' }, origin: { type: 'string', multiple: true }, key: { type: 'string' }, folder: { type: 'string' }, attached: { type: 'boolean' } } })
  const port = Number(values.port)
  if (!port || !values.key || !values.origin?.length) throw new Error('The line from Jean is needed: --port, --origin and --key.')
  if (platform() === 'win32') throw new Error('The bridge needs bash: on Windows, run it in WSL.')
  const work = await bridge({ folder: resolve(values.folder ?? process.cwd()), origins: values.origin, key: values.key, port })
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
