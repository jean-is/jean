// The bridge (D198): this computer, for Jean. The user runs it in a terminal, in the folder a
// conversation has, with the line Settings › Computer gives; the Computer's commands then run here,
// on the user's own machine, in that folder, with its real programs and ports: `npm run dev` serves,
// and Jean's browser shows it. It speaks MCP (Streamable HTTP, answered as JSON) on 127.0.0.1 only,
// to Jean's origin only, with the key in the line. /workspace in a command is that folder, as on
// Jean's own computer, through a link in a temporary folder. Each command runs in a process group
// of its own; one still serving when it has printed a local address and gone quiet keeps running,
// its output going on in a log, until the user stops the bridge (Ctrl+C), which ends them all.
// Jean's desktop app starts it itself, `--attached`: it ends when the app does, its input closing.
//
//   curl -fsSL <jean>/bridge/bridge.js | node --input-type=module - --port <port> --origin <jean> --key <key>
//
// No dependencies; Node 20 or later; macOS or Linux, with bash.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createHash, timingSafeEqual } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const VERSION = '1'
const LEGACY = '2025-11-25'
// What a command's output keeps, from its end; a request's body at most.
const KEPT = 1_000_000
const BODY = 1_000_000
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
    description: 'This computer: the folder the bridge runs in, the system, and what runs in the background.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
]

/**
 * @typedef {{ folder: string, origins: string[], key: string, port: number }} Options
 * @typedef {{ exit: number, stdout: string, stderr: string, cwd: string, serving?: { group: number, addresses: string[], log: string } }} Ran
 */

/** @param {string} text */
const digest = (text) => createHash('sha256').update(text).digest()

/**
 * The bridge's work, apart from its server: answers MCP's messages, runs commands, ends what runs.
 * @param {Options} options
 */
export async function bridge({ folder, origins, key, port }) {
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

  /** @param {Ran} ran */
  function report(ran) {
    const parts = [`Exit code: ${ran.exit}`, ran.stdout, ran.stderr && `stderr:\n${ran.stderr}`]
    if (ran.serving) parts.push(`Still running in the background, serving ${ran.serving.addresses.join(', ')} (process group ${ran.serving.group}; kill -- -${ran.serving.group} stops it). Its output goes on in ${ran.serving.log}.`)
    return parts.filter(Boolean).join('\n\n')
  }

  /**
   * The answer to a JSON-RPC request; undefined for a notification.
   * @param {any} message @param {AbortSignal} signal
   */
  async function answer(message, signal) {
    const { id, method, params } = message ?? {}
    if (id === undefined || id === null) return undefined
    const result = await (async () => {
      if (method === 'initialize') return { protocolVersion: params?.protocolVersion ?? LEGACY, capabilities: { tools: {} }, serverInfo: { name: 'jean-bridge', version: VERSION } }
      if (method === 'ping') return {}
      if (method === 'tools/list') return { tools: TOOLS }
      if (method === 'tools/call' && params?.name === 'about') {
        const about = { folder: basename(real), path: real, os: platform(), node: process.version, serving: [...serving].map(([group, job]) => ({ group, ...job })) }
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
   * An HTTP request: from this computer, by its own name; from Jean's origin, or no browser's; with the key.
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
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '',
        'access-control-max-age': '600',
        ...(req.headers['access-control-request-private-network'] && { 'access-control-allow-private-network': 'true' }),
      }).end()
    }
    const given = digest(String(req.headers.authorization ?? ''))
    if (!timingSafeEqual(given, expected)) return res.writeHead(401).end()
    if (req.method !== 'POST') return res.writeHead(405, { allow: 'POST' }).end()
    let body = ''
    for await (const chunk of req) if ((body += chunk).length > BODY) return res.writeHead(413).end()
    // A request the client gave up on (Stop, Ctrl+C in Jean's terminal) ends its command.
    const gone = new AbortController()
    res.on('close', () => { if (!res.writableFinished) gone.abort() })
    const message = (() => { try { return JSON.parse(body) } catch { return null } })()
    if (!message) return res.writeHead(400).end()
    const reply = await answer(message, gone.signal)
    if (!reply) return res.writeHead(202).end()
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(reply))
  }

  /** Ends what still runs, and the link. */
  async function close() {
    for (const group of groups) end(group)
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
