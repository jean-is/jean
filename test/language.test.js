import { test } from 'node:test'
import assert from 'node:assert/strict'
import { languageOf, rankVoices } from '../ui/language.js'

test('a script only one language writes says which language it is', () => {
  assert.equal(languageOf('안녕하세요, 무엇을 도와드릴까요?', 'en'), 'ko')
  assert.equal(languageOf('สวัสดีครับ วันนี้อากาศดีมาก', 'en'), 'th')
  assert.equal(languageOf('שלום, מה שלומך היום?', 'en'), 'he')
  assert.equal(languageOf('ሰላም፣ እንዴት ልረዳዎት እችላለሁ?', 'en'), 'am')
  assert.equal(languageOf('வணக்கம், நான் உங்களுக்கு எப்படி உதவ முடியும்?', 'en'), 'ta')
})

test('kana makes Han text Japanese; Han alone is Chinese', () => {
  assert.equal(languageOf('光合成は、植物が光を使って栄養を作る仕組みです。', 'en'), 'ja')
  assert.equal(languageOf('光合作用是植物利用阳光制造养分的过程。', 'en'), 'zh')
  // A few English words in a Japanese answer don't make it English.
  assert.equal(languageOf('Excel で開けるファイルを作りました。CSV 形式です。', 'en'), 'ja')
})

test('in a script many languages share, their most common words decide', () => {
  assert.equal(languageOf('Here is what I found: the meeting is on Monday and you are invited.', 'fr'), 'en')
  assert.equal(languageOf('Voici ce que j’ai trouvé : la réunion est lundi et vous êtes invité.', 'en'), 'fr')
  assert.equal(languageOf('Esto es lo que encontré: la reunión es el lunes y estás invitado.', 'en'), 'es')
  assert.equal(languageOf('Isto é o que encontrei: a reunião é na segunda-feira e você está convidado.', 'en'), 'pt')
  assert.equal(languageOf('Ecco cosa ho trovato: la riunione è lunedì e sei invitato anche tu.', 'en'), 'it')
  assert.equal(languageOf('Das habe ich gefunden: Die Besprechung ist am Montag und du bist eingeladen.', 'en'), 'de')
  assert.equal(languageOf('Dit is wat ik heb gevonden: de vergadering is op maandag en je bent uitgenodigd.', 'en'), 'nl')
  assert.equal(languageOf('Oto co znalazłem: spotkanie jest w poniedziałek i nie musisz się martwić.', 'en'), 'pl')
  assert.equal(languageOf('Bulduğum şey bu: toplantı pazartesi ve sen de davetlisin, çok güzel.', 'en'), 'tr')
  assert.equal(languageOf('Đây là những gì tôi tìm thấy: cuộc họp là vào thứ Hai và bạn được mời.', 'en'), 'vi')
  assert.equal(languageOf('Это то, что я нашёл: встреча в понедельник, и вы приглашены.', 'en'), 'ru')
  assert.equal(languageOf('Ось що я знайшов: зустріч у понеділок, і ви запрошені.', 'en'), 'uk')
  assert.equal(languageOf('إليك ما وجدته: الاجتماع يوم الاثنين وأنت مدعو إليه.', 'en'), 'ar')
  assert.equal(languageOf('این چیزی است که پیدا کردم: جلسه روز دوشنبه است و شما دعوت شده‌اید.', 'en'), 'fa')
  assert.equal(languageOf('یہ وہ ہے جو میں نے پایا: میٹنگ پیر کو ہے اور آپ کو مدعو کیا گیا ہے۔', 'en'), 'ur')
  assert.equal(languageOf('मुझे यह मिला: बैठक सोमवार को है और आप आमंत्रित हैं।', 'en'), 'hi')
  assert.equal(languageOf('मला हे सापडले: बैठक सोमवारी आहे आणि तुम्हाला आमंत्रण आहे.', 'en'), 'mr')
})

test('when nothing tells, the language the user reads Jean in wins', () => {
  assert.equal(languageOf('OK', 'fr'), 'fr')
  assert.equal(languageOf('42 × 3 = 126', 'ja'), 'ja')
  assert.equal(languageOf('', 'de'), 'de')
  // The hint is a tag; the answer is a language.
  assert.equal(languageOf('Merci !', 'fr-CA'), 'fr')
  // Malay and Indonesian share most words: a Malay reader keeps Malay.
  assert.equal(languageOf('Saya akan menghantar fail itu kepada anda dan dia.', 'ms'), 'ms')
})

/** A voice as browsers list them. @param {string} name @param {string} lang @param {Partial<import('../ui/language.js').Voice>} [more] */
const voice = (name, lang, more = {}) => ({ name, lang, localService: true, default: false, voiceURI: name, ...more })
const names = (/** @type {{ name: string }[]} */ voices) => voices.map((found) => found.name)

// Chrome on a Mac lists the system's default voice, then the others in alphabetical order, novelty and retro ones
// included, then Google's online ones.
const MAC_CHROME = [
  voice('Samantha', 'en-US', { default: true }), voice('Albert', 'en-US'), voice('Amélie', 'fr-CA'), voice('Bubbles', 'en-US'), voice('Daniel', 'en-GB'),
  voice('Eddy (English (US))', 'en-US'), voice('Eddy (French (France))', 'fr-FR'), voice('Kyoko', 'ja-JP'),
  voice('Meijia', 'zh-TW'), voice('Thomas', 'fr-FR'), voice('Tingting', 'zh-CN'),
  voice('Google français', 'fr-FR', { localService: false }), voice('Google 한국의', 'ko-KR', { localService: false }),
]

test('a voice for the language: the user’s variety first, retro and novelty voices last, never one in the cloud', () => {
  assert.deepEqual(names(rankVoices(MAC_CHROME, 'en', ['en-US', 'en'])), ['Samantha', 'Daniel', 'Eddy (English (US))', 'Albert', 'Bubbles'])
  assert.deepEqual(names(rankVoices(MAC_CHROME, 'en', ['fr-FR', 'en-GB'])), ['Daniel', 'Samantha', 'Eddy (English (US))', 'Albert', 'Bubbles'])
  assert.deepEqual(names(rankVoices(MAC_CHROME, 'fr', ['fr-FR'])), ['Thomas', 'Amélie', 'Eddy (French (France))'])
  assert.deepEqual(names(rankVoices(MAC_CHROME, 'fr', ['fr-CA'])), ['Amélie', 'Thomas', 'Eddy (French (France))'])
  assert.deepEqual(names(rankVoices(MAC_CHROME, 'ja', ['en-US'])), ['Kyoko'])
  // Only Google's online voice reads Korean here: none that stays on the device.
  assert.deepEqual(rankVoices(MAC_CHROME, 'ko', ['ko-KR']), [])
  // Traditional Chinese readers hear Taiwan's voice first; the others, the mainland's (the system's order).
  assert.deepEqual(names(rankVoices(MAC_CHROME, 'zh', ['zh-Hant'])), ['Meijia', 'Tingting'])
  assert.deepEqual(names(rankVoices(MAC_CHROME, 'zh', ['zh-Hans'])), ['Tingting', 'Meijia'])
})

test('a downloaded natural voice before a compact one, then the system’s default', () => {
  const safari = [
    voice('Samantha', 'en-US', { voiceURI: 'com.apple.voice.compact.en-US.Samantha', default: true }),
    voice('Zoe (Premium)', 'en-US', { voiceURI: 'com.apple.voice.premium.en-US.Zoe' }),
    voice('Aaron', 'en-US', { voiceURI: 'com.apple.voice.compact.en-US.Aaron' }),
    voice('Grandma', 'en-US', { voiceURI: 'com.apple.eloquence.en-US.Grandma' }),
  ]
  assert.deepEqual(names(rankVoices(safari, 'en', ['en-US'])), ['Zoe (Premium)', 'Samantha', 'Aaron', 'Grandma'])
})

test('voices tagged the old way, or with underscores, still speak their language', () => {
  const android = [voice('fil-ph-x-fie-local', 'fil_PH'), voice('he-il-x-heb-local', 'iw_IL'), voice('nb-no-x-cfs-local', 'no_NO'), voice('id-id-x-idc-local', 'in_ID')]
  assert.deepEqual(names(rankVoices(android, 'tl')), ['fil-ph-x-fie-local'])
  assert.deepEqual(names(rankVoices(android, 'he')), ['he-il-x-heb-local'])
  assert.deepEqual(names(rankVoices(android, 'nb')), ['nb-no-x-cfs-local'])
  assert.deepEqual(names(rankVoices(android, 'id')), ['id-id-x-idc-local'])
  // Finnish isn't Filipino, though "fil" starts with "fi".
  assert.deepEqual(rankVoices(android, 'fi'), [])
})
