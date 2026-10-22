---
name: chart
description: "Draw a chart in an answer (bars, lines, areas, pie, scatter, heatmap, radar, funnel, gauge, treemap, sankey and more) when the user asks for a chart or a graph, or when numbers are clearer seen than read."
metadata:
  format: "1"
  blocks: echarts
  title-en: "Chart"
  text-en: "Bars, lines, pies and more, drawn in answers"
  title-am: "ገበታ"
  text-am: "አምዶች፣ መስመሮች፣ ክብ ገበታዎች እና ሌሎችም፣ በመልሶች ውስጥ የሚሳሉ"
  title-ar: "رسم بياني"
  text-ar: "أعمدة وخطوط ودوائر وغيرها، تُرسم داخل الإجابات"
  title-bn: "চার্ট"
  text-bn: "বার, লাইন, পাই চার্ট আর আরও অনেক কিছু, উত্তরের মধ্যেই আঁকা"
  title-br: "Grafik"
  text-br: "Barrennoù, linennoù, kelc’hioù ha muioc’h, treset er respontoù"
  title-co: "Graficu"
  text-co: "Barre, linee, torte è altru, disegnati in e risposte"
  title-de: "Diagramm"
  text-de: "Balken, Linien, Torten und mehr, direkt in den Antworten gezeichnet"
  title-es: "Gráfico"
  text-es: "Barras, líneas, sectores y más, dibujados en las respuestas"
  title-fa: "نمودار"
  text-fa: "ستونی، خطی، دایره‌ای و بیشتر، درون پاسخ‌ها کشیده می‌شوند"
  title-fr: "Graphique"
  text-fr: "Barres, courbes, camemberts et plus, dessinés dans les réponses"
  title-fr-CA: "Graphique"
  text-fr-CA: "Barres, courbes, secteurs et plus, dessinés dans les réponses"
  title-ha: "Jadawali"
  text-ha: "Sanduna, layuka, da'irori da ƙari, ana zana su a cikin amsoshi"
  title-he: "תרשים"
  text-he: "עמודות, קווים, עוגות ועוד, מצוירים בתוך התשובות"
  title-hi: "चार्ट"
  text-hi: "बार, लाइन, पाई और भी बहुत कुछ, जवाबों में ही बने हुए"
  title-id: "Grafik"
  text-id: "Batang, garis, pai, dan lainnya, digambar langsung di jawaban"
  title-it: "Grafico"
  text-it: "Barre, linee, torte e altro, disegnati nelle risposte"
  title-ja: "グラフ"
  text-ja: "棒・折れ線・円グラフなどを回答の中に描きます"
  title-ko: "차트"
  text-ko: "막대, 선, 원형 차트 등을 답변 안에 그립니다"
  title-mr: "तक्ता"
  text-mr: "स्तंभ, रेषा, वर्तुळ आलेख आणि बरेच काही, उत्तरांमध्येच काढलेले"
  title-ms: "Carta"
  text-ms: "Bar, garisan, pai dan banyak lagi, dilukis dalam jawapan"
  title-nl: "Grafiek"
  text-nl: "Staven, lijnen, taarten en meer, getekend in de antwoorden"
  title-pl: "Wykres"
  text-pl: "Słupki, linie, koła i nie tylko, rysowane w odpowiedziach"
  title-pt: "Gráfico"
  text-pt: "Barras, linhas, circulares e mais, desenhados nas respostas"
  title-ru: "Диаграмма"
  text-ru: "Столбцы, линии, круговые диаграммы и не только — прямо в ответах"
  title-sw: "Chati"
  text-sw: "Pau, mistari, duara na zaidi, huchorwa ndani ya majibu"
  title-ta: "விளக்கப்படம்"
  text-ta: "பட்டை, கோடு, வட்ட விளக்கப்படங்கள் மற்றும் பல, பதில்களுக்குள்ளேயே வரையப்படும்"
  title-te: "చార్ట్"
  text-te: "బార్‌లు, గీతలు, పై చార్ట్‌లు ఇంకా మరెన్నో, సమాధానాల్లోనే గీసినవి"
  title-th: "แผนภูมิ"
  text-th: "แท่ง เส้น วงกลม และอื่น ๆ วาดไว้ในคำตอบ"
  title-tl: "Tsart"
  text-tl: "Mga bar, linya, pie at iba pa, iginuguhit sa mga sagot"
  title-tr: "Grafik"
  text-tr: "Sütun, çizgi, pasta ve daha fazlası, yanıtların içinde çizilir"
  title-uk: "Діаграма"
  text-uk: "Стовпці, лінії, кругові діаграми та інше — просто у відповідях"
  title-ur: "چارٹ"
  text-ur: "بار، لائن، پائی اور بہت کچھ، جوابوں میں ہی بنے ہوئے"
  title-vi: "Biểu đồ"
  text-vi: "Cột, đường, tròn và hơn thế nữa, vẽ ngay trong câu trả lời"
  title-yo: "Àwòrán ìṣirò"
  text-yo: "Ọ̀pá, ìlà, àwòrán ròbótó àti bẹ́ẹ̀ bẹ́ẹ̀ lọ, tí a yà sínú àwọn ìdáhùn"
  title-zh-Hans: "图表"
  text-zh-Hans: "柱状图、折线图、饼图等，直接画在回答里"
  title-zh-Hant: "圖表"
  text-zh-Hant: "長條圖、折線圖、圓餅圖等，直接畫在回答裡"
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
   - when they fit better: `heatmap`, `radar`, `funnel`, `gauge`, `treemap`, `sunburst`, `sankey`, `graph` (who or what is linked to what), `boxplot`, `candlestick`, or a `calendar` with a `heatmap`.
3. Write the block:
   - Strict JSON: double quotes, no comments, no trailing commas, no functions. Formatters are strings, such as `"{b}: {c}"` or `"{value} kg"`.
   - Titles, axis names, categories and series names in the user's language. Write months and dates as text in their language, on a category axis.
   - A short `title`; a `legend` when there is more than one series; a `tooltip`, with `"trigger": "axis"` for bars and lines and `"item"` for pies.
   - Leave colours, fonts and the background out: they follow the user's theme, and numbers are written the way their language writes them.
   - No `toolbox`, maps or pictures: they aren't drawn.
4. Keep it readable: past about thirty categories or seven slices, group the rest as "Other" or summarise.
5. After the block, say in a sentence or two what the chart shows.
6. For several charts, write several blocks. To change a chart, write its whole block again.
