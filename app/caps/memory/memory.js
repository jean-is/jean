// Memory (docs/product.md, "Instructions and memory"): Jean notes the lasting facts, preferences
// and corrections the user states, one line each in their language, in memory.md: the person's
// at the root, a project's in its folder. Every new conversation reads them (the newest that fit
// about 1,000 tokens), and a change during one arrives as a note (D46). The user sees, edits and
// deletes them in Settings' About you. Also recall (recall.js): searching earlier conversations.
import { effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, effective, notify, conversationOf } from '../../ui/state.js'
import { changeMemory, parseMemory, memoryText, oneLine } from '../../core/memory.js'
import { join } from '../../core/fs.js'
import { t } from '../../core/i18n.js'
import { recallTool } from './recall.js'

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

const recall = recallTool({ fs: app.fs, projectDir: () => app.projectDir, own: (signal) => conversationOf(signal)?.path })
const recallLine = { name: 'recall', line: 'search earlier conversations' }
const memory = {
  id: 'memory',
  tools: [recall, rememberTool],
  lines: [recallLine, { name: 'remember', line: 'save a lasting fact, preference or correction the user states' }],
  rules: ['Remember only what will still matter in later conversations.'],
  sections: async () => {
    const files = await Promise.all(memoryFiles().map(async (path) => parseMemory(await app.fs.read(path))))
    const text = memoryText(files.flat())
    return text ? { memory: text } : {}
  },
}

// Switched off in settings: nothing is noted or read, and earlier conversations can still be searched.
effect(() => register(effective.value.settings.memory === false ? { id: 'memory', tools: [recall], lines: [recallLine] } : memory))
