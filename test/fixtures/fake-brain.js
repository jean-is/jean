// A deterministic OpenAI-compatible brain for local end-to-end checks.
// Usage: node test/fixtures/fake-brain.js   (then connect "Other" → http://127.0.0.1:4174/v1)
// Streams a short thought and a Markdown answer, in the language the prompt asks for.
// Answers from shared documents when there are some, and imitates a provider's prefix
// cache: usage reports how much of each request repeats the previous one byte for byte.
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
}

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
  const { messages } = JSON.parse(body)
  const serialized = JSON.stringify(messages)
  const cached = sharedPrefix(previous, serialized)
  previous = serialized
  const last = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
  const documents = [...messages.map((m) => m.content).join('\n').matchAll(/<document name="([^"]*)">\n([\s\S]*?)\n<\/document>/g)]
  const question = last.replace(/<document[\s\S]*<\/document>\n\n/, '').replace(/<system-note>[\s\S]*?<\/system-note>\n\n/g, '')
  const system = messages.find((message) => message.role === 'system')?.content ?? ''
  const lang = /[؀-ۿ]/.test(question) ? 'ar' : /use French\./.test(system) || /now French/.test(serialized) || /[éèàçù]/.test(question) ? 'fr' : 'en'
  const answer = documents.length
    ? `I read **${documents.at(-1)?.[1]}**. It starts with: “${documents.at(-1)?.[2].replace(/\[\[page \d+\]\]\n/g, '').slice(0, 120).trim()}”\n\nYou asked: *${question.slice(0, 80)}*`
    : REPLIES[lang](question.slice(0, 80))

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  const send = (/** @type {object} */ delta, finish = null) =>
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
  const pause = () => new Promise((resolve) => setTimeout(resolve, 35))
  for (const word of 'Reading the request and planning a clear answer.'.split(' ')) {
    send({ reasoning: word + ' ' })
    await pause()
  }
  for (const piece of answer.match(/.{1,6}/gs) ?? []) {
    send({ content: piece })
    await pause()
  }
  send({}, 'stop')
  const prompt = Math.ceil(serialized.length / 4)
  res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: Math.ceil(answer.length / 4), prompt_tokens_details: { cached_tokens: Math.floor(cached / 4) } } })}\n\n`)
  res.end('data: [DONE]\n\n')
}).listen(PORT, '127.0.0.1', () => console.log(`Fake brain on http://127.0.0.1:${PORT}/v1`))
