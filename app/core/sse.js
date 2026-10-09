// Server-Sent Events parser over a byte stream (the subset of the WHATWG format that model APIs use).
// https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation

/** @typedef {{ event: string, data: string }} SSEEvent */

/**
 * @param {ReadableStream<Uint8Array>} body
 * @returns {AsyncGenerator<SSEEvent, void, undefined>}
 */
export async function* parseSSE(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const state = { event: '', data: /** @type {string[]} */ ([]) }
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      // stream: true keeps a multi-byte character split across chunks until its last byte arrives.
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = done ? '' : lines.pop() ?? ''
      for (const line of lines) {
        const event = feed(state, line.endsWith('\r') ? line.slice(0, -1) : line)
        if (event) yield event
      }
      if (done) break
    }
    // Some servers close the stream without the final blank line.
    const last = dispatch(state)
    if (last) yield last
  } finally {
    reader.cancel().catch(() => {})
  }
}

/**
 * @param {{ event: string, data: string[] }} state
 * @param {string} line
 */
function feed(state, line) {
  if (line === '') return dispatch(state)
  if (line.startsWith(':')) return null
  const colon = line.indexOf(':')
  const field = colon < 0 ? line : line.slice(0, colon)
  const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
  if (field === 'data') state.data.push(value)
  else if (field === 'event') state.event = value
  return null
}

/** @param {{ event: string, data: string[] }} state */
function dispatch(state) {
  const event = state.data.length ? { event: state.event || 'message', data: state.data.join('\n') } : null
  state.event = ''
  state.data = []
  return event
}
