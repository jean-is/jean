#!/usr/bin/env node
// A stand-in for Copilot CLI (D262), as the bridge runs it: `--acp`, speaking ACP on its input and output.
// A session's AGENTS.md ends with its prompt. Its first words in a session are Copilot's notice of the tools it
// left out. A message that asks for the weather announces a call of Jean's weather tool and makes it over
// the MCP server session/new names, as Copilot does, then answers with what it says; "limit" ends as a
// plan's limit does; anything else is echoed with what came with it. COPILOT_SIGNED_OUT=1 plays one not signed in.
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ args: process.argv.slice(2), strict: false, options: { model: { type: 'string' }, 'available-tools': { type: 'string' } } })
const out = (/** @type {object} */ message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
/** @type {Map<string, { cwd: string, server: any, noticed?: boolean }>} */
const sessions = new Map()
const update = (/** @type {string} */ sessionId, /** @type {object} */ change) => out({ method: 'session/update', params: { sessionId, update: change } })
const say = (/** @type {string} */ sessionId, /** @type {string} */ text) => update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } })
let calls = 0

/** @param {any} server @param {object} params */
async function call(server, params) {
  const headers = Object.fromEntries(server.headers.map((/** @type {any} */ { name, value }) => [name, value]))
  const res = await fetch(server.url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: ++calls, method: 'tools/call', params }) })
  return (await res.json()).result
}

for await (const line of createInterface({ input: process.stdin })) {
  const { id, method, params } = JSON.parse(line)
  if (method === 'initialize') out({ id, result: { protocolVersion: 1, agentCapabilities: { mcpCapabilities: { http: true } }, authMethods: [] } })
  else if (method === 'session/new') {
    if (process.env.COPILOT_SIGNED_OUT) {
      out({ id, error: { code: -32000, message: 'Authentication required' } })
      continue
    }
    const sessionId = `s${sessions.size + 1}`
    sessions.set(sessionId, { cwd: params.cwd, server: params.mcpServers[0] })
    const availableModels = [{ modelId: 'auto', name: 'Auto' }, { modelId: 'gpt-5-mini', name: 'GPT-5 mini' }, { modelId: 'claude-sonnet-5.5', name: 'Claude Sonnet 5.5' }]
    out({ id, result: { sessionId, models: { currentModelId: 'claude-sonnet-5.5', availableModels } } })
  } else if (method === 'session/close') out({ id, result: {} })
  else if (method === 'session/prompt') {
    const session = /** @type {{ cwd: string, server: any, noticed?: boolean }} */ (sessions.get(params.sessionId))
    const text = params.prompt.filter((/** @type {any} */ block) => block.type === 'text').map((/** @type {any} */ block) => block.text).join('\n')
    if (!session.noticed) say(params.sessionId, 'Info: Disabled tools: bash, view')
    session.noticed = true
    if (/weather/i.test(text)) {
      update(params.sessionId, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Lyon, then.' } })
      const toolCallId = `call_${++calls}`
      update(params.sessionId, { sessionUpdate: 'tool_call', toolCallId, title: 'jean-weather', kind: 'other', status: 'pending', rawInput: { city: 'Lyon' } })
      const result = await call(session.server, { name: 'weather', arguments: { city: 'Lyon' } })
      say(params.sessionId, `In Lyon: ${result.content.map((/** @type {any} */ part) => part.text).join(' / ')}${result.isError ? ' (an error)' : ''}`)
      out({ id, result: { stopReason: 'end_turn', usage: { inputTokens: 30, outputTokens: 5, cachedReadTokens: 10 } } })
    } else if (/limit/i.test(text)) out({ id, error: { code: -32603, message: 'You have exceeded your premium request quota' } })
    else {
      // Jean's prompt, after the bridge's word on whose instructions these are.
      const prompt = String((await readFile(`${session.cwd}/AGENTS.md`, 'utf8')).split('\n\n').at(-1))
      say(params.sessionId, `Heard (${values.model}, ${prompt.slice(0, 12)}, ${values['available-tools']}): ${text}`)
      out({ id, result: { stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 5 } } })
    }
  }
}
