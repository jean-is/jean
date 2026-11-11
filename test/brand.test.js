// A design system proposed from the person's own material (D740): the colours a picture is made of, the codes and faces a
// guide writes in English, French, Arabic and Japanese, a Word file's faces and logo, and a kit that reads at AA by day and by
// night whatever the brand's colours. What a browser draws (pictures, PDFs) is brand.spec.js's.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paletteOf, codesIn, familyOf, facesIn, kitOf, unreadable, oklab, fromWord } from '../app/caps/slides/brand.js'
import { contrast } from '../app/ui/colour.js'
import { writeZip } from '../app/core/zip.js'
import { wordGuide, BRANDS } from './brands/fixtures.js'

/** A picture's pixels, RGBA, from runs of [count, r, g, b, a]. @param {number[][]} runs */
const pixels = (runs) => Uint8ClampedArray.from(runs.flatMap(([count, ...rgba]) => Array.from({ length: count }, () => rgba).flat()))
/** A colour as a swatch kitOf reads, its share given. @param {string} hex @param {number} share */
const swatch = (hex, share) => ((lab) => ({ hex, share, L: lab[0], C: Math.hypot(lab[1], lab[2]) }))(oklab([1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))))

test('a picture\'s colours: most first, near ones together, see-through ones and the blends at their edges left out', () => {
  const palette = paletteOf(pixels([[6000, 255, 255, 255, 255], [3000, 29, 53, 87, 255], [3010, 31, 52, 90, 255], [1200, 230, 57, 70, 255], [300, 142, 154, 171, 255], [9000, 0, 0, 0, 0]]))
  assert.deepEqual(palette.map((one) => one.hex), ['#ffffff', '#1e3459', '#e63946'])
  assert.ok(Math.abs(palette[0].share - 6000 / 13510) < 0.01)
  assert.ok(palette[2].C > 0.15 && palette[0].C < 0.01)
})

test('the codes a guide writes, in its order and its languages\' digits and colons, each with how often', () => {
  assert.deepEqual(codesIn('Primary navy #1D3557 · RGB 29 53 87 · CMYK 67 39 0 66. Accent HEX E63946, rgb(230, 57, 70). Neutral #333.'),
    [{ hex: '#1d3557', count: 2 }, { hex: '#e63946', count: 2 }, { hex: '#333333', count: 1 }])
  assert.deepEqual(codesIn('Bordeaux : R122 V31 B61 — #7A1F3D'), [{ hex: '#7a1f3d', count: 2 }])
  assert.deepEqual(codesIn('メインカラー：＃００５７Ｂ８（Ｒ０ Ｇ８７ Ｂ１８４）'), [{ hex: '#0057b8', count: 2 }])
  assert.deepEqual(codesIn('اللون الأساسي: #00843D، RGB ٠ ١٣٢ ٦١'), [{ hex: '#00843d', count: 2 }])
  assert.deepEqual(codesIn('Invoice #12345, page #2'), [])
})

test('a face\'s family, its weight and style left out, from a guide\'s words or a PDF\'s own name for it', () => {
  assert.deepEqual(['Futura Bold', 'AAAAAA+Futura-Bold', 'AvenirNext-DemiBold', 'Hiragino Sans W6', 'Gill Sans Light Italic', 'GeezaPro', 'Source Sans Pro'].map(familyOf),
    ['Futura', 'Futura', 'Avenir Next', 'Hiragino Sans', 'Gill Sans', 'Geeza Pro', 'Source Sans Pro'])
})

test('the faces a guide names, its headings\' and its text\'s, in English, French, Arabic and Japanese', () => {
  assert.deepEqual(facesIn('Typography\nHeadings: Futura Bold, 32 pt\nBody text: Georgia Regular, 11 pt'), { heading: ['Futura'], body: ['Georgia'] })
  assert.deepEqual(facesIn('Typographie\nTitres : Didot Bold\nTexte courant : Gill Sans Regular'), { heading: ['Didot'], body: ['Gill Sans'] })
  assert.deepEqual(facesIn('الخطوط\nالعناوين: Damascus Bold\nالنص: Geeza Pro Regular'), { heading: ['Damascus'], body: ['Geeza Pro'] })
  assert.deepEqual(facesIn('書体\n見出し：Hiragino Mincho ProN W6\n本文：Hiragino Sans W3'), { heading: ['Hiragino Mincho ProN'], body: ['Hiragino Sans'] })
  // Named as typography alone, one face for both; the faces it is set in where it names none, but a maker's own.
  assert.deepEqual(facesIn('Our typeface: Avenir Next. Use it everywhere.'), { heading: ['Avenir Next'], body: ['Avenir Next'] })
  assert.deepEqual(facesIn('Welcome', [{ heading: 'AAAAAA+Optima-Bold', body: 'BAAAAA+Baskerville' }]), { heading: ['Optima'], body: ['Baskerville'] })
  assert.equal(facesIn('Welcome', [{ heading: 'Times-Roman', body: 'Helvetica' }]), undefined)
})

test('a kit proposed reads at AA by day and by night, whatever the brand\'s colours', () => {
  for (let hue = 0; hue < 360; hue += 15) for (const light of [20, 35, 50, 65, 80, 92]) for (const second of [null, '#ffd400', '#0b1f3a', '#333333']) {
    const rgb = hslToHex(hue, 80, light), kit = kitOf([swatch(rgb, 0.5), ...(second ? [swatch(second, 0.3)] : []), swatch('#ffffff', 0.2)])
    assert.deepEqual(unreadable(kit), [], `${rgb} ${second}: ${JSON.stringify(kit)}`)
  }
  // No colour at all: black and white, which read.
  assert.deepEqual(unreadable(kitOf([swatch('#ffffff', 0.7), swatch('#111111', 0.3)])), [])
})

test('the main colour is the brand\'s own where it reads; a light one is the pale fill, words on it; a pale page is the paper', () => {
  const navy = kitOf([swatch('#1d3557', 0.5), swatch('#e63946', 0.3), swatch('#333333', 0.2)])
  assert.equal(navy.primary, '#1d3557')
  assert.equal(navy.ink, '#333333')
  assert.deepEqual(navy.series, ['#1d3557', '#e63946'])
  // A bakery's yellow doesn't read on white: its brown is the main colour, and the yellow its fill.
  const bakery = kitOf([swatch('#f7b500', 0.5), swatch('#4a2c17', 0.4)])
  assert.equal(bakery.primary, '#4a2c17')
  assert.equal(bakery.soft, '#f7b500')
  assert.ok(contrast(bakery.ink, bakery.soft) >= 4.5)
  // Alone, a pink is deepened at its hue; by night, as it is, if it reads there.
  const pink = kitOf([swatch('#e5677d', 0.8)])
  assert.notEqual(pink.primary, '#e5677d')
  assert.ok(Math.abs(oklabHue(pink.primary) - oklabHue('#e5677d')) < 12)
  assert.equal(pink.dark.primary, '#e5677d')
  // A site's cream page is its paper.
  assert.equal(kitOf([swatch('#faf6ef', 0.6), swatch('#2f6f4f', 0.2)]).paper, '#faf6ef')
})

test('a Word file: its words, the faces its first and most runs are set in, and the picture its header holds', async () => {
  const brand = BRANDS.find((one) => one.id === 'vasseur')
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
  const word = await fromWord(await wordGuide(/** @type {any} */ (brand), png))
  assert.match(word.text, /#7A1F3D/)
  assert.deepEqual(word.used, { heading: 'Baskerville', body: 'Optima' })
  assert.equal(word.file?.type, 'image/png')
  assert.deepEqual(codesIn(word.text).slice(0, 2).map((one) => one.hex), ['#7a1f3d', '#c9a227'])
  assert.deepEqual(facesIn(word.text, [word.used]), { heading: ['Baskerville'], body: ['Optima'] })
  // A theme's faces win over its runs'.
  const themed = await writeZip([{ name: 'word/document.xml', bytes: new TextEncoder().encode('<w:document><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Arial"/></w:rPr><w:t>Hi</w:t></w:r></w:p></w:body></w:document>') },
    { name: 'word/theme/theme1.xml', bytes: new TextEncoder().encode('<a:theme><a:majorFont><a:latin typeface="Futura"/></a:majorFont><a:minorFont><a:latin typeface="Georgia"/></a:minorFont></a:theme>') }])
  assert.deepEqual((await fromWord(themed)).used, { heading: 'Futura', body: 'Georgia' })
})

/** @param {number} h @param {number} s @param {number} l */
function hslToHex(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100), f = (/** @type {number} */ n) => ((k) => l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))((n + h / 30) % 12)
  return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, '0')).join('')}`
}
/** @param {string} hex */
const oklabHue = (hex) => ((lab) => (Math.atan2(lab[2], lab[1]) * 180) / Math.PI)(oklab([1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))))
