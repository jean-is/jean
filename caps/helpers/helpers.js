// Helpers (docs/product.md): for a big request with independent parts, Jean splits the work and
// hands each part to a helper: a short turn of its own, with the same brain, tools and rules but
// not the conversation (D7). Helpers work at the same time; their approvals and questions wait in
// the decision inbox, and each reports back with its sources, numbered as the answer cites them.
// What each did shows in the activity view, under its part.
import { register, contributions } from '../../ui/caps.js'
import { askUser, assistantName } from '../../ui/state.js'
import { splitSuggestions } from '../../core/events.js'

/** @typedef {import('../../core/loop.js').Tool} Tool */

// At most this many parts, this many helpers at once, and this many brain calls each.
const MAX_PARTS = 5
const AT_ONCE = 3
const HELPER_STEPS = 8
// Helpers don't split their work again, offer things, or answer in place of the user.
const NOT_FOR_HELPERS = new Set(['delegate', 'helper', 'offer', 'ask_user'])

/** What a helper is told, in English like every prompt (prompts/system.md). @param {string} name */
const prompt = (name) => `You are a helper of ${name}, an assistant that does work for people in their web browser. You do one part of a larger task, then report to ${name}, not to the user.

<rules>
- Do only the part you are given, with the tools you have.
- Never invent facts, numbers, quotes or sources. Say when you are unsure.
- Cite numbered sources as [n], as the tools number them.
- Use ask_user only when you cannot go on without the user's answer.
- Report briefly: what you found or did, with the facts and numbers that matter.
</rules>`

/** Runs the jobs a few at a time; a part that fails says so in its report. @param {(() => Promise<string>)[]} jobs @param {number} size */
async function pool(jobs, size) {
  /** @type {string[]} */
  const reports = []
  let next = 0
  const work = async () => {
    for (let i = next++; i < jobs.length; i = next++) reports[i] = await jobs[i]().catch((error) => `This part failed: ${error.message}`)
  }
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, work))
  return reports
}

/** @type {Tool} */
const delegateTool = {
  spec: {
    name: 'delegate',
    description: "Split a large task into independent parts, each done by a helper, at the same time. A helper has your tools and rules but not this conversation: give each part everything it needs. You get each helper's report back, its sources numbered as you cite them.",
    parameters: {
      type: 'object',
      properties: {
        parts: {
          type: 'array', minItems: 2, maxItems: MAX_PARTS,
          items: { type: 'object', properties: { title: { type: 'string', description: "A few words, in the user's language" }, task: { type: 'string', description: 'What to do, with everything needed to do it' } }, required: ['title', 'task'] },
        },
      },
      required: ['parts'],
    },
  },
  kind: 'think',
  title: (args) => `Delegate: ${(args?.parts ?? []).map((/** @type {any} */ part) => part?.title).join(', ')}`,
  run: async (args, ctx) => {
    const parts = (Array.isArray(args?.parts) ? args.parts : []).filter((/** @type {any} */ part) => part?.task).slice(0, MAX_PARTS)
    if (!parts.length) throw new Error('Give at least one part, with its task.')
    const titles = parts.map((/** @type {any} */ part) => String(part.title || part.task).slice(0, 80))
    const reports = await pool(parts.map((/** @type {any} */ part, /** @type {number} */ i) => () => ctx.call('helper', { title: titles[i], task: String(part.task) })), AT_ONCE)
    return reports.map((report, i) => `Part ${i + 1}, ${titles[i]}:\n${report}`).join('\n\n')
  },
}

/** A helper's question, answered in the decision inbox. @param {string} from the part it works on @returns {Tool} */
const askTool = (from) => ({
  spec: {
    name: 'ask_user',
    description: 'Ask the user one short question, in their language, when you cannot go on without the answer. Returns their answer, or that they did not answer.',
    parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
  },
  kind: 'think',
  hidden: true,
  title: (args) => String(args?.question ?? ''),
  run: async (args) => (await askUser(String(args?.question ?? ''), from)) ?? 'The user did not answer. Do your best, and say what you assumed.',
})

/** One part, done by a helper: its own turn, recorded under this call. @type {Tool} */
const helperTool = {
  spec: { name: 'helper', description: 'A helper doing one part of a task (delegate starts them).', parameters: { type: 'object', properties: { title: { type: 'string' }, task: { type: 'string' } }, required: ['task'] } },
  kind: 'think',
  hidden: true,
  title: (args) => String(args?.title ?? ''),
  run: async (args, ctx) => {
    const ask = askTool(String(args?.title ?? ''))
    const { text, stopReason } = await ctx.turn({
      system: prompt(assistantName()),
      history: [{ role: 'user', content: String(args?.task ?? '') }],
      tools: () => [...contributions().tools.filter((tool) => !NOT_FOR_HELPERS.has(tool.spec.name)), ask],
      declared: [...ctx.declared.filter((name) => !NOT_FOR_HELPERS.has(name)), 'ask_user'],
      maxSteps: HELPER_STEPS,
    })
    const report = splitSuggestions(text).text.trim()
    if (!report) throw new Error(stopReason === 'max_steps' ? 'The helper ran out of steps.' : 'The helper had nothing to report.')
    return report
  },
}

register({
  id: 'helpers',
  tools: [delegateTool, helperTool],
  lines: [{ name: 'delegate', line: 'hand independent parts of a large task to helpers, who do them at the same time' }],
  rules: ['Use helpers only for independent parts of a large task.'],
})
