// SPDX-License-Identifier: MIT
// A whiteboard as a picture (D747): the board as ./layout.js lays it, whole or the part in view, as SVG at a pixel a unit. Its sections,
// notes and texts are boxes whose words are HTML in a foreignObject, so that they wrap, take the look's faces and run in their own
// direction as they do on screen, a section's head with how many notes it holds and a note's foot with its owner and date as the board
// shows them; drawn lines and arrows are paths; every x is mirrored on a board that runs right to left. The colours are the look's,
// which the view reads. Pure, so node --test runs it; the view makes it a PNG (ui/save.js).
import { ownProblem } from '../tables/table.js'
import { layout, arrowPath, footOf, HEAD } from './layout.js'

/** @typedef {import('./layout.js').Box} Box */
/** @typedef {import('../tables/changes.js').Row} Row */
/**
 * The look's colours: the room, the board over it, its ink and its softer ink, a note that waits, and for each section colour its section,
 * its edge, a note in it or given it, and its ink. @typedef {{ room: string, board: string, ink: string, soft: string, wait: string, hues: { area: string, edge: string, note: string, ink: string }[] }} Palette
 */

/** Text made safe in XML. @param {unknown} text */
const esc = (text) => String(text ?? '').replace(/[\0-\x08\v\f\x0e-\x1f]/g, '').replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`)

/**
 * The board, or the part of it in `view`, as an SVG: its columns say what a note's foot shows, and the counts are in `locales`' digits.
 * @param {Row[]} rows @param {{ dir?: string, view?: Box, palette: Palette, font: string, words?: (row: Row) => string, columns?: { id: string, deleted?: string }[], locales?: string[] }} options
 * @returns {{ svg: string, w: number, h: number }}
 */
export function svgOf(rows, { dir = 'ltr', view, palette, font, words = (row) => String(row.cells.note ?? ''), columns = [], locales = ['en'] }) {
  const { areas, items, bounds } = layout(rows), pad = view ? 0 : 24, at = view ?? bounds, rtl = dir === 'rtl', hues = new Map(areas.map((area) => [area.row.id, area.hue]))
  const w = Math.ceil(at.w + 2 * pad), h = Math.ceil(at.h + 2 * pad), x = (/** @type {number} */ n) => (rtl ? at.x + at.w + pad - n : n - at.x + pad), y = (/** @type {number} */ n) => n - at.y + pad
  const box = (/** @type {Box} */ one) => `x="${rtl ? x(one.x + one.w) : x(one.x)}" y="${y(one.y)}" width="${one.w}" height="${one.h}"`
  const seen = (/** @type {Box} */ one) => !view || (one.x < view.x + view.w && one.x + one.w > view.x && one.y < view.y + view.h && one.y + one.h > view.y)
  /** HTML in a box: what it says is escaped already. */
  const said = (/** @type {Box} */ one, /** @type {string} */ style, /** @type {string} */ inner, way = 'auto') => `<foreignObject ${box(one)}><div xmlns="http://www.w3.org/1999/xhtml" dir="${way}" style="box-sizing: border-box; height: 100%; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; text-align: start; color: ${esc(palette.ink)}; font-family: ${esc(font)}; ${style}">${inner}</div></foreignObject>`
  const soft = (/** @type {string} */ style, /** @type {string[]} */ parts) => parts.map((part) => `<span style="color: ${esc(palette.soft)}; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${style}">${esc(part)}</span>`).join('')
  const count = new Intl.NumberFormat(locales)
  const path = (/** @type {string} */ d, /** @type {string} */ ink, /** @type {number} */ width) => `<path d="${d}" style="fill: none; stroke: ${esc(ink)}; stroke-width: ${width}; stroke-linecap: round; stroke-linejoin: round"/>`
  const parts = areas.filter(seen).map((area) => `<rect ${box(area)} rx="16" style="fill: ${esc(palette.hues[area.hue].area)}; stroke: ${esc(palette.hues[area.hue].edge)}"/>${said({ ...area, h: HEAD }, 'display: flex; align-items: baseline; gap: 8px; padding: 0 14px; font-size: 17px; font-weight: 600; line-height: 48px; white-space: nowrap',
    `<span dir="auto" style="overflow: hidden; text-overflow: ellipsis">${esc(words(area.row))}</span>${soft('font-size: 14px', [count.format(items.filter((item) => item.kind === 'note' && item.area === area.row.id).length)])}`, rtl ? 'rtl' : 'ltr')}`)
  for (const item of items.filter(seen)) {
    const { row } = item, own = row.cells['@hue'], ink = row.cells['@ink']
    if (item.kind === 'note') {
      const hue = own != null && !ownProblem('@hue', own) ? Number(own) : item.area ? hues.get(item.area) : undefined
      const foot = footOf(columns, row)
      parts.push(`<rect ${box(item)} rx="6" style="fill: ${esc(hue === undefined ? palette.wait : palette.hues[hue].note)}"/>${said(item, 'display: flex; flex-direction: column; padding: 9px 10px 6px; font-size: 14.4px; line-height: 1.3',
        `<div dir="auto" style="flex: 1; min-height: 0; overflow: hidden">${esc(words(row))}</div>${foot.length ? `<div dir="auto" style="display: flex; gap: 6px; font-size: 11.5px">${soft('', foot)}</div>` : ''}`)}`)
    } else if (item.kind === 'text') parts.push(said(item, row.cells['@size'] === 'title' ? 'font-size: 28px; font-weight: 700; line-height: 1.2' : 'font-size: 17px; line-height: 1.3', esc(words(row))))
    else if (item.ends) parts.push(path(arrowPath([x(item.ends[0]), y(item.ends[1]), x(item.ends[2]), y(item.ends[3])]), palette.ink, 2.5))
    else if (!ownProblem('@path', row.cells['@path'])) {
      const points = /** @type {number[]} */ (row.cells['@path']).map((n, i) => (i % 2 ? y(item.y + n) : x(item.x + n)))
      parts.push(path(points.reduce((d, n, i) => `${d}${i % 2 ? ' ' : i ? ' L' : 'M'}${n}`, ''), ink === 'ink' ? palette.ink : palette.hues[Number(ink) % palette.hues.length]?.ink ?? palette.ink, 3.5))
    }
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${[palette.room, palette.board].map((fill) => `<rect width="100%" height="100%" style="fill: ${esc(fill)}"/>`).join('')}${parts.join('')}</svg>`, w, h }
}
