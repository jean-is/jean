// A pane that frames Jean's own demo of a page's task (D462), where the page's pane draws a conversation the demo
// can play: the task written beside the page as a conversation's file (D457), from the page's words as text, and the
// frame that shows it as it ended, with a button that plays it, its words the page's (pane.title, pane.play).
import { xml } from './site.js'

/** When a demo's records say they were written: the demo shows each as of when it shows it. */
const AT = '2026-01-01T09:00:00.000Z'

/**
 * A task as a page's words tell it: the file shared with the request, the request, the AI as the page names it (never
 * by brand), the program it ran and what came back where there is one, and the answer, in Markdown.
 * @typedef {{ file?: { name: string, type: string }, asked: string, brain: string, code?: string, output?: string, answer: string }} Task
 */

/** Where a page's task is, from the site's root. @param {import('./site.js').Kit} kit */
const pathOf = (kit) => `demos/${kit.name}.${kit.lang}.jsonl`

/** The file a page writes beside itself for its pane's demo, by its path. @param {import('./site.js').Kit} kit @param {Task} task */
export function demoFiles (kit, { file, asked, brain, code, output, answer }) {
  const said = (/** @type {object} */ content) => ({ at: AT, by: 'demo', update: { sessionUpdate: 'user_message_chunk', content } })
  const step = (/** @type {number} */ index, /** @type {object} */ update) => ({ at: AT, by: 'jean', step: index, update })
  const asks = (/** @type {number} */ index, /** @type {string} */ stopReason) => step(index, { sessionUpdate: 'tool_call', toolCallId: `brain-${index}`, title: brain, kind: 'think', status: 'completed', rawOutput: { stopReason } })
  // With a program, the AI asks for it, then answers from what it gave back; else it answers at once.
  const last = code === undefined ? 0 : 1
  const records = [
    { format: 1, kind: 'conversation', id: `demo-${kit.name}`, createdAt: AT, by: 'demo' },
    ...file ? [said({ type: 'resource_link', uri: `files/${file.name}`, name: file.name, mimeType: file.type })] : [],
    said({ type: 'text', text: asked }),
    ...code === undefined ? [] : [asks(0, 'tool_use'), step(0, { sessionUpdate: 'tool_call', toolCallId: 'call-1', title: 'javascript', name: 'javascript', kind: 'execute', status: 'completed', rawInput: { code }, rawOutput: output })],
    asks(last, 'end'),
    step(last, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: answer } }),
  ]
  return { [pathOf(kit)]: records.map((record) => JSON.stringify(record)).join('\n') + '\n' }
}

/** The frame that plays it in the page's pane, loaded once it is near, shown as the task ended. @param {import('./site.js').Kit} kit */
export function demoFrame (kit) {
  const src = `${kit.site('demo.html')}#${new URLSearchParams({ src: pathOf(kit), lang: kit.lang, play: kit.text('pane.play') })}&still&bare`
  return /* html */ `<iframe class="site-demo" src="${xml(src)}" title="${kit.say('pane.title')}" loading="lazy"></iframe>`
}
