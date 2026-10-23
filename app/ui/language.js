// Which language a text is in, and which of the device's voices reads it best. Offline and
// small: the script tells most languages apart; where several share one, their commonest words
// (and letters only one of them uses) do. Not a translator's tool, only a reader's.

/** Scripts one language writes, among those Jean meets. */
const SOLE = /** @type {Record<string, string>} */ ({
  Hangul: 'ko', Thai: 'th', Hebrew: 'he', Greek: 'el', Ethiopic: 'am', Bengali: 'bn', Tamil: 'ta', Telugu: 'te', Gujarati: 'gu',
  Gurmukhi: 'pa', Kannada: 'kn', Malayalam: 'ml', Georgian: 'ka', Armenian: 'hy', Khmer: 'km', Lao: 'lo', Myanmar: 'my', Sinhala: 'si',
})

/** Scripts several languages share, the likeliest first. */
const SHARED = /** @type {Record<string, Record<string, string>>} */ ({
  Latin: {
    en: 'the and is are was of to in it that this you your for with on be have not but they what can will',
    fr: 'le la les des et est un une du que qui pour pas dans ce il elle sur avec au vous nous je ne sont mais',
    es: 'el la los las que y en un una es por con para del se no lo como más pero está este esta son su',
    pt: 'o os as que e em um uma é do da dos das não com para por se mais mas no na ao você está são',
    it: 'il lo gli che di e è un una per non con del della sono si ma come anche questo ho sei hai nel alla',
    de: 'der die das und ist nicht ich sie es ein eine zu mit den von auf für sich auch im dem wir sind du bist',
    nl: 'de het een en van is niet dat ik je op te met voor zijn er maar ook aan wat dit bent heb',
    pl: 'i w nie się na to że z jest do co jak ale o tak po dla od czy są już tylko',
    tr: 've bir bu da de için ile değil çok ne ama gibi daha olarak var sonra kadar ben sen mi şey',
    id: 'yang dan di ini itu dengan untuk tidak dari akan bisa karena ada juga saya kami sudah adalah atau pada anda',
    ms: 'yang dan di ini itu dengan untuk tidak dari akan boleh kerana ada juga saya kami sudah ialah atau pada kepada anda',
    vi: 'và của là có không được những một các cho với này người trong để đã cũng khi như thì tôi bạn',
    sw: 'na ya wa kwa ni la za katika hii kuwa cha lakini kama au si pia hiyo sana vya yake',
    ha: 'da a ba na ta ya ne ce wannan cikin kuma amma su shi ita za sun don akwai yana',
    yo: 'ni ti àti láti sí wọn ó kò fún pé jẹ́ ń mo náà yìí rẹ̀ èyí kan sì àwọn',
    tl: 'ang ng sa na at mga ay hindi ko ako ka siya ito kung para may lang rin din niya',
    sv: 'och att det som en är på för med inte av till den har jag om ett men du vi',
    da: 'og at det er en til på af med for ikke den som har jeg et du men om vi hvad noget sig mig meget',
    nb: 'og at det er en til på av med for ikke den som har jeg et du men om vi hva noe seg meg mye',
    fi: 'ja on ei se että oli hän mutta kun ovat tämä myös mitä minä sinä ole voi jos kuin olen',
    cs: 'a je se v na to že s z do o jak ale by jsou jsem není pro tak co také už',
    ro: 'și de la în a nu cu că o un pe care este din sunt mai pentru ce se sau',
    hu: 'a az és hogy nem is egy van meg de ez ki mint csak már el még volt vagy ami',
  },
  Cyrillic: {
    ru: 'и в не что на это как с по но он я то все для вы мы она они так был',
    uk: 'і в не що на це як з та але для й у є я ви ми вона вони так був',
    bg: 'и в не че на това как с по но той аз то за се да е са от като',
  },
  Arabic: {
    ar: 'في من على إلى أن هذا التي الذي و لا ما هو عن كان مع هذه',
    fa: 'و در به از که این را است با می برای شما آن یک هم',
    ur: 'کے میں ہے اور کی کا یہ سے نہیں کو ہیں نے وہ جو',
  },
  Devanagari: {
    hi: 'है के में की और का को से यह नहीं हैं पर भी आप मैं एक लिए',
    mr: 'आहे आणि या ते की हे मी नाही आहेत तुम्ही मला व पण एक',
    ne: 'छ र को मा हो पनि यो गर्न छन् थियो म तपाईं',
  },
})

/** Letters only one language of its script uses. */
const LETTERS = /** @type {Record<string, RegExp>} */ ({ ru: /[ыэъё]/g, uk: /[іїєґ]/g, ar: /[يكة]/g, ur: /[ٹڈڑںےہھ]/g, mr: /ळ/g })

const WORDS = Object.fromEntries(Object.entries(SHARED).map(([script, languages]) => [script,
  Object.entries(languages).map(([lang, words]) => /** @type {const} */ ([lang, new Set(words.normalize('NFC').split(' '))]))]))

// Han, kana and Hangul pack a word into a character or two; the rest spell it out.
const SCRIPTS = [...Object.keys(SOLE), ...Object.keys(SHARED), 'Han', 'Hiragana', 'Katakana']
const PATTERNS = SCRIPTS.map((name) => /** @type {const} */ ([name, new RegExp(`\\p{Script=${name}}`, 'u')]))
const DENSE = new Set(['Han', 'Hiragana', 'Katakana', 'Hangul'])

/**
 * The language of a text, as a base tag ("fr", "zh"). `hint` is the language the user reads
 * Jean in: it wins when the text doesn't say, and breaks ties.
 * @param {string} text @param {string} hint
 */
export function languageOf(text, hint) {
  const base = hint.split('-')[0]
  const sample = text.slice(0, 3000).normalize('NFC').toLowerCase()
  /** @type {Record<string, number>} */
  const counts = {}
  for (const char of sample) {
    const found = PATTERNS.find(([, pattern]) => pattern.test(char))?.[0]
    if (found) counts[found] = (counts[found] ?? 0) + (DENSE.has(found) ? 3 : 1)
  }
  const kana = (counts.Hiragana ?? 0) + (counts.Katakana ?? 0)
  if (kana) counts.Han = (counts.Han ?? 0) + kana
  const script = Object.entries(counts).filter(([name]) => name !== 'Hiragana' && name !== 'Katakana').sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!script) return base
  if (script === 'Han') return kana ? 'ja' : 'zh'
  if (SOLE[script]) return SOLE[script]
  const words = sample.split(/[^\p{L}\p{M}]+/u)
  let best = { lang: '', score: 0 }
  for (const [lang, common] of WORDS[script]) {
    const letters = LETTERS[lang] ? (sample.match(LETTERS[lang])?.length ?? 0) : 0
    const score = words.filter((word) => common.has(word)).length + letters
    if (score > best.score || (score === best.score && score > 0 && lang === base)) best = { lang, score }
  }
  if (best.score) return best.lang
  return WORDS[script].some(([lang]) => lang === base) ? base : WORDS[script][0][0]
}

// ─── Voices ──────────────────────────────────────────────────────────────────

/** @typedef {{ name: string, lang: string, localService: boolean, default: boolean, voiceURI: string }} Voice */

/** Apple's novelty voices (Bells, Zarvox…) and its old robotic ones: last, whatever their language. */
const NOVELTY = new Set(['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Fred', 'Good News', 'Jester',
  'Junior', 'Kathy', 'Organ', 'Ralph', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox'])
/** Apple's retro Eloquence voices, in many languages: understandable, but flat. */
const RETRO = new Set(['Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley'])

/** A tag's locale ("en_US" → en-US), canonical (iw → he, tl → fil), or null. @param {string} tag */
function localeOf(tag) {
  try {
    return new Intl.Locale(tag.replace(/_/g, '-'))
  } catch {
    return null
  }
}

/** The language of a locale, Norwegian whichever way it is tagged. @param {Intl.Locale | null} locale */
const languageOfLocale = (locale) => (locale?.language === 'no' ? 'nb' : locale?.language)

/** How natural a voice sounds, from what its name and address say. @param {Voice} voice */
function sound(voice) {
  const name = voice.name.split(' (')[0]
  const id = `${voice.name} ${voice.voiceURI}`.toLowerCase()
  if (NOVELTY.has(name)) return -2
  if (RETRO.has(name) || id.includes('eloquence')) return -1
  if (/premium|enhanced|natural|neural/.test(id)) return 2
  return id.includes('compact') ? 0 : 1
}

/**
 * The voices on this device that speak `lang`, the best first: the user's own variety (fr-CA
 * before fr-FR), then the most natural-sounding, then the system's default. Retro and novelty
 * voices come after the others, and voices that send the text elsewhere (localService false)
 * never (D109).
 * @param {readonly Voice[]} voices @param {string} lang a language, as languageOf gives it
 * @param {readonly string[]} [tags] the languages the user reads, as tags ("fr-CA", "zh-Hant")
 */
export function rankVoices(voices, lang, tags = []) {
  const language = languageOfLocale(localeOf(lang))
  // Only tags that name a variety: "en" says nothing between en-GB and en-US.
  const varieties = /** @type {Intl.Locale[]} */ (tags.map(localeOf))
    .filter((locale) => locale && languageOfLocale(locale) === language && (locale.region || locale.script))
  /** @param {Voice} voice */
  const rank = (voice) => {
    const locale = localeOf(voice.lang)?.maximize()
    const own = varieties.some((wanted) => (!wanted.region || wanted.region === locale?.region) && (!wanted.script || wanted.script === locale?.script))
    const natural = sound(voice)
    return [Math.min(natural, 0), own, natural, voice.default].map(Number)
  }
  const ranked = voices
    .filter((voice) => voice.localService && languageOfLocale(localeOf(voice.lang)) === language)
    .map((voice) => ({ voice, rank: rank(voice) }))
  // Ties keep the system's order (sort is stable).
  return ranked.sort((a, b) => b.rank.map((value, i) => value - a.rank[i]).find(Boolean) ?? 0).map(({ voice }) => voice)
}

/**
 * The voices Settings offers for `lang` (D525): rankVoices' order, the natural-sounding ones apart from the retro
 * and novelty ones, which come last under a name of their own; each by its own name ("Eddy", not "Eddy (English
 * (United States))"), with its country, in the interface's words, where the voices are from several.
 * @param {readonly Voice[]} voices @param {string} lang @param {readonly string[]} tags @param {string[]} locales the interface's
 */
export function voiceMenu(voices, lang, tags, locales) {
  const ranked = rankVoices(voices, lang, tags)
  const region = (/** @type {Voice} */ voice) => localeOf(voice.lang)?.region ?? ''
  const several = new Set(ranked.map(region)).size > 1
  const named = new Intl.DisplayNames(locales, { type: 'region' })
  const entry = (/** @type {Voice} */ voice) => ({ voice, label: [voice.name.split(' (')[0], several && /^[A-Z]{2}$/.test(region(voice)) ? named.of(region(voice)) : ''].filter(Boolean).join(' · ') })
  return [ranked.filter((voice) => sound(voice) >= 0).map(entry), ranked.filter((voice) => sound(voice) < 0).map(entry)]
}
