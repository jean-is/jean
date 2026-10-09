import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { peer, RpcError } from '../cli/rpc.js'

/** Two peers wired to each other, as an editor and Jean are over stdin and stdout. @param {Parameters<typeof peer>[0]['handle']} [handle] */
function pair(handle) {
  const there = new PassThrough()
  const back = new PassThrough()
  /** @type {string[]} */
  const sent = []
  const jean = peer({ input: there, write: (line) => { sent.push(line); back.write(line) }, handle })
  const editor = peer({ input: back, write: (line) => there.write(line), handle: async () => null })
  return { jean, editor, there, back, sent }
}

test('a request is answered with its result, one JSON message a line', async () => {
  const { editor, sent } = pair(async (method, params) => ({ method, twice: params.n * 2 }))
  assert.deepEqual(await editor.request('add', { n: 21 }), { method: 'add', twice: 42 })
  assert.equal(sent.length, 1)
  assert.match(sent[0], /^\{"jsonrpc":"2\.0","id":1,"result":\{.*\}\}\n$/)
})

test('a failure is answered with its code and message, and an unknown method as one', async () => {
  const { editor } = pair(async (method) => {
    if (method === 'refuse') throw new RpcError(-32002, 'Not now', { why: 'test' })
    if (method === 'break') throw new Error('It broke')
    throw new RpcError(-32601, `Unknown method: ${method}`)
  })
  await assert.rejects(editor.request('refuse', {}), { code: -32002, message: 'Not now', data: { why: 'test' } })
  await assert.rejects(editor.request('break', {}), { code: -32603, message: 'It broke' })
  await assert.rejects(editor.request('nothing', {}), { code: -32601 })
})

test('messages split across chunks, or several in one, are each read whole', async () => {
  /** @type {any[]} */
  const heard = []
  const input = new PassThrough()
  /** @type {string[]} */
  const out = []
  peer({ input, write: (line) => out.push(line), handle: async (method, params) => { heard.push([method, params]); return 'ok' } })
  input.write('{"jsonrpc":"2.0","method":"note","par')
  input.write('ams":{"a":"é"}}\n{"jsonrpc":"2.0","id":7,"method":"ask","params":{}}\n\n{"jsonrpc"')
  input.write(':"2.0","id":8,"method":"ask","params":{"b":1}}\n')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(heard, [['note', { a: 'é' }], ['ask', {}], ['ask', { b: 1 }]])
  // A notification gets no answer; each request its own.
  assert.deepEqual(out.map((line) => JSON.parse(line).id), [7, 8])
})

test('a line that is not JSON is answered with a parse error, and reading goes on', async () => {
  const input = new PassThrough()
  /** @type {string[]} */
  const out = []
  peer({ input, write: (line) => out.push(line), handle: async () => 'fine' })
  input.write('not json\n{"jsonrpc":"2.0","id":1,"method":"m"}\n')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(out.map((line) => JSON.parse(line)), [
    { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
    { jsonrpc: '2.0', id: 1, result: 'fine' },
  ])
})

test('requests run side by side: a notification is heard while a request is still answered', async () => {
  /** @type {() => void} */
  let release = () => {}
  const { editor } = pair(async (method) => {
    if (method === 'slow') await new Promise((resolve) => { release = () => resolve(undefined) })
    if (method === 'cancel') release()
    return method
  })
  const slow = editor.request('slow', {})
  editor.notify('cancel', {})
  assert.equal(await slow, 'slow')
})

test('a request stopped meanwhile, or still waiting when the line closes, fails', async () => {
  const { editor, there, back } = pair(async () => new Promise(() => {}))
  const controller = new AbortController()
  const stopped = editor.request('forever', {}, controller.signal)
  controller.abort()
  await assert.rejects(stopped, { name: 'AbortError' })
  const waiting = editor.request('forever', {})
  there.end()
  back.end()
  await assert.rejects(waiting, /closed/)
  await editor.closed
})
