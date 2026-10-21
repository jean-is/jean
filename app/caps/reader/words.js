// The natural voice's text with its numbers in words (D455): amounts, measures, dates, times, ranges and
// ordinals written out in the language it reads, as Pocket TTS learnt to read them; in digits, or with a
// symbol such as €, it stumbles and loops. The names of currencies, units and months are Intl's, and each
// line of the answer ends a sentence, without its bullet. Tested under node --test.

/** 0 to 19 (29 in Spanish), the tens from twenty, and the hundreds where they are words of their own. */
const WORDS = Object.fromEntries(Object.entries({
  en: ['zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen', 'twenty thirty forty fifty sixty seventy eighty ninety'],
  fr: ['zéro un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize dix-sept dix-huit dix-neuf', 'vingt trente quarante cinquante soixante soixante quatre-vingt quatre-vingt'],
  de: ['null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn', 'zwanzig dreißig vierzig fünfzig sechzig siebzig achtzig neunzig'],
  es: ['cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro veinticinco veintiséis veintisiete veintiocho veintinueve', 'veinte treinta cuarenta cincuenta sesenta setenta ochenta noventa', 'ciento doscientos trescientos cuatrocientos quinientos seiscientos setecientos ochocientos novecientos'],
  it: ['zero uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove', 'venti trenta quaranta cinquanta sessanta settanta ottanta novanta'],
  pt: ['zero um dois três quatro cinco seis sete oito nove dez onze doze treze catorze quinze dezesseis dezessete dezoito dezenove', 'vinte trinta quarenta cinquenta sessenta setenta oitenta noventa', 'cento duzentos trezentos quatrocentos quinhentos seiscentos setecentos oitocentos novecentos'],
}).map(([lang, lists]) => [lang, lists.map((list) => list.split(' '))]))
/** A thousand, a million and a billion, alone and after a number; the words for a decimal point, minus, a range and "about". */
const TERMS = /** @type {Record<string, string>} */ ({
  en: 'one thousand|thousand,one million|million,one billion|billion;point;minus;to;about',
  fr: 'mille|mille,un million|millions,un milliard|milliards;virgule;moins;à;environ',
  de: 'tausend|tausend,eine Million|Millionen,eine Milliarde|Milliarden;Komma;minus;bis;etwa',
  es: 'mil|mil,un millón|millones;coma;menos;a;aproximadamente',
  it: 'mille|mila,un milione|milioni,un miliardo|miliardi;virgola;meno;a;circa',
  pt: 'mil|mil,um milhão|milhões,um bilhão|bilhões;vírgula;menos;a;aproximadamente',
})
/** Symbols after a number, or a currency's before it, as Intl's units and currencies. */
const UNITS = /** @type {Record<string, string>} */ ({ '%': 'percent', '°C': 'celsius', '°F': 'fahrenheit', '°': 'degree', 'km/h': 'kilometer-per-hour', km: 'kilometer', kg: 'kilogram', cm: 'centimeter', mm: 'millimeter', ml: 'milliliter', min: 'minute', g: 'gram', m: 'meter', l: 'liter', L: 'liter', h: 'hour', GB: 'gigabyte', Go: 'gigabyte', MB: 'megabyte', Mo: 'megabyte', '€': 'EUR', $: 'USD', '£': 'GBP' })
const FIRSTS = /** @type {Record<string, string>} */ ({ one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' })

/** Below a hundred; in French, seventy and ninety are sixty and eighty and ten to nineteen. @param {number} n @param {string} lang */
function tens(n, lang) {
  const [ones, list] = WORDS[lang]
  const t = Math.floor(n / 10), u = n % 10, ten = list[t - 2], v = t === 7 || t === 9 ? u + 10 : u
  if (n < ones.length) return ones[n]
  if (lang === 'fr') return ten + (v % 10 === 1 && t < 8 ? ` et ${ones[v]}` : v ? `-${ones[v]}` : t === 8 ? 's' : '')
  if (lang === 'de') return (u ? `${u === 1 ? 'ein' : ones[u]}und` : '') + ten
  if (lang === 'it') return (u === 1 || u === 8 ? ten.slice(0, -1) : ten) + (u === 3 ? 'tré' : u ? ones[u] : '')
  return ten + (u ? `${{ en: '-', es: ' y ', pt: ' e ' }[lang]}${ones[u]}` : '')
}

/** Below a thousand. @param {number} n @param {string} lang */
function hundreds(n, lang) {
  const [ones, , list] = WORDS[lang]
  const h = Math.floor(n / 100), r = n % 100, rest = r ? tens(r, lang) : ''
  if (!h) return rest || ones[0]
  if (lang === 'en') return `${ones[h]} hundred${rest && ` ${rest}`}`
  if (lang === 'fr') return `${h > 1 ? `${ones[h]} ` : ''}cent${h > 1 && !r ? 's' : ''}${rest && ` ${rest}`}`
  if (lang === 'de' || lang === 'it') return `${h > 1 ? ones[h] : ''}${lang === 'de' ? 'hundert' : rest[0] === 'o' ? 'cent' : 'cento'}${rest}`
  return (n === 100 ? { es: 'cien', pt: 'cem' }[lang] : list[h - 1]) + (rest && `${lang === 'es' ? ' ' : ' e '}${rest}`)
}

/** An integer in words, in one of the natural voice's languages. @param {number} n @param {string} lang @returns {string} */
export function number(n, lang) {
  const scales = TERMS[lang].split(';')[0].split(',').map((scale) => scale.split('|'))
  for (let k = scales.length; k > 0; k--) {
    if (n < 1000 ** k) continue
    // German and Italian write a thousand and what follows as one word.
    const q = Math.floor(n / 1000 ** k), r = n % 1000 ** k, tight = k === 1 && (lang === 'de' || lang === 'it'), times = number(q, lang)
    const head = q === 1 ? scales[k - 1][0] : `${lang === 'es' ? times.replace(/uno$/, 'ún') : times}${tight ? '' : ' '}${scales[k - 1][1]}`
    return head + (r ? `${tight ? '' : lang === 'pt' && (r < 100 || r % 100 === 0) ? ' e ' : ' '}${number(r, lang)}` : '')
  }
  return hundreds(n, lang)
}

/** An ordinal in English or French. @param {number} n @param {string} lang @param {string} mark what follows it: 1er, 1re, 2e, 21st */
function ordinal(n, lang, mark) {
  if (lang === 'en') return number(n, lang).replace(/\w+$/, (word) => FIRSTS[word] ?? `${word.replace(/y$/, 'ie')}th`)
  return n === 1 ? (/^[rè]/.test(mark) ? 'première' : 'premier') : `${number(n, lang).replace(/(cent|vingt)s$|e$/, '$1').replace(/q$/, 'qu').replace(/f$/, 'v')}ième`
}

/**
 * The text a voice reads in `lang`: its dates, times, ranges, ordinals, amounts and other numbers in words,
 * each line a sentence of its own; in a language with no words here, as it is. @param {string} text @param {string} lang
 */
export function spelled(text, lang) {
  if (!WORDS[lang]) return text
  const [, point, minus, to, about] = TERMS[lang].split(';')
  const named = (/** @type {Intl.NumberFormatOptions} */ options, /** @type {number} */ value) => new Intl.NumberFormat(lang, options).formatToParts(value).filter(({ type }) => type === 'currency' || type === 'unit').map(({ value }) => value).join('')
  // Decimals as a number of one or two figures, else figure by figure, as English always does.
  const decimals = (/** @type {string} */ figures) => (lang !== 'en' && /^[1-9]\d?$/.test(figures) ? number(+figures, lang) : [...figures].map((figure) => number(+figure, lang)).join(' '))
  return text.replace(/^[ \t]*[-+•][ \t]+/gm, '').replace(/(?<![.!?…:;,])[ \t]*\n/g, '.\n')
    .replace(/(?<![\d.,/])(?:(\d{1,2})([./])(\d{1,2})\2(\d{4})|(\d{4})-(\d{2})-(\d{2}))(?![\d/])/g, (date, a, _, b, year, y, m, d) => {
      // Month first in English, unless the first number can't be a month.
      const [day, month] = y ? [+d, +m] : lang === 'en' && +a <= 12 ? [+b, +a] : [+a, +b]
      return month > 12 || day > 31 || !month || !day ? date : new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(Date.UTC(+(year ?? y), month - 1, day)).replace(/(\d)\. /, '$1 ')
    })
    .replace(lang === 'fr' ? /(?<![\d.,])([01]?\d|2[0-4]) ?[:h] ?([0-5]\d)(?!\d)/g : /(?<![\d.,])([01]?\d|2[0-4]):([0-5]\d)(?!\d)(?: Uhr)?/g,
      (_, hour, minutes) => [hour, { fr: 'h', de: 'Uhr' }[lang], minutes === '00' ? '' : minutes].filter(Boolean).join(' '))
    .replace(/(\d) ?[-–—] ?(?=\d)/g, `$1 ${to} `).replace(/≈ ?/g, `${about} `)
    .replace(lang === 'fr' ? /(?<![\p{L}\p{N}.,])(\d{1,9})(ère|ème|eme|er|re|e|è)(?!\p{L})/gu : /(?<![\p{L}\p{N}.,])(\d{1,9})(st|nd|rd|th)(?!\p{L})/gu, (found, n, mark) => (lang === 'fr' || lang === 'en' ? ordinal(+n, lang, mark) : found))
    .replace(new RegExp(`(?<![\\p{L}\\p{N}.,])([-−](?=[\\d€$£]))?(?:([€$£]) ?)?(\\d{1,3}(?:[${lang === 'en' ? ',' : '. \\u00a0\\u202f'}]\\d{3})+(?!\\d)|\\d+)(?:[.,](\\d+))?(?: ?(km/h|°[CF]|[%°€$£]|kg|km|cm|mm|ml|min|GB|Go|MB|Mo|[gmlLh])(?![\\p{L}\\p{N}]))?`, 'gu'),
      (found, sign, before, whole, part, after) => {
        const figures = whole.replace(/\D/g, ''), unit = UNITS[before ?? after], high = +figures.slice(0, 2), low = +figures.slice(2)
        if (figures.length > 15) return found
        // Years, and hundreds in the thousands, in English and German: nineteen ninety, fünfzehnhundert.
        const said = (lang === 'en' || lang === 'de') && /^1[1-9]\d\d$/.test(figures) && !part && !unit
          ? lang === 'en' ? `${number(high, lang)} ${low ? `${low < 10 ? 'oh ' : ''}${number(low, lang)}` : 'hundred'}` : `${number(high, lang)}hundert${low ? number(low, lang) : ''}`
          : number(+figures, lang)
        const signed = `${sign ? `${minus} ` : ''}${said}`
        if (unit?.length === 3) return `${signed} ${named({ style: 'currency', currency: unit, currencyDisplay: 'name', maximumFractionDigits: 0 }, +figures)}${+(part ?? 0) ? ` ${number(+part.padEnd(2, '0').slice(0, 2), lang)}` : ''}`
        return `${signed}${part ? ` ${point} ${decimals(part)}` : ''}${unit ? ` ${named({ style: 'unit', unit, unitDisplay: 'long' }, +`${figures}.${part ?? 0}`)}` : ''}`
      })
}
