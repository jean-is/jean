// JSON-RPC 2.0 over newline-delimited messages, both ways: ACP with the editor on stdin and stdout,
// and MCP with a program the editor names. Requests are answered side by side, so a cancellation
// is heard while a prompt is still being answered.

/** An error to answer a request with, by its JSON-RPC code. */
export class RpcError extends Error {
  /** @param {number} code @param {string} message @param {unknown} [data] */
  constructor(code, message, data) {
    super(message)
    this.name = 'RpcError'
    this.code = code
    this.data = data
  }
}

/**
 * @param {{ input: AsyncIterable<Uint8Array | string>, write: (line: string) => void, handle: (method: string, params: any) => Promise<any> }} options
 *   handle answers a request, and hears a notification (its answer dropped)
 */
export function peer({ input, write, handle }) {
  let lastId = 0
  /** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>} */
  const pending = new Map()
  const send = (/** @type {object} */ message) => write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)

  /** @param {any} message */
  const hear = (message) => {
    if (typeof message?.method === 'string') {
      const answer = handle(message.method, message.params ?? {})
      if (message.id === undefined || message.id === null) return void answer.catch((error) => console.error(error))
      answer.then((result) => send({ id: message.id, result: result ?? null }), (error) => send({ id: message.id, error: {
        code: error instanceof RpcError ? error.code : -32603, message: error instanceof Error ? error.message : String(error),
        ...(error instanceof RpcError && error.data !== undefined && { data: error.data }),
      } }))
    } else if (pending.has(message?.id)) {
      const waiting = /** @type {NonNullable<ReturnType<typeof pending.get>>} */ (pending.get(message.id))
      pending.delete(message.id)
      if (message.error) waiting.reject(new RpcError(message.error.code, message.error.message, message.error.data))
      else waiting.resolve(message.result)
    }
  }

  const closed = (async () => {
    const decoder = new TextDecoder()
    let buffer = ''
    for await (const chunk of input) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = /** @type {string} */ (lines.pop())
      for (const line of lines) {
        if (!line.trim()) continue
        let message
        try {
          message = JSON.parse(line)
        } catch {
          send({ id: null, error: { code: -32700, message: 'Parse error' } })
          continue
        }
        hear(message)
      }
    }
  })().catch((error) => console.error(error)).finally(() => {
    for (const waiting of pending.values()) waiting.reject(new Error('The other side closed the connection.'))
    pending.clear()
  })

  return {
    /** @param {string} method @param {object} params @param {AbortSignal} [signal] @returns {Promise<any>} */
    request: (method, params, signal) => new Promise((resolve, reject) => {
      const id = ++lastId
      if (signal?.aborted) return reject(signal.reason)
      pending.set(id, { resolve, reject })
      signal?.addEventListener('abort', () => {
        if (pending.delete(id)) reject(signal.reason)
      }, { once: true })
      send({ id, method, params })
    }),
    /** @param {string} method @param {object} params */
    notify: (method, params) => send({ method, params }),
    /** Once the other side has closed its end. */
    closed,
  }
}
