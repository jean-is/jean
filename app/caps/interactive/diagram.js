// Diagrams (D291): a ```mermaid block's flowchart or mind map, read here (the parts brains write:
// nodes, their shapes, arrows and their words; a mind map's branches by their indent), laid out here
// (a flowchart in ranks, its crossings fewer; a mind map's branches either side of its root) and drawn
// as SVG in the room's colours, each of a mind map's branches in a colour of its own. Anything else a
// block says (styles, classes, links, subgraphs' frames) is left out; one this can't read stays code.
// Self-contained, the DOM's own calls only: <app-diagram> in an answer, and the same element lent to a
// page, which holds its Mermaid as text and draws it again when its text changes. Mermaid itself is
// a 1.6 MB library, for a few kinds of diagram brains write.

/** @typedef {{ id: string, label: string, shape: string }} Box */
/** @typedef {{ from: string, to: string, label: string, dashed: boolean, arrow: boolean }} Link */
/** @typedef {{ kind: 'flowchart', across: boolean, boxes: Map<string, Box>, links: Link[] }} Flowchart */
/** @typedef {{ label: string, shape: string, children: Branch[] }} Branch */
/** @typedef {{ kind: 'mindmap', root: Branch }} Mindmap */

// A box's shape, by the brackets around its words: the longest first.
const SHAPES = [['(((', ')))', 'circle'], ['([', '])', 'pill'], ['[[', ']]', 'box'], ['[(', ')]', 'pill'], ['((', '))', 'circle'], ['{{', '}}', 'hexagon'],
  ['[/', '/]', 'box'], ['[\\', '\\]', 'box'], ['[/', '\\]', 'box'], ['[\\', '/]', 'box'], ['[', ']', 'box'], ['(', ')', 'round'], ['{', '}', 'diamond'], ['>', ']', 'box'],
  ['))', '((', 'round'], [')', '(', 'round']]
const ID = /^[\p{L}\p{N}_]+/u
// An arrow, with its words written in it (-- yes -->) or after it (-->|yes|).
const ARROW = /^\s*(?:(--|==|-\.)\s+([^|>]*?)\s+)?(<?(?:-{2,}|={2,}|-?\.+-?)(?:>|x|o)?)\s*(?:\|([^|]*)\|)?\s*/

/** Words as a box shows them: quotes, Markdown's bold and line breaks as Mermaid writes them. @param {string} text */
const words = (text) => text.trim().replace(/^"(.*)"$/s, '$1').replace(/<br\s*\/?>/gi, '\n').replace(/\*\*|__|`/g, '').replace(/#quot;/g, '"').trim()

/** A box at the start of `rest`: its id, then its shape and words if they follow. @param {string} rest @returns {[Box, string] | null} */
function box(rest) {
  const id = ID.exec(rest)?.[0]
  if (!id) return null
  let after = rest.slice(id.length)
  for (const [open, close, shape] of SHAPES) {
    if (!after.startsWith(open)) continue
    const from = Math.max(open.length, after[open.length] === '"' ? after.indexOf('"', open.length + 1) : -1)
    // Closed where Mermaid closes it, or where the same brackets swapped, as brains sometimes write them (A([Start)]), leave the
    // statement going on as one does: to its end, an &, a class or an arrow; else where Mermaid would.
    const end = [close, [...close].reverse().join('')].map((ending) => after.indexOf(ending, from)).filter((at) => at >= 0).sort((a, b) => a - b).find((at) => /^\s*(&|$)|^:::/.test(after.slice(at + close.length)) || ARROW.test(after.slice(at + close.length))) ?? after.indexOf(close, from)
    if (end < 0) return null
    return [{ id, label: words(after.slice(open.length, end)) || id, shape }, after.slice(end + close.length).replace(/^:::\w+/, '')]
  }
  return [{ id, label: '', shape: '' }, after.replace(/^:::\w+/, '')]
}

/** Boxes joined by &, at the start of `rest`. @param {string} rest @returns {[Box[], string] | null} */
function group(rest) {
  const found = []
  for (let left = rest.trimStart(); ;) {
    const next = box(left)
    if (!next) return null
    found.push(next[0])
    const more = /^\s*&\s*/.exec(next[1])
    if (!more) return [found, next[1]]
    left = next[1].slice(more[0].length)
  }
}

/**
 * A Mermaid block as a flowchart or a mind map, or null when it is neither or can't be read.
 * @param {string} source @returns {Flowchart | Mindmap | null}
 */
export function parse(source) {
  const lines = source.split('\n').map((line) => line.replace(/%%.*$/, '')).filter((line) => line.trim())
  const head = /^\s*(flowchart|graph|mindmap)\b\s*(\w+)?/i.exec(lines[0] ?? '')
  if (!head) return null
  if (head[1].toLowerCase() === 'mindmap') return mindmap(lines.slice(1))
  /** @type {Map<string, Box>} */
  const boxes = new Map()
  /** @type {Link[]} */
  const links = []
  const keep = (/** @type {Box} */ found) => {
    const known = boxes.get(found.id)
    if (!known || (found.shape && !known.shape)) boxes.set(found.id, { ...found, label: found.label || known?.label || found.id })
  }
  // What follows its first word and direction, on its first line too (graph LR; A --> B).
  for (const statement of [lines[0].slice(head[0].length), ...lines.slice(1)].flatMap((line) => line.split(';'))) {
    const text = statement.trim()
    if (!text || /^(classDef|class|style|linkStyle|click|subgraph|end|direction)\b/.test(text)) continue
    let read = group(text)
    if (!read) return null
    read[0].forEach(keep)
    for (let rest = read[1]; rest.trim();) {
      const arrow = ARROW.exec(rest)
      if (!arrow || !/[-=.]/.test(arrow[3])) return null
      const to = group(rest.slice(arrow[0].length))
      if (!to) return null
      to[0].forEach(keep)
      for (const from of read[0]) for (const target of to[0]) links.push({ from: from.id, to: target.id, label: words(arrow[4] ?? arrow[2] ?? ''), dashed: arrow[3].includes('.'), arrow: /[>xo]$/.test(arrow[3]) })
      read = to
      rest = to[1]
    }
  }
  return boxes.size ? { kind: /** @type {const} */ ('flowchart'), across: /^(LR|RL)$/i.test(head[2] ?? ''), boxes, links } : null
}

/** A mind map's lines, each a branch of the last one less indented. @param {string[]} lines @returns {Mindmap | null} */
function mindmap(lines) {
  /** @type {{ indent: number, branch: Branch }[]} */
  const stack = []
  /** @type {Branch | null} */
  let root = null
  for (const line of lines) {
    const text = line.trim()
    if (text.startsWith('::') || /^:::/.test(text)) continue
    const indent = line.length - line.trimStart().length
    const bare = text.replace(/^[^\p{L}\p{N}_([{)]+/u, '')
    const found = box(/^[\p{L}\p{N}_]/u.test(bare) ? bare : `_${bare}`)
    const label = found && found[0].shape ? found[0].label : words(text.replace(/:::.*$/, ''))
    /** @type {Branch} */
    const branch = { label, shape: found?.[0].shape ?? '', children: [] }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    if (!stack.length) {
      if (root) return null
      root = branch
    } else stack[stack.length - 1].branch.children.push(branch)
    stack.push({ indent, branch })
  }
  return root ? { kind: 'mindmap', root } : null
}

// ─── Layout ──────────────────────────────────────────────────────────────────

const LINE = 18
const WRAP = 26

/** Words broken into lines of about WRAP characters. @param {string} text */
const wrapped = (text) => text.split('\n').flatMap((line) => line.split(' ').reduce((/** @type {string[]} */ out, word) => {
  const last = out[out.length - 1]
  if (last !== undefined && (last + ' ' + word).length <= WRAP) out[out.length - 1] = last + ' ' + word
  else out.push(word)
  return out
}, []))

/**
 * A box's size: its lines' widest and how many, padded for its shape. @param {Box | Branch} box
 * @param {(text: string) => number} measure @returns {{ lines: string[], width: number, height: number }}
 */
function sized(box, measure) {
  const lines = wrapped(box.label)
  const width = Math.max(...lines.map(measure), 8) + 28
  const height = lines.length * LINE + 18
  return box.shape === 'diamond' ? { lines, width: width * 1.35 + 10, height: height * 1.5 }
    : box.shape === 'circle' ? { lines, width: Math.max(width, height), height: Math.max(width, height) } : { lines, width, height }
}

/**
 * Where each box goes: ranks along the flow (each box below the boxes leading to it, a loop's way back
 * left out), boxes in each rank ordered by where their neighbours are, a few times, so that fewer
 * links cross; then each rank centred. Positions are boxes' centres.
 * @param {Flowchart} chart @param {(text: string) => number} measure
 */
export function flowLayout(chart, measure) {
  const ids = [...chart.boxes.keys()]
  const back = new Set()
  const state = new Map()
  /** @param {string} id */
  const visit = (id) => {
    state.set(id, 1)
    for (const link of chart.links.filter((each) => each.from === id)) {
      if (state.get(link.to) === 1) back.add(link)
      else if (!state.get(link.to)) visit(link.to)
    }
    state.set(id, 2)
  }
  ids.forEach((id) => state.get(id) || visit(id))
  const forward = chart.links.filter((link) => !back.has(link) && link.from !== link.to)
  const rank = new Map(ids.map((id) => [id, 0]))
  for (let pass = 0; pass < ids.length; pass++) for (const link of forward) rank.set(link.to, Math.max(/** @type {number} */ (rank.get(link.to)), /** @type {number} */ (rank.get(link.from)) + 1))
  const ranks = /** @type {string[][]} */ ([])
  for (const id of ids) (ranks[/** @type {number} */ (rank.get(id))] ??= []).push(id)
  const place = () => new Map(ranks.flatMap((row) => row.map((id, i) => [id, i])))
  for (let sweep = 0; sweep < 4; sweep++) {
    const at = place()
    const down = sweep % 2 === 0
    for (const row of down ? ranks.slice(1) : ranks.slice(0, -1).reverse()) {
      const weight = (/** @type {string} */ id) => {
        const near = forward.filter((link) => (down ? link.to === id : link.from === id)).map((link) => /** @type {number} */ (at.get(down ? link.from : link.to)))
        return near.length ? near.reduce((a, b) => a + b, 0) / near.length : /** @type {number} */ (at.get(id))
      }
      row.sort((a, b) => weight(a) - weight(b))
      row.forEach((id, i) => at.set(id, i))
    }
  }
  const size = new Map(ids.map((id) => [id, sized(/** @type {Box} */ (chart.boxes.get(id)), measure)]))
  const across = chart.across
  // Along the flow, each rank as deep as its deepest box; across it, boxes side by side.
  const depth = ranks.map((row) => Math.max(...row.map((id) => (across ? size.get(id)?.width : size.get(id)?.height) ?? 0)))
  const breadth = ranks.map((row) => row.reduce((sum, id) => sum + ((across ? size.get(id)?.height : size.get(id)?.width) ?? 0), 0) + (row.length - 1) * (across ? 24 : 36))
  const widest = Math.max(...breadth)
  /** @type {Map<string, { x: number, y: number, width: number, height: number, lines: string[] }>} */
  const where = new Map()
  let along = 0
  ranks.forEach((row, r) => {
    let side = (widest - breadth[r]) / 2
    for (const id of row) {
      const own = /** @type {{ lines: string[], width: number, height: number }} */ (size.get(id))
      const span = across ? own.height : own.width
      const middle = along + depth[r] / 2
      where.set(id, { ...own, x: across ? middle : side + span / 2, y: across ? side + span / 2 : middle })
      side += span + (across ? 24 : 36)
    }
    along += depth[r] + (across ? 72 : 56)
  })
  return { where, back, width: across ? along - 72 : widest, height: across ? widest : along - 56 }
}

/**
 * A mind map's branches either side of its root, each as tall as its leaves, its own in a column per
 * level, the first branches alternating right and left by how much each holds.
 * @param {Mindmap} map @param {(text: string) => number} measure
 */
export function mindLayout(map, measure) {
  /** @type {{ branch: Branch, x: number, y: number, width: number, height: number, lines: string[], tone: number, depth: number, parent: number }[]} */
  const placed = []
  /** @param {Branch} branch @returns {number} */
  const leaves = (branch) => (branch.children.length ? branch.children.reduce((sum, child) => sum + leaves(child), 0) : 1)
  const sides = [/** @type {Branch[]} */ ([]), /** @type {Branch[]} */ ([])]
  const load = [0, 0]
  for (const child of map.root.children) {
    const side = load[0] <= load[1] ? 0 : 1
    sides[side].push(child)
    load[side] += leaves(child)
  }
  const root = sized(map.root, measure)
  placed.push({ branch: map.root, ...root, x: 0, y: 0, tone: -1, depth: 0, parent: -1 })
  const ROW = 34
  sides.forEach((branches, side) => {
    const sign = side === 0 ? 1 : -1
    let top = -(branches.reduce((sum, branch) => sum + leaves(branch), 0) * ROW) / 2
    /** @param {Branch} branch @param {number} depth @param {number} x @param {number} parent @param {number} tone */
    const lay = (branch, depth, x, parent, tone) => {
      const own = sized(branch, measure)
      const span = leaves(branch) * ROW
      const index = placed.push({ branch, ...own, x: x + (sign * own.width) / 2, y: top + span / 2, tone, depth, parent }) - 1
      const start = top
      for (const child of branch.children) lay(child, depth + 1, x + sign * (own.width + 36), index, tone)
      top = start + span
    }
    branches.forEach((branch) => lay(branch, 1, sign * (root.width / 2 + 48), 0, map.root.children.indexOf(branch)))
  })
  const left = Math.min(...placed.map((each) => each.x - each.width / 2))
  const right = Math.max(...placed.map((each) => each.x + each.width / 2))
  const up = Math.min(...placed.map((each) => each.y - each.height / 2))
  const down = Math.max(...placed.map((each) => each.y + each.height / 2))
  for (const each of placed) { each.x -= left; each.y -= up }
  return { placed, width: right - left, height: down - up }
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

const SVG = 'http://www.w3.org/2000/svg'
/** @param {string} name @param {Record<string, string | number>} attributes @param {Node[]} [children] */
function node(name, attributes, children = []) {
  const element = document.createElementNS(SVG, name)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value))
  element.append(...children)
  return element
}

let drawings = 0
/** Lines of words, centred on a point. @param {string[]} lines @param {number} x @param {number} y @param {string} fill @param {string} [weight] */
const label = (lines, x, y, fill, weight = '400') => node('text', { x, y: y - ((lines.length - 1) * LINE) / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill, 'font-weight': weight },
  lines.map((line, i) => node('tspan', { x, dy: i ? LINE : 0 }, [document.createTextNode(line)])))

const AppDiagram = typeof HTMLElement === 'undefined' ? null : class extends HTMLElement {
  static observedAttributes = ['source']
  /** Its drawing, apart from the text a page gives it, which shows nowhere. */
  shown = this.attachShadow({ mode: 'open' })
  /** What was drawn last, so that the same isn't drawn again. */
  drawn = ''
  /** @type {Flowchart | Mindmap | null} what it shows */
  diagram = null
  changed = new MutationObserver(() => this.draw())

  connectedCallback() {
    // A page sets its text; Jean, its source. The room's light or dark draws it again.
    this.changed.observe(this, { childList: true, characterData: true, subtree: true })
    this.changed.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-look', 'class', 'style'] })
    this.draw()
  }

  disconnectedCallback() {
    this.changed.disconnect()
  }

  attributeChangedCallback() {
    if (this.isConnected) this.draw()
  }

  /** The text it draws: Jean's source, or a page's text. */
  get source() {
    return this.getAttribute('source') ?? [...this.childNodes].filter((child) => child.nodeType === 3).map((child) => child.textContent).join('')
  }

  /** A colour of the room, by MCP Apps' name in a page or by Jean's own in an answer. @param {string} name @param {string} own */
  tone(name, own) {
    const style = getComputedStyle(this)
    return style.getPropertyValue(name).trim() || style.getPropertyValue(own).trim() || 'currentColor'
  }

  draw() {
    const source = this.source
    const key = [source, document.documentElement.dataset.theme, document.documentElement.dataset.look].join('\n')
    if (key === this.drawn) return
    this.drawn = key
    const diagram = parse(source)
    // While it is written, a last line not whole yet can't be read: what was drawn stays.
    if (!diagram) return
    this.diagram = diagram
    const font = getComputedStyle(this).fontFamily
    const pen = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'))
    pen.font = `14px ${font}`
    const measure = (/** @type {string} */ text) => pen.measureText(text).width
    const ink = this.tone('--color-text-primary', '--ink')
    const soft = this.tone('--color-text-secondary', '--ink-soft')
    const line = this.tone('--color-border-primary', '--line-strong')
    const ground = this.tone('--color-background-secondary', '--glass')
    const accent = this.tone('--color-ring-primary', '--flame')
    const inverse = this.tone('--color-text-inverse', '--on-flame')
    const tones = { ink, soft, line, ground, accent, inverse }
    const svg = diagram.kind === 'flowchart' ? this.flowchart(diagram, measure, tones) : this.mindmap(diagram, measure, tones)
    svg.setAttribute('font-family', font)
    svg.setAttribute('font-size', '14')
    Object.assign(svg.style, { display: 'block', maxWidth: '100%', height: 'auto', margin: '0 auto' })
    this.shown.replaceChildren(svg)
  }

  /**
   * @param {Flowchart} chart @param {(text: string) => number} measure
   * @param {Record<string, string>} tones
   */
  flowchart(chart, measure, { ink, soft, line, ground, accent }) {
    const { where, width, height } = flowLayout(chart, measure)
    const pad = 12
    const id = `arrow-${++drawings}`
    const arrow = node('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, [node('path', { d: 'M0 0L10 5L0 10z', fill: soft })])
    const svg = node('svg', { viewBox: `${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`, width: width + 2 * pad, height: height + 2 * pad }, [node('defs', {}, [arrow])])
    const across = chart.across
    for (const link of chart.links) {
      const from = where.get(link.from)
      const to = where.get(link.to)
      if (!from || !to) continue
      // From the side facing the flow to the side facing back, curved; one going back, round the side.
      const ahead = across ? to.x > from.x : to.y > from.y
      const [x1, y1] = across ? [from.x + (ahead ? 1 : -1) * from.width / 2, from.y] : [from.x, from.y + (ahead ? 1 : -1) * from.height / 2]
      const [x2, y2] = across ? [to.x - (ahead ? 1 : -1) * to.width / 2, to.y] : [to.x, to.y - (ahead ? 1 : -1) * to.height / 2]
      const bend = Math.max(24, Math.abs(across ? x2 - x1 : y2 - y1) / 2) * (ahead ? 1 : -1)
      const d = across ? `M${x1} ${y1}C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}` : `M${x1} ${y1}C${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`
      svg.append(node('path', { d, fill: 'none', stroke: soft, 'stroke-width': 1.5, ...(link.dashed && { 'stroke-dasharray': '5 4' }), ...(link.arrow && { 'marker-end': `url(#${id})` }) }))
      if (link.label) {
        const words = wrapped(link.label)
        const w = Math.max(...words.map(measure)) + 14
        const h = words.length * LINE + 6
        const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2]
        svg.append(node('rect', { x: mx - w / 2, y: my - h / 2, width: w, height: h, rx: h / 2, fill: ground, stroke: line }), label(words, mx, my, soft))
      }
    }
    for (const [id, box] of where) {
      const { shape } = /** @type {Box} */ (chart.boxes.get(id))
      const { x, y, width: w, height: h } = box
      const lit = shape === 'diamond' || shape === 'circle' || shape === 'pill' || shape === 'round' || shape === 'hexagon'
      const frame = { fill: lit ? `color-mix(in oklch, ${accent} 14%, transparent)` : ground, stroke: lit ? accent : line, 'stroke-width': 1.5 }
      svg.append(shape === 'diamond' ? node('path', { d: `M${x} ${y - h / 2}L${x + w / 2} ${y}L${x} ${y + h / 2}L${x - w / 2} ${y}z`, ...frame, 'stroke-linejoin': 'round' })
        : shape === 'circle' ? node('circle', { cx: x, cy: y, r: w / 2, ...frame })
        : shape === 'hexagon' ? node('path', { d: `M${x - w / 2 + 12} ${y - h / 2}H${x + w / 2 - 12}L${x + w / 2} ${y}L${x + w / 2 - 12} ${y + h / 2}H${x - w / 2 + 12}L${x - w / 2} ${y}z`, ...frame })
        : node('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: shape === 'pill' || shape === 'round' ? h / 2 : 10, ...frame }), label(box.lines, x, y, ink, lit ? '600' : '400'))
    }
    return svg
  }

  /**
   * @param {Mindmap} map @param {(text: string) => number} measure
   * @param {Record<string, string>} tones
   */
  mindmap(map, measure, { ink, accent, inverse }) {
    const { placed, width, height } = mindLayout(map, measure)
    const pad = 12
    const svg = node('svg', { viewBox: `${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`, width: width + 2 * pad, height: height + 2 * pad })
    // Each first branch a hue of its own, as light and as strong as the room's accent.
    const hue = (/** @type {number} */ tone) => `oklch(from ${accent} l max(c, 0.12) calc(h + ${tone * 57}))`
    for (const each of placed.slice(1)) {
      const parent = placed[each.parent]
      const sign = each.x > parent.x ? 1 : -1
      const x1 = parent.x + (sign * parent.width) / 2
      const x2 = each.x - (sign * each.width) / 2
      svg.append(node('path', { d: `M${x1} ${parent.y}C${(x1 + x2) / 2} ${parent.y} ${(x1 + x2) / 2} ${each.y} ${x2} ${each.y}`, fill: 'none', stroke: hue(each.tone), 'stroke-width': Math.max(1.5, 4 - each.depth), 'stroke-linecap': 'round' }))
    }
    for (const each of placed) {
      const { x, y, width: w, height: h, lines, depth } = each
      const tone = depth ? hue(each.tone) : accent
      if (depth < 2) svg.append(node('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: h / 2, fill: depth ? `color-mix(in oklch, ${tone} 16%, transparent)` : tone, stroke: tone, 'stroke-width': 1.5 }))
      else svg.append(node('path', { d: `M${x - w / 2} ${y + h / 2 - 6}H${x + w / 2}`, stroke: tone, 'stroke-width': 1.5, 'stroke-linecap': 'round' }))
      svg.append(label(lines, x, depth < 2 ? y : y - 3, depth ? ink : inverse, depth < 2 ? '600' : '400'))
    }
    return svg
  }

  /** The diagram as a picture to put in a document, a PNG on white, twice as fine. @returns {Promise<Blob>} */
  async picture() {
    const svg = this.shown.querySelector('svg')
    if (!svg) throw new Error('No diagram')
    const copy = /** @type {SVGSVGElement} */ (svg.cloneNode(true))
    copy.setAttribute('xmlns', SVG)
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`
    await image.decode()
    const canvas = Object.assign(document.createElement('canvas'), { width: image.width * 2, height: image.height * 2 })
    const pen = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
    pen.fillStyle = '#fff'
    pen.fillRect(0, 0, canvas.width, canvas.height)
    pen.drawImage(image, 0, 0, canvas.width, canvas.height)
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No picture'))), 'image/png'))
  }
}

if (AppDiagram && !customElements.get('app-diagram')) customElements.define('app-diagram', AppDiagram)
