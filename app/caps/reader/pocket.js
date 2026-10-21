// What Kyutai's Pocket TTS needs besides ONNX Runtime (D455): its text, prepared and cut into chunks as
// pocket-tts 4.0.0 does (models/text_chunking.py), as the ids its SentencePiece Unigram tokenizer gives,
// byte fallback included; and its weights, expanded from 8-bit numbers into the fp32 data its graphs read.
// Tested under node --test.

/**
 * A graph's external data, fp32: each tensor's 8-bit numbers times its channel's scale.
 * @param {ArrayBuffer} bin @param {{ bytes: number, tensors: number[][] }} graph [offset in the data, count, values a channel spans, channels, at in bin, scales at]
 */
export function expand(bin, { bytes, tensors }) {
  const out = new Float32Array(bytes / 4)
  for (const [at, count, inner, channels, values, scales] of tensors) {
    const q = new Int8Array(bin, values, count)
    const scale = new Float32Array(bin, scales, channels)
    for (let i = 0, o = at / 4; i < count; i++) out[o + i] = q[i] * scale[((i / inner) | 0) % channels]
  }
  return new Uint8Array(out.buffer)
}

/**
 * A tokenizer.json's Unigram model: ids by Viterbi over its pieces' scores, words split before each "▁" as
 * Metaspace splits them, a character it lacks as its UTF-8 bytes; and back to text.
 * @param {{ model: { vocab: [string, number][], unk_id: number } }} json
 */
export function tokenizer({ model: { vocab, unk_id: unknown } }) {
  const ids = new Map(vocab.map(([piece], i) => [piece, i]))
  const longest = Math.max(...vocab.map(([piece]) => [...piece].length))
  const missing = Math.min(...vocab.map(([, score]) => score)) - 10
  const byte = (/** @type {number} */ b) => ids.get(`<0x${b.toString(16).toUpperCase().padStart(2, '0')}>`) ?? unknown
  /** @param {string[]} chars */
  const best = (chars) => {
    const score = new Float64Array(chars.length + 1).fill(-Infinity)
    const from = new Int32Array(chars.length + 1)
    const piece = new Int32Array(chars.length + 1)
    score[0] = 0
    for (let i = 0; i < chars.length; i++) {
      let known = false
      for (let j = i + 1, text = ''; j <= Math.min(chars.length, i + longest); j++) {
        text += chars[j - 1]
        const id = ids.get(text)
        if (id === undefined) continue
        known ||= j === i + 1
        if (score[i] + vocab[id][1] > score[j]) [score[j], from[j], piece[j]] = [score[i] + vocab[id][1], i, id]
      }
      if (!known && score[i] + missing > score[i + 1]) [score[i + 1], from[i + 1], piece[i + 1]] = [score[i] + missing, i, -1]
    }
    /** @type {number[]} */
    const out = []
    for (let j = chars.length; j > 0; j = from[j]) out.unshift(...(piece[j] < 0 ? [...new TextEncoder().encode(chars[j - 1])].map(byte) : [piece[j]]))
    return out
  }
  return {
    /** @param {string} text */
    encode: (text) => `▁${text}`.replaceAll(' ', '▁').split(/(?=▁)/).flatMap((word) => best([...word])),
    /** Each piece's bytes, a byte token's its own, read as one text without the space a first word starts with. @param {number[]} list */
    decode: (list) => new TextDecoder().decode(new Uint8Array(list.flatMap((id) => {
      const raw = /^<0x([0-9A-F]{2})>$/.exec(vocab[id][0])
      return raw ? [parseInt(raw[1], 16)] : [...new TextEncoder().encode(vocab[id][0].replaceAll('▁', ' '))]
    }))).replace(/^ /, ''),
  }
}

/** @typedef {{ replace: Record<string, string>, semicolons: boolean, pad: boolean, final: boolean, capitalize: boolean }} Rules */
/** @typedef {ReturnType<typeof tokenizer>} Tokenizer */

const FINAL = '.!?…'
const WEAK = ',;:-–—'
const CLOSERS = '"\'”’)]»'
/** @param {string} text @param {string} set */
const trimEnd = (text, set) => {
  while (text && set.includes(text.at(-1) ?? '')) text = text.slice(0, -1)
  return text
}

/**
 * A chunk as the model reads it, and how many frames to go on after it says it is done: characters it
 * wasn't trained on replaced, a capital first, a final mark. @param {string} text @param {Rules} rules
 */
export function prepare(text, rules) {
  text = text.trim()
  if (Object.keys(rules.replace).length) {
    text = [...text].map((c) => rules.replace[c] ?? c).join('').split(/\s+/).filter(Boolean).join(' ')
    text = text.replace(/([.!?…])\s*[,;:]/g, '$1')
  }
  text = text.replaceAll('\n', ' ').replaceAll('\r', ' ').replaceAll('  ', ' ')
  if (rules.semicolons) text = text.replaceAll(';', ',')
  const words = text.split(/\s+/).filter(Boolean).length
  if (rules.capitalize && text[0] !== text[0].toUpperCase()) text = text[0].toUpperCase() + text.slice(1)
  if (rules.final) {
    const core = trimEnd(text, `${CLOSERS} `)
    const closers = text.slice(core.length).trim()
    if (core && !FINAL.includes(core.at(-1) ?? '')) text = WEAK.includes(core.at(-1) ?? '') ? `${trimEnd(core, `${WEAK} `)}.${closers}` : `${text}.`
  }
  if (rules.pad && words < 5) text = `        ${text}`
  return { text, after: (words <= 4 ? 3 : 1) + 2 }
}

/**
 * The chunks a text is read in, as pocket-tts makes them: sentences by its tokenizer's marks (a decimal
 * point not one), one longer than `most` tokens cut at its commas, then put together up to `most`.
 * @param {string} text @param {Tokenizer} tokens @param {Rules} rules
 */
export function chunks(text, tokens, rules, most = 50) {
  const all = tokens.encode(prepare(text, rules).text.trim())
  /** @param {number[]} list @param {number[]} marks @param {boolean} [decimals] */
  const cut = (list, marks, decimals) => {
    const at = [0]
    let after = false
    list.forEach((id, i) => {
      if (marks.includes(id)) return void (after = true)
      if (after && !(decimals && decimal(tokens.decode(list.slice(0, i)), tokens.decode(list.slice(i))))) at.push(i)
      after = false
    })
    at.push(list.length)
    return at.slice(1).map((end, i) => /** @type {[number, string]} */ ([end - at[i], tokens.decode(list.slice(at[i], end))]))
  }
  const pieces = cut(all, tokens.encode('.!...?').slice(1), true).flatMap(([count, sentence]) => {
    const parts = count > most ? cut(tokens.encode(sentence.trim()), tokens.encode(',;:').slice(1)) : []
    return parts.length > 1 ? parts : [/** @type {[number, string]} */ ([count, sentence])]
  })
  /** @type {[number, string][]} */
  const joined = []
  for (const [n, piece] of pieces) {
    const last = joined.at(-1)
    if (last && last[0] + n <= most) joined[joined.length - 1] = [last[0] + n, `${last[1]} ${piece}`]
    else joined.push([n, piece])
  }
  // prepare() trims each, as pocket-tts does the chunks it joins.
  return joined.map(([, chunk]) => prepare(chunk, rules)).map(({ text, after }) => ({ ids: tokens.encode(text), after }))
}

/** Whether a sentence mark is a decimal point: a digit before it and after. @param {string} before @param {string} next */
const decimal = (before, next) => before.length >= 2 && before.at(-1) === '.' && /\p{Nd}/u.test(before.at(-2) ?? '') && /^\p{Nd}/u.test(next)
