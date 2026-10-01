// A deterministic OpenAI-compatible brain for local end-to-end checks.
// Usage: node test/fixtures/fake-brain.js   (then connect "Other" → http://127.0.0.1:4174/v1)
// Streams a short thought and a Markdown answer, in the language the prompt asks for.
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT) || 4174

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
  const question = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
  const system = messages.find((message) => message.role === 'system')?.content ?? ''
  const lang = /[؀-ۿ]/.test(question) ? 'ar' : /use French\./.test(system) || /[éèàçù]/.test(question) ? 'fr' : 'en'
  const answer = REPLIES[lang](question.slice(0, 80))

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
  res.end('data: [DONE]\n\n')
}).listen(PORT, '127.0.0.1', () => console.log(`Fake brain on http://127.0.0.1:${PORT}/v1`))
