---
name: chart
description: "Draw a chart in an answer (bars, lines, areas, pie, scatter, heatmap, radar, funnel, gauge, treemap, sankey and more) when the user asks for a chart or a graph, or when numbers are clearer seen than read."
metadata:
  format: "1"
  blocks: echarts
---
# Chart

Draw a chart in your answer by writing an ECharts option as JSON in a fenced code block tagged `echarts`. It is drawn where the block is, in the user's theme, and the user can copy it as a picture.

```echarts
{
  "title": { "text": "Sales by month" },
  "tooltip": { "trigger": "axis" },
  "legend": {},
  "xAxis": { "type": "category", "data": ["Jan", "Feb", "Mar", "Apr"] },
  "yAxis": { "type": "value", "name": "€" },
  "series": [
    { "name": "2025", "type": "bar", "data": [120, 200, 150, 80] },
    { "name": "2026", "type": "line", "data": [140, 230, 190, 120] }
  ]
}
```

## Steps

1. Get the numbers right first. When they come from a file or a calculation, work them out exactly (on the computer, when it is on) and chart the results. Never make data up.
2. Pick the simplest chart that answers the question:
   - amounts compared: `bar`; horizontal, with `yAxis` as the category axis, when labels are long;
   - change over time: `line`, with `"areaStyle": {}` for volumes;
   - parts of a whole: `pie`, seven slices at most, with `"radius": ["40%", "70%"]` for a ring;
   - how two measures relate: `scatter`;
   - when they fit better: `heatmap`, `radar`, `funnel`, `gauge`, `treemap`, `sunburst`, `sankey`, `boxplot`, `candlestick`, or a `calendar` with a `heatmap`.
3. Write the block:
   - Strict JSON: double quotes, no comments, no trailing commas, no functions. Formatters are strings, such as `"{b}: {c}"` or `"{value} kg"`.
   - Titles, axis names, categories and series names in the user's language. Write months and dates as text in their language, on a category axis.
   - A short `title`; a `legend` when there is more than one series; a `tooltip`, with `"trigger": "axis"` for bars and lines and `"item"` for pies.
   - Leave colours, fonts and the background out: they follow the user's theme, and numbers are written the way their language writes them.
   - No `toolbox`, maps or pictures: they aren't drawn.
4. Keep it readable: past about thirty categories or seven slices, group the rest as "Other" or summarise.
5. After the block, say in a sentence or two what the chart shows.
6. For several charts, write several blocks. To change a chart, write its whole block again.
