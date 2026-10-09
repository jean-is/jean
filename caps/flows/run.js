// Flows (D218): a task's steps, drawn on a canvas and run again by hand or by a routine. A flow is
// one JSON file, flows/<ulid>.json in its project (the home project's at the root): named steps,
// each a text, a file, instructions for the brain or one of Jean's tools with its arguments, and
// wires that say whose results each step takes. This is the engine: the order, what each step is
// given, once per item, a step that gives nothing, the result and the layout. What a step does is
// the caller's. Host-agnostic: no DOM, tested under node --test.

/**
 * x and y: where it sits on the canvas, in pixels from the start of its first line.
 * @typedef {{ id: string, name: string, x: number, y: number, text?: string, file?: string, ask?: string, skill?: string,
 *   tool?: string, args?: Record<string, any>, each?: boolean }} Step
 * @typedef {{ format: 1, kind: 'flow', name: string, author: string, createdAt: string, updatedAt: string, steps: Step[], wires: [string, string][] }} Flow
 * @typedef {{ name: string, value: string }} Input
 * queued: not started; asking: waiting for the user; empty: done, giving nothing, so what follows is skipped; cut: the page
 * closed while it ran; skipped: what it takes failed, gave nothing or was skipped.
 * @typedef {'queued' | 'asking' | 'running' | 'done' | 'empty' | 'failed' | 'declined' | 'cut' | 'skipped'} State
 */

export const MAX_STEPS = 30
export const MAX_ITEMS = 50
/** Steps, and a step's items, run three at a time, as helpers do (D98). */
const AT_ONCE = 3
/** A column and a line of the canvas. */
export const COLUMN = 240
export const LINE = 120

/** @param {string} name */
const key = (name) => name.trim().toLocaleLowerCase()

/** What a step is. @param {Partial<Step>} step @returns {'text' | 'file' | 'ask' | 'tool'} */
export const kindOf = (step) => (step.tool !== undefined ? 'tool' : step.ask !== undefined ? 'ask' : step.file !== undefined ? 'file' : 'text')

/** The steps whose results a step takes, in the order they were wired. @param {Pick<Flow, 'wires'>} flow @param {string} id */
export const inputsOf = (flow, id) => flow.wires.filter(([, to]) => to === id).map(([from]) => from)

/**
 * The steps in an order where each comes after those it takes from.
 * @param {Pick<Flow, 'steps' | 'wires'>} flow @returns {Step[]}
 */
export function order({ steps, wires }) {
  const byId = new Map(steps.map((step) => [step.id, step]))
  const before = new Map(steps.map((step) => [step.id, 0]))
  for (const [from, to] of wires) {
    if (!byId.has(from) || !byId.has(to)) throw new Error('A wire joins a step that isn’t in the flow.')
    before.set(to, (before.get(to) ?? 0) + 1)
  }
  const ready = steps.filter((step) => !before.get(step.id))
  /** @type {Step[]} */
  const sorted = []
  for (let step = ready.shift(); step; step = ready.shift()) {
    sorted.push(step)
    for (const [from, to] of wires) if (from === step.id && before.set(to, (before.get(to) ?? 1) - 1).get(to) === 0) ready.push(/** @type {Step} */ (byId.get(to)))
  }
  if (sorted.length < steps.length) throw new Error('The steps go round in a circle: a step can’t take what comes after it.')
  return sorted
}

/** The names a text gives with {{Name}}, as keys. @param {string} text */
const named = (text) => [...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => key(match[1]))

/**
 * {{Name}} replaced by that input's result; in code, as a string literal, so what it holds can't break the script.
 * A name no input has stays as it is. @param {string} text @param {Input[]} inputs
 */
export function fill(text, inputs, code = false) {
  const values = new Map(inputs.map((input) => [key(input.name), input.value]))
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => {
    const value = values.get(key(name))
    return value === undefined ? match : code ? JSON.stringify(value) : value
  })
}

/** A tool step's arguments with its inputs in place: in every text, and as string literals in `code`. @param {any} value @param {Input[]} inputs @returns {any} */
export function fillArgs(value, inputs, code = false) {
  if (typeof value === 'string') return fill(value, inputs, code)
  if (Array.isArray(value)) return value.map((item) => fillArgs(item, inputs, code))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, fillArgs(item, inputs, code || name === 'code')]))
  return value
}

/** What an Ask step asks: its instructions with its inputs in place, then those they don't name. @param {string} ask @param {Input[]} inputs */
export function askOf(ask, inputs) {
  const given = new Set(named(ask))
  const rest = inputs.filter((input) => !given.has(key(input.name)))
  return [fill(ask, inputs), ...rest.map((input) => `${input.name}:\n${input.value}`)].join('\n\n').trim()
}

/** A result as a list: a JSON array's items, otherwise its lines that hold something. @param {string} text @returns {string[]} */
export function items(text) {
  const trimmed = text.trim()
  if (trimmed.startsWith('[')) {
    try {
      const list = JSON.parse(trimmed)
      if (Array.isArray(list)) return list.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
    } catch {}
  }
  return trimmed.split('\n').map((line) => line.trim()).filter(Boolean)
}

/** Runs what it is given at most `size` at a time. @param {number} size */
function limiter(size) {
  let busy = 0
  /** @type {(() => void)[]} */
  const queue = []
  /** @template T @param {() => Promise<T>} job @returns {Promise<T>} */
  return async (job) => {
    if (busy >= size) await new Promise((resolve) => queue.push(() => resolve(undefined)))
    busy++
    try {
      return await job()
    } finally {
      busy--
      queue.shift()?.()
    }
  }
}

/**
 * Runs a flow: each step once those it takes from are done, three at a time. A step that gives nothing,
 * fails or is skipped skips the steps that take from it; independent ones go on. Once per item, a step
 * runs for each item of its first input's list, and gives the results as a JSON array.
 * @param {Pick<Flow, 'steps' | 'wires'>} flow
 * @param {{ run: (step: Step, inputs: Input[], item?: number) => Promise<string>, signal?: AbortSignal,
 *   onState?: (id: string, state: State, result?: string) => void }} how
 * @returns {Promise<{ result: string, results: Map<string, string>, states: Map<string, State> }>} throws when a step failed
 */
export async function runFlow(flow, { run, signal, onState = () => {} }) {
  const steps = order(flow)
  if (steps.length > MAX_STEPS) throw new Error(`A flow has ${MAX_STEPS} steps at most.`)
  const limit = limiter(AT_ONCE)
  /** @type {Map<string, string>} */
  const results = new Map()
  /** @type {Map<string, State>} */
  const states = new Map(steps.map((step) => [step.id, 'queued']))
  /** @type {{ step: Step, error: string }[]} */
  const failures = []
  const set = (/** @type {string} */ id, /** @type {State} */ state) => {
    states.set(id, state)
    onState(id, state, results.get(id))
  }
  /** @param {Step} step @param {Input[]} inputs */
  const go = async (step, inputs) => {
    set(step.id, 'running')
    try {
      let output = ''
      if (step.each && inputs.length) {
        const list = items(inputs[0].value)
        if (list.length > MAX_ITEMS) throw new Error(`The list has ${list.length} items; a step goes through ${MAX_ITEMS} at most.`)
        const outputs = await Promise.all(list.map((item, i) => limit(() => run(step, [{ ...inputs[0], value: item }, ...inputs.slice(1)], i))))
        const kept = outputs.filter((one) => one.trim())
        output = kept.length ? JSON.stringify(kept) : ''
      } else output = await limit(() => run(step, inputs))
      results.set(step.id, output)
      set(step.id, output.trim() ? 'done' : 'empty')
    } catch (error) {
      failures.push({ step, error: error instanceof Error ? error.message : String(error) })
      set(step.id, 'failed')
    }
  }
  /** @type {Map<string, Promise<void>>} */
  const running = new Map()
  const left = new Set(steps.map((step) => step.id))
  while (left.size || running.size) {
    for (const step of steps) {
      const from = inputsOf(flow, step.id)
      if (!left.has(step.id) || from.some((id) => left.has(id) || running.has(id))) continue
      left.delete(step.id)
      if (signal?.aborted || from.some((id) => states.get(id) !== 'done')) {
        set(step.id, 'skipped')
        continue
      }
      const inputs = from.map((id) => ({ name: /** @type {Step} */ (steps.find((one) => one.id === id)).name, value: results.get(id) ?? '' }))
      running.set(step.id, go(step, inputs).then(() => { running.delete(step.id) }))
    }
    if (running.size) await Promise.race(running.values())
  }
  if (failures.length) throw new Error(`The step "${failures[0].step.name}" failed: ${failures[0].error}`)
  return { result: result(flow, results, states), results, states }
}

/**
 * What a flow gives: the results of its last steps, those no step takes from, that were done; only some of them when `which` says.
 * @param {Pick<Flow, 'steps' | 'wires'>} flow @param {Map<string, string>} results @param {Map<string, State>} states @param {(step: Step) => boolean} [which]
 */
export function result(flow, results, states, which = () => true) {
  const taken = new Set(flow.wires.map(([from]) => from))
  return flow.steps.filter((step) => !taken.has(step.id) && states.get(step.id) === 'done' && which(step)).map((step) => results.get(step.id)?.trim()).filter(Boolean).join('\n\n')
}

/**
 * The steps placed by depth: a column for each step's distance from the first ones, one line each in a column.
 * @template {{ id: string }} T @param {T[]} steps @param {[string, string][]} wires @returns {(T & { x: number, y: number })[]}
 */
export function layout(steps, wires) {
  const sorted = order({ steps: /** @type {any} */ (steps), wires })
  /** @type {Map<string, number>} */
  const depth = new Map()
  for (const step of sorted) depth.set(step.id, Math.max(0, ...inputsOf({ wires }, step.id).map((id) => (depth.get(id) ?? 0) + 1)))
  /** @type {number[]} */
  const lines = []
  /** @type {Map<string, { x: number, y: number }>} */
  const placed = new Map()
  for (const step of sorted) {
    const column = depth.get(step.id) ?? 0
    lines[column] = (lines[column] ?? -1) + 1
    placed.set(step.id, { x: column * COLUMN, y: lines[column] * LINE })
  }
  return steps.map((step) => ({ ...step, .../** @type {{ x: number, y: number }} */ (placed.get(step.id)) }))
}

/**
 * @typedef {{ name: string, text?: string, file?: string, ask?: string, skill?: string, tool?: string, args?: Record<string, any>,
 *   after?: string[], each?: boolean }} Named
 */

/**
 * Steps as the brain writes them, by name, made a flow's steps and wires. A step takes the one before
 * it unless `after` says whose results it takes, and every step its {{Name}}s name. Steps that keep
 * their names keep their ids; when the same steps come back, they keep their places too.
 * @param {Named[]} given @param {Pick<Flow, 'steps' | 'wires'>} [previous]
 * @returns {Pick<Flow, 'steps' | 'wires'>} throws what is wrong, for the brain
 */
export function fromSteps(given, previous) {
  if (!Array.isArray(given) || !given.length) throw new Error('A flow needs steps.')
  if (given.length > MAX_STEPS) throw new Error(`A flow has ${MAX_STEPS} steps at most.`)
  const old = new Map((previous?.steps ?? []).map((step) => [key(step.name), step]))
  const ids = new Set()
  /** @type {Map<string, string>} */
  const byName = new Map()
  let next = 1
  const steps = given.map((one, i) => {
    const name = String(one?.name ?? '').trim()
    if (!name) throw new Error(`Step ${i + 1} needs a name.`)
    if (byName.has(key(name))) throw new Error(`Two steps are called "${name}": each needs a name of its own.`)
    const kinds = ['text', 'file', 'ask', 'tool'].filter((kind) => one[/** @type {'text'} */ (kind)] !== undefined)
    if (kinds.length !== 1) throw new Error(`The step "${name}" needs one of text, file, ask or tool.`)
    const kept = old.get(key(name))
    let id = kept?.id
    while (!id || ids.has(id)) id = `s${next++}`
    ids.add(id)
    byName.set(key(name), id)
    /** @type {Step} */
    const step = { id, name, x: kept?.x ?? 0, y: kept?.y ?? 0 }
    if (one.text !== undefined) step.text = String(one.text)
    if (one.file !== undefined) step.file = String(one.file)
    if (one.ask !== undefined) step.ask = String(one.ask)
    if (one.skill) step.skill = String(one.skill)
    if (one.tool !== undefined) {
      step.tool = String(one.tool)
      step.args = one.args && typeof one.args === 'object' ? one.args : {}
    }
    if (one.each) step.each = true
    return step
  })
  /** @type {[string, string][]} */
  const wires = []
  const wire = (/** @type {string} */ from, /** @type {string} */ to) => { if (!wires.some(([a, b]) => a === from && b === to)) wires.push([from, to]) }
  given.forEach((one, i) => {
    const to = steps[i].id
    const after = Array.isArray(one.after) ? one.after : i ? [given[i - 1].name] : []
    for (const name of after) {
      const from = byName.get(key(String(name)))
      if (!from) throw new Error(`The step "${steps[i].name}" comes after "${name}", which isn't a step of the flow.`)
      if (from === to) throw new Error(`The step "${steps[i].name}" can't come after itself.`)
      wire(from, to)
    }
    for (const name of named([one.ask, one.text, JSON.stringify(one.args ?? '')].join('\n'))) {
      const from = byName.get(name)
      if (from && from !== to) wire(from, to)
    }
  })
  order({ steps, wires })
  // The same steps keep their places; otherwise they are laid out again.
  const same = previous && previous.steps.length === steps.length && steps.every((step) => old.has(key(step.name)))
  return { steps: same ? steps : layout(steps, wires), wires }
}
