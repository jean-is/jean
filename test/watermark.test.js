// The watermark in what the brain on this device writes (D402): Aaronson's race keyed by the four
// tokens before, counted by anyone with the tokenizer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { watermarker, lean, said, seed, unit, CONTEXT } from '../app/caps/brain-local/watermark.js'

// Qwen3-0.6B's answer, in Arabic, to "how do solar panels work", made by a Python copy of the race over
// MLX, then decoded and tokenized again: its count is pinned, so the key can't change unseen.
const ARABIC = [31382, 126077, 123920, 29825, 139560, 73441, 320, 70941, 80492, 8, 135048, 123890, 128953, 23364, 21360, 124438, 86941, 64604, 8532, 124009, 126214, 139560, 124665, 126931, 124476, 31073, 124466, 77273, 63415, 139947, 63237, 132093, 13, 39434, 130510, 123961, 20064, 73771, 5703, 139560, 73441, 128248, 52157, 124130, 63237, 126987, 130855, 39434, 124131, 29825, 128857, 124665, 129472, 139560, 73441, 39434, 64604, 11071, 124142, 27846, 35244, 123832, 124917, 43982, 13325, 73771, 25871, 23364, 41593, 81778, 124653, 13, 128305, 123877, 8532, 123920, 29825, 39434, 64604, 129425, 27846, 129345, 124006, 86941, 10176, 31073, 84532, 20931, 125006, 129157, 124061, 139560, 73441, 68785, 137050, 124006, 14409, 124663, 129472, 139560, 73441, 128252, 52157, 16157, 73441, 13]

test('a marked answer counts as marked, as the copy that made it counted it', () => {
  const { counted, z } = lean(ARABIC)
  assert.equal(counted, 102)
  assert.ok(Math.abs(z - 17.650435678599937) < 1e-9, String(z))
  assert.equal(said({ counted, z }), 'marked')
})

test('words nobody marked count near chance, and a short text is too short to tell', () => {
  let state = 7
  const random = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 2 ** 32
  const zs = Array.from({ length: 50 }, () => lean(Array.from({ length: 300 }, () => Math.floor(random() * 262144))).z)
  assert.ok(Math.max(...zs) < 4, String(Math.max(...zs)))
  assert.ok(Math.abs(zs.reduce((sum, z) => sum + z) / zs.length) < 0.5)
  assert.equal(said({ counted: 60, z: 1 }), 'short')
  assert.equal(said({ counted: 300, z: 1 }), 'none')
  // Repeated words weigh nothing: a phrase said again is counted once.
  assert.equal(lean([...ARABIC, ...ARABIC]).counted, lean(ARABIC).counted + CONTEXT)
})

/** One step of the processor over these logits after these tokens: the token it leaves. @param {number[]} ids @param {number[]} logits @param {ReturnType<typeof watermarker>} [step] */
const pick = (ids, logits, step = watermarker({ opens: new Set([48]), closes: new Set([49]) }, 0)) => {
  const data = Float32Array.from(logits)
  step([ids.map(BigInt)], { data })
  return data.findIndex((value) => value === 0)
}

test('it picks as Gemma\'s own sampling would, over many contexts, and only among its likeliest', () => {
  // Two tokens at 70% and 30%, a third far below the 95% that sampling keeps.
  const logits = [Math.log(0.7), Math.log(0.3), Math.log(0.0001)]
  let [first, score] = [0, 0]
  for (let i = 0; i < 4000; i++) {
    const token = pick([1, 2, 3, 1000 + i], logits)
    assert.ok(token === 0 || token === 1)
    if (token === 0) first++
    score -= Math.log(1 - unit(seed([1, 2, 3, 1000 + i], 4), token))
  }
  assert.ok(Math.abs(first / 4000 - 0.7) < 0.03, String(first / 4000))
  // The winners' numbers are higher than chance gives, 1 on average: what the count finds.
  assert.ok(score / 4000 > 1.2, String(score / 4000))
  // The same context, the same pick: an answer is the same each time.
  assert.equal(pick([5, 6, 7, 8], logits), pick([5, 6, 7, 8], logits))
})

test('a thought and a tool call are chosen greedily, unmarked', () => {
  const step = watermarker({ opens: new Set([48]), closes: new Set([49]) }, 2)
  const logits = [0, 1, 0.5]
  const data = Float32Array.from(logits)
  step([[1n, 2n, 48n, 7n].map(BigInt)], { data })
  assert.deepEqual([...data], logits)
  // Closed, it races again.
  assert.notEqual(pick([1, 2, 48, 7, 49], logits, step), -1)
})
