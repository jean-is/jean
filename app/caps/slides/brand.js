// A design system proposed from the person's own material (D740): a logo, a screenshot of their site, a brand guide as a PDF or
// a Word file. Its colours are read from the codes a guide writes, else from pixels; its faces from the names a guide gives, else
// from the faces it is set in; its logo is the picture it holds. No brain reads any of it, so a device brain proposes what any
// other does. Every colour then reads at AA where the kit is worn: words, quiet words and the main colour on its paper, words on
// its pale fill, and by night words and the main colour on the night's paper. The proposal waits beside the kit it would change
// (`proposedPath()` in ui/kit.js) until the person accepts or rejects it on the design system's page (./kit-page.js). Pure, but
// for reading pictures (a canvas), PDFs (pdf.js, as Files reads them) and Word files.
import { contrast, mix, readable } from '../../ui/colour.js'
import { readZip } from '../../core/zip.js'

/** @typedef {{ hex: string, share: number, L: number, C: number }} Swatch  a colour of the material, how much of it counts, its lightness and chroma (OKLab) */
/** @typedef {{ heading?: string, body?: string }} Used  the faces a document is set in, its headings' and its text's */

/** A picture a proposal reads, by its name. */
const PICTURE = /\.(png|jpe?g|gif|webp|svg)$/i

/** @param {number[]} rgb */
const hexOf = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
/** @param {string} hex #rrggbb */
const rgbOf = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
/** @param {number} c 0–255 */
const linear = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** A colour in OKLab: its lightness, then a and b, whose length is its chroma. @param {number[]} rgb */
export function oklab(rgb) {
  const [r, g, b] = rgb.map(linear), [l, m, s] = [[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]].map(([x, y, z]) => Math.cbrt(x * r + y * g + z * b))
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
/** @param {number[]} one @param {number[]} other */
const far = (one, other) => Math.hypot(...one.map((v, i) => v - other[i]))
/** A colour with how much of it there is, as a swatch. @param {number[]} rgb @param {number} share */
const swatch = (rgb, share) => ((lab) => ({ hex: hexOf(rgb), share, L: lab[0], C: Math.hypot(lab[1], lab[2]) }))(oklab(rgb))

/**
 * Colours taken together where they are near (OKLab, 0.06 apart), most first, each the mean of its own, its share of all; those
 * under 0.3 % left out, and a blend of two larger ones too, as a picture's edges between them are.
 * @param {{ rgb: number[], n: number }[]} colours @returns {Swatch[]}
 */
function grouped(colours) {
  /** @type {{ sum: number[], n: number, lab: number[] }[]} */
  const groups = []
  for (const { rgb, n } of [...colours].sort((one, other) => other.n - one.n)) {
    const lab = oklab(rgb), near = groups.find((group) => far(group.lab, lab) < 0.06)
    if (near) near.sum = near.sum.map((v, i) => v + rgb[i] * n), near.n += n
    else groups.push({ sum: rgb.map((v) => v * n), n, lab })
  }
  const total = groups.reduce((sum, group) => sum + group.n, 0)
  for (const group of groups) group.lab = oklab(group.sum.map((v) => v / group.n))
  /** Whether a group lies between two larger ones, as their blend. @param {typeof groups[number]} one */
  const blend = (one) => groups.some((a) => a.n > one.n * 3 && groups.some((b) => {
    const ab = b.lab.map((v, i) => v - a.lab[i]), t = ab.reduce((sum, v, i) => sum + v * (one.lab[i] - a.lab[i]), 0) / (ab.reduce((sum, v) => sum + v * v, 0) || 1)
    return b !== a && b.n > one.n * 3 && t > 0.1 && t < 0.9 && far(one.lab, a.lab.map((v, i) => v + t * ab[i])) < 0.03
  }))
  return groups.filter((group) => group.n / total >= 0.003 && !blend(group)).map((group) => swatch(group.sum.map((v) => v / group.n), group.n / total))
}

/**
 * The colours a picture's pixels (RGBA, `width` to a row) are made of, most first: those of its flat parts, each pixel alike the one
 * four to its left and four above (a fill, a button, a logo's shapes), not a gradient's, a photograph's or words' edges, unless it has
 * none; see-through ones left out. @param {ArrayLike<number>} rgba @param {number} [width] @returns {Swatch[]}
 */
export function paletteOf(rgba, width = rgba.length / 4) {
  /** @type {Map<number, number[]>} */
  const bins = new Map(), near = (/** @type {number} */ i, /** @type {number} */ j) => j >= 0 && [0, 1, 2].reduce((sum, c) => sum + Math.abs(rgba[i * 4 + c] - rgba[j * 4 + c]), 0) <= 2
  for (const flat of [true, false]) {
    for (let i = 0, at = 0; i < rgba.length / 4; i++, at += 4) {
      if (rgba[at + 3] < 128 || (flat && !(i % width >= 4 && near(i, i - 4) && near(i, i - 4 * width)))) continue
      const key = ((rgba[at] >> 3) << 10) | ((rgba[at + 1] >> 3) << 5) | (rgba[at + 2] >> 3), bin = bins.get(key) ?? /** @type {number[]} */ (bins.set(key, [0, 0, 0, 0]).get(key))
      for (const c of [0, 1, 2, 3]) bin[c] += c < 3 ? rgba[at + c] : 1
    }
    if (bins.size) break
  }
  return grouped([...bins.values()].map(([r, g, b, n]) => ({ rgb: [r / n, g / n, b / n], n })))
}

/**
 * The colours a guide writes as codes, in the order it first writes them, each with how often: `#hex`, `HEX 1D3557`, `rgb()` or
 * `RGB 29 53 87`, `R29 G53 B87` (`V` for French's vert), in its language's digits and colons too; one its words call the main colour first,
 * as a guide written right to left may come out of a PDF in the order it is seen. @param {string} text @returns {{ hex: string, count: number }[]}
 */
export function codesIn(text) {
  /** @type {Map<string, { hex: string, count: number, main: boolean }>} */
  const found = new Map()
  const plain = text.normalize('NFKC').replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 0xf))
  let since = 0
  for (const match of plain.matchAll(/(?:#|\b(?:hex|html|web)\s*:?\s*#?)([\da-f]{6}|[\da-f]{3})(?![\da-z])|\b(?:rgb|rvb)?\s*:?\s*\(?\s*R\s*:?\s*(\d{1,3})\s*[,/ ]\s*[GV]\s*:?\s*(\d{1,3})\s*[,/ ]\s*B\s*:?\s*(\d{1,3})\b|\b(?:rgb|rvb)\s*:?\s*\(?\s*(\d{1,3})\s*[,/ ]\s*(\d{1,3})\s*[,/ ]\s*(\d{1,3})\b/gi)) {
    const [, code, ...rgb3] = match, at = /** @type {number} */ (match.index), main = PRIMARY.test(plain.slice(Math.max(since, at - 40), at))
    const rgb = code ? (code.length === 3 ? [...code].map((d) => d + d) : /** @type {string[]} */ (code.match(/../g))).map((d) => parseInt(d, 16)) : [0, 1, 2].map((i) => Number(rgb3[i] ?? rgb3[i + 3]))
    since = at + match[0].length
    if (rgb.some((c) => c > 255)) continue
    const one = found.get(hexOf(rgb)) ?? /** @type {{ hex: string, count: number, main: boolean }} */ (found.set(hexOf(rgb), { hex: hexOf(rgb), count: 0, main }).get(hexOf(rgb)))
    one.count++, one.main ||= main
  }
  return [...found.values()].sort((a, b) => Number(b.main) - Number(a.main)).map(({ hex, count }) => ({ hex, count }))
}

/** What a guide calls its main colour, just before its code: in Arabic as a PDF may spell it (its hamza apart), in Japanese and Chinese. */
const PRIMARY = /primary|primaire|principale?|main colou?r|ساسي|رئيس|メイン|プライマリ|主色|基本色/i

/** The weights and styles a face's name may end with, which its family leaves out. */
const WEIGHTS = /(?:\s+(?:thin|hairline|(?:extra|ultra|semi|demi)?\s?(?:light|bold)|regular|book|roman|normal|medium|black|heavy|italic|oblique|w\d))+$/i
/** A face's family, from its name as a guide or a PDF writes it: Futura Bold, AAAAAA+Futura-Bold, AvenirNext-Regular, Hiragino Sans W6. @param {string} name */
export const familyOf = (name) => name.trim().replace(/^[A-Z]{6}\+/, '').replace(/^\S+$/, (one) => one.replace(/[-_,]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')).replace(WEIGHTS, '').trim()
/** The faces a document's maker sets it in unasked, which say nothing of a brand. */
const DEFAULTS = /^(?:times(?: new roman)?|helvetica|arial|calibri(?: light)?|cambria|aptos(?: display)?|symbol|courier(?: new)?|segoe ui|menlo)$/i

/** What a colour's code starts with, which a label names as a face's name would. */
const CODES = /^(?:hex|html|rgb|rvb|cmyk|cmjn|pantone|pms|ral)\b/i
/** A face's name in Latin letters, one to four words. */
const NAME = '([A-Z][\\w]*(?:[ -][A-Z\\d][\\w]*){0,3})'
/** Words a guide names its faces' parts with, in Jean's languages that write them most: its headings, its text, its faces. */
const LABELS = { heading: 'headings?|headlines?|titles?|display|titres?|titrages?|見出し|タイトル|العناوين|عناوين', body: 'body(?: text| copy)?|text|copy|texte(?: courant)?|corps(?: de texte)?|本文|النصوص|النص', any: 'typefaces?|fonts?|typography|polices?|typographie|caractères|フォント|書体|الخطوط|الخط' }
/** @param {string} words */
const after = (words) => new RegExp(`(?<!\\p{L})(?:${words})\\s*[:\\-–—]\\s*${NAME}`, 'giu')
/** A face named before its label, as a line written right to left may come out of a PDF. @param {string} words */
const before = (words) => new RegExp(`${NAME}\\s*[:\\-–—]\\s*(?:${words})(?!\\p{L})`, 'giu')

/**
 * The faces a guide names, its headings' and its text's: those it labels so first, then the faces it names as typography, then
 * those it is set in (`used`, but a maker's own), then each named with a weight. @param {string} text @param {Used[]} [used]
 * @returns {{ heading: string[], body: string[] } | undefined}
 */
export function facesIn(text, used = []) {
  // A PDF may set a character of Chinese or Japanese apart from the next, and words with several spaces between them.
  const plain = text.normalize('NFKC').replace(/(?<=[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]) +(?=[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}])/gu, '').replace(/[^\S\n]+/g, ' ')
  const named = (/** @type {string} */ words) => [...plain.matchAll(after(words)), ...plain.matchAll(before(words))].map(([, name]) => familyOf(name)).filter((face) => face && !CODES.test(face))
  const own = (/** @type {'heading' | 'body'} */ part) => used.map((one) => familyOf(one[part] ?? '')).filter((face) => face && !DEFAULTS.test(face))
  const any = named(LABELS.any), weighted = [...plain.matchAll(/\b([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+){0,2}) (?:Thin|Light|Regular|Book|Medium|Semi ?[Bb]old|Bold|Black|Heavy)\b/g)].map(([, name]) => familyOf(name))
  const heading = [...named(LABELS.heading), ...any, ...own('heading'), ...weighted][0]
  const body = [...named(LABELS.body), ...any.slice(1), ...own('body'), ...weighted.filter((face) => face !== heading)][0] ?? heading
  return heading && body ? { heading: [heading], body: [body] } : undefined
}

/** A guide's codes as swatches: the first written counts most, then those written often. @param {{ hex: string, count: number }[]} codes */
const swatchesOf = (codes) => ((weights) => codes.map(({ hex }, i) => swatch(rgbOf(hex), weights[i] / weights.reduce((sum, w) => sum + w, 0))))(codes.map(({ count }, i) => (1 + count / 4) * 0.75 ** i))

/**
 * A kit's tokens proposed from the colours found, the most telling first, its faces and logo beside. The main colour is the first
 * of the brand's that reads on the paper as it is, unless one more telling is three times as much, which is then deepened at its
 * hue until it reads; a light colour of the brand's is its pale fill where words read on it; by night, the brand's first colour
 * that reads on a paper of its hue nearly black. Every pair `unreadable()` checks reads at AA.
 * @param {Swatch[]} swatches @param {{ fonts?: { heading: string[], body: string[] }, logo?: string }} [more]
 */
export function kitOf(swatches, { fonts, logo } = {}) {
  const colourful = swatches.filter((one) => one.C >= 0.04), greys = swatches.filter((one) => one.C < 0.04)
  const paper = greys.find((one) => one.L >= 0.94 && one.share >= 0.15)?.hex ?? '#ffffff', top = colourful[0]
  /** The first colour that reads on a ground as it is, unless one more telling is three times as much; else that one, made to read. @param {string} ground */
  const main = (ground) => (colourful.find((one) => contrast(one.hex, ground) >= 4.5 && one.share * 3 >= top.share)?.hex ?? readable(top.hex, ground))
  const primary = top ? main(paper) : readable(greys.find((one) => one.L < 0.5)?.hex ?? '#2b2b33', paper)
  const ink = readable(greys.find((one) => one.L < 0.4)?.hex ?? '#1d1c21', paper), muted = readable(mix(ink, paper, 0.45), paper)
  const soft = colourful.find((one) => one.L >= 0.75 && contrast(ink, one.hex) >= 4.5)?.hex ?? mix(primary, paper, 0.88)
  const night = greys.find((one) => one.L < 0.25 && one.share >= 0.3)?.hex ?? mix(primary, '#0e0e12', 0.88)
  const series = colourful.length > 1 ? [primary, ...colourful.map((one) => one.hex).filter((hex) => hex !== primary)].slice(0, 6) : undefined
  return { paper, ink, primary, muted, soft: contrast(ink, soft) >= 4.5 ? soft : mix(soft, paper, 0.5), ...(series && { series }), ...(fonts && { fonts }), ...(logo && { logo }),
    dark: { paper: night, ink: readable('#f3f2ef', night), primary: top ? main(night) : readable('#d8d6d0', night) } }
}

/** Where a kit's colours don't read at AA (4.5), as pairs of its tokens by day and by night: none in a kit proposed. @param {Record<string, any>} tokens */
export const unreadable = (tokens) => [['', tokens], ['dark.', tokens.dark ?? {}]].flatMap(([at, own]) => [['ink', 'paper'], ['primary', 'paper'], ['muted', 'paper'], ['ink', 'soft']]
  .filter(([fore, ground]) => own[fore] && own[ground] && contrast(own[fore], own[ground]) < 4.5).map(([fore, ground]) => `${at}${fore}/${ground}`))

/** A picture drawn at most `most` pixels across, with its pixels. @param {CanvasImageSource} source @param {number} width @param {number} height @param {number} [most] */
function paint(source, width, height, most = 480) {
  const scale = Math.min(1, most / Math.max(width, height, 1)), canvas = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) })
  const pen = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }))
  pen.drawImage(source, 0, 0, canvas.width, canvas.height)
  return { canvas, rgba: pen.getImageData(0, 0, canvas.width, canvas.height).data, width, height }
}
/** A picture's file drawn. @param {Blob} blob */
async function drawn(blob) {
  const url = URL.createObjectURL(blob), image = Object.assign(new Image(), { src: url })
  try { return await image.decode().then(() => paint(image, image.naturalWidth || 480, image.naturalHeight || 480)) } finally { URL.revokeObjectURL(url) }
}
/** Whether a picture is a logo rather than a page: see-through somewhere, or a few colours make nearly all of it. @param {ReturnType<typeof paint>} picture */
const logoLike = ({ canvas, rgba, width, height }) => Array.prototype.filter.call(rgba, (_, i) => i % 4 === 3).filter((a) => a < 250).length > rgba.length / 200
  || (Math.max(width, height) < 1200 && paletteOf(rgba, canvas.width).slice(0, 4).reduce((sum, one) => sum + one.share, 0) > 0.9)
/** A logo as the kit keeps one, a picture inside it of 512 KB at most: its own file if small enough, else drawn 512 pixels across. @param {Blob} blob @param {ReturnType<typeof paint>} picture */
const logoOf = async (blob, picture) => (blob.size <= 500_000 && /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(blob.type)
  ? `data:${blob.type};base64,${btoa(Array.from(new Uint8Array(await blob.arrayBuffer()), (byte) => String.fromCharCode(byte)).join(''))}`
  : paint(picture.canvas, picture.width, picture.height, 512).canvas.toDataURL('image/png'))
/** @param {string} name */
const typeOf = (name) => `image/${(/\.(\w+)$/.exec(name)?.[1] ?? 'png').toLowerCase().replace('jpg', 'jpeg').replace('svg', 'svg+xml')}`

/** A PDF's first three pages: their words, the faces of their largest words and of most of them, its first picture, its first page drawn. @param {Uint8Array} bytes */
async function fromPdf(bytes) {
  const { eachPage } = await import('../files/pdf.js')
  const pages = await eachPage(bytes, async (page) => {
    const { items } = await page.getTextContent(), ops = await page.getOperatorList(), face = (/** @type {string} */ name) => { try { return String(page.commonObjs.get(name)?.name ?? '') } catch { return '' } }
    const set = items.filter((/** @type {any} */ item) => item.str?.trim()).map((/** @type {any} */ item) => ({ face: face(item.fontName), size: Math.hypot(item.transform[0], item.transform[1]), length: item.str.length }))
    // paintImageXObject, as pdf.js numbers its operators: the pictures a page draws, one a page used on several kept among its common objects.
    const ids = ops.fnArray.flatMap((/** @type {number} */ op, /** @type {number} */ i) => (op === 85 ? [ops.argsArray[i][0]] : [])).slice(0, 3)
    // Drawn while its page is open, which lets its pictures go after: a bitmap, or its pixels as RGBA.
    const picture = (await Promise.all(ids.map((/** @type {string} */ id) => new Promise((done) => (id.startsWith('g_') ? page.commonObjs : page.objs).get(id, done))))).find((one) => one?.bitmap || one?.data?.length === one?.width * one?.height * 4)
    const pictures = picture ? [picture.bitmap ? paint(picture.bitmap, picture.width, picture.height, 512).canvas : ((canvas) => (canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(picture.data), picture.width), 0, 0), canvas))(Object.assign(document.createElement('canvas'), { width: picture.width, height: picture.height }))] : []
    const viewport = page.getViewport({ scale: 480 / page.getViewport({ scale: 1 }).width }), canvas = Object.assign(document.createElement('canvas'), { width: Math.round(viewport.width), height: Math.round(viewport.height) })
    if (page.pageNumber === 1) await page.render({ canvas, viewport }).promise
    return { text: items.map((/** @type {any} */ item) => `${item.str}${item.hasEOL ? '\n' : ' '}`).join(''), set, pictures, canvas: page.pageNumber === 1 ? canvas : null }
  }, 3, { fontExtraProperties: true })
  const set = pages.flatMap((page) => page.set), most = /** @type {Record<string, number>} */ ({})
  for (const { face, length } of set) most[face] = (most[face] ?? 0) + length
  const picture = pages.flatMap((page) => page.pictures)[0]
  return { text: pages.map((page) => page.text).join('\n'), used: { heading: set.reduce((big, one) => (one.size > big.size ? one : big), { face: '', size: 0 }).face, body: Object.keys(most).sort((a, b) => most[b] - most[a])[0] },
    page: pages[0]?.canvas, picture }
}

/** A Word file: its words, its theme's faces or those its first and most runs are set in, the picture its header holds, else its first. @param {Uint8Array} bytes */
export async function fromWord(bytes) {
  const entries = new Map(readZip(bytes).map((entry) => [entry.name, entry])), xml = async (/** @type {string} */ path) => new TextDecoder().decode(await entries.get(path)?.read() ?? new Uint8Array())
  const theme = await xml('word/theme/theme1.xml'), runs = [...(await xml('word/document.xml')).matchAll(/w:ascii="([^"]+)"/g)].map(([, face]) => face), count = (/** @type {string} */ face) => runs.filter((one) => one === face).length
  const headers = (await Promise.all([...entries.keys()].filter((name) => /^word\/_rels\/header\d*\.xml\.rels$/.test(name)).map(xml))).join('')
  const picture = [...[...headers.matchAll(/Target="(media\/[^"]+)"/g)].map(([, place]) => `word/${place}`), ...[...entries.keys()].filter((name) => name.startsWith('word/media/')).sort()].find((name) => PICTURE.test(name) && entries.has(name))
  const { extractPages } = await import('../files/extract.js'), face = (/** @type {string} */ part) => new RegExp(`<a:${part}Font>\\s*<a:latin typeface="([^"]+)"`).exec(theme)?.[1]
  return { text: (await extractPages('guide.docx', bytes))?.join('\n') ?? '', used: { heading: face('major') ?? runs[0], body: face('minor') ?? [...runs].sort((a, b) => count(b) - count(a))[0] },
    file: picture ? new Blob([/** @type {BlobPart} */ (await entries.get(picture)?.read())], { type: typeOf(picture) }) : undefined }
}

/**
 * The design system the person's material proposes: its name, what it came from, its tokens. A guide's codes are its colours,
 * else its pictures' and its first page's pixels are; a logo's count more than a screenshot's. Throws when it holds no colour.
 * @param {{ name: string, bytes: Uint8Array }[]} files @param {string} [name] the brand's
 */
export async function proposal(files, name) {
  const words = /** @type {string[]} */ ([]), used = /** @type {Used[]} */ ([]), colours = /** @type {{ rgb: number[], n: number }[]} */ ([])
  let logo = ''
  /** A picture's colours among the rest, weighed, and its file as the logo where it is one and none is yet. @param {ReturnType<typeof paint>} picture @param {number} weight @param {Blob} [file] */
  const seen = async (picture, weight, file) => {
    const like = logoLike(picture)
    colours.push(...paletteOf(picture.rgba, picture.canvas.width).map((one) => ({ rgb: rgbOf(one.hex), n: one.share * (like ? weight : weight / 2) })))
    if (like && !logo) logo = await logoOf(file ?? new Blob([]), picture)
  }
  for (const file of files) {
    if (/\.pdf$/i.test(file.name)) {
      const pdf = await fromPdf(file.bytes)
      words.push(pdf.text), used.push(pdf.used)
      if (pdf.picture) await seen(paint(pdf.picture, pdf.picture.width, pdf.picture.height), 1)
      if (pdf.page) colours.push(...((page) => paletteOf(page.rgba, page.canvas.width))(paint(pdf.page, pdf.page.width, pdf.page.height)).map((one) => ({ rgb: rgbOf(one.hex), n: one.share / 2 })))
    } else if (/\.docx$/i.test(file.name)) {
      const word = await fromWord(file.bytes)
      words.push(word.text), used.push(word.used)
      if (word.file) await seen(await drawn(word.file), 1, word.file)
    } else if (PICTURE.test(file.name)) {
      const blob = new Blob([/** @type {BlobPart} */ (file.bytes)], { type: typeOf(file.name) })
      await seen(await drawn(blob), 1, blob)
    }
  }
  const codes = codesIn(words.join('\n')), written = swatchesOf(codes), swatches = written.some((one) => one.C >= 0.04) ? written : grouped(colours)
  if (!swatches.length) throw new Error('no colour in it')
  return { name: name || files[0]?.name.replace(/\.\w+$/, '') || '', from: files.map((file) => file.name), tokens: kitOf(swatches, { fonts: facesIn(words.join('\n'), used), logo: logo || undefined }) }
}
