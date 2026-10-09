// Whistle takes at most 30 s at a time (D205): longer dictation is cut where it is quietest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pieces, LONGEST } from '../app/caps/voice/whistle.js'

/** Speech-like noise, silent over the given ranges of seconds. @param {number} seconds @param {Array<[number, number]>} quiet */
function audio(seconds, quiet = []) {
  const samples = new Float32Array(seconds * 16000)
  for (let i = 0; i < samples.length; i++) {
    const at = i / 16000
    samples[i] = quiet.some(([from, to]) => at >= from && at < to) ? 0 : Math.sin(i * 0.3) * 0.3
  }
  return samples
}

test('a clip of 30 s or less stays whole', () => {
  const clip = audio(30)
  assert.equal(clip.length, LONGEST)
  assert.deepEqual(pieces(clip).map((piece) => piece.length), [LONGEST])
  assert.deepEqual(pieces(new Float32Array(0)).map((piece) => piece.length), [0])
})

test('a longer one is cut in the pause before each 30 s, and nothing is lost', () => {
  const clip = audio(70, [[27, 27.5], [55, 55.4]])
  const cut = pieces(clip)
  assert.equal(cut.length, 3)
  assert.ok(cut.every((piece) => piece.length <= LONGEST))
  assert.equal(cut.reduce((sum, piece) => sum + piece.length, 0), clip.length)
  const first = cut[0].length / 16000
  const second = (cut[0].length + cut[1].length) / 16000
  assert.ok(first >= 27 && first <= 27.5, `first cut at ${first} s`)
  assert.ok(second >= 55 && second <= 55.4, `second cut at ${second} s`)
})

test('without a pause, a cut still falls within the last 5 s', () => {
  const cut = pieces(audio(45))
  assert.equal(cut.length, 2)
  assert.ok(cut[0].length > LONGEST - 80_000 && cut[0].length <= LONGEST)
})
