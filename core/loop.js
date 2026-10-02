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
 * @property {boolean} [hidden]     never declared to the brain; scripts can call it (codemode, D48)
 * @property {(args: any) => string} title
 * @property {(args: any) => import('./types.js').ToolCallLocation[]} [locations]
 * @property {(args: any, ctx: ToolContext) => Promise<string>} run
 */

/**
 * @typedef {Object} ToolContext
 * @property {AbortSignal} [signal]
 * @property {string[]} declared                                 tools the brain can call directly
 * @property {(name: string, args: any) => Promise<string>} call  a nested call, under the same rules
 * @property {(names: string[]) => void} declare                  declares tools from the next request on (D47)
 */

/**
 * @typedef {Object} TurnOptions
 * @property {BrainConfig} brain
 * @property {string} [apiKey]
 * @property {string} system
 * @property {ChatMessage[]} history                 includes the new user message
 * @property {Tool[] | (() => Tool[])} [tools]      every tool that can be called, directly or from a script;
 *   a function is read again at each step, so a capability turned on mid-turn can be called
 * @property {string[]} [declared]                   the ones the brain sees (default: all but hidden ones)
 * @property {string} [label]                        shown on the brain entry
 * @property {Record<string, any>} [meta]            recorded on the brain entry (why Auto chose it)
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
    brain, apiKey, system, label, meta, signal, maxSteps = 12, stream = defaultStream,
    rule = () => 'ask', askPermission = async () => 'reject_once',
    onUpdate = () => {}, persist = async () => {},
  } = options
  const history = [...options.history]
  const tools = () => (typeof options.tools === 'function' ? options.tools() : options.tools ?? [])
  const declared = new Set(options.declared ?? tools().filter((tool) => !tool.hidden).map((tool) => tool.spec.name))
  const ctx = { rule, askPermission, onUpdate, persist, signal, byName: new Map(), declared, tools }
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }

  for (let step = 0; step < maxSteps; step++) {
    /** @type {ToolCallInfo} */
    const brainEntry = { toolCallId: `brain-${step}-${Date.now().toString(36)}`, title: label ?? brain.model, kind: 'think', status: 'in_progress', rawInput: { provider: brain.provider, model: brain.model, ...meta } }
    ctx.byName = new Map(tools().map((tool) => [tool.spec.name, tool]))
    onUpdate({ sessionUpdate: 'tool_call', ...brainEntry }, step)

    let text = ''
    let thought = ''
    /** @type {import('./types.js').ToolCall[]} */
    const calls = []
    /** @type {Extract<import('./types.js').StreamEvent, { type: 'done' }> | null} */
    let done = null
    try {
      const specs = [...ctx.byName.values()].filter((tool) => declared.has(tool.spec.name)).map((tool) => tool.spec)
      const events = stream({ brain, apiKey, system, messages: history, tools: specs, signal })
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
      const result = await runTool(call, declared.has(call.name) ? ctx.byName.get(call.name) : undefined, step, ctx)
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
 * Runs one call under the rules and persists its final record. Scripts' calls are nested:
 * they carry their parent's id, and the brain's context leaves them out.
 * @param {import('./types.js').ToolCall} call
 * @param {Tool | undefined} tool
 * @param {number} step
 * @param {Pick<Required<TurnOptions>, 'rule' | 'askPermission' | 'onUpdate' | 'persist'> & { signal?: AbortSignal, byName: Map<string, Tool>, declared: Set<string>, tools: () => Tool[] }} ctx
 * @param {string} [parent]
 */
async function runTool(call, tool, step, ctx, parent) {
  const { rule, askPermission, onUpdate, signal } = ctx
  /** @type {ToolCallInfo} */
  const info = {
    toolCallId: call.id,
    name: call.name,
    title: tool ? safe(() => tool.title(call.args), call.name) : call.name,
    kind: tool?.kind ?? 'other',
    rawInput: call.args,
    ...(tool?.locations && { locations: safe(() => tool.locations?.(call.args) ?? [], []) }),
    ...(parent && { _meta: { parent } }),
  }
  onUpdate({ sessionUpdate: 'tool_call', ...info, status: 'pending' }, step)

  let output = ''
  let failed = true
  /** @type {string[]} */
  const declares = []
  let nested = 0
  /** @type {ToolContext} */
  const context = {
    signal,
    declared: [...ctx.declared],
    call: async (name, args) => {
      const known = ctx.tools().find((candidate) => candidate.spec.name === name)
      const result = await runTool({ id: `${call.id}.${++nested}`, name, args }, known, step, ctx, call.id)
      if (result.failed) throw new Error(result.output)
      return result.output
    },
    declare: (names) => {
      for (const name of names) ctx.declared.add(name)
      declares.push(...names)
    },
  }
  if (!tool) output = `There is no tool named "${call.name}".${ctx.declared.has('find_tools') ? ' Use find_tools to look for one.' : ''}`
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
        output = await tool.run(call.args, context)
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
    ...(declares.length && { _meta: { ...info._meta, declare: declares } }),
  }
  onUpdate({ sessionUpdate: 'tool_call_update', ...final }, step)
  await ctx.persist([envelope('jean', { sessionUpdate: 'tool_call', ...final }, step)])
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
