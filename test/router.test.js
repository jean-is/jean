import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conversationIn } from '../ui/router.js'

test('the address names a conversation only with a valid ULID', () => {
  assert.equal(conversationIn('#/c/01M3XN7APTVD76G6T68W6FRKC8'), '01M3XN7APTVD76G6T68W6FRKC8')
  assert.equal(conversationIn('#/c/01M3XN7APTVD76G6T68W6FRKC8/extra'), '01M3XN7APTVD76G6T68W6FRKC8')
  assert.equal(conversationIn('#/'), null)
  assert.equal(conversationIn(''), null)
  assert.equal(conversationIn('#/c/../../settings'), null)
  assert.equal(conversationIn('#/c/01m3xn7aptvd76g6t68w6frkc8'), null, 'ULIDs are upper case')
})
