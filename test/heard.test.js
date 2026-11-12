// SPDX-License-Identifier: MIT
// A recording heard on the device (D713): where its windows are cut, and how their times are written.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cut, stamp } from '../app/caps/voice/heard.js'

test('a window ends at the recording’s end within 30 s, else at its quietest 100 ms between 20 and 30 s', () => {
  const loud = new Float32Array(16_000 * 70).fill(0.5)
  assert.equal(cut(loud.subarray(0, 16_000 * 25), 0), 16_000 * 25)
  loud.fill(0, 16_000 * 24, 16_000 * 24 + 1_600)
  assert.equal(cut(loud, 0), 16_000 * 24 + 800)
  // Loud throughout: the first 100 ms past 20 s, as quiet as any.
  assert.equal(cut(new Float32Array(16_000 * 70).fill(0.5), 16_000 * 30), 16_000 * 50 + 800)
})

test('times are written as players write them', () => {
  assert.equal(stamp(0), '0:00')
  assert.equal(stamp(83.9), '1:23')
  assert.equal(stamp(3_723), '1:02:03')
})
