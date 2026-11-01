// Policy's `session` (D676): what it may say, and the clock behind going idle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clock, idleMs, session } from '../app/ee/idle.js'

test('idle is a time in hours and minutes', () => {
  assert.equal(idleMs('PT15M'), 900_000)
  assert.equal(idleMs('PT1H30M'), 5_400_000)
  for (const wrong of ['PT0M', 'P1D', '15', 15, undefined, 'PT']) assert.throws(() => idleMs(wrong), /session\.idle/, String(wrong))
})

test('what a session asks for has to be able to happen', () => {
  const signIn = { issuer: 'https://id.example', clientId: 'jean' }
  assert.deepEqual(session({ session: { idle: 'PT15M' }, lock: 'required' }), { idle: 900_000, wipe: false })
  assert.deepEqual(session({ session: { idle: 'PT15M' }, signIn }), { idle: 900_000, wipe: false })
  assert.deepEqual(session({ session: { signOut: 'wipe' }, signIn }), { wipe: true })
  assert.deepEqual(session({ session: { idle: 'PT5M', signOut: 'wipe' }, signIn, lock: 'required' }), { idle: 300_000, wipe: true })
  // Nothing to lock or sign out of; nobody to sign out; a moment away never wipes; retention keeps what a wipe erases.
  assert.throws(() => session({ session: { idle: 'PT15M' } }), /needs "lock": "required"/)
  assert.throws(() => session({ session: { signOut: 'wipe' } }), /needs signIn/)
  assert.throws(() => session({ session: { idle: 'PT5M', signOut: 'wipe' }, signIn }), /never follows a moment away/)
  assert.throws(() => session({ session: { signOut: 'wipe' }, signIn, retention: 'P6M' }), /choose one/)
  assert.throws(() => session({ session: { signOut: 'keep' }, signIn }), /can only be "wipe"/)
  assert.throws(() => session({ session: 'PT5M' }), /not an object/)
})

test('going idle comes once, after long enough with nothing done, never while Jean works', () => {
  let time = 0
  let busy = false
  let gone = 0
  const watch = clock({ after: 100, busy: () => busy, done: () => gone++, now: () => time })
  time = 99
  watch.tick()
  assert.equal(gone, 0)
  watch.touch()
  time = 150
  watch.tick()
  assert.equal(gone, 0)
  // At work, it starts counting again from then.
  busy = true
  time = 500
  watch.tick()
  busy = false
  assert.equal(gone, 0)
  time = 599
  watch.tick()
  assert.equal(gone, 0)
  time = 600
  watch.tick()
  watch.tick()
  assert.equal(gone, 1)
  // Back, and gone again: nothing may have locked the first time.
  watch.touch()
  time = 700
  watch.tick()
  assert.equal(gone, 2)
})
