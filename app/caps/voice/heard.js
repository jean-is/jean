// SPDX-License-Identifier: MIT
// A recording shared, heard on this device (D713): its sound decoded by the browser at 16 kHz, a film's too, cut into windows
// of about 30 s at their quietest moment, each written by dictation's writer (Whistle or Whisper, in the interface's
// language, downloaded once with consent), as lines with the time each window starts. Nothing of it leaves the device.
// Its cutting is pure, under node --test; the writer comes in only to write.
const RATE = 16_000
/** A window: at most 30 s, at least 20 s, cut at the quietest 100 ms between. */
const [LONGEST, SHORTEST, FRAME] = [30 * RATE, 20 * RATE, RATE / 10]

/** Where the window from `from` ends: its end, or the middle of its quietest 100 ms past 20 s. @param {Float32Array} audio @param {number} from */
export function cut(audio, from) {
  if (audio.length - from <= LONGEST) return audio.length
  let [best, least] = [from + LONGEST, Infinity]
  for (let at = from + SHORTEST; at + FRAME <= from + LONGEST; at += FRAME) {
    let sum = 0
    for (let i = at; i < at + FRAME; i++) sum += audio[i] * audio[i]
    if (sum < least) [least, best] = [sum, at + FRAME / 2]
  }
  return best
}

/** A time into the recording, as players write it: 2:03, or 1:02:03. @param {number} seconds */
export const stamp = (seconds) => {
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, Math.floor(seconds % 60)]
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')}`
}

/** Its sound, mono at 16 kHz, which decodeAudioData resamples to its context's rate. @param {ArrayBuffer} data */
async function decode(data) {
  const sound = await new OfflineAudioContext(1, RATE, RATE).decodeAudioData(data)
  const mono = sound.getChannelData(0).slice()
  for (let c = 1; c < sound.numberOfChannels; c++) sound.getChannelData(c).forEach((value, i) => { mono[i] += value })
  if (sound.numberOfChannels > 1) mono.forEach((value, i) => { mono[i] = value / sound.numberOfChannels })
  return mono
}

/**
 * What is said in a recording, a line for each window with when it starts, or null when the writer's download is declined.
 * @param {File} file @param {(done: number) => void} progress its share written, 0 to 1 @returns {Promise<string[] | null>}
 */
export async function heard(file, progress) {
  const { prepare, transcribe } = await import('./voice.js')
  if (!(await prepare())) return null
  const audio = await decode(await file.arrayBuffer())
  const lines = []
  for (let from = 0; from < audio.length;) {
    const to = cut(audio, from)
    const words = (await transcribe(audio.slice(from, to))).trim()
    if (words) lines.push(`[${stamp(from / RATE)}] ${words}`)
    progress(to / audio.length)
    from = to
  }
  return lines
}
