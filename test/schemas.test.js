// The JSON Schemas each copy of Jean serves at /schemas/ (D415): policy.json's, made from what policy.html
// checks, and GATEWAY_CONFIG's, written by hand beside the gateway.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { checkPolicy } from '../app/caps/policy/checks.js'
import { POLICY, policySchema } from '../scripts/schemas.js'

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false })
/** @param {string} path */
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const policy = ajv.compile(read('../app/schemas/policy.schema.json'))
const gatewaySchema = read('../app/schemas/gateway.schema.json')
const gateway = ajv.compile(gatewaySchema)

test('policy.json’s schema is the one checks.js makes: npm run schemas writes it again', () => {
  assert.deepEqual(JSON.parse(readFileSync(POLICY, 'utf8')), policySchema(), 'app/schemas/policy.schema.json is stale: run npm run schemas')
})

test('a policy the schema takes is one policy.html finds nothing in, and the other way round', () => {
  const example = read('../examples/enterprise/policy.json')
  assert.deepEqual(checkPolicy(example).problems, [], 'examples/enterprise/policy.json')
  const policies = [
    example,
    { $schema: 'https://jean.is/schemas/policy.schema.json', locale: 'fr', urls: { privacy: '', terms: 'terms', gateway: 'https://gateway.corp.example/' } },
    // A group's section takes a part away with null (D429).
    { groups: [{ id: 'legal', name: 'Legal', policy: { rules: { share: null }, brains: null, connections: [{ id: 'crm', name: 'CRM', url: 'https://crm.corp.example/mcp', auth: null }] } }] },
    { connections: [{ id: 'crm', name: 'CRM', url: 'https://crm.corp.example/mcp', auth: 'jwt' }] },
    { signIn: { issuer: 'http://login.corp.example/', clientId: 'jean' } },
    { signIn: { issuer: 'http://localhost:5556/dex' } },
    { look: { name: 'Acme', accent: 'red' } },
    { brain: [], capabilities: { deny: 'computer' } },
    { groups: [{ id: 'legal', policy: null }] },
    { groups: [{ id: 'legal', policy: { signIn: { issuer: 'https://login.corp.example', clientId: 'jean' } } }] },
  ]
  for (const each of policies) {
    const problems = checkPolicy(each).problems
    assert.equal(policy(each), !problems.length, `${JSON.stringify(each)}: ${JSON.stringify(problems)} / ${ajv.errorsText(policy.errors)}`)
  }
})

test('GATEWAY_CONFIG’s schema names what the gateway reads, and takes the configurations the docs give', () => {
  const source = readFileSync(new URL('../gateway/gateway.js', import.meta.url), 'utf8')
  const names = /** @param {string} list */ (list) => [...list.matchAll(/(\w+)\??\s*[:=]/g)].map(([, name]) => name).sort()
  assert.deepEqual(names(/export function gateway\(\{([^}]*)\}\)/.exec(source)?.[1] ?? ''), Object.keys(gatewaySchema.properties).filter((name) => name !== '$schema').sort())
  assert.deepEqual(names(/@typedef \{\{ (.*?) \}\} Client/.exec(source)?.[1] ?? ''), Object.keys(gatewaySchema.$defs.client.properties).sort())
  const client = { issuer: 'https://accounts.google.com', tokenEndpoint: 'https://oauth2.googleapis.com/token', clientId: 'jean', clientSecret: 'secret' }
  for (const each of [{}, { origins: ['https://jean.corp.example'] }, { origins: ['http://127.0.0.1:4180'], hosts: ['127.0.0.1', 'googleapis.com', 'http://ocsp.corp.example'], clients: [{ ...client, auth: 'basic' }],
    timestamps: ['https://tsa.corp.example/'], logs: ['https://rekor.sigstore.dev'], $schema: 'https://jean.is/schemas/gateway.schema.json' }]) assert.ok(gateway(each), ajv.errorsText(gateway.errors))
  for (const each of [{ origin: ['https://jean.corp.example'] }, { origins: ['https://jean.corp.example/'] }, { clients: [{ ...client, clientSecret: undefined }] }, { clients: [{ ...client, auth: 'jwt' }] }]) {
    assert.ok(!gateway(JSON.parse(JSON.stringify(each))), JSON.stringify(each))
  }
})
