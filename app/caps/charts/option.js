// A chart an answer holds (D196): an ECharts option written as JSON in a ```echarts block. It is
// data, never code: read with JSON.parse, then kept to what draws inside the chart. The toolbox
// goes (its data view writes markup), tooltips are drawn on the canvas rather than as markup, a
// title's links go, and the chart takes the room's background. Pure, so Node's tests run it.

/** @typedef {Record<string, any>} Option */

/** @param {unknown} value @returns {any[]} */
const all = (value) => (Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [])

/**
 * The option a block holds, or null while it isn't one: not JSON, or nothing to draw. While the
 * block is still being written (`open`), what is whole of it so far, with the series that say
 * their type. @param {string} source @param {boolean} [open] @returns {Option | null}
 */
export function readOption(source, open = false) {
  let option
  try {
    option = JSON.parse(open ? soFar(source) : source)
  } catch {
    return null
  }
  if (!option || typeof option !== 'object' || Array.isArray(option)) return null
  if (open) option.series = all(option.series).filter((series) => series?.type)
  if (!all(option.series).length) return null
  delete option.toolbox
  option.backgroundColor = 'transparent'
  for (const title of all(option.title)) {
    delete title.link
    delete title.sublink
  }
  const tooltip = (/** @type {Option} */ given) => ({ ...given, renderMode: 'richText' })
  option.tooltip = Array.isArray(option.tooltip) ? option.tooltip.map(tooltip) : tooltip(option.tooltip)
  return option
}

/**
 * What is written so far of a JSON value, as JSON: cut after its last whole value, so a number or
 * a string still being written is left out, and the arrays and objects still open closed. What
 * follows the value, such as the start of the block's closing fence, is left out too. "" when
 * nothing is whole yet. @param {string} source
 */
export function soFar(source) {
  /** @type {string[]} what closes each array and object open, the innermost last */
  const open = []
  let end = 0
  let closing = ''
  // In an object, the next string names a member, whose value comes after it.
  let name = false
  const whole = (/** @type {number} */ at) => {
    end = at
    closing = open.toReversed().join('')
    return !open.length
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '"') {
      let j = i + 1
      while (j < source.length && source[j] !== '"') j += source[j] === '\\' ? 2 : 1
      if (j >= source.length) break
      i = j
      if (name) name = false
      else if (whole(i + 1)) break
    } else if (c === '{' || c === '[') {
      open.push(c === '{' ? '}' : ']')
      name = c === '{'
      whole(i + 1)
    } else if (c === '}' || c === ']') {
      open.pop()
      if (whole(i + 1)) break
    } else if (c === ',') name = open.at(-1) === '}'
    else if (/[\w.+-]/.test(c)) {
      // A number, true, false or null, whole once something follows it.
      let j = i + 1
      while (j < source.length && /[\w.+-]/.test(source[j])) j++
      if (j >= source.length) break
      i = j - 1
      if (whole(j)) break
    }
  }
  return end ? source.slice(0, end) + closing : ''
}

/**
 * Numbers as the user's language writes them, on value axes and in tooltips, unless the chart
 * gives its own formatter. A y axis is a value axis, and an x axis a category one, unless they say.
 * @param {Option} option @param {(value: number) => string} format @returns {Option}
 */
export function localize(option, format) {
  const number = (/** @type {unknown} */ value) => (typeof value === 'number' ? format(value) : value)
  for (const [key, kind] of [['xAxis', 'category'], ['yAxis', 'value']]) {
    for (const axis of all(option[key])) {
      if (['value', 'log'].includes(axis.type ?? kind) && !axis.axisLabel?.formatter) axis.axisLabel = { ...axis.axisLabel, formatter: number }
    }
  }
  for (const tooltip of all(option.tooltip)) tooltip.valueFormatter ??= number
  return option
}

/** What a chart is called: its first title. @param {Option} option */
export const titleOf = (option) => String(all(option.title).find((title) => title.text)?.text ?? '')
