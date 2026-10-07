// A chart an answer holds (D196): an ECharts option written as JSON in a ```echarts block. It is
// data, never code: read with JSON.parse, then kept to what draws inside the chart. The toolbox
// goes (its data view writes markup), tooltips are drawn on the canvas rather than as markup, a
// title's links go, and the chart takes the room's background. Pure, so Node's tests run it.

/** @typedef {Record<string, any>} Option */

/** @param {unknown} value @returns {any[]} */
const all = (value) => (Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [])

/**
 * The option a block holds, or null while it isn't one: not JSON (yet, as it streams), or nothing to draw.
 * @param {string} source @returns {Option | null}
 */
export function readOption(source) {
  let option
  try {
    option = JSON.parse(source)
  } catch {
    return null
  }
  if (!option || typeof option !== 'object' || Array.isArray(option) || !all(option.series).length) return null
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
