// SPDX-License-Identifier: MIT
// A circle (caps/together/circle.js, D733): who is in a shared thing, as every copy works it out from the journal's signed changes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boxPair, fingerprintOf } from '../app/ui/seal.js'
import { sealChange, openChange, take, begun, invitation, membersOf, envelopes, followed, linkOf, fromLink } from '../app/caps/together/circle.js'

const ID = 'AAAAAAAAAAAAAAAAAAAAAA'
/** A person: their profile's pair and fingerprint, and a counter for their device. */
async function person() {
  const { key, public: open } = await boxPair()
  return { key, open, fp: await fingerprintOf(open), n: 0 }
}
const epochs = { 0: crypto.getRandomValues(new Uint8Array(32)) }
/** A change a person makes, sealed as the journal holds it. @param {Awaited<ReturnType<typeof person>>} who @param {string} kind @param {any} body @param {object} [more] */
const made = (who, kind, body, more = {}) => sealChange({ id: ID, epoch: 0, key: epochs[0] }, who.key, { member: who.fp, device: 'phone', n: ++who.n, kind, body, ...more })
/** A copy reading the journal in order. @param {string} owner */
const copy = (owner) => {
  const state = begun(owner)
  return { state, read: async (/** @type {Uint8Array} */ sealed) => take(state, ID, await openChange(ID, epochs, sealed)) }
}

test('a change opens only under its epoch’s key, for its journal, as it was sealed', async () => {
  const ana = await person()
  const sealed = await made(ana, 'begin', { key: ana.open, name: 'Ana' })
  assert.equal((await openChange(ID, epochs, sealed))?.change.body.name, 'Ana')
  assert.equal(await openChange('BBBBBBBBBBBBBBBBBBBBBB', epochs, sealed), null, 'another journal')
  assert.equal(await openChange(ID, { 0: crypto.getRandomValues(new Uint8Array(32)) }, sealed), null, 'another key')
  const torn = sealed.slice(); torn[30] ^= 1
  assert.equal(await openChange(ID, epochs, torn), null)
})

test('membership as every copy works it out: the owner begins, a link joins only where links may, an invitation only for the key it names', async () => {
  const [ana, bob, carol, mallory] = await Promise.all([person(), person(), person(), person()])
  const { state, read } = copy(ana.fp)
  assert.equal(await read(await made(bob, 'begin', { key: bob.open, name: 'Bob' })), null, 'only the owner the link names begins')
  assert.ok(await read(await made(ana, 'begin', { key: ana.open, name: 'Ana', links: false })))
  assert.equal(await read(await made(bob, 'join', { key: bob.open, name: 'Bob', how: 'link' })), null, 'no link joins a circle that takes none')
  const forBob = await invitation(ID, ana.key, bob.fp)
  assert.equal(await read(await made(mallory, 'join', { key: mallory.open, name: 'M', how: 'invite', invite: forBob })), null, 'an invitation passed on is good for nobody else')
  assert.ok(await read(await made(bob, 'join', { key: bob.open, name: 'Bob', how: 'invite', invite: forBob })))
  assert.ok(await read(await made(carol, 'join', { key: carol.open, name: 'Carol', how: 'invite', invite: await invitation(ID, bob.key, carol.fp) })), 'an editor invites too')
  assert.deepEqual(membersOf(state).map((one) => [one.name, one.role, one.colour]), [['Ana', 'owner', 0], ['Bob', 'editor', 1], ['Carol', 'editor', 2]])
})

test('a change counts only from a member who may make it: signed by their key, a counter above the last, not removed, blocked or a viewer', async () => {
  const [ana, bob, carol] = await Promise.all([person(), person(), person()])
  const { state, read } = copy(ana.fp)
  await read(await made(ana, 'begin', { key: ana.open, name: 'Ana', links: true }))
  await read(await made(bob, 'join', { key: bob.open, name: 'Bob', how: 'link' }))
  await read(await made(carol, 'join', { key: carol.open, name: 'Carol', how: 'link' }))
  const line = await made(bob, 'line', { row: 'r1' })
  assert.ok(await read(line))
  assert.equal(await read(line), null, 'the same change again: replayed')
  assert.equal(await read(await sealChange({ id: ID, epoch: 0, key: epochs[0] }, carol.key, { member: bob.fp, device: 'phone', n: 99, kind: 'line', body: {} })), null, 'signed by another key')
  assert.equal(await read(await made(bob, 'role', { fp: carol.fp, role: 'viewer' })), null, 'only the owner changes roles')
  assert.ok(await read(await made(ana, 'role', { fp: carol.fp, role: 'viewer' })))
  assert.equal(await read(await made(carol, 'line', {})), null, 'a viewer changes nothing')
  assert.ok(await read(await made(ana, 'block', { fp: bob.fp })))
  assert.equal(await read(await made(bob, 'line', {})), null, 'blocked')
  assert.equal(await read(await made(ana, 'remove', { fp: ana.fp })), null, 'the owner can’t remove themself')
  assert.ok(await read(await made(ana, 'remove', { fp: carol.fp })))
  assert.deepEqual(membersOf(state).map((one) => one.name), ['Ana', 'Bob'])
  assert.equal(await read(await made(bob, 'moved', {})), null, 'only the owner moves everyone')
})

test('moved: the next epoch sealed to each member left, which the removed one can’t open; links carry what joining needs', async () => {
  const [ana, bob, carol] = await Promise.all([person(), person(), person()])
  const { state, read } = copy(ana.fp)
  await read(await made(ana, 'begin', { key: ana.open, name: 'Ana', links: true }))
  await read(await made(bob, 'join', { key: bob.open, name: 'Bob', how: 'link' }))
  await read(await made(carol, 'join', { key: carol.open, name: 'Carol', how: 'link' }))
  const next = { epoch: 1, read: 'r'.repeat(43), key: 'k' }
  const body = { envelopes: await envelopes(state, [carol.fp], next) }
  assert.deepEqual(await followed(body, bob.fp, bob.key), next)
  assert.equal(await followed(body, carol.fp, carol.key), null)
  const link = { owner: ana.fp, epoch: 3, read: 'x'.repeat(43), key: crypto.getRandomValues(new Uint8Array(32)), write: 'y'.repeat(43) }
  assert.deepEqual(fromLink(linkOf(link)), link)
  assert.equal(fromLink('nonsense'), null)
})
