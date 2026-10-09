// Recall: searching a project's earlier conversations for what was said, for the Memory
// capability (caps/memory/memory.js) and for jean-cli. Host-agnostic: no DOM.
import { listConversations, loadConversation } from '../../core/conversations.js'
import { foldTurns, splitSuggestions } from '../../core/events.js'
import { bm25 } from '../../core/search.js'

const clip = (/** @type {string} */ text) => (text.length > 600 ? `${text.slice(0, 600)}…` : text)

/**
 * The `recall` tool, on the conversations of a project but the one it is asked from.
 * @param {{ fs: import('../../core/types.js').FS, projectDir: () => string, own: (signal?: AbortSignal) => string | undefined }} options
 *   own: the path of the conversation a run's signal belongs to
 * @returns {import('../../core/loop.js').Tool}
 */
export const recallTool = ({ fs, projectDir, own }) => ({
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
    const asking = own(ctx.signal)
    for (const { path, title } of await listConversations(fs, projectDir())) {
      if (path === asking) continue
      const conversation = await loadConversation(fs, path).catch(() => null)
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
})
