// A score's sound (D338): the instruments its notes ask for, from MS Basic's files in vendor/sounds/,
// or where a saved copy names them, each downloaded once, checked against its SHA-256 and kept apart
// from app versions where the browser keeps caches, then played by spessasynth_core a second at a
// time, each second handed on as it is made, so that the music starts with the first. In a worker
// (./sound-worker.js), or on the page of a saved copy, whose files come from an address that starts none.
import { download } from '../../ui/weights.js'

/** @typedef {import('./notes.js').Note} Note */
/** @typedef {{ files: { path: string, sha256: string, bytes: number }[], programs: number[], drums: number }} Index */

/** How long a part handed on lasts, and how long the sound carries on after the last note (its release, the room's echo), in seconds. */
const PART = 1
const TAIL = 2
/** spessasynth_core, loaded with the first sound: awaited at the top, a worker would take its first request before it listens. @type {Promise<any> | null} */
let library = null
/** The files read so far, by name (their hash), each with the samples it has decoded. @type {Map<string, any>} */
const banks = new Map()

/** A note's channel: the drums' own, or its track's, General MIDI's tenth left to the drums. @param {Note} note */
const channelOf = (note) => (note.instrument === 128 ? 9 : (note.track + (note.track >= 9 ? 1 : 0)) % 16)

/**
 * The music of `notes` at `rate`, from the instruments at `base` (this Jean's own when none): what of
 * them has come, then each second, handed to `post`, until it is done or `stopped()`.
 * @param {{ notes: Note[], rate: number, base?: string }} request
 * @param {(message: Record<string, any>, transfer?: Transferable[]) => void} post @param {() => boolean} stopped
 */
export async function render({ notes, rate, base }, post, stopped) {
  const { SoundBankLoader, SpessaSynthProcessor } = await (library ??= import(new URL('../../vendor/spessasynth/spessasynth.mjs', import.meta.url).href))
  const sounds = new URL(base || '../../vendor/sounds/', import.meta.url)
  const { files, programs, drums } = /** @type {Index} */ (await (await fetch(new URL('sounds.json', sounds))).json())
  const wanted = [...new Set(notes.map((note) => files[note.instrument === 128 ? drums : (programs[note.instrument] ?? programs[0])]))]
  const got = wanted.map((file) => (banks.has(file.path) ? file.bytes : 0))
  const total = wanted.reduce((sum, file) => sum + file.bytes, 0)
  const synth = new SpessaSynthProcessor(rate, { eventsEnabled: false })
  for (const [i, file] of wanted.entries()) {
    if (!banks.has(file.path)) {
      const progress = (/** @type {number} */ bytes) => post({ type: 'progress', loaded: (got[i] = bytes, got.reduce((a, b) => a + b)), total })
      banks.set(file.path, SoundBankLoader.fromArrayBuffer(await download(new URL(file.path, sounds).href, file.sha256, progress, 'app-sounds')))
    }
    synth.soundBankManager.addSoundBank(banks.get(file.path), file.path)
  }
  await synth.processorInitialized
  synth.setSystemParameter('autoAllocateVoices', true)
  // Each note's start and end, at their sample; at the same one, an end before a start.
  const events = notes.flatMap((/** @type {Note} */ note) => [{ frame: Math.round(note.at * rate), note, on: true }, { frame: Math.round((note.at + note.length) * rate), note, on: false }])
    .sort((a, b) => a.frame - b.frame || Number(a.on) - Number(b.on))
  /** @type {number[]} */
  const instruments = []
  const length = Math.ceil((Math.max(0, ...events.map((event) => event.frame / rate)) + TAIL) * rate)
  let next = 0
  for (let start = 0; start < length && !stopped(); start += PART * rate) {
    const size = Math.min(PART * rate, length - start)
    const left = new Float32Array(size)
    const right = new Float32Array(size)
    for (let done = 0; done < size;) {
      for (; next < events.length && events[next].frame <= start + done; next++) {
        const { note, on } = events[next]
        const channel = channelOf(note)
        if (on && note.instrument !== 128 && instruments[channel] !== note.instrument) synth.programChange(channel, (instruments[channel] = note.instrument))
        if (on) synth.noteOn(channel, note.pitch, Math.max(1, Math.round(note.volume * 127)))
        else synth.noteOff(channel, note.pitch)
      }
      // Small steps, as spessasynth_core asks: its modulators and vibratos move between them.
      const until = Math.min(size, done + 128, (events[next]?.frame ?? Infinity) - start)
      synth.process(left, right, done, until - done)
      done = until
    }
    post({ type: 'chunk', at: start / rate, left, right }, [left.buffer, right.buffer])
    await new Promise((resolve) => setTimeout(resolve))
  }
}
