// Designs' phase 0: the checks behind take 8's mark, made with no brain. A part's words are read
// for dates in the design's language through Intl (its weekdays and months as that language writes
// them, its digits, Japanese's 月 and 日), then checked: a weekday that isn't its date's, a reply-by date
// after the event; a gap the brain left, such as [Time]; words fainter than
// WCAG AA on their ground; a picture too small to print sharp; words in a home printer's margin.
// Pure, so node --test runs it.

/** @typedef {{ id: string, role: string, text?: string, box?: number[], color?: string, ground?: string, pt?: number, bold?: boolean, px?: number[] }} Part */
/** The page in its units; mm: millimetres per unit, for a size on paper. @typedef {{ w: number, h: number, mm?: number }} Page */
/** @typedef {{ lang: string, parts: Part[], page?: Page, ground?: string }} Design */
/** @typedef {{ index: number, start: number, end: number, short: boolean }} Weekday */
/** Where in the words (UTF-16 offsets), the day, month (1 to 12), year when written, and weekday when named. @typedef {{ start: number, end: number, day: number, month: number, year?: number, weekday?: Weekday }} Found */
/** @typedef {{ part: string, kind: 'gap' | 'weekday' | 'reply' | 'faint' | 'soft' | 'margin', fix?: string, gap?: string, year?: number, ratio?: number, dpi?: number }} Mark */

const DAY = 86_400_000
// A date written without its year is this year's, unless that was more than this long ago.
const BACK = 60 * DAY
// Below this, a picture prints soft.
const SHARP = 200
// What a home printer leaves white at a sheet's edges.
const EDGE_MM = 5
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
const LETTER = /\p{L}/u
// A gap: words in square brackets, as a brain writes one, or full-width ones in Japanese and Chinese.
const GAP = /\[[^\]\n]{1,40}\]|［[^］\n]{1,40}］/g

/**
 * The words as compared, with where each of their UTF-16 units comes from: lower case, without
 * accents, vowel marks or tashkeel, one alef, Arabic-Indic and Persian digits as ASCII, full-width
 * forms as plain ones; kana and kanji as they are.
 * @param {string} text @param {string} lang @returns {{ norm: string, map: number[] }}
 */
function folded(text, lang) {
  let norm = ''
  /** @type {number[]} */
  const map = []
  for (let i = 0; i < text.length;) {
    const point = /** @type {number} */ (text.codePointAt(i))
    const char = String.fromCodePoint(point)
    let out
    if (point >= 0x660 && point <= 0x669) out = String(point - 0x660)
    else if (point >= 0x6f0 && point <= 0x6f9) out = String(point - 0x6f0)
    else if (CJK.test(char)) out = char.normalize('NFKC')
    else out = char.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase(lang).replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
    norm += out
    for (let unit = 0; unit < out.length; unit++) map.push(i)
    i += char.length
  }
  map.push(text.length)
  return { norm, map }
}

/** The words as compared (see folded): what npm run designs matches facts in. @param {string} text @param {string} lang */
export const fold = (text, lang) => folded(text, lang).norm

/** @type {Map<string, { weekdays:{ name: string, index: number, short: boolean }[], months: { name: string, month: number }[] }>} */
const NAMES = new Map()

/** Each weekday's and month's names in a language, as Intl writes them, folded, longest first. @param {string} lang */
function namesOf(lang) {
  const known = NAMES.get(lang)
  if (known) return known
  // Arabic names its months three ways: Egypt's and the Gulf's, the Maghreb's, the Levant's.
  const locales = lang.startsWith('ar') ? [lang, 'ar-MA', 'ar-SY'] : [lang]
  const write = (/** @type {string} */ locale, /** @type {Intl.DateTimeFormatOptions} */ options, /** @type {number} */ at, /** @type {string} */ part) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', calendar: 'gregory', ...options }).formatToParts(at).find((one) => one.type === part)?.value ?? ''
  const fold = (/** @type {string} */ name) => folded(name, lang).norm.replace(/\.$/, '').trim()
  /** @type {{ name: string, index: number, short: boolean }[]} */
  const weekdays = []
  // 1 November 2026 is a Sunday, weekday 0.
  for (let index = 0; index < 7; index++) {
    for (const locale of locales) {
      const at = Date.UTC(2026, 10, 1 + index)
      weekdays.push({ name: fold(write(locale, { weekday: 'long' }, at, 'weekday')), index, short: false })
      weekdays.push({ name: fold(write(locale, { weekday: 'short' }, at, 'weekday')), index, short: true })
    }
  }
  /** @type {{ name: string, month: number }[]} */
  const months = []
  for (let month = 1; month <= 12; month++) {
    for (const locale of locales) {
      const at = Date.UTC(2026, month - 1, 12)
      for (const options of /** @type {Intl.DateTimeFormatOptions[]} */ ([{ day: 'numeric', month: 'long' }, { month: 'long' }, { day: 'numeric', month: 'short' }, { month: 'short' }])) {
        const name = fold(write(locale, options, at, 'month'))
        // Japanese and Chinese months are numbers, read by their own pattern.
        if (name && !/^\d+$/.test(name) && !name.endsWith('月')) months.push({ name, month })
      }
    }
  }
  const unique = /** @template {{ name: string }} T @param {T[]} list */ (list) => [...new Map(list.filter((one) => one.name.length > 1 || CJK.test(one.name)).map((one) => [one.name + JSON.stringify(one), one])).values()]
    .sort((a, b) => b.name.length - a.name.length)
  const names = { weekdays: unique(weekdays), months: unique(months) }
  NAMES.set(lang, names)
  return names
}

/** Every place `name` stands as a word of its own in `norm`. @param {string} norm @param {string} name */
function* wordsAt(norm, name) {
  for (let at = norm.indexOf(name); at >= 0; at = norm.indexOf(name, at + 1)) {
    const before = norm[at - 1] ?? ''
    const after = norm[at + name.length] ?? ''
    if (CJK.test(name) || (!LETTER.test(before) && !LETTER.test(after) && !/\d/.test(after))) yield at
  }
}

/**
 * The dates the words hold, in the order written: a day by a month (14 November, November 14,
 * 14 de noviembre, 14. November, ngày 14 tháng 11, ١٤ نوفمبر, 11月14日), its year when written after it,
 * and the weekday named beside it, if any.
 * @param {string} text @param {string} lang @returns {Found[]}
 */
export function readDates(text, lang) {
  const { norm, map } = folded(text, lang)
  const { weekdays, months } = namesOf(lang)
  /** @type {{ start: number, end: number, day: number, month: number, year?: number }[]} */
  const spans = []
  const taken = (/** @type {number} */ start, /** @type {number} */ end) => spans.some((one) => start < one.end && end > one.start)
  for (const match of norm.matchAll(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*[月월]\s*(\d{1,2})\s*[日일]/g)) {
    const at = /** @type {number} */ (match.index)
    spans.push({ start: at, end: at + match[0].length, day: Number(match[3]), month: Number(match[2]), ...(match[1] ? { year: Number(match[1]) } : {}) })
  }
  for (const { name, month } of months) {
    for (const at of wordsAt(norm, name)) {
      const end = at + name.length
      if (taken(at, end)) continue
      const before = /(?<!\d)(\d{1,2})(?:er|st|nd|rd|th)?\.?,?\s*(?:de\s+)?$/.exec(norm.slice(Math.max(0, at - 12), at))
      const after = before ? null : /^\s*(\d{1,2})(?:st|nd|rd|th)?(?!\d)/.exec(norm.slice(end, end + 8))
      const day = Number((before ?? after)?.[1] ?? 0)
      if (day < 1 || day > 31) continue
      const start = before ? at - before[0].length : at
      const stop = after ? end + after[0].length : end
      const year = /^\s*,?\s*(?:de\s+)?(\d{4})(?!\d)/.exec(norm.slice(stop, stop + 10))
      spans.push({ start, end: year ? stop + year[0].length : stop, day, month, ...(year ? { year: Number(year[1]) } : {}) })
    }
  }
  return spans.sort((a, b) => a.start - b.start).map((span) => {
    const near = (/** @type {number} */ at, /** @type {number} */ length, /** @type {number} */ room) => at + length >= span.start - room && at <= span.end + room
    /** @type {Weekday | undefined} */
    let weekday
    for (const { name, index, short } of weekdays) {
      if (weekday) break
      for (const at of wordsAt(norm, name)) {
        // A short name only right by its date, and a Japanese one-character name only in brackets, (木).
        if (short && CJK.test(name) && name.length === 1 && !(/[(（]\s*$/.test(norm.slice(0, at)) && /^\s*[)）]/.test(norm.slice(at + 1)))) continue
        if (!near(at, name.length, short ? 6 : 24)) continue
        weekday = { index, start: map[at], end: map[at + name.length], short }
        break
      }
    }
    return { start: map[span.start], end: map[span.end], day: span.day, month: span.month, ...(span.year ? { year: span.year } : {}), ...(weekday ? { weekday } : {}) }
  })
}

/** The year a date belongs to: the one written, else this year's, unless it was long ago. @param {Found} found @param {Date} now */
function yearOf(found, now) {
  if (found.year) return found.year
  const year = now.getUTCFullYear()
  return Date.UTC(year, found.month - 1, found.day) < now.getTime() - BACK ? year + 1 : year
}

/** A weekday's name in a language, long or short, its first letter's case as `as` had it. @param {number} index @param {boolean} short @param {string} lang @param {string} as */
function weekdayName(index, short, lang, as) {
  const name = new Intl.DateTimeFormat(lang, { timeZone: 'UTC', calendar: 'gregory', weekday: short ? 'short' : 'long' }).format(Date.UTC(2026, 10, 1 + index))
  const upper = as[0] !== as[0].toLocaleLowerCase(lang)
  return (upper ? name[0].toLocaleUpperCase(lang) : name[0].toLocaleLowerCase(lang)) + name.slice(1)
}

/** WCAG's contrast ratio of two colours, #rgb or #rrggbb. @param {string} one @param {string} other */
export function contrast(one, other) {
  const luminance = (/** @type {string} */ hex) => {
    const digits = hex.replace('#', '')
    const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [high, low] = [luminance(one), luminance(other)].sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

/** The dots per inch a picture of `px` pixels across prints at over `mm` millimetres. @param {number} px @param {number} mm */
export const dpi = (px, mm) => px / (mm / 25.4)

/**
 * What take 8 marks on a design, part by part in their order, and for each part: a gap, a weekday
 * that isn't its date's (with the right one as its fix), a small print's date after the event, faint
 * words, a soft picture, words in the printer's margin. No "past": the dates a design holds that are
 * gone by are rarely its event's (a cat lost on 20 October), and phase 0 found it raised false alarms alone.
 * @param {Design} design @param {{ now: Date }} options @returns {Mark[]}
 */
export function marks(design, { now }) {
  /** @type {Mark[]} */
  const out = []
  const { lang, page } = design
  const when = design.parts.find((part) => part.role === 'when')
  const [first] = when?.text ? readDates(when.text, lang) : []
  const event = first ? Date.UTC(yearOf(first, now), first.month - 1, first.day) : undefined
  for (const part of design.parts) {
    const text = part.text ?? ''
    for (const match of text.matchAll(GAP)) out.push({ part: part.id, kind: 'gap', gap: match[0] })
    const dates = text ? readDates(text, lang) : []
    for (const found of dates) {
      const year = yearOf(found, now)
      const actual = new Date(Date.UTC(year, found.month - 1, found.day)).getUTCDay()
      const said = found.weekday
      if (said && said.index !== actual) {
        out.push({ part: part.id, kind: 'weekday', year, fix: text.slice(0, said.start) + weekdayName(actual, said.short, lang, text.slice(said.start, said.end)) + text.slice(said.end) })
      }
    }
    if (part.role === 'small' && event !== undefined && dates.some((found) => Date.UTC(yearOf(found, now), found.month - 1, found.day) > event)) out.push({ part: part.id, kind: 'reply' })
    const ground = part.ground ?? design.ground
    if (text && part.color && ground) {
      const ratio = contrast(part.color, ground)
      const large = (part.pt ?? 0) >= 18 || (Boolean(part.bold) && (part.pt ?? 0) >= 14)
      if (ratio < (large ? 3 : 4.5)) out.push({ part: part.id, kind: 'faint', ratio: Math.round(ratio * 100) / 100 })
    }
    if (part.role === 'picture' && part.px && part.box && page?.mm) {
      const sharp = dpi(part.px[0], part.box[2] * page.mm)
      if (sharp < SHARP) out.push({ part: part.id, kind: 'soft', dpi: Math.round(sharp) })
    }
    if (text && part.box && page?.mm) {
      const edge = EDGE_MM / page.mm
      const [x, y, w, h] = part.box
      if (x < edge || y < edge || page.w - (x + w) < edge || page.h - (y + h) < edge) out.push({ part: part.id, kind: 'margin' })
    }
  }
  return out
}
