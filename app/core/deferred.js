// SPDX-License-Identifier: MIT
// Deferred tools (D47): the conversation declares only the tools it started with; the
// rest are found with find_tools. With codemode declared, they are called from a script;
// otherwise the tools found are declared from the next request on (one cache miss).
import { bm25, words } from './search.js'

/** @typedef {import('./loop.js').Tool} Tool */

/** A tool name a script can write as `tools.<name>`: `notion-search` would read as a subtraction (D106). @param {string} name */
export const identifier = (name) => name.replace(/\W/g, '_').replace(/^\d/, '_$&')

/** The words of a tool's name, which the search's own words keep as one: `query_data_sources`. @param {string} text */
const spaced = (text) => text.replace(/_/g, ' ')

/** `name: type, other?: type` of an object's properties. @param {any} schema @param {(property: any) => string} each */
const fields = ({ properties = {}, required = [] }, each) => Object.entries(properties).map(([name, property]) => `${name}${required.includes(name) ? '' : '?'}: ${each(property)}`).join(', ')

/**
 * A schema as a brain reads it, `{ mode: "rows", url: string } | string[]`, saying `object` past its depth.
 * @param {any} schema @param {any} root what a `$ref` points into @param {number} depth @returns {string}
 */
function shape(schema, root, depth) {
  const { $ref, anyOf, oneOf, enum: values, type, items, properties } = schema ?? {}
  const either = (/** @type {string[]} */ list) => [...new Set(list)].join(' | ')
  if ($ref) return depth ? shape((root.$defs ?? root.definitions)?.[$ref.split('/').pop()], root, depth - 1) : 'object'
  if (schema?.const !== undefined || values) return either((values ?? [schema.const]).map((/** @type {unknown} */ value) => JSON.stringify(value)))
  if (anyOf ?? oneOf) return either((anyOf ?? oneOf).map((/** @type {unknown} */ one) => shape(one, root, depth)))
  if (Array.isArray(type)) return either(type.map((one) => shape({ ...schema, type: one }, root, depth)))
  if (type === 'array' && items && depth) return shape(items, root, depth - 1).replace(/^.* \| .*$/, '($&)') + '[]'
  if (properties && depth) return `{ ${fields(schema, (property) => shape(property, root, depth - 1))} }`
  return type ?? (properties ? 'object' : 'any')
}

/** What a tool takes, `{ file: string, pages?: string }`: each argument in full, or less when that would be long. @param {Tool['spec']} spec */
export const takes = ({ parameters }) => `{ ${fields(parameters, (schema) => [3, 2, 1, 0].map((depth) => shape(schema, parameters, depth)).find((text) => text.length <= 800) ?? schema.type ?? 'any')} }`

/** One line a brain can call from:`name({ file: string, pages?: string }): what it does`. @param {Tool} tool */
export const signature = ({ spec }) => `${spec.name}(${takes(spec)}): ${spec.description}`

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
    spec: { name: 'find_tools', description: 'Find tools that are not listed yet, by what they do, and learn how to call them.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'What the tool should do, in English' } }, required: ['query'] } },
    kind: 'search',
    title: (args) => `Find tools: ${args?.query ?? ''}`,
    run: async (args, ctx) => {
      const deferred = tools().filter((tool) => !tool.hidden && !tool.off && (tool.for?.(ctx.brain) ?? true) && !ctx.declared.includes(tool.spec.name))
      if (!deferred.length) return none
      const query = spaced(String(args?.query ?? ''))
      // A tool asked for by name comes before those that mention it, the name that says least first.
      const named = deferred.filter((tool) => words(query).length && words(query).every((word) => words(spaced(tool.spec.name)).includes(word))).sort((a, b) => a.spec.name.length - b.spec.name.length)
      const hits = bm25(deferred.map((tool) => `${spaced(tool.spec.name)} ${tool.spec.description}`), query).map((hit) => deferred[hit.index])
      // Nothing that does it is said so, with what can be asked for by name, and nothing is declared.
      const found = [...new Set([...named, ...hits])].slice(0, 5)
      return found.length ? `${found.map(signature).join('\n')}\n\n${reach(found.map((tool) => tool.spec.name), ctx)}` : `No tool does that. Those that can be found: ${deferred.map((tool) => tool.spec.name).join(', ')}.`
    },
  }
}
