// Designs' phase 0: what the brain is given (take 8) and what Jean makes of what it sends. The brain
// writes facts by their role, never coordinates; Jean repairs what a small brain gets wrong (a size it
// doesn't know, no title, words that aren't text) rather than refusing it, since every brain gets
// Designs. Pure.
import { readDates } from './checks.js'

/** @typedef {{ title: string, words?: string, items?: string, when?: string, where?: string, who?: string, small?: string }} Words */
/** @typedef {{ name: string, size: string, occasion?: string, words: Words, date?: string, pictures: { describe: string }[] }} Facts */

export const SIZES = ['a5', 'a6', 'a4', 'letter', 'square', 'story', 'wide']
export const ROLES = /** @type {const} */ (['title', 'words', 'items', 'when', 'where', 'who', 'small'])
// The first wording measured (A, findings.md): no list, and a gap for any fact missing.
export const DESCRIPTION_A = "Lay out something to print, post or send as a picture: an invitation, a poster, a flyer, a card, a menu, a certificate, a post. Jean lays it out three ways beside the conversation, and the user finishes it by hand. Give the user's facts by their role, in the user's language, as the user gave them: never make up a date, time, place, name, price or phone number. Where the design needs a fact the user didn't give, write a gap in square brackets in the user's language, such as [Time] or [Phone]."
/** Each size's page: tenths of a millimetre on paper (mm: 0.1), pixels on a screen. @type {Record<string, import('./checks.js').Page>} */
export const PAGES = {
  a5: { w: 1480, h: 2100, mm: 0.1 }, a6: { w: 1050, h: 1480, mm: 0.1 }, a4: { w: 2100, h: 2970, mm: 0.1 }, letter: { w: 2159, h: 2794, mm: 0.1 },
  square: { w: 1080, h: 1080 }, story: { w: 1080, h: 1920 }, wide: { w: 1920, h: 1080 },
}

export const LINE = { name: 'design', line: 'lay out an invitation, poster, flyer or post the user can change, print and send' }
export const RULE = "Something to print, post or send as a picture is a design: keep the user's facts, and leave a gap for any that's missing."

const TEXT = { type: 'string' }
/** @type {import('../../app/core/types.js').ToolSpec} */
export const DESIGN = {
  name: 'design',
  description: "Lay out something to print, post or send as a picture: an invitation, a poster, a flyer, a card, a menu, a certificate, a post. Jean lays it out three ways beside the conversation, and the user finishes it by hand. Give every one of the user's facts, by its role, in the user's language, as the user gave it: never make up a date, time, place, name, price or phone number. Only where the design can't do without a fact the user didn't give, such as a lost pet's phone number, write a gap in square brackets in the user's language, such as [Phone]. Leave out what it doesn't need.",
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: "Its name, in the user's language" },
      size: { type: 'string', enum: SIZES, description: 'a5 for an invitation or a flyer, a6 for a card, a4 or letter for a poster, a menu or a certificate, square for a post, story for a phone\'s story, wide for a banner or a screen' },
      occasion: { type: 'string', description: "What it's for and its feel, in a few words" },
      words: {
        type: 'object',
        description: "The design's words, each in its role",
        properties: {
          title: { type: 'string', description: 'The big words' },
          words: { type: 'string', description: 'What it says, in a line or two' },
          items: { type: 'array', items: { type: 'string' }, description: 'A list, one item each: dishes, things for sale, a programme' },
          when: { type: 'string', description: 'The day and time, as the user gave them' },
          where: { type: 'string', description: 'The place' },
          who: { type: 'string', description: "Who it's from, or for" },
          small: { type: 'string', description: 'Small print: how to reply, a price, a note' },
        },
        required: ['title'],
      },
      date: { type: 'string', description: "The event's date and time in ISO 8601 (2026-11-14T15:00), if it announces one" },
      pictures: { type: 'array', description: 'Pictures to make for it, each described in detail', items: { type: 'object', properties: { describe: { type: 'string' } }, required: ['describe'] } },
    },
    required: ['name', 'size', 'words'],
  },
}

/** The tool as first measured (A): the first wording, and no list among the words. @type {import('../../app/core/types.js').ToolSpec} */
export const DESIGN_A = (() => {
  const parameters = /** @type {{ properties: { words: { properties: Record<string, unknown> } } }} */ (structuredClone(DESIGN.parameters))
  delete parameters.properties.words.properties.items
  return { ...DESIGN, description: DESCRIPTION_A, parameters }
})()

/** The third measured (C): the first wording's gaps, the list, and "numbers too". @type {import('../../app/core/types.js').ToolSpec} */
export const DESIGN_C = { ...DESIGN, description: "Lay out something to print, post or send as a picture: an invitation, a poster, a flyer, a card, a menu, a certificate, a post. Jean lays it out three ways beside the conversation, and the user finishes it by hand. Give every fact the user gave, numbers too (an age, a date, a price), by its role, in the user's language, as the user gave it; never make up a date, time, place, name, price or phone number. Where the design needs a fact the user didn't give, write a gap in square brackets in the user's language, such as [Time] or [Phone]." }

/** What Jean takes from design, as a JSON Schema a server can hold a brain's decoding to (STRICT). */
export const STRICT = {
  type: 'object',
  properties: {
    name: TEXT,
    size: { enum: SIZES },
    occasion: TEXT,
    words: { type: 'object', properties: Object.fromEntries(ROLES.map((role) => [role, role === 'items' ? { type: 'array', items: TEXT } : TEXT])), required: ['title'], additionalProperties: false },
    date: TEXT,
    pictures: { type: 'array', items: { type: 'object', properties: { describe: TEXT }, required: ['describe'], additionalProperties: false } },
  },
  required: ['name', 'size', 'words'],
  additionalProperties: false,
}

const ARGS = Object.keys(STRICT.properties)
// What a brain's own tool-call template can leave in an argument: Qwen's <parameter=…>, </parameter>,
// <function=…> and <tool_call>, or an argument or a role as a tag of its own (<title>, <pictures>).
const TAG = new RegExp(`<(/?)(?:parameter(?:=(\\w+))?|function(?:=\\w+)?|tool_call|(${[...new Set([...ROLES, ...ARGS])].join('|')}))\\s*>`, 'g')
const LITERALS = /** @type {Record<string, unknown>} */ ({ true: true, false: false, null: null, True: true, False: false, None: null })
const ESCAPES = /** @type {Record<string, string>} */ ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' })

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value.replace(TAG, '').trim() : typeof value === 'number' ? String(value) : '')

/**
 * A value written as JSON, or nearly: in either quote ('…', as Python writes a dict), keys unquoted,
 * a comma or a brace too many. What it read before anything it couldn't is kept, and whole says
 * whether that was everything.
 * @param {string} source @returns {{ value: unknown, whole: boolean }}
 */
function loose(source) {
  let at = 0
  let whole = true
  const skip = () => { while (/[\s,]/.test(source[at] ?? '')) at++ }
  const stop = () => { whole = false; at = source.length }
  /** @param {boolean} [key] @returns {unknown} */
  const value = (key = false) => {
    skip()
    const char = source[at]
    if (char === '[') {
      /** @type {unknown[]} */
      const list = []
      for (at++, skip(); at < source.length && source[at] !== ']'; skip()) list.push(value())
      at++
      return list
    }
    if (char === '{') {
      /** @type {Record<string, unknown>} */
      const object = {}
      for (at++, skip(); at < source.length && source[at] !== '}'; skip()) {
        const name = String(value(true))
        const colon = /^\s*:/.exec(source.slice(at))
        if (!colon) stop()
        else {
          at += colon[0].length
          object[name] = value()
        }
      }
      at++
      return object
    }
    if (char === '"' || char === "'") {
      let read = ''
      for (at++; at < source.length && source[at] !== char; at++) {
        if (source[at] !== '\\') read += source[at]
        else if (source[++at] === 'u') {
          read += String.fromCharCode(Number.parseInt(source.slice(at + 1, at + 5), 16))
          at += 4
        } else read += ESCAPES[source[at]] ?? source[at]
      }
      at++
      return read
    }
    const bare = /^[^,:{}[\]]*/.exec(source.slice(at))?.[0] ?? ''
    const word = bare.trim()
    at += bare.length
    if (key && word) return word
    if (Object.hasOwn(LITERALS, word)) return LITERALS[word]
    if (word && !Number.isNaN(Number(word))) return Number(word)
    stop()
    return undefined
  }
  const read = value()
  return { value: read, whole: whole && /^[\s,}\]]*$/.test(source.slice(at)) }
}

/**
 * An argument a brain sent as text that its tool-call template got into, read back into the arguments
 * it holds: JSON, or nearly (loose), and arguments or roles in the template's tags, the first part
 * being the argument itself. A list is taken only when it reads whole, so a gap such as [Phone] stays
 * words, and a part never replaces one read before it. Null for text that is only text.
 * @param {string} source @param {string} [first] the argument it was given as
 * @returns {Record<string, unknown> & { words: Record<string, unknown> } | null}
 */
function fromText(source, first = 'words') {
  /** @type {Record<string, unknown>} */
  const words = {}
  const args = /** @type {Record<string, unknown> & { words: Record<string, unknown> }} */ ({ words })
  let name = first
  let at = 0
  let read = false
  const take = (/** @type {string} */ part) => {
    const one = part.trim()
    if (!one) return
    const { value, whole } = /^[[{]/.test(one) ? loose(one) : { value: one, whole: false }
    const json = Boolean(value) && typeof value === 'object' && (Array.isArray(value) ? whole : Object.keys(/** @type {object} */ (value)).length > 0)
    read ||= json
    if (name === 'words' && json && !Array.isArray(value)) Object.assign(words, value)
    else if (name !== 'words' && ARGS.includes(name)) args[name] ??= json ? value : one
    else words[name] ??= json ? value : one
  }
  for (const match of source.matchAll(TAG)) {
    take(source.slice(at, match.index))
    at = /** @type {number} */ (match.index) + match[0].length
    name = (!match[1] && (match[2] ?? match[3])) || first
    read = true
  }
  take(source.slice(at))
  return read ? args : null
}

/**
 * The facts Jean lays out from what the brain sent, and what it had to repair: an unknown size (A5),
 * no title (the name), words that weren't text, the brain's template in what it sent (its tags
 * stripped), words given as text, read back into their roles when the template got into them (JSON,
 * or its tags) and flat otherwise, roles beside words, a list under a name of the brain's own (dishes:
 * the list), the event's date given only as ISO 8601 (written into when, as the language writes a
 * date). Null when there is nothing to lay out at all.
 * @param {unknown} args @param {string} [lang] @returns {{ facts: Facts, repairs: string[] } | null}
 */
export function repair(args, lang = 'en') {
  if (!args || typeof args !== 'object') return null
  let given = /** @type {Record<string, unknown>} */ (args)
  /** @type {string[]} */
  const repairs = []
  if (JSON.stringify(given).search(TAG) >= 0) repairs.push('template tags')
  // The template can get into any argument given as text: what follows its tags goes to the arguments
  // they name, roles among them beside words, filling what the brain didn't give.
  for (const [key, value] of Object.entries(given)) {
    if (key === 'words' || typeof value !== 'string' || value.search(TAG) < 0) continue
    const read = /** @type {NonNullable<ReturnType<typeof fromText>>} */ (fromText(value, key))
    given = { ...read.words, ...read, ...given, [key]: read[key] ?? read.words[key] }
  }
  let source = given.words
  if (typeof source === 'string') {
    const read = fromText(source)
    repairs.push(read ? 'words as text' : 'words flat')
    // What the template carried along with the words (pictures) fills what the brain didn't give beside them.
    if (read) given = { ...read, ...given }
    source = read ? read.words : { words: source }
  }
  const roles = /** @type {Record<string, unknown>} */ ({ ...(source && typeof source === 'object' ? source : {}) })
  // Some brains put the roles beside words rather than in it, or a few of them.
  const beside = ROLES.filter((role) => role !== 'words' && given[role] !== undefined && roles[role] === undefined)
  if (beside.length) repairs.push('roles beside words')
  for (const role of beside) roles[role] = given[role]
  /** @type {Record<string, string>} */
  const words = {}
  for (const role of ROLES) {
    const value = roles[role]
    if (value === undefined || value === null) continue
    const one = Array.isArray(value) ? value.map(text).filter(Boolean).join('\n') : text(value)
    if ((Array.isArray(value) && role !== 'items') || (!Array.isArray(value) && typeof value !== 'string' && one)) repairs.push(`${role} not text`)
    if (one) words[role] = one
  }
  // Words under a name of the brain's own (dishes, programme, menu…) are the list.
  for (const [key, value] of Object.entries(roles)) {
    if (/** @type {readonly string[]} */ (ROLES).includes(key)) continue
    const one = Array.isArray(value) ? value.map((item) => (typeof item === 'object' && item ? Object.values(item).map(text).filter(Boolean).join(': ') : text(item))).filter(Boolean).join('\n') : text(value)
    if (!one) continue
    repairs.push(`${key} as items`)
    words.items = words.items ? `${words.items}\n${one}` : one
  }
  const name = text(given.name)
  if (!words.title) {
    if (!name && !Object.keys(words).length) return null
    repairs.push('no title')
    words.title = name || /** @type {string} */ (Object.values(words)[0])
  }
  let size = text(given.size).toLowerCase()
  if (!SIZES.includes(size)) {
    repairs.push(size ? `size ${size}` : 'no size')
    size = 'a5'
  }
  const pictures = Array.isArray(given.pictures) ? given.pictures.map((one) => ({ describe: text(typeof one === 'string' ? one : one?.describe) })).filter((one) => one.describe) : []
  const date = text(given.date)
  // A date the brain gave only as ISO 8601 goes into when, as the language writes it, so the design shows it.
  const day = Date.parse(date.slice(0, 10))
  if (!Number.isNaN(day) && !readDates(words.when ?? '', lang).length) {
    const written = new Intl.DateTimeFormat(lang, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(day)
    words.when = [written[0].toLocaleUpperCase(lang) + written.slice(1), words.when].filter(Boolean).join(' · ')
    repairs.push('date into when')
  }
  return { facts: { name: name || words.title, size, occasion: text(given.occasion), words: /** @type {Words} */ (words), ...(date ? { date } : {}), pictures }, repairs }
}

/** A design's text parts, in reading order, for the checks. @param {Facts} facts @param {string} lang */
export const partsOf = (facts, lang) => ({
  lang,
  page: PAGES[facts.size],
  parts: ROLES.filter((role) => facts.words[role]).map((role) => ({ id: role, role, text: facts.words[role] })),
})
