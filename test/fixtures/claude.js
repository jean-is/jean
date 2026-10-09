#!/usr/bin/env node
// A stand-in for Claude Code (D235), as the bridge runs it: `auth status --json`, and `-p` reading
// stream-json messages, answering each with Anthropic's stream events. A message that asks for the
// weather calls Jean's weather tool over the MCP server --mcp-config names, as Claude Code does, and
// answers with what it says; "limit" ends as a plan's limit does; anything else is echoed with what
// came with it. CLAUDE_SIGNED_OUT=1 plays one not signed in.
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

const argv = process.argv.slice(2)
if (argv[0] === 'auth') {
  console.log(JSON.stringify({ loggedIn: !process.env.CLAUDE_SIGNED_OUT, authMethod: 'claude.ai' }))
  process.exit(process.env.CLAUDE_SIGNED_OUT ? 1 : 0)
}
const { values } = parseArgs({ args: argv, strict: false, options: { model: { type: 'string' }, 'system-prompt': { type: 'string' }, 'mcp-config': { type: 'string' }, tools: { type: 'string' } } })
const server = JSON.parse(String(values['mcp-config'])).mcpServers.jean
const out = (/** @type {object} */ line) => process.stdout.write(`${JSON.stringify(line)}\n`)
const event = (/** @type {object} */ e) => out({ type: 'stream_event', event: e })

/** One step: its blocks streamed, then how it stopped. @param {any[]} blocks @param {string} stop */
function step(blocks, stop) {
  event({ type: 'message_start', message: { id: `msg_${Date.now()}`, role: 'assistant', content: [], usage: { input_tokens: 10, output_tokens: 0 } } })
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      event({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
      event({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } })
    } else {
      event({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } })
      event({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })
    }
    event({ type: 'content_block_stop', index })
  })
  event({ type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 5 } })
  event({ type: 'message_stop' })
}

let calls = 0
/** @param {object} params */
async function call(params) {
  const res = await fetch(server.url, { method: 'POST', headers: { 'content-type': 'application/json', ...server.headers }, body: JSON.stringify({ jsonrpc: '2.0', id: ++calls, method: 'tools/call', params }) })
  return (await res.json()).result
}

out({ type: 'system', subtype: 'init', model: values.model, tools: [] })
for await (const line of createInterface({ input: process.stdin })) {
  const content = JSON.parse(line).message.content
  const text = content.filter((/** @type {any} */ block) => block.type === 'text').map((/** @type {any} */ block) => block.text).join('\n')
  if (/weather/i.test(text)) {
    const id = `toolu_${++calls}`
    step([{ type: 'tool_use', id, name: 'mcp__jean__weather', input: { city: 'Lyon' } }], 'tool_use')
    const result = await call({ name: 'weather', arguments: { city: 'Lyon' }, _meta: { 'claudecode/toolUseId': id } })
    step([{ type: 'text', text: `In Lyon: ${result.content.map((/** @type {any} */ part) => part.text).join(' / ')}${result.isError ? ' (an error)' : ''}` }], 'end_turn')
  } else if (/limit/i.test(text)) {
    out({ type: 'assistant', message: { content: [{ type: 'text', text: 'You’ve hit your limit' }] }, error: 'rate_limit' })
    out({ type: 'result', subtype: 'success', is_error: true, result: 'You’ve hit your limit · resets 3pm' })
    continue
  } else {
    step([{ type: 'text', text: `Heard (${values.model}, ${String(values['system-prompt']).slice(0, 12)}): ${text}` }], 'end_turn')
  }
  out({ type: 'result', subtype: 'success', is_error: false, result: '' })
}
