// Which language a text is in, to pick a voice that can read it aloud. Offline and small:
// the script tells most languages apart; where several share one, their commonest words
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
