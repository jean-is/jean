// What an answer's certificate says (D252), from the conversation's records alone: how long the
// answer took, each brain asked and whether it ran on this device, who made its pictures and films
// and where (D263), and what the page reached while the answer was written, as the browser recorded it.
// Saved in standard forms (D274): a W3C Verifiable Credential whose words and files are salted SD-JWT
// disclosures (RFC 9901), so its digests confirm no guess, sealed as a JWS (RFC 7515) in JAdES's
// baseline (ETSI TS 119 182-1) by the device's key and the X.509 certificate that key issued itself;
// the proof carries the disclosures, for whoever may read the words. check() reads either, and
// certificate.schema.json describes both. No DOM, so it is tested with node --test.
import { selfIssued, signOf, readCertificate, derSignature, p1363, timestampRequest, tokenOf, readToken } from './der.js'

/** @import { Turn } from '../../core/events.js' */
/** @import { ModelInfo } from '../../core/types.js' */

/**
 * A brain asked for the answer: when (ms), whether it ran on this device, and whether it was the first
 * of a run, as when the request is sent, or answered again (Try again, Duplicate from here, D188, D230).
 * @typedef {{ provider: string, model: string, local: boolean, started: number, first: boolean, ms?: number, input: number, output: number, cached: number }} Brain
 * Who made a picture or a film of the answer, and whether on this device (`_meta.made`, D263), with the
 * weights' revision when Jean pins one and the SHA-256 of the file made (its name in the project's files).
 * @typedef {{ kind: 'picture' | 'film', provider: string, model: string, local: boolean, revision?: string, sha256: string }} Maker
 * What the page reached while a conversation was answered, by address and number of requests, as
 * its browser recorded them, kept in the conversation once the answer ends (`meta.reached`).
 * @typedef {{ from: string, to: string, hosts: Record<string, number> }} Reached
 * Recorded: the browser's record covers every request to a brain. The verdict: done on this device,
 * sent outside it, or not known.
 * @typedef {{ ms: number, brains: Brain[], made: Maker[], reached: Reached[], outside: string[], recorded: boolean, verdict: 'local' | 'out' | 'unknown' }} Facts
 * Where a brain or a maker outside this device was reached, and in which country, when settings say.
 * @typedef {{ host?: string, jurisdiction?: string }} Placed
 * The device's seal: its key pair, and the certificate (DER) that key issued itself; or, where the organisation's
 * authority certified that key (D434, ee/), its certificate and the chain above it, but its root; or a key a qualified
 * provider holds for the organisation (D436, ee/), its public half, and `sign`, which has the provider sign (ES256, P1363).
 * @typedef {{ keys: CryptoKeyPair, certificate: Uint8Array, chain?: Uint8Array[], sign?: (data: Uint8Array) => Promise<Uint8Array> }} Seal
 * A sealed certificate, as saved: a JWS in flattened JSON, with what witnesses add.
 * @typedef {{ protected: string, payload: string, signature: string, header?: { etsiU: object[] }, sigstore?: object }} Sealed
 * The salts of a certificate's disclosures, kept in the conversation (`meta.certificate`) for its proof.
 * @typedef {{ request: string, answer: string, files: string[], made: string[] }} Salts
 * Where it was done, disclosures too, which a proof may withhold (a share's does, D361): Jean's address,
 * each brain's and maker's outside this device, what the page reached. Kept whole beside the salts.
 * @typedef {string[]} Places
 * What check() found: the seal's state, who sealed it and when, what it says, with a proof the words, and where
 * the organisation names authorities it trusts, whether one vouches for the seal's key (D434, ee/).
 * @typedef {{ intact: boolean, fingerprint: string, selfIssued: boolean, subject: Record<string, string>, issuer: Record<string, string>, at: Date, says: any, timestamps: { at: Date | null, authority: Record<string, string>, intact: boolean }[], log: { index: number, at: Date, intact: boolean, checked: boolean } | null, trust?: Trust, proven?: boolean, words?: { request?: string, answer?: string, files: string[], made: string[] } }} Reading
 * Whether an authority the organisation trusts vouches for the seal's key, and shows it unrevoked when it sealed.
 * @typedef {{ status: 'trusted' | 'unchecked' | 'untrusted' | 'revoked', name: string }} Trust
 */

/** This device itself, by name or address. */
const HERE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

/** Every brain asked for the answer, its helpers' too. @param {Turn} turn @returns {Brain[]} */
export const brainsOf = (turn) => turn.steps.flatMap((step) => step.tools).flatMap(({ name, kind, toolCallId, rawInput, rawOutput, _meta }) => (!name && kind === 'think' && rawInput?.provider ? [{
  provider: rawInput.provider, model: rawInput.model, local: rawInput.local === true, started: parseInt(/brain-\d+-(\w+)$/.exec(toolCallId)?.[1] ?? '', 36), first: /^brain-0-/.test(toolCallId),
  ms: _meta?.ms, input: rawOutput?.usage?.inputTokens ?? 0, output: rawOutput?.usage?.outputTokens ?? 0, cached: rawOutput?.usage?.cacheReadTokens ?? 0,
}] : []))

/** A file's SHA-256 from its name in the project's files (`files/sha256-<hex>.<ext>`). @param {string} [uri] */
const sha256Of = (uri) => /sha256-([0-9a-f]{64})/.exec(uri ?? '')?.[1] ?? ''

/** The SHA-256 of each file the request shared that the project's files hold. @param {Turn} turn */
const sharedOf = (turn) => (turn.user?.files ?? []).map(({ uri }) => sha256Of(uri)).filter(Boolean)

/** Who made the answer's pictures and films, its helpers' too, and which file each made. @param {Turn} turn @returns {Maker[]} */
export const madeOf = (turn) => turn.steps.flatMap((step) => step.tools).flatMap(({ _meta }) => (_meta?.made ? [{ ..._meta.made, sha256: sha256Of(_meta.picture?.uri) }] : []))

/** The host of a web address, if it is one. @param {unknown} url @returns {string[]} */
const hostOf = (url) => { try { const { protocol, host } = new URL(String(url)); return /^https?:$/.test(protocol) ? [host] : [] } catch { return [] } }

/**
 * What a turn's certificate says. A brain in the cloud, a picture or film made there, or an address
 * outside this device, sends it out: one the page reached, or one a call was asked to reach, which a frame may load where the
 * page's record can't see (the browser's `browse`). Otherwise it was done here only if the browser's record covers it.
 * @param {Turn} turn @param {Reached[]} all the conversation's @returns {Facts}
 */
export function factsOf(turn, all) {
  const end = turn.end ?? turn.at
  const brains = brainsOf(turn)
  const made = madeOf(turn)
  const reached = all.filter(({ from }) => from >= turn.at && from <= end)
  const asked = turn.steps.flatMap((step) => step.tools).flatMap(({ name, rawInput }) => (name && rawInput?.url ? hostOf(rawInput.url) : []))
  const outside = [...new Set([...reached.flatMap(({ hosts }) => Object.keys(hosts)), ...asked])].filter((host) => !HERE.test(host))
  const recorded = reached.length > 0 && brains.every(({ started }) => reached.some(({ from, to }) => Date.parse(from) <= started && started <= Date.parse(to)))
  const verdict = outside.length || [...brains, ...made].some((one) => !one.local) ? 'out' : recorded ? 'local' : 'unknown'
  // How long it took to write, from when it was last asked for: the request kept its first time.
  const since = Math.max(Date.parse(turn.at), ...brains.flatMap(({ first, started }) => (first ? [started] : [])))
  return { ms: Date.parse(end) - since, brains, made, reached, outside, recorded, verdict }
}

/**
 * What the answer cost in dollars, from its brains' prices per token, what they read again from the
 * cache at its own price when it has one: nothing on this device, null when a price isn't known.
 * @param {Brain[]} brains @param {(brain: Brain) => ModelInfo['pricing']} priceOf
 */
export function costOf(brains, priceOf) {
  let cost = 0
  for (const brain of brains.filter((one) => !one.local)) {
    const { prompt = NaN, completion = NaN, cacheRead = prompt } = priceOf(brain) ?? {}
    cost += (brain.input - brain.cached) * prompt + brain.cached * cacheRead + brain.output * completion
  }
  return Number.isNaN(cost) ? null : cost
}

// ─── The certificate, its seal and its proof (D274) ──────────────────────────

const SIGNING = { name: 'ECDSA', hash: 'SHA-256' }
const P256 = { name: 'ECDSA', namedCurve: 'P-256' }
/** RFC 9278's URI of a key's RFC 7638 thumbprint, the certificate's issuer. */
export const ISSUER = 'urn:ietf:params:oauth:jwk-thumbprint:sha-256:'
/** IPTC's Digital Source Type for what a trained model made, as C2PA and the AI Act's code of practice name it. */
const GENERATED = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'

/** @param {string} text */
const encode = (text) => new TextEncoder().encode(text)
/** @param {Uint8Array} bytes */
const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes)))
/** @param {Uint8Array} bytes */
const base64 = (bytes) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
/** @param {Uint8Array} bytes */
const base64url = (bytes) => base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** Base64 or base64url, padded or not. @param {string} text */
const bytesOf = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))
/** @param {string} text @returns {any} */
const json = (text) => JSON.parse(new TextDecoder().decode(bytesOf(text)))
/** @param {Uint8Array} bytes */
const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
/** @param {string} text */
const fromHex = (text) => Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16))
/** A SHA-256 in hexadecimal, in Subresource Integrity's form, as Verifiable Credentials write digests. @param {string} hex */
const sri = (hex) => `sha256-${base64(Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16)))}`
/** 128 random bits, base64url: a disclosure's salt, which RFC 9901 asks to be unique and unguessable. */
const salt = () => base64url(crypto.getRandomValues(new Uint8Array(16)))

/** RFC 7638's thumbprint of a P-256 key, base64url. @param {CryptoKey} key */
export async function thumbprint(key) {
  const { crv, kty, x, y } = await crypto.subtle.exportKey('jwk', key)
  return base64url(await sha256(encode(JSON.stringify({ crv, kty, x, y }))))
}

/** A seal for this device: a key that never leaves it, and the certificate it issues itself. @param {Date} [now] @returns {Promise<Seal>} */
export async function makeSeal(now) {
  const keys = await crypto.subtle.generateKey(P256, false, ['sign', 'verify'])
  return { keys, certificate: await selfIssued(keys, await thumbprint(keys.publicKey), now) }
}

/** A salted disclosure (RFC 9901 4.2) and the digest that stands for it in the certificate. @param {string} salted @param {...unknown} claim */
export async function disclose(salted, ...claim) {
  const disclosure = base64url(encode(JSON.stringify([salted, ...claim])))
  return { disclosure, digest: base64url(await sha256(encode(disclosure))) }
}

/**
 * What a certificate discloses, in order: the request's text, the answer's, each file the request
 * shared and each one its makers made, each by its salt. @param {Salts} salts @param {{ turn: Turn, text: string, made: Maker[] }} answer
 */
export async function disclosuresOf(salts, { turn, text, made }) {
  return {
    request: await disclose(salts.request, 'text', turn.user?.text ?? ''),
    answer: await disclose(salts.answer, 'text', text),
    files: await Promise.all(sharedOf(turn).map((hex, i) => disclose(salts.files[i], sri(hex)))),
    made: await Promise.all(made.map((one, i) => disclose(salts.made[i], 'digestSRI', sri(one.sha256)))),
  }
}

/** All of them, as a proof carries them. @param {Awaited<ReturnType<typeof disclosuresOf>>} all */
export const disclosed = ({ request, answer, files, made }) => [request, answer, ...files, ...made].map(({ disclosure }) => disclosure)

/**
 * The certificate as saved, before its seal names its issuer: a W3C VC 2.0 of what the answer was, its words and files
 * salted digests only, with the salts the conversation keeps for its proof; and where it was done,
 * salted too, a proof showing it or not (`places`).
 * @param {{ facts: Facts, turn: Turn, text: string, conversation: string, origin: string, version: string, placed?: (provider: string) => Placed, now?: Date }} options
 */
export async function certificate({ facts, turn, text, conversation, origin, version, placed = () => ({}), now = new Date() }) {
  const salts = { request: salt(), answer: salt(), files: sharedOf(turn).map(salt), made: facts.made.map(salt) }
  const { request, answer, files, made } = await disclosuresOf(salts, { turn, text, made: facts.made })
  const cloud = facts.brains.some((brain) => !brain.local)
  /** @type {Places} */
  const places = []
  /** An address as a disclosure of its own, its digest in its place. @param {string} name @param {unknown} value */
  const place = async (name, value) => {
    const { disclosure, digest } = await disclose(salt(), name, value)
    places.push(disclosure)
    return digest
  }
  /** Where a brain or a maker was reached: its country as it is, its address salted. @param {{ provider: string }} one */
  const where = async ({ provider }) => {
    const { host, jurisdiction } = provider === 'device' ? /** @type {Placed} */ ({}) : placed(provider)
    return { ...(jurisdiction && { jurisdiction }), ...(host && { _sd: [await place('host', host)] }) }
  }
  const brains = []
  for (const { provider, model, local, ms, input, output, cached } of facts.brains) brains.push({ provider, model, local, ...await where({ provider }), ...(ms !== undefined && { ms }), input, output, cached })
  const makers = []
  for (const [i, { kind, provider, model, revision, local }] of facts.made.entries()) {
    const { _sd = [], ...rest } = await where({ provider })
    makers.push({ kind, digitalSourceType: GENERATED, provider, model, ...(revision && { revision }), local, ...rest, _sd: [made[i].digest, ..._sd] })
  }
  const evidence = []
  for (const { from, to, hosts } of facts.reached) evidence.push({ type: ['ResourceTimingRecord'], from, to, _sd: [await place('hosts', hosts)] })
  const credential = {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiableCredential', 'AnswerCertificate'],
    id: `urn:uuid:${crypto.randomUUID()}`,
    validFrom: now.toISOString(),
    _sd_alg: 'sha-256',
    credentialSubject: {
      conversation,
      where: facts.verdict === 'local' ? 'device' : cloud ? 'cloud' : facts.verdict === 'out' ? 'outside' : 'unknown',
      recorded: facts.recorded,
      ms: facts.ms,
      request: { at: turn.at, _sd: [request.digest], files: files.map(({ digest }) => ({ '...': digest })) },
      answer: { at: turn.end ?? turn.at, digitalSourceType: GENERATED, _sd: [answer.digest] },
      brains,
      made: makers,
      jean: { version, _sd: [await place('origin', origin)] },
    },
    evidence,
  }
  return { credential, salts, places, disclosures: [...disclosed({ request, answer, files, made }), ...places] }
}

/**
 * Seals a certificate: a JWS in flattened JSON (RFC 7515 7.2.2), ES256 by the seal's key, which it names as its issuer,
 * with JAdES's baseline header (the claimed time as `iat`, the certificate in `x5c`, before its chain when an authority
 * certified it, and its thumbprint), typed as a credential secured with SD-JWT (W3C VC-JOSE-COSE). @param {object} credential
 * @param {Seal} seal @param {Date} [now] @returns {Promise<Sealed>}
 */
export async function seal(credential, { keys, certificate, chain = [], sign }, now = new Date()) {
  const header = { alg: 'ES256', typ: 'vc+sd-jwt', iat: Math.floor(now.getTime() / 1000), x5c: [certificate, ...chain].map(base64), 'x5t#S256': base64url(await sha256(certificate)) }
  const signed = `${base64url(encode(JSON.stringify(header)))}.${base64url(encode(JSON.stringify({ ...credential, issuer: ISSUER + await thumbprint(keys.publicKey) })))}`
  const [protect, payload] = signed.split('.')
  const signature = base64url(await signOf({ keys, sign }, encode(signed)))
  return { payload, protected: protect, signature }
}

// ─── Witnesses (D276) ────────────────────────────────────────────────────────

/** What witnesses date: the SHA-256 of the signature's base64url (JAdES 5.3.4). @param {Sealed} sealed */
const imprintOf = (sealed) => sha256(encode(sealed.signature))

/**
 * A witness's RFC 3161 token for an imprint: a request with a nonce, sent by `send`, and the token, once
 * it holds and is the one asked for. @param {Uint8Array} imprint @param {(request: Uint8Array) => Promise<Uint8Array>} send
 */
export async function tokenFor(imprint, send) {
  const nonce = crypto.getRandomValues(new Uint8Array(8))
  nonce[0] = (nonce[0] & 0x7f) | 1
  const token = tokenOf(await send(timestampRequest(imprint, nonce)))
  const read = await readToken(token)
  if (!read.intact || read.imprint.join() !== imprint.join() || read.nonce?.join() !== nonce.join()) throw new Error('witness')
  return token
}

/**
 * Has a witness date a sealed certificate (JAdES B-T): its token for the signature's imprint, kept in `etsiU`.
 * @param {Sealed} sealed @param {(request: Uint8Array) => Promise<Uint8Array>} send @returns {Promise<Sealed>}
 */
export async function witness(sealed, send) {
  const token = await tokenFor(await imprintOf(sealed), send)
  return { ...sealed, header: { etsiU: [...(sealed.header?.etsiU ?? []), { sigTst: { tstTokens: [{ val: base64(token) }] } }] } }
}

/**
 * Records a sealed certificate in a public log (Sigstore's Rekor, v1) as a hashedrekord: the SHA-256 of
 * its signing input, its signature and its certificate, which the log checks; its answer kept as a
 * Sigstore bundle (v0.3), with the witnesses' tokens. @param {Sealed} sealed @param {(entry: object) => Promise<any>} send @returns {Promise<Sealed>}
 */
export async function record(sealed, send) {
  const certificate = bytesOf(String(json(sealed.protected).x5c?.[0] ?? ''))
  const digest = await sha256(encode(`${sealed.protected}.${sealed.payload}`))
  const signature = derSignature(bytesOf(sealed.signature))
  const pem = `-----BEGIN CERTIFICATE-----\n${base64(certificate).match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----\n`
  const [entry] = Object.values(await send({ apiVersion: '0.0.1', kind: 'hashedrekord', spec: { signature: { content: base64(signature), publicKey: { content: base64(encode(pem)) } }, data: { hash: { algorithm: 'sha256', value: hex(digest) } } } }))
  const { inclusionProof: proof, signedEntryTimestamp } = entry.verification
  const tokens = (sealed.header?.etsiU ?? []).map((/** @type {any} */ one) => one.sigTst.tstTokens[0].val)
  return { ...sealed, sigstore: {
    mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
    verificationMaterial: {
      certificate: { rawBytes: base64(certificate) },
      tlogEntries: [{ logIndex: String(entry.logIndex), logId: { keyId: base64(fromHex(entry.logID)) }, kindVersion: { kind: 'hashedrekord', version: '0.0.1' }, integratedTime: String(entry.integratedTime),
        inclusionPromise: { signedEntryTimestamp }, inclusionProof: { logIndex: String(proof.logIndex), rootHash: base64(fromHex(proof.rootHash)), treeSize: String(proof.treeSize), hashes: proof.hashes.map((/** @type {string} */ one) => base64(fromHex(one))), checkpoint: { envelope: proof.checkpoint } }, canonicalizedBody: entry.body }],
      ...(tokens.length && { timestampVerificationData: { rfc3161Timestamps: tokens.map((/** @type {string} */ val) => ({ signedTimestamp: val })) } }),
    },
    messageSignature: { messageDigest: { algorithm: 'SHA2_256', digest: base64(digest) }, signature: base64(signature) },
  } }
}

/**
 * A sealed certificate's entry in a public log: whether it is this certificate's, its signing input's
 * hash and its signature, and whether the log's promise, its signature over the entry's canonical
 * JSON, holds by the log's key (checked: false where that key isn't given). @param {Sealed} sealed @param {CryptoKey | null} key
 */
async function logged(sealed, key) {
  const entry = /** @type {any} */ (sealed.sigstore)?.verificationMaterial?.tlogEntries?.[0]
  if (!entry) return null
  const body = json(entry.canonicalizedBody)
  const bound = body.spec?.data?.hash?.value === hex(await sha256(encode(`${sealed.protected}.${sealed.payload}`))) && body.spec?.signature?.content === base64(derSignature(bytesOf(sealed.signature)))
  const promise = JSON.stringify({ body: entry.canonicalizedBody, integratedTime: Number(entry.integratedTime), logID: hex(bytesOf(entry.logId.keyId)), logIndex: Number(entry.logIndex) })
  const kept = key && await crypto.subtle.verify(SIGNING, key, /** @type {BufferSource} */ (p1363(bytesOf(entry.inclusionPromise.signedEntryTimestamp), 32)), encode(promise))
  return { index: Number(entry.logIndex), at: new Date(Number(entry.integratedTime) * 1000), intact: bound && kept !== false, checked: Boolean(key) }
}

/** The JWS in compact form, as the proof and the conversation keep it. @param {Sealed} sealed */
export const compact = (sealed) => `${sealed.protected}.${sealed.payload}.${sealed.signature}`

/** A compact JWS as the sealed certificate it is. @param {string} jws @returns {Sealed} */
export const sealedOf = (jws) => {
  const [protect = '', payload = '', signature = ''] = jws.split('.')
  return { protected: protect, payload, signature }
}

/** What a sealed certificate says, unchecked. @param {Sealed} sealed */
export const saysOf = (sealed) => json(sealed.payload)

/** The proof (RFC 9901's SD-JWT, compact, no key binding): the sealed certificate, then its disclosures. @param {Sealed} sealed @param {string[]} disclosures */
export const proof = (sealed, disclosures) => `${compact(sealed)}~${disclosures.join('~')}~`

/**
 * What a certificate or a proof shows; an Error('format') when it is neither. Intact: its signature
 * holds by the key in its certificate, which its issuer is the thumbprint of, at a time that certificate
 * covers. With a proof, `proven` when it is this certificate's and each disclosure is one of its digests,
 * salted with 128 bits at least, and what they stand for: the words, and the files' digests. Each
 * witness's time, whether its token holds and is on this signature; the log's entry, whether it is
 * this certificate's, and whether its promise holds by the log's key, when that is given (D276). Its unsigned
 * header's other values (JAdES B-LT's, D434) are only `trust`'s, given by the organisation's part.
 * @param {{ certificate?: Sealed, proof?: string }} given
 * @param {{ logKey?: CryptoKey | null, trust?: (sealed: Sealed, at: Date) => Promise<Trust> }} [known] @returns {Promise<Reading>}
 */
export async function check({ certificate: file, proof: shown }, { logKey = null, trust } = {}) {
  const [jws = '', ...rest] = shown?.split('~') ?? []
  const sealed = file ?? sealedOf(jws)
  if (!sealed.protected || !sealed.payload || !sealed.signature) throw new Error('format')
  const header = json(sealed.protected)
  const credential = json(sealed.payload)
  const der = bytesOf(String(header.x5c?.[0] ?? ''))
  const { spki, from, until, subject, issuer, selfIssued } = readCertificate(der)
  const key = await crypto.subtle.importKey('spki', /** @type {BufferSource} */ (spki), P256, true, ['verify'])
  const fingerprint = await thumbprint(key)
  const at = new Date(Number(header.iat) * 1000)
  const signed = header.alg === 'ES256' && header['x5t#S256'] === base64url(await sha256(der))
    && await crypto.subtle.verify(SIGNING, key, /** @type {BufferSource} */ (bytesOf(sealed.signature)), encode(`${sealed.protected}.${sealed.payload}`))
  const intact = signed && credential.issuer === ISSUER + fingerprint && from <= at && at <= until
  const imprint = (await imprintOf(sealed)).join()
  const timestamps = await Promise.all((sealed.header?.etsiU ?? []).filter((/** @type {any} */ one) => one.sigTst).map((/** @type {any} */ one) => readToken(bytesOf(String(one.sigTst?.tstTokens?.[0]?.val ?? '')))
    .then((read) => ({ at: read.at, authority: read.authority ?? {}, intact: read.intact && read.imprint.join() === imprint }), () => ({ at: null, authority: {}, intact: false }))))
  const result = { intact, fingerprint, selfIssued, subject, issuer, at, says: credential, timestamps, log: await logged(sealed, logKey), ...(trust && { trust: await trust(sealed, at) }) }
  if (!shown) return result
  // Each digest's place: the request's words, the answer's, a file shared, a file made; then where it was
  // done, each shown back in its place in what the certificate says: a brain's or maker's address, what was reached, Jean's.
  const subjectOf = credential.credentialSubject ?? {}
  /** @type {Map<string, [string, number]>} */
  const places = new Map([
    [subjectOf.request?._sd?.[0], ['request', 0]], [subjectOf.answer?._sd?.[0], ['answer', 0]],
    ...(subjectOf.request?.files ?? []).map((/** @type {any} */ one, /** @type {number} */ i) => [one['...'], ['files', i]]),
    ...(subjectOf.made ?? []).flatMap((/** @type {any} */ one, /** @type {number} */ i) => [[one._sd?.[0], ['made', i]], [one._sd?.[1], ['makers', i]]]),
    ...(subjectOf.brains ?? []).map((/** @type {any} */ one, /** @type {number} */ i) => [one._sd?.[0], ['brains', i]]),
    ...(credential.evidence ?? []).map((/** @type {any} */ one, /** @type {number} */ i) => [one._sd?.[0], ['evidence', i]]),
    [subjectOf.jean?._sd?.[0], ['jean', 0]],
  ])
  /** @type {Record<string, any[]>} where each address goes back */
  const back = { brains: subjectOf.brains ?? [], makers: subjectOf.made ?? [], evidence: credential.evidence ?? [], jean: [subjectOf.jean ?? {}] }
  /** @type {{ request?: string, answer?: string, files: string[], made: string[] }} */
  const words = { files: [], made: [] }
  let proven = !file || compact(file) === jws
  for (const disclosure of rest.filter(Boolean)) {
    const place = places.get(base64url(await sha256(encode(disclosure))))
    const [salted, ...claim] = json(disclosure)
    if (!place || !/^[\w-]{22,}$/.test(salted)) proven = false
    else if (place[0] in back && ['host', 'hosts', 'origin'].includes(claim[0])) back[place[0]][place[1]][String(claim[0])] = claim[1]
    else if (place[0] === 'request' || place[0] === 'answer') words[place[0]] = String(claim[1])
    else words[/** @type {'files' | 'made'} */ (place[0])][place[1]] = String(claim.at(-1))
  }
  return { ...result, proven, words }
}
