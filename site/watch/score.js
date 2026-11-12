// SPDX-License-Identifier: MIT
// The reels' score (D687, docs/reels.md#sound): music written here as code and played by Web Audio, so a reel's
// sound is Jean's own to give (MIT): no recording, no sample, nobody's licence. compose() writes the notes for a
// reel's plan, the same for a seed every time; Score plays them, tied to the reel's time (paused, sought, faster or
// slower with it).
// In D major at 88 beats a minute, eight bars that turn: a soft pad, an electric piano by frequency modulation, a
// round bass, a light kick, rim and shaker, in a room's reverb. Pad and piano alone on the first card, bass and
// shaker with the tasks, kick and rim from the second, then the last card resolves on D and rings out with the reel.

const BPM = 88
const BEAT = 60_000 / BPM
const BAR = 4 * BEAT
const EIGHTH = BEAT / 2

/** Each bar's chord: its bass note, the pad's voicing and the piano's tones, as MIDI numbers (60 is middle C). */
const CHORDS = [
  { name: 'Dmaj9', bass: 38, pad: [57, 61, 64, 66], keys: [69, 73, 76, 78] },
  { name: 'Bm9', bass: 35, pad: [54, 57, 61, 62], keys: [66, 69, 73, 74] },
  { name: 'Gmaj9', bass: 43, pad: [54, 57, 59, 62], keys: [66, 69, 71, 74] },
  { name: 'A6sus', bass: 45, pad: [54, 57, 62, 64], keys: [66, 69, 74, 76] },
  { name: 'Dmaj9/F#', bass: 42, pad: [57, 61, 62, 64], keys: [69, 73, 74, 76] },
  { name: 'Gmaj7', bass: 43, pad: [54, 59, 62, 66], keys: [66, 71, 74, 78] },
  { name: 'Em9', bass: 40, pad: [55, 59, 62, 66], keys: [67, 71, 74, 78] },
  { name: 'Asus4', bass: 45, pad: [57, 62, 64, 69], keys: [69, 74, 76, 81] },
]
/** Where the reel's last card resolves: D, the piano rolled up over it. */
const HOME = { name: 'Dmaj9', bass: 38, pad: [50, 57, 61, 64, 66], keys: [62, 66, 69, 73, 76, 81] }

/**
 * A note of the score: its part, when it starts and how long it lasts in the reel's milliseconds, its MIDI number
 * where it has a pitch, and how loud, 0 to 1.
 * @typedef {{ part: 'pad' | 'keys' | 'bass' | 'kick' | 'rim' | 'shaker' | 'click' | 'air', at: number, length: number, midi?: number, level: number }} Note
 * What the score follows of a reel: its length, its scenes, and when its pointer clicks.
 * @typedef {{ length: number, scenes: Array<{ kind: 'card' | 'task', look?: string, start: number, end: number }>, clicks: number[] }} Plan
 */

/** A seeded random number generator (mulberry32), so a score is the same each time. @param {number} seed */
export function random (seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * How full the music is at a moment: 0 on the cards before any task (pad and piano), 1 with the first task (bass and
 * shaker), 2 from the second task on (kick and rim).
 * @param {Plan} plan @param {number} at
 */
export function energy (plan, at) {
  const scene = plan.scenes.find((one) => at < one.end) ?? plan.scenes.at(-1)
  const tasks = plan.scenes.filter((one) => one.kind === 'task' && one.start <= at).length
  if (!scene || !tasks) return 0
  return scene.kind === 'card' || tasks < 2 ? 1 : 2
}

/** The piano's broken chord over a bar, by eighths: which of its four tones, or none. */
const PATTERN = [0, null, 2, 1, null, 3, 2, null]

/** The notes of a reel's score, in order. @param {Plan} plan @param {number} [seed] @returns {Note[]} */
export function compose (plan, seed = 1) {
  const rand = random(seed)
  const vary = (/** @type {number} */ by) => (rand() * 2 - 1) * by
  /** @type {Note[]} */
  const notes = []
  const last = plan.scenes.at(-1)
  // The bar where the music comes home: the first to start once the last card is on, or near the end without one.
  const ending = last?.kind === 'card' && last.look === 'end' ? last.start : plan.length - 4000
  const home = Math.max(1, Math.ceil((ending - EIGHTH) / BAR))
  for (let bar = 0; bar < home; bar++) {
    const at = bar * BAR
    if (at >= plan.length) break
    const chord = CHORDS[bar % CHORDS.length]
    const level = energy(plan, at)
    for (const midi of chord.pad) notes.push({ part: 'pad', at, length: BAR + 420, midi, level: 0.8 })
    PATTERN.forEach((tone, eighth) => {
      // Now and then a tone left out, or one more at the bar's end, never on the downbeat.
      const extra = eighth === 7 && rand() < 0.22 ? 1 : null
      const left = eighth && rand() < (level ? 0.12 : 0.35)
      const which = tone ?? extra
      if (which === null || left) return
      notes.push({ part: 'keys', at: at + eighth * EIGHTH + vary(7), length: EIGHTH * (eighth % 2 ? 2 : 3), midi: chord.keys[which], level: (eighth ? 0.62 : 0.86) + vary(0.07) })
    })
    if (level >= 1) {
      notes.push({ part: 'bass', at, length: EIGHTH * 3, midi: chord.bass, level: 0.9 })
      notes.push({ part: 'bass', at: at + 3 * EIGHTH, length: EIGHTH, midi: chord.bass, level: 0.55 })
      notes.push({ part: 'bass', at: at + 6 * EIGHTH, length: EIGHTH * 2, midi: chord.bass + (bar % 2 ? 7 : 12), level: 0.7 })
      for (let eighth = 1; eighth < 8; eighth += 2) notes.push({ part: 'shaker', at: at + eighth * EIGHTH + vary(5), length: 60, level: 0.55 + vary(0.12) })
      for (const eighth of [2, 6]) notes.push({ part: 'shaker', at: at + eighth * EIGHTH + vary(5), length: 40, level: 0.28 + vary(0.06) })
    }
    if (level >= 2) {
      for (const beat of [0, 2]) notes.push({ part: 'kick', at: at + beat * BEAT, length: 400, level: beat ? 0.78 : 0.9 })
      for (const beat of [1, 3]) notes.push({ part: 'rim', at: at + beat * BEAT + vary(4), length: 80, level: 0.5 + vary(0.08) })
    }
  }
  // Home: D held to the end, the piano rolled up over it, the bass under it.
  const at = home * BAR
  if (at < plan.length) {
    const left = Math.max(plan.length - at, BAR)
    for (const midi of HOME.pad) notes.push({ part: 'pad', at, length: left, midi, level: 0.85 })
    HOME.keys.forEach((midi, i) => notes.push({ part: 'keys', at: at + i * 95, length: left, midi, level: 0.7 - i * 0.05 }))
    notes.push({ part: 'bass', at, length: left, midi: HOME.bass, level: 0.5 })
  }
  // A breath of air as each scene comes, and a soft tick where the pointer clicks.
  for (const scene of plan.scenes.slice(1)) notes.push({ part: 'air', at: scene.start - 250, length: 700, level: 0.8 })
  for (const click of plan.clicks) notes.push({ part: 'click', at: click, length: 40, level: 1 })
  return notes.filter((note) => note.at >= 0 && note.at < plan.length).sort((a, b) => a.at - b.at)
}

/** A MIDI number's frequency. @param {number} midi */
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)

/** How loud each part is, at full level, before the mix's own compressor. */
const MIX = { pad: 0.021, keys: 0.13, bass: 0.085, kick: 0.26, rim: 0.05, shaker: 0.03, click: 0.07, air: 0.04 }
/** The whole mix's level, set so a reel's score measures about −18 LUFS (docs/reels.md#sound). */
const LEVEL = 1.12

/**
 * The parts of a context the score plays through: its out (where muting and fading happen), the room's reverb, and
 * noise for the drums and the air.
 * @typedef {{ out: GainNode, room: ConvolverNode, noise: AudioBuffer }} Desk
 */

/** The mix: out through a gentle compressor, a reverb in a room drawn from seeded noise. @param {BaseAudioContext} ctx @returns {Desk} */
function desk (ctx) {
  const rand = random(7)
  const out = ctx.createGain()
  const squeeze = ctx.createDynamicsCompressor()
  squeeze.threshold.value = -18
  squeeze.knee.value = 12
  squeeze.ratio.value = 2.5
  squeeze.attack.value = 0.02
  squeeze.release.value = 0.3
  // Nothing under 40 Hz, which a laptop can't play and which only makes the mix seem louder than it sounds.
  const floor = ctx.createBiquadFilter()
  floor.type = 'highpass'
  floor.frequency.value = 40
  const level = ctx.createGain()
  level.gain.value = LEVEL
  out.connect(floor).connect(squeeze).connect(level).connect(ctx.destination)
  // A room: 2.4 s of noise dying away, each side its own, softened, after 14 ms.
  const length = Math.round(ctx.sampleRate * 2.4)
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    let soft = 0
    for (let i = Math.round(ctx.sampleRate * 0.014); i < length; i++) {
      soft += 0.3 * (rand() * 2 - 1 - soft)
      data[i] = soft * (1 - i / length) ** 2.6
    }
  }
  const room = ctx.createConvolver()
  room.buffer = impulse
  const wet = ctx.createGain()
  wet.gain.value = 0.42
  room.connect(wet).connect(out)
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1
  return { out, room, noise }
}

/**
 * One note, into a take (what one stretch of playing goes through), at a context's time, at a speed: its length is
 * the reel's, so it plays shorter when the reel plays faster, at the same pitch. `into` starts it that far in.
 * @param {BaseAudioContext} ctx @param {Desk} mix @param {AudioNode} take @param {Note} note @param {number} when @param {number} rate @param {number} [into]
 */
function sound (ctx, mix, take, note, when, rate, into = 0) {
  const length = Math.max(0.02, (note.length - into) / 1000 / rate)
  const level = MIX[note.part] * note.level
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(take)
  /** @param {number} amount */
  const send = (amount) => { const wet = ctx.createGain(); wet.gain.value = amount; gain.connect(wet).connect(mix.room) }
  /** @param {OscillatorType} type @param {number} frequency @param {AudioNode} to */
  const tone = (type, frequency, to, end = when + length + 2) => {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = frequency
    osc.connect(to)
    osc.start(when)
    osc.stop(end)
    return osc
  }
  /** @param {number} end */
  const hiss = (end) => {
    const source = ctx.createBufferSource()
    source.buffer = mix.noise
    source.loop = true
    source.start(when, (note.at % 997) / 1000)
    source.stop(end)
    return source
  }
  const f = note.midi === undefined ? 0 : hz(note.midi)
  switch (note.part) {
    case 'pad': {
      // Two saws a little apart, through a warm low-pass, swelling in and dying away slowly.
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 1050
      filter.Q.value = 0.5
      filter.connect(gain)
      for (const detune of [-7, 7]) tone('sawtooth', f, filter, when + length + 3).detune.value = detune
      gain.gain.setValueAtTime(0, when)
      gain.gain.linearRampToValueAtTime(level, when + (into ? 0.3 : 0.9))
      gain.gain.setTargetAtTime(0, when + length, 0.45)
      send(0.9)
      break
    }
    case 'keys': {
      // A tine's bell: a sine whose brightness, a modulator at the same pitch, fades fast; a third harmonic's ping.
      const carrier = tone('sine', f, gain)
      const modulator = ctx.createOscillator()
      modulator.frequency.value = f
      const depth = ctx.createGain()
      depth.gain.setValueAtTime(f * 1.9, when)
      depth.gain.setTargetAtTime(f * 0.22, when, 0.16)
      modulator.connect(depth).connect(carrier.frequency)
      modulator.start(when)
      modulator.stop(when + length + 2)
      const ping = ctx.createGain()
      ping.gain.setValueAtTime(0.18, when)
      ping.gain.setTargetAtTime(0, when, 0.05)
      tone('sine', f * 3, ping)
      ping.connect(gain)
      const pan = ctx.createStereoPanner()
      pan.pan.value = Math.max(-0.35, Math.min(0.35, ((note.midi ?? 69) - 72) / 24))
      gain.disconnect()
      gain.connect(pan).connect(take)
      gain.gain.setValueAtTime(0, when)
      gain.gain.linearRampToValueAtTime(level, when + 0.005)
      gain.gain.setTargetAtTime(level * 0.35, when + 0.005, 0.35)
      gain.gain.setTargetAtTime(0, when + length, 0.18)
      const wet = ctx.createGain()
      wet.gain.value = 0.55
      gain.connect(wet).connect(mix.room)
      break
    }
    case 'bass': {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 300
      filter.connect(gain)
      tone('sine', f, filter)
      const edge = ctx.createGain()
      edge.gain.value = 0.14
      tone('triangle', f * 2, edge)
      edge.connect(filter)
      gain.gain.setValueAtTime(0, when)
      gain.gain.linearRampToValueAtTime(level, when + 0.012)
      gain.gain.setTargetAtTime(level * 0.72, when + 0.02, 0.22)
      gain.gain.setTargetAtTime(0, when + length, 0.07)
      send(0.12)
      break
    }
    case 'kick': {
      const osc = tone('sine', 130, gain, when + 0.6)
      osc.frequency.setValueAtTime(130, when)
      osc.frequency.exponentialRampToValueAtTime(46, when + 0.12)
      gain.gain.setValueAtTime(level, when)
      gain.gain.setTargetAtTime(0, when + 0.01, 0.085)
      break
    }
    case 'rim':
    case 'shaker':
    case 'click': {
      const filter = ctx.createBiquadFilter()
      filter.type = note.part === 'rim' ? 'bandpass' : 'highpass'
      filter.frequency.value = note.part === 'rim' ? 1900 : note.part === 'shaker' ? 6800 : 2600
      filter.Q.value = note.part === 'rim' ? 3 : 0.7
      hiss(when + 0.3).connect(filter).connect(gain)
      if (note.part !== 'shaker') {
        const blip = ctx.createGain()
        blip.gain.setValueAtTime(note.part === 'rim' ? 0.5 : 0.8, when)
        blip.gain.setTargetAtTime(0, when, 0.012)
        tone('sine', note.part === 'rim' ? 950 : 1650, blip, when + 0.2)
        blip.connect(gain)
      }
      gain.gain.setValueAtTime(level, when)
      gain.gain.setTargetAtTime(0, when + 0.002, note.part === 'shaker' ? 0.03 : 0.014)
      send(note.part === 'rim' ? 0.35 : 0.2)
      break
    }
    case 'air': {
      // A breath: noise through a band that rises.
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.Q.value = 0.9
      filter.frequency.setValueAtTime(260, when)
      filter.frequency.exponentialRampToValueAtTime(2200, when + length * 0.8)
      hiss(when + length + 0.1).connect(filter).connect(gain)
      gain.gain.setValueAtTime(0, when)
      gain.gain.linearRampToValueAtTime(level, when + length * 0.45)
      gain.gain.linearRampToValueAtTime(0, when + length)
      send(0.5)
      break
    }
  }
}

/** The fade in at the reel's start and out over its last seconds, in reel milliseconds. */
const FADE = { in: 1400, out: 2600 }

/** The score of a reel, played with it. */
export class Score {
  /** @param {Plan} plan @param {number} [seed] */
  constructor (plan, seed = 1) {
    this.plan = plan
    this.notes = compose(plan, seed)
    /** @type {AudioContext | null} */
    this.ctx = null
    /** @type {Desk | null} */
    this.mix = null
    /** @type {{ node: GainNode, ctx: number, reel: number, rate: number, next: number } | null} */
    this.take = null
    this.muted = false
    this.playing = false
    this.rated = 1
    this.timer = 0
  }

  /** Plays from a moment of the reel, at its speed; muted, it waits for sound to be asked for (an autoplay). @param {number} time @param {number} rate @param {boolean} muted */
  play (time, rate, muted) {
    Object.assign(this, { playing: true, muted, rated: rate })
    if (muted && !this.ctx) return
    this.start(time)
  }

  /** @param {number} time */
  start (time) {
    if (!this.ctx) {
      // Without sound where a browser has none to give: a reel is whole muted.
      try { this.ctx = new AudioContext({ latencyHint: 'playback' }) } catch { return }
      this.mix = desk(this.ctx)
    }
    this.ctx.resume()
    this.mix?.out.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.02)
    this.stop()
    const node = this.ctx.createGain()
    node.connect(/** @type {Desk} */ (this.mix).out)
    const ctxNow = this.ctx.currentTime + 0.06
    this.take = { node, ctx: ctxNow, reel: time, rate: this.rated, next: this.notes.findIndex((note) => note.at >= time) }
    if (this.take.next < 0) this.take.next = this.notes.length
    // What already sounds goes on, softly: the pad and the bass held over the moment.
    for (const note of this.notes) {
      if (note.at < time && note.at + note.length > time + 200 && (note.part === 'pad' || note.part === 'bass')) sound(this.ctx, /** @type {Desk} */ (this.mix), node, note, ctxNow, this.rated, time - note.at)
    }
    this.fades(time)
    this.ahead()
    clearInterval(this.timer)
    this.timer = setInterval(() => this.ahead(), 60)
  }

  /** The take's fades, where they are still to come. @param {number} time */
  fades (time) {
    if (!this.take || !this.ctx) return
    const { node, ctx, rate } = this.take
    const when = (/** @type {number} */ at) => ctx + Math.max(0, at - time) / 1000 / rate
    node.gain.setValueAtTime(time < FADE.in ? time / FADE.in : 1, ctx)
    if (time < FADE.in) node.gain.linearRampToValueAtTime(1, when(FADE.in))
    const out = this.plan.length - FADE.out
    node.gain.setValueAtTime(time > out ? (this.plan.length - time) / FADE.out : 1, when(Math.max(out, time)))
    node.gain.linearRampToValueAtTime(0, when(this.plan.length))
  }

  /** The notes of the next moment, scheduled. */
  ahead () {
    const { ctx, mix, take } = this
    if (!ctx || !mix || !take || !this.playing) return
    const now = take.reel + (ctx.currentTime - take.ctx) * 1000 * take.rate
    while (take.next < this.notes.length && this.notes[take.next].at < now + 400 * take.rate) {
      const note = this.notes[take.next++]
      sound(ctx, mix, take.node, note, Math.max(ctx.currentTime, take.ctx + (note.at - take.reel) / 1000 / take.rate), take.rate)
    }
  }

  /** What plays now stops, quickly but without a click. */
  stop () {
    if (!this.take || !this.ctx) return
    const { node } = this.take
    node.gain.cancelScheduledValues(this.ctx.currentTime)
    node.gain.setTargetAtTime(0, this.ctx.currentTime, 0.015)
    setTimeout(() => node.disconnect(), 200)
    this.take = null
  }

  pause () {
    this.playing = false
    clearInterval(this.timer)
    this.stop()
    this.ctx?.suspend()
  }

  /** @param {number} time */
  seek (time) { if (this.playing && this.ctx) this.start(time) }

  /** @param {number} rate @param {number} time */
  rate (rate, time) {
    this.rated = rate
    if (this.playing && this.ctx) this.start(time)
  }

  /** Sound on or off; on for the first time in an autoplay, it starts where the reel is. @param {boolean} muted @param {number} [time] */
  mute (muted, time) {
    this.muted = muted
    if (!muted && !this.ctx && this.playing && time !== undefined) return this.start(time)
    if (this.ctx && this.mix) this.mix.out.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03)
  }
}
