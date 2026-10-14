// A score's notes as sounds (D196, D338): abcjs gives each note's pitch, volume, instrument, start
// and length in whole notes; here they become seconds, for MS Basic's instruments (sound-worker.js)
// or, without them, Jean's own small synthesizer, which takes frequencies. Pure, so Node's tests run it.

/** @typedef {{ cmd: string, pitch?: number, volume?: number, instrument?: number, start: number, duration: number, gap?: number, cents?: number }} Event */
/** @typedef {{ at: number, length: number, pitch: number, frequency: number, volume: number, instrument: number, track: number }} Note */

/**
 * The notes of every track, by when they start. `seconds` is how long a whole note lasts. A note
 * stops a little before the next when the music says so (staccato's gap), never by more than two
 * thirds of it, as abcjs plays it. Its instrument is General MIDI's (128: the drums).
 * @param {{ tracks: Event[][] }} sequence @param {number} seconds @returns {Note[]}
 */
export function notesOf(sequence, seconds) {
  return sequence.tracks.flatMap((events, track) => events
    .filter((event) => event.cmd === 'note' && typeof event.pitch === 'number' && event.duration > 0)
    .map((event) => ({
      at: event.start * seconds,
      length: (event.duration - Math.min(event.gap ?? 0, (event.duration * 2) / 3)) * seconds,
      pitch: event.pitch ?? 69,
      frequency: 440 * 2 ** (((event.pitch ?? 69) + (event.cents ?? 0) / 100 - 69) / 12),
      volume: Math.min(1, (event.volume ?? 105) / 127),
      instrument: event.instrument ?? 0,
      track,
    })))
    .sort((a, b) => a.at - b.at)
}

/** How long a whole note lasts: a measure's length over its share of a whole note. @param {number} millisecondsPerMeasure @param {{ num: number, den: number }} meter */
export const wholeNote = (millisecondsPerMeasure, meter) => millisecondsPerMeasure / 1000 / (meter.den ? meter.num / meter.den : 1)
