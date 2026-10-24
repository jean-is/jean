// Designs' phase 0 (spikes/designs/): the checks behind the mark, the file's format and the
// scoring of npm run designs, under node --test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { readDates, marks, contrast, dpi } from '../spikes/designs/checks.js'
import { toSvg, fromSvg, withDesign, designOfPng } from '../spikes/designs/format.js'
import { marked } from '../app/caps/pictures/mark.js'
import { crc32 } from '../app/core/zip.js'

const NOW = new Date('2026-10-24T10:00:00Z')

test('dates are read in every language, with their weekday when one is named', () => {
  const cases = [
    ['en', 'Thursday 14 November · 7 pm', { weekday: 4, day: 14, month: 11 }],
    ['en', 'Saturday, November 14', { weekday: 6, day: 14, month: 11 }],
    ['fr', 'Samedi 14 novembre · 15 h', { weekday: 6, day: 14, month: 11 }],
    ['es', 'jueves 14 de noviembre', { weekday: 4, day: 14, month: 11 }],
    ['de', 'Donnerstag, 14. November', { weekday: 4, day: 14, month: 11 }],
    ['ru', 'Четверг, 14 ноября', { weekday: 4, day: 14, month: 11 }],
    ['vi', 'Thứ Năm, ngày 14 tháng 11', { weekday: 4, day: 14, month: 11 }],
    ['ar', 'الخميس ١٤ نوفمبر · الساعة ٧ مساءً', { weekday: 4, day: 14, month: 11 }],
    ['ar', 'السبت ١٤ تشرين الثاني', { weekday: 6, day: 14, month: 11 }],
    ['ja', '11月14日（木）午後7時から', { weekday: 4, day: 14, month: 11 }],
    ['ja', '１１月１４日 土曜日', { weekday: 6, day: 14, month: 11 }],
  ]
  for (const [lang, text, want] of /** @type {[string, string, Record<string, number>][]} */ (cases)) {
    const [found] = readDates(text, lang)
    assert.ok(found, `${lang}: ${text}`)
    assert.deepEqual({ weekday: found.weekday?.index, day: found.day, month: found.month }, want, `${lang}: ${text}`)
  }
})

test('a year written is read, and a date with no weekday has none', () => {
  const [found] = readDates('Save the date: 12 to 13 March 2027 in Annecy', 'en')
  assert.equal(found.year, 2027)
  assert.equal(found.weekday, undefined)
  assert.equal(readDates('Come and celebrate with us', 'en').length, 0)
  // A number by a month only when it can be a day.
  assert.equal(readDates('Room 42 in May', 'en').length, 0)
})

test('a weekday that does not match its date is marked, with the right one as its fix', () => {
  const design = { lang: 'en', parts: [{ id: 'when', role: 'when', text: 'Thursday 14 November · 7 pm' }] }
  const [mark] = marks(design, { now: NOW })
  assert.equal(mark.kind, 'weekday')
  assert.equal(mark.part, 'when')
  assert.equal(mark.year, 2026)
  assert.equal(mark.fix, 'Saturday 14 November · 7 pm')
  const fr = marks({ lang: 'fr', parts: [{ id: 'when', role: 'when', text: 'Jeudi 14 novembre · 19 h' }] }, { now: NOW })
  assert.equal(fr[0].fix, 'Samedi 14 novembre · 19 h')
  const ja = marks({ lang: 'ja', parts: [{ id: 'when', role: 'when', text: '11月14日（木）午後7時から' }] }, { now: NOW })
  assert.equal(ja[0].fix, '11月14日（土）午後7時から')
  const ar = marks({ lang: 'ar', parts: [{ id: 'when', role: 'when', text: 'الخميس ١٤ نوفمبر' }] }, { now: NOW })
  assert.equal(ar[0].fix, 'السبت ١٤ نوفمبر')
})

test('a right weekday, this year or next, is not marked', () => {
  assert.deepEqual(marks({ lang: 'en', parts: [{ id: 'when', role: 'when', text: 'Saturday 14 November · 3 pm' }] }, { now: NOW }), [])
  // In December, a January date is next year's.
  const later = new Date('2026-12-20T10:00:00Z')
  assert.deepEqual(marks({ lang: 'en', parts: [{ id: 'when', role: 'when', text: 'Saturday 9 January' }] }, { now: later }), [])
  // A year written is the one checked: 14 November 2025 was a Friday.
  assert.equal(marks({ lang: 'en', parts: [{ id: 'when', role: 'when', text: 'Thursday 14 November 2025' }] }, { now: NOW })[0].kind, 'weekday')
})

test('a reply-by date after the event is marked, and a date gone by is not', () => {
  const after = { lang: 'en', parts: [{ id: 'when', role: 'when', text: 'Saturday 14 November' }, { id: 'small', role: 'small', text: 'Please reply by 20 November' }] }
  assert.deepEqual(marks(after, { now: NOW }).map((one) => [one.kind, one.part]), [['reply', 'small']])
  const before = { lang: 'en', parts: [{ id: 'when', role: 'when', text: 'Saturday 14 November' }, { id: 'small', role: 'small', text: 'Please reply by 10 November' }] }
  assert.deepEqual(marks(before, { now: NOW }), [])
  // Lost on 17 October, a swim on 17 October: the dates gone by a design holds are rarely its event's.
  assert.deepEqual(marks({ lang: 'en', parts: [{ id: 'when', role: 'when', text: 'Saturday 17 October 2026' }] }, { now: NOW }), [])
})

test('a gap is marked where the brain left one', () => {
  const design = { lang: 'en', parts: [{ id: 'small', role: 'small', text: 'Call us on [Phone number]' }] }
  assert.deepEqual(marks(design, { now: NOW }).map((one) => [one.kind, one.gap]), [['gap', '[Phone number]']])
  assert.equal(marks({ lang: 'ja', parts: [{ id: 'small', role: 'small', text: '［電話番号］までご連絡ください' }] }, { now: NOW })[0].kind, 'gap')
})

test('faint words, a soft picture and the printer\'s margin are marked', () => {
  assert.ok(contrast('#ffffff', '#f6c22c') < 4.5)
  assert.ok(contrast('#1f2a44', '#fff4da') > 12)
  assert.equal(Math.round(dpi(1024, 148)), 176)
  // A5 in tenths of a millimetre: a picture of 512 px across 88 mm is 148 dpi.
  const page = { w: 1480, h: 2100, mm: 0.1 }
  const design = {
    lang: 'en', page, ground: '#fff4da',
    parts: [
      { id: 'title', role: 'title', text: 'Léa is 7!', box: [120, 1000, 1240, 200], color: '#f6c22c', pt: 40 },
      { id: 'picture', role: 'picture', box: [300, 80, 880, 880], px: [512, 512] },
      { id: 'small', role: 'small', text: 'Reply to Claire', box: [20, 2040, 600, 40], color: '#1f2a44', pt: 9 },
    ],
  }
  assert.deepEqual(marks(design, { now: NOW }).map((one) => [one.kind, one.part]), [['faint', 'title'], ['soft', 'picture'], ['margin', 'small']])
})

/** @returns {import('../spikes/designs/format.js').Design} */
const invitation = () => ({
  format: 1, author: 'jean', created: '2026-11-02T09:14:00.000Z', changed: '2026-11-02T09:31:12.000Z',
  size: 'a5', page: { w: 1480, h: 2100, mm: 0.1 }, lang: 'fr', layout: 'picture-top', voice: 'friendly', ground: '#fff4da',
  parts: [
    { id: 'picture', role: 'picture', file: 'files/9f2c41.webp', words: 'Des ballons <rouges> & jaunes', box: [310, 84, 860, 900], by: 'jean' },
    { id: 'title', role: 'title', text: 'Léa a 7 ans !', box: [120, 1030, 1240, 210], color: '#e8604a', by: 'jean' },
    { id: 'when', role: 'when', text: 'Samedi 14 novembre · 15 h', box: [120, 1430, 1240, 90], color: '#1f2a44', by: 'you' },
  ],
})

test('a design is an SVG that holds itself: written with its lines, read back from its JSON alone', () => {
  const design = invitation()
  const lines = { title: [{ text: 'Léa a 7 ans !', x: 740, y: 1180, anchor: /** @type {const} */ ('middle'), dir: /** @type {const} */ ('ltr'), family: 'Friendly', size: 186, weight: 800, fill: '#e8604a' }] }
  const svg = toSvg(design, lines, { xmp: '<x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>' })
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1480 2100" width="148mm" height="210mm" lang="fr">/)
  assert.match(svg, /<text x="740" y="1180" text-anchor="middle" direction="ltr" font-family="Friendly" font-size="186" font-weight="800" fill="#e8604a">Léa a 7 ans !<\/text>/)
  assert.match(svg, /<image href="..\/files\/9f2c41.webp" x="310" y="84" width="860" height="900" preserveAspectRatio="xMidYMid slice"><title>Des ballons &lt;rouges&gt; &amp; jaunes<\/title><\/image>/)
  assert.deepEqual(fromSvg(svg), design)
  // Anything else Jean reads as no design: an SVG of its own, or a format to come.
  assert.equal(fromSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'), null)
  assert.equal(fromSvg(svg.replace('"format":1', '"format":2')), null)
})

/** A PNG of one pixel, with its own CRCs. */
function pixel() {
  const chunk = (/** @type {string} */ type, /** @type {Uint8Array} */ data) => {
    const body = new Uint8Array([...new TextEncoder().encode(type), ...data])
    const out = new Uint8Array(body.length + 8)
    const view = new DataView(out.buffer)
    view.setUint32(0, data.length)
    out.set(body, 4)
    view.setUint32(4 + body.length, crc32(body))
    return out
  }
  const header = new Uint8Array(13)
  new DataView(header.buffer).setUint32(0, 1)
  new DataView(header.buffer).setUint32(4, 1)
  header.set([8, 6, 0, 0, 0], 8)
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', header), ...chunk('IDAT', deflateSync(new Uint8Array([0, 255, 244, 218, 255]))), ...chunk('IEND', new Uint8Array())])
}

test('the picture carries the design too, beside the marks, so a picture sent back opens editable', () => {
  const design = invitation()
  const png = withDesign(marked(pixel(), 'Jean'), design)
  assert.deepEqual(designOfPng(png), design)
  assert.match(new TextDecoder().decode(png), /XML:com\.adobe\.xmp/)
  assert.equal(designOfPng(pixel()), null)
})

test('npm run designs scores a design on its facts, what it made up, its size, its script and its marks', async () => {
  const { score, setIn } = await import('../scripts/designs.js')
  const { expected } = await setIn('en')
  const good = { name: "Léa's invitation", size: 'a5', words: { title: 'Léa is 7!', words: 'Come and celebrate with us', when: 'Saturday 14 November · 3 pm', where: '12 rue des Lilas, Lyon', small: 'Please reply to Claire by 10 November' } }
  assert.equal(score(expected.birthday, good, 'en', NOW).right, true)
  // Keeping the user's wrong weekday is right: Jean's mark asks them. Mending it silently loses their fact.
  const kept = { name: 'Housewarming', size: 'a5', words: { title: 'Housewarming!', when: 'Thursday 14 November · 7 pm', where: '3 Park Lane, Bristol', who: 'Sam and Alex' } }
  assert.equal(score(expected.housewarming, kept, 'en', NOW).right, true)
  const mended = { ...kept, words: { ...kept.words, when: 'Saturday 14 November · 7 pm' } }
  assert.deepEqual(score(expected.housewarming, mended, 'en', NOW).misses, ['no thursday', 'no weekday mark'])
  // A phone number made up is wrong; a gap where it goes is right.
  const cat = { name: 'Lost cat', size: 'a4', words: { title: 'Lost cat: Moka', words: 'Grey tabby with a white chest, very shy', when: 'Lost on 20 October', where: 'Near Place Bellecour', small: 'Seen her? Call us on 06 12 34 56 78' } }
  assert.deepEqual(score(expected.lostcat, cat, 'en', NOW).misses, ['made up a phone', 'no gap mark'])
  const gap = { ...cat, words: { ...cat.words, small: 'Seen her? Call us on [Phone]' } }
  const scored = score(expected.lostcat, gap, 'en', NOW)
  assert.equal(scored.right, true)
  // Lost on 20 October was four days ago: no mark.
  assert.deepEqual(scored.falseMarks, [])
  // A list keeps its items.
  const menu = { name: 'Menu', size: 'a5', words: { title: 'Camille & Hugo', items: ['Beetroot carpaccio', 'Roast duck with figs', 'Chocolate fondant'] } }
  assert.equal(score(expected.menu, menu, 'en', NOW).right, true)
  // Jean repairs what a small brain gets wrong rather than refusing it.
  const flat = score(expected.menu, { name: 'Menu', words: 'Camille and Hugo · beetroot carpaccio · roast duck with figs · chocolate fondant' }, 'en', NOW)
  assert.deepEqual(flat.repairs, ['words flat', 'no title', 'no size'])
  assert.equal(flat.right, true)
  assert.equal(score(expected.menu, null, 'en', NOW).taken, false)
})

test('Jean repairs a list under a name of the brain\'s own, and a date given only in ISO 8601', async () => {
  const { repair } = await import('../spikes/designs/tool.js')
  const menu = repair({ name: 'Menu', size: 'a5', words: { title: 'Wedding menu', dishes: ['Beetroot carpaccio', { course: 'Main', dish: 'Roast duck with figs' }] } }, 'en')
  assert.equal(menu?.facts.words.items, 'Beetroot carpaccio\nMain: Roast duck with figs')
  assert.deepEqual(menu?.repairs, ['dishes as items'])
  const garage = repair({ name: 'Flohmarkt', size: 'a4', date: '2026-11-22T08:00', words: { title: 'Flohmarkt', when: '8 bis 14 Uhr' } }, 'de')
  assert.equal(garage?.facts.words.when, 'Sonntag, 22. November · 8 bis 14 Uhr')
  // A date already in the words is left as it is.
  assert.equal(repair({ name: 'X', size: 'a5', date: '2026-11-22', words: { title: 'X', when: 'Sonntag, 22. November' } }, 'de')?.repairs.length, 0)
})
