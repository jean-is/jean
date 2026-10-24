// A design out of Jean (D572), all from Save: the picture as it is, as a post or as a story, laid out from the same words the
// moment it is saved, so it never falls out of step; a page to print or save as PDF, two A5s or four A6s to a sheet with a line
// to cut along; the design's file, its faces and pictures inside it, which opens anywhere and in Jean again; sent to an app
// through the system's sheet; or copied, picture and words. A mark still to look at is said first. What Jean made is marked
// (D324), and the picture carries the design itself, so one sent back opens editable.
import { html, nothing, render } from 'lit-html'
import { t, intlLocales } from '../../core/i18n.js'
import { app, notify } from '../../ui/state.js'
import { save, pictureOf, copyDrawing } from '../../ui/save.js'
import { act } from '../../ui/acts.js'
import { icons } from '../../ui/menu-icons.js'
import { encode } from '../../ui/seal.js'
import { paperFor } from '../made/formats.js'
import { marked, xmpOf } from '../pictures/mark.js'
import { BRAND } from '../../brand.js'
import { book, shown, load, suggested } from './designs.js'
import { resized, textOf } from './layout.js'
import { toSvg, withDesign } from './format.js'
import { laidOut, pageOf, typeOf } from './page.js'
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
  return { design: fitted, svg: toSvg(fitted, lines, { xmp: xmpOf(BRAND.name), faces, pictures }) }
}

/** The design's file as it goes out, for the preview's Download and a card's. @param {string} path */
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

/** Said done, for the audit (D421). @param {string} format */
const done = (format) => act('file.save', { task: app.current.peek()?.path, path: shown.peek()?.path, format })

/** Two A5s or four A6s to a sheet of the region's paper, with a line to cut along, else one: drawn for the printer alone, then gone. @param {Design} design */
async function print(design) {
  const paper = paperFor(intlLocales()[0]), [copies, columns, sheet] = /** @type {Record<string, [number, number, string]>} */ ({ a5: [2, 2, `${paper} landscape`], a6: [4, 2, paper] })[design.size] ?? [1, 1, paper]
  const holder = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'design-print' }))
  holder.style.setProperty('--width', design.size === 'a6' ? '104mm' : design.page.mm ? `${design.page.w * design.page.mm}mm` : '180mm')
  holder.style.setProperty('--columns', String(columns))
  render(html`${Array.from({ length: copies }, () => pageOf(design))}`, holder)
  const page = new CSSStyleSheet()
  page.replaceSync(`@page { size: ${sheet}; margin: 0 }`)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, page]
  document.documentElement.classList.add('is-printing-design')
  // Its pictures read and its faces in, a moment at most.
  for (let wait = 0; wait < 60 && [...holder.querySelectorAll('app-shared')].some((one) => !one.querySelector('img')?.complete); wait++) await new Promise((resolve) => setTimeout(resolve, 50))
  await document.fonts.ready
  addEventListener('afterprint', () => {
    document.documentElement.classList.remove('is-printing-design')
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((one) => one !== page)
    holder.remove()
  }, { once: true })
  done('print')
  window.print()
}

/** The picture as it is, made as Save's menu opens, so that Send has it within the click the system's sheet needs. */
let ready = { design: /** @type {Design | null} */ (null), picture: /** @type {Promise<Blob> | null} */ (null) }
/** @param {Design} design */
const pictureFor = (design) => (ready.design === design && ready.picture ? ready.picture : (ready = { design, picture: pngOf(design) }).picture)

/** What Save does with each choice. @param {string} how @param {Design} design */
async function out(how, design) {
  const name = design.name
  try {
    if (how === 'file') { save(new Blob([(await svgOf(design)).svg], { type: 'image/svg+xml' }), `${name}.svg`); return done('svg') }
    if (how === 'print') return await print(design)
    if (how === 'copy') { await copyDrawing(textOf(design), pictureFor(design)); notify(t('designs.copied')); return done('copy') }
    const sized = ['square', 'story'].includes(how) ? resized(book, design, how) : design, picture = await (sized === design ? pictureFor(design) : pngOf(sized)), called = how === 'square' ? `${name} (${t('designs.size.square')})` : how === 'story' ? `${name} (${t('designs.size.story')})` : name
    if (how === 'send') { await navigator.share({ files: [new File([picture], `${name}.png`, { type: 'image/png' })], title: name }); return done('share') }
    save(picture, `${called}.png`)
    done('png')
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) { console.warn('Save', error); notify(t('designs.notSaved')) }
  }
}

/** Save and its menu, at the top of the pane while a design is on show. @param {{ uri: string }} file */
export function saveMenu(file) {
  const one = shown.value
  if (!one || one.path !== file.uri) return nothing
  const design = suggested(one), left = new Set(marksHere(design).map((mark) => mark.part)).size, { w, h, mm } = design.page
  const pixels = new Intl.NumberFormat(intlLocales()), size = mm ? [(w * mm * 300) / 25.4, (h * mm * 300) / 25.4].map(Math.round) : [w, h]
  const item = (/** @type {string} */ how, /** @type {unknown} */ glyph, /** @type {string} */ label, /** @type {string} */ about) => html`<button type="button" popovertarget="design-save" popovertargetaction="hide"
    @click=${() => out(how, design)}>${glyph}<span><b>${label}</b><small>${about}</small></span></button>`
  const sendable = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] })
  return html`<button type="button" class="button design-save" popovertarget="design-save">${t('designs.save')}${icons.chevron}</button>
    <div id="design-save" class="menu design-menu design-out" role="menu" popover @toggle=${(/** @type {ToggleEvent} */ e) => { if (sendable && e.newState === 'open') pictureFor(design).catch(() => {}) }}>
      ${left ? html`<button type="button" class="design-first" popovertarget="design-save" popovertargetaction="hide" @click=${look}><i class="design-dot" aria-hidden="true"></i>${t('designs.first', { count: left })}</button><hr>` : nothing}
      ${item('png', icons.image, t('designs.out.picture'), t('designs.out.pixels', { width: pixels.format(size[0]), height: pixels.format(size[1]) }))}
      ${design.size === 'square' ? nothing : item('square', icons.image, t('designs.out.post'), t('designs.out.same'))}
      ${design.size === 'story' ? nothing : item('story', icons.image, t('designs.out.story'), t('designs.out.same'))}
      ${item('print', icons.print, t('designs.out.print'), t(`designs.out.sheet.${design.size === 'a5' ? 'two' : design.size === 'a6' ? 'four' : 'one'}`))}
      ${item('file', icons.download, t('designs.out.file'), t('designs.out.svg'))}
      ${sendable ? item('send', icons.share, t('designs.out.send'), t('designs.out.apps')) : nothing}
      ${item('copy', icons.copy, t('action.copy'), t('designs.out.words'))}
    </div>`
}
