#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// A stand-in for Antigravity CLI (D756), as the bridge runs it: `acp`, speaking ACP on its input and output, as Google's
// guide has it. `--agent <name>` is the custom agent .agents/agents/<name>.md of the folder it starts in, whose body is its
// prompt; HTTP MCP servers come only with `--process-per-session`. The model is a session's configuration option. A message
// that asks for the weather asks first to run a command of its own, then announces a call of Jean's weather tool, asks
// to make it and makes it over the MCP server session/new names, then answers with what it says and whether its command
// was allowed; "limit" ends as a plan's quota does; anything else is echoed with what came with it, and the results the
// session holds. A prompt that comes while another is answered is taken into that turn (a steer); session/cancel ends
// the turn, cancelled, keeping only the results it had. ANTIGRAVITY_SIGNED_OUT names a file: while it is there, it plays one
// not signed in, and `authenticate` with Google removes it, as a sign-in in the browser leaves Antigravity's credentials;
// ANTIGRAVITY_DECLINED plays one whose sign-in the person left.
import { existsSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({ args: process.argv.slice(2), strict: false, allowPositionals: true, options: { agent: { type: 'string' }, 'process-per-session': { type: 'boolean' } } })
if (positionals[0] !== 'acp') process.exit(2)
const out = (/** @type {object} */ message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
/** @typedef {{ cwd: string, server: any, model: string, results: string[], turn?: AbortController, ended?: Promise<void>, steered: string[] }} Session */
/** @type {Map<string, Session>} */
const sessions = new Map()
const update = (/** @type {string} */ sessionId, /** @type {object} */ change) => out({ method: 'session/update', params: { sessionId, update: change } })
const say = (/** @type {string} */ sessionId, /** @type {string} */ text) => update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } })
const MODELS = { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'gemini-3.8-flash', options: [
  { group: 'gemini', name: 'Gemini', options: [{ value: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite' }, { value: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }, { value: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro' }] },
] }
const CHOICES = MODELS.options.flatMap((group) => group.options.map((option) => option.value))
let sent = 0
/** What it asked of the client, waiting for the answer. @type {Map<number, (message: any) => void>} */
const asked = new Map()
/** @param {string} method @param {object} params @returns {Promise<any>} */
const ask = (method, params) => new Promise((done) => {
  asked.set(++sent, done)
  out({ id: sent, method, params })
})

/** @param {any} server @param {object} params @param {AbortSignal} signal */
async function call(server, params, signal) {
  const headers = Object.fromEntries(server.headers.map((/** @type {any} */ { name, value }) => [name, value]))
  const res = await fetch(server.url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: ++sent, method: 'tools/call', params }), signal })
  return (await res.json()).result
}

/** Whether the client allowed what it asked, from the option it chose. @param {string} sessionId @param {object} toolCall */
async function allowed(sessionId, toolCall) {
  const options = [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }, { optionId: 'always', name: 'Always allow', kind: 'allow_always' }, { optionId: 'deny', name: 'Deny', kind: 'reject_once' }]
  const { result } = await ask('session/request_permission', { sessionId, toolCall, options })
  return result?.outcome?.outcome === 'selected' && /^allow/.test(String(options.find((option) => option.optionId === result.outcome.optionId)?.kind))
}

/** A prompt: taken into the turn under way, if one is, else a turn of its own. @param {number} id @param {any} params */
async function prompt(id, params) {
  const session = /** @type {Session} */ (sessions.get(params.sessionId))
  const text = params.prompt.filter((/** @type {any} */ block) => block.type === 'text').map((/** @type {any} */ block) => block.text).join('\n')
  if (session.turn && !session.turn.signal.aborted) {
    session.steered.push(text)
    await session.ended
    return out({ id, result: { stopReason: 'end_turn' } })
  }
  const turn = (session.turn = new AbortController())
  /** @type {() => void} */
  let ended = () => {}
  session.ended = new Promise((done) => { ended = done })
  const answer = (/** @type {object} */ message) => {
    session.turn = undefined
    out({ id, ...message })
    ended()
  }
  const steers = () => (session.steered.length ? ` (steered: ${session.steered.splice(0).join(' / ')})` : '')
  if (/weather/i.test(text)) {
    update(params.sessionId, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Lyon, then.' } })
    // Its own command first, which only the client lets it run.
    const own = { toolCallId: `call_${++sent}`, title: 'Run curl wttr.in/Lyon', kind: 'execute', status: 'pending', rawInput: { command: 'curl wttr.in/Lyon' } }
    update(params.sessionId, { sessionUpdate: 'tool_call', ...own })
    const ran = await allowed(params.sessionId, own)
    update(params.sessionId, { sessionUpdate: 'tool_call_update', toolCallId: own.toolCallId, status: ran ? 'completed' : 'failed' })
    const toolCallId = `call_${++sent}`
    const jean = { toolCallId, title: 'jean/weather', kind: 'other', status: 'pending', rawInput: { city: 'Lyon' } }
    update(params.sessionId, { sessionUpdate: 'tool_call', ...jean })
    if (!(await allowed(params.sessionId, jean))) return answer({ result: { stopReason: 'end_turn' } })
    const result = await call(session.server, { name: 'weather', arguments: { city: 'Lyon' } }, turn.signal).catch(() => null)
    if (!result) return answer({ result: { stopReason: 'cancelled' } })
    const said = `${result.content.map((/** @type {any} */ part) => part.text).join(' / ')}${result.isError ? ' (an error)' : ''}`
    update(params.sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: result.isError ? 'failed' : 'completed' })
    session.results.push(said)
    // Its next words take a while, which a cancel cuts short.
    await new Promise((done) => {
      const timer = setTimeout(done, 100)
      turn.signal.addEventListener('abort', () => done(clearTimeout(timer)))
    })
    if (turn.signal.aborted) return answer({ result: { stopReason: 'cancelled' } })
    say(params.sessionId, `In Lyon: ${said}, its own command ${ran ? 'run' : 'refused'}${steers()}`)
    answer({ result: { stopReason: 'end_turn', usage: { inputTokens: 30, outputTokens: 5, cachedReadTokens: 10 } } })
  } else if (/limit/i.test(text)) answer({ error: { code: -32603, message: 'Quota exhausted: your weekly limit is reached.' } })
  // As 1.5.16 says a plan's quota: a notice where the answer goes, and the turn ended.
  else if (/quota/i.test(text)) {
    say(params.sessionId, '\n⚠ Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 158h6m14s.\n')
    answer({ result: { stopReason: 'end_turn', usage: { inputTokens: 0, outputTokens: 0 } } })
  }
  else {
    // The agent's prompt, after the bridge's word on whose instructions these are, and whether it lists tools of its own.
    const file = await readFile(join(session.cwd, '.agents', 'agents', `${values.agent}.md`), 'utf8').catch(() => '')
    const [, head = '', body = ''] = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(file) ?? []
    const own = String(body.split('\n\n').at(-1))
    const tools = /^tools:/m.test(head) ? 'tools' : 'no tools'
    const after = session.results.length ? `, after ${session.results.join(' / ')}` : ''
    say(params.sessionId, `Heard (${session.model}, ${own.slice(0, 12)}, ${values.agent}, ${tools})${after}: ${text}${steers()}`)
    answer({ result: { stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 5 } } })
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  const { id, method, params } = message
  if (!method) return void asked.get(id)?.(message)
  if (method === 'initialize') {
    const authMethods = [{ id: 'oauth-personal', name: 'Log in with Google' }, { id: 'gemini-api-key', name: 'Gemini API key' }]
    out({ id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true, mcpCapabilities: { http: true } }, agentInfo: { name: 'Antigravity ACP Server' }, authMethods } })
  } else if (method === 'session/new') {
    if (process.env.ANTIGRAVITY_SIGNED_OUT && existsSync(process.env.ANTIGRAVITY_SIGNED_OUT)) return out({ id, error: { code: -32000, message: 'Authentication required' } })
    const server = params.mcpServers?.[0]
    if (server?.type === 'http' && !values['process-per-session']) return out({ id, error: { code: -32602, message: 'HTTP MCP servers need --process-per-session' } })
    if (values.agent && !params.mcpServers.length) return out({ id, error: { code: -32602, message: 'A session of an agent of its own needs its tools' } })
    const sessionId = `s${sessions.size + 1}`
    sessions.set(sessionId, { cwd: params.cwd, server, model: MODELS.currentValue, results: [], steered: [] })
    out({ id, result: { sessionId, configOptions: [MODELS, { id: 'thought_level', name: 'Thinking', category: 'thought_level', type: 'select', currentValue: 'medium', options: [{ value: 'low', name: 'Low' }, { value: 'medium', name: 'Medium' }] }] } })
  } else if (method === 'session/set_config_option') {
    const session = sessions.get(params.sessionId)
    if (!session || params.configId !== 'model' || !CHOICES.includes(params.value)) return out({ id, error: { code: -32602, message: `Unknown model: ${params.value}` } })
    session.model = params.value
    out({ id, result: { configOptions: [{ ...MODELS, currentValue: params.value }] } })
  } else if (method === 'authenticate') {
    if (params.methodId !== 'oauth-personal' || process.env.ANTIGRAVITY_DECLINED) return out({ id, error: { code: -32603, message: 'The sign-in was cancelled.' } })
    if (process.env.ANTIGRAVITY_SIGNED_OUT) rmSync(process.env.ANTIGRAVITY_SIGNED_OUT, { force: true })
    out({ id, result: {} })
  } else if (method === 'session/cancel') sessions.get(params.sessionId)?.turn?.abort()
  else if (method === 'session/close') out({ id, result: {} })
  else if (method === 'session/prompt') prompt(id, params)
  else if (id !== undefined) out({ id, error: { code: -32601, message: `Unknown: ${method}` } })
})
