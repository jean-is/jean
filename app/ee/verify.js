// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Checks a collector's copy of the audit stream (D675): `node ee/verify.js <file> [--keys <file>]`, a file of OTLP/HTTP JSON, whole
// or a batch a line, as the collector's file exporter writes it, and the keys pinned when first seen, as this prints them, one
// a line. Hashes alone anyone could make again, so a copy is whole only where a pinned key's signature reaches. Exits 0 if so,
// 1 if something isn't, and 2 if it holds together but no pinned key vouches for it.
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { FIRST, verify, signed } from './chain.js'

/** @typedef {import('./otlp.js').Span} Span */

/** Every batch of a file. @param {string} text @returns {any[]} */
export function batches(text) {
  try {
    const whole = JSON.parse(text)
    return Array.isArray(whole) ? whole : [whole]
  } catch {
    return text.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line))
  }
}

/** @param {Span} span @param {string} name */
const say = (span, name) => Object.values(span.attributes.find(({ key }) => key === name)?.value ?? {})[0]
/** A key as it is compared, however it is spaced. @param {string} key */
const curve = (key) => { try { const { x, y } = JSON.parse(key); return `${x}.${y}` } catch { return key } }

/**
 * What a copy says of itself and how far a signature reaches: back from each signed end along the hashes, and across
 * page loads, since a chain starts from where the last ended. What no signature reaches proves nothing, and is counted: a
 * page leaving, or something rewritten since. A chain whose start names a hash no longer here means something before it is
 * gone, unless that is where the copy begins, a later period's, which it says, as nothing tells it from the oldest removed.
 * @param {string} text @param {{ keys?: string[] }} [options] the keys pinned
 */
export async function report(text, { keys } = {}) {
  /** @type {Span[]} */
  const spans = []
  const problems = []
  const pinned = keys && new Set(keys.map(curve))
  /** Each signed end that holds, and under which key. @type {{ tip: string, key: string }[]} */
  const ends = []
  /** Whose each chain is, by the key of a batch that holds its spans. @type {Map<string, string>} */
  const owners = new Map()
  for (const { resourceSpans = [] } of batches(text)) {
    for (const { resource, scopeSpans = [] } of resourceSpans) {
      const held = scopeSpans.flatMap((/** @type {any} */ scope) => scope.spans ?? [])
      spans.push(...held)
      const of = (/** @type {string} */ name) => Object.values(resource?.attributes?.find((/** @type {any} */ one) => one.key === name)?.value ?? {})[0]
      const [tip, signature, key] = [of('jean.audit.tip'), of('jean.audit.signature'), of('jean.audit.key')].map((value) => (value ? String(value) : ''))
      if (!tip || !signature || !key) continue
      for (const span of held) owners.set(String(say(span, 'jean.audit.chain')), key)
      if (!(await signed({ tip, signature, key }).catch(() => false))) problems.push(`a signature doesn't hold for ${tip}`)
      else if (pinned && !pinned.has(curve(key))) problems.push(`a batch is signed by a key not pinned: ${key}`)
      else ends.push({ tip, key })
    }
  }
  const found = verify(spans)
  const byHash = new Map(spans.flatMap((span) => (say(span, 'jean.audit.hash') ? [[String(say(span, 'jean.audit.hash')), span]] : [])))
  for (const { tip } of ends) if (!byHash.has(tip)) problems.push(`a signed end, ${tip}, is on no span here`)
  /** @type {Set<string>} */
  const reached = new Set()
  for (const { tip, key } of ends) {
    for (let hash = tip, span = byHash.get(hash); span && !reached.has(hash); hash = String(say(span, 'jean.audit.prev')), span = byHash.get(hash)) {
      reached.add(hash)
      owners.set(String(say(span, 'jean.audit.chain')), key)
    }
  }
  /** Each chain's spans in order. @type {Map<string, Span[]>} */
  const chains = new Map()
  for (const span of byHash.values()) chains.set(String(say(span, 'jean.audit.chain')), [...chains.get(String(say(span, 'jean.audit.chain'))) ?? [], span])
  /** Each key's chains whose start names a hash no longer here, and those that began it all. @type {Record<string, string[]>} */
  const openings = {}
  const origins = new Set()
  let begins = 0
  let unsigned = 0
  for (const [id, chain] of chains) {
    chain.sort((a, b) => Number(say(a, 'jean.audit.seq')) - Number(say(b, 'jean.audit.seq')))
    const start = String(say(chain[0], 'jean.audit.prev'))
    if (start === FIRST) origins.add(owners.get(id) ?? '')
    else if (!byHash.has(start)) (openings[owners.get(id) ?? ''] ??= []).push(id)
    unsigned += chain.filter((span) => !reached.has(String(say(span, 'jean.audit.hash')))).length
  }
  // Where a copy of a later period begins, for a key whose first chain isn't here; any other means what linked them is gone.
  for (const [key, started] of Object.entries(openings)) {
    begins += origins.has(key) ? 0 : 1
    for (const id of started.slice(origins.has(key) ? 0 : 1)) problems.push(`${id}: what came before it is gone`)
  }
  if (pinned && found.spans && !ends.length) problems.push('no signature by a pinned key')
  if (found.unlinked) problems.push(`${found.unlinked} spans have no place in a chain`)
  if (!found.spans) problems.push('it holds no span with a place in a chain')
  return { ...found, proofs: ends.length, unsigned, begins, keys: [...new Set(ends.map(({ key }) => key))], pinned: Boolean(pinned), problems: [...found.problems, ...problems] }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const named = process.argv.indexOf('--keys')
  const keys = named > 0 ? (await readFile(process.argv[named + 1], 'utf8')).split('\n').map((line) => line.trim()).filter(Boolean) : undefined
  const said = await report(await readFile(process.argv[2], 'utf8'), { keys })
  console.log(`${said.spans} spans in ${said.chains} chains, ${said.dropped} let go on the device, ${said.proofs} signed ends, ${said.unsigned} spans no signature reaches, which prove nothing.`)
  if (said.begins) console.log(`It begins partway, ${said.begins === 1 ? 'for one key' : `for ${said.begins} keys`}: what came before isn't here, whether it is another period's or was removed.`)
  for (const key of said.keys) console.log(`Signed by: ${key}`)
  for (const problem of said.problems) console.log(problem)
  console.log(said.problems.length ? 'This copy is not whole.' : said.pinned ? 'This copy is whole, as far as its signatures reach.' : 'This copy holds together, but no pinned key vouches for it: anyone could have written it. Pin the keys you trust and give them with --keys.')
  process.exit(said.problems.length ? 1 : said.pinned ? 0 : 2)
}
