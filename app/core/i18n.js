// Messages, plurals and direction. Host-agnostic: the UI injects a loader.
// Catalogs are flat { key: string | { one, other, … } } objects; English is the fallback.
import { signal } from '@preact/signals-core'

const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb'])

// The 46 languages (docs/architecture.md#languages-i18n), machine-translated (D44).
export const LOCALES = ['am', 'ar', 'bg', 'bn', 'br', 'co', 'cs', 'da', 'de', 'el', 'en', 'es', 'fa', 'fi', 'fr', 'fr-CA', 'ha', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'ko', 'mr', 'ms', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sv', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'yo', 'zh-Hans', 'zh-Hant']

export const locale = signal('en')

// Browsers lack Corsican's data, Chromium Breton's dates and name: Intl writes as their region, in French (D496).
const SPARSE = /** @type {Record<string, { name: string, intl: string[] }>} */ ({ br: { name: 'Brezhoneg', intl: ['br', 'fr'] }, co: { name: 'Corsu', intl: ['fr'] } })

/** The locales Intl formats a catalogue's language in. @param {string} [lang] */
export const intlLocales = (lang = locale.value) => SPARSE[lang]?.intl ?? [lang]

/** @type {Map<string, Record<string, any>>} */
const catalogs = new Map()
/** @type {(lang: string, part: string) => Promise<Record<string, any> | null>} */
let loader = async () => null
// A catalog comes in parts: the room's (''), then others the first time a module asks for
// them (the dialogs', D97). `${lang}/${part}` for each part loaded.
const parts = new Set([''])
const fetched = new Set()

/** @param {(lang: string, part: string) => Promise<Record<string, any> | null>} fn */
export const setLoader = (fn) => { loader = fn }

/**
 * Every catalog has every key (test/locales.test.js), so English, the fallback, is only
 * fetched when the catalog itself can't be. @param {string} lang @param {string} part
 */
async function load(lang, part) {
  for (const code of [lang, 'en']) {
    const messages = fetched.has(`${code}/${part}`) ? null : await loader(code, part)
    if (messages) {
      catalogs.set(code, { ...catalogs.get(code), ...messages })
      fetched.add(`${code}/${part}`)
    }
    if (fetched.has(`${code}/${part}`)) break
  }
}

/** Load every part in use, then switch. @param {string} lang */
export async function useLocale(lang) {
  await Promise.all([...parts].map((part) => load(lang, part)))
  locale.value = lang
}

/** Loads a part of the catalog, in the current language and every later one. @param {string} part */
export async function useStrings(part) {
  parts.add(part)
  await load(locale.peek(), part)
}

/** Translate a key. Reading `locale.value` makes callers reactive. @param {string} key @param {Record<string, string | number>} [params] */
export function t(key, params = {}) {
  const lang = locale.value
  let entry = catalogs.get(lang)?.[key] ?? catalogs.get('en')?.[key] ?? key
  if (typeof entry === 'object') {
    const count = Number(params.count ?? 0)
    entry = entry[new Intl.PluralRules(intlLocales(lang)).select(count)] ?? entry.other ?? ''
  }
  return String(entry).replace(/\{(\w+)\}/g, (match, name) => (name in params ? format(params[name], lang) : match))
}

/** t(), with values that aren't text (a link, a time) kept where the translation puts them, never joined to strings. @param {string} key @param {Record<string, unknown>} params */
export function tParts(key, params) {
  const kept = /** @type {unknown[]} */ ([])
  const text = t(key, Object.fromEntries(Object.entries(params).map(([name, value]) => [name, typeof value === 'string' || typeof value === 'number' ? value : `\u0000${kept.push(value) - 1}\u0000`])))
  return text.split(/\u0000(\d+)\u0000/).map((part, i) => (i % 2 ? kept[Number(part)] : part))
}

/** @param {string | number} value @param {string} lang */
const format = (value, lang) => (typeof value === 'number' ? new Intl.NumberFormat(intlLocales(lang)).format(value) : value)

/** @param {string} [lang] @returns {'rtl' | 'ltr'} */
export const dir = (lang = locale.value) => (RTL.has(lang.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr')

/** Name of a language, written in `inLang` (defaults to itself). */
export function languageName(/** @type {string} */ code, inLang = code) {
  try {
    const name = (code === inLang && SPARSE[code]?.name) || (new Intl.DisplayNames(intlLocales(inLang), { type: 'language' }).of(code) ?? code)
    return name.charAt(0).toLocaleUpperCase(inLang) + name.slice(1)
  } catch {
    return code
  }
}

/** Available locales that match the user's preferences, in their order, without repeats. @param {string[]} available @param {readonly string[]} preferred e.g. navigator.languages */
export function preferredLocales(available, preferred) {
  /** @type {string[]} */
  const found = []
  for (const wanted of preferred) {
    const match = available.find((code) => code.toLowerCase() === wanted.toLowerCase())
      ?? available.find((code) => languageAndScript(code) === languageAndScript(wanted))
    if (match && !found.includes(match)) found.push(match)
  }
  return found
}

/** Best available locale for the user's preferences. @param {string[]} available @param {readonly string[]} preferred e.g. navigator.languages */
export const pickLocale = (available, preferred) => preferredLocales(available, preferred)[0] ?? (available.includes('en') ? 'en' : available[0])

// Browsers say "fil" for the Filipino that the "tl" catalogue is written in.
/** @type {Record<string, string>} */
const SAME_LANGUAGE = { fil: 'tl' }

/** Language and likely script, so zh-TW meets zh-Hant and pt-BR meets pt. @param {string} code */
function languageAndScript(code) {
  try {
    const { language, script } = new Intl.Locale(code).maximize()
    return `${SAME_LANGUAGE[language] ?? language}-${script}`
  } catch {
    return null
  }
}

/** "14 MB", in the current locale. @param {number} bytes */
export function formatBytes(bytes) {
  const [unit, size] = bytes >= 1e9 ? ['gigabyte', bytes / 1e9] : bytes >= 1e6 ? ['megabyte', bytes / 1e6] : ['kilobyte', bytes / 1e3]
  return new Intl.NumberFormat(intlLocales(), { style: 'unit', unit, maximumFractionDigits: 1 }).format(size)
}

/** "527 ms", "1.2 sec", "1 min, 12 sec", in the current locale: to the tenth of a second under ten, else to the second. @param {number} ms */
export function formatDuration(ms) {
  const tenths = Math.floor(ms / 100) % 10
  const whole = Math.round(ms / 1e3)
  const [duration, options] = ms < 999.5 ? [{ milliseconds: Math.round(ms) }, {}]
    : ms < 1e4 && tenths ? [{ seconds: Math.floor(ms / 1e3), milliseconds: tenths * 100 }, /** @type {const} */ ({ milliseconds: 'numeric', fractionalDigits: 1 })]
    : [{ hours: Math.floor(whole / 3600), minutes: Math.floor(whole / 60) % 60, seconds: whole % 60 }, {}]
  return new Intl.DurationFormat(intlLocales(), { style: 'short', ...options }).format(duration)
}

/** "3 minutes ago", in the current locale. @param {string | number | Date} when */
export function relativeTime(when, now = Date.now()) {
  const seconds = Math.round((new Date(when).getTime() - now) / 1000)
  const units = /** @type {const} */ ([['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]])
  const rtf = new Intl.RelativeTimeFormat(intlLocales(), { numeric: 'auto' })
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  return rtf.format(0, 'second')
}

/** First words of a text, segmented per language (works for CJK and Thai). @param {string} text */
export function firstWords(text, max = 8) {
  const segmenter = new Intl.Segmenter(locale.value, { granularity: 'word' })
  let words = 0
  let out = ''
  for (const { segment, isWordLike } of segmenter.segment(text.replace(/\s+/g, ' ').trim())) {
    if (isWordLike && ++words > max) return out.trim() + '…'
    out += segment
  }
  return out.trim()
}
