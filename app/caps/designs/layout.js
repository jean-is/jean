// Designs' layouts (D572): the brain gives facts by their role, and Jean lays them out on its own layouts
// (layouts.json), three takes at once, each a layout, a palette and a voice, dealt again with no brain for More
// takes. A layout's boxes are in percent of the page, placed from its start, so it mirrors for a language written
// right to left; the words of a region stack in it, their type shrunk until they fit, as the view measures them
// (`stack`). A design re-laid on another take, or another size for Save, keeps its words and what the user added;
// design_change's changes (`changed`) are Jean's version of each part, for the user to accept or reject. Pure.
import { ROLES, VOICES, PAGES } from './tool.js'
import { marks, contrast } from './checks.js'
import { dir } from '../../core/i18n.js'

/** @import { Facts } from './tool.js' */
/** @import { Page } from './checks.js' */
/** @typedef {[number, number, number, number]} Box  x, y, width and height, in the page's units */
/**
 * A part: its role (a fact's, picture, shape, or text the user added), its words or picture (its file and the
 * words that describe it, its pixels), its box and type size in the page's units, its colour (a palette's name or
 * #rrggbb), what it sits on, the region it stacks in, moved by hand, and who changed it last and when.
 * @typedef {{ id: string, role: string, text?: string, file?: string, words?: string, px?: number[], box: number[], size?: number, align?: string,
 *   color?: string, fill?: string, radius?: number, on?: string, voice?: string, region?: number, moved?: boolean, added?: boolean, by?: string, at?: string }} Part
 */
/** @typedef {{ ground: string, ink: string, accent: string, accent2: string }} Colours */
/** A take: its layout's, palette's and voice's ids. @typedef {[string, string, string]} Take */
/**
 * @typedef {{ format: 1, name: string, author: string, created: string, changed: string, lang: string, size: string, page: Page, take: Take, takes: Take[], deal: number,
 *   colours: Colours, voice: string, parts: Part[], quiet?: string[], occasion?: string, date?: string, pinned?: boolean }} Design
 */
/** @typedef {{ box: number[], roles?: string[], align: string, valign: string, foot?: boolean, on?: string }} Region */
/** @typedef {{ picture?: number[], shapes?: { box: number[], fill: string, radius?: number }[], regions: Region[] }} Frame */
/** @typedef {{ id: string, voice: string, needs?: string, type?: Record<string, number> } & Record<string, any>} Layout */
/** @typedef {{ type: Record<string, number>, colours: Record<string, string>, layouts: Layout[], palettes: (Colours & { id: string })[] }} Book */

/** The type each voice's display words and other words take. */
export const WEIGHTS = /** @type {Record<string, number[]>} */ ({ friendly: [800, 600], elegant: [700, 500], bold: [700, 500], calm: [700, 500], handwritten: [400, 400] })
const DISPLAY = ['title', 'when', 'who']
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/** @param {Page} page */
export const shapeOf = (page) => (page.h / page.w > 1.15 ? 'tall' : page.w / page.h > 1.15 ? 'wide' : 'square')
/** A hundredth of the page's shorter side, which type and moves go by. @param {Page} page */
export const unitOf = (page) => Math.min(page.w, page.h) / 100
/** @param {Design} design @param {string} [name] */
export const colourOf = (design, name) => (name && design.colours[/** @type {keyof Colours} */ (name)]) || name || design.colours.ink
/** How far apart a colour is from what it sits on, WCAG's ratio. @param {Design} design @param {string} name @param {string} [on] */
export const contrastOf = (design, name, on) => contrast(colourOf(design, name), colourOf(design, on ?? 'ground'))
/** A part's weight, as its voice writes its role. @param {Design} design @param {Part} part */
export const weightOf = (design, part) => WEIGHTS[part.voice ?? design.voice]?.[DISPLAY.includes(part.role) ? 0 : 1] ?? 600
/** How far apart a part's lines are. @param {Design} design @param {Part} part */
export const leadOf = (design, part) => (WIDE.test(part.text ?? '') ? 1.35 : ['elegant', 'bold'].includes(part.voice ?? design.voice) ? 1.15 : part.role === 'small' ? 1.25 : 1.2)

/** The voices a language has every letter of in Jean's faces (findings.md); a script Jean has no face for takes the device's in each. @param {string} lang */
export function voicesFor(lang) {
  const base = lang.split('-')[0]
  if (['el', 'ha'].includes(base)) return ['calm']
  if (base === 'yo') return ['friendly', 'calm']
  const latin = new Intl.Locale(lang).maximize().script === 'Latn'
  return VOICES.filter((voice) => voice !== 'handwritten' || latin)
}

/** A layout's frame on a page in its units, mirrored right to left, bare without a picture. @param {Book} book @param {Design} design */
export function frameOf(book, design) {
  const layout = book.layouts.find((one) => one.id === design.take[0]) ?? book.layouts[0], shape = layout[shapeOf(design.page)]
  const bare = !design.parts.some((part) => part.id === 'picture'), { w, h } = design.page, rtl = dir(design.lang) === 'rtl'
  const box = (/** @type {number[]} */ [x0, y0, x1, y1]) => [((rtl ? 100 - x1 : x0) * w) / 100, (y0 * h) / 100, ((x1 - x0) * w) / 100, ((y1 - y0) * h) / 100]
  /** @type {Frame} */
  const frame = { ...shape, ...(bare && shape.bare) }
  return { layout, picture: bare ? undefined : frame.picture && box(frame.picture), shapes: (frame.shapes ?? []).map((one) => ({ ...one, box: box(one.box) })),
    regions: frame.regions.map((one) => ({ ...one, box: box(one.box) })) }
}

/** How tall words set in a width at a size, roughly: the view measures them. @param {string} text @param {number} width @param {number} size @param {number} lead */
export const tall = (text, width, size, lead) => text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(([...line].reduce((n, char) => n + (WIDE.test(char) ? 1 : 0.55), 0) * size) / width)) * size * lead, 0)

/**
 * Each part's box in a region, its words stacked in the order given, `gap` apart, at the region's top, middle or
 * foot, the small print at its foot when the region says so. @param {Region} region @param {{ role: string, height: number }[]} items @param {number} gap
 */
export function stack(region, items, gap) {
  const [x, y, w, h] = region.box, foot = region.foot && items.length > 1 && items.at(-1)?.role === 'small' ? items.at(-1) : null, rest = foot ? items.slice(0, -1) : items
  const total = rest.reduce((sum, item) => sum + item.height, 0) + gap * (rest.length - 1), room = h - (foot ? foot.height + gap : 0)
  let top = y + Math.max(0, region.valign === 'end' ? room - total : region.valign === 'center' ? (room - total) / 2 : 0)
  const out = rest.map((item) => { const box = [x, top, w, item.height]; top += item.height + gap; return box })
  return foot ? [...out, [x, y + h - foot.height, w, foot.height]] : out
}

/** Which region each role stacks in: the one naming it, else the last naming none. @param {Region[]} regions @param {string} role */
export const regionFor = (regions, role) => Math.max(0, regions.findIndex((one) => one.roles?.includes(role)) + 1 || regions.findLastIndex((one) => !one.roles) + 1) - 1

/**
 * The design laid out on its take: its colours and voice the take's, a box and a type size for each fact's words
 * and its first picture, the layout's shapes; what the user added stays where it is. Moves are let go.
 * @param {Book} book @param {Design} design @returns {Design}
 */
export function laid(book, design) {
  const palette = book.palettes.find((one) => one.id === design.take[1]) ?? book.palettes[0], { id, ...colours } = palette
  const next = { ...design, colours, voice: design.take[2], parts: design.parts.filter((part) => part.added || part.role !== 'shape') }
  const { layout, picture, shapes, regions } = frameOf(book, next), unit = unitOf(design.page), type = { ...book.type, ...layout.type }
  const parts = next.parts.map((part) => (part.added ? part : { ...part, moved: undefined, voice: part.role === 'small' && next.voice !== 'calm' ? 'calm' : undefined }))
  for (const [n, region] of regions.entries()) {
    const here = parts.filter((part) => !part.added && part.text !== undefined && regionFor(regions, part.role) === n)
    let k = 1
    const items = () => here.map((part) => ({ role: part.role, height: tall(part.text ?? '', region.box[2], type[part.role] * unit * k, leadOf(next, part)) }))
    // Shrunk until the region holds them, down to half.
    while (k > 0.5 && items().reduce((sum, item) => sum + item.height, 0) + unit * 2 * k * (here.length - 1) > region.box[3]) k *= 0.92
    const boxes = stack(region, items(), unit * 2 * k)
    here.forEach((part, i) => Object.assign(part, { box: boxes[i], size: type[part.role] * unit * k, region: n, align: region.align, on: region.on,
      color: region.on ? (region.on === 'accent' ? 'ground' : 'ink') : book.colours[part.role] }))
  }
  const first = parts.find((part) => part.id === 'picture')
  if (first && picture) Object.assign(first, { box: picture })
  return { ...next, parts: [...shapes.map((shape, n) => ({ id: `shape-${n + 1}`, role: 'shape', box: shape.box, fill: shape.fill, radius: (shape.radius ?? 0) * unit })), ...parts] }
}

/** A number from a design's id, to deal its palettes. @param {string} seed */
const hash = (seed) => [...seed].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 9973, 7)

/**
 * Three takes for a design's facts, the `deal`th three: the layouts its facts suit, those a fact asks for first (a
 * list's menu, a short title made big, a certificate's name), each on another palette, in its layout's voice where
 * the language has it. @param {Book} book @param {Design} design @param {number} deal
 * @returns {Take[]}
 */
export function takesOf(book, design, deal) {
  const role = (/** @type {string} */ one) => design.parts.find((part) => part.role === one)?.text ?? ''
  const has = /** @type {Record<string, boolean>} */ ({ picture: design.parts.some((part) => part.id === 'picture'), items: Boolean(role('items')), who: Boolean(role('who')) && !role('when'),
    short: [...new Intl.Segmenter(design.lang).segment(role('title'))].length <= 12 })
  const fit = book.layouts.filter((one) => !one.needs || has[one.needs]), order = [...fit.filter((one) => one.needs && one.needs !== 'picture'), ...fit.filter((one) => !one.needs || one.needs === 'picture')]
  const voices = voicesFor(design.lang), at = hash(design.created + design.name)
  return [0, 1, 2].map((i) => {
    const layout = order[(deal * 3 + i) % order.length]
    return [layout.id, book.palettes[(at + deal * 3 + i) % book.palettes.length].id, voices.includes(layout.voice) ? layout.voice : voices[0]]
  })
}

/**
 * A new design from the brain's facts, laid out as its first take, the other two beside it: a part for each fact's
 * words and for the first picture it asks for, which a maker fills or the user drops in.
 * @param {Book} book @param {Facts} facts @param {{ lang: string, now: string, by: string }} options @returns {Design}
 */
export function designOf(book, facts, { lang, now, by }) {
  /** @type {Part[]} */
  const parts = [...ROLES.flatMap((role) => (facts.words[role] ? [{ id: role, role, text: facts.words[role], box: [0, 0, 0, 0], by, at: now }] : [])),
    ...facts.pictures.slice(0, 1).map((picture) => ({ id: 'picture', role: 'picture', words: picture.describe, box: [0, 0, 0, 0], by, at: now }))]
  const design = /** @type {Design} */ ({ format: 1, name: facts.name, author: by, created: now, changed: now, lang, size: facts.size, page: PAGES[facts.size], take: ['', '', ''], takes: [], deal: 0,
    colours: book.palettes[0], voice: 'calm', parts, ...(facts.occasion && { occasion: facts.occasion }), ...(facts.date && { date: facts.date }) })
  const takes = takesOf(book, design, 0)
  return laid(book, { ...design, take: takes[0], takes })
}

/** The design at another size, laid out on its take, what the user added in the same place on the page. @param {Book} book @param {Design} design @param {string} size */
export function resized(book, design, size) {
  const page = PAGES[size], [sx, sy] = [page.w / design.page.w, page.h / design.page.h]
  return laid(book, { ...design, size, page, parts: design.parts.map((part) => (part.added ? { ...part, box: [part.box[0] * sx, part.box[1] * sy, part.box[2] * sx, part.box[3] * sy] } : part)) })
}

/** The words of a design in reading order: its text, a picture's alt text, what Creations and Search read. @param {Design} design */
export const textOf = (design) => design.parts.flatMap((part) => (part.text ? [part.text] : part.role === 'picture' && part.words ? [part.words] : [])).join('\n')

/** What a design's mark says, part by part: a gap, a wrong weekday, faint words, a soft picture, the printer's margin. @param {Design} design @param {Date} now */
export function marksOf(design, now) {
  const { page } = design, pt = (/** @type {number} */ size) => (page.mm ? (size * page.mm * 72) / 25.4 : size * 0.75)
  return marks({ lang: design.lang, page, ground: design.colours.ground, parts: design.parts.map((part) => ({ ...part, color: colourOf(design, part.color), ground: part.on && colourOf(design, part.on),
    pt: pt(part.size ?? 0), bold: weightOf(design, part) >= 700 })) }, { now })
}

/**
 * design_change's changes, as Jean's version of each part it changes (null: taken away), with the few words it
 * gave each, and the parts whose picture is to be made: a part's words, a move of a little or a lot, bigger or
 * smaller, its colour, a new picture; an id it doesn't know with words is a part added. Throws what is wrong, for
 * the brain. @param {Design} design @param {any[]} changes @param {string} at
 * @returns {{ parts: Record<string, Part | null>, notes: Record<string, string>, paint: string[] }}
 */
export function changed(design, changes, at) {
  const unit = unitOf(design.page), rtl = dir(design.lang) === 'rtl'
  /** @type {Record<string, Part | null>} */
  const parts = {}, notes = /** @type {Record<string, string>} */ ({}), paint = /** @type {string[]} */ ([])
  for (const change of changes) {
    const id = String(change?.part ?? ''), was = parts[id] ?? design.parts.find((part) => part.id === id)
    if (!was && typeof change?.text !== 'string') throw new Error(`The design has no part "${id}": its parts are ${design.parts.filter((part) => part.role !== 'shape').map((part) => part.id).join(', ')}. A new part needs its text.`)
    if (change.note) notes[id] = String(change.note)
    if (change.remove) { parts[id] = null; continue }
    const part = /** @type {Part} */ ({ ...(was ?? { id, role: 'text', added: true, size: unit * 5, align: 'center', box: [design.page.w * 0.1, design.page.h * 0.8, design.page.w * 0.8, unit * 8] }), by: 'jean', at })
    if (typeof change.text === 'string') part.text = change.text
    if (/^#[0-9a-f]{6}$/i.test(change.color ?? '')) part.color = change.color
    if (typeof change.picture === 'string' && part.role === 'picture') { part.words = change.picture; delete part.file; paint.push(id) }
    const step = unit * (change.far ? 8 : 2), [x, y, w, h] = part.box
    const dx = { start: rtl ? step : -step, end: rtl ? -step : step }[/** @type {string} */ (change.move)] ?? 0, dy = { up: -step, down: step }[/** @type {string} */ (change.move)] ?? 0
    const k = { bigger: 1.15, smaller: 1 / 1.15 }[/** @type {string} */ (change.grow)] ?? 1
    if (dx || dy || k !== 1) Object.assign(part, { moved: true, box: [x + dx - (w * (k - 1)) / 2, y + dy - (h * (k - 1)) / 2, w * k, h * k], ...(part.size && { size: part.size * k }) })
    parts[id] = part
  }
  return { parts, notes, paint }
}

/** A design with Jean's version of the parts given, a part taken away gone, one added at the end. @param {Design} design @param {Record<string, Part | null>} parts */
export const withParts = (design, parts) => ({ ...design, parts: [...design.parts.flatMap((part) => (parts[part.id] === null ? [] : [parts[part.id] ?? part])),
  .../** @type {Part[]} */ (Object.values(parts).filter((part) => part && !design.parts.some((one) => one.id === part.id)))] })
