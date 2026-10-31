// Deferred tools (D47): the conversation declares only the tools it started with; the
// rest are found with find_tools. With codemode declared, they are called from a script;
// otherwise the tools found are declared from the next request on (one cache miss).
import { bm25 } from './search.js'

/** @typedef {import('./loop.js').Tool} Tool */

/** A tool name a script can write as `tools.<name>`: `notion-search` would read as a subtraction (D106). @param {string} name */
export const identifier = (name) => name.replace(/\W/g, '_').replace(/^\d/, '_$&')

/** One line a brain can call from:`name({ file: string, pages?: string }): what it does`. @param {Tool} tool */
export function signature({ spec }) {
  const { properties = {}, required = [] } = /** @type {any} */ (spec.parameters)
  const args = Object.entries(properties).map(([name, schema]) => `${name}${required.includes(name) ? '' : '?'}: ${/** @type {any} */ (schema).type ?? 'any'}`)
  return `${spec.name}({ ${args.join(', ')} }): ${spec.description}`
}

/**
 * Tools the brain can't call directly yet, reached by a shared step: `reach` declares them
 * when there is no `run` to call them from, and says how to call them either way.
 * @param {string[]} names @param {import('./loop.js').ToolContext} ctx
 */
export function reach(names, ctx) {
  const script = ['javascript', 'run'].find((name) => ctx.declared.includes(name))
  if (script) return `Call them inside ${script}, e.g. \`await tools.name({ … })\`.`
  ctx.declare(names)
  return 'You can call them directly from your next step.'
}

/** @param {{ tools: () => Tool[], none?: string }} options none: what it says when there are no others @returns {Tool} */
export function findTools({ tools, none = 'There are no other tools.' }) {
  return {
    spec: {
      name: 'find_tools',
      description: 'Find tools that are not listed yet, by what they do, and learn how to call them.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'What the tool should do, in English' } }, required: ['query'] },
    },
    kind: 'search',
    title: (args) => `Find tools: ${args?.query ?? ''}`,
    run: async (args, ctx) => {
      const deferred = tools().filter((tool) => !tool.hidden && !tool.off && (tool.for?.(ctx.brain) ?? true) && !ctx.declared.includes(tool.spec.name))
      if (!deferred.length) return none
      const hits = bm25(deferred.map((tool) => `${tool.spec.name.replace(/_/g, ' ')} ${tool.spec.description}`), String(args?.query ?? ''))
      const found = (hits.length ? hits.map((hit) => deferred[hit.index]) : deferred).slice(0, 5)
      return `${found.map(signature).join('\n')}\n\n${reach(found.map((tool) => tool.spec.name), ctx)}`
    },
  }
}
