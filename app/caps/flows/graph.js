// A task drawn as a flow (D218): its requests, each step of the brain, the calls it made side by
// side, what ran inside them, and its answers, from the records the conversation shows, with what
// each is doing or became (D216). A run of a saved flow is drawn as that flow is laid out.
// Host-agnostic: no DOM, tested under node --test.
import { COLUMN, LINE, inputsOf, kindOf } from './run.js'

/** @import { ToolCallInfo } from '../../core/types.js' */
/** @import { Turn, Step as Said } from '../../core/events.js' */
/** @typedef {import('./run.js').Flow} Flow */
/** @typedef {import('./run.js').State} State */

/**
 * kind: request; brain (a step of the brain), answer (the step that wrote the reply), call; or a flow's step's kind.
 * @typedef {{ id: string, kind: string, name: string, x: number, y: number, call?: ToolCallInfo, detail?: string }} Node
 * @typedef {{ steps: Node[], wires: [string, string][], states: Map<string, State> }} Graph
 * live: the calls of the answer being written; asking: those waiting on a card in the inbox.
 * @typedef {{ live?: Set<string>, asking?: Set<string> }} Now
 */

/** What became of a call, or what it is doing now. @param {ToolCallInfo} call @param {Now} [now] @returns {State} */
export function stateOf(call, { live = new Set(), asking = new Set() } = {}) {
  if (call.status === 'completed') return 'done'
  if (call.status === 'failed') return call._meta?.declined ? 'declined' : 'failed'
  const going = live.has(call.toolCallId)
  if (call.status === 'in_progress') return going ? 'running' : 'cut'
  return asking.has(call.toolCallId) || call._meta?.waiting ? 'asking' : going ? 'queued' : 'cut'
}

/** A flow by its id, or by its name as the brain gives it. @template {Flow} T @param {T[]} flows @param {unknown} which @returns {T | undefined} */
export const flowNamed = (flows, which) => flows.find((flow) => /** @type {any} */ (flow).id === which)
  ?? flows.find((flow) => flow.name.trim().toLocaleLowerCase() === String(which ?? '').trim().toLocaleLowerCase())

/**
 * What became of each of a flow's steps in one of its runs: from the call of each step that ran, and for
 * the others, whether the run is still going. @param {Flow} flow @param {ToolCallInfo} run @param {ToolCallInfo[]} calls @param {Now} [now]
 * @returns {{ states: Map<string, State>, results: Map<string, string>, calls: Map<string, ToolCallInfo> }}
 */
export function runOf(flow, run, calls, now = {}) {
  const ended = run.status === 'completed' || run.status === 'failed'
  const going = now.live?.has(run.toolCallId) ?? false
  /** @type {Map<string, ToolCallInfo>} */
  const steps = new Map()
  for (const call of calls) if (call.name === 'flow_step' && call._meta?.parent === run.toolCallId) steps.set(String(call.rawInput?.step), call)
  /** @type {Map<string, State>} */
  const states = new Map()
  /** @type {Map<string, string>} */
  const results = new Map()
  for (const step of flow.steps) {
    const call = steps.get(step.id)
    const state = call ? stateOf(call, now) : ended ? 'skipped' : going ? 'queued' : 'cut'
    states.set(step.id, state === 'done' && !String(call?.rawOutput ?? '').trim() ? 'empty' : state)
    if (call?.rawOutput !== undefined) results.set(step.id, String(call.rawOutput))
  }
  return { states, results, calls: steps }
}

/**
 * What each turn said and did, the last one with the answer being written, which shows its calls again (D212),
 * and the calls of that answer. @param {Turn[]} turns @param {{ steps: Said[] } | null} live
 */
export function told(turns, live) {
  const said = turns.map((turn, index) => (index === turns.length - 1 && live
    ? [...turn.steps.map((step) => ({ ...step, tools: step.tools.filter((tool) => tool.status !== 'pending') })), ...live.steps] : turn.steps))
  return { said, all: said.flat().flatMap((step) => step.tools), going: new Set((live?.steps ?? []).flatMap((step) => step.tools.map((tool) => tool.toolCallId))) }
}

/**
 * The last run of a flow in a task. @param {Flow & { id?: string }} flow @param {Turn[]} turns
 * @param {{ steps: Said[] } | null} [live] the answer being written @param {Set<string>} [asking]
 */
export function lastRun(flow, turns, live = null, asking = new Set()) {
  const { all, going } = told(turns, live)
  const run = all.findLast((call) => call.name === 'run_flow' && !call._meta?.parent && flowNamed([flow], call.rawInput?.flow))
  return run ? runOf(flow, run, all, { live: going, asking }) : null
}

/** A text's first line, short enough for a card. @param {string} text */
const firstLine = (text) => {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

/**
 * A task as a flow: each request on a line of its own, its brain's steps along it, the calls of a step
 * one under another after it, and what ran inside a call after the call. The last turn takes the steps
 * of the answer being written. @param {Turn[]} turns @param {{ steps: Said[] } | null} [live] the answer being written
 * @param {{ asking?: Set<string>, flows?: Flow[] }} [more] flows: the room's, to draw their runs as they are laid out
 * @returns {Graph}
 */
export function graphOf(turns, live = null, { asking = new Set(), flows = [] } = {}) {
  /** @type {Node[]} */
  const steps = []
  /** @type {[string, string][]} */
  const wires = []
  /** @type {Map<string, State>} */
  const states = new Map()
  const { said: saying, all, going } = told(turns, live)
  const now = { live: going, asking }
  let top = 0
  /** @type {string[]} */
  let before = []
  for (const [index, turn] of turns.entries()) {
    const said = saying[index]
    let x = 0
    let bottom = top
    if (turn.user) {
      const id = `request-${index}`
      steps.push({ id, kind: 'request', name: firstLine(turn.user.text) || turn.user.files.map((file) => file.name).join(', '), x: 0, y: top })
      states.set(id, 'done')
      for (const from of before) wires.push([from, id])
      before = [id]
      x = COLUMN
    }
    const answered = said.findLast((step) => step.text.trim())
    for (const step of [...said].sort((a, b) => a.index - b.index)) {
      const brain = step.tools.find((tool) => !tool.name && !tool._meta?.parent)
      const calls = step.tools.filter((tool) => tool.name && !tool._meta?.parent)
      if (!brain && !calls.length) continue
      let column = x
      if (brain) {
        steps.push({ id: brain.toolCallId, kind: step === answered && !calls.length ? 'answer' : 'brain', name: brain.title ?? '', x, y: top, call: brain, detail: firstLine(step.text) })
        states.set(brain.toolCallId, stateOf(brain, now))
        for (const from of before) wires.push([from, brain.toolCallId])
        before = [brain.toolCallId]
        column = x + COLUMN
      }
      let y = top
      let right = column - COLUMN
      for (const call of calls) {
        for (const from of before) wires.push([from, call.toolCallId])
        const box = place(call, column, y)
        right = Math.max(right, box.right)
        y = box.bottom + LINE
      }
      if (calls.length) before = calls.map((call) => call.toolCallId)
      bottom = Math.max(bottom, calls.length ? y - LINE : top)
      x = right + COLUMN
    }
    top = bottom + LINE
  }
  return { steps, wires, states }

  /**
   * A call, and what ran inside it after it: a run of a saved flow laid out as the flow is, anything else one under another.
   * @param {ToolCallInfo} call @param {number} x @param {number} y @returns {{ right: number, bottom: number }}
   */
  function place(call, x, y) {
    steps.push({ id: call.toolCallId, kind: call.name ? 'call' : 'brain', name: call.name ? call.title ?? call.name : call.title ?? '', x, y, call })
    states.set(call.toolCallId, stateOf(call, now))
    const flow = call.name === 'run_flow' ? flowNamed(flows, call.rawInput?.flow) : undefined
    if (flow?.steps.length) {
      const run = runOf(flow, call, all, now)
      const left = Math.min(...flow.steps.map((step) => step.x))
      const high = Math.min(...flow.steps.map((step) => step.y))
      const id = (/** @type {string} */ step) => `${call.toolCallId}:${step}`
      for (const step of flow.steps) {
        const ran = run.calls.get(step.id)
        steps.push({ id: id(step.id), kind: kindOf(step), name: step.name, x: x + COLUMN + step.x - left, y: y + step.y - high, ...(ran && { call: ran }) })
        states.set(id(step.id), /** @type {State} */ (run.states.get(step.id)))
        if (!inputsOf(flow, step.id).length) wires.push([call.toolCallId, id(step.id)])
      }
      for (const [from, to] of flow.wires) wires.push([id(from), id(to)])
      return { right: x + COLUMN + Math.max(...flow.steps.map((step) => step.x)) - left, bottom: y + Math.max(...flow.steps.map((step) => step.y)) - high }
    }
    let right = x
    let bottom = y
    for (const [i, child] of all.filter((tool) => tool._meta?.parent === call.toolCallId).entries()) {
      wires.push([call.toolCallId, child.toolCallId])
      const box = place(child, x + COLUMN, i ? bottom + LINE : y)
      right = Math.max(right, box.right)
      bottom = box.bottom
    }
    return { right, bottom }
  }
}
