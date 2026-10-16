// Dictation written as it is said, with Whistle or Whisper (no I/O, tested under node --test): what
// was said since the last pause is written again each time half a second more has come, and kept
// once the user pauses, so no pass grows long. Silence is never written: Whisper would invent words.

/**
 * In frames of 96 ms (capture-worklet.js): a pass each half second, a pause of 0.8 s, 0.3 s kept
 * before speech, at most 14.4 s at once, else cut at its quietest frame in the last 4.8 s. A frame
 * is speech when louder than three times the quietest one heard, kept between 0.004 (the browsers'
 * own noise suppression keeps a room's hum under that) and 0.03, so that speech with no gap from
 * the first frame is still speech.
 */
export const PASSES = Object.freeze({ again: 5, pause: 8, before: 3, longest: 150, cut: 50, over: 3, least: 0.004, most: 0.03 })

/** Words after words: a space between, unless there is one already or the language writes none. @param {string} before @param {string} words */
export const join = (before, words, spaced = true) => (before && words && spaced && !/\s$/.test(before) ? `${before} ${words}` : before + words)

/**
 * @param {(audio: Float32Array<ArrayBuffer>) => Promise<string>} write what the audio says, at the microphone's rate
 * @param {(words: string) => void} show everything written so far, each time it changes
 * @param {string} lang a tag ("fr-FR"): Chinese, Japanese, Thai, Lao, Khmer and Burmese join without spaces
 * @returns {{ hear: (frame: Float32Array) => void, end: () => Promise<string> }}
 */
export function passes(write, show, lang, limits = PASSES) {
  const spaced = !/^(ja|zh|th|lo|km|my)\b/.test(lang)
  /** @type {Array<{ frame: Float32Array, level: number }>} the frames since what was kept, and their loudness (root mean square) */
  const heard = []
  let [floor, to, kept, words, ended, running, failed] = [Infinity, 0, '', '', false, /** @type {Promise<void> | null} */ (null), /** @type {unknown} */ (null)]
  /** The first frames, end to end, all of the worklet's one length. @param {number} end */
  const audio = (end) => heard.slice(0, end).reduce((out, { frame }, i) => (out.set(frame, i * frame.length), out), new Float32Array(end * heard[0].frame.length))
  const drop = (/** @type {number} */ count) => {
    heard.splice(0, count)
    ;[to, words] = [0, '']
  }

  /** A pass, or keeping what was written before a pause; false when there is nothing to do yet. */
  async function step() {
    const quiet = Math.min(Math.max(limits.least, limits.over * floor), limits.most)
    const voiced = (/** @type {number} */ i) => heard[i].level > quiet
    let last = heard.length - 1
    while (last >= 0 && !voiced(last)) last--
    if (last < 0) return drop(heard.length - limits.before), false
    // The last pass ended in a pause of its length, even if speech came again while it ran (a slow writer): its words are kept.
    let [before, next] = [to - 1, to]
    while (before >= 0 && !voiced(before)) before--
    while (next < heard.length && !voiced(next)) next++
    if (to && (next - 1 - before >= limits.pause || (ended && next === heard.length))) return (kept = join(kept, words, spaced)), drop(to), true
    if (heard.length > limits.longest) {
      /** @type {number} */
      let cut = limits.longest
      for (let i = cut - limits.cut; i < limits.longest; i++) if (heard[i].level < heard[cut].level) cut = i
      kept = join(kept, (await write(audio(cut))).trim(), spaced)
      return drop(cut), true
    }
    if (last < to || (!ended && heard.length - to < limits.again)) return false
    to = heard.length
    words = (await write(audio(to))).trim()
    return show(join(kept, words, spaced)), true
  }
  const run = () => (running ??= (async () => { while (!failed && (await step())); })().catch((error) => { failed = error }).finally(() => { running = null }))

  return {
    hear(frame) {
      const level = Math.sqrt(frame.reduce((sum, x) => sum + x * x, 0) / frame.length)
      heard.push({ frame, level })
      // A microphone starting up gives zeros: they would make every murmur speech.
      if (level > 0) floor = Math.min(floor, level)
      run()
    },
    /** Writes what is left, and gives everything written. */
    async end() {
      ended = true
      await running
      await run()
      if (failed) throw failed
      show(kept)
      return kept
    },
  }
}
