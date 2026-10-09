// Memory (docs/product.md, "Instructions and memory"): Jean notes the lasting facts, preferences
// and corrections the user states, one line each in their language, in memory.md: the person's
// at the root, a project's in its folder. Every new conversation reads them (the newest that fit
// about 1,000 tokens), and a change during one arrives as a note (D46). The user sees, edits and
// deletes them in Settings' About you. Also recall: searching earlier conversations.
import { effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, effective, notify, conversationOf } from '../../ui/state.js'
import { changeMemory, parseMemory, memoryText, oneLine } from '../../core/memory.js'
import { listConversations, loadConversation } from '../../core/conversations.js'
import { foldTurns, splitSuggestions } from '../../core/events.js'
import { bm25 } from '../../core/search.js'
import { join } from '../../core/fs.js'
import { t } from '../../core/i18n.js'

/** The memory files of the room: the person's, and the project's unless it is the home one. */
export const memoryFiles = () => (app.project.value.data.default === true ? ['memory.md'] : ['memory.md', join(app.projectDir, 'memory.md')])

/** @type {import('../../core/loop.js').Tool} */
const rememberTool = {
  spec: {
    name: 'remember',
    description: 'Save one lasting fact, preference or correction the user stated, as one short line in their language. Use scope "project" when it only concerns the current project.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' }, scope: { type: 'string', enum: ['person', 'project'] } },
      required: ['text'],
    },
  },
  kind: 'edit',
  title: (args) => `Remember: ${args?.text ?? ''}`,
  run: async (args, ctx) => {
    const text = oneLine(String(args?.text ?? ''))
    if (!text) throw new Error('There is nothing to remember.')
    const files = memoryFiles()
    const path = args?.scope === 'project' ? files[files.length - 1] : files[0]
    const conversation = conversationOf(ctx.signal)?.path
    const entry = { text, at: new Date().toISOString(), by: 'jean', ...(conversation && { conversation }) }
    let known = false
    await changeMemory(app.fs, path, (entries) => ((known = entries.some((other) => other.text.toLowerCase() === text.toLowerCase())) ? entries : [...entries, entry]))
    if (known) return 'This was already remembered.'
    notify(t('memory.saved', { text }), { label: t('memory.undo'), run: () => changeMemory(app.fs, path, (entries) => entries.filter((other) => other.at !== entry.at)) })
    return 'Remembered.'
  },
}

const clip = (/** @type {string} */ text) => (text.length > 600 ? `${text.slice(0, 600)}…` : text)

/** @type {import('../../core/loop.js').Tool} */
const recallTool = {
  spec: {
    name: 'recall',
    description: 'Search the earlier conversations of this project for what was said, with words they would contain.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  kind: 'search',
  title: (args) => `Recall: ${args?.query ?? ''}`,
  run: async (args, ctx) => {
    /** @type {{ title: string, at: string, user: string, answer: string }[]} */
    const passages = []
    const own = conversationOf(ctx.signal)?.path
    for (const { path, title } of await listConversations(app.fs, app.projectDir)) {
      if (path === own) continue
      const conversation = await loadConversation(app.fs, path).catch(() => null)
      for (const turn of foldTurns(conversation?.records ?? [])) {
        const answer = splitSuggestions(turn.steps.map((step) => step.text).filter(Boolean).join('\n\n')).text
        if (turn.user?.text || answer) passages.push({ title, at: turn.at, user: turn.user?.text ?? '', answer })
      }
    }
    const hits = bm25(passages.map((passage) => `${passage.user}\n${passage.answer}`), String(args?.query ?? '')).slice(0, 5)
    if (!hits.length) return 'Nothing in the earlier conversations matches.'
    return hits.map(({ index }) => {
      const { title, at, user, answer } = passages[index]
      return `From "${title || 'Untitled'}", ${at.slice(0, 10)}:\nThe user: ${clip(user)}\nThe answer: ${clip(answer)}`
    }).join('\n\n')
  },
}

const recall = { name: 'recall', line: 'search earlier conversations' }
const memory = {
  id: 'memory',
  tools: [recallTool, rememberTool],
  lines: [recall, { name: 'remember', line: 'save a lasting fact, preference or correction the user states' }],
  rules: ['Remember only what will still matter in later conversations.'],
  sections: async () => {
    const files = await Promise.all(memoryFiles().map(async (path) => parseMemory(await app.fs.read(path))))
    const text = memoryText(files.flat())
    return text ? { memory: text } : {}
  },
}

// Switched off in settings: nothing is noted or read, and earlier conversations can still be searched.
effect(() => register(effective.value.settings.memory === false ? { id: 'memory', tools: [recallTool], lines: [recall] } : memory))
