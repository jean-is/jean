// People (D727): meeting on pairing's exchange between two profiles, against the relay in this process; what a person mailbox takes.
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { relay } from '../relay/relay.js'
import { open, read } from '../app/ui/relay.js'
import { fingerprintOf } from '../app/ui/seal.js'
import { bytesOf } from '../app/caps/share/seal.js'
import { pairingBox, codeOf, envelope } from '../app/caps/devices/pair.js'
import { memoryFS } from '../app/core/fs.js'
import { personOf, peopleOf, invite, heardHello, heardReveal, confirmed, accept, heardNonce, heardMet, received, forget, tidy, metId, nameId, WEEK, sendTo, arrivalsOf, ARRIVALS, turn, letter, madePerson } from '../app/caps/people/flow.js'
import { lists, listed, find, keep, introduced, trust, vetted } from '../app/caps/people/colleagues.js'
import { ISSUER, JWKS, POLICY, idTokenOf } from './fixtures/fake-issuer.js'

const [JEAN, BASE] = ['https://jean.example', 'https://relay.example/']
/** What listing needs of a profile's context: the relay's address. */
const AT = /** @type {any} */ ({ base: BASE })

/** A relay in this process, which fetch now reaches, its mailboxes in memory; with `issuers`, the organisation's people too. @param {Partial<import('../relay/relay.js').Config>} [config] */
function relayed(config = {}) {
  const [boxes, bodies, people] = [new Map(), new Map(), new Map()]
  const store = {
    entries: async () => [...people.values()],
    saveEntry: async (/** @type {any} */ entry) => { people.set(entry.id, structuredClone(entry)) },
    dropEntry: async (/** @type {string} */ id) => { people.delete(id) },
    box: async (/** @type {string} */ id) => structuredClone(boxes.get(id) ?? null),
    save: async (/** @type {string} */ id, /** @type {any} */ box) => { boxes.set(id, structuredClone(box)) },
    add: async (/** @type {string} */ id, /** @type {number} */ seq, /** @type {Uint8Array} */ body) => { bodies.set(`${id}/${seq}`, body) },
    read: async (/** @type {string} */ id, /** @type {number} */ seq) => bodies.get(`${id}/${seq}`) ?? null,
    drop: async (/** @type {string} */ id, /** @type {number[]} */ seqs) => { for (const seq of seqs) bodies.delete(`${id}/${seq}`) },
    remove: async (/** @type {string} */ id) => { boxes.delete(id); for (const key of [...bodies.keys()]) if (key.startsWith(`${id}/`)) bodies.delete(key) },
    record: async () => {}, free: async () => Infinity,
  }
  const handle = relay({ origins: [JEAN], store, limits: {}, ...config })
  globalThis.fetch = (url, init = {}) => handle(new Request(url, { ...init, headers: { .../** @type {Record<string, string>} */ (init.headers), origin: JEAN } }), { address: '203.0.113.7', port: 51234 })
  return boxes
}

let clock = Date.parse('2026-11-09T09:00:00Z')
/** A profile's secrets and files, and what the meeting needs of its app. @param {string} said */
function profile(said, fs = memoryFS()) {
  const secrets = /** @type {Record<string, string>} */ ({})
  return { secrets, fs, get: async (/** @type {string} */ id) => secrets[id] ?? null, all: async () => ({ ...secrets }), base: BASE, address: `${JEAN}/`, now: () => clock, said: async () => said,
    set: async (/** @type {Record<string, string | null>} */ values) => { for (const [id, value] of Object.entries(values)) if (value === null) delete secrets[id]; else secrets[id] = value } }
}
/** The one message come to a mailbox since the last read, read with its token. @type {Map<string, number>} */
const seen = new Map()
/** @param {string} token */
const next = async (token) => { const { messages } = await read(BASE, token, { after: seen.get(token) ?? 0 }); assert.equal(messages.length, 1); seen.set(token, messages[0].seq); return messages[0].bytes }
const meetOf = (/** @type {string} */ s) => pairingBox(bytesOf(s), 'meet')
const backOf = (/** @type {string} */ s) => pairingBox(bytesOf(s), 'meet-back')
/** @param {Promise<unknown>} promise */
const reasonOf = (promise) => promise.then(() => assert.fail('it went on'), (error) => error.reason)

/** Ana invites, Bob accepts, and both reach the digits; what each holds then. */
async function meet(ana = profile('Ana'), bob = profile('Bob'), name = 'Bob from the bakery') {
  const { invite: asked, link } = await invite(ana, { name, way: 'link' })
  const accepting = await accept(bob, { link, name: 'Ana' })
  const inviting = await heardHello(ana, asked, await next((await meetOf(asked.s)).token))
  const shown = await heardNonce(bob, accepting, await next(accepting.token))
  const typed = await heardReveal(ana, inviting, await next((await backOf(asked.s)).token))
  return { ana, bob, inviting: typed, accepting: shown, link }
}

test('two people meet: the digits Bob shows are typed on Ana’s device, then each has the other, and where each reads', async () => {
  relayed()
  const { ana, bob, inviting, accepting } = await meet()
  assert.match(String(accepting.code), /^\d{6}$/)
  assert.equal(inviting.code, accepting.code)
  assert.equal(accepting.theirs, 'Ana')
  assert.equal(await confirmed(ana, inviting, String(accepting.code)), 'met')
  const [fpA, fpB] = [await fingerprintOf((await personOf(ana)).public), await fingerprintOf((await personOf(bob)).public)]
  // Ana keeps Bob as she named him, waiting for his answer; her invitation and its mailboxes are gone.
  assert.equal(ana.secrets[nameId(fpB)], 'Bob from the bakery')
  assert.equal(JSON.parse(ana.secrets[metId(fpB)]).waiting, true)
  assert.ok(!Object.keys(ana.secrets).some((id) => id.startsWith('invite:')))
  // Bob takes her answer: Ana kept with her person mailbox, his acceptance over; his answer reaches any of Ana's devices.
  const met = await heardMet(bob, accepting, await next(accepting.token))
  assert.equal(met.mailbox, (await personOf(ana)).mailbox)
  assert.equal(bob.secrets[nameId(fpA)], 'Ana')
  assert.ok(!Object.keys(bob.secrets).some((id) => id.startsWith('accept:')))
  const answer = await received(ana, await next((await personOf(ana)).token))
  assert.deepEqual([answer?.kind, answer?.from], ['met', fpB])
  const [bobAsKept] = await peopleOf(ana)
  assert.equal(bobAsKept.mailbox, (await personOf(bob)).mailbox)
  assert.equal(bobAsKept.waiting, undefined)
  assert.equal(bobAsKept.name, 'Bob from the bakery')
})

test('a link takes one hello: a second opener finds it used', async () => {
  relayed()
  const ana = profile('Ana')
  const { link } = await invite(ana, { name: 'Bob', way: 'link' })
  await accept(profile('Bob'), { link, name: 'Ana' })
  assert.equal(await reasonOf(accept(profile('Eve'), { link, name: 'Ana' })), 'used')
})

test('three wrong tries end it, and Bob hears so; meeting oneself or someone met already is refused', async () => {
  relayed()
  const { ana, bob, inviting, accepting } = await meet()
  assert.equal(await confirmed(ana, inviting, '000000') === 'wrong' && await confirmed(ana, { ...inviting, tries: 2 }, '000001'), 'wrong')
  assert.equal(await confirmed(ana, { ...inviting, tries: 1 }, '000002'), 'tries')
  assert.equal(await reasonOf(heardMet(bob, accepting, await next(accepting.token))), 'tries')
  assert.deepEqual(await peopleOf(ana), [])
  // Her own link, opened in her own profile; and Bob, met once, met again.
  const { link } = await invite(ana, { name: 'Me', way: 'side' })
  assert.equal(await reasonOf(accept(ana, { link, name: 'Me' })), 'self')
  const again = await meet(profile('Ana'), profile('Bob'))
  await confirmed(again.ana, again.inviting, String(again.accepting.code))
  await heardMet(again.bob, again.accepting, await next(again.accepting.token))
  const second = await invite(again.ana, { name: 'Bob again', way: 'link' })
  assert.equal(await reasonOf(accept(again.bob, { link: second.link, name: 'Ana' })), 'known')
})

test('a meeting’s digits are no pairing’s, and a person mailbox drops what comes from a key it never met', async () => {
  relayed()
  const { ana, inviting } = await meet()
  const hello = /** @type {NonNullable<typeof inviting.hello>} */ (inviting.hello)
  const fpA = await fingerprintOf((await personOf(ana)).public)
  const fields = { s: bytesOf(inviting.s), fpA, keyB: hello.key, mailboxB: hello.mailbox, nA: String(inviting.nA), nB: 'x'.repeat(43) }
  assert.notEqual(await codeOf({ ...fields, label: 'meet' }), await codeOf(fields))
  const me = await personOf(ana)
  await open(BASE, me.token)
  const stranger = await personOf(profile('Eve'))
  assert.equal(await received(ana, await envelope(stranger, me.public, { format: 1, kind: 'met', body: { mailbox: 'x' } })), null)
})

test('someone forgotten is told so; a week on, an invitation and someone who never answered go', async () => {
  relayed()
  const { ana, bob, inviting, accepting } = await meet()
  await confirmed(ana, inviting, String(accepting.code))
  await heardMet(bob, accepting, await next(accepting.token))
  await received(ana, await next((await personOf(ana)).token))
  const fpB = await fingerprintOf((await personOf(bob)).public)
  await forget(ana, fpB)
  assert.equal(ana.secrets[metId(fpB)], undefined)
  assert.equal((await received(bob, await next((await personOf(bob)).token)))?.kind, 'gone')
  const late = await invite(ana, { name: 'Carol', way: 'link' })
  clock += WEEK + 1
  await tidy(ana)
  assert.equal(ana.secrets[`invite:${late.invite.id}`], undefined)
})

/** Ana and Bob met, each with the other's mailbox, Bob's answer taken by Ana. */
async function met() {
  const { ana, bob, inviting, accepting } = await meet()
  await confirmed(ana, inviting, String(accepting.code))
  await heardMet(bob, accepting, await next(accepting.token))
  await received(ana, await next((await personOf(ana)).token))
  return { ana, bob, fpA: await fingerprintOf((await personOf(ana)).public), fpB: await fingerprintOf((await personOf(bob)).public) }
}
const VALUE = { format: 1, kind: 'task', lang: 'en', title: 'Budget 2027', file: '{}\n', files: {}, certificates: [] }
const THREAD = { task: '01JTASK0000000000000000000', id: 'thread' }

test('a task sent to someone met waits for them, sealed as it came, under its id: their other device opens it too, once, and nothing more than 20 from one person', async () => {
  relayed()
  const { ana, bob, fpA, fpB } = await met()
  const size = await sendTo(ana, fpB, { title: 'Budget 2027', words: 'For Monday', value: VALUE, thread: THREAD })
  assert.ok(size > 0)
  const bytes = await next((await personOf(bob)).token)
  assert.equal((await received(bob, bytes))?.kind, 'send')
  const files = await bob.fs.list(ARRIVALS)
  assert.equal(files.length, 1)
  assert.doesNotMatch(String(await bob.fs.read(`${ARRIVALS}/${files[0].name}`)), /Budget|Monday/)
  // The same message again, as a relay may give it: written once.
  await received(bob, bytes)
  assert.equal((await bob.fs.list(ARRIVALS)).length, 1)
  // Bob's other device, the same person with the same files, which his store would bring: it opens it as his first does.
  const other = { ...profile('Bob', bob.fs), secrets: bob.secrets, get: bob.get, set: bob.set, all: bob.all }
  const [arrived] = await arrivalsOf(other)
  assert.deepEqual([arrived.from, arrived.name, arrived.title, arrived.words, arrived.value.title, arrived.thread?.id], [fpA, 'Ana', 'Budget 2027', 'For Monday', 'Budget 2027', 'thread'])
  // An answer back on the thread is kept as what came is, and opens as an answer.
  await sendTo(bob, fpA, { title: 'Budget 2027', words: 'Done', value: VALUE, thread: THREAD }, 'reply')
  assert.equal((await received(ana, await next((await personOf(ana)).token)))?.kind, 'reply')
  const [answer] = await arrivalsOf(ana)
  assert.deepEqual([answer.kind, answer.name, answer.thread?.id], ['reply', 'Bob from the bakery', 'thread'])
  for (let n = 0; n < 25; n++) await received(bob, await sendTo(ana, fpB, { title: `${n}`, words: '', value: VALUE, thread: THREAD }).then(() => next((/** @type {any} */ (JSON.parse(bob.secrets.person))).token)))
  assert.equal((await bob.fs.list(ARRIVALS)).length, 20)
})

test('nothing goes to someone who never answered, nor to someone forgotten, nor past what the relay carries', async () => {
  relayed()
  const { ana, bob, inviting, accepting } = await meet()
  await confirmed(ana, inviting, String(accepting.code))
  const fpB = await fingerprintOf((await personOf(bob)).public)
  assert.equal(await reasonOf(sendTo(ana, fpB, { title: 'x', words: '', value: VALUE, thread: THREAD })), 'waiting')
  assert.equal(await reasonOf(sendTo(ana, 'A'.repeat(22), { title: 'x', words: '', value: VALUE, thread: THREAD })), 'gone')
  await heardMet(bob, accepting, await next(accepting.token))
  await received(ana, await next((await personOf(ana)).token))
  assert.equal(await reasonOf(sendTo(ana, fpB, { title: 'x', words: '', value: { ...VALUE, file: randomBytes(20_000_000).toString('base64') }, thread: THREAD })), 'large')
})

test('a device removed turns the profile’s key: each person takes the new key and mailbox from the old, says so, and what goes after reaches them; the old mailbox is gone', async () => {
  relayed()
  const { ana, bob, fpA, fpB } = await met()
  const was = await personOf(ana)
  await turn(ana)
  const now = await personOf(ana)
  assert.notEqual(now.public.x, was.public.x)
  assert.deepEqual([now.old?.length, now.pending], [1, undefined])
  // Bob's Jean takes it from the key it knew, and says so to the new one.
  assert.equal((await received(bob, await next((await personOf(bob)).token)))?.kind, 'met')
  const [ana2] = await peopleOf(bob)
  assert.deepEqual([ana2.key.x, ana2.mailbox, ana2.before?.x], [now.public.x, now.mailbox, was.public.x])
  assert.equal((await received(ana, await next(now.token)))?.kind, 'took')
  assert.equal((await peopleOf(ana))[0].took, await fingerprintOf(now.public))
  // What Ana sends now opens on Bob's Jean; what he sends reaches her new mailbox; the old one is no more.
  await sendTo(ana, fpB, { title: 'After', words: '', value: VALUE, thread: THREAD })
  await received(bob, await next((await personOf(bob)).token))
  assert.equal((await arrivalsOf(bob))[0]?.title, 'After')
  await sendTo(bob, fpA, { title: 'Back', words: '', value: VALUE, thread: THREAD }, 'reply')
  assert.equal((await received(ana, await next(now.token)))?.kind, 'reply')
  assert.equal(await read(BASE, was.token).then(() => 'open', (error) => error.status), 404)
})

test('a second turn from the same old key, as a stolen device would make, marks the person to meet again, and nothing goes to them', async () => {
  relayed()
  const { ana, bob, fpA } = await met()
  const was = await personOf(ana)
  await turn(ana)
  await received(bob, await next((await personOf(bob)).token))
  // Someone holding Ana's old key turns it again, to a key of their own.
  const thief = await madePerson(), bobKey = (await personOf(bob)).public
  const chain = await envelope(was, bobKey, { kind: 'chain', key: thief.public, prior: await fingerprintOf(was.public), mailbox: thief.mailbox, at: clock })
  const bytes = await letter(thief, bobKey, 'send', { title: 'Steal', words: '', value: VALUE, thread: THREAD }, ana)
  assert.equal(await received(bob, new TextEncoder().encode(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(bytes)), chain: new TextDecoder().decode(chain) }))), null)
  const [ana2] = await peopleOf(bob)
  assert.equal(ana2.again, true)
  assert.equal(ana2.key.x, (await personOf(ana)).public.x, 'the key taken stays')
  assert.equal(await reasonOf(sendTo(bob, fpA, { title: 'x', words: '', value: VALUE, thread: THREAD })), 'again')
})

test('where the organisation’s relay lists its people, a person is listed there by the ID token its sign-in gave, under each device’s key and mailbox, which a colleague then finds (D731)', async () => {
  assert.equal(await lists(BASE, ISSUER), false, 'a relay that lists nobody')
  relayed({ issuers: [{ issuer: ISSUER, audience: POLICY.signIn.clientId, jwks: JWKS }] })
  assert.equal(await lists(BASE, ISSUER), true)
  assert.equal(await lists(BASE, 'https://login.other.example/v2.0'), false)
  const [ana, laptop, phone] = [await madePerson(), await madePerson(), await madePerson()]
  assert.deepEqual(await listed(AT, ana, await idTokenOf()), { name: 'Ana Martín', account: 'ana@acme.example' }, 'its mailbox opened first')
  const bob = { sub: 'sub-bob', name: 'Bob Dupont', preferred_username: 'bob@acme.example' }
  await listed(AT, laptop, await idTokenOf(bob))
  await listed(AT, phone, await idTokenOf(bob))
  const found = await (await fetch(`${BASE}v1/people?q=bob`, { headers: { authorization: `Bearer ${ana.token}` } })).json()
  assert.deepEqual(found.people.map((/** @type {any} */ one) => [one.account, one.devices.map((/** @type {any} */ device) => device.mailbox).sort()]), [['bob@acme.example', [laptop.mailbox, phone.mailbox].sort()]])
  assert.deepEqual(found.people[0].devices.find((/** @type {any} */ device) => device.mailbox === phone.mailbox).key, (({ kty, crv, x, y }) => ({ kty, crv, x, y }))(phone.public))
  await assert.rejects(listed(AT, ana, await idTokenOf({ aud: 'someone-else' })), (/** @type {any} */ error) => error.status === 403)
})

test('a colleague found is kept with each device pinned; their first letter is taken through the list, a new device of someone kept held until trusted (D731)', async () => {
  relayed({ issuers: [{ issuer: ISSUER, audience: POLICY.signIn.clientId, jwks: JWKS }] })
  const [ana, bobLaptop, bobPhone] = [profile('Ana'), profile('Bob'), profile('Bob')]
  const bob = { sub: 'sub-bob', name: 'Bob Dupont', preferred_username: 'bob@acme.example' }
  await listed(ana, await personOf(ana), await idTokenOf())
  await listed(bobLaptop, await personOf(bobLaptop), await idTokenOf(bob))
  await listed(bobPhone, await personOf(bobPhone), await idTokenOf(bob))
  const [found] = await find(BASE, await personOf(ana), 'q=dupont')
  await keep(ana, found)
  const kept = await peopleOf(ana)
  assert.deepEqual(kept.map((one) => [one.name, one.met, one.account]), [['Bob Dupont', 'organisation', 'bob@acme.example'], ['Bob Dupont', 'organisation', 'bob@acme.example']])
  // Ana sends to each of his devices; the first time, his Jean looks her up by the mailbox her letter gives, and keeps her with hers.
  for (const one of kept) await sendTo(ana, one.fp, { title: 'Budget 2027', words: '', value: { file: '' } })
  for (const device of [bobLaptop, bobPhone]) {
    const [bytes] = (await read(BASE, (await personOf(device)).token)).messages.map((one) => one.bytes)
    assert.equal(await introduced(device, await personOf(device), bytes), true)
    assert.equal(await introduced(device, await personOf(device), bytes), false, 'known now')
    assert.equal((await received(device, bytes))?.kind, 'send')
    assert.deepEqual((await arrivalsOf(device)).map((one) => [one.name, one.title]), [['Ana Martín', 'Budget 2027']])
  }
  // A letter from a key the list doesn't name at the mailbox it gives is taken by no one.
  const stranger = await madePerson()
  const forged = new TextEncoder().encode(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(await letter(stranger, (await personOf(bobPhone)).public, 'send', {}, ana))), mailbox: (await personOf(ana)).mailbox }))
  assert.equal(await introduced(bobPhone, await personOf(bobPhone), forged), false)
  // Ana on a new device: Bob's phone holds it, nothing it sends shows, until he trusts it.
  const tablet = profile('Ana')
  await listed(tablet, await personOf(tablet), await idTokenOf())
  const [bobAgain] = await find(BASE, await personOf(tablet), 'account=bob%40acme.example')
  await keep(tablet, bobAgain)
  const phoneFp = await fingerprintOf((await personOf(bobPhone)).public)
  await sendTo(tablet, phoneFp, { title: 'From my tablet', words: '', value: { file: '' } })
  const { messages } = await read(BASE, (await personOf(bobPhone)).token)
  const bytes = messages.at(-1)?.bytes ?? new Uint8Array()
  assert.equal(await introduced(bobPhone, await personOf(bobPhone), bytes), true)
  assert.equal((await peopleOf(bobPhone)).filter((one) => one.asking).length, 1)
  await received(bobPhone, bytes)
  assert.deepEqual((await arrivalsOf(bobPhone)).map((one) => one.title), ['Budget 2027'], 'held')
  await assert.rejects(sendTo(bobPhone, await fingerprintOf((await personOf(tablet)).public), { title: 'x', words: '', value: {} }), (/** @type {any} */ error) => error.reason === 'again')
  await trust(bobPhone, 'ana@acme.example')
  assert.deepEqual((await arrivalsOf(bobPhone)).map((one) => one.title).sort(), ['Budget 2027', 'From my tablet'])
  // One of his devices no longer listed: kept again, Ana keeps the other alone.
  await keep(ana, { ...found, devices: found.devices.slice(0, 1) })
  assert.deepEqual((await peopleOf(ana)).map((one) => one.mailbox), [found.devices[0].mailbox])
})

test('the organisation’s controls (ee/, D732) hear each step: the listing carries the certificate they give, signed for by the profile key, someone is found and kept with the devices they let through, and someone kept out is neither kept, sent to nor heard', async () => {
  relayed({ issuers: [{ issuer: ISSUER, audience: POLICY.signIn.clientId, jwks: JWKS }] })
  const [bob, carol] = [{ sub: 'sub-bob', name: 'Bob Dupont', preferred_username: 'bob@acme.example' }, { sub: 'sub-carol', name: 'Carol Petit', preferred_username: 'carol@acme.example' }]
  const out = new Set(['carol@acme.example'])
  /** @type {string[]} */
  const heard = []
  let signed = false
  const [bobLaptop, bobPhone, carols] = [profile('Bob'), profile('Bob'), profile('Carol')]
  /** Controls that certify Ana's key, let Bob's laptop through alone, and keep out whom `out` names. @param {any} e */
  const check = async (e) => {
    heard.push(e.action)
    if (e.action === 'list') {
      const data = new TextEncoder().encode('a certificate’s request')
      const { kty, crv, x, y } = (await personOf(ana)).public
      const verifying = await crypto.subtle.importKey('jwk', { kty, crv, x, y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
      signed = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifying, await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, e.keys.privateKey, data), data)
      return { ...e, chain: ['TUlJQg=='] }
    }
    if (out.has(e.person?.account)) return { refuse: 'Kept apart.' }
    const phone = (await personOf(bobPhone)).mailbox
    return e.person ? { ...e, person: { ...e.person, devices: e.person.devices.filter((/** @type {any} */ one) => one.mailbox !== phone) } } : e
  }
  const ana = { ...profile('Ana'), check }
  await listed(ana, await personOf(ana), await idTokenOf())
  assert.equal(signed, true, 'the profile key signs, as ECDSA on its curve, what the controls ask')
  for (const [device, who] of /** @type {const} */ ([[bobLaptop, bob], [bobPhone, bob], [carols, carol]])) await listed(device, await personOf(device), await idTokenOf(who))
  const [anaListed] = await find(BASE, await personOf(bobLaptop), 'q=martin')
  assert.deepEqual(anaListed.devices.map((one) => one.chain), [['TUlJQg==']], 'the listing kept the certificate')

  const [found] = await find(BASE, await personOf(ana), 'q=dupont')
  assert.deepEqual((await vetted(ana, 'find', found))?.devices.map((one) => one.mailbox), [(await personOf(bobLaptop)).mailbox])
  await keep(ana, found)
  assert.deepEqual((await peopleOf(ana)).map((one) => one.mailbox), [(await personOf(bobLaptop)).mailbox], 'his laptop alone')
  const [carolFound] = await find(BASE, await personOf(ana), 'q=petit')
  assert.equal(await vetted(ana, 'find', carolFound), null)
  assert.equal(await reasonOf(keep(ana, carolFound)), 'refused')

  // Carol keeps Ana and writes first: Ana's Jean neither keeps her nor what she sent.
  const [anaFound] = await find(BASE, await personOf(carols), 'q=martin')
  await keep(carols, anaFound)
  await sendTo(carols, (await peopleOf(carols))[0].fp, { title: 'Hello', words: '', value: { file: '' } })
  const bytes = (await read(BASE, (await personOf(ana)).token)).messages.at(-1)?.bytes ?? new Uint8Array()
  assert.equal(await introduced(ana, await personOf(ana), bytes), false)
  assert.equal(await received(ana, bytes), null)

  // Bob kept, then kept out: nothing goes to him, and what he sends isn't kept.
  out.add('bob@acme.example')
  const bobFp = (await peopleOf(ana))[0].fp
  assert.equal(await reasonOf(sendTo(ana, bobFp, { title: 'x', words: '', value: {} })), 'refused')
  const [anaForBob] = await find(BASE, await personOf(bobLaptop), 'q=martin')
  await keep(bobLaptop, anaForBob)
  await sendTo(bobLaptop, (await peopleOf(bobLaptop))[0].fp, { title: 'From Bob', words: '', value: { file: '' } })
  const fromBob = (await read(BASE, (await personOf(ana)).token)).messages.at(-1)?.bytes ?? new Uint8Array()
  assert.equal((await received(ana, fromBob))?.kind, 'send')
  assert.deepEqual(await arrivalsOf(ana), [], 'heard, not kept')
  assert.deepEqual([...new Set(heard)].sort(), ['add', 'find', 'list', 'open', 'send'])
})

test('this profile is made a person once, even by two calls at once, its context running them alone: the one a listing names is the one kept', async () => {
  let queue = Promise.resolve()
  /** One at a time, as a Web Lock runs them across tabs. @template T @param {() => Promise<T>} run @returns {Promise<T>} */
  const alone = (run) => { const turn = queue.then(run); queue = turn.then(() => {}, () => {}); return turn }
  const ana = { ...profile('Ana'), alone }
  const [one, two] = await Promise.all([personOf(ana), personOf(ana)])
  assert.equal(one.mailbox, two.mailbox)
  assert.equal(JSON.parse(ana.secrets.person).mailbox, one.mailbox)
})
