// Designs (D572, caps/designs/): the checks behind the mark, the layouts and their takes, design_change, the
// file's format, what Add adds and where (D586), and the scoring of npm run designs (phase 0), under node --test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import { readDates, marks, dpi } from '../app/caps/designs/checks.js'
import { contrast, readable } from '../app/ui/colour.js'
import { toSvg, fromSvg, withDesign, designOfPng } from '../app/caps/designs/format.js'
import { designOf, laid, takesOf, resized, changed, withParts, voicesFor, marksOf, textOf, frameOf, stack, added, stacked, spot, formOf, partsOf } from '../app/caps/designs/layout.js'
import { repair, VOICES, ART } from '../app/caps/designs/tool.js'
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
      { id: 'picture', role: 'picture', file: 'files/balloons.png', box: [300, 80, 880, 880], px: [512, 512] },
      { id: 'small', role: 'small', text: 'Reply to Claire', box: [20, 2040, 600, 40], color: '#1f2a44', pt: 9 },
    ],
  }
  assert.deepEqual(marks(design, { now: NOW }).map((one) => [one.kind, one.part]), [['faint', 'title'], ['soft', 'picture'], ['margin', 'small']])
})

/** @returns {import('../app/caps/designs/layout.js').Design} */
const invitation = () => ({
  format: 1, name: 'L’invitation de Léa', author: 'jean', created: '2026-11-02T09:14:00.000Z', changed: '2026-11-02T09:31:12.000Z',
  size: 'a5', page: { w: 1480, h: 2100, mm: 0.1 }, lang: 'fr', take: ['balloons', 'sunny', 'friendly'], takes: [], deal: 0, voice: 'friendly',
  colours: { ground: '#fff4da', ink: '#1f2a44', accent: '#e8604a', accent2: '#2f78bd' },
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
    const menu = repair({ name: 'Menu', size: 'a5', words: { title: 'Wedding menu', dishes: ['Beetroot carpaccio', { course: 'Main', dish: 'Roast duck with figs' }] } }, 'en')
  assert.equal(menu?.facts.words.items, 'Beetroot carpaccio\nMain: Roast duck with figs')
  assert.deepEqual(menu?.repairs, ['dishes as items'])
  const garage = repair({ name: 'Flohmarkt', size: 'a4', date: '2026-11-22T08:00', words: { title: 'Flohmarkt', when: '8 bis 14 Uhr' } }, 'de')
  assert.equal(garage?.facts.words.when, 'Sonntag, 22. November · 8 bis 14 Uhr')
  // A date already in the words is left as it is.
  assert.equal(repair({ name: 'X', size: 'a5', date: '2026-11-22', words: { title: 'X', when: 'Sonntag, 22. November' } }, 'de')?.repairs.length, 0)
})

/** @type {import('../app/caps/designs/layout.js').Book} */
const BOOK = JSON.parse(await readFile(new URL('../app/caps/designs/layouts.json', import.meta.url), 'utf8'))
const LEA = /** @type {import('../app/caps/designs/tool.js').Facts} */ (repair({ name: "Léa's invitation", size: 'a5', words: { title: 'Léa is 7!', words: 'Come and celebrate with us',
  when: 'Saturday 14 November · 3 pm', where: '12 rue des Lilas, Lyon', small: 'Please reply to Claire by 10 November' }, pictures: [{ describe: 'A bunch of balloons' }] }, 'en')?.facts)
const AT = { lang: 'en', now: '2026-10-24T10:00:00.000Z', by: 'jean' }

test('every palette\'s words pass AA on its ground, and its ground on its accent', () => {
  for (const { id, ground, ink, accent, accent2 } of BOOK.palettes) {
    for (const [name, colour] of Object.entries({ ink, accent, accent2 })) assert.ok(contrast(colour, ground) >= 4.5, `${id}: ${name}`)
    assert.ok(contrast(ground, accent) >= 4.5, `${id}: on its accent`)
  }
})

test('a design is laid out from the facts: each in its place on the page, its words stacked, three takes to pick from', () => {
  const design = designOf(BOOK, LEA, AT)
  assert.equal(design.takes.length, 3)
  assert.deepEqual(design.take, design.takes[0])
  assert.equal(new Set(design.takes.map((take) => take[0])).size, 3)
  assert.equal(new Set(design.takes.map((take) => take[1])).size, 3)
  assert.deepEqual(design.parts.filter((part) => part.role !== 'shape').map((part) => part.id), ['title', 'words', 'when', 'where', 'small', 'picture'])
  for (const part of design.parts) {
    const [x, y, w, h] = part.box
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1480.01 && y + h <= 2100.01, `${part.id} on the page`)
  }
  // Stacked in order, none over the next, the small print at the region's foot.
  const text = design.parts.filter((part) => part.text)
  for (let i = 1; i < text.length; i++) assert.ok(text[i].box[1] >= text[i - 1].box[1] + text[i - 1].box[3] - 0.01, `${text[i].id} under ${text[i - 1].id}`)
  assert.ok(text.find((part) => part.id === 'title')?.size ?? 0 > (text.find((part) => part.id === 'small')?.size ?? 0))
  assert.equal(design.parts.find((part) => part.id === 'small')?.voice, design.voice === 'calm' ? undefined : 'calm')
  assert.equal(textOf(design), 'Léa is 7!\nCome and celebrate with us\nSaturday 14 November · 3 pm\n12 rue des Lilas, Lyon\nPlease reply to Claire by 10 November\nA bunch of balloons')
  // More takes deals three others, the words kept.
  const more = takesOf(BOOK, design, 1)
  assert.notDeepEqual(more.map((take) => take[0]), design.takes.map((take) => take[0]))
})

test('in a project with a look of its own, the first take wears its colours and voice, the others Designs\' own; a palette gone leaves a design its colours (D601)', () => {
  const own = { id: 'project', ground: '#ffffff', ink: '#1c1b1f', accent: readable('#0f766e', '#ffffff'), accent2: '#9fc8c4' }
  const book = { ...BOOK, palettes: [own, ...BOOK.palettes], voice: 'elegant' }
  const design = designOf(book, { name: 'Open day', size: 'a5', words: { title: 'Open day', words: 'Come and see the new oven' }, pictures: [] }, AT)
  assert.deepEqual([design.take[1], design.take[2], design.colours.accent], ['project', 'elegant', own.accent])
  assert.ok(design.takes.slice(1).every((take) => take[1] !== 'project'))
  assert.ok(takesOf(book, design, 1).every((take) => take[1] !== 'project'))
  // In a language that has no such voice, the layout's.
  assert.notEqual(designOf({ ...book, voice: 'handwritten' }, { name: '開店', size: 'a5', words: { title: '開店', words: '新しいオーブン' }, pictures: [] }, { ...AT, lang: 'ja' }).take[2], 'handwritten')
  assert.deepEqual(laid(BOOK, design).colours, { ground: own.ground, ink: own.ink, accent: own.accent, accent2: own.accent2 })
})

test('the takes a design\'s facts call for come first: a list\'s menu, a short title made big, a name on a certificate', () => {
  const menu = designOf(BOOK, { name: 'Menu', size: 'a5', words: { title: 'Wedding menu of Camille and Hugo', items: 'Carpaccio\nDuck\nFondant' }, pictures: [] }, AT)
  assert.equal(menu.take[0], 'menu')
  const sale = designOf(BOOK, { name: 'Sale', size: 'square', words: { title: 'SALE', words: 'Everything half price' }, pictures: [] }, AT)
  assert.equal(sale.take[0], 'big')
  const certificate = designOf(BOOK, { name: 'Courage', size: 'a4', words: { title: 'Certificate of Courage', who: 'Sami', words: 'for swimming a whole length' }, pictures: [] }, AT)
  assert.equal(certificate.takes.some((take) => take[0] === 'certificate'), true)
  // A layout that needs a picture is no take without one.
  assert.equal(sale.takes.some((take) => ['poster', 'split'].includes(take[0])), false)
})

test('a layout mirrors for a language written right to left, and voices are those the language has every letter of', () => {
  const lea = { ...LEA, words: { title: 'ليا تبلغ السابعة!', when: 'السبت ١٤ نوفمبر' } }
  const ar = laid(BOOK, { ...designOf(BOOK, lea, { ...AT, lang: 'ar' }), take: ['corner', 'sunny', 'bold'] })
  const en = laid(BOOK, { ...designOf(BOOK, lea, AT), take: ['corner', 'sunny', 'bold'] })
  const [picture, mirrored] = [en, ar].map((one) => one.parts.find((part) => part.id === 'picture')?.box ?? [])
  assert.ok(Math.abs(mirrored[0] - (1480 - picture[0] - picture[2])) < 0.01)
  assert.deepEqual(voicesFor('el'), ['calm'])
  assert.deepEqual(voicesFor('yo'), ['friendly', 'calm'])
  assert.deepEqual(voicesFor('ru'), ['friendly', 'elegant', 'bold', 'calm'])
  assert.deepEqual(voicesFor('fr'), ['friendly', 'elegant', 'bold', 'calm', 'handwritten'])
  assert.equal(designOf(BOOK, LEA, { ...AT, lang: 'el' }).voice, 'calm')
})

test('a region stacks what the view measured, at its top, middle or foot', () => {
  const region = { box: [0, 0, 100, 100], align: 'center', valign: 'center', foot: true }
  assert.deepEqual(stack(region, [{ role: 'title', height: 20 }, { role: 'when', height: 10 }, { role: 'small', height: 5 }], 5), [[0, 27.5, 100, 20], [0, 52.5, 100, 10], [0, 95, 100, 5]])
  assert.deepEqual(stack({ ...region, valign: 'end', foot: false }, [{ role: 'title', height: 20 }], 5), [[0, 80, 100, 20]])
  // Too much for the region starts at its top.
  assert.deepEqual(stack({ ...region, foot: false }, [{ role: 'title', height: 150 }], 5), [[0, 0, 100, 150]])
})

test('another size keeps the words, laid out again, and what the user added in its place on the page', () => {
  const design = designOf(BOOK, LEA, AT), added = { id: 'text-1', role: 'text', text: 'Bring a swimsuit', added: true, box: [148, 210, 296, 105] }
  const post = resized(BOOK, { ...design, parts: [...design.parts, added] }, 'square')
  assert.deepEqual(post.page, { w: 1080, h: 1080 })
  assert.equal(textOf(post), `${textOf(design)}\nBring a swimsuit`)
  assert.deepEqual(post.parts.find((part) => part.id === 'text-1')?.box.map((n) => Math.round(n)), [108, 108, 216, 54])
  assert.ok(frameOf(BOOK, post).regions.every((region) => region.box[2] <= 1080))
})

test('design_change gives Jean\'s version of each part: its words, a move, bigger, a colour, a new picture, one taken away or added', () => {
  const design = designOf(BOOK, LEA, AT), title = /** @type {import('../app/caps/designs/layout.js').Part} */ (design.parts.find((part) => part.id === 'title'))
  const { parts, notes, paint } = changed(design, [
    { part: 'title', move: 'down', grow: 'bigger', note: 'A bigger title, a little lower' },
    { part: 'when', text: 'Saturday 14 November · 3.30 pm', note: 'Half past three' },
    { part: 'picture', picture: 'The same balloons, red and yellow' },
    { part: 'small', remove: true },
    { part: 'swim', text: 'Bring a swimsuit' },
  ], '2026-10-24T11:00:00.000Z')
  const [x, y, w, h] = title.box, unit = 14.8
  assert.deepEqual(parts.title?.box.map((n) => Math.round(n)), [x - (w * 0.15) / 2, y + unit * 2 - (h * 0.15) / 2, w * 1.15, h * 1.15].map((n) => Math.round(n)))
  assert.equal(parts.title?.moved, true)
  assert.equal(parts.title?.by, 'jean')
  assert.equal(parts.when?.text, 'Saturday 14 November · 3.30 pm')
  assert.equal(parts.picture?.words, 'The same balloons, red and yellow')
  assert.deepEqual(paint, ['picture'])
  assert.equal(parts.small, null)
  assert.equal(parts.swim?.added, true)
  assert.deepEqual(notes, { title: 'A bigger title, a little lower', when: 'Half past three' })
  const after = withParts(design, parts)
  assert.equal(after.parts.some((part) => part.id === 'small'), false)
  assert.equal(after.parts.at(-1)?.id, 'swim')
  assert.throws(() => changed(design, [{ part: 'nothing', move: 'up' }], ''), /no part "nothing"/)
  // Moved to the start in Arabic is to the right.
  const ar = designOf(BOOK, LEA, { ...AT, lang: 'ar' })
  assert.ok((changed(ar, [{ part: 'title', move: 'start' }], '').parts.title?.box[0] ?? 0) > (ar.parts.find((part) => part.id === 'title')?.box[0] ?? 0))
  // A voice given to a part is the part's; one it has already, or a key Jean doesn't read, changes nothing, so it is no change to review.
  const other = VOICES.find((voice) => voice !== design.voice)
  assert.equal(changed(design, [{ part: 'title', voice: other }], '').parts.title?.voice, other)
  assert.deepEqual(changed(design, [{ part: 'title', voice: design.voice, note: 'Merrier' }, { part: 'when', mood: 'cheerful' }], ''), { parts: {}, notes: {}, paint: [] })
})

test('anything added but words goes behind the words, never over them; front and back move a part over all or behind all but the layout\'s', () => {
  const design = designOf(BOOK, LEA, AT), unit = 14.8, ids = (/** @type {{ id: string }[]} */ parts) => parts.map((part) => part.id)
  const circle = { id: 'circle-1', role: 'shape', box: spot(design, 'circle'), added: true, fill: 'accent', ...formOf('circle', unit) }
  const behind = added(design.parts, circle), words = { id: 'text-1', role: 'text', text: 'Bring a swimsuit', box: spot(design, 'text'), added: true }
  assert.ok(ids(behind).indexOf('circle-1') < ids(behind).indexOf('title'))
  assert.equal(ids(added(behind, words)).at(-1), 'text-1')
  assert.equal(ids(stacked(behind, 'circle-1', 'front')).at(-1), 'circle-1')
  assert.equal(ids(stacked(stacked(behind, 'circle-1', 'front'), 'circle-1', 'back')).find((id) => !id.startsWith('shape-')), 'circle-1')
  // Each of Add's shapes is a part's own: a circle, a line, an outline, rounded corners, or an ornament.
  assert.deepEqual([formOf('circle', unit).form, formOf('line', unit).form, formOf('frame', unit).line, formOf('rounded', unit).radius, formOf('cake', unit).art], ['circle', 'line', unit, unit * 6, 'cake'])
  // An ornament takes the corner the fewest parts cover, the top one at the end first; a QR code the bottom one; mirrored in Arabic.
  const free = (/** @type {import('../app/caps/designs/layout.js').Design} */ one, /** @type {string} */ kind) => spot({ ...one, parts: [] }, kind).slice(0, 2).map(Math.round)
  assert.deepEqual(free(design, 'balloons'), [1480 - 89 - 355, 89])
  assert.deepEqual(free(design, 'qr'), [1480 - 89 - 296, 2100 - 89 - 296])
  assert.deepEqual(free({ ...design, lang: 'ar' }, 'balloons'), [89, 89])
  const taken = { ...design, parts: [{ id: 'balloons-1', role: 'shape', art: 'balloons', added: true, box: spot({ ...design, parts: [] }, 'balloons') }] }
  assert.deepEqual(spot(taken, 'heart').slice(0, 2).map(Math.round), [89, 89])
})

test('design_change adds a shape, an ornament or a QR code behind the words, makes a picture round, and puts a part in front', () => {
  const design = designOf(BOOK, LEA, AT)
  const { parts } = changed(design, [{ part: 'balloons-1', shape: 'balloons', note: 'Balloons in the corner' }, { part: 'qr-1', qr: 'https://example.com/lea' },
    { part: 'picture', shape: 'circle' }, { part: 'title', order: 'back' }, { part: 'when', color: '#ff4081', shape: 'star' }], '')
  assert.deepEqual([parts['balloons-1']?.role, parts['balloons-1']?.art, parts['balloons-1']?.added], ['shape', 'balloons', true])
  assert.equal(parts['qr-1']?.link, 'https://example.com/lea')
  assert.equal(parts.picture?.form, 'circle')
  // Words don't become a shape.
  assert.equal(parts.when?.art, undefined)
  const after = withParts(design, parts), ids = after.parts.map((part) => part.id)
  assert.ok(ids.indexOf('balloons-1') < ids.indexOf('words') && ids.indexOf('qr-1') < ids.indexOf('words'))
  assert.equal(ids.find((id) => !id.startsWith('shape-')), 'title')
  assert.equal(after.parts.some((part) => 'z' in part), false)
  // The brain reads the parts the user added too, a QR code by what it holds, but not the layout's own shapes.
  assert.match(partsOf(after), /^title "Léa is 7!", balloons-1, qr-1 "https:\/\/example.com\/lea", words /)
  assert.throws(() => changed(design, [{ part: 'nothing', move: 'up' }], ''), /A new part needs its text, a shape or a QR code/)
})

test('words on a shape the user added are read on its colour: the same colour as the shape is faint, and a QR code holding nothing is a gap', () => {
  const design = designOf(BOOK, LEA, AT), title = /** @type {import('../app/caps/designs/layout.js').Part} */ (design.parts.find((part) => part.id === 'title'))
  const under = { id: 'rectangle-1', role: 'shape', added: true, box: title.box, fill: title.color }
  assert.ok(marksOf({ ...design, parts: added(design.parts, under) }, NOW).some((mark) => mark.part === 'title' && mark.kind === 'faint'))
  assert.ok(!marksOf(design, NOW).some((mark) => mark.part === 'title' && mark.kind === 'faint'))
  const qr = { id: 'qr-1', role: 'qr', added: true, box: spot(design, 'qr') }
  assert.ok(marksOf({ ...design, parts: [...design.parts, qr] }, NOW).some((mark) => mark.part === 'qr-1' && mark.kind === 'gap'))
})

test('the file draws a circle, an outline inside its box, a photo clipped round, an ornament and a QR code as drawings of their own', async () => {
  const art = JSON.parse(await readFile(new URL('../app/caps/designs/art.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(art).filter((key) => !key.startsWith('$')), ART)
  const design = { ...invitation(), parts: [
    { id: 'circle-1', role: 'shape', box: [100, 100, 200, 100], fill: 'accent', form: 'circle' },
    { id: 'frame-1', role: 'shape', box: [0, 0, 100, 100], fill: 'ink', line: 10, radius: 20 },
    { id: 'picture', role: 'picture', file: 'files/a.png', words: 'Léa', box: [0, 0, 300, 300], form: 'circle' },
    { id: 'cake-1', role: 'shape', art: 'cake', fill: 'accent', box: [0, 0, 300, 300] },
    { id: 'qr-1', role: 'qr', link: 'https://example.com', box: [10, 20, 300, 300] }] }
  const svg = toSvg(design, {}, { art, code: (link) => (link ? { size: 21, d: 'M0 0h1v1h-1z' } : null) })
  assert.match(svg, /<ellipse cx="200" cy="150" rx="100" ry="50" fill="#[0-9a-f]{6}"\/>/)
  assert.match(svg, /<rect x="5" y="5" width="90" height="90" rx="15" fill="none" stroke="#[0-9a-f]{6}" stroke-width="10"\/>/)
  assert.match(svg, /<clipPath id="clip-picture"><ellipse [^>]*\/><\/clipPath>\n<image [^>]* clip-path="url\(#clip-picture\)">/)
  assert.equal(svg.match(/<svg x="0" y="0" width="300" height="300" viewBox="0 0 100 100"><path /g)?.length, 1)
  assert.match(svg, /<svg x="10" y="20" width="300" height="300" viewBox="-2 -2 25 25"><rect [^>]*\/><path d="M0 0h1v1h-1z"/)
  assert.deepEqual(fromSvg(svg), design)
})

test('a colour of the brain\'s own is deepened or lightened, its hue kept, until it reads on what it sits on', () => {
  // Qwen 3.6 35B's "more cheerful" bake sale: pink and orange on a pale pink ground.
  assert.equal(readable('#ff4081', '#fde8ec'), '#bf3061')
  assert.equal(readable('#ff9800', '#fde8ec'), '#995b00')
  for (const [colour, ground] of [['#ff4081', '#fde8ec'], ['#ffffff', '#ffffff'], ['#777777', '#777777'], ['#202020', '#1f2a44']]) assert.ok(contrast(readable(colour, ground), ground) >= 4.5)
  // One that reads already is kept.
  assert.equal(readable('#ffd166', '#1f2a44'), '#ffd166')
  const design = designOf(BOOK, LEA, AT), ground = design.colours.ground
  const { parts } = changed(design, [{ part: 'title', color: ground }], '')
  assert.ok(contrast(/** @type {string} */ (parts.title?.color), ground) >= 4.5)
})

test('a laid-out design is marked where it needs a look: the wrong weekday, a picture still to put in', () => {
  const design = designOf(BOOK, { ...LEA, words: { ...LEA.words, when: 'Thursday 14 November · 3 pm' } }, AT)
  assert.deepEqual(marksOf(design, NOW).map((mark) => [mark.kind, mark.part]), [['weekday', 'when'], ['gap', 'picture']])
})

test('Jean reads words a brain sent as JSON text back into their roles, its template\'s tags stripped', () => {
  // As Qwen 3.6 35B A3B sent them: an object, a comma too many, then the next argument in its template's tag.
  const birthday = repair({ name: 'Invitation', size: 'a5', words: '{"title": "レアの7歳お誕生日会", "when": "11月14日（土）午後3時より"},\n<parameter=pictures>\n[{"describe": "カラフルな風船のイラスト"}]' }, 'ja')
  assert.deepEqual(birthday?.facts.words, { title: 'レアの7歳お誕生日会', when: '11月14日（土）午後3時より' })
  assert.deepEqual(birthday?.facts.pictures, [{ describe: 'カラフルな風船のイラスト' }])
  assert.deepEqual(birthday?.repairs, ['template tags', 'words as text'])
  // In Python's quotes, with a brace too many.
  const offsite = repair({ name: 'Annecy', size: 'a5', words: "{'title': 'THÔNG BÁO GIỮ LỊCH', 'words': 'Họp nhóm tại Annecy.\\nChi tiết sau.'}}" }, 'vi')
  assert.deepEqual(offsite?.facts.words, { title: 'THÔNG BÁO GIỮ LỊCH', words: 'Họp nhóm tại Annecy.\nChi tiết sau.' })
  assert.deepEqual(offsite?.repairs, ['words as text'])
  // Roles in tags, the rest beside words, a closing tag left in one of them.
  const ru = repair({ name: 'Save the date', size: 'a5', words: '<title>Сохраните дату</title>\n<parameter=words>\nВыездная встреча команды</parameter>\n<parameter=items>\n[]', when: '12–13 марта 2027 года', small: 'Подробности позже\n</parameter>' }, 'ru')
  assert.deepEqual(ru?.facts.words, { title: 'Сохраните дату', words: 'Выездная встреча команды', when: '12–13 марта 2027 года', small: 'Подробности позже' })
  assert.deepEqual(ru?.repairs, ['template tags', 'words as text', 'roles beside words'])
  // In another argument too: what follows the tags goes to the arguments they name.
  const cat = repair({ name: 'Áp phích tìm mèo Moka\n</parameter>\n<pictures>\n[{"describe": "Một con mèo mướp màu xám"}]', size: 'a4', words: { title: 'TÌM MÈO MOKA' } }, 'vi')
  assert.equal(cat?.facts.name, 'Áp phích tìm mèo Moka')
  assert.deepEqual(cat?.facts.pictures, [{ describe: 'Một con mèo mướp màu xám' }])
  // What it read before what it couldn't is kept; a gap in a tag stays words.
  assert.deepEqual(repair({ name: 'X', size: 'a5', words: '{"title": "勇気の賞状", "small": "[署名]", "[印鑑]"}' }, 'ja')?.facts.words, { title: '勇気の賞状', small: '[署名]' })
  assert.deepEqual(repair({ name: 'X', size: 'a5', words: '<title>Moka</title><parameter=small>[Phone]</parameter>' }, 'en')?.facts.words, { title: 'Moka', small: '[Phone]' })
  // Words in braces that aren't JSON are only words.
  assert.deepEqual(repair({ name: 'X', size: 'a5', words: '{Name} invites you' }, 'en')?.repairs, ['words flat', 'no title'])
})
