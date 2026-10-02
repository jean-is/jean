// A deterministic OpenAI-compatible brain for local end-to-end checks.
// Usage: node test/fixtures/fake-brain.js   (then connect "Other" → http://127.0.0.1:4174/v1)
// Streams a short thought and a Markdown answer, in the language the prompt asks for.
// Answers from shared documents when there are some, citing them as [n], and imitates a
// provider's prefix cache: usage reports how much of each request repeats the previous one.
// With a shared table of data it works like a real brain would in 0.3: it offers
// Calculations if they're off, then runs a script that reads the file and totals it.
// From 0.4 it remembers what follows "Remember", says what its <memory> holds when asked
// "What do you know?", and saves a routine when asked to (finding the tool first if needed).
import { createServer } from 'node:http'

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

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') return res.end()
  if (req.url?.endsWith('/models')) {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ data: [{ id: 'fake-brain-1' }, { id: 'fake-brain-2' }] }))
  }
  if (!req.url?.endsWith('/chat/completions')) return res.writeHead(404).end()

  let body = ''
  for await (const chunk of req) body += chunk
  const { messages, tools = [] } = JSON.parse(body)
  const serialized = JSON.stringify(messages)
  const cached = sharedPrefix(previous, serialized)
  previous = serialized
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
  const routine = /routine/i.test(question) && last.role === 'user'
  const steps = '# Weekly sales summary\n\n1. Read the shared sales file.\n2. Total the sales by region.\n3. Answer with a short table.'
  if (remember && last.role === 'user' && declared.has('remember')) call = { name: 'remember', args: { text: remember[1], scope: system.includes('<project>') ? 'project' : 'person' } }
  else if (toolName === 'remember') answer = 'Noted.'
  else if (/what do you know/i.test(question) && last.role === 'user') answer = memory ? `I know this:\n\n${memory}` : 'Nothing yet.'
  else if (routine && declared.has('save_routine')) call = { name: 'save_routine', args: { name: 'weekly-sales-summary', description: 'When the user asks for a summary of the weekly sales by region.', steps } }
  else if (routine && declared.has('find_tools')) call = { name: 'find_tools', args: { query: 'save a routine' } }
  else if (toolName === 'find_tools' && /save_routine\(/.test(last.content)) call = { name: 'save_routine', args: { name: 'weekly-sales-summary', description: 'When the user asks for a summary of the weekly sales by region.', steps } }
  else if (toolName === 'save_routine') answer = 'Done: it is a routine now.'
  else if (table && last.role === 'user' && declared.has('run')) call = { name: 'run', args: { code: totalsScript(table[2]) } }
  else if (table && last.role === 'user' && declared.has('offer')) call = { name: 'offer', args: { capability: 'compute' } }
  else if (table && last.role === 'tool' && /It is on/.test(last.content)) call = { name: 'run', args: { code: totalsScript(table[2]) } }
  else if (last.role === 'tool' && /^Result: /.test(last.content)) {
    const { by, of, totals } = JSON.parse(last.content.slice(8).split('\n\nLog:')[0])
    const rows = Object.entries(totals).map(([key, value]) => `| ${key} | ${value} |`).join('\n')
    answer = `${TOTALS[lang](of, by)}${cite(table)}:\n\n| ${by} | ${of} |\n|---|---:|\n${rows}`
  } else if (documents.length) {
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
