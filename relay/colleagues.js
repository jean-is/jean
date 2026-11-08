// Colleagues (D731): on an organisation's own relay, the people its sign-in names, each listed by the ID token it gave them, so that
// colleagues find each other's person mailbox and profile key with no meeting (D727). A device sends that token beside the profile's
// public key, with the token of the person mailbox it lists; the relay checks the token's signature by the issuer's keys, its issuer,
// audience and dates, keeps whom it names under a hash of issuer and subject, the newest key and mailbox winning, and drops the token.
// Only a listed mailbox searches the list, a few times an hour. A listing lapses a month after its last proof, and
// `node relay/serve.js forget <account>` takes a leaver off at once.
//
//   PUT    /v1/people/<id>      Authorization: Bearer <the mailbox's token>, { proof: <ID token>, key: <P-256 public JWK>, chain?: string[] }:
//                               lists the mailbox's owner under that key: { name, account, guest?, groups? }; 201 the first time
//   DELETE /v1/people/<id>      with the token: off the list
//   GET    /v1/people?q=<words> with a listed mailbox's token: up to 10 people whose name or account holds every word, by name:
//                               { people: [{ name, account, mailbox, key, chain?, groups?, guest? }] }
//   GET    /v1/people?account=<account> or ?mailbox=<id>
//                               the same, for one person: { people: [] } when nobody is listed so
//
// Its configuration, `issuers` in RELAY_CONFIG: [{ issuer, audience, jwks?, groups?, guest? }], `issuer` exactly as its tokens name
// it, `audience` Jean's client id there, `jwks` its keys, a JWK Set or the address of one, where its discovery's aren't those (Entra,
// for an app with claims mapping: …/discovery/v2.0/keys?appid=<client id>), `groups` the claim that lists a person's groups
// ('groups'), `guest` true where everyone it names is a guest, as Entra's `acct` of 1 says of one.
//
// Web-standard (fetch, Web Crypto): the list goes through the relay's store, a folder of one file a person on Node (serve.js).
import { hashOf, idOf, within } from '../host/host.js'

export const PEOPLE = Object.freeze({
  /** Days a listing stays after its last proof. */
  lapse: 30,
  /** Letters a search takes at least, people it gives at most, searches a listed mailbox makes in an hour, listings a mailbox makes in an hour. */
  letters: 3,
  results: 10,
  searches: 60,
  listings: 20,
  /** Bytes of a listing's request: an ID token, a key, a chain. */
  body: 16_384,
})
const DAY = 86_400_000
const HOUR = 3_600_000
/** Clocks that are a little off: a token's dates hold a minute either way. */
const LEEWAY = 60_000
/** An issuer's keys, fetched again after a day, and for a kid they don't hold no sooner than five minutes after the last fetch. */
const AGAIN = 5 * 60_000
const PATH = /^\/v1\/people(?:\/([\w-]{22}))?$/
const ALGORITHMS = /** @type {const} */ ({ ES256: { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }, RS256: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } })

/**
 * A key of an issuer's, by its kid. @typedef {JsonWebKey & { kid?: string }} Key
 * An issuer as the configuration names it. @typedef {{ issuer: string, audience: string, jwks?: { keys: Key[] } | string, groups?: string, guest?: boolean }} Issuer
 * Someone listed: a hash of issuer and subject, the name and account the token gave, their person mailbox and profile key, what an
 * organisation's authority certified of it (ee/), their groups, whether a guest, when last proved.
 * @typedef {{ format: 1, id: string, name: string, account: string, mailbox: string, key: JsonWebKey, chain?: string[], groups?: string[], guest?: true, proved: number }} Entry
 * The list as the relay's store keeps it, `entries` read only. @typedef {{ entries(): Promise<Entry[]>, saveEntry(entry: Entry): Promise<void>, dropEntry(id: string): Promise<void> }} Backend
 */

/** Text from base64url. @param {string} text */
const decoded = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))
/** A token's part as an object, or null. @param {string} part */
const objectOf = (part) => { try { const value = JSON.parse(new TextDecoder().decode(decoded(part))); return value && typeof value === 'object' && !Array.isArray(value) ? value : null } catch { return null } }
/** Words to compare, without case or accents. @param {string} text */
const folded = (text) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
/** What a colleague sees of someone listed. @param {Entry} entry */
const shown = ({ name, account, mailbox, key, chain, groups, guest }) => ({ name, account, mailbox, key, ...(chain && { chain }), ...(groups && { groups }), ...(guest && { guest }) })
/** A P-256 public key, its curve's point, or null. @param {any} key @returns {Promise<JsonWebKey | null>} */
async function pointOf(key) {
  if (key?.kty !== 'EC' || key.crv !== 'P-256' || !/^[\w-]{43}$/.test(key.x) || !/^[\w-]{43}$/.test(key.y)) return null
  const only = { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }
  return crypto.subtle.importKey('jwk', only, { name: 'ECDH', namedCurve: 'P-256' }, true, []).then(() => only, () => null)
}

/**
 * @param {{ backend: Backend, issuers: Issuer[], fetch: typeof globalThis.fetch, now: () => number, inTurn: <T>(key: string, task: () => Promise<T>) => Promise<T>,
 *   record: (text: string) => unknown, owns: (id: string, hash: string) => Promise<boolean | null> }} options `owns`: whether the mailbox is open with
 *   that token's hash, null where none is
 */
export function colleagues({ backend, issuers, fetch, now, inTurn, record, owns }) {
  /** Each issuer's keys, when fetched, and when last fetched for a kid they lacked. @type {Map<string, { keys: Key[], at: number, tried: number }>} */
  const held = new Map()
  /** Searches and listings each mailbox made this hour. @type {Map<string, { from: number, count: number }>} */
  const counts = new Map()
  /** One more of a mailbox's this hour, unless it is past `most`. @param {string} key @param {number} most */
  const counted = (key, most) => {
    const at = now()
    const one = counts.get(key)
    const mine = one && at - one.from < HOUR ? one : { from: at, count: 0 }
    if (counts.size > 100_000) for (const [other, them] of counts) if (at - them.from >= HOUR) counts.delete(other)
    counts.set(key, mine)
    return ++mine.count <= most
  }

  /** An issuer's keys: named in the configuration, or at its discovery's address, kept a day. @param {Issuer} issuer @param {string} kid @returns {Promise<Key[]>} */
  async function keysOf(issuer, kid) {
    if (typeof issuer.jwks === 'object') return issuer.jwks.keys
    const at = now()
    const kept = held.get(issuer.issuer)
    const fresh = kept && at - kept.at < DAY
    if (fresh && (kept.keys.some((key) => key.kid === kid) || at - kept.tried < AGAIN)) return kept.keys
    const json = async (/** @type {string} */ url) => { const response = await fetch(url, { signal: AbortSignal.timeout(10_000) }); if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.json() }
    try {
      const address = issuer.jwks ?? await json(`${issuer.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`).then((found) => {
        if (found.issuer !== issuer.issuer || typeof found.jwks_uri !== 'string') throw new Error(`${issuer.issuer}: its discovery names another issuer`)
        return found.jwks_uri
      })
      const { keys } = await json(address)
      if (!Array.isArray(keys)) throw new Error(`${address}: no keys`)
      held.set(issuer.issuer, { keys, at, tried: at })
      return keys
    } catch (error) {
      // Out of reach: what was kept serves while it is fresh, and the next try waits five minutes.
      if (fresh) { kept.tried = at; return kept.keys }
      throw Object.assign(new Error('The organisation’s keys can’t be read now.'), { cause: error, unreachable: true })
    }
  }

  /**
   * Whom an ID token names, once its issuer is one listed, its audience Jean's, its dates now, and its signature its issuer's key's
   * by its kid; null for any other. @param {unknown} token
   */
  async function provedBy(token) {
    const [head, body, signature, ...rest] = typeof token === 'string' ? token.split('.') : []
    const [header, claims] = [objectOf(head ?? ''), objectOf(body ?? '')]
    if (rest.length || !signature || !header || !claims) return null
    const issuer = issuers.find((one) => one.issuer === claims.iss)
    const algorithm = ALGORITHMS[/** @type {keyof typeof ALGORITHMS} */ (header.alg)]
    if (!issuer || !Object.hasOwn(ALGORITHMS, header.alg) || typeof header.kid !== 'string') return null
    const audiences = [claims.aud].flat()
    if (!audiences.includes(issuer.audience) || (claims.azp ?? (audiences.length > 1 ? null : issuer.audience)) !== issuer.audience) return null
    const at = now()
    const date = (/** @type {unknown} */ value) => (typeof value === 'number' ? value * 1000 : null)
    if (!(date(claims.exp) && /** @type {number} */ (date(claims.exp)) + LEEWAY > at)) return null
    if ([claims.nbf, claims.iat].some((value) => value !== undefined && !(date(value) && /** @type {number} */ (date(value)) - LEEWAY <= at))) return null
    const account = [claims.email, claims.preferred_username].find((value) => typeof value === 'string' && value.length && value.length <= 254)
    if (typeof claims.sub !== 'string' || !claims.sub || !account) return null
    const jwk = (await keysOf(issuer, header.kid)).find((key) => key.kid === header.kid)
    if (!jwk || (jwk.use && jwk.use !== 'sig') || (jwk.alg && jwk.alg !== header.alg) || jwk.kty !== (header.alg === 'ES256' ? 'EC' : 'RSA')) return null
    const ok = await crypto.subtle.importKey('jwk', header.alg === 'ES256' ? { kty: 'EC', crv: jwk.crv, x: jwk.x, y: jwk.y } : { kty: 'RSA', n: jwk.n, e: jwk.e }, algorithm, false, ['verify'])
      .then((key) => crypto.subtle.verify(algorithm, key, decoded(signature), new TextEncoder().encode(`${head}.${body}`)), () => false)
    if (!ok) return null
    const groups = claims[issuer.groups ?? 'groups']
    return {
      id: await hashOf(`${claims.iss}\n${claims.sub}`), account, name: typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 200) : account,
      ...(Array.isArray(groups) && groups.every((one) => typeof one === 'string' && one.length <= 256) && { groups: groups.slice(0, 500) }),
      ...((issuer.guest || claims.acct === 1) && { guest: /** @type {const} */ (true) }),
    }
  }

  /** Those listed whose last proof is within the month. */
  const fresh = async () => { const at = now(); return (await backend.entries()).filter((entry) => at - entry.proved <= PEOPLE.lapse * DAY) }

  /**
   * @param {Request} request @param {import('../host/host.js').Client} client
   * @param {{ answer: (status: number, body?: object) => Response }} tools
   */
  async function handle(request, client, { answer }) {
    const url = new URL(request.url)
    const [, id] = PATH.exec(url.pathname) ?? []
    const token = /^Bearer ([\w-]{43})$/.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!token) return answer(401, { error: 'A mailbox’s token is needed.' })

    if (!id) {
      if (request.method !== 'GET') return answer(405, { error: 'Not here.' })
      const me = await idOf(token)
      const all = await fresh()
      if (!all.some((entry) => entry.mailbox === me)) return answer(403, { error: 'Only someone listed here searches it.' })
      const [words, account, mailbox] = ['q', 'account', 'mailbox'].map((name) => url.searchParams.get(name))
      if (words !== null && folded(words).replace(/\s/g, '').length < PEOPLE.letters) return answer(400, { error: `A search takes ${PEOPLE.letters} letters at least.` })
      if (words === null && !account && !mailbox) return answer(400, { error: 'Search by words, an account or a mailbox.' })
      if (!counted(`search ${me}`, PEOPLE.searches)) return answer(429, { error: 'Too many searches. Try again later.' })
      const asked = folded(words ?? '').split(/\s+/).filter(Boolean)
      const found = words !== null ? all.filter((entry) => ((text) => asked.every((word) => text.includes(word)))(folded(`${entry.name} ${entry.account}`)))
        : all.filter((entry) => (account ? folded(entry.account) === folded(account) : entry.mailbox === mailbox))
      const collator = new Intl.Collator('und')
      return answer(200, { people: found.sort((a, b) => collator.compare(a.name, b.name)).slice(0, PEOPLE.results).map(shown) })
    }

    // The rest is the mailbox's own, with its token.
    const hash = await hashOf(token)
    if (await idOf(token) !== id) return answer(403, { error: 'This mailbox is someone else’s.' })
    /** A change, with where it came from, as the relay's are. @param {'list' | 'unlist'} operation */
    const noted = (operation) => record(JSON.stringify({ at: new Date(now()).toISOString(), address: client.address, port: client.port, protocol: client.protocol ?? '', id, operation }))

    if (request.method === 'DELETE') {
      return inTurn('people', async () => {
        const gone = (await backend.entries()).filter((entry) => entry.mailbox === id)
        for (const entry of gone) await backend.dropEntry(entry.id)
        if (gone.length) await noted('unlist')
        return answer(200, {})
      })
    }
    if (request.method !== 'PUT') return answer(405, { error: 'Not here.' })
    const bytes = await within(request, PEOPLE.body)
    if (!bytes) return answer(413, { error: 'This is too large.' })
    /** @type {{ proof?: unknown, key?: unknown, chain?: unknown }} */
    let asked = {}
    try { asked = JSON.parse(new TextDecoder().decode(bytes)) } catch {}
    const open = await owns(id, hash)
    if (open === null) return answer(404, { error: 'No mailbox is open here.' })
    if (!open) return answer(403, { error: 'This mailbox is someone else’s.' })
    const key = await pointOf(asked.key)
    const chain = asked.chain
    if (!key || (chain !== undefined && !(Array.isArray(chain) && chain.length <= 8 && chain.every((one) => typeof one === 'string' && /^[\w+/=-]+$/.test(one))))) return answer(400, { error: 'A profile’s P-256 key is needed.' })
    if (!counted(`list ${id}`, PEOPLE.listings)) return answer(429, { error: 'Too many listings. Try again later.' })
    const who = await provedBy(asked.proof).catch((/** @type {any} */ error) => (error?.unreachable ? error : null))
    if (who instanceof Error) return answer(503, { error: who.message })
    if (!who) return answer(403, { error: 'This proof isn’t the organisation’s sign-in, for Jean, now.' })
    return inTurn('people', async () => {
      const all = await backend.entries()
      // One listing a person and a mailbox: the newest wins.
      for (const entry of all) if (entry.mailbox === id && entry.id !== who.id) await backend.dropEntry(entry.id)
      const { groups, guest, ...named } = who
      await backend.saveEntry({ format: 1, ...named, mailbox: id, key, ...(Array.isArray(chain) && { chain }), ...(groups && { groups }), ...(guest && { guest }), proved: now() })
      await noted('list')
      return answer(all.some((entry) => entry.id === who.id) ? 200 : 201, { name: who.name, account: who.account, ...(guest && { guest }), ...(groups && { groups }) })
    })
  }

  /** What lapsed goes, as the daily sweep asks. @param {number} at */
  const tidy = (at) => inTurn('people', async () => { for (const entry of await backend.entries()) if (at - entry.proved > PEOPLE.lapse * DAY) await backend.dropEntry(entry.id) })

  return { handle, tidy, handles: (/** @type {string} */ path) => PATH.test(path), issuers: issuers.map((one) => one.issuer) }
}
