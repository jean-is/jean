// Charts (D196), the part with no page in it: a ```echarts block read as an ECharts option, kept to
// what draws inside the chart, with its numbers written as the user's language writes them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readOption, localize, titleOf, soFar } from '../app/caps/charts/option.js'

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
  assert.deepEqual(gantt?.tooltip, { renderMode: 'richText' })
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
  assert.deepEqual(option?.tooltip, { trigger: 'axis', renderMode: 'richText' })
  assert.deepEqual(option?.title, [{ text: 'A' }])
  assert.equal(option?.backgroundColor, 'transparent')
  // A chart without a tooltip gets one: hovering shows the values.
  assert.deepEqual(readOption(JSON.stringify(BARS))?.tooltip, { renderMode: 'richText' })
  assert.deepEqual(readOption(JSON.stringify({ ...BARS, tooltip: [{ show: false }, {}] }))?.tooltip, [{ show: false, renderMode: 'richText' }, { renderMode: 'richText' }])
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

test('a chart is named by its title', () => {
  assert.equal(titleOf(BARS), 'Sales')
  assert.equal(titleOf({ title: [{ text: '' }, { text: 'Second' }] }), 'Second')
  assert.equal(titleOf({ series: [] }), '')
})
