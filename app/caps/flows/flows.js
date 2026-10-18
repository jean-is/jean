// Flows (D218): a task's steps on a canvas, which the user sees, changes and runs again, by hand or
// by a routine, and any task seen the same way. On a new task, + in the box puts the main area in
// flow mode, on the room's flows; on a task, a button beside the terminal's and the browser's opens
// a pane beside it, on that task and the flows it made or ran. A flow is one JSON file,
// flows/<ulid>.json in its project (the home project's at the root). Running one, no brain writes
// between its steps: each step is a call of its own under `run_flow`, kept in the conversation like
// any call, under the rules, its approvals in the inbox. A text or a file is read; instructions are a
// helper's turn (D98); a tool is called as a script calls it (D48). `save_flow` lets the brain draw
// one; the canvas (canvas.js) lets the user change it.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { register, contributions, unlock } from '../../ui/caps.js'
import { define } from '../../ui/base.js'
import { act } from '../../ui/acts.js'
import * as dock from '../../ui/dock.js'
import { app, assistantName, newConversation, send, turnPage } from '../../ui/state.js'
import { join, readJSON, writeJSON } from '../../core/fs.js'
import { ulid } from '../../core/ulid.js'
import { fileText } from '../../core/files.js'
import { listSkills } from '../../core/skills.js'
import { metaRecord, splitSuggestions } from '../../core/events.js'
import { t, useStrings } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { runFlow, fromSteps, askOf, fill, fillArgs, kindOf, result as resultOf } from './run.js'
import { flowNamed } from './graph.js'
import { keep } from '../../ui/windows.js'

// Its own strings, which its slots draw with, before it registers.
await useStrings('flows')

/** @typedef {import('./run.js').Flow} Flow */
/** @typedef {import('./run.js').Step} Step */
/** A flow as the room keeps it: its file's id (a ULID, never changed) and path. @typedef {Flow & { id: string, path: string }} Saved */

/** Never a step of a flow: what runs or makes flows, offers, splits work, plans or makes routines. */
const NOT_STEPS = new Set(['run_flow', 'save_flow', 'flow_step', 'offer', 'find_tools', 'delegate', 'helper', 'schedule', 'save_name', 'plan'])
/** And what an Ask step can't do on top: ask the user, who may not be there (a helper's rule, D98). */
const NOT_ASKED = new Set([...NOT_STEPS, 'ask_user'])

/** Where the room's flows are: the home project's at the root, another's in its folder. */
const folder = () => (app.project.value.data.default === true ? '' : app.projectDir)

/** The room's flows, oldest first. */
export const flows = signal(/** @type {Saved[]} */ ([]))

/** Reads the room's flows again. @returns {Promise<Saved[]>} */
export async function refresh() {
  const dir = join(folder(), 'flows')
  const names = (await app.fs.list(dir)).filter((entry) => entry.kind === 'file' && entry.name.endsWith('.json')).map((entry) => entry.name).sort()
  const read = await Promise.all(names.map(async (name) => {
    const flow = /** @type {Flow | null} */ (await readJSON(app.fs, join(dir, name), null))
    return flow?.kind === 'flow' ? [{ ...flow, steps: flow.steps ?? [], wires: flow.wires ?? [], id: name.slice(0, -'.json'.length), path: join(dir, name) }] : []
  }))
  return (flows.value = read.flat())
}
effect(() => {
  void app.project.value
  refresh().catch((error) => console.warn('Flows', error))
})

/** A new flow, not kept yet. @param {string} name @param {string} by @returns {Saved} */
export function newFlow(name, by) {
  const id = ulid()
  const now = new Date().toISOString()
  return { format: 1, kind: 'flow', name, author: by, createdAt: now, updatedAt: now, steps: [], wires: [], id, path: join(folder(), 'flows', `${id}.json`) }
}

/** Keeps a flow, whole. @param {Saved} flow @returns {Promise<Saved>} */
export async function saveFlow(flow) {
  const { id, path, ...kept } = flow
  const saved = { ...flow, updatedAt: new Date().toISOString() }
  await writeJSON(app.fs, path, { ...kept, updatedAt: saved.updatedAt })
  flows.value = [...flows.peek().filter((other) => other.id !== id), saved].sort((a, b) => (a.id < b.id ? -1 : 1))
  return saved
}

/** Deletes a flow and the routines that run it. @param {Saved} flow */
export async function deleteFlow(flow) {
  await app.fs.remove(flow.path)
  const { listRoutines } = await import('../routines/schedule.js')
  for (const routine of await listRoutines(app.fs, folder())) if (routine.flow === flow.id) await app.fs.remove(routine.path)
  await refresh()
}

/** The tools a step can use: the room's, but none that runs or makes flows. */
export const usable = () => contributions().tools.filter((tool) => !tool.hidden && !NOT_STEPS.has(tool.spec.name))

/** The room's skills: global ones, then the project's. */
export const skills = () => listSkills(app.fs, app.project.value.data.default === true ? [''] : ['', app.projectDir])

/** The files shared or made in the room's project, the newest of each name, newest first. @returns {Promise<{ name: string, uri: string }[]>} */
export async function files() {
  const dir = join(app.projectDir, 'files')
  const names = (await app.fs.list(dir)).map((entry) => entry.name)
  const found = await Promise.all(names.filter((name) => name.endsWith('.meta.json')).map(async (name) => {
    const meta = /** @type {import('../../core/files.js').FileMeta | null} */ (await readJSON(app.fs, join(dir, name), null))
    const base = name.slice(0, -'.meta.json'.length)
    const original = names.find((other) => other.startsWith(`${base}.`) && !other.endsWith('.md') && !other.endsWith('.meta.json'))
    return meta?.name && original ? [{ name: meta.name, uri: `files/${original}`, at: meta.createdAt }] : []
  }))
  const seen = new Set()
  return found.flat().sort((a, b) => (a.at < b.at ? 1 : -1)).filter((file) => !seen.has(file.name) && seen.add(file.name))
}

/** A file's text, its newest version by name, without the lines that mark its pages. @param {string} name */
async function readFile(name) {
  const file = (await files()).find((one) => one.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())
  if (!file) throw new Error(`No file is called "${name}" in this project.`)
  return ((await fileText(app.fs, app.projectDir, file.uri)) ?? '').replace(/^\[\[page \d+\]\]\n?/gm, '').trim()
}

/** What an Ask step's brain is told: whose step it does, and how to give its result. @param {string} flow @param {string} step @param {string} [skill] */
const stepPrompt = (flow, step, skill) => `You are ${assistantName()}, doing one step of the user's flow "${flow}": "${step}". Do what it asks with what it is given, then reply with the step's result alone, ready for the next step: no greeting, no comment on what you did, no suggestions. If there is nothing to pass on, reply with nothing at all. Never invent facts, numbers, quotes or sources.${
  skill ? `\n\nFollow this skill:\n<skill>\n${skill}\n</skill>` : ''}\n\nWrite in the language of the step's instructions.`

/** The flows a run is running, by id, as they were when it started: a change on the canvas waits for the next run. @type {Map<string, Saved>} */
const running = new Map()

/** @type {import('../../core/loop.js').Tool} */
const saveTool = {
  spec: {
    name: 'save_flow',
    description: 'Make a flow, or change one: steps the user sees on a canvas beside the conversation and runs again by hand or on a schedule, each step’s result going to the steps after it. name: a few words, in the user’s language; the name of one of their flows replaces its steps. steps, in order, each with a name of its own in the user’s language and one of: text (a fixed text), file (the name of a file the user shared or you made: its newest version is read), ask (instructions for you, as the user would write them; skill: one of the skills to follow), or tool with args (one of your tools, called with these arguments). {{Step name}} in a text, an ask or an argument puts that step’s result there; an ask also gets the results it doesn’t name, after its instructions. after: the steps whose results it takes, by name (by default the step before it; [] for none). each: true to do the step once for each item of the list it takes (a JSON array, or one item a line), three at a time. A step that gives nothing stops the steps after it.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' }, text: { type: 'string' }, file: { type: 'string' }, ask: { type: 'string' }, skill: { type: 'string' },
              tool: { type: 'string' }, args: { type: 'object' }, after: { type: 'array', items: { type: 'string' } }, each: { type: 'boolean' },
            },
            required: ['name'],
          },
        },
      },
      required: ['name', 'steps'],
    },
  },
  kind: 'edit',
  title: (args) => `Save the flow ${args?.name ?? ''}`,
  run: async (args) => {
    const name = String(args?.name ?? '').trim()
    if (!name) throw new Error('A flow needs a name.')
    const previous = flowNamed(await refresh(), name)
    const made = fromSteps(args?.steps, previous)
    const tools = new Set(usable().map((tool) => tool.spec.name))
    const known = new Set((await skills()).map((skill) => skill.name))
    for (const step of made.steps) {
      if (step.tool && !tools.has(step.tool)) throw new Error(`The step "${step.name}" uses "${step.tool}", which isn't one of the tools a flow can use: ${[...tools].join(', ')}.`)
      if (step.skill && !known.has(step.skill)) throw new Error(`The step "${step.name}" follows the skill "${step.skill}", which isn't one of the user's skills.`)
    }
    const saved = await saveFlow({ ...(previous ?? newFlow(name, 'jean')), name, ...made })
    show(saved.id)
    return `Saved the flow "${name}", ${made.steps.length} steps. It shows beside the conversation, where the user can run it, change it and schedule it; run_flow runs it.`
  },
}

/** @type {import('../../core/loop.js').Tool} */
const runTool = {
  spec: {
    name: 'run_flow',
    description: 'Run one of the user’s flows, by its name, and get what its last steps give (nothing, when they give nothing). Its steps run under the user’s rules, and what each did shows under this call.',
    parameters: { type: 'object', properties: { flow: { type: 'string' } }, required: ['flow'] },
  },
  kind: 'execute',
  title: (args) => `Run the flow ${args?.name ?? flowNamed(flows.peek(), args?.flow)?.name ?? args?.flow ?? ''}`,
  run: async (args, ctx) => {
    const all = await refresh()
    const flow = flowNamed(all, args?.flow)
    if (!flow) return all.length ? `No flow is called "${args?.flow ?? ''}". The flows: ${all.map((one) => `"${one.name}"`).join(', ')}.` : 'There are no flows here.'
    running.set(flow.id, flow)
    try {
      const { result, results, states } = await runFlow(flow, {
        signal: ctx.signal,
        run: (step, inputs, item) => ctx.call('flow_step', { flow: flow.id, step: step.id, name: step.name, ...(item !== undefined && { item }), inputs: Object.fromEntries(inputs.map((input) => [input.name, input.value])) }),
      })
      // What the user reads as the answer, when the run is the turn: what the last steps say in their words, not what a tool tells the brain.
      ctx.meta.answer = resultOf(flow, results, states, (step) => kindOf(step) !== 'tool')
      return result
    } finally {
      running.delete(flow.id)
    }
  },
}

/** @type {import('../../core/loop.js').Tool} */
const stepTool = {
  spec: {
    name: 'flow_step',
    description: 'One step of a flow, as run_flow runs it, with the results it takes.',
    parameters: { type: 'object', properties: { flow: { type: 'string' }, step: { type: 'string' }, item: { type: 'number' }, inputs: { type: 'object' } }, required: ['flow', 'step'] },
  },
  kind: 'think',
  hidden: true,
  title: (args) => (args?.item === undefined ? String(args?.name ?? args?.step ?? '') : `${args?.name ?? args?.step ?? ''} · ${Number(args.item) + 1}`),
  run: async (args, ctx) => {
    const flow = running.get(String(args?.flow)) ?? flowNamed(await refresh(), args?.flow)
    const step = flow?.steps.find((one) => one.id === args?.step)
    if (!flow || !step) throw new Error('This step is no longer in the flow.')
    const inputs = Object.entries(args?.inputs ?? {}).map(([name, value]) => ({ name, value: String(value) }))
    const kind = kindOf(step)
    if (kind === 'text') return fill(step.text ?? '', inputs)
    if (kind === 'file') return readFile(fill(step.file ?? '', inputs))
    if (kind === 'tool') return ctx.call(String(step.tool), fillArgs(step.args ?? {}, inputs))
    const skill = step.skill ? (await skills()).find((one) => one.name === step.skill) : undefined
    const tools = () => contributions().tools.filter((tool) => !NOT_ASKED.has(tool.spec.name))
    const { text } = await ctx.turn({
      system: stepPrompt(flow.name, step.name, skill?.body),
      history: [{ role: 'user', content: askOf(step.ask ?? '', inputs) }],
      tools,
      declared: tools().filter((tool) => !tool.hidden && !tool.deferred).map((tool) => tool.spec.name),
      maxSteps: 8,
    })
    return splitSuggestions(text).text.trim()
  },
}

// ─── Where it shows ──────────────────────────────────────────────────────────

/** Whether the pane beside a task is open, and what it shows: the task, or a flow it made or ran, by its id. */
export const open = signal(false)
export const shown = signal(/** @type {'task' | string} */ ('task'))
/** The flow the main area shows in flow mode, on a new task ('' while the room has none); null out of it. */
export const editing = signal(/** @type {string | null} */ (null))

/** Opens the pane on a flow, or on the task on screen. @param {'task' | string} [what] */
export function show(what = shown.peek()) {
  shown.value = what
  open.value = true
}
export const close = () => { open.value = false }
export const toggle = () => (open.peek() ? close() : show())

/** Flow mode, on a new task: the main area shows a flow, the one changed last unless named. @param {string} [id] */
export async function edit(id) {
  if (app.current.peek()?.records.length) await turnPage(newConversation)
  editing.value = id ?? [...flows.peek()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]?.id ?? ''
}
/** Where Flows opens: beside a task, on it; on a new task, in flow mode. */
export const here = () => (app.current.peek()?.records.length ? show('task') : edit())
// A message sent, or a task opened, leaves flow mode: the conversation takes the main area.
effect(() => { if (app.current.value?.records.length) editing.value = null })
// In the address (D220), as it shows: on a new task, flow mode's flow; beside a task, the task or a flow of it.
// Shown once its pane is in the dock, so that it opens while the keys are kept where they were.
keep('flow', {
  get: () => editing.value ?? (open.value && app.current.value?.records.length ? shown.value : null),
  set: async (state) => {
    await drawn
    if (state === null) {
      editing.value = null
      close()
    } else if (app.current.peek()?.records.length) show(state || 'task')
    else edit(state || undefined)
  },
})

/** Runs a flow in a task of its own, named after it: its steps are the turn, what they give the answer. Its steps then show beside it. @param {Saved} flow */
export async function runNow(flow) {
  editing.value = null
  newConversation()
  show(flow.id)
  await send(flow.name, { notes: [metaRecord('jean', { title: flow.name })], call: { name: 'run_flow', args: { flow: flow.id, name: flow.name } } })
}

register({
  id: 'flows',
  tools: [saveTool, runTool, stepTool],
  lines: [
    { name: 'save_flow', line: 'make or change a flow: steps the user sees, changes and runs again, by hand or on a schedule' },
    { name: 'run_flow', line: 'run one of the user’s flows' },
  ],
  slots: {
    views: { at: 4, draw: (/** @type {any} */ current) => (current?.records.length ? html`<button class="icon-button flows-toggle" @click=${toggle} aria-label=${t('cap.flows.name')}>${icons.flow}</button>` : nothing) },
    main: { at: 1, draw: () => (editing.value === null ? null : html`<app-flow-main></app-flow-main>`) },
    add: { at: 3, draw: (/** @type {any} */ current) => (current?.records.length ? nothing : html`<button type="button" popovertarget="add-menu" popovertargetaction="hide" @click=${() => edit()}>${icons.flow}${t('cap.flows.name')}</button>`) },
    activity: { at: 1, draw: () => html`<button class="link-button activity-flow" @click=${() => show('task')}>${t('flows.asFlow')}</button>` },
  },
})

/** Makes a routine that runs a flow, or finds the one there is, and opens it in Settings to set when (D122). @param {Saved} flow */
export async function schedule(flow) {
  const { listRoutines, newRoutine, writeRoutine } = await import('../routines/schedule.js')
  if (!(await unlock('routines'))) return
  let routine = (await listRoutines(app.fs, folder())).find((one) => one.flow === flow.id)
  if (!routine) {
    const at = new Date(Date.now() + 3600_000)
    routine = newRoutine(folder(), { title: flow.name, request: flow.name, flow: flow.id, by: app.deviceId, every: 'weekday', at: `${String(at.getHours()).padStart(2, '0')}:00` })
    await writeRoutine(app.fs, routine)
    act('routine.add', { path: routine.path, title: flow.name, flow: true, every: 'weekday' })
  }
  ;(await import('../../ui/knows.js')).showRoutine(routine.path)
}

// The canvas imports this module, so it comes once this one has run: awaited here, each would wait for the other.
const drawn = import('./canvas.js').then(({ Flows, FlowMain }) => {
  define('app-flows', Flows)
  define('app-flow-main', FlowMain)
  dock.join(document.createElement('app-flows'))
})
