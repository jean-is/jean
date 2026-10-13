// The canvas of Flows (D218): a flow's steps as cards joined by wires, in two places. On a new task,
// the main area in flow mode, on the room's flows; beside a task, a pane of the dock (D144) on that task
// drawn the same way, with what each step is doing or became, and on the flows it made or ran. A flow's cards
// move with the pointer or the arrow keys, and are wired by dragging from a card's end to another
// card, or from the step's form, which keyboards and screen readers use. A task's are read only: a
// card leads to its line in the conversation. Positions go through CSSOM (the CSP refuses style
// attributes), in the line's own direction, so right to left mirrors the whole drawing.
import { html, svg, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { repeat } from 'lit-html/directives/repeat.js'
import { signal, computed, effect } from '@preact/signals-core'
import { Element } from '../../ui/base.js'
import * as dock from '../../ui/dock.js'
import { app, notify } from '../../ui/state.js'
import { loaded } from '../../ui/caps.js'
import { icons } from '../../ui/icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { toolLabel, brainName } from '../../ui/chat.js'
import { foldTurns } from '../../core/events.js'
import { t, useStrings, relativeTime, locale } from '../../core/i18n.js'
import { COLUMN, LINE, kindOf, inputsOf, order } from './run.js'
import { graphOf, lastRun, told, flowNamed } from './graph.js'
import { flows, open, shown, editing, close, show, saveFlow, deleteFlow, newFlow, runNow, schedule, usable, skills, files } from './flows.js'

/** @typedef {import('./flows.js').Saved} Saved */
/** @typedef {import('./run.js').Step} Step */
/** @typedef {import('./run.js').State} State */
/** @typedef {import('./graph.js').Node} Node */

await Promise.all([useStrings('flows'), styleSheet(new URL('flows.css', import.meta.url)), styleSheet(new URL('../../ui/select.css', import.meta.url))])

/** A card's size, as flows.css draws it, and how far a move goes. */
const CARD = { w: 200, h: 88 }
const NUDGE = 8
const STRIDE = 40
// Fields of a tool's that hold more than a line.
const LONG = /^(content|code|text|body|request|task|prompt|message|description|query|old|new)$/

const glyph = (/** @type {unknown} */ paths) => html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`
const GLYPHS = {
  full: glyph(svg`<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>`),
  exit: glyph(svg`<path d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5"/>`),
  run: glyph(svg`<path d="M8 5.5v13l10.5-6.5Z"/>`),
}
/** Each kind of card, and each state, as a picture beside its words. */
const KINDS = /** @type {Record<string, unknown>} */ ({ text: icons.note, file: icons.file, ask: icons.spark, tool: icons.bolt, request: icons.person, brain: icons.spark, answer: icons.check, call: icons.bolt })
const MARKS = /** @type {Partial<Record<State, unknown>>} */ ({ done: icons.check, failed: icons.close, declined: icons.close, cut: icons.stop, asking: icons.person })

/** The step whose form is open, a card being moved, a wire being drawn, and whether the pane fills the screen. */
const selected = signal(/** @type {string | null} */ (null))
const drag = signal(/** @type {{ id: string, x: number, y: number } | null} */ (null))
const link = signal(/** @type {{ from: string, x: number, y: number } | null} */ (null))
const full = signal(false)
/** What the room holds for a step's form: its files and its skills; and when each flow's routine runs next. */
const room = signal(/** @type {{ files: string[], skills: string[], next: Map<string, Date> }} */ ({ files: [], skills: [], next: new Map() }))

/** Calls waiting on a card in the inbox. */
const asking = computed(() => new Set(app.decisions.value.flatMap((decision) => ('toolCall' in decision ? [decision.toolCall.toolCallId] : []))))
/** The flows the task on screen made or ran, by its calls: the pane offers them beside the task itself. */
const related = computed(() => {
  const { all } = told(foldTurns(app.current.value?.records ?? []), app.live.value?.turn ?? null)
  const named = all.flatMap((call) => (call.name === 'save_flow' ? [call.rawInput?.name] : call.name === 'run_flow' ? [call.rawInput?.flow] : []))
  return flows.value.filter((one) => named.some((which) => flowNamed([one], which)))
})
/** The skills the task on screen read, by the names its calls gave them, in the room and language they are shown in. */
const skillsRead = computed(() => {
  const names = told(foldTurns(app.current.value?.records ?? []), app.live.value?.turn ?? null).all.flatMap((call) => (call.name === 'skill' ? [skillName(call)] : []))
  return [locale.value, app.project.value.id, ...new Set(names)].join('\n')
})
/** How each of them is named in the user's list, in their language (D222), read while the pane shows the task. */
const skillTitles = signal(/** @type {Map<string, string>} */ (new Map()))
effect(() => {
  if (!open.value || shown.value !== 'task') return
  const [lang, , ...names] = skillsRead.value.split('\n')
  if (names.length) void Promise.all([skills(), import('../skills/directory.js')]).then(([list, { shownIn }]) => {
    skillTitles.value = new Map(list.filter((skill) => names.includes(skill.name)).map((skill) => [skill.name, shownIn(skill, lang).title]))
  }).catch((error) => console.warn('Flows', error))
})

/** What the pane shows: one of those flows, or the task (null); and the flow of flow mode. */
const paneFlow = computed(() => (shown.value === 'task' ? null : related.value.find((one) => one.id === shown.value) ?? null))
const mainFlow = computed(() => flows.value.find((one) => one.id === editing.value) ?? null)

/** A flow with its last run in the task on screen, or that task, as cards, wires and what became of each. @param {Saved | null} one */
function drawingOf(one) {
  const turns = foldTurns(app.current.value?.records ?? [])
  const answering = app.live.value?.turn ?? null
  if (!one) return { ...graphOf(turns, answering, { asking: asking.value, flows: flows.value }), results: new Map() }
  const run = lastRun(one, turns, answering, asking.value)
  return {
    steps: one.steps.map((step) => /** @type {Node} */ ({ id: step.id, kind: kindOf(step), name: step.name, x: step.x, y: step.y, detail: detailOf(step) })),
    wires: one.wires, states: run?.states ?? new Map(), results: run?.results ?? new Map(),
  }
}

/** What a step does, in a few words, for its card. @param {Step} step */
function detailOf(step) {
  const kind = kindOf(step)
  const text = kind === 'tool' ? (step.tool ?? '').replace(/_/g, ' ') : kind === 'file' ? step.file : kind === 'ask' ? step.ask : step.text
  return (text ?? '').trim().split('\n')[0].slice(0, 80)
}

// What a flow's form offers, read when a flow shows, in flow mode or in the pane.
effect(() => {
  const id = editing.value || (open.value && shown.value !== 'task' ? shown.value : '')
  const one = id ? flows.peek().find((candidate) => candidate.id === id) : undefined
  if (one) void Promise.all([files(), skills(), routineOf(one)]).then(([found, list, next]) => {
    room.value = { files: found.map((file) => file.name), skills: list.map((skill) => skill.name), next: next ? new Map(room.peek().next).set(one.id, next) : room.peek().next }
  }).catch((error) => console.warn('Flows', error))
})

/** When the routine that runs a flow runs next, if one does. @param {Saved} one @returns {Promise<Date | null>} */
async function routineOf(one) {
  if (!loaded.peek().has('routines')) return null
  const routines = await import('../routines/routines.js')
  const routine = (await routines.routines()).find((candidate) => candidate.flow === one.id)
  return routine ? routines.next(routine) : null
}

// ─── Changing a flow ─────────────────────────────────────────────────────────

/** Changes are drawn at once and kept a moment later, the last one whole. @type {Map<string, ReturnType<typeof setTimeout>>} */
const later = new Map()
/** @param {Saved} changed */
function put(changed) {
  flows.value = flows.peek().map((one) => (one.id === changed.id ? changed : one))
  clearTimeout(later.get(changed.id))
  later.set(changed.id, setTimeout(() => {
    later.delete(changed.id)
    saveFlow(changed).catch((error) => console.warn('Flows', error))
  }, 400))
}

/** @param {Saved} one @param {string} id @param {Partial<Step>} change */
const changeStep = (one, id, change) => put({ ...one, steps: one.steps.map((step) => (step.id === id ? { ...step, ...change } : step)) })

/** A name no other step has: the kind's, numbered when it is taken. @param {Saved} one @param {string} base */
function freeName(one, base) {
  const taken = new Set(one.steps.map((step) => step.name.trim().toLocaleLowerCase()))
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base} ${n}`
    if (!taken.has(name.toLocaleLowerCase())) return name
  }
}

/** A new step after the one selected (or the last), taking its result, in the first free place. @param {Saved} one @param {'text' | 'file' | 'ask' | 'tool'} kind */
function addStep(one, kind) {
  const after = one.steps.find((step) => step.id === selected.peek()) ?? one.steps.at(-1)
  let id = one.steps.length + 1
  while (one.steps.some((step) => step.id === `s${id}`)) id++
  const x = after ? after.x + COLUMN : 0
  let y = after?.y ?? 0
  while (one.steps.some((step) => Math.abs(step.x - x) < CARD.w && Math.abs(step.y - y) < CARD.h)) y += LINE
  /** @type {Step} */
  const step = { id: `s${id}`, name: freeName(one, t(`flows.kind.${kind}`)), x, y, ...(kind === 'tool' ? { tool: '', args: {} } : { [kind]: '' }) }
  put({ ...one, steps: [...one.steps, step], wires: after ? [...one.wires, [after.id, step.id]] : one.wires })
  selected.value = step.id
  focusOn = step.id
}

/** Removes a step and its wires, with Undo. @param {Saved} one @param {Step} step */
function removeStep(one, step) {
  put({ ...one, steps: one.steps.filter((other) => other !== step), wires: one.wires.filter(([from, to]) => from !== step.id && to !== step.id) })
  selected.value = null
  notify(t('flows.removed', { name: step.name }), { label: t('memory.undo'), run: () => put(one) })
}

/** Whether a wire from one step to another would make the steps go round in a circle. @param {Saved} one @param {string} from @param {string} to */
function loops(one, from, to) {
  try {
    order({ steps: one.steps, wires: [...one.wires, [from, to]] })
    return from === to
  } catch {
    return true
  }
}

/** Joins two steps, or takes the wire away when it is there. @param {Saved} one @param {string} from @param {string} to */
function wire(one, from, to) {
  if (one.wires.some(([a, b]) => a === from && b === to)) return put({ ...one, wires: one.wires.filter(([a, b]) => !(a === from && b === to)) })
  if (loops(one, from, to)) return notify(t('flows.loop'))
  put({ ...one, wires: [...one.wires, [from, to]] })
}

// ─── Pointer and keys ────────────────────────────────────────────────────────

/** -1 in a right-to-left line, where the drawing is mirrored. @param {globalThis.Element} element */
const way = (element) => (getComputedStyle(element).direction === 'rtl' ? -1 : 1)
const snap = (/** @type {number} */ value) => Math.max(0, Math.round(value / NUDGE) * NUDGE)
/** The card to give focus to once it is drawn. @type {string | null} */
let focusOn = null

/** A card pressed: moved while the pointer moves, otherwise its form opens or closes. @param {PointerEvent} event @param {Saved} one @param {Node} node */
function grab(event, one, node) {
  if (event.button !== 0 || /** @type {globalThis.Element} */ (event.target).closest('.flow-port')) return
  const card = /** @type {HTMLElement} */ (event.currentTarget)
  const flip = way(card)
  const start = { x: event.clientX, y: event.clientY }
  let moved = false
  card.setPointerCapture(event.pointerId)
  const move = (/** @type {PointerEvent} */ next) => {
    const dx = (next.clientX - start.x) * flip
    const dy = next.clientY - start.y
    if (!moved && Math.hypot(dx, dy) < 4) return
    moved = true
    drag.value = { id: node.id, x: snap(node.x + dx), y: snap(node.y + dy) }
  }
  const up = () => {
    card.removeEventListener('pointermove', move)
    card.removeEventListener('pointerup', up)
    card.removeEventListener('pointercancel', up)
    const to = drag.peek()
    drag.value = null
    if (moved && to) changeStep(one, node.id, { x: to.x, y: to.y })
    else if (!moved) selected.value = selected.peek() === node.id ? null : node.id
  }
  card.addEventListener('pointermove', move)
  card.addEventListener('pointerup', up)
  card.addEventListener('pointercancel', up)
}

/** A wire drawn from a card's end to the card it is dropped on. @param {PointerEvent} event @param {Saved} one @param {Node} node */
function draw(event, one, node) {
  if (event.button !== 0) return
  event.preventDefault()
  const port = /** @type {HTMLElement} */ (event.currentTarget)
  const plane = /** @type {HTMLElement} */ (port.closest('.flows-plane'))
  const flip = way(plane)
  const at = (/** @type {PointerEvent} */ next) => {
    const box = plane.getBoundingClientRect()
    return { x: flip > 0 ? next.clientX - box.left : box.right - next.clientX, y: next.clientY - box.top }
  }
  port.setPointerCapture(event.pointerId)
  link.value = { from: node.id, ...at(event) }
  const move = (/** @type {PointerEvent} */ next) => { link.value = { from: node.id, ...at(next) } }
  const up = (/** @type {PointerEvent} */ next) => {
    port.removeEventListener('pointermove', move)
    port.removeEventListener('pointerup', up)
    port.removeEventListener('pointercancel', up)
    link.value = null
    const target = /** @type {HTMLElement | null} */ (document.elementFromPoint(next.clientX, next.clientY)?.closest('.flow-step'))
    if (next.type === 'pointerup' && target?.dataset.id && target.dataset.id !== node.id) wire(one, node.id, target.dataset.id)
  }
  port.addEventListener('pointermove', move)
  port.addEventListener('pointerup', up)
  port.addEventListener('pointercancel', up)
}

/** A flow's card with the keyboard: arrows move it, Enter opens its form, Delete removes it. @param {KeyboardEvent} event @param {Saved} one @param {Node} node */
function keys(event, one, node) {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
  const step = event.shiftKey ? STRIDE : NUDGE
  const flip = way(/** @type {globalThis.Element} */ (event.currentTarget))
  const moves = /** @type {Record<string, [number, number]>} */ ({ ArrowLeft: [-step * flip, 0], ArrowRight: [step * flip, 0], ArrowUp: [0, -step], ArrowDown: [0, step] })
  if (event.key in moves) {
    event.preventDefault()
    const [dx, dy] = moves[event.key]
    changeStep(one, node.id, { x: snap(node.x + dx), y: snap(node.y + dy) })
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selected.value = selected.peek() === node.id ? null : node.id
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    const step = one.steps.find((candidate) => candidate.id === node.id)
    if (step) removeStep(one, step)
  }
}

/** A task's card leads to its line in the conversation, opened. @param {Node} node */
function reveal(node) {
  const id = node.call?.toolCallId
  const line = id && /** @type {HTMLElement | null} */ (document.querySelector(`app-conversation [data-call="${CSS.escape(id)}"]`))
  if (!line) return
  for (const details of [line.closest('details.activity'), line.querySelector('details.step')]) if (details instanceof HTMLDetailsElement) details.open = true
  line.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  line.querySelector('summary')?.focus({ preventScroll: true })
}

async function fullscreen() {
  const pane = /** @type {HTMLElement | null} */ (document.querySelector('aside.flows'))
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
  else if (document.fullscreenEnabled && pane?.requestFullscreen) await pane.requestFullscreen().catch(() => { full.value = !full.peek() })
  else full.value = !full.peek()
}
document.addEventListener('fullscreenchange', () => { full.value = Boolean(document.fullscreenElement?.matches('aside.flows')) })

/** A new flow, empty, shown in flow mode. */
async function startFlow() {
  selected.value = null
  editing.value = (await saveFlow(newFlow(t('flows.untitled'), app.deviceId))).id
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

/** Where a card is: where it is being moved to, while it is. @param {Node} node */
const placeOf = (node) => (drag.value?.id === node.id ? drag.value : node)

/** A wire's curve from one card's end to another's start. @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
function curve(a, b) {
  const [x1, y1, x2, y2] = [a.x + CARD.w, a.y + CARD.h / 2, b.x, b.y + CARD.h / 2]
  const bend = Math.max(40, Math.abs(x2 - x1) / 2)
  return `M${x1} ${y1}C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`
}

/** The label of a task's card: what the activity calls it. @param {Node} node */
function nameOf(node) {
  if (node.kind === 'brain' || node.kind === 'answer') return node.call ? t('activity.brain', { brain: brainName(node.call) }) : node.name
  if (node.kind === 'call' && node.call) return toolLabel(node.call)
  return node.name
}

/** The skill a call read, by the name the brain gave it, without a file beside its steps. @param {import('../../core/types.js').ToolCallInfo} call */
function skillName(call) {
  return String(call.rawInput?.name ?? '').split('/')[0]
}

/** Under a task's card that read a skill: the skill, as the user's list names it, or by its name until that is read. @param {Node} node */
function skillOf(node) {
  if (node.call?.name !== 'skill') return ''
  const name = skillName(node.call)
  return skillTitles.value.get(name) ?? name.replace(/-/g, ' ')
}

/** A button with a picture, its name said on hover and to screen readers. @param {string} text @param {unknown} icon @param {() => unknown} run */
const iconButton = (text, icon, run) => html`<button class="icon-button" aria-label=${text} @click=${run}>${icon}</button>`

/** What a flow's head offers: Run, and Schedule, which says when its routine runs next once it has one. @param {Saved} one */
function actions(one) {
  const next = room.value.next.get(one.id)
  const when = next ? t('flows.next', { when: relativeTime(next) }) : t('flows.schedule')
  return html`<button class="button primary flows-run" ?disabled=${app.busy.value || !one.steps.length} @click=${() => runNow(one)}>${GLYPHS.run} ${t('flows.run')}</button>
    <button class="button" title=${when} @click=${() => schedule(one).then(() => routineOf(one)).then((date) => {
      if (date) room.value = { ...room.peek(), next: new Map(room.peek().next).set(one.id, date) }
    })}>${icons.alarm}<span>${when}</span></button>`
}

/**
 * The drawing, in either place: a flow's name and Add a step, the stage, the form of the step picked, and for a task, an offer to keep its steps.
 * @param {Saved | null} one @param {ReturnType<typeof drawingOf>} drawn
 */
function board(one, { steps, wires, states, results }) {
  const byId = new Map(steps.map((node) => [node.id, node]))
  const width = Math.max(0, ...steps.map((node) => placeOf(node).x)) + CARD.w + COLUMN
  const height = Math.max(0, ...steps.map((node) => placeOf(node).y)) + CARD.h + LINE
  const step = one?.steps.find((candidate) => candidate.id === selected.value)
  const running = steps.filter((node) => states.get(node.id) === 'running').map((node) => (one ? node.name : nameOf(node)))
  const calls = steps.filter((node) => node.kind === 'call').length
  return html`${one ? html`<div class="flows-tools">
      <input class="flows-name" dir="auto" aria-label=${t('flows.name')} .value=${live(one.name)} @change=${(/** @type {Event} */ event) => {
        const name = /** @type {HTMLInputElement} */ (event.target).value.trim()
        if (name) put({ ...one, name })
      }}>
      <details class="flows-add">
        <summary class="button">${icons.plus} ${t('flows.add')}</summary>
        <div class="flows-menu">${(/** @type {const} */ (['text', 'file', 'ask', 'tool'])).map((kind) => html`<button class="button subtle" @click=${(/** @type {Event} */ event) => {
          /** @type {HTMLDetailsElement} */ (/** @type {globalThis.Element} */ (event.target).closest('details')).open = false
          addStep(one, kind)
        }}>${KINDS[kind]} ${t(`flows.kind.${kind}`)}</button>`)}</div>
      </details>
    </div>` : nothing}
    <div class="flows-stage">
      <div class="flows-plane" .style=${`--w: ${width}px; --h: ${height}px`}>
        <svg class="flows-wires" width=${width} height=${height} viewBox="0 0 ${width} ${height}" aria-hidden="true">
          ${wires.map(([from, to]) => {
            const a = byId.get(from)
            const b = byId.get(to)
            return a && b ? svg`<path d=${curve(placeOf(a), placeOf(b))} data-state=${states.get(to) ?? 'queued'}></path>` : nothing
          })}
          ${link.value && byId.get(link.value.from) ? svg`<path class="is-drawn" d=${curve(placeOf(/** @type {Node} */ (byId.get(link.value.from))), { x: link.value.x, y: link.value.y - CARD.h / 2 })}></path>` : nothing}
        </svg>
        ${repeat(steps, (node) => node.id, (node) => card(node, one, states.get(node.id), byId))}
      </div>
      ${!steps.length ? html`<p class="flows-empty muted">${one ? t('flows.empty') : t('flows.taskEmpty')}</p>` : nothing}
    </div>
    ${one && step ? form(one, step, results.get(step.id)) : nothing}
    ${!one && calls >= 2 && !app.busy.value ? html`<div class="flows-foot"><button class="button" @click=${() => import('../../ui/discovery.js').then((discovery) => discovery.follow('flow'))}>
      ${icons.plus} ${t('suggest.flow')}</button></div>` : nothing}
    <p class="visually-hidden" aria-live="polite">${running.length ? t('flows.running', { name: running.join(', ') }) : ''}</p>`
}

/**
 * After a drawing: another flow, or the task, starts at its start; a step just added has the keyboard; the step running now stays in view.
 * @param {HTMLElement} element @param {{ drew: string, following: string | null }} seen what it drew and followed last
 */
function settle(element, seen) {
  const what = element.localName === 'app-flow-main' ? `main:${editing.peek()}` : `pane:${shown.peek()}`
  if (seen.drew !== what) element.querySelector('.flows-stage')?.scrollTo({ left: 0, top: 0, behavior: 'instant' })
  seen.drew = what
  if (focusOn) {
    /** @type {HTMLElement | null} */ (element.querySelector(`.flow-step[data-id="${CSS.escape(focusOn)}"]`))?.focus()
    focusOn = null
  }
  const going = [...element.querySelectorAll('.flow-step[data-state="running"]')].at(-1)
  if (going && going.getAttribute('data-id') !== seen.following) going.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  seen.following = going?.getAttribute('data-id') ?? null
}

/** Beside a task: the task drawn as a flow, or a flow it made or ran, to change and run again. */
export class Flows extends Element {
  #seen = { drew: '', following: /** @type {string | null} */ (null) }

  render() {
    // It belongs to a task: on a new task, flow mode has the main area, and the pane waits for one.
    if (!open.value || !app.current.value?.records.length) return nothing
    const one = paneFlow.value
    const choices = related.value
    return html`<aside class="pane flows ${full.value ? 'is-full' : ''}" aria-label=${t('cap.flows.name')}>
      <header class="pane-head flows-bar">
        ${choices.length ? html`<select class="flows-pick" aria-label=${t('flows.pick')} @change=${(/** @type {Event} */ event) => {
          selected.value = null
          show(/** @type {HTMLSelectElement} */ (event.target).value)
        }}>
          <option value="task" ?selected=${!one}>${t('flows.task')}</option>
          ${choices.map((other) => html`<option value=${other.id} ?selected=${other.id === one?.id}>${other.name}</option>`)}
        </select><span class="flows-gap"></span>` : html`<h2>${t('flows.task')}</h2>`}
        ${one ? actions(one) : nothing}
        ${iconButton(full.value ? t('flows.exitFullscreen') : t('flows.fullscreen'), full.value ? GLYPHS.exit : GLYPHS.full, fullscreen)}
        ${iconButton(t('action.close'), icons.close, close)}
      </header>
      ${board(one, drawingOf(one))}
    </aside>`
  }

  updated() {
    if (dock.place(this, open.value && Boolean(app.current.peek()?.records.length))) /** @type {HTMLElement | null} */ (this.querySelector('.flows-pick, .flow-step'))?.focus()
    settle(this, this.#seen)
  }
}

/** Flow mode, on a new task: the room's flows, one at a time, in the main area, made, changed, run and scheduled there. */
export class FlowMain extends Element {
  #seen = { drew: '', following: /** @type {string | null} */ (null) }

  render() {
    if (editing.value === null) return nothing
    const one = mainFlow.value
    return html`<section class="flows flows-main" aria-label=${t('cap.flows.name')}>
      <header class="flows-bar">
        ${flows.value.length ? html`<select class="flows-pick" aria-label=${t('flows.pick')} @change=${(/** @type {Event} */ event) => {
          const value = /** @type {HTMLSelectElement} */ (event.target).value
          selected.value = null
          if (value === 'new') startFlow()
          else editing.value = value
        }}>
          ${flows.value.map((other) => html`<option value=${other.id} ?selected=${other.id === one?.id}>${other.name}</option>`)}
          <option value="new">${t('flows.new')}</option>
        </select>` : html`<h2>${t('cap.flows.name')}</h2>`}
        <span class="flows-gap"></span>
        ${one ? html`${actions(one)}${iconButton(t('flows.delete'), icons.trash, async () => {
          if (!confirm(t('flows.confirmDelete', { name: one.name }))) return
          await deleteFlow(one)
          editing.value = flows.peek().at(-1)?.id ?? ''
        })}` : nothing}
        ${iconButton(t('action.close'), icons.close, () => { editing.value = null })}
      </header>
      ${one ? board(one, drawingOf(one)) : html`<div class="flows-none">
        <p class="muted">${t('flows.none')}</p>
        <button class="button primary" @click=${startFlow}>${icons.plus} ${t('flows.new')}</button>
      </div>`}
    </section>`
  }

  updated() {
    settle(this, this.#seen)
  }
}

/**
 * A card: what kind of step it is, its name, a few words of what it does, and its state; a flow's moves
 * and has an end to draw a wire from. @param {Node} node @param {Saved | null} one @param {State | undefined} state @param {Map<string, Node>} byId
 */
function card(node, one, state, byId) {
  const { x, y } = placeOf(node)
  const name = one ? node.name : nameOf(node)
  const skill = one ? '' : skillOf(node)
  const detail = skill || node.detail
  const said = state ? t(`flows.state.${state}`) : ''
  const kind = t(`flows.kind.${node.kind}`)
  const after = one ? inputsOf(one, node.id).map((id) => byId.get(id)?.name).filter(Boolean) : []
  return html`<div class="flow-step" data-id=${node.id} data-kind=${node.kind} data-state=${state ?? nothing} ?data-selected=${one && selected.value === node.id}
    ?data-moving=${drag.value?.id === node.id} .style=${`--x: ${x}px; --y: ${y}px`} tabindex="0" role="button"
    aria-label=${[kind, name, skill, said, after.length ? t('flows.takes', { names: after.join(', ') }) : ''].filter(Boolean).join(' · ')} aria-expanded=${one ? String(selected.value === node.id) : nothing}
    @pointerdown=${one ? (/** @type {PointerEvent} */ event) => grab(event, one, node) : nothing}
    @click=${one ? nothing : () => reveal(node)}
    @keydown=${(/** @type {KeyboardEvent} */ event) => (one ? keys(event, one, node) : (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), reveal(node)))}>
    <span class="flow-kind">${KINDS[node.kind] ?? icons.bolt}<span>${kind}</span>${state ? html`<span class="flow-state" title=${said}>${MARKS[state] ?? nothing}</span>` : nothing}</span>
    <strong dir="auto">${name}</strong>
    ${detail ? html`<small dir="auto">${detail}</small>` : nothing}
    ${one ? html`<span class="flow-port is-in" aria-hidden="true"></span>
      <span class="flow-port is-out" title=${t('flows.wire')} aria-hidden="true" @pointerdown=${(/** @type {PointerEvent} */ event) => draw(event, one, node)}></span>` : nothing}
  </div>`
}

// ─── A step's form ───────────────────────────────────────────────────────────

/** The text box last in use, where a result's name goes in. @type {HTMLInputElement | HTMLTextAreaElement | null} */
let typing = null

/** Puts {{Name}} where the caret is in the box last in use, and keeps it. @param {string} name */
function insert(name) {
  const box = typing
  if (!box?.isConnected) return
  const at = box.selectionStart ?? box.value.length
  box.setRangeText(`{{${name}}}`, at, box.selectionEnd ?? at, 'end')
  box.dispatchEvent(new Event('change', { bubbles: true }))
  box.focus()
}

/** @param {Event} event */
const valueOf = (event) => /** @type {HTMLInputElement} */ (event.target).value

/**
 * A field of a tool's arguments, from its JSON schema: a list to pick from, a switch, a number, a line or a
 * box of text, or JSON for the rest. @param {Saved} one @param {Step} step @param {string} name @param {any} schema @param {boolean} required
 */
function argument(one, step, name, schema, required) {
  const value = step.args?.[name]
  const set = (/** @type {unknown} */ next) => changeStep(one, step.id, { args: { ...step.args, [name]: next } })
  const title = `${name.replace(/_/g, ' ')}${required ? ' *' : ''}`
  if (Array.isArray(schema?.enum)) return html`<label>${title}<select @change=${(/** @type {Event} */ event) => set(valueOf(event))}>
    <option value="" ?selected=${value === undefined}></option>${schema.enum.map((/** @type {string} */ option) => html`<option ?selected=${option === value}>${option}</option>`)}</select></label>`
  if (schema?.type === 'boolean') return html`<label class="flows-check"><input type="checkbox" .checked=${Boolean(value)} @change=${(/** @type {Event} */ event) => set(/** @type {HTMLInputElement} */ (event.target).checked)}>${title}</label>`
  if (schema?.type === 'number' || schema?.type === 'integer') return html`<label>${title}<input type="number" .value=${live(value === undefined ? '' : String(value))}
    @change=${(/** @type {Event} */ event) => set(valueOf(event) === '' ? undefined : Number(valueOf(event)))}></label>`
  if (schema?.type === 'string' || schema?.type === undefined) return LONG.test(name) || String(value ?? '').length > 60
    ? html`<label>${title}<textarea rows="4" dir="auto" .value=${live(String(value ?? ''))} @focus=${remember} @change=${(/** @type {Event} */ event) => set(valueOf(event))}></textarea></label>`
    : html`<label>${title}<input dir="auto" .value=${live(String(value ?? ''))} @focus=${remember} @change=${(/** @type {Event} */ event) => set(valueOf(event))}></label>`
  return html`<label>${title}<textarea rows="3" dir="ltr" class="flows-json" .value=${live(value === undefined ? '' : JSON.stringify(value, null, 2))} @focus=${remember}
    @change=${(/** @type {Event} */ event) => {
      const box = /** @type {HTMLTextAreaElement} */ (event.target)
      try {
        set(box.value.trim() ? JSON.parse(box.value) : undefined)
        box.removeAttribute('aria-invalid')
      } catch {
        box.setAttribute('aria-invalid', 'true')
      }
    }}></textarea></label>`
}

/** @param {FocusEvent} event */
const remember = (event) => { typing = /** @type {HTMLInputElement} */ (event.target) }

/** The tools a step can use, grouped by what Jean can do, a service's under Connections. */
function toolChoices() {
  /** @type {Map<string, string[]>} */
  const groups = new Map()
  const names = new Set(usable().map((tool) => tool.spec.name))
  for (const [id, capability] of loaded.value) {
    const mine = (capability.tools ?? []).map((tool) => tool.spec.name).filter((name) => names.has(name))
    if (mine.length) groups.set(t(`cap.${id}.name`) === `cap.${id}.name` ? id : t(`cap.${id}.name`), mine)
  }
  return groups
}

/**
 * What a step is and does, whose results it takes, once per item, and its last result.
 * @param {Saved} one @param {Step} step @param {string | undefined} result
 */
function form(one, step, result) {
  const kind = kindOf(step)
  const set = (/** @type {Partial<Step>} */ change) => changeStep(one, step.id, change)
  const taken = inputsOf(one, step.id)
  const names = taken.map((id) => one.steps.find((other) => other.id === id)?.name).filter(Boolean)
  const tool = kind === 'tool' ? usable().find((candidate) => candidate.spec.name === step.tool) : undefined
  const schema = /** @type {any} */ (tool?.spec.parameters ?? {})
  return html`<form class="flows-form" aria-label=${step.name} @submit=${(/** @type {Event} */ event) => event.preventDefault()}>
    <label>${t('flows.stepName')}<input dir="auto" .value=${live(step.name)} @change=${(/** @type {Event} */ event) => {
      const name = valueOf(event).trim()
      if (name && !one.steps.some((other) => other !== step && other.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) set({ name })
    }}></label>
    ${kind === 'text' ? html`<label>${t('flows.kind.text')}<textarea rows="4" dir="auto" .value=${live(step.text ?? '')} @focus=${remember} @change=${(/** @type {Event} */ event) => set({ text: valueOf(event) })}></textarea></label>`
    : kind === 'file' ? html`<label>${t('flows.kind.file')}<select @change=${(/** @type {Event} */ event) => set({ file: valueOf(event) })}>
        <option value="" ?selected=${!step.file}></option>
        ${[...new Set([...(step.file ? [step.file] : []), ...room.value.files])].map((name) => html`<option ?selected=${name === step.file}>${name}</option>`)}</select></label>`
    : kind === 'ask' ? html`<label>${t('flows.instructions')}<textarea rows="5" dir="auto" .value=${live(step.ask ?? '')} @focus=${remember} @change=${(/** @type {Event} */ event) => set({ ask: valueOf(event) })}></textarea></label>
      ${room.value.skills.length || step.skill ? html`<label>${t('flows.skill')}<select @change=${(/** @type {Event} */ event) => set({ skill: valueOf(event) || undefined })}>
        <option value="" ?selected=${!step.skill}>${t('flows.noSkill')}</option>
        ${[...new Set([...(step.skill ? [step.skill] : []), ...room.value.skills])].map((name) => html`<option ?selected=${name === step.skill}>${name}</option>`)}</select></label>` : nothing}`
    : html`<label>${t('flows.kind.tool')}<select @change=${(/** @type {Event} */ event) => set({ tool: valueOf(event), args: {} })}>
        <option value="" ?selected=${!step.tool}>${t('flows.chooseTool')}</option>
        ${step.tool && !tool ? html`<option selected value=${step.tool}>${step.tool}</option>` : nothing}
        ${[...toolChoices()].map(([group, list]) => html`<optgroup label=${group}>${list.map((name) => html`<option value=${name} ?selected=${name === step.tool}>${name.replace(/_/g, ' ')}</option>`)}</optgroup>`)}
      </select></label>
      ${Object.entries(schema.properties ?? {}).map(([name, field]) => argument(one, step, name, field, (schema.required ?? []).includes(name)))}`}
    ${names.length ? html`<p class="flows-names">${t('flows.insert')} ${names.map((name) => html`<button type="button" class="flows-chip" dir="auto" @click=${() => insert(String(name))}>${name}</button>`)}</p>` : nothing}
    ${one.steps.length > 1 ? html`<fieldset><legend>${t('flows.after')}</legend>
      ${one.steps.filter((other) => other !== step).map((other) => html`<label class="flows-check"><input type="checkbox" .checked=${taken.includes(other.id)}
        ?disabled=${!taken.includes(other.id) && loops(one, other.id, step.id)} @change=${() => wire(one, other.id, step.id)}><span dir="auto">${other.name}</span></label>`)}
    </fieldset>` : nothing}
    <label class="flows-check"><input type="checkbox" .checked=${Boolean(step.each)} @change=${(/** @type {Event} */ event) => set({ each: /** @type {HTMLInputElement} */ (event.target).checked || undefined })}>${t('flows.each')}</label>
    ${result !== undefined ? html`<details class="flows-result"><summary>${t('flows.result')}</summary><pre tabindex="0" dir="auto">${result}</pre></details>` : nothing}
    <div class="row"><button type="button" class="button subtle danger" @click=${() => removeStep(one, step)}>${icons.trash} ${t('flows.remove')}</button></div>
  </form>`
}
