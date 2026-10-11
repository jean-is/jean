// The on-device brain's output parser (caps/brain-local/gemma.js), which runs in a browser
// worker but uses no browser API.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gemmaParser, parseArguments, toolCall, continues } from '../app/caps/brain-local/gemma.js'

/** @param {string[]} chunks */
function parse(chunks) {
  const parser = gemmaParser()
  const events = chunks.flatMap((chunk) => parser.feed(chunk))
  events.push(...parser.end())
  // Merge for comparison, as consumers concatenate deltas anyway.
  const out = []
  for (const event of events) {
    const last = out.at(-1)
    if (last && 'delta' in last && last.type === event.type) last.delta += event.delta
    else out.push({ ...event, ...(event.type === 'tool_call' && { call: { ...event.call, id: 'x' } }) })
  }
  return out
}

test('plain text, with the end marker dropped', () => {
  assert.deepEqual(parse(['Hello ', 'there', '<turn|>']), [{ type: 'text', delta: 'Hello there' }])
})

test('markers split across chunks are held back, and lookalikes are kept as text', () => {
  assert.deepEqual(parse(['a <', '|tool', '_call>call:read{file:<|"|>x.pdf<|', '"|>}<tool_call', '|>', '<|tool_response>']), [
    { type: 'text', delta: 'a ' },
    { type: 'tool_call', call: { id: 'x', name: 'read', args: { file: 'x.pdf' } } },
  ])
  assert.deepEqual(parse(['1 < 2 and <b>bold</b>', '<turn|>']), [{ type: 'text', delta: '1 < 2 and <b>bold</b>' }])
  assert.deepEqual(parse(['ends with <']), [{ type: 'text', delta: 'ends with <' }])
})

test('the thought channel becomes thinking', () => {
  assert.deepEqual(parse(['<|channel>thought\nPlan', ' it.<channel|>Answer.']), [
    { type: 'thinking', delta: 'Plan it.' },
    { type: 'text', delta: 'Answer.' },
  ])
})

test('arguments: bare keys, escaped strings with any character, numbers, lists, objects', () => {
  assert.deepEqual(parseArguments('{file:<|"|>Rapport "Q3", page {2}: ok<|"|>,pages:3,deep:{on:true,list:[<|"|>a<|"|>,2]}}'), {
    file: 'Rapport "Q3", page {2}: ok', pages: 3, deep: { on: true, list: ['a', 2] },
  })
  assert.deepEqual(toolCall('call:read{oops', 1).args, { __invalidJSON: '{oops' })
  assert.equal(toolCall('call:list_files', 2).name, 'list_files')
  assert.deepEqual(toolCall('call:list_files', 2).args, {})
})

test('arguments: brackets a small brain lost count of are closed, outside its strings', () => {
  assert.deepEqual(parseArguments('{questions:{questions:[{question:<|"|>Which [day]?<|"|>,options:[{label:<|"|>Monday<|"|>}]}}}}'), {
    questions: { questions: [{ question: 'Which [day]?', options: [{ label: 'Monday' }] }] },
  })
  assert.deepEqual(parseArguments('{list:[1,2'), { list: [1, 2] })
  assert.deepEqual(parseArguments('{on:true}]}'), { on: true })
})

test('the cache is reused only when the new prompt continues the previous text', () => {
  assert.equal(continues('<bos>…<|turn>model\nHi<turn|>', '<bos>…<|turn>model\nHi<turn|>\n<|turn>user\nMore'), true)
  assert.equal(continues('<bos>…Hi <turn|>', '<bos>…Hi<turn|>\n'), false)
  assert.equal(continues('', 'anything'), false)
})
