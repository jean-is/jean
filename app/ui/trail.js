// SPDX-License-Identifier: MIT
// Where a request is (D771): each send from the box, and the stages a request then goes through, a capability's hook holding it
// included, on a trail of its own, which the live answer and the box say once one lasts, and a report for support carries
// (caps/report). Loaded with what the user discovered, right after the first paint, never with it (ui/app.js), so that it also
// keeps Jean's own warnings and errors from then on, which only a report reads, scrubbed. It sends nothing anywhere.
import { signal } from '@preact/signals-core'
import { app, runs, decisionsHere } from './state.js'
import { unlock } from './caps.js'

/**
 * A stage: what the request waits on, as a report names it (`choose`, `prepare`, `read`, `key`, `hook`, `ask`, `write`, `retry`, `call`,
 * `decide`), whose hook (`by`) on which event (`on`), which brain, which kind of call; when it began after the request did, and how long it lasted.
 * @typedef {{ id: string, by?: string, on?: string, brain?: string, kind?: string, at: number, ms?: number }} Stage
 * @typedef {{ began: number, path: string, stages: Stage[], outcome?: string, ended?: number }} Trail
 * A send from the box (`busy`: Jean was working on that task then, `asked`: a question waited), how long it took to reach the request, and what came of it.
 * @typedef {{ at: number, busy: boolean, asked: boolean, reached?: number, outcome?: string }} Attempt
 */

// Past this long on one stage, the capability that says it is loaded (caps/report); past this long, a send never reached is told.
export const SLOW_MS = 5000
const UNREACHED_MS = 3000
const MOST = 200

/** One more each time a trail or an attempt changes, for what draws them. */
export const moved = signal(0)
/** @type {Map<string, Trail>} the request under way by its task's path, '' for one starting a task */
export const trails = new Map()
/** @type {Trail[]} the last ones that ended, newest first */
export const ended = []
/** @type {Attempt[]} */
export const attempts = []
/** @type {{ at: number, level: string, text: string, stack?: string }[]} Jean's own warnings and errors, as they came */
export const log = []

const told = () => { moved.value++ }

/** A request begins, by the task it goes to; the send it answers has reached it. @param {string} path */
export function begin(path) {
  const trail = /** @type {Trail} */ ({ began: Date.now(), path, stages: [] }), last = attempts.at(-1)
  if (last && last.reached === undefined && !last.outcome) last.reached = trail.began - last.at
  trails.set(path, trail), told()
  return trail
}

/** The request now goes to this task, made for it. @param {Trail} trail @param {string} path */
export const moveTo = (trail, path) => { if (trails.get(trail.path) === trail) trails.delete(trail.path); trails.set((trail.path = path), trail), told() }

/**
 * The request waits on something else now. Gives back what puts the stage before it back, once, if nothing came after it (a hook went on).
 * @param {Trail | undefined} trail @param {string} id @param {Omit<Stage, 'id' | 'at' | 'ms'>} [more]
 */
export function mark(trail, id, more = {}) {
  if (!trail || trail.ended) return () => {}
  const now = Date.now() - trail.began, before = trail.stages.at(-1), stage = /** @type {Stage} */ ({ id, ...more, at: now })
  if (before) before.ms ??= now - before.at
  if (trail.stages.length < MOST) trail.stages.push(stage)
  told(), setTimeout(() => trail.stages.at(-1) === stage && !trail.ended && unlock('report'), SLOW_MS)
  let back = Boolean(before)
  // Once, while what is last is this stage, or this stage put back after another came within it (a card a hook asked).
  return () => { const last = trail.stages.at(-1); if (back && before && last?.id === id && last.by === more.by && last.on === more.on) { back = false; const { at, ms, ...was } = before; mark(trail, was.id, was) } }
}

/** The request ended, with what came of it: an answer, or why it stopped short. @param {Trail} trail @param {string} outcome */
export function end(trail, outcome) {
  if (trail.ended) return
  const last = trail.stages.at(-1), attempt = attempts.at(-1)
  ;[trail.ended, trail.outcome] = [Date.now() - trail.began, outcome]
  if (last) last.ms ??= trail.ended - last.at
  if (trails.get(trail.path) === trail) trails.delete(trail.path)
  if (attempt && attempt.reached !== undefined && !attempt.outcome && outcome !== 'answered') attempt.outcome = outcome
  ended.unshift(trail), ended.splice(5), told()
}

/**
 * Each hook, its stage on the trail while it holds the event, until it goes on or answers; what it is otherwise (whose, its tier, what
 * it matches, what it answers when it fails) stays, so the chain is the same (core/hooks.js). @param {import('../core/hooks.js').Hook[]} hooks @param {Trail | undefined} trail
 */
export const watched = (hooks, trail) => (!trail ? hooks : hooks.map((hook) => ({ ...hook, run: (/** @type {any} */ e, /** @type {(e?: any) => Promise<any>} */ next) => {
  const back = mark(trail, 'hook', { by: hook.by ?? '', on: hook.on })
  try { return Promise.resolve(hook.run(e, (changed) => (back(), next(changed)))).finally(back) } catch (error) { back(); throw error }
} })))

/** The trail a decision waits on, by its task, while the person answers it. @param {string | undefined} path @param {Omit<Stage, 'id' | 'at' | 'ms'>} more */
export const deciding = (path, more) => mark(trails.get(path ?? ''), 'decide', more)

// ─── Sends from the box ──────────────────────────────────────────────────────

/** A send the person made: as Jean stood then, and, after a while, whether it reached a request. */
function attempted() {
  const path = app.current.peek()?.path ?? ''
  const attempt = /** @type {Attempt} */ ({ at: Date.now(), busy: app.busy.peek(), asked: decisionsHere().some((decision) => 'questions' in decision) })
  attempts.push(attempt), attempts.splice(0, attempts.length - 20)
  if (attempt.asked) attempt.outcome = 'answered'
  // Busy with no request under way here: the box gave the words back, never sent (ui/send.js's steer()).
  else if (attempt.busy && !runs.has(path)) attempt.outcome = 'held'
  told()
  if (attempt.outcome === 'held') return void unlock('report')
  if (attempt.busy || attempt.outcome) return
  setTimeout(async () => {
    if (attempt.reached !== undefined || attempt.outcome) return
    // Never reached: a page still turning held it, or the module that sends didn't load, which takes as long again to tell.
    const loads = await Promise.race([import('./send.js').then(() => true, () => false), new Promise((resolve) => setTimeout(() => resolve(null), UNREACHED_MS))])
    if (attempt.reached === undefined) (attempt.outcome = loads === false ? 'unloaded' : loads === null ? 'loading' : 'unreached'), told(), unlock('report')
  }, UNREACHED_MS)
}

// The box's Enter, unless the / and @ menu has it or an IME is composing, and its send button: read before the box acts on them.
document.addEventListener('keydown', (event) => {
  const area = /** @type {HTMLTextAreaElement} */ (event.target)
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && area.id === 'prompt' && !area.hasAttribute('aria-activedescendant') && area.value.trim()) attempted()
}, true)
document.addEventListener('click', (event) => { if (/** @type {Element} */ (event.target).closest?.('form.composer button.send:not(.is-stop, .is-live, :disabled)')) attempted() }, true)

// ─── Jean's own warnings and errors ──────────────────────────────────────────

/** @param {unknown} part */
const textOf = (part) => (part instanceof Error ? `${part.name}: ${part.message}` : typeof part === 'string' ? part : (() => { try { return JSON.stringify(part) ?? String(part) } catch { return String(part) } })())

/** @param {string} level @param {unknown[]} parts */
function keep(level, parts) {
  const error = parts.find((part) => part instanceof Error)
  log.push({ at: Date.now(), level, text: parts.map(textOf).join(' ').slice(0, 2000), ...(error instanceof Error && error.stack && { stack: error.stack.slice(0, 2000) }) }), log.splice(0, log.length - 50)
}
for (const level of /** @type {const} */ (['warn', 'error'])) {
  const said = console[level]
  console[level] = (...parts) => { keep(level, parts); said.apply(console, parts) }
}
addEventListener('error', (event) => keep('error', [event.error ?? event.message]))
addEventListener('unhandledrejection', (event) => keep('error', [event.reason]))
