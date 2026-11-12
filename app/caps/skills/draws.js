// What came from someone else draws here as it did there (D378). A chart, a score or a deck needs a skill of the room that declares
// its kind of block, or it shows as code (D196): in a task that holds something from elsewhere (D673's `shared` note: brought in from
// a share, sent through People, worked on together), each time it shows and isn't being answered here, and in a document or project
// worked on together as its words come (caps/together), Jean's own skill that declares it is added to the room the thing is in, and
// the toast names it. Skills is turned on only then; one the person turned off stays off. Share, People and Together load it.
import { effect } from '@preact/signals-core'
import { walkTokens } from 'marked'
import { unlock } from '../../ui/caps.js'
import { lex } from '../../ui/markdown.js'
import { app } from '../../ui/state.js'
import { foldTurns } from '../../core/events.js'

/** Jean's own skill for each kind of block it draws once a skill declares it, a deck fenced as Slidev's too (D591). */
export const DRAWS = /** @type {Record<string, string>} */ ({ echarts: 'chart', abc: 'music-score', deck: 'slides', slidev: 'slides' })
/** One at a time, so that no skill comes twice; the task on screen as last read. */
let queue = Promise.resolve(/** @type {string[]} */ ([])), last = ''

/**
 * Jean's own skills for what these texts hold, in the room of `dir`, a project's folder; the names of those added, in the user's
 * language, which the toast says unless `quiet`. @param {string[]} texts their Markdown @param {string} [dir] @param {boolean} [quiet]
 */
export const drawIn = (texts, dir = app.projectDir, quiet = false) => (queue = queue.then(async () => {
  const kinds = new Set(/** @type {string[]} */ ([]))
  walkTokens(texts.flatMap((text) => lex(text)), (token) => { if (token.type === 'code' && Object.hasOwn(DRAWS, String(token.lang).toLowerCase())) kinds.add(String(token.lang).toLowerCase()) })
  return kinds.size && (await unlock('skills')) ? (await import('./skills.js')).drawWith([...kinds], dir, quiet) : []
}).catch((error) => { console.warn('Skills', error); return [] }))

/** The answers of a task, as their Markdown. @param {import('../../core/types.js').Envelope[]} records */
export const answersOf = (records) => foldTurns(records).flatMap((turn) => turn.steps.map((step) => step.text))

// The task on screen, once it holds something from elsewhere and isn't being answered here: read again as it grows.
effect(() => {
  const task = app.current.value, now = `${task?.path} ${task?.records.length}`
  if (!task?.path || now === last || app.running.value.includes(task.path) || !task.records.some(({ update: u }) => u?.sessionUpdate === '_system_note' && /** @type {any} */ (u).data?.kind === 'shared')) return
  last = now
  drawIn(answersOf(task.records))
})
