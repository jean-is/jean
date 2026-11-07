// The security rules AGENTS.md writes down (scripts/security.js): held in the code's own syntax, in every module, on every push.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audit, codeOf, scan, unpinned, unpinnedImages } from '../scripts/security.js'

const rules = (/** @type {string} */ text, path = 'app/ui/x.js') => scan(path, text).map(({ rule }) => rule)

test('what is code is told from what is said about it', () => {
  assert.deepEqual(codeOf('const a = 1 // eval(x)\n/* new Function */ b').split('\n').map((line) => line.trim()), ['const a = 1', 'b'])
  assert.ok(!codeOf("say('eval(x)', `new Function ${y} innerHTML =`)").includes('eval'))
  assert.ok(codeOf('`${eval(x)}`').includes('eval(x)'))
  assert.ok(!codeOf('const re = /eval\\(/; f()').includes('eval'))
  assert.ok(codeOf("const a = b / eval(c) / d").includes('eval('))
  assert.ok(codeOf('const test = (a) => /x/.test(a); eval(y)').includes('eval('), 'a regular expression after an arrow')
  assert.equal(codeOf("a\n'b\nc'\nd", true).split('\n').length, 4)
})

test('each rule finds what it says', () => {
  for (const [text, rule] of /** @type {[string, string][]} */ ([
    ['eval(code)', 'eval'], ['new Function("return 1")', 'eval'], ['Function("return 1")()', 'eval'], ['globalThis.Function("return 1")()', 'eval'], ['window.eval(code)', 'eval'], ['(0, eval)(code)', 'eval'], ['setTimeout("alert(1)", 1)', 'eval'],
    ['node["innerHTML"] = text', 'html-sink'], ['frame.setAttribute("srcdoc", text)', 'html-sink'], ['const a = html`<iframe srcdoc=${page}>`', 'html-sink'], ['unsafeHTML(text)', 'html-sink'], ['node.setHTMLUnsafe(text)', 'html-sink'],
    ['onmessage = run', 'message-unchecked'], ['window.onmessage = run', 'message-unchecked'], ['self.onmessage = run', 'message-unchecked'],
    ['node.innerHTML = text', 'html-sink'], ['node.outerHTML += text', 'html-sink'], ['frame.srcdoc = text', 'html-sink'], ['node.insertAdjacentHTML("beforeend", text)', 'html-sink'], ['document.write(text)', 'html-sink'],
    ['await navigator.storage.getDirectory()', 'storage'], ['trustedTypes.createPolicy("mine", {})', 'trusted-types'],
    ['opener.postMessage(data, "*")', 'post-to-any'], ['await fetch("https://example.com/x")', 'fixed-address'],
    ['addEventListener("message", ({ data }) => run(data))', 'message-unchecked'],
    ['const a = `<iframe sandbox="allow-scripts allow-same-origin">`', 'sandbox'], ['const a = `<iframe sandbox="allow-same-origin allow-scripts">`', 'sandbox'],
    ['const a = `<a href="x" target="_blank">`', 'blank-target'], ['request({ rejectUnauthorized: false })', 'tls-off'], ['process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"', 'tls-off'],
  ])) assert.deepEqual(rules(text), [rule], text)
  assert.deepEqual(rules('Math.random()', 'app/ee/x.js'), ['weak-random'])
  assert.deepEqual(rules('Math.random()', 'host/host.js'), ['weak-random'])
  assert.deepEqual(rules('Math.random()', 'relay/relay.js'), ['weak-random'])
})

test('it leaves alone what looks like it and isn’t', () => {
  for (const text of ['// eval(x)', "t('eval(x)')", 'a.innerHTML === b', 'read(node.innerHTML)', 'frame.postMessage(data, "*")', 'parent.postMessage(data, "*")', 'await fetch("http://127.0.0.1:1/")', 'await fetch(url)',
    'addEventListener("message", ({ source, data }) => { if (source === parent) run(data) })', 'frame.setAttribute("sandbox", "allow-scripts")', 'const a = `<a href="x" target="_blank" rel="noopener">`', 'setTimeout(run, 1)', 'Math.random()']) {
    assert.deepEqual(rules(text), [], text)
  }
})

test('a workflow’s action is named by its commit, never by a tag that can move', () => {
  assert.equal(unpinned('ci.yml', '      - uses: actions/checkout@v5').length, 1)
  assert.equal(unpinned('ci.yml', '      - uses: actions/checkout@main').length, 1)
  assert.equal(unpinned('ci.yml', `      - uses: actions/checkout@${'a'.repeat(40)} # v5`).length, 0)
  assert.equal(unpinned('ci.yml', '      - uses: ./local-action').length, 0)
})

test('a container image is named by its digest, never by a tag alone, but a stage or an image built here', () => {
  const digest = `sha256:${'a'.repeat(64)}`
  const rules = (/** @type {string} */ text) => unpinnedImages('Dockerfile', text).map(({ line }) => line)
  assert.deepEqual(rules('FROM node:26-alpine AS build\nRUN npm ci\nFROM --platform=$BUILDPLATFORM nginx:stable\n'), [1, 3])
  assert.deepEqual(rules(`FROM node:26-alpine@${digest} AS build\nFROM build AS gateway\nFROM scratch AS runtime\nFROM runtime\n`), [])
  const compose = (/** @type {string} */ text) => unpinnedImages('compose.yaml', text).map(({ line }) => line)
  assert.deepEqual(compose('x-node: &node\n  image: node:26-alpine\nservices:\n  caddy:\n    image: caddy:2\n  jean:\n    image: jean\n    build:\n      context: .\n'), [2, 5])
  assert.deepEqual(compose(`services:\n  caddy:\n    image: caddy:2@${digest}\n  relay:\n    build:\n      target: relay\n    image: jean-relay\n`), [])
})

test('every module of Jean’s keeps the rules, and nothing tracked looks like a secret', () => {
  const { findings, stale } = audit()
  assert.deepEqual(findings, [])
  assert.deepEqual(stale, [])
})
