// A task saved as a web page (D305): the conversation's own file inside, each line the same JSON,
// in a page that runs nothing but its own drawing and reaches nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageOf } from '../app/ui/export.js'

const lines = [
  { format: 1, kind: 'conversation', id: '01K7E0000000000000000000AA', createdAt: '2026-10-13T08:00:00.000Z', by: 'device' },
  { at: '2026-10-13T08:00:01.000Z', by: 'device', meta: { title: 'Plan the week' } },
  { at: '2026-10-13T08:00:02.000Z', by: 'device', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Close it: </script><script>alert(1)</script> <!-- <script>' } } },
  { at: '2026-10-13T08:00:03.000Z', by: 'jean', step: 0, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done </SCRIPT >' } } },
]
const file = lines.map((line) => JSON.stringify(line) + '\n').join('')
const hash = async (/** @type {string} */ text) => `'sha256-${Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('base64')}'`

test('the page holds the conversation’s file, each line the same JSON, and nothing in it can end its block', async () => {
  const page = await pageOf(file, 'Plan the week', 'fr')
  const blocks = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script/gi)].map((match) => match[1])
  assert.equal(blocks.length, 2)
  assert.doesNotMatch(blocks[0], /</)
  assert.deepEqual(blocks[0].split('\n').filter(Boolean).map((line) => JSON.parse(line)), lines)
})

test('its name is text, in the language Jean speaks, right to left where it is read so', async () => {
  const page = await pageOf(file, 'Plan <b>the</b> week & "more"', 'ar')
  assert.match(page, /^<!doctype html>\n<html lang="ar" dir="rtl">\n<meta charset="utf-8">/)
  assert.match(page, /<title>Plan &lt;b&gt;the&lt;\/b&gt; week &amp; &quot;more&quot;<\/title>/)
  assert.match(page, /<h1 dir="auto">Plan &lt;b&gt;the&lt;\/b&gt; week &amp; &quot;more&quot;<\/h1>/)
  assert.match(await pageOf(file, 'x', 'ja'), /<html lang="ja" dir="ltr">/)
})

test('its policy lets only its own style and drawing in, by their hashes, and its pictures, and nothing reached', async () => {
  const page = await pageOf(file, 'Plan the week', 'en')
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(page)?.[1]
  const style = /<style>([\s\S]*?)<\/style>/.exec(page)?.[1] ?? ''
  const drawing = /<script>([\s\S]*?)<\/script>/.exec(page)?.[1] ?? ''
  assert.equal(policy, `default-src 'none'; img-src data:; style-src ${await hash(style)}; script-src ${await hash(drawing)}`)
  assert.ok(page.indexOf('Content-Security-Policy') < page.indexOf('<style>'))
})

test('with the render package, it loads Jean’s modules from there, each by its hash, and reaches nothing else but the map service and a score’s instruments', async () => {
  const base = 'https://cdn.example/npm/@jean-is/render@0.8.0-r0123456789ab/'
  const entry = `${base}ui/reader.js`
  const reader = {
    base, entry, imports: { 'lit-html': `${base}vendor/lit-html/lit-html.js`, [`${base}ui/state.js`]: `${base}ui/reader-state.js` },
    integrity: { [entry]: 'sha256-AAAA', [`${base}ui/reader-state.js`]: 'sha256-BBBB' },
    settings: { look: 'mail', kinds: ['echarts'], pages: { scripts: true, maps: true }, mapStyles: { light: 'https://maps.example/</script>' }, urls: { sounds: 'https://cdn.example/npm/@jean-is/sounds@1.0.0/' } },
    sites: ['https://maps.example', 'https://cdn.example/npm/@jean-is/sounds@1.0.0/'],
  }
  const page = await pageOf(file, 'Plan the week', 'en', { reader })
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(page)?.[1] ?? ''
  assert.match(policy, new RegExp(`script-src 'unsafe-inline' 'wasm-unsafe-eval' data: blob: ${base}; `), 'WebAssembly for a score\'s instruments (D338)')
  assert.match(policy, new RegExp(`connect-src ${base} https://maps.example https://cdn.example/npm/@jean-is/sounds@1.0.0/; `))
  assert.match(policy, /^default-src 'none'; .*form-action 'none'$/)
  const blocks = [...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script/gi)].map(([, attributes, text]) => ({ attributes, text }))
  assert.deepEqual(blocks.map((one) => one.attributes.trim()), ['type="application/jsonl"', '', 'type="application/json" id="settings"', 'type="importmap"',
    `type="module" src="${entry}" integrity="sha256-AAAA" crossorigin="anonymous"`])
  assert.deepEqual(JSON.parse(blocks[2].text), reader.settings)
  assert.deepEqual(JSON.parse(blocks[3].text), { imports: reader.imports, integrity: reader.integrity })
  for (const { text } of blocks.slice(2)) assert.doesNotMatch(text, /</)
})

test('the pictures the task made are in it, by their addresses, before the lines that show them', async () => {
  const pictures = { 'files/sha256-ab.png': 'data:image/png;base64,iVBORw0KGgo=' }
  const page = await pageOf(file, 'Plan the week', 'en', { pictures })
  const blocks = [...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script/gi)].map(([, attributes, text]) => ({ attributes: attributes.trim(), text }))
  assert.deepEqual(blocks.map((one) => one.attributes), ['type="application/jsonl"', 'type="application/json" id="pictures"', ''])
  assert.deepEqual(JSON.parse(blocks[1].text), pictures)
  assert.doesNotMatch(await pageOf(file, 'Plan the week', 'en'), /id="pictures"/)
})
