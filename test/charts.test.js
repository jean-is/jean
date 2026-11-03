// Charts (D196), the part with no page in it: a ```echarts block read as an ECharts option, kept to
// what draws inside the chart, with its numbers written as the user's language writes them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readOption, localize, titleOf, soFar, paperTheme, paperLabels, sideOf, namesIn } from '../app/caps/charts/option.js'

const BARS = { title: { text: 'Sales' }, xAxis: { type: 'category', data: ['Jan', 'Feb'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [1200, 3400.5] }] }

test('an option is JSON with series; anything else, or a block still being written, is none', () => {
  assert.deepEqual(readOption(JSON.stringify(BARS))?.series, BARS.series)
  assert.equal(readOption(JSON.stringify(BARS).slice(0, -12)), null, 'cut short while it streams')
  assert.equal(readOption('{ xAxis: {}, series: [] }'), null, 'nothing to draw, in JavaScript too')
  assert.equal(readOption('[{"type":"bar"}]'), null)
  assert.equal(readOption('{"title":{"text":"Nothing to draw"}}'), null)
  assert.equal(readOption('null'), null)
  assert.ok(readOption('{"series":{"type":"pie","data":[{"name":"A","value":1}]}}'), 'one series, not in a list')
})

test('an option written as JavaScript, as ECharts’ examples are, is read as its data, its code left out', () => {
  const script = String.raw`option = {
    // Sales, by month
    title: { text: 'Ventes d\'avril', subtext: 'en "k€"' },
    xAxis: { type: 'category', data: ['Jan', 'Feb',], },
    yAxis: { type: 'value', axisLabel: { formatter: (value) => value + ' k€', rotate: 30 } },
    /* one series */
    series: [{ type: 'bar', data: [1200, .5, -3e2], itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#fff' }]) } }],
  };`
  const option = readOption(script)
  assert.deepEqual(option?.title, { text: 'Ventes d\'avril', subtext: 'en "k€"' })
  assert.deepEqual(option?.xAxis, { type: 'category', data: ['Jan', 'Feb'] })
  assert.deepEqual(option?.yAxis, { type: 'value', axisLabel: { rotate: 30 } }, 'a function goes, with its member')
  assert.deepEqual(option?.series, [{ type: 'bar', data: [1200, 0.5, -300], itemStyle: {} }])
  // A Gantt chart a brain wrote, whose formatters work out dates.
  const gantt = readOption(`{
    tooltip: { formatter: function(p){ return p.data ? p.data.t : ""; } },
    xAxis: { type: "value", axisLabel: { formatter: function(v){ var c=new Date(2026,2,2); while(v-->0){ if(c.getDay()===5) { c.setDate(c.getDate()+3) } else c.setDate(c.getDate()+1) } return c.getDate()+"/"+(c.getMonth()+1); } }, name: "jours" },
    yAxis: { type: "category", inverse: true, data: ["Plan d'implantation", "★ Jour J"] },
    series: [{ type: "bar", stack: "g", itemStyle: { opacity: 0 }, data: [0, 3] }, { type: "bar", stack: "g", data: [{ value: 3, t: "2-4 mars" }, 1] }]
  }`)
  assert.deepEqual(gantt?.tooltip, { renderMode: 'richText', triggerOn: 'click' })
  assert.deepEqual(gantt?.xAxis, { type: 'value', axisLabel: {}, name: 'jours' })
  assert.deepEqual(gantt?.series[1].data, [{ value: 3, t: '2-4 mars' }, 1])
  // Each value alone in a list, as this one wrote the days before each task: in bars and lines, the value.
  const listed = readOption('{"series":[{"type":"bar","data":[[7],{"value":[2],"name":"A"},[1,2]]},{"type":"radar","data":[{"value":[5]}]}]}')
  assert.deepEqual(listed?.series[0].data, [7, { value: 2, name: 'A' }, [1, 2]])
  assert.deepEqual(listed?.series[1].data, [{ value: [5] }], 'a radar’s values are a list whatever their number')
  assert.equal(readOption(`{ series: [{ type: 'bar', data: [7, 9].map(function (o) { return [o] }) }] }`), null, 'data worked out by code')
  assert.deepEqual(readOption(`{ series: [{ type: 'bar', data: [1200, 34`, true)?.series, [{ type: 'bar', data: [1200] }], 'while it is written')
})

test('what is written so far is whole values only, closed: never half a number, a name or a word', () => {
  assert.equal(soFar('{"title":{"text":"Sales"},"series":[{"type":"bar","data":[1200,34'), '{"title":{"text":"Sales"},"series":[{"type":"bar","data":[1200]}]}')
  assert.equal(soFar('{"series":[{"type":"bar","data":[1200,'), '{"series":[{"type":"bar","data":[1200]}]}')
  assert.equal(soFar('{"series":[{"type":"bar","data":[1200]'), '{"series":[{"type":"bar","data":[1200]}]}')
  assert.equal(soFar('{"series":[{"type":"bar","na'), '{"series":[{"type":"bar"}]}', 'a name half-written')
  assert.equal(soFar('{"series":[{"type":"bar","name":'), '{"series":[{"type":"bar"}]}', 'a name without its value')
  assert.equal(soFar('{"series":[{"type":"bar","name":"Ventes de jan'), '{"series":[{"type":"bar"}]}', 'a string half-written')
  assert.equal(soFar('{"title":{"text":"A \\"quoted\\" one, {in braces}"},"x":tr'), '{"title":{"text":"A \\"quoted\\" one, {in braces}"}}')
  assert.equal(soFar('{"a":[[1,2],[3'), '{"a":[[1,2],[]]}')
  assert.equal(soFar('{"a":true,"b":null}\n``'), '{"a":true,"b":null}', 'the closing fence being written')
  assert.equal(soFar('{"a":1}'), '{"a":1}')
  assert.equal(soFar('{'), '{}')
  assert.equal(soFar(''), '')
  assert.equal(soFar('  "'), '')
  for (const source of [JSON.stringify(BARS), JSON.stringify({ ...BARS, title: { text: 'Ça, "là" : [1]' } })]) {
    for (let i = 0; i <= source.length; i++) {
      const written = soFar(source.slice(0, i))
      if (written) assert.doesNotThrow(() => JSON.parse(written), written)
    }
  }
})

test('while its block is written, a chart is what is whole of it, once a series says its type', () => {
  const source = JSON.stringify(BARS)
  assert.equal(readOption(source.slice(0, source.indexOf('"series"')), true), null, 'no series yet')
  assert.equal(readOption(`${source.slice(0, source.indexOf('"type":"bar"'))}`, true), null, 'a series without its type')
  assert.deepEqual(readOption(source.slice(0, source.indexOf('1200') + 5), true)?.series, [{ type: 'bar', data: [1200] }])
  assert.deepEqual(readOption(source, true)?.series, BARS.series)
  assert.deepEqual(readOption(`${source}\n\``, true)?.series, BARS.series, 'its closing fence being written')
  assert.equal(readOption(`${source}\n\``), null, 'which, once the block is written, is a mistake')
})

test('what draws outside the chart goes: no toolbox, tooltips on the canvas, no links, no background of its own', () => {
  const option = readOption(JSON.stringify({ ...BARS, title: [{ text: 'A', link: 'javascript:alert(1)', sublink: 'https://example.com' }],
    toolbox: { feature: { dataView: {} } }, tooltip: { trigger: 'axis', renderMode: 'html' }, backgroundColor: '#fff' }))
  assert.equal(option?.toolbox, undefined)
  assert.deepEqual(option?.tooltip, { trigger: 'axis', renderMode: 'richText', triggerOn: 'click' })
  assert.deepEqual(option?.title, [{ text: 'A' }])
  assert.equal(option?.backgroundColor, 'transparent')
  // A chart without a tooltip gets one: a click shows the values, and they stay for as long as they are read.
  assert.deepEqual(readOption(JSON.stringify(BARS))?.tooltip, { renderMode: 'richText', triggerOn: 'click' })
  assert.deepEqual(readOption(JSON.stringify({ ...BARS, tooltip: [{ show: false }, {}] }))?.tooltip, [{ show: false, renderMode: 'richText', triggerOn: 'click' }, { renderMode: 'richText', triggerOn: 'click' }])
})

test('numbers on value axes and in tooltips are written in the user’s language, unless the chart says how', () => {
  const format = (/** @type {unknown} */ value) => `«${value}»`
  const option = localize(/** @type {any} */ (readOption(JSON.stringify({ ...BARS, xAxis: [{ type: 'category' }, { type: 'value' }], yAxis: [{}, { type: 'log', axisLabel: { formatter: '{value} kg' } }] }))), format)
  assert.equal(option.xAxis[0].axisLabel, undefined, 'categories stay as written')
  assert.equal(option.xAxis[1].axisLabel.formatter(1200), '«1200»')
  assert.equal(option.yAxis[0].axisLabel.formatter(3), '«3»', 'a y axis is a value axis unless it says otherwise')
  assert.equal(option.yAxis[1].axisLabel.formatter, '{value} kg')
  assert.equal(option.tooltip.valueFormatter(3400.5), '«3400.5»')
  assert.equal(option.tooltip.valueFormatter('n/a'), 'n/a', 'only numbers')
  const own = localize(/** @type {any} */ (readOption(JSON.stringify({ ...BARS, tooltip: { valueFormatter: 'kept' } }))), format)
  assert.equal(own.tooltip.valueFormatter, 'kept')
})

test('on a slide, a chart\'s words are the slide\'s where they read on the paper under it at AA, else black or white', () => {
  const ink = 'rgb(24, 23, 27)', white = 'rgb(255, 255, 255)', black = 'rgb(0, 0, 0)'
  for (const theme of [paperTheme(white, ink), paperTheme(ink, white), paperTheme(white, 'rgb(244, 243, 241)'), paperTheme('rgb(255, 248, 243)', 'rgb(217, 72, 15)')]) {
    const color = theme.textStyle.color
    for (const words of [theme.title.textStyle, theme.title.subtextStyle, theme.legend.textStyle, theme.categoryAxis.axisLabel, theme.valueAxis.axisLabel, theme.radar.axisName, theme.gauge.detail]) assert.equal(words.color, color)
  }
  assert.equal(paperTheme(white, ink).textStyle.color, white)
  assert.equal(paperTheme(white, ink).darkMode, true)
  assert.equal(paperTheme(ink, white).textStyle.color, ink)
  assert.equal(paperTheme(ink, white).darkMode, false)
  assert.equal(paperTheme(white, 'rgb(244, 243, 241)').textStyle.color, black, 'inverted, over a pale tile')
  assert.equal(paperTheme(ink, 'rgb(34, 33, 37)').textStyle.color, white, 'over a dark one')
  assert.equal(paperTheme('rgb(255, 248, 243)', 'rgb(217, 72, 15)').textStyle.color, black, 'a fill where neither its ink nor its paper reads')
  assert.equal(paperTheme(white, ink).categoryAxis.splitLine.lineStyle.color, 'rgba(255, 255, 255, 0.2)')
})

test('on a slide, a label takes the words\' colour where it stands on the paper, not on its mark, unless it names its own', () => {
  const labels = paperLabels([{ type: 'bar' }, { type: 'bar', label: { position: 'top' } }, { type: 'bar', label: { position: 'insideTop' } }, { type: 'pie', label: { show: false } }, { type: 'pie', label: { position: 'inside' } }, { type: 'pie', label: { position: 'center' } }, { type: 'line' }, { type: 'scatter', label: { color: '#f00' } }, { type: 'treemap' }], 'red')
  assert.deepEqual(labels.map((one) => one.label?.color), [undefined, 'red', undefined, 'red', undefined, undefined, 'red', '#f00', undefined])
  assert.deepEqual(paperLabels({ type: 'line' }, 'red'), [{ type: 'line', label: { color: 'red' } }], 'one series, not in a list')
})

test('a word on a canvas takes its direction from its first letter', () => {
  for (const word of ['الفرن', '30 يومًا', 'الثالث Q3', 'خبز 40٪', 'فرن (2)', '(٣) فرن', 'אפייה 3']) assert.equal(sideOf(word), 'rtl', word)
  for (const word of ['Oven', 'Q3 الثالث', '30日の売上', '40', '٣٠٪', '']) assert.equal(sideOf(word), 'ltr', word)
})

test('a chart is named by its title', () => {
  assert.equal(titleOf(BARS), 'Sales')
  assert.equal(titleOf({ title: [{ text: '' }, { text: 'Second' }] }), 'Second')
  assert.equal(titleOf({ series: [] }), '')
})

test('a chart with no title is named by its series, else what its data lists, and nothing on it hides a series', () => {
  const lines = readOption(JSON.stringify({ legend: {}, xAxis: { data: ['Jan', 'Feb'] }, series: [{ name: 'North', type: 'line', data: [1, 2] }, { name: 'South', type: 'line', data: [3, 4] }] }))
  assert.deepEqual(namesIn(lines), ['North', 'South'])
  assert.equal(lines.legend.selectedMode, false)
  assert.deepEqual(namesIn(readOption(JSON.stringify({ series: [{ type: 'pie', data: [{ name: 'Rent', value: 1 }, { name: 'Food', value: 2 }] }] }))), ['Rent', 'Food'])
  assert.deepEqual(namesIn(readOption(JSON.stringify({ xAxis: { data: ['Jan', 'Feb'] }, series: [{ type: 'bar', data: [1, 2] }] }))), ['Jan', 'Feb'])
})
