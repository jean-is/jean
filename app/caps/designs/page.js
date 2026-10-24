// A design's page (D572), drawn by lit-html as the browser lays it out: the pane draws it to change it, the takes row
// and Creations' cards draw it small, and Jean draws it out of sight at each save to fit its words (`fit`) and measure
// its lines for the file (`linesOf`), which then shows the same where text isn't laid out. Its parts are boxes in the
// page's units, set as custom properties through the CSSOM; the page is a size container, so type is in hundredths of
// its width, and it is laid out left to right whatever the language, each part's words in the design's own direction.
import { html, nothing, render, svg } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { colourOf, weightOf, leadOf, frameOf, stack, unitOf, inksOf, pathsOf, WEIGHTS } from './layout.js'
import { dir, t } from '../../core/i18n.js'

/** @import { Design, Part, Book } from './layout.js' */
/** @import { Line } from './format.js' */

const GAP = /(\[[^\]\n]{1,40}\]|［[^］\n]{1,40}］)/
// A separator between facts (Saturday 14 November · 3 pm) ends the line it is on rather than starting the next.
const SEPARATOR = / ([·•|–—])(?= )/g
/** Custom properties set through the CSSOM, as the policy refuses a style attribute. @param {Record<string, string>} values */
export const vars = (values) => ref((element) => { for (const [name, value] of Object.entries(element ? values : {})) /** @type {HTMLElement} */ (element).style.setProperty(name, value) })
// The ornaments (art.json), and lean-qr's smallest build (D467), which draws a QR code: without it, a QR code is its frame.
export const [ART, qr] = await Promise.all([fetch(new URL('art.json', import.meta.url)).then((response) => response.json()), import(new URL('../../vendor/lean-qr/lean-qr.mjs', import.meta.url).href).catch(() => null)])
/** Each QR code's dark modules, a square each as one path, and how many to a side, by what it holds. @type {Map<string, { size: number, d: string } | null>} */
const codes = new Map()
/** A QR code for an address or words, or null where there is none to draw. @param {string} [link] */
export function codeOf(link) {
  if (!link || !qr) return null
  if (!codes.has(link)) {
    try { const { size, get } = qr.generate(link), d = []; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (get(x, y)) d.push(`M${x} ${y}h1v1h-1z`); codes.set(link, { size, d: d.join('') }) } catch { codes.set(link, null) }
  }
  return codes.get(link) ?? null
}

/** A picture's type, from its file's extension. @param {string} file */
export const typeOf = (file) => `image/${(/\.(\w+)$/.exec(file)?.[1] ?? 'png').replace('jpg', 'jpeg').replace('svg', 'svg+xml')}`

/** A part as drawn: its box, and its colour, picture or words, a gap the brain left marked. @param {Design} design @param {Part} part */
function partOf(design, part) {
  const { w, h } = design.page, [x, y, pw, ph] = part.box
  const place = { '--x': `${(x / w) * 100}%`, '--y': `${(y / h) * 100}%`, '--w': `${(pw / w) * 100}%`, '--h': `${(ph / h) * 100}%` }
  const round = { '--round': `${((part.radius ?? 0) / w) * 100}cqi`, '--line': `${((part.line ?? 0) / w) * 100}cqi` }, form = `${part.form === 'circle' ? 'is-circle' : ''} ${part.line ? 'is-outline' : ''}`
  if (part.art) return html`<svg class="design-part" data-part=${part.id} viewBox="0 0 100 100" ${vars(place)}>${pathsOf(design, part, ART).map(({ d, fill, stroke, width }) => svg`<path d=${d}
    fill=${fill} stroke=${stroke} stroke-width=${width} stroke-linecap="round" stroke-linejoin="round"/>`)}</svg>`
  if (part.role === 'shape') return html`<div class="design-part design-shape ${form}" data-part=${part.id} ${vars({ ...place, ...round, '--paint': colourOf(design, part.fill) })}></div>`
  const code = part.role === 'qr' && codeOf(part.link), [dark, light] = inksOf(design)
  // A QR code with a quiet edge two modules wide, its darker colour on its lighter.
  if (code) return html`<svg class="design-part" data-part=${part.id} viewBox="-2 -2 ${code.size + 4} ${code.size + 4}" shape-rendering="crispEdges" ${vars(place)}>
    <rect x="-2" y="-2" width=${code.size + 4} height=${code.size + 4} fill=${light}/><path d=${code.d} fill=${dark}/></svg>`
  if (part.role === 'picture' || part.role === 'qr') {
    return html`<div class="design-part design-picture ${form}" data-part=${part.id} ${vars({ ...place, ...round, '--pen': colourOf(design, 'ink') })}>${part.file
      ? html`<app-shared uri=${part.file} type=${typeOf(part.file)}></app-shared>` : html`<span dir=${dir(design.lang)}>${part.role === 'qr' ? t('designs.role.qr') : part.words}</span>`}</div>`
  }
  return html`<div class="design-part design-words v-${part.voice ?? design.voice}" data-part=${part.id} data-align=${part.align ?? 'center'} ${vars({ ...place,
    '--size': `${((part.size ?? 0) / w) * 100}cqi`, '--lead': String(leadOf(design, part)), '--weight': String(weightOf(design, part)), '--pen': colourOf(design, part.color) })}>
    <p dir=${dir(design.lang)}>${(part.text ?? '').replace(SEPARATOR, '\u00a0$1').split(GAP).map((bit, i) => (i % 2 ? html`<mark>${bit}</mark>` : bit))}</p></div>`
}

/** A design's page, with what the pane draws over it. @param {Design} design @param {unknown} [over] */
export const pageOf = (design, over = nothing) => html`<div class="design-page" lang=${design.lang} dir="ltr" ${vars({ '--ratio': `${design.page.w} / ${design.page.h}`, '--r': String(design.page.w / design.page.h), '--ground': design.colours.ground })}>
  ${design.parts.map((part) => partOf(design, part))}${over}</div>`

/** Each drawn part's element, by its id. @param {Element} page */
const elements = (page) => new Map([...page.querySelectorAll('[data-part]')].map((element) => [/** @type {HTMLElement} */ (element).dataset.part, /** @type {HTMLElement} */ (element)]))

/**
 * The design with its words fitted, as the page draws them now: in each region, those not moved by hand stacked at the
 * heights they take, their type shrunk until the region holds them, down to half; any other shrunk until its box does.
 * The same design when nothing changed. @param {Element} page @param {Design} design @param {Book} book
 */
export function fit(page, design, book) {
  const scale = design.page.w / page.getBoundingClientRect().width, drawn = elements(page), unit = unitOf(design.page)
  if (!Number.isFinite(scale)) return design
  const sized = new Map(design.parts.map((part) => [part.id, part.size ?? 0]))
  const height = (/** @type {Part} */ part) => (/** @type {HTMLElement | undefined} */ (drawn.get(part.id)?.firstElementChild)?.getBoundingClientRect().height ?? 0) * scale
  const resize = (/** @type {Part} */ part, /** @type {number} */ size) => { sized.set(part.id, size); drawn.get(part.id)?.style.setProperty('--size', `${(size / design.page.w) * 100}cqi`) }
  const over = (/** @type {Part} */ part) => { const words = /** @type {HTMLElement | undefined} */ (drawn.get(part.id)?.firstElementChild); return Boolean(words && words.scrollWidth > words.clientWidth + 1) }
  const boxes = new Map(), { regions } = frameOf(book, design)
  for (const [n, region] of regions.entries()) {
    const here = design.parts.filter((part) => part.text !== undefined && !part.moved && !part.added && part.region === n)
    const floor = new Map(here.map((part) => [part.id, (part.size ?? 0) / 2]))
    for (let tries = 0; tries < 12; tries++) {
      const total = here.reduce((sum, part) => sum + height(part), 0) + unit * 1.6 * (here.length - 1)
      if ((total <= region.box[3] && !here.some(over)) || here.every((part) => (sized.get(part.id) ?? 0) <= (floor.get(part.id) ?? 0))) break
      for (const part of here) resize(part, Math.max(floor.get(part.id) ?? 0, (sized.get(part.id) ?? 0) * 0.92))
    }
    stack(region, here.map((part) => ({ role: part.role, height: height(part) })), unit * 1.6).forEach((box, i) => boxes.set(here[i].id, box))
  }
  for (const part of design.parts.filter((one) => one.text !== undefined && (one.moved || one.added))) {
    for (let tries = 0; tries < 12 && (height(part) > part.box[3] + 1 || over(part)) && (sized.get(part.id) ?? 0) > (part.size ?? 0) / 2; tries++) resize(part, (sized.get(part.id) ?? 0) * 0.92)
  }
  const near = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.every((n, i) => Math.abs(n - b[i]) < 0.5)
  const parts = design.parts.map((part) => ({ ...part, ...(Math.abs((sized.get(part.id) ?? 0) - (part.size ?? 0)) > 0.01 && { size: sized.get(part.id) }), ...(boxes.has(part.id) && !near(boxes.get(part.id), part.box) && { box: boxes.get(part.id) }) }))
  return parts.some((part, i) => part !== design.parts[i] && (part.size !== design.parts[i].size || part.box !== design.parts[i].box)) ? { ...design, parts } : design
}

/**
 * Each text part's lines as the page lays them out, in the page's units: their words, baseline, middle, width, type and
 * colour, grapheme by grapheme, grouped by the top of their boxes. @param {Element} page @param {Design} design @returns {Record<string, Line[]>}
 */
export function measure(page, design) {
  const at = page.getBoundingClientRect(), scale = design.page.w / at.width, pen = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'))
  const segmenter = new Intl.Segmenter(design.lang, { granularity: 'grapheme' }), range = document.createRange(), drawn = elements(page)
  return Object.fromEntries(design.parts.filter((part) => part.text).map((part) => {
    const element = /** @type {HTMLElement} */ (drawn.get(part.id)?.firstElementChild), style = getComputedStyle(element), size = parseFloat(style.fontSize)
    pen.font = `${style.fontWeight} ${size}px ${style.fontFamily}`
    const ascent = pen.measureText('Hg').fontBoundingBoxAscent
    /** @type {{ top: number, left: number, right: number, text: string }[]} */
    const found = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = /** @type {Text} */ (node)
      for (const { segment, index } of segmenter.segment(text.data)) {
        range.setStart(text, index)
        range.setEnd(text, index + segment.length)
        const rect = [...range.getClientRects()].find((one) => one.width > 0)
        if (!rect) { if (found.length) found[found.length - 1].text += segment; continue }
        let line = found.find((one) => Math.abs(one.top - rect.top) < size * 0.5)
        if (!line) found.push(line = { top: rect.top, left: rect.left, right: rect.right, text: '' })
        line.text += segment
        line.left = Math.min(line.left, rect.left)
        line.right = Math.max(line.right, rect.right)
      }
    }
    return [part.id, found.filter((one) => one.text.trim()).map((one) => ({ text: one.text.trim(), x: ((one.left + one.right) / 2 - at.left) * scale, y: (one.top - at.top + ascent) * scale,
      width: (one.right - one.left) * scale, anchor: /** @type {const} */ ('middle'), dir: /** @type {'ltr' | 'rtl'} */ (style.direction), family: style.fontFamily, size: size * scale,
      weight: Number(style.fontWeight), fill: colourOf(design, part.color) }))]
  }))
}

/** Where Jean draws a design out of sight, a page wide. */
const aside = () => document.querySelector('.design-aside') ?? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'design-aside', inert: true }))

/**
 * A design fitted and its lines measured, drawn out of sight once its faces are in, as the file is written from it.
 * @param {Design} design @param {Book} book @returns {Promise<{ design: Design, lines: Record<string, Line[]> }>}
 */
export async function laidOut(design, book) {
  const holder = aside().appendChild(document.createElement('div'))
  try {
    render(pageOf(design), holder)
    const voices = new Set(design.parts.map((part) => part.voice ?? design.voice))
    await Promise.all([...voices].flatMap((voice) => WEIGHTS[voice].map((weight) => document.fonts.load(`${weight} 16px ${voice[0].toUpperCase()}${voice.slice(1)}`, design.parts.map((part) => part.text ?? '').join(''))))).catch(() => {})
    let fitted = design
    // Fitted until it settles, as each stack moves its parts.
    for (let tries = 0, next = fit(holder.firstElementChild ?? holder, fitted, book); tries < 3 && next !== fitted; tries++, next = fit(holder.firstElementChild ?? holder, fitted, book)) {
      fitted = next
      render(pageOf(fitted), holder)
    }
    return { design: fitted, lines: measure(holder.firstElementChild ?? holder, fitted) }
  } finally {
    render(nothing, holder)
    holder.remove()
  }
}
