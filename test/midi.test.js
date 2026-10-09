import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readMidi } from '../app/caps/files/midi.js'

/** A number as MIDI writes a time: seven bits a byte, the first bytes' top bit set. @param {number} value */
const vlq = (value) => {
  const bytes = [value & 0x7f]
  while ((value >>= 7)) bytes.unshift((value & 0x7f) | 0x80)
  return bytes
}
const u32 = (/** @type {number} */ n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const ascii = (/** @type {string} */ text) => [...text].map((char) => char.charCodeAt(0))
/** A track: each event its delta ticks then its bytes, ending the track. @param {[number, ...number[]][]} events */
const track = (events) => {
  const body = [...events.flatMap(([delta, ...bytes]) => [...vlq(delta), ...bytes]), 0, 0xff, 0x2f, 0]
  return [...ascii('MTrk'), ...u32(body.length), ...body]
}
/** A Standard MIDI File of these tracks. @param {number[][]} tracks @param {number} [division] */
const smf = (tracks, division = 480) => new Uint8Array([...ascii('MThd'), ...u32(6), 0, tracks.length > 1 ? 1 : 0, 0, tracks.length, division >> 8, division & 255, ...tracks.flat()])

test('readMidi gives each note its time, length, key, strength, channel and instrument, through tempo changes', () => {
  const song = smf([
    track([[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], [960, 0xff, 0x51, 3, 0x0f, 0x42, 0x40]]),
    // Running status: the second note on and both offs carry no status of their own.
    track([[0, 0xc0, 24], [0, 0x90, 60, 127], [480, 60, 0], [0, 62, 64], [480, 0x80, 62, 0], [480, 0x99, 36, 100], [480, 0x89, 36, 0]]),
  ])
  const { notes, length } = readMidi(song)
  assert.deepEqual(notes.map(({ at, length, key, channel, program }) => ({ at, length, key, channel, program })), [
    { at: 0, length: 0.5, key: 60, channel: 0, program: 24 },
    { at: 0.5, length: 0.5, key: 62, channel: 0, program: 24 },
    // From tick 960, at 1 s, a quarter note lasts a second: tick 1440 is at 2 s.
    { at: 2, length: 1, key: 36, channel: 9, program: 0 },
  ])
  assert.equal(notes[0].velocity, 1)
  assert.equal(length, 3)
})

test('readMidi holds notes while the sustain pedal is down, and keeps volume, pan and pitch bend as changes', () => {
  const { notes, changes } = readMidi(smf([track([
    [0, 0xb0, 7, 127], [0, 0xb0, 10, 0], [0, 0xb0, 64, 127], [0, 0x90, 60, 64], [240, 0x80, 60, 0],
    [240, 0xb0, 64, 0], [0, 0xb0, 101, 0], [0, 0xb0, 100, 0], [0, 0xb0, 6, 12], [0, 0xe0, 0, 0x60],
  ])]))
  assert.equal(notes[0].length, 0.5)
  assert.deepEqual(changes, [
    { at: 0, channel: 0, kind: 'volume', value: 1 },
    { at: 0, channel: 0, kind: 'pan', value: -1 },
    { at: 0.5, channel: 0, kind: 'bend', value: 600 },
  ])
})

test('readMidi reads an .rmi, a MIDI file inside RIFF, lets a note never let go last to the end, and refuses what isn’t MIDI', () => {
  const inner = smf([track([[0, 0x90, 64, 100], [960, 0x90, 67, 100]])])
  const rmi = new Uint8Array([...ascii('RIFF'), ...u32(inner.length + 12).reverse(), ...ascii('RMIDdata'), ...u32(inner.length).reverse(), ...inner])
  const { notes } = readMidi(rmi)
  assert.deepEqual(notes.map(({ at, length }) => [at, length]), [[0, 1], [1, 0]])
  assert.throws(() => readMidi(new TextEncoder().encode('Not music at all')))
  assert.throws(() => readMidi(new Uint8Array()))
})
