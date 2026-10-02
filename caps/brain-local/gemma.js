// Gemma 4's output, decoded with its special tokens, as Jean's stream events:
//   text, a thought channel <|channel>thought\n…<channel|>,
//   tool calls <|tool_call>call:name{key:<|"|>value<|"|>,n:3}<tool_call|>,
//   and end markers (<turn|>, <|tool_response>, <eos>), which are dropped.
// Streamed: a marker split across chunks is held back until it is complete.

const QUOTE = '<|"|>'
const ENDS = ['<turn|>', '<|tool_response>', '<eos>']
const MARKERS = ['<|tool_call>', '<|channel>', ...ENDS]

/**
 * @typedef {{ type: 'text', delta: string } | { type: 'thinking', delta: string } | { type: 'tool_call', call: { id: string, name: string, args: any } }} GemmaEvent
 */

export function gemmaParser() {
  let buffer = ''
  /** @type {'text' | 'thought' | 'call'} */
  let state = 'text'
  let calls = 0

  /** @param {string} chunk @param {boolean} [final] @returns {GemmaEvent[]} */
  function feed(chunk, final = false) {
    buffer += chunk
    /** @type {GemmaEvent[]} */
    const out = []
    while (buffer) {
      if (state === 'call') {
        const end = buffer.indexOf('<tool_call|>')
        if (end < 0) break
        out.push({ type: 'tool_call', call: toolCall(buffer.slice(0, end), ++calls) })
        buffer = buffer.slice(end + '<tool_call|>'.length)
        state = 'text'
        continue
      }
      if (state === 'thought') {
        const end = buffer.indexOf('<channel|>')
        const text = end < 0 ? safeText(buffer, ['<channel|>'], final) : buffer.slice(0, end)
        if (text) out.push({ type: 'thinking', delta: text.replace(/^thought\n/, '') })
        buffer = buffer.slice(text.length)
        if (end < 0) break
        buffer = buffer.slice('<channel|>'.length)
        state = 'text'
        continue
      }
      const at = buffer.indexOf('<')
      if (at < 0) {
        out.push({ type: 'text', delta: buffer })
        buffer = ''
        break
      }
      if (at > 0) {
        out.push({ type: 'text', delta: buffer.slice(0, at) })
        buffer = buffer.slice(at)
      }
      const marker = MARKERS.find((m) => buffer.startsWith(m))
      if (marker) {
        buffer = buffer.slice(marker.length)
        if (marker === '<|tool_call>') state = 'call'
        else if (marker === '<|channel>') state = 'thought'
        continue
      }
      if (!final && MARKERS.some((m) => m.startsWith(buffer))) break // may still become a marker
      out.push({ type: 'text', delta: '<' })
      buffer = buffer.slice(1)
    }
    return merge(out)
  }
  return { feed, end: () => feed('', true) }
}

/** Text that can't be the start of one of `markers`. @param {string} text @param {string[]} markers @param {boolean} final */
function safeText(text, markers, final) {
  if (final) return text
  for (let keep = Math.min(text.length, Math.max(...markers.map((m) => m.length)) - 1); keep > 0; keep--) {
    if (markers.some((m) => m.startsWith(text.slice(-keep)))) return text.slice(0, -keep)
  }
  return text
}

/** @param {GemmaEvent[]} events */
function merge(events) {
  /** @type {GemmaEvent[]} */
  const out = []
  for (const event of events) {
    const last = out.at(-1)
    if (last && last.type === event.type && 'delta' in last && 'delta' in event) last.delta += event.delta
    else if (!('delta' in event) || event.delta) out.push(event)
  }
  return out
}

/** "call:read{file:<|"|>a.pdf<|"|>}" → { name, args }. @param {string} source @param {number} n */
export function toolCall(source, n) {
  const body = source.replace(/^\s*call:/, '')
  const brace = body.indexOf('{')
  const name = (brace < 0 ? body : body.slice(0, brace)).trim()
  const raw = brace < 0 ? '{}' : body.slice(brace)
  let args
  try {
    args = parseArguments(raw)
  } catch {
    args = { __invalidJSON: raw }
  }
  return { id: `call_${n}_${Date.now().toString(36)}`, name, args }
}

/**
 * Gemma's argument syntax is JSON with bare keys and <|"|> for quotes.
 * @param {string} source
 */
export function parseArguments(source) {
  /** @type {string[]} */
  const strings = []
  const escaped = source.split(QUOTE).map((part, i) => (i % 2 ? `\u0000${strings.push(part) - 1}\u0000` : part)).join('')
  const json = escaped
    .replace(/([{,]\s*)([A-Za-z_][\w.-]*)\s*:/g, '$1"$2":')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => JSON.stringify(strings[Number(i)]))
  return JSON.parse(json)
}

/**
 * The template renders an earlier reply as `<|turn>model\n{content}<turn|>`; reuse the
 * cache only when the next prompt continues the previous text exactly.
 * @param {string} previous prompt plus generated text @param {string} next
 */
export const continues = (previous, next) => Boolean(previous) && next.startsWith(previous)

export { ENDS }
