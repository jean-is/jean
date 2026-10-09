// Scores (D196), the part with no page in it: the notes abcjs reads from ABC notation, as the
// seconds and frequencies Jean's synthesizer plays.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notesOf, wholeNote } from '../app/caps/scores/notes.js'

test('notes become sounds: when, how long, how high and how loud', () => {
  const sequence = {
    tracks: [
      [{ cmd: 'program', start: 0, duration: 0 }, { cmd: 'note', pitch: 69, volume: 127, start: 0.25, duration: 0.25 }, { cmd: 'note', pitch: 81, volume: 64, start: 0, duration: 0.25, gap: 0.05 }],
      [{ cmd: 'note', pitch: 57, start: 0.5, duration: 0.5, cents: 50 }, { cmd: 'note', pitch: 60, start: 1, duration: 0 }],
    ],
  }
  const notes = notesOf(sequence, 2)
  assert.deepEqual(notes.map((note) => note.at), [0, 0.5, 1], 'by when they start, every track')
  assert.deepEqual(notes.map((note) => Math.round(note.frequency * 100) / 100), [880, 440, 226.45])
  assert.deepEqual(notes.map((note) => Math.round(note.length * 1000) / 1000), [0.4, 0.5, 1], 'a gap shortens a note')
  assert.deepEqual(notes.map((note) => Math.round(note.volume * 100) / 100), [0.5, 1, 0.83])
  // A gap never takes more than two thirds of its note.
  assert.equal(notesOf({ tracks: [[{ cmd: 'note', pitch: 60, start: 0, duration: 0.3, gap: 1 }]] }, 1)[0].length.toFixed(2), '0.10')
})

test('a whole note lasts a measure over its share of one', () => {
  assert.equal(wholeNote(1000, { num: 6, den: 8 }), 1000 / 1000 / 0.75)
  assert.equal(wholeNote(2000, { num: 4, den: 4 }), 2)
  assert.equal(wholeNote(1500, { num: 3, den: 0 }), 1.5)
})
