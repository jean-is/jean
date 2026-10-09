// A score's notes as sounds (D196): abcjs gives each note's pitch, volume, start and length in whole
// notes; here they become seconds and frequencies, for Jean's own small synthesizer rather than
// abcjs's, which fetches its instruments from another site. Pure, so Node's tests run it.

/** @typedef {{ cmd: string, pitch?: number, volume?: number, start: number, duration: number, gap?: number, cents?: number }} Event */
/** @typedef {{ at: number, length: number, frequency: number, volume: number }} Note */

/**
 * The notes of every track, by when they start. `seconds` is how long a whole note lasts. A note
 * stops a little before the next when the music says so (staccato's gap), never by more than two
 * thirds of it, as abcjs plays it.
 * @param {{ tracks: Event[][] }} sequence @param {number} seconds @returns {Note[]}
 */
export function notesOf(sequence, seconds) {
  return sequence.tracks.flat()
    .filter((event) => event.cmd === 'note' && typeof event.pitch === 'number' && event.duration > 0)
    .map((event) => ({
      at: event.start * seconds,
      length: (event.duration - Math.min(event.gap ?? 0, (event.duration * 2) / 3)) * seconds,
      frequency: 440 * 2 ** (((event.pitch ?? 69) + (event.cents ?? 0) / 100 - 69) / 12),
      volume: Math.min(1, (event.volume ?? 105) / 127),
    }))
    .sort((a, b) => a.at - b.at)
}

/** How long a whole note lasts: a measure's length over its share of a whole note. @param {number} millisecondsPerMeasure @param {{ num: number, den: number }} meter */
export const wholeNote = (millisecondsPerMeasure, meter) => millisecondsPerMeasure / 1000 / (meter.den ? meter.num / meter.den : 1)
