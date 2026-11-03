// A chart an answer holds (D196): an ECharts option written as JSON in a ```echarts block. It is
// data, never code: read with JSON.parse, or as the JavaScript ECharts' own examples are written in,
// its functions left out (D418), then kept to what draws inside the chart. The toolbox goes (its
// data view writes markup), tooltips are drawn on the canvas rather than as markup, a title's links
// go, and the chart takes the room's background. Pure, so Node's tests run it.

/** @typedef {Record<string, any>} Option */

/** @param {unknown} value @returns {any[]} */
const all = (value) => (Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [])

/**
 * The option a block holds, or null while it isn't one: not JSON, or nothing to draw. While the
 * block is still being written (`open`), what is whole of it so far, with the series that say
 * their type. @param {string} source @param {boolean} [open] @returns {Option | null}
 */
export function readOption(source, open = false) {
  const read = (/** @type {string} */ json) => {
    try {
      return JSON.parse(open ? soFar(json) : json)
    } catch {
      return null
    }
  }
  const option = read(source) ?? read(fromScript(source))
  if (!option || typeof option !== 'object' || Array.isArray(option)) return null
  if (open) option.series = all(option.series).filter((series) => series?.type)
  if (!all(option.series).length) return null
  // A value alone in a list, [7] or { "value": [7] }, is that value in bars and lines, where
  // ECharts would read a point with no category and draw nothing there.
  const one = (/** @type {any} */ item) => (Array.isArray(item) && item.length === 1 ? item[0] : Array.isArray(item?.value) && item.value.length === 1 ? { ...item, value: item.value[0] } : item)
  for (const series of all(option.series)) if (/^(bar|line)$/.test(series?.type) && Array.isArray(series.data)) series.data = series.data.map(one)
  delete option.toolbox
  for (const legend of all(option.legend)) legend.selectedMode = false
  option.backgroundColor = 'transparent'
  for (const title of all(option.title)) {
    delete title.link
    delete title.sublink
  }
  const tooltip = (/** @type {Option} */ given) => ({ ...given, renderMode: 'richText', triggerOn: 'click' })
  option.tooltip = Array.isArray(option.tooltip) ? option.tooltip.map(tooltip) : tooltip(option.tooltip)
  return option
}

/**
 * An option written as JavaScript, as JSON: names unquoted, strings in single quotes, comments,
 * a comma before a closing bracket, `option =` before it. What is code, such as a function, goes
 * with the member that holds it, and ECharts does as it does without it. @param {string} source
 */
export function fromScript(source) {
  const tokens = source.replace(/^\s*(?:(?:var|let|const)\s+)?option\s*=|;\s*$/g, '').match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*|\/\*[\s\S]*?\*\/|=>|[\w$.+-]+|\S/g) ?? []
  /** @type {string[]} */
  const out = []
  const put = (/** @type {string} */ token) => {
    if (token === ',' && /^[[{,]?$/.test(out.at(-1) ?? '')) return
    if (/^[\]}]$/.test(token) && out.at(-1) === ',') out.pop()
    out.push(token)
  }
  const text = (/** @type {string} */ token) => (token[0] === "'" ? `"${token.slice(1, -1).replace(/\\(.)|"/g, (all, c) => (c === "'" ? c : c ? all : '\\"'))}"` : token[0] === '"' ? token : JSON.stringify(token))
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (/^\/[/*]/.test(token)) continue
    if (tokens[i + 1] === ':' || /^(["']).*\1$/s.test(token)) put(text(token))
    else if (/^[-+.\d]/.test(token) && Number.isFinite(Number(token))) put(String(Number(token)))
    else if (/^[\w$(]/.test(token) && !/^(true|false|null)$/.test(token)) {
      // Code, to the comma or the bracket that ends it.
      for (let depth = 0; i < tokens.length; i++) {
        if (/^[([{]$/.test(tokens[i])) depth++
        else if (/^[)\]}]$/.test(tokens[i]) ? --depth < 0 : tokens[i] === ',' && !depth) break
      }
      i--
      if (out.at(-1) === ':') out.splice(-2)
    } else put(token)
  }
  return out.join('')
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

/** A word's direction by its first letter, in the scripts written right to left (Hebrew, Arabic, Syriac, Thaana, N'Ko, their forms), as `unicode-bidi: plaintext` finds it; left to right without one. @param {string} word @returns {'rtl' | 'ltr'} */
export const sideOf = (word) => (/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(/\p{L}/u.exec(word)?.[0] ?? '') ? 'rtl' : 'ltr')

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

/**
 * ECharts' theme on a slide, whose paper isn't the room's: every word in the slide's colour where that reads on the paper under
 * the chart at AA, else in black or white, whichever does. A theme, so that what the chart names itself stays. Colours as CSS
 * computes them, `rgb(…)`. @param {string} words @param {string} paper
 */
export function paperTheme(words, paper) {
  const luminance = (/** @type {string} */ colour) => (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map((c) => Number(c) / 255).map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)).reduce((sum, s, i) => sum + s * [0.2126, 0.7152, 0.0722][i], 0)
  const under = luminance(paper), over = luminance(words), dark = under < 0.179
  const color = (Math.max(under, over) + 0.05) / (Math.min(under, over) + 0.05) >= 4.5 ? words : dark ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)'
  const axis = { axisLine: { lineStyle: { color } }, axisLabel: { color }, splitLine: { lineStyle: { color: color.replace('rgb(', 'rgba(').replace(')', ', 0.2)') } } }
  return { darkMode: dark, textStyle: { color }, title: { textStyle: { color }, subtextStyle: { color } }, legend: { textStyle: { color }, pageTextStyle: { color } }, visualMap: { textStyle: { color } }, dataZoom: { textStyle: { color } }, timeline: { label: { color } },
    calendar: { dayLabel: { color }, monthLabel: { color }, yearLabel: { color } }, matrix: { x: { label: { color } }, y: { label: { color } } }, gauge: { title: { color }, axisLabel: { color }, detail: { color } }, radar: { ...axis, axisName: { color } }, categoryAxis: axis, valueAxis: axis, timeAxis: axis, logAxis: axis }
}

/** The series with their labels in `color` where they stand on the paper, not on their marks, as a bar's do unless it says. @param {unknown} series @param {string} color */
export const paperLabels = (series, color) => all(series).map((one) => (/in|center/.test(one.label?.position ?? (/^(bar|pictorialBar|heatmap|treemap|sunburst|graph|map)$/.test(one.type) ? 'in' : '')) ? one : { ...one, label: { color, ...one.label } }))

/** What a chart is called: its first title. @param {Option} option */
export const titleOf = (option) => String(all(option.title).find((title) => title.text)?.text ?? '')

/** What a chart with no title shows, to name it by: its series, else what its series or axes list. @param {Option} option @returns {string[]} */
export function namesIn(option) {
  const series = all(option.series), named = series.map((one) => one?.name).filter(Boolean), listed = [...series.flatMap((one) => (Array.isArray(one?.data) ? one.data.map((/** @type {any} */ item) => item?.name) : [])), ...[option.xAxis, option.yAxis].flat().flatMap((axis) => axis?.data ?? [])]
  return [...new Set((named.length ? named : listed).filter((name) => name && typeof name === 'string'))].slice(0, 5)
}
