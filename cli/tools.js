// What Jean can do from an editor: the editor's folder, worked on where it is with the Folders
// capability's tools (caps/folders/work.js); commands in the editor's own terminal; memory, skills
// and shared files as in the browser; and the tools of the services the editor connects, found with
// find_tools as Connections' are (D47). A change or a command is asked first, its diff or command
// shown, unless the user always allows it in that folder, as on This computer (D198).
import { spawn } from 'node:child_process'
import { basename, sep } from 'node:path'
import { SPECS, USE, findInFolder, lastRead, listingText, openText, planChange, topLevel, walkFolder } from '../app/caps/folders/work.js'
import { mcpClient, LEGACY } from '../app/caps/connections/mcp.js'
import { recallTool } from '../app/caps/memory/recall.js'
import { peer, RpcError } from './rpc.js'
import { changeMemory, memoryText, oneLine, parseMemory } from '../app/core/memory.js'
import { listSkills, skillLines, skillSteps } from '../app/core/skills.js'
import { callsIn, linkedFiles } from '../app/core/events.js'
import { readTool } from '../app/core/files.js'
import { findTools, identifier } from '../app/core/deferred.js'
import { join } from '../app/core/fs.js'
import { slug } from '../app/core/settings.js'

/** @import { FS, Envelope, ToolCallContent } from '../app/core/types.js' */
/** @import { Tool } from '../app/core/loop.js' */
/** @import { McpTool } from '../app/caps/connections/mcp.js' */

/**
 * What a session's tools work with.
 * @typedef {Object} Room
 * @property {FS} jean              Jean's files: the folder Sync keeps
 * @property {string} dir           the project's folder among them
 * @property {boolean} home         the home project, whose memory and skills are the person's own
 * @property {string} cwd           the editor's folder, an absolute path
 * @property {string} path          the conversation's file
 * @property {FS} folder            it, on disk: listed and searched
 * @property {FS} buffers           it, through the editor where it lets Jean: opened and changed, unsaved changes and all
 * @property {() => Envelope[]} records  the conversation's, this turn's settled ones included
 * @property {Set<string>} always   what the user always allows in this folder: change, bash
 * @property {(name: string) => Promise<void>} trust  keeps that the user always allows it
 * @property {((method: string, params: object, signal?: AbortSignal) => Promise<any>) | null} terminal  the editor's terminals, when it has them
 * @property {(content: object) => void} show  shows content on the call running now, in the editor: a terminal
 * @typedef {{ name: string, listTools: () => Promise<McpTool[]>, callTool: (tool: McpTool, args: any, signal?: AbortSignal) => Promise<any>, close?: () => void }} Server
 */

// What a command may take before it is stopped, and what of its output the brain reads, as on the Computer.
const COMMAND_MS = 120_000
const OUTPUT = 8000
const CLIENT = { name: 'jean-cli', version: '1' }

/** A path the brain gives, absolute or not, inside the editor's folder. @param {string} cwd @param {unknown} path */
const inside = (cwd, path) => {
  const given = String(path ?? '').trim()
  const relative = given === cwd ? '' : given.startsWith(cwd + sep) ? given.slice(cwd.length + 1) : given
  return relative.replace(/^\.?\/+|\/+$/g, '')
}

/** @param {Room} room @returns {Tool[]} */
function folderTools(room) {
  const name = basename(room.cwd)
  const cache = new Map()
  const at = (/** @type {any} */ args) => inside(room.cwd, args?.path)
  /** @param {import('../app/core/loop.js').ToolContext} ctx @param {Record<string, [number, number]>} read */
  const stamp = (ctx, read) => {
    ctx.meta.folder = name
    ctx.meta.read = { ...ctx.meta.read, ...read }
  }
  /** A change against the file as Jean last read it in this conversation (D141). @param {any} args */
  const plan = async (args) => {
    const path = at(args)
    const now = await room.folder.stat?.(path)
    const read = lastRead(callsIn(room.records()), name, path)
    if (now && !read) throw new Error(`Open ${path} before changing it.`)
    if (now && read && (now.size !== read[0] || now.lastModified !== read[1])) throw new Error(`${path} changed since you read it: open it again, then change it.`)
    return planChange(room.buffers, { path, old: String(args?.old ?? ''), new: String(args?.new ?? '') }, { locale: Intl.DateTimeFormat().resolvedOptions().locale })
  }
  /** @param {Awaited<ReturnType<typeof plan>>} change @returns {ToolCallContent} */
  const diff = (change) => ({ type: 'diff', path: change.path, oldText: change.before, newText: change.after })
  return [
    {
      spec: SPECS.list, kind: 'read', title: (args) => `List ${args?.path || 'the folder'}`,
      run: async (args) => listingText(await walkFolder(room.folder, at(args), Number(args?.depth) || Infinity)),
    },
    {
      spec: SPECS.find, kind: 'search', title: (args) => `Find "${args?.text ?? ''}"`,
      run: async (args, ctx) => {
        const found = await findInFolder(room.folder, String(args?.text ?? ''), { path: at(args), cache })
        stamp(ctx, found.read)
        return found.text
      },
    },
    {
      spec: SPECS.open, kind: 'read', title: (args) => `Open ${args?.path ?? ''}`, locations: (args) => [{ path: at(args) }],
      run: async (args, ctx) => {
        const path = at(args)
        const { text, stamp: read } = await openText(room.buffers, path, args?.lines, { cache })
        stamp(ctx, { [path]: [read.size, read.lastModified] })
        return text
      },
    },
    {
      spec: SPECS.change, kind: 'edit', title: (args) => `Change ${args?.path ?? ''}`, locations: (args) => [{ path: at(args) }],
      check: async (args) => ({ ask: !room.always.has('change'), meta: { folder: name }, content: [diff(await plan(args))] }),
      run: async (args, ctx) => {
        const change = await plan(args)
        await room.buffers.writeBytes(change.path, change.bytes)
        const now = await room.folder.stat?.(change.path)
        if (now) stamp(ctx, { [change.path]: [now.size, now.lastModified] })
        ctx.content.push(diff(change))
        if (ctx.answer === 'allow_always') await room.trust('change')
        return `${change.before === null ? 'Made' : 'Changed'} ${change.path}.`
      },
    },
  ]
}

/** Commands, in the editor's terminal, where the user sees them run. @param {Room} room @returns {Tool} */
const bashTool = (room) => ({
  spec: {
    name: 'bash',
    description: "Run a command with bash on the user's computer, in the folder their editor has open, in the editor's terminal, where they see it. The user is asked first. It has two minutes.",
    parameters: { type: 'object', properties: { command: { type: 'string', description: 'The command, or several lines of them' } }, required: ['command'] },
  },
  kind: 'execute',
  title: (args) => `Command: ${String(args?.command ?? '').trim().split('\n')[0].slice(0, 80)}`,
  check: async () => ({ ask: !room.always.has('bash'), meta: { folder: basename(room.cwd) } }),
  run: async (args, ctx) => {
    const terminal = /** @type {NonNullable<Room['terminal']>} */ (room.terminal)
    if (ctx.answer === 'allow_always') await room.trust('bash')
    const { terminalId } = await terminal('terminal/create', { command: 'bash', args: ['-c', String(args?.command ?? '')], cwd: room.cwd, outputByteLimit: 1_000_000 })
    room.show({ type: 'terminal', terminalId })
    try {
      const waited = AbortSignal.any([AbortSignal.timeout(COMMAND_MS), ...(ctx.signal ? [ctx.signal] : [])])
      const exit = await terminal('terminal/wait_for_exit', { terminalId }, waited).catch(async (error) => {
        if (!waited.aborted) throw error
        await terminal('terminal/kill', { terminalId })
        return null
      })
      const { output = '' } = await terminal('terminal/output', { terminalId })
      const kept = output.length > OUTPUT ? `…${output.slice(-OUTPUT)}` : output
      const end = exit ? `Exit code: ${exit.exitCode ?? exit.signal}` : ctx.signal?.aborted ? 'Stopped by the user.' : 'Stopped after two minutes.'
      return `${kept.trimEnd() || '(No output.)'}\n${end}`
    } finally {
      await terminal('terminal/release', { terminalId }).catch(() => {})
    }
  },
})

/** The memory files of the room: the person's, and the project's unless it is the home one. @param {Room} room */
const memoryFiles = (room) => (room.home ? ['memory.md'] : ['memory.md', join(room.dir, 'memory.md')])

/** Memory and earlier conversations, as the Memory capability has them (caps/memory/memory.js). @param {Room} room @returns {Tool[]} */
function memoryTools(room) {
  return [
    recallTool({ fs: room.jean, projectDir: () => room.dir, own: () => room.path }),
    {
      spec: {
        name: 'remember',
        description: 'Save one lasting fact, preference or correction the user stated, as one short line in their language. Use scope "project" when it only concerns the current project.',
        parameters: { type: 'object', properties: { text: { type: 'string' }, scope: { type: 'string', enum: ['person', 'project'] } }, required: ['text'] },
      },
      kind: 'edit',
      title: (args) => `Remember: ${args?.text ?? ''}`,
      run: async (args) => {
        const text = oneLine(String(args?.text ?? ''))
        if (!text) throw new Error('There is nothing to remember.')
        const path = args?.scope === 'project' ? memoryFiles(room).at(-1) ?? 'memory.md' : 'memory.md'
        let known = false
        await changeMemory(room.jean, path, (entries) => ((known = entries.some((other) => other.text.toLowerCase() === text.toLowerCase()))
          ? entries : [...entries, { text, at: new Date().toISOString(), by: 'jean', conversation: room.path }]))
        return known ? 'This was already remembered.' : 'Remembered.'
      },
    },
  ]
}

/** The person's skills and the project's, read by name (caps/skills/skills.js). @param {Room} room */
const skills = (room) => listSkills(room.jean, room.home ? [''] : ['', room.dir])

/** @param {Room} room @returns {Tool} */
const skillTool = (room) => ({
  spec: { name: 'skill', description: 'Read the steps of one of the skills listed in <skills>.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  kind: 'read',
  title: (args) => `Skill ${args?.name ?? ''}`,
  run: async (args) => skillSteps(room.jean, await skills(room), String(args?.name ?? '')),
})

/** The name the brain calls a service's tool by: `github_create_issue`. @param {Server} server @param {string} name */
const toolName = (server, name) => identifier(`${slug(server.name).slice(0, 16) || 'service'}_${name}`).slice(0, 64)

/** A service's tool, found with find_tools and asked first, as Connections' are. @param {Server} server @param {McpTool} tool @returns {Tool} */
function serviceTool(server, tool) {
  const { $schema, ...schema } = tool.inputSchema ?? {}
  const label = tool.title ?? tool.annotations?.title ?? tool.name
  return {
    spec: { name: toolName(server, tool.name), description: `${server.name}: ${tool.description ?? label}`, parameters: { ...schema, type: 'object' } },
    kind: tool.annotations?.readOnlyHint ? 'fetch' : 'other',
    deferred: true,
    title: () => `${server.name}: ${label}`,
    run: async (args, ctx) => {
      const result = await server.callTool(tool, args ?? {}, ctx.signal)
      const text = (result?.content ?? []).map((/** @type {any} */ item) => item.text ?? (item.resource ? `${item.resource.uri}\n${item.resource.text ?? ''}` : `(${item.type})`)).join('\n\n')
      if (result?.isError) throw new Error(text || `${server.name} reported an error.`)
      return text || JSON.stringify(result?.structuredContent ?? null)
    },
  }
}

/**
 * A service the editor connects (ACP's `mcpServers`): a program it names, spoken to on its input and
 * output, or an address, as Connections speak to one (caps/connections/mcp.js).
 * @param {any} server @param {string} cwd @returns {Promise<Server>}
 */
export async function connect(server, cwd) {
  const pairs = (/** @type {{ name: string, value: string }[] | undefined} */ list) => Object.fromEntries((list ?? []).map(({ name, value }) => [name, value]))
  if (server.url) {
    const headers = pairs(server.headers)
    const client = mcpClient({ url: server.url, client: CLIENT, fetch: (url, init) => fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), ...headers } }) })
    return { name: server.name, listTools: () => client.listTools(), callTool: client.callTool }
  }
  const child = spawn(server.command, server.args ?? [], { cwd, env: { ...process.env, ...pairs(server.env) }, stdio: ['pipe', 'pipe', 'inherit'] })
  const started = new Promise((ready, failed) => child.once('spawn', ready).on('error', failed))
  child.stdin.on('error', () => {})
  const rpc = peer({ input: child.stdout, write: (line) => child.stdin.write(line), handle: async (method) => {
    if (method === 'ping') return {}
    throw new RpcError(-32601, `Unknown method: ${method}`)
  } })
  await started
  await rpc.request('initialize', { protocolVersion: LEGACY, capabilities: {}, clientInfo: CLIENT }, AbortSignal.timeout(30_000))
  rpc.notify('notifications/initialized', {})
  return {
    name: server.name,
    listTools: async () => {
      /** @type {McpTool[]} */
      const tools = []
      for (let cursor; ;) {
        const result = await rpc.request('tools/list', cursor ? { cursor } : {})
        tools.push(...(result.tools ?? []))
        if (!(cursor = result.nextCursor) || tools.length >= 1000) return tools
      }
    },
    callTool: (tool, args, signal) => rpc.request('tools/call', { name: tool.name, arguments: args }, signal),
    close: () => child.kill(),
  }
}

/**
 * Every tool of a session, the lines and rules the prompt gives them, and the sections they add.
 * @param {Room} room @param {Server[]} servers
 */
export async function toolsFor(room, servers) {
  const offered = await Promise.all(servers.map(async (server) => ({ server, tools: await server.listTools().catch((error) => {
    console.error(server.name, error instanceof Error ? error.message : error)
    return []
  }) })))
  const services = offered.flatMap(({ server, tools }) => tools.map((tool) => serviceTool(server, tool)))
  /** @type {Tool[]} */
  const tools = [
    ...folderTools(room),
    ...(room.terminal ? [bashTool(room)] : []),
    readTool({ fs: room.jean, projectDir: () => room.dir, files: () => linkedFiles(room.records()) }),
    ...memoryTools(room),
    skillTool(room),
    ...services,
  ]
  if (services.length) tools.push(findTools({ tools: () => tools }))
  return {
    tools,
    lines: [
      { name: 'read', line: 'read pages of a file the user shared' },
      ...(room.terminal ? [{ name: 'bash', line: "commands on the user's computer, in their editor's terminal" }] : []),
      { name: 'recall', line: 'search earlier conversations' },
      { name: 'remember', line: 'save a lasting fact, preference or correction the user states' },
      { name: 'skill', line: 'read the steps of a skill before following it' },
    ],
    rules: [
      'Here the user works in their code editor, on the folder in <folder>: show code when it helps.',
      'Shared files are in the message, sometimes only their first pages. Use read for the others.',
      'Remember only what will still matter in later conversations.',
      'When a request matches a skill, read it and follow its steps.',
      ...(services.length ? ['Find the tools of the services in <connections> with find_tools.'] : []),
    ],
    /** The sections they add to the prompt: what Jean noticed, the skills, the services, the folder. */
    sections: async () => {
      const memory = memoryText((await Promise.all(memoryFiles(room).map(async (path) => parseMemory(await room.jean.read(path))))).flat())
      const listed = skillLines(await skills(room))
      const connections = offered.filter(({ tools }) => tools.length).map(({ server, tools }) => `- ${server.name}: ${tools.map((tool) => toolName(server, tool.name)).join(', ')}`).join('\n')
      const folder = [
        `The user's folder "${basename(room.cwd)}" is open in their editor, on their computer, at ${room.cwd}.`,
        `Its top level:\n${await topLevel(room.folder).catch(() => '(unreadable)')}`,
        USE,
      ].join('\n')
      return { ...(memory && { memory }), ...(listed && { skills: listed }), ...(connections && { connections }), folder }
    },
  }
}
