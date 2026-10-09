---
name: slides
description: "Make slides in the answer itself, not as a file: a deck to page through and present full screen, in Marp's Markdown, for a talk, a lesson, a pitch, a meeting or a summary, when the user asks for slides, a presentation or a deck without asking for a PowerPoint file."
metadata:
  format: "1"
  blocks: marp
  title-en: "Slides"
  text-en: "Decks written in answers, to page through and present"
  title-am: "ስላይዶች"
  text-am: "በመልሶች ውስጥ የተጻፉ ማቅረቢያዎች፣ ለማገላበጥና ለማቅረብ"
  title-ar: "شرائح"
  text-ar: "عروض تقديمية مكتوبة في الإجابات، لتصفّحها وعرضها"
  title-bn: "স্লাইড"
  text-bn: "উত্তরে লেখা উপস্থাপনা, পাতা ওল্টাতে আর দেখাতে"
  title-de: "Folien"
  text-de: "Präsentationen in Antworten, zum Durchblättern und Vorführen"
  title-es: "Diapositivas"
  text-es: "Presentaciones escritas en las respuestas, para hojear y presentar"
  title-fa: "اسلایدها"
  text-fa: "ارائه‌هایی که در پاسخ‌ها نوشته می‌شوند، برای ورق زدن و ارائه"
  title-fr: "Diapositives"
  text-fr: "Des présentations écrites dans les réponses, à feuilleter et à projeter"
  title-ha: "Silaidodi"
  text-ha: "Gabatarwa da aka rubuta a cikin amsoshi, don juyawa da gabatarwa"
  title-he: "שקופיות"
  text-he: "מצגות שנכתבות בתשובות, לדפדוף ולהצגה"
  title-hi: "स्लाइड्स"
  text-hi: "जवाबों में लिखी प्रस्तुतियाँ, पलटने और दिखाने के लिए"
  title-id: "Slide"
  text-id: "Presentasi yang ditulis dalam jawaban, untuk dibolak-balik dan dipresentasikan"
  title-it: "Diapositive"
  text-it: "Presentazioni scritte nelle risposte, da sfogliare e proiettare"
  title-ja: "スライド"
  text-ja: "回答の中に書かれたスライド。めくって見たり、発表したりできます"
  title-ko: "슬라이드"
  text-ko: "답변에 쓰인 슬라이드를 넘겨 보고 발표할 수 있습니다"
  title-mr: "स्लाइड्स"
  text-mr: "उत्तरांमध्ये लिहिलेली सादरीकरणे, चाळण्यासाठी आणि सादर करण्यासाठी"
  title-ms: "Slaid"
  text-ms: "Persembahan yang ditulis dalam jawapan, untuk diselak dan dibentangkan"
  title-nl: "Dia’s"
  text-nl: "Presentaties in antwoorden, om door te bladeren en te presenteren"
  title-pl: "Slajdy"
  text-pl: "Prezentacje pisane w odpowiedziach, do przeglądania i pokazywania"
  title-pt: "Diapositivos"
  text-pt: "Apresentações escritas nas respostas, para folhear e apresentar"
  title-ru: "Слайды"
  text-ru: "Презентации прямо в ответах: листать и показывать"
  title-sw: "Slaidi"
  text-sw: "Mawasilisho yaliyoandikwa katika majibu, ya kupitia na kuwasilisha"
  title-ta: "ஸ்லைடுகள்"
  text-ta: "பதில்களில் எழுதப்படும் விளக்கக்காட்சிகள், புரட்டவும் காட்டவும்"
  title-te: "స్లైడ్‌లు"
  text-te: "జవాబుల్లో రాసిన ప్రెజెంటేషన్లు, తిరగేయడానికి, ప్రదర్శించడానికి"
  title-th: "สไลด์"
  text-th: "งานนำเสนอที่เขียนในคำตอบ ไว้เปิดดูและนำเสนอ"
  title-tl: "Mga slide"
  text-tl: "Mga presentasyong isinulat sa mga sagot, para buklatin at ipresenta"
  title-tr: "Slaytlar"
  text-tr: "Yanıtlarda yazılan sunumlar, gezinmek ve sunmak için"
  title-uk: "Слайди"
  text-uk: "Презентації просто у відповідях: гортати й показувати"
  title-ur: "سلائیڈز"
  text-ur: "جوابوں میں لکھی گئی پریزنٹیشنز، ورق پلٹنے اور پیش کرنے کے لیے"
  title-vi: "Trang chiếu"
  text-vi: "Bài trình chiếu viết ngay trong câu trả lời, để lật xem và trình chiếu"
  title-yo: "Àwọn síláìdì"
  text-yo: "Àwọn ìgbékalẹ̀ tí a kọ sínú ìdáhùn, láti yí wò àti láti ṣàfihàn"
  title-zh-Hans: "幻灯片"
  text-zh-Hans: "写在回答里的幻灯片，可翻阅可演示"
  title-zh-Hant: "投影片"
  text-zh-Hant: "寫在回答裡的投影片，可翻閱可簡報"
---
# Slides

Write the deck in Marp's Markdown, in a fenced code block tagged `marp`. It is shown where the block is, a slide at a time, with buttons to page through it and to present it full screen.

```marp
---
paginate: true
footer: Bakery · 2027
---

<!-- _class: lead -->
# A second oven
## Plan for 2027

---

## Where we are

- 120 croissants a day, sold out by 10
- Queues out of the door on Saturdays
- One oven, already full

---

## What it costs

| | Cost |
|---|---:|
| Oven | €18,000 |
| Fitting | €2,500 |

---

<!-- _class: invert -->
## Paid back in 14 months
```

## Steps

1. Start with front matter between two `---` lines, for the whole deck: `paginate: true` numbers the slides, and `header:` and `footer:` put a short line on every slide.
2. Separate slides with a line holding only `---`, with an empty line before it.
3. One idea a slide: a `##` heading, then at most six short bullets, a table of a few rows, a formula or a short quote. A title slide has a `#` heading. What doesn't fit a slide is cut off.
4. Settings for one slide go in an HTML comment on it, starting with `_`: `<!-- _class: lead -->` centres a title or section slide, `<!-- _class: invert -->` swaps its colours, `<!-- _paginate: false -->` leaves its number out. Without the `_`, a setting holds from that slide on.
5. Leave out themes, styles and fonts: the deck takes the user's look. A slide's own colours, when they matter: `<!-- _backgroundColor: #1e3a5f -->` and `<!-- _color: white -->`.
6. Pictures aren't shown. Say what one would show, or use a table, a list or an emoji instead.
7. Any other comment is a note for the speaker, which isn't shown.
8. A slide with code in it: fence the deck with four backticks instead of three, so the code's own fence doesn't end it. When the chart skill is added too, a slide can hold an `echarts` block the same way.
9. Write the deck in the user's language. After the block, say in a sentence what it covers.
10. To change a deck, write its whole block again.
