// Jean's Helm chart (deploy/helm/jean/, D232 · D702), read as text, since no helm runs here: CI lints and installs it.
// Its version is Jean's, every pod takes the one security helper, and its values, schema and templates name the same things.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { LIMITS } from '../relay/relay.js'
import { STORE } from '../relay/store.js'
import { JOURNAL } from '../relay/journal.js'

const CHART = new URL('../deploy/helm/jean/', import.meta.url)
const read = (/** @type {string} */ path) => readFile(new URL(path, CHART), 'utf8')
const schema = JSON.parse(await read('values.schema.json'))
const templates = Object.fromEntries(await Promise.all((await readdir(new URL('templates/', CHART))).map(async (name) => [name, await read(`templates/${name}`)])))

/** The keys of a YAML file of maps, as paths, to the depth asked: "jean.image". @param {string} text @param {number} depth */
const keysOf = (text, depth) => {
  /** @type {string[]} */
  const path = []
  return text.split('\n').flatMap((line) => {
    const match = /^( *)([\w./-]+):(?:\s|$)/.exec(line)
    if (!match || line.trimStart().startsWith('#')) return []
    const level = match[1].length / 2
    path.length = level
    path[level] = match[2]
    return level < depth ? [path.join('.')] : []
  })
}

/** The schema at a path of values, or null when it names nothing there; a part the schema leaves open takes anything. @param {string[]} path */
const at = (path) => {
  let node = schema
  for (const key of path) {
    if (!node.properties) return node
    node = node.properties[key]
    if (!node) return null
    if (node.$ref) node = schema.definitions[node.$ref.split('/').at(-1)]
  }
  return node
}

test("the chart's version is the release's, which CI sets, git holding none (D735)", async () => {
  assert.match(await read('Chart.yaml'), /^version: 0\.0\.0$/m)
  assert.match(await read('Chart.yaml'), /^appVersion: edge$/m, 'CI sets the tag it publishes')
  assert.match(await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'), /helm package deploy\/helm\/jean --version "\$RELEASE" --app-version "\$RELEASE"/)
})

test('every pod takes the shared pod and container security, probes and stop', () => {
  const pods = Object.entries(templates).filter(([, text]) => /^kind: Deployment$/m.test(text))
  assert.deepEqual(pods.map(([name]) => name).sort(), ['gateway.yaml', 'jean.yaml', 'relay.yaml'])
  for (const [name, text] of pods) {
    const containers = text.match(/^\s+containers:$/gm)?.length ?? 0
    assert.equal(text.match(/include "jean\.podSecurity"/g)?.length, containers, `${name}: a pod without jean.podSecurity`)
    assert.equal(text.match(/include "jean\.containerSecurity"/g)?.length, containers, `${name}: a container without jean.containerSecurity`)
    assert.equal(text.match(/include "jean\.lifecycle"/g)?.length, containers, `${name}: a container without probes and preStop`)
    assert.doesNotMatch(text, /securityContext:|runAsUser|automountServiceAccountToken/, `${name}: security belongs in _helpers.tpl alone`)
  }
  const helpers = templates['_helpers.tpl']
  for (const line of ['automountServiceAccountToken: false', 'enableServiceLinks: false', 'runAsNonRoot: true', 'type: RuntimeDefault', 'allowPrivilegeEscalation: false', 'readOnlyRootFilesystem: true', '- ALL', 'command: {{ toJson . }}']) {
    assert.ok(helpers.includes(line), line)
  }
  assert.match(helpers, /\.Capabilities\.APIVersions\.Has "security\.openshift\.io\/v1"/)
  // Five seconds before it stops, waited by what each image holds: nginx's has sleep, the gateway's and the relay's only Node.
  assert.match(templates['jean.yaml'], /include "jean\.lifecycle" \(list "sleep" "5"\)/)
  for (const name of ['gateway.yaml', 'relay.yaml']) assert.match(templates[name], /include "jean\.lifecycle" \(list "node" "-e" "setTimeout\(Boolean, 5000\)"\)/, name)
})

test('the relay is one pod, replaced rather than rolled, and has no replicaCount', () => {
  assert.match(templates['relay.yaml'], /replicas: 1\n/)
  assert.match(templates['relay.yaml'], /strategy:\n\s+type: Recreate/)
  assert.equal(schema.properties.relay.properties.replicaCount, undefined)
})

test('values.schema.json parses and refuses a name it doesn\'t know at each level', () => {
  /** @type {string[]} */
  const open = []
  /** @param {any} node @param {string} where */
  const walk = (node, where) => {
    if (node.properties && node.additionalProperties !== false && where !== 'global') open.push(where)
    for (const [key, inner] of Object.entries(node.properties ?? {})) walk(inner, where ? `${where}.${key}` : key)
    if (node.items) walk(node.items, `${where}[]`)
  }
  walk(schema, '')
  for (const [name, node] of Object.entries(schema.definitions)) walk(node, `#${name}`)
  assert.deepEqual(open, [])
})

test('values.yaml and ci-values.yaml name only what the schema knows, and values.yaml all of it', async () => {
  const values = keysOf(await read('values.yaml'), 3)
  const ci = keysOf(await readFile(new URL('../ci-values.yaml', CHART), 'utf8'), 3)
  for (const key of [...values, ...ci]) assert.ok(at(key.split('.')), `${key} isn't in values.schema.json`)
  for (const [component, node] of Object.entries(schema.properties)) {
    for (const key of Object.keys(node.properties ?? {})) if (component !== 'global') assert.ok(values.includes(`${component}.${key}`), `${component}.${key} has no default in values.yaml`)
  }
})

test('every .Values the templates read is in the schema', () => {
  for (const [name, text] of Object.entries(templates)) {
    for (const [, path] of text.matchAll(/\.Values((?:\.\w+)+)/g)) assert.ok(at(path.slice(1).split('.')), `${name} reads .Values${path}`)
  }
})

test("the gateway's and the relay's configs take what their servers read", async () => {
  const gateway = JSON.parse(await readFile(new URL('../app/schemas/gateway.schema.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(schema.properties.gateway.properties.config.properties), Object.keys(gateway.properties).filter((key) => key !== '$schema'))
  assert.deepEqual(Object.keys(schema.properties.relay.properties.config.properties.limits.properties), Object.keys(LIMITS))
  assert.deepEqual(Object.keys(schema.properties.relay.properties.config.properties.stores.properties), Object.keys(STORE))
  assert.deepEqual(Object.keys(schema.properties.relay.properties.config.properties.journals.properties), Object.keys(JOURNAL))
  assert.deepEqual(Object.keys(schema.properties.relay.properties.config.properties.issuers.items.properties), ['issuer', 'audience', 'jwks', 'groups', 'guest'])
})

test('the NetworkPolicy keeps the gateway from private and link-local addresses, the relay too, over HTTPS alone, where it lists the organisation’s people, and the others from everything', () => {
  const policy = templates['networkpolicy.yaml']
  for (const range of ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '169.254.0.0/16', 'fc00::/7', 'fe80::/10']) assert.ok(policy.includes(`- ${range}`), range)
  assert.match(policy, /\$lists := and \(eq \$component "relay"\) \$values\.config\.issuers/)
  assert.match(policy, /if or \(eq \$component "gateway"\) \$lists/)
  assert.match(policy, /if eq \$component "gateway" }}\n\s+- port: 80/, 'HTTP for the gateway alone')
  assert.match(policy, /egress: \[\]/)
  assert.match(policy, /policy-group\.network\.openshift\.io\/ingress/)
})
