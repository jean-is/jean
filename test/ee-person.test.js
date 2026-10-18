// Who the audit export names (D427, ee/): the account by default; as a pseudonym, the profile's id alone, and the
// account sealed for the trustee policy names, as a JWE (RFC 7516) only their private key opens.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { check, person, seal } from '../app/ee/person.js'
import { agree, kdf, open, trusteePair } from './fixtures/trustee.js'

const PROFILE = '01J00000000000000000000009'

test('the opener here derives keys as RFC 7518 does (its Appendix C)', () => {
  const alice = { kty: 'EC', crv: 'P-256', x: 'gI0GAILBdu7T53akrFmMyGcsF3n5dO7MmwNBHKW5SV0', y: 'SLW_xSffzlPWrHEVI30DHM_4egVwt3NQqeUD7nMFpps', d: '0_NxaRPUMQoAJt50Gz8YiTr8gRTwyEaCumd-MToTmIo' }
  const bob = { kty: 'EC', crv: 'P-256', x: 'weNJy2HscCSM6AEDTDg04biOvhFhyyWvOHQfeF_PxMQ', y: 'e8lnCO-AlStT-NJVX-crhB7QRYhiix03illJOVAOyck' }
  const z = agree(alice, bob)
  assert.deepEqual([...z], [158, 86, 217, 29, 129, 113, 53, 211, 114, 131, 66, 131, 191, 132, 38, 156, 251, 49, 110, 163, 218, 128, 106, 72, 246, 218, 167, 121, 140, 254, 144, 196])
  assert.equal(kdf(z, 'A128GCM', 128, Buffer.from('Alice'), Buffer.from('Bob')).toString('base64url'), 'VqqN6vgjbSBcIijNcacQGg')
})

test('sealed for the trustee, a text only their private key opens, with a key of its own each time', async () => {
  const trustee = trusteePair()
  const [one, two] = [await seal(trustee.public, 'ada@acme.example'), await seal(trustee.public, 'ada@acme.example')]
  assert.equal(one.split('.').length, 5)
  assert.notEqual(one, two)
  const { header, text } = open(one, trustee.private)
  assert.equal(text, 'ada@acme.example')
  assert.equal(header.kid, 'betriebsrat-2026')
  assert.deepEqual(Object.keys(header.epk).sort(), ['crv', 'kty', 'x', 'y'])
  assert.notEqual(open(two, trustee.private).header.epk.x, header.epk.x)
  // Anyone else's key opens nothing.
  assert.throws(() => open(one, trusteePair().private))
})

test('by default the export names the account, the device and the profile; as a pseudonym, the profile alone', async () => {
  const who = { account: 'ada@acme.example', device: '01J0000000000000000000DEV1', profile: PROFILE }
  assert.deepEqual(await person({}, who), { 'device.id': who.device, 'jean.profile.id': PROFILE, 'user.email': 'ada@acme.example' })
  assert.deepEqual(await person({ person: 'email' }, { ...who, account: 'ada' }), { 'device.id': who.device, 'jean.profile.id': PROFILE, 'user.name': 'ada' })
  assert.deepEqual(await person({ person: 'email' }, { ...who, account: null }), { 'device.id': who.device, 'jean.profile.id': PROFILE })
  // The device's id is every record's author, in shares, backups and Sync, so a pseudonym never comes with it.
  assert.deepEqual(await person({ person: 'pseudonym' }, who), { 'jean.profile.id': PROFILE })
})

test('with a trustee, a pseudonym comes with the account sealed for them, as the default would have named it', async () => {
  const trustee = trusteePair()
  const named = await person({ person: 'pseudonym', trustee: trustee.public }, { account: 'ada@acme.example', device: 'd', profile: PROFILE })
  assert.deepEqual(Object.keys(named), ['jean.profile.id', 'jean.user.sealed'])
  assert.deepEqual(JSON.parse(open(String(named['jean.user.sealed']), trustee.private).text), { 'user.email': 'ada@acme.example' })
  assert.deepEqual(await person({ person: 'pseudonym', trustee: trustee.public }, { account: null, device: 'd', profile: PROFILE }), { 'jean.profile.id': PROFILE })
})

test('policy’s person is the email or a pseudonym, and its trustee a P-256 public key, never its private half', async () => {
  const trustee = trusteePair()
  for (const fine of [{}, { person: 'email' }, { person: 'pseudonym' }, { person: 'pseudonym', trustee: trustee.public }]) await check(fine)
  // A word Jean doesn't know never names people by default.
  await assert.rejects(check({ person: 'anonymous' }), /audit\.person/)
  await assert.rejects(check({ person: 'pseudonym', trustee: { ...trustee.public, ...trustee.private } }), /private/)
  await assert.rejects(check({ person: 'pseudonym', trustee: { ...trustee.public, crv: 'P-384' } }), /audit\.trustee/)
  await assert.rejects(check({ person: 'pseudonym', trustee: { ...trustee.public, x: trustee.public.y } }), /audit\.trustee/)
  await assert.rejects(check({ person: 'pseudonym', trustee: 'betriebsrat' }), /audit\.trustee/)
  await assert.rejects(check({ person: 'email', trustee: trustee.public }), /audit\.trustee/)
})
