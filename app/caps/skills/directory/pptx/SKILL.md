---
name: pptx
description: "Make a slide deck as a PowerPoint file (.pptx) to download, send, present and change in PowerPoint, Keynote or Google Slides: a presentation, a pitch, a lesson or a report, when the user asks for a PowerPoint, a .pptx or slides as a file."
metadata:
  format: "1"
  title-en: "PowerPoint"
  text-en: "Presentations made as PowerPoint files, ready to present and change"
  title-am: "PowerPoint"
  text-am: "የPowerPoint ፋይሎች ሆነው የተሠሩ አቀራረቦች፣ ለማቅረብና ለመለወጥ ዝግጁ"
  title-ar: "PowerPoint"
  text-ar: "عروض تقديمية في ملفات PowerPoint، جاهزة للعرض والتعديل"
  title-bn: "PowerPoint"
  text-bn: "PowerPoint ফাইলে তৈরি প্রেজেন্টেশন, দেখানো আর বদলানোর জন্য তৈরি"
  title-br: "PowerPoint"
  text-br: "Kinnigadennoù graet e restroù PowerPoint, prest da ginnig ha da gemmañ"
  title-co: "PowerPoint"
  text-co: "Presentazioni fatte in schedarii PowerPoint, pronte à prisentà è à cambià"
  title-de: "PowerPoint"
  text-de: "Präsentationen als PowerPoint-Dateien, bereit zum Vorführen und Ändern"
  title-es: "PowerPoint"
  text-es: "Presentaciones en archivos de PowerPoint, listas para exponer y cambiar"
  title-fa: "PowerPoint"
  text-fa: "ارائه‌هایی در قالب فایل PowerPoint، آماده برای نمایش و ویرایش"
  title-fr: "PowerPoint"
  text-fr: "Des présentations en fichiers PowerPoint, prêtes à projeter et à modifier"
  title-fr-CA: "PowerPoint"
  text-fr-CA: "Des présentations en fichiers PowerPoint, prêtes à projeter et à modifier"
  title-ha: "PowerPoint"
  text-ha: "Gabatarwa a cikin fayilolin PowerPoint, a shirye don nunawa da gyarawa"
  title-he: "PowerPoint"
  text-he: "מצגות בקובצי PowerPoint, מוכנות להצגה ולשינוי"
  title-hi: "PowerPoint"
  text-hi: "PowerPoint फ़ाइलों में बनी प्रस्तुतियाँ, दिखाने और बदलने के लिए तैयार"
  title-id: "PowerPoint"
  text-id: "Presentasi dalam file PowerPoint, siap ditampilkan dan diubah"
  title-it: "PowerPoint"
  text-it: "Presentazioni in file PowerPoint, pronte da proiettare e modificare"
  title-ja: "PowerPoint"
  text-ja: "PowerPoint のプレゼン資料を作り、そのまま発表や編集ができます"
  title-ko: "PowerPoint"
  text-ko: "PowerPoint 프레젠테이션 파일을 만들어 바로 발표하고 고칠 수 있습니다"
  title-mr: "PowerPoint"
  text-mr: "PowerPoint फायलींमध्ये बनवलेली सादरीकरणे, दाखवण्यासाठी आणि बदलण्यासाठी तयार"
  title-ms: "PowerPoint"
  text-ms: "Pembentangan dalam fail PowerPoint, sedia untuk dibentangkan dan diubah"
  title-nl: "PowerPoint"
  text-nl: "Presentaties als PowerPoint-bestanden, klaar om te presenteren en aan te passen"
  title-pl: "PowerPoint"
  text-pl: "Prezentacje w plikach PowerPoint, gotowe do pokazania i zmiany"
  title-pt: "PowerPoint"
  text-pt: "Apresentações em ficheiros PowerPoint, prontas a apresentar e a alterar"
  title-ru: "PowerPoint"
  text-ru: "Презентации в файлах PowerPoint — готовые к показу и правке"
  title-sw: "PowerPoint"
  text-sw: "Mawasilisho katika faili za PowerPoint, tayari kuonyeshwa na kubadilishwa"
  title-ta: "PowerPoint"
  text-ta: "PowerPoint கோப்புகளாக உருவாக்கப்பட்ட விளக்கக்காட்சிகள், காட்டவும் மாற்றவும் தயார்"
  title-te: "PowerPoint"
  text-te: "PowerPoint ఫైళ్లుగా తయారైన ప్రెజెంటేషన్‌లు, చూపించడానికి, మార్చడానికి సిద్ధంగా"
  title-th: "PowerPoint"
  text-th: "งานนำเสนอเป็นไฟล์ PowerPoint พร้อมนำเสนอและแก้ไข"
  title-tl: "PowerPoint"
  text-tl: "Mga presentasyon bilang PowerPoint file, handang ipakita at baguhin"
  title-tr: "PowerPoint"
  text-tr: "PowerPoint dosyası olarak sunumlar, sunmaya ve değiştirmeye hazır"
  title-uk: "PowerPoint"
  text-uk: "Презентації у файлах PowerPoint — готові до показу й редагування"
  title-ur: "PowerPoint"
  text-ur: "PowerPoint فائلوں میں بنی پریزنٹیشنز، دکھانے اور بدلنے کے لیے تیار"
  title-vi: "PowerPoint"
  text-vi: "Bài thuyết trình dạng tệp PowerPoint, sẵn sàng để trình chiếu và chỉnh sửa"
  title-yo: "PowerPoint"
  text-yo: "Àwọn ìgbékalẹ̀ ní fáìlì PowerPoint, tí ó ṣetán láti gbé kalẹ̀ àti láti yípadà"
  title-zh-Hans: "PowerPoint"
  text-zh-Hans: "做成 PowerPoint 文件的演示文稿，可直接放映和修改"
  title-zh-Hant: "PowerPoint"
  text-zh-Hant: "製成 PowerPoint 檔案的簡報，可直接放映和修改"
---
# PowerPoint

Make the deck on your computer with pptxgenjs, a JavaScript library that writes PowerPoint files, and save it in /workspace. It opens beside the conversation, slide by slide, and the user saves it with a click. Its text, charts and tables stay editable in PowerPoint, and it opens in Keynote and Google Slides too.

## Steps

1. This needs the computer's `bash`. If you don't have it, look for it with `find_tools`; if the computer is off, offer it (`offer`, `computer`).
2. Plan the slides before writing any code, all in the user's language:
   - a title slide, then one point a slide, its title saying the point ("Sales grew every month", not "Sales"), and a last slide with the next steps or a summary;
   - five short lines a slide at most; what the speaker would add goes in the slide's notes;
   - numbers as a chart or a small table, worked out exactly first (on the computer, when they come from a file). Never make numbers up.
3. Install pptxgenjs in your home folder, once a visit, so that only the deck lands in /workspace: `cd ~ && npm install pptxgenjs`. If npm can't reach its registry, the computer's internet is off: say so (Settings › Computer) and stop.
4. Write the script and run it in one command: `cat > ~/deck.js <<'EOF'`, the script, `EOF`, then `cd ~ && node deck.js`. Start from this one, which makes a title slide, a list, a chart and a table:

```js
const pptxgen = require('pptxgenjs')

// The user's language, and whether it is written right to left (Arabic, Hebrew, Persian, Urdu).
const lang = 'en-US'
const rtl = false
// One colour for text, one for the background, one accent: the same on every slide.
const ink = '1F2937', muted = '6B7280', accent = '0F766E', paper = 'FFFFFF'

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE' // 13.33 × 7.5 inches
pres.rtlMode = rtl
pres.title = 'Bakery launch plan'
pres.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' }

/** Options for a text, a line or a cell, new each time: pptxgenjs changes those it is given. */
const own = (options) => ({ lang, ...(rtl && { rtlMode: true, align: 'right' }), ...options })
/** A table's row or widths, its first column on the right when the language is. */
const row = (...cells) => (rtl ? cells.reverse() : cells)

pres.defineSlideMaster({
  title: 'PAGE',
  background: { color: paper },
  objects: [{ rect: { x: 0, y: 7.3, w: 13.33, h: 0.2, fill: { color: accent } } }],
  slideNumber: { x: rtl ? 0.4 : 12.3, y: 6.8, w: 0.6, h: 0.4, fontSize: 12, color: muted },
})

/** A slide whose title says its point. */
function page(title) {
  const slide = pres.addSlide({ masterName: 'PAGE' })
  slide.addText(title, own({ x: 0.6, y: 0.4, w: 12.1, h: 1, fontSize: 32, bold: true, color: ink }))
  return slide
}

let slide = pres.addSlide()
slide.background = { color: accent }
slide.addText('Bakery launch plan', own({ x: 0.8, y: 2.5, w: 11.7, h: 1.4, fontSize: 44, bold: true, color: paper }))
slide.addText('Spring 2026', own({ x: 0.8, y: 3.9, w: 11.7, h: 0.8, fontSize: 24, color: paper }))

slide = page('Mornings bring two thirds of sales')
slide.addText(['Bread sells out by 10 am', 'Pastries peak at weekends', 'Afternoons need a reason to come']
  .map((text) => ({ text, options: own({ bullet: true, breakLine: true }) })),
  own({ x: 0.6, y: 1.7, w: 12.1, h: 5, fontSize: 24, color: ink, valign: 'top', paraSpaceAfter: 12 }))
slide.addNotes('Start with the morning rush, then what the afternoons lack.')

slide = page('Sales grew every month')
slide.addChart(pres.charts.BAR, [{ name: 'Sales', labels: ['Jan', 'Feb', 'Mar'], values: [1200, 1340, 1610] }], {
  x: 0.6, y: 1.6, w: 12.1, h: 5.3, barDir: 'col', chartColors: [accent], showValue: true, showLegend: false,
  catAxisLabelFontSize: 16, valAxisLabelFontSize: 14, dataLabelFontSize: 14, lang,
})

slide = page('The North sells the most')
const cell = (text, options) => ({ text, options: own({ fontSize: 20, color: ink, ...options }) })
slide.addTable([
  row(cell('Region', { bold: true }), cell('Sales', { bold: true, align: 'right' })),
  row(cell('North'), cell('2,540', { align: 'right' })),
  row(cell('South'), cell('1,960', { align: 'right' })),
], { x: 0.6, y: 1.7, w: 12.1, colW: row(8.1, 4), border: { type: 'solid', pt: 0.75, color: 'D1D5DB' } })

pres.writeFile({ fileName: '/workspace/Bakery launch plan.pptx' }).then((name) => console.log(`Saved ${name}`))
```

5. What breaks decks:
   - Colours are six hex digits without `#`: `'0F766E'`.
   - Positions and sizes are in inches. Keep everything inside the 13.33 × 7.5 slide, half an inch from its edges.
   - Every text, line and cell gets its options from `own()`, so each has its own object, its language and, when it applies, right to left.
   - Every line of a list has `breakLine: true`, or the lines run together.
   - Fonts are set once, in `pres.theme`, never on a text: PowerPoint then uses a font made for each script (Japanese, Arabic, Hindi…).
   - Titles 28 to 44 points, other text 18 to 24, never under 14. When text doesn't fit, split the slide rather than shrink the text.
   - Write numbers as the user's language writes them (`2 540` in French) and dates and months in their language.
   - Pictures only from the user's files in /workspace: `slide.addImage({ path: '/workspace/logo.png', x: 0.6, y: 1.7, w: 4, h: 3 })`, keeping their proportions. Never a picture from the web or one made up.
   - Other charts: `pres.charts.LINE` for change over time, `PIE` or `DOUGHNUT` for parts of a whole (seven slices at most), `barDir: 'bar'` for long labels; several series are several `{ name, labels, values }`, with `showLegend: true`.
6. Name the file after the deck, in the user's language. To change it, change `~/deck.js` and run it again with the same name: it becomes the deck's next version, and the earlier ones stay under their answers. Your home folder lasts only while Jean stays open: if `~/deck.js` is gone, install pptxgenjs and write the script again whole.
7. Then say in a sentence or two what the deck holds and how many slides it has. Don't show the script unless asked.
