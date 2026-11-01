// A design out of Jean (D572, D683), through the pane's one button (ui/out.js): a link to its picture; sent to an app through the system's
// sheet; copied, picture and words; the picture as it is, as a post or as a story, laid out from the same words the moment it is saved, so it
// never falls out of step; the design's file, its faces and pictures inside it, which opens anywhere and in Jean again; or a page to print or
// save as PDF, two A5s or four A6s to a sheet with a line to cut along. A mark still to look at is said first. What Jean made is marked
// (D324), and the picture carries the design itself, so one sent back opens editable.
import { html, render } from 'lit-html'
import { t, intlLocales } from '../../core/i18n.js'
import { app, notify } from '../../ui/state.js'
import { save, pictureOf, copyDrawing, printAlone } from '../../ui/save.js'
import { icons } from '../../ui/menu-icons.js'
import { encode } from '../../ui/seal.js'
import { addFile } from '../../core/files.js'
import { paperFor } from '../made/formats.js'
import { marked, xmpOf } from '../pictures/mark.js'
import { BRAND } from '../../brand.js'
import { book, shown, load, suggested } from './designs.js'
import { resized, textOf } from './layout.js'
import { toSvg, withDesign } from './format.js'
import { laidOut, pageOf, typeOf, ART, codeOf } from './page.js'
import { marksHere, look } from './view.js'

/** @import { Design } from './layout.js' */

/** A file's bytes as a data: address. @param {Uint8Array} bytes @param {string} type */
const dataOf = (bytes, type) => `data:${type};base64,${encode(bytes)}`
/** The code points a range of @font-face's unicode-range holds. @param {string} range */
const holds = (range) => range.split(',').map((one) => one.trim().replace(/^U\+/i, '').split('-').map((hex) => parseInt(hex.replace(/\?/g, '0'), 16)))

/**
 * A design's SVG as it goes out: fitted and its lines measured, each face its words use and each picture inside it.
 * @param {Design} design @param {string} [dir] the project its pictures are in
 */
async function svgOf(design, dir = app.projectDir) {
  const { design: fitted, lines } = await laidOut(design, book), points = new Set([...textOf(fitted)].map((char) => /** @type {number} */ (char.codePointAt(0))))
  const voices = new Set(fitted.parts.flatMap((part) => (part.text ? [(part.voice ?? fitted.voice)[0].toUpperCase() + (part.voice ?? fitted.voice).slice(1)] : [])))
  const rules = [...document.styleSheets].filter((sheet) => sheet.href?.endsWith('/designs.css')).flatMap((sheet) => [...sheet.cssRules].flatMap((rule) => (rule instanceof CSSFontFaceRule ? [{ sheet, rule }] : [])))
  const faces = await Promise.all(rules.filter(({ rule }) => voices.has(rule.style.getPropertyValue('font-family').replace(/"/g, '').trim())
    && holds(rule.style.getPropertyValue('unicode-range')).some(([from, to = from]) => [...points].some((point) => point >= from && point <= to))).map(async ({ sheet, rule }) => {
    const url = new URL(/url\("?([^")]+)"?\)/.exec(rule.style.getPropertyValue('src'))?.[1] ?? '', /** @type {string} */ (sheet.href))
    return { family: rule.style.getPropertyValue('font-family').replace(/"/g, '').trim(), src: dataOf(new Uint8Array(await (await fetch(url)).arrayBuffer()), 'font/woff2'),
      range: rule.style.getPropertyValue('unicode-range'), weight: rule.style.getPropertyValue('font-weight') }
  }))
  const pictures = Object.fromEntries(await Promise.all(fitted.parts.flatMap((part) => (part.file ? [part.file] : [])).map(async (file) => [file, dataOf((await app.fs.readBytes(`${dir}/${file}`)) ?? new Uint8Array(), typeOf(file))])))
  return { design: fitted, svg: toSvg(fitted, lines, { xmp: xmpOf(BRAND.name), faces, pictures, art: ART, code: codeOf }) }
}

/** The design's file as it goes out, for its pane's Download and a card's. @param {string} path */
export async function fileOf(path) {
  const one = shown.peek()?.path === path ? shown.peek() : await load(path)
  return one ? new TextEncoder().encode((await svgOf(one.design, one.dir)).svg) : null
}

/** Its picture: the size's own pixels, 300 dpi on paper, marked as Jean's and carrying the design. @param {Design} design @returns {Promise<Blob>} */
async function pngOf(design) {
  const { svg, design: fitted } = await svgOf(design), { w, h, mm } = design.page, [width, height] = mm ? [(w * mm * 300) / 25.4, (h * mm * 300) / 25.4] : [w, h]
  const bytes = new Uint8Array(await (await pictureOf(svg, Math.round(width / 2), Math.round(height / 2))).arrayBuffer())
  return new Blob([/** @type {BlobPart} */ (withDesign(marked(bytes, BRAND.name), fitted))], { type: 'image/png' })
}

/** Two A5s or four A6s to a sheet of the region's paper, with a line to cut along, else one: drawn for the printer alone, then gone. @param {Design} design */
async function print(design) {
  const paper = paperFor(intlLocales()[0]), [copies, columns, sheet] = /** @type {Record<string, [number, number, string]>} */ ({ a5: [2, 2, `${paper} landscape`], a6: [4, 2, paper] })[design.size] ?? [1, 1, paper]
  const holder = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'design-print' }))
  holder.style.setProperty('--width', design.size === 'a6' ? '104mm' : design.page.mm ? `${design.page.w * design.page.mm}mm` : '180mm')
  holder.style.setProperty('--columns', String(columns))
  render(html`${Array.from({ length: copies }, () => pageOf(design))}`, holder)
  await printAlone(holder, 'is-printing-design', { page: `@page { size: ${sheet}; margin: 0 }`, drawing: () => [...holder.querySelectorAll('app-shared')].some((one) => !one.querySelector('img')?.complete) })
}

/** The picture as it is, made as the menu opens, so that Send has it within the click the system's sheet needs. */
let ready = { design: /** @type {Design | null} */ (null), picture: /** @type {Promise<Blob> | null} */ (null) }
/** @param {Design} design */
const pictureFor = (design) => (ready.design === design && ready.picture ? ready.picture : (ready = { design, picture: pngOf(design) }).picture)

/** What a design can do (ui/out.js), while it is the one on show. @param {{ uri: string }} file @returns {import('../../ui/out.js').Ways | null} */
export function ways(file) {
  const one = shown.value
  if (!one || one.path !== file.uri) return null
  const design = suggested(one), name = design.name, left = new Set(marksHere(design).map((mark) => mark.part)).size, { w, h, mm } = design.page
  const pixels = new Intl.NumberFormat(intlLocales()), size = mm ? [(w * mm * 300) / 25.4, (h * mm * 300) / 25.4].map(Math.round) : [w, h]
  const laid = (/** @type {'square' | 'story'} */ how, /** @type {string} */ label) => (design.size === how ? [] : [{ id: 'png', glyph: icons.image, label, about: t('designs.out.same'), run: async () => save(await pngOf(resized(book, design, how)), `${name} (${t(`designs.size.${how}`)}).png`) }])
  return { ...(left && { first: { id: '', glyph: html`<span class="design-dot" aria-hidden="true"></span>`, label: t('designs.first', { count: left }), run: look } }),
    share: async () => ({ picture: await addFile(app.fs, { projectDir: app.projectDir, name: `${name}.png`, mimeType: 'image/png', bytes: new Uint8Array(await (await pictureFor(design)).arrayBuffer()), pages: [textOf(design)], by: app.deviceId }), description: textOf(design) }),
    send: { file: `${name}.png`, type: 'image/png', make: async () => ({ files: [new File([await pictureFor(design)], `${name}.png`, { type: 'image/png' })], title: name }) },
    copy: { id: 'copy', about: t('designs.out.words'), run: async () => { await copyDrawing(textOf(design), pictureFor(design)); notify(t('toast.copied')) } },
    files: [{ id: 'png', glyph: icons.image, label: t('designs.out.picture'), about: t('designs.out.pixels', { width: pixels.format(size[0]), height: pixels.format(size[1]) }), run: async () => save(await pictureFor(design), `${name}.png`) }, ...laid('square', t('designs.out.post')), ...laid('story', t('designs.out.story')),
      { id: 'svg', glyph: icons.download, label: t('designs.out.file'), about: t('designs.out.svg'), run: async () => save(new Blob([(await svgOf(design)).svg], { type: 'image/svg+xml' }), `${name}.svg`) }],
    print: { id: 'print', about: t(`designs.out.sheet.${design.size === 'a5' ? 'two' : design.size === 'a6' ? 'four' : 'one'}`), run: () => print(design) } }
}
