// The agent loop: stream a reply, run tool calls under the rules, feed results
// back, repeat. Emits live ACP updates and persists settled records.
import { streamChat as defaultStream, LLMError } from './llm.js'
import { envelope } from './events.js'
import { signature } from './deferred.js'

/** @import { BrainConfig, ChatMessage, AcpUpdate, Envelope, ToolCall, ToolCallInfo, RuleValue, Source } from './types.js' */
/** @typedef {'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'} PermissionOption */

// A request that fails before anything of the answer came is asked again after these waits (D202),
// or after what the provider asks for, unless that is longer than LONGEST_WAIT.
const RETRIES = [1000, 2000, 4000]
const LONGEST_WAIT = 30_000

/**
 * @typedef {Object} Tool
 * @property {import('./types.js').ToolSpec} spec
 * @property {import('./types.js').ToolKind} kind
 * @property {boolean} [reserved]   passwords, payments: never done by Jean
 * @property {boolean} [hidden]     never declared to the brain; scripts can call it (codemode, D48)
 * @property {boolean} [deferred]   not declared when a conversation starts: found with find_tools (connections, D47)
 * @property {boolean} [asks]       waits for the user's answer when it runs (ask_user), so it is kept as pending meanwhile (D212)
 * @property {(args: any) => string} title
 * @property {(args: any) => import('./types.js').ToolCallLocation[]} [locations]
 * @property {(args: any, ctx: ToolContext) => Promise<Check | void>} [check]
 *   before a call the rules don't refuse: what its card shows, and whether to ask even if they allow it (a change in the user's folder, D141)
 * @property {(args: any, ctx: ToolContext) => Promise<string>} run
 */

/** @typedef {{ ask?: boolean, meta?: Record<string, any>, content?: import('./types.js').ToolCallContent[] }} Check */

/**
 * @typedef {Object} ToolContext
 * @property {AbortSignal} [signal]
 * @property {string[]} declared                                 tools the brain can call directly
 * @property {(name: string, args: any) => Promise<string>} call  a nested call, under the same rules
 * @property {(names: string[]) => void} declare                  declares tools from the next request on (D47)
 * @property {(sources: Source[]) => number[]} cite               numbers what the result brings in, as the brain cites it
 * @property {Record<string, any>} meta                           kept on the call's record (`_meta`), e.g. a picture it made
 * @property {import('./types.js').ToolCallContent[]} content     kept on the call's record before its result, e.g. the diff of a change (D141)
 * @property {PermissionOption} [answer]                          what the user answered, when the call was asked
 * @property {(child: Partial<TurnOptions>) => Promise<{ stopReason: string, text: string }>} turn
 *   a helper's turn: the same brain, rules and source numbers, its calls recorded under this one
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
 * @property {number} [firstSource]                  the number the turn's first new source is cited by (D71)
 * @property {Map<string, number>} [numbers]         sources numbered so far: a helper shares its parent's
 * @property {(kind: string, reserved: boolean) => RuleValue} [rule]
 * @property {(request: { toolCall: ToolCallInfo, step: number }) => Promise<PermissionOption>} [askPermission]
 * @property {(update: AcpUpdate, step: number) => void} [onUpdate]   live, including deltas
 * @property {(records: Envelope[]) => Promise<void>} [persist]      settled records
 * @property {AbortSignal} [signal]
 * @property {{ step: number, calls: ToolCall[] } | null} [resume]  calls a closed page left waiting for the user, run again in their step first (D212)
 * @property {number} [maxSteps]
 * @property {number[]} [retries]                    the waits before asking again, in ms (D202)
 * @property {typeof defaultStream} [stream]          injectable for tests
 */

/** @param {TurnOptions} options */
export async function runTurn(options) {
  const {
    brain, apiKey, system, label, meta, signal, maxSteps = 12, retries = RETRIES, stream = defaultStream,
    rule = () => 'ask', askPermission = async () => 'reject_once',
    onUpdate = () => {}, persist = async () => {},
  } = options
  const history = [...options.history]
  const tools = () => (typeof options.tools === 'function' ? options.tools() : options.tools ?? [])
  const declared = new Set(options.declared ?? tools().filter((tool) => !tool.hidden).map((tool) => tool.spec.name))
  // Sources are numbered as they come in (one cited again keeps its number), and recorded in `meta`.
  const numbers = options.numbers ?? new Map()
  /** @param {Source[]} sources @param {Record<string, any>} meta */
  const cite = (sources, meta) => sources.map((source) => {
    const key = source.url ?? source.title
    if (!numbers.has(key)) (meta.sources ??= []).push({ ...source, n: numbers.set(key, numbers.size + (options.firstSource ?? 1)).get(key) })
    return /** @type {number} */ (numbers.get(key))
  })
  const ctx = { rule, askPermission, onUpdate, persist, signal, byName: new Map(tools().map((tool) => [tool.spec.name, tool])), declared, tools, cite, options, numbers }
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
  // A step's calls, in order. One waiting for the user's answer is kept as pending meanwhile, with those after it, so a
  // page closed before the answer asks again when the conversation opens (D212).
  const runCalls = async (/** @type {ToolCall[]} */ calls, /** @type {number} */ step) => {
    for (const [i, call] of calls.entries()) {
      // A deferred tool called by the name <connections> gives it runs all the same (D104); a hidden one stays for scripts.
      const tool = ctx.byName.get(call.name)
      const waiting = (/** @type {ToolCallInfo} */ info) => persist(calls.slice(i).map((next, j) => envelope('jean', { sessionUpdate: 'tool_call', status: 'pending',
        ...(j ? { toolCallId: next.id, name: next.name, title: next.name, rawInput: next.args } : { ...info, _meta: { ...info._meta, waiting: true } }) }, step)))
      const result = await runTool(call, declared.has(call.name) || !tool?.hidden ? tool : undefined, step, ctx, undefined, waiting)
      history.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result.output, ...(result.failed && { isError: true }) })
    }
  }
  if (options.resume) await runCalls(options.resume.calls, options.resume.step)

  for (let step = options.resume ? options.resume.step + 1 : 0; step < maxSteps; step++) {
    const started = Date.now()
    /** @type {ToolCallInfo} */
    const brainEntry = { toolCallId: `brain-${step}-${started.toString(36)}`, title: label ?? brain.model, kind: 'think', status: 'in_progress', rawInput: { provider: brain.provider, model: brain.model, ...meta } }
    ctx.byName = new Map(tools().map((tool) => [tool.spec.name, tool]))
    onUpdate({ sessionUpdate: 'tool_call', ...brainEntry }, step)

    let text = ''
    let thought = ''
    const cited = /** @type {Record<string, any>} */ ({})
    /** @type {import('./types.js').ToolCall[]} */
    const calls = []
    /** @type {Extract<import('./types.js').StreamEvent, { type: 'done' }> | null} */
    let done = null
    try {
      const specs = [...ctx.byName.values()].filter((tool) => declared.has(tool.spec.name)).map((tool) => tool.spec)
      for (let attempt = 0, heard = false; ; attempt++) {
        try {
          for await (const event of stream({ brain, apiKey, system, messages: history, tools: specs, signal })) {
            heard = true
            if (event.type === 'text') {
              text += event.delta
              onUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: event.delta } }, step)
            } else if (event.type === 'thinking') {
              thought += event.delta
              onUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: event.delta } }, step)
            } else if (event.type === 'cite') {
              // The brain's own search cites pages after what it just wrote.
              const marks = ` [${[...new Set(cite(event.sources, cited))].join(', ')}]`
              text += marks
              onUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: marks } }, step)
            } else if (event.type === 'tool_call') calls.push(event.call)
            else if (event.type === 'done') done = event
          }
          break
        } catch (error) {
          // Nothing of the answer came, and it may pass: asked again after a moment, which its entry says meanwhile.
          const wait = heard || signal?.aborted ? undefined : retryWait(error, retries[attempt])
          if (wait === undefined) throw error
          onUpdate({ sessionUpdate: 'tool_call_update', toolCallId: brainEntry.toolCallId, _meta: { retrying: true } }, step)
          await pause(wait, signal)
          if (signal?.aborted) throw new LLMError('Request aborted', { code: 'aborted' })
          onUpdate({ sessionUpdate: 'tool_call_update', toolCallId: brainEntry.toolCallId, _meta: { retrying: false } }, step)
        }
      }
    } catch (error) {
      const failed = { ...brainEntry, status: /** @type {const} */ ('failed'), rawOutput: errorInfo(error), _meta: { ms: Date.now() - started } }
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
    // Thinking blocks and the provider's own search results are replayed unchanged by later turns.
    // How long it took is kept for the activity view.
    const raw = done?.message.raw
    const kept = { ...cited, ...(Array.isArray(raw) && raw.some((block) => !/^(text|tool_use)$/.test(block?.type)) && { raw }), ms: Date.now() - started }
    const completed = { ...brainEntry, status: /** @type {const} */ ('completed'), rawOutput: { stopReason, usage: done?.usage }, _meta: kept }
    onUpdate({ sessionUpdate: 'tool_call_update', ...completed }, step)
    await persist(stepRecords(step, completed, thought, text))
    history.push(done?.message ?? { role: 'assistant', content: text, toolCalls: calls })

    if (stopReason === 'pause') continue
    if (stopReason !== 'tool_use' || !calls.length) return { stopReason, usage, text }
    await runCalls(calls, step)
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
 * @param {Pick<Required<TurnOptions>, 'rule' | 'askPermission' | 'onUpdate' | 'persist'> & { signal?: AbortSignal, byName: Map<string, Tool>, declared: Set<string>, tools: () => Tool[],
 *   cite: (sources: Source[], meta: Record<string, any>) => number[], options: TurnOptions, numbers: Map<string, number> }} ctx
 * @param {string} [parent]
 * @param {(info: ToolCallInfo) => Promise<void>} [waiting] keeps the call as pending while it waits for the user (D212)
 */
async function runTool(call, tool, step, ctx, parent, waiting) {
  const { rule, askPermission, onUpdate, signal } = ctx
  // Stopped: nothing more runs, and nothing more is asked.
  if (signal?.aborted) throw new LLMError('Request aborted', { code: 'aborted' })
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
  let nested = 0
  /** @type {number | undefined} how long it ran, for the activity view */
  let ms
  /** @type {ToolContext} */
  const context = {
    signal,
    meta: {},
    content: [],
    cite: (sources) => ctx.cite(sources, context.meta),
    declared: [...ctx.declared],
    call: async (name, args) => {
      const known = ctx.tools().find((candidate) => candidate.spec.name === name)
      const result = await runTool({ id: `${call.id}.${++nested}`, name, args }, known, step, ctx, call.id)
      if (result.failed) throw new Error(result.output)
      return result.output
    },
    declare: (names) => {
      for (const name of names) ctx.declared.add(name)
      ;(context.meta.declare ??= []).push(...names)
    },
    // A helper's text is its result; its calls are kept, under this one, never as pending: a closed page asks its questions no more (D212).
    turn: (child) => runTurn({
      ...ctx.options, label: undefined, meta: undefined, ...child, numbers: ctx.numbers,
      askPermission: (request) => ctx.askPermission({ ...request, toolCall: under(request.toolCall, call.id) }),
      onUpdate: (update) => 'toolCallId' in update && onUpdate(under(update, call.id), step),
      persist: (records) => ctx.persist(records.flatMap(({ update, ...record }) => (update && 'toolCallId' in update && update.status !== 'pending' ? [{ ...record, step, update: under(update, call.id) }] : []))),
    }),
  }
  if (!tool) output = `There is no tool named "${call.name}".${ctx.declared.has('find_tools') ? ' Use find_tools to look for one.' : ''}`
  else if (call.args && typeof call.args === 'object' && '__invalidJSON' in call.args) output = 'The arguments were not valid JSON. Try again.'
  // The brain hasn't seen a deferred tool's schema: without what it requires, it learns how to call it.
  else if (!parent && !ctx.declared.has(call.name) && lacking(tool, call.args).length) output = `It needs ${lacking(tool, call.args).join(', ')}. Call it like this:\n${signature(tool)}`
  else {
    let decision = rule(tool.kind, Boolean(tool.reserved))
    // A check that fails asks nothing: the run says what is wrong.
    const checked = decision === 'never' ? undefined : await tool.check?.(call.args, context).catch(() => undefined)
    if (checked?.meta) info._meta = { ...info._meta, ...checked.meta }
    if (decision === 'ask' || checked?.ask) {
      await waiting?.(info)
      context.answer = await askPermission({ toolCall: { ...info, ...(checked?.content && { content: checked.content }) }, step })
      decision = context.answer.startsWith('allow') ? 'allow' : 'never'
    }
    if (decision === 'never') {
      output = 'The user declined this action.'
      context.meta.declined = true
    } else {
      if (tool.asks) await waiting?.(info)
      onUpdate({ sessionUpdate: 'tool_call_update', toolCallId: call.id, status: 'in_progress' }, step)
      // Its start is kept, so a page closed while it runs leaves it cut short, not unsaid; a question is kept as pending instead (D212).
      if (!parent && !tool.asks) await ctx.persist([envelope('jean', { sessionUpdate: 'tool_call', ...info, status: 'in_progress' }, step)])
      const started = Date.now()
      try {
        output = await tool.run(call.args, context)
        failed = false
      } catch (error) {
        output = `Error: ${error instanceof Error ? error.message : String(error)}`
      }
      ms = Date.now() - started
    }
  }
  const final = {
    ...info,
    status: /** @type {'failed' | 'completed'} */ (failed ? 'failed' : 'completed'),
    rawOutput: output,
    content: [...(failed ? [] : context.content), { type: /** @type {const} */ ('content'), content: { type: /** @type {const} */ ('text'), text: output } }],
    ...((ms !== undefined || Object.keys(context.meta).length) && { _meta: { ...info._meta, ...context.meta, ms } }),
  }
  onUpdate({ sessionUpdate: 'tool_call_update', ...final }, step)
  await ctx.persist([envelope('jean', { sessionUpdate: 'tool_call', ...final }, step)])
  return { info: final, output, failed }
}

/**
 * A helper's call under the one that started it: its own id, prefixed so helpers never clash,
 * and without what a brain keeps for replay. @template {{ toolCallId: string, _meta?: Record<string, any> }} T
 * @param {T} update @param {string} parent @returns {T}
 */
const under = (update, parent) => ({ ...update, toolCallId: `${parent}/${update.toolCallId}`, _meta: { ...update._meta, raw: undefined, parent: update._meta?.parent ? `${parent}/${update._meta.parent}` : parent } })

/** The arguments a tool requires that a call leaves out. @param {Tool} tool @param {any} args @returns {string[]} */
const lacking = ({ spec }, args) => (/** @type {any} */ (spec.parameters).required ?? []).filter((/** @type {string} */ name) => args?.[name] == null)

/** @template T @param {() => T} fn @param {T} fallback */
function safe(fn, fallback) {
  try {
    return fn()
  } catch {
    return fallback
  }
}

/**
 * How long to wait before asking again, or undefined when it wouldn't help.
 * @param {unknown} error @param {number | undefined} planned
 */
function retryWait(error, planned) {
  if (planned === undefined || !(error instanceof LLMError) || !error.retryable) return undefined
  const wait = Math.max(planned, error.retryAfter ?? 0)
  return wait <= LONGEST_WAIT ? wait : undefined
}

/** Waits, unless stopped meanwhile. @param {number} ms @param {AbortSignal} [signal] @returns {Promise<void>} */
const pause = (ms, signal) => new Promise((resolve) => {
  const end = () => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', end)
    resolve()
  }
  const timer = setTimeout(end, signal?.aborted ? 0 : ms)
  signal?.addEventListener('abort', end)
})

/** @param {unknown} error */
function errorInfo(error) {
  const err = /** @type {{ message?: string, code?: string, status?: number }} */ (error ?? {})
  return { error: err.message ?? String(error), code: err.code, status: err.status }
}
