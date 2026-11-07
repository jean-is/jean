// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Data-loss checks (D674): what counts as sensitive, found on the device, and the hooks that act on it. Policy's `dlp`
// names what to look for: Jean's own detectors, each checked past its shape (a card's Luhn digit, an IBAN's and a French
// social security number's keys), words that mark something confidential, and patterns of the organisation's. A task
// holding any of it reaches only the brains `dlp.brains` names, or one on the device; a call that would send it out asks
// first, or never runs (`dlp.then`). Only which detector found something is ever told, never what it found. Host-agnostic.

// A run of groups of digits: each stretch of them is tried, since what follows may be an expiry or a code, what comes before an amount.
const DIGITS = /(?<!\d)\d+(?:[    .-]\d+)*/g
// Each country's IBAN length: what tells one from words that happen to start like one.
const IBANS = new Map('AD24 AE23 AL28 AT20 AZ28 BA20 BE16 BG22 BH22 BR29 BY28 CH21 CR22 CY28 CZ24 DE22 DK18 DO28 EE20 EG29 ES24 FI18 FO18 FR27 GB22 GE22 GI23 GL18 GR27 GT28 HR21 HU28 IE22 IL23 IQ23 IS26 IT27 JO30 KW30 KZ20 LB28 LC32 LI21 LT20 LU20 LV21 LY25 MC27 MD24 ME22 MK19 MR27 MT31 MU30 NL18 NO15 PK24 PL28 PS29 PT25 QA29 RO24 RS22 SA24 SC31 SD18 SE24 SI19 SK24 SM27 ST25 SV28 TL23 TN24 TR26 UA29 VA22 VG24 XK20'.split(' ').map((one) => [one.slice(0, 2), Number(one.slice(2))]))
const NIR = /\b[12][ .\u00a0]?\d{2}[ .\u00a0]?(?:0[1-9]|1[0-2]|[2-9]\d)[ .\u00a0]?(?:\d{2}|2[AB])[ .\u00a0]?\d{3}[ .\u00a0]?\d{3}[ .\u00a0]?\d{2}\b/gi
const SSN = /\b(?!000|666|9\d\d)\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g
// A private key runs to its end, or to the text's where it was cut.
const SECRET = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )*PRIVATE KEY-----|$)|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_\w{40,}\b|\bsk-[A-Za-z0-9_-]{32,}\b|\bxox[abprs]-[A-Za-z0-9-]{20,}\b|\bAIza[\w-]{35}\b|\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/g

/** @param {string} digits */
function luhn(digits) {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    const digit = Number(digits[digits.length - 1 - i]) * (i % 2 ? 2 : 1)
    sum += digit > 9 ? digit - 9 : digit
  }
  return sum % 10 === 0
}

/** The remainder of a long number's digits by 97, as IBANs and NIRs have it. @param {string} digits */
const mod97 = (digits) => [...digits].reduce((rest, digit) => (rest * 10 + Number(digit)) % 97, 0)

/** @typedef {[number, number]} Place  where something is in a text: its start and its end */

/** Where a shape is found, and holds. @param {string} text @param {RegExp} shape @param {(found: string) => boolean} [holds] @returns {Place[]} */
const where = (text, shape, holds) => [...text.matchAll(shape)].flatMap((match) => (!holds || holds(match[0]) ? [/** @type {Place} */ ([match.index, match.index + match[0].length])] : []))

/** Where a run of digits holds a card: a stretch of groups of three digits or more, the last of any length, starting as a card does, with its Luhn digit. @param {string} run @param {number} at where the run starts @returns {Place[]} */
function cards(run, at) {
  const groups = [...run.matchAll(/\d+/g)]
  /** @type {Place[]} */
  const found = []
  for (let from = 0; from < groups.length; from++) {
    if (groups[from][0].length < 3) continue
    let digits = ''
    for (let to = from; to < groups.length; to++) {
      digits += groups[to][0]
      if (digits.length > 19) break
      if (digits.length >= 13 && /^[2-6]/.test(digits) && !/^(\d)\1+$/.test(digits) && luhn(digits)) {
        found.push([at + groups[from].index, at + groups[to].index + groups[to][0].length])
        from = to
        break
      }
      if (groups[to][0].length < 3) break
    }
  }
  return found
}

/** Where an IBAN that starts at a place in a text ends, or 0: its groups taken one by one to its country's length, mostly digits, with its key. @param {string} text @param {number} at */
function ibanEnd(text, at) {
  const length = IBANS.get(text.slice(at, at + 2).toUpperCase())
  if (!length) return 0
  let held = ''
  for (const part of text.slice(at, at + 60).split(/[  -]/)) {
    const word = /^[a-z0-9]*/i.exec(part)?.[0] ?? ''
    held += word.toUpperCase()
    if (held.length >= length) break
    if (word.length < part.length) return 0
  }
  if (held.length !== length || held.replace(/\D/g, '').length < 8 || mod97(`${held.slice(4)}${held.slice(0, 4)}`.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55))) !== 1) return 0
  let end = at
  for (let counted = 0; counted < length; end++) if (/[a-z0-9]/i.test(text[end])) counted++
  return end
}

/** Where the detectors Jean knows find what they look for, by what policy calls them. @type {Record<string, (text: string) => Place[]>} */
export const PLACES = {
  card: (text) => [...text.matchAll(DIGITS)].flatMap((run) => cards(run[0], run.index)),
  iban: (text) => [...text.matchAll(/\b[a-z]{2}\d{2}/gi)].flatMap(({ index }) => {
    const end = ibanEnd(text, index)
    return end ? [/** @type {Place} */ ([index, end])] : []
  }),
  nir: (text) => where(text, NIR, (found) => {
    const nir = found.replace(/[ .\u00a0]/g, '').toUpperCase()
    // Corsica's departments, 2A and 2B, count as 19 and 18 towards the key.
    const body = BigInt(nir.slice(0, 13).replace('2A', '19').replace('2B', '18'))
    return 97n - body % 97n === BigInt(nir.slice(13))
  }),
  ssn: (text) => where(text, SSN),
  secret: (text) => where(text, SECRET),
}

/** Whether each finds anything. @type {Record<string, (text: string) => boolean>} */
export const DETECTORS = Object.fromEntries(Object.entries(PLACES).map(([id, places]) => [id, (text) => places(text).length > 0]))

/**
 * @typedef {string | { id: string, name?: string, pattern: string, flags?: string }} Detect  one of DETECTORS, or a pattern of the organisation's
 * @typedef {{ hide?: string[], words?: string[], keep?: string[], pictures?: 'hold' | 'send' }} Mask  what a brain outside `brains` reads masked (mask.js, D681)
 * @typedef {{ detect?: Detect[], labels?: string[], brains?: string[], then?: 'ask' | 'never', mask?: Mask }} Dlp  policy's
 */

/** What mask can hide of itself, beyond `detect` and `words`. No model measured finds organisations or places well enough to say so: `words` names them. */
const HIDES = ['person', 'email', 'phone']

/** Policy's `dlp`, read: throws, saying why, on what it can't use. @param {unknown} given @param {{ brains?: { id: string }[] }} [policy] @returns {Dlp} */
export function checked(given, { brains } = {}) {
  const dlp = /** @type {Dlp} */ (given)
  const refuse = (/** @type {string} */ why) => { throw new Error(`policy.json's dlp ${why}`) }
  if (!dlp || typeof dlp !== 'object') refuse('is not an object')
  if (!dlp.detect?.length && !dlp.labels?.length && !dlp.mask) refuse('names nothing to look for: give it detect or labels')
  if (dlp.mask !== undefined) {
    if (!dlp.mask || typeof dlp.mask !== 'object') refuse('has a mask that is not an object')
    for (const one of dlp.mask.hide ?? []) if (!HIDES.includes(one)) refuse(`can't hide ${JSON.stringify(one)}: use ${HIDES.join(', ')}`)
    for (const word of [...dlp.mask.words ?? [], ...dlp.mask.keep ?? []]) if (typeof word !== 'string' || word.trim().length < 2) refuse(`has a word mask can't use: ${JSON.stringify(word)}`)
    if (dlp.mask.pictures !== undefined && dlp.mask.pictures !== 'hold' && dlp.mask.pictures !== 'send') refuse('mask.pictures is neither "hold" nor "send"')
    if (!dlp.detect?.length && !dlp.mask.hide?.length && !dlp.mask.words?.length) refuse('masks nothing: give it detect, or hide or words in mask')
  }
  for (const one of dlp.detect ?? []) {
    if (typeof one === 'string' ? !DETECTORS[one] : !one?.id || !one.pattern) refuse(`can't read ${JSON.stringify(one)}: use ${Object.keys(DETECTORS).join(', ')}, or { id, pattern }`)
    if (typeof one === 'object') try { new RegExp(one.pattern, one.flags) } catch { refuse(`has a pattern that doesn't read: ${one.id}`) }
  }
  if (dlp.then !== undefined && dlp.then !== 'ask' && dlp.then !== 'never') refuse('then is neither "ask" nor "never"')
  if (brains) for (const id of dlp.brains ?? []) if (!brains.some((brain) => brain.id === id)) refuse(`names a brain policy doesn't: ${id}`)
  return dlp
}

/** Finds what a text holds, by what policy calls each. @param {Dlp} dlp @returns {(text: string) => string[]} */
export function finder({ detect = [], labels = [] }) {
  const own = detect.flatMap((one) => (typeof one === 'string' ? [] : [/** @type {const} */ ([one.id, new RegExp(one.pattern, one.flags)])]))
  const known = detect.flatMap((one) => (typeof one === 'string' ? [one] : []))
  const label = labels.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${labels.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'iu') : null
  return (text) => [...known.filter((id) => DETECTORS[id](text)), ...own.flatMap(([id, pattern]) => (text.search(pattern) >= 0 ? [id] : [])), ...(label?.test(text) ? ['label'] : [])]
}

/** An address's text as it reads, a stray % left as it is. @param {string} text */
const decoded = (text) => text.replace(/(?:%[0-9a-f]{2})+/gi, (run) => { try { return decodeURIComponent(run) } catch { return run } }).replace(/\+/g, ' ')

/** Every string a value holds, names and numbers too, each as a person reads it, an address also as it decodes: never JSON, whose \n would glue a line's first word to what came before. By a list, not by calling itself, however deep what a brain wrote goes. @param {unknown} given @returns {string[]} */
export function leaves(given) {
  const found = []
  for (const stack = [given]; stack.length;) {
    const value = stack.pop()
    if (typeof value === 'number' || typeof value === 'bigint') found.push(String(value))
    else if (typeof value === 'string') found.push(...(/%[0-9a-f]{2}|\+/i.test(value) ? [value, decoded(value)] : [value]))
    else if (value && typeof value === 'object') for (const [name, one] of Object.entries(value)) stack.push(name, one)
  }
  return found
}

/** What a message to a brain holds in words: its text, its files', its calls' arguments. @param {import('./types.js').Message} message */
const wordsOf = (message) => [message.content, ...(message.documents ?? []).map((part) => part.text), ...leaves(message.toolCalls?.map((call) => call.args))].filter(Boolean).join('\n')

const STRICT = /** @type {Record<string, number>} */ ({ allow: 0, ask: 1, never: 2 })
/** What reaches outside, as a call's kind says, and what sends its words to a service of its own whatever its kind: a search's, a picture's or a film's provider. */
export const OUT = ['fetch', 'other', 'move']
export const SENT = ['web_search', 'picture', 'film']

/**
 * The hooks, the organisation's, outermost: a brain's step goes only to a brain allowed to read what the task holds, and
 * a call's arguments leave only as `then` says. What each case says comes from `say`.
 * @param {Dlp} dlp
 * @param {{ isLocal: (brain: import('../core/types.js').BrainConfig) => boolean, refused: (found: string[]) => AsyncIterable<import('../core/types.js').StreamEvent>, reason: (found: string[]) => string, why: (found: string[]) => string, told?: (found: string[], where: 'brain' | 'call') => void }} say
 * @returns {import('../core/hooks.js').Hook[]}
 */
export function dlpHooks(dlp, say) {
  const find = finder(dlp)
  const then = dlp.then ?? 'ask'
  /** What each message was found to hold, read once. @type {WeakMap<object, string[]>} */
  const read = new WeakMap()
  /** @param {import('./types.js').Message} message */
  const holds = (message) => read.get(message) ?? /** @type {string[]} */ (read.set(message, find(wordsOf(message))).get(message))
  return [
    { on: 'turn.step', tier: 'policy', run: (/** @type {import('./types.js').Step} */ e, next) => {
      if (!dlp.brains || say.isLocal(e.brain) || dlp.brains.includes(e.brain.id)) return next(e)
      // What can be masked goes masked; a label marks the whole of a document, which hiding its names doesn't change.
      const found = [...new Set([...find(e.system ?? ''), ...e.messages.flatMap(holds)])].filter((id) => !dlp.mask || id === 'label')
      if (!found.length) return next(e)
      say.told?.(found, 'brain')
      return say.refused(found)
    } },
    { on: 'tool.check', tier: 'policy', by: 'dlp', run: async (e, next) => {
      const said = await next(e)
      if (said?.refuse || said?.decision === 'never' || !(OUT.includes(e.kind) || SENT.includes(e.name) || said?.meta?.machine)) return said
      const found = find([e.title ?? '', ...leaves(e.args)].join('\n'))
      if (!found.length) return said
      say.told?.(found, 'call')
      return then === 'never' ? { decision: 'never', reason: say.reason(found) }
        : { decision: STRICT[said?.decision] > STRICT.ask ? said.decision : 'ask', meta: { ...said?.meta, guard: 'dlp', why: say.why(found) } }
    } },
  ]
}
