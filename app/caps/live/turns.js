// Turn-taking for live conversation, with no I/O (tested under node --test): when the user
// starts and stops speaking, from Silero's probability for each 32 ms of audio, and which
// sentences of a streaming answer are complete enough to read aloud.

/** Probabilities (0 to 1) and durations (ms). While Jean speaks, it takes longer speech to interrupt it. */
export const TURNS = Object.freeze({ start: 0.5, keep: 0.35, speechMs: 250, interruptMs: 500, silenceMs: 800, frameMs: 32 })

/** @returns {(probability: number, strict?: boolean) => 'start' | 'end' | null} one call per frame; strict while Jean speaks */
export function listener(turns = TURNS) {
  let voiced = 0
  let quiet = 0
  let speaking = false
  return (probability, strict = false) => {
    if (probability >= (speaking ? turns.keep : turns.start)) {
      voiced += turns.frameMs
      quiet = 0
    } else {
      quiet += turns.frameMs
      if (!speaking) voiced = 0
    }
    if (!speaking && voiced >= (strict ? turns.interruptMs : turns.speechMs)) {
      speaking = true
      return 'start'
    }
    if (speaking && quiet >= turns.silenceMs) {
      speaking = false
      voiced = 0
      return 'end'
    }
    return null
  }
}

/**
 * The sentences of `text` past its first `from` characters that can be read aloud now: each
 * complete one, and the last one too once the answer is complete. `next` is where to go on from.
 * @param {string} text @param {number} from @param {string} lang @param {boolean} final
 */
export function speakable(text, from, lang, final) {
  const segments = [...new Intl.Segmenter(lang, { granularity: 'sentence' }).segment(text.slice(from))]
  const done = final ? segments : segments.slice(0, -1)
  return { ready: done.map(({ segment }) => segment.trim()).filter(Boolean), next: from + done.reduce((sum, { segment }) => sum + segment.length, 0) }
}
