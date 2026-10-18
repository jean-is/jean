// The watermark in what the brain on this device writes (D402), the AI Act's mark for text, which
// can carry no metadata. Gemma's makers sample its words (a temperature of 1, the 64 likeliest, the
// fewest whose chances reach 95%); here each is the winner of the exponential race of Aaronson's
// watermark among those, every word's number in it keyed by the four before: as likely as theirs, so
// no answer is worse for it, and the same each time. Its thought and its tool calls are chosen
// greedily, as before. What it wrote, copied, carries winners whose numbers are higher than chance
// gives, which anyone with Gemma's tokenizer can count. The key is in this file, as an open project's
// must be, so a text can be made to look marked, and a rewrite loses it. Pure, so Node's tests run it.

/** The brain whose words carry it, and whose tokenizer counts them. */
export const BRAIN = 'onnx-community/gemma-4-E2B-it-ONNX'
/** Gemma 4's own sampling, from its generation config. */
const [TEMPERATURE, TOP_K, TOP_P] = [1, 64, 0.95]
/** How many tokens before each key its number. */
export const CONTEXT = 4
/** How many standard deviations above chance a text's numbers must be to say it is marked: about 1 in 30,000 for a person's. */
const MARKED = 4
/** Below how many counted tokens an unmarked text is too short to tell. */
const ENOUGH = 100
const KEY = 0x4a45414e

/** MurmurHash3's end: 32 bits, well mixed. @param {number} h */
const mix = (h) => {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** The key after the tokens before `end`: its last CONTEXT, mixed into KEY. @param {ArrayLike<number | bigint>} ids @param {number} end */
export function seed(ids, end) {
  let h = KEY
  for (let i = Math.max(0, end - CONTEXT); i < end; i++) h = mix(Math.imul(h ^ Number(ids[i]), 0x9e3779b1))
  return h
}

/** A number in (0, 1) for `token` after that key, uniform for anyone without it. @param {number} key @param {number} token */
export const unit = (key, token) => (mix(Math.imul(key, 0x9e3779b1) ^ token) + 0.5) / 2 ** 32

/** The `k` highest logits' tokens, highest first. @param {Float32Array} data @param {number} k */
function highest(data, k) {
  const top = /** @type {number[]} */ ([])
  for (let token = 0; token < data.length; token++) {
    if (top.length === k && data[token] <= data[top[k - 1]]) continue
    let at = top.length
    while (at > 0 && data[top[at - 1]] < data[token]) at--
    top.splice(at, 0, token)
    if (top.length > k) top.pop()
  }
  return top
}

/**
 * What Transformers.js's `generate()` takes as a logits processor, with greedy decoding: each step,
 * every logit but the race's winner's set to −∞, but in a thought or a tool call.
 * @param {{ opens: Set<number>, closes: Set<number> }} tokens those that open and close what is chosen greedily
 * @param {number} from where the answer's tokens start
 */
export function watermarker({ opens, closes }, from) {
  let read = from
  let hidden = false
  return (/** @type {bigint[][]} */ ids, /** @type {{ data: Float32Array }} */ logits) => {
    const all = ids[0]
    for (; read < all.length; read++) {
      const token = Number(all[read])
      if (opens.has(token)) hidden = true
      else if (closes.has(token)) hidden = false
    }
    if (hidden) return logits
    const { data } = logits
    const top = highest(data, TOP_K)
    const weights = top.map((token) => Math.exp((data[token] - data[top[0]]) / TEMPERATURE))
    const total = weights.reduce((sum, weight) => sum + weight)
    const key = seed(all, all.length)
    // Each runs ln(u)/p: the first home, the highest, wins as often as sampling would pick it.
    let [choice, best, share] = [top[0], -Infinity, 0]
    for (let k = 0; k < top.length && share < TOP_P; k++) {
      share += weights[k] / total
      const run = Math.log(unit(key, top[k])) / weights[k]
      if (run > best) [choice, best] = [top[k], run]
    }
    data.fill(-Infinity)
    data[choice] = 0
    return logits
  }
}

/**
 * How far a text's tokens lean to the key: −ln(1 − u) of each after its first CONTEXT, which is 1 on
 * average by chance, summed over each token and its context counted once, so repeated words weigh
 * nothing; how many, and how many standard deviations the sum is above chance.
 * @param {ArrayLike<number>} ids @returns {{ counted: number, z: number }}
 */
export function lean(ids) {
  const seen = new Set()
  let sum = 0
  for (let i = CONTEXT; i < ids.length; i++) {
    const key = seed(ids, i)
    if (seen.has(`${key} ${ids[i]}`)) continue
    seen.add(`${key} ${ids[i]}`)
    sum -= Math.log(1 - unit(key, ids[i]))
  }
  const counted = seen.size
  return { counted, z: counted ? (sum - counted) / Math.sqrt(counted) : 0 }
}

/** What a count says: the words carry the watermark, too few were counted to tell, or none was found. @param {{ counted: number, z: number }} words */
export const said = ({ counted, z }) => (z >= MARKED ? 'marked' : counted < ENOUGH ? 'short' : 'none')
