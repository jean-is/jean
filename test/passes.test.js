// Dictation with Whistle or Whisper is written as it is said: short passes over what was said since
// the last pause, kept at each pause, never over silence, and each word written once.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passes, join, PASSES } from '../app/caps/voice/passes.js'

const FRAME = 1536
/** A frame of word number `n`, or of a quiet room when n is null. @param {number | null} n */
const frame = (n) => new Float32Array(FRAME).fill(n === null ? 0.0005 : 0.1 + n * 1e-4)
/** The writer: one word per frame of speech, named by its number. @param {Float32Array} audio */
function words(audio) {
  const said = []
  for (let at = 0; at < audio.length; at += FRAME) if (audio[at] > 0.01) said.push(`w${Math.round((audio[at] - 0.1) / 1e-4)}`)
  return said.join(' ')
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

/** Says the frames, one per tick, as the microphone would, through a writer that notes each pass's length in frames. */
async function dictate(/** @type {Array<number | null>} */ script, lang = 'en-US', write = async (/** @type {Float32Array} */ audio) => words(audio)) {
  /** @type {number[]} */
  const lengths = []
  /** @type {string[]} */
  const shown = []
  const said = passes(async (audio) => (lengths.push(audio.length / FRAME), write(audio)), (text) => shown.push(text), lang)
  for (const n of script) {
    said.hear(frame(n))
    await tick()
  }
  return { said, lengths, shown }
}
const quiet = (/** @type {number} */ count) => Array(count).fill(null)
const speech = (/** @type {number} */ from, /** @type {number} */ count) => Array.from({ length: count }, (_, i) => from + i)

test('words show while the user speaks, and each is kept once', async () => {
  const { said, lengths, shown } = await dictate([...quiet(5), ...speech(0, 12), ...quiet(12), ...speech(12, 7)])
  // Written before the end: the first sentence in full, and the second as it came.
  assert.ok(shown.includes(speech(0, 12).map((n) => `w${n}`).join(' ')))
  assert.ok(shown.some((text) => text.startsWith('w0 ') && text.includes('w12') && !text.includes('w18')))
  assert.equal(await said.end(), speech(0, 19).map((n) => `w${n}`).join(' '))
  assert.equal(shown.at(-1), speech(0, 19).map((n) => `w${n}`).join(' '))
  // The pause cut the passes short: none went back over the first sentence once kept.
  assert.ok(Math.max(...lengths.slice(-2)) < 12)
})

test('a slow writer still keeps what came before a pause that fell during its pass', async () => {
  /** @type {string[]} */
  const writes = []
  const slow = async (/** @type {Float32Array} */ audio) => {
    // Longer than the pause: the next sentence has begun by the time the first is written.
    for (let i = 0; i < 16; i++) await tick()
    return writes[writes.push(words(audio)) - 1]
  }
  const { said } = await dictate([...speech(0, 5), ...quiet(12), ...speech(5, 5), ...quiet(12)], 'en-US', slow)
  assert.equal(await said.end(), 'w0 w1 w2 w3 w4 w5 w6 w7 w8 w9')
  // Once its pass is done, the first sentence is never written again.
  assert.equal(writes[0], 'w0 w1 w2 w3 w4')
  assert.ok(writes.slice(1).every((text) => !text.includes('w0')))
})

test('silence is never written', async () => {
  const writes = []
  const { said } = await dictate(quiet(40), 'en-US', async (audio) => (writes.push(audio), ''))
  assert.equal(await said.end(), '')
  assert.equal(writes.length, 0)
})

test('a microphone starting with zeros still tells a hum from speech', async () => {
  /** @type {string[]} */
  const writes = []
  const said = passes(async (audio) => (writes.push(words(audio)), words(audio)), () => {}, 'en-US')
  for (let i = 0; i < 4; i++) said.hear(new Float32Array(FRAME))
  // A hum at 0.005, louder than the least on its own, is no speech beside the quietest frame heard.
  for (let i = 0; i < 20; i++) {
    said.hear(new Float32Array(FRAME).fill(0.005))
    await tick()
  }
  said.hear(frame(1))
  assert.equal(await said.end(), 'w1')
  assert.deepEqual(writes, ['w1'])
})

test('long speech with no pause is cut, no pass is longer than the limit, and nothing is lost or repeated', async () => {
  const { said, lengths } = await dictate(speech(0, 400))
  assert.equal(await said.end(), speech(0, 400).map((n) => `w${n}`).join(' '))
  assert.ok(Math.max(...lengths) <= PASSES.longest)
})

test('stopping mid-sentence writes the rest at once', async () => {
  const { said, lengths } = await dictate([...quiet(3), ...speech(0, 3)])
  assert.equal(await said.end(), 'w0 w1 w2')
  assert.equal(lengths.at(-1), 6)
})

test('Japanese and Thai join what was kept without spaces', async () => {
  const write = async (/** @type {Float32Array} */ audio) => words(audio).replaceAll(' ', '')
  for (const [lang, joined] of [['ja', 'w0w1w2w3'], ['th-TH', 'w0w1w2w3'], ['fr-FR', 'w0w1 w2w3']]) {
    const { said } = await dictate([...speech(0, 2), ...quiet(10), ...speech(2, 2)], lang, write)
    assert.equal(await said.end(), joined)
  }
  assert.equal(join('Hello,', 'world'), 'Hello, world')
  assert.equal(join('Hello, ', 'world'), 'Hello, world')
  assert.equal(join('', 'world'), 'world')
})

test('a writer that fails ends the dictation with its error', async () => {
  const { said } = await dictate(speech(0, 10), 'en-US', async () => {
    throw new Error('Dictation stopped')
  })
  await assert.rejects(said.end(), /Dictation stopped/)
})
