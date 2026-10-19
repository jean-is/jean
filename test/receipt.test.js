// About this answer (D252): what its certificate says from the conversation's records, what the
// answer cost, and its seal (D274): a W3C credential sealed as a JWS, which standard tools check and no
// change survives, whose words and files are salted digests that only its proof discloses.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, X509Certificate, verify as verifyWith } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { foldTurns, envelope, userRecord, userRecords, metaRecord } from '../app/core/events.js'
import { brainsOf, madeOf, factsOf, costOf, certificate, seal, makeSeal, thumbprint, ISSUER, check, proof, compact, disclose, disclosuresOf, disclosed, witness, record, inLog, keyOf } from '../app/caps/receipt/certificate.js'
import { timestampRequest, tokenOf, readToken } from '../app/caps/receipt/der.js'
import { reply, logged, logKey } from './fixtures/tsa.js'
import { BRAND } from '../app/brand.js'
import { BRAIN, REVISION } from '../app/caps/brain-local/watermark.js'

const T0 = Date.parse('2026-10-10T09:00:00.000Z')
const at = (/** @type {number} */ ms) => new Date(T0 + ms).toISOString()
const PICTURE = createHash('sha256').update('a picture').digest('hex')
const SHARED = createHash('sha256').update('a shared file').digest('hex')
const CONVERSATION = '01M4N18BCYXJ5WQDF3TW1C43KC'
const VERSION = 'ca5970caf565'

/**
 * A request at T0, then a brain asked at each given time (ms), as the loop records it, a helper's
 * under its call; the answer ends at 5 s. @param {{ local: boolean, at: number, provider?: string, model?: string, parent?: string }[]} brains
 */
function turnWith(brains) {
  const records = [{ ...userRecord('What is on my calendar?', 'device'), at: at(0) }]
  for (const [step, brain] of brains.entries()) {
    const id = `brain-${step}-${(T0 + brain.at).toString(36)}`
    records.push({ ...envelope('jean', { sessionUpdate: 'tool_call', toolCallId: brain.parent ? `${brain.parent}/${id}` : id, title: '', kind: 'think', status: 'completed',
      rawInput: { provider: brain.provider ?? (brain.local ? 'ollama' : 'anthropic'), model: brain.model ?? 'm', local: brain.local },
      rawOutput: { stopReason: 'end', usage: { inputTokens: 1000, outputTokens: 200 } }, ...(brain.parent && { _meta: { parent: brain.parent } }) }, step), at: at(brain.at + 100) })
  }
  records.push({ ...envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Two meetings.' } }, 0), at: at(5000) })
  return { turn: foldTurns(records)[0], records }
}

/** What the page reached while answering, kept as the receipt keeps it. @param {number} from @param {number} to @param {Record<string, number>} hosts */
const reached = (from, to, hosts) => metaRecord('device', { reached: { from: at(from), to: at(to), hosts } }).meta.reached

test('each brain asked, its helpers’ too, with when it was asked and whether it ran here', () => {
  const { turn } = turnWith([{ local: true, at: 1000 }, { local: false, at: 2000, parent: 'call-1' }])
  assert.deepEqual(brainsOf(turn).map(({ provider, local, started, input }) => ({ provider, local, started, input })), [
    { provider: 'ollama', local: true, started: T0 + 1000, input: 1000 },
    { provider: 'anthropic', local: false, started: T0 + 2000, input: 1000 },
  ])
})

test('done on this device only when its brains ran here and the browser recorded nothing sent elsewhere', () => {
  const { turn } = turnWith([{ local: true, at: 1000 }])
  const facts = factsOf(turn, [reached(500, 5500, { 'localhost:11434': 2 })])
  assert.equal(facts.verdict, 'local')
  // From the first request to a brain to the answer's end.
  assert.equal(facts.ms, 4000)
  assert.deepEqual(facts.outside, [])
  // Another conversation's record, from before this request, isn't this answer's.
  assert.equal(factsOf(turn, [reached(-9000, -8000, {})]).verdict, 'unknown')
})

test('sent outside by a brain in the cloud, or by any address outside this device', () => {
  assert.equal(factsOf(turnWith([{ local: false, at: 1000 }]).turn, [reached(500, 5500, {})]).verdict, 'out')
  const facts = factsOf(turnWith([{ local: true, at: 1000 }]).turn, [reached(500, 5500, { 'en.wikipedia.org': 1, '127.0.0.1:1234': 1 })])
  assert.equal(facts.verdict, 'out')
  assert.deepEqual(facts.outside, ['en.wikipedia.org'])
  // Without the browser's record, a brain in the cloud is enough to know.
  assert.equal(factsOf(turnWith([{ local: false, at: 1000 }]).turn, []).verdict, 'out')
  // A site the browser beside the conversation was asked to show, which its frame loads out of the page's record; one on this computer stays here.
  for (const [url, outside] of [['https://news.example.com/today', ['news.example.com']], ['http://localhost:5173/', []]]) {
    const { records } = turnWith([{ local: true, at: 1000 }])
    records.splice(2, 0, { ...envelope('jean', { sessionUpdate: 'tool_call', toolCallId: 'c1', title: url, name: 'browse', kind: 'fetch', status: 'completed', rawInput: { url } }, 1), at: at(1500) })
    assert.deepEqual(factsOf(foldTurns(records)[0], [reached(500, 5500, {})]).outside, outside)
  }
})

test('not certified when the browser’s record misses a request to a brain', () => {
  const { turn } = turnWith([{ local: true, at: 1000 }, { local: true, at: 3000 }])
  assert.equal(factsOf(turn, []).verdict, 'unknown')
  // The page closed during the answer, which went on later (D212): only the second part was recorded.
  assert.equal(factsOf(turn, [reached(2500, 5500, {})]).verdict, 'unknown')
  // Two runs of one answer, each recorded.
  assert.equal(factsOf(turn, [reached(500, 2000, {}), reached(2500, 5500, {})]).verdict, 'local')
})

test('the time is the answer’s, from when it was last asked for, a helper’s first step not counting', () => {
  // Try again a minute after the request, kept with its first time (D188): the answer is written in 2 s.
  const { records } = turnWith([{ local: true, at: 60_000 }, { local: true, at: 61_000, parent: 'call-1' }])
  records.push({ ...envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '.' } }, 0), at: at(62_000) })
  assert.equal(factsOf(foldTurns(records)[0], []).ms, 2000)
  // A run that asked no brain (a flow's one call, D218): from the request.
  assert.equal(factsOf(foldTurns(turnWith([]).records)[0], []).ms, 5000)
})

test('free on this device, priced in the cloud, not known without a price', () => {
  const brains = brainsOf(turnWith([{ local: true, at: 1000 }, { local: false, at: 2000 }]).turn)
  assert.equal(costOf(brains.slice(0, 1), () => undefined), 0)
  assert.equal(costOf(brains, () => ({ prompt: 3e-6, completion: 15e-6 })), 1000 * 3e-6 + 200 * 15e-6)
  assert.equal(costOf(brains, () => undefined), null)
  assert.equal(costOf(brains, () => ({ prompt: NaN, completion: NaN })), null)
  // What is read again from the cache, at its own price when there is one (D255).
  const cached = brains.map((brain) => ({ ...brain, cached: 800 }))
  assert.equal(costOf(cached.slice(1), () => ({ prompt: 3e-6, completion: 15e-6, cacheRead: 0.3e-6 })), 200 * 3e-6 + 800 * 0.3e-6 + 200 * 15e-6)
  assert.equal(costOf(cached.slice(1), () => ({ prompt: 3e-6, completion: 15e-6 })), 1000 * 3e-6 + 200 * 15e-6)
})

test('who made a picture or a film, and where: on this device by its own name, or a provider in the cloud, which sends the answer out (D263)', async () => {
  const picture = (/** @type {number} */ step, /** @type {object} */ made) => ({ ...envelope('jean', { sessionUpdate: 'tool_call', toolCallId: `c${step}`, title: 'A picture', name: 'picture', kind: 'edit', status: 'completed',
    _meta: { picture: { uri: `files/sha256-${PICTURE}.png`, name: 'p.png', mimeType: 'image/png' }, made } }, step), at: at(1500) })
  const here = { kind: 'picture', provider: 'device', model: 'Z-Image-Turbo', local: true }
  const { records } = turnWith([{ local: true, at: 1000 }])
  records.splice(2, 0, picture(1, here))
  const turn = foldTurns(records)[0]
  assert.deepEqual(madeOf(turn), [{ ...here, sha256: PICTURE }])
  const facts = factsOf(turn, [reached(500, 5500, {})])
  assert.equal(facts.verdict, 'local')
  const { credential } = await certificate({ facts, turn, text: '', conversation: CONVERSATION, origin: 'https://jean.is', version: VERSION })
  assert.deepEqual(credential.credentialSubject.made.map(({ _sd, ...rest }) => rest), [{ kind: 'picture', digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia', provider: 'device', model: 'Z-Image-Turbo', local: true }])
  const cloud = { kind: 'picture', provider: 'openai', model: 'gpt-image-1.5', local: false }
  records.splice(2, 1, picture(1, cloud))
  assert.equal(factsOf(foldTurns(records)[0], [reached(500, 5500, {})]).verdict, 'out')
})

// ─── The certificate in standard forms (D274) ────────────────────────────────

const GENERATED = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
const schema = JSON.parse(readFileSync(new URL('../app/caps/receipt/certificate.schema.json', import.meta.url), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strictTypes: false })
ajv.addFormat('date-time', (text) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(text) && !Number.isNaN(Date.parse(text)))
ajv.addFormat('uri', (text) => URL.canParse(text))
ajv.addSchema(schema)
/** True, or why not. @param {string} part one of the schema's $defs @param {unknown} value */
const valid = (part, value) => ajv.validate(`${schema.$id}#/$defs/${part}`, value) || ajv.errorsText()
/** @param {string} part base64url JSON */
const decoded = (part) => JSON.parse(Buffer.from(part, 'base64url').toString())
/** @param {unknown} value */
const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
/** @param {string} hex */
const sri = (hex) => `sha256-${Buffer.from(hex, 'hex').toString('base64')}`
const madeHere = { kind: 'picture', provider: 'device', model: 'Z-Image-Turbo', revision: 'webnn/Z-Image-Turbo@02e1d8cc5d10d9ff6c7ed1f54b173bd981381bc2', local: true }

/** An answer done here whose request shared a file and which made a picture on this device. */
function answered() {
  const { records } = turnWith([{ local: true, at: 1000 }])
  const link = { type: /** @type {const} */ ('resource_link'), uri: `files/sha256-${SHARED}.pdf`, name: 'agenda.pdf', mimeType: 'application/pdf' }
  records.splice(0, 1, ...userRecords('What is on my calendar?', [link], 'device').map((record) => ({ ...record, at: at(0) })))
  records.splice(3, 0, { ...envelope('jean', { sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'A picture', name: 'picture', kind: 'edit', status: 'completed',
    _meta: { picture: { uri: `files/sha256-${PICTURE}.png`, name: 'p.png', mimeType: 'image/png' }, made: madeHere } }, 1), at: at(1500) })
  const turn = foldTurns(records)[0]
  return { turn, facts: factsOf(turn, [reached(500, 5500, {})]) }
}

/** Its certificate, sealed with a seal. @param {import('../app/caps/receipt/certificate.js').Seal} own */
async function sealedAnswer(own, text = 'Two meetings.') {
  const { turn, facts } = answered()
  const made = await certificate({ facts, turn, text, conversation: CONVERSATION, origin: 'https://jean.is', version: VERSION, now: new Date(T0 + 6000) })
  return { turn, facts, text, ...made, sealed: await seal(made.credential, own, new Date(T0 + 6000)) }
}

/** Every digest a certificate holds, its words' and its files'. @param {any} credential @returns {string[]} */
const digestsOf = ({ credentialSubject: { request, answer, made } }) => [request._sd[0], answer._sd[0], ...request.files.map((/** @type {any} */ one) => one['...']), ...made.map((/** @type {any} */ one) => one._sd[0])]

test('a certificate is a W3C credential sealed as a JWS, which standard tools check, as its schema says', async () => {
  const own = await makeSeal(new Date(T0))
  const { sealed, credential } = await sealedAnswer(own)
  assert.equal(valid('certificateFile', JSON.parse(JSON.stringify(sealed, null, 2))), true)
  const header = decoded(sealed.protected)
  assert.equal(valid('protectedHeader', header), true)
  const says = decoded(sealed.payload)
  assert.equal(valid('credential', says), true)
  assert.deepEqual(says, { ...credential, issuer: says.issuer })
  assert.equal(credential.credentialSubject.answer.digitalSourceType, GENERATED)
  // Node's own X.509 and ECDSA, not Jean's code, check the certificate and the signature.
  const der = Buffer.from(header.x5c[0], 'base64')
  const x509 = new X509Certificate(der)
  assert.equal(x509.verify(x509.publicKey), true)
  assert.equal(x509.ca, false)
  assert.ok(Date.parse(x509.validFrom) <= header.iat * 1000 && header.iat * 1000 <= Date.parse(x509.validTo))
  assert.equal(header['x5t#S256'], createHash('sha256').update(der).digest('base64url'))
  assert.equal(verifyWith('sha256', Buffer.from(`${sealed.protected}.${sealed.payload}`), { key: x509.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sealed.signature, 'base64url')), true)
  // Its issuer, which the seal names, is the RFC 7638 thumbprint of that key, as Node reckons it, and so is the certificate's name.
  const { crv, kty, x, y } = x509.publicKey.export({ format: 'jwk' })
  const print = createHash('sha256').update(JSON.stringify({ crv, kty, x, y })).digest('base64url')
  assert.equal(says.issuer, ISSUER + print)
  assert.equal(x509.subject, `O=${BRAND.name}\nCN=${print}`)
  const checked = await check({ certificate: sealed })
  assert.deepEqual([checked.intact, checked.fingerprint, checked.selfIssued], [true, print, true])
  assert.equal(checked.says.credentialSubject.where, 'device')
  assert.equal(checked.says.credentialSubject.made[0].revision, madeHere.revision)
})

test('the device’s brain is named at the revision Jean pins, as its pictures’ makers are', async () => {
  const { turn } = turnWith([{ local: true, at: 1000, provider: 'device', model: BRAIN }, { local: true, at: 2000 }])
  const { credential } = await certificate({ facts: factsOf(turn, [reached(500, 5500, {})]), turn, text: '', conversation: CONVERSATION, origin: 'https://jean.is', version: VERSION })
  assert.deepEqual(credential.credentialSubject.brains.map((brain) => brain.revision), [`${BRAIN}@${REVISION}`, undefined])
})

test('where it was done is salted too: a proof shows each address back in its place, or withholds them all (D361)', async () => {
  const own = await makeSeal(new Date(T0))
  const { turn } = turnWith([{ local: false, at: 1000 }])
  const facts = factsOf(turn, [reached(500, 5500, { 'gateway.corp.example': 3 })])
  const made = await certificate({ facts, turn, text: 'Two meetings.', conversation: CONVERSATION, origin: 'https://jean.corp.example',
    version: VERSION, placed: () => ({ host: 'ai.corp.example', jurisdiction: 'FR' }), now: new Date(T0 + 6000) })
  const sealed = await seal(made.credential, own, new Date(T0 + 6000))
  assert.equal(valid('credential', decoded(sealed.payload)), true)
  for (const address of ['corp.example', 'jean.corp', 'gateway']) assert.doesNotMatch(sealed.payload + JSON.stringify(made.credential), new RegExp(address))
  assert.equal(made.credential.credentialSubject.brains[0].jurisdiction, 'FR')
  // The whole proof shows them back where they were.
  const whole = await check({ proof: proof(sealed, made.disclosures) })
  assert.equal(whole.proven, true)
  assert.equal(whole.says.credentialSubject.brains[0].host, 'ai.corp.example')
  assert.deepEqual(whole.says.evidence[0].hosts, { 'gateway.corp.example': 3 })
  assert.equal(whole.says.credentialSubject.jean.origin, 'https://jean.corp.example')
  // A share's discloses the words alone: it still proves them, and names no address.
  const words = made.disclosures.filter((disclosure) => !made.places.includes(disclosure))
  const shared = await check({ proof: proof(sealed, words) })
  assert.deepEqual([shared.intact, shared.proven, shared.words?.answer], [true, true, 'Two meetings.'])
  assert.equal(shared.says.credentialSubject.brains[0].host, undefined)
  assert.equal(shared.says.evidence[0].hosts, undefined)
})

test('its words and files are salted digests: no guess confirms them, and only its proof discloses them', async () => {
  const own = await makeSeal(new Date(T0))
  const first = await sealedAnswer(own)
  const saved = JSON.stringify(first.sealed) + JSON.stringify(first.credential)
  for (const word of ['calendar', 'meetings', 'agenda', 'sha256-', PICTURE, SHARED]) assert.doesNotMatch(saved, new RegExp(word))
  // The request's plain SHA-256 is none of its digests, and another certificate of the same answer shares none.
  assert.ok(!digestsOf(first.credential).includes(createHash('sha256').update('What is on my calendar?').digest('base64url')))
  const second = await sealedAnswer(own)
  assert.deepEqual(digestsOf(first.credential).filter((digest) => digestsOf(second.credential).includes(digest)), [])
  const salts = [first.salts.request, first.salts.answer, ...first.salts.files, ...first.salts.made]
  assert.equal(salts.length, 4)
  assert.ok(salts.every((salt) => /^[\w-]{22}$/.test(salt)))
  assert.equal(new Set(salts).size, salts.length)
  // What the conversation keeps, and the proof, follow the schema; the same salts make the same disclosures.
  assert.equal(valid('kept', { id: first.credential.id, jws: compact(first.sealed), salts: first.salts, places: first.places }), true)
  assert.deepEqual([...disclosed(await disclosuresOf(first.salts, { turn: first.turn, text: first.text, made: first.facts.made })), ...first.places], first.disclosures)
  assert.ok(first.places.map(decoded).every((place) => valid('placeDisclosure', place) === true))
  const shown = proof(first.sealed, first.disclosures)
  assert.equal(valid('proof', shown), true)
  const [request, answer, file, made] = first.disclosures.map(decoded)
  assert.deepEqual([valid('textDisclosure', request), valid('textDisclosure', answer), valid('fileDisclosure', file), valid('madeDisclosure', made)], [true, true, true, true])
  const proven = await check({ certificate: first.sealed, proof: shown })
  assert.equal(proven.proven, true)
  assert.deepEqual(proven.words, { request: 'What is on my calendar?', answer: 'Two meetings.', files: [sri(SHARED)], made: [sri(PICTURE)] })
  // The proof alone carries the certificate.
  assert.equal((await check({ proof: shown })).intact, true)
  // A word changed, or the proof of another certificate, proves nothing.
  const changed = await disclose(first.salts.answer, 'text', 'Three meetings.')
  assert.equal((await check({ certificate: first.sealed, proof: proof(first.sealed, [first.disclosures[0], changed.disclosure]) })).proven, false)
  assert.equal((await check({ certificate: second.sealed, proof: shown })).proven, false)
  // A salt short of 128 bits proves nothing, even where the issuer signed its digest.
  const short = await disclose('AAAAAAAAAAA', 'text', 'Two meetings.')
  const weak = structuredClone(first.credential)
  weak.credentialSubject.answer._sd = [short.digest]
  const weakly = await seal(weak, own, new Date(T0 + 6000))
  assert.equal((await check({ certificate: weakly, proof: proof(weakly, [short.disclosure]) })).proven, false)
  assert.notEqual(valid('textDisclosure', decoded(short.disclosure)), true)
})

test('no change survives its seal, and another key shows as another fingerprint', async () => {
  const own = await makeSeal(new Date(T0))
  const other = await makeSeal(new Date(T0))
  const { sealed, credential } = await sealedAnswer(own)
  const says = decoded(sealed.payload)
  says.credentialSubject.where = 'cloud'
  const header = decoded(sealed.protected)
  const flipped = Buffer.from(sealed.signature, 'base64url')
  flipped[0] ^= 1
  for (const changed of [{ payload: encoded(says) }, { protected: encoded({ ...header, iat: header.iat + 1 }) }, { signature: flipped.toString('base64url') }]) {
    assert.equal((await check({ certificate: { ...sealed, ...changed } })).intact, false)
  }
  // Sealed again by another key, it holds, but names that key, never this device's.
  const resealed = await seal(credential, other, new Date(T0 + 6000))
  const forged = await check({ certificate: resealed })
  assert.deepEqual([forged.intact, forged.says.issuer], [true, ISSUER + forged.fingerprint])
  assert.notEqual(forged.fingerprint, await thumbprint(own.keys.publicKey))
  // Another key under this device's name, or a time before its certificate, doesn't hold.
  const payload = encoded({ ...decoded(resealed.payload), issuer: ISSUER + await thumbprint(own.keys.publicKey) })
  const signature = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, other.keys.privateKey, Buffer.from(`${resealed.protected}.${payload}`))).toString('base64url')
  assert.equal((await check({ certificate: { ...resealed, payload, signature } })).intact, false)
  assert.equal((await check({ certificate: await seal(credential, own, new Date(T0 - 86_400_000)) })).intact, false)
  await assert.rejects(check({ certificate: { protected: 'e30', payload: 'e30', signature: 'AA' } }))
  await assert.rejects(check({ proof: 'not a proof' }))
})

// ─── Witnesses (D276) ────────────────────────────────────────────────────────

test('witnesses date a certificate on its signature and a public log records it, as JAdES and Sigstore keep them (D276)', async () => {
  const own = await makeSeal(new Date(T0))
  const { sealed } = await sealedAnswer(own)
  const dated = await witness(await witness(sealed, (request) => reply(request)), (request) => reply(request))
  assert.equal(dated.header?.etsiU.length, 2)
  const recorded = await record(dated, logged)
  assert.equal(valid('certificateFile', JSON.parse(JSON.stringify(recorded))), true)
  const checked = await check({ certificate: recorded }, { logKey })
  assert.equal(checked.intact, true)
  assert.deepEqual(checked.timestamps.map(({ intact, authority }) => [intact, authority['2.5.4.3']]), [[true, 'Test TSA'], [true, 'Test TSA']])
  assert.deepEqual([checked.log?.intact, checked.log?.checked], [true, true])
  // The bundle carries the same tokens, and the certificate's digest and signature, which Node checks.
  const bundle = /** @type {any} */ (recorded.sigstore)
  assert.deepEqual(bundle.verificationMaterial.timestampVerificationData.rfc3161Timestamps.map((/** @type {any} */ one) => one.signedTimestamp), dated.header?.etsiU.map((/** @type {any} */ one) => one.sigTst.tstTokens[0].val))
  const signingInput = Buffer.from(`${sealed.protected}.${sealed.payload}`)
  assert.equal(Buffer.from(bundle.messageSignature.messageDigest.digest, 'base64').toString('hex'), createHash('sha256').update(signingInput).digest('hex'))
  const x509 = new X509Certificate(Buffer.from(bundle.verificationMaterial.certificate.rawBytes, 'base64'))
  assert.equal(verifyWith('sha256', signingInput, x509.publicKey, Buffer.from(bundle.messageSignature.signature, 'base64')), true)
  // Without the log's key its promise isn't checked, nor with a key that isn't its log's; a promise changed doesn't hold.
  assert.equal((await check({ certificate: recorded })).log?.checked, false)
  const other = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])).publicKey
  assert.deepEqual([(await check({ certificate: recorded }, { logKey: other })).log?.checked, (await check({ certificate: recorded }, { logKey: other })).log?.intact], [false, true])
  const entry = bundle.verificationMaterial.tlogEntries[0]
  const forged = { ...recorded, sigstore: { ...bundle, verificationMaterial: { ...bundle.verificationMaterial, tlogEntries: [{ ...entry, integratedTime: String(Number(entry.integratedTime) - 86_400) }] } } }
  assert.deepEqual([(await check({ certificate: forged }, { logKey })).log?.checked, (await check({ certificate: forged }, { logKey })).log?.intact], [true, false])
  // A token on another signature dates nothing here, and a witness that answers something else isn't kept.
  const another = await sealedAnswer(own)
  assert.deepEqual((await check({ certificate: { ...another.sealed, header: dated.header } })).timestamps.map(({ intact }) => intact), [false, false])
  await assert.rejects(witness(sealed, () => reply(timestampRequest(new Uint8Array(32), Uint8Array.of(9)))))
  // A real token from Sigstore's public authority reads as it should.
  const real = await readToken(tokenOf(readFileSync(new URL('./fixtures/sigstore.tsr', import.meta.url))))
  assert.deepEqual([real.intact, real.authority?.['2.5.4.3']], [true, 'sigstore-tsa'])
})

test('a public log vouches for an entry by its key alone: its promise, and its inclusion proof up to a checkpoint it signed (RFC 6962, D276)', async () => {
  const { sealed } = await sealedAnswer(await makeSeal(new Date(T0)))
  /** A log's answer, as the certificate's bundle keeps it. @param {any} answer */
  const entryOf = async (answer) => /** @type {any} */ (await record(sealed, async () => answer)).sigstore.verificationMaterial.tlogEntries[0]
  // Sigstore's Rekor, for real: an entry in a shard whose tree passes 2³¹ leaves, its checkpoint signed by the log's key.
  const { publicKey, answer } = JSON.parse(readFileSync(new URL('./fixtures/rekor.json', import.meta.url), 'utf8'))
  const real = await entryOf(answer)
  const key = await keyOf(publicKey)
  assert.equal(await inLog(real, key), true)
  // The test log's entries, each proof up to the root its tree had then, as it grows.
  const entries = []
  for (let i = 0; i < 4; i++) entries.push(await entryOf(await logged({ kind: 'hashedrekord', i })))
  assert.deepEqual(await Promise.all(entries.map((one) => inLog(one, logKey))), [true, true, true, true])
  // A path's hashes swapped, another leaf's place, a checkpoint naming another size, or signed by another key: none holds.
  const proof = real.inclusionProof
  /** @param {object} changed */
  const with_ = (changed) => inLog({ ...real, inclusionProof: { ...proof, ...changed } }, key)
  assert.equal(await with_({ hashes: [proof.hashes[1], proof.hashes[0], ...proof.hashes.slice(2)] }), false)
  assert.equal(await with_({ logIndex: String(Number(proof.logIndex) + 1) }), false)
  assert.equal(await with_({ checkpoint: { envelope: proof.checkpoint.envelope.replace(/\n(\d+)\n/, (/** @type {string} */ _, /** @type {string} */ size) => `\n${Number(size) + 1}\n`) } }), false)
  assert.equal(await inLog({ ...entries[0], inclusionProof: { ...entries[0].inclusionProof, checkpoint: real.inclusionProof.checkpoint } }, logKey), false)
  // Without a key, or with one that isn't this log's, it says nothing.
  assert.deepEqual([await inLog(real, null), await inLog(real, logKey)], [null, null])
})
