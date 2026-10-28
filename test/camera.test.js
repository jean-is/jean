// The camera (D645): which frame goes with a message, and when Jean looks on its own while it watches.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { luma, sharpness, difference, sharpest } from '../app/caps/camera/frames.js'
import { watcher, WATCH } from '../app/caps/camera/watch.js'
import { estimateMessages } from '../app/core/files.js'

/** A grey picture of stripes `width` pixels wide, sharp or blurred across each edge. @param {boolean} blurred */
function stripes(blurred, width = 64, height = 48) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const phase = (x % 16) / 16
      const level = blurred ? 128 + 100 * Math.sin(phase * 2 * Math.PI) : phase < 0.5 ? 20 : 235
      rgba.set([level, level, level, 255], (y * width + x) * 4)
    }
  }
  return rgba
}

describe('frames', () => {
  test('a sharp picture scores higher than the same scene blurred', () => {
    assert.ok(sharpness(luma(stripes(false)), 64) > 10 * sharpness(luma(stripes(true)), 64))
  })

  test('luma weighs green most, and a flat picture has no edges', () => {
    assert.deepEqual([...luma(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]))], [76, 149, 28])
    assert.equal(sharpness(new Uint8Array(64 * 48).fill(90), 64), 0)
  })

  test('the difference grows with how much the scene changed, and differently sized scenes are apart', () => {
    const a = new Uint8Array(100).fill(100)
    const b = a.map((value, i) => (i < 10 ? 200 : value))
    assert.equal(difference(a, a), 0)
    assert.ok(Math.abs(difference(a, b) - 10 * 100 / 100 / 255) < 1e-9)
    assert.ok(difference(a, a.map(() => 200)) > difference(a, b))
    assert.equal(difference(a, new Uint8Array(50)), 1)
  })

  test('each picture counts in the window, as one of 1,568 pixels would, whatever its data', () => {
    const picture = { mimeType: 'image/jpeg', data: 'x'.repeat(100_000) }
    const message = (/** @type {object[]} */ images) => [{ role: 'user', content: 'Is it done?', documents: [{ name: 'Camera.jpg', text: '(The picture follows.)', images }] }]
    const one = estimateMessages(message([picture])) - estimateMessages(message([]))
    assert.ok(one >= 1500 && one <= 1700, String(one))
    assert.ok(Math.abs(estimateMessages(message([picture, picture, picture])) - estimateMessages(message([])) - 3 * one) < 10)
  })

  test('the sharpest frame goes, the latest of two alike', () => {
    assert.equal(sharpest([{ frame: 'a', sharpness: 3 }, { frame: 'b', sharpness: 9 }, { frame: 'c', sharpness: 4 }]), 'b')
    assert.equal(sharpest([{ frame: 'a', sharpness: 5 }, { frame: 'b', sharpness: 5 }]), 'b')
    assert.equal(sharpest([]), undefined)
  })
})

describe('watching', () => {
  const start = 1_000_000
  /** One sample every quarter second from `from`, `n` of them. @param {ReturnType<typeof watcher>} watch */
  const samples = (watch, from, n, moved, step) => Array.from({ length: n }, (_, i) => watch(moved, step, from + i * 250)).filter(Boolean)

  test('a scene that moved and settled is looked at once', () => {
    const watch = watcher(start)
    assert.deepEqual(samples(watch, start + WATCH.gapMs, 8, 0.2, 0.1), [], 'still moving')
    assert.deepEqual(samples(watch, start + WATCH.gapMs + 2000, 3, 0.2, 0.005), [], 'not still long enough')
    assert.deepEqual(samples(watch, start + WATCH.gapMs + 2750, 2, 0.2, 0.005), ['look'])
    assert.deepEqual(samples(watch, start + WATCH.gapMs + 3250, 20, 0.2, 0.005), [], 'not again within the gap')
  })

  test('nothing is looked at within the first seconds, nor for a scene that never moved, until a minute has gone', () => {
    const watch = watcher(start)
    assert.deepEqual(samples(watch, start, 40, 0.5, 0), [])
    assert.deepEqual(samples(watch, start + WATCH.gapMs, 100, 0.01, 0), [])
    assert.equal(watch(0.01, 0, start + WATCH.idleMs), 'look')
  })

  test('watching ends after ten minutes', () => {
    const watch = watcher(start)
    assert.equal(watch(0, 0, start + WATCH.forMs - 1) === 'end', false)
    assert.equal(watch(0, 0, start + WATCH.forMs), 'end')
  })
})
