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
// spreadsheet of a shared table's totals from a script (D119).
import { createServer } from 'node:http'
import { deflateSync, crc32 } from 'node:zlib'

const PORT = Number(process.env.PORT) || 4174
let previous = ''

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
const PLAN = '# Bakery plan\n\n1. Bake 120 croissants\n2. Deliver them\n\n| Day | Croissants |\n|---|---:|\n| Saturday | 120 |'

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
  const skill = /\bskill\b/i.test(question) && last.role === 'user'
  // A connected mail service's tools, by name: declared, or listed in <connections>.
  const mailTool = [...declared].find((name) => name.endsWith('_search_emails')) ?? /\b(\w+_search_emails)\b/.exec(serialized)?.[1]
  const emails = /e-?mails?|inbox|courriels?/i.test(question) || /The user is back/.test(serialized)
  const fromScript = (/** @type {string} */ name) => ({ name: 'run', args: { code: `return await tools.${name}({ limit: 3 })` } })
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
  if (system.startsWith('You check whether sources support claims')) answer = checked(lastUser)
  else if (helper && /how many/i.test(task) && last.role === 'user') call = { name: 'ask_user', args: { question: 'How many people are coming?' } }
  else if (helper && toolName === 'ask_user') answer = /did not answer/.test(last.content) ? 'Nobody said; I assumed 10 people.' : `${last.content.trim()} people are coming.`
  else if (helper && last.role === 'user' && mailTool && declared.has(mailTool)) call = { name: mailTool, args: { query: topic, limit: 1 } }
  else if (helper && last.role === 'user') call = { name: 'find_tools', args: { query: 'search emails' } }
  else if (helper && toolName === 'find_tools' && mailTool) call = { name: mailTool, args: { query: topic, limit: 1 } }
  else if (helper && found.length) answer = topic === 'invoice' ? `Invoice 2041, for 912 euros, is due on Friday 4 October [${found[0].n}].` : `Margot asks to confirm an order of 120 croissants for Saturday morning [${found[0].n}].`
  else if (helper) answer = 'I could not find it.'
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
  else if (emails && last.role === 'user' && mailTool && declared.has('run')) call = fromScript(mailTool)
  else if (emails && last.role === 'user' && declared.has('find_tools')) call = { name: 'find_tools', args: { query: 'search the latest emails' } }
  else if (toolName === 'find_tools' && mailTool && /_search_emails\(/.test(last.content)) call = /inside run/.test(last.content) ? fromScript(mailTool) : { name: mailTool, args: { limit: 3 } }
  else if (found.length && /^mail:/.test(found[0].url)) {
    answer = `Your ${found.length} latest emails:\n\n${found.map((email) => `- **${email.title}**, ${email.more.replace(/:.*$/, '')} [${email.n}]`).join('\n')}`
  } else if (/search the web|look up/i.test(question) && last.role === 'user' && declared.has('web_search')) call = { name: 'web_search', args: { query: question.replace(/.*(?:search the web for|look up)\s*/i, '').replace(/[?.!]$/, '') } }
  else if (toolName === 'web_search') answer = found.length ? `Here is what the web says:\n\n${found.map((page) => `- **${page.title}**: ${page.more.slice(0, 90)} [${page.n}]`).join('\n')}` : 'I found nothing on the web.'
  else if (/\b(draw|picture)\b/i.test(question) && last.role === 'user' && declared.has('run')) call = { name: 'run', args: { code: `return await models.image(${JSON.stringify(question)})` } }
  else if (toolName === 'run' && /"shown":\s*true/.test(last.content)) answer = 'Here is your picture.'
  else if (/word document/i.test(question) && last.role === 'user' && declared.has('write')) call = { name: 'write', args: { name: 'Bakery plan.docx', content: PLAN } }
  else if (/add a step/i.test(question) && last.role === 'user' && declared.has('edit')) call = { name: 'edit', args: { file: 'Bakery plan.docx', old: '2. Deliver them', new: '2. Deliver them\n3. Sell the rest' } }
  else if (toolName === 'write' || toolName === 'edit') answer = /^(?:Saved|Changed) /.test(last.content) ? `Done: **${/^(?:Saved|Changed) (.+?)\. /.exec(last.content)?.[1]}** is under this answer.` : `That didn't work: ${last.content}`
  else if (remember && last.role === 'user' && declared.has('remember')) call = { name: 'remember', args: { text: remember[1], scope: system.includes('<project>') ? 'project' : 'person' } }
  else if (toolName === 'remember') answer = 'Noted.'
  else if (/what do you know/i.test(question) && last.role === 'user') answer = memory ? `I know this:\n\n${memory}` : 'Nothing yet.'
  else if (skill && declared.has('save_skill')) call = { name: 'save_skill', args: { name: 'weekly-sales-summary', description: 'When the user asks for a summary of the weekly sales by region.', steps } }
  else if (skill && declared.has('find_tools')) call = { name: 'find_tools', args: { query: 'save a skill' } }
  else if (toolName === 'find_tools' && /save_skill\(/.test(last.content)) call = { name: 'save_skill', args: { name: 'weekly-sales-summary', description: 'When the user asks for a summary of the weekly sales by region.', steps } }
  else if (toolName === 'save_skill') answer = 'Done: it is a skill now.'
  else if (table && /spreadsheet/i.test(question) && last.role === 'user' && declared.has('run')) call = { name: 'run', args: { code: spreadsheetScript(table[2]) } }
  else if (table && last.role === 'user' && declared.has('run')) call = { name: 'run', args: { code: totalsScript(table[2]) } }
  else if (table && last.role === 'user' && declared.has('offer')) call = { name: 'offer', args: { capability: 'compute' } }
  else if (table && last.role === 'tool' && /It is on/.test(last.content)) call = { name: 'run', args: { code: totalsScript(table[2]) } }
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
