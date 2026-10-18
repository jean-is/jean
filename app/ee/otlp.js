// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// Jean's records (D299, D308) as OpenTelemetry traces in its GenAI conventions, sent over OTLP/HTTP
// as JSON (D386). A turn is an `invoke_agent` span; under it, each request to a brain is a `chat`
// span and each call an `execute_tool` span, a script's or a helper's calls under the call that
// made them. Metadata only, unless `content`: then what was asked and answered, what each brain
// wrote, and each call's arguments and result go too, as JSON strings. What left for good, once it
// is gone, is a span of its own, in no turn: records going back to a request left out, a task deleted,
// a profile removed. So is what was done outside the records (`act`, D421): a skill, a connection, a
// routine or a link added or removed, an answer or a task taken away; each skill used is a span in its
// turn, and a routine's run says which. Host-agnostic: fetch and Web Crypto, tested under node --test.
import { skillNamed } from '../core/skills.js'

/**
 * @typedef {{ key: string, value: Record<string, unknown> }} KeyValue
 * @typedef {{ traceId: string, spanId: string, parentSpanId?: string, name: string, kind: number, startTimeUnixNano: string, endTimeUnixNano: string,
 *   attributes: KeyValue[], status: { code: number, message?: string } }} Span
 * @typedef {import('../core/types.js').Envelope} Envelope
 * @typedef {{ task: string, type: string, record?: Envelope, records?: Envelope[], all?: boolean } | { type: 'removed', profile: string }} RecordEvent
 *   the `record` event; once a profile is gone, it names it in place of a task (D412)
 * @typedef {{ task: string, at: string, answer?: string, aborted?: boolean, routine?: unknown }} TurnEnd  what of `turn.end` it reads
 * @typedef {{ type: string, task?: string, path?: string, address?: string, title?: string } & Record<string, unknown>} Act
 *   the `act` event (D421): what was done to what (`skill.add`), the task it was done in, the file of what it was done to, the host
 *   it reached, its title, which only content tells, and the rest of what it was about, metadata
 * @typedef {{ id: string, address?: string }} Service  the connection a call reached, and its host
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
/** The id of what a file holds, the ULID it is named by (a routine's). @param {unknown} path */
const idIn = (path) => /([0-9A-HJKMNP-TV-Z]{26})\.\w+$/.exec(String(path ?? ''))?.[1]
/** @param {Envelope['update']} update @returns {string} */
const textOf = (update) => (/** @type {any} */ (update)?.content?.type === 'text' ? /** @type {any} */ (update).content.text : '')

/**
 * Follows the `record` and `turn.end` events and makes a span of each turn, request and call as it ends,
 * and of each removal once it is done, given to `send`; a span already given takes what its brain wrote,
 * which is kept just after it; and follows `act`, a span each (D421).
 * @param {{ send: (span: Span) => void, content?: boolean, serviceOf?: (tool: string) => Service | undefined, now?: () => number }} options
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
  /**
   * What the notes before a task's requests said of them (D421), which its turn's end tells: each skill they use, named with / or by
   * a mode of the box, and the routine whose run it is.
   * @type {Map<string, { skills: { name: string, via: 'name' | 'mode' }[], routine?: { routine: string, asked?: boolean, file?: string } }>}
   */
  const told = new Map()
  /**
   * A span of a moment: a trace of its own, or in a turn's, under its span or one of its calls'.
   * @param {string} name @param {Record<string, unknown>} given @param {{ turn?: Turn, parent?: string, at?: number }} [where] @returns {Span}
   */
  const instant = (name, given, { turn, parent = turn?.spanId, at = now() } = {}) => ({ traceId: turn?.traceId ?? hex(16), spanId: hex(8), ...(parent && { parentSpanId: parent }),
    name, kind: KIND.internal, startTimeUnixNano: nanos(at), endTimeUnixNano: nanos(at), attributes: attributes(given), status: { code: STATUS.ok } })
  /**
   * A skill used in a turn, and how: the brain's call read its steps (`call`, under it), the box named it with / (`name`), or one of
   * its modes follows it (`mode`). @param {string} task @param {string} name @param {'call' | 'name' | 'mode'} via @param {{ turn: Turn, parent?: string, at: number }} where
   */
  const used = (task, name, via, where) => instant('use_skill', { 'gen_ai.conversation.id': conversationOf(task), 'jean.skill.name': name, 'jean.skill.via': via }, where)
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
        'jean.tool.service': service?.id,
        'server.address': service?.address,
        'jean.decision': meta.decision,
        'jean.decided_by': meta.by,
        'jean.declined': meta.declined,
        'error.type': failed ? 'tool_error' : undefined,
        ...(content && { 'gen_ai.tool.call.arguments': call.rawInput, 'gen_ai.tool.call.result': failed ? undefined : call.rawOutput }),
      }),
      // An error's words are a tool's or a server's, which may name anyone: content (D427).
      status: failed ? { code: STATUS.error, ...(content && { message: String(call.rawOutput?.error ?? '').slice(0, 200) || undefined }) } : { code: STATUS.ok },
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
      // The notes before a request: the skills it names or a mode follows, the routine whose run it is, which its turn's end tells (D421).
      const data = type === '_system_note' ? update.data : undefined
      if (data?.kind === 'mentions' || data?.kind === 'mode' || data?.kind === 'routine') {
        const notes = told.get(task) ?? { skills: [] }
        told.set(task, notes)
        if (data.kind === 'routine') notes.routine = data
        else for (const name of data.kind === 'mode' ? [data.mode] : data.skills ?? []) notes.skills.push({ name, via: data.kind === 'mode' ? 'mode' : 'name' })
        return
      }
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
      // A skill's steps read, not a file beside them, is the skill used (D421).
      const named = update.name === 'skill' && update.status === 'completed' ? skillNamed(String(update.rawInput?.name ?? '')) : ''
      if (named && !named.includes('/')) send(used(task, named, 'call', { turn, parent: idOf(turn, update.toolCallId), at }))
    },
    /** @param {TurnEnd} e */
    end({ task, at, answer, aborted, routine }) {
      const turn = turns.get(task)
      const { skills = [], routine: ran } = told.get(task) ?? {}
      told.delete(task)
      if (!turn) return
      turns.delete(task)
      for (const { name, via } of skills) send(used(task, name, via, { turn, at: Date.parse(at) || now() }))
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
          // A routine's run: which, and what set it off (D421).
          'jean.routine.id': idIn(ran?.routine),
          'jean.routine.trigger': ran && (ran.asked ? 'person' : ran.file ? 'file' : 'schedule'),
          ...(content && {
            'gen_ai.input.messages': turn.asked ? [{ role: 'user', parts: [{ type: 'text', content: turn.asked }] }] : undefined,
            'gen_ai.output.messages': answer ? [{ role: 'assistant', parts: [{ type: 'text', content: answer }], finish_reason: 'stop' }] : undefined,
          }),
        }),
        status: { code: STATUS.ok },
      })
    },
    /**
     * What was done outside the records (D421), as a span named for it, `skill.add` as `add_skill`, in the turn
     * under way in its task, if any: the file's id as `jean.<what>.id`, never its path, the host as `server.address`,
     * the title only with content, and the rest as `jean.<what>.<key>`.
     * @param {Act} e
     */
    act({ type, task, path, address, title, ...about }) {
      const [what, done] = type.split('.')
      if (!done) return
      send(instant(`${done}_${what}`, {
        'gen_ai.conversation.id': task && conversationOf(task),
        'gen_ai.agent.id': task && projectOf(task),
        [`jean.${what}.id`]: idIn(path),
        'server.address': address,
        ...Object.fromEntries(Object.entries(about).map(([key, value]) => [`jean.${what}.${key}`, value])),
        ...(content && { [`jean.${what}.title`]: title }),
      }, { turn: task ? turns.get(task) : undefined }))
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
