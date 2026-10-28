// Gate 8: the draft skill, five briefs, a brain, up to three rounds of play-test reports.
// node brains.mjs claude:sonnet | lmstudio:<model> [brief ids…]
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '../../node_modules/playwright/index.mjs'
import { ACTIONS, playtest } from './playtest.mjs'

const HERE = new URL('.', import.meta.url).pathname
const SKILL = new URL('./skill/', import.meta.url).pathname
const [brain, ...only] = process.argv.slice(2)
const BRIEFS = [
  { id: 'empty', lang: 'en', text: 'Make me a game.' },
  { id: 'child', lang: 'en', text: 'A game about recycling for my 7-year-old.', child: true },
  { id: 'words', lang: 'ja', text: '日本語の言葉のパズルゲームを作って。' },
  { id: 'story', lang: 'fr', text: "Fais-moi un jeu d'aventure dont je suis le héros, dans une forêt." },
  { id: 'clone', lang: 'ar', text: 'اصنع لي لعبة فلابي بيرد.' },
  { id: '3d', lang: 'en', text: 'A 3D game where I sail a little boat between islands.' },
].filter((b) => !only.length || only.includes(b.id))

const sheets = await Promise.all(['SKILL.md', 'phaser.md', 'babylon.md', 'canvas.md', 'feel.md'].map((f) => readFile(SKILL + f, 'utf8')))
const SYSTEM = `You are Jean, an assistant in a browser tab. You read the skill "Make a game" and its four sheets; they follow.

${sheets[0]}

---

${sheets.slice(1).join('\n\n---\n\n')}

---

Here the \`game\` tool is your answer itself. Write the design card, then a line \`engine: phaser\`, \`engine: babylon\` or \`engine: none\`, then a line \`actions: \` with the actions the game uses, then the whole game in one \`\`\`js block. After each answer you get the play-test report as the tool's result; answer again in the same shape, with the whole game, until nothing is left to fix. Your last answer after a clean report is the hand-over, without code.`

const ask = async (messages) => {
  const [kind, model] = [brain.slice(0, brain.indexOf(':')), brain.slice(brain.indexOf(':') + 1)]
  if (kind === 'lmstudio') {
    // Streamed, so that a long think never times out before the first byte.
    const response = await fetch('http://127.0.0.1:1234/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, ...messages], temperature: 0.6, max_tokens: 32000, stream: true, stream_options: { include_usage: true } }) })
    let text = '', usage, buffer = ''
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
      buffer += chunk
      for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
        const line = buffer.slice(0, i).trim()
        buffer = buffer.slice(i + 1)
        if (!line.startsWith('data:') || line.includes('[DONE]')) continue
        try { const json = JSON.parse(line.slice(5)); text += json.choices?.[0]?.delta?.content ?? ''; usage = json.usage ?? usage } catch {}
      }
    }
    return { text, usage }
  }
  // The owner's own claude, without tools, sessions or servers; the conversation so far as one prompt.
  const prompt = messages.map((m) => (m.role === 'user' ? `<turn role="user">\n${m.content}\n</turn>` : `<turn role="assistant">\n${m.content}\n</turn>`)).join('\n\n') + '\n\nAnswer the last turn.'
  const dir = `${HERE}out/claude-cwd`
  await mkdir(dir, { recursive: true })
  return new Promise((resolve) => {
    const child = spawn('claude', ['-p', '--model', model, '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--system-prompt', SYSTEM, prompt], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    child.stdout.on('data', (d) => { out += d }); child.stderr.on('data', (d) => { err += d })
    child.on('close', () => resolve({ text: out || err }))
  })
}
const parse = (text) => {
  const blocks = [...text.matchAll(/```(?:js|javascript)\n([\s\S]*?)```/g)]
  return {
    code: blocks.at(-1)?.[1],
    engine: /engine:\s*`?(phaser|babylon|none)/i.exec(text)?.[1]?.toLowerCase() ?? 'phaser',
    actions: (/actions:\s*`?([^\n`]*)/i.exec(text)?.[1] ?? '').split(/[\s,]+/).filter((a) => ACTIONS.includes(a)),
  }
}

const browser = await chromium.launch()
let page
const fresh = async () => { await page?.close().catch(() => {}); page = await browser.newPage(); await page.goto(`http://127.0.0.1:${process.env.PORT ?? 4290}/parent.html`); await page.waitForFunction(() => window.ready) }
await fresh()
const name = brain.replace(/[^\w.-]+/g, '_')
const rows = []
for (const brief of BRIEFS) {
  const out = `${HERE}out/${name}/${brief.id}`
  await mkdir(out, { recursive: true })
  const messages = [{ role: 'user', content: brief.child ? `${brief.text}\n\n(This is a child's profile.)` : brief.text }]
  const row = { brief: brief.id, rounds: 0, clean: false, engine: null, seconds: 0, lines: 0, problems: [] }
  for (let round = 1; round <= 3; round++) {
    const t = Date.now()
    const { text, usage } = await ask(messages)
    row.seconds += Math.round((Date.now() - t) / 1000)
    await writeFile(`${out}/answer-${round}.md`, text)
    messages.push({ role: 'assistant', content: text })
    const { code, engine, actions } = parse(text)
    row.rounds = round, row.engine = engine, row.usage = usage
    if (!code) { row.problems = ['no code in the answer']; break }
    row.lines = code.split('\n').length
    const result = await playtest(page, { code, engine, lang: brief.lang, actions: actions.length ? actions : ACTIONS })
    if (result.froze) await fresh()
    await writeFile(`${out}/report-${round}.txt`, result.text)
    row.problems = result.problems, row.clean = result.clean
    if (engine === 'phaser') row.onPhaser3 = (await playtest(page, { code, engine: 'phaser3', lang: brief.lang, actions: actions.length ? actions : ACTIONS })).problems.length
    if (result.clean) break
    messages.push({ role: 'user', content: `Play-test report:\n${result.text}` })
  }
  rows.push(row)
  console.log(JSON.stringify(row))
  await writeFile(`${HERE}out/${name}/rows${only.length ? `-${only.join("-")}` : ""}.json`, JSON.stringify(rows, null, 1))
}
await browser.close()
