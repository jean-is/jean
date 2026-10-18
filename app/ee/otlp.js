// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// Jean's records (D299, D308) as OpenTelemetry traces in its GenAI conventions, sent over OTLP/HTTP
// as JSON (D386). A turn is an `invoke_agent` span; under it, each request to a brain is a `chat`
// span and each call an `execute_tool` span, a script's or a helper's calls under the call that
// made them. Metadata only, unless `content`: then what was asked and answered, what each brain
// wrote, and each call's arguments and result go too, as JSON strings. What left for good, once it
// is gone, is a span of its own, in no turn: records going back to a request left out, a task deleted,
// a profile removed. Host-agnostic: fetch and Web Crypto, tested under node --test.

/**
 * @typedef {{ key: string, value: Record<string, unknown> }} KeyValue
 * @typedef {{ traceId: string, spanId: string, parentSpanId?: string, name: string, kind: number, startTimeUnixNano: string, endTimeUnixNano: string,
 *   attributes: KeyValue[], status: { code: number, message?: string } }} Span
 * @typedef {import('../core/types.js').Envelope} Envelope
 * @typedef {{ task: string, type: string, record?: Envelope, records?: Envelope[], all?: boolean } | { type: 'removed', profile: string }} RecordEvent
 *   the `record` event; once a profile is gone, it names it in place of a task (D412)
 * @typedef {{ task: string, at: string, answer?: string, aborted?: boolean, routine?: unknown }} TurnEnd  what of `turn.end` it reads
 */

const KIND = { internal: 1, client: 3 }
const STATUS = { ok: 1, error: 2 }
/** Jean's providers under OpenTelemetry's names, where it has one; the others go by Jean's. */
const PROVIDERS = /** @type {Record<string, string>} */ ({ anthropic: 'anthropic', openai: 'openai', mistral: 'mistral', groq: 'groq', gemini: 'gcp.gemini', vertex: 'gcp.vertex_ai', xai: 'x_ai' })
/** Why a brain stopped, as OpenTelemetry says it. */
const FINISH = /** @type {Record<string, string>} */ ({ end_turn: 'stop', tool_use: 'tool_call', max_tokens: 'length', refusal: 'content_filter' })

/** @param {number} size in bytes */
const hex = (size) => [...crypto.getRandomValues(new Uint8Array(size))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
/** @param {number} ms */
const nanos = (ms) => String(BigInt(Math.round(ms)) * 1_000_000n)

/** An attribute's value in OTLP's JSON. @param {unknown} value @returns {Record<string, unknown>} */
const any = (value) => (typeof value === 'boolean' ? { boolValue: value }
  : Number.isInteger(value) ? { intValue: String(value) }
  : typeof value === 'number' ? { doubleValue: value }
  : Array.isArray(value) && value.every((each) => typeof each === 'string') ? { arrayValue: { values: value.map(any) } }
  : { stringValue: typeof value === 'string' ? value : JSON.stringify(value) })

/** The attributes that have a value. @param {Record<string, unknown>} given @returns {KeyValue[]} */
export const attributes = (given) => Object.entries(given).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => ({ key, value: any(value) }))

/** A conversation's id, the ULID its file is named by. @param {string} task */
const conversationOf = (task) => /([0-9A-HJKMNP-TV-Z]{26})\.jsonl$/.exec(task)?.[1] ?? task
/** Its project's id, what other products call an agent. @param {string} task */
const projectOf = (task) => /(?:^|\/)projects\/([0-9A-HJKMNP-TV-Z]{26})/.exec(task)?.[1]
/** A profile's id, the ULID its folder begins with, never the name after it. @param {string} dir */
export const profileOf = (dir) => /(?:^|\/)profiles\/([0-9A-HJKMNP-TV-Z]{26})/.exec(dir)?.[1]
/** @param {Envelope['update']} update @returns {string} */
const textOf = (update) => (/** @type {any} */ (update)?.content?.type === 'text' ? /** @type {any} */ (update).content.text : '')

/**
 * Follows the `record` and `turn.end` events and makes a span of each turn, request and call as it ends,
 * and of each removal once it is done, given to `send`; a span already given takes what its brain wrote,
 * which is kept just after it.
 * @param {{ send: (span: Span) => void, content?: boolean, serviceOf?: (tool: string) => string | undefined, now?: () => number }} options
 */
export function tracer({ send, content = false, serviceOf = () => undefined, now = Date.now }) {
  /**
   * Each task's turn under way: its trace, its own span, what was asked, the span of each call by id,
   * when each call began, and its last request to a brain, which what that brain wrote follows.
   * @typedef {{ traceId: string, spanId: string, asked: string, ids: Map<string, string>, began: Map<string, number>, last?: { span: Span, parts: { type: string, content: string }[], finish?: string } }} Turn
   * @type {Map<string, Turn>}
   */
  const turns = new Map()
  /** @param {string} task @param {string} [asked] @returns {Turn} */
  const fresh = (task, asked = '') => /** @type {Turn} */ (turns.set(task, { traceId: hex(16), spanId: hex(8), asked, ids: new Map(), began: new Map() }).get(task))
  /** @param {Turn} turn @param {string} id */
  const idOf = (turn, id) => turn.ids.get(id) ?? /** @type {string} */ (turn.ids.set(id, hex(8)).get(id))
  /** A span of a moment, a trace of its own. @param {string} name @param {Record<string, unknown>} given @returns {Span} */
  const instant = (name, given) => {
    const at = nanos(now())
    return { traceId: hex(16), spanId: hex(8), name, kind: KIND.internal, startTimeUnixNano: at, endTimeUnixNano: at, attributes: attributes(given), status: { code: STATUS.ok } }
  }
  /** What leaving a task tells, all of it or not. @param {string} task @param {Envelope[] | undefined} records @param {boolean} all */
  const removed = (task, records, all) => instant('remove_records',
    { 'gen_ai.conversation.id': conversationOf(task), 'gen_ai.agent.id': projectOf(task), 'jean.records.removed': records?.length ?? 0, 'jean.removed.all': all })

  /** @param {Turn} turn @param {string} task @param {any} call @param {number} end */
  function spanOf(turn, task, call, end) {
    const meta = call._meta ?? {}
    const begin = turn.began.get(call.toolCallId) ?? (typeof meta.ms === 'number' ? end - meta.ms : end)
    turn.began.delete(call.toolCallId)
    const brain = !call.name && call.kind === 'think'
    const failed = call.status === 'failed' && !meta.declined
    const raw = call.rawInput ?? {}
    const usage = call.rawOutput?.usage ?? {}
    const finish = FINISH[call.rawOutput?.stopReason] ?? call.rawOutput?.stopReason
    const service = brain ? undefined : serviceOf(call.name)
    /** @type {Span} */
    const span = {
      traceId: turn.traceId,
      spanId: idOf(turn, call.toolCallId),
      parentSpanId: meta.parent ? idOf(turn, meta.parent) : turn.spanId,
      name: brain ? `chat ${raw.model ?? ''}`.trim() : `execute_tool ${call.name}`,
      kind: brain ? KIND.client : KIND.internal,
      startTimeUnixNano: nanos(begin),
      endTimeUnixNano: nanos(end),
      attributes: attributes(brain ? {
        'gen_ai.operation.name': 'chat',
        'gen_ai.provider.name': PROVIDERS[raw.provider] ?? raw.provider,
        'gen_ai.request.model': raw.model,
        'gen_ai.conversation.id': conversationOf(task),
        'gen_ai.usage.input_tokens': usage.inputTokens,
        'gen_ai.usage.output_tokens': usage.outputTokens,
        'gen_ai.usage.cache_read.input_tokens': usage.cacheReadTokens || undefined,
        'gen_ai.response.finish_reasons': finish && [finish],
        'jean.brain.local': raw.local,
        'error.type': failed ? call.rawOutput?.code ?? 'error' : undefined,
      } : {
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': call.name,
        'gen_ai.tool.call.id': call.toolCallId,
        'gen_ai.tool.type': service ? 'extension' : 'function',
        'gen_ai.conversation.id': conversationOf(task),
        'jean.tool.kind': call.kind,
        'jean.tool.service': service,
        'jean.decision': meta.decision,
        'jean.decided_by': meta.by,
        'jean.declined': meta.declined,
        'error.type': failed ? 'tool_error' : undefined,
        ...(content && { 'gen_ai.tool.call.arguments': call.rawInput, 'gen_ai.tool.call.result': failed ? undefined : call.rawOutput }),
      }),
      status: failed ? { code: STATUS.error, message: String(call.rawOutput?.error ?? '').slice(0, 200) || undefined } : { code: STATUS.ok },
    }
    if (brain) turn.last = { span, parts: [], finish }
    return span
  }

  return {
    /** @param {RecordEvent} e */
    record(e) {
      if ('profile' in e) return send(instant('remove_profile', { 'jean.profile.id': profileOf(e.profile) }))
      const { task, type, record, records, all = false } = e
      if (type === 'removed') return send(removed(task, records, all))
      const update = /** @type {any} */ (record?.update)
      const at = Date.parse(record?.at ?? '') || now()
      // A new request starts a turn; one sent while the brain works (steering) belongs to the turn under way.
      if (type === 'user_message_chunk' && !(update._meta?.steer && turns.has(task))) return void fresh(task, textOf(update))
      const turn = turns.get(task) ?? fresh(task)
      if (type === 'agent_message_chunk' || type === 'agent_thought_chunk') {
        if (content && turn.last && textOf(update)) {
          turn.last.parts.push({ type: type === 'agent_message_chunk' ? 'text' : 'reasoning', content: textOf(update) })
          turn.last.span.attributes = [...turn.last.span.attributes.filter((one) => one.key !== 'gen_ai.output.messages'),
            ...attributes({ 'gen_ai.output.messages': [{ role: 'assistant', parts: turn.last.parts, ...(turn.last.finish && { finish_reason: turn.last.finish }) }] })]
        }
        return
      }
      if (type !== 'tool_call') return
      if (update.status === 'completed' || update.status === 'failed') send(spanOf(turn, task, update, at))
      else if (!turn.began.has(update.toolCallId)) turn.began.set(update.toolCallId, at)
    },
    /** @param {TurnEnd} e */
    end({ task, at, answer, aborted, routine }) {
      const turn = turns.get(task)
      if (!turn) return
      turns.delete(task)
      send({
        traceId: turn.traceId,
        spanId: turn.spanId,
        name: 'invoke_agent',
        kind: KIND.internal,
        startTimeUnixNano: nanos(Date.parse(at) || now()),
        endTimeUnixNano: nanos(now()),
        attributes: attributes({
          'gen_ai.operation.name': 'invoke_agent',
          'gen_ai.conversation.id': conversationOf(task),
          'gen_ai.agent.id': projectOf(task),
          'jean.turn.stopped': aborted || undefined,
          'jean.routine': routine ? true : undefined,
          ...(content && {
            'gen_ai.input.messages': turn.asked ? [{ role: 'user', parts: [{ type: 'text', content: turn.asked }] }] : undefined,
            'gen_ai.output.messages': answer ? [{ role: 'assistant', parts: [{ type: 'text', content: answer }], finish_reason: 'stop' }] : undefined,
          }),
        }),
        status: { code: STATUS.ok },
      })
    },
  }
}

/** A keepalive request carries 64 KiB at most. */
const LEAVING = 60_000

/**
 * Sends spans to the collector in batches, every few seconds or as soon as many wait. A batch
 * refused for now (the network, 408, 429, 5xx) goes again later, waiting twice as long each time;
 * one refused for good (another 4xx) is dropped. At most `max` wait, the oldest let go first:
 * best effort, as docs/enterprise.md says. Leaving the page sends what fits in one keepalive request.
 * @param {{ endpoint: string, resource: () => Record<string, unknown>, headers?: () => Promise<Record<string, string>>, fetch?: typeof globalThis.fetch, every?: number, max?: number, batch?: number }} options
 */
export function exporter({ endpoint, resource, headers = async () => ({}), fetch = globalThis.fetch, every = 5000, max = 5000, batch = 500 }) {
  /** @type {Span[]} */
  let queue = []
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  let wait = every
  let sending = false
  /** The last credentials, which leaving uses since it can't wait for them. @type {Record<string, string>} */
  let last = {}
  /** @param {Span[]} spans */
  const body = (spans) => JSON.stringify({ resourceSpans: [{ resource: { attributes: attributes(resource()) }, scopeSpans: [{ scope: { name: 'jean' }, spans }] }] })
  /** The next batch, after a wait, with the credentials it will need meanwhile. */
  function later() {
    if (timer) return
    timer = setTimeout(() => flush(), wait)
    headers().then((given) => { last = given }, () => {})
  }

  /** @param {boolean} [leaving] */
  async function flush(leaving = false) {
    clearTimeout(timer)
    timer = undefined
    if (!queue.length || (sending && !leaving)) return
    const spans = queue.splice(0, batch)
    if (leaving) {
      while (spans.length > 1 && body(spans).length > LEAVING) queue.unshift(/** @type {Span} */ (spans.pop()))
      return void fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...last }, body: body(spans), keepalive: true }).catch(() => {})
    }
    sending = true
    try {
      last = await headers()
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...last }, body: body(spans) })
      if (!res.ok && (res.status >= 500 || res.status === 408 || res.status === 429)) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) console.warn('Audit', `the collector refused ${spans.length} spans (HTTP ${res.status})`)
      wait = every
    } catch (error) {
      queue = [...spans, ...queue].slice(-max)
      wait = Math.min(wait * 2, 300_000)
    } finally {
      sending = false
      if (queue.length) later()
    }
  }

  return {
    /** @param {Span} span */
    add(span) {
      queue.push(span)
      if (queue.length > max) queue.shift()
      if (queue.length >= batch) flush()
      else later()
    },
    flush,
    /** How many wait. */
    get waiting() { return queue.length },
  }
}
