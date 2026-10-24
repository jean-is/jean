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

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '')

/**
 * The facts Jean lays out from what the brain sent, and what it had to repair: an unknown size (A5),
 * no title (the name), words that weren't text, words given flat rather than by role, a list under a
 * name of the brain's own (dishes: the list), the event's date given only as ISO 8601 (written into
 * when, as the language writes a date). Null when there is nothing to lay out at all.
 * @param {unknown} args @param {string} [lang] @returns {{ facts: Facts, repairs: string[] } | null}
 */
export function repair(args, lang = 'en') {
  if (!args || typeof args !== 'object') return null
  const given = /** @type {Record<string, unknown>} */ (args)
  /** @type {string[]} */
  const repairs = []
  let source = given.words
  if (typeof source === 'string') {
    repairs.push('words flat')
    source = { words: source }
  }
  // Some brains put the roles beside words rather than in it.
  if (!source || typeof source !== 'object') {
    source = Object.fromEntries(ROLES.filter((role) => given[role] !== undefined).map((role) => [role, given[role]]))
    if (Object.keys(/** @type {object} */ (source)).length) repairs.push('roles beside words')
  }
  const roles = /** @type {Record<string, unknown>} */ (source)
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
