// The agent loop: stream a reply, run tool calls under the rules, feed results
// back, repeat. Emits live ACP updates and persists settled records.
import { streamChat as defaultStream } from './llm.js'
import { envelope } from './events.js'

/** @typedef {import('./types.js').BrainConfig} BrainConfig */
/** @typedef {import('./types.js').ChatMessage} ChatMessage */
/** @typedef {import('./types.js').AcpUpdate} AcpUpdate */
/** @typedef {import('./types.js').Envelope} Envelope */
/** @typedef {import('./types.js').ToolCallInfo} ToolCallInfo */
/** @typedef {import('./types.js').RuleValue} RuleValue */
/** @typedef {'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'} PermissionOption */

/**
 * @typedef {Object} Tool
 * @property {import('./types.js').ToolSpec} spec
 * @property {import('./types.js').ToolKind} kind
 * @property {boolean} [reserved]   passwords, payments: never done by Jean
 * @property {(args: any) => string} title
 * @property {(args: any) => import('./types.js').ToolCallLocation[]} [locations]
 * @property {(args: any, ctx: { signal?: AbortSignal }) => Promise<string>} run
 */

/**
 * @typedef {Object} TurnOptions
 * @property {BrainConfig} brain
 * @property {string} [apiKey]
 * @property {string} system
 * @property {ChatMessage[]} history                 includes the new user message
 * @property {Tool[]} [tools]
 * @property {string} [label]                        shown on the brain entry
 * @property {(kind: string, reserved: boolean) => RuleValue} [rule]
 * @property {(request: { toolCall: ToolCallInfo, step: number }) => Promise<PermissionOption>} [askPermission]
 * @property {(update: AcpUpdate, step: number) => void} [onUpdate]   live, including deltas
 * @property {(records: Envelope[]) => Promise<void>} [persist]      settled records
 * @property {AbortSignal} [signal]
 * @property {number} [maxSteps]
 * @property {typeof defaultStream} [stream]          injectable for tests
 */

/** @param {TurnOptions} options */
export async function runTurn(options) {
  const {
    brain, apiKey, system, tools = [], label, signal, maxSteps = 12, stream = defaultStream,
    rule = () => 'ask', askPermission = async () => 'reject_once',
    onUpdate = () => {}, persist = async () => {},
  } = options
  const history = [...options.history]
  const byName = new Map(tools.map((tool) => [tool.spec.name, tool]))
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }

  for (let step = 0; step < maxSteps; step++) {
    /** @type {ToolCallInfo} */
    const brainEntry = { toolCallId: `brain-${step}-${Date.now().toString(36)}`, title: label ?? brain.model, kind: 'think', status: 'in_progress', rawInput: { provider: brain.provider, model: brain.model } }
    onUpdate({ sessionUpdate: 'tool_call', ...brainEntry }, step)

    let text = ''
    let thought = ''
    /** @type {import('./types.js').ToolCall[]} */
    const calls = []
    /** @type {Extract<import('./types.js').StreamEvent, { type: 'done' }> | null} */
    let done = null
    try {
      const events = stream({ brain, apiKey, system, messages: history, tools: tools.map((tool) => tool.spec), signal })
      for await (const event of events) {
        if (event.type === 'text') {
          text += event.delta
          onUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: event.delta } }, step)
        } else if (event.type === 'thinking') {
          thought += event.delta
          onUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: event.delta } }, step)
        } else if (event.type === 'tool_call') calls.push(event.call)
        else if (event.type === 'done') done = event
      }
    } catch (error) {
      const failed = { ...brainEntry, status: /** @type {const} */ ('failed'), rawOutput: errorInfo(error) }
      onUpdate({ sessionUpdate: 'tool_call_update', ...failed }, step)
      await persist(stepRecords(step, failed, thought, text))
      throw error
    }

    const stopReason = done?.stopReason ?? 'other'
    if (done?.usage) {
      usage.inputTokens += done.usage.inputTokens ?? 0
      usage.outputTokens += done.usage.outputTokens ?? 0
      usage.cacheReadTokens += done.usage.cacheReadTokens ?? 0
    }
    const completed = { ...brainEntry, status: /** @type {const} */ ('completed'), rawOutput: { stopReason, usage: done?.usage } }
    // Thinking blocks are kept so later turns replay them unchanged (the cache depends on it).
    const raw = done?.message.raw
    if (Array.isArray(raw) && raw.some((block) => /thinking/.test(block?.type))) Object.assign(completed, { _meta: { raw } })
    onUpdate({ sessionUpdate: 'tool_call_update', ...completed }, step)
    await persist(stepRecords(step, completed, thought, text))
    history.push(done?.message ?? { role: 'assistant', content: text, toolCalls: calls })

    if (stopReason !== 'tool_use' || !calls.length) return { stopReason, usage, text }

    for (const call of calls) {
      const result = await runTool(call, byName.get(call.name), step, { rule, askPermission, onUpdate, signal })
      await persist([envelope('jean', { sessionUpdate: 'tool_call', ...result.info }, step)])
      history.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result.output, ...(result.failed && { isError: true }) })
    }
  }
  return { stopReason: 'max_steps', usage, text: '' }
}

/**
 * @param {number} step @param {ToolCallInfo} brainEntry @param {string} thought @param {string} text
 * @returns {Envelope[]}
 */
function stepRecords(step, brainEntry, thought, text) {
  /** @type {Envelope[]} */
  const records = [envelope('jean', { sessionUpdate: 'tool_call', ...brainEntry }, step)]
  if (thought) records.push(envelope('jean', { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: thought } }, step))
  if (text) records.push(envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }, step))
  return records
}

/**
 * @param {import('./types.js').ToolCall} call
 * @param {Tool | undefined} tool
 * @param {number} step
 * @param {Pick<Required<TurnOptions>, 'rule' | 'askPermission' | 'onUpdate'> & { signal?: AbortSignal }} ctx
 */
async function runTool(call, tool, step, { rule, askPermission, onUpdate, signal }) {
  /** @type {ToolCallInfo} */
  const info = {
    toolCallId: call.id,
    name: call.name,
    title: tool ? safe(() => tool.title(call.args), call.name) : call.name,
    kind: tool?.kind ?? 'other',
    rawInput: call.args,
    ...(tool?.locations && { locations: safe(() => tool.locations?.(call.args) ?? [], []) }),
  }
  onUpdate({ sessionUpdate: 'tool_call', ...info, status: 'pending' }, step)

  let output = ''
  let failed = true
  if (!tool) output = `There is no tool named "${call.name}".`
  else if (call.args && typeof call.args === 'object' && '__invalidJSON' in call.args) output = 'The arguments were not valid JSON. Try again.'
  else {
    let decision = rule(tool.kind, Boolean(tool.reserved))
    if (decision === 'ask') {
      const answer = await askPermission({ toolCall: info, step })
      decision = answer.startsWith('allow') ? 'allow' : 'never'
    }
    if (decision === 'never') output = 'The user declined this action.'
    else {
      onUpdate({ sessionUpdate: 'tool_call_update', toolCallId: call.id, status: 'in_progress' }, step)
      try {
        output = await tool.run(call.args, { signal })
        failed = false
      } catch (error) {
        output = `Error: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  const final = {
    ...info,
    status: /** @type {'failed' | 'completed'} */ (failed ? 'failed' : 'completed'),
    rawOutput: output,
    content: [{ type: /** @type {const} */ ('content'), content: { type: /** @type {const} */ ('text'), text: output } }],
  }
  onUpdate({ sessionUpdate: 'tool_call_update', ...final }, step)
  return { info: final, output, failed }
}

/** @template T @param {() => T} fn @param {T} fallback */
function safe(fn, fallback) {
  try {
    return fn()
  } catch {
    return fallback
  }
}

/** @param {unknown} error */
function errorInfo(error) {
  const err = /** @type {{ message?: string, code?: string, status?: number }} */ (error ?? {})
  return { error: err.message ?? String(error), code: err.code, status: err.status }
}
