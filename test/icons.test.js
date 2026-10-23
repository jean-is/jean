// The Tilde icon set (docs/design.md#icons): every glyph, shared or a capability's own, keeps to the grid and the
// pen, fills only what is solid, and the case of capabilities gives each one a glyph of its own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

const app = new URL('../app/', import.meta.url)
/** @param {string} path */
const read = (path) => readFile(new URL(path, app), 'utf8')

/** Every module that draws a glyph with the shared icon(): ui/ and each capability's. */
const modules = [...(await readdir(new URL('ui/', app))).filter((name) => name.endsWith('.js')).map((name) => `ui/${name}`),
  ...(await readdir(new URL('caps/', app), { recursive: true })).filter((name) => name.endsWith('.js')).map((name) => `caps/${name}`)]
/** @type {{ where: string, markup: string }[]} */
const glyphs = []
for (const path of modules) {
  for (const [, markup] of (await read(path)).matchAll(/\bicon\(svg`([^`]*)`/g)) glyphs.push({ where: `${path}: ${markup.slice(0, 40)}…`, markup })
}
/** The shared glyphs' names, in the first screen's module and in the rest's. @param {string} source */
const namesOf = (source) => [...source.matchAll(/^ {2}'?([\w-]+)'?: icon\(/gm)].map((match) => match[1])
const first = namesOf(await read('ui/icons.js'))
const rest = namesOf(await read('ui/menu-icons.js'))

/** The points of a path's outline, its curves and arcs sampled. @param {string} d @returns {Generator<number[]>} */
function* outline(d) {
  const tokens = d.match(/[a-z]|-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi) ?? []
  let [i, x, y, sx, sy, cx, cy, command, last] = [0, 0, 0, 0, 0, 0, 0, '', '']
  const n = () => Number(tokens[i++])
  /** @param {number[][]} p */
  const curve = function* (p) {
    for (let k = 1; k <= 16; k++) {
      const t = k / 16
      const at = (/** @type {number} */ axis) => p.length === 3
        ? (1 - t) ** 2 * p[0][axis] + 2 * (1 - t) * t * p[1][axis] + t ** 2 * p[2][axis]
        : (1 - t) ** 3 * p[0][axis] + 3 * (1 - t) ** 2 * t * p[1][axis] + 3 * (1 - t) * t ** 2 * p[2][axis] + t ** 3 * p[3][axis]
      yield [at(0), at(1)]
    }
  }
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) command = tokens[i++]
    const rel = command === command.toLowerCase()
    const [ox, oy] = rel ? [x, y] : [0, 0]
    const kind = command.toUpperCase()
    if (kind === 'Z') {
      [x, y] = [sx, sy]
      assert.ok(i >= tokens.length || /[a-z]/i.test(tokens[i]), `a number follows Z in ${d}`)
    } else if (kind === 'M') {
      [x, y] = [ox + n(), oy + n()]; [sx, sy] = [x, y]; command = rel ? 'l' : 'L'; yield [x, y]
    } else if (kind === 'L') { [x, y] = [ox + n(), oy + n()]; yield [x, y] }
    else if (kind === 'H') { x = ox + n(); yield [x, y] }
    else if (kind === 'V') { y = oy + n(); yield [x, y] }
    else if (kind === 'C' || kind === 'S') {
      const one = kind === 'C' ? [ox + n(), oy + n()] : /[CS]/.test(last) ? [2 * x - cx, 2 * y - cy] : [x, y]
      const p = [[x, y], one, [ox + n(), oy + n()], [ox + n(), oy + n()]]
      yield* curve(p); [[cx, cy], [x, y]] = [p[2], p[3]]
    } else if (kind === 'Q' || kind === 'T') {
      const one = kind === 'Q' ? [ox + n(), oy + n()] : /[QT]/.test(last) ? [2 * x - cx, 2 * y - cy] : [x, y]
      const p = [[x, y], one, [ox + n(), oy + n()]]
      yield* curve(p); [[cx, cy], [x, y]] = [p[1], p[2]]
    } else if (kind === 'A') {
      // The arc from its end points to its centre, as SVG's implementation notes do it (F.6.5).
      let [rx, ry] = [Math.abs(n()), Math.abs(n())]
      const [phi, large, sweep, x2, y2] = [n() * Math.PI / 180, n(), n(), ox + n(), oy + n()]
      const [cos, sin] = [Math.cos(phi), Math.sin(phi)]
      const [dx, dy] = [(x - x2) / 2, (y - y2) / 2]
      const [px, py] = [cos * dx + sin * dy, -sin * dx + cos * dy]
      const grow = Math.max(1, Math.sqrt(px ** 2 / rx ** 2 + py ** 2 / ry ** 2));
      [rx, ry] = [rx * grow, ry * grow]
      const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx ** 2 * ry ** 2 - rx ** 2 * py ** 2 - ry ** 2 * px ** 2) / (rx ** 2 * py ** 2 + ry ** 2 * px ** 2)))
      const [qx, qy] = [k * rx * py / ry, -k * ry * px / rx]
      const angle = (/** @type {number} */ ux, /** @type {number} */ uy) => Math.atan2(uy, ux)
      const from = angle((px - qx) / rx, (py - qy) / ry)
      let turn = angle((-px - qx) / rx, (-py - qy) / ry) - from
      if (sweep && turn < 0) turn += 2 * Math.PI
      if (!sweep && turn > 0) turn -= 2 * Math.PI
      const [ccx, ccy] = [cos * qx - sin * qy + (x + x2) / 2, sin * qx + cos * qy + (y + y2) / 2]
      for (let s = 1; s <= 16; s++) {
        const t = from + turn * s / 16
        yield [ccx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, ccy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]
      }
      [x, y] = [x2, y2]
    } else assert.fail(`unknown command ${command} in ${d}`)
    last = kind
  }
}

/** A glyph's elements, each with its attributes and the rotation of the groups around it. @param {string} markup */
function* elements(markup) {
  /** @type {number[][]} */
  const turns = []
  for (const [tag, close, name, rest] of markup.matchAll(/<(\/?)(\w+)([^>]*)>/g)) {
    if (close) { if (name === 'g') turns.pop(); continue }
    const attributes = Object.fromEntries([...rest.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]))
    if (name === 'g') {
      const [a = 0, gx = 0, gy = 0] = (/rotate\(([^)]*)\)/.exec(attributes.transform ?? '')?.[1].split(/[\s,]+/) ?? []).map(Number)
      if (!tag.endsWith('/>')) turns.push([a, gx, gy])
    } else yield { name, attributes, turns: [...turns] }
  }
}

/** The points an element draws through, in the glyph's own units. @param {{ name: string, attributes: Record<string, string>, turns: number[][] }} element */
function pointsOf({ name, attributes: a, turns }) {
  const v = (/** @type {string} */ key) => Number(a[key] ?? 0)
  const round = (/** @type {number} */ rx, /** @type {number} */ ry) => Array.from({ length: 32 }, (_, k) => [v('cx') + rx * Math.cos(k * Math.PI / 16), v('cy') + ry * Math.sin(k * Math.PI / 16)])
  const points = name === 'path' ? [...outline(a.d)]
    : name === 'rect' ? [[v('x'), v('y')], [v('x') + v('width'), v('y')], [v('x'), v('y') + v('height')], [v('x') + v('width'), v('y') + v('height')]]
    : name === 'circle' ? round(v('r'), v('r'))
    : name === 'ellipse' ? round(v('rx'), v('ry'))
    : assert.fail(`a glyph draws only paths, rectangles, circles and ellipses, not ${name}`)
  return turns.reduceRight((all, [degrees, gx, gy]) => {
    const [cos, sin] = [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180)]
    return all.map(([px, py]) => [gx + (px - gx) * cos - (py - gy) * sin, gy + (px - gx) * sin + (py - gy) * cos])
  }, points)
}

test('the shared glyphs are drawn once: the first screen\'s in ui/icons.js, the rest in ui/menu-icons.js', () => {
  assert.equal(first.length, 23)
  assert.deepEqual(first.filter((name) => rest.includes(name)), [])
  assert.equal(new Set(rest).size, rest.length)
  assert.equal(glyphs.length >= first.length + rest.length, true)
})

test('every glyph stays within 2–22 of its 24 units', () => {
  for (const { where, markup } of glyphs) {
    for (const element of elements(markup)) {
      for (const [x, y] of pointsOf(element)) {
        assert.ok(x >= 2 - 1e-9 && x <= 22 + 1e-9 && y >= 2 - 1e-9 && y <= 22 + 1e-9, `${where} reaches ${x.toFixed(2)}, ${y.toFixed(2)}`)
      }
    }
  }
})

test('every glyph is drawn with the one pen, and fills only its solid parts, in the colour of its strokes', () => {
  for (const { where, markup } of glyphs) {
    assert.doesNotMatch(markup, /stroke-width|stroke-dasharray|style=|class=/, `${where} sets its own pen`)
    for (const { name, attributes } of elements(markup)) {
      if (!('fill' in attributes)) continue
      assert.equal(attributes.fill, 'currentColor', `${where} fills with another colour`)
      const closed = name !== 'path' || attributes.d.split(/(?=[Mm])/).every((part) => /[Zz]\s*$/.test(part))
      assert.ok(closed, `${where} fills a line that is not a shape`)
    }
  }
})

test('the case gives each capability a glyph of its own, from the set', async () => {
  const source = await read('ui/dialogs.js')
  const body = /export const ROOM_ICONS = [^(]*\(\{([^}]*)\}\)/.exec(source)?.[1] ?? ''
  const pairs = [...body.matchAll(/'?([\w-]+)'?: '([\w-]+)'/g)].map((match) => [match[1], match[2]])
  assert.ok(pairs.length > 20)
  /** @type {Map<string, string>} */
  const worn = new Map()
  for (const [id, glyph] of pairs) {
    assert.ok(first.includes(glyph) || rest.includes(glyph), `${id} wears ${glyph}, which the set doesn't draw`)
    assert.equal(worn.get(glyph), undefined, `${id} and ${worn.get(glyph)} both wear ${glyph}`)
    worn.set(glyph, id)
  }
  const catalogue = /export const CATALOGUE = \[(.*)\]/.exec(await read('ui/discovery.js'))?.[1] ?? ''
  const shown = [...catalogue.matchAll(/'([\w-]+)'/g)].map((match) => match[1])
  assert.ok(shown.length > 20)
  const worns = new Set(pairs.map(([id]) => id))
  assert.deepEqual(shown.filter((id) => !worns.has(id)), [], 'these capabilities show in the case without a glyph')
})
