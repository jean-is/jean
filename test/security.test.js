// SPDX-License-Identifier: MIT
// The security rules AGENTS.md writes down (scripts/security.js): held in the code's own syntax, in every module, on every push.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audit, codeOf, noticed, scan, unpinned, unpinnedImages, withNotice, writesCookie } from '../scripts/security.js'

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

test('nothing writes, reads, passes on or sends a cookie, for tracking or anything else (D725)', () => {
  for (const [text, path] of [['document.cookie = "id=1"', 'app/ui/x.js'], ['const all = document.cookie', 'app/caps/x/x.js'], ['await cookieStore.set("id", "1")', 'app/ui/x.js'],
    ['headers.set("Set-Cookie", "id=1")', 'host/host.js'], ["res.setHeader('set-cookie', id)", 'relay/serve.js'], ["new Response(body, { headers: { 'Set-Cookie': id } })", 'requests/requests.js'],
    ['for (const one of response.headers.getSetCookie()) out.append(one)', 'gateway/gateway.js'], ["const id = request.headers.get('cookie')", 'host/host.js'], ['const id = req.headers.cookie', 'relay/serve.js'],
    ["const id = req.headers['cookie']", 'requests/serve.js'], ["await fetch(url, { credentials: 'include' })", 'app/core/llm.js'], ['const a = `${document.cookie}`', 'deploy/bunny/pages.js']]) {
    assert.deepEqual(rules(text, path), ['cookie'], text)
  }
  for (const text of ["t('No cookies, ever')", '// document.cookie', "headers.delete('set-cookie')", "const rule = { rule: 'cookie', path }", 'const cookie = 1', "await fetch(url, { credentials: 'omit' })"]) {
    assert.deepEqual(rules(text, 'host/host.js'), [], text)
  }
  assert.deepEqual(writesCookie('app/vendor/x.js', 'a();document.cookie=n+"="+v;b()').map(({ rule, line }) => [rule, line]), [['cookie', 1]])
  assert.deepEqual(writesCookie('app/vendor/x.js', 'x\ncookieStore.set(n, v)').map(({ line }) => line), [2])
  assert.deepEqual(writesCookie('app/vendor/x.js', 'if (document.cookie == "") read(document.cookie)'), [])
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

test('only caps/devices/ reads every secret at once, the ones that cross to the person’s other devices', () => {
  const imports = ["import { crossing } from '../../ui/secrets.js'", "import { getSecret, crossing as all } from './secrets.js'", "import * as secrets from '../ui/secrets.js'",
    "const { crossing } = await import('../../ui/secrets.js')", "const keys = await (await import('../../ui/secrets.js')).crossing(fs, settings)", "const [{ crossing }] = await Promise.all([import('./secrets.js')])"]
  for (const text of imports) {
    assert.deepEqual(rules(text, 'app/caps/share/share.js'), ['secrets-crossing'], text)
    assert.deepEqual(rules(text, 'app/caps/devices/devices.js'), [], text)
  }
  for (const text of ["import { getSecret, setSecret } from '../../ui/secrets.js'", "const [{ listModels }, { getSecret }] = await Promise.all([import('../core/llm.js'), import('./secrets.js')])", '// import { crossing } from "./secrets.js"']) {
    assert.deepEqual(rules(text, 'app/ui/state.js'), [], text)
  }
})

test('only caps/devices/ reads the store’s keys, which open what the person’s devices keep in common', () => {
  for (const text of ["const held = await getSecret(app.fs, 'store')", 'await setSecrets(fs, { "store": null })', "await deleteSecret(fs, 'store')", "import { SECRET, STORE } from '../devices/flow.js'"]) {
    assert.deepEqual(rules(text, 'app/caps/backup/backup.js'), ['secrets-store'], text)
    assert.deepEqual(rules(text, 'app/caps/devices/store.js'), [], text)
  }
  for (const text of ["await getSecret(app.fs, 'share:01J')", "const STORE = 'app-store'", "import { recordsOf } from '../devices/flow.js'"]) assert.deepEqual(rules(text, 'app/ui/state.js'), [], text)
})

test('each file of code opens with its licence, Elastic-2.0 and its copyright in ee/, MIT everywhere else', () => {
  const ee = '// SPDX-FileCopyrightText: 2026 Warehouse SAS\n// SPDX-License-Identifier: Elastic-2.0\n'
  for (const [path, text, want] of [['app/ui/a.js', 'export {}\n', '// SPDX-License-Identifier: MIT\nexport {}\n'], ['app/ee/a.js', 'export {}\n', `${ee}export {}\n`],
    ['cli/main.js', '#!/usr/bin/env node\nrun()\n', '#!/usr/bin/env node\n// SPDX-License-Identifier: MIT\nrun()\n'], ['deploy/a.sh', '#!/bin/sh\nrun\n', '#!/bin/sh\n# SPDX-License-Identifier: MIT\nrun\n'],
    ['app/index.html', '<!doctype html>\n<html>', '<!doctype html>\n<!-- SPDX-License-Identifier: MIT -->\n<html>'], ['app/ui/a.css', 'a {}\n', '/* SPDX-License-Identifier: MIT */\na {}\n']]) {
    assert.ok(!noticed(path, text), path)
    assert.equal(withNotice(path, text), want)
    assert.ok(noticed(path, want), path)
    assert.equal(withNotice(path, want), want, path)
  }
  assert.ok(!noticed('app/ui/a.js', `${ee}export {}\n`), 'code taken out of ee/ is seen')
  assert.equal(withNotice('app/ui/a.js', `${ee}export {}\n`), `${ee}export {}\n`, 'and left for a person, never relicensed')
  assert.ok(!noticed('app/ee/a.js', '// SPDX-License-Identifier: MIT\nexport {}\n'))
})

test('every module of Jean’s keeps the rules, and nothing tracked looks like a secret', () => {
  const { findings, stale } = audit()
  assert.deepEqual(findings, [])
  assert.deepEqual(stale, [])
})
