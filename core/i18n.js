// Messages, plurals and direction. Host-agnostic: the UI injects a loader.
// Catalogs are flat { key: string | { one, other, … } } objects; English is the fallback.
import { signal } from '@preact/signals-core'

const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb'])

export const locale = signal('en')

/** @type {Map<string, Record<string, any>>} */
const catalogs = new Map()
/** @type {(lang: string) => Promise<Record<string, any> | null>} */
let loader = async () => null

/** @param {(lang: string) => Promise<Record<string, any> | null>} fn */
export function setLoader(fn) {
  loader = fn
}

/** @param {string} lang @param {Record<string, any>} messages */
export function addCatalog(lang, messages) {
  catalogs.set(lang, messages)
}

/** Load a catalog (and the English fallback) then switch. @param {string} lang */
export async function useLocale(lang) {
  for (const code of new Set(['en', lang])) {
    if (!catalogs.has(code)) {
      const messages = await loader(code)
      if (messages) catalogs.set(code, messages)
    }
  }
  locale.value = lang
}

/**
 * Translate a key. Reading `locale.value` makes callers reactive.
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 */
export function t(key, params = {}) {
  const lang = locale.value
  let entry = catalogs.get(lang)?.[key] ?? catalogs.get('en')?.[key] ?? key
  if (typeof entry === 'object') {
    const count = Number(params.count ?? 0)
    entry = entry[new Intl.PluralRules(lang).select(count)] ?? entry.other ?? ''
  }
  return String(entry).replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? format(params[name], lang) : match,
  )
}

/** @param {string | number} value @param {string} lang */
function format(value, lang) {
  return typeof value === 'number' ? new Intl.NumberFormat(lang).format(value) : value
}

/** @param {string} [lang] @returns {'rtl' | 'ltr'} */
export function dir(lang = locale.value) {
  const base = lang.split('-')[0].toLowerCase()
  return RTL.has(base) ? 'rtl' : 'ltr'
}

/** Name of a language, written in `inLang` (defaults to itself). */
export function languageName(/** @type {string} */ code, inLang = code) {
  try {
    const name = new Intl.DisplayNames([inLang], { type: 'language' }).of(code) ?? code
    return name.charAt(0).toLocaleUpperCase(inLang) + name.slice(1)
  } catch {
    return code
  }
}

/**
 * Best available locale for the user's preferences.
 * @param {string[]} available
 * @param {readonly string[]} preferred e.g. navigator.languages
 */
export function pickLocale(available, preferred) {
  for (const wanted of preferred) {
    const exact = available.find((code) => code.toLowerCase() === wanted.toLowerCase())
    if (exact) return exact
    const base = available.find((code) => code === wanted.split('-')[0].toLowerCase())
    if (base) return base
  }
  return available.includes('en') ? 'en' : available[0]
}

/** "3 minutes ago", in the current locale. @param {string | number | Date} when */
export function relativeTime(when, now = Date.now()) {
  const seconds = Math.round((new Date(when).getTime() - now) / 1000)
  const units = /** @type {const} */ ([
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ])
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return rtf.format(0, 'second')
}

/**
 * First words of a text, segmented per language (works for CJK and Thai).
 * @param {string} text
 */
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
