// A task's records played again as they came (D457), for a demo (ui/demo.js): what was said shows
// whole, and each answer is written again, each call under way and then done, and what the brain
// thought and wrote a few words at a time, since its file keeps them whole (core/loop.js).
/** @import { Envelope, AcpUpdate } from '../core/types.js' */

/** How long each beat holds, in milliseconds, at speed 1: before the first request, before the next, a brain asked, a few words, a call under way, done. */
export const PACE = { start: 600, read: 2500, think: 900, words: 35, call: 900, done: 200 }

/**
 * The records cut where the user speaks: what was said (a request, notes), then the answer, whose records name their step.
 * @param {Envelope[]} records @returns {{ said: Envelope[], answer: Envelope[] }[]}
 */
export function exchanges(records) {
  /** @type {{ said: Envelope[], answer: Envelope[] }[]} */
  const out = []
  for (const record of records) {
    const answering = record.step !== undefined
    const last = out.at(-1)
    if (last && (answering || !last.answer.length)) (answering ? last.answer : last.said).push(record)
    else out.push({ said: answering ? [] : [record], answer: answering ? [record] : [] })
  }
  return out
}

/** The request said, as its words. @param {Envelope[]} said */
export const requestOf = (said) => said.map(({ update }) => (update?.sessionUpdate === 'user_message_chunk' && update.content.type === 'text' ? update.content.text : '')).join('')

/** Text cut after each word, as a brain's stream comes, in the words of its language. @param {string} lang */
export function words(lang) {
  const segmenter = new Intl.Segmenter(lang, { granularity: 'word' })
  return (/** @type {string} */ text) => [...segmenter.segment(text)].reduce((/** @type {string[]} */ pieces, { segment, isWordLike }) => {
    if (isWordLike || !pieces.length) pieces.push(segment)
    else pieces[pieces.length - 1] += segment
    return pieces
  }, [])
}

/**
 * An answer's records as they came, each with how long it holds: a call under way, then done (a brain's
 * once its words are out), and what the brain thought and wrote, piece by piece.
 * @param {Envelope[]} answer @param {(text: string) => string[]} pieces
 * @returns {Generator<{ update: AcpUpdate, step: number, hold: number }>}
 */
export function* beats(answer, pieces) {
  /** @type {{ update: AcpUpdate, step: number } | null} */
  let asked = null
  for (const { update, step = 0 } of answer) {
    if (!update) continue
    const said = update.sessionUpdate === 'agent_message_chunk' || update.sessionUpdate === 'agent_thought_chunk'
    if (asked && !(said && step === asked.step)) {
      yield { ...asked, hold: PACE.done }
      asked = null
    }
    if (said) {
      for (const text of pieces(update.content.text)) yield { update: { ...update, content: { type: 'text', text } }, step, hold: PACE.words }
    } else if (update.sessionUpdate === 'tool_call' && update.status !== 'pending') {
      const brain = !update.name && !update._meta?.parent
      yield { update: { ...update, status: 'in_progress', rawOutput: undefined }, step, hold: brain ? PACE.think : PACE.call }
      if (brain) asked = { update, step }
      else yield { update, step, hold: PACE.done }
    } else yield { update, step, hold: PACE.done }
  }
  if (asked) yield { ...asked, hold: 0 }
}
