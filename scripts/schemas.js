// Writes app/schemas/policy.schema.json: the JSON Schema of policy.json, made from what policy.html checks
// (SCHEMA in app/caps/policy/checks.js), so that an editor's check and Jean's never disagree. Each copy of Jean
// serves it at /schemas/, jean.is's at https://jean.is/schemas/, beside the gateway's (gateway.schema.json,
// written by hand). test/schemas.test.js fails while it is stale (D415).
// Usage: npm run schemas
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { SCHEMA } from '../app/caps/policy/checks.js'
import { LOCALES } from '../app/core/i18n.js'

export const POLICY = new URL('../app/schemas/policy.schema.json', import.meta.url)

/** HTTPS or WSS anywhere, HTTP or WS on this computer only, as checkPolicy() has them. */
const ADDRESS = '^(https|wss)://|^(http|ws)://(localhost|127\\.0\\.0\\.1|\\[::1\\])(:\\d+)?([/?#]|$)'
/** The kinds of value checks.js knows that say more than their type, each written once. */
const DEFS = {
  address: { type: 'string', pattern: ADDRESS, description: 'An address: HTTPS, or HTTP on this computer' },
  link: { type: 'string', pattern: `^$|^(?![A-Za-z][A-Za-z\\d+.-]*:)|${ADDRESS}`, description: 'An address, a path beside index.html, or "" for none' },
  capability: { type: 'string', description: 'A capability, as capabilities.json beside index.html lists them' },
  locale: { enum: LOCALES },
  colour: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
}
/** The others, by their type alone. */
const KINDS = { text: 'string', flag: 'boolean', number: 'number' }
/** A group's section, whose parts null takes away (D429). */
const [GROUP] = /** @type {Record<string, any>[]} */ (SCHEMA.groups)

/**
 * A part of SCHEMA as JSON Schema 2020-12, null allowed too where it takes the part away.
 * @param {import('../app/caps/policy/checks.js').Shape} shape @param {boolean} [nullable] @returns {Record<string, any>}
 */
function convert(shape, nullable = false) {
  if (shape === 'any') return {}
  if (typeof shape === 'string' && shape in DEFS) return nullable ? { anyOf: [{ $ref: `#/$defs/${shape}` }, { type: 'null' }] } : { $ref: `#/$defs/${shape}` }
  const schema = shape instanceof Set ? { enum: [...shape] } : Array.isArray(shape) ? { type: 'array', items: convert(shape[0], nullable) }
    : typeof shape === 'object' ? object(shape, nullable) : { type: KINDS[/** @type {keyof typeof KINDS} */ (shape)] }
  if (nullable) schema.enum ? schema.enum.push(null) : (schema.type = [schema.type, 'null'])
  return schema
}

/** @param {Record<string, any>} shape @param {boolean} nullable its parts' */
function object(shape, nullable) {
  const names = Object.keys(shape).filter((name) => name !== '*')
  const required = names.filter((name) => name.endsWith('!')).map((name) => name.slice(0, -1))
  return {
    type: 'object',
    properties: Object.fromEntries(names.map((name) => [name.replace(/!$/, ''), shape === GROUP && name === 'policy!' ? object(shape[name], true) : convert(shape[name], nullable)])),
    ...(required.length && { required }),
    additionalProperties: '*' in shape ? convert(shape['*'], nullable) : false,
  }
}

/** The whole schema. */
export const policySchema = () => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://jean.is/schemas/policy.schema.json',
  title: 'policy.json',
  description: "What an organisation's policy.json beside Jean's index.html holds, as this version of Jean reads it and policy.html checks it (docs/enterprise.md).",
  ...object(SCHEMA, false),
  $defs: DEFS,
})

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile(POLICY, `${JSON.stringify(policySchema(), null, 2)}\n`)
  console.log(`Wrote ${POLICY.pathname}`)
}
