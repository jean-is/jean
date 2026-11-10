// A reel's time (D687): its scenes end to end, and in a task, each of the replay's waits and each stop's hold in the
// order app/ui/demo.js reaches them, so that a reel knows its length and its chapters before it plays, and its clock
// can end each wait when the reel says (demo.js's lent clock). Pure: reel.js plays it, test/watch.test.js holds it to
// what demo.js asks. It reads the replay as ui/replay.js cuts it, through '#app/' (package.json's imports, and
// reel.html's import map where the site serves app/'s files at its root).
import { PACE, beats, exchanges } from '#app/ui/replay.js'

/** @import { Envelope } from '#app/core/types.js' */

/**
 * A stop of a reel's task: a guided tour's stop (app/caps/tour/tour.js), timed, with what a reel adds.
 * at: a line of the task's file, just before it plays; a call's id, as it starts; `ask:<call's id>`, while its
 * approval waits; or `end`. on: what it points at, a selector in the replay, its last match that shows. click: the
 * pointer clicks it as the stop goes on. say: the caption. go: how long it holds the replay, in milliseconds.
 * @typedef {{ at: number | string, on?: string, say?: string, go: number, click?: boolean }} Stop
 */

/**
 * What a task's replay reaches, in demo.js's order: a moment where stops may hold it (demo.js asks the reel's
 * at()), a wait (the reel's wait(), for as long as the beat holds), the pause before a request (a wait as long as
 * PACE says, or none when stops held it just before), and an approval, which demo.js waits on its card for.
 * @typedef {{ kind: 'at', moment: number | string } | { kind: 'wait', ms: number } | { kind: 'pause', first: boolean } | { kind: 'ask', id: string }} Step
 */

/**
 * A task's steps as demo.js plays it in a reel: no `wait` in its address, no loop.
 * @param {Envelope[]} records  its records, the header left out @param {(record: Envelope) => number} lineOf  each one's line in its file
 * @param {(text: string) => string[]} cut  how its text is written, a few words at a time, or whole with less motion
 * @returns {Step[]}
 */
export function steps (records, lineOf, cut) {
  /** @type {Step[]} */
  const out = []
  for (const [index, { said, answer }] of exchanges(records).entries()) {
    for (const record of said) out.push({ kind: 'at', moment: lineOf(record) })
    out.push({ kind: 'pause', first: !index })
    const started = new Set()
    for (const { update, hold, record } of beats(answer, cut)) {
      if (!started.has(record) && started.add(record)) out.push({ kind: 'at', moment: lineOf(record) })
      if (update.sessionUpdate === 'tool_call' && update.status === 'in_progress') out.push({ kind: 'at', moment: update.toolCallId })
      if (update.sessionUpdate === 'tool_call' && update.status === 'pending' && update.name !== 'ask_user') out.push({ kind: 'ask', id: update.toolCallId })
      out.push({ kind: 'wait', ms: hold })
    }
  }
  out.push({ kind: 'at', moment: 'end' })
  return out
}

/**
 * What the reel answers demo.js, in order, each at its time from the scene's start: a moment (whether stops held it)
 * or a wait's end.
 * @typedef {{ kind: 'at', moment: number | string, time: number, held: boolean } | { kind: 'wait', time: number }} Call
 * A stop's hold, from its start to its end; and an approval the reel clicks, at its time.
 * @typedef {{ stop: Stop, start: number, end: number }} Hold
 * @typedef {{ id: string, time: number }} Ask
 * @typedef {{ calls: Call[], holds: Hold[], asks: Ask[], length: number }} TaskTime
 */

/**
 * A task's time: its steps laid end to end with its stops' holds, then a moment left at its end to see how it ended.
 * An approval holds for its stops (`ask:<id>`), or PACE.read without any, and is clicked as they go on.
 * @param {Step[]} list @param {Stop[]} stops @param {number} [tail] @returns {TaskTime}
 */
export function taskTime (list, stops, tail = PACE.read) {
  /** @type {Map<number | string, Stop[]>} */
  const at = new Map()
  for (const stop of stops) at.set(stop.at, [...at.get(stop.at) ?? [], stop])
  /** @type {TaskTime} */
  const out = { calls: [], holds: [], asks: [], length: 0 }
  let [time, held] = [0, false]
  /** Each stop at a moment, held one after the other. @param {number | string} moment */
  const hold = (moment) => {
    const here = at.get(moment) ?? []
    for (const stop of here) {
      out.holds.push({ stop, start: time, end: time + stop.go })
      time += stop.go
    }
    return here.length > 0
  }
  for (const step of list) {
    if (step.kind === 'at') {
      const any = hold(step.moment)
      held ||= any
      out.calls.push({ kind: 'at', moment: step.moment, time, held: any })
      continue
    }
    if (step.kind === 'ask') {
      if (!hold(`ask:${step.id}`)) time += PACE.read
      out.asks.push({ id: step.id, time })
    } else {
      // demo.js pauses before a request for PACE.read, or not at all once stops held it there (a tour's stopped).
      time += step.kind === 'wait' ? step.ms : step.first ? PACE.start : held ? 0 : PACE.read
      out.calls.push({ kind: 'wait', time })
    }
    held = false
  }
  out.length = time + tail
  return out
}

/**
 * A reel's scene: a card, held for its time, or a task, as long as its time says.
 * @typedef {{ kind: 'card', look: 'open' | 'title' | 'facts' | 'end', chapter: string, hold: number, title: string, line?: string, facts?: string[], cta?: { text: string, href: string } }} Card
 * @typedef {{ kind: 'task', chapter: string, src: string, stops: Stop[], tail?: number }} Task
 * @typedef {Card | Task} Scene
 */

/**
 * The scenes end to end: each one's start and end, in milliseconds from the reel's start, and the reel's length.
 * @template {Scene} T
 * @param {T[]} scenes @param {(scene: T, index: number) => number} length  a scene's
 * @returns {{ scenes: Array<T & { start: number, end: number }>, length: number }}
 */
export function reelTime (scenes, length) {
  let start = 0
  const timed = scenes.map((scene, index) => {
    const end = start + length(scene, index)
    const out = { ...scene, start, end }
    start = end
    return out
  })
  return { scenes: timed, length: start }
}
