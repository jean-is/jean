// Jean inside an editor, through ACP (D241, https://agentclientprotocol.com): the editor starts
// `jean-cli acp` and speaks JSON-RPC on its input and output (cli/rpc.js). Each session is one of
// Jean's conversations, kept in the folder Sync keeps (caps/sync/mirror.js), in the project on the
// editor's folder or else the home one, so the browser has it after its next round. A turn is core's
// (core/loop.js), whose updates are ACP's already, as are the answers to what it asks first.
import { readFile } from 'node:fs/promises'
import { basename, isAbsolute, join as joinPath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BRAND } from '../app/brand.js'
import { nodeFS } from './fs.js'
import { peer, RpcError } from './rpc.js'
import { chooseBrain } from './brain.js'
import { connect, toolsFor } from './tools.js'
import { MARK } from '../app/caps/sync/mirror.js'
import { exactText } from '../app/caps/folders/work.js'
import { decodeText, extractPages, isBinary, paginate } from '../app/caps/files/extract.js'
import { runTurn } from '../app/core/loop.js'
import { appendRecords, createConversation, loadConversation } from '../app/core/conversations.js'
import { isPicture, linkedFiles, splitSuggestions, userRecords } from '../app/core/events.js'
import { buildSystemPrompt, changeNotes, frozenPrompt, promptRecord, promptState, toChatMessages } from '../app/core/prompt.js'
import { addFile, documentPart, estimateTokens, fileText, joinPages, nextSource, pagesThatFit, sourceNumber } from '../app/core/files.js'
import { ensureHome, listProjects, parseFrontMatter } from '../app/core/settings.js'
import { resolveRule, ruleFromPermission } from '../app/core/rules.js'
import { join, readJSON, writeJSON } from '../app/core/fs.js'
import { languageName, locale, t } from '../app/core/i18n.js'
import { ulid } from '../app/core/ulid.js'

/** @import { AcpUpdate, Envelope, ResourceLink, ToolCallInfo, RuleValue } from '../app/core/types.js' */
/** @import { PermissionOption } from '../app/core/loop.js' */
/** @import { Room, Server } from './tools.js' */
/**
 * @typedef {{ id: string, path: string, project: import('../app/core/settings.js').Project, cwd: string, records: Envelope[], servers: Server[],
 *   kit: Awaited<ReturnType<typeof toolsFor>>, controller: AbortController | null, running: string, shown: Map<string, object[]>,
 *   said: { text: string, sent: number }, texts: Map<string, string | null>, pictures: Map<string, string | undefined> }} Session
 *   running: the call running now; shown: content added to a call while it runs (a terminal); said: the step's answer so far, and how much of it the editor has
 * @typedef {{ format: 1, device: string, rules?: Record<string, RuleValue>, always?: Record<string, string[]> }} Own
 *   This computer's settings, at the top of the folder, which a mirror never carries: who writes the records, the rules
 *   the user's answers set, and what they always allow in each folder.
 */

// A shared file's share of the brain's context, as in the browser (ui/send.js); a conversation in a folder has 40 steps (D141).
const SHARE = 0.25 * 128_000
const STEPS = 40
const FILE_BYTES = 20 * 1024 * 1024
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
/** core's stop reasons as ACP's. @type {Record<string, string>} */
const STOPS = { end: 'end_turn', max_tokens: 'max_tokens', refusal: 'refusal', max_steps: 'max_turn_requests' }
const ERRORS = ['auth', 'credits', 'rate_limit', 'network', 'bad_request', 'not_found', 'server', 'bad_response', 'refusal']
/** @type {PermissionOption[]} */
const OPTIONS = ['allow_once', 'allow_always', 'reject_once', 'reject_always']

/**
 * @param {{ input: AsyncIterable<Uint8Array | string>, write: (line: string) => void, folder: string, brain?: string, address?: string,
 *   version: string, env?: Record<string, string | undefined>, stream?: import('../app/core/loop.js').TurnOptions['stream'] }} options
 *   folder: the one Sync keeps; brain and address: `--brain` and `--address`; stream: a brain of the tests' own
 */
export function agent({ input, write, folder, brain: named, address, version, env = process.env, stream }) {
  const jean = nodeFS(folder)
  /** @type {Map<string, Session>} */
  const sessions = new Map()
  /** @type {{ fs?: { readTextFile?: boolean, writeTextFile?: boolean }, terminal?: boolean }} */
  let client = {}
  /** @type {Promise<import('./brain.js').Chosen> | null} */
  let chosen = null

  const rpc = peer({ input, write, handle: async (method, params) => {
    if (method === 'initialize') {
      client = params.clientCapabilities ?? {}
      return {
        protocolVersion: 1,
        agentCapabilities: { loadSession: true, promptCapabilities: { image: true, embeddedContext: true }, mcpCapabilities: { http: true } },
        agentInfo: { name: 'jean-cli', title: BRAND.name, version },
        authMethods: [],
      }
    }
    if (method === 'authenticate') return {}
    if (method === 'session/new') return { sessionId: (await open(params)).id }
    if (method === 'session/load') return void replay(await open(params, String(params.sessionId ?? '')))
    if (method === 'session/prompt') return answer(params)
    if (method === 'session/cancel') return void sessions.get(params.sessionId)?.controller?.abort()
    throw new RpcError(-32601, `Unknown method: ${method}`)
  } })

  /** @returns {Promise<Own>} */
  const mine = async () => {
    const own = await readJSON(jean, 'settings.json', {})
    if (own.device) return own
    const made = { ...own, format: 1, device: ulid() }
    await writeJSON(jean, 'settings.json', made)
    return made
  }
  /** @param {(own: Own) => Own} change */
  const keep = async (change) => writeJSON(jean, 'settings.json', change(await mine()))

  /**
   * A session on a new conversation, or on one of the folder's, in the project on the editor's folder or the home one.
   * @param {{ cwd?: string, mcpServers?: any[] }} params @param {string} [id] @returns {Promise<Session>}
   */
  async function open({ cwd = '', mcpServers = [] }, id) {
    if (!isAbsolute(cwd)) throw new RpcError(-32602, 'cwd must be an absolute path.')
    if (!(await jean.exists(MARK))) throw new RpcError(-32603, t('cli.notSync', { folder }))
    const own = await mine()
    let projects = await listProjects(jean)
    let project
    let path = ''
    if (id) {
      for (const each of ULID.test(id) ? projects : []) if (await jean.exists(join(each.dir, 'conversations', `${id}.jsonl`))) project ??= each
      if (!project) throw new RpcError(-32002, t('cli.lost', { folder }))
      path = join(project.dir, 'conversations', `${id}.jsonl`)
    } else {
      if (!projects.some((each) => each.data.default === true)) projects = (await ensureHome(jean, { by: own.device }), await listProjects(jean))
      project = projects.find((each) => each.data.folder === basename(cwd)) ?? projects.find((each) => each.data.default === true)
      ;({ id, path } = await createConversation(jean, { projectDir: /** @type {any} */ (project).dir, by: own.device }))
    }
    const found = /** @type {import('../app/core/settings.js').Project} */ (project)
    const servers = (await Promise.all(mcpServers.map((server) => connect(server, cwd).catch((error) => {
      console.error(server?.name, error instanceof Error ? error.message : error)
      return null
    })))).filter((server) => server !== null)
    const disk = nodeFS(cwd, { swap: false })
    const always = new Set(own.always?.[cwd] ?? [])
    /** @type {Session} */
    const session = { id, path, project: found, cwd, records: (await loadConversation(jean, path))?.records ?? [], servers, kit: /** @type {any} */ (null),
      controller: null, running: '', shown: new Map(), said: { text: '', sent: 0 }, texts: new Map(), pictures: new Map() }
    /** @type {Room} */
    const room = {
      jean, dir: found.dir, home: found.data.default === true, cwd, path, folder: disk, buffers: buffers(disk, cwd, id), records: () => session.records, always,
      trust: async (name) => {
        always.add(name)
        await keep((now) => ({ ...now, always: { ...now.always, [cwd]: [...always] } }))
      },
      terminal: client.terminal ? (method, params, signal) => rpc.request(method, { sessionId: id, ...params }, signal) : null,
      show: (content) => {
        if (!session.running) return
        session.shown.set(session.running, [...(session.shown.get(session.running) ?? []), content])
        send(session, { sessionUpdate: 'tool_call_update', toolCallId: session.running, content: [] })
      },
    }
    session.kit = await toolsFor(room, servers)
    sessions.get(id)?.servers.forEach((server) => server.close?.())
    sessions.set(id, session)
    return session
  }

  /**
   * The editor's folder, read and written through the editor where it lets Jean, so a file's unsaved
   * changes are seen and Jean's go into the editor; what isn't text, from the disk and to it.
   * @param {import('../app/core/types.js').FS} disk @param {string} cwd @param {string} sessionId @returns {import('../app/core/types.js').FS}
   */
  function buffers(disk, cwd, sessionId) {
    const at = (/** @type {string} */ path) => joinPath(cwd, path)
    return {
      ...disk,
      readBytes: async (path) => {
        const bytes = await disk.readBytes(path)
        if (!bytes || !client.fs?.readTextFile || exactText(bytes) === null) return bytes
        const read = await rpc.request('fs/read_text_file', { sessionId, path: at(path) }).catch(() => null)
        return typeof read?.content === 'string' ? encoder.encode(read.content) : bytes
      },
      writeBytes: async (path, bytes) => {
        if (client.fs?.writeTextFile && exactText(bytes) !== null) await rpc.request('fs/write_text_file', { sessionId, path: at(path), content: decoder.decode(bytes) })
        else await disk.writeBytes(path, bytes)
      },
    }
  }

  /** @param {Session} session @param {Envelope[]} records */
  const save = async (session, records) => {
    session.records.push(...records)
    await appendRecords(jean, session.path, records)
  }

  /**
   * A call as the editor takes it: paths in full, and what it showed while it ran kept on it.
   * @template {Partial<ToolCallInfo>} T @param {Session} session @param {T} call @returns {T}
   */
  function outward(session, call) {
    const full = (/** @type {string} */ path) => (isAbsolute(path) ? path : joinPath(session.cwd, path))
    const before = call.toolCallId ? session.shown.get(call.toolCallId) : undefined
    const content = call.content && [...(before ?? []), ...call.content.map((part) => (part.type === 'diff' ? { ...part, path: full(part.path) } : part))]
    return { ...call, ...(content && { content }), ...(call.locations && { locations: call.locations.map((place) => ({ ...place, path: full(place.path) })) }) }
  }

  /** @param {Session} session @param {AcpUpdate} update */
  function send(session, update) {
    const shown = 'toolCallId' in update ? outward(session, update)
      : update.sessionUpdate === 'user_message_chunk' && update.content.type === 'resource_link'
        ? { ...update, content: { ...update.content, uri: pathToFileURL(joinPath(folder, session.project.dir, update.content.uri)).href } } : update
    rpc.notify('session/update', { sessionId: session.id, update: shown })
  }

  /** A live update: not Jean's own entry for a brain's step, nor a note or a summary (D359); an answer without the follow-ups it ends with. @param {Session} session @param {AcpUpdate} update */
  function tell(session, update) {
    if (update.sessionUpdate.startsWith('_')) return
    if ('toolCallId' in update && update.toolCallId.startsWith('brain-')) {
      if (update.sessionUpdate === 'tool_call') session.said = { text: '', sent: 0 }
      return
    }
    if (update.sessionUpdate === 'agent_message_chunk') {
      session.said.text += update.content.text
      const shown = splitSuggestions(session.said.text).text
      const more = shown.slice(session.said.sent)
      session.said.sent = Math.max(session.said.sent, shown.length)
      return void (more && send(session, { ...update, content: { type: 'text', text: more } }))
    }
    if (update.sessionUpdate === 'tool_call_update' && update.status === 'in_progress') session.running = update.toolCallId
    send(session, update)
  }

  /** A conversation told again, record by record, for an editor that opens it (session/load). @param {Session} session */
  function replay(session) {
    const seen = new Set()
    for (const { update } of session.records) {
      if (!update || update.sessionUpdate.startsWith('_')) continue
      if (update.sessionUpdate === 'agent_message_chunk') {
        const text = splitSuggestions(update.content.text).text
        if (text) send(session, { ...update, content: { type: 'text', text } })
      } else if (!('toolCallId' in update)) send(session, update)
      else if (!update.toolCallId.startsWith('brain-')) {
        send(session, /** @type {AcpUpdate} */ ({ ...update, sessionUpdate: seen.has(update.toolCallId) ? 'tool_call_update' : 'tool_call' }))
        seen.add(update.toolCallId)
      }
    }
  }

  /** What the user is asked, as the editor asks it: always and never set the rule for what isn't kept to a folder, as in the browser. @param {Session} session @param {ToolCallInfo} toolCall @param {AbortSignal} signal */
  async function ask(session, toolCall, signal) {
    const names = [t('cli.allowOnce'), t('cli.allowAlways'), t('cli.rejectOnce'), t('cli.rejectAlways')]
    const options = OPTIONS.map((kind, i) => ({ optionId: kind, name: names[i], kind }))
    const reply = await rpc.request('session/request_permission', { sessionId: session.id, toolCall: outward(session, toolCall), options }, signal).catch(() => null)
    const option = /** @type {PermissionOption} */ (OPTIONS.find((kind) => reply?.outcome?.outcome === 'selected' && reply.outcome.optionId === kind) ?? 'reject_once')
    const rule = toolCall._meta?.folder ? null : ruleFromPermission(option)
    if (rule && toolCall.kind) await keep((own) => ({ ...own, rules: { ...own.rules, [/** @type {string} */ (toolCall.kind)]: rule } }))
    return option
  }

  /**
   * What a block of the prompt shares: a file the editor names, its contents, a picture. Kept as the
   * project's files, by their content, as the browser keeps what is shared (core/files.js).
   * @param {any} block @returns {Promise<{ name: string, mimeType?: string, bytes: Uint8Array } | null>}
   */
  async function shared(block) {
    const named = (/** @type {string} */ uri) => decodeURIComponent(basename(new URL(uri, 'file:///').pathname)) || 'file'
    if (block.type === 'image' && block.data) return { name: `picture.${String(block.mimeType).split('/')[1] ?? 'png'}`, mimeType: block.mimeType, bytes: Buffer.from(block.data, 'base64') }
    if (block.type === 'resource' && block.resource) {
      const { uri = '', text, blob, mimeType } = block.resource
      return { name: named(uri), mimeType, bytes: text !== undefined ? encoder.encode(text) : Buffer.from(blob ?? '', 'base64') }
    }
    if (block.type !== 'resource_link' || !String(block.uri).startsWith('file:')) return null
    const bytes = await readFile(fileURLToPath(block.uri)).catch(() => null)
    return bytes && bytes.length <= FILE_BYTES ? { name: block.name || named(block.uri), mimeType: block.mimeType, bytes } : null
  }

  /** The links a prompt's files get: each kept, numbered, with the pages that fit decided now (ui/send.js). @param {Session} session @param {any[]} blocks */
  async function attach(session, blocks) {
    const own = await mine()
    let budget = SHARE
    /** @type {ResourceLink[]} */
    const links = []
    for (const block of blocks) {
      const file = await shared(block)
      if (!file) continue
      const pages = (await extractPages(file.name, file.bytes).catch(() => null)) ?? (isBinary(file.bytes) ? [''] : paginate(decodeText(file.bytes).split('\n')))
      const link = await addFile(jean, { projectDir: session.project.dir, name: file.name, mimeType: file.mimeType ?? '', bytes: file.bytes, pages, by: own.device })
      session.texts.set(link.uri, joinPages(pages))
      const [first, last] = pagesThatFit(pages, Math.max(budget, 1))
      budget -= pages.slice(0, last).reduce((sum, page) => sum + estimateTokens(page), 0)
      links.push({ ...link, _meta: { ...(last < pages.length && { pages: [first, last], of: pages.length }), source: sourceNumber([...linkedFiles(session.records), ...links], link) } })
    }
    return links
  }

  /** What the brain reads of each shared file, and the pictures it sees. @param {Session} session */
  async function documents(session) {
    for (const link of linkedFiles(session.records)) {
      if (!session.texts.has(link.uri)) session.texts.set(link.uri, await fileText(jean, session.project.dir, link.uri))
      if (isPicture(link) && !session.pictures.has(link.uri)) session.pictures.set(link.uri, (await jean.readBytes(join(session.project.dir, link.uri)).then((bytes) => bytes && Buffer.from(bytes).toString('base64'))) ?? undefined)
    }
    return (/** @type {ResourceLink} */ link) => documentPart(link, session.texts.get(link.uri) ?? null, session.pictures.get(link.uri))
  }

  /** The project, the instructions and what the tools add, as the browser's context() gives them. @param {Session} session */
  async function context(session) {
    const { dir, data, body } = session.project
    const home = data.default === true
    const read = async (/** @type {string} */ path) => parseFrontMatter((await jean.read(path)) ?? '').body.trim()
    const instructions = [await read('instructions.md'), home ? '' : await read(`${dir}/instructions.md`)].filter(Boolean).join('\n\n')
    const project = [String(data.name), ...(data.assistantName ? [`The user calls you ${data.assistantName} here.`] : []), ...(body.trim() ? [`How to be: ${body.trim()}`] : [])].join('\n')
    return { ...(!home && { project }), ...(instructions && { instructions }), ...await session.kit.sections() }
  }

  /** The brain, chosen once, at the first prompt. */
  const brain = () => (chosen ??= chooseBrain({ named, address, env }).then((found) => {
    if (!found) throw new RpcError(-32603, t('cli.noBrain'))
    if ('needs' in found) throw new RpcError(-32603, t('cli.needsName', { provider: found.needs }))
    return found
  }).catch((error) => {
    chosen = null
    throw error
  }))

  /** session/prompt: the request kept, with the prompt or the notes since (D46), then answered. @param {{ sessionId?: string, prompt?: any[] }} params */
  async function answer({ sessionId = '', prompt: blocks = [] }) {
    const session = sessions.get(sessionId)
    if (!session) throw new RpcError(-32602, `There is no session ${sessionId}.`)
    if (session.controller) throw new RpcError(-32603, 'A request is still being answered.')
    const controller = (session.controller = new AbortController())
    try {
      const { brain: config, apiKey } = await brain()
      const own = await mine()
      const text = blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n').trim()
      const links = await attach(session, blocks)
      const { tools, lines, rules } = session.kit
      const sections = await context(session)
      const now = promptState({ language: languageName(locale.peek(), 'en'), tools: tools.filter((tool) => !tool.hidden && !tool.deferred).map((tool) => tool.spec.name), sections })
      const known = frozenPrompt(session.records)
      const head = known ? changeNotes(known.state, now, sections)
        : [promptRecord(own.device, buildSystemPrompt({ assistantName: BRAND.name, uiLanguage: now.language, tools: lines, rules, sections, now: new Date() }), now)]
      await save(session, [...head, ...userRecords(text, links, own.device)])
      const frozen = frozenPrompt(session.records)
      const messages = toChatMessages(session.records, await documents(session))
      const { stopReason } = await runTurn({
        brain: config,
        apiKey,
        system: frozen?.system ?? '',
        history: messages.slice(0, messages.findLastIndex((message) => message.role === 'user') + 1),
        tools,
        declared: frozen?.state.tools ?? [],
        label: config.label,
        firstSource: nextSource(session.records),
        maxSteps: STEPS,
        signal: controller.signal,
        rule: (kind, reserved) => resolveRule(kind, { user: own.rules, reserved }),
        askPermission: ({ toolCall }) => ask(session, toolCall, controller.signal),
        onUpdate: (update) => tell(session, update),
        persist: (records) => save(session, records),
        ...(stream && { stream }),
      })
      return { stopReason: STOPS[stopReason] ?? 'end_turn' }
    } catch (error) {
      if (controller.signal.aborted) return { stopReason: 'cancelled' }
      if (error instanceof RpcError) throw error
      console.error(error)
      const code = /** @type {any} */ (error)?.code === 'cors_or_offline' ? 'network' : /** @type {any} */ (error)?.code
      const label = (await chosen?.catch(() => null))?.brain.label ?? BRAND.name
      throw new RpcError(-32603, t(ERRORS.includes(code) ? `cli.error.${code}` : 'cli.error.unknown', { brain: label }))
    } finally {
      session.controller = null
      session.running = ''
    }
  }

  // The editor closed its end: what the sessions started ends.
  const closed = rpc.closed.then(async () => {
    for (const session of sessions.values()) for (const server of session.servers) server.close?.()
    await (await chosen?.catch(() => null))?.close?.()
  })
  return { closed }
}
