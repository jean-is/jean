// MIDI files (D197): no browser plays one, so Jean does. Its notes are read here, then played by a
// small synthesizer of Jean's own through the Web Audio API, faster than they last, into a WAV that
// the page's own player plays, with its seeking and its volume. No instruments fetched from another
// site: each of General MIDI's sixteen families of instruments has a wave and an envelope of its
// own, and the drums are falling tones and noise. Reading is pure, so Node's tests run it.

/**
 * A note: when it starts and how long it is held, in seconds; its key, 0 to 127; how hard it is
 * struck, 0 to 1; its channel, 0 to 15 (9 is the drums'); its instrument, 0 to 127.
 * @typedef {{ at: number, length: number, key: number, velocity: number, channel: number, program: number }} Note
 */
/**
 * A channel's volume or expression (0 to 1), its place between left and right (-1 to 1), or its
 * pitch bend (in cents), from a moment on. @typedef {{ at: number, channel: number, kind: 'volume' | 'expression' | 'pan' | 'bend', value: number }} Change
 */

/**
 * A Standard MIDI File's notes and changes, by when they happen, in seconds, and how long it
 * lasts; an .rmi's too, a MIDI file inside RIFF. Throws when it is none.
 * @param {Uint8Array} bytes @returns {{ notes: Note[], changes: Change[], length: number }}
 */
export function readMidi(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (/** @type {number} */ at) => String.fromCharCode(...bytes.subarray(at, at + 4))
  const head = String.fromCharCode(...bytes.subarray(0, 64)).indexOf('MThd')
  if (head < 0 || head + 14 > bytes.length) throw new Error('Not a MIDI file')
  const division = view.getUint16(head + 12)
  // Every track's events, as [tick, status, data, data], a tempo as [tick, 0x51, microseconds a quarter note].
  /** @type {number[][]} */
  const events = []
  let chunk = head + 8 + view.getUint32(head + 4)
  for (let tracks = view.getUint16(head + 10); tracks > 0 && chunk + 8 <= bytes.length;) {
    let i = chunk + 8
    const end = Math.min(i + view.getUint32(chunk + 4), bytes.length)
    const track = tag(chunk) === 'MTrk'
    chunk = end
    if (!track) continue
    tracks--
    const number = () => {
      let value = 0
      let byte = 0x80
      while (byte & 0x80 && i < end) {
        byte = bytes[i++]
        value = value * 128 + (byte & 0x7f)
      }
      return value
    }
    let tick = 0
    let running = 0
    while (i < end) {
      tick += number()
      let status = bytes[i]
      if (status & 0x80) i++
      else status = running
      if (status === 0xff) {
        const type = bytes[i++]
        const size = number()
        if (type === 0x2f) break
        if (type === 0x51 && size === 3) events.push([tick, 0x51, (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]])
        i += size
      } else if (status === 0xf0 || status === 0xf7) i += number()
      else if (status >= 0x80 && status < 0xf0) {
        // Program change and channel pressure carry one byte, the others two.
        const one = status >> 4 === 0xc || status >> 4 === 0xd
        events.push([tick, status, bytes[i], one ? 0 : bytes[i + 1]])
        i += one ? 1 : 2
        running = status
      } else break
    }
  }
  events.sort((a, b) => a[0] - b[0])
  // A tick lasts a share of a quarter note, which lasts what the tempo says (half a second until
  // it says), or a share of a frame of a SMPTE time code.
  const smpte = division & 0x8000
  let perTick = smpte ? 1 / ((256 - (division >> 8)) * (division & 0xff)) : 0.5 / (division || 480)
  let last = 0
  let now = 0
  /** @type {Note[]} */
  const notes = []
  /** @type {Change[]} */
  const changes = []
  // Each channel's instrument, its sustain pedal with the notes it holds, and its pitch bend's range (RPN 0).
  const channels = Array.from({ length: 16 }, () => ({ program: 0, pedal: false, kept: /** @type {Note[]} */ ([]), range: 200, rpn: [127, 127] }))
  /** The notes held down, by channel and key, first struck first. @type {Map<number, Note[]>} */
  const held = new Map()
  for (const [tick, status, a, b] of events) {
    now += (tick - last) * perTick
    last = tick
    if (status === 0x51) {
      if (!smpte) perTick = a / 1e6 / (division || 480)
      continue
    }
    const kind = status >> 4
    const channel = status & 15
    const state = channels[channel]
    if (kind === 9 && b > 0) {
      const note = { at: now, length: 0, key: a, velocity: b / 127, channel, program: state.program }
      notes.push(note)
      held.set(channel * 128 + a, [...(held.get(channel * 128 + a) ?? []), note])
    } else if (kind === 8 || kind === 9) {
      const note = held.get(channel * 128 + a)?.shift()
      if (note && state.pedal) state.kept.push(note)
      else if (note) note.length = now - note.at
    } else if (kind === 0xb) {
      if (a === 7 || a === 11) changes.push({ at: now, channel, kind: a === 7 ? 'volume' : 'expression', value: b / 127 })
      else if (a === 10) changes.push({ at: now, channel, kind: 'pan', value: Math.max(-1, (b - 64) / 63) })
      else if (a === 64) {
        state.pedal = b >= 64
        if (!state.pedal) for (const note of state.kept.splice(0)) note.length = now - note.at
      } else if (a === 101 || a === 100) state.rpn[101 - a] = b
      else if (a === 6 && state.rpn[0] === 0 && state.rpn[1] === 0) state.range = b * 100
    } else if (kind === 0xc) state.program = a
    else if (kind === 0xe) changes.push({ at: now, channel, kind: 'bend', value: ((((b << 7) | a) - 8192) / 8192) * state.range })
  }
  // A note never let go lasts until the music ends.
  for (const note of [...[...held.values()].flat(), ...channels.flatMap((state) => state.kept)]) note.length = now - note.at
  return { notes, changes, length: notes.reduce((most, note) => Math.max(most, note.at + note.length), now) }
}

const RATE = 32000
/** A quarter of an hour at most: nearly any piece, and the sound made is kept in memory while it shows. */
const LONGEST = 15 * 60
/** Notes are added to the sound this many seconds at a time, ahead of where it is made, so only those sounding take its time. */
const STEP = 2
const saw = (/** @type {number} */ count) => Array.from({ length: count }, (_, i) => 1 / (i + 1))
/**
 * General MIDI's families of eight instruments (piano, chromatic percussion, organ, guitar, bass,
 * strings, ensemble, brass, reed, pipe, synth lead, synth pad, synth effects, ethnic, percussive,
 * sound effects): the strength of each harmonic, then its attack, its decay (a time constant), the
 * level it holds and its release (another), in seconds. A family with nothing held fades as a
 * struck or plucked string does. @type {[number[], number, number, number, number][]}
 */
const FAMILIES = [
  [[1, 0.5, 0.3, 0.15, 0.1, 0.05], 0.004, 1.2, 0, 0.2],
  [[1, 0.05, 0.25, 0, 0.1], 0.002, 0.6, 0, 0.4],
  [[1, 0.7, 0.5, 0.4, 0, 0.3, 0, 0.2], 0.01, 0.2, 0.9, 0.06],
  [[1, 0.6, 0.45, 0.3, 0.2, 0.15, 0.1], 0.003, 0.8, 0, 0.1],
  [[1, 0.6, 0.25, 0.1], 0.004, 1, 0.1, 0.08],
  [saw(12), 0.08, 0.4, 0.8, 0.25],
  [saw(8), 0.15, 0.5, 0.8, 0.4],
  [[1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.2, 0.15], 0.04, 0.3, 0.75, 0.12],
  [[1, 0.15, 0.5, 0.1, 0.3, 0.05, 0.2], 0.03, 0.3, 0.8, 0.08],
  [[1, 0.2, 0.08, 0.03], 0.05, 0.3, 0.85, 0.12],
  [saw(16), 0.01, 0.3, 0.8, 0.1],
  [[1, 0.5, 0.33, 0.25, 0.2], 0.3, 1, 0.8, 0.6],
  [[1, 0.4, 0.2], 0.2, 1, 0.6, 0.6],
  [[1, 0.6, 0.45, 0.3, 0.2, 0.15], 0.003, 0.6, 0, 0.1],
  [[1, 0.3, 0.1], 0.002, 0.3, 0, 0.1],
  [[1], 0.05, 0.5, 0.3, 0.3],
]
const TOMS = [41, 43, 45, 47, 48, 50]

/**
 * A drum, by its key: a falling tone (the bass drums, the toms, a snare's body), noise through a
 * filter (a snare, hi-hats, cymbals, the rest), or both. Each as [from, to, decay] and [filter, frequency, decay].
 * @param {number} key @returns {{ tone?: [number, number, number], noise?: [BiquadFilterType, number, number] }}
 */
function drum(key) {
  if (key <= 36) return { tone: [150, 45, 0.12] }
  if (TOMS.includes(key)) return { tone: [90 + (key - 41) * 17, 45 + (key - 41) * 8, 0.15] }
  if (key === 38 || key === 40) return { tone: [190, 150, 0.05], noise: ['bandpass', 2500, 0.07] }
  if (key === 37 || key === 39) return { noise: ['bandpass', key === 37 ? 3000 : 1500, key === 37 ? 0.02 : 0.06] }
  if (key === 42 || key === 44 || key === 46) return { noise: ['highpass', 8000, key === 46 ? 0.15 : 0.025] }
  if ([49, 52, 55, 57].includes(key)) return { noise: ['highpass', 5000, 0.5] }
  if ([51, 53, 59].includes(key)) return { noise: ['highpass', 6000, 0.3] }
  return { noise: ['bandpass', 800 + (key % 12) * 350, 0.04] }
}

/**
 * A MIDI file as a WAV, played by Jean's own synthesizer: its first quarter of an hour at most.
 * Throws when it isn't one, or has no notes.
 * @param {Uint8Array} bytes @returns {Promise<Blob>}
 */
export async function midiSound(bytes) {
  const { notes, changes, length } = readMidi(bytes)
  if (!notes.length) throw new Error('No notes')
  const last = Math.min(length, LONGEST)
  const sound = new OfflineAudioContext(2, Math.ceil((last + 2) * RATE), RATE)
  // Loud and soft passages evened out a little; the whole made as loud as it can be at the end.
  const even = new DynamicsCompressorNode(sound, { threshold: -20, knee: 10, ratio: 4 })
  even.connect(sound.destination)
  // Each channel: its volume and expression, then its place between left and right.
  const channels = Array.from({ length: 16 }, () => {
    const level = new GainNode(sound, { gain: (100 / 127) ** 2 })
    const place = new StereoPannerNode(sound)
    level.connect(place).connect(even)
    return { level, place, volume: 100 / 127, expression: 1, bends: /** @type {Change[]} */ ([]), bent: 0 }
  })
  for (const change of changes) {
    const channel = channels[change.channel]
    if (change.kind === 'pan') channel.place.pan.setValueAtTime(change.value, change.at)
    else if (change.kind === 'bend') channel.bends.push(change)
    else {
      channel[change.kind] = change.value
      channel.level.gain.setValueAtTime((channel.volume * channel.expression) ** 2, change.at)
    }
  }
  const waves = FAMILIES.map(([partials]) => sound.createPeriodicWave(new Float32Array(partials.length + 1), Float32Array.from([0, ...partials])))
  const noise = sound.createBuffer(1, RATE, RATE)
  noise.getChannelData(0).forEach((_, i, data) => { data[i] = Math.random() * 2 - 1 })

  /** @param {Note} note */
  const play = (note) => {
    const channel = channels[note.channel]
    const loud = 0.25 * note.velocity ** 2
    if (note.channel === 9) {
      const { tone, noise: hiss } = drum(note.key)
      if (tone) {
        const [from, to, decay] = tone
        const wave = new OscillatorNode(sound, { frequency: from })
        wave.frequency.setValueAtTime(from, note.at)
        wave.frequency.exponentialRampToValueAtTime(to, note.at + decay)
        wave.connect(fading(loud, note.at, decay, channel.level))
        wave.start(note.at)
        wave.stop(note.at + decay * 8)
      }
      if (hiss) {
        const [type, frequency, decay] = hiss
        const source = new AudioBufferSourceNode(sound, { buffer: noise, loop: true })
        source.connect(new BiquadFilterNode(sound, { type, frequency })).connect(fading(loud * 0.7, note.at, decay, channel.level))
        source.start(note.at, (note.key % 8) / 10)
        source.stop(note.at + decay * 8)
      }
      return
    }
    const [, attack, decay, hold, release] = FAMILIES[note.program >> 3]
    const end = note.at + Math.max(note.length, attack)
    const gone = end + release * 6
    // The channel's pitch bend as the note starts, then as it changes while it sounds.
    while (channel.bent < channel.bends.length && channel.bends[channel.bent].at <= note.at) channel.bent++
    const wave = new OscillatorNode(sound, { periodicWave: waves[note.program >> 3], frequency: 440 * 2 ** ((note.key - 69) / 12), detune: channel.bends[channel.bent - 1]?.value ?? 0 })
    for (let i = channel.bent; i < channel.bends.length && channel.bends[i].at < gone; i++) wave.detune.setValueAtTime(channel.bends[i].value, channel.bends[i].at)
    const envelope = new GainNode(sound, { gain: 0 })
    envelope.gain.setValueAtTime(0, note.at)
    envelope.gain.linearRampToValueAtTime(loud, note.at + attack)
    envelope.gain.setTargetAtTime(loud * hold, note.at + attack, decay * 2 ** ((60 - note.key) / 24))
    envelope.gain.setTargetAtTime(0, end, release)
    wave.connect(envelope).connect(channel.level)
    wave.start(note.at)
    wave.stop(gone)
  }
  /** A level struck at once that fades. @param {number} loud @param {number} at @param {number} decay @param {AudioNode} out */
  const fading = (loud, at, decay, out) => {
    const level = new GainNode(sound, { gain: 0 })
    level.gain.setValueAtTime(loud, at)
    level.gain.setTargetAtTime(0, at, decay)
    level.connect(out)
    return level
  }

  let next = 0
  const schedule = (/** @type {number} */ until) => {
    for (; next < notes.length && notes[next].at < Math.min(until, last); next++) play(notes[next])
  }
  // A sound that can't pause while it is made (Firefox's) gets all its notes at once.
  if (typeof sound.suspend === 'function') {
    schedule(STEP * 2)
    for (let at = STEP; at < last; at += STEP) {
      sound.suspend(at).then(() => {
        schedule(at + STEP * 2)
        return sound.resume()
      }).catch(() => {})
    }
  } else schedule(last)
  return wav(await sound.startRendering())
}

/** A sound as a 16-bit WAV, as loud as it can be without clipping. @param {AudioBuffer} sound */
function wav(sound) {
  const sides = [sound.getChannelData(0), sound.getChannelData(1)]
  let peak = 0
  for (const side of sides) for (const value of side) peak = Math.max(peak, Math.abs(value))
  const scale = peak ? (0.9 / peak) * 0x7fff : 0
  const samples = new Int16Array(sound.length * 2)
  for (let i = 0; i < sound.length; i++) {
    samples[2 * i] = sides[0][i] * scale
    samples[2 * i + 1] = sides[1][i] * scale
  }
  const head = new DataView(new ArrayBuffer(44))
  const word = (/** @type {number} */ at, /** @type {string} */ text) => { for (let i = 0; i < 4; i++) head.setUint8(at + i, text.charCodeAt(i)) }
  word(0, 'RIFF')
  head.setUint32(4, 36 + samples.byteLength, true)
  word(8, 'WAVE')
  word(12, 'fmt ')
  head.setUint32(16, 16, true)
  head.setUint16(20, 1, true)
  head.setUint16(22, 2, true)
  head.setUint32(24, sound.sampleRate, true)
  head.setUint32(28, sound.sampleRate * 4, true)
  head.setUint16(32, 4, true)
  head.setUint16(34, 16, true)
  word(36, 'data')
  head.setUint32(40, samples.byteLength, true)
  return new Blob([head, samples], { type: 'audio/wav' })
}
