#!/usr/bin/env node
// A stand-in for Copilot CLI (D262), as the bridge runs it: `--acp`, speaking ACP on its input and output.
// A session's AGENTS.md ends with its prompt. Its first words in a session are Copilot's notice of the tools it
// left out. A message that asks for the weather announces a call of Jean's weather tool and makes it over
// the MCP server session/new names, as Copilot does, then answers with what it says; "limit" ends as a
// plan's limit does; anything else is echoed with what came with it, and the results the session holds.
// A prompt that comes while another is answered ends that one, cancelled, which keeps only the results
// it had. COPILOT_SIGNED_OUT=1 plays one not signed in.
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ args: process.argv.slice(2), strict: false, options: { model: { type: 'string' }, 'available-tools': { type: 'string' } } })
const out = (/** @type {object} */ message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
/** @typedef {{ cwd: string, server: any, noticed?: boolean, results: string[], turn?: AbortController, ended?: Promise<void> }} Session */
/** @type {Map<string, Session>} */
const sessions = new Map()
const update = (/** @type {string} */ sessionId, /** @type {object} */ change) => out({ method: 'session/update', params: { sessionId, update: change } })
const say = (/** @type {string} */ sessionId, /** @type {string} */ text) => update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } })
let calls = 0

/** @param {any} server @param {object} params @param {AbortSignal} signal */
async function call(server, params, signal) {
  const headers = Object.fromEntries(server.headers.map((/** @type {any} */ { name, value }) => [name, value]))
  const res = await fetch(server.url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: ++calls, method: 'tools/call', params }), signal })
  return (await res.json()).result
}

/** A prompt, once the one it cuts short has ended. @param {number} id @param {any} params */
async function prompt(id, params) {
  const session = /** @type {Session} */ (sessions.get(params.sessionId))
  session.turn?.abort()
  await session.ended
  const turn = (session.turn = new AbortController())
  /** @type {() => void} */
  let ended = () => {}
  session.ended = new Promise((done) => { ended = done })
  const answer = (/** @type {object} */ message) => {
    out({ id, ...message })
    ended()
  }
  const text = params.prompt.filter((/** @type {any} */ block) => block.type === 'text').map((/** @type {any} */ block) => block.text).join('\n')
  if (!session.noticed) say(params.sessionId, 'Info: Disabled tools: bash, view')
  session.noticed = true
  if (/weather/i.test(text)) {
    update(params.sessionId, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Lyon, then.' } })
    const toolCallId = `call_${++calls}`
    update(params.sessionId, { sessionUpdate: 'tool_call', toolCallId, title: 'jean-weather', kind: 'other', status: 'pending', rawInput: { city: 'Lyon' } })
    const result = await call(session.server, { name: 'weather', arguments: { city: 'Lyon' } }, turn.signal).catch(() => null)
    if (!result) return answer({ result: { stopReason: 'cancelled' } })
    const said = `${result.content.map((/** @type {any} */ part) => part.text).join(' / ')}${result.isError ? ' (an error)' : ''}`
    update(params.sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: result.isError ? 'failed' : 'completed' })
    session.results.push(said)
    say(params.sessionId, `In Lyon: ${said}`)
    // Its next words take a while, which a prompt cuts short.
    await new Promise((done) => {
      const timer = setTimeout(done, 100)
      turn.signal.addEventListener('abort', () => done(clearTimeout(timer)))
    })
    answer({ result: turn.signal.aborted ? { stopReason: 'cancelled' } : { stopReason: 'end_turn', usage: { inputTokens: 30, outputTokens: 5, cachedReadTokens: 10 } } })
  } else if (/limit/i.test(text)) answer({ error: { code: -32603, message: 'You have exceeded your premium request quota' } })
  else {
    // Jean's prompt, after the bridge's word on whose instructions these are.
    const own = String((await readFile(`${session.cwd}/AGENTS.md`, 'utf8')).split('\n\n').at(-1))
    const after = session.results.length ? `, after ${session.results.join(' / ')}` : ''
    say(params.sessionId, `Heard (${values.model}, ${own.slice(0, 12)}, ${values['available-tools']})${after}: ${text}`)
    answer({ result: { stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 5 } } })
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, method, params } = JSON.parse(line)
  if (method === 'initialize') out({ id, result: { protocolVersion: 1, agentCapabilities: { mcpCapabilities: { http: true } }, authMethods: [] } })
  else if (method === 'session/new') {
    if (process.env.COPILOT_SIGNED_OUT) {
      return out({ id, error: { code: -32000, message: 'Authentication required' } })
    }
    const sessionId = `s${sessions.size + 1}`
    sessions.set(sessionId, { cwd: params.cwd, server: params.mcpServers[0], results: [] })
    const availableModels = [{ modelId: 'auto', name: 'Auto' }, { modelId: 'gpt-5-mini', name: 'GPT-5 mini' }, { modelId: 'claude-sonnet-5.5', name: 'Claude Sonnet 5.5' }]
    out({ id, result: { sessionId, models: { currentModelId: 'claude-sonnet-5.5', availableModels } } })
  } else if (method === 'session/close') out({ id, result: {} })
  else if (method === 'session/prompt') prompt(id, params)
})
