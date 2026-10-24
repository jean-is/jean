// A design's file (D572): one SVG, `designs/<ulid>-<slug>.svg`, that any program shows as a picture and that
// holds the design itself as JSON in its <metadata>, which is all Jean reads back: never the SVG's markup, so no
// other program's drawing is taken for Jean's, and Trusted Types needs no policy. The drawing is written from the
// JSON at each save, in plain SVG 1.1: the ground, shapes, ornaments, pictures, QR codes, and each text part in the lines the browser
// laid out (measured from the view, so the file looks the same where text isn't laid out). A PNG made from it
// carries the same JSON in an iTXt chunk beside the AI's marks, so a picture sent back opens editable again. Pure.
import { crc32 } from '../../core/zip.js'
import { pathsOf, inksOf } from './layout.js'

/** @import { Design, Part } from './layout.js' */
/**
 * One line of a text part, as the view laid it out: its words, its baseline's start, middle or end, its type,
 * and its width, which holds a left-to-right line in SVG to the view's (textLength), as WebKit lays SVG text a
 * little narrower or wider than HTML.
 * @typedef {{ text: string, x: number, y: number, anchor: 'start' | 'middle' | 'end', dir: 'ltr' | 'rtl', family: string, size: number, weight: number, fill: string, width?: number }} Line
 */

const NS = 'urn:design-file:1'
const OPEN = `<design xmlns="${NS}">`
const CLOSE = '</design>'
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const KEYWORD = 'design'

/** @param {string} text */
const escaped = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** @param {number} n */
const num = (n) => String(Math.round(n * 100) / 100)
/** A box as SVG: an ellipse for a circle, else a rectangle, its corners rounded. @param {Part} part @param {number[]} box @param {string} rest its other attributes */
const boxed = (part, [x, y, w, h], rest) => (part.form === 'circle' ? `<ellipse cx="${num(x + w / 2)}" cy="${num(y + h / 2)}" rx="${num(w / 2)}" ry="${num(h / 2)}"${rest}/>`
  : `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(part.radius ?? 0)}"${rest}/>`)
/** A drawing of its own in a part's box. @param {number[]} box @param {string} view @param {string} inside */
const nested = ([x, y, w, h], view, inside) => `<svg x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" viewBox="${view}">${inside}</svg>`

/**
 * The design as its SVG: the page at its size, the design in <metadata> (with an XMP packet when given), the
 * faces it uses when given (an exported copy embeds them), then the drawing.
 * @param {Design} design @param {Record<string, Line[]>} lines each text part's, by its id
 * @param {{ xmp?: string, faces?: { family: string, src: string, range?: string, weight?: string }[], pictures?: Record<string, string>, art?: Record<string, any>,
 *   code?: (link?: string) => { size: number, d: string } | null }} [options]
 *   faces: each file of a voice, with the letters it holds (its unicode-range) and its weights;
 *   pictures: an address for a part's file, in place of its place in the project (an exported copy's data: address);
 *   art: the ornaments' paths (art.json); code: a QR code's modules, for what it holds
 */
export function toSvg(design, lines, { xmp = '', faces = [], pictures = {}, art = {}, code = () => null } = {}) {
  const { w, h, mm } = design.page, colour = (/** @type {string | undefined} */ name) => escaped((name && design.colours[/** @type {keyof Design['colours']} */ (name)]) ?? name ?? '#000000')
  const size = mm ? `width="${num(w * mm)}mm" height="${num(h * mm)}mm"` : `width="${w}" height="${h}"`
  const json = JSON.stringify(design).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ${size} lang="${escaped(design.lang)}">`, `<metadata>${xmp}${OPEN}${json}${CLOSE}</metadata>`]
  if (faces.length) out.push(`<defs><style>${faces.map(({ family, src, range, weight }) => `@font-face{font-family:"${family}";src:url(${src})${range ? `;unicode-range:${range}` : ''}${weight ? `;font-weight:${weight}` : ''}}`).join('')}</style></defs>`)
  out.push(`<rect width="${w}" height="${h}" fill="${colour('ground')}"/>`)
  for (const part of design.parts) {
    const [x, y, width, height] = part.box
    const qr = part.role === 'qr' && code(part.link), line = part.line ?? 0
    if (part.role === 'picture' && part.file) {
      const href = pictures[part.file] ?? `../${part.file}`, clip = part.form === 'circle' || part.radius
      // A photo in a circle, or its corners rounded, clipped to its form.
      if (clip) out.push(`<clipPath id="clip-${escaped(part.id)}">${boxed(part, part.box, '')}</clipPath>`)
      out.push(`<image href="${escaped(href)}" x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" preserveAspectRatio="xMidYMid slice"${clip ? ` clip-path="url(#clip-${escaped(part.id)})"` : ''}><title>${escaped(part.words ?? '')}</title></image>`)
    } else if (part.art) {
      out.push(nested(part.box, '0 0 100 100', pathsOf(design, part, art).map(({ d, fill, stroke, width: w }) => `<path d="${escaped(d)}" fill="${escaped(fill)}" stroke="${escaped(stroke)}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')))
    } else if (part.role === 'shape') {
      // An outline drawn inside its box, as the view's border is.
      out.push(line ? boxed({ ...part, radius: Math.max(0, (part.radius ?? 0) - line / 2) }, [x + line / 2, y + line / 2, width - line, height - line], ` fill="none" stroke="${colour(part.fill)}" stroke-width="${num(line)}"`)
        : boxed(part, part.box, ` fill="${colour(part.fill)}"`))
    } else if (qr) {
      const [dark, light] = inksOf(design).map(escaped)
      out.push(nested(part.box, `-2 -2 ${qr.size + 4} ${qr.size + 4}`, `<rect x="-2" y="-2" width="${qr.size + 4}" height="${qr.size + 4}" fill="${light}"/><path d="${qr.d}" fill="${dark}" shape-rendering="crispEdges"/>`))
    }
    for (const line of lines[part.id] ?? []) {
      // Only left to right: WebKit spaces Arabic glyph by glyph to fit textLength, which breaks its joining.
      const width = line.width && line.dir === 'ltr' ? ` textLength="${num(line.width)}" lengthAdjust="spacing"` : ''
      out.push(`<text x="${num(line.x)}" y="${num(line.y)}" text-anchor="${line.anchor}" direction="${line.dir}" font-family="${escaped(line.family)}" font-size="${num(line.size)}" font-weight="${line.weight}" fill="${escaped(line.fill)}"${width}>${escaped(line.text)}</text>`)
    }
  }
  out.push('</svg>')
  return out.join('\n')
}

/** The design an SVG holds, from its JSON alone, or null for any other SVG, or a format to come. @param {string} svg @returns {Design | null} */
export function fromSvg(svg) {
  const start = svg.indexOf(OPEN)
  const end = start < 0 ? -1 : svg.indexOf(CLOSE, start)
  if (end < 0) return null
  try {
    const design = JSON.parse(svg.slice(start + OPEN.length, end).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
    return design?.format === 1 ? design : null
  } catch {
    return null
  }
}

/** A PNG with the design in an iTXt chunk, right after its IHDR. @param {Uint8Array} bytes @param {Design} design */
export function withDesign(bytes, design) {
  if (SIGNATURE.some((byte, i) => bytes[i] !== byte)) return bytes
  // Its type, its keyword, uncompressed, no language and no translated keyword: then the JSON.
  const body = new TextEncoder().encode(`iTXt${KEYWORD}\0\0\0\0\0${JSON.stringify(design)}`)
  const head = 8 + 25
  const out = new Uint8Array(bytes.length + body.length + 8)
  const view = new DataView(out.buffer)
  out.set(bytes.subarray(0, head))
  view.setUint32(head, body.length - 4)
  out.set(body, head + 4)
  view.setUint32(head + 4 + body.length, crc32(body))
  out.set(bytes.subarray(head), head + 8 + body.length)
  return out
}

/** The design a PNG carries, or null. @param {Uint8Array} bytes @returns {Design | null} */
export function designOfPng(bytes) {
  if (SIGNATURE.some((byte, i) => bytes[i] !== byte)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at)
    const type = decoder.decode(bytes.subarray(at + 4, at + 8))
    const data = bytes.subarray(at + 8, at + 8 + length)
    if (type === 'iTXt' && decoder.decode(data.subarray(0, KEYWORD.length + 1)) === `${KEYWORD}\0`) {
      // The keyword's NUL, then the compression flag and method, then two NUL-ended fields.
      let field = KEYWORD.length + 3
      for (let ends = 0; ends < 2; field++) if (data[field] === 0) ends++
      try {
        const design = JSON.parse(decoder.decode(data.subarray(field)))
        return design?.format === 1 ? design : null
      } catch {
        return null
      }
    }
    if (type === 'IEND') break
    at += 12 + length
  }
  return null
}
